import express, { type Application, type Request } from 'express';

import type { AuthServerDeps } from '../deps.js';
import { AuthError } from '../errors.js';
import { safe } from './safe.js';
import { sessionGuard, mustChangePasswordGuard, type SessionContext } from './session-guard.js';
import { requireString, requireOptionalExpiresAt } from './validation.js';

const SHOW_ONCE_NOTE = 'store this token now — it is shown only once and only a hash is kept';

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) throw new AuthError('key id is required', 400);
  return id;
}

/**
 * AI-ANNOTATION
 * @ai-summary Session-guarded API key management (GET/POST/rotate/revoke),
 *   blocked entirely during a forced mustChangePassword. mintApiKey needs the
 *   account's CURRENT epoch, fetched fresh per request rather than trusted
 *   from the session — the account may have rotated since the session was
 *   minted within the same request lifecycle in theory, so always re-read it.
 * @ai-public registerKeysRoutes
 */
export function registerKeysRoutes(app: Application, deps: AuthServerDeps): void {
  app.use('/api/keys', express.json({ limit: '16kb' }));
  app.use('/api/keys', sessionGuard(deps.accountStore, deps.keyStore), mustChangePasswordGuard(deps.accountStore));

  app.get(
    '/api/keys',
    safe((req, res) => {
      const session = res.locals.session as SessionContext;
      res.json({ keys: deps.keyStore.listKeys(session.accountId) });
    }),
  );

  app.post(
    '/api/keys',
    safe((req, res) => {
      const session = res.locals.session as SessionContext;
      const service = requireString(req.body, 'service');
      const label = requireString(req.body, 'label');
      const expiresAt = requireOptionalExpiresAt(req.body);

      const account = deps.accountStore.require(session.accountId);
      const issued = deps.keyStore.mintApiKey(account.id, service, label, expiresAt, account.epoch);
      res.status(201).json({ ...issued, service, label, expiresAt, note: SHOW_ONCE_NOTE });
    }),
  );

  app.post(
    '/api/keys/:id/rotate',
    safe((req, res) => {
      const session = res.locals.session as SessionContext;
      const rotated = deps.keyStore.rotateKey(requireIdParam(req), session.accountId);
      res.json({ ...rotated, note: SHOW_ONCE_NOTE });
    }),
  );

  app.delete(
    '/api/keys/:id',
    safe((req, res) => {
      const session = res.locals.session as SessionContext;
      res.json({ ...deps.keyStore.revokeKey(requireIdParam(req), session.accountId), revoked: true });
    }),
  );
}
