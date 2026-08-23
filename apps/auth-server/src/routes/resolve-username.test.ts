import crypto from 'crypto';

import { generateServiceKeypair, signAssertion } from '../crypto-primitives.js';
import { startTestApp, signupAndLogin, type TestHarness } from './test-helpers.js';

function assertionFor(service: string, privateKeyPem: string): string {
  const now = Date.now();
  return signAssertion({ service, iat: now, exp: now + 30_000, nonce: crypto.randomBytes(8).toString('hex') }, privateKeyPem);
}

describe('resolve-username route', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await startTestApp();
  });

  afterEach(async () => {
    await harness.close();
  });

  const resolve = (username: string, assertion?: string) =>
    fetch(`${harness.base}/api/service/resolve-username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(assertion ? { 'X-Service-Assertion': assertion } : {}) },
      body: JSON.stringify({ username }),
    });

  it('401s with no X-Service-Assertion header', async () => {
    expect((await resolve('anyone')).status).toBe(401);
  });

  it('401s with an assertion signed by an unregistered key', async () => {
    const impostor = generateServiceKeypair();
    const res = await resolve('anyone', assertionFor('nobody', impostor.privateKeyPem));
    expect(res.status).toBe(401);
  });

  it('resolves a real username to its accountId, given a valid assertion', async () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey('consumer-service', publicKeyPem);
    await signupAndLogin(harness.base, 'melchaleve');

    const res = await resolve('melchaleve', assertionFor('consumer-service', privateKeyPem));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { found: boolean; id: string; username: string };
    expect(body.found).toBe(true);
    expect(body.username).toBe('melchaleve');
    expect(typeof body.id).toBe('string');
    expect(body.id.length).toBeGreaterThan(0);
  });

  it('an unknown username returns {found:false}, not an error', async () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey('consumer-service', publicKeyPem);

    const res = await resolve('nobody-signed-up-with-this-name', assertionFor('consumer-service', privateKeyPem));
    expect(res.status).toBe(200);
    expect((await res.json()) as { found: boolean }).toEqual({ found: false });
  });

  it('is case-insensitive, matching account lookup elsewhere in this service', async () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey('consumer-service', publicKeyPem);
    await signupAndLogin(harness.base, 'MixedCase');

    const res = await resolve('mixedcase', assertionFor('consumer-service', privateKeyPem));
    const body = (await res.json()) as { found: boolean; username: string };
    expect(body.found).toBe(true);
    expect(body.username).toBe('MixedCase'); // canonical stored casing, not the query casing
  });

  it('never leaks other account fields — only {found, id, username}', async () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey('consumer-service', publicKeyPem);
    await signupAndLogin(harness.base, 'dana');

    const res = await resolve('dana', assertionFor('consumer-service', privateKeyPem));
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['found', 'id', 'username']);
  });
});
