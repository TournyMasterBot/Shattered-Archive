import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { KeyStore } from './key-store.js';
import { AuthError } from './errors.js';

function makeStore(): { store: KeyStore; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'key-store-'));
  return { store: new KeyStore(dir, crypto.randomBytes(32)), dir };
}

const ACCOUNT_ID = 'acct-1';
const epochLookup = (epoch: number) => (accountId: string) => (accountId === ACCOUNT_ID ? epoch : undefined);

describe('KeyStore', () => {
  let dir: string;
  let store: KeyStore;

  beforeEach(() => {
    ({ store, dir } = makeStore());
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('mints and verifies an API key with no expiration ("forever")', () => {
    const { token } = store.mintApiKey(ACCOUNT_ID, 'test-service', 'my key', null, 0);
    const verified = store.verify(token, epochLookup(0));
    expect(verified).toEqual({
      accountId: ACCOUNT_ID,
      keyId: expect.any(String),
      service: 'test-service',
      label: 'my key',
      kind: 'api',
      expiresAt: null,
    });
  });

  it('rejects an expired API key', () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const { token } = store.mintApiKey(ACCOUNT_ID, 'test-service', 'expired key', pastDate, 0);
    expect(store.verify(token, epochLookup(0))).toBeNull();
  });

  it('accepts an API key with a future expiration', () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString();
    const { token } = store.mintApiKey(ACCOUNT_ID, 'test-service', 'future key', futureDate, 0);
    expect(store.verify(token, epochLookup(0))).not.toBeNull();
  });

  it('mints and verifies a session', () => {
    const { token } = store.mintSession(ACCOUNT_ID, 0);
    const verified = store.verify(token, epochLookup(0));
    expect(verified?.kind).toBe('session');
    expect(verified?.service).toBe('auth-web');
  });

  it('an expired session stops verifying, exactly like an expired API key', () => {
    const { token } = store.mintSession(ACCOUNT_ID, 0, -1000);
    expect(store.verify(token, epochLookup(0))).toBeNull();
  });

  it('a key minted at an old epoch stops verifying once the account epoch advances (password-change/rotate-master invalidation)', () => {
    const { token } = store.mintApiKey(ACCOUNT_ID, 'svc', 'key', null, 0);
    expect(store.verify(token, epochLookup(0))).not.toBeNull();
    expect(store.verify(token, epochLookup(1))).toBeNull();
  });

  it('verify rejects an unknown token', () => {
    expect(store.verify('not-a-real-token', epochLookup(0))).toBeNull();
  });

  it('listKeys excludes sessions and never returns sha256', () => {
    store.mintApiKey(ACCOUNT_ID, 'svc', 'api key', null, 0);
    store.mintSession(ACCOUNT_ID, 0);
    const keys = store.listKeys(ACCOUNT_ID);
    expect(keys).toHaveLength(1);
    expect(keys[0].label).toBe('api key');
    expect(keys[0]).not.toHaveProperty('sha256');
  });

  it('revokeKey is idempotent and stops the key from verifying', () => {
    const { id, token } = store.mintApiKey(ACCOUNT_ID, 'svc', 'key', null, 0);
    store.revokeKey(id, ACCOUNT_ID);
    store.revokeKey(id, ACCOUNT_ID); // idempotent
    expect(store.verify(token, epochLookup(0))).toBeNull();
  });

  it('rotateKey issues a new token; the old one stops working', () => {
    const { id, token: oldToken } = store.mintApiKey(ACCOUNT_ID, 'svc', 'key', null, 0);
    const { token: newToken } = store.rotateKey(id, ACCOUNT_ID);
    expect(store.verify(oldToken, epochLookup(0))).toBeNull();
    expect(store.verify(newToken, epochLookup(0))).not.toBeNull();
  });

  it('rotateKey/revokeKey 404 (not 403) for a key belonging to someone else', () => {
    const { id } = store.mintApiKey(ACCOUNT_ID, 'svc', 'key', null, 0);
    expect(() => store.rotateKey(id, 'someone-else')).toThrow(AuthError);
    expect(() => store.revokeKey(id, 'someone-else')).toThrow(AuthError);
    try {
      store.revokeKey(id, 'someone-else');
    } catch (e) {
      expect((e as AuthError).status).toBe(404);
    }
  });

  it('revokeById revokes regardless of kind/ownership (used internally by logout)', () => {
    const { id, token } = store.mintSession(ACCOUNT_ID, 0);
    store.revokeById(id);
    expect(store.verify(token, epochLookup(0))).toBeNull();
  });

  it('mints and verifies an SSO exchange token carrying its audience service', () => {
    const { token, expiresAt } = store.mintExchangeToken(ACCOUNT_ID, 'svc-audience', 'sso', 'sso login', 60_000, 0);
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());
    const verified = store.verify(token, epochLookup(0));
    expect(verified?.kind).toBe('sso');
    expect(verified?.service).toBe('svc-audience');
    expect(verified?.expiresAt).toBe(expiresAt);
  });

  it('an expired OBO token stops verifying, and epoch invalidation applies to exchange tokens too', () => {
    const { token: expired } = store.mintExchangeToken(ACCOUNT_ID, 'svc-t', 'obo', 'obo:svc-caller', -1000, 0);
    expect(store.verify(expired, epochLookup(0))).toBeNull();
    const { token } = store.mintExchangeToken(ACCOUNT_ID, 'svc-t', 'obo', 'obo:svc-caller', 60_000, 0);
    expect(store.verify(token, epochLookup(0))).not.toBeNull();
    expect(store.verify(token, epochLookup(1))).toBeNull();
  });

  it('exchange tokens never appear in listKeys (kind filter)', () => {
    store.mintExchangeToken(ACCOUNT_ID, 'svc-a', 'sso', 'sso login', 60_000, 0);
    store.mintExchangeToken(ACCOUNT_ID, 'svc-b', 'obo', 'obo:svc-a', 60_000, 0);
    expect(store.listKeys(ACCOUNT_ID)).toEqual([]);
  });

  it('minting an exchange token purges sso/obo records long past expiry, but never api/session records', () => {
    const dayMs = 24 * 60 * 60 * 1000;
    // Expired 25h ago — past the 24h purge grace.
    store.mintExchangeToken(ACCOUNT_ID, 'svc-old', 'sso', 'stale', -25 * 60 * 60 * 1000, 0);
    const pastDate = new Date(Date.now() - 2 * dayMs).toISOString();
    store.mintApiKey(ACCOUNT_ID, 'svc-api', 'long-expired api key stays', pastDate, 0);
    expect(store.countKind('sso')).toBe(1);
    store.mintExchangeToken(ACCOUNT_ID, 'svc-new', 'sso', 'fresh', 60_000, 0);
    expect(store.countKind('sso')).toBe(1); // stale purged, fresh remains
    expect(store.countKind('api')).toBe(1); // api records untouched
  });
});
