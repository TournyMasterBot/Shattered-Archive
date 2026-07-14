/**
 * HAND-AUTHORED tactical effects of distilled DSL racial abilities.
 *
 * AC scale + conversion: the DSL uses **AC where NEGATIVE is BETTER** armor (and many items store
 * the magnitude as a positive that really means negative). In the DSL, every ~10 AC ≈ 1% damage
 * reduction (100 AC ≈ 10%), i.e. mitigation ≈ |AC| / 1000. Kingdom Tactics' damage pipeline instead
 * forms `ac = defense + cover + armorAc` and mitigates by `ac / AC_DIVISOR` (see rules/damage.ts,
 * AC_DIVISOR = 40). So a DSL AC delta `a` (negative = better) equals a KT `defense` delta of
 * `-a × (AC_DIVISOR / 1000)`. Dwarven Toughness (-25 AC ⇒ ~2.5% reduction) therefore maps to +1 KT
 * defense. (KT's model adds `defense` alongside the armor-type term rather than multiplying by it as
 * the DSL raw calc does; magnitudes here are the grid-scaled translation and are tunable.)
 */

/** Keep in sync with DAMAGE_CONSTANTS.AC_DIVISOR (rules/damage.ts). Duplicated to avoid a data→rules cycle. */
const KT_AC_DIVISOR = 40;

/** Convert a DSL AC delta (negative = better armor) into a KT `defense` delta (higher = better). */
export function ktDefenseFromDslAc(dslAc: number): number {
  return Math.round(-dslAc * (KT_AC_DIVISOR / 1000));
}

export interface RacialAbilityEffect {
  /** Tag added to the resolved unit's `traits` (surfaced in the builder). */
  readonly trait?: string;
  /** DSL AC delta this represents (NEGATIVE = better armor); converted to KT defense on resolve. */
  readonly dslAcDelta?: number;
  /** Direct KT defense delta for effects not expressed as DSL AC. */
  readonly defenseDelta?: number;
}

/**
 * Effect of a distilled DSL racial-ability type name (from `RaceAttributes.racialAbilities`).
 * Only abilities with a tactical translation appear; others (flavor/utility) are ignored.
 */
export const RACIAL_ABILITY_EFFECTS: Record<string, RacialAbilityEffect> = {
  // Dwarven Toughness — DSL grants -25 AC (better armor) ⇒ +1 KT defense (~2.5% reduction).
  Toughness: { trait: 'toughness', dslAcDelta: -25 },
};

/** All elf race keys end in "Elf" (ShalonestiElf, DarkElf, WildElf, SeaElf, HalfElf). */
export function isElfRace(raceKey: string): boolean {
  return /elf$/i.test(raceKey);
}

/** Summed KT defense contribution of a race's distilled racial abilities (AC-derived + direct). */
export function racialAbilityDefenseDelta(racialAbilities: readonly string[]): number {
  return racialAbilities.reduce((sum, key) => {
    const e = RACIAL_ABILITY_EFFECTS[key];
    if (!e) return sum;
    return sum + (e.dslAcDelta !== undefined ? ktDefenseFromDslAc(e.dslAcDelta) : 0) + (e.defenseDelta ?? 0);
  }, 0);
}

/** Trait tags contributed by a race's distilled racial abilities (e.g. ['toughness']). */
export function racialAbilityTraits(racialAbilities: readonly string[]): string[] {
  return racialAbilities
    .map((key) => RACIAL_ABILITY_EFFECTS[key]?.trait)
    .filter((t): t is string => Boolean(t));
}
