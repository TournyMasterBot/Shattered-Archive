import { emitAreaFile, parseAreaFile, type Room as MercRoom, type RoomsSection } from '@shatteredarchive/merc-area';
import { updateBaseline } from '../baseline.js';
import type { Direction, MapFile } from '../schema.js';
import { area, link, room, sampleMap, subzone } from '../testing/fixtures.js';
import { MERC_DOOR, exportMerc, type MercExportOptions } from './merc.js';

const RANGE = { min: 5000, max: 5099 };

function options(extra: Partial<MercExportOptions> = {}): MercExportOptions {
  return { level: 'area', id: 'town', fileName: 'town.are', vnumRange: RANGE, ...extra };
}

function mercRooms(text: string): MercRoom[] {
  const file = parseAreaFile(text);
  return (file.sections.find((s): s is RoomsSection => s.kind === 'rooms') as RoomsSection).rooms;
}

/** A line of `count` rooms, each walked both ways to the next (E and W), with no numbers of their own. */
function line(count: number, vnums: (number | undefined)[] = []): MapFile {
  const links = [];
  const rooms = [];
  for (let i = 1; i <= count; i += 1) {
    const exits: Partial<Record<Direction, string>> = {};
    if (i < count) {
      links.push(link(`e${i}`, `q${i}`, 'E', `q${i + 1}`, { state: 'confirmed', confidence: 0.95, reverse: true }));
      exits.E = `e${i}`;
    }
    if (i > 1) {
      links.push(link(`w${i}`, `q${i}`, 'W', `q${i - 1}`, { state: 'confirmed', confidence: 0.95, reverse: true }));
      exits.W = `w${i}`;
    }
    rooms.push(
      room(`q${i}`, `Room ${i}`, { sector: 'field', exits, vnum: vnums[i - 1], description: `Room ${i} is flat.` }),
    );
  }
  return {
    version: 1,
    continents: [{ id: 'c', name: 'C', areas: [area('line', [subzone('line-main', rooms)])] }],
    links,
  };
}

describe('exportMerc', () => {
  it('writes text the Builder parser reads back, and re-emitting it changes nothing', () => {
    const result = exportMerc(line(12), options({ id: 'line', fileName: 'line.are' }));
    expect(result.report.errors).toEqual([]);
    const text = result.text as string;
    expect(emitAreaFile(parseAreaFile(text))).toBe(text);
    const rooms = mercRooms(text);
    expect(rooms).toHaveLength(12);
    expect(rooms.map((r) => r.vnum)).toEqual(Array.from({ length: 12 }, (_, i) => 5000 + i));
    expect(result.report).toMatchObject({ rooms: 12, exits: 22, vnumsAllocated: 12, vnumsKept: 0, vnumsReplaced: 0 });
    // the middle room leads east to the next number and west to the previous one, in door order
    expect(rooms[5].exits).toEqual([
      { door: MERC_DOOR.E, description: '', keyword: '', locks: 0, key: 0, toVnum: 5006 },
      { door: MERC_DOOR.W, description: '', keyword: '', locks: 0, key: 0, toVnum: 5004 },
    ]);
    expect(parseAreaFile(text).sections[0]).toMatchObject({
      kind: 'area',
      fileName: 'line.are',
      minVnum: 5000,
      maxVnum: 5099,
    });
  });

  it('is the same text every time', () => {
    const map = sampleMap();
    expect(exportMerc(map, options()).text).toBe(exportMerc(map, options()).text);
  });

  it('maps the sample town: sector, door numbers, the kept room number, and the exit that leaves the area', () => {
    const result = exportMerc(sampleMap(), options({ vnumRange: { min: 1000, max: 1099 } }));
    expect(result.report.errors).toEqual([]);
    const rooms = mercRooms(result.text as string);
    const byName = new Map(rooms.map((r) => [r.name, r]));
    expect(byName.get('Market Square')).toMatchObject({ vnum: 1001, sectorType: 1 });
    expect(byName.get('Old Well')?.sectorType).toBe(0);
    expect(result.report.vnumsKept).toBe(1);
    // r1 keeps 1001, so the others take the lowest free numbers around it
    expect(rooms.map((r) => r.vnum)).toEqual([1001, 1000, 1002, 1003, 1004]);
    // Old Well D -> Cellar
    expect(byName.get('Old Well')?.exits).toEqual([
      expect.objectContaining({ door: MERC_DOOR.D, toVnum: byName.get('Cellar')?.vnum }),
    ]);
    // Gate E -> the forest room, which has no number of its own: the exit is left out and counted
    expect(byName.get('Gate')?.exits).toEqual([]);
    expect(result.report.unrepresentable).toContainEqual({
      what: 'exits to a room outside the export that has no room number (left out)',
      count: 1,
    });
  });

  it("writes an exit to a room outside the export as that room's own number, and counts it", () => {
    const map = sampleMap();
    map.continents[0].areas[1].subzones[0].rooms[0].vnum = 9001;
    const result = exportMerc(map, options({ vnumRange: { min: 1000, max: 1099 } }));
    const gate = mercRooms(result.text as string).find((r) => r.name === 'Gate') as MercRoom;
    expect(gate.exits).toEqual([expect.objectContaining({ door: MERC_DOOR.E, toVnum: 9001 })]);
    expect(result.report.externalExits).toBe(1);
  });

  it('counts candidate exits, and leaves out a gap and a conflict', () => {
    const map = sampleMap();
    const result = exportMerc(map, options({ vnumRange: { min: 1000, max: 1099 } }));
    // r1 S -> r3, r2 S -> r4, r3 D -> r5 are candidates; r4 E (off the area) has no number
    expect(result.report.candidateExits).toBe(3);
    expect(result.report.unrepresentable).toContainEqual({
      what: 'exits whose target is not known (left out)',
      count: 1,
    });

    map.links.push(link('l-x', 'r4', 'N', 'r1', { state: 'conflict', conflictTo: ['r2'] }));
    map.continents[0].areas[0].subzones[0].rooms[3].exits.N = 'l-x';
    const again = exportMerc(map, options({ vnumRange: { min: 1000, max: 1099 } }));
    expect(again.report.unrepresentable).toContainEqual({
      what: 'exits whose sightings disagree about the target (left out)',
      count: 1,
    });
  });

  it('follows a merged room to the room that absorbed it', () => {
    const map = line(3);
    const rooms = map.continents[0].areas[0].subzones[0].rooms;
    rooms.push(room('qx', 'Alias', { aliasOf: 'q3' }));
    map.links.push(link('lx', 'q1', 'N', 'qx'));
    rooms[0].exits.N = 'lx';
    const result = exportMerc(map, options({ id: 'line' }));
    const list = mercRooms(result.text as string);
    expect(list).toHaveLength(3);
    expect(list[0].exits.find((e) => e.door === MERC_DOOR.N)?.toVnum).toBe(list[2].vnum);
  });

  it('leaves out an exit to a room the map does not hold', () => {
    const map = line(2);
    map.links.push(link('lg', 'q1', 'N', 'ghost'));
    map.continents[0].areas[0].subzones[0].rooms[0].exits.N = 'lg';
    const result = exportMerc(map, options({ id: 'line' }));
    expect(mercRooms(result.text as string)[0].exits.map((e) => e.door)).toEqual([MERC_DOOR.E]);
    expect(result.report.unrepresentable).toContainEqual({
      what: 'exits to a room the map does not hold (left out)',
      count: 1,
    });
  });

  describe('room numbers', () => {
    it('keeps a number in the range, and replaces one outside it or one already taken', () => {
      const result = exportMerc(line(4, [5050, 17, 5050, undefined]), options({ id: 'line' }));
      const numbers = mercRooms(result.text as string).map((r) => r.vnum);
      expect(numbers).toEqual([5050, 5000, 5001, 5002]);
      expect(result.report).toMatchObject({ vnumsKept: 1, vnumsReplaced: 2, vnumsAllocated: 1 });
    });

    it('never hands out a number a room elsewhere in the map already has', () => {
      const map = sampleMap();
      map.continents[0].areas[1].subzones[0].rooms[0].vnum = 1000;
      const result = exportMerc(map, options({ vnumRange: { min: 1000, max: 1099 } }));
      const numbers = mercRooms(result.text as string).map((r) => r.vnum);
      expect(numbers).not.toContain(1000);
      expect(numbers).toEqual([1001, 1002, 1003, 1004, 1005]);
    });

    it('writes nothing and says how many numbers are missing when the range is too small', () => {
      const result = exportMerc(line(12), options({ id: 'line', vnumRange: { min: 100, max: 106 } }));
      expect(result.text).toBeNull();
      expect(result.area).toBeNull();
      expect(result.report.errors).toHaveLength(1);
      expect(result.report.errors[0]).toContain('7 numbers but 12 rooms need one (5 too few');
    });

    it.each([
      [{ min: 0, max: 10 }, 'range must satisfy'],
      [{ min: 10, max: 5 }, 'range must satisfy'],
      [{ min: 1, max: 40000 }, 'range must satisfy'],
      [{ min: 1.5, max: 10 }, 'whole numbers'],
    ])('refuses the range %j', (vnumRange, message) => {
      const result = exportMerc(line(2), options({ id: 'line', vnumRange }));
      expect(result.text).toBeNull();
      expect(result.report.errors.join(' ')).toContain(message);
    });
  });

  describe('refusals', () => {
    it('names an area or subzone that is not in the map', () => {
      expect(exportMerc(sampleMap(), options({ id: 'nowhere' })).report.errors).toEqual([
        'there is no area "nowhere" in this map',
      ]);
      expect(exportMerc(sampleMap(), options({ level: 'subzone', id: 'nowhere' })).report.errors).toEqual([
        'there is no subzone "nowhere" in this map',
      ]);
    });

    it.each(['town', 'town.txt', '../town.are', 'two words.are', '.hidden.are', ''])(
      'refuses the file name %j',
      (fileName) => {
        const result = exportMerc(sampleMap(), options({ fileName }));
        expect(result.text).toBeNull();
        expect(result.report.errors[0]).toContain('is not a file name the Builder accepts');
      },
    );

    it('refuses an area with no rooms', () => {
      const map: MapFile = {
        version: 1,
        continents: [{ id: 'c', name: 'C', areas: [area('empty', [subzone('e1', [])])] }],
        links: [],
      };
      expect(exportMerc(map, options({ id: 'empty' })).report.errors).toEqual(['the area has no rooms to export']);
    });
  });

  it('exports one subzone only, and does not count the rooms of the others', () => {
    const map = sampleMap();
    const result = exportMerc(map, options({ level: 'subzone', id: 'forest-main', vnumRange: { min: 200, max: 210 } }));
    expect(mercRooms(result.text as string)).toHaveLength(1);
    expect(result.report).toMatchObject({ level: 'subzone', id: 'forest-main', rooms: 1 });
  });

  it('writes a room with no exits, no description and no sector', () => {
    const map: MapFile = {
      version: 1,
      continents: [{ id: 'c', name: 'C', areas: [area('solo', [subzone('s', [room('only', 'Lonely Place')])])] }],
      links: [],
    };
    const result = exportMerc(map, options({ id: 'solo', fileName: 'solo.are' }));
    expect(result.report.errors).toEqual([]);
    expect(mercRooms(result.text as string)).toEqual([
      {
        vnum: 5000,
        name: 'Lonely Place',
        description: '',
        areaNumber: 0,
        roomFlags: 0,
        sectorType: 0,
        exits: [],
        extraDescrs: [],
      },
    ]);
    expect(result.report.unrepresentable).toEqual(
      expect.arrayContaining([
        { what: 'rooms with no description (written empty)', count: 1 },
        { what: 'rooms with no sector (written as inside)', count: 1 },
      ]),
    );
  });

  describe('text a Merc file cannot hold', () => {
    it('replaces "~" in titles, descriptions and the area name, drops control characters, and says so', () => {
      const map = line(1);
      const only = map.continents[0].areas[0].subzones[0].rooms[0];
      only.title = 'Gate ~ North';
      only.description = 'It said ~danger~.\r\nBeyond\u0000 lies fog.\r\n';
      const result = exportMerc(map, options({ id: 'line', areaName: 'Line ~ Road', credits: 'Me ~ You' }));
      expect(result.report.errors).toEqual([]);
      const text = result.text as string;
      expect(mercRooms(text)[0]).toMatchObject({
        name: 'Gate - North',
        description: 'It said -danger-.\nBeyond lies fog.\n',
      });
      expect(parseAreaFile(text).sections[0]).toMatchObject({ name: 'Line - Road', credits: 'Me - You' });
      const what = result.report.unrepresentable.map((u) => u.what);
      expect(what).toContain('titles with a "~", which a Merc file cannot hold; replaced by "-"');
      expect(what).toContain(
        'descriptions with a "~" or a control character a Merc file cannot hold; replaced or removed',
      );
      expect(what).toContain('The area name had a "~", which a Merc file cannot hold; replaced by "-"');
    });

    it('folds a title or a name that spans lines into one line', () => {
      const map = line(1);
      map.continents[0].areas[0].subzones[0].rooms[0].title = 'Two\nLines';
      const result = exportMerc(map, options({ id: 'line', areaName: 'A\n  B' }));
      expect(mercRooms(result.text as string)[0].name).toBe('Two Lines');
      expect(parseAreaFile(result.text as string).sections[0]).toMatchObject({ name: 'A B' });
    });
  });

  describe('what the file has no place for', () => {
    it('counts rooms with a position, a record of origin, and a record of what they hold', () => {
      const map = sampleMap();
      const first = map.continents[0].areas[0].subzones[0].rooms[0];
      first.baseline = updateBaseline(undefined, { day: '2026-11-07', entries: [{ label: 'a cat', kind: 'mob' }] });
      const result = exportMerc(map, options({ vnumRange: { min: 1000, max: 1099 } }));
      const items = Object.fromEntries(result.report.unrepresentable.map((u) => [u.what, u.count]));
      expect(items['rooms with a position on the map grid (a Merc file has none)']).toBe(5);
      expect(items['rooms with a record of where they came from (sources and history)']).toBe(5);
      expect(
        items['rooms with a record of what they usually hold (mobs, items; the file lists them only as resets)'],
      ).toBe(1);
      expect(items['rooms whose sector "underground" is not a Merc sector (written as inside)']).toBe(1);
    });

    it('counts a room that has history but no sources, and one that has neither', () => {
      const map = line(3);
      const [a, b] = map.continents[0].areas[0].subzones[0].rooms;
      a.sources = [];
      a.history = [{ at: '2026-11-07', op: 'create' }];
      b.sources = [];
      const items = Object.fromEntries(
        exportMerc(map, options({ id: 'line' })).report.unrepresentable.map((u) => [u.what, u.count]),
      );
      expect(items['rooms with a record of where they came from (sources and history)']).toBe(2);
    });

    it.each([
      ['city', 1],
      ['City', 1],
      ['Deep Water', 7],
      ['water-swim', 6],
      ['mountains', 5],
      ['3', 3],
      ['10', 10],
    ])('reads the sector %j as %d', (sector, expected) => {
      const map = line(1);
      map.continents[0].areas[0].subzones[0].rooms[0].sector = sector;
      const result = exportMerc(map, options({ id: 'line' }));
      expect(mercRooms(result.text as string)[0].sectorType).toBe(expected);
      expect(result.report.unrepresentable.map((u) => u.what).join()).not.toContain('is not a Merc sector');
    });

    it.each(['8', '11', 'lava', '   '])('writes the sector %j as inside and says so', (sector) => {
      const map = line(1);
      map.continents[0].areas[0].subzones[0].rooms[0].sector = sector;
      const result = exportMerc(map, options({ id: 'line' }));
      expect(mercRooms(result.text as string)[0].sectorType).toBe(0);
      expect(result.report.unrepresentable.map((u) => u.what).join()).toMatch(/not a Merc sector|no sector/);
    });
  });

  it('turns the door numbers the Builder expects: the four compass points first, then up, down, and the diagonals', () => {
    expect(MERC_DOOR).toEqual({ N: 0, E: 1, S: 2, W: 3, U: 4, D: 5, NE: 6, NW: 7, SE: 8, SW: 9 });
  });
});
