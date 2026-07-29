import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import SsoApprovePage, { parseSsoRequest, type SsoRequest } from './SsoApprovePage.js';

const REQUEST: SsoRequest = {
  service: 'consumer-service',
  redirectUri: 'https://consumer.example/auth/callback?app=games',
  state: 'opaque-csrf-123',
};

describe('parseSsoRequest', () => {
  it('parses service, redirect_uri, and optional state', () => {
    expect(parseSsoRequest('?service=svc&redirect_uri=https%3A%2F%2Fa.example%2Fcb&state=xyz')).toEqual({
      service: 'svc',
      redirectUri: 'https://a.example/cb',
      state: 'xyz',
    });
    expect(parseSsoRequest('?service=svc&redirect_uri=https%3A%2F%2Fa.example%2Fcb')).toEqual({
      service: 'svc',
      redirectUri: 'https://a.example/cb',
      state: null,
    });
  });

  it('returns null for missing params or a non-absolute redirect URI', () => {
    expect(parseSsoRequest('?service=svc')).toBeNull();
    expect(parseSsoRequest('?redirect_uri=https%3A%2F%2Fa.example%2Fcb')).toBeNull();
    expect(parseSsoRequest('?service=svc&redirect_uri=%2Frelative%2Fpath')).toBeNull();
  });
});

describe('SsoApprovePage', () => {
  let navigated: string[];

  beforeEach(() => {
    navigated = [];
  });

  function renderPage(request: SsoRequest | null): void {
    render(<SsoApprovePage request={request} username="alice" navigate={(url) => navigated.push(url)} />);
  }

  it('a malformed request renders the error card and never redirects', () => {
    renderPage(null);
    expect(screen.getByText('Invalid sign-in link')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(navigated).toEqual([]);
  });

  it('approve mints a code and redirects with code + passed-through state, preserving existing query params', async () => {
    globalThis.fetch = jest.fn(async () =>
      ({ ok: true, status: 201, statusText: 'Created', json: async () => ({ code: 'one-time-code-xyz' }) }) as unknown as Response,
    ) as unknown as typeof fetch;

    renderPage(REQUEST);
    fireEvent.click(screen.getByRole('button', { name: 'Continue as alice' }));

    await waitFor(() => expect(navigated).toHaveLength(1));
    const url = new URL(navigated[0]);
    expect(url.origin + url.pathname).toBe('https://consumer.example/auth/callback');
    expect(url.searchParams.get('app')).toBe('games'); // pre-existing param preserved
    expect(url.searchParams.get('code')).toBe('one-time-code-xyz');
    expect(url.searchParams.get('state')).toBe('opaque-csrf-123');

    const [calledUrl, init] = (globalThis.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('/api/sso/approve');
    expect(JSON.parse(String(init.body))).toEqual({ service: 'consumer-service', redirectUri: REQUEST.redirectUri });
  });

  it('deny redirects with error=access_denied and the state, without calling the API', () => {
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
    renderPage(REQUEST);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(globalThis.fetch).not.toHaveBeenCalled();
    const url = new URL(navigated[0]);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('code')).toBeNull();
    expect(url.searchParams.get('state')).toBe('opaque-csrf-123');
  });

  it('an API failure shows the error and does NOT redirect', async () => {
    globalThis.fetch = jest.fn(async () =>
      ({ ok: false, status: 400, statusText: 'Bad Request', json: async () => ({ error: 'unknown service or unregistered redirect URI' }) }) as unknown as Response,
    ) as unknown as typeof fetch;

    renderPage(REQUEST);
    fireEvent.click(screen.getByRole('button', { name: 'Continue as alice' }));

    expect(await screen.findByText('unknown service or unregistered redirect URI')).toBeTruthy();
    expect(navigated).toEqual([]);
  });
});
