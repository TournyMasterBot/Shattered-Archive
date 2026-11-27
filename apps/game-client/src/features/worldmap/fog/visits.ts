// apps/game-client/src/features/worldmap/fog/visits.ts
//
// The rooms a player has stood in, for fog of war: one record per (world, account, character, room), kept in IndexedDB (the page's mine store).
// A record is a lean key and nothing else (no titles, no times): `visit|world|account|character|room`. The first use of an (world, account) reads
// its keys once into memory; after that, asking is free and a visit is written once, the first time the room is entered. Two levels are asked from
// the same records: the user level is every character of the account, the character level is one. Worlds never mix.

import type { KvStore } from '../../autoleveling/autoleveling-idb';
import type { Scope } from './identity';

export const VISIT_PREFIX = 'visit|';

export type VisitLevel = 'user' | 'character';

export interface VisitStore {
  /** Writes the visit if it is new. Resolves true when it was new. A room id that is not an id is refused (false). */
  record(scope: Scope, roomId: string): Promise<boolean>;
  /** Reads what is stored for the (world, account) if it has not been read yet. */
  load(scope: Scope): Promise<void>;
  /** The rooms visited at that level, as far as they are loaded (empty before `load`). The set is a copy. */
  visited(scope: Scope, level: VisitLevel): ReadonlySet<string>;
  /** Every character's visited rooms for the (world, account), as far as loaded (the backup's input). Lists are copies, sorted. */
  byCharacter(scope: Scope): Record<string, string[]>;
  /** Adds rooms visited elsewhere (the backup coming back), per character; ids that are not ids are skipped. Resolves with how many were new. */
  addMany(scope: Scope, byCharacter: Readonly<Record<string, readonly string[]>>): Promise<number>;
  subscribe(listener: () => void): () => void;
}

const enc = (part: string): string => encodeURIComponent(part);
const ROOM_ID = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const WRITE_GROUP = 500;

interface Bucket {
  /** character -> room ids */
  byCharacter: Map<string, Set<string>>;
}

export function createVisitStore(kv: KvStore): VisitStore {
  const buckets = new Map<string, Bucket>();
  const loading = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();

  const bucketKey = (scope: Scope): string => `${enc(scope.world)}|${enc(scope.account)}`;
  const prefixOf = (scope: Scope): string => `${VISIT_PREFIX}${bucketKey(scope)}|`;
  const bucketOf = (scope: Scope): Bucket => {
    const key = bucketKey(scope);
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = { byCharacter: new Map() };
      buckets.set(key, bucket);
    }
    return bucket;
  };
  const add = (bucket: Bucket, character: string, roomId: string): boolean => {
    let set = bucket.byCharacter.get(character);
    if (set === undefined) {
      set = new Set();
      bucket.byCharacter.set(character, set);
    }
    if (set.has(roomId)) return false;
    set.add(roomId);
    return true;
  };

  function load(scope: Scope): Promise<void> {
    const key = bucketKey(scope);
    let pending = loading.get(key);
    if (pending === undefined) {
      const prefix = prefixOf(scope);
      pending = kv
        .keys()
        .then((keys) => {
          const bucket = bucketOf(scope);
          for (const stored of keys) {
            if (!stored.startsWith(prefix)) continue;
            const [character, roomId, extra] = stored.slice(prefix.length).split('|');
            if (extra !== undefined || roomId === undefined || character === undefined) continue; // not a key of this shape
            try {
              const room = decodeURIComponent(roomId);
              if (ROOM_ID.test(room)) add(bucket, decodeURIComponent(character), room);
            } catch {
              // a key that is not valid text is not a visit
            }
          }
          for (const listener of [...listeners]) listener();
        });
      loading.set(key, pending);
    }
    return pending;
  }

  return {
    load,

    async record(scope, roomId) {
      if (!ROOM_ID.test(roomId)) return false;
      await load(scope);
      const fresh = add(bucketOf(scope), scope.character, roomId);
      if (!fresh) return false;
      await kv.set(`${prefixOf(scope)}${enc(scope.character)}|${enc(roomId)}`, 1);
      for (const listener of [...listeners]) listener();
      return true;
    },

    byCharacter(scope) {
      const out: Record<string, string[]> = {};
      for (const [character, set] of buckets.get(bucketKey(scope))?.byCharacter ?? []) out[character] = [...set].sort();
      return out;
    },

    async addMany(scope, incoming) {
      await load(scope);
      const bucket = bucketOf(scope);
      const writes: [string, string][] = [];
      for (const [character, ids] of Object.entries(incoming)) {
        for (const roomId of ids) {
          if (ROOM_ID.test(roomId) && add(bucket, character, roomId)) writes.push([character, roomId]);
        }
      }
      // in groups, so a backup of tens of thousands of rooms is not one transaction after another
      for (let i = 0; i < writes.length; i += WRITE_GROUP) {
        await Promise.all(writes.slice(i, i + WRITE_GROUP).map(([character, roomId]) => kv.set(`${prefixOf(scope)}${enc(character)}|${enc(roomId)}`, 1)));
      }
      if (writes.length > 0) for (const listener of [...listeners]) listener();
      return writes.length;
    },

    visited(scope, level) {
      const bucket = buckets.get(bucketKey(scope));
      if (bucket === undefined) return new Set();
      if (level === 'character') return new Set(bucket.byCharacter.get(scope.character) ?? []);
      const all = new Set<string>();
      for (const set of bucket.byCharacter.values()) for (const id of set) all.add(id);
      return all;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
