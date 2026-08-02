import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { ServiceKeyStore } from './service-key-store.js';
import { generateServiceKeypair, signAssertion } from './crypto-primitives.js';
import { reconcileServiceRegistry } from './service-registry-reconciler.js';

function makeStore(): ServiceKeyStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-reconcile-'));
  return new ServiceKeyStore(dir, crypto.randomBytes(32));
}

function makeKeyDir(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pubkeys-'));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

const REGISTRY = JSON.stringify({
  'shattered-web': { redirectUris: ['https://site/user/sso/callback', 'https://site/user/game-sso/callback'] },
});

describe('reconcileServiceRegistry', () => {
  it('registers a published key and its redirect URIs with no manual step', () => {
    const store = makeStore();
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    const keyDir = makeKeyDir({ 'shattered-web.pub': publicKeyPem });

    const result = reconcileServiceRegistry({ registryRaw: REGISTRY, publicKeyDir: keyDir, store });

    expect(result.ran).toBe(true);
    expect(store.isRegisteredService('shattered-web')).toBe(true);
    expect(store.listRedirectUris('shattered-web')).toEqual([
      'https://site/user/sso/callback',
      'https://site/user/game-sso/callback',
    ]);

    // The registered key must actually work for the assertion guard — the point of the exercise.
    const assertion = signAssertion(
      { service: 'shattered-web', iat: Date.now(), exp: Date.now() + 30_000, nonce: crypto.randomBytes(8).toString('hex') },
      privateKeyPem,
    );
    expect(store.verifyAssertion(assertion)).toBeTruthy();
  });

  it('is idempotent — a second pass changes nothing', () => {
    const store = makeStore();
    const keyDir = makeKeyDir({ 'shattered-web.pub': generateServiceKeypair().publicKeyPem });

    const first = reconcileServiceRegistry({ registryRaw: REGISTRY, publicKeyDir: keyDir, store });
    expect(first.actions.length).toBeGreaterThan(0);

    const second = reconcileServiceRegistry({ registryRaw: REGISTRY, publicKeyDir: keyDir, store });
    expect(second.ran).toBe(true);
    expect(second.actions).toEqual([]);
  });

  it('prunes a redirect URI that config no longer declares', () => {
    const store = makeStore();
    const keyDir = makeKeyDir({ 'shattered-web.pub': generateServiceKeypair().publicKeyPem });
    reconcileServiceRegistry({ registryRaw: REGISTRY, publicKeyDir: keyDir, store });

    const narrowed = JSON.stringify({ 'shattered-web': { redirectUris: ['https://site/user/sso/callback'] } });
    const result = reconcileServiceRegistry({ registryRaw: narrowed, publicKeyDir: keyDir, store });

    expect(result.actions).toContainEqual({
      serviceName: 'shattered-web',
      kind: 'redirect-removed',
      detail: 'https://site/user/game-sso/callback',
    });
    expect(store.listRedirectUris('shattered-web')).toEqual(['https://site/user/sso/callback']);
  });

  it('deregisters a service the config no longer declares', () => {
    const store = makeStore();
    const keyDir = makeKeyDir({
      'shattered-web.pub': generateServiceKeypair().publicKeyPem,
      'retired-service.pub': generateServiceKeypair().publicKeyPem,
    });
    const both = JSON.stringify({
      'shattered-web': { redirectUris: [] },
      'retired-service': { redirectUris: [] },
    });
    reconcileServiceRegistry({ registryRaw: both, publicKeyDir: keyDir, store });
    expect(store.isRegisteredService('retired-service')).toBe(true);

    reconcileServiceRegistry({ registryRaw: JSON.stringify({ 'shattered-web': { redirectUris: [] } }), publicKeyDir: keyDir, store });
    expect(store.isRegisteredService('retired-service')).toBe(false);
    expect(store.isRegisteredService('shattered-web')).toBe(true);
  });

  it('rotates: publishing a second key adds it, removing the old file revokes it', () => {
    const store = makeStore();
    const oldKey = generateServiceKeypair();
    const newKey = generateServiceKeypair();
    const keyDir = makeKeyDir({ 'shattered-web.pub': oldKey.publicKeyPem });
    reconcileServiceRegistry({ registryRaw: REGISTRY, publicKeyDir: keyDir, store });

    // Both live during the rotation window.
    fs.writeFileSync(path.join(keyDir, 'shattered-web@next.pub'), newKey.publicKeyPem);
    reconcileServiceRegistry({ registryRaw: REGISTRY, publicKeyDir: keyDir, store });
    const sign = (pem: string) =>
      signAssertion(
        { service: 'shattered-web', iat: Date.now(), exp: Date.now() + 30_000, nonce: crypto.randomBytes(8).toString('hex') },
        pem,
      );
    expect(store.verifyAssertion(sign(oldKey.privateKeyPem))).toBeTruthy();
    expect(store.verifyAssertion(sign(newKey.privateKeyPem))).toBeTruthy();

    // Retiring the old file revokes it.
    fs.rmSync(path.join(keyDir, 'shattered-web.pub'));
    reconcileServiceRegistry({ registryRaw: REGISTRY, publicKeyDir: keyDir, store });
    expect(store.verifyAssertion(sign(oldKey.privateKeyPem))).toBeNull();
    expect(store.verifyAssertion(sign(newKey.privateKeyPem))).toBeTruthy();
  });

  describe('refusals that protect live credentials', () => {
    it('does NOTHING when the registry is unset or empty', () => {
      const store = makeStore();
      const keyDir = makeKeyDir({ 'shattered-web.pub': generateServiceKeypair().publicKeyPem });
      reconcileServiceRegistry({ registryRaw: REGISTRY, publicKeyDir: keyDir, store });
      expect(store.isRegisteredService('shattered-web')).toBe(true);

      for (const raw of [undefined, '', '{}']) {
        const result = reconcileServiceRegistry({ registryRaw: raw, publicKeyDir: keyDir, store });
        expect(result.ran).toBe(false);
        expect(result.skippedReason).toMatch(/unset or declares no services/);
      }
      // Still registered — an unset variable must never read as "deregister everything".
      expect(store.isRegisteredService('shattered-web')).toBe(true);
    });

    it('does NOTHING when the registry does not parse', () => {
      const store = makeStore();
      const keyDir = makeKeyDir({ 'shattered-web.pub': generateServiceKeypair().publicKeyPem });
      reconcileServiceRegistry({ registryRaw: REGISTRY, publicKeyDir: keyDir, store });

      const result = reconcileServiceRegistry({ registryRaw: '{ broken', publicKeyDir: keyDir, store });
      expect(result.ran).toBe(false);
      expect(result.skippedReason).toMatch(/not valid JSON/);
      expect(store.listRedirectUris('shattered-web')).toHaveLength(2);
      expect(store.isRegisteredService('shattered-web')).toBe(true);
    });

    it('leaves keys ALONE for a declared service that has published none yet', () => {
      // The consumer is mid-restart, or its volume is not mounted. Treating "no files"
      // as "no keys" would revoke live credentials on every slow boot.
      const store = makeStore();
      const keyDir = makeKeyDir({ 'shattered-web.pub': generateServiceKeypair().publicKeyPem });
      reconcileServiceRegistry({ registryRaw: REGISTRY, publicKeyDir: keyDir, store });
      expect(store.isRegisteredService('shattered-web')).toBe(true);

      const emptyDir = makeKeyDir();
      const result = reconcileServiceRegistry({ registryRaw: REGISTRY, publicKeyDir: emptyDir, store });

      expect(result.ran).toBe(true);
      expect(store.isRegisteredService('shattered-web')).toBe(true);
      expect(result.warnings.join(' ')).toMatch(/published no public key yet/);
    });

    it('tolerates a missing public-key directory entirely', () => {
      const store = makeStore();
      const result = reconcileServiceRegistry({
        registryRaw: REGISTRY,
        publicKeyDir: path.join(os.tmpdir(), 'definitely-not-created-' + crypto.randomBytes(4).toString('hex')),
        store,
      });
      expect(result.ran).toBe(true);
      // Redirect URIs still reconcile; only the key set is unknown.
      expect(store.listRedirectUris('shattered-web')).toHaveLength(2);
    });
  });
});
