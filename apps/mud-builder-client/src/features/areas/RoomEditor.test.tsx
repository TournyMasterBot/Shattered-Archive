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

  it('edits the area header from the form and warns when the range shrinks below a used vnum (Phase 6)', async () => {
    render(<AreasPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));
    const nameInput = (await screen.findByLabelText('Area name')) as HTMLInputElement;
    expect(nameInput.value).toBe('Tiny');

    fireEvent.change(nameInput, { target: { value: 'Tiny Renamed' } });
    fireEvent.change(screen.getByLabelText('Min vnum'), { target: { value: '150' } });
    // Room 100 now falls outside 150-199 → inline warning.
    expect(screen.getByText(/no longer covers defined vnum/).textContent).toContain('100');

    fireEvent.change(screen.getByLabelText('Min vnum'), { target: { value: '90' } });
    expect(screen.queryByText(/no longer covers defined vnum/)).toBeNull();

    // The rename reached the model: the manual pane emits the new header.
    fireEvent.click(screen.getByRole('button', { name: /Manual edit/ }));
    const textarea = (await screen.findByLabelText('Raw area file text')) as HTMLTextAreaElement;
    expect(textarea.value).toContain('Tiny Renamed~');
    expect(textarea.value).toContain('90 199');
  });

  it('gates "+ New area" off with writes', async () => {
    render(<AreasPage />);
    const btn = (await screen.findByRole('button', { name: '+ New area' })) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe('AreasPage new-area creation (writes enabled, Phase 5)', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        ({ ok: status < 400, status, statusText: 'X', json: async () => body }) as Response;
      if (url.endsWith('/api/capabilities')) return json({ writeEnabled: true, mercAreaPath: 'x' });
      if (url.endsWith('/api/areas') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { file: string; name: string };
        expect(body).toEqual({ file: 'myzone.are', name: 'My Zone', minVnum: 300, maxVnum: 399 });
        return json({ file: body.file, created: true, requiresCopyover: true, note: 'copyover needed' }, 201);
      }
      if (url.endsWith('/api/areas')) {
        return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }, { file: 'myzone.are', name: 'My Zone' }] });
      }
      if (url.endsWith('/api/areas/myzone.are')) {
        const { parseAreaFile } = await import('@shatteredarchive/merc-area');
        return json({
          file: 'myzone.are',
          area: parseAreaFile('#AREA\nmyzone.are~\nMy Zone~\n{ 1 99} Builder  My Zone~\n300 399\n\n#$\n'),
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
  });

  it('creates a new area (appends .are), refreshes the list, and opens it', async () => {
    render(<AreasPage />);
    fireEvent.click(await screen.findByRole('button', { name: '+ New area' }));

    fireEvent.change(screen.getByLabelText('New area file name'), { target: { value: 'myzone' } });
    fireEvent.change(screen.getByLabelText('New area name'), { target: { value: 'My Zone' } });
    fireEvent.change(screen.getByLabelText('New area min vnum'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('New area max vnum'), { target: { value: '399' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText(/created myzone.are/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /My Zone/ })).toBeTruthy();
    // The new (empty) area is open and ready for a first room.
    expect(screen.getByRole('button', { name: '+ Add room' })).toBeTruthy();
  });
});
