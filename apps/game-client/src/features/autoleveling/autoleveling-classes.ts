// apps/game-client/src/features/autoleveling/autoleveling-classes.ts

/**
 * Auto-leveling class catalog — client cache
 * -----------------------------------------
 * Read-through IndexedDB cache of the DSL class + ability list served by the C#
 * service (`GET /maps/autoleveling/classes`, proxied by web-server under
 * `/api/web/maps/autoleveling/classes`). Same pattern as `autoleveling-content.ts`.
 *
 * The wizard's Combat step uses this to populate its class `<select>` and to offer
 * the class's real buffs / combat abilities (level-aware) instead of free text.
 */

import type { AutoPilotAbility, AutoPilotClass, AutoPilotClassCatalogResponse } from './autoleveling-content-types';
import { normalizeClass } from './autoleveling-content-types';
import { indexedDbKvStore, type KvStore } from './autoleveling-idb';

const CATALOG_URL = '/api/web/maps/autoleveling/classes';
const CATALOG_KEY = 'autolevelingClasses';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // soft freshness hint

type Cached<T> = { data: T; fetchedAt: number };

// Shares the maps DB with the area cache.
let store: KvStore = indexedDbKvStore('shatteredarchive-maps', 'kv');

/** Test seam — swap the persistence layer. */
export function __setClassStoreForTests(s: KvStore): void {
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

function sanitize(list: unknown): AutoPilotClass[] {
  return Array.isArray(list) ? list.map(normalizeClass).filter((c): c is AutoPilotClass => c !== null) : [];
}

/** Catalog from cache only (no network). */
export async function getClassCatalogCached(): Promise<AutoPilotClass[]> {
  const c = await store.get<Cached<AutoPilotClass[]>>(CATALOG_KEY);
  return sanitize(c?.data);
}

/**
 * The full class catalog, cache-first. Fetches when missing/stale (or `force`),
 * persists, and falls back to cache on network failure.
 */
export async function getClassCatalog(opts: { force?: boolean } = {}): Promise<AutoPilotClass[]> {
  const c = await store.get<Cached<AutoPilotClass[]>>(CATALOG_KEY);
  if (!opts.force && fresh(c) && sanitize(c.data).length > 0) return sanitize(c.data);

  try {
    const json = await fetchJson<AutoPilotClassCatalogResponse>(CATALOG_URL);
    const classes = sanitize(json?.classes);
    if (classes.length > 0) {
      await store.set(CATALOG_KEY, { data: classes, fetchedAt: Date.now() } satisfies Cached<AutoPilotClass[]>);
      return classes;
    }
    const existing = sanitize(c?.data);
    return existing.length > 0 ? existing : classes;
  } catch {
    return sanitize(c?.data);
  }
}

/* ------------------------------ ability sets ---------------------------- */

// Song abilities are grouped under their own semantic names server-side
// (Server.Dsl/ClassAbilityGroups/{HymnsOfLife,SkaldChants,WarHymns}.cs, GroupType.Songs) rather
// than the generic categories below.
const SONG_GROUPS: readonly string[] = ['HymnsOfLife', 'SkaldChants', 'WarHymns'];

/** Ability-group names that read as offensive — something you do TO the mob. */
export const OFFENSIVE_GROUPS: readonly string[] = [
  'Attack',
  'Maladictions',
  'Harmful',
  'Combat',
  'Invocation',
  'Necromancy',
  'Battlemagic',
  // 'Weather' (Server.Dsl/ClassAbilityGroups/Weather.cs) is mostly attack spells (Call
  // Lightning, Lightning Bolt, Tornado) plus Faerie Fire — a debuff cast in combat, not a
  // pre-round buff — so the whole group reads as fight-rotation material.
  'Weather',
  ...SONG_GROUPS,
];

/**
 * Skills that belong in a fight rotation even though they carry no semantic group
 * (the group system tags spells far more than skills). Lower-cased for matching.
 */
export const COMBAT_SKILL_NAMES: readonly string[] = [
  'bash',
  'kick',
  'disarm',
  'trip',
  'bite',
  'gouge',
  'dirt kicking',
  'charge',
  'headbutt',
  'crush',
  'stomp',
  'maul',
  'rake',
  'circle',
  'backstab',
];

function anyGroup(a: AutoPilotAbility, wanted: readonly string[]): boolean {
  const w = wanted.map((g) => g.trim().toLowerCase());
  return a.groups.some((g) => w.includes(g.trim().toLowerCase()));
}

/** A class's offensive abilities (OFFENSIVE_GROUPS ∩ groups, or a known combat skill), by level. */
export function classOffensiveAbilities(classes: AutoPilotClass[], name: string): AutoPilotAbility[] {
  const cls = classByName(classes, name);
  if (!cls) return [];
  return cls.abilities.filter(
    (a) =>
      anyGroup(a, OFFENSIVE_GROUPS) ||
      (a.type === 'skill' && COMBAT_SKILL_NAMES.includes(a.name.trim().toLowerCase())),
  );
}

/* ------------------------------ pure helpers ---------------------------- */

/** One class by name — matches the display name case-insensitively. */
export function classByName(classes: AutoPilotClass[], name: string): AutoPilotClass | undefined {
  const n = name.trim().toLowerCase();
  return classes.find((c) => c.name.trim().toLowerCase() === n);
}

/** Class names for a `<select>` — base classes first (each half A→Z). */
export function classNames(classes: AutoPilotClass[]): string[] {
  return [...classes]
    .sort((a, b) => Number(a.isReclass) - Number(b.isReclass) || a.name.localeCompare(b.name))
    .map((c) => c.name);
}

/**
 * A class's abilities, optionally filtered:
 *  - `atOrBelowLevel` — only abilities learned at/under this level
 *  - `type`           — 'skill' | 'spell' | 'song'
 *  - `groups`         — keep abilities whose `groups` intersect this list (any-of)
 */
export function abilitiesForClass(
  classes: AutoPilotClass[],
  name: string,
  filter: { atOrBelowLevel?: number; type?: AutoPilotAbility['type']; groups?: string[] } = {},
): AutoPilotAbility[] {
  const cls = classByName(classes, name);
  if (!cls) return [];

  const wantGroups = (filter.groups ?? []).map((g) => g.trim().toLowerCase()).filter(Boolean);

  return cls.abilities.filter((a) => {
    if (typeof filter.atOrBelowLevel === 'number' && a.level > filter.atOrBelowLevel) return false;
    if (filter.type && a.type !== filter.type) return false;
    if (wantGroups.length > 0) {
      const has = a.groups.some((g) => wantGroups.includes(g.trim().toLowerCase()));
      if (!has) return false;
    }
    return true;
  });
}
