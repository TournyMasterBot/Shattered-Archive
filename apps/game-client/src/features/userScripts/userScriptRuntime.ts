// apps\game-client\src\features\userScripts\userScriptRuntime.ts
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
        // Send through the same browser event bridge as the React hook
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
   * Execute aliases for a given input line.
   *
   * Behavior:
   *  - Split the line on ';' into segments.
   *  - For each segment:
   *      * Trim + lowercase for comparison against alias keys.
   *      * If it matches an alias key → run that alias script.
   *      * Otherwise → send the raw segment to the game via sendCommand.
   *
   * Returns true if at least one alias key matched.
   */
  executeAlias(input: string): boolean {
    const line = input ?? '';
    const parts = line.split(';');

    let anyAliasMatched = false;

    for (const rawPart of parts) {
      // Preserve rawPart for sending to the server
      const normalized = rawPart.trim().toLowerCase();

      // Find all alias scripts whose key matches this segment
      const matchingAliases: AliasScript[] = [];
      for (const script of this.scripts.values()) {
        if (script.kind !== 'alias' || !script.enabled) continue;

        const aliasKey = (script.alias ?? '').trim().toLowerCase();
        if (!aliasKey) continue;

        if (aliasKey === normalized) {
          matchingAliases.push(script as AliasScript);
        }
      }

      if (matchingAliases.length > 0) {
        anyAliasMatched = true;

        // Run all matching alias scripts. They can call `sendCommand(...)` themselves.
        for (const aliasScript of matchingAliases) {
          this.executeScript(aliasScript);
        }
      } else {
        // Not an alias key → treat as a normal game command.
        // IMPORTANT: send *rawPart* (no trim) to respect your "no trimming" preference.
        this.sendCommand(rawPart);
      }
    }

    return anyAliasMatched;
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
