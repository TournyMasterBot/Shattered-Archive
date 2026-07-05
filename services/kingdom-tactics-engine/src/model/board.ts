import type { Side } from './coord.js';

/**
 * A tile feature layered on top of terrain — used mainly by Siege / Objective
 * modes (walls, gates, capturable points). Absent (`null`) on open terrain.
 */
export interface TileFeature {
  readonly kind: 'wall' | 'gate' | 'objective' | 'control-point' | 'spawn';
  /** Owning side for control-points / spawns, if any. */
  readonly owner?: Side;
  /** Structural HP for destructible features (walls/gates/objectives). */
  readonly hp?: number;
}

/** A single board cell. `terrain` is a TerrainKey from data/dsl/terrain.ts. */
export interface Tile {
  readonly terrain: string;
  readonly feature: TileFeature | null;
}

/** Rectangular grid of tiles, addressed `tiles[y][x]`. Immutable. */
export interface Board {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly (readonly Tile[])[];
}
