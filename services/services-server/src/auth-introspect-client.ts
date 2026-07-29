import crypto from 'crypto';

/**
 * Ed25519-signs a compact { service, iat, exp, nonce } assertion and calls
 * auth-server's POST /api/introspect. Deliberately duplicates the compact
 * base64url(payload)+'.'+base64url(signature) format from
 * apps/auth-server/src/crypto-primitives.ts rather than importing across the
 * app boundary — see the Phase 2 plan's Constraints for why this package is
 * the shared home instead of a new sdks/* package.
 */

export interface IntrospectResult {
  valid: boolean;
  accountId?: string;
  service?: string;
  label?: string;
  /** Phase 15: the account's username, when the token resolved to one. */
  username?: string;
  /** Phase 15: null = never expires; undefined only on an old auth-server that predates this field. */
  expiresAt?: string | null;
  /** Phase 15: 'api' | 'session' | 'sso' | 'obo', mirrors auth-server's KeyKind. */
  tokenType?: string;
  /** Phase A: hub-global tier ('user' default); undefined only on an old auth-server that predates it. */
  globalRole?: string;
}

/** Successful POST /api/token-exchange response (both grant types). */
export interface ExchangeResult {
  token: string;
  accountId: string;
  username: string;
  /** The AUDIENCE — the one service this token is valid at. */
  service: string;
  expiresAt: string;
  tokenType: string;
  globalRole: string;
}

interface AssertionPayload {
  service: string;
  iat: number;
  exp: number;
  nonce: string;
}

// Well under auth-server's 60s assertion window (exp - iat <= 60_000ms) — service-key-store.ts's
// iat/exp/window checks all compare against Date.now(), so these are epoch MILLISECONDS, not seconds.
const ASSERTION_TTL_MS = 30_000;

/** Compact base64url(payloadJson) + '.' + base64url(signature) — matches auth-server's verifyAssertion(). */
export function signAssertion(service: string, privateKeyPem: string): string {
  const iat = Date.now();
  const payload: AssertionPayload = {
    service,
    iat,
    exp: iat + ASSERTION_TTL_MS,
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  const payloadJson = Buffer.from(JSON.stringify(payload), 'utf8');
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto.sign(null, payloadJson, privateKey); // Ed25519 needs no digest algorithm argument
  return `${payloadJson.toString('base64url')}.${signature.toString('base64url')}`;
}

/**
 * Calls auth-server's introspect endpoint for the given token. Throws on a
 * non-2xx response (bad/expired/unregistered assertion is 401) — an unknown
 * or revoked TOKEN being checked is a normal `{valid:false}`, not a throw.
 */
export async function introspect(
  authServerBaseUrl: string,
  service: string,
  privateKeyPem: string,
  token: string,
): Promise<IntrospectResult> {
  const assertion = signAssertion(service, privateKeyPem);
  const res = await fetch(`${authServerBaseUrl.replace(/\/+$/, '')}/api/introspect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Assertion': assertion,
    },
    body: JSON.stringify({ token }),
  });
  const body = (await res.json().catch(() => ({}))) as IntrospectResult & { error?: string };
  if (!res.ok) {
    throw new Error(`introspect failed: ${res.status} ${body.error ?? res.statusText}`);
  }
  return body;
}

/**
 * Audience guard (Phase A service-isolation rule): a token is only acceptable
 * to THIS service if it's valid AND was minted for this service. Adopt at
 * every introspect call site — a valid token for someone else is a refusal.
 */
export function matchesAudience(result: IntrospectResult, expectedService: string): boolean {
  return result.valid === true && result.service === expectedService;
}

/**
 * Calls auth-server's POST /api/token-exchange with grantType
 * 'authorization_code' — redeems a one-time SSO code (from /api/sso/approve)
 * for a bearer token audience-scoped to THIS service. The redirectUri MUST be
 * byte-identical to the one used at approve time, or the hub burns the code
 * without minting anything (see sso-code-store.redeem()). Throws on a
 * non-2xx response (an invalid/expired/already-used code is a 400, not a
 * `{valid:false}`-style result — unlike introspect, there's no partial-success
 * shape here).
 */
export async function exchangeCode(
  authServerBaseUrl: string,
  service: string,
  privateKeyPem: string,
  code: string,
  redirectUri: string,
): Promise<ExchangeResult> {
  const assertion = signAssertion(service, privateKeyPem);
  const res = await fetch(`${authServerBaseUrl.replace(/\/+$/, '')}/api/token-exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Assertion': assertion,
    },
    body: JSON.stringify({ grantType: 'authorization_code', code, redirectUri }),
  });
  const body = (await res.json().catch(() => ({}))) as ExchangeResult & { error?: string };
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${body.error ?? res.statusText}`);
  }
  return body;
}

async function postExchange(
  authServerBaseUrl: string,
  service: string,
  privateKeyPem: string,
  payload: Record<string, unknown>,
): Promise<ExchangeResult> {
  const assertion = signAssertion(service, privateKeyPem);
  const res = await fetch(`${authServerBaseUrl.replace(/\/+$/, '')}/api/token-exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Assertion': assertion,
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as ExchangeResult & { error?: string };
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${body.error ?? res.statusText}`);
  }
  return body;
}

/**
 * Redeems a one-time SSO code (this service's backend half of the login
 * hand-off) for a bearer token whose audience is THIS service. The private
 * key never leaves the backend — there is no client-side exchange path.
 */
export function exchangeAuthorizationCode(
  authServerBaseUrl: string,
  service: string,
  privateKeyPem: string,
  code: string,
  redirectUri: string,
): Promise<ExchangeResult> {
  return postExchange(authServerBaseUrl, service, privateKeyPem, {
    grantType: 'authorization_code',
    code,
    redirectUri,
  });
}

/**
 * Exchanges a token whose audience is THIS service for a short-TTL token
 * scoped to `targetService`, still bound to the same user — the ONLY sanctioned
 * way to call another service on a user's behalf (raw forwarding is banned,
 * and the hub refuses to chain OBO tokens).
 */
export function exchangeOnBehalfOf(
  authServerBaseUrl: string,
  service: string,
  privateKeyPem: string,
  token: string,
  targetService: string,
): Promise<ExchangeResult> {
  return postExchange(authServerBaseUrl, service, privateKeyPem, {
    grantType: 'on_behalf_of',
    token,
    targetService,
  });
}
