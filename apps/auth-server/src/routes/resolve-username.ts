import express, { type Application } from 'express';

import type { AuthServerDeps } from '../deps.js';
import { AuthError } from '../errors.js';
import { safe } from './safe.js';
import { chargeService, serviceRateLimit } from './service-rate-limit.js';
import { requireString } from './validation.js';

const ASSERTION_HEADER = 'x-service-assertion';

/**
 * AI-ANNOTATION
 * @ai-summary Server-to-server ONLY, same assertion/rate-limit shape as introspect.ts — lets
 *   a registered service resolve a USERNAME to the opaque accountId it actually needs to key
 *   its own data on (2026-08-16: mud-builder-server's role grants used to require an operator
 *   to type a raw accountId directly, which is not memorable and got typo'd for a real
 *   username, silently granting a role to nothing). An unknown username is a normal
 *   `{found:false}`, not an error — same "expected no answer" convention as introspect's
 *   `{valid:false}`. Deliberately returns ONLY {id, username}, never other account fields —
 *   this is an identity lookup, not an account-details endpoint.
 * @ai-public registerResolveUsernameRoutes
 * @ai-notes Any registered service may call this for ANY username — there is no per-caller
 *   privilege distinction here, because the privilege decision belongs entirely to the CALLING
 *   service (e.g. mud-builder-server's own canGrant() already gates who may act on the
 *   result). Usernames are not secret in this system already (self-service signup reveals
 *   uniqueness immediately), so this is not a new enumeration surface beyond what a normal
 *   signup attempt already exposes.
 */
export function registerResolveUsernameRoutes(app: Application, deps: AuthServerDeps): void {
  app.use('/api/service/resolve-username', serviceRateLimit(deps));
  app.use('/api/service/resolve-username', express.json({ limit: '4kb' }));

  app.post(
    '/api/service/resolve-username',
    safe((req, res) => {
      const assertion = req.headers[ASSERTION_HEADER];
      if (typeof assertion !== 'string' || !assertion) {
        throw new AuthError('a valid X-Service-Assertion header is required', 401);
      }
      const verifiedService = deps.serviceKeyStore.verifyAssertion(assertion);
      if (!verifiedService) {
        throw new AuthError('service assertion is invalid, unknown, or expired', 401);
      }
      chargeService(deps, verifiedService.service);

      const username = requireString(req.body, 'username');
      const account = deps.accountStore.findByUsername(username);
      if (!account) {
        res.json({ found: false });
        return;
      }
      res.json({ found: true, id: account.id, username: account.username });
    }),
  );
}
