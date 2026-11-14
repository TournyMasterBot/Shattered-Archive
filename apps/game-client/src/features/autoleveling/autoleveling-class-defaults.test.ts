// apps/game-client/src/features/autoleveling/autoleveling-class-defaults.test.ts

import type { AutoPilotAbility } from './autoleveling-content-types';
import { BUFF_CATALOG } from './autoleveling-buff-catalog';
import {
  DEFAULT_BUFF_LABELS,
  DEFAULT_FIGHT_ROWS,
  DEFAULT_REFRESH_TICKS,
  buffRowFromCatalog,
  defaultBuffRows,
  defaultFightRows,
  fightCommandFor,
} from './autoleveling-class-defaults';

const ab = (name: string, type: AutoPilotAbility['type'], level: number, groups: string[] = []): AutoPilotAbility => ({
  name,
  type,
  level,
  groups,
});

describe('buffRowFromCatalog', () => {
  it('carries the verified command, the affect gate, the in-combat suggestion and the hold-near-level flag', () => {
    expect(buffRowFromCatalog(BUFF_CATALOG.find((c) => c.label === 'Sanctuary')!)).toEqual({
      label: 'Sanctuary',
      cmd: "cast 'sanctuary'",
      affect: 'sanctuary',
      inCombatCmd: 'quaff <potion>',
    });
    expect(buffRowFromCatalog(BUFF_CATALOG.find((c) => c.label === 'Haste')!)).toEqual({
      label: 'Haste',
      cmd: "cast 'haste'",
      affect: 'haste',
      holdNearLevel: true,
    });
  });

  it('gates an affect-less buff (berserk) on game ticks instead', () => {
    expect(buffRowFromCatalog(BUFF_CATALOG.find((c) => c.label === 'Berserk')!)).toEqual({
      label: 'Berserk',
      cmd: 'berserk',
      refreshTicks: DEFAULT_REFRESH_TICKS,
    });
  });
});

describe('defaultBuffRows (E9, E10)', () => {
  const cleric = [
    ab('Armor', 'spell', 2, ['Protective']),
    ab('Bless', 'spell', 5, ['Benedictions']),
    ab('Sanctuary', 'spell', 20, ['Protective']),
    ab('Stone Skin', 'spell', 40, ['Protective']),
    ab('Fly', 'spell', 10, ['Transportation']),
    ab('Detect Good', 'spell', 8, ['Detection']),
    ab('Kick', 'skill', 12),
  ];

  it('picks the class\'s verified leveling buffs, in the catalog order, and leaves travel and detection out', () => {
    const rows = defaultBuffRows(cleric, null);
    expect(rows.map((r) => r.label)).toEqual(['Sanctuary', 'Armor', 'Stone Skin', 'Bless']);
    expect(rows.find((r) => r.label === 'Armor')).toEqual({ label: 'Armor', cmd: "cast 'armor'", affect: 'armor' });
  });

  it('lists a buff the class only gets LATER too, but paused, so it is visible and not cast (E10)', () => {
    const at20 = defaultBuffRows(cleric, 20);
    expect(at20.map((r) => r.label)).toEqual(['Sanctuary', 'Armor', 'Stone Skin', 'Bless']);
    expect(at20.filter((r) => r.disabled).map((r) => r.label)).toEqual(['Stone Skin']); // L40 > 20
    expect(at20.find((r) => r.label === 'Armor')).not.toHaveProperty('disabled');
  });

  it('at a level below every buff, all of them are listed paused', () => {
    const rows = defaultBuffRows(cleric, 1);
    expect(rows.map((r) => r.label)).toEqual(['Sanctuary', 'Armor', 'Stone Skin', 'Bless']);
    expect(rows.every((r) => r.disabled === true)).toBe(true);
    expect(rows.find((r) => r.label === 'Sanctuary')).toMatchObject({ cmd: "cast 'sanctuary'", affect: 'sanctuary', inCombatCmd: 'quaff <potion>' });
  });

  it('a buff available at exactly the character level is active, one level above is paused', () => {
    expect(defaultBuffRows([ab('Haste', 'spell', 33)], 33)[0]).not.toHaveProperty('disabled');
    expect(defaultBuffRows([ab('Haste', 'spell', 33)], 32)[0]).toMatchObject({ label: 'Haste', disabled: true });
  });

  it('uses the lowest level when an ability appears twice', () => {
    expect(defaultBuffRows([ab('Haste', 'spell', 40), ab('Haste', 'spell', 20)], 25)[0]).not.toHaveProperty('disabled');
  });

  it('an unknown level means no cap', () => {
    expect(defaultBuffRows(cleric, null).map((r) => r.label)).toContain('Stone Skin');
  });

  it('matches a buff by its affect name when the ability carries a different label', () => {
    expect(defaultBuffRows([ab('stone skin', 'spell', 3)], null).map((r) => r.label)).toEqual(['Stone Skin']);
  });

  it('matches case-insensitively and lists each buff once', () => {
    const rows = defaultBuffRows([ab('SANCTUARY', 'spell', 1), ab('Sanctuary', 'spell', 9)], null);
    expect(rows.map((r) => r.label)).toEqual(['Sanctuary']);
  });

  it('gives a skill-only class its tick-gated berserk', () => {
    expect(defaultBuffRows([ab('Berserk', 'skill', 18)], null)).toEqual([
      { label: 'Berserk', cmd: 'berserk', refreshTicks: DEFAULT_REFRESH_TICKS },
    ]);
  });

  it('a class with no abilities, or none of the leveling buffs, gets none', () => {
    expect(defaultBuffRows([], null)).toEqual([]);
    expect(defaultBuffRows([ab('Fly', 'spell', 1)], 51)).toEqual([]);
  });

  it('skips a default label the verified catalog no longer carries instead of failing', () => {
    const at = BUFF_CATALOG.findIndex((c) => c.label === 'Armor');
    const [removed] = BUFF_CATALOG.splice(at, 1);
    try {
      expect(defaultBuffRows([ab('Armor', 'spell', 2), ab('Sanctuary', 'spell', 20)], null).map((r) => r.label)).toEqual(['Sanctuary']);
    } finally {
      BUFF_CATALOG.splice(at, 0, removed);
    }
  });

  it('only ever offers labels that exist in the verified catalog', () => {
    for (const label of DEFAULT_BUFF_LABELS) expect(BUFF_CATALOG.some((c) => c.label === label)).toBe(true);
  });
});

describe('fightCommandFor', () => {
  it('is the bare lowercase name for a skill and a cast with {name} for a spell or song', () => {
    expect(fightCommandFor(ab('Bash', 'skill', 1))).toBe('bash');
    expect(fightCommandFor(ab('Magic Missile', 'spell', 1))).toBe("cast 'magic missile' {name}");
    expect(fightCommandFor(ab('War Cry', 'song', 1))).toBe("cast 'war cry' {name}");
  });
});

describe('defaultFightRows (E9, E10)', () => {
  it('gives a caster its strongest spells, highest level first, capped at the default count', () => {
    const mage = [
      ab('Magic Missile', 'spell', 1, ['Combat']),
      ab('Fireball', 'spell', 25, ['Combat']),
      ab('Lightning Bolt', 'spell', 30, ['Combat']),
      ab('Harm', 'spell', 40, ['Harmful']),
    ];
    expect(defaultFightRows(mage, null).map((r) => r.cmd)).toEqual([
      "cast 'harm' {name}",
      "cast 'lightning bolt' {name}",
      "cast 'fireball' {name}",
    ]);
    expect(DEFAULT_FIGHT_ROWS).toBe(3);
  });

  it('gives a fighter its skills in the known combat order', () => {
    const warrior = [ab('Trip', 'skill', 5), ab('Kick', 'skill', 8), ab('Bash', 'skill', 1), ab('Disarm', 'skill', 12)];
    expect(defaultFightRows(warrior, null).map((r) => r.cmd)).toEqual(['bash', 'kick', 'disarm']);
  });

  it('a hybrid keeps room for a skill: two spells then a skill', () => {
    const hybrid = [
      ab('Fireball', 'spell', 25, ['Combat']),
      ab('Harm', 'spell', 40, ['Harmful']),
      ab('Lightning Bolt', 'spell', 30, ['Combat']),
      ab('Bash', 'skill', 1),
    ];
    expect(defaultFightRows(hybrid, null).map((r) => r.cmd)).toEqual(["cast 'harm' {name}", "cast 'lightning bolt' {name}", 'bash']);
  });

  it('ranks an offensive skill that is not in the known list after the known ones', () => {
    const rows = defaultFightRows([ab('Whirl', 'skill', 3, ['Combat']), ab('Kick', 'skill', 8)], null);
    expect(rows.map((r) => r.cmd)).toEqual(['kick', 'whirl']);
  });

  it('breaks ties between equally ranked skills by name, and gives a one-spell-one-skill class both', () => {
    expect(defaultFightRows([ab('Zig', 'skill', 3, ['Combat']), ab('Aag', 'skill', 9, ['Combat'])], null).map((r) => r.cmd)).toEqual([
      'aag',
      'zig',
    ]);
    expect(defaultFightRows([ab('Harm', 'spell', 9, ['Harmful']), ab('Bash', 'skill', 1)], null).map((r) => r.cmd)).toEqual([
      "cast 'harm' {name}",
      'bash',
    ]);
  });

  it('two abilities that build the same command yield one row', () => {
    const rows = defaultFightRows([ab('Bash', 'skill', 1), ab('bash', 'skill', 2)], null);
    expect(rows.map((r) => r.cmd)).toEqual(['bash']);
  });

  it('breaks ties between same-level spells by name so the result is stable', () => {
    const rows = defaultFightRows([ab('Zap', 'spell', 10, ['Combat']), ab('Arc', 'spell', 10, ['Combat'])], null);
    expect(rows.map((r) => r.cmd)).toEqual(["cast 'arc' {name}", "cast 'zap' {name}"]);
  });

  it('respects the character level and treats an unknown level as no cap', () => {
    const mage = [ab('Magic Missile', 'spell', 1, ['Combat']), ab('Fireball', 'spell', 25, ['Combat'])];
    expect(defaultFightRows(mage, 10).map((r) => r.cmd)).toEqual(["cast 'magic missile' {name}"]);
    expect(defaultFightRows(mage, null)).toHaveLength(2);
  });

  it('starts every cooldown at 0 for the caller to fill with a learned value', () => {
    expect(defaultFightRows([ab('Bash', 'skill', 1)], null)).toEqual([{ cmd: 'bash', cooldownSec: 0 }]);
  });

  it('a class with no offensive abilities gets none', () => {
    expect(defaultFightRows([], null)).toEqual([]);
    expect(defaultFightRows([ab('Fireball', 'spell', 25, ['Combat'])], 5)).toEqual([]);
  });
});
