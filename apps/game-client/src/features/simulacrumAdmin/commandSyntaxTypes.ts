/**
 * The shape of a hand-written syntax entry (commandSyntax.ts). The list of commands, their levels and aliases is
 * generated from the game (commandTable.generated.ts); only the argument shapes live here.
 */

export type CommandGroup = 'players' | 'world' | 'server' | 'communication' | 'inspection' | 'settings';

/**
 * How a value is checked and rendered:
 *  - character: one word naming a player or mobile (no space)
 *  - word: one word (no space)
 *  - text: free text to the end of the line
 *  - number: integer inside `min`..`max`
 *  - vnum: a positive integer room, mobile or object number
 *  - areaFile: an area file name such as `midgaard.are`
 *  - choice: one of `choices`
 *  - flags: space-separated flag words, each optionally prefixed with `+`, `-` or `=`
 */
export type FieldType = 'character' | 'word' | 'text' | 'number' | 'vnum' | 'areaFile' | 'choice' | 'flags';

export interface FieldSpec {
  id: string;
  label: string;
  type: FieldType;
  optional?: boolean;
  /** Required for `choice`. */
  choices?: readonly string[];
  min?: number;
  max?: number;
  placeholder?: string;
}

/**
 * A value that widens a command to many targets (ADMIN-02). `value` rules match one of `values` (case-insensitive),
 * `wildcard` fires on `*`. A form that is always wide (`restore all`, `purge` with no argument) sets `confirm` instead.
 */
export interface BulkRule {
  field: string;
  kind: 'value' | 'wildcard';
  values?: readonly string[];
  /** Shown to the owner in the confirmation. */
  scope: string;
}

/** Where a character-directed form is listed on the Players tab. */
export type PlayerCategory = 'inspect' | 'restrict' | 'punish' | 'restore' | 'move' | 'advanced';

export interface FormSpec {
  id: string;
  label: string;
  /** Words sent before the fields, for example `['load', 'mob']`. */
  literal?: readonly string[];
  fields: readonly FieldSpec[];
  /** Never asks, although the command is in the destructive set: the form only reads or explains (`ban` list, `copyover` info). */
  safe?: boolean;
  /** Always ask before sending this form. */
  confirm?: boolean;
  /** What the confirmation says is at stake (used when `confirm` is set). */
  confirmText?: string;
  bulk?: readonly BulkRule[];
  /** Listed on the Players tab when the first field is a `character`. */
  category?: PlayerCategory;
  /** Lines that mean the game did it; matched against the reply text. */
  success?: readonly RegExp[];
}

export interface CommandSyntax {
  group: CommandGroup;
  summary: string;
  forms: readonly FormSpec[];
  /** Every form of the command is in the approved destructive set (the owner approved it in Phase 6). */
  destructive?: boolean;
  /** Reply lines that mean success for any form without its own `success`. */
  success?: readonly RegExp[];
}
