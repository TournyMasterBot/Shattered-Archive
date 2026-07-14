import type { Side } from './coord.js';

/**
 * A general's force metadata for one side. The deployed tokens themselves live in
 * MatchState.tokens (keyed by side); Army holds the roster-level info: which side,
 * a display name, and the deployment budget the army was built under.
 */
export interface Army {
  readonly side: Side;
  readonly name?: string;
  /** Budget this army was built against (points or unit count per the mode). */
  readonly budget: number;
}
