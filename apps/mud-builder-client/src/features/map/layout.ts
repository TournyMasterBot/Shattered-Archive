import type { AreaMapRoom } from '../../api/client.js';

/**
 * AI-ANNOTATION
 * @ai-summary Pure BFS grid layout for an area map (Phase 12, 10-dir since
 *   12b): assigns each room integer grid coordinates by walking exits' compass
 *   directions (N/E/S/W unit steps, NE/NW/SE/SW corner steps, U/D ring-placed
 *   near the source), probing further along the same direction on collision;
 *   external exits become portal stub nodes in an adjacent free cell.
 * @ai-public layoutArea, AreaLayout, PlacedRoom, PlacedPortal, LayoutEdge, DOOR_NAMES
 * @ai-notes No graph dependency by design (repo constraint). Deterministic:
 *   BFS starts at the lowest-vnum room of each connected component; components
 *   are stacked below one another. Dangling exits (target defined nowhere) get
 *   no node and no edge — the room list is the place to chase those.
 */

export const DOOR_NAMES = [
  'north',
  'east',
  'south',
  'west',
  'up',
  'down',
  'northeast',
  'northwest',
  'southeast',
  'southwest',
] as const;

/**
 * Grid delta per door 0-9. Diagonals own the corner cells (Phase 12b), so U/D
 * no longer get a compass delta — a [0,0] sentinel routes their targets to the
 * nearest free ring cell instead (the edge itself reads as vertical travel).
 */
const DOOR_DELTAS: [number, number][] = [
  [0, -1], // north
  [1, 0], // east
  [0, 1], // south
  [-1, 0], // west
  [0, 0], // up — ring-placed
  [0, 0], // down — ring-placed
  [1, -1], // northeast
  [-1, -1], // northwest
  [1, 1], // southeast
  [-1, 1], // southwest
];

export interface PlacedRoom {
  vnum: number;
  name: string;
  sectorType: number;
  x: number;
  y: number;
}

export interface PlacedPortal {
  /** Stable id: `${fromVnum}:${door}` — one stub per external exit. */
  id: string;
  x: number;
  y: number;
  fromVnum: number;
  door: number;
  toVnum: number;
  /** Defining neighbor area + room name (from the server's resolved exit). */
  file: string;
  name: string;
}

/** Reverse door per act_move.c rev_dir (12b: diagonals reverse pairwise). */
export const REV_DIR: readonly number[] = [2, 3, 0, 1, 5, 4, 9, 8, 7, 6];

/**
 * How an internal exit relates to its target's exits (Phase 12b fidelity):
 * - two-way: the target's reverse-door exit points straight back
 * - one-way: the target has no reverse-door exit at all
 * - non-returning: the reverse-door exit exists but leads somewhere ELSE
 * - loop: the exit re-enters its own room
 * External edges carry no classification (the neighbor's exits are not in
 * this payload); warp edges are always directed.
 */
export type ExitClassification = 'two-way' | 'one-way' | 'non-returning' | 'loop';

export interface LayoutEdge {
  fromVnum: number;
  /** Door 0-9, or -1 for script warp edges. */
  door: number;
  /** Grid endpoints (room → room, or room → portal stub). */
  from: [number, number];
  to: [number, number];
  kind: 'internal' | 'external' | 'warp';
  classification?: ExitClassification;
  /** Lock state of the exit (0 = open passage); absent on warp edges. */
  locks?: number;
}

export interface AreaLayout {
  rooms: PlacedRoom[];
  portals: PlacedPortal[];
  edges: LayoutEdge[];
  /** Grid extent after normalization to a (0,0) origin. */
  width: number;
  height: number;
}

/** First free cell probing outward along a direction, then ringing around the anchor. */
function findFreeCell(occupied: Set<string>, fromX: number, fromY: number, dx: number, dy: number): [number, number] {
  if (dx !== 0 || dy !== 0) {
    for (let step = 1; step <= 8; step++) {
      const x = fromX + dx * step;
      const y = fromY + dy * step;
      if (!occupied.has(`${x},${y}`)) return [x, y];
    }
  }
  // Contradictory geometry: ring-search around the anchor for the nearest gap.
  for (let radius = 1; ; radius++) {
    for (let x = fromX - radius; x <= fromX + radius; x++) {
      for (let y = fromY - radius; y <= fromY + radius; y++) {
        if (Math.max(Math.abs(x - fromX), Math.abs(y - fromY)) !== radius) continue;
        if (!occupied.has(`${x},${y}`)) return [x, y];
      }
    }
  }
}

export function layoutArea(rooms: AreaMapRoom[]): AreaLayout {
  const byVnum = new Map(rooms.map((r) => [r.vnum, r]));
  const pos = new Map<number, [number, number]>();
  const occupied = new Set<string>();

  const place = (vnum: number, x: number, y: number): void => {
    pos.set(vnum, [x, y]);
    occupied.add(`${x},${y}`);
  };

  // BFS each connected component from its lowest-vnum member; stack components
  // vertically so separate clusters never interleave.
  let componentBaseY = 0;
  const sorted = [...rooms].sort((a, b) => a.vnum - b.vnum);
  for (const seed of sorted) {
    if (pos.has(seed.vnum)) continue;
    let seedY = componentBaseY;
    while (occupied.has(`0,${seedY}`)) seedY++;
    place(seed.vnum, 0, seedY);
    const queue = [seed.vnum];
    let maxY = seedY;
    while (queue.length > 0) {
      const vnum = queue.shift()!;
      const room = byVnum.get(vnum)!;
      const [x, y] = pos.get(vnum)!;
      for (const exit of room.exits) {
        const target = byVnum.get(exit.toVnum);
        if (!target || pos.has(exit.toVnum)) continue;
        const [dx, dy] = DOOR_DELTAS[exit.door] ?? [1, 0];
        const [tx, ty] = occupied.has(`${x + dx},${y + dy}`)
          ? findFreeCell(occupied, x, y, dx, dy)
          : [x + dx, y + dy];
        place(exit.toVnum, tx, ty);
        maxY = Math.max(maxY, ty);
        queue.push(exit.toVnum);
      }
    }
    componentBaseY = maxY + 2;
  }

  // Portal stubs for external exits, placed after all rooms so they never steal
  // a cell a room wants.
  const portals: PlacedPortal[] = [];
  const edges: LayoutEdge[] = [];

  const classify = (room: AreaMapRoom, exit: AreaMapRoom['exits'][number]): ExitClassification => {
    if (exit.toVnum === room.vnum) return 'loop';
    const target = byVnum.get(exit.toVnum);
    if (!target) return 'one-way'; // unreachable for internal edges
    const reverse = target.exits.find((e) => e.door === REV_DIR[exit.door]);
    if (!reverse) return 'one-way';
    return reverse.toVnum === room.vnum ? 'two-way' : 'non-returning';
  };

  const placePortal = (
    fromVnum: number,
    fromCell: [number, number],
    door: number,
    toVnum: number,
    external: { file: string; name: string },
  ): PlacedPortal => {
    const [dx, dy] = DOOR_DELTAS[door] ?? [1, 0];
    const cell = occupied.has(`${fromCell[0] + dx},${fromCell[1] + dy}`)
      ? findFreeCell(occupied, fromCell[0], fromCell[1], dx, dy)
      : ([fromCell[0] + dx, fromCell[1] + dy] as [number, number]);
    occupied.add(`${cell[0]},${cell[1]}`);
    const portal: PlacedPortal = {
      id: door >= 0 ? `${fromVnum}:${door}` : `${fromVnum}:w:${toVnum}`,
      x: cell[0],
      y: cell[1],
      fromVnum,
      door,
      toVnum,
      file: external.file,
      name: external.name,
    };
    portals.push(portal);
    return portal;
  };

  for (const room of sorted) {
    const [x, y] = pos.get(room.vnum)!;
    for (const exit of room.exits) {
      if (byVnum.has(exit.toVnum)) {
        const to = pos.get(exit.toVnum);
        if (to)
          edges.push({
            fromVnum: room.vnum,
            door: exit.door,
            from: [x, y],
            to,
            kind: 'internal',
            classification: classify(room, exit),
            locks: exit.locks,
          });
        continue;
      }
      if (!exit.external) continue; // dangling — nothing to draw
      const portal = placePortal(room.vnum, [x, y], exit.door, exit.toVnum, exit.external);
      edges.push({
        fromVnum: room.vnum,
        door: exit.door,
        from: [x, y],
        to: [portal.x, portal.y],
        kind: 'external',
        locks: exit.locks,
      });
    }
    // Script warps (Phase 12b): always-directed teleport edges.
    for (const warp of room.warps ?? []) {
      if (byVnum.has(warp.toVnum)) {
        const to = pos.get(warp.toVnum);
        if (to) edges.push({ fromVnum: room.vnum, door: -1, from: [x, y], to, kind: 'warp' });
        continue;
      }
      if (!warp.external) continue; // dangling warp — validation owns it
      const portal = placePortal(room.vnum, [x, y], -1, warp.toVnum, warp.external);
      edges.push({ fromVnum: room.vnum, door: -1, from: [x, y], to: [portal.x, portal.y], kind: 'warp' });
    }
  }

  // Normalize to a (0,0) origin.
  const xs = [...pos.values()].map(([x]) => x).concat(portals.map((p) => p.x));
  const ys = [...pos.values()].map(([, y]) => y).concat(portals.map((p) => p.y));
  const minX = xs.length > 0 ? Math.min(...xs) : 0;
  const minY = ys.length > 0 ? Math.min(...ys) : 0;

  const placedRooms: PlacedRoom[] = sorted.map((room) => {
    const [x, y] = pos.get(room.vnum)!;
    return { vnum: room.vnum, name: room.name, sectorType: room.sectorType, x: x - minX, y: y - minY };
  });
  for (const p of portals) {
    p.x -= minX;
    p.y -= minY;
  }
  for (const e of edges) {
    e.from = [e.from[0] - minX, e.from[1] - minY];
    e.to = [e.to[0] - minX, e.to[1] - minY];
  }

  const width = xs.length > 0 ? Math.max(...xs) - minX + 1 : 0;
  const height = ys.length > 0 ? Math.max(...ys) - minY + 1 : 0;
  return { rooms: placedRooms, portals, edges, width, height };
}
