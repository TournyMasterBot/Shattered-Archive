import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { ServiceKeyStore } from './service-key-store.js';
import { generateServiceKeypair, signAssertion } from './crypto-primitives.js';

function makeStore(): { store: ServiceKeyStore; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'service-key-store-'));
  return { store: new ServiceKeyStore(dir, crypto.randomBytes(32)), dir };
}

function sign(service: string, privateKeyPem: string, overrides: Partial<{ iat: number; exp: number; nonce: string }> = {}): string {
  const now = Date.now();
  const payload = {
    service,
    iat: overrides.iat ?? now,
    exp: overrides.exp ?? now + 30_000,
    nonce: overrides.nonce ?? crypto.randomBytes(8).toString('hex'),
  };
  return signAssertion(payload, privateKeyPem);
}

describe('ServiceKeyStore', () => {
  let dir: string;
  let store: ServiceKeyStore;

  beforeEach(() => {
    ({ store, dir } = makeStore());
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('accepts a validly-signed, fresh assertion from a registered key', () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    store.registerKey('svc-a', publicKeyPem);
    const compact = sign('svc-a', privateKeyPem);
    expect(store.verifyAssertion(compact)).toEqual({ service: 'svc-a' });
  });

  it('rejects an assertion for an unregistered service', () => {
    const { privateKeyPem } = generateServiceKeypair();
    const compact = sign('unregistered-service', privateKeyPem);
    expect(store.verifyAssertion(compact)).toBeNull();
  });

  it('rejects an assertion signed by a key that was never registered for that service', () => {
    const { publicKeyPem } = generateServiceKeypair();
    store.registerKey('svc-b', publicKeyPem);
    const impostor = generateServiceKeypair();
    const compact = sign('svc-b', impostor.privateKeyPem);
    expect(store.verifyAssertion(compact)).toBeNull();
  });

  it('accepts EITHER key during a two-key rotation window', () => {
    const oldKey = generateServiceKeypair();
    const newKey = generateServiceKeypair();
    store.registerKey('svc-c', oldKey.publicKeyPem);
    store.registerKey('svc-c', newKey.publicKeyPem);

    expect(store.verifyAssertion(sign('svc-c', oldKey.privateKeyPem))).toEqual({ service: 'svc-c' });
    expect(store.verifyAssertion(sign('svc-c', newKey.privateKeyPem))).toEqual({ service: 'svc-c' });
  });

  it('rejects a revoked key even though it is still registered', () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    const { keyId } = store.registerKey('svc-d', publicKeyPem);
    store.revokeKey('svc-d', keyId);
    expect(store.verifyAssertion(sign('svc-d', privateKeyPem))).toBeNull();
  });

  it('rejects an expired assertion', () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    store.registerKey('svc-e', publicKeyPem);
    const now = Date.now();
    const compact = sign('svc-e', privateKeyPem, { iat: now - 5000, exp: now - 1000 });
    expect(store.verifyAssertion(compact)).toBeNull();
  });

  it('rejects an assertion whose window (exp - iat) is too wide', () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    store.registerKey('svc-f', publicKeyPem);
    const now = Date.now();
    const compact = sign('svc-f', privateKeyPem, { iat: now, exp: now + 5 * 60_000 }); // way over 60s
    expect(store.verifyAssertion(compact)).toBeNull();
  });

  it('rejects a future-dated (clock-skew-abusing) assertion', () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    store.registerKey('svc-g', publicKeyPem);
    const now = Date.now();
    const compact = sign('svc-g', privateKeyPem, { iat: now + 60_000, exp: now + 90_000 });
    expect(store.verifyAssertion(compact)).toBeNull();
  });

  it('rejects a replayed nonce', () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    store.registerKey('svc-h', publicKeyPem);
    const compact = sign('svc-h', privateKeyPem, { nonce: 'fixed-nonce' });
    expect(store.verifyAssertion(compact)).toEqual({ service: 'svc-h' });
    expect(store.verifyAssertion(compact)).toBeNull();
  });

  it('revokeKey throws for an unknown key id', () => {
    expect(() => store.revokeKey('svc-i', 'no-such-key')).toThrow();
  });
});
