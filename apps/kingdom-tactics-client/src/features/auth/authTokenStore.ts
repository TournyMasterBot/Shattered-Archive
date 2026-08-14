/**
 * Phase F: cloud-account bearer token storage.
 *
 * 2026-07-30 (device-bound credentials): this is now IN MEMORY ONLY. It previously persisted
 * the SSO token to localStorage under 'kt.auth.token', where any script on the page could read
 * it and replay it from anywhere until it expired. Durable sign-in is now carried by an
 * enrolled device key (see deviceCredentials.ts) whose private half the browser will never
 * reveal, so this holds only the SSO hand-off token for the current page — enough to work
 * immediately after login, and worth nothing to an attacker after a reload.
 *
 * The exported API is unchanged on purpose, so cloudSync.ts / useAccountScreen.ts /
 * useAuthCallback.ts keep working as written. What changed is only WHERE the value lives.
 *
 * A previous version of this note said storage failure meant "login just won't persist"; that
 * is now the normal, intended behaviour rather than a degraded mode.
 */

let current: StoredAuthTokenInternal | null = null;

interface StoredAuthTokenInternal {
  readonly token: string;
  readonly expiresAt: string;
}

export interface StoredAuthToken {
  readonly token: string;
  readonly expiresAt: string;
}

export function getToken(): StoredAuthToken | null {
  return current;
}

export function setToken(token: string, expiresAt: string): void {
  current = { token, expiresAt };
}

export function clearToken(): void {
  current = null;
}

export function isExpired(stored: StoredAuthToken): boolean {
  const expiresAtMs = Date.parse(stored.expiresAt);
  if (Number.isNaN(expiresAtMs)) return true;
  return Date.now() >= expiresAtMs;
}
