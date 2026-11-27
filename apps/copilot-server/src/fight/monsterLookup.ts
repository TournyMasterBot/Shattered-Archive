import type { LookupOutcome } from '@shatteredarchive/copilot-core';

/** Asks the archive about ONE monster by the word a player types for it. A failure is "not identified", never an error. */
export type MonsterLookup = (keyword: string, signal?: AbortSignal) => Promise<LookupOutcome>;

export interface HttpMonsterLookupOptions {
  /** The archive's base URL, for example `https://shatteredarchive.com`. */
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const MAX_FACTS = 3;
const MAX_FACT_CHARS = 240;

/** The first array in a JSON answer (the agent endpoints wrap their list in one property). */
function firstList(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (typeof json !== 'object' || json === null) return [];
  return Object.values(json).find((v): v is unknown[] => Array.isArray(v)) ?? [];
}

/**
 * The archive's bestiary (`/api/agent/bestiary?q=`, the same data the `archive_bestiary` MCP tool answers from). A search can return creatures
 * that merely share a word, so a monster is IDENTIFIED only when a result names the keyword in its own words (its name or keywords): a
 * stranger in the list is not an identification. An answer that is empty, malformed or late is "not identified".
 */
export function httpMonsterLookup(options: HttpMonsterLookupOptions): MonsterLookup {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, '');
  return async (keyword, signal) => {
    const notFound: LookupOutcome = { found: false, facts: [] };
    if (keyword === '') return notFound;
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 5000);
    try {
      const res = await doFetch(`${base}/api/agent/bestiary?q=${encodeURIComponent(keyword)}&limit=${MAX_FACTS * 3}`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!res.ok) return notFound;
      const matching = firstList(await res.json()).filter((item) => namesKeyword(item, keyword));
      if (matching.length === 0) return notFound;
      return { found: true, facts: matching.slice(0, MAX_FACTS).map((item) => JSON.stringify(item).slice(0, MAX_FACT_CHARS)) };
    } catch {
      return notFound;
    }
  };
}

/** True when the creature's own name or keywords contain a word that starts with the keyword (the game matches a typed word as a prefix). */
export function namesKeyword(item: unknown, keyword: string): boolean {
  if (typeof item !== 'object' || item === null) return false;
  const record = item as Record<string, unknown>;
  const words: string[] = [];
  for (const field of ['name', 'shortDescription', 'keywords']) {
    const value = record[field];
    if (typeof value === 'string') words.push(...value.toLowerCase().split(/[^a-z0-9']+/));
    else if (Array.isArray(value)) for (const part of value) if (typeof part === 'string') words.push(...part.toLowerCase().split(/[^a-z0-9']+/));
  }
  const wanted = keyword.toLowerCase();
  return words.some((word) => word !== '' && word.startsWith(wanted));
}
