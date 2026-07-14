import type { MovementClass } from '../../model/index.js';

/**
 * HAND-AUTHORED tactical properties of each terrain (the 2D battlefield layer).
 * Read by the movement, line-of-sight, and damage rules alike, so a terrain's cover
 * value or passability is a single number in one place. Keyed by TerrainKey from
 * data/dsl/terrain.ts.
 */
export interface TerrainEffect {
  readonly terrainKey: string;
  /** Extra movement points to enter this tile (ground movement). */
  readonly moveCost: number;
  /** Which movement classes may enter this tile. */
  readonly passable: Readonly<Record<MovementClass, boolean>>;
  /** Defensive bonus granted to an occupant. */
  readonly cover: number;
  /** Blocks ranged line-of-sight through this tile. */
  readonly blocksLoS: boolean;
}

const ground = (ok: boolean): boolean => ok;
const pass = (g: boolean, f: boolean, a: boolean): Readonly<Record<MovementClass, boolean>> => ({
  ground: ground(g),
  flying: f,
  aquatic: a,
});

export const TERRAIN_EFFECTS: Record<string, TerrainEffect> = {
  Field: { terrainKey: 'Field', moveCost: 1, passable: pass(true, true, false), cover: 0, blocksLoS: false },
  City: { terrainKey: 'City', moveCost: 1, passable: pass(true, true, false), cover: 2, blocksLoS: true },
  Forest: { terrainKey: 'Forest', moveCost: 2, passable: pass(true, true, false), cover: 2, blocksLoS: true },
  Mountain: { terrainKey: 'Mountain', moveCost: 3, passable: pass(true, true, false), cover: 3, blocksLoS: true },
  Hills: { terrainKey: 'Hills', moveCost: 2, passable: pass(true, true, false), cover: 1, blocksLoS: false },
  Desert: { terrainKey: 'Desert', moveCost: 2, passable: pass(true, true, false), cover: 0, blocksLoS: false },
  Tundra: { terrainKey: 'Tundra', moveCost: 2, passable: pass(true, true, false), cover: 0, blocksLoS: false },
  Ice: { terrainKey: 'Ice', moveCost: 2, passable: pass(true, true, false), cover: 0, blocksLoS: false },
  Water: { terrainKey: 'Water', moveCost: 3, passable: pass(false, true, true), cover: 0, blocksLoS: false },
  Ocean: { terrainKey: 'Ocean', moveCost: 4, passable: pass(false, true, true), cover: 0, blocksLoS: false },
  Underwater: { terrainKey: 'Underwater', moveCost: 3, passable: pass(false, false, true), cover: 1, blocksLoS: true },
  Underground: { terrainKey: 'Underground', moveCost: 2, passable: pass(true, false, false), cover: 1, blocksLoS: true },
  Indoors: { terrainKey: 'Indoors', moveCost: 1, passable: pass(true, false, false), cover: 1, blocksLoS: true },
  Air: { terrainKey: 'Air', moveCost: 1, passable: pass(false, true, false), cover: 0, blocksLoS: false },
};

/** Impassable-by-default fallback keeps unknown terrain from silently allowing moves. */
export const DEFAULT_TERRAIN_EFFECT: TerrainEffect = {
  terrainKey: '',
  moveCost: 1,
  passable: pass(true, true, false),
  cover: 0,
  blocksLoS: false,
};
