import { aurasFor, auraFilterMatches, reactivesFor, shieldsFor, AURA_CATALOG } from './auras.js';

describe('aura catalog lookups', () => {
  it('resolves a known key to its spec and ignores unknown keys', () => {
    const specs = aurasFor(['shield-magic', 'not-an-aura']);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toEqual(AURA_CATALOG['shield-magic']);
  });

  it('separates shielding from reactive auras', () => {
    const keys = ['shield-magic', 'thorns', 'ward-fire'];
    expect(shieldsFor(keys).map((a) => a.key).sort()).toEqual(['shield-magic', 'ward-fire']);
    expect(reactivesFor(keys).map((a) => a.key)).toEqual(['thorns']);
  });
});

describe('auraFilterMatches', () => {
  it('magic filter matches a magic damage type but not a physical one', () => {
    expect(auraFilterMatches('magic', 'Flame')).toBe(true);
    expect(auraFilterMatches('magic', 'Slash')).toBe(false);
  });

  it('elemental filter matches its own group only', () => {
    expect(auraFilterMatches('fire', 'Flame')).toBe(true);
    expect(auraFilterMatches('cold', 'Flame')).toBe(false);
  });

  it("'all' matches everything", () => {
    expect(auraFilterMatches('all', 'Slash')).toBe(true);
    expect(auraFilterMatches('all', 'Flame')).toBe(true);
  });
});
