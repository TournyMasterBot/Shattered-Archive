import type { Board, BoardToken, Coord, MatchState, Tile } from '../model/index.js';

/** Stable string key for a coord (for Set/Map membership). */
export const coordKey = (c: Coord): string => `${c.x},${c.y}`;

export const coordEquals = (a: Coord, b: Coord): boolean => a.x === b.x && a.y === b.y;

export function inBounds(board: Board, c: Coord): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < board.width && c.y < board.height;
}

export function tileAt(board: Board, c: Coord): Tile | undefined {
  return inBounds(board, c) ? board.tiles[c.y][c.x] : undefined;
}

/** The token occupying a coord, if any. */
export function tokenAt(state: MatchState, c: Coord): BoardToken | undefined {
  return state.tokens.find((t) => coordEquals(t.pos, c));
}

/** Set of occupied coord keys, optionally excluding one token (e.g. the mover). */
export function occupiedKeys(state: MatchState, exceptTokenId?: string): Set<string> {
  const s = new Set<string>();
  for (const t of state.tokens) {
    if (t.instanceId === exceptTokenId) continue;
    s.add(coordKey(t.pos));
  }
  return s;
}

/** Chebyshev (king-move) distance. */
export const chebyshev = (a: Coord, b: Coord): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Manhattan distance. */
export const manhattan = (a: Coord, b: Coord): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Unit-step direction offsets for a movement/attack pattern kind. */
export const ORTHOGONAL: readonly Coord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];
export const DIAGONAL: readonly Coord[] = [
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];
export const OMNI: readonly Coord[] = [...ORTHOGONAL, ...DIAGONAL];
export const KNIGHT: readonly Coord[] = [
  { x: 1, y: 2 },
  { x: 2, y: 1 },
  { x: -1, y: 2 },
  { x: -2, y: 1 },
  { x: 1, y: -2 },
  { x: 2, y: -1 },
  { x: -1, y: -2 },
  { x: -2, y: -1 },
];

export function stepOffsets(kind: 'orthogonal' | 'diagonal' | 'omni' | 'knight'): readonly Coord[] {
  switch (kind) {
    case 'orthogonal':
      return ORTHOGONAL;
    case 'diagonal':
      return DIAGONAL;
    case 'omni':
      return OMNI;
    case 'knight':
      return KNIGHT;
  }
}
