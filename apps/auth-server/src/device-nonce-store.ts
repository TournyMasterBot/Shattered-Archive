import crypto from 'crypto';

/**
 * AI-ANNOTATION
 * @ai-summary Single-use, short-lived challenge nonces for device assertion. In memory
 *   only, mirroring LoginLockout and ChallengeThrottle's "no new dependency, a restart
 *   clears state" tradeoff — losing nonces on restart is harmless, because a client whose
 *   nonce vanished just asks for another one and the user sees nothing.
 * @ai-public DeviceNonceStore
 * @ai-notes Why a server-issued nonce rather than a client timestamp: it makes replay
 *   protection exact instead of clock-dependent. A timestamp window has to tolerate skew,
 *   which means a captured signature stays valid for that whole window; a single-use nonce
 *   is dead the instant it is spent, and there is no clock to disagree about.
 */

/** Long enough that guessing is hopeless; the nonce is public, its unpredictability is the point. */
const NONCE_BYTES = 32;
const DEFAULT_TTL_MS = 2 * 60 * 1000; // 2 min — a round trip, not a session

interface NonceEntry {
  deviceId: string;
  expiresAtMs: number;
}

export class DeviceNonceStore {
  private readonly entries = new Map<string, NonceEntry>();

  constructor(
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Bound to the deviceId at issue time so a nonce minted for one device cannot be spent by
   * another. Sweeps expired entries on issue — the only write path, so the map cannot grow
   * without bound even if clients abandon challenges (which they will, on every closed tab).
   */
  issue(deviceId: string): { nonce: string; expiresAt: string } {
    this.sweep();
    const nonce = crypto.randomBytes(NONCE_BYTES).toString('base64url');
    const expiresAtMs = this.now() + this.ttlMs;
    this.entries.set(nonce, { deviceId, expiresAtMs });
    return { nonce, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  /**
   * Spends the nonce: returns true only if it exists, is unexpired, AND was issued to this
   * device. ALWAYS deletes on a match attempt that found the entry, so a replay of the same
   * nonce fails even when the first attempt failed for another reason — a nonce that has been
   * offered up once must never be usable again.
   */
  consume(nonce: string, deviceId: string): boolean {
    const entry = this.entries.get(nonce);
    if (!entry) return false;
    this.entries.delete(nonce);
    if (entry.expiresAtMs <= this.now()) return false;
    return entry.deviceId === deviceId;
  }

  private sweep(): void {
    const nowMs = this.now();
    for (const [nonce, entry] of this.entries) {
      if (entry.expiresAtMs <= nowMs) this.entries.delete(nonce);
    }
  }

  /** Test/diagnostic visibility only. */
  size(): number {
    return this.entries.size;
  }
}
