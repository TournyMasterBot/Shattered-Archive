import { ABILITIES, ABILITY_GROUPS } from './abilities.js';
import { createGameDataProvider } from '../index.js';

describe('DSL ability catalog', () => {
  it('has unique ability keys and non-empty names', () => {
    const keys = new Set<string>();
    for (const a of ABILITIES) {
      expect(a.key).not.toBe('');
      expect(a.name).not.toBe('');
      expect(keys.has(a.key)).toBe(false);
      keys.add(a.key);
    }
    expect(keys.size).toBe(ABILITIES.length);
  });

  it('partitions cleanly into the three ability types', () => {
    const by = { skill: 0, spell: 0, song: 0 } as Record<string, number>;
    for (const a of ABILITIES) {
      expect(['skill', 'spell', 'song']).toContain(a.type);
      by[a.type] += 1;
    }
    // Snapshot of the current DSL distillation (regenerate via `pnpm codegen`
    // and update if the DSL ability source legitimately changes).
    expect(by.spell).toBe(363);
    expect(by.song).toBe(40);
    expect(by.skill).toBe(259);
    expect(by.spell + by.song + by.skill).toBe(ABILITIES.length);
    expect(ABILITIES.length).toBe(662);
  });

  it('has no dangling group member keys', () => {
    const known = new Set(ABILITIES.map((a) => a.key));
    for (const g of ABILITY_GROUPS) {
      for (const k of g.abilityKeys) {
        expect(known.has(k)).toBe(true);
      }
    }
    expect(ABILITY_GROUPS.length).toBeGreaterThan(100);
  });

  it('resolves the Combat group to its declared members (direct refs)', () => {
    const combat = ABILITY_GROUPS.find((g) => g.key === 'Combat');
    expect(combat).toBeDefined();
    expect(combat?.abilityKeys).toContain('AcidBlast');
    expect(combat?.abilityKeys).toContain('Fireball');
    expect(combat?.abilityKeys).toContain('MagicMissile');
  });

  it('resolves transitive group-of-group membership', () => {
    // InvokerDefault pulls in Combat/Detection/Transportation via GetAbilitiesByType<>.
    const invoker = ABILITY_GROUPS.find((g) => g.key === 'InvokerDefault');
    expect(invoker).toBeDefined();
    expect(invoker?.abilityKeys).toContain('AcidBlast'); // from Combat
    expect(invoker?.abilityKeys).toContain('Astrology'); // direct member
  });
});

describe('GameDataProvider ability lookups', () => {
  const p = createGameDataProvider();

  it('exposes the full catalog', () => {
    expect(p.abilities()).toBe(ABILITIES);
    expect(p.abilityGroups()).toBe(ABILITY_GROUPS);
  });

  it('looks up a single ability by key', () => {
    const acid = p.ability('AcidBlast');
    expect(acid?.name).toBe('Acid Blast');
    expect(acid?.type).toBe('spell');
    expect(p.ability('NoSuchAbility')).toBeUndefined();
  });

  it('returns resolved ability rows for a group', () => {
    const members = p.abilitiesForGroup('Combat');
    expect(members.length).toBeGreaterThan(0);
    expect(members.map((a) => a.name)).toContain('Acid Blast');
    expect(members.every((a) => a.type === 'spell')).toBe(true);
    expect(p.abilitiesForGroup('NoSuchGroup')).toEqual([]);
  });
});
