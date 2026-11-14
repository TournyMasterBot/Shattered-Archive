import type { Sphere } from '@shatteredarchive/copilot-core';
import type { Lookup } from './router.js';

export interface HttpLookupOptions {
  /** The archive's base URL, for example `https://shatteredarchive.com`. */
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const MAX_FACTS = 3;
const MAX_FACT_CHARS = 240;

/** Which existing `/api/agent` endpoint answers for a sphere by room name. `interaction` and `things` have none yet (later phases add them). */
const ENDPOINT: Record<Sphere, ((q: string) => string) | undefined> = {
  world: (q) => `/api/agent/areas?q=${encodeURIComponent(q)}&limit=${MAX_FACTS}`,
  fighting: (q) => `/api/agent/bestiary?q=${encodeURIComponent(q)}&limit=${MAX_FACTS}`,
  things: undefined,
  interaction: undefined,
};

/** The first array in a JSON answer (the agent endpoints wrap their list in one property). */
function firstList(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (typeof json !== 'object' || json === null) return [];
  return Object.values(json).find((v): v is unknown[] => Array.isArray(v)) ?? [];
}

/**
 * Lookups against the archive's public agent API (read-only JSON). Each fact is one short line of JSON. Any failure (no endpoint,
 * a timeout, a bad answer) is "no facts": the producer then works from the log alone.
 */
export function httpLookup(options: HttpLookupOptions): Lookup {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, '');
  return async (sphere, situation, signal) => {
    const build = ENDPOINT[sphere];
    const query = situation.game.room?.name;
    if (build === undefined || query === undefined) return [];
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 5000);
    try {
      const res = await doFetch(`${base}${build(query)}`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!res.ok) return [];
      return firstList(await res.json())
        .slice(0, MAX_FACTS)
        .map((item) => JSON.stringify(item).slice(0, MAX_FACT_CHARS));
    } catch {
      return [];
    }
  };
}
