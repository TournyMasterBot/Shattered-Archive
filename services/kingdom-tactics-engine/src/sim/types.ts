import type { Side } from '../model/index.js';

/**
 * The typed outcome of one simulated match — also the "match-result event" a future
 * campaign/ladder layer subscribes to (ARCHITECTURE §5). Fully determined by the match's
 * (initial state, seed), so it is reproducible and safe to cache/compare.
 */
export interface MatchResult {
  readonly winner: Side | 'draw';
  /** false = the match hit the turn limit still undecided. */
  readonly decided: boolean;
  readonly turns: number;
  readonly actions: number;
  readonly reason: 'victory' | 'turn-limit';
  /** Living tokens remaining per side (side index → count). */
  readonly survivors: Readonly<Record<number, number>>;
  readonly seed: number;
}
