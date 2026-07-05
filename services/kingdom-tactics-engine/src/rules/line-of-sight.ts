import type { IGameDataProvider } from '../data/index.js';
import type { Coord, MatchState } from '../model/index.js';
import { coordEquals } from './board.js';

/**
 * Determines if there is line-of-sight between two coordinates.
 * Uses supercover/Bresenham algorithm to trace a line between the two points.
 * A tile blocks line-of-sight if its terrainEffect.blocksLoS is true (excluding endpoints).
 */
export function hasLineOfSight(
  state: MatchState,
  from: Coord,
  to: Coord,
  provider: IGameDataProvider
): boolean {
  // Same position - always has line of sight
  if (coordEquals(from, to)) {
    return true;
  }

  const board = state.board;

  // Get the line of tiles between from and to (avoid shadowing the function).
  const line = tilesOnLine(from, to);

  // Check each tile on the line (excluding start and end points).
  for (let i = 1; i < line.length - 1; i++) {
    const tile = board.tiles[line[i].y]?.[line[i].x];
    if (tile && provider.terrainEffect(tile.terrain).blocksLoS) {
      return false;
    }
  }

  return true;
}

/**
 * Returns all coordinates on the straight line between two points using supercover/Bresenham algorithm.
 */
export function tilesOnLine(from: Coord, to: Coord): Coord[] {
  const tiles: Coord[] = [];
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const sx = (from.x < to.x) ? 1 : -1;
  const sy = (from.y < to.y) ? 1 : -1;
  let err = dx - dy;
  
  let x = from.x;
  let y = from.y;
  
  // Add the starting point
  tiles.push({ x, y });
  
  while (!(x === to.x && y === to.y)) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    
    // Add intermediate points
    tiles.push({ x, y });
  }
  
  return tiles;
}