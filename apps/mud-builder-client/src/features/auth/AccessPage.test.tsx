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
    fireEvent.click(screen.getByRole('button', { name: 'Save token' }));

    expect(await screen.findByText(/Master key accepted/)).toBeTruthy();
    expect(screen.getByText('laptop')).toBeTruthy();
    expect(localStorage.getItem('mb-token')).toBe(MASTER);
  });

  it('reports an API key as save-capable without key management', async () => {
    setStoredToken(API_KEY);
    render(<AccessPage />);
    expect(await screen.findByText(/Token accepted \(API key\)/)).toBeTruthy();
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

    const issued = (await screen.findByLabelText('Issued token')) as HTMLInputElement;
    expect(issued.value).toBe('fresh-secret-token');
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
    expect(issued.value).toBe('rotated-secret-token');

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
    await screen.findByText(/Token accepted \(API key\)/);
    expect(screen.queryByText('Audit log')).toBeNull();
  });
});
