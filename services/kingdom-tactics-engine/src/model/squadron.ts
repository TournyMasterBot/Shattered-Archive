import type { Coord, Side } from './coord.js';
import type { StatusEffect, Unit } from './unit.js';

/** A member group inside a squadron: N copies of one unit template. */
export interface SquadronMember {
  readonly templateId: string;
  readonly count: number;
}

/**
 * An aggregate board token representing many units as one (Battle-scale modes).
 * Its strength/HP are DERIVED from member UnitTemplates (see the data provider /
 * rules), so rebalancing a unit changes squadron strength automatically. A single
 * Unit is treated as a squadron of one, so rules can operate on either uniformly.
 */
export interface Squadron {
  readonly kind: 'squadron';
  readonly instanceId: string;
  readonly side: Side;
  readonly pos: Coord;
  readonly members: readonly SquadronMember[];
  /** Current aggregate hit-point pool. */
  readonly hpPool: number;
  readonly maxHpPool: number;
  readonly statuses: readonly StatusEffect[];
  /** True once this squadron has used its MOVE this turn (independent of hasActed). */
  readonly hasMoved: boolean;
  readonly hasActed: boolean;
}

/** Anything that occupies a board tile and can act. */
export type BoardToken = Unit | Squadron;
