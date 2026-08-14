import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import SaveAsSnippetButton from './SaveAsSnippetButton.js';
import { invalidateAccountActorCache } from '../auth/accountActor.js';
import { setStoredToken } from '../../api/client.js';

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, statusText: 'x', json: async () => body }) as unknown as Response;

describe('SaveAsSnippetButton (Phase G)', () => {
  afterEach(() => {
    setStoredToken('');
    invalidateAccountActorCache();
    jest.restoreAllMocks();
  });

  it('renders nothing for a non-account actor (master/key/anonymous)', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/roles/me')) return json({ kind: 'master', localTier: null, globalRole: null });
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    render(<SaveAsSnippetButton kind="room" data={{ vnum: 1 }} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Save as snippet' })).toBeNull();
  });

  it('saves a new snippet for an account actor', async () => {
    let saved: unknown[] = [];
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/roles/me')) return json({ kind: 'account', localTier: 'user', globalRole: 'user' });
      if (url.endsWith('/api/snippets') && (!init?.method || init.method === 'GET')) return json({ snippets: [] });
      if (url.endsWith('/api/snippets') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { snippets: unknown[] };
        saved = body.snippets;
        return json({ snippets: saved });
      }
      throw new Error(`unexpected fetch ${url} ${init?.method ?? 'GET'}`);
    }) as unknown as typeof fetch;
    jest.spyOn(window, 'prompt').mockReturnValue('My cozy room');

    render(<SaveAsSnippetButton kind="room" data={{ vnum: 42, name: 'Cave' }} />);
    const button = await screen.findByRole('button', { name: 'Save as snippet' });
    fireEvent.click(button);

    await waitFor(() => expect(saved).toHaveLength(1));
    expect((saved[0] as { name: string }).name).toBe('My cozy room');
    expect((saved[0] as { kind: string }).kind).toBe('room');
    expect(await screen.findByText(/saved snippet "My cozy room"/)).toBeTruthy();
  });

  it('does nothing when the prompt is cancelled', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/roles/me')) return json({ kind: 'account', localTier: 'user', globalRole: 'user' });
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
    jest.spyOn(window, 'prompt').mockReturnValue(null);

    render(<SaveAsSnippetButton kind="mob" data={{ vnum: 1 }} />);
    const button = await screen.findByRole('button', { name: 'Save as snippet' });
    fireEvent.click(button);

    // No /api/snippets calls should ever fire — only the initial /api/roles/me probe.
    await new Promise((r) => setTimeout(r, 10));
    expect((globalThis.fetch as jest.Mock).mock.calls.every(([u]: [string]) => !String(u).includes('/api/snippets'))).toBe(true);
  });
});
