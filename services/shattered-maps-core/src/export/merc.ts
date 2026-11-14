/**
 * The Builder export: one area or subzone of an audited map as the text of a Merc `.are` file, for MUD Builder's quarantine import.
 *
 * Rooms, exits, sectors, titles and descriptions have a place in the file; everything else the map knows (how often an exit was
 * walked, how sure the map is, what a room usually holds, where a record came from, the position on the grid) has none, and is
 * counted in the report instead of being dropped without a word. Room numbers come from a configured range: a room keeps its own
 * number when that number is in the range and unique, and every other room takes the lowest free number. When the range is too
 * small nothing is written, and the report says by how much.
 *
 * Nothing here talks to the Builder: the caller sends the text to the preview route, and the commit stays the owner's.
 */

import { emitAreaFile, type AreaFile, type Room as MercRoom, type RoomExit } from '@shatteredarchive/merc-area';
import { buildIndex, resolveAlias, sliceMap } from '../hierarchy.js';
import { DIRECTIONS, type Direction, type MapFile, type Room } from '../schema.js';

/** The direction slots of a Merc room (the Builder's engine adds the four diagonals as 6 to 9). */
export const MERC_DOOR: Readonly<Record<Direction, number>> = {
  N: 0,
  E: 1,
  S: 2,
  W: 3,
  U: 4,
  D: 5,
  NE: 6,
  NW: 7,
  SE: 8,
  SW: 9,
};

/** Largest room number the game can hold (an `sh_int`). */
export const MERC_MAX_VNUM = 32767;

const AREA_FILE_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.are$/;

/** Merc sector numbers (`merc.h`); 8 is unused. */
const SECTOR_NAMES: Readonly<Record<string, number>> = {
  inside: 0,
  indoors: 0,
  indoor: 0,
  city: 1,
  street: 1,
  road: 1,
  field: 2,
  fields: 2,
  plains: 2,
  forest: 3,
  woods: 3,
  hills: 4,
  hill: 4,
  mountain: 5,
  mountains: 5,
  water: 6,
  water_swim: 6,
  swim: 6,
  shallow: 6,
  noswim: 7,
  water_noswim: 7,
  deepwater: 7,
  air: 9,
  desert: 10,
};

export interface MercExportOptions {
  /** `area` or `subzone`: the slice to export. */
  level: 'area' | 'subzone';
  id: string;
  /** The file name the Builder will store it under, for example `gate_road.are`. */
  fileName: string;
  /** The room numbers this export may use, both ends included. */
  vnumRange: { min: number; max: number };
  /** The area's name in the file. Default: the slice's title. */
  areaName?: string;
  /** Default: `Shattered Maps`. */
  credits?: string;
}

export interface MercReport {
  level: 'area' | 'subzone';
  id: string;
  title: string;
  /** Rooms written to the file. */
  rooms: number;
  /** Exits written to the file. */
  exits: number;
  /** Rooms that kept the number they already had. */
  vnumsKept: number;
  /** Rooms that were given a number from the range. */
  vnumsAllocated: number;
  /** Rooms that had a number outside the range, or one another room already used, and were given a new one. */
  vnumsReplaced: number;
  /** Candidate (not yet walked both ways) exits written as ordinary exits. */
  candidateExits: number;
  /** Exits written with a target outside the exported part (the target room's own number). */
  externalExits: number;
  /** What the file has no place for, one line each, with a count. Never empty by accident: a clean export says so with an empty list. */
  unrepresentable: { what: string; count: number }[];
  /** Things the export refused to guess: nothing is written while this is not empty. */
  errors: string[];
}

export interface MercExportResult {
  /** The `.are` text, or `null` when `report.errors` is not empty. */
  text: string | null;
  area: AreaFile | null;
  report: MercReport;
}

class Tally {
  private readonly counts = new Map<string, number>();
  add(what: string, n = 1): void {
    if (n > 0) this.counts.set(what, (this.counts.get(what) ?? 0) + n);
  }
  list(): { what: string; count: number }[] {
    return [...this.counts].map(([what, count]) => ({ what, count }));
  }
}

/** Merc strings end at `~`, and the Builder refuses NUL and the replacement character. Returns the clean text and whether it changed. */
function cleanText(text: string): { text: string; changed: boolean } {
  const clean = text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000�]/g, '')
    .replace(/~/g, '-');
  return { text: clean, changed: clean !== text.replace(/\r\n?/g, '\n') };
}

function sectorNumber(sector: string | undefined): number | null {
  if (sector === undefined || sector.trim() === '') return null;
  const key = sector
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (/^\d+$/.test(key)) {
    const n = Number(key);
    return n <= 10 && n !== 8 ? n : null;
  }
  return SECTOR_NAMES[key] ?? SECTOR_NAMES[key.replace(/_/g, '')] ?? null;
}

function rangeError(range: { min: number; max: number }): string | null {
  if (!Number.isInteger(range.min) || !Number.isInteger(range.max))
    return 'the room number range must be whole numbers';
  if (range.min < 1 || range.max > MERC_MAX_VNUM || range.min > range.max) {
    return `the room number range must satisfy 1 <= min <= max <= ${MERC_MAX_VNUM}`;
  }
  return null;
}

/**
 * Exports one area or subzone. Pure: the same map and options give the same text. A slice that is not in the map, a bad file name or
 * range, or a range with too few numbers puts a line in `report.errors` and writes nothing.
 */
export function exportMerc(map: MapFile, options: MercExportOptions): MercExportResult {
  const errors: string[] = [];
  const slice = sliceMap(map, options.level, options.id);
  const report: MercReport = {
    level: options.level,
    id: options.id,
    title: slice?.title ?? '',
    rooms: 0,
    exits: 0,
    vnumsKept: 0,
    vnumsAllocated: 0,
    vnumsReplaced: 0,
    candidateExits: 0,
    externalExits: 0,
    unrepresentable: [],
    errors,
  };
  const fail = (): MercExportResult => ({ text: null, area: null, report });

  if (!slice) {
    errors.push(`there is no ${options.level} "${options.id}" in this map`);
    return fail();
  }
  if (!AREA_FILE_RE.test(options.fileName)) {
    errors.push(
      `"${options.fileName}" is not a file name the Builder accepts: letters, digits, _ . - and the ending .are`,
    );
  }
  const rangeProblem = rangeError(options.vnumRange);
  if (rangeProblem) errors.push(rangeProblem);
  const rooms = slice.rooms.filter((r) => r.context !== true);
  if (rooms.length === 0) errors.push(`the ${options.level} has no rooms to export`);
  if (errors.length > 0) return fail();

  const { min, max } = options.vnumRange;
  const capacity = max - min + 1;
  const index = buildIndex(map);
  const inSlice = new Set(rooms.map((r) => r.id));

  // Numbers of rooms elsewhere in the map are not ours to hand out again.
  const reserved = new Set<number>();
  for (const [id, found] of index.rooms) {
    if (!inSlice.has(id) && found.room.vnum !== undefined) reserved.add(found.room.vnum);
  }

  const vnumOf = new Map<string, number>();
  const used = new Set<number>();
  for (const room of rooms) {
    const own = room.vnum;
    if (own !== undefined && own >= min && own <= max && !used.has(own) && !reserved.has(own)) {
      vnumOf.set(room.id, own);
      used.add(own);
      report.vnumsKept += 1;
    }
  }
  let free = min;
  const allocate = (): number | null => {
    while (free <= max && (used.has(free) || reserved.has(free))) free += 1;
    if (free > max) return null;
    used.add(free);
    return free++;
  };
  let short = 0;
  for (const room of rooms) {
    if (vnumOf.has(room.id)) continue;
    const next = allocate();
    if (next === null) {
      short += 1;
      continue;
    }
    vnumOf.set(room.id, next);
    if (room.vnum !== undefined) report.vnumsReplaced += 1;
    else report.vnumsAllocated += 1;
  }
  if (short > 0) {
    errors.push(
      `the range ${min}-${max} holds ${capacity} numbers but ${rooms.length} rooms need one (${short} too few; ${reserved.size} numbers in the range may be used by rooms outside the export)`,
    );
    return fail();
  }

  const lost = new Tally();
  const mercRooms: MercRoom[] = [];
  for (const room of rooms) {
    mercRooms.push(buildRoom(room, vnumOf.get(room.id) as number, index, vnumOf, report, lost));
  }

  const header = (value: string, what: string): string => {
    const cleaned = cleanText(value.replace(/\s+/g, ' ').trim());
    if (cleaned.changed) lost.add(`${what} had a "~", which a Merc file cannot hold; replaced by "-"`);
    return cleaned.text;
  };
  const area: AreaFile = {
    sections: [
      {
        kind: 'area',
        fileName: options.fileName,
        name: header(options.areaName ?? slice.title, 'The area name'),
        credits: header(options.credits ?? 'Shattered Maps', 'The credits'),
        minVnum: min,
        maxVnum: max,
      },
      { kind: 'rooms', rooms: mercRooms },
    ],
  };

  // What the file never holds, whatever the rooms contain.
  const withCoords = rooms.filter((r) => r.coords !== undefined).length;
  lost.add('rooms with a position on the map grid (a Merc file has none)', withCoords);
  lost.add(
    'rooms with a record of where they came from (sources and history)',
    rooms.filter((r) => r.sources.length > 0 || (r.history?.length ?? 0) > 0).length,
  );
  const baselineRooms = rooms.filter(
    (r) => r.baseline !== undefined && (r.baseline.contents.length > 0 || r.baseline.was.length > 0),
  );
  lost.add(
    'rooms with a record of what they usually hold (mobs, items; the file lists them only as resets)',
    baselineRooms.length,
  );
  report.unrepresentable = lost.list();

  report.rooms = mercRooms.length;
  // Everything `emitAreaFile` refuses (a "~", a door outside 0-9) was cleaned or is fixed above, so it does not throw here.
  return { text: emitAreaFile(area), area, report };
}

function buildRoom(
  room: Room,
  vnum: number,
  index: ReturnType<typeof buildIndex>,
  vnumOf: ReadonlyMap<string, number>,
  report: MercReport,
  lost: Tally,
): MercRoom {
  const title = cleanText(room.title.replace(/\s+/g, ' ').trim());
  if (title.changed) lost.add('titles with a "~", which a Merc file cannot hold; replaced by "-"');
  const body = cleanText(room.description ?? '');
  if (body.changed)
    lost.add('descriptions with a "~" or a control character a Merc file cannot hold; replaced or removed');
  const text = body.text.trim();
  if (text === '') lost.add('rooms with no description (written empty)');

  const sector = sectorNumber(room.sector);
  if (sector === null) {
    lost.add(
      room.sector === undefined || room.sector.trim() === ''
        ? 'rooms with no sector (written as inside)'
        : `rooms whose sector "${room.sector.trim().slice(0, 40)}" is not a Merc sector (written as inside)`,
    );
  }

  const exits: RoomExit[] = [];
  const seen = new Set<Direction>();
  const outgoing = index.linksFrom.get(room.id) ?? [];
  for (const dir of DIRECTIONS) {
    const link = outgoing.find((l) => l.dir === dir && room.exits[dir] === l.id) ?? outgoing.find((l) => l.dir === dir);
    if (!link || seen.has(dir)) continue;
    seen.add(dir);
    if (link.state === 'unknown-target' || link.to === null) {
      lost.add('exits whose target is not known (left out)');
      continue;
    }
    if (link.state === 'conflict') {
      lost.add('exits whose sightings disagree about the target (left out)');
      continue;
    }
    const target = resolveAlias(index, link.to);
    const found = target === null ? undefined : index.rooms.get(target);
    if (target === null || !found) {
      lost.add('exits to a room the map does not hold (left out)');
      continue;
    }
    const toVnum = vnumOf.get(target) ?? found.room.vnum;
    if (toVnum === undefined) {
      lost.add('exits to a room outside the export that has no room number (left out)');
      continue;
    }
    if (!vnumOf.has(target)) report.externalExits += 1;
    if (link.state === 'candidate') report.candidateExits += 1;
    exits.push({ door: MERC_DOOR[dir], description: '', keyword: '', locks: 0, key: 0, toVnum });
  }
  report.exits += exits.length;
  exits.sort((a, b) => a.door - b.door);

  return {
    vnum,
    name: title.text,
    description: text === '' ? '' : `${text}\n`,
    areaNumber: 0,
    roomFlags: 0,
    sectorType: sector ?? 0,
    exits,
    extraDescrs: [],
  };
}
