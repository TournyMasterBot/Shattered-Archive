import express, { type Application } from 'express';

import type { AuthServerDeps } from '../deps.js';
import { AuthError } from '../errors.js';
import { safe } from './safe.js';
import { chargeService, serviceRateLimit } from './service-rate-limit.js';
import { requireString } from './validation.js';

const ASSERTION_HEADER = 'x-service-assertion';

/**
 * AI-ANNOTATION
 * @ai-summary Server-to-server ONLY — gated by a signed Ed25519 assertion
 *   (service-key-store.ts), never reachable via a browser session cookie. An
 *   invalid/missing/unverifiable ASSERTION is a 401 (something is wrong with
 *   the CALLER); an unknown/expired/revoked TOKEN being introspected is a
 *   normal `{valid:false}` (that's the expected "no" answer this endpoint
 *   exists to give).
 * @ai-public registerIntrospectRoutes
 */
export function registerIntrospectRoutes(app: Application, deps: AuthServerDeps): void {
  // Before the parser: a flood should not buy a JSON parse. No edge zone covers this route —
  // callers reach it at the internal alias — so this tier is the only one. See
  // service-rate-limit.ts.
  app.use('/api/introspect', serviceRateLimit(deps));
  app.use('/api/introspect', express.json({ limit: '8kb' }));

  app.post(
    '/api/introspect',
    safe((req, res) => {
      const assertion = req.headers[ASSERTION_HEADER];
      if (typeof assertion !== 'string' || !assertion) {
        throw new AuthError('a valid X-Service-Assertion header is required', 401);
      }
      const verifiedService = deps.serviceKeyStore.verifyAssertion(assertion);
      if (!verifiedService) {
        throw new AuthError('service assertion is invalid, unknown, or expired', 401);
      }
      // Charged against the PROVEN identity, before any store read.
      chargeService(deps, verifiedService.service);

      const token = requireString(req.body, 'token');
      const verified = deps.keyStore.verify(token, (accountId) => deps.accountStore.findById(accountId)?.epoch);
      if (!verified) {
        res.json({ valid: false });
        return;
      }
      const account = deps.accountStore.findById(verified.accountId);
      res.json({
        valid: true,
        accountId: verified.accountId,
        service: verified.service,
        label: verified.label,
        username: account?.username,
        expiresAt: verified.expiresAt ?? null,
        tokenType: verified.kind,
        // Phase A, additive like the Phase 15 fields: hub-global tier, 'user' default.
        globalRole: account?.globalRole ?? 'user',
      });
    }),
  );
}
