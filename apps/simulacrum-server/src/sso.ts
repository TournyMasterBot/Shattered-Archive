import fs from 'fs';

import type { Application, Request, Response } from 'express';
import { exchangeAuthorizationCode } from '@shatteredarchive/services-server';

import type { SimulacrumConfig } from './config.js';

/**
 * AI-ANNOTATION
 * @ai-summary Browser half of simulacrum-server's SSO sign-in (Step 1's "minimal standalone
 *   page"): /sso/start sends the browser to auth-client's /sso/authorize consent screen
 *   (same page Server.Web.Public's UserController.cs redirects to, reimplemented here in
 *   Node); /api/sso/callback redeems the one-time code server-side
 *   (exchangeAuthorizationCode) and stores the resulting bearer token in a short-lived
 *   HttpOnly cookie so the static page's "Get access code" button can call
 *   POST /api/access-code with no client-side token handling at all.
 * @ai-public registerSsoRoutes, readCookieToken
 * @ai-notes No cookie-parser dependency — this app has exactly one cookie, so a tiny
 *   hand-rolled read/write beats a new dependency for something this small.
 */

const COOKIE_NAME = 'simulacrum_token';

function callbackUrl(config: SimulacrumConfig): string {
  if (!config.publicUrl) throw new Error('SIMULACRUM_PUBLIC_URL is not configured');
  return `${config.publicUrl}/api/sso/callback`;
}

function authorizeUrl(config: SimulacrumConfig): string {
  if (!config.authServerPublicUrl) throw new Error('AUTH_SERVER_PUBLIC_URL is not configured');
  const redirectUri = encodeURIComponent(callbackUrl(config));
  return `${config.authServerPublicUrl}/sso/authorize?service=simulacrum-server&redirect_uri=${redirectUri}`;
}

/** Reads the bearer token from the sign-in cookie, if present — null if never signed in / expired. */
export function readCookieToken(req: Request): string | null {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === COOKIE_NAME) return decodeURIComponent(rawValue.join('='));
  }
  return null;
}

function setCookieToken(res: Response, token: string, expiresAt: string, secure: boolean): void {
  const maxAgeSeconds = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  const attrs = [`${COOKIE_NAME}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (secure) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function registerSsoRoutes(app: Application, config: SimulacrumConfig): void {
  app.get('/sso/start', (_req: Request, res: Response) => {
    try {
      res.redirect(authorizeUrl(config));
    } catch (e) {
      res.status(501).send(`SSO is not configured: ${(e as Error).message}`);
    }
  });

  app.get('/api/sso/callback', (req: Request, res: Response) => {
    void handleCallback(req, res, config);
  });
}

async function handleCallback(req: Request, res: Response, config: SimulacrumConfig): Promise<void> {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) {
    res.status(400).send('missing "code" query param');
    return;
  }
  if (!config.authServerUrl || !config.servicePrivateKeyPath) {
    res.status(501).send('SSO is not configured on this deployment');
    return;
  }
  try {
    const privateKeyPem = fs.readFileSync(config.servicePrivateKeyPath, 'utf8');
    const result = await exchangeAuthorizationCode(
      config.authServerUrl,
      'simulacrum-server',
      privateKeyPem,
      code,
      callbackUrl(config),
    );
    setCookieToken(res, result.token, result.expiresAt, config.cookieSecure);
    res.redirect('/');
  } catch (e) {
    res.status(502).send(`sign-in failed: ${(e as Error).message}`);
  }
}
