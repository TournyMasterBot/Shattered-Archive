import { LoginLockout } from './login-lockout.js';

/** Deterministic clock: advance(ms) moves it forward, now() reads current value. */
function makeClock(startMs = 0) {
  let current = startMs;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('LoginLockout', () => {
  it('allows the configured number of free failures before locking', () => {
    const clock = makeClock();
    const lockout = new LoginLockout(3, 1000, 60_000, clock.now);
    expect(lockout.msLocked('alice', '1.1.1.1')).toBe(0);
    lockout.recordFailure('alice', '1.1.1.1');
    lockout.recordFailure('alice', '1.1.1.1');
    lockout.recordFailure('alice', '1.1.1.1');
    expect(lockout.msLocked('alice', '1.1.1.1')).toBe(0);
  });

  it('locks after exceeding free attempts, and the lock expires on its own', () => {
    const clock = makeClock();
    const lockout = new LoginLockout(3, 1000, 60_000, clock.now);
    for (let i = 0; i < 4; i++) lockout.recordFailure('alice', '1.1.1.1');
    expect(lockout.msLocked('alice', '1.1.1.1')).toBe(1000);
    clock.advance(1000);
    expect(lockout.msLocked('alice', '1.1.1.1')).toBe(0);
  });

  it('escalates the lockout duration for repeated offenses (doubling, capped)', () => {
    const clock = makeClock();
    const lockout = new LoginLockout(1, 1000, 10_000, clock.now);
    // Strike 1 (2nd failure overall): 1000ms
    lockout.recordFailure('bob', '2.2.2.2');
    lockout.recordFailure('bob', '2.2.2.2');
    expect(lockout.msLocked('bob', '2.2.2.2')).toBe(1000);
    clock.advance(1000); // lock expires
    // Strike 2 (3rd failure overall): 2000ms
    lockout.recordFailure('bob', '2.2.2.2');
    expect(lockout.msLocked('bob', '2.2.2.2')).toBe(2000);
    clock.advance(2000);
    // Strike 3: 4000ms
    lockout.recordFailure('bob', '2.2.2.2');
    expect(lockout.msLocked('bob', '2.2.2.2')).toBe(4000);
    clock.advance(4000);
    // Strike 4 would be 8000ms but the cap is 10000ms — still under cap here, strike 5 exceeds it
    lockout.recordFailure('bob', '2.2.2.2');
    expect(lockout.msLocked('bob', '2.2.2.2')).toBe(8000);
    clock.advance(8000);
    lockout.recordFailure('bob', '2.2.2.2'); // strike 5 would be 16000ms, capped to 10000ms
    expect(lockout.msLocked('bob', '2.2.2.2')).toBe(10_000);
  });

  it('never permanently locks — every lockout has a fixed cap and expires', () => {
    const clock = makeClock();
    const lockout = new LoginLockout(0, 1000, 5000, clock.now);
    for (let i = 0; i < 10; i++) lockout.recordFailure('carol', '3.3.3.3');
    expect(lockout.msLocked('carol', '3.3.3.3')).toBe(5000);
    clock.advance(5000);
    expect(lockout.msLocked('carol', '3.3.3.3')).toBe(0);
  });

  it('tracks username and IP independently — either being locked blocks the attempt', () => {
    const clock = makeClock();
    const lockout = new LoginLockout(0, 1000, 60_000, clock.now);
    lockout.recordFailure('dave', '4.4.4.4');
    // Same username, different IP -> still locked (username key is locked)
    expect(lockout.msLocked('dave', '9.9.9.9')).toBe(1000);
    // Different username, same IP -> still locked (IP key is locked)
    expect(lockout.msLocked('eve', '4.4.4.4')).toBe(1000);
    // Different username AND different IP -> not locked
    expect(lockout.msLocked('eve', '9.9.9.9')).toBe(0);
  });

  it('recordSuccess resets both the username and IP failure history', () => {
    const clock = makeClock();
    const lockout = new LoginLockout(1, 1000, 60_000, clock.now);
    lockout.recordFailure('frank', '5.5.5.5');
    lockout.recordFailure('frank', '5.5.5.5');
    expect(lockout.msLocked('frank', '5.5.5.5')).toBe(1000);
    clock.advance(1000);
    lockout.recordSuccess('frank', '5.5.5.5');
    // Failure count reset -> back to free attempts, no immediate lock
    lockout.recordFailure('frank', '5.5.5.5');
    expect(lockout.msLocked('frank', '5.5.5.5')).toBe(0);
  });

  it('username matching is case/whitespace-insensitive, like account lookups elsewhere', () => {
    const clock = makeClock();
    const lockout = new LoginLockout(0, 1000, 60_000, clock.now);
    lockout.recordFailure('  Grace  ', '6.6.6.6');
    expect(lockout.msLocked('grace', '0.0.0.0')).toBe(1000);
    expect(lockout.msLocked('GRACE', '0.0.0.0')).toBe(1000);
  });
});
