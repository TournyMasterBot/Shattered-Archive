// apps/game-client/src/features/worldmap/session.ts
//
// Where on the published map is the player? The game's room data carries a title and the exit list, no room number, so the answer is a
// match: a room of the map whose title is the same and whose exits are the same set. The match is made in the area the player was last
// placed in without any request; only when that fails does the session ask the site (a title search, then the area or areas it names).
// Several identical-looking rooms are all returned: the pane marks them as "one of these", it never guesses one.

import type { MapFile, Room } from '@shatteredarchive/shattered-maps-core';
import { exitsToSet } from '../movement/classifyMovement';
import type { ApiError, LoadedArea, SearchHit, WorldMapApi } from './api';

export interface Observation {
  title: string;
  exits: string[];
}

export type Location =
  | { status: 'unavailable'; reason: 'offline' | 'error' | 'not-published'; message: string }
  | { status: 'unmapped' }
  | { status: 'ambiguous'; areas: { id: string; name: string; count: number }[] }
  | { status: 'located'; area: LoadedArea; roomIds: string[]; z: number; exact: boolean };

export interface WorldMapSession {
  /** Null when the call was cancelled (a newer room arrived): the caller ignores it. */
  observe(observation: Observation, signal: AbortSignal): Promise<Location | null>;
  /** Forget the last area (a new character, a reconnect). */
  reset(): void;
}

/** The most areas a title search may name before the session stops loading them to compare. */
const MAX_AREAS_TO_COMPARE = 4;

export function normalizeTitle(title: string): string {
  return String(title ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function roomsOf(map: MapFile): Room[] {
  return map.continents
    .flatMap((c) => c.areas.flatMap((a) => a.subzones.flatMap((s) => s.rooms)))
    .filter((r) => r.aliasOf === undefined);
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

interface Match {
  rooms: Room[];
  exact: boolean;
}

/** The rooms of an area with this title; the ones whose exits are also the same set when there are any. */
export function matchInArea(area: LoadedArea, titleKey: string, exits: ReadonlySet<string>): Match | null {
  const titled = roomsOf(area.map).filter((r) => normalizeTitle(r.title) === titleKey);
  if (titled.length === 0) return null;
  const exact = titled.filter((r) => sameSet(new Set(Object.keys(r.exits)), exits));
  return exact.length > 0 ? { rooms: exact, exact: true } : { rooms: titled, exact: false };
}

function failure(error: ApiError): Location | null {
  switch (error.kind) {
    case 'aborted':
      return null;
    case 'offline':
      return { status: 'unavailable', reason: 'offline', message: 'The map could not be reached.' };
    case 'http':
      return { status: 'unavailable', reason: 'error', message: error.message };
    default:
      return { status: 'unavailable', reason: 'error', message: 'The map answer was not understood.' };
  }
}

export function createWorldMapSession(api: WorldMapApi): WorldMapSession {
  let last: LoadedArea | null = null;

  function located(area: LoadedArea, match: Match): Location {
    last = area;
    const z = match.rooms[0]?.coords?.z ?? 0;
    return { status: 'located', area, roomIds: match.rooms.map((r) => r.id), z, exact: match.exact };
  }

  return {
    reset() {
      last = null;
    },

    async observe(observation, signal) {
      const titleKey = normalizeTitle(observation.title);
      if (titleKey.length < 2) return { status: 'unmapped' };
      const exits = new Set<string>(exitsToSet(observation.exits));

      // 1. the area the player was last in: no request
      if (last) {
        const here = matchInArea(last, titleKey, exits);
        if (here) return located(last, here);
      }

      // 2. ask the site
      await api.checkFresh(signal);
      if (signal.aborted) return null;
      const index = await api.getIndex(signal);
      if (!index.ok) return failure(index.error);
      if (!index.value.available || index.value.areas.length === 0) {
        return { status: 'unavailable', reason: 'not-published', message: 'No map has been published yet.' };
      }
      const found = await api.search(observation.title.trim().slice(0, 100), signal);
      if (!found.ok) return failure(found.error);

      const exactTitle = found.value.results.filter((h: SearchHit) => normalizeTitle(h.title) === titleKey);
      if (exactTitle.length === 0) return { status: 'unmapped' };
      const byArea = new Map<string, { id: string; name: string; count: number }>();
      for (const hit of exactTitle) {
        const entry = byArea.get(hit.areaId) ?? { id: hit.areaId, name: hit.areaName, count: 0 };
        entry.count += 1;
        byArea.set(hit.areaId, entry);
      }
      const candidates = [...byArea.values()];

      // (the last area was tried above without a request; a search naming it too means its copy in memory has no such room)
      if (candidates.length > MAX_AREAS_TO_COMPARE) return { status: 'ambiguous', areas: candidates };

      const matches: { area: LoadedArea; match: Match }[] = [];
      for (const candidate of candidates) {
        const loaded = await api.getArea(candidate.id, signal);
        if (!loaded.ok) return failure(loaded.error);
        const match = matchInArea(loaded.value, titleKey, exits);
        if (match) matches.push({ area: loaded.value, match });
      }
      if (matches.length === 0) return { status: 'unmapped' };
      const exact = matches.filter((m) => m.match.exact);
      const pool = exact.length > 0 ? exact : matches;
      if (pool.length === 1) return located(pool[0].area, pool[0].match);
      return {
        status: 'ambiguous',
        areas: pool.map((m) => ({ id: m.area.id, name: m.area.name, count: m.match.rooms.length })),
      };
    },
  };
}
