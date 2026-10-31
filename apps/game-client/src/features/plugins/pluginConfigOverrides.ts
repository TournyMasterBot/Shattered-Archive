// apps/game-client/src/features/plugins/pluginConfigOverrides.ts
import type { PluginId } from '@shatteredarchive/types-client';
import { findCorePlugin } from './registry';

type Config = Record<string, unknown>;

function isPlainObject(v: unknown): v is Config {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * True when `value` is the same JSON-like value as `def`. Strict and structural: no type coercion (`"5"` is not `5`),
 * arrays compare by position, objects by key set regardless of key order, anything else by `===`.
 */
export function isSameAsDefault(value: unknown, def: unknown): boolean {
  if (value === def) return true;

  if (Array.isArray(value) || Array.isArray(def)) {
    if (!Array.isArray(value) || !Array.isArray(def) || value.length !== def.length) return false;
    return value.every((item, i) => isSameAsDefault(item, def[i]));
  }

  if (isPlainObject(value) && isPlainObject(def)) {
    const keys = Object.keys(value);
    if (keys.length !== Object.keys(def).length) return false;
    return keys.every((k) => Object.prototype.hasOwnProperty.call(def, k) && isSameAsDefault(value[k], def[k]));
  }

  return false;
}

/**
 * The part of `config` that differs from `defaults`: what a plugin's saved settings should hold, so every setting the
 * user has not changed keeps following the plugin's shipped defaults.
 *
 * Drops `undefined` values and values equal to their default; keeps keys that have no default at all and keeps `null`
 * (unless the default is `null` too). Returns a NEW object and never mutates `config`, which may be frozen or shared.
 */
export function toOverrides(config: Config, defaults: Config): Config {
  const out: Config = {};
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) continue;
    if (Object.prototype.hasOwnProperty.call(defaults, key) && isSameAsDefault(value, defaults[key])) continue;
    out[key] = value;
  }
  return out;
}

/**
 * `toOverrides` applied to the `userConfig` of every record whose plugin has known defaults. A record with no known
 * defaults (an unregistered plugin) is left exactly as stored. Returns the SAME array and `changed: false` when nothing
 * was dropped, so callers can skip a write; otherwise only the affected records are replaced.
 */
export function pruneRecordOverrides<T extends { id: string; userConfig: Config }>(
  records: T[],
  defaultsFor: (id: string) => Config | undefined,
): { records: T[]; changed: boolean } {
  let changed = false;
  const next = records.map((rec) => {
    const defaults = defaultsFor(rec.id);
    if (!defaults) return rec;

    const stored = rec.userConfig ?? {};
    const pruned = toOverrides(stored, defaults);
    // `pruned` only ever drops keys, so an equal key count means nothing was dropped.
    if (Object.keys(pruned).length === Object.keys(stored).length) return rec;

    changed = true;
    return { ...rec, userConfig: pruned };
  });
  return changed ? { records: next, changed } : { records, changed: false };
}

const defaultsCache = new Map<string, Config | undefined>();

/** The defaults a core plugin declares in its config schema, or undefined for an unknown plugin. Memoized per id. */
export function corePluginDefaults(id: string): Config | undefined {
  if (defaultsCache.has(id)) return defaultsCache.get(id);
  const defaults = findCorePlugin(id as PluginId)?.create().configSchema?.defaults;
  defaultsCache.set(id, defaults);
  return defaults;
}
