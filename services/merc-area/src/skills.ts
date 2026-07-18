/**
 * skills.dat — the boot-time skill/spell data overlay (MUD Builder Phase 7).
 *
 * The game's skill_table lives in const.c; skills.dat overlays the DATA of
 * existing rows at boot (loaded by skills_data.c between gsn assignment and
 * area loading). Names are row identity and immutable (player files save
 * skills by name; C code hardcodes skill_lookup calls); slot and pgsn are
 * compiled-in and never appear in the file.
 *
 * Format (line-oriented; every string is a single line ending in '~'):
 *
 *   V1
 *   <name>~
 *   <spellFun> <target> <position> <lev0> <lev1> <lev2> <lev3> <rat0> <rat1> <rat2> <rat3> <minMana> <beats>
 *   <nounDamage>~
 *   <msgOff>~
 *   <msgObj>~        (a body of exactly "@" means NULL — msg_obj only)
 *   ...more records...
 *   $~
 *
 * Safety rule mirrored in the C loader: an overlaid (spellFun, target) pair
 * must already exist somewhere in the compiled stock table — magic.c builds
 * the vo argument from target and the function casts it, so an unproven pair
 * is a crash vector.
 */

import { ParseError } from './reader.js';
import { EmitError } from './emit.js';
import { SKILL_SPELL_FUNS, STOCK_FUN_TARGET_PAIRS, STOCK_SKILLS } from './skills-stock.js';

export interface SkillEntry {
  name: string;
  spellFun: string;
  target: number;
  position: number;
  levels: number[]; // per class, MAX_CLASS = 4
  ratings: number[]; // per class
  minMana: number;
  beats: number;
  nounDamage: string;
  msgOff: string;
  msgObj: string | null; // null = C NULL (stock rows that omit the 13th field)
}

/** A stock row: SkillEntry plus the compiled-in, non-authorable metadata. */
export interface StockSkillRow extends SkillEntry {
  slot: number; // #OBJECTS reference — never changes (const.c comment)
  hasGsn: boolean; // row has a bound gsn_* global
}

export interface SkillsFile {
  skills: SkillEntry[];
}

export interface SkillsSummary {
  errors: string[];
  warnings: string[];
}

const MAX_CLASS = 4;
const SH_INT_MAX = 32767;
const NULL_SENTINEL = '@';

const stockByName = new Map<string, StockSkillRow>(STOCK_SKILLS.map((s) => [s.name, s]));
const knownFuns = new Set<string>(SKILL_SPELL_FUNS);
const knownPairs = new Set<string>(STOCK_FUN_TARGET_PAIRS);

/** The full stock table as an editable model (deep copies, file order = const.c order). */
export function stockSkillsFile(): SkillsFile {
  return {
    skills: STOCK_SKILLS.map((s) => ({
      name: s.name,
      spellFun: s.spellFun,
      target: s.target,
      position: s.position,
      levels: [...s.levels],
      ratings: [...s.ratings],
      minMana: s.minMana,
      beats: s.beats,
      nounDamage: s.nounDamage,
      msgOff: s.msgOff,
      msgObj: s.msgObj,
    })),
  };
}

/** Compiled-in metadata for a skill name, or undefined if it is not a stock row. */
export function stockSkill(name: string): StockSkillRow | undefined {
  return stockByName.get(name);
}

function tildeLine(body: string, what: string): string {
  if (body.includes('~')) throw new EmitError(`${what} contains '~', which cannot be represented in skills.dat`);
  if (body.includes('\n') || body.includes('\r')) throw new EmitError(`${what} must be a single line`);
  if (body === NULL_SENTINEL) throw new EmitError(`${what} of exactly "@" is unrepresentable (it is the NULL sentinel)`);
  return `${body}~`;
}

export function emitSkillsFile(file: SkillsFile): string {
  const out: string[] = ['V1'];
  for (const s of file.skills) {
    if (s.levels.length !== MAX_CLASS || s.ratings.length !== MAX_CLASS)
      throw new EmitError(`skill '${s.name}': levels/ratings must have exactly ${MAX_CLASS} entries`);
    if (/\s/.test(s.spellFun) || s.spellFun === '') throw new EmitError(`skill '${s.name}': bad spellFun word`);
    out.push(tildeLine(s.name, `skill name '${s.name}'`));
    out.push(
      [s.spellFun, s.target, s.position, ...s.levels, ...s.ratings, s.minMana, s.beats].join(' '),
    );
    out.push(tildeLine(s.nounDamage, `skill '${s.name}' noun_damage`));
    out.push(tildeLine(s.msgOff, `skill '${s.name}' msg_off`));
    out.push(s.msgObj === null ? `${NULL_SENTINEL}~` : tildeLine(s.msgObj, `skill '${s.name}' msg_obj`));
  }
  out.push('$~');
  return out.join('\n') + '\n';
}

function stripTilde(raw: string, lineNo: number, what: string): string {
  if (!raw.endsWith('~')) throw new ParseError(`${what}: expected a line ending in '~', got "${raw}"`, lineNo);
  return raw.slice(0, -1);
}

export function parseSkillsFile(text: string): SkillsFile {
  const lines = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop(); // trailing newline
  let i = 0;
  const next = (): string => {
    if (i >= lines.length) throw new ParseError('unexpected end of file', lines.length);
    return lines[i++];
  };

  if (next() !== 'V1') throw new ParseError(`skills.dat must start with "V1"`, 1);

  const skills: SkillEntry[] = [];
  for (;;) {
    const nameLine = next();
    const nameLineNo = i;
    if (nameLine === '$~') break;
    const name = stripTilde(nameLine, nameLineNo, 'skill name');

    const numLineNo = i + 1;
    const tokens = next().trim().split(/\s+/);
    if (tokens.length !== 13)
      throw new ParseError(`skill '${name}': expected "<spellFun> + 12 numbers", got ${tokens.length} field(s)`, numLineNo);
    const spellFun = tokens[0];
    const nums = tokens.slice(1).map((t, ti) => {
      if (!/^-?\d+$/.test(t)) throw new ParseError(`skill '${name}': field ${ti + 2} is not a number: "${t}"`, numLineNo);
      return parseInt(t, 10);
    });
    const [target, position, l0, l1, l2, l3, r0, r1, r2, r3, minMana, beats] = nums;

    const nounDamage = stripTilde(next(), i, `skill '${name}' noun_damage`);
    const msgOff = stripTilde(next(), i, `skill '${name}' msg_off`);
    const msgObjBody = stripTilde(next(), i, `skill '${name}' msg_obj`);
    if (nounDamage === NULL_SENTINEL || msgOff === NULL_SENTINEL)
      throw new ParseError(`skill '${name}': only msg_obj may be the NULL sentinel "@"`, i);

    skills.push({
      name,
      spellFun,
      target,
      position,
      levels: [l0, l1, l2, l3],
      ratings: [r0, r1, r2, r3],
      minMana,
      beats,
      nounDamage,
      msgOff,
      msgObj: msgObjBody === NULL_SENTINEL ? null : msgObjBody,
    });
  }
  return { skills };
}

/**
 * Semantic validation against the compiled stock table. Errors are
 * save-blocking (the C loader would bug()+skip or worse); warnings flag
 * intentional-but-unusual edits.
 */
export function validateSkills(file: SkillsFile): SkillsSummary {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const s of file.skills) {
    const who = `skill '${s.name}'`;
    const stock = stockByName.get(s.name);
    if (!stock) {
      errors.push(`${who}: not in the compiled skill table — new skills need C code, only existing rows can be overlaid`);
      continue;
    }
    if (seen.has(s.name)) errors.push(`${who}: listed more than once`);
    seen.add(s.name);

    if (!knownFuns.has(s.spellFun)) errors.push(`${who}: unknown spell function '${s.spellFun}'`);
    else if (!knownPairs.has(`${s.spellFun} ${s.target}`))
      errors.push(
        `${who}: (${s.spellFun}, target ${s.target}) is not a combination the stock table uses — an unproven pair can crash the caster`,
      );
    if (s.spellFun !== stock.spellFun && knownFuns.has(s.spellFun))
      warnings.push(`${who}: spell function changed from stock ${stock.spellFun} to ${s.spellFun}`);

    if (s.levels.length !== MAX_CLASS) errors.push(`${who}: levels must have ${MAX_CLASS} entries`);
    if (s.ratings.length !== MAX_CLASS) errors.push(`${who}: ratings must have ${MAX_CLASS} entries`);
    for (const [label, vals] of [
      ['level', s.levels],
      ['rating', s.ratings],
    ] as const) {
      for (const v of vals) {
        if (!Number.isInteger(v) || v < 0 || v > SH_INT_MAX) errors.push(`${who}: ${label} ${v} out of range 0..${SH_INT_MAX}`);
      }
    }
    if (!Number.isInteger(s.minMana) || s.minMana < 0 || s.minMana > SH_INT_MAX)
      errors.push(`${who}: min_mana ${s.minMana} out of range 0..${SH_INT_MAX}`);
    if (!Number.isInteger(s.beats) || s.beats < 0 || s.beats > SH_INT_MAX)
      errors.push(`${who}: beats ${s.beats} out of range 0..${SH_INT_MAX}`);
    if (!Number.isInteger(s.position) || s.position < 0 || s.position > 8)
      errors.push(`${who}: minimum_position ${s.position} out of range 0..8 (POS_DEAD..POS_STANDING)`);
    if (!Number.isInteger(s.target) || s.target < 0 || s.target > 6)
      errors.push(`${who}: target ${s.target} out of range 0..6 (TAR_IGNORE..TAR_OBJ_CHAR_OFF)`);

    for (const [label, val] of [
      ['noun_damage', s.nounDamage],
      ['msg_off', s.msgOff],
      ['msg_obj', s.msgObj ?? ''],
    ] as const) {
      if (val.includes('~')) errors.push(`${who}: ${label} contains '~', which cannot be represented`);
      if (val.includes('\n') || val.includes('\r')) errors.push(`${who}: ${label} must be a single line`);
      if (val === NULL_SENTINEL) errors.push(`${who}: ${label} of exactly "@" is unrepresentable (NULL sentinel)`);
    }
  }
  return { errors, warnings };
}
