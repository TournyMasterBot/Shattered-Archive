import { buildIndex } from '../hierarchy.js';
import { LIMITS } from '../schema.js';
import { validateMapFile } from '../validate.js';
import { room, sampleMap, seeded } from '../testing/fixtures.js';
import {
  addRoomToLayer,
  emptyLayer,
  layerOfArea,
  layerRooms,
  mergeLayer,
  removeRoomFromLayer,
  searchLayer,
  slugOf,
  type AddRoomSpec,
} from './layer.js';

const AT = '2026-11-12';

function spec(extra: Partial<AddRoomSpec> = {}): AddRoomSpec {
  return {
    title: 'The House of Arms',
    sector: 'inside',
    place: { continentId: 'c1', continent: 'Test Continent', areaId: 'town', area: 'Town', subzone: 'Armoury' },
    exits: { N: 'r3', S: null },
    source: 'manual',
    at: AT,
    ...extra,
  };
}

describe('slugOf', () => {
  it('lower-cases, joins runs of other characters with one hyphen and trims', () => {
    expect(slugOf("  The Hall of Kings' Rest!! ")).toBe('the-hall-of-kings-rest');
  });
  it('cuts at 40 characters without leaving a trailing hyphen, and never answers empty', () => {
    expect(slugOf('a'.repeat(39) + ' b')).toBe('a'.repeat(39));
    expect(slugOf('???')).toBe('x');
    expect(slugOf(undefined as unknown as string)).toBe('x');
  });
});

describe('addRoomToLayer', () => {
  it('files a room under an existing area and a new subzone, with its exits as links', () => {
    const r = addRoomToLayer(emptyLayer(), spec(), seeded(1), new Set(['r1']));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const index = buildIndex(r.map);
    const added = index.rooms.get(r.roomId);
    expect(added).toMatchObject({ areaId: 'town', continentId: 'c1', subzoneId: 's-armoury' });
    expect(added?.room).toMatchObject({ title: 'The House of Arms', sector: 'inside', sources: [{ kind: 'manual', date: AT }] });
    expect(r.map.links.map((l) => [l.dir, l.to, l.state, l.confidence])).toEqual([
      ['N', 'r3', 'candidate', 0.6],
      ['S', null, 'unknown-target', 0],
    ]);
    expect(Object.keys(added?.room.exits ?? {})).toEqual(['N', 'S']);
  });

  it('makes new continent, area and subzone ids from the names, and puts a second room in the same ones', () => {
    const place = { continent: 'The Far Isles', area: 'Mist Harbour', subzone: 'Docks' };
    const a = addRoomToLayer(emptyLayer(), spec({ place, exits: {} }), seeded(2));
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = addRoomToLayer(a.map, spec({ title: 'Pier', place, exits: { W: a.roomId } }), seeded(3));
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.map.continents.map((c) => [c.id, c.areas.map((x) => [x.id, x.subzones.map((s) => [s.id, s.rooms.length])])])).toEqual([
      ['c-the-far-isles', [['a-mist-harbour', [['s-docks', 2]]]]],
    ]);
    expect(layerRooms(b.map).map((x) => x.title)).toEqual(['The House of Arms', 'Pier']);
  });

  it('keeps a description and trims the title; the input layer is not changed', () => {
    const before = emptyLayer();
    const r = addRoomToLayer(before, spec({ title: '  The   House   of Arms ', description: ' A long\n room. ', sector: ' ' }), seeded(4));
    expect(before.continents).toEqual([]);
    if (!r.ok) throw new Error('expected ok');
    const added = buildIndex(r.map).rooms.get(r.roomId)?.room;
    expect(added?.title).toBe('The House of Arms');
    expect(added?.description).toBe('A long room.');
    expect(added?.sector).toBeUndefined();
  });

  it('refuses what cannot be filed, and says why', () => {
    expect(addRoomToLayer(emptyLayer(), spec({ title: ' ' }), seeded(1))).toEqual({ ok: false, reason: 'The room needs a title.' });
    const noArea = spec({ place: { continent: 'C', area: '', subzone: 'S' } });
    expect(addRoomToLayer(emptyLayer(), noArea, seeded(1))).toEqual({ ok: false, reason: 'The room needs a continent, an area and a subzone.' });
    const badId = spec({ place: { continentId: 'Not An Id', continent: 'C', area: 'A', subzone: 'S' } });
    expect(addRoomToLayer(emptyLayer(), badId, seeded(1))).toEqual({ ok: false, reason: 'A chosen place has an id that is not valid.' });
    const badDir = spec({ exits: { UP: null } as unknown as AddRoomSpec['exits'] });
    expect(addRoomToLayer(emptyLayer(), badDir, seeded(1))).toEqual({ ok: false, reason: '"UP" is not a direction.' });
  });

  it('refuses when the layer already holds the most rooms a file may', () => {
    const full = emptyLayer();
    full.continents.push({
      id: 'c',
      name: 'C',
      areas: [{ id: 'a', name: 'A', placement: null, subzones: [{ id: 's', name: 'S', kind: 'consistent', rooms: [] }] }],
    });
    const rooms = full.continents[0].areas[0].subzones[0].rooms;
    for (let i = 0; i < LIMITS.maxRooms; i += 1) rooms.push(room(`x${i}`, 'x'));
    expect(addRoomToLayer(full, spec(), seeded(1))).toEqual({ ok: false, reason: 'The layer is full.' });
  });
});

describe('the layer on its own', () => {
  it('is a map file the strict reader accepts: an exit to a published room is off the page, an exit to a layer room is not', () => {
    const first = addRoomToLayer(emptyLayer(), spec({ title: 'Annex', exits: { N: 'r3' } }), seeded(40));
    if (!first.ok) throw new Error('setup');
    const second = addRoomToLayer(first.map, spec({ title: 'Store', exits: { E: first.roomId, W: null } }), seeded(41));
    if (!second.ok) throw new Error('setup');
    expect(second.map.links.map((l) => [l.dir, l.offPage])).toEqual([['N', true], ['E', false], ['W', false]]);
    expect(validateMapFile(second.map).ok).toBe(true);
  });

  it('stays valid when a room that another room' + 's exit led to is removed: that exit becomes an unknown target', () => {
    const first = addRoomToLayer(emptyLayer(), spec({ title: 'Annex', exits: {} }), seeded(42));
    if (!first.ok) throw new Error('setup');
    const second = addRoomToLayer(first.map, spec({ title: 'Store', exits: { E: first.roomId, W: 'r3' } }), seeded(43));
    if (!second.ok) throw new Error('setup');
    const after = removeRoomFromLayer(second.map, first.roomId);
    expect(after.links.map((l) => [l.dir, l.to, l.state, l.confidence])).toEqual([['E', null, 'unknown-target', 0], ['W', 'r3', 'candidate', 0.6]]);
    expect(validateMapFile(after).ok).toBe(true);
  });
});

describe('the layer as a list', () => {
  const built = (): ReturnType<typeof emptyLayer> => {
    let layer = emptyLayer();
    for (const [i, title] of ['The House of Arms', 'The Armoury Yard', 'Dock Road'].entries()) {
      const place = i < 2 ? { areaId: 'town', continentId: 'c1', continent: 'Test Continent', area: 'Town', subzone: 'Armoury' } : { continent: 'Isles', area: 'Harbour', subzone: 'Docks' };
      const r = addRoomToLayer(layer, spec({ title, place, exits: {} }), seeded(10 + i));
      if (!r.ok) throw new Error('setup');
      layer = r.map;
    }
    return layer;
  };

  it('lists every room with its place, and searches titles ignoring case and spacing', () => {
    const layer = built();
    expect(layerRooms(layer).map((r) => [r.title, r.areaId, r.areaName, r.continentId, r.subzoneId])).toEqual([
      ['The House of Arms', 'town', 'Town', 'c1', 's-armoury'],
      ['The Armoury Yard', 'town', 'Town', 'c1', 's-armoury'],
      ['Dock Road', 'a-harbour', 'Harbour', 'c-isles', 's-docks'],
    ]);
    expect(searchLayer(layer, 'ARMOURY  yard').map((r) => r.title)).toEqual(['The Armoury Yard']);
    expect(searchLayer(layer, 'the').length).toBe(2);
    expect(searchLayer(layer, '   ')).toEqual([]);
  });

  it('keeps only the part filed under one area, with the links of its rooms', () => {
    const layer = built();
    const town = layerOfArea(layer, 'town');
    expect(town && layerRooms(town).map((r) => r.title)).toEqual(['The House of Arms', 'The Armoury Yard']);
    expect(layerOfArea(layer, 'nowhere')).toBeNull();
    const withExit = addRoomToLayer(layer, spec({ title: 'Annex' }), seeded(30));
    if (!withExit.ok) throw new Error('setup');
    expect(layerOfArea(withExit.map, 'town')?.links.map((l) => l.dir)).toEqual(['N', 'S']);
    expect(layerOfArea(withExit.map, 'a-harbour')?.links).toEqual([]);
  });

  it('removes a room with its exits, and the empty subzone, area and continent with it', () => {
    const layer = built();
    const dock = layerRooms(layer).find((r) => r.title === 'Dock Road')!;
    const without = removeRoomFromLayer(layer, dock.roomId);
    expect(without.continents.map((c) => c.id)).toEqual(['c1']);
    const withExit = addRoomToLayer(without, spec({ title: 'Annex' }), seeded(31));
    if (!withExit.ok) throw new Error('setup');
    const gone = removeRoomFromLayer(withExit.map, withExit.roomId);
    expect(gone.links).toEqual([]);
    expect(layerRooms(gone).length).toBe(2);
    expect(removeRoomFromLayer(layer, 'nope')).toEqual(layer);
  });
});

describe('mergeLayer', () => {
  function layerWith(extra: Partial<AddRoomSpec> = {}) {
    const r = addRoomToLayer(emptyLayer(), spec(extra), seeded(5), new Set(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']));
    if (!r.ok) throw new Error('setup');
    return { layer: r.map, roomId: r.roomId };
  }

  it('puts the room into the published area and next to the room its exit leads to, and the result is a valid map', () => {
    const base = sampleMap();
    const { layer, roomId } = layerWith({ exits: { N: 'r3' }, place: { continentId: 'c1', continent: 'Test Continent', areaId: 'town', area: 'Town', subzoneId: 'town-main', subzone: 'Main' } });
    const merged = mergeLayer(base, layer);
    const added = buildIndex(merged).rooms.get(roomId);
    expect(added?.subzoneId).toBe('town-main');
    expect(added?.room.coords).toBeDefined();
    expect(added?.room.coords).not.toEqual(buildIndex(merged).rooms.get('r3')?.room.coords);
    expect(validateMapFile(merged).ok).toBe(true);
    // the published map was not touched
    expect(buildIndex(base).rooms.has(roomId)).toBe(false);
    expect(base.links.length).toBe(7);
  });

  it('adds a new subzone, area and continent that the published map lacks', () => {
    const base = sampleMap();
    const { layer, roomId } = layerWith({ exits: {}, place: { continent: 'Isles', area: 'Harbour', subzone: 'Docks' } });
    const merged = mergeLayer(base, layer);
    expect(buildIndex(merged).rooms.get(roomId)).toMatchObject({ areaId: 'a-harbour', continentId: 'c-isles', subzoneId: 's-docks' });
    expect(validateMapFile(merged).ok).toBe(true);
  });

  it('marks an exit to a room of another area or of no loaded area as off the page, and one inside the area as not', () => {
    const base = sampleMap();
    const inside = layerWith({ exits: { N: 'r3' } });
    expect(mergeLayer(base, inside.layer).links.find((l) => l.from === inside.roomId)?.offPage).toBe(false);
    const other = layerWith({ exits: { N: 'r6' } }); // r6 is in the forest area
    expect(mergeLayer(base, other.layer).links.find((l) => l.from === other.roomId)?.offPage).toBe(true);
    const missing = layerWith({ exits: { N: 'elsewhere' } });
    expect(mergeLayer(base, missing.layer).links.find((l) => l.from === missing.roomId)?.offPage).toBe(true);
    const unknown = layerWith({ exits: { N: null } });
    expect(mergeLayer(base, unknown.layer).links.find((l) => l.from === unknown.roomId)?.offPage).toBe(false);
  });

  it('skips a layer room whose id the published map has, and merging twice changes nothing more', () => {
    const base = sampleMap();
    const { layer } = layerWith();
    const clash = { ...layer, continents: layer.continents.map((c) => ({ ...c, areas: c.areas.map((a) => ({ ...a, subzones: a.subzones.map((s) => ({ ...s, rooms: s.rooms.map((r) => ({ ...r, id: 'r1' })) })) })) })) };
    expect(buildIndex(mergeLayer(base, clash)).rooms.get('r1')?.room.title).toBe('Market Square');
    const once = mergeLayer(base, layer);
    expect(mergeLayer(once, layer)).toEqual(once);
  });

  it('keeps the published link when a layer link carries the same id', () => {
    const base = sampleMap();
    const { layer } = layerWith({ exits: { N: 'r3' } });
    const clash = { ...layer, links: layer.links.map((l) => ({ ...l, id: 'l-r1-s' })) };
    const merged = mergeLayer(base, clash);
    expect(merged.links.filter((l) => l.id === 'l-r1-s')).toEqual(base.links.filter((l) => l.id === 'l-r1-s'));
  });

  it('returns a copy of the published map when the layer is empty', () => {
    const base = sampleMap();
    const same = mergeLayer(base, emptyLayer());
    expect(same).toEqual(base);
    expect(same).not.toBe(base);
  });
});
