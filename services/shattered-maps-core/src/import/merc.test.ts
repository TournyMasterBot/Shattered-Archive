import fs from 'node:fs';
import path from 'node:path';
import { parseAreaFile } from '@shatteredarchive/merc-area';
import { validateMapFile } from '../validate.js';
import type { Room } from '../schema.js';
import { areaIdOf, mapFromMerc, playerText, REPORT_LIST_CAP, tidyAreaName, tidyCredit, type MercAreaInput } from './merc.js';

function room(vnum: number, name: string, exits: string, extra = ''): string {
  return `#${vnum}\n${name}~\nDescription of ${name}.\n~\n0 0 ${extra === '' ? 1 : extra}\n${exits}S\n`;
}
/** `door` 0-9, the vnum it leads to, and the lock state. */
function exit(door: number, to: number, locks = 0): string {
  return `D${door}\nan exit~\n~\n${locks} ${locks === 0 ? 0 : -1} ${to}\n`;
}
function area(file: string, header: string, rooms: string, scripts = ''): MercAreaInput {
  const text = `#AREA\n${file}~\n${header}~\n{ 1 9} Someone~\n0 99\n\n#ROOMS\n${rooms}#0\n\n#RESETS\nS\n\n${scripts}#$\n`;
  return { file, area: parseAreaFile(text) };
}

const DATE = '2026-11-11';
const flat = (map: ReturnType<typeof mapFromMerc>['map']): Room[] =>
  map.continents.flatMap((c) => c.areas.flatMap((a) => a.subzones.flatMap((s) => s.rooms)));

describe('mapFromMerc', () => {
  const town = area(
    'town.are',
    '{ 1 9} Quiet Town',
    room(100, 'Town Square', exit(0, 101) + exit(1, 102) + exit(5, 103)) +
      room(101, 'North Gate', exit(2, 100) + exit(0, 200) + exit(1, 102)) +
      room(102, 'East Road', exit(3, 100, 1)) +
      room(103, 'Cellar', exit(4, 100) + exit(2, 999), '9'),
  );
  const hills = area('hills.are', '{ 5 20} Green Hills', room(200, 'Hill Path', exit(2, 101) + exit(0, 201)) + room(201, 'Hilltop', exit(2, 200)));

  it('makes one room per vnum and one link per exit, every one of them valid', () => {
    const { map, report } = mapFromMerc([town, hills], { date: DATE });
    expect(validateMapFile(map)).toEqual(expect.objectContaining({ ok: true }));
    expect(flat(map).map((r) => r.vnum)).toEqual([100, 101, 102, 103, 200, 201]);
    expect(map.links).toHaveLength(11);
    expect(report).toMatchObject({ areas: 2, rooms: 6, links: 11 });
    expect(report.perArea).toEqual([
      { file: 'town.are', name: 'Quiet Town', rooms: 4, exits: 8, offPage: 1 },
      { file: 'hills.are', name: 'Green Hills', rooms: 2, exits: 3, offPage: 1 },
    ]);
  });

  it('gives the same ids on a second run and takes them from the game numbers', () => {
    const a = mapFromMerc([town, hills], { date: DATE }).map;
    const b = mapFromMerc([town, hills], { date: DATE }).map;
    expect(b).toEqual(a);
    expect(flat(a)[0].id).toBe('mr100');
    expect(a.links.map((l) => l.id)).toContain('ml100-n');
    expect(a.continents[0].areas.map((x) => x.id)).toEqual(['ma-town', 'ma-hills']);
  });

  it('maps door numbers to compass directions, with U and D as floors', () => {
    const { map } = mapFromMerc([town, hills], { date: DATE });
    const square = flat(map).find((r) => r.vnum === 100) as Room;
    expect(Object.keys(square.exits).sort()).toEqual(['D', 'E', 'N']);
    const cellar = flat(map).find((r) => r.vnum === 103) as Room;
    expect(cellar.coords?.z).toBe(-1);
    expect(cellar.sector).toBe('air');
  });

  it('marks an exit into another file offPage and keeps it confirmed with full confidence', () => {
    const { map, report } = mapFromMerc([town, hills], { date: DATE });
    const gate = map.links.find((l) => l.id === 'ml101-n');
    expect(gate).toMatchObject({ to: 'mr200', offPage: true, state: 'confirmed', confidence: 1 });
    expect(map.links.find((l) => l.id === 'ml100-n')?.offPage).toBe(false);
    expect(report.crossAreaLinks).toBe(2);
  });

  it('makes no link of an exit to a room nobody defines, or to room 0 or -1, and lists it as dead (db.c fix_exits)', () => {
    const { map, report } = mapFromMerc([town, hills], { date: DATE });
    expect(map.links.find((l) => l.id === 'ml103-s')).toBeUndefined();
    expect(Object.keys(flat(map).find((r) => r.vnum === 103)?.exits ?? {})).toEqual(['U']);
    expect(report.deadExits).toBe(1);
    expect(report.deadList).toEqual([{ file: 'town.are', fromVnum: 103, door: 2, toVnum: 999 }]);

    const none = area('none.are', '{ 1 9} None', room(900, 'Walled', exit(0, -1) + exit(1, 0) + exit(2, 901)) + room(901, 'Open', exit(0, 900)));
    const more = mapFromMerc([town, hills, none], { date: DATE }).report;
    expect(more.deadList.slice(1)).toEqual([
      { file: 'none.are', fromVnum: 900, door: 0, toVnum: -1 },
      { file: 'none.are', fromVnum: 900, door: 1, toVnum: 0 },
    ]);
  });

  it('knows a passage is two-way only when the target points straight back', () => {
    const { map } = mapFromMerc([town, hills], { date: DATE });
    const by = (id: string) => map.links.find((l) => l.id === id);
    expect(by('ml100-n')?.reverse).toBe(true); // 101 south leads back to 100
    expect(by('ml101-n')?.reverse).toBe(true); // 200 south leads back to 101
    expect(by('ml100-e')?.reverse).toBe(true); // 102 west leads back to 100 (locked, still a passage)
    expect(by('ml101-e')?.reverse).toBe(false); // 102 west leads to 100, not to 101: a one-way exit
    expect(by('ml103-u')?.reverse).toBe(true); // 100 down leads back to the cellar
  });

  it('counts what the schema has no place for: locked exits and room-script warps', () => {
    const scripts = '#SCRIPTS\nR 300 enter\n~\nsay hello\nwarp 200\n~\n#0\n\n';
    const withWarp = area('warp.are', '{ 1 9} Warp', room(300, 'Warp Room', exit(0, 301)) + room(301, 'Next', exit(2, 300, 2)), scripts);
    const { report } = mapFromMerc([town, withWarp], { date: DATE });
    expect(report.lockedExits).toBe(2); // town's locked east door and the warp area's one
    expect(report.warps).toBe(1);
  });

  it('keeps the first definition of a room number and the first of two exits on one door', () => {
    const copy = area('copy.are', '{ 1 9} Copy', room(100, 'Impostor', exit(0, 101) + exit(0, 100)));
    const { map, report } = mapFromMerc([town, copy], { date: DATE });
    expect(report.duplicateRooms).toEqual([100]);
    expect(flat(map).filter((r) => r.vnum === 100).map((r) => r.title)).toEqual(['Town Square']);
    expect(report.areasWithoutRooms).toEqual(['copy.are']);
    expect(map.continents[0].areas.map((a) => a.id)).toEqual(['ma-town']);

    const twice = area('twice.are', '{ 1 9} Twice', room(400, 'Twice', exit(0, 400) + exit(0, 400)));
    const r2 = mapFromMerc([twice], { date: DATE });
    expect(r2.report.duplicateDoors).toBe(1);
    expect(r2.map.links).toHaveLength(1);
    expect(r2.map.links[0]).toMatchObject({ to: 'mr400', reverse: false }); // a loop with no opposite door
  });

  it('lists a repeated room number once, and caps the list of dead exits while counting them all', () => {
    const again = area('again.are', '{ 1 9} Again', room(100, 'Second', '') + room(100, 'Third', ''));
    expect(mapFromMerc([town, again], { date: DATE }).report.duplicateRooms).toEqual([100]);

    let many = '';
    for (let i = 0; i < 60; i += 1) many += room(700 + i, `Dead end ${i}`, exit(0, 9000 + i));
    const { report } = mapFromMerc([area('dead.are', '{ 1 9} Dead', many)], { date: DATE });
    expect(report.deadExits).toBe(60);
    expect(report.deadList).toHaveLength(REPORT_LIST_CAP);
    expect(report.deadList[0]).toMatchObject({ fromVnum: 700, toVnum: 9000 });
  });

  it('takes an area with no header or an empty credit line without a name or a credit', () => {
    const bare = area('bare.are', '{ 1 9} Bare', room(800, 'Bare Room', ''));
    bare.area.sections = bare.area.sections.filter((s) => s.kind !== 'area');
    const { map } = mapFromMerc([bare], { date: DATE });
    expect(map.continents[0].areas[0]).toMatchObject({ name: 'bare', sources: [{ kind: 'builder', ref: 'bare.are' }] });
    expect(map.continents[0].areas[0].sources?.[0].credit).toBeUndefined();
  });

  it('leaves out an exit on a door outside 0 to 9 and says so', () => {
    const odd = area('odd.are', '{ 1 9} Odd', room(500, 'Odd', 'D3\nx~\n~\n0 0 500\n'));
    const parsed = odd.area.sections.find((s) => s.kind === 'rooms');
    if (parsed?.kind === 'rooms') parsed.rooms[0].exits[0].door = 12;
    const { map, report } = mapFromMerc([odd], { date: DATE });
    expect(report.badDoors).toBe(1);
    expect(map.links).toHaveLength(0);
  });

  it('cuts a title or description that is over the schema caps and counts it', () => {
    const long = area('long.are', '{ 1 9} Long', room(600, 'T'.repeat(250), ''));
    const sections = long.area.sections.find((s) => s.kind === 'rooms');
    if (sections?.kind === 'rooms') sections.rooms[0].description = 'd'.repeat(9000);
    const { map, report } = mapFromMerc([long], { date: DATE });
    const only = flat(map)[0];
    expect(only.title).toHaveLength(200);
    expect(only.description).toHaveLength(8000);
    expect(report.truncated).toBe(2);
    expect(validateMapFile(map).ok).toBe(true);
  });

  it('lays each area out on its own grid and the areas side by side without overlap', () => {
    const { map } = mapFromMerc([town, hills], { date: DATE });
    const [a, b] = map.continents[0].areas;
    expect(a.placement).toMatchObject({ x: 0, y: 0 });
    expect(b.placement?.x).toBeGreaterThan((a.placement?.x ?? 0) + (a.placement?.w ?? 0) - 1);
    const square = flat(map).find((r) => r.vnum === 100) as Room;
    const gate = flat(map).find((r) => r.vnum === 101) as Room;
    expect(gate.coords).toMatchObject({ x: square.coords?.x, y: (square.coords?.y ?? 0) - 1 }); // north is up
    for (const r of flat(map)) expect(r.coords?.y).toBeGreaterThanOrEqual(0);
  });

  it('wraps the areas into a new row when a row is full', () => {
    const wide = (n: number) => {
      let rooms = '';
      for (let i = 0; i < 90; i += 1) rooms += room(n * 1000 + i, `Hall ${n}-${i}`, i < 89 ? exit(1, n * 1000 + i + 1) : '');
      return area(`wide${n}.are`, `{ 1 9} Wide ${n}`, rooms);
    };
    const { map } = mapFromMerc([wide(1), wide(2), wide(3), wide(4), wide(5)], { date: DATE });
    const placements = map.continents[0].areas.map((a) => a.placement);
    expect(placements.some((p) => (p?.y ?? 0) > 0)).toBe(true);
    expect(validateMapFile(map).ok).toBe(true);
  });

  it('records where every room and exit came from, and the area credit', () => {
    const { map } = mapFromMerc([town], { date: DATE });
    expect(flat(map)[0].sources).toEqual([{ kind: 'builder', ref: 'town.are#100', date: DATE }]);
    expect(map.continents[0].areas[0].sources?.[0]).toMatchObject({ kind: 'builder', ref: 'town.are', credit: 'Someone' });
  });
});

describe('playerText', () => {
  it('removes the colour sigils the game knows, keeps a doubled brace as one, and leaves an unknown sigil as the game prints it', () => {
    expect(playerText('{RAshen {gTrailhead{x')).toBe('Ashen Trailhead');
    expect(playerText('a {{b}} {Z c {')).toBe('a {b}} {Z c {');
    expect(playerText('{r{g{y{b{m{c{w{R{G{Y{B{M{C{W{xplain')).toBe('plain');
  });

  it('puts the player text into the map: titles and descriptions have no sigils', () => {
    const coloured = area('col.are', '{ 1 9} Col', room(1000, '{RAshen Trailhead{x', ''));
    const parsed = coloured.area.sections.find((s) => s.kind === 'rooms');
    if (parsed?.kind === 'rooms') parsed.rooms[0].description = 'A {ghot{x wind.';
    const only = flat(mapFromMerc([coloured], { date: DATE }).map)[0];
    expect(only).toMatchObject({ title: 'Ashen Trailhead', description: 'A hot wind.' });
  });
});

describe('names', () => {
  it('shows a credit without its level range and colour', () => {
    expect(tidyCredit('{ 5 35} Diku   Midgaard')).toBe('Diku Midgaard');
    expect(tidyCredit('{RAlfa{x Ofcol')).toBe('Alfa Ofcol');
    expect(tidyCredit('Plain')).toBe('Plain');
  });

  it('derives an area id from the file name that the id pattern accepts', () => {
    expect(areaIdOf('Mega1.are')).toBe('ma-mega1');
    expect(areaIdOf('odd name!.are')).toBe('ma-odd-name');
    expect(areaIdOf('!!!.are')).toBe('ma-area');
  });

  it('shows an area name without its level range and colour codes, or falls back to the file', () => {
    const header = (name: string) => ({ kind: 'area' as const, fileName: 'x', name, credits: '', minVnum: 0, maxVnum: 1 });
    expect(tidyAreaName(header('{ 5 35} Diku  Original'), 'diku.are')).toBe('Diku Original');
    expect(tidyAreaName(header('{rRed{x Hall'), 'hall.are')).toBe('Red Hall');
    expect(tidyAreaName(header('{ 1 2}'), 'hall.are')).toBe('hall');
    expect(tidyAreaName(undefined, 'hall.are')).toBe('hall');
  });
});

describe('the real files of the game', () => {
  const dir = path.resolve(__dirname, '../../../../../merc-mud/2.4/area');
  const present = fs.existsSync(path.join(dir, 'area.lst'));
  (present ? it : it.skip)('import without a loss: every listed room is there and the map is valid', () => {
    const listed = fs
      .readFileSync(path.join(dir, 'area.lst'), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '' && l !== '$');
    const files: MercAreaInput[] = [];
    let expected = 0;
    for (const file of listed) {
      const full = path.join(dir, file);
      if (!fs.existsSync(full)) continue;
      const parsed = parseAreaFile(fs.readFileSync(full, 'utf8'));
      files.push({ file, area: parsed });
      for (const s of parsed.sections) if (s.kind === 'rooms') expected += s.rooms.length;
    }
    const { map, report } = mapFromMerc(files, { date: DATE });
    expect(validateMapFile(map)).toEqual(expect.objectContaining({ ok: true }));
    expect(report.rooms + report.duplicateRooms.length).toBe(expected);
    expect(flat(map)).toHaveLength(report.rooms);
    expect(report.links).toBe(map.links.length);
    expect(report.rooms).toBeGreaterThan(1000);
  });
});
