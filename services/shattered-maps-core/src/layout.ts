import { cloneJson, type Coords, type Direction, type MapFile, type Room } from './schema.js';

/**
 * Gives rooms that have no position a place on a grid by following their exits, for a map built from walks (a walk records where an exit
 * leads, never where a room is). The grid is the renderer's: `N` is one row up (y - 1), `E` one column right (x + 1), the diagonals move
 * both, and `U` / `D` change the floor (z) without moving. A room that has a position already is never moved. Rooms that no exit connects to
 * a placed one form groups; each group is laid out on a grid of its own and then shifted to the right of everything placed before it.
 *
 * A place is taken once: when an exit leads to a cell that is occupied on that floor, the room goes to the nearest free cell (the picture is
 * then a little off, and the link still says where the exit goes). Pure and deterministic: the same map gives the same coordinates.
 */

const STEP: Readonly<Record<Direction, { dx: number; dy: number; dz: number }>> = {
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
const DIRS = Object.keys(STEP) as Direction[];

/** Columns left empty between one group of rooms and the next. */
const GROUP_GAP = 2;

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

export interface LayoutResult {
  map: MapFile;
  /** Rooms given a position. */
  placed: number;
  /** Groups of rooms that no exit connects to a placed room (each laid out apart, to the right of the rest). */
  groups: number;
}

export function layoutUnplaced(map: MapFile): LayoutResult {
  const out = cloneJson(map);
  const rooms: Room[] = [];
  for (const continent of out.continents)
    for (const area of continent.areas) for (const subzone of area.subzones) for (const room of subzone.rooms) if (room.aliasOf === undefined) rooms.push(room);
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const links = new Map(out.links.map((l) => [l.id, l]));

  /** Every exit as (room, dir, target room): the walk follows it forwards, and backwards from a placed target. */
  const outgoing = new Map<string, { dir: Direction; to: Room }[]>();
  const incoming = new Map<string, { dir: Direction; from: Room }[]>();
  for (const room of rooms)
    for (const dir of DIRS) {
      const linkId = room.exits[dir];
      const to = linkId === undefined ? undefined : links.get(linkId)?.to;
      const target = to === undefined || to === null ? undefined : byId.get(to);
      if (target === undefined) continue;
      (outgoing.get(room.id) ?? outgoing.set(room.id, []).get(room.id)!).push({ dir, to: target });
      (incoming.get(target.id) ?? incoming.set(target.id, []).get(target.id)!).push({ dir, from: room });
    }

  /** Cells taken on the grid being laid out; replaced for each group. */
  let occupied = new Set<string>();
  let maxX = -GROUP_GAP - 1;
  for (const r of rooms)
    if (r.coords !== undefined) {
      occupied.add(key(r.coords.x, r.coords.y, r.coords.z ?? 0));
      maxX = Math.max(maxX, r.coords.x);
    }

  let placed = 0;
  let current: Room[] = [];
  const put = (room: Room, x: number, y: number, z: number): void => {
    let at = { x, y };
    if (occupied.has(key(x, y, z))) {
      search: for (let r = 1; ; r += 1)
        for (let dy = -r; dy <= r; dy += 1)
          for (let dx = -r; dx <= r; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || occupied.has(key(x + dx, y + dy, z))) continue;
            at = { x: x + dx, y: y + dy };
            break search;
          }
    }
    const coords: Coords = { x: at.x, y: at.y, z };
    room.coords = coords;
    occupied.add(key(at.x, at.y, z));
    current.push(room);
    placed += 1;
  };

  /** Places everything reachable from the rooms already in `queue`, forwards along exits and backwards into placed rooms. */
  const grow = (queue: Room[]): void => {
    for (let i = 0; i < queue.length; i += 1) {
      const here = queue[i].coords as Coords;
      for (const { dir, to } of outgoing.get(queue[i].id) ?? []) {
        if (to.coords !== undefined) continue;
        const s = STEP[dir];
        put(to, here.x + s.dx, here.y + s.dy, (here.z ?? 0) + s.dz);
        queue.push(to);
      }
      for (const { dir, from } of incoming.get(queue[i].id) ?? []) {
        if (from.coords !== undefined) continue;
        const s = STEP[dir];
        put(from, here.x - s.dx, here.y - s.dy, (here.z ?? 0) - s.dz);
        queue.push(from);
      }
    }
  };

  // 1. what hangs off rooms that already have a position
  grow(rooms.filter((r) => r.coords !== undefined));
  for (const r of rooms) if (r.coords !== undefined) maxX = Math.max(maxX, r.coords.x);
  // 2. groups no placed room reaches: each on its own grid, then shifted to the right of everything so far
  let groups = 0;
  for (const room of rooms) {
    if (room.coords !== undefined) continue;
    groups += 1;
    occupied = new Set();
    current = [];
    put(room, 0, 0, 0);
    grow([room]);
    const minX = Math.min(...current.map((r) => (r.coords as Coords).x));
    const shift = maxX + GROUP_GAP + 1 - minX;
    for (const r of current) {
      (r.coords as Coords).x += shift;
      maxX = Math.max(maxX, (r.coords as Coords).x);
    }
  }
  return { map: out, placed, groups };
}
