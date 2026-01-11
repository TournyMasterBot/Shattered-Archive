// apps/game-client/src/features/userScripts/userScriptRuntime.ts

import { AnyUserScript, ScriptErrorInfo, ScriptSandboxApi, TriggerContextEvent } from './types';
import { runUserScript } from './runtime';

export type SendCommandFn = (cmd: string) => void;

export interface UserScriptRuntimeOptions {
  sendCommand?: SendCommandFn;
  onScriptError?: (err: ScriptErrorInfo) => void;
  aliasSplitChar?: string;
}

function normalizeSplitChar(v: string | undefined): string {
  const s = (v ?? ';').trim();
  if (!s) return ';';
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
        try {
          window.dispatchEvent(
            new CustomEvent('game:send-command', {
              detail: { cmd },
            }),
          );
        } catch {
          console.log('[UserScriptRuntime] sendCommand (fallback):', cmd);
        }
      });

    this.onScriptError = options.onScriptError;
    this.lastTick = Date.now();
    this.aliasSplitChar = normalizeSplitChar(options.aliasSplitChar);
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

  removeScript(id: string): void {
    this.scripts.delete(id);
  }

  getAllScripts(): AnyUserScript[] {
    return Array.from(this.scripts.values());
  }

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

      // NEW: available for triggers, aliases, timers
      writeTerminal: (dsl: string) => {
        if (!dsl) return;

        try {
          const ansi = dslToAnsi(dsl);

          window.dispatchEvent(
            new CustomEvent('game:terminal-data-script', {
              detail: {
                text: ansi,
                __fromUserScript: true,
              },
            }),
          );
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

      if (this.onScriptError) this.onScriptError(errorInfo);
      else console.error('[UserScriptRuntime] error', errorInfo);
    });
  }
}

/* ----------------------------------------------------------
   DSL → ANSI mapping (no auto-reset; use {x to clear)
---------------------------------------------------------- */

const DSL_ANSI_COLORS: Record<string, string> = {
  '{r': '\u001b[31m', // red
  '{R': '\u001b[91m', // Lt Red

  '{g': '\u001b[32m', // green
  '{G': '\u001b[92m', // Lt Green

  '{y': '\u001b[33m', // yellow
  '{Y': '\u001b[93m', // Lt Yellow

  '{b': '\u001b[34m', // blue
  '{B': '\u001b[94m', // Lt Blue

  '{m': '\u001b[35m', // magenta
  '{M': '\u001b[95m', // Lt Magenta

  '{c': '\u001b[36m', // cyan
  '{C': '\u001b[96m', // Lt Cyan

  '{D': '\u001b[30m', // black
  '{w': '\u001b[37m', // Grey
  '{W': '\u001b[97m', // Lt White

  '{o': '\u001b[38;5;208m', // orange
  '{n': '\u001b[38;5;130m', // brown
  '{p': '\u001b[38;5;213m', // pink
  '{u': '\u001b[38;5;141m', // purple
};

function dslToAnsi(input: string): string {
  if (!input) return '';

  let out = '';
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === '{' && i + 1 < input.length) {
      const next = input[i + 1];

      // Literal '{' → '{{'
      if (next === '{') {
        out += '{';
        i += 2;
        continue;
      }

      const code = input.slice(i, i + 2);

      // Reset
      if (code === '{x') {
        out += '\u001b[0m';
        i += 2;
        continue;
      }

      // Bell icon
      if (code === '{!') {
        out += '🔔';
        i += 2;
        continue;
      }

      // Literal tilde
      if (code === '{-') {
        out += '~';
        i += 2;
        continue;
      }

      // Reverse video
      if (code === '{&') {
        out += '\u001b[7m';
        i += 2;
        continue;
      }

      // Underline
      if (code === '{_') {
        out += '\u001b[4m';
        i += 2;
        continue;
      }

      const ansi = DSL_ANSI_COLORS[code];
      if (ansi) {
        out += ansi;
        i += 2;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return out;
}
