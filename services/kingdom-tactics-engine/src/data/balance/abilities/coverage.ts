/**
 * Ability-mechanics coverage — pure computation of how many of each playable class kit's
 * abilities have authored mechanics (vs the no-op stub). Drives the `ability:coverage` CLI and
 * the mechanics tests, and is the resumption signal: authoring proceeds kit-by-kit until every
 * playable kit is 100% authored.
 */
import { CLASS_KITS } from '../class-kits.js';
import { CLASS_ATTRIBUTES } from '../../dsl/class-attributes.js';
import { ABILITIES } from '../../dsl/abilities.js';
import { isAuthored } from './resolve.js';

/** Class keys that are actually playable today (have an authored class kit). */
export const PLAYABLE_KITS: readonly string[] = Object.keys(CLASS_KITS);

const CATALOG_KEYS = new Set(ABILITIES.map((a) => a.key));
const ATTRS_BY_CLASS = new Map<string, (typeof CLASS_ATTRIBUTES)[number]>(
  CLASS_ATTRIBUTES.map((c) => [c.key, c]),
);

/** The catalog ability keys a class grants (from CLASS_ATTRIBUTES, filtered to the catalog). */
export function kitAbilityKeys(classKey: string): string[] {
  const attrs = ATTRS_BY_CLASS.get(classKey);
  if (!attrs) return [];
  const seen = new Set<string>();
  for (const a of attrs.abilities) if (CATALOG_KEYS.has(a.key)) seen.add(a.key);
  return [...seen].sort();
}

export interface KitCoverage {
  readonly classKey: string;
  readonly total: number;
  readonly authored: number;
  /** Ability keys still on the no-op stub — the authoring to-do for this kit. */
  readonly missing: readonly string[];
}

export function kitCoverage(classKey: string): KitCoverage {
  const keys = kitAbilityKeys(classKey);
  const missing = keys.filter((k) => !isAuthored(k));
  return { classKey, total: keys.length, authored: keys.length - missing.length, missing };
}

export function allKitCoverage(): KitCoverage[] {
  return PLAYABLE_KITS.map(kitCoverage);
}

/** The first playable kit that is not yet fully authored (resumption pointer), or undefined. */
export function nextIncompleteKit(): KitCoverage | undefined {
  return allKitCoverage().find((k) => k.missing.length > 0);
}

/** Overall authored-vs-catalog totals (catalog = every DSL ability). */
export function overallCoverage(): { authored: number; total: number } {
  const authored = ABILITIES.filter((a) => isAuthored(a.key)).length;
  return { authored, total: ABILITIES.length };
}
