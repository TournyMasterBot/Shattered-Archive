// @generated from Constants.cs (AffiliationGods) + curated alignment groups — do not edit by hand.
// Regenerate: pnpm --filter @shatteredarchive/kingdom-tactics-engine codegen

export type GodGroup = 'Good' | 'Neutral' | 'Evil' | 'Chaos' | 'Unknown';
export interface DslGod { readonly id: number; readonly key: string; readonly name: string; readonly group: GodGroup; }

export const GODS = [
  { id: 2, key: 'Austinian', name: 'Austinian', group: 'Good' },
  { id: 4, key: 'Kantilles', name: 'Kantilles', group: 'Good' },
  { id: 8, key: 'Nadrik', name: 'Nadrik', group: 'Good' },
  { id: 16, key: 'Taliena', name: 'Taliena', group: 'Good' },
  { id: 32, key: 'Kadiya', name: 'Kadiya', group: 'Good' },
  { id: 64, key: 'Siccara', name: 'Siccara', group: 'Good' },
  { id: 128, key: 'Kwainin', name: 'Kwainin', group: 'Neutral' },
  { id: 256, key: 'Cliath', name: 'Cliath', group: 'Neutral' },
  { id: 512, key: 'Sebatis', name: 'Sebatis', group: 'Neutral' },
  { id: 1024, key: 'Zandreya', name: 'Zandreya', group: 'Neutral' },
  { id: 2048, key: 'Raije', name: 'Raije', group: 'Neutral' },
  { id: 4096, key: 'Turpa', name: 'Turpa', group: 'Neutral' },
  { id: 8192, key: 'Drakkara', name: 'Drakkara', group: 'Evil' },
  { id: 16384, key: 'Fatale', name: 'Fatale', group: 'Evil' },
  { id: 32768, key: 'Dragoth', name: 'Dragoth', group: 'Evil' },
  { id: 65536, key: 'Devion', name: 'Devion', group: 'Evil' },
  { id: 131072, key: 'Mencius', name: 'Mencius', group: 'Evil' },
  { id: 262144, key: 'Necrucifer', name: 'Necrucifer', group: 'Evil' },
  { id: 524288, key: 'Malachive', name: 'Malachive', group: 'Chaos' },
] as const satisfies readonly DslGod[];
export type GodKey = (typeof GODS)[number]['key'];
