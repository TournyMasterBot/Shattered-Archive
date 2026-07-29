import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { parseAreaFile } from '@shatteredarchive/merc-area';

import MobsPage from './MobsPage.js';

const AREA_TEXT = `#AREA
tiny.are~
Tiny~
{ 1 50} Test  Tiny~
100 199

#MOBILES
#3000
a test mob~
the test mob~
A test mob stands here.
~
It looks ordinary.
~
human~
A 0 0 0 1 0 1d1+1 1d1+1 1d1+1 slash 0 0 0 0 0 0 0 0 stand stand male 0 0 0 medium unknown
#3001
a lone mob~
the lone mob~
A lone mob stands here.
~
It looks ordinary.
~
human~
A 0 0 0 1 0 1d1+1 1d1+1 1d1+1 slash 0 0 0 0 0 0 0 0 stand stand male 0 0 0 medium unknown
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
M 0 3000 1 100 1
S

#$
`;

function mockFetch() {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    if (url.endsWith('/api/capabilities')) return json({ writeEnabled: true, tokenRequired: false });
    if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
    if (url.endsWith('/api/areas/tiny.are')) return json({ file: 'tiny.are', area: parseAreaFile(AREA_TEXT), baseHash: 'h1' });
    if (url.endsWith('/api/presence')) return json({ entries: [], ttlSeconds: 60 });
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
}

async function openArea() {
  render(<MobsPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));
  await screen.findByRole('button', { name: '#3000 the test mob' });
}

describe('MobsPage', () => {
  beforeEach(mockFetch);

  it('lists mobs and allocates the next free vnum (in the declared range) on add', async () => {
    await openArea();
    fireEvent.click(screen.getByRole('button', { name: '+ Add mob' }));
    // range is 100-199; 100 is taken by the room, so 101 is the first free vnum
    // (the existing mobs at 3000/3001 are outside the declared range entirely).
    expect(await screen.findByRole('button', { name: '#101 a new mob' })).toBeTruthy();
  });

  it('blocks delete when a reset still references the mob, via the categorized panel', async () => {
    const onGoToResets = jest.fn();
    render(<MobsPage onGoToResets={onGoToResets} />);
    fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));
    fireEvent.click(await screen.findByRole('button', { name: '#3000 the test mob' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete mob #3000' }));
    expect(await screen.findByText(/Cannot delete mob #3000/)).toBeTruthy();
    expect(screen.getByText('Resets')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Go fix it in Resets →' }));
    expect(onGoToResets).toHaveBeenCalledTimes(1);
  });

  it('deletes an unreferenced mob after confirm', async () => {
    window.confirm = jest.fn(() => true);
    await openArea();
    fireEvent.click(screen.getByRole('button', { name: '#3001 the lone mob' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete mob #3001' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '#3001 the lone mob' })).toBeNull());
    expect(screen.getByText('removed mob #3001')).toBeTruthy();
  });

  it('switching mobs clears a blocked-delete panel', async () => {
    await openArea();
    fireEvent.click(screen.getByRole('button', { name: '#3000 the test mob' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete mob #3000' }));
    await screen.findByText(/Cannot delete mob #3000/);

    fireEvent.click(screen.getByRole('button', { name: '#3001 the lone mob' }));
    expect(screen.queryByText(/Cannot delete mob #3000/)).toBeNull();
  });
});
