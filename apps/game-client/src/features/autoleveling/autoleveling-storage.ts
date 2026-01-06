// apps/game-client/src/features/autoleveling/autoleveling-storage.ts

import type { AutoLevelConfig } from './autoleveling-types';
import { createDefaultAutoLevelConfig } from './autoleveling-defaults';

const KEY_PREFIX = 'autoleveling-config-v2:';

function keyFor(connectionId: string): string {
  return `${KEY_PREFIX}${connectionId || 'default'}`;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function coerceConfig(raw: unknown, fallback: AutoLevelConfig): AutoLevelConfig {
  if (!isObject(raw)) return fallback;

  // HARD gate: v2 only. Breaking change is intentional.
  if (raw.version !== 2) return fallback;

  // Keep it conservative: fill missing fields from fallback, but do not attempt v1 migration here.
  return {
    ...fallback,
    ...raw,
    init: {
      ...fallback.init,
      ...(isObject(raw.init) ? (raw.init as any) : {}),
      targets: Array.isArray((raw as any)?.init?.targets) ? ((raw as any).init.targets as any[]) : fallback.init.targets,
    },
    steps: {
      ...fallback.steps,
      ...(isObject(raw.steps) ? (raw.steps as any) : {}),
    },
  };
}

export function loadAutoLevelConfig(connectionId: string, fallback?: AutoLevelConfig): AutoLevelConfig {
  const fb = fallback ?? createDefaultAutoLevelConfig();

  try {
    const raw = localStorage.getItem(keyFor(connectionId));
    if (!raw) return fb;

    const parsed = JSON.parse(raw) as unknown;
    return coerceConfig(parsed, fb);
  } catch {
    return fb;
  }
}

export function saveAutoLevelConfig(connectionId: string, config: AutoLevelConfig): void {
  try {
    localStorage.setItem(keyFor(connectionId), JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function resetAutoLevelConfig(connectionId: string, fallback?: AutoLevelConfig): AutoLevelConfig {
  const fb = fallback ?? createDefaultAutoLevelConfig();
  saveAutoLevelConfig(connectionId, fb);
  return fb;
}
