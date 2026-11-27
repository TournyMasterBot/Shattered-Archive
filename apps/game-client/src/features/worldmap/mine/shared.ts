// apps/game-client/src/features/worldmap/mine/shared.ts
//
// The page's one store for what the map window keeps for the player (their own rooms, the trail of rooms seen, the rooms visited): one IndexedDB database,
// or memory when the browser has none (a test, a blocked profile: then it lasts until the page closes).

import { hasIndexedDb, indexedDbKvStore, memoryKvStore, type KvStore } from '../../autoleveling/autoleveling-idb';
import { createVisitStore, type VisitStore } from '../fog/visits';
import { createLayerStore, type LayerStore } from './layerStore';

export const MINE_DB = 'shatteredarchive-worldmap-mine';
export const MINE_STORE = 'kv';

let kv: KvStore | undefined;
let layers: LayerStore | undefined;
let visits: VisitStore | undefined;

export function sharedMineKv(): KvStore {
  kv ??= hasIndexedDb() ? indexedDbKvStore(MINE_DB, MINE_STORE) : memoryKvStore();
  return kv;
}

/** The player's own rooms for the whole page. */
export function sharedLayerStore(): LayerStore {
  layers ??= createLayerStore(sharedMineKv());
  return layers;
}

/** The rooms visited, for fog of war, for the whole page. */
export function sharedVisitStore(): VisitStore {
  visits ??= createVisitStore(sharedMineKv());
  return visits;
}

/** Test-only: forget the shared stores. */
export function __resetSharedMineForTests(): void {
  kv = undefined;
  layers = undefined;
  visits = undefined;
}
