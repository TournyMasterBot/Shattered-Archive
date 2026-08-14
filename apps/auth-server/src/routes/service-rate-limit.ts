import type { RequestHandler } from 'express';

import type { AuthServerDeps } from '../deps.js';
import { AuthError } from '../errors.js';

/**
 * AI-ANNOTATION
 * @ai-summary In-app rate limit for the two SERVER-TO-SERVER endpoints (/api/introspect,
 *   /api/token-exchange). Unlike every other route group these have no edge tier at all, so
 *   this is their only limiter — not a backup for one.
 * @ai-public serviceRateLimit, chargeService
 * @ai-notes The edge zones in deploy/nginx only charge traffic that actually reaches nginx.
 *   Consumer services call auth-server at its INTERNAL alias
 *   (auth-server.shatteredarchive.dev:62000, see AUTH_SERVER_URL), so their introspect and
 *   token-exchange calls cross the compose network and never transit the edge — exactly the
 *   "reaches the container directly" case rate-limit.ts exists for. Everything else in this
 *   app is browser-facing and IS edge-limited.
 *
 *   Two keyings, mirroring DeviceRateLimiters' reasoning. Per-IP is charged BEFORE the
 *   assertion is verified, so an unauthenticated flood is refused without an Ed25519
 *   verification per request. Per-service is charged AFTER, keyed on the identity the
 *   assertion proved — the one that survives a caller being restarted, rescheduled onto a new
 *   container IP, or run at several replicas, and the only key that bounds a single
 *   compromised service key.
 *
 *   Sizing is a runaway ceiling, NOT traffic shaping. Introspect sits on the hot path of every
 *   authenticated request to every consumer service, so the limits are set far above any
 *   plausible real load: they exist to cap a stuck retry loop or a stolen service key, and
 *   normal traffic must never come near them.
 */

/**
 * Per-IP guard for a server-to-server route group. Mount BEFORE the body parser so a flood
 * costs no JSON parsing, matching how device.ts orders its own middleware.
 */
export function serviceRateLimit(deps: AuthServerDeps): RequestHandler {
  return (req, res, next) => {
    // req.ip reflects X-Forwarded-For (app.ts sets 'trust proxy'), but these callers are
    // in-network and set no such header, so in practice this is the calling container's
    // address. 'unknown' keeps an address-less caller in one shared bucket rather than
    // exempting it.
    if (!deps.serviceRateLimiter.perIp.allow(req.ip ?? 'unknown')) {
      res.status(429).json({ error: 'too many service requests — slow down' });
      return;
    }
    next();
  };
}

/**
 * Charges one token against the VERIFIED service identity. Call immediately after the
 * assertion checks out and before any store work, so a flood from one credential stays cheap.
 */
export function chargeService(deps: AuthServerDeps, service: string): void {
  if (!deps.serviceRateLimiter.perService.allow(service)) {
    throw new AuthError('too many requests for this service credential — slow down', 429);
  }
}
