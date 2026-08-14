import { DeviceNonceStore } from './device-nonce-store.js';

/** Injectable clock, like login-lockout.test.ts — no real sleeps anywhere. */
function makeStore(ttlMs = 1000) {
  let nowMs = 1_000_000;
  const store = new DeviceNonceStore(ttlMs, () => nowMs);
  return { store, advance: (ms: number) => (nowMs += ms) };
}

describe('DeviceNonceStore', () => {
  it('issues a nonce that the same device can spend exactly once', () => {
    const { store } = makeStore();
    const { nonce } = store.issue('dev-1');
    expect(store.consume(nonce, 'dev-1')).toBe(true);
    expect(store.consume(nonce, 'dev-1')).toBe(false);
  });

  it('issues unpredictable, distinct nonces', () => {
    const { store } = makeStore();
    const seen = new Set(Array.from({ length: 50 }, () => store.issue('dev-1').nonce));
    expect(seen.size).toBe(50);
    // base64url of 32 bytes — long enough that guessing is not a strategy.
    expect([...seen][0].length).toBeGreaterThanOrEqual(43);
  });

  it('refuses a nonce spent by a different device than it was issued to', () => {
    const { store } = makeStore();
    const { nonce } = store.issue('dev-1');
    expect(store.consume(nonce, 'dev-2')).toBe(false);
  });

  /**
   * Once offered up, a nonce is dead regardless of WHY the attempt failed — otherwise a
   * wrong-device or wrong-signature attempt would leave it available to grind against.
   */
  it('burns a nonce even when the consuming device was wrong', () => {
    const { store } = makeStore();
    const { nonce } = store.issue('dev-1');
    expect(store.consume(nonce, 'dev-2')).toBe(false);
    expect(store.consume(nonce, 'dev-1')).toBe(false);
  });

  it('expires a nonce after its TTL', () => {
    const { store, advance } = makeStore(1000);
    const { nonce } = store.issue('dev-1');
    advance(1001);
    expect(store.consume(nonce, 'dev-1')).toBe(false);
  });

  it('still honours a nonce right up to the TTL boundary', () => {
    const { store, advance } = makeStore(1000);
    const { nonce } = store.issue('dev-1');
    advance(999);
    expect(store.consume(nonce, 'dev-1')).toBe(true);
  });

  it('reports an expiresAt consistent with the injected clock', () => {
    const { store } = makeStore(1000);
    const { expiresAt } = store.issue('dev-1');
    expect(Date.parse(expiresAt)).toBe(1_000_000 + 1000);
  });

  it('rejects an unknown nonce', () => {
    const { store } = makeStore();
    expect(store.consume('never-issued', 'dev-1')).toBe(false);
  });

  /** Abandoned challenges are the norm (every closed tab), so the map must not grow forever. */
  it('sweeps expired entries on issue so abandoned challenges cannot accumulate', () => {
    const { store, advance } = makeStore(1000);
    for (let i = 0; i < 10; i += 1) store.issue(`dev-${i}`);
    expect(store.size()).toBe(10);

    advance(1001);
    store.issue('dev-fresh');
    // The 10 stale ones swept; only the fresh one remains.
    expect(store.size()).toBe(1);
  });

  it('keeps unexpired entries when sweeping', () => {
    const { store, advance } = makeStore(1000);
    store.issue('dev-old');
    advance(500);
    store.issue('dev-new');
    expect(store.size()).toBe(2);
  });
});
