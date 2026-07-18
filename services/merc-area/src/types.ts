/**
 * Data model for a Merc 2.4 area file as understood by merc-mud/2.4/src/db.c
 * (load_area/load_helps/load_mobiles/load_objects/load_resets/load_rooms/
 * load_shops/load_specials/load_socials) and db2.c.
 *
 * The model mirrors the FILE grammar, not the in-game structs: words that db.c
 * resolves through lookup tables (race, item type, damage type, positions, sex,
 * size, liquids, skills…) are stored verbatim so a parse→emit round trip is
 * lossless. Flags/bitvectors are stored as their numeric value (db.c's
 * fread_flag accepts plain decimal, so numeric emission always boots).
 */

export interface Dice {
  number: number;
  type: number;
  bonus: number;
}

export interface ExtraDescr {
  keyword: string;
  description: string;
}

// ── #AREA ────────────────────────────────────────────────────────────────────

export interface AreaHeaderSection {
  kind: 'area';
  fileName: string;
  name: string;
  credits: string;
  minVnum: number;
  maxVnum: number;
}

// ── #HELPS ───────────────────────────────────────────────────────────────────

export interface HelpEntry {
  level: number;
  keyword: string;
  text: string;
}

export interface HelpsSection {
  kind: 'helps';
  helps: HelpEntry[];
  /** Level value on the `$~` terminator line (usually 0, preserved verbatim). */
  endLevel: number;
}

// ── #MOBILES (new style, db2.c load_mobiles) ─────────────────────────────────

/** `F <field> <flag>` race-trait removal line at the end of a mobile. */
export interface MobFlagRemoval {
  /** Field word as written (prefix-matched by db2.c: act/aff/off/imm/res/vul/for/par). */
  field: string;
  vector: number;
}

export interface Mobile {
  vnum: number;
  name: string;
  shortDescr: string;
  longDescr: string;
  description: string;
  race: string;
  act: number;
  affectedBy: number;
  alignment: number;
  group: number;
  level: number;
  hitroll: number;
  hit: Dice;
  mana: Dice;
  damage: Dice;
  damType: string;
  /** AC pierce/bash/slash/exotic as written (db.c multiplies by 10 on load). */
  ac: [number, number, number, number];
  offFlags: number;
  immFlags: number;
  resFlags: number;
  vulnFlags: number;
  startPos: string;
  defaultPos: string;
  sex: string;
  wealth: number;
  form: number;
  parts: number;
  size: string;
  material: string;
  flagRemovals: MobFlagRemoval[];
}

export interface MobilesSection {
  kind: 'mobiles';
  mobiles: Mobile[];
}

// ── #OBJECTS (new style, db2.c load_objects) ─────────────────────────────────

/** Canonical item type names from const.c item_table. */
export const ITEM_TYPES = [
  'light',
  'scroll',
  'wand',
  'staff',
  'weapon',
  'treasure',
  'armor',
  'potion',
  'clothing',
  'furniture',
  'trash',
  'container',
  'drink',
  'key',
  'food',
  'money',
  'boat',
  'npc_corpse',
  'pc_corpse',
  'fountain',
  'pill',
  'protect',
  'map',
  'portal',
  'warp_stone',
  'room_key',
  'gem',
  'jewelry',
  'jukebox',
] as const;

export type ItemTypeName = (typeof ITEM_TYPES)[number];

/**
 * db.c item_lookup: the file's word must be a case-insensitive PREFIX of the
 * canonical name (first letters must match). Returns the canonical name, or
 * undefined for unknown words (db2.c then falls into the default value grammar).
 */
export function itemLookup(word: string): ItemTypeName | undefined {
  const w = word.toLowerCase();
  if (w.length === 0) return undefined;
  for (const name of ITEM_TYPES) {
    if (name[0] === w[0] && name.startsWith(w)) return name;
  }
  return undefined;
}

/**
 * How each of the five object values is tokenized, per db2.c load_objects.
 * 'word' entries are stored as strings, everything else as numbers.
 */
export type ObjValueKind = 'number' | 'flag' | 'word';

export function objValueKinds(itemTypeWord: string): [ObjValueKind, ObjValueKind, ObjValueKind, ObjValueKind, ObjValueKind] {
  switch (itemLookup(itemTypeWord)) {
    case 'weapon':
      return ['word', 'number', 'number', 'word', 'flag'];
    case 'container':
      return ['number', 'flag', 'number', 'number', 'number'];
    case 'drink':
    case 'fountain':
      return ['number', 'number', 'word', 'number', 'number'];
    case 'wand':
    case 'staff':
      return ['number', 'number', 'number', 'word', 'number'];
    case 'potion':
    case 'pill':
    case 'scroll':
      return ['number', 'word', 'word', 'word', 'word'];
    default:
      return ['flag', 'flag', 'flag', 'flag', 'flag'];
  }
}

export type ObjValue = number | string;

/** `A` line: plain affect (location, modifier). */
export interface ObjAffect {
  location: number;
  modifier: number;
}

/** `F` line: flag-vector affect (where is A/I/R/V). */
export interface ObjFlagAffect {
  where: 'A' | 'I' | 'R' | 'V';
  location: number;
  modifier: number;
  bitvector: number;
}

export interface MudObject {
  vnum: number;
  name: string;
  shortDescr: string;
  description: string;
  material: string;
  /** Item type word as written (prefix of a canonical const.c name). */
  itemType: string;
  extraFlags: number;
  wearFlags: number;
  values: [ObjValue, ObjValue, ObjValue, ObjValue, ObjValue];
  level: number;
  weight: number;
  cost: number;
  /** Condition letter as written (P/G/A/W/D/B/R…). */
  condition: string;
  affects: ObjAffect[];
  flagAffects: ObjFlagAffect[];
  extraDescrs: ExtraDescr[];
}

export interface ObjectsSection {
  kind: 'objects';
  objects: MudObject[];
}

// ── #ROOMS ───────────────────────────────────────────────────────────────────

export interface RoomExit {
  /** Door direction 0-9 (N E S W U D NE NW SE SW — diagonals 6-9 are the Phase 12b engine extension). */
  door: number;
  description: string;
  keyword: string;
  /** Lock state 0-4 as written (db.c maps to EX_* bits). */
  locks: number;
  key: number;
  toVnum: number;
}

export interface Room {
  vnum: number;
  name: string;
  description: string;
  /** Legacy "area number" field, read-and-discarded by db.c; preserved verbatim. */
  areaNumber: number;
  roomFlags: number;
  sectorType: number;
  /** `H`/`M`/`C`/`O` optional records; absent when not in the file. */
  healRate?: number;
  manaRate?: number;
  clan?: string;
  owner?: string;
  exits: RoomExit[];
  extraDescrs: ExtraDescr[];
}

export interface RoomsSection {
  kind: 'rooms';
  rooms: Room[];
}

// ── #RESETS ──────────────────────────────────────────────────────────────────

export interface ResetComment {
  command: '*';
  comment: string;
}

export interface Reset {
  /** db.c validates the set; G/R have no arg3, only P/M have arg4. */
  command: 'M' | 'O' | 'P' | 'G' | 'E' | 'D' | 'R';
  ifFlag: number;
  arg1: number;
  arg2: number;
  arg3: number;
  arg4: number;
  /** Trailing line comment, preserved. */
  comment: string;
}

export interface ResetsSection {
  kind: 'resets';
  resets: (Reset | ResetComment)[];
}

// ── #SHOPS ───────────────────────────────────────────────────────────────────

export interface Shop {
  keeper: number;
  buyTypes: [number, number, number, number, number];
  profitBuy: number;
  profitSell: number;
  openHour: number;
  closeHour: number;
  comment: string;
}

export interface ShopsSection {
  kind: 'shops';
  shops: Shop[];
}

// ── #SPECIALS ────────────────────────────────────────────────────────────────

export type Special =
  | { command: 'M'; mobVnum: number; specFun: string; comment: string }
  | { command: '*'; comment: string };

export interface SpecialsSection {
  kind: 'specials';
  specials: Special[];
}

// ── #SOCIALS (db2.c load_socials) ────────────────────────────────────────────

export interface Social {
  name: string;
  /** Rest of the name line (often junk like "0 0"), preserved. */
  nameComment: string;
  /**
   * Up to 8 message lines (char_no_arg, others_no_arg, char_found, others_found,
   * vict_found, char_not_found, char_auto, others_auto). `null` = `$` (unset).
   * Fewer than 8 entries means the social was terminated early by a `#` line.
   */
  fields: (string | null)[];
}

export interface SocialsSection {
  kind: 'socials';
  socials: Social[];
}

// ── #SCRIPTS (MUD Builder extension, merc-mud/2.4/src/mob_prog.c) ────────────

/**
 * Trigger vocabulary accepted by mob_prog.c (mp_trigger_lookup). Kept in sync
 * by hand — the C side is the authority.
 */
export const SCRIPT_TRIGGERS = [
  'act',
  'speech',
  'rand',
  'fight',
  'death',
  'greet',
  'entry',
  'give',
  'bribe',
] as const;

export type ScriptTrigger = (typeof SCRIPT_TRIGGERS)[number];

/**
 * Trigger vocabulary for ROOM scripts (mob_prog.c rp_trigger_lookup) — the C
 * side is the authority. Rooms fire on a walker entering via normal movement;
 * warp arrivals deliberately do not re-trigger (no chain teleports).
 */
export const ROOM_SCRIPT_TRIGGERS = ['entry'] as const;

export type RoomScriptTrigger = (typeof ROOM_SCRIPT_TRIGGERS)[number];

/**
 * Spec_fun vocabulary mirrored by hand from merc-mud/2.4/src/special.c
 * spec_table — the C side is the authority. An unknown name in #SPECIALS is
 * fatal at boot (load_specials: bug + exit), so validation treats it as an
 * error. Note spec_lookup PREFIX-matches (case-insensitive), so any prefix of
 * one of these names is also accepted by the game.
 */
export const SPEC_FUNS = [
  'spec_breath_any',
  'spec_breath_acid',
  'spec_breath_fire',
  'spec_breath_frost',
  'spec_breath_gas',
  'spec_breath_lightning',
  'spec_cast_adept',
  'spec_cast_cleric',
  'spec_cast_judge',
  'spec_cast_mage',
  'spec_cast_undead',
  'spec_executioner',
  'spec_fido',
  'spec_guard',
  'spec_janitor',
  'spec_mayor',
  'spec_poison',
  'spec_thief',
  'spec_nasty',
  'spec_troll_member',
  'spec_ogre_member',
  'spec_patrolman',
] as const;

export type SpecFun = (typeof SPEC_FUNS)[number];

/**
 * One script: `M <mobVnum> <trigger> <phrase~>` (mob) or `R <roomVnum>
 * <trigger> <phrase~>` (room, Phase 12b) followed by a tilde-terminated body
 * of script lines. `trigger` is stored verbatim (the parser does not validate
 * it — validation is a server/C concern so files can round-trip even while
 * being edited).
 */
export interface MobScript {
  /** Absent/'mob' = M entry; 'room' = R entry (mobVnum then holds the ROOM vnum). */
  attach?: 'mob' | 'room';
  /** Vnum of the attached mob (M) or room (R). Field name is historical. */
  mobVnum: number;
  trigger: string;
  /** Match argument: substring for act/speech, percent for rand, ignored otherwise (rooms: unused). */
  phrase: string;
  /** Script lines separated by '\n' (no trailing newline). */
  body: string;
}

export interface ScriptsSection {
  kind: 'scripts';
  scripts: MobScript[];
}

// ── File ─────────────────────────────────────────────────────────────────────

export type AreaSection =
  | AreaHeaderSection
  | HelpsSection
  | MobilesSection
  | ObjectsSection
  | RoomsSection
  | ResetsSection
  | ShopsSection
  | SpecialsSection
  | SocialsSection
  | ScriptsSection;

export interface AreaFile {
  /** Sections in file order (order and multiplicity are preserved on emit). */
  sections: AreaSection[];
}
