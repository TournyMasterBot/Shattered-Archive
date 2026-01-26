// apps/game-client/src/features/userScripts/userScriptRuntime.ts

import { AnyUserScript, ScriptSandboxApi, TriggerContextEvent } from './types';
import { runUserScript } from './runtime';
import { DispatchEvent, ListenEvent, ListenRedispatch } from '../event-emitter/event-dispatcher';
import { SendCommandFn } from '../../types/userscript-types/send-command-function';
import { ScriptErrorInfo } from '../../types/userscript-types/script-error-info';
import { UserScriptRuntimeOptions } from '../../types/userscript-types/user-script-runtime-options';
import { ProbeOpponentConditionLine } from '../combat/probe-opponent-condition';
import { TickData, CharData } from '@shatteredarchive/types-global';
import { probeChatRange } from '../chat/chat-probe';
import { stripAnsi } from '../autoleveling/autoleveling-text';
import { dslToAnsi } from '../chat/dsl-to-ansi';

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

export class UserScriptRuntime {
  private scripts: Map<string, AnyUserScript> = new Map();
  private readonly sendCommand: SendCommandFn;
  private readonly onScriptError?: (err: ScriptErrorInfo) => void;

  private aliasSplitChar: string;
  private lastTick: number;

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
  }

  upsertScript(script: AnyUserScript): void {
    this.scripts.set(script.id, script);
  }

  upsertScriptAndSave(script: AnyUserScript, connectionId?: string | null): void {
    this.upsertScript(script);
    this.saveScriptsToStorage(connectionId);
  }

  removeScript(id: string): void {
    this.scripts.delete(id);
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
    await this.processForSpecialLines(rawText);

    const haystack = rawText.toLowerCase();

    const triggers = Array.from(this.scripts.values()).filter(
      (s): s is any => s.enabled === true && s.kind === 'trigger',
    );

    let omitOriginalLine = false;

    for (const script of triggers) {
      const matchText = String(script.matchText ?? '').trim();
      const isPlaintext = script.language === 'plaintext';
      const dontRequireMatchText = (script as any).dontRequireMatchText === true;

      // 1) Skip execution if match text is blank and the language is plaintext
      if (!matchText && isPlaintext) {
        continue;
      }

      if (!matchText && !dontRequireMatchText) {
        continue;
      }

      // 2) If match text exists, it must match
      if (matchText) {
        const needle = matchText.toLowerCase();
        if (!haystack.includes(needle)) {
          continue;
        }
      }
      // 3) If no match text exists (and not plaintext), execute the script

      const triggerScriptPayload = {
        event: {
          name: script.eventName,
          payload: {
            ...payload,
            fromUserScript: true,
          },
        },
      };

      console.log('✅ Trigger fired', {
        matchText,
        script,
        triggerScriptPayload,
      });

      if ((script as any).omitFromOutput === true) {
        omitOriginalLine = true;
      }

      this.executeScript(script, triggerScriptPayload);
    }

    // forward to terminal
    if (!omitOriginalLine) {
      let end = rawText.length;

      if (end > 0 && rawText.charCodeAt(end - 1) === 10 /* \n */) end--;
      if (end > 0 && rawText.charCodeAt(end - 1) === 13 /* \r */) end--;

      const match = probeChatRange(rawText, 0, end);

      if (match.isChat) {
        DispatchEvent('shatteredarchive:chat-line', {
          rawText,
          receivedTimestamp: payload?.receivedTimestamp,
          ...match,
        });
      }

      DispatchEvent('shatteredarchive:write-terminal', payload);
    }
  }

  async processForSpecialLines(line: string) {
    // Creature death
    if (line.indexOf('is DEAD!!') > -1) {
      DispatchEvent('event:creature-death', {
        text: line,
      });
      return;
    } else if (line.indexOf('You flee from combat!') > -1) {
      DispatchEvent('event:flee', {
        text: line,
      });
      return;
    }

    const opp = ProbeOpponentConditionLine(line);
    if (opp) {
      DispatchEvent('event:fighting:opponent', {
        ...opp,
      });
    }
  }

  processGmcpEvent(payload: any): void {
    const rawText = String(payload?.rawText ?? '');

    try {
      // Handle Ticks
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
        this.dispatchGmcpEvent('game:affect-trueup', affectDataPhrase.length, rawText);
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

  /*
  dispatchEvent(event: TriggerContextEvent): void {
    for (const script of this.scripts.values()) {
      if (script.kind !== 'trigger' || !script.enabled) continue;
      if (script.eventName !== event.name) continue;

      const trig: any = script;
      const matchText = String(trig.matchText ?? '');
      if (matchText) {
        const p: any = event.payload;
        const text = typeof p === 'string' ? p : String(p?.text ?? '');
        if (!text.toLowerCase().includes(matchText.toLowerCase())) continue;
      }

      this.executeScript(script, { event });
    }
  }
  */

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
