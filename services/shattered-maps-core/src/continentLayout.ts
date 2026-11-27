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
  /**
   * The continent's real silhouette, a polygon in any units (x east, y south; pixels of a world picture will do). The boxes are packed inside it, so the
   * continent has its shape instead of a loose diamond. Its size in cells is derived from the boxes (see `outlineFill`), so only its proportions matter.
   */
  outline?: Point[];
  /** Area id -> where it lies, in the outline's units. A hinted area is placed there first (needs an `outline`); it is the owner's "this is really here". */
  hints?: Record<string, Point>;
  /** Share of the outline the boxes (with their gaps) may fill, 0.1 to 0.9. Default 0.5: lower is roomier and always fits. */
  outlineFill?: number;
  /**
   * Area pairs an exit joins (`weight` = how many exits). Inside an outline, linked areas are pulled together so the lines between them stay short and
   * visible; ignored without an outline (the compass relations already put neighbours side by side).
   */
  links?: LayoutLink[];
}

export interface LayoutLink {
  a: string;
  b: string;
  weight: number;
}

export type Point = [number, number];

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
  /** With an outline: areas that did not fit inside it and sit just outside (0 without one). */
  outsideOutline: number;
  /** With an outline: the silhouette in cells, in the same frame as the placements (what a viewer draws as the land); undefined without one. */
  outlineCells?: Point[];
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
function nearestFree(want: { x: number; y: number }, size: Rect, placed: Iterable<Rect>, gap: number, allowed: Allowed = anywhere, maxRing = MAX_RING): Rect {
  const others = [...placed];
  const at = (cx: number, cy: number): Rect => ({ x: Math.round(cx - size.w / 2), y: Math.round(cy - size.h / 2), w: size.w, h: size.h });
  const free = (r: Rect): boolean => allowed(r) && !others.some((o) => clashes(r, o, gap));
  const first = at(want.x, want.y);
  if (free(first)) return first;
  for (let ring = 1; ring <= maxRing; ring += 1) {
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
function placeToward(ref: Rect, size: Rect, dir: Compass, placed: Iterable<Rect>, gap: number, allowed: Allowed = anywhere, maxRing = MAX_RING): Rect {
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
        if (!allowed(r) || others.some((o) => clashes(r, o, gap))) continue;
        best = r;
        bestCost = cost;
        break;
      }
    }
  }
  return best ?? nearestFree(along(ref, size, base, gap, 0), size, others, gap, allowed, maxRing);
}

type Allowed = (r: Rect) => boolean;
const anywhere: Allowed = () => true;

/** True when (x, y) is inside the polygon (even-odd rule). */
function insidePolygon(x: number, y: number, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i] as Point;
    const [xj, yj] = poly[j] as Point;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

interface Shape {
  /** The silhouette in cells. */
  cells: Point[];
  /** Where an outline point lies in cells. */
  toCell: (p: Point) => { x: number; y: number };
  /** The box lies wholly inside the silhouette (its corners and its centre). */
  allowed: Allowed;
  /** Cells across the silhouette's frame, corner to corner: the furthest a search inside it can need to go. */
  reach: number;
  frame: { x: number; y: number; w: number; h: number };
  /** The leftmost and rightmost cell the silhouette covers on the row at height y (a concave shape counts its gaps as covered). */
  rowAt: (y: number) => [number, number];
}

/**
 * The outline sized in cells so that the boxes (each with its gap) fill `fill` of it, its top-left corner at (originX, originY). Null when the outline is
 * not a polygon with an area.
 */
function shapeOf(outline: readonly Point[], boxArea: number, fill: number, originX: number, originY: number): Shape | null {
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  let twice = 0;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const [x0, y0] = outline[j] as Point;
    const [x1, y1] = outline[i] as Point;
    twice += x0 * y1 - x1 * y0;
  }
  const area = Math.abs(twice) / 2;
  if (outline.length < 3 || !(area > 0)) return null;
  const scale = Math.sqrt(boxArea / (fill * area));
  const toCell = (p: Point): { x: number; y: number } => ({ x: originX + (p[0] - minX) * scale, y: originY + (p[1] - minY) * scale });
  const cells = outline.map((p): Point => [toCell(p).x, toCell(p).y]);
  const w = (Math.max(...xs) - minX) * scale;
  const h = (Math.max(...ys) - minY) * scale;
  return {
    cells,
    toCell,
    allowed: (r) =>
      insidePolygon(r.x + r.w / 2, r.y + r.h / 2, cells) &&
      insidePolygon(r.x, r.y, cells) &&
      insidePolygon(r.x + r.w, r.y, cells) &&
      insidePolygon(r.x, r.y + r.h, cells) &&
      insidePolygon(r.x + r.w, r.y + r.h, cells),
    reach: Math.ceil(Math.hypot(w, h)) + 2,
    frame: { x: originX, y: originY, w, h },
    rowAt: (y) => {
      // kept a hair inside the frame so a row through the top or bottom vertex still crosses the edges
      const row = Math.min(originY + h - 0.01, Math.max(originY + 0.01, y));
      const crossings: number[] = [];
      for (let i = 0, j = cells.length - 1; i < cells.length; j = i, i += 1) {
        const [xi, yi] = cells[i] as Point;
        const [xj, yj] = cells[j] as Point;
        if (yi > row !== yj > row) crossings.push(xi + ((row - yi) / (yj - yi)) * (xj - xi));
      }
      return [Math.min(...crossings), Math.max(...crossings)];
    },
  };
}

export function layoutContinent(boxes: readonly LayoutBox[], spec: LayoutSpec): ContinentLayoutResult {
  const gap = spec.gap ?? 1;
  const mode = spec.sizeBy ?? 'extent';
  const warnings: string[] = [];
  const source = new Map(boxes.map((b) => [b.id, sized(b, 'extent')] as const));
  const size = new Map(boxes.map((b) => [b.id, sized(b, mode, spec.cellsPerRoom)] as const));
  const rooms = new Map(boxes.map((b) => [b.id, b.rooms] as const));
  const overlapsBefore = countOverlaps(source.values());
  const byRooms = (a: LayoutBox, b: LayoutBox): number => (rooms.get(b.id) as number) - (rooms.get(a.id) as number) || a.id.localeCompare(b.id);

  const finish = (placed: Map<string, Rect>, outsideOutline: number, outlineCells?: Point[]): ContinentLayoutResult => {
    let moved = 0;
    for (const [id, r] of placed) {
      const s = source.get(id) as Rect;
      if (s.x !== r.x || s.y !== r.y || s.w !== r.w || s.h !== r.h) moved += 1;
    }
    return { placements: placed, overlapsBefore, overlapsAfter: countOverlaps(placed.values()), moved, outsideOutline, ...(outlineCells ? { outlineCells } : {}), warnings };
  };

  if (spec.hints !== undefined && spec.outline === undefined) warnings.push('hints need an outline to be placed against: ignored');
  if (spec.outline !== undefined) {
    // The silhouette, sized so the boxes fill a share of it, its corner where the source's own extent starts.
    const sourceRects = [...source.values()];
    const boxArea = [...size.values()].reduce((sum, r) => sum + (r.w + gap) * (r.h + gap), 0);
    const fill = Math.min(0.9, Math.max(0.1, spec.outlineFill ?? 0.5));
    const shape = shapeOf(spec.outline, boxArea, fill, Math.round(Math.min(...sourceRects.map((r) => r.x))), Math.round(Math.min(...sourceRects.map((r) => r.y))));
    if (shape === null) warnings.push('the outline is not a polygon with an area: ignored');
    else return layoutInside(boxes, spec, shape, size, byRooms, warnings, finish);
  }

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
  const rest = boxes.filter((b) => !pinned.has(b.id)).sort(byRooms);
  for (const box of rest) {
    const s = centerOf(source.get(box.id) as Rect);
    let want = s;
    if (anchors.length > 0) {
      const nearest = anchors.reduce((best, a) => ((a.from.x - s.x) ** 2 + (a.from.y - s.y) ** 2 < (best.from.x - s.x) ** 2 + (best.from.y - s.y) ** 2 ? a : best));
      want = { x: s.x + (nearest.to.x - nearest.from.x), y: s.y + (nearest.to.y - nearest.from.y) };
    }
    placed.set(box.id, nearestFree(want, size.get(box.id) as Rect, placed.values(), gap));
  }
  return finish(placed, 0);
}

const RELAX_ROUNDS = 400;
/** How hard a link pulls its two ends together, and how firmly a box is held towards where the stretch put it. */
const PULL = 4;
const ANCHOR = 0.004;

/**
 * Moves the box centres so linked areas end close together, without overlap and inside the outline: every round each link pulls its two ends towards
 * touching (a stronger link harder), overlapping boxes are pushed apart along their shallower overlap, a weak spring holds each box towards where the
 * stretch put it (so west stays west), and a box is kept within the silhouette's width at its height. A hinted area never moves. Deterministic: ids are
 * visited in order and the step shrinks with the round.
 */
function relax(
  ids: readonly string[],
  start: ReadonlyMap<string, { x: number; y: number }>,
  size: ReadonlyMap<string, Rect>,
  shape: Shape,
  links: readonly LayoutLink[],
  fixed: ReadonlySet<string>,
  gap: number,
): Map<string, { x: number; y: number }> {
  const pos = new Map(ids.map((id) => [id, { ...(start.get(id) as { x: number; y: number }) }] as const));
  const pairs = links.filter((l) => l.a !== l.b && pos.has(l.a) && pos.has(l.b));
  const top = Math.max(1, ...pairs.map((l) => l.weight));
  const move = (id: string, dx: number, dy: number): void => {
    if (fixed.has(id)) return;
    const p = pos.get(id) as { x: number; y: number };
    p.x += dx;
    p.y += dy;
  };
  for (let round = 0; round < RELAX_ROUNDS; round += 1) {
    const step = 0.5 * (1 - round / RELAX_ROUNDS) + 0.05;
    for (const l of pairs) {
      const a = pos.get(l.a) as { x: number; y: number };
      const b = pos.get(l.b) as { x: number; y: number };
      const sa = size.get(l.a) as Rect;
      const sb = size.get(l.b) as Rect;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      // the distance at which the two boxes just clear each other along this line
      const touch = Math.min(((sa.w + sb.w) / 2 + gap) / (Math.abs(dx / dist) || 1e-9), ((sa.h + sb.h) / 2 + gap) / (Math.abs(dy / dist) || 1e-9));
      const excess = dist - touch - 2 * gap;
      if (excess <= 0) continue;
      const pull = (excess * step * PULL * (0.4 + 0.6 * Math.min(1, l.weight / top))) / 2;
      move(l.a, (dx / dist) * pull, (dy / dist) * pull);
      move(l.b, -(dx / dist) * pull, -(dy / dist) * pull);
    }
    for (let i = 0; i < ids.length; i += 1) {
      const ia = ids[i] as string;
      const a = pos.get(ia) as { x: number; y: number };
      const sa = size.get(ia) as Rect;
      for (let j = i + 1; j < ids.length; j += 1) {
        const ib = ids[j] as string;
        const b = pos.get(ib) as { x: number; y: number };
        const sb = size.get(ib) as Rect;
        const px = (sa.w + sb.w) / 2 + gap - Math.abs(b.x - a.x);
        const py = (sa.h + sb.h) / 2 + gap - Math.abs(b.y - a.y);
        if (px <= 0 || py <= 0) continue;
        const aFixed = fixed.has(ia);
        const bFixed = fixed.has(ib);
        const share = aFixed || bFixed ? 1 : 0.5;
        const along = px < py ? 'x' : 'y';
        const sign = (along === 'x' ? b.x - a.x : b.y - a.y) >= 0 ? 1 : -1;
        const amount = (along === 'x' ? px : py) * share;
        if (!aFixed) move(ia, along === 'x' ? -sign * amount : 0, along === 'y' ? -sign * amount : 0);
        if (!bFixed) move(ib, along === 'x' ? sign * amount : 0, along === 'y' ? sign * amount : 0);
      }
    }
    for (const id of ids) {
      const p = pos.get(id) as { x: number; y: number };
      const s = start.get(id) as { x: number; y: number };
      const own = size.get(id) as Rect;
      move(id, (s.x - p.x) * ANCHOR, (s.y - p.y) * ANCHOR);
      // keep the whole box inside the silhouette at its height: the row at the box's top and bottom both have room for it
      const yMin = shape.frame.y + own.h / 2;
      const yMax = shape.frame.y + shape.frame.h - own.h / 2;
      p.y = Math.min(Math.max(p.y, yMin), Math.max(yMin, yMax));
      const rows = [shape.rowAt(p.y - own.h / 2), shape.rowAt(p.y + own.h / 2), shape.rowAt(p.y)];
      const left = Math.max(...rows.map((r) => r[0])) + own.w / 2;
      const right = Math.min(...rows.map((r) => r[1])) - own.w / 2;
      p.x = right >= left ? Math.min(Math.max(p.x, left), right) : (left + right) / 2;
    }
  }
  return pos;
}

/**
 * The silhouette mode. The ordinary layout (centre, compass relations, the rest) runs first and says which area lies west, north or south of which; that
 * picture is then stretched over the outline - each row of it across the width the silhouette has at that height - so the relative directions survive and
 * the continent has its shape. Each area goes to the nearest free place inside the outline to where the stretch puts it, the larger areas first; an area
 * with a hint goes where the hint says, before the others.
 */
function layoutInside(
  boxes: readonly LayoutBox[],
  spec: LayoutSpec,
  shape: Shape,
  size: ReadonlyMap<string, Rect>,
  byRooms: (a: LayoutBox, b: LayoutBox) => number,
  warnings: string[],
  finish: (placed: Map<string, Rect>, outside: number, outlineCells?: Point[]) => ContinentLayoutResult,
): ContinentLayoutResult {
  const flatSpec: LayoutSpec = { ...spec };
  delete flatSpec.outline;
  delete flatSpec.hints;
  delete flatSpec.outlineFill;
  const flat = layoutContinent(boxes, flatSpec);
  warnings.push(...flat.warnings);

  const centres = new Map([...flat.placements].map(([id, r]) => [id, centerOf(r)] as const));
  const xs = [...centres.values()].map((c) => c.x);
  const ys = [...centres.values()].map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(1, Math.max(...xs) - minX);
  const spanY = Math.max(1, Math.max(...ys) - minY);
  const stretched = (id: string): { x: number; y: number } => {
    const c = centres.get(id) as { x: number; y: number };
    const y = shape.frame.y + ((c.y - minY) / spanY) * shape.frame.h;
    const [left, right] = shape.rowAt(y);
    return { x: left + ((c.x - minX) / spanX) * (right - left), y };
  };

  for (const id of Object.keys(spec.hints ?? {})) if (!size.has(id)) warnings.push(`hint skipped: ${id} is not on this continent`);
  const hinted = (b: LayoutBox): boolean => spec.hints?.[b.id] !== undefined;
  const order = [...boxes].sort((a, b) => Number(hinted(b)) - Number(hinted(a)) || byRooms(a, b));
  const placed = new Map<string, Rect>();
  const gap = spec.gap ?? 1;
  let outside = 0;
  const start = new Map(boxes.map((b) => [b.id, spec.hints?.[b.id] !== undefined ? shape.toCell(spec.hints[b.id] as Point) : stretched(b.id)] as const));
  const relaxed = relax(boxes.map((b) => b.id).sort(), start, size, shape, spec.links ?? [], new Set(Object.keys(spec.hints ?? {})), gap);
  for (const box of order) {
    const want = relaxed.get(box.id) as { x: number; y: number };
    const own = size.get(box.id) as Rect;
    try {
      placed.set(box.id, nearestFree(want, own, placed.values(), gap, shape.allowed, shape.reach));
    } catch {
      // nothing inside is free: the area goes just outside rather than the layout failing (counted and reported)
      outside += 1;
      placed.set(box.id, nearestFree(want, own, placed.values(), gap));
    }
  }
  if (outside > 0) warnings.push(`${outside} area(s) did not fit inside the outline and sit just outside it: lower outlineFill`);
  return finish(placed, outside, shape.cells);
}
