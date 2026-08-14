import { act, renderHook, waitFor } from '@testing-library/react';

import { useAuthSession } from './useAuthSession.js';

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, statusText: 'x', json: async () => body } as unknown as Response;
}

const ACCOUNT = {
  id: 'acc-1',
  username: 'alice',
  mustChangePassword: false,
  emailOnFile: false,
  emailVerified: false,
};

describe('useAuthSession', () => {
  it('starts loading, then reports loggedOut on a 401 from GET /api/auth/me', async () => {
    globalThis.fetch = jest.fn(async () => jsonResponse({ error: 'a valid session is required' }, 401)) as unknown as typeof fetch;

    const { result } = renderHook(() => useAuthSession());
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('loggedOut'));
    expect(result.current.account).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('reports mustChangePassword when /api/auth/me says so', async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonResponse({ ...ACCOUNT, mustChangePassword: true }),
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useAuthSession());
    await waitFor(() => expect(result.current.status).toBe('mustChangePassword'));
    expect(result.current.account?.username).toBe('alice');
  });

  it('reports ready when logged in with no forced change', async () => {
    globalThis.fetch = jest.fn(async () => jsonResponse(ACCOUNT)) as unknown as typeof fetch;

    const { result } = renderHook(() => useAuthSession());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('login() sets the account and status from the login response, credentials included', async () => {
    let sawCredentials: RequestCredentials | undefined;
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      sawCredentials = init?.credentials;
      if (url.endsWith('/api/auth/me')) return jsonResponse({ error: 'nope' }, 401);
      if (url.endsWith('/api/auth/login')) return jsonResponse(ACCOUNT);
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useAuthSession());
    await waitFor(() => expect(result.current.status).toBe('loggedOut'));

    await act(async () => {
      await result.current.login('alice', 'secret-password-12');
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.account?.username).toBe('alice');
    expect(sawCredentials).toBe('include');
  });

  it('logout() clears the account and reports loggedOut', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return jsonResponse(ACCOUNT);
      if (url.endsWith('/api/auth/logout')) return jsonResponse({ loggedOut: true });
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useAuthSession());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.status).toBe('loggedOut');
    expect(result.current.account).toBeNull();
  });

  it('surfaces a non-401 failure as a visible error instead of leaving status stuck on loading', async () => {
    globalThis.fetch = jest.fn(async () => jsonResponse({ error: 'boom' }, 500)) as unknown as typeof fetch;

    const { result } = renderHook(() => useAuthSession());
    await waitFor(() => expect(result.current.error).toBe('boom'));
    // 'loading' has no rendered error slot in App.tsx — must land somewhere the message is shown.
    expect(result.current.status).toBe('loggedOut');
  });
});
