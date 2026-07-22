import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import KeysPage from './KeysPage.js';

/** Mirrors mud-builder-client's AccessPage.test.tsx key-lifecycle coverage: list, create with show-once token, rotate, revoke. */
describe('KeysPage', () => {
  let keys: { id: string; service: string; label: string; createdAt: string; expiresAt?: string | null; revokedAt?: string }[];
  let deleted: string[];

  beforeEach(() => {
    keys = [{ id: 'k1', service: 'mud-builder-server', label: 'laptop', createdAt: '2026-07-16T00:00:00Z', expiresAt: null }];
    deleted = [];
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        ({ ok: status < 400, status, statusText: 'x', json: async () => body }) as unknown as Response;

      if (url.endsWith('/api/keys') && (!init?.method || init.method === 'GET')) {
        return json({ keys });
      }
      if (url.endsWith('/api/keys') && init?.method === 'POST') {
        const { service, label } = JSON.parse(String(init.body)) as { service: string; label: string };
        keys = [...keys, { id: 'k2', service, label, createdAt: '2026-07-16T12:00:00Z', expiresAt: null }];
        return json({ id: 'k2', service, label, token: 'fresh-secret-token', note: 'shown once' }, 201);
      }
      if (url.endsWith('/api/keys/k1/rotate') && init?.method === 'POST') {
        return json({ id: 'k1', token: 'rotated-secret-token', note: 'shown once' });
      }
      if (url.endsWith('/api/keys/k1') && init?.method === 'DELETE') {
        deleted.push('k1');
        keys = keys.map((k) => (k.id === 'k1' ? { ...k, revokedAt: '2026-07-16T13:00:00Z' } : k));
        return json({ id: 'k1', service: 'mud-builder-server', label: 'laptop', revoked: true });
      }
      throw new Error(`unexpected fetch ${url} ${init?.method ?? 'GET'}`);
    }) as unknown as typeof fetch;
  });

  it('lists existing keys', async () => {
    render(<KeysPage />);
    expect(await screen.findByText('laptop')).toBeTruthy();
    expect(screen.getByText('(mud-builder-server)')).toBeTruthy();
  });

  it('creates a key and shows its token exactly once', async () => {
    render(<KeysPage />);
    await screen.findByText('laptop');

    fireEvent.change(screen.getByPlaceholderText('e.g. mud-builder-server'), { target: { value: 'game-server' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. laptop, ci driver'), { target: { value: 'ci driver' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));

    const issued = (await screen.findByLabelText('Issued token')) as HTMLInputElement;
    expect(issued.value).toBe('fresh-secret-token');
    expect(await screen.findByText('ci driver')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByLabelText('Issued token')).toBeNull();
  });

  it('rotates and revokes keys behind confirms', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<KeysPage />);
    await screen.findByText('laptop');

    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    const issued = (await screen.findByLabelText('Issued token')) as HTMLInputElement;
    expect(issued.value).toBe('rotated-secret-token');

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(deleted).toEqual(['k1']));
    expect(await screen.findByText(/revoked 2026-07-16/)).toBeTruthy();
  });

  it('does not rotate/revoke when the confirm is dismissed', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<KeysPage />);
    await screen.findByText('laptop');

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(deleted).toEqual([]);
  });
});
