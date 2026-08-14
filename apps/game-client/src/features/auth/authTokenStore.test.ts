/**
 * apps/game-client/src/features/auth/authTokenStore.test.ts
 */
import { getToken, setToken, clearToken, isExpired, subscribeToToken } from './authTokenStore';

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
    expect(isExpired({ token: 'x', expiresAt: '2999-01-01T00:00:00Z' })).toBe(false);
    expect(isExpired({ token: 'x', expiresAt: '2000-01-01T00:00:00Z' })).toBe(true);
    expect(isExpired({ token: 'x', expiresAt: 'not-a-date' })).toBe(true);
  });

  describe('subscribeToToken', () => {
    // jsdom does not raise `storage` on localStorage writes (nor does a real
    // browser, in the writing window), so these dispatch the event the way the
    // login popup's write reaches the app window: from outside.
    const fireStorage = (key: string | null) => window.dispatchEvent(new StorageEvent('storage', { key }));

    it('reports the current token when our key changes elsewhere', () => {
      const seen: unknown[] = [];
      const unsubscribe = subscribeToToken((stored) => seen.push(stored));

      setToken('tok-from-popup', '2999-01-01T00:00:00Z');
      fireStorage('shatteredArchive.auth.token');

      expect(seen).toEqual([{ token: 'tok-from-popup', expiresAt: '2999-01-01T00:00:00Z' }]);
      unsubscribe();
    });

    it('ignores changes to unrelated keys', () => {
      const onChange = jest.fn();
      const unsubscribe = subscribeToToken(onChange);

      fireStorage('some.other.app.key');

      expect(onChange).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('treats a whole-storage clear (null key) as a change', () => {
      const onChange = jest.fn();
      const unsubscribe = subscribeToToken(onChange);

      fireStorage(null);

      expect(onChange).toHaveBeenCalledWith(null);
      unsubscribe();
    });

    it('stops calling back once unsubscribed', () => {
      const onChange = jest.fn();
      subscribeToToken(onChange)();

      fireStorage('shatteredArchive.auth.token');

      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
