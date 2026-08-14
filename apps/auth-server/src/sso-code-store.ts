import crypto from 'crypto';

/**
 * AI-ANNOTATION
 * @ai-summary One-time SSO authorization codes — in-memory ONLY, by design
 *   (Phase A constraint): 60s TTL, single-use, bound to {account, service,
 *   redirectUri}. Losing them on a restart is correct behavior; nothing here
 *   may ever touch DATA_DIR.
 * @ai-public SsoCodeStore
 * @ai-notes redeem() BURNS the code on any attempt that finds it, even when
 *   the service/redirectUri don't match — a mismatched redeem must not leave
 *   the code retryable (no brute-forcing bindings against a stolen code). It
 *   returns null on every failure without saying which check failed (same
 *   don't-be-an-oracle rule as service-key-store's verifyAssertion).
 */

const CODE_TTL_MS = 60 * 1000;

interface PendingCode {
  accountId: string;
  service: string;
  redirectUri: string;
  expiresAt: number; // ms epoch
}

export class SsoCodeStore {
  private readonly codes = new Map<string, PendingCode>();

  // Injectable clock, same idiom as LoginLockout — tests never real-sleep.
  constructor(private readonly now: () => number = Date.now) {}

  issue(accountId: string, service: string, redirectUri: string): string {
    this.sweep(this.now());
    const code = crypto.randomBytes(24).toString('base64url');
    this.codes.set(code, {
      accountId,
      service,
      redirectUri,
      expiresAt: this.now() + CODE_TTL_MS,
    });
    return code;
  }

  /** `{accountId}` only when the code exists, is fresh, and both bindings match exactly; null otherwise. */
  redeem(code: string, service: string, redirectUri: string): { accountId: string } | null {
    const now = this.now();
    this.sweep(now);
    const pending = this.codes.get(code);
    if (!pending) return null;
    this.codes.delete(code); // single-use — burned even on a mismatched attempt
    if (pending.expiresAt < now) return null;
    if (pending.service !== service || pending.redirectUri !== redirectUri) return null;
    return { accountId: pending.accountId };
  }

  private sweep(now: number): void {
    for (const [code, pending] of this.codes) {
      if (pending.expiresAt < now) this.codes.delete(code);
    }
  }
}
