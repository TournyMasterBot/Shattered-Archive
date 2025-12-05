export type UserScriptLanguage = 'javascript' | 'lua' | 'python' | 'typescript';

export type UserScriptKind = 'trigger' | 'alias' | 'timer';

export interface BaseUserScript {
  id: string;
  name: string;
  enabled: boolean;
  language: UserScriptLanguage;
  source: string;
}

/**
 * Triggers attach to predefined event emitters.
 * For now `eventName` is just a string; later you can
 * narrow to specific event types.
 */
export interface TriggerScript extends BaseUserScript {
  matchText: string;
  kind: 'trigger';
  eventName: string;
}

/**
 * Aliases map a user-entered string (or pattern) to script.
 * For now we’ll keep it simple: exact text or a basic regex
 * in `pattern`, interpreted later.
 */
export interface AliasScript extends BaseUserScript {
  kind: 'alias';

  /** The short word the user types to execute this alias, e.g. "l" or "hunt". */
  alias: string;

  /** Friendly descriptive name shown in the UI */
  name: string;

  source: string;
}

/**
 * Timers run on a schedule and send commands.
 * `intervalMs` is the repeat interval in milliseconds.
 */
export interface TimerScript extends BaseUserScript {
  kind: 'timer';
  intervalMs: number;
}

export type AnyUserScript = TriggerScript | AliasScript | TimerScript;

export interface ScriptErrorInfo {
  scriptId: string;
  scriptName: string;
  kind: UserScriptKind;
  message: string;
  stack?: string;
  timestamp: number;
}

/**
 * Payload passed to trigger handlers when an event fires.
 * You can evolve this into a union of typed payloads.
 */
export interface TriggerContextEvent {
  name: string;
  payload: unknown;
}

/**
 * API exposed inside the sandboxed script.
 * We can grow this over time.
 */
export interface ScriptSandboxApi {
  sendCommand: (cmd: string) => void;
  event?: TriggerContextEvent;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;

  /**
   * Bridge HTTP helper.
   *
   * - Always runs in the browser (uses window.fetch).
   * - Returns parsed JSON when possible, otherwise raw text.
   * - Throws on network / HTTP error (so you should catch in user code).
   */
  httpGetJson?: (
    url: string,
    options?: {
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: unknown;
    },
  ) => Promise<unknown>;
}
