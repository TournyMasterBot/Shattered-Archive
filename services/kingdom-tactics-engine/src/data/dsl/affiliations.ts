// @generated from Constants.cs (AffilitionAllegiance) + curated kingdom/clan classification — do not edit by hand.
// Regenerate: pnpm --filter @shatteredarchive/kingdom-tactics-engine codegen

export type AffiliationKind = 'kingdom' | 'clan' | 'remort' | 'unaffiliated' | 'unknown';
export interface DslAffiliation { readonly id: number; readonly key: string; readonly name: string; readonly kind: AffiliationKind; }

export const AFFILIATIONS = [
  { id: 1, key: 'Loner', name: 'Loner', kind: 'unaffiliated' },
  { id: 2, key: 'Renegade', name: 'Renegade', kind: 'unaffiliated' },
  { id: 3, key: 'Angel', name: 'Angel', kind: 'remort' },
  { id: 4, key: 'Demon', name: 'Demon', kind: 'remort' },
  { id: 5, key: 'Dragon', name: 'Dragon', kind: 'remort' },
  { id: 6, key: 'Giant', name: 'Giant', kind: 'remort' },
  { id: 7, key: 'GrayChurch', name: 'GrayChurch', kind: 'kingdom' },
  { id: 8, key: 'Verminasia', name: 'Verminasia', kind: 'kingdom' },
  { id: 9, key: 'Nordmaar', name: 'Nordmaar', kind: 'kingdom' },
  { id: 10, key: 'Abaddon', name: 'Abaddon', kind: 'kingdom' },
  { id: 11, key: 'Althainia', name: 'Althainia', kind: 'kingdom' },
  { id: 12, key: 'ShalonestiKingdom', name: 'ShalonestiKingdom', kind: 'kingdom' },
  { id: 13, key: 'Ganth', name: 'Ganth', kind: 'kingdom' },
  { id: 14, key: 'NewThalos', name: 'NewThalos', kind: 'kingdom' },
  { id: 15, key: 'Marauders', name: 'Marauders', kind: 'kingdom' },
  { id: 16, key: 'Thaxanos', name: 'Thaxanos', kind: 'kingdom' },
  { id: 17, key: 'Arkane', name: 'Arkane', kind: 'kingdom' },
  { id: 18, key: 'Balifore', name: 'Balifore', kind: 'kingdom' },
  { id: 19, key: 'Darkonin', name: 'Darkonin', kind: 'kingdom' },
  { id: 20, key: 'Knighthood', name: 'Knighthood', kind: 'clan' },
  { id: 21, key: 'Bloodlust', name: 'Bloodlust', kind: 'clan' },
  { id: 22, key: 'Shadow', name: 'Shadow', kind: 'clan' },
  { id: 23, key: 'Justice', name: 'Justice', kind: 'clan' },
  { id: 24, key: 'Wargar', name: 'Wargar', kind: 'clan' },
  { id: 25, key: 'Conclave', name: 'Conclave', kind: 'clan' },
  { id: 26, key: 'BlackRobe', name: 'BlackRobe', kind: 'clan' },
  { id: 27, key: 'RedRobe', name: 'RedRobe', kind: 'clan' },
  { id: 28, key: 'WhiteRobe', name: 'WhiteRobe', kind: 'clan' },
  { id: 29, key: 'ShalonestiClan', name: 'ShalonestiClan', kind: 'clan' },
  { id: 30, key: 'Chaos', name: 'Chaos', kind: 'clan' },
  { id: 31, key: 'Slayers', name: 'Slayers', kind: 'clan' },
] as const satisfies readonly DslAffiliation[];
export type AffiliationKey = (typeof AFFILIATIONS)[number]['key'];
export const KINGDOMS = AFFILIATIONS.filter((a) => a.kind === 'kingdom');
export const CLANS = AFFILIATIONS.filter((a) => a.kind === 'clan');
