import {
  MOONS,
  MOON_FOR_ALIGNMENT,
  MOON_PHASE_BONUS,
  MOON_POSITION_REGEN,
  NO_MOON_BONUS,
  moonPhaseAt,
  moonSkyAt,
  moonBonusForAlignment,
} from './moons.js';

describe('moons — three-moon alignment model (DSL Moon.cs)', () => {
  it('maps each moon to its governed alignment + distinct cadence', () => {
    expect(MOONS.White.alignment).toBe('Good');
    expect(MOONS.Red.alignment).toBe('Neutral');
    expect(MOONS.Black.alignment).toBe('Evil');
    // Distinct cycle lengths — the three moons never stay in lockstep.
    expect(MOONS.Black.hoursPerPhase).toBe(33);
    expect(MOONS.Red.hoursPerPhase).toBe(45);
    expect(MOONS.White.hoursPerPhase).toBe(54);
    expect(new Set([33, 45, 54]).size).toBe(3);
  });

  it('inverse alignment→moon lookup is consistent', () => {
    expect(MOON_FOR_ALIGNMENT.Good).toBe('White');
    expect(MOON_FOR_ALIGNMENT.Neutral).toBe('Red');
    expect(MOON_FOR_ALIGNMENT.Evil).toBe('Black');
    for (const type of ['Black', 'Red', 'White'] as const) {
      expect(MOON_FOR_ALIGNMENT[MOONS[type].alignment]).toBe(type);
    }
  });

  it('carries the DSL per-phase cast/saves/mana bonuses', () => {
    expect(MOON_PHASE_BONUS.FullMoon).toEqual({ manaBonusPercent: 15, savesBonus: -3, castLevelBonus: 3 });
    expect(MOON_PHASE_BONUS.Empty).toEqual({ manaBonusPercent: 0, savesBonus: 0, castLevelBonus: 0 });
    // saves are negative-is-better and strengthen toward full moon.
    expect(MOON_PHASE_BONUS.Crescent.savesBonus).toBe(-1);
    expect(MOON_PHASE_BONUS.FullMoon.savesBonus).toBeLessThan(MOON_PHASE_BONUS.Crescent.savesBonus);
  });

  it('position drives only mana regen (HighSanction best)', () => {
    expect(MOON_POSITION_REGEN.HighSanction).toBe(50);
    expect(MOON_POSITION_REGEN.Rising).toBe(25);
    expect(MOON_POSITION_REGEN.Setting).toBe(25);
    expect(MOON_POSITION_REGEN.NotVisible).toBe(0);
  });

  it('advances each moon on its own clock (independent drift)', () => {
    // At hour 0 every moon is Empty (cycle slot 0).
    expect(moonPhaseAt('Black', 0)).toBe('Empty');
    expect(moonPhaseAt('White', 0)).toBe('Empty');
    // Black (33h/phase) has waxed all the way to Full by hour 132 (slot 4)…
    expect(moonPhaseAt('Black', 33 * 4)).toBe('FullMoon');
    // …while the slower White (54h/phase) is only on HalfMoon (slot floor(132/54)=2) — they diverge.
    expect(moonPhaseAt('White', 33 * 4)).toBe('HalfMoon');
    expect(moonSkyAt(33 * 4).Black).not.toBe(moonSkyAt(33 * 4).White);
  });

  it('waning half of the cycle revisits the mid phases', () => {
    // Slot 5 of Black = ThreeQuartersMoon on the waning side.
    expect(moonPhaseAt('Black', 33 * 5)).toBe('ThreeQuartersMoon');
    // Slot 8 wraps back to Empty.
    expect(moonPhaseAt('Black', 33 * 8)).toBe('Empty');
  });

  it('grants a unit the bonus of the moon matching its alignment only', () => {
    const sky = { Black: 'FullMoon', Red: 'Empty', White: 'Crescent' } as const;
    // Evil unit rides the Black (full) moon.
    expect(moonBonusForAlignment(sky, 'Evil')).toEqual(MOON_PHASE_BONUS.FullMoon);
    // Good unit rides the White (crescent) moon.
    expect(moonBonusForAlignment(sky, 'Good')).toEqual(MOON_PHASE_BONUS.Crescent);
    // Neutral rides the Red (empty) moon — no help right now.
    expect(moonBonusForAlignment(sky, 'Neutral')).toEqual(MOON_PHASE_BONUS.Empty);
    // Unaligned (Mixed) units are moon-agnostic.
    expect(moonBonusForAlignment(sky, 'Mixed')).toBe(NO_MOON_BONUS);
  });
});
