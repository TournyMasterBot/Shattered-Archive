import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { DeviceStore, assertValidP256PublicJwk, type JsonWebKeyLike } from './device-store.js';
// Epoch lookups mirror key-store.test.ts's helper shape.
import { AuthError } from './errors.js';

function makeStore(): { store: DeviceStore; dir: string; key: Buffer } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'device-store-'));
  const key = crypto.randomBytes(32);
  return { store: new DeviceStore(dir, key), dir, key };
}

/** A REAL P-256 public JWK, generated rather than hand-written, so the shape can't drift from what WebCrypto actually emits. */
function realPublicJwk(): JsonWebKeyLike {
  const { publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return publicKey.export({ format: 'jwk' }) as unknown as JsonWebKeyLike;
}

const ACCOUNT_ID = 'acct-1';
const OTHER_ACCOUNT = 'acct-2';
/** The origin an enrollment came from, and the audience the origin map resolved it to. */
const ORIGIN = 'https://build.shatteredarchive.dev';
const SERVICES = ['mud-builder-server'];

/** Every known account sits at `epoch`; anything else is an unknown account (undefined). */
const epochLookup = (epoch: number) => (accountId: string) =>
  accountId === ACCOUNT_ID || accountId === OTHER_ACCOUNT ? epoch : undefined;

describe('assertValidP256PublicJwk', () => {
  it('accepts a real WebCrypto-shaped P-256 public JWK and narrows it to kty/crv/x/y', () => {
    const jwk = realPublicJwk();
    const result = assertValidP256PublicJwk(jwk);
    expect(result).toEqual({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y });
  });

  it.each([
    ['a non-object', 'not-a-jwk'],
    ['null', null],
    ['the wrong key type', { kty: 'RSA', crv: 'P-256', x: 'a', y: 'b' }],
    ['the wrong curve', { kty: 'EC', crv: 'P-384', x: 'a', y: 'b' }],
    ['a missing coordinate', { kty: 'EC', crv: 'P-256', x: 'a' }],
    ['an empty coordinate', { kty: 'EC', crv: 'P-256', x: '', y: 'b' }],
  ])('rejects %s', (_label, value) => {
    expect(() => assertValidP256PublicJwk(value)).toThrow(AuthError);
  });

  /**
   * The security-relevant case: `d` present means the browser exported PRIVATE key
   * material that the scheme requires to be non-extractable. Storing it would silently
   * defeat the entire design, so it must be refused rather than stripped.
   */
  it('rejects a PRIVATE jwk carrying "d" rather than silently stripping it', () => {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const privateJwk = privateKey.export({ format: 'jwk' });
    expect(privateJwk.d).toBeDefined();
    expect(() => assertValidP256PublicJwk(privateJwk)).toThrow(/must not contain "d"/);
  });
});

describe('DeviceStore', () => {
  let dir: string;
  let store: DeviceStore;
  let key: Buffer;

  beforeEach(() => {
    ({ store, dir, key } = makeStore());
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('enrolls a device and looks it up at the same epoch', () => {
    const { id } = store.enroll(ACCOUNT_ID, realPublicJwk(), 'Work laptop', 0, ORIGIN, SERVICES);
    const found = store.lookup(id, epochLookup(0));
    expect(found).toEqual({
      ok: true,
      device: expect.objectContaining({ accountId: ACCOUNT_ID, label: 'Work laptop', enrolledAtEpoch: 0 }),
    });
  });

  it('persists across store instances (survives a restart)', () => {
    const { id } = store.enroll(ACCOUNT_ID, realPublicJwk(), 'Work laptop', 0, ORIGIN, SERVICES);
    const reopened = new DeviceStore(dir, key);
    const found = reopened.lookup(id, epochLookup(0));
    expect(found.ok && found.device.id).toBe(id);
  });

  it('reports "unknown" for a device that was never enrolled', () => {
    expect(store.lookup('nope', epochLookup(0))).toEqual({ ok: false, reason: 'unknown' });
  });

  /**
   * The automatic invalidation that replaces having to call revokeAllForAccount from every
   * epoch-bumping route: a password change / reset / rotate-master bumps the epoch, and the
   * enrollment stops resolving with no record ever being touched.
   */
  it('reports "stale-epoch" after an epoch bump, without mutating the record', () => {
    const { id } = store.enroll(ACCOUNT_ID, realPublicJwk(), 'Work laptop', 0, ORIGIN, SERVICES);
    expect(store.lookup(id, epochLookup(1))).toEqual({ ok: false, reason: 'stale-epoch' });
    // Still not revoked — it is simply stale, which is why the reason must be distinguishable.
    expect(store.listForAccount(ACCOUNT_ID)[0].revokedAt).toBeUndefined();
  });

  it('reports "stale-epoch" when the account no longer exists at all', () => {
    const { id } = store.enroll('ghost-account', realPublicJwk(), 'Orphan', 0, ORIGIN, SERVICES);
    expect(store.lookup(id, epochLookup(0))).toEqual({ ok: false, reason: 'stale-epoch' });
  });

  it('reports "revoked" for a revoked device, and keeps it listed as a tombstone', () => {
    const { id } = store.enroll(ACCOUNT_ID, realPublicJwk(), 'Old phone', 0, ORIGIN, SERVICES);
    store.revoke(ACCOUNT_ID, id);
    expect(store.lookup(id, epochLookup(0))).toEqual({ ok: false, reason: 'revoked' });
    const listed = store.listForAccount(ACCOUNT_ID);
    expect(listed).toHaveLength(1);
    expect(listed[0].revokedAt).toBeDefined();
  });

  it('never lets one account revoke another account\'s device', () => {
    const { id } = store.enroll(ACCOUNT_ID, realPublicJwk(), 'Victim laptop', 0, ORIGIN, SERVICES);
    expect(() => store.revoke(OTHER_ACCOUNT, id)).toThrow(AuthError);
    expect(store.lookup(id, epochLookup(0)).ok).toBe(true);
  });

  it('treats a repeated revoke as a no-op rather than an error', () => {
    const { id } = store.enroll(ACCOUNT_ID, realPublicJwk(), 'Old phone', 0, ORIGIN, SERVICES);
    store.revoke(ACCOUNT_ID, id);
    const firstRevokedAt = store.listForAccount(ACCOUNT_ID)[0].revokedAt;
    expect(() => store.revoke(ACCOUNT_ID, id)).not.toThrow();
    expect(store.listForAccount(ACCOUNT_ID)[0].revokedAt).toBe(firstRevokedAt);
  });

  it('scopes listForAccount to the owning account', () => {
    store.enroll(ACCOUNT_ID, realPublicJwk(), 'Mine', 0, ORIGIN, SERVICES);
    store.enroll(OTHER_ACCOUNT, realPublicJwk(), 'Theirs', 0, ORIGIN, SERVICES);
    expect(store.listForAccount(ACCOUNT_ID).map((d) => d.label)).toEqual(['Mine']);
  });

  it('never exposes the public key material through listForAccount', () => {
    store.enroll(ACCOUNT_ID, realPublicJwk(), 'Mine', 0, ORIGIN, SERVICES);
    const listed = store.listForAccount(ACCOUNT_ID)[0] as unknown as Record<string, unknown>;
    expect(listed.publicKeyJwk).toBeUndefined();
    expect(Object.keys(listed).sort()).toEqual(['allowedServices', 'createdAt', 'id', 'label', 'lastSeenAt']);
  });

  /**
   * The audience binding. `allowedServices` is written at enrollment from the origin map, and
   * it is the ONLY thing that may answer "can this device mint for X" — an assert request
   * naming a service is a question, never an authorization.
   */
  it('binds the enrolling origin and its audience set onto the record', () => {
    const { id } = store.enroll(ACCOUNT_ID, realPublicJwk(), 'Work laptop', 0, ORIGIN, SERVICES);
    const found = store.lookup(id, epochLookup(0));
    expect(found.ok && found.device.enrolledOrigin).toBe(ORIGIN);
    expect(found.ok && found.device.allowedServices).toEqual(SERVICES);
  });

  it('permits minting only for a bound service', () => {
    const { id } = store.enroll(ACCOUNT_ID, realPublicJwk(), 'Work laptop', 0, ORIGIN, SERVICES);
    const found = store.lookup(id, epochLookup(0));
    expect(found.ok).toBe(true);
    if (!found.ok) throw new Error('unreachable');

    expect(DeviceStore.mayMintFor(found.device, 'mud-builder-server')).toBe(true);
    // The whole point: a device enrolled on the builder origin cannot reach for another
    // service's audience, even though nothing stops it from asking.
    expect(DeviceStore.mayMintFor(found.device, 'kingdom-tactics-server')).toBe(false);
  });

  it('carries every service when an origin maps to more than one', () => {
    const both = ['mud-builder-server', 'kingdom-tactics-server'];
    const { id } = store.enroll(ACCOUNT_ID, realPublicJwk(), 'Multi', 0, ORIGIN, both);
    const found = store.lookup(id, epochLookup(0));
    expect(found.ok).toBe(true);
    if (!found.ok) throw new Error('unreachable');
    expect(both.every((s) => DeviceStore.mayMintFor(found.device, s))).toBe(true);
  });

  /**
   * Records written before the binding existed have no provable audience. Inferring one would
   * be inventing an authorization nobody granted, so they must fail closed and re-enroll.
   */
  it('reports "stale-binding" for a record with no bound audience', () => {
    const { id } = store.enroll(ACCOUNT_ID, realPublicJwk(), 'Legacy', 0, ORIGIN, SERVICES);
    // Simulate a pre-binding record by writing the file as the old code would have.
    const filePath = path.join(dir, 'auth-devices.json');
    const legacy = new DeviceStore(dir, key) as unknown as {
      read: () => { devices: Record<string, unknown>[] };
      write: (d: unknown) => void;
    };
    const data = legacy.read();
    for (const d of data.devices) delete d.allowedServices;
    legacy.write(data);
    expect(fs.existsSync(filePath)).toBe(true);

    expect(new DeviceStore(dir, key).lookup(id, epochLookup(0))).toEqual({
      ok: false,
      reason: 'stale-binding',
    });
  });

  it('advances lastSeenAt on touch and ignores a touch of an unknown or revoked device', () => {
    const { id } = store.enroll(ACCOUNT_ID, realPublicJwk(), 'Work laptop', 0, ORIGIN, SERVICES);
    const before = store.listForAccount(ACCOUNT_ID)[0].lastSeenAt;
    jest.useFakeTimers().setSystemTime(new Date(Date.parse(before) + 60_000));
    store.touch(id);
    jest.useRealTimers();
    expect(store.listForAccount(ACCOUNT_ID)[0].lastSeenAt).not.toBe(before);

    expect(() => store.touch('nope')).not.toThrow();
    store.revoke(ACCOUNT_ID, id);
    const afterRevoke = store.listForAccount(ACCOUNT_ID)[0].lastSeenAt;
    store.touch(id);
    expect(store.listForAccount(ACCOUNT_ID)[0].lastSeenAt).toBe(afterRevoke);
  });

  /** The explicit "sign out all my devices" panic button, scoped to one account. */
  it('revokes every device for one account, leaving other accounts alone', () => {
    const a = store.enroll(ACCOUNT_ID, realPublicJwk(), 'Laptop', 0, ORIGIN, SERVICES);
    const b = store.enroll(ACCOUNT_ID, realPublicJwk(), 'Phone', 0, ORIGIN, SERVICES);
    const other = store.enroll(OTHER_ACCOUNT, realPublicJwk(), 'Untouched', 0, ORIGIN, SERVICES);

    expect(store.revokeAllForAccount(ACCOUNT_ID)).toBe(2);
    expect(store.lookup(a.id, epochLookup(0))).toEqual({ ok: false, reason: 'revoked' });
    expect(store.lookup(b.id, epochLookup(0))).toEqual({ ok: false, reason: 'revoked' });
    expect(store.lookup(other.id, epochLookup(0)).ok).toBe(true);
  });

  it('reports zero and writes nothing when there is nothing left to revoke', () => {
    store.enroll(ACCOUNT_ID, realPublicJwk(), 'Laptop', 0, ORIGIN, SERVICES);
    store.revokeAllForAccount(ACCOUNT_ID);
    expect(store.revokeAllForAccount(ACCOUNT_ID)).toBe(0);
  });
});
