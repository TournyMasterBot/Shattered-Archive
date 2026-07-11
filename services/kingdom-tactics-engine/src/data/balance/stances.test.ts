import {
  STANCES,
  stanceMod,
  stancesForClass,
  isStanceLegalFor,
  type StanceKey,
} from './stances.js';

describe('stances catalog', () => {
  it('normal is a true no-op (all modifiers zero)', () => {
    const n = STANCES.normal;
    expect(n.toHitMod).toBe(0);
    expect(n.evasionMod).toBe(0);
    expect(n.damageDealtMod).toBe(0);
    expect(n.damageTakenMod).toBe(0);
    expect(n.classKey).toBeUndefined();
  });

  it('offensive and defensive are mirror-signed and general (no class gate)', () => {
    expect(STANCES.offensive.toHitMod).toBeGreaterThan(0);
    expect(STANCES.offensive.evasionMod).toBeLessThan(0);
    expect(STANCES.defensive.toHitMod).toBeLessThan(0);
    expect(STANCES.defensive.evasionMod).toBeGreaterThan(0);
    expect(STANCES.offensive.classKey).toBeUndefined();
    expect(STANCES.defensive.classKey).toBeUndefined();
  });

  it('stanceMod defaults unknown/missing to normal', () => {
    expect(stanceMod(undefined)).toBe(STANCES.normal);
    expect(stanceMod('not-a-stance' as StanceKey)).toBe(STANCES.normal);
    expect(stanceMod('offensive')).toBe(STANCES.offensive);
  });
});

describe('class gating', () => {
  it('the Brewmaster stances are gated to Brewmaster', () => {
    for (const key of ['drunken-monkey', 'sloshing', 'cripple'] as StanceKey[]) {
      expect(STANCES[key].classKey).toBe('Brewmaster');
      expect(isStanceLegalFor(key, 'Warrior')).toBe(false);
      expect(isStanceLegalFor(key, 'Brewmaster')).toBe(true);
    }
  });

  it('general stances are legal for any class', () => {
    for (const key of ['normal', 'offensive', 'defensive'] as StanceKey[]) {
      expect(isStanceLegalFor(key, 'Warrior')).toBe(true);
      expect(isStanceLegalFor(key, 'Brewmaster')).toBe(true);
    }
  });

  it('stancesForClass yields general stances for a plain class, plus specials for Brewmaster', () => {
    const warrior = stancesForClass('Warrior').map((s) => s.key);
    expect(warrior).toEqual(expect.arrayContaining(['normal', 'offensive', 'defensive']));
    expect(warrior).not.toContain('drunken-monkey');

    const brew = stancesForClass('Brewmaster').map((s) => s.key);
    expect(brew).toEqual(
      expect.arrayContaining(['normal', 'offensive', 'defensive', 'drunken-monkey', 'sloshing', 'cripple']),
    );
  });
});
