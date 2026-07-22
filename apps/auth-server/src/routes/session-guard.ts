import type { Request, RequestHandler } from 'express';

import type { AccountStore } from '../account-store.js';
import type { KeyStore } from '../key-store.js';

/**
 * AI-ANNOTATION
 * @ai-summary Cookie -> keyStore.verify() session guard, plus a
 *   mustChangePasswordGuard wrapper enforcing the Constraints allowlist (GET
 *   /api/auth/me, POST /api/account/change-password, POST /api/auth/logout
 *   stay reachable; everything else 403s while the account's
 *   mustChangePassword flag is set).
 * @ai-public SESSION_COOKIE, sessionGuard, mustChangePasswordGuard
 * @ai-notes No cookie-parser dependency (Constraints: no new deps) — the one
 *   cookie this server reads is hand-parsed from the raw header.
 */

export const SESSION_COOKIE = 'sa_session';

export interface SessionContext {
  accountId: string;
  keyId: string;
}

function readSessionCookie(req: Request): string {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name === SESSION_COOKIE) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return '';
}

export function sessionCookieHeader(token: string): string {
  // httpOnly, SameSite=Lax — Constraints: sessions are key records delivered via a cookie, no express-session/JWT library.
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function sessionGuard(accountStore: AccountStore, keyStore: KeyStore): RequestHandler {
  return (req, res, next) => {
    const token = readSessionCookie(req);
    const verified = keyStore.verify(token, (accountId) => accountStore.findById(accountId)?.epoch);
    if (!verified || verified.kind !== 'session') {
      res.status(401).json({ error: 'a valid session is required' });
      return;
    }
    res.locals.session = { accountId: verified.accountId, keyId: verified.keyId } satisfies SessionContext;
    next();
  };
}

const ALLOWED_DURING_FORCED_CHANGE = new Set(['GET /api/auth/me', 'POST /api/account/change-password', 'POST /api/auth/logout']);

/** Must run AFTER sessionGuard — reads res.locals.session it sets. */
export function mustChangePasswordGuard(accountStore: AccountStore): RequestHandler {
  return (req, res, next) => {
    const session = res.locals.session as SessionContext | undefined;
    if (!session) {
      res.status(401).json({ error: 'a valid session is required' });
      return;
    }
    const account = accountStore.findById(session.accountId);
    if (!account) {
      res.status(401).json({ error: 'a valid session is required' });
      return;
    }
    // req.path is relative to the MOUNT prefix here (app.use('/api/account', ...) strips it for
    // the duration of this middleware) — req.originalUrl always holds the full path regardless of
    // mounting, which is what the allowlist below is written against.
    const fullPath = req.originalUrl.split('?')[0];
    const routeKey = `${req.method} ${fullPath}`;
    if (account.mustChangePassword && !ALLOWED_DURING_FORCED_CHANGE.has(routeKey)) {
      res.status(403).json({ error: 'password change required before this action', code: 'MUST_CHANGE_PASSWORD' });
      return;
    }
    next();
  };
}
