/** The two jobs a local model does. `watcher` reads the situation and proposes a command; `agent` restates a correction. */
export type ModelRole = 'watcher' | 'agent';

export type ModelFailure =
  /** No model is configured. */
  | 'disabled'
  | 'timeout'
  | 'aborted'
  /** The server could not be reached. */
  | 'network'
  /** A non-2xx answer. */
  | 'http'
  /** The answer was not the expected JSON envelope. */
  | 'bad-response'
  | 'too-large';

export type ModelResult = { ok: true; text: string } | { ok: false; reason: ModelFailure };

/**
 * A local text model. `generate` asks for a JSON answer to `prompt` and returns the model's text (which the caller parses and
 * validates strictly). It never throws: every failure is a `reason`. Calls are one at a time.
 */
export interface ModelClient {
  generate(role: ModelRole, prompt: string, signal?: AbortSignal): Promise<ModelResult>;
  /**
   * Loads the configured model(s) into the model server's memory so the first real call does not pay the load (a large model takes
   * a minute or more). Only a client with something to load has it. Never throws: each model gets a state.
   */
  warm?(signal?: AbortSignal): Promise<WarmReport[]>;
}

/** What `warm` found for one model: `loaded` (answered an empty prompt), `missing` (the server does not have it), `unreachable`, or `failed`. */
export interface WarmReport {
  model: string;
  state: 'loaded' | 'missing' | 'unreachable' | 'failed';
}
