import { parseAuthFragment } from './authFragment';

describe('parseAuthFragment', () => {
  it('returns none for an empty hash', () => {
    expect(parseAuthFragment('')).toEqual({ kind: 'none' });
  });

  it('returns none for a bare "#"', () => {
    expect(parseAuthFragment('#')).toEqual({ kind: 'none' });
  });

  it('parses a successful hand-off', () => {
    expect(parseAuthFragment('#auth_token=abc123&expires_at=2026-08-04T00%3A00%3A00.000Z')).toEqual({
      kind: 'token',
      token: 'abc123',
      expiresAt: '2026-08-04T00:00:00.000Z',
    });
  });

  it('parses an error hand-off', () => {
    expect(parseAuthFragment('#auth_error=1')).toEqual({ kind: 'error' });
  });

  it('returns none for unrelated hash content', () => {
    expect(parseAuthFragment('#some=other&thing=here')).toEqual({ kind: 'none' });
  });

  it('requires BOTH auth_token and expires_at to count as a success', () => {
    expect(parseAuthFragment('#auth_token=abc123')).toEqual({ kind: 'none' });
    expect(parseAuthFragment('#expires_at=2026-08-04T00:00:00.000Z')).toEqual({ kind: 'none' });
  });
});
