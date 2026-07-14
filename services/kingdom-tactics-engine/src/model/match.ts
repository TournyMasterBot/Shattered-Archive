import type { Army } from './army.js';
import type { Board } from './board.js';
import type { Side } from './coord.js';
import type { GameModeId } from './mode.js';
import type { BoardToken } from './squadron.js';

/**
 * The three-moon sky a match is fought under. All THREE moons hang at once, each
 * governing one alignment (White→Good, Red→Neutral, Black→Evil) and running on its own
 * clock, so their phases drift independently (DSL Moon.cs). A caster is empowered by the
 * single moon matching its alignment — see data/balance/moons.ts (moonBonusForAlignment)
 * and how rules/damage.ts scales magi spell power off the caster's own moon.
 */
export interface MoonContext {
  /** Absolute game-hour the match is set at; each moon's phase derives from it (own cadence). */
  readonly gameHour: number;
  /** Each moon's current phase (MoonPhaseKey Empty…FullMoon), keyed by MoonTypeKey. */
  readonly sky: {
    readonly Black: string;
    readonly Red: string;
    readonly White: string;
  };
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
