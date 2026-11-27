import { DatabaseSync } from 'node:sqlite';
import { validateMapFile } from '../validate.js';
import {
  AZAH_CREDIT,
  buildManifest,
  candidateFileName,
  CONFIDENCE_TESTED,
  CONFIDENCE_UNTESTED,
  importAzah,
  readAzahRows,
  UNSORTED_CONTINENT,
  type AzahImport,
  type AzahRows,
} from './azah.js';

/** The author's user id and the server id are in the fixture so the tests can prove they never come out. */
const USER = 987654321;
const SERVER = 555;

function database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE ZoneTbl (ZoneId INTEGER PRIMARY KEY, Name VARCHAR(80), ZoneFile VARCHAR(80), UserID INTEGER, Modified TIMESTAMP, Script TEXT, X INTEGER, Y INTEGER, Z INTEGER, Parent INTEGER);
    CREATE TABLE ObjectTbl (ObjId INTEGER PRIMARY KEY, Name VARCHAR(255), IDName VARCHAR(255), Hint VARCHAR(255), Desc TEXT, KindID INTEGER, RefNum INTEGER, X INTEGER, Y INTEGER, Z INTEGER, Script TEXT, Content TEXT, Deleted BOOLEAN, UserID INTEGER, Modified TIMESTAMP, DateAdded TIMESTAMP, ServerID INTEGER, ZoneID INTEGER);
    CREATE TABLE ExitTbl (ExitId INTEGER PRIMARY KEY, FromID INTEGER, ToID INTEGER, ExitKindID INTEGER, Name VARCHAR(80), DirType INTEGER, DirToType INTEGER, Tested BOOLEAN, UserID INTEGER, Modified TIMESTAMP);
    CREATE TABLE PortalTbl (PortalId INTEGER PRIMARY KEY, ToID INTEGER, Cost INTEGER, ZoneID INTEGER, Name VARCHAR(255), Enable BOOLEAN, Modified TIMESTAMP);
  `);
  const zone = db.prepare(
    'INSERT INTO ZoneTbl (ZoneId, Name, ZoneFile, UserID, Modified, X, Y, Z, Parent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const zones: [number, string, string | null, number, number, number, number][] = [
    [100, 'WESTLANDS', '2019-08-02 14:53:24', 0, 0, 0, -1],
    [101, 'Harbor Town', '2015-04-28 09:42:16', 2400, -480, 1, 100],
    [102, 'Old Docks', '2016-01-01 00:00:00', 0, 0, 1, 101],
    [103, 'Hedge Maze', '2014-09-21 19:57:09', -2340, 13740, 1, 100],
    [104, 'Lost Place', '2017-01-01 00:00:00', 0, 0, 0, 999],
    [105, 'Ring A', null, 0, 0, 0, 106],
    [106, 'Ring B', null, 0, 0, 0, 105],
    [107, 'Empty Area', '2018-01-01 00:00:00', 0, 0, 0, 100],
    [108, 'Customs', '2016-02-02 00:00:00', 0, 0, 1, 102],
  ];
  for (const [id, name, modified, x, y, z, parent] of zones)
    zone.run(id, name, 'file.zone', USER, modified, x, y, z, parent);

  const object = db.prepare(
    'INSERT INTO ObjectTbl (ObjId, Name, IDName, Hint, Desc, KindID, RefNum, X, Y, Z, Script, Content, Deleted, UserID, Modified, DateAdded, ServerID, ZoneID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  type Room = [number, string, string, string, number, number, number, number, number, string, string | null, number];
  const rooms: Room[] = [
    // id, name, idname, desc, kind, ref, x, y, z, deleted, modified, zone
    [1, 'In The Harbor', '', 'Gulls cry over the water.', 0, 1, 0, 0, 0, 'N', '2020-05-01 10:00:00', 101],
    [2, 'Pier', '', '', 0, 0, 0, 240, 0, 'N', null, 101],
    [3, 'Dock A', '', 'Crates are stacked here.', 0, 3, 480, 240, 1, 'N', '2021-01-01 00:00:00', 102],
    [4, 'Maze Entry', '', 'Tall hedges.', 0, 4, 0, 0, 0, 'N', '2014-09-21 19:57:09', 103],
    [5, 'Deleted Room', '', 'Gone.', 0, 5, 0, 480, 0, 'Y', '2020-01-01 00:00:00', 101],
    [6, 'A Sign', '', 'Not a room.', 3, 6, 0, 0, 0, 'N', '2020-01-01 00:00:00', 101],
    [7, '', 'hidden-name', 'A room only the id names.', 0, 7, 240, 0, 0, 'N', '2020-06-01 00:00:00', 101],
    [8, '', '', 'Nothing names this one.', 0, 8, 240, 240, 0, 'N', '2020-06-02 00:00:00', 101],
    [9, 'Lost Room', '', 'Nobody knows where.', 0, 9, 0, 0, 0, 'N', '2020-06-03 00:00:00', 104],
    [10, 'Loop Room', '', 'Circles.', 0, 10, 0, 0, 0, 'N', '2020-06-04 00:00:00', 105],
    [11, 'Wanderer', '', 'No zone at all.', 0, 11, 0, 0, 0, 'N', '2020-06-05 00:00:00', 0],
    [12, 'Delphi Zero', '', 'Never dated.', 0, 12, 0, 480, 0, 'N', '1899-12-30 00:00:00', 101],
    [13, 'Customs Hall', '', 'Stamps and ink.', 0, 13, 720, 240, 1, 'N', '2016-03-03 00:00:00', 108],
  ];
  for (const [id, name, idName, desc, kind, ref, x, y, z, deleted, modified, zoneId] of rooms) {
    object.run(
      id,
      name,
      idName,
      'hint',
      desc,
      kind,
      ref,
      x,
      y,
      z,
      'script',
      'content',
      deleted,
      USER,
      modified,
      '2020-01-01 00:00:00',
      SERVER,
      zoneId,
    );
  }

  const exit = db.prepare(
    'INSERT INTO ExitTbl (ExitId, FromID, ToID, ExitKindID, Name, DirType, DirToType, Tested, UserID, Modified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const exits: [number, number, number | null, number, number, string, string | null][] = [
    // id, from, to, dirType, dirToType, tested, modified
    [1, 1, 2, 4, 0, 'Y', '2020-05-02 00:00:00'],
    [2, 2, 1, 0, 4, 'N', '2020-05-03 00:00:00'],
    [3, 2, 3, 2, 6, 'N', '2021-06-01 00:00:00'],
    [4, 3, 4, 6, 2, 'N', '2021-06-02 00:00:00'],
    [5, 1, 1, 2, 11, 'N', '2020-05-04 00:00:00'],
    [6, 1, 99999, 6, 2, 'N', '2020-05-05 00:00:00'],
    [7, 1, 2, 10, 0, 'N', '2020-05-06 00:00:00'],
    [8, 777, 1, 0, 4, 'N', '2020-05-07 00:00:00'],
    [9, 1, 2, 4, 0, 'N', '2019-01-01 00:00:00'],
    [10, 2, 3, 2, 6, 'Y', '2022-01-01 00:00:00'],
    [11, 1, 2, 12, 0, 'N', '2020-05-08 00:00:00'],
    [12, 1, 1, 8, 0, 'N', null],
    [13, 13, 0, 0, 4, 'N', '1899-12-30 00:00:00'],
  ];
  for (const [id, from, to, dirType, dirToType, tested, modified] of exits)
    exit.run(id, from, to, 0, '', dirType, dirToType, tested, USER, modified);

  const portal = db.prepare(
    'INSERT INTO PortalTbl (PortalId, ToID, Cost, ZoneID, Name, Enable, Modified) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  portal.run(1, 1, 1, -1, 'recall', 'Y', '2023-04-30 12:48:33');
  portal.run(2, 4040, 5, -1, 'broken', 'N', null);
  return db;
}

function imported(): { result: AzahImport; rows: AzahRows } {
  const rows = readAzahRows(database());
  return { result: importAzah(rows, { importedAt: '2026-11-07' }), rows };
}

const file = (result: AzahImport, areaId: string) => {
  const found = result.areas.find((a) => a.areaId === areaId);
  if (!found) throw new Error(`no area file ${areaId}`);
  return found;
};
const roomsOf = (result: AzahImport, areaId: string) =>
  file(result, areaId).map.continents[0].areas[0].subzones.flatMap((s) => s.rooms);

describe('readAzahRows', () => {
  it("selects only the columns it needs: the author's user id and the server id are not in what it reads", () => {
    const rows = readAzahRows(database());
    expect(JSON.stringify(rows)).not.toContain(String(USER));
    expect(JSON.stringify(rows)).not.toContain('UserID');
    expect(JSON.stringify(rows)).not.toContain('ServerID');
    expect(rows.objects).toHaveLength(13);
    expect(rows.exits).toHaveLength(13);
    expect(rows.zones).toHaveLength(9);
    expect(rows.portals).toHaveLength(2);
    expect(Object.keys(rows.objects[0] as object).sort()).toEqual([
      'Deleted',
      'Desc',
      'IDName',
      'KindID',
      'Modified',
      'Name',
      'ObjId',
      'RefNum',
      'X',
      'Y',
      'Z',
      'ZoneID',
    ]);
  });
});

describe('importAzah: rooms', () => {
  const { result } = imported();

  it('maps a row to a room: stable id from the source key, title, description, grid cell, reference and date', () => {
    const room = roomsOf(result, 'az-a101').find((r) => r.id === 'az1');
    expect(room).toEqual({
      id: 'az1',
      title: 'In The Harbor',
      description: 'Gulls cry over the water.',
      coords: { x: 0, y: 0, z: 0 },
      exits: { S: 'azl1', E: 'azl5', W: 'azl6', U: 'azl12' },
      sources: [{ kind: 'azah', ref: '1', credit: 'Azah', date: '2020-05-01' }],
    });
    // 240 source units are one step; a floor is kept; no sector and no vnum are invented
    const dock = roomsOf(result, 'az-a101').find((r) => r.id === 'az3');
    expect(dock?.coords).toEqual({ x: 2, y: 1, z: 1 });
    expect(dock).not.toHaveProperty('vnum');
    expect(dock).not.toHaveProperty('sector');
  });

  it('puts a credit on every source of every record, and no field of the source that was not asked for', () => {
    const everything = JSON.stringify(result);
    expect(everything).not.toContain(String(USER));
    expect(everything).not.toContain('ServerID');
    expect(everything).not.toContain('UserID');
    expect(AZAH_CREDIT).toBe('Azah');
    const sources: { kind: string; credit?: string; ref?: string }[] = [];
    for (const f of result.areas) {
      for (const a of f.map.continents[0].areas) {
        sources.push(...(a.sources ?? []));
        for (const s of a.subzones) for (const r of s.rooms) sources.push(...r.sources);
      }
      for (const l of f.map.links) sources.push(...(l.sources ?? []));
    }
    expect(sources).toHaveLength(5 + 11 + 8); // every area, room and link
    expect(sources.every((s) => s.kind === 'azah' && s.credit === 'Azah' && typeof s.ref === 'string')).toBe(true);
  });

  it('skips a deleted row and a row that is not a room, and counts them', () => {
    const ids = result.areas.flatMap((f) =>
      f.map.continents[0].areas[0].subzones.flatMap((s) => s.rooms.map((r) => r.id)),
    );
    expect(ids).not.toContain('az5');
    expect(ids).not.toContain('az6');
    expect(result.report.rooms).toMatchObject({
      read: 13,
      imported: 11,
      deleted: 1,
      notRooms: 1,
      invalid: 0,
      duplicateIds: 0,
    });
    const r = result.report.rooms;
    expect(r.read).toBe(r.imported + r.deleted + r.notRooms + r.invalid + r.duplicateIds);
    expect(ids).toHaveLength(11);
  });

  it('a room with no description has none (a blank is not text); an undated row has no date on its source', () => {
    const pier = roomsOf(result, 'az-a101').find((r) => r.id === 'az2');
    expect(pier).not.toHaveProperty('description');
    expect(pier?.sources).toEqual([{ kind: 'azah', ref: '2', credit: 'Azah' }]); // RefNum 0: the object id is the reference, and a missing time is no date
    const zero = roomsOf(result, 'az-a101').find((r) => r.id === 'az12');
    expect(zero?.sources[0]).not.toHaveProperty('date'); // 1899-12-30 is the format's "never set"
    expect(result.report.rooms).toMatchObject({ undated: 2, withoutDescription: 1 });
  });

  it('names a room from its id name when the name is empty, and by a fixed word when it has neither', () => {
    const rooms = roomsOf(result, 'az-a101');
    expect(rooms.find((r) => r.id === 'az7')?.title).toBe('hidden-name');
    expect(rooms.find((r) => r.id === 'az8')?.title).toBe('Unnamed room');
    expect(result.report.rooms.unnamed).toBe(1);
  });

  it("puts rooms of a zone chain three deep into subzones of the area, the area's own rooms in a Main subzone", () => {
    const area = file(result, 'az-a101').map.continents[0].areas[0];
    expect(area.subzones.map((s) => [s.id, s.name, s.kind, s.rooms.length])).toEqual([
      ['az-s101', 'Main', 'consistent', 5],
      ['az-s102', 'Old Docks', 'consistent', 1],
      ['az-s108', 'Customs', 'consistent', 1],
    ]);
    expect(file(result, 'az-a101')).toMatchObject({
      continentId: 'az-c100',
      continentName: 'Westlands',
      areaName: 'Harbor Town',
    });
  });

  it("writes the area's placement from the zone's own position and the extent of its rooms, not from a room count", () => {
    expect(file(result, 'az-a101').map.continents[0].areas[0].placement).toEqual({ x: 10, y: -2, w: 4, h: 3 });
    expect(file(result, 'az-a103').map.continents[0].areas[0].placement).toEqual({ x: -10, y: 57, w: 1, h: 1 });
  });

  it('types a zone with "maze" in its name as a maze and lists it', () => {
    expect(file(result, 'az-a103').map.continents[0].areas[0].subzones[0]).toMatchObject({
      id: 'az-s103',
      kind: 'maze',
    });
    expect(result.report.zones.mazeByName).toEqual(['Hedge Maze']);
  });

  it('keeps rooms of zones the rules could not place in an unsorted continent, listed rather than guessed', () => {
    expect(result.report.zones.unmatched).toEqual([
      { zoneId: 104, name: 'Lost Place', reason: 'orphan-parent', rooms: 1 },
      { zoneId: 105, name: 'Ring A', reason: 'cycle', rooms: 1 },
      { zoneId: 106, name: 'Ring B', reason: 'cycle', rooms: 0 },
    ]);
    expect(file(result, 'az-a104')).toMatchObject({ continentId: UNSORTED_CONTINENT, areaName: 'Lost Place' });
    expect(file(result, 'az-a105')).toMatchObject({ continentId: UNSORTED_CONTINENT, areaName: 'Ring A' });
    expect(file(result, 'az-unzoned-0')).toMatchObject({
      continentId: UNSORTED_CONTINENT,
      areaName: 'Unzoned rooms (zone 0)',
    });
    expect(file(result, 'az-unzoned-0').map.continents[0].areas[0].placement).toBeNull();
    expect(result.report.rooms).toMatchObject({ unzoned: 1, inUnmatchedZones: 2 });
    expect(result.report.zones.empty).toEqual([107]);
  });
});

describe('importAzah: exits', () => {
  const { result } = imported();
  const links = result.areas.flatMap((f) => f.map.links);
  const link = (id: string) => links.find((l) => l.id === id);

  it("every exit is a low-confidence candidate with the source's reference and date; a tested one is a little higher", () => {
    expect(link('azl2')).toMatchObject({
      from: 'az2',
      dir: 'N',
      to: 'az1',
      state: 'candidate',
      confidence: CONFIDENCE_UNTESTED,
      traversals: 0,
      reverse: false,
      offPage: false,
      sources: [{ kind: 'azah', ref: '2', credit: 'Azah', date: '2020-05-03' }],
    });
    expect(link('azl1')).toMatchObject({ dir: 'S', to: 'az2', confidence: CONFIDENCE_TESTED });
    expect(CONFIDENCE_UNTESTED).toBeLessThan(0.6); // below what one walk earns (docs diagram D12)
    expect(links.every((l) => l.confidence <= 0.4)).toBe(true);
    expect(links.every((l) => l.state === 'candidate' || l.state === 'unknown-target')).toBe(true);
  });

  it('an exit marked as unknown, one with no destination and one to a room that is not there are unknown targets', () => {
    for (const id of ['azl5', 'azl6', 'azl13'])
      expect(link(id)).toMatchObject({ to: null, state: 'unknown-target', confidence: 0 });
    expect(result.report.exits).toMatchObject({ unknownTarget: 3, targetMissing: 1 });
  });

  it('a loop back into the same room is kept as a loop', () => {
    expect(link('azl12')).toMatchObject({ from: 'az1', to: 'az1', dir: 'U', state: 'candidate' });
    expect(result.report.exits.selfLoops).toBe(1);
  });

  it('skips an exit by a typed command, an exit out of a room that is not there, and an unknown direction; each is counted', () => {
    expect(link('azl7')).toBeUndefined();
    expect(link('azl8')).toBeUndefined();
    expect(link('azl11')).toBeUndefined();
    expect(result.report.exits).toMatchObject({
      read: 13,
      skippedCustom: 1,
      skippedFromMissing: 1,
      skippedBadDirection: 1,
    });
  });

  it('where two exits share a room and a direction the newer record is kept (E9), the older one is dropped and counted', () => {
    expect(link('azl9')).toBeUndefined(); // older than azl1
    expect(link('azl1')).toBeDefined();
    expect(link('azl3')).toBeUndefined(); // replaced by the newer azl10
    expect(link('azl10')).toMatchObject({ from: 'az2', dir: 'E', to: 'az3', confidence: CONFIDENCE_TESTED });
    expect(result.report.exits.duplicatesDropped).toBe(2);
    const e = result.report.exits;
    expect(e.read).toBe(
      e.imported + e.skippedCustom + e.skippedFromMissing + e.skippedBadDirection + e.duplicatesDropped,
    );
    expect(e.imported).toBe(8);
  });

  it("an exit into another area is off the page, and the room's slot names the link", () => {
    expect(link('azl4')).toMatchObject({ from: 'az3', to: 'az4', offPage: true });
    expect(result.report.exits.offPage).toBe(1);
    const dock = roomsOf(result, 'az-a101').find((r) => r.id === 'az3');
    expect(dock?.exits).toEqual({ W: 'azl4' });
    expect(link('azl2')?.offPage).toBe(false);
  });

  it('every area file is a valid map file on its own, including the one with an exit to another page', () => {
    for (const f of result.areas) {
      const checked = validateMapFile(f.map);
      expect({ area: f.areaId, errors: checked.ok ? [] : checked.errors }).toEqual({ area: f.areaId, errors: [] });
    }
    expect(file(result, 'az-a101').map.links.find((l) => l.id === 'azl4')?.to).toBe('az4'); // a room that is in az-a103's file
  });
});

describe('importAzah: portals and the manifest', () => {
  const { result } = imported();

  it('keeps the portals as candidates with the room they lead to when it is known', () => {
    expect(result.portals).toEqual([
      { id: 'azp1', name: 'recall', toRoom: 'az1', cost: 1, enabled: true, date: '2023-04-30' },
      { id: 'azp2', name: 'broken', toRoom: null, cost: 5, enabled: false },
    ]);
    expect(result.report.portals).toEqual({ read: 2, kept: 2 });
  });

  it('describes every file with counts, the credit text and the status', () => {
    const manifest = buildManifest(result, { importedAt: '2026-11-07' });
    expect(manifest).toMatchObject({
      version: 1,
      status: 'candidate',
      source: { name: 'azah', database: 'azah-db.dbm', importedAt: '2026-11-07', credit: { name: 'Azah' } },
    });
    expect(manifest.source.credit.text).toContain('Azah');
    expect(manifest.counts).toEqual({
      continents: 2,
      areas: 5,
      subzones: 7,
      rooms: 11,
      links: 8,
      offPageLinks: 1,
      portals: 2,
    });
    expect(manifest.areas.map((a) => a.file)).toEqual(result.areas.map((a) => `${a.areaId}.json.gz`));
    expect(manifest.areas.find((a) => a.id === 'az-a101')).toMatchObject({
      rooms: 7,
      links: 8,
      offPageLinks: 1,
      continentId: 'az-c100',
      placement: { x: 10, y: -2, w: 4, h: 3 },
    });
    expect(manifest.continents).toEqual([
      { id: 'az-c100', name: 'Westlands', areas: 2, rooms: 8 },
      { id: 'az-unsorted', name: 'Unsorted', areas: 3, rooms: 3 },
    ]);
    expect(candidateFileName('az-a101')).toBe('az-a101.json.gz');
    expect(manifest.report).toBe(result.report);
  });

  it('can name another credit and database', () => {
    const rows = readAzahRows(database());
    const other = importAzah(rows, { importedAt: '2026-11-07', credit: 'Someone Else' });
    expect(other.areas[0].map.continents[0].areas[0].sources?.[0].credit).toBe('Someone Else');
    expect(
      buildManifest(other, { importedAt: '2026-11-07', credit: 'Someone Else', database: 'other.dbm' }).source,
    ).toMatchObject({ database: 'other.dbm', credit: { name: 'Someone Else' } });
  });
});

describe('importAzah: the whole thing', () => {
  it('is the same on every run, never changes its input, and writes the day it was given', () => {
    const rows = readAzahRows(database());
    const before = JSON.stringify(rows);
    const a = importAzah(rows, { importedAt: '2026-11-07' });
    const b = importAzah(rows, { importedAt: '2026-11-07' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(rows)).toBe(before);
    expect(a.areas.every((f) => f.map.generatedAt === '2026-11-07')).toBe(true);
  });

  it('every room read ends up in exactly one place: in an area file or in the counted skips', () => {
    const { result } = imported();
    const inFiles = result.areas.reduce(
      (n, f) => n + f.map.continents[0].areas[0].subzones.reduce((m, s) => m + s.rooms.length, 0),
      0,
    );
    expect(inFiles).toBe(result.report.rooms.imported);
  });

  it('survives rows that are not rows, missing fields, a duplicate id and odd values, and counts them', () => {
    const rows: AzahRows = {
      zones: [
        null,
        'x',
        { Name: 'no id' },
        { ZoneId: 1, Name: 'ROOT', Parent: -1 },
        { ZoneId: 2, Name: 'Area', Parent: 1, X: 'oops', Y: 5 },
      ],
      objects: [
        null,
        { ObjId: 'abc' },
        { ObjId: -4, Name: 'negative' },
        { ObjId: 1, Name: 'First', ZoneID: 2, X: -100, Y: 'x', Z: 'high', Deleted: '0' },
        { ObjId: 1, Name: 'Second', ZoneID: 2 },
        {
          ObjId: 2,
          Name: `Control\u0007chars  and   spaces ${'x'.repeat(300)}`,
          Desc: 'd'.repeat(9000),
          ZoneID: 2,
          X: 30000000,
          Y: -30000000,
          Z: 0,
          Modified: 12345,
          Deleted: true,
        },
        {
          ObjId: 3,
          Name: 'Real',
          ZoneID: 2,
          X: 480,
          Y: -0.4,
          Z: 0,
          Deleted: 0,
          RefNum: '77',
          Modified: '2024-02-03T04:05:06',
        },
        { ObjId: 4, Name: 'Flagged gone', ZoneID: 2, Deleted: 'yes' },
      ],
      exits: [
        null,
        { ExitId: 'q' },
        { ExitId: 1, FromID: 1, ToID: 3, DirType: 'east', Tested: 1 },
        { ExitId: 2, FromID: 3, ToID: 1, DirType: '4', Tested: 'true', Modified: '2024-02-03' },
      ],
      portals: [null, { PortalId: 'x' }, { PortalId: 3, Name: '  recall  ', ToID: 3, Enable: 1, Cost: 'cheap' }],
    };
    const result = importAzah(rows, { importedAt: '2026-11-07' });
    expect(result.report.rooms).toMatchObject({ read: 8, imported: 2, invalid: 3, duplicateIds: 1, deleted: 2 });
    const rooms = roomsOf(result, 'az-a2');
    expect(rooms.map((r) => r.id)).toEqual(['az1', 'az3']);
    // a bad X, Y or Z: no position for the row with no usable Y; the floor is 0 when it is not a number
    expect(rooms[0]).not.toHaveProperty('coords');
    expect(rooms[1]).toMatchObject({
      coords: { x: 2, y: 0, z: 0 },
      sources: [{ kind: 'azah', ref: '77', credit: 'Azah', date: '2024-02-03' }],
    });
    expect(Object.is(rooms[1].coords?.y, -0)).toBe(false);
    // the second exit is walkable: a numeric string is a direction number; the first has a word for a direction and is skipped
    expect(result.areas[0].map.links.map((l) => l.id)).toEqual(['azl2']);
    expect(result.areas[0].map.links[0]).toMatchObject({ dir: 'S', confidence: CONFIDENCE_TESTED });
    expect(result.report.exits).toMatchObject({ read: 4, imported: 1, skippedBadDirection: 1, skippedFromMissing: 2 });
    expect(result.portals).toEqual([{ id: 'azp3', name: 'recall', toRoom: 'az3', cost: 0, enabled: true }]);
    expect(result.areas[0].map.continents[0].areas[0].placement).toBeNull(); // the zone's X is not a number
  });

  it('reads a number that is not finite, a date that is not a date and a duplicate zone row as missing, and keeps the first zone', () => {
    const rows: AzahRows = {
      zones: [
        { ZoneId: 1, Name: 'ROOT', Parent: -1 },
        { ZoneId: 2, Name: 'First Area', Parent: 1, X: 480, Y: 480, Modified: 'sometime' },
        { ZoneId: 2, Name: 'Second Area', Parent: 1, X: 9999, Y: 9999 },
        { ZoneId: 3, Name: 'No Parent' },
        { ZoneId: 4, Name: 'Dark Maze', Parent: 2 },
      ],
      objects: [
        { ObjId: 1, Name: 'Plain', ZoneID: 2, X: Number.NaN, Y: 0, Deleted: 'N', Modified: 'yesterday' },
        { ObjId: 2, Name: 'No floor given', ZoneID: 2, X: 240, Y: 240, Deleted: 'N' },
        { ObjId: 3, Name: 'In the maze', ZoneID: 4, X: 0, Y: 0, Z: 0, Deleted: 'N' },
        { ObjId: 4, Name: 'Out of the tree', ZoneID: 3, X: 0, Y: 0, Z: 0, Deleted: 'N' },
      ],
      exits: [],
      portals: [],
    };
    const result = importAzah(rows, { importedAt: '2026-11-07' });
    const area = file(result, 'az-a2').map.continents[0].areas[0];
    expect(area.name).toBe('First Area');
    expect(area.placement).toEqual({ x: 2, y: 2, w: 2, h: 2 }); // the first zone row's position; the size is the extent of the rooms that have one (the maze's room at 0,0 and the pier-like room at 1,1)
    expect(area.sources?.[0]).not.toHaveProperty('date'); // 'sometime' is not a date
    const main = area.subzones.find((s) => s.id === 'az-s2');
    expect(main?.rooms.map((r) => [r.id, r.coords, r.sources[0].date])).toEqual([
      ['az1', undefined, undefined],
      ['az2', { x: 1, y: 1, z: 0 }, undefined],
    ]);
    expect(area.subzones.find((s) => s.id === 'az-s4')).toMatchObject({ name: 'Dark Maze', kind: 'maze' });
    expect(result.report.zones.mazeByName).toEqual(['Dark Maze']);
    expect(result.report.zones.unmatched).toEqual(
      [
        { zoneId: 3, name: 'No Parent', reason: 'orphan-parent', rooms: 1 },
        { zoneId: 2, name: 'Second Area', reason: 'duplicate-id', rooms: 0 },
      ].sort((a, b) => a.zoneId - b.zoneId),
    );
  });

  it('an area none of whose rooms has a position has a placement without a size', () => {
    const rows: AzahRows = {
      zones: [
        { ZoneId: 1, Name: 'ROOT', Parent: -1 },
        { ZoneId: 2, Name: 'Blank Area', Parent: 1, X: 240, Y: 0 },
      ],
      objects: [{ ObjId: 1, Name: 'Nowhere', ZoneID: 2, Deleted: 'N' }],
      exits: [],
      portals: [],
    };
    expect(file(importAzah(rows, { importedAt: '2026-11-07' }), 'az-a2').map.continents[0].areas[0].placement).toEqual({
      x: 1,
      y: 0,
    });
  });

  it('cuts a long title and description to the schema caps and replaces control characters', () => {
    const rows: AzahRows = {
      zones: [
        { ZoneId: 1, Name: 'ROOT', Parent: -1 },
        { ZoneId: 2, Name: 'Area', Parent: 1 },
      ],
      objects: [
        {
          ObjId: 1,
          Name: `Bell\u0007 ${'x'.repeat(300)}`,
          Desc: 'd'.repeat(9000),
          ZoneID: 2,
          X: 0,
          Y: 0,
          Z: 0,
          Deleted: 'N',
        },
      ],
      exits: [],
      portals: [],
    };
    const room = roomsOf(importAzah(rows, { importedAt: '2026-11-07' }), 'az-a2')[0];
    expect(room.title).toHaveLength(200);
    expect(room.title.startsWith('Bell x')).toBe(true);
    expect(room.description).toHaveLength(8000);
  });

  it('clamps a coordinate far outside the grid and keeps zero as zero', () => {
    const rows: AzahRows = {
      zones: [
        { ZoneId: 1, Name: 'ROOT', Parent: -1 },
        { ZoneId: 2, Name: 'Area', Parent: 1, X: 0, Y: 0 },
      ],
      objects: [
        { ObjId: 1, Name: 'Far', ZoneID: 2, X: 99999999999, Y: -99999999999, Z: 5000000, Deleted: 'N' },
        { ObjId: 2, Name: 'Home', ZoneID: 2, X: 0, Y: -100, Z: 0, Deleted: 'N' },
      ],
      exits: [],
      portals: [],
    };
    const rooms = roomsOf(importAzah(rows, { importedAt: '2026-11-07' }), 'az-a2');
    expect(rooms[0].coords).toEqual({ x: 100000, y: -100000, z: 100000 });
    expect(rooms[1].coords).toEqual({ x: 0, y: 0, z: 0 });
    expect(Object.is(rooms[1].coords?.x, -0)).toBe(false);
    expect(Object.is(rooms[1].coords?.y, -0)).toBe(false);
  });

  it("a room in a continent zone itself gets an area of the continent's name; a room with no zone number at all is unzoned", () => {
    const rows: AzahRows = {
      zones: [{ ZoneId: 1, Name: 'ISLAND', Parent: -1, X: 240, Y: 240 }],
      objects: [
        { ObjId: 1, Name: 'On the island', ZoneID: 1, X: 0, Y: 0, Z: 0, Deleted: 'N' },
        { ObjId: 2, Name: 'Floating', X: 0, Y: 0, Z: 0, Deleted: 'N' },
      ],
      exits: [],
      portals: [],
    };
    const result = importAzah(rows, { importedAt: '2026-11-07' });
    expect(result.areas.map((f) => [f.areaId, f.areaName, f.continentId])).toEqual([
      ['az-a1', 'Island', 'az-c1'],
      ['az-unzoned-none', 'Unzoned rooms (zone none)', 'az-unsorted'],
    ]);
  });

  it('an empty database imports nothing', () => {
    const result = importAzah({ zones: [], objects: [], exits: [], portals: [] }, { importedAt: '2026-11-07' });
    expect(result.areas).toEqual([]);
    expect(result.portals).toEqual([]);
    expect(buildManifest(result, { importedAt: '2026-11-07' }).counts).toEqual({
      continents: 0,
      areas: 0,
      subzones: 0,
      rooms: 0,
      links: 0,
      offPageLinks: 0,
      portals: 0,
    });
  });
});
