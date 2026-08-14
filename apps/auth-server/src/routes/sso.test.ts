import crypto from 'crypto';

import { generateServiceKeypair } from '../crypto-primitives.js';
import { startTestApp, signupAndLogin, fullyOnboardedSession, type TestHarness } from './test-helpers.js';

const REDIRECT_URI = 'https://consumer.example/auth/callback';

describe('POST /api/sso/approve', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await startTestApp();
  });

  afterEach(async () => {
    await harness.close();
  });

  function registerConsumer(service = 'consumer-service'): void {
    const { publicKeyPem } = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey(service, publicKeyPem);
    harness.deps.serviceKeyStore.addRedirectUri(service, REDIRECT_URI);
  }

  async function approve(cookie: string, service: string, redirectUri: string): Promise<Response> {
    return fetch(`${harness.base}/api/sso/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ service, redirectUri }),
    });
  }

  it('a logged-in user approving a registered service+redirect gets a one-time code', async () => {
    registerConsumer();
    const cookie = await fullyOnboardedSession(harness.base, 'alice');
    const res = await approve(cookie, 'consumer-service', REDIRECT_URI);
    expect(res.status).toBe(201);
    const { code } = (await res.json()) as { code: string };
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThanOrEqual(24);
  });

  it('requires a session — no cookie is a 401', async () => {
    registerConsumer();
    const res = await fetch(`${harness.base}/api/sso/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'consumer-service', redirectUri: REDIRECT_URI }),
    });
    expect(res.status).toBe(401);
  });

  it('is blocked during mustChangePassword like every non-allowlisted route', async () => {
    registerConsumer();
    const { cookie } = await signupAndLogin(harness.base, 'bella'); // still mustChangePassword
    const res = await approve(cookie, 'consumer-service', REDIRECT_URI);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe('MUST_CHANGE_PASSWORD');
  });

  it('rejects an unknown service and an unregistered redirect URI with the SAME generic 400', async () => {
    registerConsumer();
    const cookie = await fullyOnboardedSession(harness.base, 'carla');

    const unknownService = await approve(cookie, 'never-registered', REDIRECT_URI);
    const wrongUri = await approve(cookie, 'consumer-service', 'https://consumer.example/other');
    expect(unknownService.status).toBe(400);
    expect(wrongUri.status).toBe(400);
    const a = ((await unknownService.json()) as { error: string }).error;
    const b = ((await wrongUri.json()) as { error: string }).error;
    expect(a).toBe(b); // no oracle for WHICH binding failed
  });

  it('a service whose keys are all revoked stops being approvable', async () => {
    const { publicKeyPem } = generateServiceKeypair();
    const { keyId } = harness.deps.serviceKeyStore.registerKey('dying-service', publicKeyPem);
    harness.deps.serviceKeyStore.addRedirectUri('dying-service', REDIRECT_URI);
    harness.deps.serviceKeyStore.revokeKey('dying-service', keyId);

    const cookie = await fullyOnboardedSession(harness.base, 'dora');
    const res = await approve(cookie, 'dying-service', REDIRECT_URI);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/sso/validate', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await startTestApp();
  });

  afterEach(async () => {
    await harness.close();
  });

  function registerConsumer(service = 'consumer-service'): void {
    const { publicKeyPem } = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey(service, publicKeyPem);
    harness.deps.serviceKeyStore.addRedirectUri(service, REDIRECT_URI);
  }

  async function validate(cookie: string | null, service: string, redirectUri: string): Promise<Response> {
    const qs = `service=${encodeURIComponent(service)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    return fetch(`${harness.base}/api/sso/validate?${qs}`, { headers: cookie ? { Cookie: cookie } : {} });
  }

  // The consent page navigates to redirect_uri on Cancel as well as Continue, and Cancel
  // asked the server nothing — so without this check the hub was an open redirect to any
  // URL placed in the query string, on the domain users trust with their password.
  it('accepts a registered service + redirect URI pair', async () => {
    registerConsumer();
    const cookie = await fullyOnboardedSession(harness.base, 'alice');
    const res = await validate(cookie, 'consumer-service', REDIRECT_URI);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('refuses an unregistered redirect URI for a real service', async () => {
    registerConsumer();
    const cookie = await fullyOnboardedSession(harness.base, 'alice');
    const res = await validate(cookie, 'consumer-service', 'https://evil.example/steal');
    expect(res.status).toBe(400);
  });

  it('refuses an unknown service with the SAME message — registration state is not an oracle', async () => {
    registerConsumer();
    const cookie = await fullyOnboardedSession(harness.base, 'alice');
    const unknownService = await validate(cookie, 'no-such-service', REDIRECT_URI);
    const unknownUri = await validate(cookie, 'consumer-service', 'https://evil.example/steal');
    expect(unknownService.status).toBe(400);
    expect(((await unknownService.json()) as { error: string }).error).toBe(
      ((await unknownUri.json()) as { error: string }).error,
    );
  });

  it('refuses missing parameters', async () => {
    registerConsumer();
    const cookie = await fullyOnboardedSession(harness.base, 'alice');
    expect((await validate(cookie, '', REDIRECT_URI)).status).toBe(400);
    expect((await validate(cookie, 'consumer-service', '')).status).toBe(400);
  });

  it('requires a session — an anonymous visitor cannot probe the registry with it', async () => {
    registerConsumer();
    const res = await validate(null, 'consumer-service', REDIRECT_URI);
    expect(res.status).toBe(401);
  });
});
