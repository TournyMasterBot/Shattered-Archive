import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

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

  it('initialFocus opens that area (not the default first one) and highlights the room', async () => {
    render(<MapPage initialFocus={{ file: 'neighbor.are', vnum: 205 }} />);
    const room = await screen.findByRole('button', { name: 'room #205 Neighbor Landing' });
    expect(room.getAttribute('class')).toContain('mb-map-room--focused');
    // the default-first-area fetch never wins the race against the focused one.
    expect(screen.queryByRole('button', { name: 'room #100 The Test Room' })).toBeNull();
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

describe('MapPage live spawn toggle (Phase 14c)', () => {
  const SPAWN_RESULT = {
    rooms: [{ room: 100, mobs: [{ vnum: 9001, name: 'the town guard', count: 3, equipped: [], carried: [] }], objects: [] }],
    doors: [],
    randomizedExits: [],
    warnings: [],
  };

  it('a live snapshot in hand grows a Boot/Live sub-toggle; Live swaps the badge count and its color', async () => {
    (globalThis.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
      if (url.endsWith('/api/map/tiny.are')) return json(TINY_MAP);
      if (url.endsWith('/api/areas/tiny.are/spawn')) return json(SPAWN_RESULT);
      if (url.endsWith('/api/state/live')) {
        return json({
          snapshot: { ts: 500, rooms: [{ vnum: 100, mobs: [[9001, 5]], objs: [], players: 0, doors: [] }] },
          ageMs: 2000,
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const { container } = render(<MapPage />);
    await screen.findByRole('button', { name: 'room #100 The Test Room' });

    // No toggle before Spawns is even on.
    expect(screen.queryByRole('radiogroup', { name: 'Spawn data source' })).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Spawns' }));
    await screen.findByText('3'); // boot count

    const radiogroup = await screen.findByRole('radiogroup', { name: 'Spawn data source' });
    expect(within(radiogroup).getByText(/Live/)).toBeTruthy();
    expect(container.querySelector('.mb-map-spawn-badge--live')).toBeNull();

    fireEvent.click(within(radiogroup).getByRole('radio', { name: /Live/ }));

    await screen.findByText('5'); // live count
    expect(container.querySelector('.mb-map-spawn-badge--live')).toBeTruthy();
    expect(screen.getByText(/mobs live now/)).toBeTruthy();
  });

  it('with no live snapshot yet, the Boot/Live toggle never appears and boot badges render as before', async () => {
    (globalThis.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      const notFound = () => ({ ok: false, status: 404, json: async () => ({ error: 'no snapshot yet' }) }) as unknown as Response;
      if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
      if (url.endsWith('/api/map/tiny.are')) return json(TINY_MAP);
      if (url.endsWith('/api/areas/tiny.are/spawn')) return json(SPAWN_RESULT);
      if (url.endsWith('/api/state/live')) return notFound();
      throw new Error(`unexpected fetch ${url}`);
    });

    const { container } = render(<MapPage />);
    await screen.findByRole('button', { name: 'room #100 The Test Room' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Spawns' }));

    await screen.findByText('3');
    expect(screen.queryByRole('radiogroup', { name: 'Spawn data source' })).toBeNull();
    expect(container.querySelector('.mb-map-spawn-badge--live')).toBeNull();
  });
});

describe('MapPage edit mode scaffolding (Phase 14b)', () => {
  // Deliberately DIFFERENT from TINY_MAP's projection so tests can prove edit mode
  // renders from the full AreaFile (api.getArea), never the /api/map response.
  const EDIT_AREA = {
    sections: [
      {
        kind: 'rooms',
        rooms: [
          {
            vnum: 100,
            name: 'The Test Room',
            description: '',
            areaNumber: 0,
            roomFlags: 0,
            sectorType: 0,
            exits: [{ door: 1, description: '', keyword: '', locks: 0, key: 0, toVnum: 101 }],
            extraDescrs: [],
          },
          {
            vnum: 101,
            name: 'A Freshly Staged Room',
            description: '',
            areaNumber: 0,
            roomFlags: 0,
            sectorType: 0,
            exits: [{ door: 3, description: '', keyword: '', locks: 0, key: 0, toVnum: 100 }],
            extraDescrs: [],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    (globalThis.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
      if (url.endsWith('/api/map/tiny.are')) return json(TINY_MAP);
      if (url.endsWith('/api/areas/tiny.are')) return json({ file: 'tiny.are', area: EDIT_AREA, baseHash: 'h1' });
      if (url.endsWith('/api/map')) return json({ areas: [], links: [] });
      throw new Error(`unexpected fetch ${url}`);
    });
  });

  it('offers the toggle in area mode and fetches the full AreaFile when turned on', async () => {
    render(<MapPage />);
    await screen.findByRole('button', { name: 'room #100 The Test Room' });

    const toggle = screen.getByRole('button', { name: 'Edit exits' });
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);

    // Renders from EDIT_AREA (api.getArea), not TINY_MAP (api.areaMap) — "Back Room" only
    // exists in the map projection, "Freshly Staged Room" only in the AreaFile fixture.
    expect(await screen.findByRole('button', { name: 'room #101 A Freshly Staged Room' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'room #101 The Back Room' })).toBeNull();
    expect(
      (globalThis.fetch as jest.Mock).mock.calls.map((c) => String(c[0])),
    ).toEqual(expect.arrayContaining([expect.stringContaining('/api/areas/tiny.are')]));
  });

  it('hides the toggle in world mode', async () => {
    render(<MapPage />);
    await screen.findByRole('button', { name: 'room #100 The Test Room' });
    fireEvent.click(screen.getByRole('button', { name: 'World' }));
    await screen.findByRole('img', { name: 'World map' });
    expect(screen.queryByRole('button', { name: 'Edit exits' })).toBeNull();
  });

  it('force-disables the Spawns checkbox while editing', async () => {
    render(<MapPage />);
    await screen.findByRole('button', { name: 'room #100 The Test Room' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit exits' }));
    await screen.findByRole('button', { name: 'room #101 A Freshly Staged Room' });
    expect((screen.getByRole('checkbox', { name: 'Spawns' }) as HTMLInputElement).disabled).toBe(true);
  });

  it('returns to the read-only map projection when toggled back off (no ops staged, no prompt)', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm');
    render(<MapPage />);
    await screen.findByRole('button', { name: 'room #100 The Test Room' });
    const toggle = screen.getByRole('button', { name: 'Edit exits' });

    fireEvent.click(toggle);
    await screen.findByRole('button', { name: 'room #101 A Freshly Staged Room' });

    fireEvent.click(toggle);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'room #101 The Back Room' })).toBeTruthy();
    confirmSpy.mockRestore();
  });
});

describe('MapPage edit mode — drag-to-connect (Phase 14b step 3)', () => {
  // Two disconnected rooms (no exits) so a fresh two-way exit can be staged cleanly.
  // layoutArea places room 100 at grid (0,0) and room 101 (a separate BFS component)
  // at (0,2) — directly south — so inferDirection is expected to resolve to 'south'.
  const DRAG_AREA = {
    sections: [
      {
        kind: 'rooms',
        rooms: [
          { vnum: 100, name: 'Room A', description: '', areaNumber: 0, roomFlags: 0, sectorType: 0, exits: [], extraDescrs: [] },
          { vnum: 101, name: 'Room B', description: '', areaNumber: 0, roomFlags: 0, sectorType: 0, exits: [], extraDescrs: [] },
        ],
      },
    ],
  };
  const DRAG_MAP = {
    file: 'tiny.are',
    name: 'Tiny',
    minVnum: 100,
    maxVnum: 199,
    rooms: [
      { vnum: 100, name: 'Room A', sectorType: 0, exits: [] },
      { vnum: 101, name: 'Room B', sectorType: 0, exits: [] },
    ],
  };

  beforeEach(() => {
    (globalThis.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
      if (url.endsWith('/api/map/tiny.are')) return json(DRAG_MAP);
      if (url.endsWith('/api/areas/tiny.are')) return json({ file: 'tiny.are', area: DRAG_AREA, baseHash: 'h1' });
      throw new Error(`unexpected fetch ${url}`);
    });
  });

  async function enterEditMode() {
    render(<MapPage />);
    await screen.findByRole('button', { name: 'room #100 Room A' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit exits' }));
    await screen.findByRole('button', { name: 'room #101 Room B' });
  }

  it('drag from room A to room B opens the create-exit popover with the inferred direction', async () => {
    await enterEditMode();
    const roomA = screen.getByRole('button', { name: 'room #100 Room A' });
    const roomB = screen.getByRole('button', { name: 'room #101 Room B' });

    fireEvent.pointerDown(roomA, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(roomB, { clientX: 0, clientY: 200 });

    const dialog = await screen.findByRole('dialog', { name: 'Create exit' });
    expect(dialog).toBeTruthy();
    expect((screen.getByLabelText('Exit direction') as HTMLSelectElement).value).toBe('2'); // south
    expect(screen.getByText('#100 → #101')).toBeTruthy();
  });

  it('dropping on the source room itself cancels the drag (no popover)', async () => {
    await enterEditMode();
    const roomA = screen.getByRole('button', { name: 'room #100 Room A' });
    fireEvent.pointerDown(roomA, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(roomA, { clientX: 5, clientY: 5 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('confirming the popover stages an addExit op and renders the new edge', async () => {
    await enterEditMode();
    expect(document.querySelectorAll('line.mb-map-edge')).toHaveLength(0);

    const roomA = screen.getByRole('button', { name: 'room #100 Room A' });
    const roomB = screen.getByRole('button', { name: 'room #101 Room B' });
    fireEvent.pointerDown(roomA, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(roomB, { clientX: 0, clientY: 200 });
    await screen.findByRole('dialog', { name: 'Create exit' });

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('1 staged change')).toBeTruthy();
    expect(document.querySelectorAll('line.mb-map-edge').length).toBeGreaterThan(0);
  });

  it('canceling the popover stages nothing', async () => {
    await enterEditMode();
    const roomA = screen.getByRole('button', { name: 'room #100 Room A' });
    const roomB = screen.getByRole('button', { name: 'room #101 Room B' });
    fireEvent.pointerDown(roomA, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(roomB, { clientX: 0, clientY: 200 });
    await screen.findByRole('dialog', { name: 'Create exit' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/staged change/)).toBeNull();
  });

  it('Escape cancels an in-progress drag', async () => {
    await enterEditMode();
    const roomA = screen.getByRole('button', { name: 'room #100 Room A' });
    fireEvent.pointerDown(roomA, { clientX: 0, clientY: 0 });
    expect(document.querySelector('.mb-map-edge--ghost')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('.mb-map-edge--ghost')).toBeNull();
  });

  it('the keyboard connect path (Enter, then Enter on a second room) opens the same popover', async () => {
    await enterEditMode();
    const roomA = screen.getByRole('button', { name: 'room #100 Room A' });
    const roomB = screen.getByRole('button', { name: 'room #101 Room B' });

    fireEvent.keyDown(roomA, { key: 'Enter' });
    fireEvent.keyDown(roomB, { key: 'Enter' });

    expect(await screen.findByRole('dialog', { name: 'Create exit' })).toBeTruthy();
  });

  it('pointerdown on the background canvas does not open a popover (pan still works)', async () => {
    await enterEditMode();
    const svg = screen.getByRole('img', { name: /Map of/ });
    fireEvent.pointerDown(svg, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 80, clientY: 80, pointerId: 1 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('MapPage edit mode — edge popover + tray (Phase 14b step 4)', () => {
  // An existing two-way east/west exit between two rooms (locks=2 pickproof, key 500)
  // so tests can prove the popover prefills from the CURRENT exit, not defaults.
  const EDGE_AREA = {
    sections: [
      {
        kind: 'rooms',
        rooms: [
          {
            vnum: 100,
            name: 'Room A',
            description: '',
            areaNumber: 0,
            roomFlags: 0,
            sectorType: 0,
            exits: [{ door: 1, description: '', keyword: '', locks: 2, key: 500, toVnum: 101 }],
            extraDescrs: [],
          },
          {
            vnum: 101,
            name: 'Room B',
            description: '',
            areaNumber: 0,
            roomFlags: 0,
            sectorType: 0,
            exits: [{ door: 3, description: '', keyword: '', locks: 2, key: 500, toVnum: 100 }],
            extraDescrs: [],
          },
        ],
      },
    ],
  };
  const EDGE_MAP = {
    file: 'tiny.are',
    name: 'Tiny',
    minVnum: 100,
    maxVnum: 199,
    rooms: [
      { vnum: 100, name: 'Room A', sectorType: 0, exits: [{ door: 1, toVnum: 101, locks: 2 }] },
      { vnum: 101, name: 'Room B', sectorType: 0, exits: [{ door: 3, toVnum: 100, locks: 2 }] },
    ],
  };

  beforeEach(() => {
    (globalThis.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
      if (url.endsWith('/api/map/tiny.are')) return json(EDGE_MAP);
      if (url.endsWith('/api/areas/tiny.are')) return json({ file: 'tiny.are', area: EDGE_AREA, baseHash: 'h1' });
      throw new Error(`unexpected fetch ${url}`);
    });
  });

  async function enterEditMode() {
    render(<MapPage />);
    await screen.findByRole('button', { name: 'room #100 Room A' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit exits' }));
    await screen.findByRole('button', { name: 'room #101 Room B' });
  }

  it('clicking the edge opens the popover prefilled with the current lock state', async () => {
    await enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: 'edge #100 east' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit exit' });
    expect(dialog).toBeTruthy();
    expect(screen.getByText('#100 east → #101')).toBeTruthy();
    expect((screen.getByLabelText('Edit lock state') as HTMLSelectElement).value).toBe('2');
    expect((screen.getByLabelText('Edit key vnum') as HTMLInputElement).value).toBe('500');
    // Reverse slot genuinely points back here — the also-remove-reverse checkbox is offered.
    expect(screen.getByRole('checkbox', { name: 'Also remove reverse exit' })).toBeTruthy();
  });

  it('Update stages an updateExit op reflected in the tray', async () => {
    await enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: 'edge #100 east' }));
    await screen.findByRole('dialog', { name: 'Edit exit' });

    fireEvent.change(screen.getByLabelText('Edit lock state'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    const tray = await screen.findByRole('list');
    expect(within(tray).getByText(/Update east exit on Room A/)).toBeTruthy();
  });

  it('Delete with "also remove reverse" checked removes both sides from the rendered layout', async () => {
    await enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: 'edge #100 east' }));
    await screen.findByRole('dialog', { name: 'Edit exit' });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Also remove reverse exit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('1 staged change')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'edge #100 east' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'edge #101 west' })).toBeNull();
  });

  it('per-item undo in the tray restores the removed edge in the rendered layout', async () => {
    await enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: 'edge #100 east' }));
    await screen.findByRole('dialog', { name: 'Edit exit' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Also remove reverse exit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await screen.findByText('1 staged change');
    expect(screen.queryByRole('button', { name: 'edge #100 east' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Undo staged change 1' }));

    expect(screen.queryByText(/staged change/)).toBeNull();
    expect(await screen.findByRole('button', { name: 'edge #100 east' })).toBeTruthy();
  });

  it('"Discard all" clears every staged op at once', async () => {
    await enterEditMode();
    fireEvent.click(screen.getByRole('button', { name: 'edge #100 east' }));
    await screen.findByRole('dialog', { name: 'Edit exit' });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await screen.findByText('1 staged change');

    fireEvent.click(screen.getByRole('button', { name: 'Discard all' }));
    expect(screen.queryByText(/staged change/)).toBeNull();
  });
});

describe('MapPage edit mode — save pipeline (Phase 14b step 5)', () => {
  const SAVE_AREA = {
    sections: [
      {
        kind: 'rooms',
        rooms: [
          { vnum: 100, name: 'Room A', description: '', areaNumber: 0, roomFlags: 0, sectorType: 0, exits: [], extraDescrs: [] },
          { vnum: 101, name: 'Room B', description: '', areaNumber: 0, roomFlags: 0, sectorType: 0, exits: [], extraDescrs: [] },
        ],
      },
    ],
  };
  const SAVE_MAP = {
    file: 'tiny.are',
    name: 'Tiny',
    minVnum: 100,
    maxVnum: 199,
    rooms: [
      { vnum: 100, name: 'Room A', sectorType: 0, exits: [] },
      { vnum: 101, name: 'Room B', sectorType: 0, exits: [] },
    ],
  };
  const PREVIEW_RESULT = {
    text: '#AREA\ntiny.are~\n...',
    diff: { identical: false, start: 5, removed: [] as string[], added: ["D1", "~", "~", "0 0 101"] },
  };

  let putCount: number;
  let getAreaCount: number;
  let saveStatus: number;

  beforeEach(() => {
    putCount = 0;
    getAreaCount = 0;
    saveStatus = 200;
    (globalThis.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
      if (url.endsWith('/api/map/tiny.are')) return json(SAVE_MAP);
      if (url.endsWith('/api/areas/tiny.are/preview')) return json(PREVIEW_RESULT);
      if (url.endsWith('/api/areas/tiny.are') && init?.method === 'PUT') {
        putCount++;
        if (saveStatus !== 200) return json({ error: 'conflict' }, saveStatus);
        return json({ saved: true, backupPath: null, hash: 'h2' });
      }
      if (url.endsWith('/api/areas/tiny.are')) {
        getAreaCount++;
        return json({ file: 'tiny.are', area: SAVE_AREA, baseHash: 'h1' });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
  });

  async function stageOneAddExit() {
    render(<MapPage />);
    await screen.findByRole('button', { name: 'room #100 Room A' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit exits' }));
    const roomA = await screen.findByRole('button', { name: 'room #100 Room A' });
    const roomB = screen.getByRole('button', { name: 'room #101 Room B' });
    fireEvent.pointerDown(roomA, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(roomB, { clientX: 0, clientY: 200 });
    await screen.findByRole('dialog', { name: 'Create exit' });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('1 staged change');
  }

  it('previews before saving, then a confirmed save clears ops, refetches, and toasts success', async () => {
    await stageOneAddExit();

    fireEvent.click(screen.getByRole('button', { name: 'Save (1)' }));
    await screen.findByText('Preview — exact file that would be written');
    expect(screen.getByText(/Changes from line/)).toBeTruthy();

    const getAreaBefore = getAreaCount;
    fireEvent.click(screen.getByRole('button', { name: 'Confirm save' }));

    await waitFor(() => expect(screen.queryByText(/staged change/)).toBeNull());
    expect(screen.getByText(/saved tiny\.are/)).toBeTruthy();
    expect(putCount).toBe(1);
    // refetchAfterSave re-pulls both the edit-mode base model and the view projection.
    expect(getAreaCount).toBeGreaterThan(getAreaBefore);
  });

  it('canceling the preview leaves the staged ops untouched', async () => {
    await stageOneAddExit();
    fireEvent.click(screen.getByRole('button', { name: 'Save (1)' }));
    await screen.findByText('Preview — exact file that would be written');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Preview — exact file that would be written')).toBeNull();
    expect(screen.getByText('1 staged change')).toBeTruthy();
    expect(putCount).toBe(0);
  });

  it('a 401 on save surfaces the Access-tab guard error and leaves ops staged', async () => {
    saveStatus = 401;
    await stageOneAddExit();
    fireEvent.click(screen.getByRole('button', { name: 'Save (1)' }));
    await screen.findByText('Preview — exact file that would be written');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm save' }));

    expect(await screen.findByText(/Access tab/)).toBeTruthy();
    expect(screen.getByText('1 staged change')).toBeTruthy(); // ops intact
    expect(screen.queryByRole('alert', { name: 'Save conflict' })).toBeNull(); // not treated as a 409 conflict
  });

  it('a 409 on save renders the ConflictPanel; Reload discards staged ops', async () => {
    saveStatus = 409;
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    await stageOneAddExit();
    fireEvent.click(screen.getByRole('button', { name: 'Save (1)' }));
    await screen.findByText('Preview — exact file that would be written');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm save' }));

    const conflictPanel = await screen.findByRole('alert', { name: 'Save conflict' });
    expect(conflictPanel).toBeTruthy();
    expect(screen.getByText('1 staged change')).toBeTruthy(); // ops intact through the conflict

    saveStatus = 200; // disk is "clean" for the reload's refetch
    fireEvent.click(screen.getByRole('button', { name: /Reload from disk/ }));

    await waitFor(() => expect(screen.queryByRole('alert', { name: 'Save conflict' })).toBeNull());
    expect(screen.queryByText(/staged change/)).toBeNull();
    confirmSpy.mockRestore();
  });

  it('a 409 on save — Save anyway overwrites unconditionally (no baseHash on the retry)', async () => {
    saveStatus = 409;
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    await stageOneAddExit();
    fireEvent.click(screen.getByRole('button', { name: 'Save (1)' }));
    await screen.findByText('Preview — exact file that would be written');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm save' }));
    await screen.findByRole('alert', { name: 'Save conflict' });

    saveStatus = 200;
    let lastPutBody: { area: unknown; baseHash?: string } | null = null;
    (globalThis.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/areas/tiny.are') && init?.method === 'PUT') {
        lastPutBody = JSON.parse(String(init.body));
        return json({ saved: true, backupPath: '/backups/tiny.are.bak', hash: 'h3' });
      }
      if (url.endsWith('/api/areas/tiny.are')) return json({ file: 'tiny.are', area: SAVE_AREA, baseHash: 'h1' });
      if (url.endsWith('/api/map/tiny.are')) return json(SAVE_MAP);
      throw new Error(`unexpected fetch ${url}`);
    });

    fireEvent.click(screen.getByRole('button', { name: /Save anyway/ }));

    await waitFor(() => expect(screen.queryByRole('alert', { name: 'Save conflict' })).toBeNull());
    // Unconditional retry: no baseHash, but the STAGED edit (not the stale base) is what gets saved.
    if (!lastPutBody) throw new Error('expected the retry PUT to have been sent');
    expect('baseHash' in lastPutBody).toBe(false);
    const rooms = (lastPutBody as { area: { sections: { rooms: { exits: unknown[] }[] }[] } }).area.sections[0].rooms;
    expect(rooms[0].exits).toHaveLength(1);
    confirmSpy.mockRestore();
  });
});
