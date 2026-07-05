/**
 * HAND-AUTHORED deployment-cost model. Rather than a hand-maintained price per unit
 * (which would drift from stats), a unit's cost is DERIVED from its resolved power,
 * so rebalancing stats automatically re-prices the unit. Single source of truth for
 * army-building budgets.
 */
export interface CostWeights {
  readonly base: number;
  readonly perMaxHp: number;
  readonly perAttackPower: number;
  readonly perDefense: number;
  readonly perMoveRange: number;
}

export const COST_WEIGHTS: CostWeights = {
  base: 1,
  perMaxHp: 0.1,
  perAttackPower: 0.5,
  perDefense: 0.3,
  perMoveRange: 0.4,
};

/** Inputs the cost derives from (a subset of the resolved UnitTemplate). */
export interface CostInputs {
  readonly maxHp: number;
  readonly attackPower: number;
  readonly defense: number;
  readonly moveRange: number;
}

export function computeUnitCost(u: CostInputs, weights: CostWeights = COST_WEIGHTS): number {
  const raw =
    weights.base +
    u.maxHp * weights.perMaxHp +
    u.attackPower * weights.perAttackPower +
    u.defense * weights.perDefense +
    u.moveRange * weights.perMoveRange;
  return Math.max(1, Math.round(raw));
}
