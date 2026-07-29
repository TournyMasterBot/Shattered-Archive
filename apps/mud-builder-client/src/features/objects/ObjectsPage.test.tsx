import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { parseAreaFile } from '@shatteredarchive/merc-area';

import ObjectsPage from './ObjectsPage.js';

const AREA_TEXT = `#AREA
tiny.are~
Tiny~
{ 1 50} Test  Tiny~
100 199

#OBJECTS
#3100
a test sword~
a test sword~
A test sword lies here.~
steel~
weapon A AN
sword 1 6 slash 0
5 10 100 P
#3200
a rusty key~
a rusty key~
A rusty key lies here.~
iron~
weapon A AN
sword 1 6 slash 0
5 10 100 P
#3300
a lone gem~
a lone gem~
A lone gem lies here.~
glass~
weapon A AN
sword 1 6 slash 0
5 10 100 P
#0

#ROOMS
#100
The Test Room~
A perfectly ordinary test room.
~
0 0 1
D0
~
~
0 3200 101
S
#101
The Back Room~
Another test room.
~
0 0 1
S
#0

#RESETS
O 0 3100 0 100
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
  render(<ObjectsPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));
  await screen.findByRole('button', { name: '#3100 a test sword' });
}

describe('ObjectsPage', () => {
  beforeEach(mockFetch);

  it('lists objects', async () => {
    await openArea();
    expect(screen.getByRole('button', { name: '#3200 a rusty key' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '#3300 a lone gem' })).toBeTruthy();
  });

  it('blocks delete when a reset still references the object (Resets category)', async () => {
    const onGoToResets = jest.fn();
    render(<ObjectsPage onGoToResets={onGoToResets} />);
    fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));
    fireEvent.click(await screen.findByRole('button', { name: '#3100 a test sword' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete object #3100' }));
    expect(await screen.findByText(/Cannot delete object #3100/)).toBeTruthy();
    expect(screen.getByText('Resets')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Go fix it in Resets →' }));
    expect(onGoToResets).toHaveBeenCalledTimes(1);
  });

  it('blocks delete when a room exit key still references the object (Map category)', async () => {
    const onGoToMap = jest.fn();
    render(<ObjectsPage onGoToMap={onGoToMap} />);
    fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));
    fireEvent.click(await screen.findByRole('button', { name: '#3200 a rusty key' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete object #3200' }));
    expect(await screen.findByText(/Cannot delete object #3200/)).toBeTruthy();
    expect(screen.getByText('Map (room exits)')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Go fix it on the Map →' }));
    expect(onGoToMap).toHaveBeenCalledTimes(1);
  });

  it('deletes an unreferenced object after confirm', async () => {
    window.confirm = jest.fn(() => true);
    await openArea();
    fireEvent.click(screen.getByRole('button', { name: '#3300 a lone gem' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete object #3300' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '#3300 a lone gem' })).toBeNull());
    expect(screen.getByText('removed object #3300')).toBeTruthy();
  });

  it('switching objects clears a blocked-delete panel', async () => {
    await openArea();
    fireEvent.click(screen.getByRole('button', { name: '#3100 a test sword' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete object #3100' }));
    await screen.findByText(/Cannot delete object #3100/);

    fireEvent.click(screen.getByRole('button', { name: '#3300 a lone gem' }));
    expect(screen.queryByText(/Cannot delete object #3100/)).toBeNull();
  });
});
