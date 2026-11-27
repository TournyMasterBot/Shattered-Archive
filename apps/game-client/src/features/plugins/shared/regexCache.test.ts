import { compileCached, matchesAnyPattern, REGEX_CACHE_MAX } from './regexCache';

describe('compileCached', () => {
  it('compiles a pattern once and hands back the same RegExp', () => {
    expect(compileCached('hello')).toBe(compileCached('hello'));
  });

  it('is case-insensitive by default and honours other flags as a separate entry', () => {
    expect(compileCached('hello')?.test('HELLO')).toBe(true);
    const sensitive = compileCached('hello', '');
    expect(sensitive?.test('HELLO')).toBe(false);
    expect(sensitive).not.toBe(compileCached('hello'));
  });

  it('returns null for an invalid pattern, and keeps returning null', () => {
    expect(compileCached('(unbalanced')).toBeNull();
    expect(compileCached('(unbalanced')).toBeNull();
  });

  it('starts over once the bounded cache is full', () => {
    const first = compileCached('keep-me');
    for (let i = 0; i < REGEX_CACHE_MAX; i++) compileCached(`filler-${i}`);
    // The cache was cleared on the way: the same pattern is recompiled to a NEW object.
    expect(compileCached('keep-me')).not.toBe(first);
    expect(compileCached('keep-me')?.test('KEEP-ME')).toBe(true);
  });
});

describe('matchesAnyPattern', () => {
  it('matches any pattern as a case-insensitive regex', () => {
    expect(matchesAnyPattern('You MISS the rat', ['hits', '^you miss'])).toBe(true);
    expect(matchesAnyPattern('You hit the rat', ['^you miss', 'bites'])).toBe(false);
  });

  it('is false for an empty pattern list', () => {
    expect(matchesAnyPattern('anything', [])).toBe(false);
  });

  it('falls back to a literal substring when a pattern is not a valid regex', () => {
    expect(matchesAnyPattern('HP: (low', ['hp: (low'])).toBe(true);
    expect(matchesAnyPattern('HP is fine', ['hp: (low'])).toBe(false);
  });

  it('keeps matching on repeated calls (no stateful regex flags)', () => {
    for (let i = 0; i < 5; i++) expect(matchesAnyPattern('aaa', ['a'])).toBe(true);
  });
});
