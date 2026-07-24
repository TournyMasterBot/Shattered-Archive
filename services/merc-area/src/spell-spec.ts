/**
 * SpellSpec — a builder-authored NEW spell, declarative only (MUD Builder Phase 14a).
 *
 * This is metadata for the codegen assist, not game data: the game never reads
 * `<area>/codegen/spells.json`. A spec compiles (services/merc-area/src/spell-codegen.ts)
 * to a reviewable C patch (magic.h decl + magic.c function + skills_data.c registry row)
 * plus the paired skills.dat SkillEntry — but nothing here writes/compiles/deploys C.
 *
 * The archetype set is closed and each shape is lifted directly from a stock spell body
 * (merc-mud/2.4/src/magic.c), not invented:
 *   - damage  → spell_flamestrike (dice(baseDiceCount + level/perLevelDiv, diceSize),
 *               optional saves_spell-halves, damage()) / spell_acid_blast (perLevelDiv-only
 *               case, baseDiceCount 0)
 *   - buff    → spell_armor: is_affected(victim, sn) guard (self/other message), single
 *               AFFECT_DATA, no save — always TAR_CHAR_DEFENSIVE or TAR_CHAR_SELF
 *   - debuff  → spell_blindness: IS_AFFECTED(victim, bitvector) OR saves_spell guard
 *               (silent return on either), single AFFECT_DATA — always TAR_CHAR_OFFENSIVE,
 *               and unlike buff its guard is bitvector-based so bitvector is REQUIRED
 *   - heal    → spell_cure_light: dice(diceCount,diceSize) + level/levelDiv, capped at
 *               max_hit via UMIN, update_pos — always TAR_CHAR_DEFENSIVE
 *   - cure    → spell_cure_blindness: is_affected(victim, gsn_<condition>) guard,
 *               check_dispel(level, victim, gsn_<condition>) — always TAR_CHAR_DEFENSIVE;
 *               condition is a closed enum of EXISTING compiled gsn_* globals (a cure can
 *               only strip a condition the engine already knows how to represent)
 *
 * Buff/debuff wear-off messages are NOT generated C: update.c prints
 * skill_table[type].msg_off generically for any expiring affect (update.c:~708), so a
 * wear-off message is carried in datDefaults.msgOff (the ordinary SkillEntry field) and
 * never appears in the generated function body.
 *
 * damage archetype has no custom cast message by design: stock damage spells let damage()
 * generate the hit/miss combat text itself (see spell_acid_blast/spell_flamestrike) — the
 * only spell-specific string is skills.dat's noun_damage (datDefaults.damageNoun).
 */

import { SKILL_SPELL_FUNS, STOCK_SKILLS } from './skills-stock.js';

export const TAR_CHAR_OFFENSIVE = 1;
export const TAR_CHAR_DEFENSIVE = 2;
export const TAR_CHAR_SELF = 3;

export type DamageType = 'fire' | 'cold' | 'lightning' | 'acid' | 'poison' | 'negative' | 'holy' | 'energy' | 'mental';

/** DAM_* codes (merc.h:560-579) — direct-damage-spell-appropriate subset only. */
export const DAMAGE_TYPE_CODE: Readonly<Record<DamageType, number>> = {
  fire: 4,
  cold: 5,
  lightning: 6,
  acid: 7,
  poison: 8,
  negative: 9,
  holy: 10,
  energy: 11,
  mental: 12,
};

export type ApplyLocation = 'none' | 'str' | 'dex' | 'int' | 'wis' | 'con' | 'hitroll' | 'damroll' | 'ac' | 'saving_spell' | 'mana' | 'hit' | 'move';

/**
 * APPLY_* codes (merc.h:985-1011) — buff/debuff-appropriate subset (excludes
 * sex/class/age/height/weight/gold/exp). 'none' (APPLY_NONE) is for a pure-flag affect
 * (e.g. a sanctuary-style buff that only sets a bitvector, no stat modifier). The C macro
 * NAME for each key is looked up from APPLY_LOCATION_MACRO (spell-codegen.ts), never
 * derived by string-transforming the key — 'saving_spell' maps to APPLY_SAVING_SPELL (24,
 * spell_bless's shape), which is a DIFFERENT macro than the also-real APPLY_SAVES (20);
 * conflating the two by naive uppercasing was caught and fixed before codegen shipped.
 */
export const APPLY_LOCATION_CODE: Readonly<Record<ApplyLocation, number>> = {
  none: 0,
  str: 1,
  dex: 2,
  int: 3,
  wis: 4,
  con: 5,
  hitroll: 18,
  damroll: 19,
  ac: 17,
  saving_spell: 24,
  mana: 12,
  hit: 13,
  move: 14,
};

/** Exact C macro name per ApplyLocation key — an explicit map, not a string transform (see APPLY_LOCATION_CODE doc). */
export const APPLY_LOCATION_MACRO: Readonly<Record<ApplyLocation, string>> = {
  none: 'APPLY_NONE',
  str: 'APPLY_STR',
  dex: 'APPLY_DEX',
  int: 'APPLY_INT',
  wis: 'APPLY_WIS',
  con: 'APPLY_CON',
  hitroll: 'APPLY_HITROLL',
  damroll: 'APPLY_DAMROLL',
  ac: 'APPLY_AC',
  saving_spell: 'APPLY_SAVING_SPELL',
  mana: 'APPLY_MANA',
  hit: 'APPLY_HIT',
  move: 'APPLY_MOVE',
};

export type AffFlag =
  | 'sanctuary'
  | 'haste'
  | 'slow'
  | 'protect_evil'
  | 'protect_good'
  | 'infrared'
  | 'detect_invis'
  | 'detect_evil'
  | 'detect_good'
  | 'detect_magic'
  | 'detect_hidden'
  | 'flying'
  | 'regeneration'
  | 'calm'
  | 'weaken'
  | 'curse'
  | 'faerie_fire'
  | 'blind';

/**
 * AFF_* macro names (merc.h:746-775) — restricted to flags that are PURELY passive bits
 * checked elsewhere (IS_AFFECTED tests), with no companion side-effect the spell function
 * itself would also need to perform. Excludes AFF_SLEEP (needs a position change + stop
 * fighting), AFF_CHARM (needs master/slave linking), AFF_POISON/AFF_PLAGUE (own gsn +
 * update.c damage-over-time hookup) — those stay stock-only until a future phase adds a
 * matching template.
 */
export const AFF_FLAG_MACRO: Readonly<Record<AffFlag, string>> = {
  sanctuary: 'AFF_SANCTUARY',
  haste: 'AFF_HASTE',
  slow: 'AFF_SLOW',
  protect_evil: 'AFF_PROTECT_EVIL',
  protect_good: 'AFF_PROTECT_GOOD',
  infrared: 'AFF_INFRARED',
  detect_invis: 'AFF_DETECT_INVIS',
  detect_evil: 'AFF_DETECT_EVIL',
  detect_good: 'AFF_DETECT_GOOD',
  detect_magic: 'AFF_DETECT_MAGIC',
  detect_hidden: 'AFF_DETECT_HIDDEN',
  flying: 'AFF_FLYING',
  regeneration: 'AFF_REGENERATION',
  calm: 'AFF_CALM',
  weaken: 'AFF_WEAKEN',
  curse: 'AFF_CURSE',
  faerie_fire: 'AFF_FAERIE_FIRE',
  blind: 'AFF_BLIND',
};

export type CureCondition = 'blindness' | 'poison' | 'plague';

/** Existing compiled gsn_* globals a "cure" spec may strip (const.c-bound, never new). */
export const CURE_CONDITION_GSN: Readonly<Record<CureCondition, string>> = {
  blindness: 'gsn_blindness',
  poison: 'gsn_poison',
  plague: 'gsn_plague',
};

export type SaveType = 'none' | 'half';

export interface DamageArchetype {
  /** Flat dice count added regardless of level (spell_flamestrike: 6; spell_acid_blast: 0). */
  baseDiceCount: number;
  /** Extra dice = floor(level / perLevelDiv). Omit for a level-independent dice count. */
  perLevelDiv?: number;
  diceSize: number;
  saveType: SaveType;
  damageType: DamageType;
}

export interface BuffArchetype {
  location: ApplyLocation;
  modifierFlat?: number;
  /** modifier contribution = floor(level / modifierPerLevelDiv); divisor may be negative to flip sign. */
  modifierPerLevelDiv?: number;
  durationFlat?: number;
  /** duration = durationFlat/0-implied-base + level, i.e. spell_bless's "6 + level" shape. */
  durationLevelPlus?: number;
  bitvector?: AffFlag;
  /**
   * spell_armor's guard branches self vs. other as two DISTINCT literal strings, never one
   * templated message: act()'s $N never resolves to "you" for a self-cast (act_new loops
   * `to` over the room and only substitutes the actual character name — comm.c:2619), so a
   * single "$N is already X" string would print the caster's own name back at them instead
   * of "You are already X". alreadyAffectedSelfMsg is sent via send_to_char when
   * victim === ch; alreadyAffectedOtherMsg via act(..., TO_CHAR) otherwise.
   */
  alreadyAffectedSelfMsg: string;
  alreadyAffectedOtherMsg: string;
  /** "You feel <x>." — sent to the recipient via send_to_char (self/other-safe as-is). */
  castMsg: string;
}

export interface DebuffArchetype {
  location: ApplyLocation;
  modifierFlat?: number;
  modifierPerLevelDiv?: number;
  durationFlat?: number;
  durationLevelPlus?: number;
  /** REQUIRED: spell_blindness's guard is IS_AFFECTED(victim, bitvector), not is_affected(sn). */
  bitvector: AffFlag;
  /** sent to the victim, e.g. spell_blindness's "You are blinded!" */
  castMsgVictim: string;
  /** act() TO_ROOM message, e.g. "$n appears to be blinded." */
  castMsgRoom: string;
}

export interface HealArchetype {
  diceCount: number;
  diceSize: number;
  /** heal += floor(level / levelDiv). Omit for a level-independent heal. */
  levelDiv?: number;
}

export interface CureArchetype {
  condition: CureCondition;
  /** "You aren't <x>." style, sent when the target isn't affected. */
  notAffectedMsg: string;
}

export interface SpellSpec {
  /** skills.dat row name — row identity, must not collide with stock or another overlay row. */
  name: string;
  /** must match /^spell_[a-z_]+$/ and not collide with the compiled fun_registry. */
  funName: string;
  archetype: 'damage' | 'buff' | 'debuff' | 'heal' | 'cure';
  /** a TAR_* constant — must be the one value the archetype's template allows. */
  target: number;
  damage?: DamageArchetype;
  buff?: BuffArchetype;
  debuff?: DebuffArchetype;
  heal?: HealArchetype;
  cure?: CureArchetype;
  datDefaults: {
    levels: [number, number, number, number];
    ratings: [number, number, number, number];
    mana: number;
    lag: number;
    /** POS_* 0..8 (merc.h) — minimum position to cast. */
    minPosition: number;
    /** skills.dat noun_damage — meaningful for 'damage', harmless empty string otherwise. */
    damageNoun: string;
    /** skills.dat msg_off — the wear-off message update.c prints generically for ANY expiring affect. */
    msgOff: string;
  };
}

const SH_INT_MAX = 32767;
const MAX_CLASS = 4;

const knownFunNames = new Set<string>(SKILL_SPELL_FUNS);
const stockSkillNames = new Set<string>(STOCK_SKILLS.map((s) => s.name));

export interface SpellSpecSummary {
  errors: string[];
  warnings: string[];
}

export interface ValidateSpellSpecOptions {
  /** overlay skill names already in use in this area's skills.dat (Phase 7 rows) OR other stored specs. */
  existingOverlayNames: ReadonlySet<string>;
  /** funNames already claimed by other stored specs in the same manifest (checked in addition to the compiled registry). */
  existingFunNames?: ReadonlySet<string>;
}

function singleLine(val: string, what: string, errors: string[]): void {
  if (val.includes('~')) errors.push(`${what} contains '~', which cannot be represented in skills.dat`);
  if (val.includes('\n') || val.includes('\r')) errors.push(`${what} must be a single line`);
}

function cString(val: string, what: string, errors: string[]): void {
  if (val.includes('"')) errors.push(`${what} contains '"', which would break the generated C string literal`);
  if (val.includes('\n') || val.includes('\r')) errors.push(`${what} must be a single line`);
  if (val.trim() === '') errors.push(`${what} must not be empty`);
}

function intInRange(val: number, lo: number, hi: number, what: string, errors: string[]): void {
  if (!Number.isInteger(val) || val < lo || val > hi) errors.push(`${what} ${val} out of range ${lo}..${hi}`);
}

/** Exactly one of durationFlat/durationLevelPlus — the generated `af.duration = ...` expression needs one unambiguous shape. */
function checkDuration(durationFlat: number | undefined, durationLevelPlus: number | undefined, who: string, kind: string, errors: string[]): void {
  const count = (durationFlat !== undefined ? 1 : 0) + (durationLevelPlus !== undefined ? 1 : 0);
  if (count === 0) errors.push(`${who}: ${kind} needs exactly one of durationFlat or durationLevelPlus`);
  if (count === 2) errors.push(`${who}: ${kind} may not set both durationFlat and durationLevelPlus — pick one`);
  if (durationFlat !== undefined) intInRange(durationFlat, 1, 1000, `${who} ${kind}.durationFlat`, errors);
  if (durationLevelPlus !== undefined) intInRange(durationLevelPlus, 0, 1000, `${who} ${kind}.durationLevelPlus`, errors);
}

/** modifierFlat and modifierPerLevelDiv are mutually exclusive; both absent means a pure-flag effect (modifier 0). */
function checkModifier(modifierFlat: number | undefined, modifierPerLevelDiv: number | undefined, who: string, kind: string, errors: string[]): void {
  if (modifierFlat !== undefined && modifierPerLevelDiv !== undefined)
    errors.push(`${who}: ${kind} may not set both modifierFlat and modifierPerLevelDiv — pick one, or neither for a pure-flag effect`);
  if (modifierPerLevelDiv !== undefined && modifierPerLevelDiv === 0) errors.push(`${who}: ${kind}.modifierPerLevelDiv must not be 0`);
  if (modifierFlat !== undefined) intInRange(modifierFlat, -1000, 1000, `${who} ${kind}.modifierFlat`, errors);
}

/** Validates one SpellSpec. Errors are save/generate-blocking; warnings are advisory. */
export function validateSpellSpec(spec: SpellSpec, opts: ValidateSpellSpecOptions): SpellSpecSummary {
  const errors: string[] = [];
  const warnings: string[] = [];
  const who = `spell '${spec.name || '(unnamed)'}'`;

  singleLine(spec.name, `${who} name`, errors);
  if (spec.name.trim() === '') errors.push(`${who}: name must not be empty`);
  if (stockSkillNames.has(spec.name)) errors.push(`${who}: name collides with a stock skill/spell — names are row identity (Phase 7)`);
  if (opts.existingOverlayNames.has(spec.name)) errors.push(`${who}: name already used by an existing skills.dat overlay row or spec`);

  if (!/^spell_[a-z_]+$/.test(spec.funName)) errors.push(`${who}: funName '${spec.funName}' must match /^spell_[a-z_]+$/`);
  if (knownFunNames.has(spec.funName)) errors.push(`${who}: funName '${spec.funName}' collides with the compiled fun_registry (skills_data.c)`);
  if (opts.existingFunNames?.has(spec.funName)) errors.push(`${who}: funName '${spec.funName}' already used by another stored spec`);

  const archetypeTargets: Record<SpellSpec['archetype'], readonly number[]> = {
    damage: [TAR_CHAR_OFFENSIVE],
    buff: [TAR_CHAR_DEFENSIVE, TAR_CHAR_SELF],
    debuff: [TAR_CHAR_OFFENSIVE],
    heal: [TAR_CHAR_DEFENSIVE],
    cure: [TAR_CHAR_DEFENSIVE],
  };
  const allowedTargets = archetypeTargets[spec.archetype];
  if (!allowedTargets) errors.push(`${who}: unknown archetype '${spec.archetype}'`);
  else if (!allowedTargets.includes(spec.target))
    errors.push(`${who}: target ${spec.target} is not valid for archetype '${spec.archetype}' (expected ${allowedTargets.join(' or ')})`);

  const present = (['damage', 'buff', 'debuff', 'heal', 'cure'] as const).filter((a) => spec[a] !== undefined);
  if (!spec[spec.archetype]) errors.push(`${who}: archetype '${spec.archetype}' selected but its '${spec.archetype}' data is missing`);
  const extras = present.filter((a) => a !== spec.archetype);
  if (extras.length > 0) warnings.push(`${who}: data for unused archetype(s) ${extras.join(', ')} present and will be ignored`);

  if (spec.archetype === 'damage' && spec.damage) {
    const d = spec.damage;
    intInRange(d.baseDiceCount, 0, 50, `${who} damage.baseDiceCount`, errors);
    intInRange(d.diceSize, 1, 50, `${who} damage.diceSize`, errors);
    if (d.perLevelDiv !== undefined) intInRange(d.perLevelDiv, 1, 50, `${who} damage.perLevelDiv`, errors);
    if (d.baseDiceCount === 0 && d.perLevelDiv === undefined)
      errors.push(`${who}: damage with baseDiceCount 0 and no perLevelDiv always deals zero dice`);
    if (!DAMAGE_TYPE_CODE[d.damageType]) errors.push(`${who}: unknown damageType '${d.damageType}'`);
  }

  if (spec.archetype === 'buff' && spec.buff) {
    const b = spec.buff;
    if (!APPLY_LOCATION_CODE[b.location]) errors.push(`${who}: unknown buff.location '${b.location}'`);
    checkModifier(b.modifierFlat, b.modifierPerLevelDiv, who, 'buff', errors);
    checkDuration(b.durationFlat, b.durationLevelPlus, who, 'buff', errors);
    if (b.bitvector !== undefined && !AFF_FLAG_MACRO[b.bitvector]) errors.push(`${who}: unknown buff.bitvector '${b.bitvector}'`);
    cString(b.alreadyAffectedSelfMsg, `${who} buff.alreadyAffectedSelfMsg`, errors);
    cString(b.alreadyAffectedOtherMsg, `${who} buff.alreadyAffectedOtherMsg`, errors);
    cString(b.castMsg, `${who} buff.castMsg`, errors);
  }

  if (spec.archetype === 'debuff' && spec.debuff) {
    const b = spec.debuff;
    if (!APPLY_LOCATION_CODE[b.location]) errors.push(`${who}: unknown debuff.location '${b.location}'`);
    checkModifier(b.modifierFlat, b.modifierPerLevelDiv, who, 'debuff', errors);
    checkDuration(b.durationFlat, b.durationLevelPlus, who, 'debuff', errors);
    if (!b.bitvector || !AFF_FLAG_MACRO[b.bitvector])
      errors.push(`${who}: debuff.bitvector is required (the guard checks IS_AFFECTED against it) and must be a known flag`);
    cString(b.castMsgVictim, `${who} debuff.castMsgVictim`, errors);
    cString(b.castMsgRoom, `${who} debuff.castMsgRoom`, errors);
  }

  if (spec.archetype === 'heal' && spec.heal) {
    const h = spec.heal;
    intInRange(h.diceCount, 1, 50, `${who} heal.diceCount`, errors);
    intInRange(h.diceSize, 1, 50, `${who} heal.diceSize`, errors);
    if (h.levelDiv !== undefined) intInRange(h.levelDiv, 1, 50, `${who} heal.levelDiv`, errors);
  }

  if (spec.archetype === 'cure' && spec.cure) {
    const c = spec.cure;
    if (!CURE_CONDITION_GSN[c.condition]) errors.push(`${who}: unknown cure.condition '${c.condition}'`);
    cString(c.notAffectedMsg, `${who} cure.notAffectedMsg`, errors);
  }

  const dd = spec.datDefaults;
  if (dd.levels.length !== MAX_CLASS) errors.push(`${who}: datDefaults.levels must have ${MAX_CLASS} entries`);
  if (dd.ratings.length !== MAX_CLASS) errors.push(`${who}: datDefaults.ratings must have ${MAX_CLASS} entries`);
  for (const v of dd.levels) intInRange(v, 0, SH_INT_MAX, `${who} datDefaults.levels entry`, errors);
  for (const v of dd.ratings) intInRange(v, 0, SH_INT_MAX, `${who} datDefaults.ratings entry`, errors);
  intInRange(dd.mana, 0, SH_INT_MAX, `${who} datDefaults.mana`, errors);
  intInRange(dd.lag, 0, SH_INT_MAX, `${who} datDefaults.lag`, errors);
  intInRange(dd.minPosition, 0, 8, `${who} datDefaults.minPosition`, errors);
  singleLine(dd.damageNoun, `${who} datDefaults.damageNoun`, errors);
  singleLine(dd.msgOff, `${who} datDefaults.msgOff`, errors);
  if (dd.msgOff.trim() === '') errors.push(`${who}: datDefaults.msgOff must not be empty (skills.dat requires a value; see skills.ts NULL_SENTINEL for the true-NULL case, unused here)`);
  if (dd.msgOff === '@') errors.push(`${who}: datDefaults.msgOff of exactly "@" is unrepresentable (it is skills.dat's NULL sentinel)`);
  if (dd.damageNoun === '@') errors.push(`${who}: datDefaults.damageNoun of exactly "@" is unrepresentable (it is skills.dat's NULL sentinel)`);

  return { errors, warnings };
}
