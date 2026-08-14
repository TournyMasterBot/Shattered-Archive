import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import type { AreaFile } from '@shatteredarchive/merc-area';

import SimulatePane from './SimulatePane.js';

const AREA: AreaFile = {
  sections: [
    {
      kind: 'rooms',
      rooms: [
        {
          vnum: 300,
          name: 'Guard Post',
          description: '',
          areaNumber: 0,
          roomFlags: 0,
          sectorType: 0,
          exits: [],
          extraDescrs: [],
        },
        {
          vnum: 301,
          name: 'Empty Hall',
          description: '',
          areaNumber: 0,
          roomFlags: 0,
          sectorType: 0,
          exits: [],
          extraDescrs: [],
        },
      ],
    },
  ],
};

const SPAWN_RESULT = {
  rooms: [
    {
      room: 300,
      mobs: [
        {
          vnum: 101,
          name: 'the test guard',
          count: 1,
          equipped: [{ vnum: 102, name: 'a test sword', contents: [], slot: 'wielded' }],
          carried: [{ vnum: 103, name: 'a pouch', contents: [{ vnum: 104, name: 'a coin', contents: [] }] }],
        },
      ],
      objects: [],
    },
    {
      room: 301,
      mobs: [],
      objects: [{ vnum: 105, name: 'a torch', contents: [] }],
    },
  ],
  doors: [{ room: 300, door: 0, state: 'locked' }],
  randomizedExits: [],
  warnings: ['reset #9 (E): no active mob to equip object 999 to'],
};

function mockFetch(body: unknown = SPAWN_RESULT) {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/spawn')) return { ok: true, status: 200, json: async () => body } as unknown as Response;
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
}

describe('SimulatePane', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when no file is open', () => {
    mockFetch();
    const { container } = render(<SimulatePane file={null} area={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the gear tree (nested carried contents + equipped slot) and warnings up top', async () => {
    mockFetch();
    render(<SimulatePane file="tiny.are" area={AREA} />);

    await screen.findByText(/Room #300/);
    expect(screen.getByText(/no active mob to equip object 999/)).toBeTruthy();

    fireEvent.click(screen.getByText(/Room #300/));
    expect(screen.getByText(/wielded:/)).toBeTruthy();
    expect(screen.getByText(/a test sword/)).toBeTruthy();
    // carried pouch nests its own P'd contents (the coin) one level deeper.
    expect(screen.getByText(/a pouch/)).toBeTruthy();
    expect(screen.getByText(/a coin/)).toBeTruthy();
    // door state rendered under the same room.
    expect(screen.getByText('locked')).toBeTruthy();
  });

  it('the boot-state disclaimer is always shown', async () => {
    mockFetch();
    render(<SimulatePane file="tiny.are" area={AREA} />);
    expect(screen.getByText(/FIRST-BOOT spawn state only/)).toBeTruthy();
    await screen.findByText(/Room #300/);
  });

  it('filters the room list by vnum or resolved room name', async () => {
    mockFetch();
    render(<SimulatePane file="tiny.are" area={AREA} />);
    await screen.findByText(/Room #300/);
    expect(screen.getByText(/Room #301/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Filter rooms'), { target: { value: 'Guard Post' } });
    expect(screen.getByText(/Room #300/)).toBeTruthy();
    expect(screen.queryByText(/Room #301/)).toBeNull();

    fireEvent.change(screen.getByLabelText('Filter rooms'), { target: { value: '301' } });
    expect(screen.getByText(/Room #301/)).toBeTruthy();
    expect(screen.queryByText(/Room #300/)).toBeNull();

    fireEvent.change(screen.getByLabelText('Filter rooms'), { target: { value: 'nothing matches this' } });
    expect(screen.getByText('No rooms match.')).toBeTruthy();
  });

  it('a cross-tab room target seeds the filter to that room', async () => {
    mockFetch();
    render(<SimulatePane file="tiny.are" area={AREA} initialRoomTarget={{ vnum: 301 }} />);
    await screen.findByText(/Room #301/);
    expect((screen.getByLabelText('Filter rooms') as HTMLInputElement).value).toBe('301');
    expect(screen.queryByText(/Room #300/)).toBeNull();
  });

  it('shows the fetch error instead of crashing', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    render(<SimulatePane file="tiny.are" area={AREA} />);
    await screen.findByText('network down');
  });

  it('Refresh re-fetches on demand', async () => {
    let calls = 0;
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      calls++;
      const url = String(input);
      if (url.endsWith('/spawn')) return { ok: true, status: 200, json: async () => SPAWN_RESULT } as unknown as Response;
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
    render(<SimulatePane file="tiny.are" area={AREA} />);
    await screen.findByText(/Room #300/);
    expect(calls).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(calls).toBe(2));
  });

  it('"Edit this room" fires onEditRoom with the room\'s vnum and file', async () => {
    mockFetch();
    const onEditRoom = jest.fn();
    render(<SimulatePane file="tiny.are" area={AREA} onEditRoom={onEditRoom} />);
    const room300 = (await screen.findByText(/Room #300/)).closest('details')!;

    fireEvent.click(within(room300).getByRole('button', { name: 'Edit this room →' }));
    expect(onEditRoom).toHaveBeenCalledWith(300, 'tiny.are');
  });

  it('no "Edit this room" link when onEditRoom is not provided', async () => {
    mockFetch();
    render(<SimulatePane file="tiny.are" area={AREA} />);
    await screen.findByText(/Room #300/);
    expect(screen.queryByRole('button', { name: 'Edit this room →' })).toBeNull();
  });

  it('Compare live requests a refresh, polls for a fresh snapshot, and renders per-room drift', async () => {
    jest.useFakeTimers();
    let liveCalls = 0;
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/spawn')) return { ok: true, status: 200, json: async () => SPAWN_RESULT } as unknown as Response;
      if (url.endsWith('/api/state/refresh') && init?.method === 'POST') {
        return { ok: true, status: 202, json: async () => ({ requested: true }) } as unknown as Response;
      }
      if (url.endsWith('/api/state/live')) {
        liveCalls++;
        if (liveCalls === 1) {
          // The pre-refresh "what's already on record" check: nothing yet.
          return { ok: false, status: 404, json: async () => ({ error: 'no snapshot yet' }) } as unknown as Response;
        }
        // Room 300's guard (vnum 101) is gone; a player is standing there instead.
        return {
          ok: true,
          status: 200,
          json: async () => ({
            snapshot: { ts: 999, rooms: [{ vnum: 300, mobs: [], objs: [], players: 1, doors: [] }] },
            ageMs: 500,
          }),
        } as unknown as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    render(<SimulatePane file="tiny.are" area={AREA} />);
    await screen.findByText(/Room #300/);

    fireEvent.click(screen.getByRole('button', { name: 'Compare live' }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });

    // Room 301's un-snapshotted object (vnum 105) also reads "expected 1, live 0" — anchor
    // on the vnum so this assertion targets room 300's missing GUARD specifically.
    expect(await screen.findByText(/#101 mob — expected 1, live 0/)).toBeTruthy();
    expect(screen.getByText(/1 player here now/)).toBeTruthy();
    // Room 301 also drifts (its object never appears in the live snapshot at all), so the
    // summary heading covers both rooms.
    expect(screen.getByText(/2 rooms.*drifted/)).toBeTruthy();
  });

  it('scopes the (whole-world) live snapshot to THIS area before diffing — a foreign room never becomes drift', async () => {
    jest.useFakeTimers();
    let liveCalls = 0;
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/spawn')) return { ok: true, status: 200, json: async () => SPAWN_RESULT } as unknown as Response;
      if (url.endsWith('/api/state/refresh') && init?.method === 'POST') {
        return { ok: true, status: 202, json: async () => ({ requested: true }) } as unknown as Response;
      }
      if (url.endsWith('/api/state/live')) {
        liveCalls++;
        if (liveCalls === 1) {
          return { ok: false, status: 404, json: async () => ({ error: 'no snapshot yet' }) } as unknown as Response;
        }
        // state.snapshot.json is WORLD-wide: rooms 300/301 match the sim exactly (no drift),
        // but a room from some OTHER area (9999) has an object with zero sim data at all —
        // that must never surface as "extra" here, only within its own area's pane.
        return {
          ok: true,
          status: 200,
          json: async () => ({
            snapshot: {
              ts: 999,
              rooms: [
                { vnum: 300, mobs: [[101, 1]], objs: [], players: 0, doors: [] },
                { vnum: 301, mobs: [], objs: [[105, 1]], players: 0, doors: [] },
                { vnum: 9999, mobs: [], objs: [[7777, 1]], players: 0, doors: [] },
              ],
            },
            ageMs: 100,
          }),
        } as unknown as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    render(<SimulatePane file="tiny.are" area={AREA} />);
    await screen.findByText(/Room #300/);

    fireEvent.click(screen.getByRole('button', { name: 'Compare live' }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });

    await screen.findByText(/0 rooms.*drifted/);
    expect(screen.queryByText(/7777/)).toBeNull();
    expect(screen.queryByText(/9999/)).toBeNull();
  });

  it('Compare live shows a "did not respond" note instead of hanging when the game never produces a fresh snapshot', async () => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/spawn')) return { ok: true, status: 200, json: async () => SPAWN_RESULT } as unknown as Response;
      if (url.endsWith('/api/state/refresh') && init?.method === 'POST') {
        return { ok: true, status: 202, json: async () => ({ requested: true }) } as unknown as Response;
      }
      if (url.endsWith('/api/state/live')) {
        return { ok: false, status: 404, json: async () => ({ error: 'no snapshot yet' }) } as unknown as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    render(<SimulatePane file="tiny.are" area={AREA} />);
    await screen.findByText(/Room #300/);

    fireEvent.click(screen.getByRole('button', { name: 'Compare live' }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });

    expect(await screen.findByText(/did not respond/)).toBeTruthy();
  });
});
