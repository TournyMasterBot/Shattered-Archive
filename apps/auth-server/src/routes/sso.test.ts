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
