import { render, screen, fireEvent } from '@testing-library/react';

import MapPage from './MapPage.js';

const TINY_MAP = {
  file: 'tiny.are',
  name: 'Tiny',
  minVnum: 100,
  maxVnum: 199,
  rooms: [
    {
      vnum: 100,
      name: 'The Test Room',
      sectorType: 0,
      exits: [
        { door: 1, toVnum: 101 },
        { door: 2, toVnum: 205, external: { file: 'neighbor.are', name: 'Neighbor Landing' } },
      ],
    },
    { vnum: 101, name: 'The Back Room', sectorType: 0, exits: [{ door: 3, toVnum: 100 }] },
  ],
};

const NEIGHBOR_MAP = {
  file: 'neighbor.are',
  name: 'Neighbor',
  minVnum: 200,
  maxVnum: 299,
  rooms: [{ vnum: 205, name: 'Neighbor Landing', sectorType: 0, exits: [] }],
};

beforeEach(() => {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    if (url.endsWith('/api/areas')) {
      return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }, { file: 'neighbor.are', name: 'Neighbor' }] });
    }
    if (url.endsWith('/api/map/tiny.are')) return json(TINY_MAP);
    if (url.endsWith('/api/map/neighbor.are')) return json(NEIGHBOR_MAP);
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
});

describe('MapPage (area mode)', () => {
  it('renders the first area as an SVG map with rooms and a portal stub', async () => {
    render(<MapPage />);
    expect(await screen.findByRole('button', { name: 'room #100 The Test Room' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'room #101 The Back Room' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'portal to neighbor.are — Neighbor Landing' })).toBeTruthy();
    expect(screen.getByText(/2 rooms · 1 cross-area exits/)).toBeTruthy();
  });

  it('clicking a room hands off to the Areas tab with a room ref', async () => {
    const onOpenRoom = jest.fn();
    render(<MapPage onOpenRoom={onOpenRoom} />);
    fireEvent.click(await screen.findByRole('button', { name: 'room #100 The Test Room' }));
    expect(onOpenRoom).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'room', vnum: 100, file: 'tiny.are', name: 'The Test Room' }),
    );
  });

  it('clicking a portal stub loads the neighboring area map in place', async () => {
    render(<MapPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'portal to neighbor.are — Neighbor Landing' }));
    expect(await screen.findByRole('button', { name: 'room #205 Neighbor Landing' })).toBeTruthy();
    expect((globalThis.fetch as jest.Mock).mock.calls.map((c) => String(c[0]))).toEqual(
      expect.arrayContaining([expect.stringContaining('/api/map/neighbor.are')]),
    );
  });
});

describe('MapPage exit fidelity (Phase 12b)', () => {
  const FIDELITY_MAP = {
    file: 'tiny.are',
    name: 'Tiny',
    minVnum: 100,
    maxVnum: 199,
    rooms: [
      {
        vnum: 100,
        name: 'Hub',
        sectorType: 0,
        exits: [
          { door: 1, toVnum: 101, locks: 0 }, // one-way east (101 has no west exit)
          { door: 2, toVnum: 102, locks: 2 }, // pickproof door south, two-way
          { door: 0, toVnum: 100, locks: 0 }, // loops back into itself
        ],
        warps: [{ toVnum: 102 }],
      },
      {
        vnum: 101,
        name: 'Dead End',
        sectorType: 0,
        exits: [{ door: 0, toVnum: 102, locks: 0 }], // north leads elsewhere → 100's south is fine; this one is one-way too
      },
      { vnum: 102, name: 'Cellar', sectorType: 0, exits: [{ door: 0, toVnum: 100, locks: 0 }] },
    ],
  };

  it('renders classification styles, door markers, warp edges, and the legend', async () => {
    (globalThis.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
      if (url.endsWith('/api/map/tiny.are')) return json(FIDELITY_MAP);
      throw new Error(`unexpected fetch ${url}`);
    });

    const { container } = render(<MapPage />);
    await screen.findByRole('button', { name: 'room #100 Hub' });

    expect(container.querySelector('.mb-map-edge--oneway')).toBeTruthy();
    expect(container.querySelector('.mb-map-edge--loop')).toBeTruthy();
    expect(container.querySelector('.mb-map-edge--warp')).toBeTruthy();
    expect(container.querySelector('.mb-map-door')).toBeTruthy();
    // two-way south passage draws undirected (no arrow marker on it)
    const doorMarkerTitle = container.querySelector('.mb-map-door title');
    expect(doorMarkerTitle?.textContent).toContain('pickproof');
    // legend present
    expect(screen.getByText('teleport (script)')).toBeTruthy();
    expect(screen.getByText(/non-returning/)).toBeTruthy();
  });
});

describe('MapPage spawn overlay (Phase 13)', () => {
  const SPAWN_RESULT = {
    rooms: [
      {
        room: 100,
        mobs: [
          { vnum: 9001, name: 'the town guard', count: 2, equipped: [], carried: [] },
          { vnum: 9002, name: 'the captain', count: 1, equipped: [], carried: [] },
        ],
        objects: [],
      },
      // Object-only room: must NOT get a badge (the overlay counts mobs).
      { room: 101, mobs: [], objects: [{ vnum: 9100, name: 'a fountain', contents: [] }] },
    ],
    doors: [],
    randomizedExits: [],
    warnings: [],
  };

  beforeEach(() => {
    (globalThis.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
      if (url.endsWith('/api/map/tiny.are')) return json(TINY_MAP);
      if (url.endsWith('/api/areas/tiny.are/spawn')) return json(SPAWN_RESULT);
      throw new Error(`unexpected fetch ${url}`);
    });
  });

  it('renders per-room mob-count badges from mocked spawn data once toggled on', async () => {
    const { container } = render(<MapPage />);
    await screen.findByRole('button', { name: 'room #100 The Test Room' });

    // Off by default: no badge, no spawn fetch.
    expect(container.querySelector('.mb-map-spawn-badge')).toBeNull();
    expect(
      (globalThis.fetch as jest.Mock).mock.calls.map((c) => String(c[0])),
    ).not.toEqual(expect.arrayContaining([expect.stringContaining('/spawn')]));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Spawns' }));

    await screen.findByText('3'); // 2 guards + 1 captain in room 100
    const badges = container.querySelectorAll('.mb-map-spawn-badge');
    expect(badges).toHaveLength(1); // room 101 is object-only — no badge
    expect(badges[0].querySelector('title')?.textContent).toContain('3 mobs spawn here');
    expect(screen.getByText(/mobs at boot/)).toBeTruthy(); // legend entry appears with the overlay
  });

  it('toggling the overlay off hides the badges', async () => {
    const { container } = render(<MapPage />);
    await screen.findByRole('button', { name: 'room #100 The Test Room' });

    const toggle = screen.getByRole('checkbox', { name: 'Spawns' });
    fireEvent.click(toggle);
    await screen.findByText('3');

    fireEvent.click(toggle);
    expect(container.querySelector('.mb-map-spawn-badge')).toBeNull();
    expect(screen.queryByText(/mobs at boot/)).toBeNull();
  });
});
