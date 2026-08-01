import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import AccessPage from './AccessPage.js';
import { setStoredToken } from '../../api/client.js';

/**
 * Access tab (Phase 9): token entry + status probe, and the master-only
 * API-key lifecycle (create with show-once token, rotate, revoke).
 */
const MASTER = 'the-master-key-value';
const API_KEY = 'some-api-key-value';

describe('AccessPage (Phase 9)', () => {
  let keys: { id: string; label: string; createdAt: string; revokedAt?: string }[];
  let deleted: string[];

  beforeEach(() => {
    setStoredToken('');
    keys = [{ id: 'k1', label: 'laptop', createdAt: '2026-07-16T00:00:00Z' }];
    deleted = [];
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const auth = ((init?.headers ?? {}) as Record<string, string>).Authorization ?? '';
      const json = (body: unknown, status = 200) =>
        ({ ok: status < 400, status, statusText: 'x', json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/capabilities')) {
        return json({ writeEnabled: true, tokenRequired: true, mercAreaPath: '/mud/area' });
      }
      if (url.includes('/api/auth/')) {
        if (auth === `Bearer ${API_KEY}`) return json({ error: 'key management requires the master key' }, 403);
        if (auth !== `Bearer ${MASTER}`) return json({ error: 'a valid builder token is required' }, 401);
      }
      if (url.endsWith('/api/auth/keys') && (!init?.method || init.method === 'GET')) {
        return json({ keys });
      }
      if (url.endsWith('/api/auth/keys') && init?.method === 'POST') {
        const { label } = JSON.parse(String(init.body)) as { label: string };
        keys = [...keys, { id: 'k2', label, createdAt: '2026-07-16T12:00:00Z' }];
        return json({ id: 'k2', label, token: 'fresh-secret-token', note: 'shown once' }, 201);
      }
      if (url.endsWith('/api/auth/keys/k1/rotate') && init?.method === 'POST') {
        return json({ id: 'k1', label: 'laptop', token: 'rotated-secret-token', note: 'shown once' });
      }
      if (url.endsWith('/api/auth/keys/k1') && init?.method === 'DELETE') {
        deleted.push('k1');
        keys = keys.map((k) => (k.id === 'k1' ? { ...k, revokedAt: '2026-07-16T13:00:00Z' } : k));
        return json({ id: 'k1', revoked: true });
      }
      if (url.includes('/api/audit')) {
        if (auth === `Bearer ${API_KEY}`) return json({ error: 'master only' }, 403);
        if (auth !== `Bearer ${MASTER}`) return json({ error: 'a valid builder token is required' }, 401);
        return json({
          entries: [
            { ts: '2026-07-16T14:00:00Z', method: 'PUT', route: '/api/groups', status: 200, actor: 'master' },
            { ts: '2026-07-16T13:00:00Z', method: 'POST', route: '/api/auth/keys', status: 201, actor: 'master' },
          ],
        });
      }
      throw new Error(`unexpected fetch ${url} ${init?.method ?? 'GET'}`);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    setStoredToken('');
  });

  it('prompts for a token, then unlocks key management when the master key is saved', async () => {
    render(<AccessPage />);
    expect(await screen.findByText(/required to save changes/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Builder token'), { target: { value: MASTER } });
    fireEvent.click(screen.getByRole('button', { name: 'Use token' }));

    expect(await screen.findByText(/Master key accepted/)).toBeTruthy();
    expect(screen.getByText('laptop')).toBeTruthy();
    // Deliberately inverted from the original assertion: the token used to be persisted to
    // localStorage under 'mb-token', which is precisely the exposure device credentials remove.
    expect(localStorage.getItem('mb-token')).toBeNull();
  });

  it('reports an API key as save-capable without key management', async () => {
    setStoredToken(API_KEY);
    render(<AccessPage />);
    expect(await screen.findByText(/Access granted \(API key or enrolled device\)/)).toBeTruthy();
    expect(screen.queryByText('API keys')).toBeNull();
  });

  it('flags a rejected token', async () => {
    setStoredToken('nonsense');
    render(<AccessPage />);
    expect(await screen.findByText(/REJECTED/)).toBeTruthy();
  });

  it('creates a key and shows its token exactly once', async () => {
    setStoredToken(MASTER);
    render(<AccessPage />);
    await screen.findByText(/Master key accepted/);

    fireEvent.change(screen.getByLabelText('New key label'), { target: { value: 'ci driver' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));

    // Masked by default now (safe on a shared screen) — reveal to confirm the real value.
    const issued = (await screen.findByLabelText('Issued token')) as HTMLInputElement;
    expect(issued.value).not.toContain('fresh-secret-token');
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    expect((screen.getByLabelText('Issued token') as HTMLInputElement).value).toBe('fresh-secret-token');
    expect(await screen.findByText('ci driver')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByLabelText('Issued token')).toBeNull();
  });

  it('rotates and revokes keys behind confirms', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    setStoredToken(MASTER);
    render(<AccessPage />);
    await screen.findByText(/Master key accepted/);

    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    const issued = (await screen.findByLabelText('Issued token')) as HTMLInputElement;
    expect(issued.value).not.toContain('rotated-secret-token');
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    expect((screen.getByLabelText('Issued token') as HTMLInputElement).value).toBe('rotated-secret-token');

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(deleted).toEqual(['k1']));
    expect(await screen.findByText(/revoked 2026-07-16/)).toBeTruthy();
  });

  it('shows the audit log to the master, newest first (Phase 10)', async () => {
    setStoredToken(MASTER);
    render(<AccessPage />);
    await screen.findByText(/Master key accepted/);

    const table = await screen.findByLabelText('Audit entries');
    const rows = table.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('/api/groups');
    expect(rows[1].textContent).toContain('/api/auth/keys');
  });

  it('never shows the audit log to an API key (Phase 10)', async () => {
    setStoredToken(API_KEY);
    render(<AccessPage />);
    await screen.findByText(/Access granted \(API key or enrolled device\)/);
    expect(screen.queryByText('Audit log')).toBeNull();
  });

  /**
   * The regression guard for why device credentials exist at all: this app used to keep its
   * builder token in localStorage under 'mb-token', where any script on the page could read
   * it. The manual token is now memory-only, so a reload must lose it and nothing may be
   * written to web storage.
   */
  it('never writes the manual token to localStorage or sessionStorage', async () => {
    // Storage.prototype, not the instance: jsdom's localStorage/sessionStorage are exotic
    // objects whose methods live on the prototype, so spying the instance silently no-ops.
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

    render(<AccessPage />);
    fireEvent.change(await screen.findByLabelText('Builder token'), { target: { value: MASTER } });
    fireEvent.click(screen.getByRole('button', { name: 'Use token' }));
    await screen.findByText(/Master key accepted/);

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(globalThis.localStorage.getItem('mb-token')).toBeNull();
    setItemSpy.mockRestore();
  });

  it('says the token is not persisted, so nobody expects it to survive a reload', async () => {
    render(<AccessPage />);
    expect(await screen.findByText(/not saved to disk, so a reload clears it/)).toBeTruthy();
  });

  /** No authPublicUrl in capabilities = this deployment doesn't offer device credentials. */
  it('hides the device panel when the deployment does not advertise an auth origin', async () => {
    render(<AccessPage />);
    await screen.findByText(/Enrol this device below/);
    expect(screen.queryByText('This device')).toBeNull();
  });
});

describe('AccessPage device enrolment', () => {
  const AUTH = 'https://auth.example.test';

  /** capabilities now advertises authPublicUrl, so the device panel appears. */
  function mockServer(options: { enrollStatus?: number } = {}) {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        ({ ok: status < 400, status, statusText: 'x', json: async () => body }) as unknown as Response;

      if (url.endsWith('/api/capabilities')) {
        return json({ writeEnabled: true, tokenRequired: true, mercAreaPath: '/mud/area', authPublicUrl: AUTH });
      }
      if (url.endsWith('/api/device/enroll')) {
        const status = options.enrollStatus ?? 201;
        return status === 201
          ? json({ deviceId: 'dev-1', label: 'x' }, 201)
          : json({ error: 'a valid session is required' }, status);
      }
      return json({ error: 'a valid builder token is required' }, 401);
    }) as unknown as typeof fetch;
  }

  beforeEach(() => {
    setStoredToken('');
    // The IndexedDB shim's store is per-FILE. Without this, the silent enrolment in the first
    // test leaves this browser enrolled for every later one, and the "not enrolled yet"
    // assertions pass or fail based on test order.
    (globalThis as unknown as { __resetIndexedDbShim?: () => void }).__resetIndexedDbShim?.();
  });

  /**
   * The seamless path, and the reason the manual-enrolment tests below must now opt OUT of a
   * session: when the user already has one, the probe binds this browser with no prompt and
   * no pasted secret. Nothing is asked of them at all.
   */
  it('enrols silently when the user already has a hub session', async () => {
    mockServer();
    render(<AccessPage />);
    expect(await screen.findByText(/This device is enrolled/)).toBeTruthy();
    // The offer never appears — there was nothing for the user to do.
    expect(screen.queryByRole('button', { name: 'Enrol this device' })).toBeNull();
  });

  it('offers enrolment, and says plainly that nothing secret is shown', async () => {
    // 401 = no hub session, so the silent attempt fails and the manual offer is shown.
    mockServer({ enrollStatus: 401 });
    render(<AccessPage />);
    expect(await screen.findByText('This device')).toBeTruthy();
    // Phrase unique to the panel — the status line above also mentions screen sharing.
    expect(screen.getByText(/using a key it can never reveal/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enrol this device' })).toBeTruthy();
  });

  /** Without a session the useful next step is the sign-in hand-off, not a manual retry. */
  it('offers a sign-in link that returns the user here', async () => {
    mockServer({ enrollStatus: 401 });
    render(<AccessPage />);
    const link = (await screen.findByRole('link', { name: /Sign in to the account service/ })) as HTMLAnchorElement;
    expect(link.href).toContain(encodeURIComponent(window.location.href));
    // Compare the parsed ORIGIN, not a string prefix: `startsWith(AUTH)` also passes for
    // https://auth.example.test.evil.test, which is the exact shape of a mis-targeted hand-off.
    expect(new URL(link.href).origin).toBe(new URL(AUTH).origin);
  });

  it('suggests a recognisable default device name rather than making one up', async () => {
    mockServer({ enrollStatus: 401 });
    render(<AccessPage />);
    const input = (await screen.findByLabelText('Device name')) as HTMLInputElement;
    // jsdom's UA is Mozilla/5.0 (...) jsdom/x — no browser token we recognise.
    expect(input.placeholder.length).toBeGreaterThan(0);
  });

  /**
   * Enrolment needs an auth-server SESSION, not a builder token — deliberately, so a stolen
   * token can never enrol a device. A 401 must therefore say "go sign in", not show a code.
   */
  it('explains that enrolling requires signing in, when the session is missing', async () => {
    mockServer({ enrollStatus: 401 });
    render(<AccessPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Enrol this device' }));
    expect(await screen.findByText(/needs you to be signed in to the account service/)).toBeTruthy();
  });
});
