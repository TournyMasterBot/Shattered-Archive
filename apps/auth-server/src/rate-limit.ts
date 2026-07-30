/**
 * AI-ANNOTATION
 * @ai-summary In-process leaky-bucket rate limiter with nginx's `limit_req` semantics
 *   (a sustained rate plus a burst allowance), so an in-service limit can be stated in the
 *   SAME units as the edge zone it backs up and the two can be compared at a glance.
 * @ai-public RateLimiter, RateLimitOptions
 * @ai-notes nginx is the PRIMARY rate limiter — it sheds load before a request ever reaches
 *   node. This tier exists for the paths nginx does not cover: a request that reaches the
 *   container directly (compose network, port-forward, a misconfigured edge), and keys nginx
 *   cannot see. `$binary_remote_addr` is the only thing an nginx zone can key on, so a
 *   per-DEVICE or per-ACCOUNT limit is only expressible here.
 *
 *   Burst is deliberately set a little WIDER than the matching nginx zone at each call site,
 *   so under normal edge-fronted traffic nginx always trips first and this never fires
 *   spuriously. If this one is what's rejecting, something bypassed the edge.
 *
 *   Distinct from questions-store's ChallengeThrottle, which refills in whole intervals
 *   (+1 token every 2 min) — a coarser policy tuned for a human-paced flow, not for mirroring
 *   an nginx zone. Kept separate rather than merged so neither has to compromise.
 */

export interface RateLimitOptions {
  /** Sustained refill rate, in the same unit as nginx's `rate=Nr/m`. */
  ratePerMinute: number;
  /** How many requests may arrive at once before rejection — nginx's `burst=`. */
  burst: number;
  /** Injectable for tests; no real sleeps anywhere in this file's suite. */
  now?: () => number;
  /**
   * Above this many tracked keys, idle (fully-refilled) buckets are dropped. Bounds memory
   * under a distributed flood, where every source address would otherwise get an entry.
   */
  maxKeys?: number;
}

const DEFAULT_MAX_KEYS = 10_000;

interface Bucket {
  /** Fractional on purpose: whole-token refill would quantise a 120r/m rate into 2/sec steps. */
  tokens: number;
  lastRefillMs: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly ratePerMs: number;
  private readonly burst: number;
  private readonly now: () => number;
  private readonly maxKeys: number;

  constructor(options: RateLimitOptions) {
    this.ratePerMs = options.ratePerMinute / 60_000;
    this.burst = Math.max(1, options.burst);
    this.now = options.now ?? Date.now;
    this.maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  }

  /** Consumes one token for `key`. False = over limit, and the caller should 429. */
  allow(key: string): boolean {
    const nowMs = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.burst, lastRefillMs: nowMs };

    const elapsed = nowMs - bucket.lastRefillMs;
    if (elapsed > 0) {
      bucket.tokens = Math.min(this.burst, bucket.tokens + elapsed * this.ratePerMs);
      bucket.lastRefillMs = nowMs;
    }

    // Record the refill even on rejection, or a rejected caller's bucket would stop ageing
    // and stay rejected forever.
    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }

    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    if (this.buckets.size > this.maxKeys) this.sweep(nowMs);
    return true;
  }

  /**
   * Drops buckets that are back to full — they are indistinguishable from a key that has never
   * been seen, so forgetting them changes no decision.
   *
   * Recomputes each bucket's CURRENT level rather than reading the stored one, which is stale:
   * a bucket is only refreshed when its own key is seen again, so a flood key touched exactly
   * once would keep its old count forever and never qualify — defeating the bound this exists
   * for, in precisely the scenario it exists for.
   */
  private sweep(nowMs: number): void {
    for (const [key, bucket] of this.buckets) {
      const current = bucket.tokens + (nowMs - bucket.lastRefillMs) * this.ratePerMs;
      if (current >= this.burst) this.buckets.delete(key);
    }
  }

  /** Test/diagnostic visibility only. */
  size(): number {
    return this.buckets.size;
  }
}
