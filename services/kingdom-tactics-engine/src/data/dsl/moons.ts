// @generated from Constants.cs (MoonType/MoonPhase/MoonPosition/MoonDirection) — do not edit by hand.
// Regenerate: pnpm --filter @shatteredarchive/kingdom-tactics-engine codegen

export interface DslNamed { readonly id: number; readonly key: string; readonly name: string; }

export const MOON_TYPES = [
  { id: 1, key: 'Black', name: 'Black Moon' },
  { id: 2, key: 'Red', name: 'Red Moon' },
  { id: 3, key: 'White', name: 'White Moon' },
] as const satisfies readonly DslNamed[];
export type MoonTypeKey = (typeof MOON_TYPES)[number]['key'];

export const MOON_PHASES = [
  { id: 1, key: 'Empty', name: 'Empty' },
  { id: 2, key: 'Crescent', name: 'Crescent Moon' },
  { id: 3, key: 'HalfMoon', name: '1/2 Moon' },
  { id: 4, key: 'ThreeQuartersMoon', name: '3/4 Moon' },
  { id: 5, key: 'FullMoon', name: 'Full Moon' },
] as const satisfies readonly DslNamed[];
export type MoonPhaseKey = (typeof MOON_PHASES)[number]['key'];

export const MOON_POSITIONS = [
  { id: 1, key: 'NotVisible', name: 'Not Visible' },
  { id: 2, key: 'Rising', name: 'Rising' },
  { id: 3, key: 'HighSanction', name: 'High Sanction' },
  { id: 4, key: 'Setting', name: 'Setting' },
] as const satisfies readonly DslNamed[];
export type MoonPositionKey = (typeof MOON_POSITIONS)[number]['key'];

export const MOON_DIRECTIONS = [
  { id: 1, key: 'Waxing', name: 'Waxing' },
  { id: 2, key: 'Waning', name: 'Waning' },
] as const satisfies readonly DslNamed[];
export type MoonDirectionKey = (typeof MOON_DIRECTIONS)[number]['key'];
