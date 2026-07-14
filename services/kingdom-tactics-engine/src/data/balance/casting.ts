/**
 * HAND-AUTHORED caster-level model. In the DSL a unit's spells resolve at a **caster level**: a
 * class that "casts at level" casts as its own level (the cap, {@link LEVEL_CAP}); a class that casts
 * BELOW level (DSL `CastsAtLevel=false`) casts as `level × CastingLevelModifier` (e.g. a Warrior at
 * 0.5 casts as a ~half-level caster). Additive caster-level bonuses then stack on top:
 *
 * - **elf** blood → +1 caster level,
 * - a **class affinity** for the race → +1 caster level. NOTE: affinity is a DISTINCT concept from
 *   the race's damage **boosts/gimps** (`classBoosts`); it is not yet distilled, so callers pass
 *   `hasClassAffinity: false` for now. Wire it in when a real affinity source is distilled.
 *
 * In-match sources add more at cast time and are NOT baked into the template: e.g. the `imbue` spell
 * grants +3 caster level. (Saves are a separate axis — some merits like magical resistance grant
 * negative saves, which are GOOD; modeled with the saves system, not here.)
 *
 * castingLevel is notional until ability scaling consumes it, but it is resolved now so army building
 * can surface it and future spell mechanics can key off one number.
 */

/** Nominal max unit level (DSL level cap). A unit "casting at level" casts as this level. */
export const LEVEL_CAP = 51;
/** Caster-level bonus for a race that has a positive class affinity for the chosen class. */
export const AFFINITY_CASTING_BONUS = 1;
/** Caster-level bonus every elf race receives (authored — not present in DSL race data). */
export const ELF_CASTING_BONUS = 1;

export interface CastingInputs {
  /** DSL `CastsAtLevel` (null ⇒ casts at level). */
  readonly castsAtLevel: boolean | null;
  /** DSL `CastingLevelModifier` — fraction of level a below-level caster casts at. */
  readonly castingLevelModifier: number | null;
  /** The race has a class affinity for this class (+1 caster level). Distinct from damage
   * boosts/gimps; not yet distilled, so callers currently pass false. */
  readonly hasClassAffinity: boolean;
  /** The race is an elf (+1 caster level). */
  readonly isElf: boolean;
}

/**
 * Effective caster LEVEL of a (race × class): `round(LEVEL_CAP × castFactor)` plus additive
 * affinity (+1) and elf (+1) bonuses. `castFactor` is 1 when the class casts at level, else its
 * `CastingLevelModifier` (DSL `CastsAtLevel=false`). Never below 1.
 */
export function computeCastingLevel(inp: CastingInputs): number {
  const castFactor = inp.castsAtLevel === false ? (inp.castingLevelModifier ?? 1) : 1;
  const base = Math.round(LEVEL_CAP * castFactor);
  const bonus =
    (inp.hasClassAffinity ? AFFINITY_CASTING_BONUS : 0) + (inp.isElf ? ELF_CASTING_BONUS : 0);
  return Math.max(1, base + bonus);
}
