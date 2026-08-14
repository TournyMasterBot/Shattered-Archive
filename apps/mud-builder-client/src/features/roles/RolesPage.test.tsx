import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import RolesPage from './RolesPage.js';
import { setStoredToken } from '../../api/client.js';

/** Roles tab (Phase G): own-standing card always, management table only when GET /api/roles succeeds. */
describe('RolesPage (Phase G)', () => {
  const json = (body: unknown, status = 200) =>
    ({ ok: status < 400, status, statusText: 'x', json: async () => body }) as unknown as Response;

  afterEach(() => {
    setStoredToken('');
  });

  it('shows plain-user standing with no management table when /api/roles 403s', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/roles/me')) return json({ kind: 'account', localTier: 'user', globalRole: 'user' });
      if (url.endsWith('/api/roles')) return json({ error: 'managing roles requires hub owner/admin standing or a local admin-tier grant' }, 403);
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    render(<RolesPage />);
    expect(await screen.findByText(/Local tier:/)).toBeTruthy();
    expect(screen.getByText('user')).toBeTruthy();
    expect(screen.queryByText('Manage grants')).toBeNull();
  });

  it('shows master standing plainly, with no localTier/globalRole line', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/roles/me')) return json({ kind: 'master', localTier: null, globalRole: null });
      if (url.endsWith('/api/roles')) return json({ grants: [] });
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    render(<RolesPage />);
    expect(await screen.findByText(/every action in this app is available/)).toBeTruthy();
  });

  it('lists existing grants and the tier select never offers owner', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/roles/me')) return json({ kind: 'master', localTier: null, globalRole: null });
      if (url.endsWith('/api/roles')) {
        return json({
          grants: [{ accountId: 'acct1', username: 'someone', tier: 'admin', grantedBy: 'master', grantedAt: '2026-07-28T00:00:00Z' }],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    render(<RolesPage />);
    expect(await screen.findByText('someone')).toBeTruthy();
    expect(screen.getByText(/acct1/)).toBeTruthy();

    const select = screen.getByLabelText('Tier to grant') as HTMLSelectElement;
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['admin', 'manager', 'trusted', 'user']);
    expect(options).not.toContain('owner');
  });

  it('grants a role and refreshes the list', async () => {
    let grants: { accountId: string; username: string; tier: string; grantedBy: string; grantedAt: string }[] = [];
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/roles/me')) return json({ kind: 'master', localTier: null, globalRole: null });
      if (url.endsWith('/api/roles') && (!init?.method || init.method === 'GET')) return json({ grants });
      if (url.endsWith('/api/roles/acct2') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { tier: string; username?: string };
        const grant = { accountId: 'acct2', username: body.username ?? 'acct2', tier: body.tier, grantedBy: 'master', grantedAt: '2026-07-28T00:00:00Z' };
        grants = [...grants, grant];
        return json({ grant });
      }
      throw new Error(`unexpected fetch ${url} ${init?.method ?? 'GET'}`);
    }) as unknown as typeof fetch;

    render(<RolesPage />);
    await screen.findByText('No grants yet.');

    fireEvent.change(screen.getByLabelText('Account ID to grant'), { target: { value: 'acct2' } });
    fireEvent.change(screen.getByLabelText('Username label'), { target: { value: 'newbuilder' } });
    fireEvent.change(screen.getByLabelText('Tier to grant'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Grant' }));

    await waitFor(() => expect(screen.getByText('newbuilder')).toBeTruthy());
    expect(screen.getByText(/granted "admin" to acct2/)).toBeTruthy();
  });
});
