/**
 * spell-codegen.ts — SpellSpec -> reviewable 4-section C patch (Phase 14a).
 *
 * Output is TEXT ONLY: a human (or later tooling) applies patchText to merc-mud/2.4/src
 * by hand. This module never touches a filesystem outside merc-area and never runs a
 * compiler — see spell-spec.ts's file header for the full safety model.
 *
 * A brand-new spell's deployable artifact is FOUR sections — magic.h decl, magic.c
 * function, skills_data.c fun_registry line, AND a new const.c skill_table row — not
 * three. skills.dat can NEVER introduce a new name: load_skills_overlay
 * (merc-mud/2.4/src/skills_data.c:189-199,285-291) skips any row whose name isn't already
 * in the compiled skill_table (bug()-logged, every boot, never applying), and const.c has
 * exactly one reserved placeholder (row 0) already excluded. MAX_SKILL is 150
 * (merc.h:121) against ~100 stock rows, so there is deliberate headroom to append a new
 * struct literal to skill_table[]'s initializer. Once that literal is compiled in, the
 * spell IS an ordinary stock row — editable via the EXISTING Phase 7 skills.dat overlay
 * flow from then on. generateOverlayRow's SkillEntry output still matters here: its field
 * values are exactly what the const.c row carries, and it doubles as the "what you'll see
 * on the Skills page later" preview.
 *
 * Anchors are quoted VERBATIM lines from current source, never line numbers (files
 * drift). fun_by_name (skills_data.c:152-161) is a linear strcmp scan, not a binary
 * search, so fun_registry's alphabetical order is a human-readability convention, not a
 * correctness requirement — the generator still anchors alphabetically for a clean diff,
 * but an imperfect placement (e.g. relative to the acid_breath/fire_breath/etc. mob-only
 * spells that interleave into fun_registry's otherwise-clean alpha run) is cosmetic only.
 * If no alphabetical predecessor exists in SKILL_SPELL_FUNS (name sorts before every
 * stock entry), the generator falls back to a known-first anchor line in each file.
 */

import { SKILL_SPELL_FUNS, STOCK_SKILLS } from './skills-stock.js';
import type { SkillEntry } from './skills.js';
import {
  APPLY_LOCATION_MACRO,
  AFF_FLAG_MACRO,
  CURE_CONDITION_GSN,
  type SpellSpec,
  type DamageArchetype,
  type BuffArchetype,
  type DebuffArchetype,
  type HealArchetype,
  type CureArchetype,
} from './spell-spec.js';

/**
 * `after`: insert immediately after this line (safe for magic.h/skills_data.c, whose
 * entries are each exactly one physical line). `before`: insert immediately before this
 * line — REQUIRED for const.c, whose skill_table entries are multi-line struct literals;
 * anchoring "after" a predecessor's mere OPENING line would insert in the middle of that
 * predecessor's own entry. Exactly one of the two is ever set.
 */
export interface RegistryAnchor {
  after?: string;
  before?: string;
}

export interface GeneratedSpellC {
  magicHDecl: string;
  magicHAnchor: RegistryAnchor;
  magicCFunction: string;
  registryLine: string;
  registryAnchor: RegistryAnchor;
  constCRow: string;
  constCAnchor: RegistryAnchor;
  patchText: string;
}

const MAGIC_H_FIRST_ANCHOR = 'DECLARE_SPELL_FUN(spell_null);';
const REGISTRY_FIRST_ANCHOR = 'fun_registry[] = {';
const CONST_C_FIRST_ANCHOR = 'skill_table[MAX_SKILL] = {';

/** POS_* macro names (merc.h:1150-1158), indexed by minimum_position 0..8. */
const POSITION_MACRO: readonly string[] = [
  'POS_DEAD',
  'POS_MORTAL',
  'POS_INCAP',
  'POS_STUNNED',
  'POS_SLEEPING',
  'POS_RESTING',
  'POS_SITTING',
  'POS_FIGHTING',
  'POS_STANDING',
];

/** TAR_* macro names for the three targets our archetypes can ever produce (spell-spec.ts). */
const TARGET_MACRO: Readonly<Record<number, string>> = {
  1: 'TAR_CHAR_OFFENSIVE',
  2: 'TAR_CHAR_DEFENSIVE',
  3: 'TAR_CHAR_SELF',
};

/** Sorted ascending (verified against skills-stock.ts: spell_acid_blast .. spell_word_of_recall). */
const SORTED_STOCK_FUNS: readonly string[] = SKILL_SPELL_FUNS;

/** spell_fun -> the compiled skill NAME that owns it (for quoting a real const.c anchor line). */
const SKILL_NAME_BY_FUN: ReadonlyMap<string, string> = new Map(STOCK_SKILLS.map((s) => [s.spellFun, s.name]));

function alphabeticalPredecessor(funName: string): string | null {
  let pred: string | null = null;
  for (const existing of SORTED_STOCK_FUNS) {
    if (existing < funName) pred = existing;
    else break;
  }
  return pred;
}

/** First stock fun strictly greater than funName (SORTED_STOCK_FUNS is ascending), or null if funName sorts last. */
function alphabeticalSuccessor(funName: string): string | null {
  for (const existing of SORTED_STOCK_FUNS) {
    if (existing > funName) return existing;
  }
  return null;
}

function damTypeMacro(spec: DamageArchetype): string {
  return `DAM_${spec.damageType.toUpperCase()}`;
}

function damageDiceCountExpr(d: DamageArchetype): string {
  if (d.perLevelDiv === undefined) return String(d.baseDiceCount);
  const levelTerm = d.perLevelDiv === 1 ? 'level' : `level / ${d.perLevelDiv}`;
  return d.baseDiceCount === 0 ? levelTerm : `${d.baseDiceCount} + ${levelTerm}`;
}

function durationExpr(durationFlat: number | undefined, durationLevelPlus: number | undefined): string {
  if (durationLevelPlus !== undefined) return `${durationLevelPlus} + level`;
  return String(durationFlat);
}

function modifierExpr(modifierFlat: number | undefined, modifierPerLevelDiv: number | undefined): string {
  if (modifierPerLevelDiv !== undefined) return modifierPerLevelDiv === 1 ? 'level' : `level / ${modifierPerLevelDiv}`;
  if (modifierFlat !== undefined) return String(modifierFlat);
  return '0';
}

function bitvectorExpr(flag: string | undefined): string {
  return flag ? AFF_FLAG_MACRO[flag as keyof typeof AFF_FLAG_MACRO] : '0';
}

function damageFunctionBody(funName: string, d: DamageArchetype): string {
  const dam = damTypeMacro(d);
  const lines = [
    `void ${funName}(int sn, int level, CHAR_DATA *ch, void *vo, int target)`,
    `{`,
    `    CHAR_DATA *victim = (CHAR_DATA *)vo;`,
    `    int dam;`,
    ``,
    `    dam = dice(${damageDiceCountExpr(d)}, ${d.diceSize});`,
  ];
  if (d.saveType === 'half') {
    lines.push(`    if (saves_spell(level, victim, ${dam}))`, `        dam /= 2;`);
  }
  lines.push(`    damage(ch, victim, dam, sn, ${dam}, TRUE);`, `    return;`, `}`);
  return lines.join('\n');
}

function buffFunctionBody(funName: string, b: BuffArchetype): string {
  return [
    `void ${funName}(int sn, int level, CHAR_DATA *ch, void *vo, int target)`,
    `{`,
    `    CHAR_DATA *victim = (CHAR_DATA *)vo;`,
    `    AFFECT_DATA af;`,
    ``,
    `    if (is_affected(victim, sn))`,
    `    {`,
    `        if (victim == ch)`,
    `            send_to_char("${b.alreadyAffectedSelfMsg}\\n\\r", ch);`,
    `        else`,
    `            act("${b.alreadyAffectedOtherMsg}", ch, NULL, victim, TO_CHAR);`,
    `        return;`,
    `    }`,
    ``,
    `    af.where = TO_AFFECTS;`,
    `    af.type = sn;`,
    `    af.level = level;`,
    `    af.duration = ${durationExpr(b.durationFlat, b.durationLevelPlus)};`,
    `    af.modifier = ${modifierExpr(b.modifierFlat, b.modifierPerLevelDiv)};`,
    `    af.location = ${APPLY_LOCATION_MACRO[b.location]};`,
    `    af.bitvector = ${bitvectorExpr(b.bitvector)};`,
    `    affect_to_char(victim, &af);`,
    `    send_to_char("${b.castMsg}\\n\\r", victim);`,
    `    return;`,
    `}`,
  ].join('\n');
}

function debuffFunctionBody(funName: string, b: DebuffArchetype): string {
  return [
    `void ${funName}(int sn, int level, CHAR_DATA *ch, void *vo, int target)`,
    `{`,
    `    CHAR_DATA *victim = (CHAR_DATA *)vo;`,
    `    AFFECT_DATA af;`,
    ``,
    `    if (IS_AFFECTED(victim, ${bitvectorExpr(b.bitvector)}) || saves_spell(level, victim, DAM_OTHER))`,
    `        return;`,
    ``,
    `    af.where = TO_AFFECTS;`,
    `    af.type = sn;`,
    `    af.level = level;`,
    `    af.location = ${APPLY_LOCATION_MACRO[b.location]};`,
    `    af.modifier = ${modifierExpr(b.modifierFlat, b.modifierPerLevelDiv)};`,
    `    af.duration = ${durationExpr(b.durationFlat, b.durationLevelPlus)};`,
    `    af.bitvector = ${bitvectorExpr(b.bitvector)};`,
    `    affect_to_char(victim, &af);`,
    `    send_to_char("${b.castMsgVictim}\\n\\r", victim);`,
    `    act("${b.castMsgRoom}", victim, NULL, NULL, TO_ROOM);`,
    `    return;`,
    `}`,
  ].join('\n');
}

function healFunctionBody(funName: string, h: HealArchetype): string {
  const levelTerm = h.levelDiv !== undefined ? ` + level / ${h.levelDiv}` : '';
  return [
    `void ${funName}(int sn, int level, CHAR_DATA *ch, void *vo, int target)`,
    `{`,
    `    CHAR_DATA *victim = (CHAR_DATA *)vo;`,
    `    int heal;`,
    ``,
    `    heal = dice(${h.diceCount}, ${h.diceSize})${levelTerm};`,
    `    victim->hit = UMIN(victim->hit + heal, victim->max_hit);`,
    `    update_pos(victim);`,
    `    send_to_char("You feel better!\\n\\r", victim);`,
    `    if (ch != victim)`,
    `        send_to_char("Ok.\\n\\r", ch);`,
    `    return;`,
    `}`,
  ].join('\n');
}

function cureFunctionBody(funName: string, c: CureArchetype): string {
  const gsn = CURE_CONDITION_GSN[c.condition];
  return [
    `void ${funName}(int sn, int level, CHAR_DATA *ch, void *vo, int target)`,
    `{`,
    `    CHAR_DATA *victim = (CHAR_DATA *)vo;`,
    ``,
    `    if (!is_affected(victim, ${gsn}))`,
    `    {`,
    `        if (victim == ch)`,
    `            send_to_char("${c.notAffectedMsg}\\n\\r", ch);`,
    `        else`,
    `            act("${c.notAffectedMsg}", ch, NULL, victim, TO_CHAR);`,
    `        return;`,
    `    }`,
    ``,
    `    if (check_dispel(level, victim, ${gsn}))`,
    `    {`,
    `        send_to_char("Your affliction fades!\\n\\r", victim);`,
    `        act("$n looks relieved.", victim, NULL, NULL, TO_ROOM);`,
    `    }`,
    `    else`,
    `        send_to_char("Spell failed.\\n\\r", ch);`,
    `}`,
  ].join('\n');
}

function functionBody(spec: SpellSpec): string {
  switch (spec.archetype) {
    case 'damage':
      return damageFunctionBody(spec.funName, spec.damage!);
    case 'buff':
      return buffFunctionBody(spec.funName, spec.buff!);
    case 'debuff':
      return debuffFunctionBody(spec.funName, spec.debuff!);
    case 'heal':
      return healFunctionBody(spec.funName, spec.heal!);
    case 'cure':
      return cureFunctionBody(spec.funName, spec.cure!);
    default:
      throw new Error(`generateSpellC: unknown archetype '${spec.archetype}'`);
  }
}

/**
 * The new const.c skill_table[] row. Reuses generateOverlayRow's field values (name,
 * levels, ratings, target, position, minMana, beats, nounDamage, msgOff) — same data,
 * different destination. pgsn is always NULL (no gsn binding for a brand-new spell) and
 * slot is always SLOT(0) ("no #OBJECTS training reference" — a known limitation; a human
 * can hand-edit the applied patch if the spell should be object-trainable). msg_obj is
 * always the literal "" (const.c's convention for "no message" per spell_armor's own row
 * — NOT skills.dat's "@" sentinel, which is a text-file-only concept).
 */
function constCRowText(spec: SpellSpec): string {
  const row = generateOverlayRow(spec);
  return [
    `    {"${row.name}",`,
    `     {${row.levels.join(', ')}},`,
    `     {${row.ratings.join(', ')}},`,
    `     ${spec.funName},`,
    `     ${TARGET_MACRO[row.target]},`,
    `     ${POSITION_MACRO[row.position]},`,
    `     NULL,`,
    `     SLOT(0),`,
    `     ${row.minMana},`,
    `     ${row.beats},`,
    `     "${row.nounDamage}",`,
    `     "${row.msgOff}",`,
    `     ""},`,
  ].join('\n');
}

/** Generates the C patch for one spec. Callers must run validateSpellSpec first — this does not re-validate. */
export function generateSpellC(spec: SpellSpec): GeneratedSpellC {
  const pred = alphabeticalPredecessor(spec.funName);
  const magicHAnchor: RegistryAnchor = { after: pred ? `DECLARE_SPELL_FUN(${pred});` : MAGIC_H_FIRST_ANCHOR };
  const registryAnchor: RegistryAnchor = { after: pred ? `{"${pred}", ${pred}},` : REGISTRY_FIRST_ANCHOR };
  // const.c entries are MULTI-LINE struct literals — anchoring "after" a predecessor's
  // opening line would insert mid-entry. Anchor "before" the successor's opening line
  // instead (always a true entry boundary); fall back to "after" the array's own opening
  // brace (also always a true boundary) when no successor exists.
  const succ = alphabeticalSuccessor(spec.funName);
  const succSkillName = succ ? SKILL_NAME_BY_FUN.get(succ) : undefined;
  const constCAnchor: RegistryAnchor = succSkillName ? { before: `{"${succSkillName}",` } : { after: CONST_C_FIRST_ANCHOR };

  const magicHDecl = `DECLARE_SPELL_FUN(${spec.funName});`;
  const magicCFunction = functionBody(spec);
  const registryLine = `    {"${spec.funName}", ${spec.funName}},`;
  const constCRow = constCRowText(spec);

  const patchText = [
    `--- magic.h`,
    `INSERT AFTER:`,
    `    ${magicHAnchor.after}`,
    `INSERT:`,
    `    ${magicHDecl}`,
    ``,
    `--- magic.c`,
    `INSERT AFTER the spell function that precedes this one alphabetically, or at the end`,
    `of the "Spell functions." section (magic.c) — anywhere at file scope is valid C:`,
    magicCFunction,
    ``,
    `--- skills_data.c`,
    `INSERT AFTER:`,
    `    ${registryAnchor.after}`,
    `INSERT:`,
    `${registryLine}`,
    ``,
    `--- const.c`,
    constCAnchor.before
      ? `INSERT BEFORE (skill_table[MAX_SKILL]'s initializer has headroom — MAX_SKILL 150 vs`
      : `INSERT AFTER (skill_table[MAX_SKILL]'s initializer has headroom — MAX_SKILL 150 vs`,
    `~100 stock rows, no size change needed):`,
    `    ${constCAnchor.before ?? constCAnchor.after}`,
    `INSERT:`,
    constCRow,
  ].join('\n');

  return { magicHDecl, magicHAnchor, magicCFunction, registryLine, registryAnchor, constCRow, constCAnchor, patchText };
}

/**
 * Generates the field values a brand-new spell will carry once its const.c patch is
 * compiled and deployed. NOT a live skills.dat row — skills.dat can only overlay data on
 * an EXISTING compiled row (see this file's header), so this is informational only: what
 * a builder will see (and can then edit) on the Skills page after deployment.
 */
export function generateOverlayRow(spec: SpellSpec): SkillEntry {
  return {
    name: spec.name,
    spellFun: spec.funName,
    target: spec.target,
    position: spec.datDefaults.minPosition,
    levels: [...spec.datDefaults.levels],
    ratings: [...spec.datDefaults.ratings],
    minMana: spec.datDefaults.mana,
    beats: spec.datDefaults.lag,
    nounDamage: spec.datDefaults.damageNoun,
    msgOff: spec.datDefaults.msgOff,
    msgObj: null,
  };
}
