import { damageCategory, elementalGroup } from '../dsl/damage-types.js';

/**
 * The aura catalog — authored data describing the shielding + reactive auras a unit can carry.
 * Auras ride on a token's trait keys (innate) or status-effect keys (granted/charged); the default
 * combat hooks (rules/default-combat-hooks.ts) look each key up here. This is the single tuning
 * surface for aura magnitudes/filters. Pure data + pure lookups — no RNG lives here.
 */

/** shield = adjusts an incoming hit (step 3); reactive = fires back after a landed hit (step 5). */
export type AuraKind = 'shield' | 'reactive';
/** Which incoming damage an aura applies to (by damage-type grouping). */
export type AuraFilter = 'magic' | 'physical' | 'fire' | 'cold' | 'lightning' | 'all';
/** negate → set matching damage to 0; reduce → scale by (1 - magnitude); thorns → reflect. */
export type AuraMode = 'negate' | 'reduce' | 'thorns';

export interface AuraSpec {
  readonly key: string;
  readonly kind: AuraKind;
  readonly filter: AuraFilter;
  readonly mode: AuraMode;
  /** reduce: fraction removed [0,1]; thorns: fraction of dealt reflected [0,1]; negate: unused. */
  readonly magnitude: number;
}

/**
 * A special avoidance aura key: when present on a defender it lets a SPELL's damage component be
 * avoided (spells otherwise auto-hit and skip the avoidance step). Handled directly by the default
 * hooks' onAvoid, not through the shield/reactive lookups.
 */
export const MAGIC_EVASION_KEY = 'magic-evasion' as const;

export const AURA_CATALOG: Readonly<Record<string, AuraSpec>> = {
  'shield-magic': { key: 'shield-magic', kind: 'shield', filter: 'magic', mode: 'negate', magnitude: 1 },
  'ward-fire': { key: 'ward-fire', kind: 'shield', filter: 'fire', mode: 'reduce', magnitude: 0.5 },
  'ward-cold': { key: 'ward-cold', kind: 'shield', filter: 'cold', mode: 'reduce', magnitude: 0.5 },
  'ward-lightning': { key: 'ward-lightning', kind: 'shield', filter: 'lightning', mode: 'reduce', magnitude: 0.5 },
  thorns: { key: 'thorns', kind: 'reactive', filter: 'all', mode: 'thorns', magnitude: 0.5 },
};

/** Resolve the aura specs present among a token's trait + status keys (unknown keys ignored). */
export function aurasFor(keys: readonly string[]): AuraSpec[] {
  const out: AuraSpec[] = [];
  for (const k of keys) {
    const spec = AURA_CATALOG[k];
    if (spec) out.push(spec);
  }
  return out;
}

/** Shielding (step-3) auras present on a token. */
export function shieldsFor(keys: readonly string[]): AuraSpec[] {
  return aurasFor(keys).filter((a) => a.kind === 'shield');
}

/** Reactive (step-5) auras present on a token. */
export function reactivesFor(keys: readonly string[]): AuraSpec[] {
  return aurasFor(keys).filter((a) => a.kind === 'reactive');
}

/** True if an aura's damage-type filter matches the incoming attacker damage type. */
export function auraFilterMatches(filter: AuraFilter, damageType: string): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'magic':
      return damageCategory(damageType) === 'magic';
    case 'physical':
      return damageCategory(damageType) === 'physical';
    default:
      return elementalGroup(damageType) === filter; // fire | cold | lightning
  }
}
