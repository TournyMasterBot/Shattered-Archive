/**
 * What DSL's GMCP looks like, as read from its live traffic (about 1.16 million messages, 2026-01-01 to 2026-11-07; see docs/game/gmcp-parity.md
 * and scripts/gmcp-corpus/). The parity check compares the simulacrum's messages with this. It is data, not behaviour: when the corpus is read
 * again and something changed, this file is what changes.
 *
 * Only enum-like fields carry value sets; free text (names, room names, affect names) has none, so a finding about it never repeats the text.
 */

export type FieldType = 'string' | 'number' | 'boolean' | 'string[]';

export interface FieldSpec {
  type: FieldType;
  /** Absent from some DSL messages (`clan`, `kingdom`, `chamber`). */
  optional?: boolean;
  /** The values DSL sends for this field (for `string[]`, for each element). */
  values?: readonly string[];
  /**
   * true: a value outside `values` is a real difference. false: DSL's set is only what was *seen*, so another value is just noted
   * (the engine's affect locations are a superset of what DSL has happened to show).
   */
  strictValues?: boolean;
  /** Values the simulacrum sends on purpose, by the owner's decision: shown as a note, not a difference. */
  knownDifferences?: readonly string[];
  /** A string field that must look like this (the game clock). */
  pattern?: RegExp;
}

export interface PackageSpec {
  name: string;
  fields: Readonly<Record<string, FieldSpec>>;
  /** A field that is an array of objects (`affect_data.affects`), and the shape of each element. */
  list?: { key: string; fields: Readonly<Record<string, FieldSpec>> };
}

const num: FieldSpec = { type: 'number' };
const bool: FieldSpec = { type: 'boolean' };
const str: FieldSpec = { type: 'string' };

/** "9:00pm", "12:30am": hour 1-12, minutes 00 or 30 (every DSL tick is half a game hour). */
const GAME_CLOCK = /^(1[0-2]|[1-9]):(00|30)(am|pm)$/;

const AFFECT_FIELDS: Readonly<Record<string, FieldSpec>> = {
  n: str,
  d: num,
  m: num,
  lc: {
    type: 'string',
    strictValues: false,
    values: [
      'none',
      'armor class',
      'hit roll',
      'saves',
      'dexterity',
      'damage roll',
      'strength',
      'constitution',
      'moves',
      'hp',
      'intelligence',
      'wisdom',
      'mana',
      'sex',
      'level',
    ],
  },
  // Documented as 0 = spell, 1 = song; DSL's live values go well beyond that (docs/game/gmcp-parity.md), so only the type is checked.
  t: num,
};

export const DSL_PACKAGES: readonly PackageSpec[] = [
  {
    name: 'login_data',
    fields: {
      name: str,
      is_clan: bool,
      clan: { type: 'string', optional: true },
      is_kingdom: bool,
      kingdom: { type: 'string', optional: true },
      level: num,
      time: { type: 'string', pattern: GAME_CLOCK },
    },
  },
  {
    name: 'char_data',
    fields: {
      hp: num,
      max_hp: num,
      mana: num,
      max_mana: num,
      move: num,
      max_move: num,
      gold: num,
      silver: num,
      wimpy: num,
      str: num,
      max_str: num,
      int: num,
      max_int: num,
      wis: num,
      max_wis: num,
      dex: num,
      max_dex: num,
      con: num,
      max_con: num,
      stance: { type: 'string', strictValues: true, values: ['Offensive', 'Defensive', 'neutral'] },
      language: {
        type: 'string',
        strictValues: true,
        values: ['Common', 'common', 'Dragon', 'Yinnish', 'Goblin', 'Althainian', 'Elvish', 'Ogre', 'Dwarvish', 'Leonine'],
        // the engine keeps its own lowercase words for languages (owner's decision, 2026-11-07)
        knownDifferences: ['elven', 'dwarven', 'giant'],
      },
      tnl: num,
      carry_weight: num,
      can_carry_weight: num,
      is_afk: bool,
      is_quiet: bool,
      is_flying: bool,
      is_riding: bool,
      is_fighting: bool,
      // DSL sends it only for dragons (386 of 517,844 messages); the engine has no equivalent
      chamber: { type: 'number', optional: true },
    },
  },
  {
    name: 'room_data',
    fields: {
      room: str,
      sector: {
        type: 'string',
        strictValues: true,
        values: [
          'inside',
          'forest',
          'field',
          'city',
          'air',
          'desert',
          'underground',
          'underwater',
          'mountain',
          'tundra',
          'hills',
          'ice',
          'ocean',
          'swim',
          'noswim',
        ],
      },
      exits: { type: 'string[]', strictValues: true, values: ['N', 'E', 'S', 'W', 'U', 'D', 'NE', 'NW', 'SE', 'SW'] },
    },
  },
  { name: 'tick', fields: { time: { type: 'string', pattern: GAME_CLOCK } } },
  { name: 'add_affect', fields: AFFECT_FIELDS },
  { name: 'remove_affect', fields: { n: str } },
  { name: 'affect_data', fields: {}, list: { key: 'affects', fields: AFFECT_FIELDS } },
];

export const DSL_PACKAGE_NAMES: readonly string[] = DSL_PACKAGES.map((p) => p.name);

export function findPackage(name: string): PackageSpec | undefined {
  return DSL_PACKAGES.find((p) => p.name === name);
}
