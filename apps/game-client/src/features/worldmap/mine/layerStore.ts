// apps/game-client/src/features/worldmap/mine/layerStore.ts
//
// The player's own rooms (rooms added to the map by hand or from game history), kept in this browser: one map file per world in IndexedDB (the
// KvStore of autoleveling-idb.ts), held in memory after the first read so lookups cost nothing. A stored file that no longer passes the strict
// reader is treated as empty (never shown, never repaired in place) and a copy is kept under `layer|<world>|unreadable`. Worlds never mix: every call names its world.

import {
  addRoomToLayer,
  emptyLayer,
  removeRoomFromLayer,
  validateMapFile,
  type AddRoomResult,
  type AddRoomSpec,
  type MapFile,
} from '@shatteredarchive/shattered-maps-core';
import type { KvStore } from '../../autoleveling/autoleveling-idb';

export const LAYER_KEY_PREFIX = 'layer|';
export const UNREADABLE_SUFFIX = '|unreadable';

export interface LayerStore {
  /** The world's layer (an empty map file when nothing is stored or the stored file is damaged). */
  get(world: string): Promise<MapFile>;
  add(world: string, spec: AddRoomSpec, avoid?: ReadonlySet<string>): Promise<AddRoomResult>;
  remove(world: string, roomId: string): Promise<void>;
  /** Called after every change, with the world that changed. Returns the unsubscribe function. */
  subscribe(listener: (world: string) => void): () => void;
  /** Bumped by every change: callers key their memoised merged areas on it. */
  version(world: string): number;
}

export function createLayerStore(kv: KvStore, random: () => number = Math.random): LayerStore {
  const loaded = new Map<string, MapFile>();
  const versions = new Map<string, number>();
  const listeners = new Set<(world: string) => void>();
  /** Changes of one world run one after the other, so two quick adds never overwrite each other. */
  let queue: Promise<unknown> = Promise.resolve();

  async function read(world: string): Promise<MapFile> {
    const have = loaded.get(world);
    if (have) return have;
    const stored = await kv.get<unknown>(LAYER_KEY_PREFIX + world);
    const checked = stored === null ? null : validateMapFile(stored);
    const layer = checked && checked.ok ? (stored as MapFile) : emptyLayer();
    // a file that fails the reader is never shown and never repaired, but it is not thrown away either: the next save replaces it, so keep a copy
    if (stored !== null && !(checked && checked.ok)) await kv.set(`${LAYER_KEY_PREFIX}${world}${UNREADABLE_SUFFIX}`, stored);
    // a second read that finished first wins, so every caller sees one object
    return loaded.get(world) ?? (loaded.set(world, layer), layer);
  }

  async function write(world: string, layer: MapFile): Promise<void> {
    loaded.set(world, layer);
    versions.set(world, (versions.get(world) ?? 0) + 1);
    await kv.set(LAYER_KEY_PREFIX + world, layer);
    for (const listener of [...listeners]) listener(world);
  }

  function serial<T>(job: () => Promise<T>): Promise<T> {
    const next = queue.then(job, job);
    queue = next.catch(() => undefined);
    return next;
  }

  return {
    get: read,
    add: (world, spec, avoid) =>
      serial(async () => {
        const result = addRoomToLayer(await read(world), spec, random, avoid);
        if (result.ok) await write(world, result.map);
        return result;
      }),
    remove: (world, roomId) =>
      serial(async () => {
        const before = await read(world);
        const after = removeRoomFromLayer(before, roomId);
        if (JSON.stringify(after) !== JSON.stringify(before)) await write(world, after);
      }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: (world) => versions.get(world) ?? 0,
  };
}
