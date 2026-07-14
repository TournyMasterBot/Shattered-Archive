import {
  isLegalRaceClass,
  legalClassesForRace,
  legalRacesForClass,
  type RaceClassContext,
} from './legality.js';

describe('isLegalRaceClass — race/class restriction semantics', () => {
  it('allows an unrestricted base race/class', () => {
    expect(isLegalRaceClass('Human', 'Warrior')).toBe(true);
  });

  it('forbids a race listed in the class raceRestrictions (FORBID list)', () => {
    // Warrior forbids only Pixie.
    expect(isLegalRaceClass('Pixie', 'Warrior')).toBe(false);
    expect(isLegalRaceClass('Human', 'Warrior')).toBe(true);
  });

  it('rejects an unknown class', () => {
    expect(isLegalRaceClass('Human', 'NotAClass')).toBe(false);
  });
});

describe('isLegalRaceClass — CSR allegiance gating (single per-team allegiance)', () => {
  const conclave: RaceClassContext = { allegianceKey: 'Conclave' };

  it('gates a CSR class OUT with no allegiance', () => {
    expect(isLegalRaceClass('Human', 'Battlemage')).toBe(false);
  });

  it('allows a CSR class when the team allegiance is one it requires', () => {
    expect(isLegalRaceClass('Human', 'Battlemage', conclave)).toBe(true);
  });

  it('still forbids a CSR class for a race in its raceRestrictions, even with allegiance', () => {
    // Battlemage forbids Kender.
    expect(isLegalRaceClass('Kender', 'Battlemage', conclave)).toBe(false);
  });

  it('does not allow a CSR class when the team has the wrong allegiance', () => {
    expect(isLegalRaceClass('Human', 'Battlemage', { allegianceKey: 'Knighthood' })).toBe(false);
  });

  it('allows a CSR class with no allegiance requirement for any team (Monk)', () => {
    // Monk is CSR but declares no required allegiance — ungated by allegiance…
    expect(isLegalRaceClass('Human', 'Monk')).toBe(true);
    expect(isLegalRaceClass('Human', 'Monk', { allegianceKey: 'Loner' })).toBe(true);
    // …but its raceRestrictions still apply (Monk forbids Kender).
    expect(isLegalRaceClass('Kender', 'Monk')).toBe(false);
  });
});

describe('isLegalRaceClass — requiresRaces ALLOW list', () => {
  const shalonesti: RaceClassContext = { allegianceKey: 'ShalonestiClan' };

  it('permits only the allowed races even with a satisfying allegiance', () => {
    // Bladesinger requires an elf subrace (ShalonestiElf/HalfElf/WildElf/SeaElf).
    expect(isLegalRaceClass('ShalonestiElf', 'Bladesinger', shalonesti)).toBe(true);
    expect(isLegalRaceClass('Human', 'Bladesinger', shalonesti)).toBe(false);
  });

  it('still requires the allegiance for an allowed race', () => {
    expect(isLegalRaceClass('ShalonestiElf', 'Bladesinger')).toBe(false);
  });
});

describe('isLegalRaceClass — allegiance gate covers rolled-up religion (Runesmith)', () => {
  it('is gated by allegiance alone; the DSL god requirement is folded in', () => {
    // Runesmith: allegiances Wargar/Thaxanos, races Hill/MountainDwarf (god Cliath rolled up).
    expect(isLegalRaceClass('MountainDwarf', 'Runesmith', { allegianceKey: 'Wargar' })).toBe(true);
    // Wrong race.
    expect(isLegalRaceClass('Human', 'Runesmith', { allegianceKey: 'Wargar' })).toBe(false);
    // No allegiance.
    expect(isLegalRaceClass('MountainDwarf', 'Runesmith')).toBe(false);
  });
});

describe('legalClassesForRace / legalRacesForClass', () => {
  it('a Pixie cannot be a Warrior', () => {
    expect(legalClassesForRace('Pixie')).not.toContain('Warrior');
    expect(legalClassesForRace('Human')).toContain('Warrior');
  });

  it('CSR classes appear only when the allegiance allows', () => {
    expect(legalClassesForRace('Human')).not.toContain('Battlemage');
    expect(legalClassesForRace('Human', { allegianceKey: 'Conclave' })).toContain('Battlemage');
  });

  it('Warrior is legal for many races but never Pixie', () => {
    const races = legalRacesForClass('Warrior');
    expect(races).toContain('Human');
    expect(races).not.toContain('Pixie');
  });
});
