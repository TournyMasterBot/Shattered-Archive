/**
 * The Simulacrum's own map, read from the literal Merc `.are` files of the game (the `area.lst` list of `merc-mud/2.4/area`), as a map of
 * the `sandbox` world.
 *
 * The files are the authority, so what they hold is `confirmed` with confidence 1: a room is a `#ROOMS` record, an exit is a door 0 to 9 of
 * it. The MUD Builder reads the same files with the same parser (`@shatteredarchive/merc-area`), and `compareWithBuilder` checks the two
 * agree on every count. Walked evidence is not mixed in here: `reconcileWalked` (mercWalked.ts) lays what the player saw over this map.
 *
 * Identity. Ids come from the game's own numbers, so a re-run gives the same ids: room `mr<vnum>`, exit `ml<vnum>-<dir>` (lower case), area
 * `ma-<file stem>`, its one subzone `ma-<stem>-s`. The room's `vnum` is set. A room number defined twice keeps the first definition.
 *
 * Doors. Door 0 to 9 are N E S W U D NE NW SE SW (`act_move.c`). An exit that leads to a room of another file is `offPage`. An exit whose
 * number is 0 or below, or that no listed file defines, is NOT a link: `db.c` `fix_exits` gives it no room, `do_exits` never shows it and
 * a move through it fails. It is counted and listed in the report as a dead exit. The schema has no place for door locks or room-script
 * `warp` lines, so they are COUNTED in the report, not dropped without a word.
 *
 * Coordinates. A file records which rooms connect, never where a room is, so each area is laid out on a grid of its own by
 * `layoutUnplaced` (north is up, east is right, U/D change the floor), then the areas are placed side by side in the list's order.
 *
 * Pure: parsed files in, a map and a report out. Reading the folder is the script's job (scripts/import-merc.mjs).
 */

import type { AreaFile, AreaHeaderSection, Room as MercRoom, RoomExit } from '@shatteredarchive/merc-area';
import { layoutUnplaced } from '../layout.js';
import { trimDashes } from '../trimDashes.js';
import {
  LIMITS,
  MAP_SCHEMA_VERSION,
  type Area,
  type Coords,
  type Direction,
  type Link,
  type MapFile,
  type MapSource,
  type Room,
} from '../schema.js';

export const SIMULACRUM_CONTINENT = 'simulacrum';
/** Door slot 0 to 9 of a Merc exit, by direction. */
export const DOOR_DIRECTIONS: readonly Direction[] = ['N', 'E', 'S', 'W', 'U', 'D', 'NE', 'NW', 'SE', 'SW'];
/** Merc sector numbers (`merc.h` SECT_*); 8 is unused. */
export const SECTOR_NAME: Readonly<Record<number, string>> = {
  0: 'inside',
  1: 'city',
  2: 'field',
  3: 'forest',
  4: 'hills',
  5: 'mountain',
  6: 'water',
  7: 'deepwater',
  9: 'air',
  10: 'desert',
};

const PLACEMENT_GAP = 6;
const PLACEMENT_ROW_WIDTH = 400;
/** The report lists at most this many individual problems of one kind; the count is always complete. */
export const REPORT_LIST_CAP = 50;

export interface MercAreaInput {
  /** The file name as `area.lst` has it, for example `midgaard.are`. */
  file: string;
  area: AreaFile;
}

export interface DeadExit {
  file: string;
  fromVnum: number;
  door: number;
  toVnum: number;
}

export interface MercAreaReport {
  file: string;
  name: string;
  rooms: number;
  exits: number;
  offPage: number;
}

export interface MercImportReport {
  areas: number;
  rooms: number;
  /** Exits that became links (including cross-area ones). */
  links: number;
  crossAreaLinks: number;
  /** Exits with no room behind them (a number of 0 or below, or one no listed file defines): the game gives them no room, so they are no links. */
  deadExits: number;
  deadList: DeadExit[];
  /** Room numbers defined in more than one place: the first definition is kept. */
  duplicateRooms: number[];
  /** Two exits of one room on the same door: the first is kept. */
  duplicateDoors: number;
  /** Exits with a door number outside 0 to 9: left out. */
  badDoors: number;
  /** Exits with a lock state above 0 (a door, a lock or a pick-proof one); the schema has no place for them. */
  lockedExits: number;
  /** `warp <vnum>` lines of room scripts; a teleport has no direction, so the schema has no place for it. */
  warps: number;
  /** Titles or descriptions cut to the schema's caps. */
  truncated: number;
  /** Listed files with no `#ROOMS` section or no room. */
  areasWithoutRooms: string[];
  perArea: MercAreaReport[];
}

export interface MercImportResult {
  map: MapFile;
  report: MercImportReport;
}

export interface MercImportOptions {
  /** `YYYY-MM-DD` or a UTC timestamp, the date of the files (the generation date of the map). */
  date: string;
}

function roomsOf(area: AreaFile): MercRoom[] {
  const out: MercRoom[] = [];
  for (const section of area.sections) if (section.kind === 'rooms') out.push(...section.rooms);
  return out;
}

function headerOf(area: AreaFile): AreaHeaderSection | undefined {
  for (const section of area.sections) if (section.kind === 'area') return section;
  return undefined;
}

/** The `warp <vnum>` lines of room-attached scripts, as the Builder counts them. */
function countWarps(area: AreaFile): number {
  let count = 0;
  for (const section of area.sections) {
    if (section.kind !== 'scripts') continue;
    for (const script of section.scripts) {
      if (script.attach !== 'room') continue;
      for (const line of script.body.split('\n')) if (/^\s*warp\s+-?\d+/.test(line)) count += 1;
    }
  }
  return count;
}

/** `ma-midgaard` from `midgaard.are`; characters the id pattern does not allow become dashes. */
export function areaIdOf(file: string): string {
  const stem = trimDashes(file.replace(/\.are$/i, '').toLowerCase().replace(/[^a-z0-9._:-]+/g, '-'));
  return `ma-${stem === '' ? 'area' : stem}`.slice(0, 62);
}

/** The area's name for people: the header's name without its leading `{ 5 35}` level range and colour codes. */
export function tidyAreaName(header: AreaHeaderSection | undefined, file: string): string {
  const raw = (header?.name ?? '').replace(/\{[a-zA-Z]/g, '').replace(/^\s*\{[^}]*\}\s*/, '').replace(/\s+/g, ' ').trim();
  return raw === '' ? file.replace(/\.are$/i, '') : raw.slice(0, LIMITS.shortText);
}

const roomIdOf = (vnum: number): string => `mr${vnum}`;
const linkIdOf = (vnum: number, dir: Direction): string => `ml${vnum}-${dir.toLowerCase()}`;

/**
 * Room text as a player reads it. The files hold colour sigils (`{RAshen Trailhead{x`); `comm.c` `colour_translate` turns the 15 known
 * ones (`r g y b m c w R G Y B M C W x`) into colour, `{{` into one `{`, and passes any other `{X` through unchanged. A client that strips
 * the colour is left with exactly this text, and that is the text a walked room is matched on.
 */
export function playerText(text: string): string {
  return text.replace(/\{([rgybmcwRGYBMCWx{])/g, (_all, code: string) => (code === '{' ? '{' : ''));
}

/** The credit line without its `{ 5 35}` level range and colour sigils. */
export function tidyCredit(credits: string): string {
  return playerText(credits).replace(/^\s*\{[^}]*\}\s*/, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.shortText);
}

function clip(text: string, cap: number, counter: { truncated: number }): string {
  const clean = playerText(text).replace(/\r/g, '').replace(/[ \t]+$/gm, '').trimEnd();
  if (clean.length <= cap) return clean;
  counter.truncated += 1;
  return clean.slice(0, cap);
}

/**
 * The map of the files, in the order given. Rooms first (so a link can tell a cross-area exit from a dead one), then exits, then the
 * layout.
 */
export function mapFromMerc(files: readonly MercAreaInput[], options: MercImportOptions): MercImportResult {
  const report: MercImportReport = {
    areas: 0,
    rooms: 0,
    links: 0,
    crossAreaLinks: 0,
    deadExits: 0,
    deadList: [],
    duplicateRooms: [],
    duplicateDoors: 0,
    badDoors: 0,
    lockedExits: 0,
    warps: 0,
    truncated: 0,
    areasWithoutRooms: [],
    perArea: [],
  };
  const counter = { truncated: 0 };
  const source = (file: string, vnum?: number): MapSource => ({
    kind: 'builder',
    ref: vnum === undefined ? file : `${file}#${vnum}`,
    date: options.date,
  });

  // 1. rooms: the first definition of a number wins; remember which file defines it
  const owner = new Map<number, string>();
  const kept: MercRoom[][] = [];
  for (const { file, area } of files) {
    const mine: MercRoom[] = [];
    for (const room of roomsOf(area)) {
      if (owner.has(room.vnum)) {
        if (!report.duplicateRooms.includes(room.vnum)) report.duplicateRooms.push(room.vnum);
        continue;
      }
      owner.set(room.vnum, file);
      mine.push(room);
    }
    kept.push(mine);
  }

  // 2. areas, rooms, exits
  const areas: Area[] = [];
  const links: Link[] = [];
  for (const [index, { file, area }] of files.entries()) {
    const header = headerOf(area);
    const mine = kept[index];
    report.warps += countWarps(area);
    const areaId = areaIdOf(file);
    const rooms: Room[] = [];
    let exits = 0;
    let offPage = 0;
    for (const merc of mine) {
      const room: Room = {
        id: roomIdOf(merc.vnum),
        title: clip(merc.name, LIMITS.shortText, counter),
        vnum: merc.vnum,
        description: clip(merc.description, LIMITS.description, counter),
        exits: {},
        sources: [source(file, merc.vnum)],
      };
      const sector = SECTOR_NAME[merc.sectorType];
      if (sector !== undefined) room.sector = sector;
      const taken = new Set<number>();
      for (const exit of merc.exits as RoomExit[]) {
        const dir = DOOR_DIRECTIONS[exit.door];
        if (dir === undefined) {
          report.badDoors += 1;
          continue;
        }
        if (taken.has(exit.door)) {
          report.duplicateDoors += 1;
          continue;
        }
        taken.add(exit.door);
        const target = exit.toVnum > 0 ? owner.get(exit.toVnum) : undefined;
        if (target === undefined) {
          report.deadExits += 1;
          if (report.deadList.length < REPORT_LIST_CAP) report.deadList.push({ file, fromVnum: merc.vnum, door: exit.door, toVnum: exit.toVnum });
          continue;
        }
        if (exit.locks > 0) report.lockedExits += 1;
        const link: Link = {
          id: linkIdOf(merc.vnum, dir),
          from: room.id,
          dir,
          to: roomIdOf(exit.toVnum),
          state: 'confirmed',
          confidence: 1,
          offPage: target !== file,
          traversals: 0,
          reverse: false,
          sources: [source(file, merc.vnum)],
        };
        if (link.offPage) {
          report.crossAreaLinks += 1;
          offPage += 1;
        }
        room.exits[dir] = link.id;
        links.push(link);
        exits += 1;
      }
      rooms.push(room);
    }
    report.rooms += rooms.length;
    report.links += exits;
    const name = tidyAreaName(header, file);
    report.perArea.push({ file, name, rooms: rooms.length, exits, offPage });
    if (rooms.length === 0) {
      report.areasWithoutRooms.push(file);
      continue;
    }
    const sources: MapSource[] = [source(file)];
    if (header !== undefined && header.credits.trim() !== '') sources[0].credit = tidyCredit(header.credits);
    areas.push({
      id: areaId,
      name,
      placement: null,
      subzones: [{ id: `${areaId}-s`, name, kind: 'consistent', rooms }],
      sources,
    });
  }
  report.areas = areas.length;
  report.truncated = counter.truncated;

  // 3. the one back-reference: an exit whose target has the opposite door pointing straight back is a two-way passage
  const byRoomId = new Map<string, Room>();
  for (const a of areas) for (const sz of a.subzones) for (const r of sz.rooms) byRoomId.set(r.id, r);
  const byLinkId = new Map(links.map((l) => [l.id, l]));
  const OPPOSITE: Record<Direction, Direction> = { N: 'S', S: 'N', E: 'W', W: 'E', U: 'D', D: 'U', NE: 'SW', SW: 'NE', NW: 'SE', SE: 'NW' };
  for (const link of links) {
    const back = byRoomId.get(link.to as string)?.exits[OPPOSITE[link.dir]];
    if (back !== undefined && byLinkId.get(back)?.to === link.from) link.reverse = true;
  }

  // 4. layout: each area on a grid of its own, then the areas side by side
  const laid: Area[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  for (const area of areas) {
    const own = new Set<string>();
    for (const sz of area.subzones) for (const r of sz.rooms) own.add(r.id);
    const mini: MapFile = {
      version: MAP_SCHEMA_VERSION,
      continents: [{ id: SIMULACRUM_CONTINENT, name: 'Simulacrum', areas: [area] }],
      links: links.filter((l) => own.has(l.from)),
    };
    const result = layoutUnplaced(mini).map.continents[0].areas[0];
    let minY = Infinity;
    let maxX = 0;
    let maxY = 0;
    // every room has a position after the layout
    const placed = result.subzones.flatMap((sz) => sz.rooms.map((r) => r.coords as Coords));
    for (const c of placed) minY = Math.min(minY, c.y);
    for (const c of placed) {
      c.y -= minY;
      maxX = Math.max(maxX, c.x);
      maxY = Math.max(maxY, c.y);
    }
    const w = maxX + 1;
    const h = maxY + 1;
    if (cursorX > 0 && cursorX + w > PLACEMENT_ROW_WIDTH) {
      cursorX = 0;
      cursorY += rowHeight + PLACEMENT_GAP;
      rowHeight = 0;
    }
    result.placement = { x: cursorX, y: cursorY, w, h };
    cursorX += w + PLACEMENT_GAP;
    rowHeight = Math.max(rowHeight, h);
    laid.push(result);
  }

  const map: MapFile = {
    version: MAP_SCHEMA_VERSION,
    generatedAt: options.date,
    continents: [{ id: SIMULACRUM_CONTINENT, name: 'Simulacrum', areas: laid }],
    links,
  };
  return { map, report };
}
