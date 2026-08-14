import express, { type Application } from 'express';

import type { AccountRecord } from '../account-store.js';
import type { AuthServerDeps } from '../deps.js';
import { AuthError } from '../errors.js';
import { safe } from './safe.js';
import { chargeService, serviceRateLimit } from './service-rate-limit.js';
import { requireString } from './validation.js';

const ASSERTION_HEADER = 'x-service-assertion';

// TTL policy lives here, not in the store. SSO tokens are a consumer login
// (days); OBO tokens exist for one cross-service request burst (minutes).
const SSO_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OBO_TOKEN_TTL_MS = 2 * 60 * 1000;

/**
 * AI-ANNOTATION
 * @ai-summary Server-to-server ONLY (assertion-gated like introspect) — the
 *   single place bearer tokens are minted for consumer services, enforcing the
 *   program's audience rules: an authorization code redeems only for the
 *   service it was approved for (the CALLER, proven by its assertion), and an
 *   on-behalf-of exchange accepts only a subject token whose audience IS the
 *   caller, minting a short-TTL token for a different registered service.
 * @ai-public registerTokenExchangeRoutes
 * @ai-notes OBO refuses 'session' and 'obo' subject kinds: sessions belong to
 *   the hub UI alone, and refusing 'obo' forbids CHAINING (a leaked 2-minute
 *   OBO token must not be re-exchangeable to hop further). Failures on the
 *   trust path stay generic — no oracle for which check failed.
 */
export function registerTokenExchangeRoutes(app: Application, deps: AuthServerDeps): void {
  // Only limiter on this route: like introspect, it is reached at the internal alias and never
  // crosses an nginx edge zone. See service-rate-limit.ts.
  app.use('/api/token-exchange', serviceRateLimit(deps));
  app.use('/api/token-exchange', express.json({ limit: '8kb' }));

  app.post(
    '/api/token-exchange',
    safe((req, res) => {
      const assertion = req.headers[ASSERTION_HEADER];
      if (typeof assertion !== 'string' || !assertion) {
        throw new AuthError('a valid X-Service-Assertion header is required', 401);
      }
      const verifiedService = deps.serviceKeyStore.verifyAssertion(assertion);
      if (!verifiedService) {
        throw new AuthError('service assertion is invalid, unknown, or expired', 401);
      }
      const caller = verifiedService.service;
      // Charged against the PROVEN caller, before any code redemption or minting.
      chargeService(deps, caller);

      const grantType = requireString(req.body, 'grantType');
      if (grantType === 'authorization_code') {
        exchangeAuthorizationCode(req.body, caller, deps, res);
      } else if (grantType === 'on_behalf_of') {
        exchangeOnBehalfOf(req.body, caller, deps, res);
      } else {
        throw new AuthError("grantType must be 'authorization_code' or 'on_behalf_of'", 400);
      }
    }),
  );
}

function exchangeAuthorizationCode(body: unknown, caller: string, deps: AuthServerDeps, res: express.Response): void {
  const code = requireString(body, 'code');
  const redirectUri = requireString(body, 'redirectUri');

  // The redeem binds the code to the CALLER: an assertion from service 1 can
  // never redeem a code approved for service 2, and a mismatch burns the code.
  const redeemed = deps.ssoCodeStore.redeem(code, caller, redirectUri);
  const account = redeemed ? deps.accountStore.findById(redeemed.accountId) : undefined;
  if (!account) {
    throw new AuthError('invalid, expired, or already-used code', 400);
  }

  const minted = deps.keyStore.mintExchangeToken(account.id, caller, 'sso', 'sso login', SSO_TOKEN_TTL_MS, account.epoch);
  res.status(201).json(exchangeResponse(minted, account, caller, 'sso'));
}

function exchangeOnBehalfOf(body: unknown, caller: string, deps: AuthServerDeps, res: express.Response): void {
  const token = requireString(body, 'token');
  const targetService = requireString(body, 'targetService');

  const subject = deps.keyStore.verify(token, (accountId) => deps.accountStore.findById(accountId)?.epoch);
  // Audience rule: only a token minted FOR the caller may be exchanged, and
  // only user-grade kinds — never hub sessions, never another OBO (no chains).
  const subjectOk = subject && subject.service === caller && (subject.kind === 'api' || subject.kind === 'sso');
  const account = subjectOk ? deps.accountStore.findById(subject.accountId) : undefined;
  if (!account) {
    throw new AuthError('subject token is invalid or not scoped to the calling service', 403);
  }
  if (targetService === caller || !deps.serviceKeyStore.isRegisteredService(targetService)) {
    throw new AuthError('target must be a different, registered service', 400);
  }

  const minted = deps.keyStore.mintExchangeToken(account.id, targetService, 'obo', `obo:${caller}`, OBO_TOKEN_TTL_MS, account.epoch);
  res.status(201).json(exchangeResponse(minted, account, targetService, 'obo'));
}

function exchangeResponse(
  minted: { token: string; expiresAt: string },
  account: AccountRecord,
  audience: string,
  tokenType: 'sso' | 'obo',
): Record<string, unknown> {
  return {
    token: minted.token,
    accountId: account.id,
    username: account.username,
    service: audience,
    expiresAt: minted.expiresAt,
    tokenType,
    globalRole: account.globalRole ?? 'user',
  };
}
