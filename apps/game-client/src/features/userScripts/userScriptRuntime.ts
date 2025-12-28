// apps/game-client/src/features/userScripts/userScriptRuntime.ts

import { AnyUserScript, ScriptErrorInfo, ScriptSandboxApi, TriggerContextEvent } from './types';

import { runUserScript } from './runtime';

export type SendCommandFn = (cmd: string) => void;

export interface UserScriptRuntimeOptions {
  sendCommand?: SendCommandFn;
  onScriptError?: (err: ScriptErrorInfo) => void;

  /** Character used to split multiple commands in a single input line. Default: ';' */
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
      // IMPORTANT: empty segments MUST still be sent (blank enter, or ;; cases)
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
        // no trim on send
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
    };

    // Fire and forget; runtime handles internal errors via api.error.
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
