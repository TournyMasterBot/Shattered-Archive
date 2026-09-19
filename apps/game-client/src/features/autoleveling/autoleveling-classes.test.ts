// apps/game-client/src/features/autoleveling/autoleveling-classes.test.ts

import type { AutoPilotClass } from './autoleveling-content-types';
import { memoryKvStore } from './autoleveling-idb';
import {
  __setClassStoreForTests,
  abilitiesForClass,
  classByName,
  classNames,
  classOffensiveAbilities,
  getClassCatalog,
  getClassCatalogCached,
} from './autoleveling-classes';

const CLERIC: AutoPilotClass = {
  name: 'Cleric',
  mortalClass: 110,
  isReclass: false,
  classGroup: 'Cleric',
  abilities: [
    { name: 'Armor', type: 'spell', level: 2, groups: ['Protective'] },
    { name: 'Kick', type: 'skill', level: 12, groups: [] },
    { name: 'Cause Critical', type: 'spell', level: 13, groups: ['Harmful'] },
    { name: 'Sanctuary', type: 'spell', level: 20, groups: ['Protective'] },
    { name: 'Harm', type: 'spell', level: 23, groups: ['Harmful'] },
    { name: 'Stone Skin', type: 'spell', level: 40, groups: ['Protective'] },
  ],
};

const CONFESSOR: AutoPilotClass = {
  name: 'Confessor',
  mortalClass: 420,
  isReclass: true,
  classGroup: 'Cleric',
  abilities: [{ name: 'Bash', type: 'skill', level: 1, groups: [] }],
};

const WARRIOR: AutoPilotClass = {
  name: 'Warrior',
  mortalClass: 340,
  isReclass: false,
  classGroup: 'Warrior',
  abilities: [{ name: 'Berserk', type: 'skill', level: 18, groups: [] }],
};

const CATALOG = [CONFESSOR, WARRIOR, CLERIC]; // deliberately unsorted

function mockFetch(handler: (url: string) => unknown) {
  (global as any).fetch = jest.fn(async (url: string) => ({ ok: true, json: async () => handler(url) }));
}

beforeEach(() => {
  __setClassStoreForTests(memoryKvStore());
});

describe('class catalog cache', () => {
  it('fetches on a cold cache, then serves from cache', async () => {
    mockFetch(() => ({ classes: CATALOG }));
    expect(await getClassCatalog()).toHaveLength(3);
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect(await getClassCatalog()).toHaveLength(3);
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to cache when the network fails', async () => {
    mockFetch(() => ({ classes: CATALOG }));
    await getClassCatalog();
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('offline'));
    expect(await getClassCatalog({ force: true })).toHaveLength(3);
  });

  it('drops malformed class rows', async () => {
    mockFetch(() => ({ classes: [...CATALOG, { mortalClass: 1 }, 42, null] }));
    expect(await getClassCatalog()).toHaveLength(3);
  });

  it('coerces an ability row with a bad type / missing groups', async () => {
    mockFetch(() => ({
      classes: [{ name: 'Mage', abilities: [{ name: 'Magic Missile', type: 'hex', level: 1 }] }],
    }));
    const [mage] = await getClassCatalog();
    expect(mage.abilities[0]).toEqual({ name: 'Magic Missile', type: 'skill', level: 1, groups: [] });
  });

  it('getClassCatalogCached never hits the network', async () => {
    (global as any).fetch = jest.fn();
    expect(await getClassCatalogCached()).toEqual([]);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });
});

describe('pure helpers', () => {
  it('classByName is case-insensitive', () => {
    expect(classByName(CATALOG, 'cleric')?.name).toBe('Cleric');
    expect(classByName(CATALOG, 'NOPE')).toBeUndefined();
  });

  it('classNames lists base classes before reclasses', () => {
    expect(classNames(CATALOG)).toEqual(['Cleric', 'Warrior', 'Confessor']);
  });

  it('abilitiesForClass filters by level, type and group (any-of)', () => {
    // level gate — Sanctuary (20) in, Stone Skin (40) out
    const buffs = abilitiesForClass(CATALOG, 'Cleric', { atOrBelowLevel: 20, groups: ['Protective'] });
    expect(buffs.map((a) => a.name)).toEqual(['Armor', 'Sanctuary']);

    // offensive group filter
    const attacks = abilitiesForClass(CATALOG, 'Cleric', { groups: ['Harmful', 'Attack'] });
    expect(attacks.map((a) => a.name)).toEqual(['Cause Critical', 'Harm']);

    // type filter
    const skills = abilitiesForClass(CATALOG, 'Cleric', { type: 'skill' });
    expect(skills.map((a) => a.name)).toEqual(['Kick']);

    // unknown class → empty
    expect(abilitiesForClass(CATALOG, 'Bard')).toEqual([]);
  });

  it('classOffensiveAbilities keeps offensive-group spells + known combat skills, excluding berserk', () => {
    // Kick is a skill but a known combat skill; Cause Critical / Harm are Harmful
    expect(classOffensiveAbilities(CATALOG, 'Cleric').map((a) => a.name)).toEqual(['Kick', 'Cause Critical', 'Harm']);
    // Berserk is a buff skill now, not a combat one — Warrior has no offensive abilities left.
    expect(classOffensiveAbilities(CATALOG, 'Warrior')).toEqual([]);
  });

  it('a group tagged "Weather" (Faerie Fire\'s real ability group) counts as offensive', () => {
    const WU_JEN: AutoPilotClass = {
      name: 'Wu Jen',
      mortalClass: 600,
      isReclass: false,
      classGroup: 'Mage',
      abilities: [{ name: 'Faerie Fire', type: 'spell', level: 10, groups: ['Weather'] }],
    };
    const catalog = [...CATALOG, WU_JEN];
    expect(classOffensiveAbilities(catalog, 'Wu Jen').map((a) => a.name)).toEqual(['Faerie Fire']);
  });

  it('songs (real GroupType.Songs group names) count as offensive', () => {
    const BARD: AutoPilotClass = {
      name: 'Bard',
      mortalClass: 500,
      isReclass: false,
      classGroup: 'Bard',
      abilities: [
        { name: 'Song of Healing', type: 'song', level: 6, groups: ['HymnsOfLife'] },
        { name: 'War Howl', type: 'song', level: 8, groups: ['WarHymns'] },
        { name: 'Off-key Hum', type: 'song', level: 1, groups: ['SomeOtherGroup'] },
      ],
    };
    const catalog = [...CATALOG, BARD];

    expect(classOffensiveAbilities(catalog, 'Bard').map((a) => a.name)).toEqual(['Song of Healing', 'War Howl']);
  });
});
