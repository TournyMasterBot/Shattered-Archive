// apps/game-client/src/features/autoleveling/autoleveling-saved-targets.ts

/**
 * Saved Manual Targets
 * --------------------
 * Persistence for manually-entered targets on the Configure tab.
 * Stored per continent+zone in localStorage so they reload when the zone is selected.
 */

import type { AutoLevelTarget } from './autoleveling-types';

export type ManualTarget = {
  lookName: string;
  engageName: string;
};

const STORAGE_KEY = 'shatteredarchive:autoleveling:manual-targets';

type ManualTargetStore = Record<string, ManualTarget[]>; // key = `${continent}::${area}` (lowercased)

function storeKey(continent: string, area: string): string {
  return `${continent.trim().toLowerCase()}::${area.trim().toLowerCase()}`;
}

/* ---------- storage ---------- */

export function loadSavedTargets(continent: string, area: string): ManualTarget[] {
  if (!continent || !area) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const store: ManualTargetStore = JSON.parse(raw);
    const entry = store[storeKey(continent, area)];
    return Array.isArray(entry) ? entry.filter(isValidManualTarget) : [];
  } catch {
    return [];
  }
}

export function saveSavedTargets(continent: string, area: string, targets: ManualTarget[]): void {
  if (!continent || !area) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const store: ManualTargetStore = raw ? JSON.parse(raw) : {};
    store[storeKey(continent, area)] = targets;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota errors
  }
}

/* ---------- conversion ---------- */

/**
 * Convert a ManualTarget into a full AutoLevelTarget suitable for the engine.
 * cleanName is prefixed with "manual:" to avoid collisions with API beast entries.
 */
export function manualToAutoLevel(t: ManualTarget): AutoLevelTarget {
  const engage = t.engageName.trim();
  const look = t.lookName.trim();

  // Build keyword list: full engage string first, then individual words, de-duped
  const parts = engage.split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const k of [engage, ...parts]) {
    if (k && !seen.has(k)) { seen.add(k); keywords.push(k); }
  }

  return {
    cleanName: `manual:${look}`,
    name: engage,
    lookName: look,
    keywords,
    immunities: [],
    resistances: [],
    vulnerabilities: [],
    affects: [],
    offensiveTactics: [],
  };
}

/* ---------- validation ---------- */

function isValidManualTarget(obj: unknown): obj is ManualTarget {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as any;
  return typeof o.lookName === 'string' && o.lookName.length > 0 &&
         typeof o.engageName === 'string' && o.engageName.length > 0;
}
