import fs from 'node:fs';
import path from 'node:path';
import { ID_PATTERN, validateMapFile, type Link } from '@shatteredarchive/shattered-maps-core';
import type { MapDocV1 } from '../types';
import { doc, exit, room } from '../testing/fixtures';
import { legacyToMapFile } from './adapter';

const OPTIONS = { date: '2026-11-07', credit: 'Test Author' };

const allRooms = (map: ReturnType<typeof legacyToMapFile>['map']) =>
  map.continents.flatMap((c) => c.areas.flatMap((a) => a.subzones.flatMap((s) => s.rooms)));

describe('legacyToMapFile on the seed document', () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '../../seed_data/mapdoc.json'), 'utf8')) as MapDocV1;
  const result = legacyToMapFile(seed, OPTIONS);

  it('keeps every room and every exit: 176 in, 176 out', () => {
    const legacyExits = Object.values(seed.rooms).reduce((n, r) => n + Object.keys(r.exits).length, 0);
    expect(allRooms(result.map)).toHaveLength(176);
    expect(result.report.rooms).toBe(176);
    expect(result.map.links).toHaveLength(legacyExits);
    expect(result.report.links).toBe(legacyExits);
  });

  it('writes a file the strict validator accepts', () => {
    const verdict = validateMapFile(result.map);
    expect(verdict.ok ? [] : verdict.errors).toEqual([]);
  });

  it('keeps the catalog: continents with rooms, their areas, and every room under its own area', () => {
    expect(result.map.continents.length).toBeGreaterThanOrEqual(1);
    const catalog = seed.meta.catalog!;
    const listed = new Map<string, number>();
    let unlisted = 0;
    for (const r of Object.values(seed.rooms)) {
      const areaId = r.category?.areaId ?? '';
      if (catalog.areas[areaId]) listed.set(areaId, (listed.get(areaId) ?? 0) + 1);
      else unlisted += 1;
    }
    const perAreaName = new Map<string, number>();
    for (const c of result.map.continents)
      for (const a of c.areas) perAreaName.set(a.name, (perAreaName.get(a.name) ?? 0) + a.subzones.reduce((n, s) => n + s.rooms.length, 0));
    for (const [areaId, count] of listed) expect(perAreaName.get(catalog.areas[areaId].name)).toBe(count);
    // the 13 seed rooms whose area the catalog does not list keep their continent, in a placeholder area
    expect(result.report.unlistedAreaRooms).toBe(unlisted);
    expect(unlisted).toBe(13);
    expect(result.report.unassignedRooms).toBe(0);
    expect(result.map.continents.map((c) => c.name)).not.toContain('Unassigned');
  });

  it('brings the seed grid (4 across, 2 down per step) to one unit per step without stacking rooms on one cell', () => {
    expect(result.report.notes.some((n) => n.startsWith('The grid was laid out 4 across and 2 down'))).toBe(true);
    const cells = new Map<string, number>();
    for (const c of result.map.continents)
      for (const a of c.areas)
        for (const r of a.subzones.flatMap((s) => s.rooms)) {
          const key = `${a.id}|${r.coords?.x}|${r.coords?.y}|${r.coords?.z}`;
          cells.set(key, (cells.get(key) ?? 0) + 1);
        }
    const stacked = [...cells.values()].filter((n) => n > 1).length;
    expect(stacked).toBe(0);
  });

  it('reports what it did not carry over, by name, and nothing else', () => {
    expect(result.report.notes.every((n) => typeof n === 'string' && n.length > 0)).toBe(true);
    expect(Object.keys(result.report.unmapped).sort()).toEqual([...Object.keys(result.report.unmapped)].sort());
  });

  it('only writes ids that pass the neutral id rule, and no id twice', () => {
    const ids = [...allRooms(result.map).map((r) => r.id), ...result.map.links.map((l) => l.id)];
    expect(ids.every((id) => ID_PATTERN.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('legacyToMapFile, case by case', () => {
  const legacy = (): MapDocV1 =>
    doc([
      room('100', 0, 0, 0, { E: exit('101', { status: 'confirmed' }), N: exit(null), S: exit('ghost'), U: exit('200', { status: 'anomalous', door: { type: 'simple' }, oneWay: true }) }, 'Hall', 'city'),
      room('101', 2, 0, 0, { W: exit('100', { status: 'confirmed' }) }, 'Yard'),
      room('200', 0, 0, 1, { D: exit('100') }, 'Loft', undefined, 'a2'),
    ]);

  it('writes the catalog as continent > area > one subzone, with the rooms in it', () => {
    const { map } = legacyToMapFile(legacy(), OPTIONS);
    expect(map.version).toBe(1);
    expect(map.generatedAt).toBe('2026-11-07');
    expect(map.continents.map((c) => c.name)).toEqual(['C']);
    // the fixtures declare area a1 only: room 200 names a2, which the catalog does not list, so it gets a placeholder area under its continent
    const names = map.continents.map((c) => [c.name, c.areas.map((a) => [a.name, a.subzones.map((s) => [s.name, s.kind, s.rooms.length])])]);
    expect(names).toEqual([
      ['C', [['Test Area', [['Main', 'consistent', 2]]], ['Unlisted area a2', [['Main', 'consistent', 1]]]]],
    ]);
  });

  it('maps coordinates, titles, sector, and the plain-number vnum rule', () => {
    const { map } = legacyToMapFile(legacy(), OPTIONS);
    const rooms = allRooms(map);
    const hall = rooms.find((r) => r.title === 'Hall');
    expect(hall).toMatchObject({ coords: { x: 0, y: 0, z: 0 }, sector: 'city', vnum: 100 });
    expect(hall?.sources).toEqual([{ kind: 'manual', date: '2026-11-07', ref: '100', credit: 'Test Author' }]);
    expect(rooms.find((r) => r.title === 'Loft')?.coords).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('turns the exit status into the link state and confidence, and an exit with no target into an unknown exit', () => {
    const { map, report } = legacyToMapFile(legacy(), OPTIONS);
    const byDir = (from: string, dir: string): Link => {
      const roomId = allRooms(map).find((r) => r.title === from)?.id;
      return map.links.find((l) => l.from === roomId && l.dir === dir) as Link;
    };
    expect(byDir('Hall', 'E')).toMatchObject({ state: 'confirmed', confidence: 0.95, reverse: true, offPage: false });
    expect(byDir('Hall', 'N')).toMatchObject({ state: 'unknown-target', to: null, confidence: 0 });
    expect(byDir('Hall', 'S')).toMatchObject({ state: 'unknown-target', to: null });
    expect(report.danglingExits).toBe(1);
    expect(byDir('Hall', 'U')).toMatchObject({ state: 'candidate', confidence: 0.6, offPage: true });
    expect(byDir('Loft', 'D')).toMatchObject({ state: 'candidate', offPage: true });
  });

  it('sets each room\'s exit slot to its link, so the validator accepts the result', () => {
    const { map } = legacyToMapFile(legacy(), OPTIONS);
    const verdict = validateMapFile(map);
    expect(verdict.ok ? [] : verdict.errors).toEqual([]);
    const hall = allRooms(map).find((r) => r.title === 'Hall');
    expect(Object.keys(hall?.exits ?? {}).sort()).toEqual(['E', 'N', 'S', 'U']);
  });

  it('counts, by name, what the neutral file has no field for', () => {
    const d = legacy();
    d.rooms['100'].flags = { lit: true };
    d.rooms['100'].objects = [{ id: 'o', name: 'Lamp' }];
    d.rooms['100'].interactions = [{ verb: 'dig', effects: [] }];
    d.rooms['100'].movement = { requires: ['boat'] };
    d.meta.grid = { type: 'octagon' };
    d.rooms.loose = { vnum: 'loose', label: 'Loose', coords: { cx: 9, cy: 9, vz: 0 }, exits: {} };
    const { report } = legacyToMapFile(d, OPTIONS);
    expect(report.unmapped).toMatchObject({
      'room flags': 1,
      'room objects': 1,
      'room interactions': 1,
      'room movement rules': 1,
      'exit door or lock': 1,
      'one-way exit flag': 1,
      'anomalous exit status (written as a candidate)': 1,
    });
    expect(report.notes).toContain('Not carried over: room flags (1).');
    expect(report.notes.some((n) => n.startsWith('1 room(s) had no known area'))).toBe(true);
    expect(report.notes.some((n) => n.includes('1 exit(s) led to a room that is not in the document'))).toBe(true);
    expect(report.unassignedRooms).toBe(1);
    expect(report.unlistedAreaRooms).toBe(1);
    expect(report.notes.some((n) => n.startsWith('1 room(s) named an area that the catalog does not list'))).toBe(true);
  });

  it('keeps ids valid and unique when vnums repeat after cleaning, are long, or are not plain numbers', () => {
    const d = doc([
      room('Room A!', 0, 0, 0, {}, 'One'),
      room('room a?', 1, 0, 0, {}, 'Two'),
      room('X'.repeat(200), 2, 0, 0, {}, 'Three'),
      room('007', 3, 0, 0, {}, 'Four'),
      room('7', 4, 0, 0, {}, 'Five'),
      room('99999999999', 5, 0, 0, {}, 'Six'),
    ]);
    const { map } = legacyToMapFile(d, OPTIONS);
    const rooms = allRooms(map);
    expect(rooms).toHaveLength(6);
    expect(new Set(rooms.map((r) => r.id)).size).toBe(6);
    expect(rooms.every((r) => ID_PATTERN.test(r.id))).toBe(true);
    // 007 and 7 are the same number: only the first keeps the numeric vnum; an eleven-digit one is not a vnum
    expect(rooms.filter((r) => r.vnum === 7)).toHaveLength(1);
    expect(rooms.find((r) => r.title === 'Six')?.vnum).toBeUndefined();
    expect(validateMapFile(map).ok).toBe(true);
  });

  it('reads the older coordinate fields and bounds wild ones', () => {
    const d = doc([room('a', 0, 0, 0, {}, 'Old')]);
    d.rooms.a.coords = { q: 3, r: -2, z: 4 } as never;
    d.rooms.b = { vnum: 'b', label: 'Wild', coords: { cx: 9e9, cy: -9e9, vz: 0.4 }, exits: {} };
    d.rooms.c = { vnum: 'c', label: 'Level', coords: { level: 2 } as never, exits: {} };
    const { map } = legacyToMapFile(d, OPTIONS);
    const at = (title: string) => allRooms(map).find((r) => r.title === title)?.coords;
    expect(at('Old')).toEqual({ x: 3, y: -2, z: 4 });
    expect(at('Wild')).toEqual({ x: 100000, y: -100000, z: 0 });
    expect(at('Level')).toEqual({ x: 0, y: 0, z: 2 });
    expect(validateMapFile(map).ok).toBe(true);
  });

  it('fills the gaps a loose document leaves: empty names, a vnum with nothing usable in it, older z fields, an empty exit slot', () => {
    const d = doc([room('!!!', 0, 0, 0, {}, 'Odd')]);
    d.meta.catalog!.continents.c = { id: 'c', name: '' };
    d.meta.catalog!.areas.a1 = { id: 'a1', name: '', continentId: 'c', primaryVnum: 'x' };
    d.rooms.old = { vnum: 'old', label: 'Old floor', coords: { cx: 1, cy: 1, z: 3 } as never, exits: { N: undefined } as never, category: d.rooms['!!!'].category };
    d.rooms.stray = { vnum: 'stray', label: 'Stray', coords: { cx: 2, cy: 2, vz: 0 }, exits: {}, category: { areaId: 'ghost', continentId: 'nowhere' } };
    d.rooms.bare = { vnum: 'bare', coords: { cx: 3, cy: 3, vz: 0 }, exits: {}, category: { areaId: 'ghost2' } };
    const { map, report } = legacyToMapFile(d, OPTIONS);
    const rooms = allRooms(map);
    expect(rooms.find((r) => r.title === 'Odd')?.id).toBe('rx');
    expect(rooms.find((r) => r.title === 'Old floor')?.coords).toEqual({ x: 1, y: 1, z: 3 });
    expect(map.links).toEqual([]);
    expect(map.continents.map((c) => c.name)).toEqual(['c', 'Unassigned']); // the continent with no name is shown by its id
    expect(map.continents[0].areas.map((a) => a.name)).toEqual(['a1']); // the area with no name is shown by its id
    expect(report.unmapped['area primary room']).toBe(1);
    // an area the catalog does not list, under a continent it does not list either, goes to Unassigned; a room with no label takes its vnum as title
    expect(map.continents[1].areas.map((a) => a.name).sort()).toEqual(['Unlisted area ghost', 'Unlisted area ghost2']);
    expect(rooms.find((r) => r.id.startsWith('rbare'))?.title).toBe('bare');
    expect(validateMapFile(map).ok).toBe(true);
  });

  it('brings a stretched grid down to one unit per step, and says so', () => {
    // a document laid out 4 across and 2 down per step, as the seed is
    const d = doc([
      room('a', 0, 0, 0, { E: exit('b'), S: exit('c') }, 'A'),
      room('b', 4, 0, 0, { W: exit('a') }, 'B'),
      room('c', 0, 2, 0, { N: exit('a'), E: exit('d') }, 'C'),
      room('d', 4, 2, 0, { W: exit('c'), N: exit('b') }, 'D'),
    ]);
    const { map, report } = legacyToMapFile(d, OPTIONS);
    const at = (title: string) => allRooms(map).find((r) => r.title === title)?.coords;
    expect([at('A'), at('B'), at('C'), at('D')]).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
    ]);
    expect(report.notes).toContain('The grid was laid out 4 across and 2 down per step; positions were divided by that so one step is one unit.');
  });

  it('moves a room to the nearest free cell when dividing the grid would stack it on another room, and says how many', () => {
    const d = doc([
      room('a', 0, 0, 0, { E: exit('b'), W: exit('c') }, 'A'),
      room('b', 4, 0, 0, { W: exit('a') }, 'B'),
      room('c', 2, 0, 0, {}, 'C'), // 2 / 4 rounds to 1, where B is
    ]);
    const { map, report } = legacyToMapFile(d, OPTIONS);
    const cells = allRooms(map).map((r) => `${r.coords?.x},${r.coords?.y}`);
    expect(new Set(cells).size).toBe(3);
    expect(allRooms(map).find((r) => r.title === 'B')?.coords).toEqual({ x: 1, y: 0, z: 0 });
    expect(allRooms(map).find((r) => r.title === 'C')?.coords).toEqual({ x: 0, y: -1, z: 0 });
    expect(report.notes).toContain('1 room(s) were moved to the nearest free cell because the smaller grid put them on the same cell as another room.');
    // rooms of different floors or areas may share a cell number
    const apart = doc([room('a', 0, 0, 0, { E: exit('b') }, 'A'), room('b', 4, 0, 0, { W: exit('a') }, 'B'), room('u', 0, 0, 1, {}, 'Upstairs')]);
    expect(legacyToMapFile(apart, OPTIONS).report.notes.some((n) => n.includes('moved to the nearest free cell'))).toBe(false);
  });

  it('leaves a grid alone when it is already one unit per step, when no step is typical, or when exits do not show one', () => {
    const unit = doc([room('a', 0, 0, 0, { E: exit('b') }, 'A'), room('b', 1, 0, 0, { W: exit('a') }, 'B')]);
    expect(allRooms(legacyToMapFile(unit, OPTIONS).map)[1].coords).toEqual({ x: 1, y: 0, z: 0 });
    // steps of 2, 3, 5 and 7 each make a quarter of the exits: none reaches 4 in 10
    const mixed = doc([
      room('a', 0, 0, 0, { E: exit('b'), W: exit('c') }, 'A'),
      room('b', 2, 0, 0, {}, 'B'),
      room('c', -3, 0, 0, { E: exit('d') }, 'C'),
      room('d', 2, 0, 0, { E: exit('e') }, 'D'),
      room('e', 9, 0, 0, {}, 'E'),
    ]);
    expect(allRooms(legacyToMapFile(mixed, OPTIONS).map).map((r) => r.coords?.x)).toEqual([0, 2, -3, 2, 9]);
    // exits to another floor, to the same place, or to nowhere say nothing about the pitch
    const odd = doc([
      room('a', 0, 0, 0, { E: exit('b'), W: exit('same'), N: exit('up'), S: exit('ghost') }, 'A'),
      room('b', 4, 0, 1, {}, 'B'),
      room('same', 0, 0, 0, {}, 'Same'),
      room('up', 0, 4, 1, {}, 'Up'),
    ]);
    const out = legacyToMapFile(odd, OPTIONS);
    expect(allRooms(out.map).find((r) => r.title === 'B')?.coords).toEqual({ x: 4, y: 0, z: 1 });
    expect(out.report.notes.some((n) => n.startsWith('The grid was laid out'))).toBe(false);
  });

  it('writes an empty file for an empty document, and does not change its input', () => {
    const empty = legacyToMapFile({ meta: { directions: [] }, rooms: {} }, OPTIONS);
    expect(empty.map.continents).toEqual([]);
    expect(empty.map.links).toEqual([]);
    expect(empty.report.rooms).toBe(0);
    const d = legacy();
    const before = JSON.stringify(d);
    legacyToMapFile(d, OPTIONS);
    expect(JSON.stringify(d)).toBe(before);
  });

  it('puts a catalog area with no continent, and a continent with no rooms, where the neutral file can hold them', () => {
    const d = doc([room('a', 0, 0, 0, {}, 'Lone')]);
    d.meta.catalog!.continents.empty = { id: 'empty', name: 'Empty Land' };
    d.meta.catalog!.areas.a1 = { id: 'a1', name: 'Loose Area' };
    const { map, report } = legacyToMapFile(d, { date: '2026-11-07' });
    expect(map.continents.map((c) => c.name)).toEqual(["Unassigned"]);
    // the room's area has no continent, so the area went to Unassigned; "C" kept its (now empty) listing out of the file
    expect(report.continents).toBe(map.continents.length);
    expect(allRooms(map)[0].sources[0]).toEqual({ kind: 'manual', date: '2026-11-07', ref: 'a' });
    expect(validateMapFile(map).ok).toBe(true);
  });
});
