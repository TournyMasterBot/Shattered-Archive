/**
 * HAND-AUTHORED faithful distillation of the DSL three-moon system
 * (Server.Dsl/Models/CalendarModels/Moon.cs). Krynn-style: THREE moons hang in the
 * sky at once, each governing one alignment and each cycling on its OWN clock, so the
 * three phases drift independently and never stay in lockstep. A caster is empowered
 * by the single moon whose alignment matches their own — White→Good, Red→Neutral,
 * Black→Evil — receiving that moon's current phase bonus.
 *
 * Pure data + pure functions (no provider/DOM/Node) — safe for the isomorphic engine.
 * Supersedes the legacy single-moon `moon-effects.ts` magi multiplier (still consumed
 * by rules/damage.ts); reconciling that into this model is a follow-up.
 */
import type { AlignmentKey } from '../dsl/alignment.js';
import type { MoonTypeKey, MoonPhaseKey, MoonPositionKey } from '../dsl/moons.js';

/** The three combat-relevant alignments a moon can govern (Mixed/none are unaligned). */
export type MoonAlignment = 'Good' | 'Neutral' | 'Evil';

export interface MoonDef {
  readonly type: MoonTypeKey;
  readonly alignment: MoonAlignment;
  /** DSL Moon.HoursPerPhase — how long this moon dwells in each phase. Distinct per
   * moon (Black 33 / Red 45 / White 54) so the three cycles run at different speeds. */
  readonly hoursPerPhase: number;
}

/** Each moon's alignment + cadence (DSL Moon.BlackMoon/RedMoon/WhiteMoon). */
export const MOONS = {
  Black: { type: 'Black', alignment: 'Evil', hoursPerPhase: 33 },
  Red: { type: 'Red', alignment: 'Neutral', hoursPerPhase: 45 },
  White: { type: 'White', alignment: 'Good', hoursPerPhase: 54 },
} as const satisfies Record<MoonTypeKey, MoonDef>;

/** The moon that empowers a given alignment (inverse of MoonDef.alignment). */
export const MOON_FOR_ALIGNMENT = {
  Good: 'White',
  Neutral: 'Red',
  Evil: 'Black',
} as const satisfies Record<MoonAlignment, MoonTypeKey>;

/**
 * Per-phase bonuses a moon confers on its aligned casters (DSL Moon.SetMoonPhase).
 * `savesBonus` follows the DSL convention where NEGATIVE is better (a caster's spells
 * are harder to save against): −3 at full moon. Mirrors the merit/imbue axes already
 * modeled in casting.ts — cast level and saves.
 */
export interface MoonPhaseBonus {
  readonly manaBonusPercent: number;
  readonly savesBonus: number;
  readonly castLevelBonus: number;
}

export const MOON_PHASE_BONUS = {
  Empty: { manaBonusPercent: 0, savesBonus: 0, castLevelBonus: 0 },
  Crescent: { manaBonusPercent: 5, savesBonus: -1, castLevelBonus: 1 },
  HalfMoon: { manaBonusPercent: 10, savesBonus: -2, castLevelBonus: 2 },
  ThreeQuartersMoon: { manaBonusPercent: 10, savesBonus: -2, castLevelBonus: 2 },
  FullMoon: { manaBonusPercent: 15, savesBonus: -3, castLevelBonus: 3 },
} as const satisfies Record<MoonPhaseKey, MoonPhaseBonus>;

/** The null bonus — an unaligned unit, or a moon with no matching alignment. */
export const NO_MOON_BONUS: MoonPhaseBonus = { manaBonusPercent: 0, savesBonus: 0, castLevelBonus: 0 };

/** Per-position mana-REGEN bonus (DSL Moon.SetMoonPosition). Independent of phase. */
export const MOON_POSITION_REGEN = {
  NotVisible: 0,
  Rising: 25,
  HighSanction: 50,
  Setting: 25,
} as const satisfies Record<MoonPositionKey, number>;

/**
 * The waxing→waning cycle a moon walks, one slot per `hoursPerPhase`. Empty…Full
 * (waxing) then Full…Empty (waning) = 8 slots; Empty and Full are the single turning
 * points. Moon.cs carries a Waxing/Waning Direction but no phase driver ships in
 * Server.Dsl, so this symmetric ordering is the documented KT assumption.
 */
export const MOON_PHASE_CYCLE = [
  'Empty',
  'Crescent',
  'HalfMoon',
  'ThreeQuartersMoon',
  'FullMoon',
  'ThreeQuartersMoon',
  'HalfMoon',
  'Crescent',
] as const satisfies readonly MoonPhaseKey[];

/** The phase of one moon at an absolute game-hour, advanced on that moon's own clock. */
export function moonPhaseAt(type: MoonTypeKey, gameHour: number): MoonPhaseKey {
  const moon = MOONS[type];
  const slot = Math.floor(gameHour / moon.hoursPerPhase);
  const len = MOON_PHASE_CYCLE.length;
  const idx = ((slot % len) + len) % len;
  return MOON_PHASE_CYCLE[idx]!;
}

/** A snapshot of all three moons' phases — the "sky" a match is fought under. */
export type MoonSky = Record<MoonTypeKey, MoonPhaseKey>;

/** The whole sky at a game-hour; each moon on its own clock ⇒ independent drift. */
export function moonSkyAt(gameHour: number): MoonSky {
  return {
    Black: moonPhaseAt('Black', gameHour),
    Red: moonPhaseAt('Red', gameHour),
    White: moonPhaseAt('White', gameHour),
  };
}

/**
 * The phase bonus a unit of the given alignment receives under a sky — drawn from the
 * ONE moon that governs its alignment. Unaligned units (Mixed/unknown) get nothing.
 */
export function moonBonusForAlignment(sky: MoonSky, alignment: AlignmentKey | MoonAlignment): MoonPhaseBonus {
  const moonType = (MOON_FOR_ALIGNMENT as Record<string, MoonTypeKey | undefined>)[alignment];
  return moonType ? MOON_PHASE_BONUS[sky[moonType]] : NO_MOON_BONUS;
}
