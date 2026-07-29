import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import EnginePage from './EnginePage.js';
import { setStoredToken } from '../../api/client.js';

/** Engine tab (Phase 15): rebuild trigger + status polling. */

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, statusText: 'x', json: async () => body } as unknown as Response;
}

describe('EnginePage (Phase 15)', () => {
  beforeEach(() => {
    setStoredToken('the-master-key');
  });

  afterEach(() => {
    setStoredToken('');
    jest.useRealTimers();
  });

  it('shows a plain message when the feature is not enabled on this deployment', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/capabilities')) {
        return jsonResponse({ writeEnabled: true, tokenRequired: true, mercAreaPath: '/mud/area', rebuildEnabled: false });
      }
      if (url.endsWith('/api/rebuild/status')) return jsonResponse({ status: null, canTrigger: false });
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    render(<EnginePage />);
    expect(await screen.findByText(/does not have the engine-rebuild feature enabled/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rebuild engine' })).toBeNull();
  });

  it('shows "no permission" instead of a button when canTrigger is false', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/capabilities')) {
        return jsonResponse({ writeEnabled: true, tokenRequired: true, mercAreaPath: '/mud/area', rebuildEnabled: true });
      }
      if (url.endsWith('/api/rebuild/status')) return jsonResponse({ status: null, canTrigger: false });
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    render(<EnginePage />);
    expect(await screen.findByText(/do not have permission to trigger a rebuild/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rebuild engine' })).toBeNull();
  });

  it('triggers a rebuild after confirmation, and shows the resulting status', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    let triggered = false;
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/capabilities')) {
        return jsonResponse({ writeEnabled: true, tokenRequired: true, mercAreaPath: '/mud/area', rebuildEnabled: true });
      }
      if (url.endsWith('/api/rebuild') && init?.method === 'POST') {
        triggered = true;
        return jsonResponse({ note: 'rebuild started' }, 202);
      }
      if (url.endsWith('/api/rebuild/status')) {
        if (!triggered) return jsonResponse({ status: null, canTrigger: true });
        return jsonResponse({
          status: {
            phase: 'building-mercmud24',
            actor: 'master',
            startedAt: '2026-07-25T00:00:00Z',
            updatedAt: '2026-07-25T00:00:00Z',
            log: ['rebuild started by master'],
          },
          canTrigger: true,
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    render(<EnginePage />);
    const button = await screen.findByRole('button', { name: 'Rebuild engine' });
    fireEvent.click(button);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/recompiles and restarts the LIVE game server/));
    expect(await screen.findByText(/Building the game engine/)).toBeTruthy();
    expect(screen.getByText('rebuild started by master')).toBeTruthy();
  });

  it('does not call the API when the confirm dialog is declined', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    const calls: string[] = [];
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/api/capabilities')) {
        return jsonResponse({ writeEnabled: true, tokenRequired: true, mercAreaPath: '/mud/area', rebuildEnabled: true });
      }
      if (url.endsWith('/api/rebuild/status')) return jsonResponse({ status: null, canTrigger: true });
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    render(<EnginePage />);
    const button = await screen.findByRole('button', { name: 'Rebuild engine' });
    fireEvent.click(button);

    await waitFor(() => expect(calls.some((c) => c.includes('/api/capabilities'))).toBe(true));
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false);
  });

  it('a failed poll shows a reconnecting banner and KEEPS the last known status, never "failed"', async () => {
    jest.useFakeTimers();
    let pollCount = 0;
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/capabilities')) {
        return jsonResponse({ writeEnabled: true, tokenRequired: true, mercAreaPath: '/mud/area', rebuildEnabled: true });
      }
      if (url.endsWith('/api/rebuild/status')) {
        pollCount += 1;
        if (pollCount === 1) {
          return jsonResponse({
            status: {
              phase: 'handing-off-to-helper',
              actor: 'master',
              startedAt: '2026-07-25T00:00:00Z',
              updatedAt: '2026-07-25T00:00:00Z',
              log: ['builder images built; handing off to an ephemeral helper for the final recreate'],
            },
            canTrigger: true,
          });
        }
        // Simulate the container being recreated mid-poll: the fetch itself rejects.
        throw new Error('network error: connection refused');
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    render(<EnginePage />);
    expect(await screen.findByText(/handing off to an ephemeral helper/)).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    // Still showing the in-progress status, not "failed" — and a reconnecting banner appeared.
    expect(screen.getByText(/handing off to an ephemeral helper/)).toBeTruthy();
    expect(screen.queryByText(/^Failed$/)).toBeNull();
    expect(await screen.findByText(/Reconnecting to the builder service/)).toBeTruthy();
  });
});
