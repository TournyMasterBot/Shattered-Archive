/**
 * The community map ("Azah's map", a CMud database) as candidates in the neutral schema.
 *
 * Everything imported is a CANDIDATE: dated by the source's own last-edit time, credited to its author on every record, with a low
 * confidence (an untested exit 0.3, one the author marked tested 0.4, an exit with no known target 0). Nothing here is walked evidence.
 *
 * What is read and what is not. Only the columns named in `readAzahRows` are selected, so the author's user ids, the server id and the
 * other bookkeeping columns never reach this code, let alone the output. The record's `RefNum` is kept as the source reference and its
 * `Modified` time as the date (a missing or zero time is "undated", which loses to any dated record, E9 in merge.ts).
 *
 * Identity. Ids come from the source's own keys, so a re-run gives the same ids: room `az<ObjId>`, exit `azl<ExitId>`, zone `az-a<id>`
 * (area) and `az-s<id>` (subzone). They are never built from a title. The game's own room number is NOT known from this database, so no
 * `vnum` is set.
 *
 * Coordinates. A room's X and Y are in units of 240 per step on its zone's own grid (the measured step along a north-south exit);
 * `x`/`y` are those divided by 240 and rounded, `z` is the floor. Two rooms can land in one cell where the author drew them closer. An
 * area's placement on its continent is the zone's own X and Y position (written by the author, not derived from room counts) in the same
 * unit, and its size the extent of its rooms.
 *
 * Exits. `DirType` 0 to 9 are north, northeast, east, southeast, south, southwest, west, northwest, up and down. 10 is an exit by a typed
 * command ("enter portal"): the schema has no slot for it, so it is counted and left out. An exit marked "unknown destination"
 * (`DirToType` 11) or with no destination is an `unknown-target` link. An exit out of a room that is not imported is skipped. Where
 * two exits share a room and direction, the newer record is kept (E9). A link whose target is in another area is `offPage`.
 *
 * Pure: rows in, files out. Reading the database file and writing the output are the script's job (scripts/import-azah.mjs).
 */

import {
  LIMITS,
  MAP_SCHEMA_VERSION,
  type Area,
  type Direction,
  type Link,
  type MapFile,
  type MapSource,
  type Room,
  type Subzone,
  type SubzoneKind,
} from '../schema.js';
import { newerWins } from './merge.js';
import { planZones, tidyName, type UnmatchedZone, type ZonePlan, type ZoneRow } from './zones.js';

export const AZAH_CREDIT = 'Azah';
/** The community map's units per step on its grid. */
export const GRID_UNIT = 240;
export const CONFIDENCE_UNTESTED = 0.3;
export const CONFIDENCE_TESTED = 0.4;
export const UNSORTED_CONTINENT = 'az-unsorted';

const DIRECTIONS_BY_TYPE: readonly Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'U', 'D'];
const CUSTOM_EXIT = 10;
const UNKNOWN_DESTINATION = 11;

/** What a database handle must offer: this is the shape of node:sqlite's `DatabaseSync`, without importing it. */
export interface SqlDb {
  prepare(sql: string): { all(): unknown[] };
}

export interface AzahRows {
  zones: unknown[];
  objects: unknown[];
  exits: unknown[];
  portals: unknown[];
}

/** The only columns that are read. The author's user ids, the server id and the other columns are never selected. */
export function readAzahRows(db: SqlDb): AzahRows {
  return {
    zones: db.prepare('SELECT ZoneId, Name, Parent, X, Y, Modified FROM ZoneTbl ORDER BY ZoneId').all(),
    objects: db
      .prepare(
        'SELECT ObjId, Name, IDName, Desc, KindID, RefNum, X, Y, Z, Deleted, Modified, ZoneID FROM ObjectTbl ORDER BY ObjId',
      )
      .all(),
    exits: db
      .prepare(
        'SELECT ExitId, FromID, ToID, ExitKindID, DirType, DirToType, Tested, Modified FROM ExitTbl ORDER BY ExitId',
      )
      .all(),
    portals: db
      .prepare('SELECT PortalId, ToID, Cost, ZoneID, Name, Enable, Modified FROM PortalTbl ORDER BY PortalId')
      .all(),
  };
}

export interface AzahOptions {
  /** The day of the import (`YYYY-MM-DD`), written into the files. The importer reads no clock. */
  importedAt: string;
  credit?: string;
}

export interface AreaFile {
  continentId: string;
  continentName: string;
  areaId: string;
  areaName: string;
  map: MapFile;
}

export interface PortalCandidate {
  id: string;
  name: string;
  /** The room it leads to, or null when that room is not in the map. */
  toRoom: string | null;
  cost: number;
  enabled: boolean;
  date?: string;
}

export interface AzahReport {
  rooms: {
    read: number;
    imported: number;
    deleted: number;
    notRooms: number;
    invalid: number;
    duplicateIds: number;
    unnamed: number;
    undated: number;
    withoutDescription: number;
    /** In a zone that is not in the table (listed in `unsorted`). */
    unzoned: number;
    /** In a zone the rules could not place. */
    inUnmatchedZones: number;
  };
  exits: {
    read: number;
    imported: number;
    unknownTarget: number;
    targetMissing: number;
    selfLoops: number;
    tested: number;
    offPage: number;
    skippedCustom: number;
    skippedFromMissing: number;
    skippedBadDirection: number;
    duplicatesDropped: number;
  };
  zones: {
    read: number;
    continents: number;
    areas: number;
    subzones: number;
    unmatched: UnmatchedZone[];
    empty: number[];
    /** Subzones typed `maze` because of their name, so the hint can be checked. */
    mazeByName: string[];
  };
  portals: { read: number; kept: number };
}

export interface AzahImport {
  areas: AreaFile[];
  portals: PortalCandidate[];
  report: AzahReport;
}

// ---------------------------------------------------------------------------------------------------------------------
// reading a row defensively
// ---------------------------------------------------------------------------------------------------------------------

type Row = Record<string, unknown>;

function asRow(value: unknown): Row | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Row) : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function whole(value: unknown): number | undefined {
  const n = num(value);
  return n !== undefined && Number.isInteger(n) ? n : undefined;
}

function text(value: unknown): string {
  // control characters out; nothing else is changed
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ') : '';
}

/** The source stores booleans as `Y`/`N` text in this database; accept the usual forms. */
function flag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return typeof value === 'string' && /^(y|yes|t|true|1)$/i.test(value.trim());
}

/** `YYYY-MM-DD` of a source timestamp, or undefined when it is missing or the format's zero date (1899-12-30, "never set"). */
function dateOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return undefined;
  return Number(match[1]) < 1990 ? undefined : `${match[1]}-${match[2]}-${match[3]}`;
}

function clampCoord(n: number): number {
  return Math.max(-LIMITS.maxCoord, Math.min(LIMITS.maxCoord, n));
}

function cell(units: number): number {
  return clampCoord(Math.round(units / GRID_UNIT) + 0); // + 0 turns a negative zero into 0
}

function cut(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

// ---------------------------------------------------------------------------------------------------------------------
// the import
// ---------------------------------------------------------------------------------------------------------------------

interface SourceRoom {
  id: number;
  zoneId: number | undefined;
  title: string;
  description: string | undefined;
  coords: { x: number; y: number; z: number } | undefined;
  ref: string;
  date: string | undefined;
}

interface Home {
  continentId: string;
  continentName: string;
  areaId: string;
  areaName: string;
  /** The area's own zone, when it has one (it gives the placement and the area's date). */
  areaZone: number | undefined;
  subzoneId: string;
  subzoneName: string;
  kind: SubzoneKind;
}

function emptyReport(): AzahReport {
  return {
    rooms: {
      read: 0,
      imported: 0,
      deleted: 0,
      notRooms: 0,
      invalid: 0,
      duplicateIds: 0,
      unnamed: 0,
      undated: 0,
      withoutDescription: 0,
      unzoned: 0,
      inUnmatchedZones: 0,
    },
    exits: {
      read: 0,
      imported: 0,
      unknownTarget: 0,
      targetMissing: 0,
      selfLoops: 0,
      tested: 0,
      offPage: 0,
      skippedCustom: 0,
      skippedFromMissing: 0,
      skippedBadDirection: 0,
      duplicatesDropped: 0,
    },
    zones: { read: 0, continents: 0, areas: 0, subzones: 0, unmatched: [], empty: [], mazeByName: [] },
    portals: { read: 0, kept: 0 },
  };
}

export function importAzah(rows: AzahRows, options: AzahOptions): AzahImport {
  const credit = options.credit ?? AZAH_CREDIT;
  const report = emptyReport();
  const source = (ref: string, date: string | undefined): MapSource => {
    const s: MapSource = { kind: 'azah', ref, credit };
    if (date !== undefined) s.date = date;
    return s;
  };

  // ---- zones --------------------------------------------------------------------------------------------------------
  const zoneRows: ZoneRow[] = [];
  const zoneInfo = new Map<number, { x: number | undefined; y: number | undefined; date: string | undefined }>();
  for (const raw of rows.zones) {
    const r = asRow(raw);
    const zoneId = r === undefined ? undefined : whole(r.ZoneId);
    if (r === undefined || zoneId === undefined) continue;
    report.zones.read += 1;
    zoneRows.push({ zoneId, name: text(r.Name), parent: whole(r.Parent) ?? null });
    if (!zoneInfo.has(zoneId)) zoneInfo.set(zoneId, { x: num(r.X), y: num(r.Y), date: dateOf(r.Modified) });
  }

  // ---- rooms --------------------------------------------------------------------------------------------------------
  const sourceRooms = new Map<number, SourceRoom>();
  for (const raw of rows.objects) {
    report.rooms.read += 1;
    const r = asRow(raw);
    const id = r === undefined ? undefined : whole(r.ObjId);
    if (r === undefined || id === undefined || id < 0) {
      report.rooms.invalid += 1;
      continue;
    }
    if (flag(r.Deleted)) {
      report.rooms.deleted += 1;
      continue;
    }
    const kind = whole(r.KindID);
    if (kind !== undefined && kind !== 0) {
      report.rooms.notRooms += 1;
      continue;
    }
    if (sourceRooms.has(id)) {
      report.rooms.duplicateIds += 1;
      continue;
    }
    const name = text(r.Name).replace(/\s+/g, ' ').trim() || text(r.IDName).replace(/\s+/g, ' ').trim();
    if (name === '') report.rooms.unnamed += 1;
    const desc = text(r.Desc).trim();
    const x = num(r.X);
    const y = num(r.Y);
    const ref = whole(r.RefNum);
    const date = dateOf(r.Modified);
    if (date === undefined) report.rooms.undated += 1;
    if (desc === '') report.rooms.withoutDescription += 1;
    sourceRooms.set(id, {
      id,
      zoneId: whole(r.ZoneID),
      title: cut(name === '' ? 'Unnamed room' : name, LIMITS.shortText),
      description: desc === '' ? undefined : cut(desc, LIMITS.description),
      coords:
        x === undefined || y === undefined
          ? undefined
          : { x: cell(x), y: cell(y), z: clampCoord(Math.round(num(r.Z) ?? 0) + 0) },
      ref: String(ref !== undefined && ref > 0 ? ref : id),
      date,
    });
  }
  report.rooms.imported = sourceRooms.size;

  // ---- the zone rules ------------------------------------------------------------------------------------------------
  const roomCounts = new Map<number, number>();
  for (const room of sourceRooms.values())
    if (room.zoneId !== undefined) roomCounts.set(room.zoneId, (roomCounts.get(room.zoneId) ?? 0) + 1);
  const rules = planZones(zoneRows, roomCounts);
  report.zones.unmatched = rules.unmatched;
  report.zones.empty = rules.empty;
  const unmatchedIds = new Set(rules.unmatched.map((u) => u.zoneId));
  const unmatchedName = new Map(rules.unmatched.map((u) => [u.zoneId, u.name] as const));
  // every zone asked about is in the plan or in the unmatched list: the rooms are placed only through one of them
  const nameOf = (zoneId: number): string => (rules.plans.get(zoneId)?.name ?? unmatchedName.get(zoneId)) as string;

  const homeOf = (room: SourceRoom): Home => {
    const zoneId = room.zoneId;
    const plan: ZonePlan | undefined = zoneId === undefined ? undefined : rules.plans.get(zoneId);
    if (plan !== undefined && zoneId !== undefined) {
      const continentName = nameOf(plan.continent);
      if (plan.role === 'continent') {
        return {
          continentId: `az-c${plan.continent}`,
          continentName,
          areaId: `az-a${zoneId}`,
          areaName: plan.name,
          areaZone: zoneId,
          subzoneId: `az-s${zoneId}`,
          subzoneName: 'Main',
          kind: plan.kind,
        };
      }
      const areaZone = plan.area as number;
      const areaId = `az-a${areaZone}`;
      const own = plan.role === 'area';
      return {
        continentId: `az-c${plan.continent}`,
        continentName,
        areaId,
        areaName: nameOf(areaZone),
        areaZone,
        subzoneId: `az-s${zoneId}`,
        subzoneName: own ? 'Main' : plan.name,
        kind: plan.kind,
      };
    }
    if (zoneId !== undefined && unmatchedIds.has(zoneId)) {
      report.rooms.inUnmatchedZones += 1;
      return {
        continentId: UNSORTED_CONTINENT,
        continentName: 'Unsorted',
        areaId: `az-a${zoneId}`,
        areaName: nameOf(zoneId),
        areaZone: undefined,
        subzoneId: `az-s${zoneId}`,
        subzoneName: 'Main',
        kind: 'consistent',
      };
    }
    report.rooms.unzoned += 1;
    const tag = zoneId === undefined ? 'none' : String(zoneId);
    return {
      continentId: UNSORTED_CONTINENT,
      continentName: 'Unsorted',
      areaId: `az-unzoned-${tag}`,
      areaName: `Unzoned rooms (zone ${tag})`,
      areaZone: undefined,
      subzoneId: `az-unzoned-${tag}-main`,
      subzoneName: 'Main',
      kind: 'consistent',
    };
  };

  const ordered = [...sourceRooms.values()].sort((a, b) => a.id - b.id);
  const homes = new Map<number, Home>();
  for (const room of ordered) homes.set(room.id, homeOf(room));

  // ---- links ---------------------------------------------------------------------------------------------------------
  const roomKey = (id: number): string => `az${id}`;
  interface Candidate {
    link: Link;
    from: number;
    date: string | undefined;
  }
  const bySlot = new Map<string, Candidate>();
  for (const raw of rows.exits) {
    report.exits.read += 1;
    const r = asRow(raw);
    const exitId = r === undefined ? undefined : whole(r.ExitId);
    const fromId = r === undefined ? undefined : whole(r.FromID);
    if (r === undefined || exitId === undefined || fromId === undefined || !sourceRooms.has(fromId)) {
      report.exits.skippedFromMissing += 1;
      continue;
    }
    const dirType = whole(r.DirType);
    if (dirType === CUSTOM_EXIT) {
      report.exits.skippedCustom += 1;
      continue;
    }
    if (dirType === undefined || dirType < 0 || dirType >= DIRECTIONS_BY_TYPE.length) {
      report.exits.skippedBadDirection += 1;
      continue;
    }
    const dir = DIRECTIONS_BY_TYPE[dirType];
    const toId = whole(r.ToID);
    const date = dateOf(r.Modified);
    const tested = flag(r.Tested);
    const unknown = whole(r.DirToType) === UNKNOWN_DESTINATION || toId === undefined || toId <= 0;
    const missing = !unknown && toId !== undefined && !sourceRooms.has(toId);
    const open = unknown || missing;
    const link: Link = {
      id: `azl${exitId}`,
      from: roomKey(fromId),
      dir,
      to: open ? null : roomKey(toId as number),
      state: open ? 'unknown-target' : 'candidate',
      confidence: open ? 0 : tested ? CONFIDENCE_TESTED : CONFIDENCE_UNTESTED,
      offPage: false,
      traversals: 0,
      reverse: false,
      sources: [source(String(exitId), date)],
    };
    const slot = `${fromId}|${dir}`;
    const held = bySlot.get(slot);
    if (held !== undefined) {
      report.exits.duplicatesDropped += 1;
      if (newerWins(held.date, date) === 'base') continue;
    }
    bySlot.set(slot, { link, from: fromId, date });
    if (missing) report.exits.targetMissing += 1;
  }

  // ---- the files, area by area -------------------------------------------------------------------------------------------
  interface AreaBuild {
    home: Home;
    subzones: Map<string, { name: string; kind: SubzoneKind; rooms: Room[] }>;
    extent: { minX: number; maxX: number; minY: number; maxY: number } | undefined;
    roomIds: Set<string>;
  }
  const areas = new Map<string, AreaBuild>();
  for (const room of ordered) {
    const home = homes.get(room.id) as Home;
    let build = areas.get(home.areaId);
    if (build === undefined) {
      build = { home, subzones: new Map(), extent: undefined, roomIds: new Set() };
      areas.set(home.areaId, build);
    }
    let sub = build.subzones.get(home.subzoneId);
    if (sub === undefined) {
      sub = { name: home.subzoneName, kind: home.kind, rooms: [] };
      build.subzones.set(home.subzoneId, sub);
    }
    const out: Room = { id: roomKey(room.id), title: room.title, exits: {}, sources: [source(room.ref, room.date)] };
    if (room.description !== undefined) out.description = room.description;
    if (room.coords !== undefined) {
      out.coords = room.coords;
      const e = build.extent;
      build.extent =
        e === undefined
          ? { minX: room.coords.x, maxX: room.coords.x, minY: room.coords.y, maxY: room.coords.y }
          : {
              minX: Math.min(e.minX, room.coords.x),
              maxX: Math.max(e.maxX, room.coords.x),
              minY: Math.min(e.minY, room.coords.y),
              maxY: Math.max(e.maxY, room.coords.y),
            };
    }
    sub.rooms.push(out);
    build.roomIds.add(out.id);
  }

  const roomById = new Map<string, Room>();
  for (const build of areas.values())
    for (const sub of build.subzones.values()) for (const r of sub.rooms) roomById.set(r.id, r);
  const areaOfRoom = new Map<string, string>();
  for (const [areaId, build] of areas) for (const id of build.roomIds) areaOfRoom.set(id, areaId);

  const linksByArea = new Map<string, Link[]>();
  for (const { link } of [...bySlot.values()].sort(
    (a, b) => a.from - b.from || DIRECTIONS_BY_TYPE.indexOf(a.link.dir) - DIRECTIONS_BY_TYPE.indexOf(b.link.dir),
  )) {
    const areaId = areaOfRoom.get(link.from) as string;
    if (link.to !== null) {
      link.offPage = areaOfRoom.get(link.to) !== areaId;
      if (link.offPage) report.exits.offPage += 1;
      if (link.to === link.from) report.exits.selfLoops += 1;
    } else {
      report.exits.unknownTarget += 1;
    }
    if (link.confidence === CONFIDENCE_TESTED) report.exits.tested += 1;
    (roomById.get(link.from) as Room).exits[link.dir] = link.id;
    const list = linksByArea.get(areaId);
    if (list) list.push(link);
    else linksByArea.set(areaId, [link]);
  }
  report.exits.imported = [...linksByArea.values()].reduce((n, list) => n + list.length, 0);

  const files: AreaFile[] = [];
  const continentsSeen = new Set<string>();
  const sortedAreas = [...areas.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [areaId, build] of sortedAreas) {
    const { home } = build;
    continentsSeen.add(home.continentId);
    const zone = home.areaZone === undefined ? undefined : zoneInfo.get(home.areaZone);
    const subzones: Subzone[] = [...build.subzones.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, s]) => ({ id, name: s.name, kind: s.kind, rooms: s.rooms }));
    for (const s of subzones)
      if (s.kind === 'maze') report.zones.mazeByName.push(s.name === 'Main' ? home.areaName : s.name);
    const area: Area = {
      id: areaId,
      name: home.areaName,
      placement:
        zone === undefined || zone.x === undefined || zone.y === undefined
          ? null
          : {
              x: cell(zone.x),
              y: cell(zone.y),
              ...(build.extent === undefined
                ? {}
                : {
                    w: Math.max(1, build.extent.maxX - build.extent.minX + 1),
                    h: Math.max(1, build.extent.maxY - build.extent.minY + 1),
                  }),
            },
      subzones,
      sources: [source(String(home.areaZone ?? areaId), zone?.date)],
    };
    files.push({
      continentId: home.continentId,
      continentName: home.continentName,
      areaId,
      areaName: home.areaName,
      map: {
        version: MAP_SCHEMA_VERSION,
        generatedAt: options.importedAt,
        continents: [{ id: home.continentId, name: home.continentName, areas: [area] }],
        links: linksByArea.get(areaId) ?? [],
      },
    });
  }
  report.zones.continents = continentsSeen.size;
  report.zones.areas = files.length;
  report.zones.subzones = files.reduce((n, f) => n + f.map.continents[0].areas[0].subzones.length, 0);
  report.zones.mazeByName.sort();

  // ---- portals ---------------------------------------------------------------------------------------------------------------
  const portals: PortalCandidate[] = [];
  for (const raw of rows.portals) {
    report.portals.read += 1;
    const r = asRow(raw);
    const id = r === undefined ? undefined : whole(r.PortalId);
    if (r === undefined || id === undefined) continue;
    const to = whole(r.ToID);
    const portal: PortalCandidate = {
      id: `azp${id}`,
      name: cut(text(r.Name).trim(), LIMITS.shortText),
      toRoom: to !== undefined && sourceRooms.has(to) ? roomKey(to) : null,
      cost: whole(r.Cost) ?? 0,
      enabled: flag(r.Enable),
    };
    const date = dateOf(r.Modified);
    if (date !== undefined) portal.date = date;
    portals.push(portal);
  }
  report.portals.kept = portals.length;

  return { areas: files, portals, report };
}

// ---------------------------------------------------------------------------------------------------------------------
// the manifest
// ---------------------------------------------------------------------------------------------------------------------

export function candidateFileName(areaId: string): string {
  return `${areaId}.json.gz`;
}

export interface CandidateManifest {
  version: 1;
  source: { name: 'azah'; database: string; credit: { name: string; text: string }; importedAt: string };
  /** What these files are: unverified candidates, never walked evidence, never served by a production build. */
  status: 'candidate';
  counts: {
    continents: number;
    areas: number;
    subzones: number;
    rooms: number;
    links: number;
    offPageLinks: number;
    portals: number;
  };
  continents: { id: string; name: string; areas: number; rooms: number }[];
  areas: {
    id: string;
    name: string;
    continentId: string;
    file: string;
    rooms: number;
    links: number;
    offPageLinks: number;
    placement: Area['placement'];
  }[];
  portals: PortalCandidate[];
  report: AzahReport;
}

export function buildManifest(result: AzahImport, options: AzahOptions & { database?: string }): CandidateManifest {
  const credit = options.credit ?? AZAH_CREDIT;
  const continents = new Map<string, { id: string; name: string; areas: number; rooms: number }>();
  const areaList: CandidateManifest['areas'] = [];
  let rooms = 0;
  let links = 0;
  let offPage = 0;
  for (const file of result.areas) {
    const area = file.map.continents[0].areas[0];
    const roomCount = area.subzones.reduce((n, s) => n + s.rooms.length, 0);
    const off = file.map.links.filter((l) => l.offPage).length;
    rooms += roomCount;
    links += file.map.links.length;
    offPage += off;
    const c = continents.get(file.continentId) ?? {
      id: file.continentId,
      name: file.continentName,
      areas: 0,
      rooms: 0,
    };
    c.areas += 1;
    c.rooms += roomCount;
    continents.set(c.id, c);
    areaList.push({
      id: file.areaId,
      name: file.areaName,
      continentId: file.continentId,
      file: candidateFileName(file.areaId),
      rooms: roomCount,
      links: file.map.links.length,
      offPageLinks: off,
      placement: area.placement,
    });
  }
  return {
    version: 1,
    source: {
      name: 'azah',
      database: options.database ?? 'azah-db.dbm',
      credit: {
        name: credit,
        text: `Map data by ${credit}, from the community CMud map of the game. Imported as unverified candidates, each dated by its last edit in that map.`,
      },
      importedAt: options.importedAt,
    },
    status: 'candidate',
    counts: {
      continents: continents.size,
      areas: areaList.length,
      subzones: result.report.zones.subzones,
      rooms,
      links,
      offPageLinks: offPage,
      portals: result.portals.length,
    },
    continents: [...continents.values()].sort((a, b) => a.id.localeCompare(b.id)),
    areas: areaList,
    portals: result.portals,
    report: result.report,
  };
}
