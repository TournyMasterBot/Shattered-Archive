/**
 * Named army rosters persisted in `localStorage`, reusable across matches. Stored as plain
 * pick lists (race×class); the engine re-resolves costs/units at build time, so saved data
 * stays valid across rebalances. All access is guarded so a missing/broken store degrades to
 * an empty list rather than throwing.
 */

export interface ArmyPick {
  readonly raceKey: string;
  readonly classKey: string;
}

export interface SavedArmy {
  readonly name: string;
  readonly picks: readonly ArmyPick[];
}

const STORAGE_KEY = 'kt.savedArmies';

function readStore(): SavedArmy[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedArmy[]) : [];
  } catch {
    return [];
  }
}

function writeStore(armies: readonly SavedArmy[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(armies));
  } catch {
    /* storage unavailable / full — saved armies simply don't persist */
  }
}

/** All saved armies, newest last. */
export function listSavedArmies(): SavedArmy[] {
  return readStore();
}

/** Save (or overwrite by name) an army; returns the updated list. */
export function saveArmy(name: string, picks: readonly ArmyPick[]): SavedArmy[] {
  const trimmed = name.trim();
  if (!trimmed) return readStore();
  const next = readStore().filter((a) => a.name !== trimmed);
  next.push({ name: trimmed, picks: picks.map((p) => ({ raceKey: p.raceKey, classKey: p.classKey })) });
  writeStore(next);
  return next;
}

/** Remove a saved army by name; returns the updated list. */
export function removeArmy(name: string): SavedArmy[] {
  const next = readStore().filter((a) => a.name !== name);
  writeStore(next);
  return next;
}
