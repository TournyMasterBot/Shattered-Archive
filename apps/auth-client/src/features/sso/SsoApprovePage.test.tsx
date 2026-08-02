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

/**
 * Responds to GET /api/sso/validate with `verdict`, and to everything else (i.e. the
 * POST to /api/sso/approve) with `approve`.
 *
 * The page validates the hand-off with the server before rendering anything clickable,
 * so every test that reaches a button has to satisfy that call first.
 */
function mockFetch(verdict: 'ok' | 'reject', approve?: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = jest.fn(async (url: string) => {
    if (String(url).startsWith('/api/sso/validate')) {
      return verdict === 'ok'
        ? ({ ok: true, status: 200, statusText: 'OK', json: async () => ({ ok: true }) } as unknown as Response)
        : ({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            json: async () => ({ error: 'unknown service or unregistered redirect URI' }),
          } as unknown as Response);
    }
    return approve as unknown as Response;
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

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

  describe('unsanctioned hand-offs are refused before anything can navigate', () => {
    // The attack this closes: both buttons navigate to redirectUri, and Cancel used to do
    // so with no server involvement — making this origin an open redirect to any URL in
    // the query string, on the domain users are told to trust with their password.
    it('renders the dead-end card, with NO buttons, when the server rejects the pair', async () => {
      mockFetch('reject');
      renderPage({ ...REQUEST, redirectUri: 'https://evil.example/steal' });

      expect(await screen.findByText('Invalid sign-in link')).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();
      expect(navigated).toEqual([]);
    });

    it('shows nothing clickable while validation is still in flight', () => {
      mockFetch('ok');
      renderPage(REQUEST);
      // Pre-resolution: no button exists yet, so there is no window in which a user could
      // be redirected to an as-yet-unvalidated target.
      expect(screen.queryByRole('button')).toBeNull();
      expect(navigated).toEqual([]);
    });

    it('treats a validation network failure as NOT sanctioned (fails closed)', async () => {
      globalThis.fetch = jest.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch;

      renderPage(REQUEST);
      expect(await screen.findByText('Invalid sign-in link')).toBeTruthy();
      expect(navigated).toEqual([]);
    });

    it('validates using the service and redirect URI from the request', async () => {
      const fetchMock = mockFetch('ok');
      renderPage(REQUEST);
      await screen.findByRole('button', { name: 'Continue as alice' });

      const calledUrl = String((fetchMock.mock.calls[0] as [string])[0]);
      expect(calledUrl).toContain('/api/sso/validate');
      expect(calledUrl).toContain(`service=${encodeURIComponent(REQUEST.service)}`);
      expect(calledUrl).toContain(`redirect_uri=${encodeURIComponent(REQUEST.redirectUri)}`);
    });
  });

  it('approve mints a code and redirects with code + passed-through state, preserving existing query params', async () => {
    const fetchMock = mockFetch('ok', {
      ok: true,
      status: 201,
      statusText: 'Created',
      json: async () => ({ code: 'one-time-code-xyz' }),
    });

    renderPage(REQUEST);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue as alice' }));

    await waitFor(() => expect(navigated).toHaveLength(1));
    const url = new URL(navigated[0]);
    expect(url.origin + url.pathname).toBe('https://consumer.example/auth/callback');
    expect(url.searchParams.get('app')).toBe('games'); // pre-existing param preserved
    expect(url.searchParams.get('code')).toBe('one-time-code-xyz');
    expect(url.searchParams.get('state')).toBe('opaque-csrf-123');

    const approveCall = fetchMock.mock.calls.find((c) => String((c as [string])[0]) === '/api/sso/approve') as
      | [string, RequestInit]
      | undefined;
    expect(approveCall).toBeDefined();
    expect(JSON.parse(String(approveCall![1].body))).toEqual({ service: 'consumer-service', redirectUri: REQUEST.redirectUri });
  });

  it('deny redirects with error=access_denied and the state, without calling approve', async () => {
    const fetchMock = mockFetch('ok');
    renderPage(REQUEST);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    // Deny still mints nothing — but it only reaches this point at all because the
    // hand-off was validated first, which is what stops it being an open redirect.
    expect(fetchMock.mock.calls.some((c) => String((c as [string])[0]) === '/api/sso/approve')).toBe(false);
    const url = new URL(navigated[0]);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('code')).toBeNull();
    expect(url.searchParams.get('state')).toBe('opaque-csrf-123');
  });

  it('an approve failure shows the error and does NOT redirect', async () => {
    mockFetch('ok', {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: 'unknown service or unregistered redirect URI' }),
    });

    renderPage(REQUEST);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue as alice' }));

    expect(await screen.findByText('unknown service or unregistered redirect URI')).toBeTruthy();
    expect(navigated).toEqual([]);
  });
});
