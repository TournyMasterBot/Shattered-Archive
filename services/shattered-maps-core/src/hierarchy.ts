/**
 * Walking the hierarchy: an index over a map, alias resolution, and slices (what a viewer or an exporter shows).
 *
 * A slice is a view, not a copy of the file: it holds the rooms of one level, the links among them, and the links that
 * leave it (marked `offPage`, relative to the slice). Rooms that have no coordinates are listed in `unplaced`; nothing
 * here invents a position except the room-level slice, which lays the focus room's neighbours out by the direction of
 * the exit that reaches them (and says so with `derivedCoords`).
 */

import { DIRECTIONS, type Area, type Coords, type Direction, type Link, type MapFile, type Room, type SubzoneKind } from './schema.js';

export interface RoomLocation {
  room: Room;
  subzoneId: string;
  areaId: string;
  continentId: string;
}

export interface MapIndex {
  rooms: Map<string, RoomLocation>;
  areas: Map<string, { area: Area; continentId: string }>;
  links: Map<string, Link>;
  /** Links by the room they start at. */
  linksFrom: Map<string, Link[]>;
  /** Links by the room they reach (links with no target are not in it). */
  linksTo: Map<string, Link[]>;
  /** The kind of every subzone, by id. */
  subzoneKinds: Map<string, SubzoneKind>;
}

export function buildIndex(map: MapFile): MapIndex {
  const index: MapIndex = { rooms: new Map(), areas: new Map(), links: new Map(), linksFrom: new Map(), linksTo: new Map(), subzoneKinds: new Map() };
  for (const continent of map.continents) {
    for (const area of continent.areas) {
      index.areas.set(area.id, { area, continentId: continent.id });
      for (const subzone of area.subzones) {
        index.subzoneKinds.set(subzone.id, subzone.kind);
        for (const room of subzone.rooms) {
          index.rooms.set(room.id, { room, subzoneId: subzone.id, areaId: area.id, continentId: continent.id });
        }
      }
    }
  }
  for (const link of map.links) {
    index.links.set(link.id, link);
    const list = index.linksFrom.get(link.from);
    if (list) list.push(link);
    else index.linksFrom.set(link.from, [link]);
    if (link.to !== null) {
      const into = index.linksTo.get(link.to);
      if (into) into.push(link);
      else index.linksTo.set(link.to, [link]);
    }
  }
  return index;
}

/**
 * The map with one room replaced by `change(room)`. Only the containers on the way to that room are copied (the other rooms and
 * every link are shared with the original), and the original is not modified. The same map comes back when the id is not in it.
 */
export function updateRoom(map: MapFile, roomId: string, change: (room: Room) => Room): MapFile {
  let touched = false;
  const continents = map.continents.map((continent) => ({
    ...continent,
    areas: continent.areas.map((area) => ({
      ...area,
      subzones: area.subzones.map((subzone) => {
        const at = subzone.rooms.findIndex((room) => room.id === roomId);
        if (at < 0) return subzone;
        touched = true;
        const rooms = [...subzone.rooms];
        rooms[at] = change(subzone.rooms[at]);
        return { ...subzone, rooms };
      }),
    })),
  }));
  return touched ? { ...map, continents } : map;
}

const MAX_ALIAS_HOPS = 16;

/** The live room an id stands for: follows `aliasOf` through merges. `null` when the id is unknown or the chain loops. */
export function resolveAlias(index: MapIndex, id: string): string | null {
  let current = id;
  for (let hops = 0; hops <= MAX_ALIAS_HOPS; hops += 1) {
    const found = index.rooms.get(current);
    if (!found) return null;
    if (found.room.aliasOf === undefined) return current;
    current = found.room.aliasOf;
  }
  return null;
}

/** Where a direction moves a room on a grid (y grows southward, z upward). */
export const DIRECTION_OFFSET: Readonly<Record<Direction, { dx: number; dy: number; dz: number }>> = {
  N: { dx: 0, dy: -1, dz: 0 },
  NE: { dx: 1, dy: -1, dz: 0 },
  E: { dx: 1, dy: 0, dz: 0 },
  SE: { dx: 1, dy: 1, dz: 0 },
  S: { dx: 0, dy: 1, dz: 0 },
  SW: { dx: -1, dy: 1, dz: 0 },
  W: { dx: -1, dy: 0, dz: 0 },
  NW: { dx: -1, dy: -1, dz: 0 },
  U: { dx: 0, dy: 0, dz: 1 },
  D: { dx: 0, dy: 0, dz: -1 },
};

export type SliceLevel = 'continent' | 'area' | 'subzone' | 'room';

export interface AreaBox {
  id: string;
  name: string;
  placement: { x: number; y: number; w?: number; h?: number } | null;
  rooms: number;
}

/** Exits between two areas: how many exits out of `from` into `to` point `dir` (one entry per area pair and direction). */
export interface AreaLink {
  from: string;
  to: string;
  dir: Direction;
  count: number;
}

/** Every followed exit that leaves one area for another, counted per area pair and direction, in a stable order. */
export function areaLinksOf(map: MapFile): AreaLink[] {
  const areaOf = new Map<string, string>();
  for (const continent of map.continents) for (const area of continent.areas) for (const sub of area.subzones) for (const room of sub.rooms) areaOf.set(room.id, area.id);
  const counts = new Map<string, AreaLink>();
  for (const link of map.links) {
    if (link.to === null) continue;
    const from = areaOf.get(link.from);
    const to = areaOf.get(link.to);
    if (from === undefined || to === undefined || from === to) continue;
    const key = `${from}\u0000${to}\u0000${link.dir}`;
    const found = counts.get(key);
    if (found) found.count += 1;
    else counts.set(key, { from, to, dir: link.dir, count: 1 });
  }
  return [...counts.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.dir.localeCompare(b.dir));
}

export interface SliceRoom extends Room {
  /** The room belongs to a different subzone or area than the slice's focus (a neighbour shown for context). */
  context?: boolean;
  /** The kind of subzone the room is in, when it is not an ordinary one ('maze', 'teleport' or 'loop'): the renderer draws such rooms apart. */
  kind?: Exclude<SubzoneKind, 'consistent'>;
  /** A link from a room outside the slice reaches this room: the way into the area (or the maze) from outside. Set only when true. */
  entrance?: true;
}

export interface MapSlice {
  level: SliceLevel;
  id: string;
  title: string;
  /** Continent level: the areas, with their explicit placements. The other levels: empty. */
  areas: AreaBox[];
  rooms: SliceRoom[];
  /** Links with both ends in `rooms` have `offPage: false`; a link that leaves the slice has `offPage: true`. */
  links: Link[];
  /** Ids of rooms with no coordinates (they are in `rooms` but cannot be drawn on a grid). */
  unplaced: string[];
  /** Room level only: the neighbours' coordinates were derived from the exits, not read from the file. */
  derivedCoords: boolean;
  /** Continent level: the exits between its areas, drawn as lines between the boxes. Absent when the caller has none. */
  areaLinks?: AreaLink[];
}

function offPageRelativeTo(links: readonly Link[], inSlice: ReadonlySet<string>): Link[] {
  return links.map((link) => ({ ...link, offPage: link.to === null ? link.offPage : !inSlice.has(link.to) }));
}

function build(
  level: SliceLevel,
  id: string,
  title: string,
  rooms: SliceRoom[],
  index: MapIndex,
  derivedCoords = false,
): MapSlice {
  const inside = new Set(rooms.map((r) => r.id));
  rooms = rooms.map((room) => {
    // every room of a slice is in the map, so the index knows its subzone
    const kind = index.subzoneKinds.get((index.rooms.get(room.id) as { subzoneId: string }).subzoneId);
    const entrance = (index.linksTo.get(room.id) ?? []).some((link) => !inside.has(link.from));
    return { ...room, ...(kind !== undefined && kind !== 'consistent' ? { kind } : {}), ...(entrance && level !== 'room' ? { entrance: true as const } : {}) };
  });
  const ids = inside;
  const links: Link[] = [];
  for (const room of rooms) {
    for (const link of index.linksFrom.get(room.id) ?? []) {
      // A room-level view is about its focus: a neighbour shown for context brings only the links back into the view.
      if (level === 'room' && room.id !== id && (link.to === null || !ids.has(link.to))) continue;
      links.push(link);
    }
  }
  return {
    level,
    id,
    title,
    areas: [],
    rooms,
    links: offPageRelativeTo(links, ids),
    unplaced: rooms.filter((r) => r.coords === undefined).map((r) => r.id),
    derivedCoords,
  };
}

function liveRooms(rooms: readonly Room[]): Room[] {
  return rooms.filter((r) => r.aliasOf === undefined);
}

/**
 * The slice at a level: a continent (its areas as boxes), an area (all its live rooms), a subzone, or a room (the room
 * and the rooms its exits reach). `null` when the id is not in the map.
 */
export function sliceMap(map: MapFile, level: SliceLevel, id: string): MapSlice | null {
  const index = buildIndex(map);
  if (level === 'continent') {
    const continent = map.continents.find((c) => c.id === id);
    if (!continent) return null;
    const areas: AreaBox[] = continent.areas.map((a) => ({
      id: a.id,
      name: a.name,
      placement: a.placement,
      rooms: a.subzones.reduce((n, s) => n + liveRooms(s.rooms).length, 0),
    }));
    const inside = new Set(areas.map((a) => a.id));
    const areaLinks = areaLinksOf(map).filter((l) => inside.has(l.from) && inside.has(l.to));
    return { level, id, title: continent.name, areas, rooms: [], links: [], unplaced: [], derivedCoords: false, areaLinks };
  }
  if (level === 'area') {
    const entry = index.areas.get(id);
    if (!entry) return null;
    return build(
      level,
      id,
      entry.area.name,
      entry.area.subzones.flatMap((s) => liveRooms(s.rooms)),
      index,
    );
  }
  if (level === 'subzone') {
    for (const continent of map.continents) {
      for (const area of continent.areas) {
        const subzone = area.subzones.find((s) => s.id === id);
        if (subzone) return build(level, id, `${area.name}: ${subzone.name}`, liveRooms(subzone.rooms), index);
      }
    }
    return null;
  }
  const focus = index.rooms.get(id);
  if (!focus || focus.room.aliasOf !== undefined) return null;
  const rooms: SliceRoom[] = [{ ...focus.room }];
  const placed = new Map<string, Coords>();
  const origin: Coords = focus.room.coords ?? { x: 0, y: 0, z: 0 };
  placed.set(id, origin);
  let derived = focus.room.coords === undefined;
  for (const dir of DIRECTIONS) {
    const link = index.links.get(focus.room.exits[dir] ?? '');
    if (!link || link.to === null) continue;
    const target = index.rooms.get(link.to);
    if (!target || target.room.aliasOf !== undefined || placed.has(target.room.id)) continue;
    const off = DIRECTION_OFFSET[dir];
    const coords: Coords = { x: origin.x + off.dx, y: origin.y + off.dy, z: (origin.z ?? 0) + off.dz };
    placed.set(target.room.id, coords);
    derived = true;
    rooms.push({
      ...target.room,
      coords,
      context: target.subzoneId !== focus.subzoneId || target.areaId !== focus.areaId,
    });
  }
  rooms[0] = { ...rooms[0], coords: origin };
  return build(level, id, focus.room.title, rooms, index, derived);
}
