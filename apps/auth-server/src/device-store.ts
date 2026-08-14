import crypto from 'crypto';
import path from 'path';

import { EncryptedFileStore } from './encrypted-file-store.js';
import { AuthError } from './errors.js';

/**
 * AI-ANNOTATION
 * @ai-summary Registry of enrolled browser devices for the device-bound credential
 *   scheme: one record per browser, holding the PUBLIC half of a non-extractable
 *   ECDSA P-256 keypair whose private half never leaves that browser's IndexedDB.
 *   Nothing stored here is a secret — a public key and a deviceId are both safe to
 *   leak, which is the entire point: there is no at-rest credential left to steal
 *   from either side.
 * @ai-public DeviceStore, DeviceRecord, PublicDeviceInfo
 * @ai-notes Deliberately a SEPARATE file (auth-devices.json) from auth-keys.json,
 *   for the same reason key-store split from account-store: the two are written on
 *   very different cadences and must not contend on one file lock. Device tokens
 *   churn every few minutes in key-store while these records are near-static.
 *   Revocation is a tombstone (revokedAt), never a delete, so a revoked device
 *   stays auditable.
 */

export interface DeviceRecord {
  id: string;
  accountId: string;
  /** PUBLIC key only, JWK form. The private half is non-extractable in the browser. */
  publicKeyJwk: JsonWebKeyLike;
  /** User-facing name for the "your devices" list, e.g. "Work laptop — Firefox". */
  label: string;
  /**
   * The browser origin this device enrolled from, as sent in the `Origin` header and matched
   * against the configured origin → services map. Recorded for audit: it is the evidence for
   * WHY `allowedServices` says what it says.
   */
  enrolledOrigin: string;
  /**
   * The audiences this device may mint access tokens for — resolved from `enrolledOrigin` at
   * enrollment time and frozen here, NEVER taken from the assert request.
   *
   * This is the fix for the audience being caller-chosen: a token's audience is what confines
   * it to one service, so letting the client name any service made that confinement
   * meaningless (an XSS on a low-value app could mint a token for a privileged one). Frozen at
   * enrollment rather than looked up per-assert so that re-pointing the origin map cannot
   * silently widen a device already in the field — it re-enrolls instead.
   */
  allowedServices: string[];
  /**
   * The account's epoch when this device enrolled. Compared against the CURRENT epoch on
   * every lookup, which is what makes a password change / reset / rotate-master invalidate
   * enrollments automatically — copied deliberately from key-store's `mintedAtEpoch` idiom
   * so there is no list of call sites anyone has to remember to update.
   */
  enrolledAtEpoch: number;
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string;
}

/**
 * Why a reason instead of just null: the client needs to tell "re-enroll me" apart from
 * "this device is gone for good", and an operator reading a log needs to tell a stale epoch
 * (expected, benign — someone changed their password) from a revoked device (deliberate).
 */
export type DeviceLookup =
  | { ok: true; device: DeviceRecord }
  | { ok: false; reason: 'unknown' | 'revoked' | 'stale-epoch' | 'stale-binding' };

/** The subset of JWK fields a P-256 public key needs; narrower than lib.dom's JsonWebKey. */
export interface JsonWebKeyLike {
  kty: string;
  crv: string;
  x: string;
  y: string;
  [extra: string]: unknown;
}

/** Safe to hand to a browser — there is no secret field to omit, unlike key-store's records. */
export interface PublicDeviceInfo {
  id: string;
  label: string;
  /** Shown in the devices list so a user can see what each device is actually able to reach. */
  allowedServices: string[];
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string;
}

interface DevicesFileData {
  devices: DeviceRecord[];
}

/**
 * Rejects anything that isn't a P-256 public JWK. Strict on purpose: a private JWK
 * carries `d`, and accepting one would mean a browser had exported key material that
 * should have been non-extractable — a sign the client is not implementing the scheme,
 * so refuse rather than silently store it.
 */
export function assertValidP256PublicJwk(value: unknown): JsonWebKeyLike {
  const jwk = value as Record<string, unknown> | null | undefined;
  if (!jwk || typeof jwk !== 'object') {
    throw new AuthError('publicKeyJwk must be an object', 400);
  }
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') {
    throw new AuthError('publicKeyJwk must be an EC key on curve P-256', 400);
  }
  if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string' || !jwk.x || !jwk.y) {
    throw new AuthError('publicKeyJwk must carry base64url x and y coordinates', 400);
  }
  if ('d' in jwk) {
    throw new AuthError('publicKeyJwk must be a PUBLIC key — it must not contain "d"', 400);
  }
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

export class DeviceStore extends EncryptedFileStore<DevicesFileData> {
  constructor(dataDir: string, key: Buffer) {
    super(path.join(dataDir, 'auth-devices.json'), key, () => ({ devices: [] }));
  }

  private list(): DeviceRecord[] {
    return this.read().devices;
  }

  private persist(devices: DeviceRecord[]): void {
    this.write({ devices });
  }

  /** Registers a browser's public key. Returns the deviceId, which is NOT a secret. */
  enroll(
    accountId: string,
    publicKeyJwk: JsonWebKeyLike,
    label: string,
    currentEpoch: number,
    enrolledOrigin: string,
    allowedServices: string[],
  ): { id: string } {
    const now = new Date().toISOString();
    const record: DeviceRecord = {
      id: crypto.randomBytes(8).toString('hex'),
      accountId,
      publicKeyJwk,
      label,
      enrolledOrigin,
      allowedServices,
      enrolledAtEpoch: currentEpoch,
      createdAt: now,
      lastSeenAt: now,
    };
    const devices = this.list();
    devices.push(record);
    this.persist(devices);
    return { id: record.id };
  }

  /**
   * The single gate every device authentication must pass: exists, not revoked, and enrolled
   * at the account's CURRENT epoch. The caller supplies the epoch lookup rather than this
   * store reaching into account-store — same decoupling key-store keeps.
   */
  lookup(deviceId: string, currentEpoch: (accountId: string) => number | undefined): DeviceLookup {
    const record = this.list().find((d) => d.id === deviceId);
    if (!record) return { ok: false, reason: 'unknown' };
    if (record.revokedAt) return { ok: false, reason: 'revoked' };
    const epoch = currentEpoch(record.accountId);
    if (epoch === undefined || record.enrolledAtEpoch !== epoch) return { ok: false, reason: 'stale-epoch' };
    // A record predating the audience binding has no provable audience set, and defaulting one
    // in would be inventing an authorization nobody granted. Force re-enrollment instead —
    // it is a silent round trip for the user, and it fails CLOSED.
    if (!Array.isArray(record.allowedServices) || record.allowedServices.length === 0) {
      return { ok: false, reason: 'stale-binding' };
    }
    return { ok: true, device: record };
  }

  /**
   * Whether this device may mint a token for `service`. The ONLY authority on a device's
   * audience — callers must never fall back to the service named in the request.
   */
  static mayMintFor(record: DeviceRecord, service: string): boolean {
    return record.allowedServices.includes(service);
  }

  listForAccount(accountId: string): PublicDeviceInfo[] {
    return this.list()
      .filter((d) => d.accountId === accountId)
      .map((d) => ({
        id: d.id,
        label: d.label,
        // `?? []` covers records written before the audience binding existed; lookup() refuses
        // those anyway, so an empty list here reads correctly as "can reach nothing".
        allowedServices: d.allowedServices ?? [],
        createdAt: d.createdAt,
        lastSeenAt: d.lastSeenAt,
        ...(d.revokedAt ? { revokedAt: d.revokedAt } : {}),
      }));
  }

  /** Freshness for the device list. Best-effort: a failed touch must never fail the request. */
  touch(deviceId: string): void {
    const devices = this.list();
    const record = devices.find((d) => d.id === deviceId);
    if (!record || record.revokedAt) return;
    record.lastSeenAt = new Date().toISOString();
    this.persist(devices);
  }

  /** Scoped to the account so one account can never revoke another's device. Idempotent. */
  revoke(accountId: string, deviceId: string): void {
    const devices = this.list();
    const record = devices.find((d) => d.id === deviceId && d.accountId === accountId);
    if (!record) throw new AuthError('unknown device', 404);
    if (record.revokedAt) return;
    record.revokedAt = new Date().toISOString();
    this.persist(devices);
  }

  /**
   * Explicit "sign out all my devices" — a user-facing panic button, NOT the mechanism that
   * handles password changes. Epoch bumps are handled automatically by `lookup`'s
   * enrolledAtEpoch check, precisely so no future epoch-bumping code path has to remember to
   * call this. This exists for the case where someone wants every device gone right now
   * without changing their password.
   */
  revokeAllForAccount(accountId: string): number {
    const devices = this.list();
    const now = new Date().toISOString();
    let revoked = 0;
    for (const record of devices) {
      if (record.accountId !== accountId || record.revokedAt) continue;
      record.revokedAt = now;
      revoked += 1;
    }
    if (revoked > 0) this.persist(devices);
    return revoked;
  }
}
