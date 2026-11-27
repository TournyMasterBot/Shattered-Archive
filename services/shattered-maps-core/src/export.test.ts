import { exportNeutral, exportNeutralJson } from './export.js';
import { sliceMap } from './hierarchy.js';
import { updateBaseline } from './baseline.js';
import type { MapFile, Room } from './schema.js';
import { area, link, room, sampleMap, subzone } from './testing/fixtures.js';

function tiny(): MapFile {
  return {
    version: 1,
    continents: [
      {
        id: 'c1',
        name: 'C',
        areas: [
          area('a1', [
            subzone('s1', [
              room('ra', 'Alpha', {
                sector: 'city',
                coords: { x: 1, y: 0, z: 0 },
                exits: { E: 'l1' },
                history: [{ at: '2026-11-07', op: 'create' }],
              }),
              room('rb', 'Beta', { coords: { x: 0, y: 0 }, exits: { W: 'l2' } }),
            ]),
          ]),
        ],
      },
    ],
    links: [
      link('l1', 'ra', 'E', 'rb', { state: 'confirmed', confidence: 0.95, reverse: true }),
      link('l2', 'rb', 'W', 'ra', { state: 'confirmed', confidence: 0.95, reverse: true }),
    ],
  };
}

describe('exportNeutral', () => {
  it('writes a stable neutral grid: cells by floor, row and column, exits in direction order', () => {
    const slice = sliceMap(sampleMap(), 'area', 'town');
    const out = exportNeutral(slice!, 'grid');
    expect(out.format).toBe('shattered-maps-neutral');
    expect(out.layout).toBe('grid');
    expect(out.cells.map((c) => c.id)).toEqual(['r5', 'r1', 'r2', 'r3', 'r4']);
    expect(out.bounds).toEqual({ minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: -1, maxZ: 0 });
    const r1 = out.cells.find((c) => c.id === 'r1');
    expect(r1?.exits.map((e) => e.dir)).toEqual(['N', 'E', 'S']);
    expect(r1?.exits[0]).toEqual({ dir: 'N', to: null, state: 'unknown-target', confidence: 0, offPage: false });
    expect(r1?.exits[1]).toEqual({ dir: 'E', to: 'r2', state: 'confirmed', confidence: 0.95, offPage: false });
    expect(out.cells.find((c) => c.id === 'r4')?.exits[0]).toMatchObject({ dir: 'E', to: 'r6', offPage: true });
    expect(out.unsupportedExits).toEqual([]);
    expect(out.unplaced).toEqual([]);
    expect(out.areas).toEqual([]);
  });

  it('gives the same text for the same slice, and exact text for a two-room slice', () => {
    const slice = sliceMap(tiny(), 'subzone', 's1')!;
    const a = exportNeutralJson(slice, 'grid');
    expect(exportNeutralJson(slice, 'grid')).toBe(a);
    expect(a.endsWith('}\n')).toBe(true);
    expect(JSON.parse(a)).toEqual({
      format: 'shattered-maps-neutral',
      version: 1,
      layout: 'grid',
      level: 'subzone',
      id: 's1',
      title: 'Area a1: Subzone s1',
      bounds: { minX: 0, maxX: 1, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
      cells: [
        {
          id: 'rb',
          title: 'Beta',
          sector: null,
          x: 0,
          y: 0,
          z: 0,
          exits: [{ dir: 'W', to: 'ra', state: 'confirmed', confidence: 0.95, offPage: false }],
          fixtures: [],
        },
        {
          id: 'ra',
          title: 'Alpha',
          sector: 'city',
          x: 1,
          y: 0,
          z: 0,
          exits: [{ dir: 'E', to: 'rb', state: 'confirmed', confidence: 0.95, offPage: false }],
          fixtures: [],
        },
      ],
      unplaced: [],
      unsupportedExits: [],
      areas: [],
    });
    // the keys come out in a fixed order, so the text itself is stable
    expect(a.indexOf('"format"')).toBeLessThan(a.indexOf('"cells"'));
    expect(a.split('\n')[1]).toBe('  "format": "shattered-maps-neutral",');
  });

  it('leaves the file internals out: history, sources, ids of links', () => {
    const text = exportNeutralJson(sliceMap(tiny(), 'subzone', 's1')!, 'grid');
    for (const word of ['history', 'sources', 'undo', 'traversals', '"l1"', 'aliasOf'])
      expect(text).not.toContain(word);
  });

  it('lists the fixtures a room is expected to hold, and not the transient sightings', () => {
    const map = tiny();
    let baseline = updateBaseline(undefined, {
      day: '2026-11-01',
      entries: [
        { label: 'a fountain', kind: 'item' },
        { label: 'a wandering cat', kind: 'mob' },
      ],
    });
    for (const day of ['2026-11-01', '2026-11-02', '2026-11-02', '2026-11-03'])
      baseline = updateBaseline(baseline, { day, entries: [{ label: 'a fountain', kind: 'item' }] });
    (map.continents[0].areas[0].subzones[0].rooms[0] as Room).baseline = baseline;
    const out = exportNeutral(sliceMap(map, 'subzone', 's1')!, 'grid');
    expect(out.cells.find((c) => c.id === 'ra')?.fixtures).toEqual(['a fountain']);
  });

  it('hex: reads x and y as axial q and r, and lists the east and west exits it cannot show', () => {
    const out = exportNeutral(sliceMap(tiny(), 'subzone', 's1')!, 'hex');
    expect(out.layout).toBe('hex');
    expect(out.cells.map((c) => [c.id, c.x, c.y])).toEqual([
      ['rb', 0, 0],
      ['ra', 1, 0],
    ]);
    expect(out.unsupportedExits).toEqual([
      { room: 'ra', dir: 'E' },
      { room: 'rb', dir: 'W' },
    ]);
  });

  it('hex: lists both unsupported exits of one room, east before west', () => {
    const map = tiny();
    const ra = map.continents[0].areas[0].subzones[0].rooms[0];
    ra.exits = { E: 'l1', W: 'l3' };
    map.links.push(link('l3', 'ra', 'W', null));
    expect(exportNeutral(sliceMap(map, 'subzone', 's1')!, 'hex').unsupportedExits).toEqual([
      { room: 'ra', dir: 'E' },
      { room: 'ra', dir: 'W' },
      { room: 'rb', dir: 'W' },
    ]);
  });

  it('puts rooms with no coordinates in `unplaced`, not in the cells, and has no bounds when nothing is placed', () => {
    const map = tiny();
    const rooms = map.continents[0].areas[0].subzones[0].rooms;
    delete rooms[0].coords;
    const one = exportNeutral(sliceMap(map, 'subzone', 's1')!, 'grid');
    expect(one.cells.map((c) => c.id)).toEqual(['rb']);
    expect(one.unplaced).toEqual(['ra']);
    delete rooms[1].coords;
    const none = exportNeutral(sliceMap(map, 'subzone', 's1')!, 'grid');
    expect(none.bounds).toBeNull();
    expect(none.cells).toEqual([]);
    expect(none.unplaced).toEqual(['ra', 'rb']);
  });

  it('continent: the areas with their placements, sorted by id, and no cells', () => {
    const out = exportNeutral(sliceMap(sampleMap(), 'continent', 'c1')!, 'grid');
    expect(out.cells).toEqual([]);
    expect(out.bounds).toBeNull();
    expect(out.areas.map((a) => a.id)).toEqual(['forest', 'town']);
    expect(out.areas[1]).toMatchObject({ id: 'town', placement: { x: 0, y: 0, w: 2, h: 1 }, rooms: 5 });
  });

  it('sorts rooms that share a cell by id, and reads a missing floor as 0', () => {
    const map = tiny();
    const rooms = map.continents[0].areas[0].subzones[0].rooms;
    rooms[1].coords = { x: 1, y: 0 };
    rooms[0].coords = { x: 1, y: 0, z: 0 };
    expect(exportNeutral(sliceMap(map, 'subzone', 's1')!, 'grid').cells.map((c) => c.id)).toEqual(['ra', 'rb']);
  });
});
