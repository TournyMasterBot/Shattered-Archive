// apps/game-client/src/features/userScripts/runtimeSingleton.ts

import { AccessibilitySettings, getAccessibilitySettings } from '../accessibility/accessibility-settings-store';
import { STORAGE_KEY_PREFIX_USERSCRIPTS, UserScriptRuntime } from './userScriptRuntime';
import { ListenDomEvent, ListenEvent, ListenRedispatchMap } from '../event-emitter/event-dispatcher';
import { ShatteredArchiveChatLine } from '../../types/chat-types/chat-line';
import { appendChatRaw } from '../chat/chat-store';
import { GameRemoteServerRaw } from '../../types/event-types/game-remote-server-raw';
import { GameRemoteServerGmcp } from '../../types/event-types/game-remote-server-gmcp';
import { GameRemoteServerError } from '../../types/event-types/game-remote-server-error';
import { GameRemoteServerClose } from '../../types/event-types/game-remote-server-close';
import { ShatteredArchiveRawData } from '../../types/event-types/shattered-archive-raw-data';
import { ShatteredArchiveGmcpData } from '../../types/event-types/shattered-archive-gmcp-data';
import { ShatteredArchiveServerError } from '../../types/event-types/shattered-archive-server-error';
import { ShatteredArchiveServerClosed } from '../../types/event-types/shattered-archive-server-closed';

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
    };
  }
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

  private constructor() {
    this.userScriptRuntime = new UserScriptRuntime({
      aliasSplitChar: this.settings.commandSplitChar,
    });

    this.hydrateRuntime('default');
    this.attachWindowEvents();
  }

  public get GetUserScriptRuntime(): UserScriptRuntime {
    return this.userScriptRuntime;
  }

  private hydrateRuntime(connectionId?: string | null) {
    const key = this.userScriptRuntime.getStorageKey(connectionId);
    const raw = window.localStorage.getItem(key) ?? '';

    if (this.lastHydrateKey === key && this.lastHydrateJson === raw) {
      return;
    }

    this.lastHydrateKey = key;
    this.lastHydrateJson = raw;

    const scripts = this.userScriptRuntime.loadScriptsFromStorage(connectionId);
    this.userScriptRuntime.replaceAllScripts(scripts);
  }

  private attachWindowEvents(): void {
    console.log('Attaching runtime singleton window events');

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

    // Connection changed -> hydrate scripts
    this.disposers.push(
      ListenEvent<{ connectionId?: string }>(
        'shatteredarchive:connection-changed',
        (payload) => {
          const nextId = payload?.connectionId ?? 'default';
          this.hydrateRuntime(nextId);
        },
        { key: 'runtimeSingleton::window::connection-changed' },
      ),
    );

    // UserScripts updated -> hydrate scripts
    this.disposers.push(
      ListenEvent<{ connectionId?: string }>(
        'shatteredarchive:userScripts-updated',
        (payload) => {
          const connectionId = payload?.connectionId ?? 'default';
          this.hydrateRuntime(connectionId);
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

    // Chat lines -> chat store (global, always-on)
    this.disposers.push(
      ListenEvent<ShatteredArchiveChatLine>(
        'shatteredarchive:chat-line',
        (payload) => {
          console.log('Raw chat event', payload);
          const rawText = String(payload?.rawText ?? payload?.text ?? '');
          if (!rawText) {
            return;
          }

          const ts =
            typeof payload?.ts === 'number'
              ? payload.ts
              : payload?.receivedTimestamp
                ? Date.parse(payload.receivedTimestamp)
                : Date.now();

          appendChatRaw(rawText, Number.isFinite(ts) ? ts : Date.now());
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
        // rebuildTriggerListeners is private, but you can expose a public wrapper if you want.
        // Easiest: add a public method on UserScriptRuntime: `debugRebuildTriggers()`.
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
    };
  }
}
