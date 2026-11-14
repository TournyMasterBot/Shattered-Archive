import { ACTION_KINDS, SPHERES, type ActionKind, type Sphere } from '../contracts.js';
import { isNeverAuto } from './floor.js';

export const SETTINGS_SCHEMA_VERSION = 1;
export const MIN_STALE_SECONDS = 5;
export const MAX_STALE_SECONDS = 3600;
export const DEFAULT_STALE_SECONDS = 60;
export const MIN_THRESHOLD = 0.5;
export const MAX_THRESHOLD = 0.99;
export const DEFAULT_THRESHOLD = 0.9;

export interface TrustRule {
  enabled: boolean;
  /** Minimum effective confidence for the rule to run a suggestion by itself. */
  threshold: number;
}

export interface TrustSettings {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  /** The log feed counts as stale (nothing runs by itself) after this many seconds without text. */
  staleAfterSeconds: number;
  /**
   * Auto-approval rules keyed `<sphere>:<kind>`. A bucket with no entry is off. Only auto-eligible kinds can appear: the hard
   * floor and the never-auto kinds are removed by `normalizeSettings` whatever a stored blob says. A map, not a list, so the
   * order in which rules were added can never matter.
   */
  rules: Record<string, TrustRule>;
}

export const DEFAULT_RULE: Readonly<TrustRule> = { enabled: false, threshold: DEFAULT_THRESHOLD };

/** Everything off; the owner turns things on. */
export const DEFAULT_SETTINGS: Readonly<TrustSettings> = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  staleAfterSeconds: DEFAULT_STALE_SECONDS,
  rules: {},
};

export function ruleKey(sphere: Sphere, kind: ActionKind): string {
  return `${sphere}:${kind}`;
}

/** The rule for a bucket, or the default (off) rule. */
export function ruleFor(settings: TrustSettings, sphere: Sphere, kind: ActionKind): TrustRule {
  const key = ruleKey(sphere, kind);
  return Object.hasOwn(settings.rules, key) ? settings.rules[key] : { ...DEFAULT_RULE };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRule(value: unknown): TrustRule | undefined {
  if (!isRecord(value) || typeof value.enabled !== 'boolean') return undefined;
  if (value.threshold === undefined) return { enabled: value.enabled, threshold: DEFAULT_THRESHOLD };
  const t = value.threshold;
  // a string ("0.9"), NaN or an out-of-range number is not a threshold: the whole rule is dropped, which means off
  if (typeof t !== 'number' || !Number.isFinite(t) || t < MIN_THRESHOLD || t > MAX_THRESHOLD) return undefined;
  return { enabled: value.enabled, threshold: t };
}

/**
 * The ONE function every route writes through (the editor, the reset button, the cross-tab `storage` event, an older client):
 * turns anything into valid settings, never throws, and falls back to the default for any field it cannot read. A rule for a
 * never-auto kind, an unknown sphere or kind, or with an unreadable value is dropped, so a stored blob can never switch on the floor.
 */
export function normalizeSettings(input: unknown): TrustSettings {
  const source = isRecord(input) ? input : {};

  const stale = source.staleAfterSeconds;
  const staleAfterSeconds =
    typeof stale === 'number' && Number.isInteger(stale) && stale >= MIN_STALE_SECONDS && stale <= MAX_STALE_SECONDS
      ? stale
      : DEFAULT_STALE_SECONDS;

  const rules: Record<string, TrustRule> = {};
  const given = isRecord(source.rules) ? source.rules : {};
  // canonical order: by sphere, then by kind, so equal settings serialise identically
  for (const sphere of SPHERES) {
    for (const kind of ACTION_KINDS) {
      const key = ruleKey(sphere, kind);
      if (!Object.hasOwn(given, key) || isNeverAuto(kind)) continue;
      const rule = normalizeRule(given[key]);
      if (rule) rules[key] = rule;
    }
  }
  return { schemaVersion: SETTINGS_SCHEMA_VERSION, staleAfterSeconds, rules };
}

/** Strict structural equality (SETTINGS-02): no coercion, arrays by order, objects by key regardless of order. */
export function settingsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => settingsEqual(item, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keysA = Object.keys(a);
    return keysA.length === Object.keys(b).length && keysA.every((key) => Object.hasOwn(b, key) && settingsEqual(a[key], b[key]));
  }
  return false;
}

export interface StoredSettings {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  staleAfterSeconds?: number;
  rules?: Record<string, TrustRule>;
}

/**
 * What to persist (SETTINGS-01): only the values that differ from the defaults, or `null` when nothing does (then remove the stored
 * key). Normalises first, so every route stores the same shape. Keys left alone follow future changes to the defaults.
 */
export function toStored(settings: unknown): StoredSettings | null {
  const n = normalizeSettings(settings);
  const out: StoredSettings = { schemaVersion: SETTINGS_SCHEMA_VERSION };
  if (n.staleAfterSeconds !== DEFAULT_SETTINGS.staleAfterSeconds) out.staleAfterSeconds = n.staleAfterSeconds;
  const rules: Record<string, TrustRule> = {};
  for (const [key, rule] of Object.entries(n.rules)) {
    if (!settingsEqual(rule, DEFAULT_RULE)) rules[key] = rule;
  }
  if (Object.keys(rules).length > 0) out.rules = rules;
  return out.staleAfterSeconds === undefined && out.rules === undefined ? null : out;
}
