import { parseReturnTo } from './useReturnTo.js';

/**
 * An unvalidated returnTo turns the real login page into a phishing delivery mechanism: the
 * victim sees a genuine, trusted auth URL and is handed to the attacker after signing in. So
 * every rejection below is a security property, not a nicety.
 */
const ALLOWED = ['https://build.shatteredarchive.dev', 'https://kingdom-tactics.shatteredarchive.dev'];

describe('parseReturnTo', () => {
  it('accepts an allowed origin', () => {
    expect(parseReturnTo('https://build.shatteredarchive.dev/areas', ALLOWED)).toBe(
      'https://build.shatteredarchive.dev/areas',
    );
  });

  it('keeps the path, query and fragment of an allowed destination', () => {
    const url = 'https://build.shatteredarchive.dev/areas?tab=map#room-3001';
    expect(parseReturnTo(url, ALLOWED)).toBe(url);
  });

  it('returns null when there is no returnTo at all', () => {
    expect(parseReturnTo(null, ALLOWED)).toBeNull();
    expect(parseReturnTo('', ALLOWED)).toBeNull();
  });

  it('rejects an origin that is not configured', () => {
    expect(parseReturnTo('https://evil.example/steal', ALLOWED)).toBeNull();
  });

  /** The classic open-redirect bug: a substring or endsWith check would let this through. */
  it('rejects a lookalike host that merely contains an allowed one', () => {
    expect(parseReturnTo('https://build.shatteredarchive.dev.evil.example/', ALLOWED)).toBeNull();
    expect(parseReturnTo('https://evil-build.shatteredarchive.dev/', ALLOWED)).toBeNull();
  });

  /** Origin comparison includes the SCHEME, so a downgrade is a different origin. */
  it('rejects the right host on the wrong scheme', () => {
    expect(parseReturnTo('http://build.shatteredarchive.dev/', ALLOWED)).toBeNull();
  });

  /** …and the PORT. */
  it('rejects the right host on a different port', () => {
    expect(parseReturnTo('https://build.shatteredarchive.dev:8443/', ALLOWED)).toBeNull();
  });

  it('rejects a javascript: URL', () => {
    expect(parseReturnTo('javascript:alert(1)', ALLOWED)).toBeNull();
  });

  it('rejects a data: URL', () => {
    expect(parseReturnTo('data:text/html,<script>alert(1)</script>', ALLOWED)).toBeNull();
  });

  /** Relative values would resolve against the hub itself — never what a returning app wants. */
  it('rejects a relative path', () => {
    expect(parseReturnTo('/areas', ALLOWED)).toBeNull();
    expect(parseReturnTo('//evil.example/', ALLOWED)).toBeNull();
  });

  it('rejects everything when no origins are configured', () => {
    expect(parseReturnTo('https://build.shatteredarchive.dev/', [])).toBeNull();
  });

  it('rejects an unparseable value rather than throwing', () => {
    expect(parseReturnTo('http://[not-a-url', ALLOWED)).toBeNull();
  });
});
