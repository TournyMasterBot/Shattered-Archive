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

  /**
   * Live bug, 2026-08-16: a user granted their own USERNAME where an accountId belonged —
   * nothing in the UI showed them the real value to copy. Superseded same day by the grant
   * route itself moving to username resolution (see roles.ts), so this now verifies the
   * self-fill button uses `me.username`, matching what the form field actually wants.
   */
  it('shows your own username and lets you fill the grant form with it', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/roles/me')) {
        return json({ kind: 'account', localTier: 'user', globalRole: 'owner', accountId: 'abc123real', username: 'melchaleve' });
      }
      if (url.endsWith('/api/roles')) return json({ grants: [] });
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    render(<RolesPage />);
    expect(await screen.findByText('melchaleve')).toBeTruthy();

    fireEvent.click(screen.getByText('Use for a grant below'));
    const input = screen.getByLabelText('Username to grant') as HTMLInputElement;
    expect(input.value).toBe('melchaleve');
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

  it('grants a role by username and refreshes the list', async () => {
    let grants: { accountId: string; username: string; tier: string; grantedBy: string; grantedAt: string }[] = [];
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/roles/me')) return json({ kind: 'master', localTier: null, globalRole: null });
      if (url.endsWith('/api/roles') && (!init?.method || init.method === 'GET')) return json({ grants });
      if (url.endsWith('/api/roles') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { tier: string; username: string };
        // Server-side resolution is out of scope for this test — the fake just proves the
        // CLIENT sends {username, tier} to POST /api/roles with no accountId anywhere.
        const grant = { accountId: 'resolved-acct2', username: body.username, tier: body.tier, grantedBy: 'master', grantedAt: '2026-07-28T00:00:00Z' };
        grants = [...grants, grant];
        return json({ grant });
      }
      throw new Error(`unexpected fetch ${url} ${init?.method ?? 'GET'}`);
    }) as unknown as typeof fetch;

    render(<RolesPage />);
    await screen.findByText('No grants yet.');

    fireEvent.change(screen.getByLabelText('Username to grant'), { target: { value: 'newbuilder' } });
    fireEvent.change(screen.getByLabelText('Tier to grant'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Grant' }));

    await waitFor(() => expect(screen.getByText('newbuilder')).toBeTruthy());
    expect(screen.getByText(/granted "admin" to newbuilder/)).toBeTruthy();
  });

  it('a 404 (unknown username) surfaces as a toast, not a silent no-op', async () => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/roles/me')) return json({ kind: 'master', localTier: null, globalRole: null });
      if (url.endsWith('/api/roles') && (!init?.method || init.method === 'GET')) return json({ grants: [] });
      if (url.endsWith('/api/roles') && init?.method === 'POST') {
        return json({ error: 'no account found with username "nobody"' }, 404);
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    render(<RolesPage />);
    await screen.findByText('No grants yet.');

    fireEvent.change(screen.getByLabelText('Username to grant'), { target: { value: 'nobody' } });
    fireEvent.click(screen.getByRole('button', { name: 'Grant' }));

    expect(await screen.findByText(/grant failed/)).toBeTruthy();
  });
});
