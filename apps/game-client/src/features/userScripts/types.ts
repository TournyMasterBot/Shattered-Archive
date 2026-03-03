export type UserScriptLanguage = 'javascript' | 'lua' | 'python' | 'typescript' | 'text';

export interface BaseUserScript {
  id: string;
  name: string;
  enabled: boolean;
  language: UserScriptLanguage;
  source: string;

  /**
   * Cosmetic grouping path for the editor list UI only.
   * Supports nested grouping via delimiters interpreted by the list tree builder.
   * Examples:
   * - "combat"
   * - "combat/defense"
   * - "utility::travel"
   */
  group?: string;
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

  /**
   * If true, matching text:line output should be omitted from the visible terminal,
   * while still allowing actions to run.
   */
  omitFromOutput?: boolean;
  /** When true, match text can be blank */
  dontRequireMatchText?: boolean;
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
  /**
   * Send a line of text as a game command.
   */
  sendCommand: (cmd: string) => void;

  /**
   * Current event context (for triggers, aliases, timers).
   */
  event?: TriggerContextEvent;

  /**
   * Logging helpers routed to your UI / console.
   */
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;

  /**
   * Write DSL-colored text directly to the terminal.
   *
   * This should accept the DSL codes:
   *   - Colors: {r {R {g {G {y {Y {b {B {m {M {c {C {D {w {W
   *   - Extended: {o {n {p {u
   *   - Reset: {x  (use this at the end of the line to clear styles)
   *   - Attributes: {! {- {& {_
   *   - Literal '{': '{{'
   *
   * Implementation (outside this type) is expected to:
   *   - Convert DSL → ANSI for xterm
   *   - Emit a bypass event (e.g. shatteredarchive:write-terminal)
   *     that does NOT go through omit/line filtering.
   */
  writeTerminal?: (dsl: string) => void;

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

  /**
   * Run a global script function by identifier, e.g.:
   *   - "global.javascript.foo"
   *   - "global.lua.bar"
   *   - "global.python.baz"
   *   - "global.typescript.qux"
   *
   * The "{thing}" portion is resolved inside the global file for that language.
   */
  runGlobal?: (globalId: string, args?: unknown) => Promise<unknown>;

  /**
   * Global key/value store (persisted to localStorage, cached in memory).
   */
  getGlobalVar?: (key: string) => unknown;
  setGlobalVar?: (key: string, value: unknown) => void;
  deleteGlobalVar?: (key: string) => void;

  /**
   * Named variables used for trigger/alias template expansion: "{NAME}"
   */
  getNamedVar?: (name: string) => string | undefined;
  setNamedVar?: (name: string, value: string) => void;
  deleteNamedVar?: (name: string) => void;
}
