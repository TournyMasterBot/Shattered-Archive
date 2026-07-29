import express, { type Application } from 'express';

import type { AuthServerDeps } from '../deps.js';
import { AuthError } from '../errors.js';
import { safe } from './safe.js';
import { sessionGuard, mustChangePasswordGuard, type SessionContext } from './session-guard.js';
import { requireString } from './validation.js';

/**
 * AI-ANNOTATION
 * @ai-summary Browser half of the SSO hand-off (Phase A): a logged-in user
 *   approves handing their identity to a consumer service, minting a one-time
 *   60s code the consumer's BACKEND redeems at /api/token-exchange. Session
 *   cookie required — this is the only SSO endpoint a browser ever touches;
 *   the exchange itself is assertion-gated and unreachable client-side.
 * @ai-public registerSsoRoutes
 * @ai-notes The service/redirect-URI failure is ONE generic 400 — never
 *   reveals whether the service exists or which binding failed (registration
 *   state is not a public oracle).
 */
export function registerSsoRoutes(app: Application, deps: AuthServerDeps): void {
  app.use('/api/sso', express.json({ limit: '8kb' }));
  app.use('/api/sso', sessionGuard(deps.accountStore, deps.keyStore), mustChangePasswordGuard(deps.accountStore));

  app.post(
    '/api/sso/approve',
    safe((req, res) => {
      const session = res.locals.session as SessionContext;
      const service = requireString(req.body, 'service');
      const redirectUri = requireString(req.body, 'redirectUri');

      if (!deps.serviceKeyStore.isRegisteredService(service) || !deps.serviceKeyStore.hasRedirectUri(service, redirectUri)) {
        throw new AuthError('unknown service or unregistered redirect URI', 400);
      }

      const code = deps.ssoCodeStore.issue(session.accountId, service, redirectUri);
      res.status(201).json({ code });
    }),
  );
}
