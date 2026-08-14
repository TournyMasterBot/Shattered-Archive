import crypto from 'crypto';
import type { Application, Request, Response } from 'express';

const STATE_COOKIE = 'kt-sso-state';
const STATE_COOKIE_MAX_AGE_SECONDS = 600;

/** Just the shape this file needs from services-server's ExchangeResult — kept local (no import
 * of services-server itself) so this file's test doesn't drag in its whole dependency graph
 * (transitively including an ESM-only package `uuid` that this app's jest config can't parse). */
interface ExchangeResultShape {
  readonly token: string;
  readonly expiresAt: string;
}

export interface KtSsoRoutesDeps {
  /** The PUBLIC hub origin — the browser is redirected here for `/sso/authorize`, so it must
   * always be reachable from wherever the user's browser actually is (never an internal docker
   * alias). Local dev and docker deployment use the SAME public edge URL here (there is no
   * "internal browser"). */
  readonly publicHubBaseUrl: string;
  /** The hub origin THIS SERVICE calls server-to-server for the code exchange. Local dev (bare
   * `pnpm dev`, no internal docker network) uses the same public edge URL as
   * `publicHubBaseUrl`; the dockerized deployment overrides this to the internal alias
   * (`http://auth-server.shatteredarchive.dev:62000`, no TLS) — mirrors the C# site's
   * AuthorizeBaseUrl/BaseUrl split and mud-builder-server's own AUTH_SERVER_URL convention. */
  readonly hubBaseUrl: string;
  readonly serviceName: string;
  readonly redirectUri: string;
  readonly privateKeyPem: string;
  /** kt-client's own origin(s) — a `returnUrl` outside this allowlist is refused with a 400. */
  readonly allowedReturnOrigins: readonly string[];
  /** REQUIRED, always injected — the real caller (index.ts) passes services-server's exchangeCode; tests pass a fake. Keeping this required (not defaulted here) is what keeps services-server out of this file's own import graph. */
  readonly exchangeCode: (
    authServerBaseUrl: string,
    service: string,
    privateKeyPem: string,
    code: string,
    redirectUri: string,
  ) => Promise<ExchangeResultShape>;
}

interface StateCookiePayload {
  readonly state: string;
  readonly returnUrl: string;
}

// NODE_ENV=production is set by the docker-compose entry (the ONLY deployment path this
// service is actually reachable over HTTPS on — see docs/auth-server.md's Phase F section);
// local dev leaves it unset, matching `pnpm dev`'s plain http://localhost:51000. A `Secure`
// cookie sent over plain HTTP is silently dropped by the browser, so this must stay
// conditional rather than always-on (mirrors the C# site's `Secure = !AppManager.IsDevelopment`
// pattern for the equivalent `game-sso-state` cookie).
const COOKIE_SECURE = process.env.NODE_ENV === 'production' ? '; Secure' : '';

function setStateCookie(res: Response, payload: StateCookiePayload): void {
  const value = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  res.setHeader(
    'Set-Cookie',
    `${STATE_COOKIE}=${value}; HttpOnly; SameSite=Lax; Max-Age=${STATE_COOKIE_MAX_AGE_SECONDS}; Path=/api/kt/auth${COOKIE_SECURE}`,
  );
}

function readStateCookie(req: Request): StateCookiePayload | null {
  const header = req.headers.cookie ?? '';
  const raw = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STATE_COOKIE}=`));
  if (!raw) return null;
  try {
    const value = raw.slice(STATE_COOKIE.length + 1);
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof parsed?.state !== 'string' || typeof parsed?.returnUrl !== 'string') return null;
    return parsed as StateCookiePayload;
  } catch {
    return null;
  }
}

function clearStateCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${STATE_COOKIE}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/api/kt/auth${COOKIE_SECURE}`);
}

function isAllowedReturnOrigin(url: string, allowed: readonly string[]): boolean {
  try {
    const origin = new URL(url).origin;
    return allowed.includes(origin);
  } catch {
    return false;
  }
}

/**
 * kt-client's login hand-off. Unlike game-client (Phase D, no backend of its own — the C# site
 * performs the exchange on its behalf), kingdom-tactics-server IS a real backend and performs
 * its own SSO code exchange using its own registered key (Step 1's `register-service`) — a
 * STANDARD Phase A consumer, not a borrowed-key one. The resulting token reaches kt-client the
 * same safe way game-client's does: a URL FRAGMENT (`#auth_token=...&expires_at=...`), never a
 * query string or a cookie a different origin couldn't read anyway.
 */
export function registerKtSsoRoutes(app: Application, deps: KtSsoRoutesDeps): void {
  const exchangeCode = deps.exchangeCode;

  app.get('/api/kt/auth/start', (req, res) => {
    const returnUrl = req.query.returnUrl;
    if (typeof returnUrl !== 'string' || !isAllowedReturnOrigin(returnUrl, deps.allowedReturnOrigins)) {
      res.status(400).json({ error: 'returnUrl is missing or not a registered kt-client origin' });
      return;
    }
    const state = crypto.randomBytes(16).toString('hex');
    setStateCookie(res, { state, returnUrl });
    const authorizeUrl = `${deps.publicHubBaseUrl.replace(/\/+$/, '')}/sso/authorize?service=${encodeURIComponent(
      deps.serviceName,
    )}&redirect_uri=${encodeURIComponent(deps.redirectUri)}&state=${encodeURIComponent(state)}`;
    res.redirect(authorizeUrl);
  });

  app.get('/api/kt/auth/callback', async (req, res) => {
    const cookie = readStateCookie(req);
    clearStateCookie(res);

    // No safe target to bounce back to without a validated returnUrl from our own cookie.
    if (!cookie || !isAllowedReturnOrigin(cookie.returnUrl, deps.allowedReturnOrigins)) {
      res.status(400).json({ error: 'kt-sso hand-off is missing a valid return target' });
      return;
    }

    const { code, state, error } = req.query;
    if (error || typeof code !== 'string' || typeof state !== 'string' || state !== cookie.state) {
      res.redirect(`${cookie.returnUrl}#auth_error=1`);
      return;
    }

    try {
      // MUST match the redirectUri used at /api/kt/auth/start exactly — the hub's code store
      // burns the code on any mismatch (see services-server's exchangeCode doc).
      const exchange = await exchangeCode(deps.hubBaseUrl, deps.serviceName, deps.privateKeyPem, code, deps.redirectUri);
      const fragment = `auth_token=${encodeURIComponent(exchange.token)}&expires_at=${encodeURIComponent(exchange.expiresAt)}`;
      res.redirect(`${cookie.returnUrl}#${fragment}`);
    } catch {
      res.redirect(`${cookie.returnUrl}#auth_error=1`);
    }
  });
}
