import { combatSeed, createCombatRng } from './combat-rng.js';

function sequence(salt: number, step: number, n = 5): number[] {
  const rng = createCombatRng(salt, step);
  return Array.from({ length: n }, () => rng.next());
}

describe('createCombatRng (salted, step-counted, replayable)', () => {
  it('same salt + step reproduces the same sequence', () => {
    expect(sequence(12345, 7)).toEqual(sequence(12345, 7));
  });

  it('a different step diverges', () => {
    expect(sequence(12345, 7)).not.toEqual(sequence(12345, 8));
  });

  it('a different salt diverges', () => {
    expect(sequence(12345, 7)).not.toEqual(sequence(99999, 7));
  });

  it('combatSeed is a pure uint32 mix', () => {
    const seed = combatSeed(12345, 7);
    expect(seed).toBe(combatSeed(12345, 7));
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(seed)).toBe(true);
  });
});
