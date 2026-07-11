import type { UnitTemplate } from '../../model/index.js';
import type { ISeededRng } from '../../rng/index.js';

/**
 * Authored, grid-scaled avoidance tuning — dodge / parry / shield-block. The DSL has no clean
 * avoidance calculator (SavesCalculator is spells-only), so these are new balance constants, the
 * single tuning surface for automatic defenses (mirrors the DAMAGE_CONSTANTS pattern). Changing a
 * value here flows through every hooked match/sim. Chances are probabilities in [0, 1].
 */
export const DEFENSE_CONSTANTS = {
  /** Flat dodge floor before dexterity scaling. */
  BASE_DODGE: 0.05,
  /** Added dodge per point of dexterity above the baseline (may be negative below it). */
  DODGE_PER_DEX: 0.01,
  DEX_BASELINE: 10,
  /** Dodge is capped here regardless of dex. */
  MAX_DODGE: 0.45,
  /** Flat parry chance (weapon deflection); v1 keeps it stat-independent. */
  BASE_PARRY: 0.05,
  /** Shield-block chance by distilled armor type (heavier armor blocks more). */
  BLOCK_BY_ARMOR: {
    Cloth: 0,
    Leather: 0.05,
    Studded: 0.08,
    Chain: 0.12,
    Plate: 0.2,
  } as Readonly<Record<string, number>>,
  /** Combined avoidance is capped here so nothing is un-hittable. */
  MAX_AVOID: 0.75,
} as const;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Dodge probability from a template's dexterity, clamped. */
export function dodgeChance(template: UnitTemplate): number {
  const C = DEFENSE_CONSTANTS;
  return clamp(C.BASE_DODGE + (template.stats.dex - C.DEX_BASELINE) * C.DODGE_PER_DEX, 0, C.MAX_DODGE);
}

/** Flat parry probability (v1). */
export function parryChance(_template: UnitTemplate): number {
  return DEFENSE_CONSTANTS.BASE_PARRY;
}

/** Shield-block probability from the template's armor type. */
export function blockChance(template: UnitTemplate): number {
  return DEFENSE_CONSTANTS.BLOCK_BY_ARMOR[template.armorType] ?? 0;
}

/**
 * The combined probability the attack is avoided by ANY of dodge/parry/block — the complement of
 * all three failing — capped at MAX_AVOID. For telemetry/tests; the actual roll is `rollAvoidance`.
 */
export function avoidChance(template: UnitTemplate): number {
  const missAll = (1 - dodgeChance(template)) * (1 - parryChance(template)) * (1 - blockChance(template));
  return clamp(1 - missAll, 0, DEFENSE_CONSTANTS.MAX_AVOID);
}

/**
 * Roll dodge → parry → block in order against the seeded stream; the first success avoids the
 * attack. Deterministic given the same `rng` state (drives the server-only salted combat stream).
 * Melee gating is the caller's concern (spells skip avoidance by default).
 *
 * `avoidMod` (default 0) is a situational shift — e.g. the net of the defender's stance evasion and
 * the attacker's stance to-hit — folded into the dodge chance. It is intentionally applied WITHOUT
 * changing the number of `rng.next()` draws (still exactly 3), so the salted-stream step count and
 * every existing replay stay identical when `avoidMod` is 0.
 */
export function rollAvoidance(template: UnitTemplate, rng: ISeededRng, avoidMod = 0): boolean {
  const dodge = clamp(dodgeChance(template) + avoidMod, 0, DEFENSE_CONSTANTS.MAX_AVOID);
  if (rng.next() < dodge) return true;
  if (rng.next() < parryChance(template)) return true;
  if (rng.next() < blockChance(template)) return true;
  return false;
}
