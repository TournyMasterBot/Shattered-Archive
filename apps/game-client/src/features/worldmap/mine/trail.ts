// apps/game-client/src/features/worldmap/mine/trail.ts
//
// This browser's own record of the rooms it has seen, for the add-room flow when no Copilot server is there: for each room title in each world
// the exit sets it was seen with, how often, and (when a move was seen) the title of the room each exit led to. Titles and compass letters
// only: no descriptions, no chat, no names of people. Kept in IndexedDB (the KvStore of autoleveling-idb.ts), one record per title, loaded on
// first touch, written in the background (`flush`). Bounded: at most MAX_VARIANTS exit sets per title and one neighbour per direction.

import type { KvStore } from '../../autoleveling/autoleveling-idb';
import type { HistoryRoom, HistorySource, RoomObservation } from './history';

export const TRAIL_KEY_PREFIX = 'trail|';
export const MAX_VARIANTS = 20;

export interface TrailVariant {
  /** Sorted compass letters. */
  exits: string[];
  sector?: string;
  visits: number;
  /** Direction -> the title of the room it led to. */
  neighbours: Record<string, string>;
}

export interface TrailRecord {
  title: string;
  variants: TrailVariant[];
}

export interface SeenRoom {
  room?: string;
  sector?: string;
  exits?: string[];
}

export interface Trail extends HistorySource {
  /** A room was seen. */
  seen(world: string, snapshot: SeenRoom): void;
  /** A move through `dir` from the room last seen ended in `to`. */
  moved(world: string, from: SeenRoom, dir: string, to: SeenRoom): void;
  /** Writes what changed. Resolves when it is stored. */
  flush(): Promise<void>;
}

export function titleKey(title: string): string {
  return String(title ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const sortedExits = (exits: unknown): string[] =>
  [...new Set((Array.isArray(exits) ? exits : []).map((e) => String(e).trim().toUpperCase()).filter((e) => e !== ''))].sort();

export function createTrail(kv: KvStore): Trail {
  const records = new Map<string, Promise<TrailRecord | null>>();
  const dirty = new Map<string, TrailRecord>();
  const live = new Map<string, TrailRecord>();

  const keyOf = (world: string, title: string): string => `${TRAIL_KEY_PREFIX}${world}|${titleKey(title)}`;

  function load(key: string): Promise<TrailRecord | null> {
    let pending = records.get(key);
    if (pending === undefined) {
      pending = kv.get<TrailRecord>(key).then((stored) => {
        const ok = stored !== null && typeof stored === 'object' && typeof stored.title === 'string' && Array.isArray(stored.variants);
        if (ok) live.set(key, stored);
        return ok ? stored : null;
      });
      records.set(key, pending);
    }
    return pending;
  }

  /** Runs `change` on the record of a title once it is loaded (a new record when there is none), and marks it for writing. */
  function touch(world: string, title: string, change: (record: TrailRecord) => void): void {
    const key = keyOf(world, title);
    void load(key).then((found) => {
      const record = found ?? live.get(key) ?? { title: title.trim(), variants: [] };
      live.set(key, record);
      records.set(key, Promise.resolve(record));
      change(record);
      dirty.set(key, record);
    });
  }

  function variantOf(record: TrailRecord, exits: string[], sector?: string): TrailVariant {
    const signature = exits.join(',');
    let variant = record.variants.find((v) => v.exits.join(',') === signature);
    if (variant === undefined) {
      variant = { exits, visits: 0, neighbours: {} };
      record.variants.push(variant);
      if (record.variants.length > MAX_VARIANTS) record.variants.sort((a, b) => b.visits - a.visits).length = MAX_VARIANTS;
    }
    if (sector !== undefined && sector !== '') variant.sector = sector;
    return variant;
  }

  return {
    label: 'what this browser has seen',

    seen(world, snapshot) {
      const title = String(snapshot.room ?? '').trim();
      if (title === '' || title === 'darkness') return;
      touch(world, title, (record) => {
        variantOf(record, sortedExits(snapshot.exits), snapshot.sector).visits += 1;
      });
    },

    moved(world, from, dir, to) {
      const fromTitle = String(from.room ?? '').trim();
      const toTitle = String(to.room ?? '').trim();
      const letter = dir.trim().toUpperCase();
      if (fromTitle === '' || toTitle === '' || toTitle === 'darkness' || letter === '') return;
      touch(world, fromTitle, (record) => {
        variantOf(record, sortedExits(from.exits), from.sector).neighbours[letter] = toTitle;
      });
    },

    async flush() {
      const changed = [...dirty];
      dirty.clear();
      for (const [key, record] of changed) await kv.set(key, record);
    },

    async find(world: string, observation: RoomObservation): Promise<HistoryRoom[]> {
      const key = keyOf(world, observation.title);
      const record = (await load(key)) ?? live.get(key);
      if (record === undefined) return [];
      const want = sortedExits(observation.exits).join(',');
      const rooms: HistoryRoom[] = record.variants.map((v) => ({
        source: 'browser',
        title: record.title,
        ...(v.sector === undefined ? {} : { sector: v.sector }),
        exits: v.exits,
        neighbours: Object.entries(v.neighbours).map(([dir, title]) => ({ dir, title })),
        visits: v.visits,
        sameExits: v.exits.join(',') === want,
      }));
      return rooms.sort((a, b) => Number(b.sameExits) - Number(a.sameExits) || b.visits - a.visits);
    },
  };
}
