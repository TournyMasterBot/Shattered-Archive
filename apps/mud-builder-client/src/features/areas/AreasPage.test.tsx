import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { parseAreaFile } from '@shatteredarchive/merc-area';

import AreasPage from './AreasPage.js';

/**
 * Phase 11: conditional saves (baseHash → 409 conflict panel with reload /
 * save-anyway paths) and advisory presence (sidebar badge + in-editor banner).
 */

const TINY_AREA = `#AREA
tiny.are~
Tiny~
{ 1 50} Test  Tiny~
100 199

#MOBILES
#0

#OBJECTS
#0

#ROOMS
#100
The Test Room~
A perfectly ordinary test room.
~
0 0 1
S
#0

#RESETS
S

#SHOPS
0

#SPECIALS
S

#$
`;

describe('AreasPage conflict + presence (Phase 11)', () => {
  let puts: { baseHash?: string }[];
  let getAreaCalls: number;
  let putResponses: { status: number; body: unknown }[];

  beforeEach(() => {
    puts = [];
    getAreaCalls = 0;
    putResponses = [];
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const json = (body: unknown, status = 200) =>
        ({ ok: status < 400, status, statusText: 'x', json: async () => body }) as unknown as Response;

      if (url.endsWith('/api/capabilities')) return json({ writeEnabled: true, tokenRequired: false });
      if (url.endsWith('/api/areas') && method === 'GET') return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
      if (url.endsWith('/api/presence') && method === 'POST') return json({ ok: true, ttlSeconds: 60, name: 'master' });
      if (url.endsWith('/api/presence') && method === 'GET')
        return json({ entries: [{ file: 'tiny.are', name: 'kess', ageSeconds: 5 }], ttlSeconds: 60 });
      if (url.endsWith('/api/areas/tiny.are') && method === 'GET') {
        getAreaCalls += 1;
        return json({ file: 'tiny.are', area: parseAreaFile(TINY_AREA), baseHash: `hash-${getAreaCalls}` });
      }
      if (url.endsWith('/api/areas/tiny.are') && method === 'PUT') {
        puts.push(JSON.parse(String(init?.body)) as { baseHash?: string });
        const next = putResponses.shift() ?? { status: 200, body: { saved: true, backupPath: null, hash: 'hash-new' } };
        return json(next.body, next.status);
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const openTiny = async () => {
    render(<AreasPage />);
    fireEvent.click(await screen.findByRole('button', { name: /^Tiny/ }));
    await screen.findByRole('button', { name: 'Save' });
  };

  it('sends the loaded baseHash on save and stores the returned hash', async () => {
    await openTiny();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/saved tiny\.are/);
    expect(puts).toEqual([expect.objectContaining({ baseHash: 'hash-1' })]);

    // The next save uses the hash the server returned, not the stale load hash.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]).toEqual(expect.objectContaining({ baseHash: 'hash-new' }));
  });

  it('shows the conflict panel on 409; Save anyway resends WITHOUT baseHash', async () => {
    putResponses.push({ status: 409, body: { error: 'changed on disk', currentHash: 'other' } });
    await openTiny();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const panel = await screen.findByRole('alert', { name: 'Save conflict' });
    expect(panel.textContent).toContain('tiny.are changed on disk');

    fireEvent.click(screen.getByRole('button', { name: /Save anyway/ }));
    await screen.findByText(/saved tiny\.are over the conflicting version/);
    expect(puts).toHaveLength(2);
    expect(puts[0].baseHash).toBe('hash-1');
    expect(puts[1].baseHash).toBeUndefined();
    expect(screen.queryByRole('alert', { name: 'Save conflict' })).toBeNull();
  });

  it('conflict Reload refetches the area from disk and clears the panel', async () => {
    putResponses.push({ status: 409, body: { error: 'changed on disk', currentHash: 'other' } });
    await openTiny();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('alert', { name: 'Save conflict' });

    fireEvent.click(screen.getByRole('button', { name: /Reload from disk/ }));
    await screen.findByText(/reloaded tiny\.are from disk/);
    expect(getAreaCalls).toBe(2);
    expect(screen.queryByRole('alert', { name: 'Save conflict' })).toBeNull();

    // A save now carries the freshly loaded hash.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]).toEqual(expect.objectContaining({ baseHash: 'hash-2' }));
  });

  it('shows presence badges in the sidebar and a banner when someone else is on my file', async () => {
    await openTiny();
    // kess (another credential) is on tiny.are: sidebar badge + editor banner.
    await screen.findByRole('status', { name: 'Also editing' });
    expect(screen.getByText(/Also editing tiny\.are/).textContent).toContain('kess');
    expect(screen.getByTitle('Editing now: kess')).toBeTruthy();
  });
});
