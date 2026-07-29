import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import AdminPage from './AdminPage.js';

type UserRow = {
  id: string;
  username: string;
  globalRole: string;
  createdAt: string;
  mustChangePassword: boolean;
  emailOnFile: boolean;
  emailVerified: boolean;
  counts: Record<string, number>;
  manageable: boolean;
};

const row = (over: Partial<UserRow>): UserRow => ({
  id: 'u1',
  username: 'someone',
  globalRole: 'user',
  createdAt: '2026-07-01T00:00:00Z',
  mustChangePassword: false,
  emailOnFile: false,
  emailVerified: false,
  counts: { api: 0, session: 1, sso: 0, obo: 0 },
  manageable: true,
  ...over,
});

describe('AdminPage', () => {
  let users: UserRow[];
  let roleCalls: { id: string; role: string }[];
  let tempCalls: string[];

  beforeEach(() => {
    users = [
      row({ id: 'u1', username: 'plainkid', manageable: true }),
      row({ id: 'u2', username: 'bigadmin', globalRole: 'admin', manageable: false }),
    ];
    roleCalls = [];
    tempCalls = [];
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        ({ ok: status < 400, status, statusText: 'x', json: async () => body }) as unknown as Response;

      if (url.startsWith('/api/admin/users?')) {
        const query = new URL(`http://x${url.slice(url.indexOf('/api'))}`).searchParams.get('query') ?? '';
        const matched = users.filter((u) => u.username.includes(query));
        return json({ users: matched, total: matched.length, assignableTiers: ['moderator', 'user'] });
      }
      if (url.endsWith('/role') && init?.method === 'POST') {
        const id = url.split('/')[4];
        const { role } = JSON.parse(String(init.body)) as { role: string };
        roleCalls.push({ id, role });
        users = users.map((u) => (u.id === id ? { ...u, globalRole: role } : u));
        return json({ id, username: 'plainkid', globalRole: role });
      }
      if (url.endsWith('/temp-password') && init?.method === 'POST') {
        tempCalls.push(url.split('/')[4]);
        return json({ id: 'u1', username: 'plainkid', temporaryPassword: 'one-time-secret', note: 'shown once' });
      }
      if (url.endsWith('/api/admin/services')) {
        return json({
          services: [
            { serviceName: 'mud-builder-server', activeKeys: 2, redirectUris: [] },
            { serviceName: 'mystery-service', activeKeys: 1, redirectUris: ['https://m.example/cb'] },
          ],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lists users; unmanageable rows get no controls', async () => {
    render(<AdminPage />);
    expect(await screen.findByText('plainkid')).toBeTruthy();
    expect(screen.getByText('bigadmin')).toBeTruthy();
    expect(screen.getByLabelText('Set role for plainkid')).toBeTruthy();
    expect(screen.queryByLabelText('Set role for bigadmin')).toBeNull();
  });

  it('the role select only offers the server-provided assignable tiers (plus current)', async () => {
    render(<AdminPage />);
    const select = (await screen.findByLabelText('Set role for plainkid')) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(['user', 'moderator']); // no admin/owner offered
  });

  it('changing a role confirms, posts, and reloads', async () => {
    render(<AdminPage />);
    const select = await screen.findByLabelText('Set role for plainkid');
    fireEvent.change(select, { target: { value: 'moderator' } });
    await waitFor(() => expect(roleCalls).toEqual([{ id: 'u1', role: 'moderator' }]));
    expect(window.confirm).toHaveBeenCalled();
    await screen.findByText('moderator');
  });

  it('temp-password shows the one-time password exactly once', async () => {
    render(<AdminPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Temp password' }));
    const shown = (await screen.findByLabelText('One-time password')) as HTMLInputElement;
    expect(shown.value).toBe('one-time-secret');
    expect(tempCalls).toEqual(['u1']);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByLabelText('One-time password')).toBeNull();
  });

  it('search narrows the list via the query param', async () => {
    render(<AdminPage />);
    await screen.findByText('plainkid');
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'bigadmin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.queryByText('plainkid')).toBeNull());
    expect(screen.getByText('bigadmin')).toBeTruthy();
  });

  it('the delegation surface links out only for known services', async () => {
    render(<AdminPage />);
    expect(await screen.findByText('mud-builder-server')).toBeTruthy();
    const links = screen.getAllByRole('link', { name: 'Manage on site →' });
    expect(links).toHaveLength(1);
    expect((links[0] as HTMLAnchorElement).href).toBe('https://build.shatteredarchive.dev/');
    expect(screen.getByText('mystery-service')).toBeTruthy(); // listed, just link-less
  });
});
