import crypto from 'crypto';

import { generateServiceKeypair, signAssertion } from '../crypto-primitives.js';
import { startTestApp, fullyOnboardedSession, type TestHarness } from './test-helpers.js';

const REDIRECT_URI = 'https://consumer.example/auth/callback';

function assertionFor(service: string, privateKeyPem: string): string {
  const now = Date.now();
  return signAssertion({ service, iat: now, exp: now + 30_000, nonce: crypto.randomBytes(8).toString('hex') }, privateKeyPem);
}

interface ExchangeBody {
  token: string;
  accountId: string;
  username: string;
  service: string;
  expiresAt: string;
  tokenType: string;
  globalRole: string;
  error?: string;
}

describe('POST /api/token-exchange', () => {
  let harness: TestHarness;
  let consumerKey: { publicKeyPem: string; privateKeyPem: string };

  beforeEach(async () => {
    harness = await startTestApp();
    consumerKey = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey('consumer-service', consumerKey.publicKeyPem);
    harness.deps.serviceKeyStore.addRedirectUri('consumer-service', REDIRECT_URI);
  });

  afterEach(async () => {
    await harness.close();
  });

  async function approvedCode(username: string): Promise<{ code: string; cookie: string }> {
    const cookie = await fullyOnboardedSession(harness.base, username);
    const res = await fetch(`${harness.base}/api/sso/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ service: 'consumer-service', redirectUri: REDIRECT_URI }),
    });
    const { code } = (await res.json()) as { code: string };
    return { code, cookie };
  }

  async function exchange(assertion: string | null, body: unknown): Promise<Response> {
    return fetch(`${harness.base}/api/token-exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(assertion ? { 'X-Service-Assertion': assertion } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  async function introspect(token: string, service = 'consumer-service', privateKeyPem = consumerKey.privateKeyPem): Promise<Record<string, unknown>> {
    const res = await fetch(`${harness.base}/api/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Assertion': assertionFor(service, privateKeyPem) },
      body: JSON.stringify({ token }),
    });
    return (await res.json()) as Record<string, unknown>;
  }

  it('full round trip: approve → code → exchange → an audience-scoped sso token that introspects with globalRole', async () => {
    const { code } = await approvedCode('erin');
    const res = await exchange(assertionFor('consumer-service', consumerKey.privateKeyPem), {
      grantType: 'authorization_code',
      code,
      redirectUri: REDIRECT_URI,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ExchangeBody;
    expect(body.username).toBe('erin');
    expect(body.service).toBe('consumer-service');
    expect(body.tokenType).toBe('sso');
    expect(body.globalRole).toBe('user');
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());

    const introspected = await introspect(body.token);
    expect(introspected.valid).toBe(true);
    expect(introspected.service).toBe('consumer-service');
    expect(introspected.tokenType).toBe('sso');
    expect(introspected.globalRole).toBe('user');
  });

  it('a granted global tier surfaces on both the exchange response and introspect', async () => {
    const { code } = await approvedCode('frida');
    const account = harness.deps.accountStore.findByUsername('frida')!;
    harness.deps.accountStore.setGlobalRole(account.id, 'admin');

    const res = await exchange(assertionFor('consumer-service', consumerKey.privateKeyPem), {
      grantType: 'authorization_code',
      code,
      redirectUri: REDIRECT_URI,
    });
    const body = (await res.json()) as ExchangeBody;
    expect(body.globalRole).toBe('admin');
    expect((await introspect(body.token)).globalRole).toBe('admin');
  });

  it('a code redeems exactly once — replay is a 400', async () => {
    const { code } = await approvedCode('gina');
    const assertion = () => assertionFor('consumer-service', consumerKey.privateKeyPem);
    const first = await exchange(assertion(), { grantType: 'authorization_code', code, redirectUri: REDIRECT_URI });
    expect(first.status).toBe(201);
    const replay = await exchange(assertion(), { grantType: 'authorization_code', code, redirectUri: REDIRECT_URI });
    expect(replay.status).toBe(400);
  });

  it("another service's assertion cannot redeem the code — and the attempt BURNS it", async () => {
    const otherKey = generateServiceKeypair();
    harness.deps.serviceKeyStore.registerKey('other-service', otherKey.publicKeyPem);

    const { code } = await approvedCode('hana');
    const stolen = await exchange(assertionFor('other-service', otherKey.privateKeyPem), {
      grantType: 'authorization_code',
      code,
      redirectUri: REDIRECT_URI,
    });
    expect(stolen.status).toBe(400);

    // The rightful service can no longer use it either — burned on the mismatched attempt.
    const rightful = await exchange(assertionFor('consumer-service', consumerKey.privateKeyPem), {
      grantType: 'authorization_code',
      code,
      redirectUri: REDIRECT_URI,
    });
    expect(rightful.status).toBe(400);
  });

  it('a mismatched redirectUri at exchange is rejected', async () => {
    const { code } = await approvedCode('iris');
    const res = await exchange(assertionFor('consumer-service', consumerKey.privateKeyPem), {
      grantType: 'authorization_code',
      code,
      redirectUri: 'https://consumer.example/other',
    });
    expect(res.status).toBe(400);
  });

  it('no assertion (or a session cookie in its place) is a 401 — there is no client-side exchange', async () => {
    const { code, cookie } = await approvedCode('jane');
    const bare = await exchange(null, { grantType: 'authorization_code', code, redirectUri: REDIRECT_URI });
    expect(bare.status).toBe(401);

    const cookieRes = await fetch(`${harness.base}/api/token-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ grantType: 'authorization_code', code, redirectUri: REDIRECT_URI }),
    });
    expect(cookieRes.status).toBe(401);
  });

  it('unknown grantType is a 400', async () => {
    const res = await exchange(assertionFor('consumer-service', consumerKey.privateKeyPem), { grantType: 'implicit' });
    expect(res.status).toBe(400);
  });

  describe('on_behalf_of', () => {
    let targetKey: { publicKeyPem: string; privateKeyPem: string };

    beforeEach(() => {
      targetKey = generateServiceKeypair();
      harness.deps.serviceKeyStore.registerKey('target-service', targetKey.publicKeyPem);
    });

    async function ssoTokenFor(username: string): Promise<ExchangeBody> {
      const { code } = await approvedCode(username);
      const res = await exchange(assertionFor('consumer-service', consumerKey.privateKeyPem), {
        grantType: 'authorization_code',
        code,
        redirectUri: REDIRECT_URI,
      });
      return (await res.json()) as ExchangeBody;
    }

    it('exchanges an own-audience token for a short-TTL token valid ONLY at the target service', async () => {
      const sso = await ssoTokenFor('kira');
      const res = await exchange(assertionFor('consumer-service', consumerKey.privateKeyPem), {
        grantType: 'on_behalf_of',
        token: sso.token,
        targetService: 'target-service',
      });
      expect(res.status).toBe(201);
      const obo = (await res.json()) as ExchangeBody;
      expect(obo.service).toBe('target-service');
      expect(obo.tokenType).toBe('obo');
      expect(obo.accountId).toBe(sso.accountId); // still bound to the same user
      // Minutes-scale TTL, nothing like the sso token's days.
      expect(Date.parse(obo.expiresAt) - Date.now()).toBeLessThanOrEqual(2 * 60 * 1000);

      const introspected = await introspect(obo.token, 'target-service', targetKey.privateKeyPem);
      expect(introspected.valid).toBe(true);
      expect(introspected.service).toBe('target-service');
    });

    it("rejects a subject token whose audience is NOT the caller — no forwarding another service's tokens", async () => {
      const sso = await ssoTokenFor('lena'); // audience: consumer-service
      const otherKey = generateServiceKeypair();
      harness.deps.serviceKeyStore.registerKey('other-service', otherKey.publicKeyPem);

      const res = await exchange(assertionFor('other-service', otherKey.privateKeyPem), {
        grantType: 'on_behalf_of',
        token: sso.token,
        targetService: 'target-service',
      });
      expect(res.status).toBe(403);
    });

    it('refuses to CHAIN — an obo token cannot itself be on-behalf-of exchanged', async () => {
      const sso = await ssoTokenFor('mona');
      const first = await exchange(assertionFor('consumer-service', consumerKey.privateKeyPem), {
        grantType: 'on_behalf_of',
        token: sso.token,
        targetService: 'target-service',
      });
      const obo = (await first.json()) as ExchangeBody;

      const chained = await exchange(assertionFor('target-service', targetKey.privateKeyPem), {
        grantType: 'on_behalf_of',
        token: obo.token,
        targetService: 'consumer-service',
      });
      expect(chained.status).toBe(403);
    });

    it('target must be a different, registered service', async () => {
      const sso = await ssoTokenFor('nora');
      const assertion = () => assertionFor('consumer-service', consumerKey.privateKeyPem);

      const unregistered = await exchange(assertion(), { grantType: 'on_behalf_of', token: sso.token, targetService: 'nowhere' });
      expect(unregistered.status).toBe(400);

      const self = await exchange(assertion(), { grantType: 'on_behalf_of', token: sso.token, targetService: 'consumer-service' });
      expect(self.status).toBe(400);
    });
  });
});
