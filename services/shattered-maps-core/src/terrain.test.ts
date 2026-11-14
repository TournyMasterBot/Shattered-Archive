import type { MapFile } from './schema.js';
import { sampleMap } from './testing/fixtures.js';
import { applyTerrain, decideTerrain, emptyTally, mergeTallies, parseRoomData, titleKey, tallyRoomData } from './terrain.js';
import { canonicalSector, TERRAIN, terrainFill } from './terrainPalette.js';

const record = (data: string) => JSON.stringify({ type: 'game:remote-server:gmcp', subtype: 'gmcp', payload: { type: 'gmcp', data } });
const roomData = (room: string, sector: string, exits: string[] = ['S']) => `room_data ${JSON.stringify({ room, sector, exits })}`;

describe('the palette', () => {
  it('has one colour for each terrain, written once, and a name for the key', () => {
    expect(new Set(TERRAIN.map((t) => t.sector)).size).toBe(TERRAIN.length);
    for (const t of TERRAIN) {
      expect(t.fill).toMatch(/^#[0-9A-F]{6}$/);
      expect(t.label).not.toBe('');
    }
  });

  it('knows every sector word the DSL sends (and the Merc words of the Simulacrum)', () => {
    for (const word of ['inside', 'forest', 'field', 'city', 'air', 'desert', 'underwater', 'underground', 'mountain', 'tundra', 'hills', 'ice', 'ocean', 'swim', 'noswim', 'water', 'deepwater'])
      expect(terrainFill(word)).not.toBeNull();
  });

  it('folds spellings, and never reads a prototype key as a terrain', () => {
    expect(canonicalSector('  Water   NoSwim ')).toBe('noswim');
    expect(canonicalSector('Fields')).toBe('field');
    expect(canonicalSector('indoors')).toBe('inside');
    expect(canonicalSector('very icy')).toBe('ice');
    expect(canonicalSector('   ')).toBeNull();
    expect(canonicalSector(7)).toBeNull();
    expect(canonicalSector('__proto__')).toBe('__proto__');
    expect(terrainFill('__proto__')).toBeNull();
    expect(terrainFill('constructor')).toBeNull();
    expect(terrainFill('unknown')).toBeNull();
    expect(terrainFill(undefined)).toBeNull();
    expect(terrainFill('City')).toBe('#7E8796');
  });

  it('compares titles without case or spacing', () => {
    expect(titleKey('  The  Temple\tOf Mota ')).toBe('the temple of mota');
  });
});

describe('parseRoomData', () => {
  it('reads the message out of a game-server log record', () => {
    expect(parseRoomData(record(roomData('The Library of Storm Keep', 'inside')))).toEqual({ room: 'The Library of Storm Keep', sector: 'inside', exits: ['S'] });
  });

  it('reads a bare room_data line, and drops exits that are not words', () => {
    expect(parseRoomData(`  room_data {"room":"A","sector":"city","exits":["N",3,"E"]}`)).toEqual({ room: 'A', sector: 'city', exits: ['N', 'E'] });
    expect(parseRoomData('room_data {"room":"A","sector":"city"}')?.exits).toEqual([]);
  });

  it('is null for a line that holds no usable message', () => {
    expect(parseRoomData('You are standing in a room.')).toBeNull();
    expect(parseRoomData(record('char_data {"hp": 5}'))).toBeNull();
    expect(parseRoomData(record(JSON.stringify({ not: 'a string' })))).toBeNull();
    expect(parseRoomData('{"payload":{"data":5}} room_data')).toBeNull();
    expect(parseRoomData('{ room_data broken json')).toBeNull();
    expect(parseRoomData('{"note":"room_data"}')).toBeNull();
    expect(parseRoomData(record('room_data {broken'))).toBeNull();
    expect(parseRoomData(record('room_data {"room": "x", "exits": []}'))).toBeNull();
    expect(parseRoomData(record('room_data {"room": 4, "sector": "inside"}'))).toBeNull();
    expect(parseRoomData('[1] room_data {"room":"A","sector":"city"}')).toBeNull();
  });
});

describe('the tally and the decision', () => {
  const tally = () => {
    const t = emptyTally();
    const add = (room: string, sector: string, times = 1) => {
      for (let i = 0; i < times; i += 1) tallyRoomData(t, { room, sector, exits: [] });
    };
    add('The Temple', 'Inside', 10);
    add('Forest Path', 'forest', 19);
    add('Forest Path', 'field', 1);
    add('darkness', 'inside', 5);
    add('darkness', 'city', 5);
    add('The Unknown Place', 'weirdland', 2);
    return t;
  };

  it('counts messages by sector and by title, folding the spelling', () => {
    const t = tally();
    expect(t.records).toBe(42);
    expect(t.sectors.inside).toBe(15);
    expect(t.titles['the temple']).toEqual({ inside: 10 });
    expect(tallyRoomData(t, { room: '  ', sector: 'inside', exits: [] })).toBe(false);
    expect(tallyRoomData(t, { room: 'X', sector: ' ', exits: [] })).toBe(false);
    expect(t.records).toBe(42);
  });

  it('accepts a title one sector dominates, lists the shared ones, and names sector words with no colour', () => {
    const d = decideTerrain(tally());
    expect(d.byTitle).toEqual({ 'the temple': 'inside', 'forest path': 'forest', 'the unknown place': 'weirdland' });
    expect(d.ambiguous).toEqual([{ title: 'darkness', counts: { inside: 5, city: 5 } }]);
    expect(d.unknownSectors).toEqual({ weirdland: 2 });
  });

  it('honours the share and the least count, and lists the biggest ambiguous title first', () => {
    const t = tally();
    expect(decideTerrain(t, { minShare: 0.99 }).byTitle['forest path']).toBeUndefined();
    expect(decideTerrain(t, { minShare: 0.9, minCount: 11 }).byTitle['the temple']).toBeUndefined();
    const d = decideTerrain(t, { minShare: 0.99 });
    expect(d.ambiguous.map((a) => a.title)).toEqual(['forest path', 'darkness']);
  });

  it('merges two tallies', () => {
    const a = tally();
    const b = emptyTally();
    tallyRoomData(b, { room: 'The Temple', sector: 'inside', exits: [] });
    tallyRoomData(b, { room: 'New Place', sector: 'swim', exits: [] });
    mergeTallies(a, b);
    expect(a.records).toBe(44);
    expect(a.titles['the temple']).toEqual({ inside: 11 });
    expect(a.titles['new place']).toEqual({ swim: 1 });
    expect(a.sectors.swim).toBe(1);
  });
});

describe('applyTerrain', () => {
  const map = (): MapFile => {
    const m = sampleMap();
    const rooms = m.continents[0].areas[0].subzones[0].rooms;
    for (const r of rooms) delete r.sector;
    rooms[0].title = 'The Temple';
    rooms[1].title = 'darkness';
    rooms[2].title = 'Never Seen';
    rooms[3].title = 'Kept Room';
    rooms[3].sector = 'city';
    return m;
  };
  const tally = () => {
    const t = emptyTally();
    for (const [room, sector] of [
      ['The Temple', 'inside'],
      ['darkness', 'inside'],
      ['darkness', 'city'],
      ['Kept Room', 'forest'],
    ])
      tallyRoomData(t, { room, sector, exits: [] });
    return t;
  };

  it('gives a room the sector the logs agree on for its title, keeps one it has, and counts the rest', () => {
    const input = map();
    const t = tally();
    const { map: out, report } = applyTerrain(input, decideTerrain(t), t);
    const rooms = out.continents[0].areas[0].subzones[0].rooms;
    expect(rooms[0].sector).toBe('inside');
    expect(rooms[1].sector).toBeUndefined();
    expect(rooms[2].sector).toBeUndefined();
    expect(rooms[3].sector).toBe('city');
    const had = input.continents.flatMap((c) => c.areas.flatMap((a) => a.subzones.flatMap((s) => s.rooms))).filter((r) => r.sector !== undefined).length;
    expect(report).toMatchObject({ assigned: 1, kept: had, ambiguous: 1, bySector: { inside: 1 } });
    expect(report.unseen).toBe(report.rooms - had - 2);
  });

  it('does not change the map it was given', () => {
    const input = map();
    const before = JSON.stringify(input);
    const t = tally();
    applyTerrain(input, decideTerrain(t), t);
    expect(JSON.stringify(input)).toBe(before);
  });
});
