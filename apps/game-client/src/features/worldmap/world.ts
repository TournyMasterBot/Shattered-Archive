// apps/game-client/src/features/worldmap/world.ts
//
// Which world's map the map window shows. A production build knows ONE world, the DSL: nothing here names another, there is no picker, and
// nothing ever calls `setActiveMapWorld` with anything else. A local-only module (localWorld.ts, reached only behind a build flag) can
// `registerMapWorld` a second world and switch to it when the client connects to it; a production bundle never contains that module.
//
// The window follows the connection by itself (the automatic choice). When a build has more than one world, the gear also offers a small picker so a
// world can be chosen by hand (to look at the DSL map while connected to the other game, say); with one world there is nothing to pick and nothing is drawn.

import { useSyncExternalStore } from 'react';

export interface MapWorld {
  id: string;
  /** Shown beside the window title when it is not empty (the DSL's is empty: it needs no name). */
  label: string;
  /** The route the world's map is served under. */
  mapPrefix: string;
}

export const DSL_WORLD: MapWorld = Object.freeze({ id: 'dsl', label: '', mapPrefix: '/api/world-map' });

const registered = new Map<string, MapWorld>([[DSL_WORLD.id, DSL_WORLD]]);
/** The world the connection chose (automatic). */
let active: MapWorld = DSL_WORLD;
/** A world picked by hand (debugging): wins over the automatic choice until it is cleared. Only a world that is registered can be picked. */
let picked: MapWorld | null = null;
/** Bumped by every change of what is shown or of what can be shown: what the picker's hook watches. */
let choiceVersion = 0;
const listeners = new Set<() => void>();

/** Adds a world the window can show. Registering an id again replaces it. The DSL's own entry cannot be replaced. */
export function registerMapWorld(world: MapWorld): void {
  if (world.id === DSL_WORLD.id) return;
  registered.set(world.id, Object.freeze({ ...world }));
  choiceVersion += 1;
  notifyChoice();
}

/** Makes `id` the world shown. An id nobody registered is the DSL (never an error: the DSL is always there). */
export function setActiveMapWorld(id: string): void {
  const next = registered.get(id) ?? DSL_WORLD;
  if (next === active) return;
  const before = shown();
  active = next;
  choiceVersion += 1;
  if (shown() !== before) for (const listener of [...listeners]) listener();
  else notifyChoice();
}

const shown = (): MapWorld => picked ?? active;

/** The world being shown: the one picked by hand if there is one, else the one the connection chose. */
export function activeMapWorld(): MapWorld {
  return shown();
}

/** The world the connection chose, whatever is picked (what "Automatic" means). */
export function automaticMapWorld(): MapWorld {
  return active;
}

/** Every world the window can show, the DSL first. One entry means there is nothing to choose: no picker is drawn. */
/** What a world is called in a list: its label, or its id in capitals when it has none (the DSL needs no label in the title). */
export const mapWorldName = (world: MapWorld): string => (world.label === '' ? world.id.toUpperCase() : world.label);

export function listMapWorlds(): MapWorld[] {
  return [...registered.values()];
}

/** The id picked by hand, or null for the automatic choice. */
export function pickedMapWorldId(): string | null {
  return picked?.id ?? null;
}

/**
 * Picks the world to show by hand (null: back to automatic). An id nobody registered clears the pick. The pick is for this page only: a reload is
 * automatic again, and it is not kept anywhere.
 */
export function pickMapWorld(id: string | null): void {
  const next = id === null ? null : (registered.get(id) ?? null);
  if (next === picked) return;
  const before = shown();
  picked = next;
  choiceVersion += 1;
  if (shown() !== before) for (const listener of [...listeners]) listener();
  else notifyChoice();
}

/** The picker listens too, so it redraws when the choice changes even if what is shown does not. */
const choiceListeners = new Set<() => void>();
function notifyChoice(): void {
  for (const listener of [...choiceListeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const choiceSnapshot = (): number => choiceVersion;

function subscribeChoice(listener: () => void): () => void {
  choiceListeners.add(listener);
  listeners.add(listener);
  return () => {
    choiceListeners.delete(listener);
    listeners.delete(listener);
  };
}

/** What the picker draws: the worlds, which one the connection chose, which one is picked by hand (null: automatic), and which is shown. */
export interface MapWorldChoice {
  worlds: MapWorld[];
  automatic: MapWorld;
  pickedId: string | null;
  shown: MapWorld;
}

/** The choice, kept current: the component re-renders when a world is registered, picked or chosen by the connection. */
export function useMapWorldChoice(): MapWorldChoice {
  useSyncExternalStore(subscribeChoice, choiceSnapshot, choiceSnapshot);
  return { worlds: listMapWorlds(), automatic: active, pickedId: pickedMapWorldId(), shown: shown() };
}

/** The world being shown, kept current: the component re-renders when it changes. */
export function useActiveMapWorld(): MapWorld {
  return useSyncExternalStore(subscribe, activeMapWorld, activeMapWorld);
}

/** Test-only: back to the DSL with no other world registered. */
export function __resetMapWorldsForTests(): void {
  registered.clear();
  registered.set(DSL_WORLD.id, DSL_WORLD);
  active = DSL_WORLD;
  picked = null;
  choiceVersion = 0;
  listeners.clear();
  choiceListeners.clear();
}
