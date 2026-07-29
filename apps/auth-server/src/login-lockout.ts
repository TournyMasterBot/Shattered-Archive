/**
 * AI-ANNOTATION
 * @ai-summary Fail2ban-style escalating soft lockout for /api/auth/login, in
 *   memory only (mirrors ChallengeThrottle's "no new dependency" tradeoff — a
 *   restart clears state). Tracks failures independently by normalized
 *   username AND by source IP; either key being locked blocks the attempt
 *   (protects both "hammer one account" and "spray many accounts from one
 *   IP"). A fixed number of free attempts, then each further failure doubles
 *   the lockout duration (capped), so a repeat offender waits longer than a
 *   first-time one. Always eventually expires — never a permanent ban.
 * @ai-public LoginLockout
 * @ai-notes Deliberately has no OS-level enforcement (no iptables/fail2ban
 *   shell-out) — pure in-app counting, matching the plan's explicit
 *   "no OS-specific dependency" constraint.
 */

interface LockoutEntry {
  failureCount: number;
  lockedUntilMs: number; // 0 = not currently locked
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export class LoginLockout {
  private readonly entries = new Map<string, LockoutEntry>();

  constructor(
    private readonly freeAttempts = 3,
    private readonly baseLockMs = 30 * 1000, // first lockout: 30s
    private readonly maxLockMs = 24 * 60 * 60 * 1000, // cap: 24h
    private readonly now: () => number = Date.now,
  ) {}

  private msLockedFor(key: string): number {
    const entry = this.entries.get(key);
    if (!entry || entry.lockedUntilMs <= this.now()) return 0;
    return entry.lockedUntilMs - this.now();
  }

  /** 0 if neither the username nor the IP is currently locked; otherwise the longer remaining lockout in ms. */
  msLocked(username: string, ip: string): number {
    return Math.max(this.msLockedFor(`u:${normalizeUsername(username)}`), this.msLockedFor(`i:${ip}`));
  }

  private recordFailureFor(key: string): void {
    const entry = this.entries.get(key) ?? { failureCount: 0, lockedUntilMs: 0 };
    entry.failureCount += 1;
    if (entry.failureCount > this.freeAttempts) {
      const strikes = entry.failureCount - this.freeAttempts;
      entry.lockedUntilMs = this.now() + Math.min(this.maxLockMs, this.baseLockMs * 2 ** (strikes - 1));
    }
    this.entries.set(key, entry);
  }

  /** Call after a failed authentication attempt (wrong password / unknown username). */
  recordFailure(username: string, ip: string): void {
    this.recordFailureFor(`u:${normalizeUsername(username)}`);
    this.recordFailureFor(`i:${ip}`);
  }

  /** Call after a successful login — clears both the username's and the IP's failure history. */
  recordSuccess(username: string, ip: string): void {
    this.entries.delete(`u:${normalizeUsername(username)}`);
    this.entries.delete(`i:${ip}`);
  }
}
