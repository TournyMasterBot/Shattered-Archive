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
