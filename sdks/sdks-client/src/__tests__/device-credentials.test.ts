import { webcrypto } from 'node:crypto';

import {
  DeviceCredentials,
  NeedsEnrollmentError,
  createMemoryDeviceStorage,
  deviceAssertionPayload,
  type DeviceKeyStorage,
} from '../device-credentials.js';

/**
 * Real WebCrypto, injected — so these tests exercise genuine ECDSA P-256 key generation,
 * signing and verification rather than a mock. (Injection exists because jsdom and React
 * Native both lack WebCrypto; under this package's Node test environment it is available
 * either way, but passing it explicitly keeps the tests independent of that.)
 */
const subtle = webcrypto.subtle as unknown as SubtleCrypto;

const AUTH = 'https://auth.example.test';
const SERVICE = 'mud-builder-server';

interface FakeServerOptions {
  /** Force assert to fail with this body, e.g. the re-enrollment code. */
  assertFailure?: { status: number; body: Record<string, unknown> };
  tokenTtlMs?: number;
}

/**
 * A stand-in for auth-server that VERIFIES the signature for real, using the enrolled public
 * key. That matters: a fake that just returned a token would let a payload-format or
 * signature-encoding bug through, and those are precisely the bugs that only show up against
 * a real browser.
 */
function fakeServer(options: FakeServerOptions = {}) {
  const state = {
    enrolled: null as { deviceId: string; publicKey: CryptoKey } | null,
    nonces: new Set<string>(),
    calls: { enroll: 0, challenge: 0, assert: 0 },
    lastBearer: null as string | null,
  };
  let nonceCounter = 0;
  let tokenCounter = 0;

  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const body = init.body ? (JSON.parse(init.body as string) as Record<string, string>) : {};
    const json = (status: number, payload: unknown) =>
      new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

    if (url.endsWith('/api/device/enroll')) {
      state.calls.enroll += 1;
      const publicKey = await subtle.importKey(
        'jwk',
        body.publicKeyJwk as unknown as JsonWebKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['verify'],
      );
      state.enrolled = { deviceId: `dev-${state.calls.enroll}`, publicKey };
      return json(201, { deviceId: state.enrolled.deviceId, label: body.label });
    }

    if (url.endsWith('/api/device/challenge')) {
      state.calls.challenge += 1;
      nonceCounter += 1;
      const nonce = `nonce-${nonceCounter}`;
      state.nonces.add(nonce);
      return json(200, { nonce, expiresAt: new Date(Date.now() + 120_000).toISOString() });
    }

    if (url.endsWith('/api/device/assert')) {
      state.calls.assert += 1;
      if (options.assertFailure) {
        return json(options.assertFailure.status, options.assertFailure.body);
      }
      if (!state.enrolled) return json(401, { code: 'DEVICE_REENROLL_REQUIRED', error: 'not enrolled' });
      if (!state.nonces.delete(body.nonce)) return json(401, { error: 'challenge already used' });

      const signature = Uint8Array.from(
        atob(body.signature.replace(/-/g, '+').replace(/_/g, '/')),
        (c) => c.charCodeAt(0),
      );
      const ok = await subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        state.enrolled.publicKey,
        signature,
        deviceAssertionPayload(body.deviceId, body.nonce, body.service),
      );
      if (!ok) return json(401, { error: 'signature does not verify' });

      tokenCounter += 1;
      return json(200, {
        token: `token-${tokenCounter}`,
        expiresAt: new Date(Date.now() + (options.tokenTtlMs ?? 600_000)).toISOString(),
        service: body.service,
      });
    }

    // Any other URL = a protected resource; echoes what Authorization it saw.
    state.lastBearer = new Headers(init.headers).get('Authorization');
    return json(200, { ok: true });
  }) as typeof fetch;

  return { state, fetchImpl };
}

function makeCreds(fetchImpl: typeof fetch, storage: DeviceKeyStorage = createMemoryDeviceStorage(), clock?: () => number) {
  return new DeviceCredentials({ authBaseUrl: AUTH, storage, subtle, fetchImpl, clock });
}

describe('deviceAssertionPayload', () => {
  /** Must stay byte-identical to the server's; length prefixes are what make it unambiguous. */
  it('length-prefixes each field so delimiter-lookalikes cannot shift the framing', () => {
    const a = deviceAssertionPayload('a:b', 'c', 'd');
    const b = deviceAssertionPayload('a', 'b:c', 'd');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(new TextDecoder().decode(deviceAssertionPayload('ab', 'c', 'de'))).toBe('2:ab1:c2:de');
  });
});

describe('DeviceCredentials', () => {
  it('generates a private key that can NEVER be exported', async () => {
    const { fetchImpl } = fakeServer();
    const keyPair = await makeCreds(fetchImpl).ensureKeyPair();

    expect(keyPair.privateKey.extractable).toBe(false);
    await expect(subtle.exportKey('jwk', keyPair.privateKey)).rejects.toThrow();
    // The public half must still be exportable — enrollment depends on it.
    await expect(subtle.exportKey('jwk', keyPair.publicKey)).resolves.toBeDefined();
  });

  it('reuses the same keypair across calls rather than regenerating', async () => {
    const { fetchImpl } = fakeServer();
    const creds = makeCreds(fetchImpl);
    const first = await creds.ensureKeyPair();
    const second = await creds.ensureKeyPair();
    expect(second.privateKey).toBe(first.privateKey);
  });

  it('enrolls by sending ONLY the public key, never the private half', async () => {
    const { state, fetchImpl } = fakeServer();
    const sent: Record<string, unknown>[] = [];
    const spyFetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (init.body) sent.push(JSON.parse(init.body as string) as Record<string, unknown>);
      return fetchImpl(input, init);
    }) as typeof fetch;

    const creds = makeCreds(spyFetch);
    const deviceId = await creds.enroll('Test laptop');

    expect(deviceId).toBe('dev-1');
    expect(state.calls.enroll).toBe(1);
    const jwk = sent[0].publicKeyJwk as Record<string, unknown>;
    expect(jwk.crv).toBe('P-256');
    expect(jwk.d).toBeUndefined(); // the private scalar — must never appear
  });

  it('completes a real challenge -> sign -> assert round trip the server can verify', async () => {
    const { state, fetchImpl } = fakeServer();
    const creds = makeCreds(fetchImpl);
    await creds.enroll('Test laptop');

    const token = await creds.getAccessToken(SERVICE);
    expect(token).toBe('token-1');
    expect(state.calls.assert).toBe(1);
  });

  it('caches the token so a second call does not re-mint', async () => {
    const { state, fetchImpl } = fakeServer();
    const creds = makeCreds(fetchImpl);
    await creds.enroll('Test laptop');

    await creds.getAccessToken(SERVICE);
    await creds.getAccessToken(SERVICE);
    expect(state.calls.challenge).toBe(1);
  });

  /** Audience-scoped: a Builder token must never be reused for another service. */
  it('mints a SEPARATE token per service audience', async () => {
    const { state, fetchImpl } = fakeServer();
    const creds = makeCreds(fetchImpl);
    await creds.enroll('Test laptop');

    const a = await creds.getAccessToken(SERVICE);
    const b = await creds.getAccessToken('kingdom-tactics-server');
    expect(a).not.toBe(b);
    expect(state.calls.assert).toBe(2);
  });

  it('re-mints once the cached token is within the refresh skew of expiring', async () => {
    let now = Date.now();
    const { state, fetchImpl } = fakeServer({ tokenTtlMs: 60_000 });
    const creds = makeCreds(fetchImpl, createMemoryDeviceStorage(), () => now);
    await creds.enroll('Test laptop');

    await creds.getAccessToken(SERVICE);
    now += 45_000; // 15s left — inside the 30s skew
    await creds.getAccessToken(SERVICE);
    expect(state.calls.assert).toBe(2);
  });

  /**
   * A page load fires many requests at once; without in-flight coalescing each would run its
   * own challenge/assert and burn a nonce.
   */
  it('coalesces concurrent mints into ONE round trip', async () => {
    const { state, fetchImpl } = fakeServer();
    const creds = makeCreds(fetchImpl);
    await creds.enroll('Test laptop');

    const tokens = await Promise.all(Array.from({ length: 8 }, () => creds.getAccessToken(SERVICE)));
    expect(state.calls.assert).toBe(1);
    expect(new Set(tokens).size).toBe(1);
  });

  it('throws NeedsEnrollmentError when this browser was never enrolled', async () => {
    const { fetchImpl } = fakeServer();
    await expect(makeCreds(fetchImpl).getAccessToken(SERVICE)).rejects.toBeInstanceOf(NeedsEnrollmentError);
  });

  it('clears the stale deviceId and asks for re-enrollment when the server says so', async () => {
    const storage = createMemoryDeviceStorage();
    const good = fakeServer();
    const creds = makeCreds(good.fetchImpl, storage);
    await creds.enroll('Test laptop');
    expect(await creds.isEnrolled()).toBe(true);

    // Now the server has forgotten it — a password change, a revoke, or an evicted key.
    const gone = fakeServer({
      assertFailure: { status: 401, body: { code: 'DEVICE_REENROLL_REQUIRED', error: 'gone' } },
    });
    const stale = makeCreds(gone.fetchImpl, storage);
    await expect(stale.getAccessToken(SERVICE)).rejects.toBeInstanceOf(NeedsEnrollmentError);

    // Cleared, so a retry surfaces the same typed error instead of looping on a dead id.
    expect(await stale.isEnrolled()).toBe(false);
  });

  it('surfaces a non-re-enrollment assert failure as a plain error, keeping the enrollment', async () => {
    const storage = createMemoryDeviceStorage();
    await makeCreds(fakeServer().fetchImpl, storage).enroll('Test laptop');

    const broken = fakeServer({ assertFailure: { status: 500, body: { error: 'boom' } } });
    const creds = makeCreds(broken.fetchImpl, storage);
    await expect(creds.getAccessToken(SERVICE)).rejects.toThrow(/boom/);
    expect(await creds.isEnrolled()).toBe(true);
  });

  it('attaches the bearer token via authedFetch', async () => {
    const { state, fetchImpl } = fakeServer();
    const creds = makeCreds(fetchImpl);
    await creds.enroll('Test laptop');

    await creds.authedFetch(SERVICE, 'https://builder.example.test/api/areas');
    expect(state.lastBearer).toBe('Bearer token-1');
  });

  it('retries a 401 exactly once with a freshly minted token', async () => {
    const { fetchImpl } = fakeServer();
    let protectedCalls = 0;
    const flaky = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/device/')) return fetchImpl(input, init);
      protectedCalls += 1;
      // First call rejects the token; the second accepts.
      return new Response('{}', { status: protectedCalls === 1 ? 401 : 200 });
    }) as typeof fetch;

    const creds = makeCreds(flaky);
    await creds.enroll('Test laptop');
    const res = await creds.authedFetch(SERVICE, 'https://builder.example.test/api/areas');

    expect(res.status).toBe(200);
    expect(protectedCalls).toBe(2);
  });

  it('does not loop on a persistent 401 — it gives up after one retry', async () => {
    const { fetchImpl } = fakeServer();
    let protectedCalls = 0;
    const always401 = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/device/')) return fetchImpl(input, init);
      protectedCalls += 1;
      return new Response('{}', { status: 401 });
    }) as typeof fetch;

    const creds = makeCreds(always401);
    await creds.enroll('Test laptop');
    const res = await creds.authedFetch(SERVICE, 'https://builder.example.test/api/areas');

    expect(res.status).toBe(401);
    expect(protectedCalls).toBe(2);
  });

  it('forgets everything on reset', async () => {
    const { fetchImpl } = fakeServer();
    const creds = makeCreds(fetchImpl);
    await creds.enroll('Test laptop');
    await creds.reset();
    expect(await creds.isEnrolled()).toBe(false);
  });

  /** The regression guard for the entire point of the scheme. */
  it('never writes anything to localStorage or sessionStorage', async () => {
    const localSpy = jest.spyOn(globalThis.localStorage, 'setItem');
    const sessionSpy = jest.spyOn(globalThis.sessionStorage, 'setItem');
    const { fetchImpl } = fakeServer();
    const creds = makeCreds(fetchImpl);

    await creds.enroll('Test laptop');
    await creds.getAccessToken(SERVICE);
    await creds.authedFetch(SERVICE, 'https://builder.example.test/api/areas');

    expect(localSpy).not.toHaveBeenCalled();
    expect(sessionSpy).not.toHaveBeenCalled();
    localSpy.mockRestore();
    sessionSpy.mockRestore();
  });
});
