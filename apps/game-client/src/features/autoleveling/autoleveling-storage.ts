// apps/game-client/src/features/autoleveling/autoleveling-storage.ts

/**
 * Autoleveling Storage (localStorage)
 * -----------------------------------
 * Intent:
 * - Persist config per connectionId using a versioned key prefix.
 * - Hard-gate to v2 only. If stored data isn't v2, return fallback.
 * - Coerce missing fields from fallback conservatively.
 */

import type { AutoLevelConfig } from './autoleveling-types';
import { createDefaultAutoLevelConfig } from './autoleveling-defaults';

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

const KEY_PREFIX = 'autoleveling-config-v2:';

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

  // HARD gate: v2 only. Breaking change is intentional.
  if ((raw as any).version !== 2) {
    sdbg('coerceConfig: version mismatch -> fallback', { got: (raw as any).version });
    return fallback;
  }

  // Keep it conservative: fill missing fields from fallback, but do not attempt v1 migration here.
  const next: AutoLevelConfig = {
    ...fallback,
    ...(raw as any),
    init: {
      ...fallback.init,
      ...(isObject((raw as any).init) ? ((raw as any).init as any) : {}),
      targets: Array.isArray((raw as any)?.init?.targets)
        ? ((raw as any).init.targets as any[])
        : fallback.init.targets,
    },
    steps: {
      ...fallback.steps,
      ...(isObject((raw as any).steps) ? ((raw as any).steps as any) : {}),
    },
  };

  sdbg('coerceConfig: success', {
    enabled: next.enabled,
    targets: next.init.targets?.length ?? 0,
    trainingPath: next.init.trainingPath,
  });

  return next;
}

export function loadAutoLevelConfig(connectionId: string, fallback?: AutoLevelConfig): AutoLevelConfig {
  const fb = fallback ?? createDefaultAutoLevelConfig();

  try {
    const k = keyFor(connectionId);
    const raw = localStorage.getItem(k);
    if (!raw) {
      sdbg('load: miss -> fallback', { key: k });
      return fb;
    }

    const parsed = JSON.parse(raw) as unknown;
    sdbg('load: hit', { key: k, bytes: raw.length });
    return coerceConfig(parsed, fb);
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
    sdbg('save: ok', { key: k, bytes: json.length, enabled: config.enabled });
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
