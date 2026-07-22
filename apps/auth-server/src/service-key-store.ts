import crypto from 'crypto';
import path from 'path';

import { EncryptedFileStore } from './encrypted-file-store.js';
import { verifyAssertion as verifyEd25519Assertion } from './crypto-primitives.js';
import { AuthError } from './errors.js';

/**
 * AI-ANNOTATION
 * @ai-summary Per-service Ed25519 public-key registry for the /api/introspect
 *   server-to-server guard (step 7). Multiple non-revoked keys per service
 *   are expected DURING a rotation window. Encrypted at rest even though
 *   public keys aren't secret — an attacker able to silently insert their OWN
 *   public key here would defeat the whole introspect trust chain.
 * @ai-public ServiceKeyStore
 * @ai-notes verifyAssertion() peek-decodes the payload's `service` field
 *   WITHOUT trusting it, purely to select which registered keys to try; the
 *   claim is only trusted once crypto-primitives' verifyAssertion() actually
 *   validates the signature against one of that service's real keys. iat/exp/
 *   nonce are re-checked off the VERIFIED payload, never the raw peek.
 */

interface ServiceKeyRecord {
  keyId: string;
  publicKeyPem: string;
  createdAt: string;
  revokedAt?: string;
}

interface ServiceEntry {
  serviceName: string;
  keys: ServiceKeyRecord[];
}

interface ServiceKeyRegistryData {
  services: ServiceEntry[];
}

// Assertions must be short-lived: exp - iat bounded, exp not in the past, iat not (meaningfully) future.
const MAX_ASSERTION_WINDOW_MS = 60 * 1000;
const CLOCK_SKEW_TOLERANCE_MS = 5 * 1000;
// Replay guard: nonces are remembered for slightly longer than the max assertion window.
const NONCE_MEMORY_MS = MAX_ASSERTION_WINDOW_MS + CLOCK_SKEW_TOLERANCE_MS + 5 * 1000;

export class ServiceKeyStore extends EncryptedFileStore<ServiceKeyRegistryData> {
  private readonly seenNonces = new Map<string, number>(); // nonce -> when to forget it (ms)

  constructor(dataDir: string, key: Buffer) {
    super(path.join(dataDir, 'auth-service-keys.json'), key, () => ({ services: [] }));
  }

  registerKey(serviceName: string, publicKeyPem: string): { keyId: string } {
    const data = this.read();
    let entry = data.services.find((s) => s.serviceName === serviceName);
    if (!entry) {
      entry = { serviceName, keys: [] };
      data.services.push(entry);
    }
    const keyId = crypto.randomBytes(6).toString('hex');
    entry.keys.push({ keyId, publicKeyPem, createdAt: new Date().toISOString() });
    this.write(data);
    return { keyId };
  }

  revokeKey(serviceName: string, keyId: string): void {
    const data = this.read();
    const entry = data.services.find((s) => s.serviceName === serviceName);
    const record = entry?.keys.find((k) => k.keyId === keyId);
    if (!record) {
      throw new AuthError(`no key ${JSON.stringify(keyId)} registered for service ${JSON.stringify(serviceName)}`, 404);
    }
    record.revokedAt ??= new Date().toISOString();
    this.write(data);
  }

  private sweepExpiredNonces(now: number): void {
    for (const [nonce, forgetAt] of this.seenNonces) {
      if (forgetAt < now) this.seenNonces.delete(nonce);
    }
  }

  /**
   * Returns `{service}` on a validly-signed, fresh, non-replayed assertion
   * from a registered non-revoked key; `null` on ANY failure — never leaks
   * which check failed (mirrors the anti-bot challenge's don't-be-an-oracle
   * rule).
   */
  verifyAssertion(compact: string): { service: string } | null {
    const parts = compact.split('.');
    if (parts.length !== 2) return null;

    let claimedService: string;
    try {
      const peeked = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Record<string, unknown>;
      if (typeof peeked.service !== 'string' || !peeked.service) return null;
      claimedService = peeked.service;
    } catch {
      return null;
    }

    const entry = this.read().services.find((s) => s.serviceName === claimedService);
    if (!entry) return null;

    const now = Date.now();
    this.sweepExpiredNonces(now);

    for (const keyRecord of entry.keys) {
      if (keyRecord.revokedAt) continue;
      const verified = verifyEd25519Assertion(compact, keyRecord.publicKeyPem);
      if (!verified) continue;

      const { service, iat, exp, nonce } = verified as { service?: unknown; iat?: unknown; exp?: unknown; nonce?: unknown };
      if (service !== claimedService || typeof iat !== 'number' || typeof exp !== 'number' || typeof nonce !== 'string' || !nonce) {
        return null;
      }
      if (exp < now) return null; // expired
      if (exp - iat > MAX_ASSERTION_WINDOW_MS || exp - iat < 0) return null; // window too wide, or inverted
      if (iat > now + CLOCK_SKEW_TOLERANCE_MS) return null; // future-dated
      if (this.seenNonces.has(nonce)) return null; // replay

      this.seenNonces.set(nonce, now + NONCE_MEMORY_MS);
      return { service: claimedService };
    }

    return null;
  }
}
