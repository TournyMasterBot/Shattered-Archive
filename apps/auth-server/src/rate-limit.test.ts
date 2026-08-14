import { RateLimiter } from './rate-limit.js';

/** Injectable clock throughout — no real sleeps, mirroring login-lockout.test.ts's shape. */
function clockFrom(startMs: number): { now: () => number; advance: (ms: number) => void } {
  let current = startMs;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('RateLimiter', () => {
  it('allows a full burst immediately, then refuses', () => {
    const clock = clockFrom(1_000);
    const limiter = new RateLimiter({ ratePerMinute: 60, burst: 5, now: clock.now });

    for (let i = 0; i < 5; i++) expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(false);
  });

  it('refills at the configured sustained rate', () => {
    const clock = clockFrom(1_000);
    // 60r/m = one token per second.
    const limiter = new RateLimiter({ ratePerMinute: 60, burst: 2, now: clock.now });

    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(false);

    clock.advance(1_000);
    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(false);
  });

  /**
   * Fractional refill matters: with whole-token accounting a 120r/m limit would only release
   * tokens in one-per-500ms steps, so a caller pacing itself correctly would still be refused.
   */
  it('accumulates partial tokens rather than rounding them away', () => {
    const clock = clockFrom(0);
    const limiter = new RateLimiter({ ratePerMinute: 120, burst: 1, now: clock.now });

    expect(limiter.allow('ip')).toBe(true);
    clock.advance(200); // 0.4 of a token
    expect(limiter.allow('ip')).toBe(false);
    clock.advance(300); // now 0.6 more, so a full token has accrued across two waits
    expect(limiter.allow('ip')).toBe(true);
  });

  it('never lets a bucket exceed its burst no matter how long it idles', () => {
    const clock = clockFrom(0);
    const limiter = new RateLimiter({ ratePerMinute: 60, burst: 3, now: clock.now });

    clock.advance(60 * 60 * 1000); // an hour of credit
    for (let i = 0; i < 3; i++) expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(false);
  });

  /**
   * A rejected caller must still age out. If rejection skipped the refill bookkeeping the
   * bucket's clock would freeze and that key would be refused forever.
   */
  it('recovers after rejection instead of latching', () => {
    const clock = clockFrom(0);
    const limiter = new RateLimiter({ ratePerMinute: 60, burst: 1, now: clock.now });

    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(false);
    expect(limiter.allow('ip')).toBe(false);

    clock.advance(1_000);
    expect(limiter.allow('ip')).toBe(true);
  });

  it('tracks keys independently', () => {
    const clock = clockFrom(0);
    const limiter = new RateLimiter({ ratePerMinute: 60, burst: 1, now: clock.now });

    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
    // b must be unaffected by a's exhaustion — otherwise one noisy address would lock out
    // every other caller.
    expect(limiter.allow('b')).toBe(true);
  });

  /** Bounds memory under a distributed flood, where each source would otherwise get an entry. */
  it('drops refilled buckets once past maxKeys', () => {
    const clock = clockFrom(0);
    const limiter = new RateLimiter({ ratePerMinute: 60, burst: 2, now: clock.now, maxKeys: 5 });

    for (let i = 0; i < 10; i++) limiter.allow(`ip-${i}`);
    // Long enough that every bucket is back to full, i.e. indistinguishable from never-seen.
    clock.advance(60_000);
    for (let i = 10; i < 20; i++) limiter.allow(`ip-${i}`);

    // 20 distinct keys were seen, but the map does not hold 20 entries.
    expect(limiter.size()).toBeLessThan(20);
  });

  /**
   * The sweep must only ever drop buckets equivalent to absent ones. A key that is over its
   * limit AT THE MOMENT the sweep runs has to keep being refused — otherwise a flood of new
   * keys would be a way to clear an existing throttle.
   */
  it('does not release a throttled key when a sweep runs', () => {
    const clock = clockFrom(0);
    const limiter = new RateLimiter({ ratePerMinute: 60, burst: 2, now: clock.now, maxKeys: 5 });

    for (let i = 0; i < 10; i++) limiter.allow(`ip-${i}`);
    clock.advance(60_000); // everything refills, so the next sweep has something to drop

    // Drain 'busy' NOW, after the refill, so it is genuinely empty when the sweep fires.
    expect(limiter.allow('busy')).toBe(true);
    expect(limiter.allow('busy')).toBe(true);
    expect(limiter.allow('busy')).toBe(false);

    for (let i = 10; i < 20; i++) limiter.allow(`ip-${i}`); // trips the sweep

    expect(limiter.allow('busy')).toBe(false);
  });

  it('treats a burst below 1 as 1 rather than blocking everything', () => {
    const limiter = new RateLimiter({ ratePerMinute: 60, burst: 0 });
    expect(limiter.allow('ip')).toBe(true);
  });
});
