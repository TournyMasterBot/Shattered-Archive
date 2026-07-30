import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import DevicesPanel from './DevicesPanel.js';

type Row = {
  id: string;
  label: string;
  allowedServices: string[];
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string;
};

/**
 * Covers the panel's whole job: show what is bound, make revoking possible, and never revoke
 * by accident. The confirm-dismissed cases are here for the same reason KeysPage has them —
 * revocation is not undoable (a device must enrol again), so a stray click must cost nothing.
 */
describe('DevicesPanel', () => {
  let devices: Row[];
  let revoked: string[];
  let revokedAll: number;

  beforeEach(() => {
    devices = [
      {
        id: 'd1',
        label: 'Chrome on Windows',
        allowedServices: ['mud-builder-server'],
        createdAt: '2026-07-20T00:00:00Z',
        lastSeenAt: '2026-07-29T09:00:00Z',
      },
      {
        id: 'd2',
        label: 'Firefox on Linux',
        allowedServices: ['kingdom-tactics-server'],
        createdAt: '2026-07-10T00:00:00Z',
        lastSeenAt: '2026-07-11T00:00:00Z',
        revokedAt: '2026-07-12T00:00:00Z',
      },
    ];
    revoked = [];
    revokedAll = 0;

    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        ({ ok: status < 400, status, statusText: 'x', json: async () => body }) as unknown as Response;

      // Trailing slash matches the real call — see client.ts's listDevices for why it is there.
      if (url.endsWith('/api/device/') && (!init?.method || init.method === 'GET')) {
        return json({ devices });
      }
      if (url.endsWith('/api/device/d1/revoke') && init?.method === 'POST') {
        revoked.push('d1');
        devices = devices.map((d) => (d.id === 'd1' ? { ...d, revokedAt: '2026-07-30T00:00:00Z' } : d));
        return json({ deviceId: 'd1', revoked: true });
      }
      if (url.endsWith('/api/device/revoke-all') && init?.method === 'POST') {
        revokedAll = devices.filter((d) => !d.revokedAt).length;
        devices = devices.map((d) => (d.revokedAt ? d : { ...d, revokedAt: '2026-07-30T00:00:00Z' }));
        return json({ revoked: revokedAll });
      }
      throw new Error(`unexpected fetch ${url} ${init?.method ?? 'GET'}`);
    }) as unknown as typeof fetch;
  });

  it('lists active devices with their audience and dates', async () => {
    render(<DevicesPanel />);
    expect(await screen.findByText('Chrome on Windows')).toBeTruthy();
    expect(screen.getByText('(mud-builder-server)')).toBeTruthy();
    expect(screen.getByText(/enrolled 2026-07-20 · last used 2026-07-29/)).toBeTruthy();
  });

  it('keeps revoked devices collapsed until asked for', async () => {
    render(<DevicesPanel />);
    await screen.findByText('Chrome on Windows');

    expect(screen.queryByText('Firefox on Linux')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show revoked (1)' }));
    expect(screen.getByText('Firefox on Linux')).toBeTruthy();
    expect(screen.getByText(/revoked 2026-07-12/)).toBeTruthy();
  });

  it('revokes a single device behind a confirm and reloads', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DevicesPanel />);
    await screen.findByText('Chrome on Windows');

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(revoked).toEqual(['d1']));
    // Now revoked, so it leaves the active list rather than lingering with a dead button.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Show revoked (2)' })).toBeTruthy();
  });

  it('revokes every device behind a confirm', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DevicesPanel />);
    await screen.findByText('Chrome on Windows');

    fireEvent.click(screen.getByRole('button', { name: 'Revoke all devices' }));
    await waitFor(() => expect(revokedAll).toBe(1));
    expect(await screen.findByText('No devices enrolled.')).toBeTruthy();
  });

  it('does not revoke when the confirm is dismissed', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<DevicesPanel />);
    await screen.findByText('Chrome on Windows');

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke all devices' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(revoked).toEqual([]);
    expect(revokedAll).toBe(0);
  });

  it('offers no revoke-all button when nothing is enrolled', async () => {
    devices = [];
    render(<DevicesPanel />);
    expect(await screen.findByText('No devices enrolled.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revoke all devices' })).toBeNull();
  });

  it('surfaces a load failure instead of rendering an empty list as success', async () => {
    globalThis.fetch = jest.fn(
      async () =>
        ({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ error: 'not signed in' }),
        }) as unknown as Response,
    ) as unknown as typeof fetch;

    render(<DevicesPanel />);
    expect(await screen.findByText('not signed in')).toBeTruthy();
  });
});
