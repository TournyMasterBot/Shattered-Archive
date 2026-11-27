import type { ModelClient, ModelResult, ModelRole, WarmReport } from './types.js';

export class ModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelConfigError';
  }
}

const PRIVATE_V4 = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^127\./];

/**
 * True for a model server address that is on this machine or this network: localhost, loopback, a private range, Docker's
 * `host.docker.internal`, or a bare service name with no dot (`ollama`). A public host name is not (models are local only).
 */
export function isLocalModelUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username !== '' || url.password !== '') return false;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1' || host === 'host.docker.internal') return true;
  if (PRIVATE_V4.some((re) => re.test(host))) return true;
  return /^[a-z][a-z0-9-]*$/.test(host); // a Docker service name: one label, no dots
}

/** A hosted model: the name ends in `:cloud` or `-cloud`. Refused, whatever the server. */
export function isCloudModelName(name: string): boolean {
  return /(^|[:-])cloud$/i.test(name.trim());
}

export interface OllamaOptions {
  baseUrl: string;
  models: Record<ModelRole, string>;
  /** Per request (default 60 s). */
  timeoutMs?: number;
  /** Largest answer body accepted, in characters (default 1,000,000). */
  maxResponseChars?: number;
  fetch?: typeof fetch;
}

/**
 * A client for a LOCAL Ollama server. It refuses, at construction, a base URL that is not local and a hosted (`cloud`) model name.
 * One request at a time (a 16 GB card holds one model, and a second request would only queue inside Ollama). Each request has a
 * timeout and obeys the caller's `AbortSignal`. The answer envelope is `{ "response": "<text>" }` (`/api/generate`, not streamed).
 */
export function createOllamaClient(options: OllamaOptions): ModelClient {
  if (!isLocalModelUrl(options.baseUrl)) throw new ModelConfigError('the model server must be on this machine or network (models are local only)');
  for (const name of Object.values(options.models)) {
    if (name.trim() === '' || isCloudModelName(name)) throw new ModelConfigError('a model name is empty or names a hosted (cloud) model');
  }
  const endpoint = `${options.baseUrl.replace(/\/+$/, '')}/api/generate`;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxChars = options.maxResponseChars ?? 1_000_000;
  const doFetch = options.fetch ?? fetch;
  let tail: Promise<unknown> = Promise.resolve();

  async function call(role: ModelRole, prompt: string, signal?: AbortSignal): Promise<ModelResult> {
    if (signal?.aborted) return { ok: false, reason: 'aborted' };
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const onAbort = (): void => timeout.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: options.models[role], prompt, stream: false, format: 'json', options: { temperature: 0 } }),
        signal: timeout.signal,
      });
      if (!res.ok) return { ok: false, reason: 'http' };
      const body = await res.text();
      if (body.length > maxChars) return { ok: false, reason: 'too-large' };
      let envelope: unknown;
      try {
        envelope = JSON.parse(body);
      } catch {
        return { ok: false, reason: 'bad-response' };
      }
      const text = typeof envelope === 'object' && envelope !== null ? (envelope as { response?: unknown }).response : undefined;
      return typeof text === 'string' ? { ok: true, text } : { ok: false, reason: 'bad-response' };
    } catch {
      if (signal?.aborted) return { ok: false, reason: 'aborted' };
      return { ok: false, reason: timeout.signal.aborted ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  const base = options.baseUrl.replace(/\/+$/, '');

  /** A GET or POST with this client's timeout and the caller's signal; undefined when the server could not be reached in time. */
  async function request(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response | undefined> {
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      return await doFetch(url, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    } catch {
      return undefined;
    }
  }

  async function warm(signal?: AbortSignal): Promise<WarmReport[]> {
    const names = [...new Set(Object.values(options.models))];
    let installed: Set<string> | undefined;
    const tags = await request(`${base}/api/tags`, {}, signal);
    if (tags === undefined) return names.map((model) => ({ model, state: 'unreachable' }));
    if (tags.ok) {
      try {
        const listed = ((await tags.json()) as { models?: { name?: unknown }[] }).models;
        if (Array.isArray(listed)) installed = new Set(listed.map((m) => m.name).filter((n): n is string => typeof n === 'string'));
      } catch {
        installed = undefined; // not the expected answer: try to load anyway and let that say
      }
    }
    const reports: WarmReport[] = [];
    for (const model of names) {
      if (installed !== undefined && !installed.has(model) && !(!model.includes(':') && installed.has(`${model}:latest`))) {
        reports.push({ model, state: 'missing' });
        continue;
      }
      // An empty prompt loads the model and generates nothing. No option that changes how the model is loaded (the context size) is sent,
      // here or in a real call, so the real calls find it already in memory instead of loading it again.
      const res = await request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt: '', stream: false }) }, signal);
      reports.push({ model, state: res === undefined ? 'unreachable' : res.ok ? 'loaded' : 'failed' });
    }
    return reports;
  }

  return {
    generate(role, prompt, signal) {
      const next = tail.then(() => call(role, prompt, signal)); // `call` never rejects, so the chain cannot break
      tail = next;
      return next;
    },
    warm(signal) {
      const next = tail.then(() => warm(signal)); // after any call in progress: one model request at a time; `warm` never rejects either
      tail = next;
      return next;
    },
  };
}
