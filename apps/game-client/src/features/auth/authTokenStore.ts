// apps\game-client\src\features\auth\authTokenStore.ts
// Phase D: cloud-account bearer token storage. Matches this codebase's existing
// per-feature idiom (own STORAGE_KEY, inline try/catch, no shared wrapper — see
// useConnectModal.ts / GraphicsSettingsModal.tsx for the same shape) rather than
// introducing a new app-wide abstraction.

const STORAGE_KEY = 'shatteredArchive.auth.token';

export interface StoredAuthToken {
  token: string;
  expiresAt: string; // ISO timestamp
}

export function getToken(): StoredAuthToken | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuthToken;
    if (!parsed?.token || !parsed?.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setToken(token: string, expiresAt: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt } satisfies StoredAuthToken));
  } catch {
    // localStorage unavailable/full — login just won't persist; not fatal.
  }
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function isExpired(stored: StoredAuthToken): boolean {
  const expiresAtMs = Date.parse(stored.expiresAt);
  if (Number.isNaN(expiresAtMs)) return true;
  return Date.now() >= expiresAtMs;
}

/**
 * Calls back whenever this key changes in ANOTHER same-origin window, and returns
 * an unsubscribe. This is how the app tab learns that the login popup signed in:
 * the popup lands on auth-callback.html, writes the token here, and the browser
 * raises `storage` in every other window sharing the origin.
 *
 * The `storage` event deliberately does NOT fire in the window that did the
 * writing, so this never observes the app's own setToken/clearToken — callers
 * that change the token themselves already know, and update their state directly.
 */
export function subscribeToToken(onChange: (stored: StoredAuthToken | null) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: StorageEvent) => {
    // A null key means localStorage.clear() — that wipes ours too, so it counts.
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    onChange(getToken());
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
