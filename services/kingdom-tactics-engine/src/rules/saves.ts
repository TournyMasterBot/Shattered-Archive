import type { ISeededRng } from '../rng/index.js';

/**
 * Distilled from Server.Dsl/Calculators/SavesCalculator.cs (per Sephirot):
 *   LR = 100 - (WIS - INT)/2 - WIS/2 + saves*2 + BS*2
 * where INT = caster intelligence, WIS = target wisdom, BS = hidden base-save boost/gimp.
 *
 * USAGE (user decision 2026-07-05): damage spells AUTO-HIT and never call this. Maladictions
 * / debuffs roll `rollSave` to determine whether they land. A damage-spell-with-maladiction
 * is two-part: the damage applies unconditionally, the maladiction rolls here separately.
 *
 * Interpretation: LR is the percentage chance the effect LANDS on the target. A d100 roll
 * <= LR lands. (Higher caster INT and higher `saves` raise LR; higher target WIS lowers it.)
 */

/** The single tuning surface for spell save/landing math. */
export const SAVE_CONSTANTS = {
  /** Landing rate is clamped to this window so nothing auto-lands or auto-fails. */
  MIN: 5,
  MAX: 95,
  /** Die used for the roll (d100). */
  ROLL_SIDES: 100,
} as const;

export interface SaveInput {
  /** Caster's intelligence (raises landing rate). */
  readonly casterInt: number;
  /** Target's wisdom (lowers landing rate). */
  readonly targetWis: number;
  /** The maladiction's own save modifier (raises landing rate). */
  readonly saves?: number;
  /** Hidden base-save boost/gimp (BS in the formula). */
  readonly baseSave?: number;
}

export interface SaveResult {
  readonly landed: boolean;
  /** The d100 roll actually drawn (1..ROLL_SIDES). */
  readonly roll: number;
  /** The computed landing rate (clamped percentage). */
  readonly landingRate: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Compute the clamped landing-rate percentage for a maladiction (no RNG). */
export function landingRate(input: SaveInput): number {
  const saves = input.saves ?? 0;
  const bs = input.baseSave ?? 0;
  const lr =
    100 - (input.targetWis - input.casterInt) / 2 - input.targetWis / 2 + saves * 2 + bs * 2;
  return clamp(lr, SAVE_CONSTANTS.MIN, SAVE_CONSTANTS.MAX);
}

/**
 * Roll whether a maladiction lands. Draws a d100 from the seeded RNG (so replays are
 * exact); the effect lands when roll <= landingRate. Pure w.r.t. inputs; advances rng.
 */
export function rollSave(input: SaveInput, rng: ISeededRng): SaveResult {
  const lr = landingRate(input);
  const roll = rng.int(SAVE_CONSTANTS.ROLL_SIDES) + 1; // 1..100
  return { landed: roll <= lr, roll, landingRate: lr };
}
