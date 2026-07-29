/**
 * Phase F: cloud-account bearer token storage. Matches this codebase's existing per-feature
 * idiom (own STORAGE_KEY, inline try/catch, no shared wrapper — see `state/saved-armies.ts`
 * for the same shape), and the `kt.` key-prefix convention already used there and in
 * `state/last-match.ts`.
 */

const STORAGE_KEY = 'kt.auth.token';

export interface StoredAuthToken {
  readonly token: string;
  readonly expiresAt: string;
}

export function getToken(): StoredAuthToken | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuthToken;
    if (!parsed?.token || !parsed?.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setToken(token: string, expiresAt: string): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt } satisfies StoredAuthToken));
  } catch {
    /* storage unavailable/full — login just won't persist; not fatal */
  }
}

export function clearToken(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isExpired(stored: StoredAuthToken): boolean {
  const expiresAtMs = Date.parse(stored.expiresAt);
  if (Number.isNaN(expiresAtMs)) return true;
  return Date.now() >= expiresAtMs;
}
