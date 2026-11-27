import { buildIndex, DIRECTION_OFFSET, resolveAlias, sliceMap, updateRoom } from './hierarchy.js';
import { DIRECTIONS, type MapFile, type Room } from './schema.js';
import { room, sampleMap } from './testing/fixtures.js';

function allRooms(map: MapFile): Room[] {
  return map.continents.flatMap((c) => c.areas.flatMap((a) => a.subzones.flatMap((s) => s.rooms)));
}

describe('buildIndex', () => {
  const index = buildIndex(sampleMap());

  it('finds every room with the subzone, area and continent it sits in', () => {
    expect(index.rooms.size).toBe(6);
    expect(index.rooms.get('r2')).toMatchObject({ subzoneId: 'town-main', areaId: 'town', continentId: 'c1' });
    expect(index.rooms.get('r6')).toMatchObject({ subzoneId: 'forest-main', areaId: 'forest' });
    expect(index.areas.get('town')?.continentId).toBe('c1');
  });

  it('finds links by id and by the room they start at', () => {
    expect(index.links.size).toBe(7);
    expect(index.linksFrom.get('r1')?.map((l) => l.id)).toEqual(['l-r1-e', 'l-r1-s', 'l-r1-n']);
    expect(index.linksFrom.get('r6')).toBeUndefined();
  });
});

describe('updateRoom', () => {
  it('replaces one room, shares everything else, and leaves the original alone', () => {
    const map = sampleMap();
    const snapshot = JSON.stringify(map);
    const next = updateRoom(map, 'r3', (r) => ({ ...r, title: 'New Well', description: 'A well.' }));
    const rooms = allRooms(next);
    expect(rooms.find((r) => r.id === 'r3')).toMatchObject({ title: 'New Well', description: 'A well.' });
    expect(rooms.filter((r) => r.title === 'New Well')).toHaveLength(1);
    expect(next.links).toBe(map.links);
    expect(next.continents[0].areas[0].subzones[0].rooms[0]).toBe(map.continents[0].areas[0].subzones[0].rooms[0]);
    expect(next.continents[0].areas[1]).not.toBe(map.continents[0].areas[1]); // copied on the way, but with the same rooms
    expect(next.continents[0].areas[1].subzones[0].rooms[0]).toBe(map.continents[0].areas[1].subzones[0].rooms[0]);
    expect(JSON.stringify(map)).toBe(snapshot);
  });

  it('gives back the same map when the room is not in it', () => {
    const map = sampleMap();
    const calls: string[] = [];
    expect(
      updateRoom(map, 'ghost', (r) => {
        calls.push(r.id);
        return r;
      }),
    ).toBe(map);
    expect(calls).toEqual([]);
  });
});

describe('resolveAlias', () => {
  it('returns a live room as it is, and null for an unknown id', () => {
    const index = buildIndex(sampleMap());
    expect(resolveAlias(index, 'r1')).toBe('r1');
    expect(resolveAlias(index, 'ghost')).toBeNull();
  });

  it('follows a chain of merges to the live room', () => {
    const map = sampleMap();
    const rooms = allRooms(map);
    (rooms.find((r) => r.id === 'r3') as Room).aliasOf = 'r4';
    (rooms.find((r) => r.id === 'r4') as Room).aliasOf = 'r5';
    expect(resolveAlias(buildIndex(map), 'r3')).toBe('r5');
  });

  it('gives up on a loop, a chain that is too long and an alias to nowhere', () => {
    const map = sampleMap();
    const rooms = allRooms(map);
    (rooms.find((r) => r.id === 'r3') as Room).aliasOf = 'r4';
    (rooms.find((r) => r.id === 'r4') as Room).aliasOf = 'r3';
    expect(resolveAlias(buildIndex(map), 'r3')).toBeNull();
    (rooms.find((r) => r.id === 'r5') as Room).aliasOf = 'ghost';
    expect(resolveAlias(buildIndex(map), 'r5')).toBeNull();
    const long = sampleMap();
    const zone = long.continents[0].areas[0].subzones[0];
    for (let i = 0; i < 20; i += 1) zone.rooms.push(room(`t${i}`, `T${i}`, { aliasOf: i === 19 ? 'r1' : `t${i + 1}` }));
    expect(resolveAlias(buildIndex(long), 't0')).toBeNull();
  });
});

describe('DIRECTION_OFFSET', () => {
  it('moves north up and south down the grid, and up and down between floors', () => {
    expect(DIRECTION_OFFSET.N).toEqual({ dx: 0, dy: -1, dz: 0 });
    expect(DIRECTION_OFFSET.SE).toEqual({ dx: 1, dy: 1, dz: 0 });
    expect(DIRECTION_OFFSET.U.dz).toBe(1);
    expect(DIRECTION_OFFSET.D.dz).toBe(-1);
    for (const d of DIRECTIONS) expect(Object.keys(DIRECTION_OFFSET[d]).sort()).toEqual(['dx', 'dy', 'dz']);
  });
});

describe('sliceMap', () => {
  const map = sampleMap();

  it('area: the live rooms, the links that start in them, and which ones leave the slice', () => {
    const slice = sliceMap(map, 'area', 'town');
    expect(slice).not.toBeNull();
    expect(slice?.title).toBe('Area town');
    expect(slice?.rooms.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(slice?.links.map((l) => l.id).sort()).toEqual([
      'l-r1-e',
      'l-r1-n',
      'l-r1-s',
      'l-r2-s',
      'l-r2-w',
      'l-r3-d',
      'l-r4-e',
    ]);
    expect(slice?.links.filter((l) => l.offPage).map((l) => l.id)).toEqual(['l-r4-e']);
    expect(slice?.links.find((l) => l.id === 'l-r1-n')?.offPage).toBe(false); // an exit with no target is not off the page
    expect(slice?.unplaced).toEqual([]);
    expect(slice?.derivedCoords).toBe(false);
  });

  it('area: an area whose rooms start no links has none, even when other areas link to it', () => {
    expect(sliceMap(map, 'area', 'forest')?.links).toEqual([]);
  });

  it('area: offPage is worked out against the slice, not copied from the file', () => {
    const edited = structuredCloneMap(map);
    edited.links.find((l) => l.id === 'l-r4-e')!.offPage = false; // the file says on the page; the slice does not hold r6
    expect(sliceMap(edited, 'area', 'town')?.links.find((l) => l.id === 'l-r4-e')?.offPage).toBe(true);
    edited.links.find((l) => l.id === 'l-r1-e')!.offPage = true; // the file says off the page; both ends are in the slice
    expect(sliceMap(edited, 'area', 'town')?.links.find((l) => l.id === 'l-r1-e')?.offPage).toBe(false);
  });

  it('area: leaves out merged-away rooms and lists rooms without coordinates as unplaced', () => {
    const edited = structuredCloneMap(map);
    const rooms = allRooms(edited);
    (rooms.find((r) => r.id === 'r5') as Room).aliasOf = 'r3';
    (rooms.find((r) => r.id === 'r5') as Room).exits = {};
    delete (rooms.find((r) => r.id === 'r4') as Room).coords;
    edited.links = edited.links.filter((l) => l.id !== 'l-r3-d');
    (rooms.find((r) => r.id === 'r3') as Room).exits = {};
    const slice = sliceMap(edited, 'area', 'town');
    expect(slice?.rooms.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(slice?.unplaced).toEqual(['r4']);
  });

  it('subzone: its rooms, titled with the area and the subzone', () => {
    const slice = sliceMap(map, 'subzone', 'forest-main');
    expect(slice?.title).toBe('Area forest: Subzone forest-main');
    expect(slice?.rooms.map((r) => r.id)).toEqual(['r6']);
    expect(slice?.links.map((l) => l.id)).toEqual([]);
  });

  it('continent: the areas with their written placements and live room counts, and no rooms', () => {
    const slice = sliceMap(map, 'continent', 'c1');
    expect(slice?.title).toBe('Test Continent');
    expect(slice?.rooms).toEqual([]);
    expect(slice?.links).toEqual([]);
    expect(slice?.areas).toEqual([
      { id: 'town', name: 'Area town', placement: { x: 0, y: 0, w: 2, h: 1 }, rooms: 5 },
      { id: 'forest', name: 'Area forest', placement: null, rooms: 1 },
    ]);
  });

  it('room: the room and the rooms its exits reach, laid out by the direction of the exit', () => {
    const slice = sliceMap(map, 'room', 'r1');
    expect(slice?.rooms.map((r) => [r.id, r.coords])).toEqual([
      ['r1', { x: 0, y: 0, z: 0 }],
      ['r2', { x: 1, y: 0, z: 0 }],
      ['r3', { x: 0, y: 1, z: 0 }],
    ]);
    expect(slice?.derivedCoords).toBe(true);
    expect(slice?.rooms.every((r) => r.context !== true)).toBe(true);
    // r1 north is an exit with no known target, so nothing is placed there; the neighbours bring only the link back to the view
    // (r2 west to r1), not their own exits to rooms that are not shown
    expect(slice?.links.map((l) => [l.id, l.offPage])).toEqual([
      ['l-r1-e', false],
      ['l-r1-s', false],
      ['l-r1-n', false],
      ['l-r2-w', false],
    ]);
  });

  it('room: a neighbour in another area is shown as context, and the link to it leaves the slice only when it is not there', () => {
    const slice = sliceMap(map, 'room', 'r4');
    expect(slice?.rooms.map((r) => [r.id, r.context ?? false])).toEqual([
      ['r4', false],
      ['r6', true],
    ]);
    expect(slice?.rooms[1].coords).toEqual({ x: 2, y: 1, z: 0 });
  });

  it('room: a floor below is one step down, and a focus with no coordinates starts at the origin', () => {
    const below = sliceMap(map, 'room', 'r3');
    expect(below?.rooms[1]).toMatchObject({ id: 'r5', coords: { x: 0, y: 1, z: -1 } });
    const bare = structuredCloneMap(map);
    delete (allRooms(bare).find((r) => r.id === 'r3') as Room).coords;
    const slice = sliceMap(bare, 'room', 'r3');
    expect(slice?.rooms[0].coords).toEqual({ x: 0, y: 0, z: 0 });
    expect(slice?.rooms[1].coords).toEqual({ x: 0, y: 0, z: -1 });
    expect(slice?.derivedCoords).toBe(true);
  });

  it('room: a focus with coordinates but no floor is on floor 0', () => {
    const flat = structuredCloneMap(map);
    (allRooms(flat).find((r) => r.id === 'r3') as Room).coords = { x: 4, y: 4 };
    const slice = sliceMap(flat, 'room', 'r3');
    expect(slice?.rooms[1]).toMatchObject({ id: 'r5', coords: { x: 4, y: 4, z: -1 } });
  });

  it('room: a room with nothing reachable is just itself, and a neighbour is not listed twice', () => {
    const slice = sliceMap(map, 'room', 'r6');
    expect(slice?.rooms.map((r) => r.id)).toEqual(['r6']);
    expect(slice?.derivedCoords).toBe(false);
    const twice = structuredCloneMap(map);
    twice.links.push({ ...twice.links[2], id: 'l-r1-se', dir: 'SE' });
    (allRooms(twice).find((r) => r.id === 'r1') as Room).exits.SE = 'l-r1-se';
    expect(sliceMap(twice, 'room', 'r1')?.rooms.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
  });

  it('room: skips an exit whose target is missing or merged away', () => {
    const edited = structuredCloneMap(map);
    (allRooms(edited).find((r) => r.id === 'r2') as Room).aliasOf = 'r1';
    expect(sliceMap(edited, 'room', 'r1')?.rooms.map((r) => r.id)).toEqual(['r1', 'r3']);
    edited.links.find((l) => l.id === 'l-r1-s')!.to = 'ghost';
    expect(sliceMap(edited, 'room', 'r1')?.rooms.map((r) => r.id)).toEqual(['r1']);
  });

  it('is null for an id that is not there at that level, and for a merged-away focus', () => {
    for (const level of ['continent', 'area', 'subzone', 'room'] as const)
      expect(sliceMap(map, level, 'ghost')).toBeNull();
    expect(sliceMap(map, 'area', 'c1')).toBeNull();
    const edited = structuredCloneMap(map);
    (allRooms(edited).find((r) => r.id === 'r6') as Room).aliasOf = 'r1';
    expect(sliceMap(edited, 'room', 'r6')).toBeNull();
  });

  it('does not change the map', () => {
    const copy = structuredCloneMap(map);
    sliceMap(map, 'room', 'r1');
    sliceMap(map, 'area', 'town');
    expect(map).toEqual(copy);
  });
});

function structuredCloneMap(map: MapFile): MapFile {
  return JSON.parse(JSON.stringify(map)) as MapFile;
}
