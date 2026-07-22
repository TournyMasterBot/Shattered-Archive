import crypto from 'crypto';
import path from 'path';

import { EncryptedFileStore } from './encrypted-file-store.js';
import { AuthError } from './errors.js';

/**
 * AI-ANNOTATION
 * @ai-summary API keys AND browser sessions as ONE record type/store — a
 *   session is just a kind:'session' key record with a short TTL. One
 *   verify() path for both. Neither mintApiKey/mintSession nor verify()
 *   reaches into account-store directly — the caller supplies the account's
 *   CURRENT epoch, keeping this store decoupled and independently testable.
 * @ai-public KeyStore, KeyRecord, ApiKeyInfo, VerifiedKey
 * @ai-notes Persisted separately from accounts (auth-keys.json) so the two
 *   stores don't contend on the same file lock.
 */

export type KeyKind = 'api' | 'session';

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
}

interface KeysFileData {
  keys: KeyRecord[];
}

const SESSION_SERVICE = 'auth-web';
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

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
      return { accountId: record.accountId, keyId: record.id, service: record.service, label: record.label, kind: record.kind };
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
