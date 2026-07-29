import crypto from 'crypto';

import { signAssertion, introspect, exchangeCode } from './auth-introspect-client.js';

function generateKeypair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  };
}

/** Verifies the compact assertion exactly as auth-server's crypto-primitives.ts would, without importing across the app boundary. */
function verifyCompact(compact: string, publicKeyPem: string): Record<string, unknown> | null {
  const [payloadPart, signaturePart] = compact.split('.');
  const payloadJson = Buffer.from(payloadPart, 'base64url');
  const signature = Buffer.from(signaturePart, 'base64url');
  const publicKey = crypto.createPublicKey(publicKeyPem);
  if (!crypto.verify(null, payloadJson, publicKey, signature)) return null;
  return JSON.parse(payloadJson.toString('utf8')) as Record<string, unknown>;
}

describe('signAssertion', () => {
  it('produces a compact base64url(payload).base64url(signature) verifiable against the matching public key', () => {
    const { publicKeyPem, privateKeyPem } = generateKeypair();
    const compact = signAssertion('mud-builder-server', privateKeyPem);

    expect(compact.split('.')).toHaveLength(2);
    const payload = verifyCompact(compact, publicKeyPem);
    expect(payload).not.toBeNull();
    expect(payload!.service).toBe('mud-builder-server');
  });

  it('rejects verification against the wrong public key', () => {
    const { privateKeyPem } = generateKeypair();
    const wrongKey = generateKeypair();
    const compact = signAssertion('mud-builder-server', privateKeyPem);
    expect(verifyCompact(compact, wrongKey.publicKeyPem)).toBeNull();
  });

  it('encodes iat/exp in epoch MILLISECONDS with a window well under 60s, and a fresh nonce each call', () => {
    const { privateKeyPem } = generateKeypair();
    const before = Date.now();
    const compact = signAssertion('svc', privateKeyPem);
    const after = Date.now();

    const [payloadPart] = compact.split('.');
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as {
      iat: number;
      exp: number;
      nonce: string;
    };

    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.iat).toBeLessThanOrEqual(after);
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(60_000);
    expect(payload.exp - payload.iat).toBeGreaterThan(0);

    const second = signAssertion('svc', privateKeyPem);
    const secondPayload = JSON.parse(
      Buffer.from(second.split('.')[0], 'base64url').toString('utf8'),
    ) as { nonce: string };
    expect(secondPayload.nonce).not.toBe(payload.nonce);
  });
});

describe('introspect', () => {
  const { privateKeyPem } = generateKeypair();

  function mockFetch(impl: (url: string, init: RequestInit | undefined) => Response): void {
    globalThis.fetch = jest.fn(async (input: string | URL, init?: RequestInit) => impl(String(input), init)) as unknown as typeof fetch;
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return { ok: status < 400, status, statusText: 'x', json: async () => body } as unknown as Response;
  }

  it('calls POST /api/introspect with the signed assertion header and returns the parsed result on success', async () => {
    let seenUrl = '';
    let seenMethod = '';
    let seenHeaders: Record<string, string> = {};
    let seenBody = '';
    mockFetch((url, init) => {
      seenUrl = url;
      seenMethod = init?.method ?? '';
      seenHeaders = (init?.headers ?? {}) as Record<string, string>;
      seenBody = String(init?.body ?? '');
      return jsonResponse({ valid: true, accountId: 'acc-1', service: 'mud-builder-server', label: 'laptop' });
    });

    const result = await introspect('http://localhost:62000', 'mud-builder-server', privateKeyPem, 'the-token');

    expect(seenUrl).toBe('http://localhost:62000/api/introspect');
    expect(seenMethod).toBe('POST');
    expect(seenHeaders['X-Service-Assertion']).toBeTruthy();
    expect(seenHeaders['X-Service-Assertion'].split('.')).toHaveLength(2);
    expect(JSON.parse(seenBody)).toEqual({ token: 'the-token' });
    expect(result).toEqual({ valid: true, accountId: 'acc-1', service: 'mud-builder-server', label: 'laptop' });
  });

  it('strips a trailing slash from the base URL', async () => {
    let seenUrl = '';
    mockFetch((url) => {
      seenUrl = url;
      return jsonResponse({ valid: false });
    });
    await introspect('http://localhost:62000/', 'mud-builder-server', privateKeyPem, 'x');
    expect(seenUrl).toBe('http://localhost:62000/api/introspect');
  });

  it('returns {valid:false} for an unknown/expired token — not a throw', async () => {
    mockFetch(() => jsonResponse({ valid: false }));
    const result = await introspect('http://localhost:62000', 'mud-builder-server', privateKeyPem, 'garbage');
    expect(result).toEqual({ valid: false });
  });

  it('throws with a readable message on a non-2xx (e.g. a rejected assertion)', async () => {
    mockFetch(() => jsonResponse({ error: 'service assertion is invalid, unknown, or expired' }, 401));
    await expect(introspect('http://localhost:62000', 'mud-builder-server', privateKeyPem, 'x')).rejects.toThrow(
      /401.*service assertion is invalid/,
    );
  });

  it('propagates a network failure rather than swallowing it', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error('fetch failed: ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(introspect('http://localhost:62000', 'mud-builder-server', privateKeyPem, 'x')).rejects.toThrow(
      /ECONNREFUSED/,
    );
  });
});

describe('exchangeCode', () => {
  const { privateKeyPem } = generateKeypair();

  function mockFetch(impl: (url: string, init: RequestInit | undefined) => Response): void {
    globalThis.fetch = jest.fn(async (input: string | URL, init?: RequestInit) => impl(String(input), init)) as unknown as typeof fetch;
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return { ok: status < 400, status, statusText: 'x', json: async () => body } as unknown as Response;
  }

  it('calls POST /api/token-exchange with grantType authorization_code, the signed assertion header, and returns the parsed result', async () => {
    let seenUrl = '';
    let seenMethod = '';
    let seenHeaders: Record<string, string> = {};
    let seenBody = '';
    mockFetch((url, init) => {
      seenUrl = url;
      seenMethod = init?.method ?? '';
      seenHeaders = (init?.headers ?? {}) as Record<string, string>;
      seenBody = String(init?.body ?? '');
      return jsonResponse({
        token: 'minted-token',
        accountId: 'acc-1',
        username: 'someone',
        service: 'kingdom-tactics-server',
        expiresAt: '2026-08-03T00:00:00.000Z',
        tokenType: 'sso',
        globalRole: 'user',
      });
    });

    const result = await exchangeCode(
      'http://localhost:62000',
      'kingdom-tactics-server',
      privateKeyPem,
      'the-code',
      'http://localhost:51000/api/kt/auth/callback',
    );

    expect(seenUrl).toBe('http://localhost:62000/api/token-exchange');
    expect(seenMethod).toBe('POST');
    expect(seenHeaders['X-Service-Assertion']).toBeTruthy();
    expect(seenHeaders['X-Service-Assertion'].split('.')).toHaveLength(2);
    expect(JSON.parse(seenBody)).toEqual({
      grantType: 'authorization_code',
      code: 'the-code',
      redirectUri: 'http://localhost:51000/api/kt/auth/callback',
    });
    expect(result.token).toBe('minted-token');
    expect(result.service).toBe('kingdom-tactics-server');
  });

  it('throws with a readable message on a non-2xx (e.g. an already-used code)', async () => {
    mockFetch(() => jsonResponse({ error: 'invalid, expired, or already-used code' }, 400));
    await expect(
      exchangeCode('http://localhost:62000', 'kingdom-tactics-server', privateKeyPem, 'x', 'http://x/callback'),
    ).rejects.toThrow(/400.*already-used code/);
  });

  it('propagates a network failure rather than swallowing it', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error('fetch failed: ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(
      exchangeCode('http://localhost:62000', 'kingdom-tactics-server', privateKeyPem, 'x', 'http://x/callback'),
    ).rejects.toThrow(/ECONNREFUSED/);
  });
});
