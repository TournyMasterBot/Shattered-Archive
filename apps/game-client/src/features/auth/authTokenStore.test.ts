/**
 * apps/game-client/src/features/auth/authTokenStore.test.ts
 */
import { getToken, setToken, clearToken, isExpired } from './authTokenStore';

describe('authTokenStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(getToken()).toBeNull();
  });

  it('round-trips a stored token', () => {
    setToken('tok-1', '2026-08-01T00:00:00Z');
    expect(getToken()).toEqual({ token: 'tok-1', expiresAt: '2026-08-01T00:00:00Z' });
  });

  it('clearToken removes it', () => {
    setToken('tok-1', '2026-08-01T00:00:00Z');
    clearToken();
    expect(getToken()).toBeNull();
  });

  it('returns null for malformed stored JSON rather than throwing', () => {
    window.localStorage.setItem('shatteredArchive.auth.token', '{not json');
    expect(getToken()).toBeNull();
  });

  it('isExpired reflects the stored expiry', () => {
    expect(isExpired({ token: 'x', expiresAt: '2000-01-01T00:00:00Z' })).toBe(true);
    expect(isExpired({ token: 'x', expiresAt: '2999-01-01T00:00:00Z' })).toBe(false);
    expect(isExpired({ token: 'x', expiresAt: 'not-a-date' })).toBe(true);
  });
});
