/**
 * HAND-AUTHORED moon influence on magi. Spell power scales with the active moon
 * phase — a first-class, data-driven modifier (see docs/ARCHITECTURE.md §5). Keyed
 * by the MoonPhaseKey from data/dsl/moons.ts.
 */
export interface MoonModifier {
  readonly phase: string;
  /** Multiplier applied to a magi unit's attackPower when this phase is active. */
  readonly magiSpellPowerMultiplier: number;
}

export const MOON_EFFECTS: Record<string, MoonModifier> = {
  Empty: { phase: 'Empty', magiSpellPowerMultiplier: 0.5 },
  Crescent: { phase: 'Crescent', magiSpellPowerMultiplier: 0.8 },
  HalfMoon: { phase: 'HalfMoon', magiSpellPowerMultiplier: 1.0 },
  ThreeQuartersMoon: { phase: 'ThreeQuartersMoon', magiSpellPowerMultiplier: 1.25 },
  FullMoon: { phase: 'FullMoon', magiSpellPowerMultiplier: 1.5 },
};

/** Neutral effect when a phase has no authored entry. */
export const DEFAULT_MOON_EFFECT: MoonModifier = { phase: '', magiSpellPowerMultiplier: 1.0 };
