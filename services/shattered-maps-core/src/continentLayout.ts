/**
 * Continent layout: where the area boxes of one continent sit, without overlap.
 *
 * The placements an area carries come from the source map (each area's own extent, written by the author), and on some continents they overlap
 * heavily, so the continent picture is a pile. This lays the boxes out again:
 *
 *  1. Every area is a box. Its size is the extent it has in the source (`sizeBy: 'extent'`, the default) or a size that grows with its room count
 *     (`sizeBy: 'rooms'`, aspect kept), so a viewer can compare how big places are.
 *  2. The `center` area keeps its place. Each relation then puts one area in a compass direction from another that is already placed ("the port is
 *     west of the city"), as near as the boxes (and `gap`) allow, or at the nearest free place when that one is taken.
 *  3. Every other area moves with its nearest pinned neighbour (the way that neighbour moved from the source), so a district stays near its city,
 *     and is then put on the nearest free place. Larger areas are placed first.
 *
 * Pure and deterministic: the same boxes and spec give the same placements. Coordinates are whole cells, x to the east and y to the south
 * (north is up). Nothing here knows an area by name: the spec names ids, and it lives with the owner's data, not in this code.
 */

export interface LayoutBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rooms in the area: used for the `rooms` size mode and to order placement. */
  rooms: number;
}

export type Compass = 'N' | 'NNE' | 'NE' | 'ENE' | 'E' | 'ESE' | 'SE' | 'SSE' | 'S' | 'SSW' | 'SW' | 'WSW' | 'W' | 'WNW' | 'NW' | 'NNW';

export interface LayoutRelation {
  /** The area to place. */
  area: string;
  /** The placed area it is placed from. */
  of: string;
  dir: Compass;
}

export interface LayoutSpec {
  /** The area that keeps its source place. */
  center: string;
  relations: LayoutRelation[];
  /** Empty cells kept between boxes. Default 1. */
  gap?: number;
  sizeBy?: 'extent' | 'rooms';
  /** Room-count mode: the box's area in cells per room (default 1.6). A smaller number makes every box smaller and keeps the sizes in proportion. */
  cellsPerRoom?: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ContinentLayoutResult {
  placements: Map<string, Rect>;
  overlapsBefore: number;
  overlapsAfter: number;
  /** Areas that are not where the source had them (centre or not). */
  moved: number;
  warnings: string[];
}

const COMPASS_DEGREES: Readonly<Record<Compass, number>> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

/** Room-count mode: the box's area in cells per room. */
const CELLS_PER_ROOM = 1.6;
const MIN_SIDE = 2;
/** The nearest-free search stops after this many rings (a layout that needs more is a bug in the spec). */
const MAX_RING = 600;

const centerOf = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** True when the boxes overlap or come closer than `gap` cells. */
function clashes(a: Rect, b: Rect, gap: number): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

/** Pairs of boxes that overlap at all (no gap): how bad a set of placements is. */
export function countOverlaps(rects: Iterable<Rect>): number {
  const list = [...rects];
  let count = 0;
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) if (clashes(list[i] as Rect, list[j] as Rect, 0)) count += 1;
  return count;
}

function sized(box: LayoutBox, sizeBy: 'extent' | 'rooms', cellsPerRoom = CELLS_PER_ROOM): Rect {
  const w0 = Math.max(1, Math.round(box.w));
  const h0 = Math.max(1, Math.round(box.h));
  if (sizeBy === 'extent') return { x: Math.round(box.x), y: Math.round(box.y), w: w0, h: h0 };
  const area = Math.max(1, box.rooms) * cellsPerRoom;
  const aspect = w0 / h0;
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.max(MIN_SIDE, Math.round(Math.sqrt(area * aspect))),
    h: Math.max(MIN_SIDE, Math.round(Math.sqrt(area / aspect))),
  };
}

/** The first free place for a box of this size, searched in rings around the wanted centre, the nearest of each ring first. */
function nearestFree(want: { x: number; y: number }, size: Rect, placed: Iterable<Rect>, gap: number): Rect {
  const others = [...placed];
  const at = (cx: number, cy: number): Rect => ({ x: Math.round(cx - size.w / 2), y: Math.round(cy - size.h / 2), w: size.w, h: size.h });
  const free = (r: Rect): boolean => !others.some((o) => clashes(r, o, gap));
  const first = at(want.x, want.y);
  if (free(first)) return first;
  for (let ring = 1; ring <= MAX_RING; ring += 1) {
    let best: Rect | null = null;
    let bestDistance = Infinity;
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (const dy of Math.abs(dx) === ring ? range(-ring, ring) : [-ring, ring]) {
        const r = at(want.x + dx, want.y + dy);
        if (!free(r)) continue;
        const c = centerOf(r);
        const d = (c.x - want.x) ** 2 + (c.y - want.y) ** 2;
        if (d < bestDistance) {
          best = r;
          bestDistance = d;
        }
      }
    }
    if (best) return best;
  }
  /* istanbul ignore next -- a ring search over free space always finds a place; this only guards a spec that asks for the impossible */
  throw new Error('no free place for an area within the search limit');
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i += 1) out.push(i);
  return out;
}

/** The centre a box of `size` has when it touches `ref` (with the gap) along the bearing `degrees`, `extra` cells further out. */
function along(ref: Rect, size: Rect, degrees: number, gap: number, extra: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  const ux = Math.sin(radians);
  const uy = -Math.cos(radians); // north is up: y grows to the south
  const c = centerOf(ref);
  const needX = (ref.w + size.w) / 2 + gap;
  const needY = (ref.h + size.h) / 2 + gap;
  const tx = Math.abs(ux) > 1e-9 ? needX / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-9 ? needY / Math.abs(uy) : Infinity;
  const t = Math.min(tx, ty) + extra;
  return { x: c.x + ux * t, y: c.y + uy * t };
}

/** How many degrees off the requested bearing a place may be, and how far out along a bearing, before the search gives up on the direction. */
const MAX_DEVIATION = 60;
const MAX_EXTRA = 50;
const DEVIATION_STEP = 7.5;
/** A cell further out costs 1; a degree off the bearing costs this much. */
const DEGREE_COST = 0.6;

/**
 * The free place for a box in direction `dir` from `ref`: the cheapest of the places along the bearing and slightly to either side of it, where
 * going further out and turning away from the bearing both cost. Keeps "south-south-east of the tree" meaning south-south-east when the nearest
 * spot is taken, instead of the nearest free spot in any direction. Falls back to the nearest free place when nothing along those bearings is free.
 */
function placeToward(ref: Rect, size: Rect, dir: Compass, placed: Iterable<Rect>, gap: number): Rect {
  const others = [...placed];
  const base = COMPASS_DEGREES[dir];
  let best: Rect | null = null;
  let bestCost = Infinity;
  for (let deviation = 0; deviation <= MAX_DEVIATION; deviation += DEVIATION_STEP) {
    for (const sign of deviation === 0 ? [1] : [1, -1]) {
      for (let extra = 0; extra <= MAX_EXTRA; extra += 1) {
        const cost = extra + deviation * DEGREE_COST;
        if (cost >= bestCost) break;
        const c = along(ref, size, base + sign * deviation, gap, extra);
        const r: Rect = { x: Math.round(c.x - size.w / 2), y: Math.round(c.y - size.h / 2), w: size.w, h: size.h };
        if (others.some((o) => clashes(r, o, gap))) continue;
        best = r;
        bestCost = cost;
        break;
      }
    }
  }
  return best ?? nearestFree(along(ref, size, base, gap, 0), size, others, gap);
}

export function layoutContinent(boxes: readonly LayoutBox[], spec: LayoutSpec): ContinentLayoutResult {
  const gap = spec.gap ?? 1;
  const mode = spec.sizeBy ?? 'extent';
  const warnings: string[] = [];
  const source = new Map(boxes.map((b) => [b.id, sized(b, 'extent')] as const));
  const size = new Map(boxes.map((b) => [b.id, sized(b, mode, spec.cellsPerRoom)] as const));
  const rooms = new Map(boxes.map((b) => [b.id, b.rooms] as const));
  const overlapsBefore = countOverlaps(source.values());

  const placed = new Map<string, Rect>();
  const pinned = new Set<string>();
  const centre = size.get(spec.center);
  if (!centre) {
    warnings.push(`the centre area ${spec.center} is not on this continent`);
  } else {
    placed.set(spec.center, centre);
    pinned.add(spec.center);
  }

  for (const rel of spec.relations) {
    const box = size.get(rel.area);
    const ref = placed.get(rel.of);
    if (!box) {
      warnings.push(`relation skipped: ${rel.area} is not on this continent`);
      continue;
    }
    if (pinned.has(rel.area)) {
      warnings.push(`relation skipped: ${rel.area} is already placed`);
      continue;
    }
    if (!ref) {
      warnings.push(`relation skipped: ${rel.area} is placed from ${rel.of}, which is not placed yet`);
      continue;
    }
    const at = placeToward(ref, box, rel.dir, placed.values(), gap);
    placed.set(rel.area, at);
    pinned.add(rel.area);
  }

  // Everyone else moves with the pinned area nearest to them in the source, then to the nearest free place; the larger areas first.
  const anchors = [...pinned].map((id) => ({ id, from: centerOf(source.get(id) as Rect), to: centerOf(placed.get(id) as Rect) }));
  const rest = boxes
    .filter((b) => !pinned.has(b.id))
    .sort((a, b) => (rooms.get(b.id) as number) - (rooms.get(a.id) as number) || a.id.localeCompare(b.id));
  for (const box of rest) {
    const s = centerOf(source.get(box.id) as Rect);
    let want = s;
    if (anchors.length > 0) {
      const nearest = anchors.reduce((best, a) => ((a.from.x - s.x) ** 2 + (a.from.y - s.y) ** 2 < (best.from.x - s.x) ** 2 + (best.from.y - s.y) ** 2 ? a : best));
      want = { x: s.x + (nearest.to.x - nearest.from.x), y: s.y + (nearest.to.y - nearest.from.y) };
    }
    placed.set(box.id, nearestFree(want, size.get(box.id) as Rect, placed.values(), gap));
  }

  let moved = 0;
  for (const [id, r] of placed) {
    const s = source.get(id) as Rect;
    if (s.x !== r.x || s.y !== r.y || s.w !== r.w || s.h !== r.h) moved += 1;
  }
  return { placements: placed, overlapsBefore, overlapsAfter: countOverlaps(placed.values()), moved, warnings };
}
