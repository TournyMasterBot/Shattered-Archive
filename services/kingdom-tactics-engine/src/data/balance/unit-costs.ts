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

// ---------------------------------------------------------------------------
// Class-tier point cost (army-building budget) — the SOURCE OF TRUTH for a unit's
// deployment cost. Base classes are a flat entry price; reclasses cost more, scaled
// from the DSL character-point tier (`BaseCpModifier`). This replaces the stat-derived
// price for budgeting so the builder tree can show one clean cost per class, and so
// "a base class always costs 10" holds regardless of race/stat tuning.
// ---------------------------------------------------------------------------

/** Flat point cost of any base (non-reclass) class. */
export const BASE_CLASS_POINTS = 10;
/** Minimum points a reclass adds over a base class (so every reclass is strictly pricier). */
export const RECLASS_MIN_SURCHARGE = 2;
/** Points added per unit of DSL `BaseCpModifier` for a reclass (0→floor, 3→+6, 6→+12, …). */
export const RECLASS_CP_WEIGHT = 2;

export interface ClassCostInputs {
  /** Whether the class is a reclass (DSL `IsRecass`); base classes are the flat price. */
  readonly isReclass: boolean;
  /** DSL `BaseCpModifier` character-point tier (base=0, standard reclass=3, advanced/CSR higher). */
  readonly baseCpModifier: number | null;
}

/**
 * Army-building point cost of a class by tier. Base classes are {@link BASE_CLASS_POINTS};
 * reclasses add a surcharge derived from the DSL `BaseCpModifier`, floored by
 * {@link RECLASS_MIN_SURCHARGE} so a reclass always outprices a base class even when its CP tier is 0.
 */
export function classPointCost({ isReclass, baseCpModifier }: ClassCostInputs): number {
  if (!isReclass) return BASE_CLASS_POINTS;
  const cp = baseCpModifier ?? 0;
  const surcharge = Math.max(RECLASS_MIN_SURCHARGE, Math.round(cp * RECLASS_CP_WEIGHT));
  return BASE_CLASS_POINTS + surcharge;
}
