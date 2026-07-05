/** Pure rules resolvers. Phase 1 seeded squadron aggregation; Phase 2 adds movement,
 * line-of-sight, attack/damage, terrain, turn order, and victory. */
export {
  type SquadronStats,
  templateForMember,
  aggregateSquadron,
} from './squadron.js';

export {
  coordKey,
  coordEquals,
  inBounds,
  tileAt,
  tokenAt,
  occupiedKeys,
  chebyshev,
  manhattan,
  stepOffsets,
  ORTHOGONAL,
  DIAGONAL,
  OMNI,
  KNIGHT,
} from './board.js';

export { type MovementProfile, movementProfile, legalMoves } from './movement.js';

export { hasLineOfSight, tilesOnLine } from './line-of-sight.js';
export { turnOrder, nextActiveSide } from './turn-order.js';
export { evaluateVictory } from './victory.js';
export { legalTargets, splashTargets, attackProfile, inAttackPattern } from './targeting.js';
export {
  resolveDamage,
  DAMAGE_CONSTANTS,
  type DamageInput,
  type DamageResult,
} from './damage.js';
export {
  landingRate,
  rollSave,
  SAVE_CONSTANTS,
  type SaveInput,
  type SaveResult,
} from './saves.js';
export { applyAttack, applyAbility, type AbilitySpec } from './attack.js';
