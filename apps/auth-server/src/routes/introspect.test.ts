import crypto from 'crypto';

import { generateServiceKeypair, signAssertion } from '../crypto-primitives.js';
import { startTestApp, fullyOnboardedSession, type TestHarness } from './test-helpers.js';

function assertionFor(service: string, privateKeyPem: string, overrides: Partial<{ iat: number; exp: number; nonce: string }> = {}): string {
  const now = Date.now();
  return signAssertion(
    {
      service,
      iat: overrides.iat ?? now,
      exp: overrides.exp ?? now + 30_000,
      nonce: overrides.nonce ?? crypto.randomBytes(8).toString('hex'),
    },
    privateKeyPem,
  );
}

async function mintApiKeyViaHttp(base: string, cookie: string): Promise<string> {
  const res = await fetch(`${base}/api/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ service: 'consumer-service', label: 'introspect test key' }),
  });
  const body = (await res.json()) as { token: string };
  return body.token;
}

describe('introspect route', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await startTestApp();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('401s with no X-Service-Assertion header', async () => {
    const res = await fetch(`${harness.base}/api/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'whatever' }),
    });
    expect(res.status).toBe(401);
  });

  it('401s with an assertion signed by an unregistered key', async () => {
    const impostor = generateServiceKeypair();
    const res = await fetch(`${harness.base}/api/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Assertion': assertionFor('nobody', impostor.privateKeyPem) },
      body: JSON.stringify({ token: 'whatever' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns {valid:true,...} for a real token, given a validly-signed assertion', async () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey('consumer-service', publicKeyPem);

    const cookie = await fullyOnboardedSession(harness.base, 'alice');
    const token = await mintApiKeyViaHttp(harness.base, cookie);

    const res = await fetch(`${harness.base}/api/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Assertion': assertionFor('consumer-service', privateKeyPem) },
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { valid: boolean; accountId: string; service: string; label: string };
    expect(body.valid).toBe(true);
    expect(body.service).toBe('consumer-service');
    expect(body.label).toBe('introspect test key');
  });

  it('returns {valid:false} (not an error) for an unknown token, given a valid assertion', async () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey('consumer-service', publicKeyPem);

    const res = await fetch(`${harness.base}/api/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Assertion': assertionFor('consumer-service', privateKeyPem) },
      body: JSON.stringify({ token: 'not-a-real-token' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { valid: boolean }).toEqual({ valid: false });
  });

  it('an expired API key returns {valid:false}', async () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey('consumer-service', publicKeyPem);

    const cookie = await fullyOnboardedSession(harness.base, 'bob');
    const meRes = await fetch(`${harness.base}/api/auth/me`, { headers: { Cookie: cookie } });
    const { id: accountId } = (await meRes.json()) as { id: string };

    // Past expiresAt bypasses the ROUTE's future-date validation deliberately — this exercises the
    // STORE's verify()-time expiry check directly, same as key-store.test.ts's equivalent case.
    const { token } = harness.deps.keyStore.mintApiKey(
      accountId,
      'consumer-service',
      'expired key',
      new Date(Date.now() - 1000).toISOString(),
      0,
    );

    const res = await fetch(`${harness.base}/api/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Assertion': assertionFor('consumer-service', privateKeyPem) },
      body: JSON.stringify({ token }),
    });
    expect((await res.json()) as { valid: boolean }).toEqual({ valid: false });
  });

  it('accepts EITHER key during a two-key service rotation window', async () => {
    const oldKey = generateServiceKeypair();
    const newKey = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey('consumer-service', oldKey.publicKeyPem);
    harness.deps.serviceKeyStore.registerKey('consumer-service', newKey.publicKeyPem);

    const cookie = await fullyOnboardedSession(harness.base, 'carol');
    const token = await mintApiKeyViaHttp(harness.base, cookie);

    const withOld = await fetch(`${harness.base}/api/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Assertion': assertionFor('consumer-service', oldKey.privateKeyPem) },
      body: JSON.stringify({ token }),
    });
    const withNew = await fetch(`${harness.base}/api/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Assertion': assertionFor('consumer-service', newKey.privateKeyPem) },
      body: JSON.stringify({ token }),
    });
    expect(((await withOld.json()) as { valid: boolean }).valid).toBe(true);
    expect(((await withNew.json()) as { valid: boolean }).valid).toBe(true);
  });

  it('rejects a revoked service key', async () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    const { keyId } = harness.deps.serviceKeyStore.registerKey('consumer-service', publicKeyPem);
    harness.deps.serviceKeyStore.revokeKey('consumer-service', keyId);

    const res = await fetch(`${harness.base}/api/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Assertion': assertionFor('consumer-service', privateKeyPem) },
      body: JSON.stringify({ token: 'whatever' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a stale (expired) assertion', async () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey('consumer-service', publicKeyPem);
    const now = Date.now();

    const res = await fetch(`${harness.base}/api/introspect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Assertion': assertionFor('consumer-service', privateKeyPem, { iat: now - 5000, exp: now - 1000 }),
      },
      body: JSON.stringify({ token: 'whatever' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a future-dated assertion', async () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey('consumer-service', publicKeyPem);
    const now = Date.now();

    const res = await fetch(`${harness.base}/api/introspect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Assertion': assertionFor('consumer-service', privateKeyPem, { iat: now + 60_000, exp: now + 90_000 }),
      },
      body: JSON.stringify({ token: 'whatever' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a replayed assertion nonce', async () => {
    const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey('consumer-service', publicKeyPem);
    const assertion = assertionFor('consumer-service', privateKeyPem, { nonce: 'fixed-nonce-for-replay-test' });

    const first = await fetch(`${harness.base}/api/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Assertion': assertion },
      body: JSON.stringify({ token: 'whatever' }),
    });
    expect(first.status).toBe(200); // assertion itself is valid; token lookup just says {valid:false}

    const replay = await fetch(`${harness.base}/api/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Assertion': assertion },
      body: JSON.stringify({ token: 'whatever' }),
    });
    expect(replay.status).toBe(401);
  });
});
