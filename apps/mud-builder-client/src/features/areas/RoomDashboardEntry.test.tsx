import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { parseAreaFile, type Room, type RoomsSection } from '@shatteredarchive/merc-area';

import RoomDashboardEntry from './RoomDashboardEntry.js';
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

#OBJECTS
#3100
a test sword~
a test sword~
A test sword lies here.~
steel~
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
0 0 101
S
#101
The Back Room~
Another test room.
~
0 0 1
S
#0

#RESETS
M 0 3000 1 100 1
O 0 3100 0 100
S

#SCRIPTS
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

function findRoom(wb: AreaWorkbench, vnum: number): Room {
  const section = wb.area!.sections.find((s): s is RoomsSection => s.kind === 'rooms')!;
  return section.rooms.find((r) => r.vnum === vnum)!;
}

function Harness({
  vnum,
  defaultOpen,
  onGoToMap,
}: {
  vnum: number;
  defaultOpen?: boolean;
  onGoToMap?: (vnum: number, file: string) => void;
}) {
  const wb = useAreaWorkbench();
  useEffect(() => {
    void wb.openArea('tiny.are');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!wb.area) return <p>loading</p>;
  return <RoomDashboardEntry wb={wb} room={findRoom(wb, vnum)} defaultOpen={defaultOpen} onGoToMap={onGoToMap} />;
}

describe('RoomDashboardEntry', () => {
  beforeEach(mockFetch);

  it('renders closed by default, showing only the summary counts', async () => {
    render(<Harness vnum={100} />);
    expect(await screen.findByText(/1 mob, 1 object/)).toBeTruthy();
    expect(screen.queryByLabelText('Room name')).toBeNull();
  });

  it('opening the room reveals the full editor, connections, and mob/object/script groups', async () => {
    render(<Harness vnum={100} defaultOpen />);
    expect((await screen.findByLabelText('Room name')) as HTMLInputElement).toBeTruthy();
    expect(screen.getByText('Mobs in this room (1)')).toBeTruthy();
    expect(screen.getByText(/Mob — #3000 the test mob/)).toBeTruthy();
    expect(screen.getByText('Objects in this room (1)')).toBeTruthy();
    expect(screen.getByText(/Object — #3100 a test sword/)).toBeTruthy();
    expect(screen.getByText('Progs — room scripts (1)')).toBeTruthy();
    expect(screen.getByText(/Exits & connections/)).toBeTruthy();
  });

  it('editing the room name in the embedded RoomEditor updates the shared model', async () => {
    render(<Harness vnum={101} defaultOpen />);
    const nameField = (await screen.findByLabelText('Room name')) as HTMLInputElement;
    fireEvent.change(nameField, { target: { value: 'The Renamed Room' } });
    await waitFor(() => expect((screen.getByLabelText('Room name') as HTMLInputElement).value).toBe('The Renamed Room'));
  });

  it('a blocked delete shows the categorized panel with a working "Go fix it on the Map" button', async () => {
    const onGoToMap = jest.fn();
    render(<Harness vnum={101} defaultOpen onGoToMap={onGoToMap} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete room #101' }));

    expect(await screen.findByText(/Cannot delete room #101/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go fix it on the Map →' }));
    expect(onGoToMap).toHaveBeenCalledWith(101, 'tiny.are');
    // still present — the delete was blocked, not silently applied.
    expect(screen.getByLabelText('Room name')).toBeTruthy();
  });

  it('Dismiss clears a blocked-delete panel without deleting anything', async () => {
    render(<Harness vnum={100} defaultOpen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete room #100' }));
    expect(await screen.findByText(/Cannot delete room #100/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByText(/Cannot delete room #100/)).toBeNull());
    expect(screen.getByLabelText('Room name')).toBeTruthy();
  });

  it('+ Place a mob here / + Place an object here add new reset rows scoped to this room', async () => {
    render(<Harness vnum={101} defaultOpen />);
    await screen.findByText('Mobs in this room (0)');

    fireEvent.click(screen.getByRole('button', { name: '+ Place a mob here' }));
    await waitFor(() => expect(screen.getByText('Mobs in this room (1)')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '+ Place an object here' }));
    await waitFor(() => expect(screen.getByText('Objects in this room (1)')).toBeTruthy());
  });

  it('the RoomEditor "See what spawns here" link fires onOpenSpawn with this room\'s vnum', async () => {
    const onOpenSpawn = jest.fn();
    function OpenSpawnHarness() {
      const wb = useAreaWorkbench();
      useEffect(() => {
        void wb.openArea('tiny.are');
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      if (!wb.area) return <p>loading</p>;
      return <RoomDashboardEntry wb={wb} room={findRoom(wb, 100)} defaultOpen onOpenSpawn={onOpenSpawn} />;
    }
    render(<OpenSpawnHarness />);
    fireEvent.click(await screen.findByText('See what spawns here →'));
    expect(onOpenSpawn).toHaveBeenCalledWith(100);
  });

  it('the exits & connections panel resolves the local exit target', async () => {
    render(<Harness vnum={100} defaultOpen />);
    const panel = (await screen.findByText(/Exits & connections/)).closest('fieldset')!;
    expect(within(panel).getByText(/#101 The Back Room/)).toBeTruthy();
  });
});
