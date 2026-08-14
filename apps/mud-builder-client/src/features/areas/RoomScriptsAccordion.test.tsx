import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { parseAreaFile, type Room, type RoomsSection } from '@shatteredarchive/merc-area';

import RoomScriptsAccordion from './RoomScriptsAccordion.js';
import { useAreaWorkbench, type AreaWorkbench } from './workbench.js';

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
#0

#ROOMS
#100
The Test Room~
A perfectly ordinary test room.
~
0 0 1
S
#101
The Back Room~
Another test room.
~
0 0 1
S
#0

#SCRIPTS
M 3000 speech hello~
say Hello!~
R 100 entry ~
echo A strange force seizes you!~
#0

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

function room(wb: AreaWorkbench, vnum: number): Room {
  const section = wb.area!.sections.find((s): s is RoomsSection => s.kind === 'rooms')!;
  return section.rooms.find((r) => r.vnum === vnum)!;
}

function Harness({ vnum, render: renderFn }: { vnum: number; render: (wb: AreaWorkbench) => React.ReactNode }) {
  const wb = useAreaWorkbench();
  useEffect(() => {
    void wb.openArea('tiny.are');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!wb.area) return <p>loading</p>;
  return <>{renderFn(wb)}</>;
}

describe('RoomScriptsAccordion', () => {
  beforeEach(mockFetch);

  it('shows only the scripts attached to this room, not the mob script', async () => {
    render(<Harness vnum={100} render={(wb) => <RoomScriptsAccordion wb={wb} room={room(wb, 100)} />} />);
    expect(await screen.findByText('Progs — room scripts (1)')).toBeTruthy();
  });

  it('a room with no scripts shows the empty state', async () => {
    render(<Harness vnum={101} render={(wb) => <RoomScriptsAccordion wb={wb} room={room(wb, 101)} />} />);
    expect(await screen.findByText('Progs — room scripts (0)')).toBeTruthy();
    fireEvent.click(screen.getByText('Progs — room scripts (0)'));
    expect(screen.getByText('No scripts attached to this room.')).toBeTruthy();
  });

  it('+ Add room script creates a new attach:room script for this room', async () => {
    render(<Harness vnum={101} render={(wb) => <RoomScriptsAccordion wb={wb} room={room(wb, 101)} />} />);
    fireEvent.click(await screen.findByText('Progs — room scripts (0)'));
    fireEvent.click(screen.getByRole('button', { name: '+ Add room script' }));
    await waitFor(() => expect(screen.getByText('Progs — room scripts (1)')).toBeTruthy());
  });

  it('deleting an existing script round-trips through the model', async () => {
    render(<Harness vnum={100} render={(wb) => <RoomScriptsAccordion wb={wb} room={room(wb, 100)} />} />);
    fireEvent.click(await screen.findByText('Progs — room scripts (1)'));

    // The nested <details> for the one script row is closed but jsdom doesn't hide its
    // content (no native `details:not([open])` UA styling), so ScriptEditor is already
    // queryable without clicking its own summary open first.
    fireEvent.click(screen.getByRole('button', { name: 'Delete script' }));
    await waitFor(() => expect(screen.getByText('Progs — room scripts (0)')).toBeTruthy());
  });
});
