import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { registerKtSsoRoutes, type KtSsoRoutesDeps } from './kt-sso-routes.js';

const RETURN_ORIGIN = 'http://localhost:50080';
const REDIRECT_URI = 'http://localhost:51000/api/kt/auth/callback';

function startApp(deps: Partial<KtSsoRoutesDeps> = {}): Promise<{ base: string; close: () => Promise<void> }> {
  const app = express();
  registerKtSsoRoutes(app, {
    publicHubBaseUrl: 'https://hub.invalid',
    hubBaseUrl: 'https://hub.invalid',
    serviceName: 'kingdom-tactics-server',
    redirectUri: REDIRECT_URI,
    privateKeyPem: 'unused-in-these-tests',
    allowedReturnOrigins: [RETURN_ORIGIN],
    exchangeCode: jest.fn(), // overridden per-test when the route under test actually calls it
    ...deps,
  });
  return new Promise((resolve) => {
    const server: Server = app.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve({ base, close: () => new Promise((res) => server.close(() => res())) });
    });
  });
}

function extractCookie(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? '';
  const match = raw.match(/kt-sso-state=([^;]+)/);
  return match ? `kt-sso-state=${match[1]}` : '';
}

describe('GET /api/kt/auth/start', () => {
  it('redirects to the hub with service/redirect_uri/state, and sets a state cookie', async () => {
    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/kt/auth/start?returnUrl=${encodeURIComponent(RETURN_ORIGIN + '/')}`, {
        redirect: 'manual',
      });
      expect(res.status).toBe(302);
      const location = new URL(res.headers.get('location') ?? '');
      expect(location.origin + location.pathname).toBe('https://hub.invalid/sso/authorize');
      expect(location.searchParams.get('service')).toBe('kingdom-tactics-server');
      expect(location.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
      expect(location.searchParams.get('state')).toBeTruthy();
      expect(extractCookie(res)).toBeTruthy();
    } finally {
      await close();
    }
  });

  it('state cookie is always HttpOnly + SameSite=Lax, and Secure only when NODE_ENV=production', async () => {
    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/kt/auth/start?returnUrl=${encodeURIComponent(RETURN_ORIGIN + '/')}`, {
        redirect: 'manual',
      });
      const raw = res.headers.get('set-cookie') ?? '';
      expect(raw).toContain('HttpOnly');
      expect(raw).toContain('SameSite=Lax');
      // A Secure cookie sent over plain http:// would be silently dropped by a real browser —
      // this test's own harness runs over http://127.0.0.1, so the current process's NODE_ENV
      // (whatever it is when this suite runs — not production) must NOT set Secure, or every
      // local-dev developer's own /api/kt/auth/start would silently stop working.
      expect(raw).not.toContain('Secure');
    } finally {
      await close();
    }
  });

  it('400s when returnUrl is missing', async () => {
    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/kt/auth/start`, { redirect: 'manual' });
      expect(res.status).toBe(400);
    } finally {
      await close();
    }
  });

  it('400s when returnUrl is not an allowed origin', async () => {
    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/kt/auth/start?returnUrl=${encodeURIComponent('http://evil.invalid/')}`, {
        redirect: 'manual',
      });
      expect(res.status).toBe(400);
    } finally {
      await close();
    }
  });

  it('redirects using publicHubBaseUrl even when hubBaseUrl (server-to-server) differs — the browser must never see an internal alias', async () => {
    const { base, close } = await startApp({
      publicHubBaseUrl: 'https://auth.shatteredarchive.dev',
      hubBaseUrl: 'http://auth-server.shatteredarchive.dev:62000',
    });
    try {
      const res = await fetch(`${base}/api/kt/auth/start?returnUrl=${encodeURIComponent(RETURN_ORIGIN + '/')}`, {
        redirect: 'manual',
      });
      const location = new URL(res.headers.get('location') ?? '');
      expect(location.origin).toBe('https://auth.shatteredarchive.dev');
    } finally {
      await close();
    }
  });
});

describe('GET /api/kt/auth/callback', () => {
  it('exchanges the code and redirects to returnUrl with an auth_token fragment', async () => {
    const exchangeCode = jest.fn().mockResolvedValue({
      token: 'the-token',
      accountId: 'acc-1',
      username: 'someone',
      service: 'kingdom-tactics-server',
      expiresAt: '2026-08-04T00:00:00.000Z',
      tokenType: 'sso',
      globalRole: 'user',
    });
    const { base, close } = await startApp({ exchangeCode });
    try {
      const startRes = await fetch(`${base}/api/kt/auth/start?returnUrl=${encodeURIComponent(RETURN_ORIGIN + '/')}`, {
        redirect: 'manual',
      });
      const state = new URL(startRes.headers.get('location') ?? '').searchParams.get('state');
      const cookie = extractCookie(startRes);

      const callbackRes = await fetch(`${base}/api/kt/auth/callback?code=abc&state=${state}`, {
        headers: { Cookie: cookie },
        redirect: 'manual',
      });
      expect(callbackRes.status).toBe(302);
      const location = callbackRes.headers.get('location') ?? '';
      expect(location.startsWith(RETURN_ORIGIN)).toBe(true);
      const fragment = new URLSearchParams(location.split('#')[1] ?? '');
      expect(fragment.get('auth_token')).toBe('the-token');
      expect(fragment.get('expires_at')).toBe('2026-08-04T00:00:00.000Z');
      expect(exchangeCode).toHaveBeenCalledWith('https://hub.invalid', 'kingdom-tactics-server', 'unused-in-these-tests', 'abc', REDIRECT_URI);
    } finally {
      await close();
    }
  });

  it('redirects with #auth_error=1 when state does not match the cookie', async () => {
    const { base, close } = await startApp();
    try {
      const startRes = await fetch(`${base}/api/kt/auth/start?returnUrl=${encodeURIComponent(RETURN_ORIGIN + '/')}`, {
        redirect: 'manual',
      });
      const cookie = extractCookie(startRes);

      const callbackRes = await fetch(`${base}/api/kt/auth/callback?code=abc&state=wrong-state`, {
        headers: { Cookie: cookie },
        redirect: 'manual',
      });
      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.get('location')).toBe(`${RETURN_ORIGIN}/#auth_error=1`);
    } finally {
      await close();
    }
  });

  it('400s with no state cookie at all (no safe target to bounce to)', async () => {
    const { base, close } = await startApp();
    try {
      const res = await fetch(`${base}/api/kt/auth/callback?code=abc&state=x`, { redirect: 'manual' });
      expect(res.status).toBe(400);
    } finally {
      await close();
    }
  });

  it('redirects with #auth_error=1 when the exchange itself fails', async () => {
    const exchangeCode = jest.fn().mockRejectedValue(new Error('invalid, expired, or already-used code'));
    const { base, close } = await startApp({ exchangeCode });
    try {
      const startRes = await fetch(`${base}/api/kt/auth/start?returnUrl=${encodeURIComponent(RETURN_ORIGIN + '/')}`, {
        redirect: 'manual',
      });
      const state = new URL(startRes.headers.get('location') ?? '').searchParams.get('state');
      const cookie = extractCookie(startRes);

      const callbackRes = await fetch(`${base}/api/kt/auth/callback?code=abc&state=${state}`, {
        headers: { Cookie: cookie },
        redirect: 'manual',
      });
      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.get('location')).toBe(`${RETURN_ORIGIN}/#auth_error=1`);
    } finally {
      await close();
    }
  });
});
