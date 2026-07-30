import crypto from 'crypto';

import { startTestApp, fullyOnboardedSession, signupAndLogin, type TestHarness } from './test-helpers.js';
import { deviceAssertionPayload, DEVICE_LABEL_MAX } from './device.js';

/**
 * A browser stand-in. Signs with `dsaEncoding: 'ieee-p1363'` because that is what WebCrypto's
 * ECDSA emits (raw r||s) — node defaults to DER, so a test signing the DEFAULT way would pass
 * against a server that also verified the default way and both would be wrong for real
 * browsers. Pinning the browser encoding here is the point of this helper.
 */
function makeDevice() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    publicKeyJwk: publicKey.export({ format: 'jwk' }),
    sign(deviceId: string, nonce: string, service: string): string {
      const payload = deviceAssertionPayload(deviceId, nonce, service);
      return crypto
        .sign('sha256', payload, { key: privateKey, dsaEncoding: 'ieee-p1363' })
        .toString('base64url');
    },
  };
}

const SERVICE = 'mud-builder-server';
/**
 * The harness maps this origin to `mud-builder-server` and a second one to
 * `kingdom-tactics-server` (see test-helpers.ts), which is what makes the cross-audience
 * refusal testable. Enrollment REQUIRES an Origin: the audience is derived from it, and a
 * request without one has no provable audience.
 */
const BUILDER_ORIGIN = 'http://localhost:60080';
const KT_ORIGIN = 'http://localhost:50080';
const KT_SERVICE = 'kingdom-tactics-server';

async function enroll(
  base: string,
  cookie: string,
  publicKeyJwk: unknown,
  label = 'Test laptop',
  origin: string | null = BUILDER_ORIGIN,
) {
  const res = await fetch(`${base}/api/device/enroll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify({ publicKeyJwk, label }),
  });
  return {
    res,
    body: (await res.json()) as {
      deviceId?: string;
      label?: string;
      allowedServices?: string[];
      error?: string;
      code?: string;
    },
  };
}

async function challenge(base: string, deviceId: string) {
  const res = await fetch(`${base}/api/device/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  });
  return (await res.json()) as { nonce: string; expiresAt: string };
}

async function assert(base: string, payload: Record<string, unknown>) {
  const res = await fetch(`${base}/api/device/assert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { res, body: (await res.json()) as { token?: string; expiresAt?: string; service?: string; error?: string; code?: string } };
}

/** The whole happy path: enroll -> challenge -> sign -> assert -> a usable token. */
async function enrolledDevice(harness: TestHarness, username: string) {
  const cookie = await fullyOnboardedSession(harness.base, username);
  const device = makeDevice();
  const { body } = await enroll(harness.base, cookie, device.publicKeyJwk);
  return { cookie, device, deviceId: body.deviceId as string };
}

describe('device routes', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await startTestApp();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('enrolls a device and returns NO secret in the response', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'dev1');
    const device = makeDevice();
    const { res, body } = await enroll(harness.base, cookie, device.publicKeyJwk);

    expect(res.status).toBe(201);
    expect(body.deviceId).toEqual(expect.any(String));
    // The entire point of the scheme: enrollment hands back nothing worth stealing or
    // leaking on a shared screen. allowedServices is derived config, not a credential.
    expect(Object.keys(body).sort()).toEqual(['allowedServices', 'deviceId', 'label']);
    expect(body.allowedServices).toEqual([SERVICE]);
  });

  /**
   * The audience binding, end to end. This is the property that makes a device token's
   * audience meaningful: the browser names a service, but the ANSWER comes from the origin it
   * enrolled at. Without this, an XSS on any enrolled app could mint a token for a more
   * privileged one.
   */
  it('refuses to mint for a service the enrolling origin is not mapped to', async () => {
    const { device, deviceId } = await enrolledDevice(harness, 'devaud1');
    const { nonce } = await challenge(harness.base, deviceId);
    // A perfectly VALID signature — correctly signed for the service being requested. The
    // only thing wrong is that this device's origin was never mapped to that service.
    const { res, body } = await assert(harness.base, {
      deviceId,
      nonce,
      service: KT_SERVICE,
      signature: device.sign(deviceId, nonce, KT_SERVICE),
    });
    expect(res.status).toBe(403);
    expect(body.code).toBe('DEVICE_AUDIENCE_NOT_ALLOWED');
  });

  it('mints for a service when the enrolling origin IS mapped to it', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'devaud2');
    const device = makeDevice();
    const { body: enrolled } = await enroll(harness.base, cookie, device.publicKeyJwk, 'KT laptop', KT_ORIGIN);
    const deviceId = enrolled.deviceId as string;
    expect(enrolled.allowedServices).toEqual([KT_SERVICE]);

    const { nonce } = await challenge(harness.base, deviceId);
    const { res, body } = await assert(harness.base, {
      deviceId,
      nonce,
      service: KT_SERVICE,
      signature: device.sign(deviceId, nonce, KT_SERVICE),
    });
    expect(res.status).toBe(200);
    expect(body.service).toBe(KT_SERVICE);
  });

  /**
   * CORS cannot carry this check: a browser refuses to expose a disallowed RESPONSE, but the
   * request still arrives, and a non-browser client sends no Origin at all. So the audience
   * would be underivable — which must be a refusal, never a default.
   */
  it('refuses to enroll without an Origin header', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'devaud3');
    const device = makeDevice();
    const { res, body } = await enroll(harness.base, cookie, device.publicKeyJwk, 'Headless', null);
    expect(res.status).toBe(403);
    expect(body.code).toBe('DEVICE_ORIGIN_REQUIRED');
  });

  it('refuses to enroll from an origin that is not in the map', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'devaud4');
    const device = makeDevice();
    const { res, body } = await enroll(harness.base, cookie, device.publicKeyJwk, 'Rogue', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(body.code).toBe('DEVICE_ORIGIN_NOT_CONFIGURED');
  });

  /**
   * The entitlement tier: for a service listed in deviceGrantRequiredServices, holding a device
   * key is not enough — the account must ALSO hold an active API key for that service. This is
   * what lets the existing API-keys UI stay the place access is granted and withdrawn, while
   * the user never pastes the key anywhere.
   */
  describe('when a service requires an API-key grant', () => {
    /** Same array instance the routes read, so pushing here is the policy taking effect. */
    beforeEach(() => {
      harness.deps.deviceGrantRequiredServices.push(SERVICE);
    });

    async function mintFor(username: string, service: string): Promise<void> {
      const account = harness.deps.accountStore.findByUsername(username);
      if (!account) throw new Error(`test setup: no account ${username}`);
      harness.deps.keyStore.mintApiKey(account.id, service, 'grant', null, account.epoch);
    }

    it('refuses to mint when the account holds no key for that service', async () => {
      const { device, deviceId } = await enrolledDevice(harness, 'devgrant1');
      const { nonce } = await challenge(harness.base, deviceId);
      const { res, body } = await assert(harness.base, {
        deviceId,
        nonce,
        service: SERVICE,
        signature: device.sign(deviceId, nonce, SERVICE),
      });
      expect(res.status).toBe(403);
      expect(body.code).toBe('DEVICE_GRANT_REQUIRED');
    });

    it('mints once the account holds an active key for that service', async () => {
      const { device, deviceId } = await enrolledDevice(harness, 'devgrant2');
      await mintFor('devgrant2', SERVICE);

      const { nonce } = await challenge(harness.base, deviceId);
      const { res, body } = await assert(harness.base, {
        deviceId,
        nonce,
        service: SERVICE,
        signature: device.sign(deviceId, nonce, SERVICE),
      });
      expect(res.status).toBe(200);
      expect(body.token).toEqual(expect.any(String));
    });

    /** A key for a DIFFERENT service is not a grant for this one. */
    it('does not accept a key minted for another service as the grant', async () => {
      const { device, deviceId } = await enrolledDevice(harness, 'devgrant3');
      await mintFor('devgrant3', KT_SERVICE);

      const { nonce } = await challenge(harness.base, deviceId);
      const { res } = await assert(harness.base, {
        deviceId,
        nonce,
        service: SERVICE,
        signature: device.sign(deviceId, nonce, SERVICE),
      });
      expect(res.status).toBe(403);
    });

    /**
     * Checked at MINT time, not enrollment: revoking the key must take hold on the next
     * ~10-minute re-mint, otherwise a device already in the field would keep working forever.
     */
    it('stops minting as soon as the grant is revoked', async () => {
      const { device, deviceId } = await enrolledDevice(harness, 'devgrant4');
      await mintFor('devgrant4', SERVICE);
      const first = await challenge(harness.base, deviceId);
      expect(
        (
          await assert(harness.base, {
            deviceId,
            nonce: first.nonce,
            service: SERVICE,
            signature: device.sign(deviceId, first.nonce, SERVICE),
          })
        ).res.status,
      ).toBe(200);

      const account = harness.deps.accountStore.findByUsername('devgrant4');
      const key = harness.deps.keyStore.listKeys(account!.id)[0];
      harness.deps.keyStore.revokeById(key.id);

      const second = await challenge(harness.base, deviceId);
      const { res, body } = await assert(harness.base, {
        deviceId,
        nonce: second.nonce,
        service: SERVICE,
        signature: device.sign(deviceId, second.nonce, SERVICE),
      });
      expect(res.status).toBe(403);
      expect(body.code).toBe('DEVICE_GRANT_REQUIRED');
    });
  });

  it('completes challenge -> sign -> assert and mints a short-lived audience-scoped token', async () => {
    const { device, deviceId } = await enrolledDevice(harness, 'dev2');
    const { nonce } = await challenge(harness.base, deviceId);
    const { res, body } = await assert(harness.base, {
      deviceId,
      nonce,
      service: SERVICE,
      signature: device.sign(deviceId, nonce, SERVICE),
    });

    expect(res.status).toBe(200);
    expect(body.token).toEqual(expect.any(String));
    expect(body.service).toBe(SERVICE);
    expect(Date.parse(body.expiresAt as string) - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it('mints a token that introspect reports as kind "device" scoped to the requested service', async () => {
    const { device, deviceId } = await enrolledDevice(harness, 'dev3');
    const { nonce } = await challenge(harness.base, deviceId);
    const { body } = await assert(harness.base, {
      deviceId,
      nonce,
      service: SERVICE,
      signature: device.sign(deviceId, nonce, SERVICE),
    });

    // Verified through the STORE rather than the introspect endpoint, which needs a
    // registered service key — introspect's own suite covers that wiring.
    const verified = harness.deps.keyStore.verify(
      body.token as string,
      (accountId) => harness.deps.accountStore.findById(accountId)?.epoch,
    );
    expect(verified?.kind).toBe('device');
    expect(verified?.service).toBe(SERVICE);
  });

  it('refuses to enroll without a session', async () => {
    const device = makeDevice();
    const res = await fetch(`${harness.base}/api/device/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKeyJwk: device.publicKeyJwk, label: 'No session' }),
    });
    expect(res.status).toBe(401);
  });

  /** Enrollment must cost a real login, or XSS holding a stolen token could enroll its own key. */
  it('refuses to enroll while a password change is still forced', async () => {
    const { cookie } = await signupAndLogin(harness.base, 'dev4');
    const device = makeDevice();
    const { res } = await enroll(harness.base, cookie, device.publicKeyJwk);
    expect(res.status).toBe(403);
  });

  it('rejects a private JWK at enrollment rather than storing it', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'dev5');
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const { res, body } = await enroll(harness.base, cookie, privateKey.export({ format: 'jwk' }));
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/must not contain "d"/);
  });

  it('rejects a non-P-256 key at enrollment', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'dev6');
    const { publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
    const { res } = await enroll(harness.base, cookie, publicKey.export({ format: 'jwk' }));
    expect(res.status).toBe(400);
  });

  it('caps the device label length', async () => {
    const cookie = await fullyOnboardedSession(harness.base, 'dev7');
    const device = makeDevice();
    const { res } = await enroll(harness.base, cookie, device.publicKeyJwk, 'x'.repeat(DEVICE_LABEL_MAX + 1));
    expect(res.status).toBe(400);
  });

  it('rejects a replayed nonce — the second use fails even though the signature is valid', async () => {
    const { device, deviceId } = await enrolledDevice(harness, 'dev8');
    const { nonce } = await challenge(harness.base, deviceId);
    const signature = device.sign(deviceId, nonce, SERVICE);

    const first = await assert(harness.base, { deviceId, nonce, service: SERVICE, signature });
    expect(first.res.status).toBe(200);

    const replay = await assert(harness.base, { deviceId, nonce, service: SERVICE, signature });
    expect(replay.res.status).toBe(401);
    expect(replay.body.error).toMatch(/already used/);
  });

  /** A wrong signature must still burn the nonce, or it becomes a grinding target. */
  it('burns the nonce even when the signature fails, so it cannot be retried', async () => {
    const { deviceId } = await enrolledDevice(harness, 'dev9');
    const impostor = makeDevice();
    const { nonce } = await challenge(harness.base, deviceId);

    const bad = await assert(harness.base, {
      deviceId,
      nonce,
      service: SERVICE,
      signature: impostor.sign(deviceId, nonce, SERVICE),
    });
    expect(bad.res.status).toBe(401);
    expect(bad.body.error).toMatch(/signature does not verify/);

    // Same nonce, now with the RIGHT key — must still fail, because the nonce is spent.
    const retry = await assert(harness.base, { deviceId, nonce, service: SERVICE, signature: 'ignored' });
    expect(retry.res.status).toBe(401);
    expect(retry.body.error).toMatch(/already used/);
  });

  it('rejects an unknown nonce', async () => {
    const { device, deviceId } = await enrolledDevice(harness, 'dev10');
    const bogus = crypto.randomBytes(32).toString('base64url');
    const { res } = await assert(harness.base, {
      deviceId,
      nonce: bogus,
      service: SERVICE,
      signature: device.sign(deviceId, bogus, SERVICE),
    });
    expect(res.status).toBe(401);
  });

  /**
   * The audience is signed, not just sent, so a signature captured for one service cannot be
   * re-presented to mint a token for another.
   */
  it('rejects a signature made for a different service audience', async () => {
    const { device, deviceId } = await enrolledDevice(harness, 'dev11');
    const { nonce } = await challenge(harness.base, deviceId);
    const { res, body } = await assert(harness.base, {
      deviceId,
      nonce,
      service: 'kingdom-tactics-server',
      signature: device.sign(deviceId, nonce, SERVICE), // signed for mud-builder-server
    });
    expect(res.status).toBe(401);
    // Fails at signature verification, NOT at the nonce — proving the audience is part of
    // the signed bytes rather than merely an unsigned field alongside them.
    expect(body.error).toMatch(/signature does not verify/);
  });

  it('rejects a nonce issued to a DIFFERENT device', async () => {
    const a = await enrolledDevice(harness, 'dev12a');
    const b = await enrolledDevice(harness, 'dev12b');
    const { nonce } = await challenge(harness.base, b.deviceId); // issued to B

    const { res } = await assert(harness.base, {
      deviceId: a.deviceId, // spent by A
      nonce,
      service: SERVICE,
      signature: a.device.sign(a.deviceId, nonce, SERVICE),
    });
    expect(res.status).toBe(401);
  });

  it('tells an unknown device to re-enroll with a machine-readable code', async () => {
    const { res, body } = await assert(harness.base, {
      deviceId: 'never-enrolled',
      nonce: 'x',
      service: SERVICE,
      signature: 'x',
    });
    expect(res.status).toBe(401);
    expect(body.code).toBe('DEVICE_REENROLL_REQUIRED');
  });

  it('issues a challenge for an unknown device rather than acting as an enumeration oracle', async () => {
    const real = await enrolledDevice(harness, 'dev13');
    const forReal = await challenge(harness.base, real.deviceId);
    const forFake = await challenge(harness.base, 'not-a-device');
    // Indistinguishable shapes — the failure only surfaces at assert.
    expect(Object.keys(forFake).sort()).toEqual(Object.keys(forReal).sort());
    expect(forFake.nonce).toEqual(expect.any(String));
  });

  /**
   * The compromise path, end to end: changing the password bumps the epoch, and the
   * enrollment stops working WITHOUT any route having to remember to revoke it.
   */
  it('invalidates the enrollment after a password change, asking for re-enrollment', async () => {
    const { cookie, device, deviceId } = await enrolledDevice(harness, 'dev14');
    const pre = await challenge(harness.base, deviceId);
    expect((await assert(harness.base, { deviceId, nonce: pre.nonce, service: SERVICE, signature: device.sign(deviceId, pre.nonce, SERVICE) })).res.status).toBe(200);

    const changed = await fetch(`${harness.base}/api/account/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        currentPassword: 'a perfectly fine long password',
        newPassword: 'another perfectly fine long password',
      }),
    });
    expect(changed.status).toBe(200);

    const post = await challenge(harness.base, deviceId);
    const { res, body } = await assert(harness.base, {
      deviceId,
      nonce: post.nonce,
      service: SERVICE,
      signature: device.sign(deviceId, post.nonce, SERVICE),
    });
    expect(res.status).toBe(401);
    expect(body.code).toBe('DEVICE_REENROLL_REQUIRED');
  });

  it('lists devices without ever returning key material', async () => {
    const { cookie, deviceId } = await enrolledDevice(harness, 'dev15');
    const res = await fetch(`${harness.base}/api/device`, { headers: { Cookie: cookie } });
    const body = (await res.json()) as { devices: Record<string, unknown>[] };

    expect(res.status).toBe(200);
    expect(body.devices).toHaveLength(1);
    expect(body.devices[0].id).toBe(deviceId);
    expect(body.devices[0].publicKeyJwk).toBeUndefined();
  });

  it('revokes one device, after which it can no longer assert', async () => {
    const { cookie, device, deviceId } = await enrolledDevice(harness, 'dev16');
    const revoked = await fetch(`${harness.base}/api/device/${deviceId}/revoke`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(revoked.status).toBe(200);

    const { nonce } = await challenge(harness.base, deviceId);
    const { res, body } = await assert(harness.base, {
      deviceId,
      nonce,
      service: SERVICE,
      signature: device.sign(deviceId, nonce, SERVICE),
    });
    expect(res.status).toBe(401);
    expect(body.code).toBe('DEVICE_REENROLL_REQUIRED');
  });

  it('never lets one account revoke another account\'s device', async () => {
    const victim = await enrolledDevice(harness, 'dev17a');
    const attackerCookie = await fullyOnboardedSession(harness.base, 'dev17b');
    const res = await fetch(`${harness.base}/api/device/${victim.deviceId}/revoke`, {
      method: 'POST',
      headers: { Cookie: attackerCookie },
    });
    expect(res.status).toBe(404);
  });

  it('revokes every device at once for the signed-in account only', async () => {
    const mine = await enrolledDevice(harness, 'dev18a');
    const theirs = await enrolledDevice(harness, 'dev18b');

    const res = await fetch(`${harness.base}/api/device/revoke-all`, {
      method: 'POST',
      headers: { Cookie: mine.cookie },
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { revoked: number }).toEqual({ revoked: 1 });

    // The other account's device is untouched.
    const { nonce } = await challenge(harness.base, theirs.deviceId);
    const stillWorks = await assert(harness.base, {
      deviceId: theirs.deviceId,
      nonce,
      service: SERVICE,
      signature: theirs.device.sign(theirs.deviceId, nonce, SERVICE),
    });
    expect(stillWorks.res.status).toBe(200);
  });

  it('writes an audit line for enrollment and revocation', async () => {
    const { cookie, deviceId } = await enrolledDevice(harness, 'dev19');
    await fetch(`${harness.base}/api/device/${deviceId}/revoke`, { method: 'POST', headers: { Cookie: cookie } });

    const fs = await import('fs');
    const path = await import('path');
    const log = fs.readFileSync(path.join(harness.dir, 'audit.log'), 'utf8');
    expect(log).toContain('device.enroll');
    expect(log).toContain('device.revoke');
    expect(log).toContain(deviceId);
  });
});

describe('device CORS', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await startTestApp();
  });

  afterEach(async () => {
    await harness.close();
  });

  const ALLOWED = 'http://localhost:60080';

  it('allows an allowlisted origin WITH credentials', async () => {
    const res = await fetch(`${harness.base}/api/device/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ALLOWED },
      body: JSON.stringify({ deviceId: 'x' }),
    });
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED);
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  /** A wildcard is INVALID with credentials, so the echo must be the exact origin. */
  it('never answers with a wildcard', async () => {
    const res = await fetch(`${harness.base}/api/device/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ALLOWED },
      body: JSON.stringify({ deviceId: 'x' }),
    });
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
  });

  it('sends NO allow-origin for an unlisted origin', async () => {
    const res = await fetch(`${harness.base}/api/device/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ deviceId: 'x' }),
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  /** Without Vary, a shared cache could hand one origin's allow-header to another. */
  it('always sets Vary: Origin, even when the origin is refused', async () => {
    const res = await fetch(`${harness.base}/api/device/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ deviceId: 'x' }),
    });
    expect(res.headers.get('vary')).toContain('Origin');
  });

  it('answers the preflight for an allowlisted origin', async () => {
    const res = await fetch(`${harness.base}/api/device/enroll`, {
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('content-type');
  });

  /** CORS is a browser mechanism; an originless caller must be unaffected. */
  it('leaves originless requests alone', async () => {
    const res = await fetch(`${harness.base}/api/device/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'x' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  /** Narrow scope: CORS must not have widened the rest of auth-server. */
  it('does not add CORS headers to non-device endpoints', async () => {
    const res = await fetch(`${harness.base}/api/auth/challenge`, { headers: { Origin: ALLOWED } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('deviceAssertionPayload', () => {
  /**
   * Length-prefixed framing: without it, a deviceId containing the delimiter could shift
   * where one field ends and the next begins, so two different (deviceId, nonce, service)
   * triples could produce identical signed bytes.
   */
  it('cannot be confused by field contents that look like delimiters', () => {
    const a = deviceAssertionPayload('a:b', 'c', 'd');
    const b = deviceAssertionPayload('a', 'b:c', 'd');
    expect(a.equals(b)).toBe(false);
  });

  it('is stable for the same inputs', () => {
    expect(deviceAssertionPayload('d', 'n', 's').equals(deviceAssertionPayload('d', 'n', 's'))).toBe(true);
  });
});
