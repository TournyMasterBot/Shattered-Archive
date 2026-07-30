import crypto from 'crypto';
import express, { type Application, type Request, type RequestHandler } from 'express';

import type { AuthServerDeps } from '../deps.js';
import { AuthError } from '../errors.js';
import { assertValidP256PublicJwk, DeviceStore, type JsonWebKeyLike } from '../device-store.js';
import { safe } from './safe.js';
import { sessionGuard, mustChangePasswordGuard, type SessionContext } from './session-guard.js';
import { requireString } from './validation.js';

/**
 * AI-ANNOTATION
 * @ai-summary Device-bound credentials: enroll a browser's PUBLIC key (session-guarded,
 *   so enrollment always costs a real login), then challenge/assert to exchange a
 *   signature for a short-lived, audience-scoped access token. The durable credential is
 *   the private key that never leaves the browser, so there is no replayable secret at
 *   rest on either side.
 * @ai-public registerDeviceRoutes, DEVICE_LABEL_MAX
 * @ai-notes Split mount on purpose: /api/device/challenge and /api/device/assert are
 *   PUBLIC (a deviceId is not a secret and a signature is self-authenticating — requiring
 *   a session to mint a token would defeat the point, since the token IS the session
 *   equivalent), while enroll/list/revoke sit behind sessionGuard. Getting this backwards
 *   either breaks silent re-minting or lets anyone enroll a key against your account.
 */

export const DEVICE_LABEL_MAX = 64;

/** The exact bytes a client must sign. Any drift here silently breaks every enrolled device. */
export function deviceAssertionPayload(deviceId: string, nonce: string, service: string): Buffer {
  // Length-prefixed rather than delimiter-joined: with a plain "a.b.c" join, a deviceId
  // containing the delimiter could shift the boundary and let one field's value be read as
  // another's. Lengths make the framing unambiguous whatever the field contents.
  const parts = [deviceId, nonce, service];
  return Buffer.from(parts.map((p) => `${p.length}:${p}`).join(''), 'utf8');
}

function requireLabel(body: unknown): string {
  const raw = requireString(body, 'label').trim();
  if (raw.length > DEVICE_LABEL_MAX) {
    throw new AuthError(`label must be at most ${DEVICE_LABEL_MAX} characters`, 400);
  }
  return raw;
}

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) throw new AuthError('device id is required', 400);
  return id;
}

/**
 * Verifies an ECDSA P-256 signature over the canonical payload. Returns false on ANY
 * failure — a malformed JWK, malformed base64url, a wrong key, or an outright bogus
 * signature all mean the same thing to the caller ("not authenticated") and must not be
 * distinguishable in the response.
 */
function verifyDeviceSignature(
  publicKeyJwk: JsonWebKeyLike,
  payload: Buffer,
  signatureBase64Url: string,
): boolean {
  try {
    // Type derived from the actual signature rather than naming a @types/node type: the JWK
    // input type isn't exported as `crypto.JsonWebKey` in every version, and this form cannot
    // drift when the types change.
    const keyInput = { key: publicKeyJwk, format: 'jwk' } as unknown as Parameters<
      typeof crypto.createPublicKey
    >[0];
    const key = crypto.createPublicKey(keyInput);
    const signature = Buffer.from(signatureBase64Url, 'base64url');
    if (signature.length === 0) return false;
    // WebCrypto's ECDSA emits raw r||s (64 bytes for P-256); node defaults to DER, so the
    // encoding must be stated explicitly or every browser-made signature fails to verify.
    return crypto.verify('sha256', payload, { key, dsaEncoding: 'ieee-p1363' }, signature);
  } catch {
    return false;
  }
}

/**
 * CORS for the device endpoints ONLY — hand-rolled, matching this app's standing "no new
 * dependency" constraint (same tradeoff as the hand-parsed session cookie in session-guard.ts).
 *
 * Scoped deliberately narrowly: it is mounted on /api/device and nothing else, so widening
 * the browser-reachable surface of the rest of auth-server is impossible by accident.
 *
 * Rules that matter, none of which are optional:
 *  - Exact allowlist match, echoed back. `*` is INVALID with credentials, and reflecting any
 *    Origin would let a hostile page drive an authenticated enrollment using the user's cookie.
 *  - `Vary: Origin` always, even on a rejected origin, or a shared cache can serve one
 *    origin's allow-header to another.
 *  - An unlisted origin gets NO CORS headers and the browser blocks it. Requests with no
 *    Origin at all (server-to-server, curl) are untouched — CORS is a browser mechanism.
 */
function deviceCors(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');

    if (typeof origin === 'string' && allowed.has(origin.replace(/\/+$/, ''))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
    }

    // Preflight ends here regardless: if the origin wasn't allowed no headers were set, and
    // the browser refuses the real request on its own.
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}

/**
 * Resolves the audience set for an enrollment from the request's `Origin` header.
 *
 * Enforced HERE and not left to CORS, which is advisory: a browser refuses to expose a
 * disallowed response, but the request still arrives, and a non-browser client sends whatever
 * Origin it likes or none at all. So the origin must be checked server-side, and an
 * unrecognised or absent one is a refusal rather than a default.
 */
function resolveEnrollmentAudience(req: Request, originServices: Map<string, string[]>): { origin: string; services: string[] } {
  const raw = req.headers.origin;
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new AuthError('an Origin header is required to enroll a device', 403, 'DEVICE_ORIGIN_REQUIRED');
  }
  const origin = raw.replace(/\/+$/, '');
  const services = originServices.get(origin);
  if (!services || services.length === 0) {
    // Names the origin back: this is an operator misconfiguration (a missing map entry), and
    // the value is already known to the caller, so echoing it leaks nothing.
    throw new AuthError(
      `origin ${JSON.stringify(origin)} is not configured for device credentials`,
      403,
      'DEVICE_ORIGIN_NOT_CONFIGURED',
    );
  }
  return { origin, services };
}

/**
 * In-service rate limit, backing up nginx's device_auth zone (see rate-limit.ts for why both
 * tiers exist). Keyed per-IP for every device route, plus per-device on assert.
 */
function deviceRateLimit(deps: AuthServerDeps): RequestHandler {
  return (req, res, next) => {
    if (req.method === 'OPTIONS') {
      next();
      return;
    }
    // req.ip is trustworthy here because app.ts sets 'trust proxy' and every deployment is
    // behind nginx; the fallback keeps a direct-to-container caller from bypassing the limit
    // entirely by presenting no address at all.
    if (!deps.deviceRateLimiter.perIp.allow(req.ip ?? 'unknown')) {
      res.status(429).json({ error: 'too many device requests — slow down' });
      return;
    }
    next();
  };
}

export function registerDeviceRoutes(app: Application, deps: AuthServerDeps): void {
  app.use('/api/device', deviceCors(deps.deviceAllowedOrigins));
  app.use('/api/device', deviceRateLimit(deps));
  app.use('/api/device', express.json({ limit: '8kb' }));

  const epochLookup = (accountId: string) => deps.accountStore.findById(accountId)?.epoch;

  // ---- PUBLIC: challenge + assert. No session — the signature is the authentication. ----

  /**
   * The origins configured for device credentials. PUBLIC, and safe to be: every one of these
   * is already disclosed to that same origin in a CORS header, and they are public DNS names.
   *
   * Exists so auth-client can validate a `returnTo` against the SAME list that governs
   * enrollment, instead of keeping a second hand-maintained allowlist that would drift. That
   * validation is what stops the login page becoming an open redirect.
   */
  app.get(
    '/api/device/origins',
    safe((_req, res) => {
      res.json({ origins: deps.deviceAllowedOrigins });
    }),
  );

  app.post(
    '/api/device/challenge',
    safe((req, res) => {
      const deviceId = requireString(req.body, 'deviceId');
      // Deliberately does NOT reveal whether the device is unknown, revoked or stale: a
      // nonce is issued either way and the failure surfaces at assert. Otherwise this
      // endpoint becomes an oracle for enumerating valid deviceIds.
      res.json(deps.deviceNonceStore.issue(deviceId));
    }),
  );

  app.post(
    '/api/device/assert',
    safe((req, res) => {
      const deviceId = requireString(req.body, 'deviceId');
      const nonce = requireString(req.body, 'nonce');
      const signature = requireString(req.body, 'signature');
      const service = requireString(req.body, 'service');

      // Per-device limit, which nginx cannot express (a zone can only key on the address).
      // Applied before any store work so a flood against one device stays cheap to refuse.
      if (!deps.deviceRateLimiter.perDevice.allow(deviceId)) {
        throw new AuthError('too many assertions for this device — slow down', 429);
      }

      const found = deps.deviceStore.lookup(deviceId, epochLookup);
      if (!found.ok) {
        // One shared 401 body for every not-usable reason, but a machine-readable code so
        // the client knows to re-enroll rather than showing the user a dead end. The code
        // leaks only that this device needs re-enrollment, never whether it ever existed.
        // 'stale-binding' (a record predating the audience binding) lands here too, and
        // re-enrolling is exactly the right remedy for it.
        throw new AuthError(
          'device is not enrolled — enroll again after signing in',
          401,
          'DEVICE_REENROLL_REQUIRED',
        );
      }

      // Consume BEFORE verifying, so a bad signature still burns the nonce. Otherwise an
      // attacker with a captured nonce could grind signature guesses against it.
      if (!deps.deviceNonceStore.consume(nonce, deviceId)) {
        throw new AuthError('challenge is invalid, expired, or already used', 401);
      }

      const payload = deviceAssertionPayload(deviceId, nonce, service);
      if (!verifyDeviceSignature(found.device.publicKeyJwk, payload, signature)) {
        throw new AuthError('signature does not verify', 401);
      }

      // AUTHENTICATE (above) then AUTHORIZE (below). The audience gate deliberately runs
      // AFTER signature verification: checking it first would answer "what is this device
      // allowed to reach" to anyone holding only a deviceId, which is the same enumeration
      // oracle /challenge is written to avoid. Only the key holder learns the binding.
      //
      // THE audience gate: the requested service must be one this device was enrolled for,
      // per the record written at enrollment — never anything in this request. An audience
      // the caller picks confines nothing.
      if (!DeviceStore.mayMintFor(found.device, service)) {
        throw new AuthError(
          `this device is not authorized for service ${JSON.stringify(service)}`,
          403,
          'DEVICE_AUDIENCE_NOT_ALLOWED',
        );
      }

      const account = deps.accountStore.require(found.device.accountId);

      // Entitlement, checked at MINT time rather than enrollment: an operator revoking the
      // API-key grant must take effect on the next 10-minute re-mint, not merely at the next
      // enrollment (which for a working device would be never).
      if (
        deps.deviceGrantRequiredServices.includes(service) &&
        !deps.keyStore.hasActiveKeyForService(account.id, service)
      ) {
        throw new AuthError(
          `your account does not have access to ${JSON.stringify(service)} — an API key for it is required`,
          403,
          'DEVICE_GRANT_REQUIRED',
        );
      }
      const issued = deps.keyStore.mintDeviceToken(account.id, service, account.epoch);
      deps.deviceStore.touch(deviceId);

      res.json({ token: issued.token, expiresAt: issued.expiresAt, service });
    }),
  );

  // ---- SESSION-GUARDED: enroll + manage. Enrollment must always cost a real login. ----

  app.use(
    '/api/device',
    sessionGuard(deps.accountStore, deps.keyStore),
    mustChangePasswordGuard(deps.accountStore),
  );

  app.post(
    '/api/device/enroll',
    safe((req, res) => {
      const session = res.locals.session as SessionContext;
      const publicKeyJwk = assertValidP256PublicJwk((req.body as { publicKeyJwk?: unknown })?.publicKeyJwk);
      const label = requireLabel(req.body);
      // The audience comes from WHERE the enrollment was made, resolved through the same map
      // nginx routes by — so the browser never gets to state what it may talk to.
      const { origin, services } = resolveEnrollmentAudience(req, deps.deviceOriginServices);

      // Fresh epoch per request, never the one the session was minted at — same reasoning
      // as keys.ts: the account may have rotated since.
      const account = deps.accountStore.require(session.accountId);
      const { id } = deps.deviceStore.enroll(account.id, publicKeyJwk, label, account.epoch, origin, services);
      deps.auditLog.append({
        actorId: account.id,
        actorUsername: account.username,
        action: 'device.enroll',
        detail: `deviceId=${id} label=${JSON.stringify(label)} origin=${origin} services=${services.join('|')}`,
      });
      // No secret in this response — that is the whole point of the scheme. `services` is
      // echoed so the client can tell immediately whether it got the audience it needs.
      res.status(201).json({ deviceId: id, label, allowedServices: services });
    }),
  );

  app.get(
    '/api/device',
    safe((req, res) => {
      const session = res.locals.session as SessionContext;
      res.json({ devices: deps.deviceStore.listForAccount(session.accountId) });
    }),
  );

  app.post(
    '/api/device/:id/revoke',
    safe((req, res) => {
      const session = res.locals.session as SessionContext;
      const deviceId = requireIdParam(req);
      const account = deps.accountStore.require(session.accountId);
      deps.deviceStore.revoke(account.id, deviceId);
      deps.auditLog.append({
        actorId: account.id,
        actorUsername: account.username,
        action: 'device.revoke',
        detail: `deviceId=${deviceId}`,
      });
      res.json({ deviceId, revoked: true });
    }),
  );

  app.post(
    '/api/device/revoke-all',
    safe((req, res) => {
      const session = res.locals.session as SessionContext;
      const account = deps.accountStore.require(session.accountId);
      const revoked = deps.deviceStore.revokeAllForAccount(account.id);
      deps.auditLog.append({
        actorId: account.id,
        actorUsername: account.username,
        action: 'device.revoke-all',
        detail: `revoked=${revoked}`,
      });
      res.json({ revoked });
    }),
  );
}
