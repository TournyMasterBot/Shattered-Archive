// apps/game-client/src/features/autoleveling/autoleveling-content.ts

/**
 * Auto-leveling area content — client cache
 * ----------------------------------------
 * Read-through IndexedDB cache of the curated leveling areas served by the DSL
 * C# service (proxied by web-server under `/api/web/maps/autoleveling/...`).
 * Same pattern as autoleveling-maps-client.ts.
 *
 * Split list / detail so the wizard's Area picker only loads a small index:
 *   - getAreaIndex()        -> AutoPilotAreaSummary[]  (all areas, ~150 bytes each)
 *   - getAreaDetail(slug)   -> AutoPilotArea           (route + targets, fetched on select)
 * Both are cached in IndexedDB (7-day soft TTL, network failure falls back to cache).
 */

import type {
  AutoPilotArea,
  AutoPilotAreaIndexResponse,
  AutoPilotAreaSummary,
} from './autoleveling-content-types';
import { normalizeArea, normalizeAreaSummary } from './autoleveling-content-types';
import { indexedDbKvStore, type KvStore } from './autoleveling-idb';

const INDEX_URL = (force?: boolean) => `/api/web/maps/autoleveling/areas${force ? '?refresh=1' : ''}`;
const DETAIL_URL = (slug: string, force?: boolean) =>
  `/api/web/maps/autoleveling/areas/${encodeURIComponent(slug)}${force ? '?refresh=1' : ''}`;
const INDEX_KEY = 'autolevelingAreaIndex';
const DETAIL_KEY = (slug: string) => `autolevelingArea:${slug}`;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // soft freshness hint

type Cached<T> = { data: T; fetchedAt: number };

// Shares the maps DB so all cached remote map data lives in one place.
let store: KvStore = indexedDbKvStore('shatteredarchive-maps', 'kv');

/** Test seam — swap the persistence layer. */
export function __setAreaStoreForTests(s: KvStore): void {
  store = s;
}

async function fetchJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

function fresh<T>(c: Cached<T> | null): c is Cached<T> {
  return !!c && Date.now() - (c.fetchedAt ?? 0) < CACHE_TTL_MS;
}

/* ------------------------------- area index ------------------------------ */

function sanitizeIndex(list: unknown): AutoPilotAreaSummary[] {
  return Array.isArray(list)
    ? (list.map(normalizeAreaSummary).filter((a): a is AutoPilotAreaSummary => a !== null))
    : [];
}

/** Index from cache only (no network). */
export async function getAreaIndexCached(): Promise<AutoPilotAreaSummary[]> {
  const c = await store.get<Cached<AutoPilotAreaSummary[]>>(INDEX_KEY);
  return sanitizeIndex(c?.data);
}

/**
 * The area index, cache-first. Fetches when missing/stale (or `force`), persists,
 * and falls back to cache on network failure.
 */
export async function getAreaIndex(opts: { force?: boolean } = {}): Promise<AutoPilotAreaSummary[]> {
  const c = await store.get<Cached<AutoPilotAreaSummary[]>>(INDEX_KEY);
  if (!opts.force && fresh(c) && sanitizeIndex(c.data).length > 0) return sanitizeIndex(c.data);

  try {
    const json = await fetchJson<AutoPilotAreaIndexResponse>(INDEX_URL(opts.force));
    const areas = sanitizeIndex(json?.areas);
    if (areas.length > 0) {
      await store.set(INDEX_KEY, { data: areas, fetchedAt: Date.now() } satisfies Cached<AutoPilotAreaSummary[]>);
      return areas;
    }
    const existing = sanitizeIndex(c?.data);
    return existing.length > 0 ? existing : areas;
  } catch {
    return sanitizeIndex(c?.data);
  }
}

/* ------------------------------ area detail ------------------------------ */

/** One area's full route + targets, cache-first. Returns null when unknown/unavailable. */
export async function getAreaDetail(slug: string, opts: { force?: boolean } = {}): Promise<AutoPilotArea | null> {
  const cacheKey = DETAIL_KEY(slug);
  const c = await store.get<Cached<AutoPilotArea>>(cacheKey);
  const cachedArea = c ? normalizeArea(c.data) : null;
  if (!opts.force && fresh(c) && cachedArea) return cachedArea;

  try {
    const json = await fetchJson<unknown>(DETAIL_URL(slug, opts.force));
    const area = normalizeArea(json);
    if (area) {
      await store.set(cacheKey, { data: area, fetchedAt: Date.now() } satisfies Cached<AutoPilotArea>);
      return area;
    }
    return cachedArea;
  } catch {
    return cachedArea;
  }
}

/* ------------------------------ pure helpers ---------------------------- */
// Operate on the summary shape — the Area picker never needs the full route.

export function areaBySlug<T extends { slug: string }>(areas: T[], slug: string): T | undefined {
  return areas.find((a) => a.slug === slug);
}

export function isLevelInRange(area: { levelRange: [number, number] }, level: number): boolean {
  return level >= area.levelRange[0] && level <= area.levelRange[1];
}

/**
 * Areas appropriate for a character `level` — the recommended range widened by a
 * small margin (a level under is fine to start; a couple over is still useful).
 */
export function areasForLevel<T extends { levelRange: [number, number] }>(
  areas: T[],
  level: number,
  margin = { under: 1, over: 2 },
): T[] {
  return areas
    .filter((a) => level >= a.levelRange[0] - margin.under && level <= a.levelRange[1] + margin.over)
    .sort((a, b) => a.levelRange[0] - b.levelRange[0]);
}

/** A recommended range that spans most of the game is really "not set" upstream. */
export function hasMeaningfulLevelRange(area: { levelRange: [number, number] }): boolean {
  return area.levelRange[1] - area.levelRange[0] < 40;
}

/**
 * Areas whose recommended range OVERLAPS `[min, max]`, each band widened by
 * `margin` levels on both sides first — MUD areas are forgiving, so an area a few
 * levels off either end is still a reasonable pick. Areas with no meaningful
 * range upstream (span ≥ 40) are excluded from a gated view.
 *
 * `min` and `max` are each optional: `null` means open-ended on that side
 * ("level 20 and up", "up to level 15"). Both `null` returns every area with a
 * meaningful range (order preserved).
 */
export function areasForLevelRange<T extends { levelRange: [number, number] }>(
  areas: T[],
  min: number | null,
  max: number | null,
  margin = 4,
): T[] {
  let lo = min ?? Number.NEGATIVE_INFINITY;
  let hi = max ?? Number.POSITIVE_INFINITY;
  if (lo > hi) [lo, hi] = [hi, lo]; // tolerate reversed bounds
  return areas
    .filter(hasMeaningfulLevelRange)
    .filter((a) => a.levelRange[1] + margin >= lo && a.levelRange[0] - margin <= hi)
    .sort((a, b) => a.levelRange[0] - b.levelRange[0]);
}

/** Areas grouped by continent, each group ordered by min level then name. */
export function areasByContinent<T extends { continent: string; levelRange: [number, number]; areaName: string }>(
  areas: T[],
): { continent: string; areas: T[] }[] {
  const groups = new Map<string, T[]>();
  const sorted = [...areas].sort(
    (x, y) => x.levelRange[0] - y.levelRange[0] || x.areaName.localeCompare(y.areaName),
  );
  for (const a of sorted) {
    const list = groups.get(a.continent) ?? [];
    list.push(a);
    groups.set(a.continent, list);
  }
  return [...groups.entries()].map(([continent, list]) => ({ continent, areas: list }));
}

/**
 * The full round route as a semicolon path: required actions + in-area dirs.
 *
 * `speedwalkToStart` (the recall -> area-entrance bridge) is deliberately left out for
 * now — it's the untested seam between Shattered Archive's own speedwalk and wherever
 * the auto-level route should pick up, and isn't ready yet. Until that's built out, the
 * player is expected to already be at `autopilot_start_room` when they hit Start.
 */
export function fullRoute(area: AutoPilotArea): string {
  return [...area.requiredActions, ...area.dirs]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(';');
}
