import type { ContentKind } from '@shatteredarchive/shattered-maps-core';
import type { Labeler, Placement } from './parseRoom.js';

/**
 * Says whether a line printed in a room is a creature or an item, by matching it against the Archive's own names: the creatures of
 * `/api/agent/bestiary` for an unindented line and the items of `/data/items.json` for an indented one. Anything that does not match
 * is `unknown` (never guessed). The names are fetched once, kept in memory, and refreshed in the background when they are old; a
 * failed fetch changes nothing but the time of the next try, so a missing archive only means every label stays `unknown`.
 * Read-only public data: nothing about the player or the room is sent.
 */

export interface NameLabelerOptions {
  /** The archive's base URL (for example the local C# web server), or undefined for no lookups. */
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
  /** How long a loaded set of names is kept before the next refresh (default 6 hours). */
  ttlMs?: number;
  /** How long to wait after a failed fetch (default 5 minutes). */
  retryMs?: number;
  timeoutMs?: number;
}

export interface NameLabeler {
  label: Labeler;
  /** Load or refresh the names when they are missing or old. Never throws; resolves when the attempt is over. */
  refresh(): Promise<void>;
  /** How many creature and item names are loaded. */
  readonly size: { creatures: number; items: number };
}

const MIN_NAME = 5;
const MAX_NAMES = 60_000;
const BESTIARY_PAGE = 500;
const MAX_PAGES = 40;
const ARTICLE = /^(?:a|an|the|some)\s+/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A name as it is matched: no leading article, no punctuation. Short names are too general to match a line. */
function matchable(name: unknown): string | undefined {
  if (typeof name !== 'string') return undefined;
  const text = normalize(name).replace(ARTICLE, '');
  return text.length >= MIN_NAME ? text : undefined;
}

/** names bucketed by their first word, so a line is only compared with the names that start with one of its words */
class NameIndex {
  private readonly buckets = new Map<string, string[]>();
  count = 0;

  add(name: string): void {
    const first = name.split(' ', 1)[0];
    const bucket = this.buckets.get(first);
    if (bucket) bucket.push(name);
    else this.buckets.set(first, [name]);
    this.count += 1;
  }

  /** True when the line contains a name as whole words. */
  matches(line: string): boolean {
    const words = new Set(line.split(' '));
    const padded = ` ${line} `;
    for (const word of words) {
      for (const name of this.buckets.get(word) ?? []) if (padded.includes(` ${name} `)) return true;
    }
    return false;
  }
}

export function createNameLabeler(options: NameLabelerOptions = {}): NameLabeler {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 6 * 60 * 60 * 1000;
  const retryMs = options.retryMs ?? 5 * 60 * 1000;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const base = options.baseUrl?.replace(/\/+$/, '');

  let creatures = new NameIndex();
  let items = new NameIndex();
  let nextTry = 0;
  let running: Promise<void> | undefined;

  async function getJson(path: string): Promise<unknown> {
    const res = await doFetch(`${base}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadCreatures(): Promise<NameIndex> {
    const index = new NameIndex();
    let offset = 0;
    for (let page = 0; page < MAX_PAGES && index.count < MAX_NAMES; page += 1) {
      const body = (await getJson(`/api/agent/bestiary?limit=${BESTIARY_PAGE}&offset=${offset}`)) as {
        creatures?: { name?: unknown }[];
        nextOffset?: unknown;
      };
      for (const creature of body.creatures ?? []) {
        const name = matchable(creature?.name);
        if (name !== undefined) index.add(name);
      }
      if (typeof body.nextOffset !== 'number' || body.nextOffset <= offset) break;
      offset = body.nextOffset;
    }
    return index;
  }

  async function loadItems(): Promise<NameIndex> {
    const index = new NameIndex();
    const body = await getJson('/data/items.json');
    if (!Array.isArray(body)) throw new Error('unexpected item list');
    for (const item of body) {
      if (index.count >= MAX_NAMES) break;
      const name = matchable((item as { item_name?: unknown } | null)?.item_name);
      if (name !== undefined) index.add(name);
    }
    return index;
  }

  async function load(): Promise<void> {
    try {
      const [c, i] = await Promise.all([loadCreatures(), loadItems()]);
      creatures = c;
      items = i;
      nextTry = now() + ttlMs;
    } catch {
      nextTry = now() + retryMs; // keep whatever was loaded before; try again later
    }
  }

  return {
    label(text: string, placement: Placement): ContentKind {
      const line = normalize(text);
      if (line === '') return 'unknown';
      if (placement === 'creature') return creatures.matches(line) ? 'mob' : 'unknown';
      return items.matches(line) ? 'item' : 'unknown';
    },
    refresh(): Promise<void> {
      if (base === undefined || now() < nextTry) return Promise.resolve();
      running ??= load().finally(() => {
        running = undefined;
      });
      return running;
    },
    get size() {
      return { creatures: creatures.count, items: items.count };
    },
  };
}
