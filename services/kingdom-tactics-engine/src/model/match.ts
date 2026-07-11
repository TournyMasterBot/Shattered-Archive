import type { Army } from './army.js';
import type { Board } from './board.js';
import type { Side } from './coord.js';
import type { GameModeId } from './mode.js';
import type { BoardToken } from './squadron.js';

/**
 * The active moon context for a match. Magi spell power keys off this via the
 * data layer's moon effects (data-driven, so a phase's modifier is one number).
 */
export interface MoonContext {
  /** MoonTypeKey from data/dsl/moons.ts (Black/Red/White). */
  readonly type: string;
  /** MoonPhaseKey (Empty…FullMoon). */
  readonly phase: string;
}

/**
 * Complete, serializable snapshot of a match. The engine is a pure function
 * (state, action, rng) -> state over this type: no wall-clock, no I/O, and the RNG
 * is captured as `rngState` so replays and netcode reconciliation are exact.
 */
export interface MatchState {
  readonly modeId: GameModeId;
  readonly board: Board;
  readonly armies: readonly Army[];
  /** All deployed tokens across all sides. */
  readonly tokens: readonly BoardToken[];
  /** 1-based turn counter (increments after every side has acted). */
  readonly turn: number;
  readonly activeSide: Side;
  /**
   * The single token the active side has activated this turn (one-unit-per-turn rule).
   * Undefined until the side acts with a token; once set, only that token may act until the
   * turn passes (then it is cleared). This is what locks a side to one unit per turn.
   */
  readonly activatedTokenId?: string;
  readonly moon: MoonContext;
  /** Seeded RNG state snapshot (see ISeededRng.state()). */
  readonly rngState: number;
  readonly status: 'in-progress' | 'decided';
  /** Present only when status === 'decided'. */
  readonly winner?: Side | 'draw';
}
