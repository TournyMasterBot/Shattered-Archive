import {
  AnyUserScript,
  TriggerScript,
  AliasScript,
  TimerScript,
  ScriptErrorInfo,
  ScriptSandboxApi,
  TriggerContextEvent,
} from './types';

/**
 * Shared sendCommand stub.
 */
export type SendCommandFn = (cmd: string) => void;

export interface UserScriptRuntimeOptions {
  sendCommand?: SendCommandFn;
  onScriptError?: (err: ScriptErrorInfo) => void;
}

export class UserScriptRuntime {
  private scripts: Map<string, AnyUserScript> = new Map();
  private readonly sendCommand: SendCommandFn;
  private readonly onScriptError?: (err: ScriptErrorInfo) => void;

  // timer bookkeeping
  private lastTick: number;

  constructor(options: UserScriptRuntimeOptions = {}) {
    this.sendCommand =
      options.sendCommand ??
      ((cmd) => {
        // stub; replace with real game send later
        console.log('[UserScriptRuntime] sendCommand:', cmd);
      });

    this.onScriptError = options.onScriptError;
    this.lastTick = Date.now();
  }

  /** Clears all scripts. */
  clear(): void {
    this.scripts.clear();
  }

  /** Upserts a script into the runtime. */
  upsertScript(script: AnyUserScript): void {
    this.scripts.set(script.id, script);
  }

  /** Removes a script by id. */
  removeScript(id: string): void {
    this.scripts.delete(id);
  }

  /** Returns all scripts as a flat array. */
  getAllScripts(): AnyUserScript[] {
    return Array.from(this.scripts.values());
  }

  /** Fire an event; all matching trigger scripts will run. */
  dispatchEvent(event: TriggerContextEvent): void {
    for (const script of this.scripts.values()) {
      if (script.kind !== 'trigger' || !script.enabled) continue;
      if (script.eventName !== event.name) continue;

      this.executeScript(script, { event });
    }
  }

  /**
   * Execute aliases. You can wire this into your input pipeline so that
   * when the user enters a line of text, this is invoked before sending
   * the raw command.
   */
  executeAlias(input: string): boolean {
    let handled = false;

    for (const script of this.scripts.values()) {
      if (script.kind !== 'alias' || !script.enabled) continue;
      if (script.alias === input.trim()) {
        this.executeScript(script);
        handled = true;
      }
    }

    return handled;
  }

  /**
   * Timer tick. Call periodically (e.g. once per second) from a hook.
   * It will execute any enabled Timer scripts that are due.
   */
  tickTimers(): void {
    const now = Date.now();
    const delta = now - this.lastTick;
    this.lastTick = now;

    for (const script of this.scripts.values()) {
      if (script.kind !== 'timer' || !script.enabled) continue;

      // naive implementation: if interval <= delta, just fire.
      // Later you can track per-timer elapsed time to be more exact.
      if (script.intervalMs <= delta) {
        this.executeScript(script);
      }
    }
  }

  /**
   * Core sandbox executor. For now, supports only JavaScript. Everything
   * runs in a limited "context" object, and is wrapped in try/catch.
   */
  private executeScript(script: AnyUserScript, extraContext?: { event?: TriggerContextEvent }): void {
    if (!script.enabled) return;
    if (script.language !== 'javascript') {
      // future expansion: transpile/compile other languages here.
      return;
    }

    const api: ScriptSandboxApi = {
      sendCommand: this.sendCommand,
      event: extraContext?.event,
      log: (...args: unknown[]) => console.log(`[Script:${script.name}]`, ...args),
      error: (...args: unknown[]) => console.error(`[Script:${script.name}]`, ...args),
    };

    const context = api;

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(
        'context',
        `"use strict";
        const { sendCommand, event, log, error } = context;
        try {
          ${script.source}
        } catch (innerErr) {
          error("Unhandled error inside script:", innerErr);
          throw innerErr;
        }
      `,
      );

      fn(context);
    } catch (err) {
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
    }
  }
}
