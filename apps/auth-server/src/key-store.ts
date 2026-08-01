import crypto from 'crypto';
import path from 'path';

import { EncryptedFileStore } from './encrypted-file-store.js';
import { AuthError } from './errors.js';

/**
 * AI-ANNOTATION
 * @ai-summary API keys, browser sessions, AND Phase A exchange tokens
 *   ('sso'/'obo', minted by mintExchangeToken with service = the token's
 *   AUDIENCE) as ONE record type/store — a session is just a kind:'session'
 *   key record with a short TTL. One verify() path for all kinds. Nothing here
 *   reaches into account-store directly — the caller supplies the account's
 *   CURRENT epoch, keeping this store decoupled and independently testable.
 * @ai-public KeyStore, KeyRecord, ApiKeyInfo, VerifiedKey
 * @ai-notes Persisted separately from accounts (auth-keys.json) so the two
 *   stores don't contend on the same file lock.
 */

export type KeyKind = 'api' | 'session' | 'sso' | 'obo' | 'device';

export interface KeyRecord {
  id: string;
  accountId: string;
  service: string;
  kind: KeyKind;
  label: string;
  sha256: string;
  mintedAtEpoch: number;
  createdAt: string;
  /** api: user-chosen, up to null = forever. session: always set, short TTL. */
  expiresAt?: string | null;
  /** Reserved, always empty in Phase 1 — see the plan's permissions/scopes note. */
  permissions?: string[];
  revokedAt?: string;
}

/** Public shape of an API key — never includes the token hash. */
export interface ApiKeyInfo {
  id: string;
  service: string;
  label: string;
  createdAt: string;
  expiresAt?: string | null;
  revokedAt?: string;
}

export interface VerifiedKey {
  accountId: string;
  keyId: string;
  service: string;
  label: string;
  kind: KeyKind;
  /** null/undefined = never expires (mirrors KeyRecord.expiresAt). */
  expiresAt?: string | null;
}

interface KeysFileData {
  keys: KeyRecord[];
}

const SESSION_SERVICE = 'auth-web';
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
// Exchange-minted records ('sso'/'obo') always expire; once well past expiry they are
// dead weight in the file, so mintExchangeToken() purges them after this grace period.
const EXCHANGE_PURGE_GRACE_MS = 24 * 60 * 60 * 1000; // 24h past expiry
// Device access tokens: deliberately minutes, not hours. This is the whole point of the
// device-key scheme — the durable credential is the non-extractable key, so a stolen token
// buys an attacker only this window and cannot be renewed without the key.
const DEFAULT_DEVICE_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 min
// Much shorter grace than exchange tokens': device records churn constantly, so they must
// not linger. Long enough to still be inspectable right after expiry.
const DEVICE_TOKEN_PURGE_GRACE_MS = 30 * 60 * 1000; // 30 min past expiry

/**
 * For BEARER TOKENS ONLY. Input is always `newToken()` — 32 CSPRNG bytes — so a plain digest
 * is the right construction: a 256-bit uniform preimage cannot be dictionary-attacked, and a
 * key-stretching KDF here would only add latency to a call made on every authenticated
 * request. This exists so the file holds a verifier rather than the live token.
 *
 * No account password ever reaches this module; those are scrypt-hashed in account-store.ts.
 * (CodeQL reports this line as `js/insufficient-password-hash` — its taint source is the
 * minted token, which it heuristically treats as password-like. Dismissed as a false positive.)
 */
function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function isExpired(record: KeyRecord): boolean {
  if (!record.expiresAt) return false; // null/undefined = never expires
  return Date.now() > Date.parse(record.expiresAt);
}

export class KeyStore extends EncryptedFileStore<KeysFileData> {
  constructor(dataDir: string, key: Buffer) {
    super(path.join(dataDir, 'auth-keys.json'), key, () => ({ keys: [] }));
  }

  private list(): KeyRecord[] {
    return this.read().keys;
  }

  private persist(keys: KeyRecord[]): void {
    this.write({ keys });
  }

  mintApiKey(
    accountId: string,
    service: string,
    label: string,
    expiresAt: string | null,
    currentEpoch: number,
  ): { id: string; token: string } {
    const token = newToken();
    const record: KeyRecord = {
      id: crypto.randomBytes(8).toString('hex'),
      accountId,
      service,
      kind: 'api',
      label,
      sha256: sha256Hex(token),
      mintedAtEpoch: currentEpoch,
      createdAt: new Date().toISOString(),
      expiresAt,
      permissions: [],
    };
    const keys = this.list();
    keys.push(record);
    this.persist(keys);
    return { id: record.id, token };
  }

  /**
   * Mints a token issued by /api/token-exchange: kind 'sso' (consumer login,
   * days-scale TTL) or 'obo' (on-behalf-of, minutes-scale TTL). `service` is
   * the token's AUDIENCE — the one service this token is valid at. TTL policy
   * lives in the route; this store just records what it's told. Also purges
   * exchange records long past expiry (they always expire, unlike API keys,
   * so they'd otherwise accumulate forever).
   */
  mintExchangeToken(
    accountId: string,
    service: string,
    kind: 'sso' | 'obo',
    label: string,
    ttlMs: number,
    currentEpoch: number,
  ): { id: string; token: string; expiresAt: string } {
    const token = newToken();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    const record: KeyRecord = {
      id: crypto.randomBytes(8).toString('hex'),
      accountId,
      service,
      kind,
      label,
      sha256: sha256Hex(token),
      mintedAtEpoch: currentEpoch,
      createdAt: new Date().toISOString(),
      expiresAt,
    };
    const purgeBefore = Date.now() - EXCHANGE_PURGE_GRACE_MS;
    const keys = this.list().filter(
      (k) =>
        !(
          (k.kind === 'sso' || k.kind === 'obo') &&
          k.expiresAt &&
          Date.parse(k.expiresAt) < purgeBefore
        ),
    );
    keys.push(record);
    this.persist(keys);
    return { id: record.id, token, expiresAt };
  }

  /**
   * Mints the short-lived access token a device-bound browser gets in exchange for a
   * valid signature (routes/device.ts). `service` is the AUDIENCE — the Phase A
   * service-isolation rule (`matchesAudience` in services-server) means a token is only
   * acceptable at the one service it was minted for, so a device asks for one token per
   * service it talks to rather than one token valid everywhere.
   *
   * Purges expired device records on every mint, and this is load-bearing rather than
   * tidiness: unlike an API key (minted once, lives for months) a device token is re-minted
   * continuously — a 10-minute TTL is ~144 records per day per open tab — and persist()
   * rewrites and re-encrypts the ENTIRE file each time. Without the purge the store grows
   * without bound and every subsequent mint gets slower. Same grace-period shape as
   * mintExchangeToken's purge, kept briefly past expiry so a just-expired token is still
   * visible when debugging.
   */
  mintDeviceToken(
    accountId: string,
    service: string,
    currentEpoch: number,
    ttlMs = DEFAULT_DEVICE_TOKEN_TTL_MS,
  ): { id: string; token: string; expiresAt: string } {
    const token = newToken();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    const record: KeyRecord = {
      id: crypto.randomBytes(8).toString('hex'),
      accountId,
      service,
      kind: 'device',
      label: 'device',
      sha256: sha256Hex(token),
      mintedAtEpoch: currentEpoch,
      createdAt: new Date().toISOString(),
      expiresAt,
    };
    const purgeBefore = Date.now() - DEVICE_TOKEN_PURGE_GRACE_MS;
    const keys = this.list().filter(
      (k) => !(k.kind === 'device' && k.expiresAt && Date.parse(k.expiresAt) < purgeBefore),
    );
    keys.push(record);
    this.persist(keys);
    return { id: record.id, token, expiresAt };
  }

  mintSession(accountId: string, currentEpoch: number, ttlMs = DEFAULT_SESSION_TTL_MS): { id: string; token: string } {
    const token = newToken();
    const record: KeyRecord = {
      id: crypto.randomBytes(8).toString('hex'),
      accountId,
      service: SESSION_SERVICE,
      kind: 'session',
      label: 'browser session',
      sha256: sha256Hex(token),
      mintedAtEpoch: currentEpoch,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    };
    const keys = this.list();
    keys.push(record);
    this.persist(keys);
    return { id: record.id, token };
  }

  /**
   * sha256-match + timingSafeEqual (length-guarded) + not revoked + not
   * expired (checked for BOTH kinds — an expired API key must stop working
   * exactly like an expired session) + mintedAtEpoch === the account's
   * CURRENT epoch (supplied by the caller; this is what makes a password
   * change or rotate-master instantly invalidate every prior key/session
   * with no need to touch each record).
   */
  verify(token: string, currentEpoch: (accountId: string) => number | undefined): VerifiedKey | null {
    if (!token) return null;
    const hash = Buffer.from(sha256Hex(token));
    for (const record of this.list()) {
      if (record.sha256.length !== hash.length) continue;
      const stored = Buffer.from(record.sha256);
      if (!crypto.timingSafeEqual(hash, stored)) continue;
      if (record.revokedAt) return null;
      if (isExpired(record)) return null;
      const epoch = currentEpoch(record.accountId);
      if (epoch === undefined || record.mintedAtEpoch !== epoch) return null;
      return {
        accountId: record.accountId,
        keyId: record.id,
        service: record.service,
        label: record.label,
        kind: record.kind,
        expiresAt: record.expiresAt,
      };
    }
    return null;
  }

  /** Excludes session-kind records; never returns sha256. */
  listKeys(accountId: string): ApiKeyInfo[] {
    return this.list()
      .filter((k) => k.accountId === accountId && k.kind === 'api')
      .map((k) => ({
        id: k.id,
        service: k.service,
        label: k.label,
        createdAt: k.createdAt,
        expiresAt: k.expiresAt,
        ...(k.revokedAt ? { revokedAt: k.revokedAt } : {}),
      }));
  }

  /**
   * Does this account hold a usable API key for `service`? The entitlement check behind
   * config's `deviceGrantRequiredServices`.
   *
   * Deliberately scoped to kind 'api' — the operator-provisioned grant. Counting a 'device'
   * record would be circular (a device token would authorize minting more device tokens), and
   * counting 'sso'/'obo' would let a transient login hand-off stand in for a durable grant.
   */
  hasActiveKeyForService(accountId: string, service: string): boolean {
    return this.list().some(
      (k) =>
        k.accountId === accountId &&
        k.kind === 'api' &&
        k.service === service &&
        !k.revokedAt &&
        !isExpired(k),
    );
  }

  /** Record count for one kind — purge visibility now, A2's admin key/session counts later. */
  countKind(kind: KeyKind): number {
    return this.list().filter((k) => k.kind === kind).length;
  }

  /** LIVE (non-revoked, non-expired) credential counts per kind for one account — the A2 admin list. */
  countForAccount(accountId: string): Record<KeyKind, number> {
    const counts: Record<KeyKind, number> = { api: 0, session: 0, sso: 0, obo: 0, device: 0 };
    for (const record of this.list()) {
      if (record.accountId !== accountId || record.revokedAt || isExpired(record)) continue;
      counts[record.kind] += 1;
    }
    return counts;
  }

  private requireOwned(id: string, accountId: string): KeyRecord {
    const record = this.list().find((k) => k.id === id && k.accountId === accountId && k.kind === 'api');
    // 404, not 403, for a key belonging to someone else — don't confirm the id even exists.
    if (!record) throw new AuthError(`no API key with id ${JSON.stringify(id)}`, 404);
    return record;
  }

  /**
   * Revokes any key/session by id, no ownership/kind filter — used
   * internally (logout) where the id already came from a just-verified
   * session, unlike rotateKey/revokeKey which are reachable from the
   * API-key management routes and must ownership-check untrusted input.
   */
  revokeById(id: string): void {
    const keys = this.list();
    const record = keys.find((k) => k.id === id);
    if (record) {
      record.revokedAt ??= new Date().toISOString();
      this.persist(keys);
    }
  }

  rotateKey(id: string, accountId: string): { id: string; token: string } {
    const keys = this.list();
    const record = this.requireOwned(id, accountId);
    if (record.revokedAt) throw new AuthError('revoked keys cannot be rotated — create a new key instead', 409);
    const token = newToken();
    record.sha256 = sha256Hex(token);
    this.persist(keys);
    return { id: record.id, token };
  }

  revokeKey(id: string, accountId: string): ApiKeyInfo {
    const keys = this.list();
    const record = this.requireOwned(id, accountId);
    record.revokedAt ??= new Date().toISOString();
    this.persist(keys);
    return { id: record.id, service: record.service, label: record.label, createdAt: record.createdAt, expiresAt: record.expiresAt, revokedAt: record.revokedAt };
  }
}
