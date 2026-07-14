import type { MatchStartPayload } from './nav';

/**
 * Persists the most recently started match setup to `localStorage` so it survives a reload and
 * can be replayed from the menu ("Play last"). Guarded — a missing/broken store just yields null.
 */

const STORAGE_KEY = 'kt.lastMatch';

export function saveLastMatch(payload: MatchStartPayload): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable — the setting simply doesn't persist */
  }
}

export function loadLastMatch(): MatchStartPayload | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MatchStartPayload;
    if (!parsed || !parsed.modeId || !Array.isArray(parsed.rosters)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLastMatch(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
