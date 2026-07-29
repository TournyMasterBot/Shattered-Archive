/**
 * apps/game-client/src/features/auth/authFragment.test.ts
 */
import { parseAuthFragment } from './authFragment';

describe('parseAuthFragment', () => {
  it('returns none for an empty or bare hash', () => {
    expect(parseAuthFragment('')).toEqual({ kind: 'none' });
    expect(parseAuthFragment('#')).toEqual({ kind: 'none' });
  });

  it('parses a successful token hand-off', () => {
    const result = parseAuthFragment('#auth_token=abc123&expires_at=2026-08-01T00%3A00%3A00Z');
    expect(result).toEqual({ kind: 'token', token: 'abc123', expiresAt: '2026-08-01T00:00:00Z' });
  });

  it('parses an error hand-off', () => {
    expect(parseAuthFragment('#auth_error=1')).toEqual({ kind: 'error' });
  });

  it('ignores unrelated hash content', () => {
    expect(parseAuthFragment('#something-else')).toEqual({ kind: 'none' });
  });

  it('requires BOTH auth_token and expires_at to count as a token', () => {
    expect(parseAuthFragment('#auth_token=abc123')).toEqual({ kind: 'none' });
    expect(parseAuthFragment('#expires_at=2026-08-01T00%3A00%3A00Z')).toEqual({ kind: 'none' });
  });
});
