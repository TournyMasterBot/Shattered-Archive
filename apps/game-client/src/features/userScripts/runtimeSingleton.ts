// apps/game-client/src/features/userScripts/runtimeSingleton.ts

import { AccessibilitySettings, getAccessibilitySettings } from '../accessibility/accessibility-settings-store';
import { STORAGE_KEY_PREFIX_USERSCRIPTS, UserScriptRuntime } from './userScriptRuntime';
import { pluginHost } from '../plugins/pluginHost';
import { ListenDomEvent, ListenEvent, ListenRedispatchMap, DispatchEvent } from '../event-emitter/event-dispatcher';
import { dslToAnsi } from '../chat/dsl-to-ansi';
import { ShatteredArchiveChatLine } from '../../types/chat-types/chat-line';
import { appendChatLine, appendChatRaw } from '../chat/chat-store';
import { GameRemoteServerRaw } from '../../types/event-types/game-remote-server-raw';
import { GameRemoteServerGmcp } from '../../types/event-types/game-remote-server-gmcp';
import { GameRemoteServerError } from '../../types/event-types/game-remote-server-error';
import { GameRemoteServerClose } from '../../types/event-types/game-remote-server-close';
import { ShatteredArchiveRawData } from '../../types/event-types/shattered-archive-raw-data';
import { ShatteredArchiveGmcpData } from '../../types/event-types/shattered-archive-gmcp-data';
import { ShatteredArchiveServerError } from '../../types/event-types/shattered-archive-server-error';
import { ShatteredArchiveServerClosed } from '../../types/event-types/shattered-archive-server-closed';
import { getGlobalVarsSnapshot } from './globalScriptsStore';
import { getChatSettings } from '../chat/chat-settings-store';
import { classifyStrictChatSubtype } from '../chat/strict-chat-classifier';

declare global {
  interface Window {
    __SA_RUNTIME__?: {
      runtime: UserScriptRuntime;
      getScripts: () => any[];
      getTriggers: () => any[];
      getAliases: () => any[];
      getTimers: () => any[];
      reload: (connectionId?: string) => void;
      rebuildTriggers: () => void;
      dump: () => void;

      // ✅ named var helpers (debug / dev convenience)
      getNamedVars: () => Record<string, string>;
      setNamedVar: (name: string, value: string) => void;
      deleteNamedVar: (name: string) => void;
      clearNamedVars: () => void;
    };
  }
}

type NamedVarSetEvent = { name: string; value: string; connectionId?: string };
type NamedVarDeleteEvent = { name: string; connectionId?: string };
type NamedVarClearEvent = { connectionId?: string };

function safeConnId(v: unknown): string {
  const s = String(v ?? '').trim();
  return s.length > 0 ? s : 'default';
}

function normalizeVarName(name: unknown): string {
  return String(name ?? '')
    .trim()
    .toUpperCase();
}

export class RuntimeSingleton {
  private static _instance: RuntimeSingleton | null = null;
  private lastHydrateKey: string | null = null;
  private lastHydrateJson: string | null = null;

  public static get Instance(): RuntimeSingleton {
    if (!RuntimeSingleton._instance) RuntimeSingleton._instance = new RuntimeSingleton();
    return RuntimeSingleton._instance;
  }

  public static get Runtime(): UserScriptRuntime {
    return RuntimeSingleton.Instance.GetUserScriptRuntime;
  }

  private userScriptRuntime: UserScriptRuntime;
  private settings: AccessibilitySettings = getAccessibilitySettings();
  private disposers: Array<() => void> = [];

  // ✅ track current connection for the named var store
  private currentConnectionId: string = 'default';

  // ✅ per-connection named variable store
  private namedVarsByConn: Map<string, Map<string, string>> = new Map();

  private lastAfkState: boolean | null = null;

  private constructor() {
    this.userScriptRuntime = new UserScriptRuntime({
      aliasSplitChar: this.settings.commandSplitChar,

      // ✅ allow runtime to expand "{NAME}" live
      getNamedVar: (name: string) => this.getNamedVar(name),
      setNamedVar: (name: string, value: string) => this.setNamedVar(name, value),
      deleteNamedVar: (name: string) => this.deleteNamedVar(name),

      // give enabled plugins a chance to intercept unmatched commands
      aliasFallback: (input: string) => pluginHost.tryExecuteAlias(input),
    });

    this.hydrateRuntime('default');
    this.attachWindowEvents();
  }

  public get GetUserScriptRuntime(): UserScriptRuntime {
    return this.userScriptRuntime;
  }

  private getNamedVarMap(connectionId?: string): Map<string, string> {
    const id = safeConnId(connectionId ?? this.currentConnectionId);
    let m = this.namedVarsByConn.get(id);
    if (!m) {
      m = new Map<string, string>();
      this.namedVarsByConn.set(id, m);
    }
    return m;
  }

  private getNamedVar(name: string): string | undefined {
    const key = normalizeVarName(name);
    if (!key) return undefined;
    return this.getNamedVarMap().get(key);
  }

  private setNamedVar(name: string, value: string): void {
    const key = normalizeVarName(name);
    if (!key) return;
    this.getNamedVarMap().set(key, String(value ?? ''));
  }

  private deleteNamedVar(name: string): void {
    const key = normalizeVarName(name);
    if (!key) return;
    this.getNamedVarMap().delete(key);
  }

  private clearNamedVars(connectionId?: string): void {
    this.getNamedVarMap(connectionId).clear();
  }

  private hydrateRuntime(connectionId?: string | null) {
    const id = safeConnId(connectionId);
    this.userScriptRuntime.setActiveConnectionId(id);
    this.currentConnectionId = id;

    const key = this.userScriptRuntime.getStorageKey(id);
    const raw = window.localStorage.getItem(key) ?? '';

    if (this.lastHydrateKey === key && this.lastHydrateJson === raw) return;

    this.lastHydrateKey = key;
    this.lastHydrateJson = raw;

    getGlobalVarsSnapshot(id);

    const scripts = this.userScriptRuntime.loadScriptsFromStorage(id);
    this.userScriptRuntime.replaceAllScripts(scripts);

    this.userScriptRuntime.rebuildTriggerListeners();
    //this.userScriptRuntime.rebuildAliasIndex();
    this.userScriptRuntime.rebuildTimers();
  }

  private attachWindowEvents(): void {
    // Debug: console.log('Attaching runtime singleton window events');

    // RAW -> shatteredarchive:raw-data (mapped)
    this.disposers.push(
      ListenRedispatchMap<GameRemoteServerRaw, ShatteredArchiveRawData>(
        'game:remote-server:raw',
        'shatteredarchive:raw-data',
        (detail) => ({
          rawText: detail.payload,
          // TODO : Consider cleaning this text output -- but don't remove it
          // as would be a breaking change.
          text: detail.payload,
          fromUserScript: false,
        }),
        { key: 'runtimeSingleton::redispatch::raw' },
      ),
    );

    // GMCP -> shatteredarchive:gmcp-data (mapped)
    this.disposers.push(
      ListenRedispatchMap<GameRemoteServerGmcp, ShatteredArchiveGmcpData>(
        'game:remote-server:gmcp',
        'shatteredarchive:gmcp-data',
        (detail) => ({
          rawText: detail.payload,
          fromUserScript: false,
        }),
        { key: 'runtimeSingleton::redispatch::gmcp' },
      ),
    );

    // NOTE: do NOT also attach gmcpRouter here. The typed GMCP fan-out
    // (game:char-data / game:room-data / game:tick / game:affects-trueup /
    // game:affect-added / game:affect-removed) is produced by
    // UserScriptRuntime.processGmcpEvent(), which consumes the
    // `shatteredarchive:gmcp-data` redispatch above. Attaching the router as
    // well made every GMCP package dispatch its typed event TWICE (visible as
    // doubled output in echo-style consumers like the affect-echo plugin).

    // ERROR -> shatteredarchive:server-error
    this.disposers.push(
      ListenRedispatchMap<GameRemoteServerError, ShatteredArchiveServerError>(
        'game:remote-server:error',
        'shatteredarchive:server-error',
        (detail) => ({
          message: detail.payload?.message ?? 'Unknown server error',
        }),
        { key: 'runtimeSingleton::redispatch::error' },
      ),
    );

    // CLOSE -> shatteredarchive:server-closed
    this.disposers.push(
      ListenRedispatchMap<GameRemoteServerClose, ShatteredArchiveServerClosed>(
        'game:remote-server:close',
        'shatteredarchive:server-closed',
        (detail) => ({
          reason: detail.payload?.reason,
        }),
        { key: 'runtimeSingleton::redispatch::close' },
      ),
    );

    // Connection changed -> hydrate scripts (and switch named var scope)
    this.disposers.push(
      ListenEvent<{ connectionId?: string }>(
        'shatteredarchive:connection-changed',
        (payload) => {
          this.hydrateRuntime(safeConnId(payload?.connectionId));
        },
        { key: 'runtimeSingleton::window::connection-changed' },
      ),
    );

    // UserScripts updated -> hydrate scripts
    this.disposers.push(
      ListenEvent<{ connectionId?: string }>(
        'shatteredarchive:userScripts-updated',
        (payload) => {
          this.hydrateRuntime(safeConnId(payload?.connectionId));
        },
        { key: 'runtimeSingleton::window::userScripts-updated' },
      ),
    );

    this.disposers.push(
      ListenEvent<{ commandSplitChar?: string }>(
        'shatteredarchive:accessibility-updated',
        (payload) => {
          const nextSplit = payload?.commandSplitChar ?? this.settings.commandSplitChar;
          this.userScriptRuntime.setAliasSplitChar(nextSplit);
        },
        { key: 'runtimeSingleton::window::accessibility-updated' },
      ),
    );

    // AFK guard: disable timers while is_afk is true so the game can time the player out naturally
    this.disposers.push(
      ListenEvent<Record<string, unknown>>(
        'game:char-data',
        (payload) => {
          const isAfk = payload?.is_afk === true;
          if (isAfk === this.lastAfkState) return;

          this.lastAfkState = isAfk;
          this.userScriptRuntime.setAfkMode(isAfk);

          const msg = isAfk
            ? '{Y[Timers] AFK detected — timers suspended{x\n'
            : '{G[Timers] AFK cleared — timers resumed{x\n';

          try {
            DispatchEvent('shatteredarchive:write-terminal', {
              rawText: dslToAnsi(msg),
              fromUserScript: true,
            });
          } catch {
            // ignore
          }
        },
        { key: 'runtimeSingleton::afk::char-data' },
      ),
    );

    // Chat lines -> chat store (global, always-on)
    this.disposers.push(
      ListenEvent<ShatteredArchiveChatLine>(
        'shatteredarchive:chat-line',
        (payload) => {
          // DEBUG: console.log('Raw chat event', payload);
          const rawText = String(payload?.rawText ?? payload?.text ?? '');
          if (!rawText) return;

          const ts =
            typeof payload?.ts === 'number'
              ? payload.ts
              : payload?.receivedTimestamp
                ? Date.parse(payload.receivedTimestamp)
                : Date.now();

          const t = Number.isFinite(ts) ? ts : Date.now();

          const settings = getChatSettings();
          const subtype = settings.strictChatFormat ? classifyStrictChatSubtype(rawText) : undefined;

          // STRICT: only capture if it matched a strict rule
          if (settings.strictChatFormat && !subtype) {
            return;
          }

          appendChatLine(rawText, t, subtype);
        },
        { key: 'runtimeSingleton::chat::shatteredarchive:chat-line' },
      ),
    );

    // Storage updated -> hydrate scripts (cross-tab safe)
    this.disposers.push(
      ListenDomEvent<StorageEvent>(
        'storage',
        (e) => {
          if (!e.key) {
            return;
          }
          if (!e.key.startsWith(STORAGE_KEY_PREFIX_USERSCRIPTS)) {
            return;
          }

          const connectionId = e.key.slice(STORAGE_KEY_PREFIX_USERSCRIPTS.length) || 'default';
          this.hydrateRuntime(connectionId);
        },
        { key: 'runtimeSingleton::window::storage' },
      ),
    );

    // ✅ Live named-var updates (optional; useful if UI wants to push changes)
    this.disposers.push(
      ListenEvent<NamedVarSetEvent>(
        'shatteredarchive:named-var:set',
        (payload) => {
          const id = safeConnId(payload?.connectionId ?? this.currentConnectionId);
          const key = normalizeVarName(payload?.name);
          if (!key) return;

          const m = this.getNamedVarMap(id);
          m.set(key, String(payload?.value ?? ''));
        },
        { key: 'runtimeSingleton::named-vars::set' },
      ),
    );

    this.disposers.push(
      ListenEvent<NamedVarDeleteEvent>(
        'shatteredarchive:named-var:delete',
        (payload) => {
          const id = safeConnId(payload?.connectionId ?? this.currentConnectionId);
          const key = normalizeVarName(payload?.name);
          if (!key) return;

          const m = this.getNamedVarMap(id);
          m.delete(key);
        },
        { key: 'runtimeSingleton::named-vars::delete' },
      ),
    );

    this.disposers.push(
      ListenEvent<NamedVarClearEvent>(
        'shatteredarchive:named-var:clear',
        (payload) => {
          const id = safeConnId(payload?.connectionId ?? this.currentConnectionId);
          this.clearNamedVars(id);
        },
        { key: 'runtimeSingleton::named-vars::clear' },
      ),
    );

    // Timers should run even when the user script editor/modal isn't mounted.
    // Use a single global tick (HMR-safe) to drive UserScriptRuntime.tickTimers().
    const w = window as any;
    if (!w.__SA_USERSCRIPTS_TIMER_TICK__) {
      w.__SA_USERSCRIPTS_TIMER_TICK__ = window.setInterval(() => {
        try {
          this.userScriptRuntime.tickTimers();
        } catch (err) {
          console.error('[RuntimeSingleton] tickTimers failed', err);
        }
      }, 250);
    }

    window.__SA_RUNTIME__ = {
      runtime: this.userScriptRuntime,
      getScripts: () => this.userScriptRuntime.getAllScripts(),
      getTriggers: () => this.userScriptRuntime.getAllScripts().filter((s: any) => s.kind === 'trigger'),
      getAliases: () => this.userScriptRuntime.getAllScripts().filter((s: any) => s.kind === 'alias'),
      getTimers: () => this.userScriptRuntime.getAllScripts().filter((s: any) => s.kind === 'timer'),

      reload: (connectionId?: string) => {
        const id = connectionId ?? 'default';
        this.hydrateRuntime(id);
        console.log('[__SA_RUNTIME__] reloaded', { connectionId: id });
      },

      rebuildTriggers: () => {
        (this.userScriptRuntime as any).rebuildTriggerListeners?.();
        console.log('[__SA_RUNTIME__] rebuildTriggers called');
      },

      dump: () => {
        const all = this.userScriptRuntime.getAllScripts();
        const byKind = all.reduce((acc: any, s: any) => {
          acc[s.kind] = acc[s.kind] ?? [];
          acc[s.kind].push(s);
          return acc;
        }, {});

        console.group('[__SA_RUNTIME__] scripts');
        console.log('count:', all.length);
        console.log('byKind:', Object.fromEntries(Object.entries(byKind).map(([k, v]: any) => [k, v.length])));
        console.table(
          all.map((s: any) => ({
            id: s.id,
            name: s.name,
            kind: s.kind,
            enabled: s.enabled,
            eventName: s.kind === 'trigger' ? s.eventName : '',
            matchText: s.kind === 'trigger' ? s.matchText : '',
            omitFromOutput: s.kind === 'trigger' ? s.omitFromOutput : '',
          })),
        );
        console.groupEnd();
      },

      // ✅ named var debug helpers
      getNamedVars: () => Object.fromEntries(Array.from(this.getNamedVarMap().entries())),
      setNamedVar: (name: string, value: string) => this.setNamedVar(name, value),
      deleteNamedVar: (name: string) => this.deleteNamedVar(name),
      clearNamedVars: () => this.clearNamedVars(),
    };
  }
}
