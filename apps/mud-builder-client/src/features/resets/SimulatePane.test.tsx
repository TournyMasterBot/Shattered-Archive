import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
});
