// apps/game-client/src/features/autoleveling/autoleveling-storage.ts

/**
 * Autoleveling Storage (localStorage)
 * -----------------------------------
 * Intent:
 * - Persist config per connectionId using a versioned key prefix.
 * - Hard-gate to v3. A stored v2 config (the old modal's shape) is migrated
 *   forward once on load; anything else falls back to the default.
 * - Coerce missing fields from fallback conservatively.
 */

import type { AutoLevelConfig } from './autoleveling-types';
import { createDefaultAutoLevelConfig } from './autoleveling-defaults';
import { migrateAutoLevelConfigV2ToV3 } from './autoleveling-normalize';

/* ----------------------------- debug helpers ------------------------------ */

const STORAGE_LOG_PREFIX = '[autoleveling][storage]';

function isAutoLevelingDebugEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && (window as any).__AUTOLEVELING_DEBUG__ === true) return true;

    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('autoleveling.debug') : null;
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;

    try {
      const dev = typeof import.meta !== 'undefined' && !!(import.meta as any).env?.DEV;
      return dev;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

function sdbg(...args: any[]) {
  return;
  if (!isAutoLevelingDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.debug(STORAGE_LOG_PREFIX, ...args);
}

function swarn(...args: any[]) {
  if (!isAutoLevelingDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.warn(STORAGE_LOG_PREFIX, ...args);
}

/* ------------------------------------------------------------------------- */

const KEY_PREFIX = 'autoleveling-config-v3:';
const KEY_PREFIX_V2 = 'autoleveling-config-v2:';

function keyFor(connectionId: string): string {
  return `${KEY_PREFIX}${connectionId || 'default'}`;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function coerceConfig(raw: unknown, fallback: AutoLevelConfig): AutoLevelConfig {
  if (!isObject(raw)) {
    sdbg('coerceConfig: raw not object -> fallback');
    return fallback;
  }

  // HARD gate: v3. A stored v2 blob (old modal) is migrated forward; anything
  // else falls back to the default.
  let src = raw as Record<string, any>;
  if (src.version === 2) {
    sdbg('coerceConfig: migrating v2 -> v3');
    src = migrateAutoLevelConfigV2ToV3(src) as unknown as Record<string, any>;
  } else if (src.version !== 3) {
    sdbg('coerceConfig: version mismatch -> fallback', { got: src.version });
    return fallback;
  }

  // Keep it conservative: fill missing fields from fallback.
  const next: AutoLevelConfig = {
    ...fallback,
    ...src,
    criticalBuffs: Array.isArray(src.criticalBuffs) ? src.criticalBuffs : fallback.criticalBuffs,
    init: {
      ...fallback.init,
      ...(isObject(src.init) ? src.init : {}),
      targets: Array.isArray(src.init?.targets) ? src.init.targets : fallback.init.targets,
    },
    steps: {
      ...fallback.steps,
      ...(isObject(src.steps) ? src.steps : {}),
    },
  };

  sdbg('coerceConfig: success', {
    mode: next.mode,
    targets: next.init.targets?.length ?? 0,
    trainingPath: next.init.trainingPath,
  });

  return next;
}

export function loadAutoLevelConfig(connectionId: string, fallback?: AutoLevelConfig): AutoLevelConfig {
  const fb = fallback ?? createDefaultAutoLevelConfig();

  try {
    const k = keyFor(connectionId);
    let raw = localStorage.getItem(k);
    let migratedFromV2 = false;

    if (!raw) {
      // One-time forward migration from the old modal's v2 key.
      raw = localStorage.getItem(`${KEY_PREFIX_V2}${connectionId || 'default'}`);
      if (!raw) {
        sdbg('load: miss -> fallback', { key: k });
        return fb;
      }
      migratedFromV2 = true;
      sdbg('load: v3 miss, found v2 -> migrating', { key: k });
    }

    const parsed = JSON.parse(raw) as unknown;
    sdbg('load: hit', { key: k, bytes: raw.length });
    const config = coerceConfig(parsed, fb);
    if (migratedFromV2) saveAutoLevelConfig(connectionId, config); // persist under v3
    return config;
  } catch (e) {
    swarn('load: error -> fallback', e);
    return fb;
  }
}

export function saveAutoLevelConfig(connectionId: string, config: AutoLevelConfig): void {
  try {
    const k = keyFor(connectionId);
    const json = JSON.stringify(config);
    localStorage.setItem(k, json);
    sdbg('save: ok', { key: k, bytes: json.length, mode: config.mode });
  } catch (e) {
    swarn('save: error (ignored)', e);
  }
}

export function resetAutoLevelConfig(connectionId: string, fallback?: AutoLevelConfig): AutoLevelConfig {
  const fb = fallback ?? createDefaultAutoLevelConfig();
  sdbg('reset: writing fallback', { connectionId });
  saveAutoLevelConfig(connectionId, fb);
  return fb;
}
