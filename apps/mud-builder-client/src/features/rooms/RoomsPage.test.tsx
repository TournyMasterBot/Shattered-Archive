import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import RoomsPage from './RoomsPage.js';
import type { ExternalRef } from '../../api/client.js';

const TINY_AREA_TEXT = `#AREA
tiny.are~
Tiny~
{ 1 50} Test  Tiny~
100 199

#ROOMS
#100
The Test Room~
A perfectly ordinary test room.
~
0 0 1
D0
~
~
0 0 101
S
#101
The Back Room~
Another test room.
~
0 0 1
S
#0

#$
`;

const SECOND_AREA_TEXT = `#AREA
second.are~
Second~
{ 1 50} Test  Second~
200 299

#ROOMS
#200
Second Room~
Another area entirely.
~
0 0 1
S
#0

#$
`;

function mockFetch() {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    if (url.endsWith('/api/capabilities')) return json({ writeEnabled: false, mercAreaPath: '/tmp' });
    if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }, { file: 'second.are', name: 'Second' }] });
    if (url.endsWith('/api/areas/tiny.are')) {
      const { parseAreaFile } = await import('@shatteredarchive/merc-area');
      return json({ file: 'tiny.are', area: parseAreaFile(TINY_AREA_TEXT) });
    }
    if (url.endsWith('/api/areas/second.are')) {
      const { parseAreaFile } = await import('@shatteredarchive/merc-area');
      return json({ file: 'second.are', area: parseAreaFile(SECOND_AREA_TEXT) });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
}

async function openArea() {
  fireEvent.click(await screen.findByRole('button', { name: /Tiny$/ }));
  await screen.findByRole('button', { name: '#100 The Test Room' });
}

describe('RoomsPage', () => {
  beforeEach(() => {
    mockFetch();
  });

  it('lists rooms once an area is opened, and shows nothing selected initially', async () => {
    render(<RoomsPage />);
    await openArea();
    expect(screen.getByRole('button', { name: '#101 The Back Room' })).toBeTruthy();
    expect(screen.getByText('Pick a room.')).toBeTruthy();
  });

  it('editing a field round-trips through the model (visible via the manual tab)', async () => {
    render(<RoomsPage />);
    await openArea();
    fireEvent.click(screen.getByRole('button', { name: '#100 The Test Room' }));

    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'The Renamed Room' } });

    fireEvent.click(screen.getByRole('button', { name: /Manual edit/ }));
    const textarea = (await screen.findByLabelText('Raw area file text')) as HTMLTextAreaElement;
    expect(textarea.value).toContain('The Renamed Room~');
  });

  it('shows the Exits & connections panel resolving a local exit target', async () => {
    render(<RoomsPage />);
    await openArea();
    fireEvent.click(screen.getByRole('button', { name: '#100 The Test Room' }));

    const panel = screen.getByText(/Exits & connections/).closest('fieldset')!;
    expect(within(panel).getByText('North')).toBeTruthy();
    expect(within(panel).getByText(/#101 The Back Room/)).toBeTruthy();
  });

  it('add allocates the next free vnum in range and selects it; delete removes it after confirm', async () => {
    render(<RoomsPage />);
    await openArea();

    fireEvent.click(screen.getByRole('button', { name: '+ Add room' }));
    expect(await screen.findByRole('button', { name: '#102 A New Room' })).toBeTruthy();
    expect(((await screen.findByLabelText('Room name')) as HTMLInputElement).value).toBe('A New Room');

    window.confirm = jest.fn(() => true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete room #102' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '#102 A New Room' })).toBeNull());
    expect(screen.getByText('removed room #102')).toBeTruthy();
  });

  it('blocks delete when the room is still referenced (an exit points at it), showing a categorized panel', async () => {
    render(<RoomsPage />);
    await openArea();
    fireEvent.click(screen.getByRole('button', { name: '#101 The Back Room' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete room #101' }));
    expect(await screen.findByText(/Cannot delete room #101/)).toBeTruthy();
    expect(screen.getByText('Map (room exits)')).toBeTruthy();
    // still present — the delete was blocked, not silently applied.
    expect(screen.getByRole('button', { name: '#101 The Back Room' })).toBeTruthy();
  });

  it('wires the blocked-delete panel\'s "Go fix it" buttons to the given callbacks', async () => {
    const onGoToResets = jest.fn();
    const onGoToMap = jest.fn();
    render(<RoomsPage onGoToResets={onGoToResets} onGoToMap={onGoToMap} />);
    await openArea();
    fireEvent.click(screen.getByRole('button', { name: '#101 The Back Room' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete room #101' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Go fix it on the Map →' }));
    expect(onGoToMap).toHaveBeenCalledWith(101, 'tiny.are');
  });

  it('an initialTarget opens the right area and selects the right room', async () => {
    const target: ExternalRef = { kind: 'room', vnum: 101, where: 'map', file: 'tiny.are', name: 'The Back Room' };
    render(<RoomsPage initialTarget={target} />);
    expect(await screen.findByLabelText('Room name')).toBeTruthy();
    expect((screen.getByLabelText('Room name') as HTMLInputElement).value).toBe('The Back Room');
  });

  it('the spawn link fires onOpenSpawn with the selected room\'s vnum', async () => {
    const onOpenSpawn = jest.fn();
    render(<RoomsPage onOpenSpawn={onOpenSpawn} />);
    await openArea();
    fireEvent.click(screen.getByRole('button', { name: '#100 The Test Room' }));

    fireEvent.click(screen.getByText('See what spawns here →'));
    expect(onOpenSpawn).toHaveBeenCalledWith(100);
  });

  it('switching areas while dirty prompts to confirm, and cancel keeps the current area open', async () => {
    render(<RoomsPage />);
    await openArea();
    fireEvent.click(screen.getByRole('button', { name: '#100 The Test Room' }));
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Edited Room' } });
    expect(screen.getByText('● unsaved changes')).toBeTruthy();

    window.confirm = jest.fn(() => false);
    fireEvent.click(screen.getByRole('button', { name: /Second$/ }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('unsaved changes'));
    // declined — still on tiny.are, edit intact.
    expect((screen.getByLabelText('Room name') as HTMLInputElement).value).toBe('Edited Room');

    window.confirm = jest.fn(() => true);
    fireEvent.click(screen.getByRole('button', { name: /Second$/ }));
    await screen.findByRole('button', { name: '#200 Second Room' });
  });
});
