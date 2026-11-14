import {
  ID_PATTERN,
  LIMITS,
  emptyMap,
  type Area,
  type Continent,
  type Direction,
  type Link,
  type MapFile,
  type MapSource,
  type Room,
  type Subzone,
} from '@shatteredarchive/shattered-maps-core';
import type { MapDocV1, Room as LegacyRoom } from '../types';

/**
 * Reads a DslMapper document (the Mapper's own format before the neutral map file) into a `MapFile`.
 *
 * Nothing is dropped silently: everything the neutral file has no place for is counted in the report, so the owner sees what an
 * import left behind. The mapping:
 *  - catalog continent -> `Continent`; catalog area -> `Area` with one subzone, "Main", `consistent` (the legacy document has no subzones);
 *  - rooms and areas that point at nothing in the catalog go to an "Unassigned" continent, in an "Unassigned rooms" area;
 *  - the legacy `vnum` (a string, a UUID in the seed) is kept as the source reference; it becomes the room's numeric `vnum` only when it
 *    is a plain number that no other room uses. The room's identity is a new id derived from it;
 *  - `coords.cx/cy/vz` (or the older `q/r`, `z`, `level`) -> `coords.x/y/z`;
 *  - each exit with a target -> one `Link` (a `confirmed` exit is `confirmed`, 0.95, walked back; every other status is a `candidate`, 0.6);
 *    an exit with no target, or one whose target room is not in the document, -> an `unknown-target` link (confidence 0).
 *
 * Pure: no clock (the caller passes the date), no storage.
 */

export interface AdapterOptions {
  /** `YYYY-MM-DD` written as the date of every record and as `generatedAt`. */
  date: string;
  /** Who made the document, written on every record's source (`credit`). */
  credit?: string;
}

/** What the neutral file has no field for, counted over the whole document. */
export interface AdapterReport {
  rooms: number;
  links: number;
  continents: number;
  areas: number;
  /** Rooms that went to the Unassigned area (no area named at all). */
  unassignedRooms: number;
  /** Rooms that name an area the catalog does not list: kept under their continent in a placeholder "Unlisted area". */
  unlistedAreaRooms: number;
  /** Exits whose target room is not in the document (written as unknown-target links). */
  danglingExits: number;
  /** Fields with no home in the neutral file, by name, with how many rooms or exits had one. */
  unmapped: Record<string, number>;
  /** Plain-language lines for the person importing. */
  notes: string[];
}

export interface AdapterResult {
  map: MapFile;
  report: AdapterReport;
}

const UNASSIGNED_CONTINENT = 'c-unassigned';
const UNASSIGNED_AREA = 'a-unassigned';

function sanitize(raw: string): string {
  const s = raw.toLowerCase().replace(/[^a-z0-9._:-]+/g, '-');
  return s.replace(/^[^a-z0-9]+/, '') || 'x';
}

/** An id built from `base` that passes `ID_PATTERN` and is not in `taken` (which it joins). */
function uniqueId(prefix: string, base: string, taken: Set<string>): string {
  const stem = `${prefix}${sanitize(base)}`.slice(0, 56);
  let id = stem;
  for (let n = 2; taken.has(id); n += 1) id = `${stem}-${n}`;
  taken.add(id);
  return id;
}

function bump(counts: Record<string, number>, key: string, by = 1): void {
  counts[key] = (counts[key] ?? 0) + by;
}

/**
 * The grid pitch of a legacy document along one axis: the step its east-west (x) or north-south (y) exits most often make between two
 * rooms of one floor. The neutral file steps one unit per room; a DslMapper document may lay a step out as 4 across and 2 down. A pitch
 * counts only when it is 2 or more and at least 4 in 10 of those exits make it; otherwise the grid is left as it is (1).
 */
function pitchOf(rooms: Record<string, LegacyRoom>, axis: 'x' | 'y'): number {
  const dirs: Direction[] = axis === 'x' ? ['E', 'W'] : ['N', 'S'];
  const counts = new Map<number, number>();
  let samples = 0;
  for (const room of Object.values(rooms)) {
    const from = roomCoords(room, 1, 1);
    for (const dir of dirs) {
      const target = room.exits?.[dir]?.to;
      const other = target ? rooms[target] : undefined;
      if (!other) continue;
      const to = roomCoords(other, 1, 1);
      if (to.z !== from.z) continue;
      const step = Math.abs(axis === 'x' ? to.x - from.x : to.y - from.y);
      if (step === 0) continue;
      counts.set(step, (counts.get(step) ?? 0) + 1);
      samples += 1;
    }
  }
  let best = 1;
  let bestCount = 0;
  for (const [step, n] of counts) if (n > bestCount || (n === bestCount && step < best)) [best, bestCount] = [step, n];
  return best >= 2 && bestCount * 10 >= samples * 4 ? best : 1;
}

/** The wanted cell, or the nearest cell of the same floor that no room of the area holds (searched ring by ring); the cell is then taken. */
function freeCell(occupied: Set<string>, area: string, want: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const key = (x: number, y: number): string => `${area}|${x}|${y}|${want.z}`;
  let found = { ...want };
  search: for (let d = 0; d <= 64; d += 1) {
    for (let dy = -d; dy <= d; dy += 1) {
      for (let dx = -d; dx <= d; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const x = want.x + dx;
        const y = want.y + dy;
        if (Math.abs(x) > LIMITS.maxCoord || Math.abs(y) > LIMITS.maxCoord || occupied.has(key(x, y))) continue;
        found = { x, y, z: want.z };
        break search;
      }
    }
  }
  occupied.add(key(found.x, found.y));
  return found;
}

function roomCoords(room: LegacyRoom, pitchX: number, pitchY: number): { x: number; y: number; z: number } {
  const c = room.coords;
  const x = Number.isFinite(c?.cx) ? (c.cx as number) : Number.isFinite(c?.q) ? (c.q as number) : 0;
  const y = Number.isFinite(c?.cy) ? (c.cy as number) : Number.isFinite(c?.r) ? (c.r as number) : 0;
  const z = Number.isFinite(c?.vz) ? c.vz : Number.isFinite(c?.z) ? (c.z as number) : Number.isFinite(c?.level) ? (c.level as number) : 0;
  const bound = (n: number): number => Math.max(-LIMITS.maxCoord, Math.min(LIMITS.maxCoord, Math.round(n)));
  return { x: bound(x / pitchX), y: bound(y / pitchY), z: bound(z) };
}

export function legacyToMapFile(doc: MapDocV1, options: AdapterOptions): AdapterResult {
  const { date } = options;
  const catalog = doc.meta?.catalog;
  const report: AdapterReport = {
    rooms: 0,
    links: 0,
    continents: 0,
    areas: 0,
    unassignedRooms: 0,
    unlistedAreaRooms: 0,
    danglingExits: 0,
    unmapped: {},
    notes: [],
  };
  const taken = new Set<string>();
  const source = (ref?: string): MapSource => {
    const s: MapSource = { kind: 'manual', date };
    if (ref !== undefined) s.ref = ref.slice(0, LIMITS.shortText);
    if (options.credit !== undefined) s.credit = options.credit;
    return s;
  };

  // containers, from the catalog
  const continents = new Map<string, Continent>();
  const areas = new Map<string, { area: Area; subzone: Subzone }>();
  const continentOf = new Map<string, string>();
  for (const cont of Object.values(catalog?.continents ?? {})) {
    const id = uniqueId('c-', cont.id, taken);
    continentOf.set(cont.id, id);
    continents.set(id, { id, name: (cont.name || cont.id).slice(0, LIMITS.shortText), areas: [] });
    if (cont.worldId) bump(report.unmapped, 'world (the neutral file has no world level)');
  }
  const unassigned: Continent = { id: UNASSIGNED_CONTINENT, name: 'Unassigned', areas: [] };
  taken.add(UNASSIGNED_CONTINENT);
  taken.add(UNASSIGNED_AREA);
  const addArea = (legacyId: string, name: string, continentId: string): { area: Area; subzone: Subzone } => {
    const id = legacyId === UNASSIGNED_AREA ? UNASSIGNED_AREA : uniqueId('a-', legacyId, taken);
    const subzone: Subzone = { id: uniqueId('s-', legacyId, taken), name: 'Main', kind: 'consistent', rooms: [] };
    const area: Area = { id, name: name.slice(0, LIMITS.shortText), placement: null, subzones: [subzone] };
    (continents.get(continentId) ?? unassigned).areas.push(area);
    return { area, subzone };
  };
  for (const a of Object.values(catalog?.areas ?? {})) {
    const cid = a.continentId !== undefined ? continentOf.get(a.continentId) : undefined;
    const entry = addArea(a.id, a.name || a.id, cid ?? UNASSIGNED_CONTINENT);
    areas.set(a.id, entry);
    if (a.primaryVnum) bump(report.unmapped, 'area primary room');
  }

  // rooms
  const legacyRooms = Object.values(doc.rooms ?? {});
  const pitchX = pitchOf(doc.rooms ?? {}, 'x');
  const pitchY = pitchOf(doc.rooms ?? {}, 'y');
  const scaled = pitchX > 1 || pitchY > 1;
  const occupied = new Set<string>();
  let nudged = 0;
  if (scaled)
    report.notes.push(`The grid was laid out ${pitchX} across and ${pitchY} down per step; positions were divided by that so one step is one unit.`);
  const roomIdOf = new Map<string, string>();
  const vnumsTaken = new Set<number>();
  for (const room of legacyRooms) roomIdOf.set(room.vnum, uniqueId('r', room.vnum, taken));
  const roomAreaId = new Map<string, string>();
  const roomOf = new Map<string, Room>();
  let unassignedEntry: { area: Area; subzone: Subzone } | null = null;
  const unlisted = new Map<string, { area: Area; subzone: Subzone }>();
  for (const lr of legacyRooms) {
    const id = roomIdOf.get(lr.vnum) as string;
    const catalogArea = lr.category?.areaId !== undefined ? areas.get(lr.category.areaId) : undefined;
    let entry = catalogArea;
    const unlistedId = lr.category?.areaId;
    if (!entry && unlistedId !== undefined && unlistedId !== '') {
      // the room names an area the catalog does not list: keep it under its continent in a placeholder area of its own
      entry = unlisted.get(unlistedId);
      if (!entry) {
        const cid = lr.category?.continentId !== undefined ? continentOf.get(lr.category.continentId) : undefined;
        entry = addArea(unlistedId, `Unlisted area ${unlistedId.slice(0, 8)}`, cid ?? UNASSIGNED_CONTINENT);
        unlisted.set(unlistedId, entry);
      }
      report.unlistedAreaRooms += 1;
    }
    if (!entry) {
      if (!unassignedEntry) unassignedEntry = addArea(UNASSIGNED_AREA, 'Unassigned rooms', UNASSIGNED_CONTINENT);
      entry = unassignedEntry;
      report.unassignedRooms += 1;
    }
    let coords = roomCoords(lr, pitchX, pitchY);
    if (scaled) {
      // dividing the grid can land two rooms of one area on one cell (an exit that steps 3 where the pitch is 4): move the later one to the nearest free cell
      const free = freeCell(occupied, entry.area.id, coords);
      if (free.x !== coords.x || free.y !== coords.y) nudged += 1;
      coords = free;
    }
    const room: Room = {
      id,
      title: (lr.label || lr.vnum).slice(0, LIMITS.shortText),
      exits: {},
      coords,
      sources: [source(lr.vnum)],
    };
    if (lr.sector !== undefined) room.sector = String(lr.sector);
    if (/^\d{1,10}$/.test(lr.vnum)) {
      const n = Number(lr.vnum);
      if (n <= LIMITS.maxVnum && !vnumsTaken.has(n)) {
        room.vnum = n;
        vnumsTaken.add(n);
      }
    }
    entry.subzone.rooms.push(room);
    roomAreaId.set(lr.vnum, entry.area.id);
    roomOf.set(lr.vnum, room);
    report.rooms += 1;
    if (lr.flags && Object.keys(lr.flags).length > 0) bump(report.unmapped, 'room flags');
    if (lr.objects && lr.objects.length > 0) bump(report.unmapped, 'room objects');
    if (lr.interactions && lr.interactions.length > 0) bump(report.unmapped, 'room interactions');
    if (lr.movement && (lr.movement.requires?.length || lr.movement.bans?.length)) bump(report.unmapped, 'room movement rules');
  }

  // links
  const links: Link[] = [];
  let linkNo = 0;
  for (const lr of legacyRooms) {
    const from = roomOf.get(lr.vnum) as Room;
    for (const [dir, ex] of Object.entries(lr.exits ?? {}) as [Direction, NonNullable<LegacyRoom['exits'][Direction]>][]) {
      if (!ex) continue;
      const target = ex.to !== null && ex.to !== undefined ? roomOf.get(ex.to) : undefined;
      if (ex.to && !target) {
        report.danglingExits += 1;
        bump(report.unmapped, 'exit target that is not in the document (kept as an unknown exit)');
      }
      if (ex.door) bump(report.unmapped, 'exit door or lock');
      if (ex.oneWay) bump(report.unmapped, 'one-way exit flag');
      if (ex.status === 'anomalous') bump(report.unmapped, 'anomalous exit status (written as a candidate)');
      linkNo += 1;
      let link: Link;
      if (!target) {
        link = { id: uniqueId('l', String(linkNo), taken), from: from.id, dir, to: null, state: 'unknown-target', confidence: 0, offPage: false, traversals: 0, reverse: false };
      } else {
        const confirmed = ex.status === 'confirmed';
        link = {
          id: uniqueId('l', String(linkNo), taken),
          from: from.id,
          dir,
          to: target.id,
          state: confirmed ? 'confirmed' : 'candidate',
          confidence: confirmed ? 0.95 : 0.6,
          offPage: roomAreaId.get(lr.vnum) !== roomAreaId.get(ex.to as string),
          traversals: 0,
          reverse: confirmed,
        };
      }
      link.sources = [source()];
      links.push(link);
      from.exits[dir] = link.id;
      report.links += 1;
    }
  }

  // assemble: catalog order, only continents that hold something, then Unassigned
  const out: Continent[] = [...continents.values()].filter((c) => c.areas.length > 0);
  if (unassigned.areas.length > 0) out.push(unassigned);
  report.continents = out.length;
  report.areas = out.reduce((n, c) => n + c.areas.length, 0);
  if (doc.meta?.grid) bump(report.unmapped, 'grid settings (the neutral file lays out by its own rules)');
  if (report.unassignedRooms > 0)
    report.notes.push(`${report.unassignedRooms} room(s) had no known area and went to "Unassigned rooms".`);
  if (nudged > 0) report.notes.push(`${nudged} room(s) were moved to the nearest free cell because the smaller grid put them on the same cell as another room.`);
  if (report.unlistedAreaRooms > 0)
    report.notes.push(`${report.unlistedAreaRooms} room(s) named an area that the catalog does not list and went to a placeholder "Unlisted area".`);
  if (report.danglingExits > 0)
    report.notes.push(`${report.danglingExits} exit(s) led to a room that is not in the document and are shown as unknown exits.`);
  for (const [field, count] of Object.entries(report.unmapped))
    report.notes.push(`Not carried over: ${field} (${count}).`);

  const map = emptyMap(date);
  map.continents = out;
  map.links = links;
  // every id this adapter writes must pass the neutral file's rule; a violation is a bug here, not in the input
  for (const id of taken) if (!ID_PATTERN.test(id)) throw new Error(`adapter wrote an invalid id: ${id}`);
  return { map, report };
}
