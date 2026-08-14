/**
 * spell-codegen.ts golden-file tests (Phase 14a): one checked-in expected .c function per
 * archetype, asserted byte-exact against the actual template output, plus the alphabetical
 * registry-anchor logic and an overlay-row round trip through the existing skills.dat
 * emitter/parser (skills.ts) — proving generateOverlayRow's output is a genuinely valid
 * SkillEntry, not just a shape that happens to typecheck.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateSpellC, generateOverlayRow } from './spell-codegen';
import { emitSkillsFile, parseSkillsFile } from './skills';
import { TAR_CHAR_OFFENSIVE, TAR_CHAR_DEFENSIVE, type SpellSpec } from './spell-spec';

function fixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', 'spell-codegen', name), 'utf8').replace(/\r\n/g, '\n').trimEnd();
}

const damageSpec: SpellSpec = {
  name: 'test bolt',
  funName: 'spell_test_bolt',
  archetype: 'damage',
  target: TAR_CHAR_OFFENSIVE,
  damage: { baseDiceCount: 6, perLevelDiv: 2, diceSize: 8, saveType: 'half', damageType: 'fire' },
  datDefaults: { levels: [10, 10, 10, 10], ratings: [1, 1, 1, 1], mana: 20, lag: 12, minPosition: 7, damageNoun: 'test bolt', msgOff: '!Test Bolt!' },
};

const buffSpec: SpellSpec = {
  name: 'test shield',
  funName: 'spell_test_shield',
  archetype: 'buff',
  target: TAR_CHAR_DEFENSIVE,
  buff: {
    location: 'ac',
    modifierFlat: -20,
    durationFlat: 24,
    alreadyAffectedSelfMsg: 'You are already shielded.',
    alreadyAffectedOtherMsg: '$N is already shielded.',
    castMsg: 'You feel a shield form around you.',
  },
  datDefaults: { levels: [10, 10, 10, 10], ratings: [1, 1, 1, 1], mana: 15, lag: 12, minPosition: 8, damageNoun: '', msgOff: 'Your shield fades.' },
};

const debuffSpec: SpellSpec = {
  name: 'test daze',
  funName: 'spell_test_daze',
  archetype: 'debuff',
  target: TAR_CHAR_OFFENSIVE,
  debuff: {
    location: 'hitroll',
    modifierFlat: -4,
    durationLevelPlus: 1,
    bitvector: 'blind',
    castMsgVictim: 'You are dazed!',
    castMsgRoom: '$n looks dazed.',
  },
  datDefaults: { levels: [10, 10, 10, 10], ratings: [1, 1, 1, 1], mana: 15, lag: 12, minPosition: 7, damageNoun: '', msgOff: 'You feel less dazed.' },
};

const healSpec: SpellSpec = {
  name: 'test mend',
  funName: 'spell_test_mend',
  archetype: 'heal',
  target: TAR_CHAR_DEFENSIVE,
  heal: { diceCount: 1, diceSize: 8, levelDiv: 3 },
  datDefaults: { levels: [10, 10, 10, 10], ratings: [1, 1, 1, 1], mana: 10, lag: 12, minPosition: 7, damageNoun: '', msgOff: '!Test Mend!' },
};

const cureSpec: SpellSpec = {
  name: 'test purge',
  funName: 'spell_test_purge',
  archetype: 'cure',
  target: TAR_CHAR_DEFENSIVE,
  cure: { condition: 'blindness', notAffectedMsg: "You aren't blind." },
  datDefaults: { levels: [10, 10, 10, 10], ratings: [1, 1, 1, 1], mana: 15, lag: 12, minPosition: 7, damageNoun: '', msgOff: '!Test Purge!' },
};

describe('generateSpellC: golden fixtures', () => {
  it('damage archetype matches spell_flamestrike/spell_acid_blast shape byte-exact', () => {
    expect(generateSpellC(damageSpec).magicCFunction).toBe(fixture('damage.c'));
  });

  it('buff archetype matches spell_armor shape byte-exact', () => {
    expect(generateSpellC(buffSpec).magicCFunction).toBe(fixture('buff.c'));
  });

  it('debuff archetype matches spell_blindness shape byte-exact', () => {
    expect(generateSpellC(debuffSpec).magicCFunction).toBe(fixture('debuff.c'));
  });

  it('heal archetype matches spell_cure_light shape byte-exact', () => {
    expect(generateSpellC(healSpec).magicCFunction).toBe(fixture('heal.c'));
  });

  it('cure archetype matches spell_cure_blindness shape byte-exact', () => {
    expect(generateSpellC(cureSpec).magicCFunction).toBe(fixture('cure.c'));
  });
});

describe('generateSpellC: decl, registry line, and anchors', () => {
  it('produces the DECLARE_SPELL_FUN decl and fun_registry line', () => {
    const g = generateSpellC(damageSpec);
    expect(g.magicHDecl).toBe('DECLARE_SPELL_FUN(spell_test_bolt);');
    expect(g.registryLine).toBe('    {"spell_test_bolt", spell_test_bolt},');
  });

  it('anchors after the true alphabetical predecessor when one exists (magic.h / skills_data.c)', () => {
    // "spell_test_bolt" sorts between "spell_teleport" and "spell_ventriloquate".
    const g = generateSpellC(damageSpec);
    expect(g.magicHAnchor.after).toBe('DECLARE_SPELL_FUN(spell_teleport);');
    expect(g.registryAnchor.after).toBe('{"spell_teleport", spell_teleport},');
  });

  it('anchors const.c BEFORE the alphabetical successor (multi-line entries — after would land mid-entry)', () => {
    // "spell_test_bolt" sorts between "spell_teleport" and "spell_ventriloquate".
    const g = generateSpellC(damageSpec);
    expect(g.constCAnchor.before).toBe('{"ventriloquate",');
    expect(g.constCAnchor.after).toBeUndefined();
  });

  it('falls back to the first-entry anchor when the name sorts before every stock fun (magic.h / skills_data.c)', () => {
    const spec: SpellSpec = { ...damageSpec, funName: 'spell_aardvark' };
    const g = generateSpellC(spec);
    expect(g.magicHAnchor.after).toBe('DECLARE_SPELL_FUN(spell_null);');
    expect(g.registryAnchor.after).toBe('fun_registry[] = {');
    // const.c anchors on the SUCCESSOR, not the predecessor — "aardvark" still has one
    // (the very first stock entry), so this is NOT the const.c fallback case.
    expect(g.constCAnchor.before).toBe('{"acid blast",');
  });

  it('const.c falls back to the array-open anchor only when NO successor exists (name sorts after every stock fun)', () => {
    const spec: SpellSpec = { ...damageSpec, funName: 'spell_zzz_last' };
    const g = generateSpellC(spec);
    expect(g.constCAnchor.after).toBe('skill_table[MAX_SKILL] = {');
    expect(g.constCAnchor.before).toBeUndefined();
  });

  it('patchText contains all four labeled sections with no line numbers', () => {
    const patch = generateSpellC(damageSpec).patchText;
    expect(patch).toContain('--- magic.h');
    expect(patch).toContain('--- magic.c');
    expect(patch).toContain('--- skills_data.c');
    expect(patch).toContain('--- const.c');
    expect(patch).not.toMatch(/:\d+/); // no "file:line" style refs — anchors are quoted lines only
  });
});

describe('generateSpellC: const.c skill_table row (the actual new-spell deployable)', () => {
  it('matches the armor/acid_blast row shape byte-exact', () => {
    expect(generateSpellC(damageSpec).constCRow).toBe(fixture('const-row.c'));
  });
});

describe('generateOverlayRow: round-trips through the real skills.dat emitter/parser', () => {
  it('damage archetype row round-trips', () => {
    const row = generateOverlayRow(damageSpec);
    expect(row).toMatchObject({ name: 'test bolt', spellFun: 'spell_test_bolt', target: TAR_CHAR_OFFENSIVE, msgObj: null });
    const text = emitSkillsFile({ skills: [row] });
    expect(parseSkillsFile(text).skills[0]).toEqual(row);
  });

  it('buff archetype row round-trips and never emits a slot', () => {
    const row = generateOverlayRow(buffSpec);
    expect(row).not.toHaveProperty('slot');
    const text = emitSkillsFile({ skills: [row] });
    expect(parseSkillsFile(text).skills[0]).toEqual(row);
  });
});
