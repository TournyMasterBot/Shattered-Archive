/**
 * skills.dat format module tests (Phase 7): stock-table round trip, the
 * NULL sentinel, and validation against the compiled stock table.
 */
import { parseSkillsFile, emitSkillsFile, validateSkills, stockSkillsFile, stockSkill } from './skills';
import { STOCK_SKILLS, SKILL_SPELL_FUNS } from './skills-stock';
import { ParseError } from './reader';
import { EmitError } from './emit';

describe('skills.dat round trip', () => {
  it('emits the full stock table, re-parses it deep-equal, and is byte-stable', () => {
    const stock = stockSkillsFile();
    expect(stock.skills.length).toBe(STOCK_SKILLS.length);
    const text = emitSkillsFile(stock);
    const reparsed = parseSkillsFile(text);
    expect(reparsed).toEqual(stock);
    expect(emitSkillsFile(reparsed)).toBe(text);
  });

  it('the stock table validates clean', () => {
    const { errors, warnings } = validateSkills(stockSkillsFile());
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('round-trips a null msg_obj through the @ sentinel', () => {
    const stock = stockSkillsFile();
    const acid = stock.skills.find((s) => s.name === 'acid blast')!;
    expect(acid.msgObj).toBeNull();
    const text = emitSkillsFile({ skills: [acid] });
    expect(text).toContain('\n@~\n');
    expect(parseSkillsFile(text).skills[0].msgObj).toBeNull();
  });

  it('parses a sparse overlay (one skill) and preserves values', () => {
    const armor = stockSkillsFile().skills.find((s) => s.name === 'armor')!;
    armor.minMana = 42;
    armor.msgOff = 'Your test armor fades.';
    const round = parseSkillsFile(emitSkillsFile({ skills: [armor] }));
    expect(round.skills).toHaveLength(1);
    expect(round.skills[0]).toEqual(armor);
  });

  it('exposes compiled-in metadata via stockSkill', () => {
    expect(stockSkill('acid blast')).toMatchObject({ slot: 70, hasGsn: false });
    expect(stockSkill('axe')).toMatchObject({ slot: 0, hasGsn: true, spellFun: 'spell_null' });
    expect(stockSkill('no such skill')).toBeUndefined();
  });
});

describe('skills.dat parse errors', () => {
  const one = (over: string) => `V1\n${over}$~\n`;

  it('rejects a bad version header', () => {
    expect(() => parseSkillsFile('V9\n$~\n')).toThrow(ParseError);
  });

  it('rejects a truncated record', () => {
    expect(() => parseSkillsFile(one('armor~\nspell_armor 2 8 7 2 10 5 1 1 2 2 5 12\n'))).toThrow(ParseError);
  });

  it('rejects a missing terminator', () => {
    expect(() => parseSkillsFile('V1\n')).toThrow(/end of file/);
  });

  it('rejects a numbers line with the wrong field count', () => {
    expect(() => parseSkillsFile(one('armor~\nspell_armor 2 8\nx~\ny~\nz~\n'))).toThrow(/12 numbers/);
  });

  it('rejects non-numeric fields with the line number', () => {
    try {
      parseSkillsFile(one('armor~\nspell_armor 2 eight 7 2 10 5 1 1 2 2 5 12\nx~\ny~\nz~\n'));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).line).toBe(3);
    }
  });

  it('rejects a string line without a tilde', () => {
    expect(() => parseSkillsFile(one('armor~\nspell_armor 2 8 7 2 10 5 1 1 2 2 5 12\nno tilde\ny~\nz~\n'))).toThrow(/'~'/);
  });

  it("rejects the NULL sentinel on noun_damage/msg_off (msg_obj only)", () => {
    expect(() => parseSkillsFile(one('armor~\nspell_armor 2 8 7 2 10 5 1 1 2 2 5 12\n@~\ny~\nz~\n'))).toThrow(/only msg_obj/);
  });
});

describe('skills.dat emit errors', () => {
  it("rejects '~' and newlines and a literal '@' in message strings", () => {
    const armor = () => stockSkillsFile().skills.find((s) => s.name === 'armor')!;
    let a = armor();
    a.msgOff = 'bad~tilde';
    expect(() => emitSkillsFile({ skills: [a] })).toThrow(EmitError);
    a = armor();
    a.nounDamage = 'two\nlines';
    expect(() => emitSkillsFile({ skills: [a] })).toThrow(EmitError);
    a = armor();
    a.msgObj = '@';
    expect(() => emitSkillsFile({ skills: [a] })).toThrow(/NULL sentinel/);
  });
});

describe('validateSkills', () => {
  const armor = () => stockSkillsFile().skills.find((s) => s.name === 'armor')!;

  it('flags a skill name not in the compiled table', () => {
    const a = armor();
    a.name = 'brand new skill';
    const { errors } = validateSkills({ skills: [a] });
    expect(errors.some((e) => e.includes('new skills need C code'))).toBe(true);
  });

  it('flags duplicates', () => {
    const { errors } = validateSkills({ skills: [armor(), armor()] });
    expect(errors.some((e) => e.includes('more than once'))).toBe(true);
  });

  it('flags an unknown spell function', () => {
    const a = armor();
    a.spellFun = 'spell_does_not_exist';
    const { errors } = validateSkills({ skills: [a] });
    expect(errors.some((e) => e.includes("unknown spell function 'spell_does_not_exist'"))).toBe(true);
  });

  it('flags an unproven (spellFun, target) pair as a crash vector', () => {
    const a = armor();
    a.spellFun = 'spell_acid_blast'; // stock pair is (spell_acid_blast, TAR_CHAR_OFFENSIVE=1)
    expect(a.target).toBe(2);
    const { errors } = validateSkills({ skills: [a] });
    expect(errors.some((e) => e.includes('unproven pair') || e.includes('not a combination'))).toBe(true);
  });

  it('warns (not errors) on a proven spell-function swap', () => {
    const a = armor(); // (spell_armor, 2)
    a.spellFun = 'spell_shield'; // shield is also TAR_CHAR_DEFENSIVE=2 in stock
    expect(SKILL_SPELL_FUNS).toContain('spell_shield');
    const { errors, warnings } = validateSkills({ skills: [a] });
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes('changed from stock spell_armor to spell_shield'))).toBe(true);
  });

  it('flags out-of-range numbers', () => {
    const a = armor();
    a.minMana = -1;
    a.beats = 40000;
    a.position = 9;
    a.levels[2] = 99999;
    const { errors } = validateSkills({ skills: [a] });
    expect(errors.some((e) => e.includes('min_mana -1'))).toBe(true);
    expect(errors.some((e) => e.includes('beats 40000'))).toBe(true);
    expect(errors.some((e) => e.includes('minimum_position 9'))).toBe(true);
    expect(errors.some((e) => e.includes('level 99999'))).toBe(true);
  });
});
