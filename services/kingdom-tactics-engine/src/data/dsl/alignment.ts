// @generated from Constants.cs (Alignment, StatAttributes) — do not edit by hand.
// Regenerate: pnpm --filter @shatteredarchive/kingdom-tactics-engine codegen

export interface DslNamed { readonly id: number; readonly key: string; readonly name: string; }

export const ALIGNMENTS = [
  { id: 2, key: 'Good', name: 'Good' },
  { id: 4, key: 'Neutral', name: 'Neutral' },
  { id: 8, key: 'Evil', name: 'Evil' },
  { id: 16, key: 'Mixed', name: 'Mixed' },
] as const satisfies readonly DslNamed[];
export type AlignmentKey = (typeof ALIGNMENTS)[number]['key'];

export const STAT_ATTRIBUTES = [
  { id: 1, key: 'Strength', name: 'str' },
  { id: 2, key: 'Intelligence', name: 'int' },
  { id: 4, key: 'Wisdom', name: 'wis' },
  { id: 8, key: 'Dexterity', name: 'dex' },
  { id: 16, key: 'Constitution', name: 'con' },
] as const satisfies readonly DslNamed[];
export type StatAttributeKey = (typeof STAT_ATTRIBUTES)[number]['key'];
