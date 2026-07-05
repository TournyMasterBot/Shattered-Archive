// @generated from Constants.cs (TerrainTypes) — do not edit by hand.
// Regenerate: pnpm --filter @shatteredarchive/kingdom-tactics-engine codegen

export interface DslTerrain { readonly id: number; readonly key: string; readonly name: string; }

export const TERRAINS = [
  { id: 1, key: 'City', name: 'City' },
  { id: 2, key: 'Field', name: 'Field' },
  { id: 4, key: 'Forest', name: 'Forest' },
  { id: 8, key: 'Mountain', name: 'Mountain' },
  { id: 16, key: 'Water', name: 'Water' },
  { id: 32, key: 'Air', name: 'Air' },
  { id: 64, key: 'Desert', name: 'Desert' },
  { id: 128, key: 'Underground', name: 'Underground' },
  { id: 256, key: 'Underwater', name: 'Underwater' },
  { id: 512, key: 'Tundra', name: 'Tundra' },
  { id: 1024, key: 'Ice', name: 'Ice' },
  { id: 2048, key: 'Ocean', name: 'Ocean' },
  { id: 4096, key: 'Hills', name: 'Hills' },
  { id: 8192, key: 'Indoors', name: 'Indoors' },
] as const satisfies readonly DslTerrain[];
export type TerrainKey = (typeof TERRAINS)[number]['key'];
