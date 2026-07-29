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
