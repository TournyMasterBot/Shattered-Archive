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

  /**
   * Is this (service, redirectUri) pair sanctioned? Checked BEFORE the consent screen
   * renders, so an unsanctioned hand-off is refused rather than displayed.
   *
   * Exists because /api/sso/approve alone was not enough. It correctly refuses to mint a
   * code for an unregistered redirect URI, but by then the browser is already sitting on
   * a consent page built from attacker-supplied values — and the consent page offers a
   * Cancel button, which navigates to that redirect URI to report `access_denied`. That
   * made the hub an open redirect via the DENY path (approve was never exploitable), and
   * rendered "Continue to <anything>?" on the real login domain, which is a phishing
   * surface in its own right regardless of where the buttons lead.
   *
   * Deliberately reuses the SAME generic failure as approve: it reveals nothing approve
   * did not already reveal to the same authenticated caller, so it adds no oracle. It is
   * behind the same session guard for that reason — an anonymous visitor cannot probe the
   * registry with it.
   */
  app.get(
    '/api/sso/validate',
    safe((req, res) => {
      const service = typeof req.query.service === 'string' ? req.query.service : '';
      const redirectUri = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : '';
      if (!service || !redirectUri) {
        throw new AuthError('unknown service or unregistered redirect URI', 400);
      }
      if (!deps.serviceKeyStore.isRegisteredService(service) || !deps.serviceKeyStore.hasRedirectUri(service, redirectUri)) {
        throw new AuthError('unknown service or unregistered redirect URI', 400);
      }
      res.json({ ok: true });
    }),
  );

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
