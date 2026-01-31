// apps/game-client/src/features/userScripts/userScriptRuntime.ts

import { AnyUserScript, ScriptSandboxApi, TriggerContextEvent } from './types';
import { runUserScript } from './runtime';
import { DispatchEvent, ListenEvent, ListenRedispatch } from '../event-emitter/event-dispatcher';
import { SendCommandFn } from '../../types/userscript-types/send-command-function';
import { ScriptErrorInfo } from '../../types/userscript-types/script-error-info';
import { UserScriptRuntimeOptions } from '../../types/userscript-types/user-script-runtime-options';
import { ProbeOpponentConditionLine } from '../combat/probe-opponent-condition';
import { probeChatRange } from '../chat/chat-probe';
import { normalizeForMatch, stripAnsi } from '../autoleveling/autoleveling-text';
import { dslToAnsi } from '../chat/dsl-to-ansi';
import { DamageEventPayload, parseDamageLine, parseDamageSource, tryParseTarget } from '../combat/damage/damage-map';
import { ProbeLevelUpLine } from '../level/probe-level-up';

export const STORAGE_KEY_PREFIX_USERSCRIPTS = 'shatteredArchive.userScripts.';

const tickPhrase = 'tick ';
const charDataPhrase = 'char_data ';
const roomDataPhrase = 'room_data ';
const removeAffectPhrase = 'remove_affect ';
const addAffectPhrase = 'add_affect ';
const affectDataPhrase = 'affect_data ';
const loginDataPhrase = 'login_data ';

function normalizeSplitChar(v: string | undefined): string {
  const s = (v ?? ';').trim();
  if (!s) {
    return ';';
  }
  return s.slice(0, 1);
}

function safeTrim(v: unknown): string {
  return String(v ?? '').trim();
}

function pickMatchTextFromPayload(payload: any): string {
  if (payload == null) return '';

  if (typeof payload === 'string') return payload;

  // common shapes in this codebase
  if (typeof payload?.text === 'string') return payload.text;
  if (typeof payload?.rawText === 'string') return payload.rawText;
  if (typeof payload?.line === 'string') return payload.line;
  return '';
}

export class UserScriptRuntime {
  private scripts: Map<string, AnyUserScript> = new Map();
  private readonly sendCommand: SendCommandFn;
  private readonly onScriptError?: (err: ScriptErrorInfo) => void;

  private aliasSplitChar: string;
  private lastTick: number;

  // per-trigger event listeners
  private triggerUnsubs: Map<string, () => void> = new Map();

  constructor(options: UserScriptRuntimeOptions = {}) {
    this.sendCommand =
      options.sendCommand ??
      ((cmd) => {
        DispatchEvent('shatteredarchive:send-command', { cmd });
      });

    this.onScriptError = options.onScriptError;
    this.lastTick = Date.now();
    this.aliasSplitChar = normalizeSplitChar(options.aliasSplitChar);

    this.attachWindowEvents();
  }

  private attachWindowEvents() {
    console.log('Attaching user script runtime events');

    // Raw text lines from the server
    ListenEvent<any>('shatteredarchive:raw-data', (payload) => {
      void this.processRawEvent(payload);
    });

    // GMCP -> parse + emit real events
    ListenEvent<any>('shatteredarchive:gmcp-data', (payload) => {
      void this.processGmcpEvent(payload);
    });

    // gmcp console logger
    ListenRedispatch('shatteredarchive:gmcp-data', 'shatteredarchive:write-console', {
      fromUserScript: false,
    });

    // When the sandbox UI (or runtime itself) saves scripts, reload + rebuild listeners.
    ListenEvent<any>('shatteredarchive:userScripts-updated', (payload) => {
      const connectionId = payload?.connectionId;
      this.reloadFromStorage(connectionId);
    });
  }

  public replaceAllScripts(scripts: AnyUserScript[]): void {
    this.scripts.clear();
    for (const s of scripts ?? []) {
      this.scripts.set(s.id, s);
    }
    this.rebuildTriggerListeners();
  }

  private reloadFromStorage(connectionId?: string | null) {
    const loaded = this.loadScriptsFromStorage(connectionId);
    this.scripts.clear();
    for (const s of loaded) this.scripts.set(s.id, s);
    this.rebuildTriggerListeners();
  }

  private rebuildTriggerListeners(): void {
    // dispose old listeners
    for (const off of this.triggerUnsubs.values()) {
      try {
        off();
      } catch {}
    }
    this.triggerUnsubs.clear();

    // Group enabled triggers by eventName
    const byEvent = new Map<string, AnyUserScript[]>();

    for (const script of this.scripts.values()) {
      if (script.kind !== 'trigger') continue;
      if (!script.enabled) continue;

      const trig: any = script;
      const eventName = safeTrim(trig.eventName);
      if (!eventName) continue;

      const dontRequireMatchText = trig.dontRequireMatchText === true;
      const matchText = safeTrim(trig.matchText);

      // If they didn't opt out, require matchText
      if (!dontRequireMatchText && !matchText) continue;

      const list = byEvent.get(eventName) ?? [];
      list.push(script);
      byEvent.set(eventName, list);
      console.log('Listening for triggers', {
        eventName,
        list
      });
    }

    // Attach 1 listener per eventName
    for (const [eventName, scripts] of byEvent.entries()) {
      const key = `UserScriptRuntime::triggers::${eventName}`;

      const off = ListenEvent<any>(
        eventName,
        (payload) => {
          console.log("Preparing to scrub scripts");
          for (const s of scripts) {
            // Re-check current state (scripts might have changed since this rebuild)
            const current = this.scripts.get(s.id);
            if (!current || current.kind !== 'trigger' || !current.enabled) continue;

            const curTrig: any = current;
            if (!this.triggerPassesMatch(curTrig, payload)) continue;

            this.executeScript(current, {
              event: { name: eventName, payload },
            });
          }
        },
        { key, captureStack: false },
      );

      // store unsub by eventName (since it's one per event)
      this.triggerUnsubs.set(eventName, off);
    }
  }
  private triggerPassesMatch(trig: any, payload: any): boolean {
    const dontRequireMatchText = trig.dontRequireMatchText === true;
    if(dontRequireMatchText) {
      return true;
    }
    const matchText = safeTrim(trig.matchText);
    if (!matchText) {
      return dontRequireMatchText;
    }

    const text = pickMatchTextFromPayload(payload);
    if (!text) return false;

    const hay = text;
    const needle = matchText;
    console.log("Comparing needle haystack", {
      hay,
      needle
    });

    return hay.indexOf(needle) > -1;
  }

  private shouldOmitFromOutput(rawText: string): boolean {
    const text = stripAnsi(rawText ?? '');

    for (const s of this.scripts.values()) {
      if (s.kind !== 'trigger' || !s.enabled) continue;

      const trig: any = s;
      if (trig.omitFromOutput !== true) continue;

      const ev = safeTrim(trig.eventName);

      // Only omit for raw line triggers (new + legacy)
      if (ev !== 'shatteredarchive:raw-data') continue;

      const matchText = safeTrim(trig.matchText);

      // SAFETY: never omit with empty matchText (would gag everything)
      if (!matchText) continue;

      if (text.toLowerCase().includes(matchText.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  getStorageKey(connectionId?: string | null) {
    const safe = connectionId && connectionId.trim().length > 0 ? connectionId.trim() : 'default';
    return `${STORAGE_KEY_PREFIX_USERSCRIPTS}${safe}`;
  }

  loadScriptsFromStorage(connectionId?: string | null): AnyUserScript[] {
    try {
      const raw = window.localStorage.getItem(this.getStorageKey(connectionId));
      if (!raw) {
        console.log('User scripts not found. Returning default', {
          connectionId,
        });
        return [];
      }
      const parsed = JSON.parse(raw);
      console.log('Successfully loaded user scripts', {
        connectionId,
      });
      return Array.isArray(parsed) ? (parsed as AnyUserScript[]) : [];
    } catch (err) {
      console.error('Failed to load user scripts. Returning default', {
        connectionId,
        err,
      });
      return [];
    }
  }

  setAliasSplitChar(next: string | undefined): void {
    this.aliasSplitChar = normalizeSplitChar(next);
  }

  getAliasSplitChar(): string {
    return this.aliasSplitChar;
  }

  clear(): void {
    this.scripts.clear();
    this.rebuildTriggerListeners();
  }

  upsertScript(script: AnyUserScript): void {
    this.scripts.set(script.id, script);
    this.rebuildTriggerListeners();
  }

  upsertScriptAndSave(script: AnyUserScript, connectionId?: string | null): void {
    this.upsertScript(script);
    this.saveScriptsToStorage(connectionId);
  }

  removeScript(id: string): void {
    this.scripts.delete(id);
    this.rebuildTriggerListeners();
  }

  removeScriptAndSave(id: string, connectionId?: string | null): void {
    this.removeScript(id);
    this.saveScriptsToStorage(connectionId);
  }

  getAllScripts(): AnyUserScript[] {
    return Array.from(this.scripts.values());
  }

  async processRawEvent(payload: any): Promise<void> {
    const rawText = String(payload?.rawText ?? '');
    console.log('Processing raw text', {
      rawText,
    });
    // Derived/special events (damage, death, etc.)
    await this.processForSpecialLines(rawText);

    // forward to chat probe + terminal
    let end = rawText.length;

    if (end > 0 && rawText.charCodeAt(end - 1) === 10 /* \n */) end--;
    if (end > 0 && rawText.charCodeAt(end - 1) === 13 /* \r */) end--;

    const match = probeChatRange(rawText, 0, end);

    if (match.isChat && !this.shouldOmitFromOutput(rawText)) {
      // If any enabled omit trigger matches, do not forward to the terminal
      DispatchEvent('shatteredarchive:chat-line', {
        rawText,
        receivedTimestamp: payload?.receivedTimestamp,
        ...match,
      });
    }

    DispatchEvent('shatteredarchive:write-terminal', payload);
  }

  async processForSpecialLines(line: string): Promise<string | undefined> {
    let eventName: string | undefined = undefined;

    // Creature death
    if (line.indexOf('is DEAD!!') > -1) {
      eventName = 'event:creature-death';
      DispatchEvent(eventName, { text: line });
      return eventName;
    } else if (line.indexOf('You flee from combat!') > -1) {
      eventName = 'event:flee';
      DispatchEvent(eventName, { text: line });
      return eventName;
    }

    const opp = ProbeOpponentConditionLine(line);
    if (opp) {
      eventName = 'event:fighting:opponent';
      DispatchEvent(eventName, {
        ...opp,
      });
      return eventName;
    }

    const damage = this.processForDamageLine(line);
    if (damage) {
      eventName = 'event:damage';
      DispatchEvent(eventName, {
        ...damage,
      });
      return eventName;
    }

    const levelUp = ProbeLevelUpLine(line);
    if (levelUp) {
      eventName = 'event:level-up';
      DispatchEvent(eventName, {
        ...levelUp,
      });
      return eventName;
    }

    return eventName;
  }

  processForDamageLine(line: string): DamageEventPayload | null {
    const parsed = parseDamageLine(line);
    if (!parsed) return null;

    const tokenStartIndex = line.indexOf(parsed.token);
    const source = tokenStartIndex !== -1 ? parseDamageSource(line, tokenStartIndex) : null;

    return {
      key: parsed.key,
      amount: parsed.value,
      index: parsed.index,
      token: parsed.token,
      line,
      source: source ?? undefined,
      target: tryParseTarget(stripAnsi(line)) ?? undefined,
    };
  }

  processGmcpEvent(payload: any): void {
    const rawText = String(payload?.rawText ?? '');

    try {
      if (rawText.startsWith(tickPhrase)) {
        this.dispatchGmcpEvent('game:tick', tickPhrase.length, rawText);
        return;
      } else if (rawText.startsWith(charDataPhrase)) {
        this.dispatchGmcpEvent('game:char-data', charDataPhrase.length, rawText);
        return;
      } else if (rawText.startsWith(roomDataPhrase)) {
        this.dispatchGmcpEvent('game:room-data', roomDataPhrase.length, rawText);
        return;
      } else if (rawText.startsWith(affectDataPhrase)) {
        // NOTE: keep this string consistent with ROUTED_WINDOW_EVENTS
        this.dispatchGmcpEvent('game:affects-trueup', affectDataPhrase.length, rawText);
        return;
      } else if (rawText.startsWith(addAffectPhrase)) {
        this.dispatchGmcpEvent('game:affect-added', addAffectPhrase.length, rawText);
        return;
      } else if (rawText.startsWith(removeAffectPhrase)) {
        this.dispatchGmcpEvent('game:affect-removed', removeAffectPhrase.length, rawText);
        return;
      } else if (rawText.startsWith(loginDataPhrase)) {
        this.dispatchGmcpEvent('game:character-login', loginDataPhrase.length, rawText);
        return;
      } else {
        console.warn('Unknown GMCP event', {
          rawText,
        });
      }
    } catch (err) {
      console.warn('[GMCP] Failed to parse payload', { rawText, err });
    }

    return;
  }

  dispatchGmcpEvent<T extends object>(eventName: string, length: number, rawText: string): void {
    const jsonPart = rawText.slice(length).trim();
    const data = JSON.parse(jsonPart) as T;
    DispatchEvent(eventName, data);
  }

  executeAlias(input: string): boolean {
    const line = input ?? '';
    const splitChar = this.aliasSplitChar;

    const parts = splitChar ? line.split(splitChar) : [line];

    let anyAliasMatched = false;

    for (const rawPart of parts) {
      if (rawPart.length === 0) {
        this.sendCommand(rawPart);
        continue;
      }

      const normalized = rawPart.trim().toLowerCase();
      let matched = false;

      for (const script of this.scripts.values()) {
        if (script.kind !== 'alias' || !script.enabled) continue;

        const aliasKey = (script.alias ?? '').trim().toLowerCase();
        if (!aliasKey) continue;

        if (aliasKey === normalized) {
          matched = true;
          anyAliasMatched = true;
          this.executeScript(script);
        }
      }

      if (!matched) {
        this.sendCommand(rawPart);
      }
    }

    return anyAliasMatched;
  }

  tickTimers(): void {
    const now = Date.now();
    const delta = now - this.lastTick;
    this.lastTick = now;

    for (const script of this.scripts.values()) {
      if (script.kind !== 'timer' || !script.enabled) continue;
      if (script.intervalMs <= delta) this.executeScript(script);
    }
  }

  private executeScript(script: AnyUserScript, extraContext?: { event?: TriggerContextEvent }): void {
    if (!script.enabled) return;

    const api: ScriptSandboxApi = {
      sendCommand: this.sendCommand,
      event: extraContext?.event,
      log: (...args: unknown[]) => console.log(`[Script:${script.name}]`, ...args),
      error: (...args: unknown[]) => console.error(`[Script:${script.name}]`, ...args),
      writeTerminal: (dsl: string) => {
        if (!dsl) {
          return;
        }

        try {
          const ansi = dslToAnsi(dsl);

          DispatchEvent('shatteredarchive:write-terminal', {
            rawText: ansi,
            fromUserScript: true,
          });
        } catch (err) {
          console.error('[Script:writeTerminal] failed', err);
        }
      },
    };

    void runUserScript(script, api).catch((err) => {
      const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
      const stack = err instanceof Error && err.stack ? err.stack.toString() : undefined;

      const errorInfo: ScriptErrorInfo = {
        scriptId: script.id,
        scriptName: script.name,
        kind: script.kind,
        message,
        stack,
        timestamp: Date.now(),
      };

      if (this.onScriptError) {
        this.onScriptError(errorInfo);
      } else {
        console.error('[UserScriptRuntime] error', errorInfo);
      }
    });
  }

  private saveScriptsToStorage(connectionId?: string | null): void {
    try {
      const key = this.getStorageKey(connectionId);
      const scripts = this.getAllScripts();

      window.localStorage.setItem(key, JSON.stringify(scripts));

      DispatchEvent<{ connectionId?: string }>('shatteredarchive:userScripts-updated', {
        connectionId: connectionId ?? 'default',
      });
    } catch (err) {
      console.error('Failed to save user scripts', { connectionId, err });
    }
  }
}
