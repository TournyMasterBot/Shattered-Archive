import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import RoomEditor from './RoomEditor.js';
import AreasPage from './AreasPage.js';
import type { Room } from '@shatteredarchive/merc-area';

const ROOM: Room = {
  vnum: 100,
  name: 'The Test Room',
  description: 'A perfectly ordinary test room.\n',
  areaNumber: 0,
  roomFlags: 0,
  sectorType: 1,
  exits: [{ door: 0, description: '', keyword: '', locks: 0, key: 0, toVnum: 101 }],
  extraDescrs: [],
};

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
S
#0

#$
`;

describe('RoomEditor', () => {
  it('edits fields through onChange (form → model round trip)', () => {
    const onChange = jest.fn();
    render(<RoomEditor room={ROOM} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Room description'), {
      target: { value: 'A freshly edited test room.\n' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'A freshly edited test room.\n' }),
    );

    fireEvent.click(screen.getByLabelText(/Safe/), {});
    const flagged = onChange.mock.calls.at(-1)![0] as Room;
    expect(flagged.roomFlags & 1024).toBe(1024); // Safe = bit K

    fireEvent.change(screen.getByLabelText('Exit 0 target vnum'), { target: { value: '105' } });
    const exited = onChange.mock.calls.at(-1)![0] as Room;
    expect(exited.exits[0].toVnum).toBe(105);
  });
});

describe('AreasPage write gating', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) =>
        ({ ok: true, status: 200, statusText: 'OK', json: async () => body }) as Response;
      if (url.endsWith('/api/capabilities')) return json({ writeEnabled: false, mercAreaPath: 'x' });
      if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
      if (url.endsWith('/api/areas/tiny.are')) {
        const { parseAreaFile } = await import('@shatteredarchive/merc-area');
        return json({ file: 'tiny.are', area: parseAreaFile(TINY_AREA_TEXT) });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
  });

  it('disables Save/reload buttons when the server gates writes off, Download stays enabled', async () => {
    render(<AreasPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy());

    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Hot reload' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Copyover/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows rooms and flags manual edits', async () => {
    render(<AreasPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));
    const roomBtn = await screen.findByRole('button', { name: /#100 The Test Room/ });
    fireEvent.click(roomBtn);
    expect(screen.getByLabelText('Room description')).toBeTruthy();

    // Manual tab: apply a parseable edit and expect the MANUAL EDITS badge.
    fireEvent.click(screen.getByRole('button', { name: /Manual edit/ }));
    const textarea = (await screen.findByLabelText('Raw area file text')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: textarea.value.replace('The Test Room', 'The Manual Room') } });
    fireEvent.click(screen.getByRole('button', { name: /Parse & apply/ }));
    await waitFor(() => expect(screen.getByText('MANUAL EDITS')).toBeTruthy());
    expect(screen.getByRole('button', { name: /#100 The Manual Room/ })).toBeTruthy();
  });
});
