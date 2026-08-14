import {
  ensureDeviceCredentials,
  deviceUnavailableReason,
  isDeviceEnrolled,
  enrollDeviceAfterLogin,
  getDeviceToken,
  forgetDevice,
  defaultDeviceLabel,
  resetDeviceCredentialsForTest,
} from './deviceCredentials';

const AUTH = 'https://auth.example.test';

/**
 * Stands in for kt-server's /api/kt/config plus auth-server's device endpoints. The assert
 * handler does NOT verify the signature (sdk-client's own suite does that against real
 * WebCrypto); what matters here is this module's wiring and its fail-soft rules.
 */
function mockFetch(options: { authPublicUrl?: string; configStatus?: number; enrollStatus?: number } = {}) {
  const calls: string[] = [];
  const impl = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const json = (body: unknown, status = 200) =>
      ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

    if (url.endsWith('/api/kt/config')) {
      const status = options.configStatus ?? 200;
      return json({ authPublicUrl: options.authPublicUrl }, status);
    }
    if (url.endsWith('/api/device/enroll')) {
      const status = options.enrollStatus ?? 201;
      return status === 201 ? json({ deviceId: 'dev-1' }, 201) : json({ error: 'no session' }, status);
    }
    if (url.endsWith('/api/device/challenge')) return json({ nonce: 'n1', expiresAt: '2099-01-01T00:00:00Z' });
    if (url.endsWith('/api/device/assert')) {
      return json({ token: 'device-token-1', expiresAt: '2099-01-01T00:00:00Z', service: 'kingdom-tactics-server' });
    }
    return json({}, 404);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('kt deviceCredentials', () => {
  beforeEach(() => {
    resetDeviceCredentialsForTest();
    // The IndexedDB shim is per-FILE, so a device enrolled in one test is still enrolled in the
    // next — clear it, or "not enrolled yet" assertions pass or fail based on test order.
    (globalThis as unknown as { __resetIndexedDbShim?: () => void }).__resetIndexedDbShim?.();
  });

  it('is unavailable when kt-server advertises no auth origin', async () => {
    const { impl } = mockFetch({ authPublicUrl: undefined });
    await ensureDeviceCredentials(impl);
    expect(deviceUnavailableReason()).toBe('not-offered');
    expect(await isDeviceEnrolled()).toBe(false);
  });

  it('stays unavailable and does not throw when kt-server is unreachable', async () => {
    const failing = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    await expect(ensureDeviceCredentials(failing)).resolves.toBeUndefined();
    expect(deviceUnavailableReason()).toBe('not-offered');
  });

  it('becomes available when an auth origin is advertised', async () => {
    const { impl } = mockFetch({ authPublicUrl: AUTH });
    await ensureDeviceCredentials(impl);
    expect(deviceUnavailableReason()).toBeNull();
  });

  /** Idempotent so every entry point (cloudSync, the mount probe, the SSO callback) can call it. */
  it('only fetches the config once no matter how many callers ask', async () => {
    const { impl, calls } = mockFetch({ authPublicUrl: AUTH });
    await Promise.all([ensureDeviceCredentials(impl), ensureDeviceCredentials(impl), ensureDeviceCredentials(impl)]);
    expect(calls.filter((u) => u.endsWith('/api/kt/config'))).toHaveLength(1);
  });

  it('reports not-enrolled before enrolment, and enrolled after', async () => {
    const { impl } = mockFetch({ authPublicUrl: AUTH });
    await ensureDeviceCredentials(impl);
    expect(await isDeviceEnrolled()).toBe(false);

    expect(await enrollDeviceAfterLogin('Test device')).toBe(true);
    expect(await isDeviceEnrolled()).toBe(true);
  });

  it('returns no token until enrolled, then a device token', async () => {
    const { impl } = mockFetch({ authPublicUrl: AUTH });
    await ensureDeviceCredentials(impl);
    expect(await getDeviceToken()).toBeNull();

    await enrollDeviceAfterLogin('Test device');
    expect(await getDeviceToken()).toBe('device-token-1');
  });

  /**
   * Enrolment rides on the session the SSO hand-off just established. If that has already
   * lapsed the login itself still succeeded, so this must report failure rather than throw and
   * break a working login.
   */
  it('reports enrolment failure without throwing when there is no session', async () => {
    const { impl } = mockFetch({ authPublicUrl: AUTH, enrollStatus: 401 });
    await ensureDeviceCredentials(impl);
    expect(await enrollDeviceAfterLogin('Test device')).toBe(false);
    expect(await isDeviceEnrolled()).toBe(false);
  });

  it('cannot enrol at all when device credentials are unavailable', async () => {
    const { impl } = mockFetch({ authPublicUrl: undefined });
    await ensureDeviceCredentials(impl);
    expect(await enrollDeviceAfterLogin('Test device')).toBe(false);
  });

  it('forgets the device on request', async () => {
    const { impl } = mockFetch({ authPublicUrl: AUTH });
    await ensureDeviceCredentials(impl);
    await enrollDeviceAfterLogin('Test device');
    await forgetDevice();
    expect(await isDeviceEnrolled()).toBe(false);
  });

  it('never persists a credential to localStorage or sessionStorage', async () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    const { impl } = mockFetch({ authPublicUrl: AUTH });
    await ensureDeviceCredentials(impl);
    await enrollDeviceAfterLogin('Test device');
    await getDeviceToken();

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('kt.auth.token')).toBeNull();
    setItemSpy.mockRestore();
  });

  it('labels the device recognisably and names the app', () => {
    expect(defaultDeviceLabel()).toContain('Kingdom Tactics');
  });
});
