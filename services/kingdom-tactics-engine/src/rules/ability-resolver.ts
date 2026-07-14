/**
 * Bridges authored AbilityMechanics (data layer) into the castable AbilitySpec the combat path
 * consumes, and builds the `abilityResolver` the reducer expects. Lives in rules/ because it
 * produces a rules type (AbilitySpec); the registry + resolution stay model-only in
 * data/balance/abilities/.
 */
import type { AbilityMechanics, StatusEffect } from '../model/index.js';
import { resolveAbilityMechanics } from '../data/index.js';
import type { AbilitySpec } from './attack.js';

/** Map a standardized AbilityMechanics into the AbilitySpec applyAbility understands.
 * A stub (no damage/maladiction/buff) becomes a spec with only a key → applyAbility marks the
 * caster acted with no effect. v1 note: `damage.damageType` is informational — the combat path
 * uses the caster's own damageType; potency becomes the damage multiplier. */
export function toAbilitySpec(m: AbilityMechanics): AbilitySpec {
  const spec: {
    key: string;
    damage?: boolean;
    damageScale?: number;
    maladiction?: AbilitySpec['maladiction'];
    buff?: AbilitySpec['buff'];
    heal?: AbilitySpec['heal'];
  } = { key: m.key };

  if (m.damage) {
    spec.damage = true;
    spec.damageScale = m.damage.potency;
  }
  if (m.maladiction) {
    const status: StatusEffect = {
      key: m.maladiction.statusKey,
      remaining: m.maladiction.duration,
      ...(m.maladiction.potency !== undefined ? { magnitude: m.maladiction.potency } : {}),
    };
    spec.maladiction = {
      status,
      ...(m.maladiction.saves !== undefined ? { saves: m.maladiction.saves } : {}),
      ...(m.maladiction.baseSave !== undefined ? { baseSave: m.maladiction.baseSave } : {}),
    };
  }
  if (m.buff) spec.buff = m.buff;
  if (m.heal) spec.heal = m.heal;

  return spec;
}

/** The engine's `abilityResolver` seam: turns an ability key into a castable AbilitySpec,
 * falling back to a no-op stub for any not-yet-authored ability. */
export function createAbilityResolver(): (key: string) => AbilitySpec {
  return (key) => toAbilitySpec(resolveAbilityMechanics(key));
}
