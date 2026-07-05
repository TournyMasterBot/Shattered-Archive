/** Board coordinate (column x, row y); origin top-left. Immutable value. */
export interface Coord {
  readonly x: number;
  readonly y: number;
}

/**
 * A player/general index. 0-based. Two-sided modes use 0/1; free-for-all uses
 * 0..n-1. Kept as a plain number so modes with 3–4 sides need no new type.
 */
export type Side = number;
