/**
 * `renderSvg(slice, view)`: one floor of a slice as an SVG string.
 *
 * Derived from the DSL Mapper (MIT, same author): `octMath.ts` (the octagon
 * tile) and `svgExport.ts` (tile pitch, label wrapping, the 8-way exit vectors). Unlike the Mapper's export this one
 * escapes EVERY text it writes, in element content and in attributes (`& < > " '`), because room titles come from game
 * text and imports and the SVG may be inlined into a page. It writes no script, no style sheet and no external
 * reference, and puts only escaped strings and rounded numbers into the output.
 *
 * Link look (an attribute `data-state` on each line, so a viewer can restyle them):
 *   confirmed solid · candidate dashed · conflict red, short dashes · unknown target a stub ending in `?` ·
 *   a link that leaves the slice (`offPage`) a stub ending in an arrow head · up/down exits a ▲/▼ mark on the tile.
 *
 * A link between two rooms of the drawn floor is a full line only when it makes a clean join (`classifyLink`: the target lies the way the exit points and
 * nothing stands in the way). Any other link is a partial line out of its room, in the direction of the exit, ending in a diamond (a twist: the room it
 * reaches is not next to this one, `data-tangled=twist`) or an hourglass (a teleport: it lands four or more cells away, `data-tangled=teleport`), so a
 * maze does not turn into long lines across other rooms. Rooms of a maze, loop or teleport subzone (`room.kind`) and rooms with such an exit are drawn as
 * coloured octagons (the game has eight compass directions, so a room is an octagon, never a hexagon) (`data-kind`: maze amber, loop blue, teleport smaller and purple, tangled purple); the root element counts the stubs in `data-tangles`.
 *
 * Terrain: a tile is filled by its room's sector (`TERRAIN` in terrain.ts), carries `data-sector`, and the root lists the terrains on the drawn floor in
 * `data-sectors` (palette order) so a page can write a key. A room with no or an unknown sector keeps the plain fill.
 */

import type { Coords, Direction, Link } from './schema.js';
import type { MapSlice, SliceRoom } from './hierarchy.js';
import { canonicalSector, TERRAIN, terrainFill } from './terrainPalette.js';

export interface RenderView {
  /** Always 'grid': a room is an octagon (the game has eight compass directions, N NE E SE S SW W NW, plus up and down). The hexagon layout was removed on 2026-11-14. */
  layout: 'grid';
  /** Tile width in pixels. Default 40. */
  tile?: number;
  /** The floor to draw. Default: the slice's focus floor (room level) or the lowest floor with a room. */
  z?: number;
  /** Write room titles under the tiles. Default true. */
  labels?: boolean;
  /**
   * 'floor' (default): the picture is framed around the rooms of the drawn floor, as it always was. 'slice': it is framed around every
   * placed room of the slice, so the same room is at the same place on every floor and the picture keeps its size when the floor changes
   * (what a viewer that pans and zooms needs). Drawing ghost floors always uses the slice frame.
   */
  align?: 'floor' | 'slice';
  /**
   * A room (a room of the drawn floor) whose tangled exits are drawn out: from the chip on the edge of its tile a curved line with an arrowhead to the room
   * each one lands in, which is ringed in the line's colour (purple for an exit that does not lead straight on, orange and dashed for one that lands far
   * away). The group is `data-layer="trace"`, one `<g data-trace-to data-trace-exit>` per exit, and the root carries `data-trace`. Without it a maze shows only
   * the chips, so hundreds of tangled exits do not bury the real path.
   */
  trace?: string;
  /**
   * How many floors above and below the drawn one are also drawn, dimmed, behind it (0 to 8, default 0). Each is a group with
   * `data-layer="ghost"`, `data-floor` and `data-distance`, offset a little from the drawn floor (`ghostOffset`) and more transparent the
   * further it is (opacity 0.5, then 0.3, 0.18, ... never below 0.06). Ghost rooms carry `data-ghost-room` and `data-ghost-floor` (not
   * `data-room`: only the drawn floor is made of `data-room` tiles) and no labels.
   */
  ghosts?: number;
  /** Pixels a ghost floor is shifted per floor of distance (up-right for floors above, down-left for floors below). 0 to 40, default 8. */
  ghostOffset?: number;
}

/** The opacity of a ghost floor `distance` floors from the drawn one. */
export function ghostOpacity(distance: number): number {
  const d = Math.max(1, Math.round(Number.isFinite(distance) ? distance : 1));
  return Math.max(0.06, Math.round(0.5 * 0.6 ** (d - 1) * 1000) / 1000);
}

/** Every ghost floor together may hold this many rooms; past it the ghosts are left out (`data-ghosts="skipped"`). */
export const MAX_GHOST_ROOMS = 6_000;

/** More rooms than this on one floor are not drawn: the picture would be noise and the string huge. */
export const MAX_RENDER_ROOMS = 5_000;

/** At most this many unplaced area names are written under a continent picture; the rest are counted. */
const MAX_NAMED_UNPLACED = 4;
const GAP = 4;
const PAD = 40;
const DIR_VEC: Readonly<Record<Direction, { ux: number; uy: number }>> = {
  N: { ux: 0, uy: -1 },
  NE: { ux: Math.SQRT1_2, uy: -Math.SQRT1_2 },
  E: { ux: 1, uy: 0 },
  SE: { ux: Math.SQRT1_2, uy: Math.SQRT1_2 },
  S: { ux: 0, uy: 1 },
  SW: { ux: -Math.SQRT1_2, uy: Math.SQRT1_2 },
  W: { ux: -1, uy: 0 },
  NW: { ux: -Math.SQRT1_2, uy: -Math.SQRT1_2 },
  U: { ux: 0, uy: 0 },
  D: { ux: 0, uy: 0 },
};
// The terrain palette is `TERRAIN` in terrain.ts (the owner's original DslMapper colours); a room with no or an unknown sector keeps this plain fill.
const DEFAULT_FILL = '#dde1e6';


/** A link longer than this many cells that is not in line with its exit is drawn as a teleport (a square badge), not as a twist (a round one). */
const TELEPORT_CELLS = 4;
const TANGLE_COLOR = '#8e44ad';
/** The orange of an exit that lands far away (a teleport); the purple above is an exit that does not lead straight on (a twist). */
const TELEPORT_COLOR = '#d35400';
/** The colours of the lines drawn when a room is chosen (`RenderView.trace`), one per exit in turn; chosen to be told apart on the light map and by the colour-blind. */
const TRACE_COLORS = ['#d62728', '#1f77b4', '#2ca02c', '#e68a00', '#8e44ad', '#0aa5b8', '#d6336c', '#7f5539'];

interface Pt {
  x: number;
  y: number;
}
/** A disc a trace line should not cross: a tile or the block of its name. `owner` is the room it belongs to. */
interface Blocker extends Pt {
  r: number;
  owner: string;
}

function cubicPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** How far a curve runs into the blockers, summed over samples. The room it leaves is ignored near its start and the room it reaches near its end. */
function crossing(p0: Pt, p1: Pt, p2: Pt, p3: Pt, blockers: Blocker[], from: string, to: string): number {
  let cost = 0;
  for (let k = 1; k < 20; k += 1) {
    const t = k / 20;
    const q = cubicPoint(p0, p1, p2, p3, t);
    for (const b of blockers) {
      if ((b.owner === from && t < 0.3) || (b.owner === to && t > 0.7)) continue;
      const into = b.r - Math.hypot(q.x - b.x, q.y - b.y);
      if (into > 0) cost += into;
    }
  }
  return cost;
}

const HANDLE_LEADS = [1, 1.7, 2.5];
const HANDLE_SHIFTS = [0, 0.6, -0.6, 1.2, -1.2, 2, -2];

/**
 * The two handles of a trace line from `s` (leaving square along `v`) to `e`. The plain swoop is tried first (`lead` out of the tile, `lean` sideways, the
 * second handle short of the end on the way in); if it runs across another tile or name, longer and sideways-shifted handles are tried and the one
 * that crosses least wins, the plainer shape on a tie. The first shape that crosses nothing is taken at once.
 */
function routeCurve(s: Pt, e: Pt, v: { ux: number; uy: number }, lead: number, lean: Pt, blockers: Blocker[], from: string, to: string): [Pt, Pt] {
  let best: [Pt, Pt] | null = null;
  let bestCost = Infinity;
  search: for (const k of HANDLE_LEADS) {
    for (const a of HANDLE_SHIFTS) {
      for (const b of HANDLE_SHIFTS) {
        const c1 = { x: s.x + v.ux * lead * k + lean.x - v.uy * a * lead, y: s.y + v.uy * lead * k + lean.y + v.ux * a * lead };
        const rx = e.x - c1.x;
        const ry = e.y - c1.y;
        const rest = Math.max(1, Math.hypot(rx, ry));
        const land = Math.min(40, rest * 0.4);
        const c2 = { x: e.x - (rx / rest) * land - (ry / rest) * b * 24, y: e.y - (ry / rest) * land + (rx / rest) * b * 24 };
        const cost = crossing(s, c1, c2, e, blockers, from, to) + 0.002 * (Math.abs(a) + Math.abs(b) + k);
        if (cost < bestCost - 0.01) {
          best = [c1, c2];
          bestCost = cost;
        }
        if (bestCost < 0.01) break search;
      }
    }
  }
  return best as [Pt, Pt];
}

/** An octagon's points ("x,y x,y ...") grown from its centre by a factor. */
function scalePoints(points: string, cx: number, cy: number, factor: number): string {
  return points
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return `${n(cx + (x - cx) * factor)},${n(cy + (y - cy) * factor)}`;
    })
    .join(' ');
}
/** Pixels of one cell of a continent's grid (an area's placement is in cells). */
const CONTINENT_CELL = 16;
/** Extra cell size when room names are shown: a name is up to three lines of 16 characters. */
const LABEL_SPACE_X = 56;
const LABEL_SPACE_Y = 40;
/** Extra cell height in a maze (or with tangled exits): a band for the pills under a name, and room for the badges on the tile edges. */
const PILL_SPACE = 38;
const LABEL_CHARS = 16;
const LABEL_LINES = 3;

/**
 * The mark of a tangled exit, on the edge of its tile on the side the exit points: a small round chip for an exit that does not lead straight on, a small
 * square one for an exit that lands far away. No number: where it goes is shown when its room is selected (`RenderView.trace`).
 */
function exitChip(cx: number, cy: number, verdict: JoinVerdict): string {
  return verdict === 'teleport'
    ? `<rect x="${n(cx - 5.5)}" y="${n(cy - 5.5)}" width="11" height="11" rx="2" fill="${TELEPORT_COLOR}" stroke="#fff" stroke-width="1.5"/>`
    : `<circle cx="${n(cx)}" cy="${n(cy)}" r="5.5" fill="${TANGLE_COLOR}" stroke="#fff" stroke-width="1.5"/>`;
}

/** The small labels a room of a maze can carry, in the order they are drawn. */
const PILL_COLOR = { IN: '#2e7d32', OUT: '#1565c0', END: '#455a64', '1-WAY': '#b71c1c' } as const;
type PillName = keyof typeof PILL_COLOR;
const PILL_MEANING: Readonly<Record<PillName, string>> = {
  IN: 'You can enter the maze here from outside',
  OUT: 'An exit here leads out to another area',
  END: 'A dead end: one exit only',
  '1-WAY': 'You can land here, but there is no exit back to where you came from',
};
const KIND_TILE: Readonly<Record<NonNullable<SliceRoom['kind']>, { fill: string; stroke: string; scale: number }>> = {
  maze: { fill: '#f2dfb0', stroke: '#b9770e', scale: 1 },
  loop: { fill: '#cfe3f5', stroke: '#2874a6', scale: 1 },
  teleport: { fill: '#e6d5f2', stroke: TANGLE_COLOR, scale: 0.78 },
};
const TANGLED_TILE = { fill: '#e9dcf5', stroke: TANGLE_COLOR, scale: 1 };

export type JoinVerdict = 'clean' | 'twist' | 'teleport';

/**
 * Does the link make a clean join on the grid? Clean: the target lies the way the exit points (within one cell sideways) and no other room
 * is in the way, so a straight line between the two says the truth. Otherwise it is a twist (a wrong side, sideways, or something in the way)
 * or, when it also lands `TELEPORT_CELLS` or more cells away, a teleport. Only the direction and distance matter, not the layout.
 */
export function classifyLink(dir: Direction, from: Coords, to: Coords, occupied: ReadonlySet<string>): JoinVerdict {
  if (dir === 'U' || dir === 'D') return 'clean';
  const v = DIR_VEC[dir];
  const dirX = Math.abs(v.ux) < 0.3 ? 0 : Math.sign(v.ux);
  const dirY = Math.abs(v.uy) < 0.3 ? 0 : Math.sign(v.uy);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const onSide = (dirX === 0 || Math.sign(dx) === dirX) && (dirY === 0 || Math.sign(dy) === dirY);
  const sideways = dirX !== 0 && dirY !== 0 ? Math.abs(Math.abs(dx) - Math.abs(dy)) : dirX !== 0 ? Math.abs(dy) : Math.abs(dx);
  const length = Math.hypot(dx, dy);
  if (!onSide || sideways > 1) return length >= TELEPORT_CELLS ? 'teleport' : 'twist';
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 1; i < steps; i += 1)
    if (occupied.has(`${Math.round(from.x + (dx * i) / steps)},${Math.round(from.y + (dy * i) / steps)}`)) return 'twist';
  return 'clean';
}

/** Everything that goes into the SVG as text passes through here. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A number as it is written into the SVG: one decimal at most, never `NaN` or an exponent. */
function n(value: number): string {
  return String(Number.isFinite(value) ? Math.round(value * 10) / 10 : 0); // String(-0) is "0"
}

/**
 * A name in lines of at most `maxChars` characters, at most `maxLines` of them. A word longer than a line is cut with an ellipsis; a name that does not
 * fit in `maxLines` ends its last line with an ellipsis, so a short name is never mistaken for a whole one (the full name is in the tooltip).
 */
function wrapLabel(text: string, maxChars: number, maxLines: number): string[] {
  const all: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const piece = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    const trial = current ? `${current} ${piece}` : piece;
    if (trial.length > maxChars && current) {
      all.push(current);
      current = piece;
    } else current = trial;
  }
  if (current) all.push(current);
  if (all.length <= maxLines) return all;
  const kept = all.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = last.endsWith('…') ? last : `${last.length >= maxChars ? last.slice(0, maxChars - 1) : last}…`;
  return kept;
}

function octagon(x: number, y: number, size: number): string {
  const s = size;
  const c = s * 0.4142;
  return [
    [x - c, y - s],
    [x + c, y - s],
    [x + s, y - c],
    [x + s, y + c],
    [x + c, y + s],
    [x - c, y + s],
    [x - s, y + c],
    [x - s, y - c],
  ]
    .map(([px, py]) => `${n(px)},${n(py)}`)
    .join(' ');
}

function message(slice: MapSlice, text: string, view: RenderView): string {
  const title = escapeXml(slice.title);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 120" width="420" height="120" role="img" aria-label="${title}" data-layout="${view.layout}" data-level="${escapeXml(slice.level)}"><title>${title}</title><text x="210" y="64" text-anchor="middle" font-size="14" font-family="sans-serif">${escapeXml(text)}</text></svg>`;
}

const DIR_WORD: Readonly<Record<string, string>> = { N: 'north', NE: 'northeast', E: 'east', SE: 'southeast', S: 'south', SW: 'southwest', W: 'west', NW: 'northwest', U: 'up', D: 'down' };
const AREA_LINK_COLOR = '#5f6f8c';
/** A line between two boxes longer than this many pixels crosses a lot of the map: it is drawn faint, so the short hops between neighbours stand out. */
const FAR_AREA_LINK = 150;
/** ...but on a big picture a line is only far when it crosses this share of it, so a continent spread over its landmass does not fade every arrow. */
const FAR_SHARE_OF_PICTURE = 0.15;

interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How far along a centre-to-centre vector (a fraction of it) the line leaves a box: the box's edge on that side. */
function edgeFraction(r: BoxRect, dx: number, dy: number): number {
  const across = Math.abs(dx) < 1e-9 ? Infinity : r.w / 2 / Math.abs(dx);
  const down = Math.abs(dy) < 1e-9 ? Infinity : r.h / 2 / Math.abs(dy);
  return Math.min(across, down);
}

/**
 * The lines between the area boxes: one per pair of areas an exit joins, from the edge of one box to the edge of the other, with an arrowhead at each end an
 * exit goes in at (both ends when there are exits both ways). Hover says which way and how many exits. A pair whose boxes touch has no room for a line.
 */
function areaConnectors(slice: MapSlice, rects: ReadonlyMap<string, BoxRect>): string[] {
  const names = new Map(slice.areas.map((a) => [a.id, a.name] as const));
  const pairs = new Map<string, { a: string; b: string; ab: Map<string, number>; ba: Map<string, number> }>();
  for (const link of slice.areaLinks ?? []) {
    if (!rects.has(link.from) || !rects.has(link.to)) continue;
    const [a, b] = link.from < link.to ? [link.from, link.to] : [link.to, link.from];
    const key = `${a}\u0000${b}`;
    let entry = pairs.get(key);
    if (!entry) {
      entry = { a, b, ab: new Map(), ba: new Map() };
      pairs.set(key, entry);
    }
    const side = link.from === a ? entry.ab : entry.ba;
    side.set(link.dir, (side.get(link.dir) ?? 0) + link.count);
  }
  const words = (m: Map<string, number>): string =>
    [...m].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([dir, count]) => `${DIR_WORD[dir] ?? dir}${count > 1 ? ` (${count})` : ''}`).join(', ');
  const head = (px: number, py: number, ux: number, uy: number): string =>
    `<polygon points="${n(px)},${n(py)} ${n(px - ux * 9 - uy * 4.5)},${n(py - uy * 9 + ux * 4.5)} ${n(px - ux * 9 + uy * 4.5)},${n(py - uy * 9 - ux * 4.5)}" fill="${AREA_LINK_COLOR}"/>`;
  const all = [...rects.values()];
  const spread = Math.max(Math.max(...all.map((r) => r.x + r.w)) - Math.min(...all.map((r) => r.x)), Math.max(...all.map((r) => r.y + r.h)) - Math.min(...all.map((r) => r.y)));
  const far = Math.max(FAR_AREA_LINK, FAR_SHARE_OF_PICTURE * spread);
  const out: string[] = [];
  for (const { a, b, ab, ba } of pairs.values()) {
    const ra = rects.get(a) as BoxRect;
    const rb = rects.get(b) as BoxRect;
    const ax = ra.x + ra.w / 2;
    const ay = ra.y + ra.h / 2;
    const dx = rb.x + rb.w / 2 - ax;
    const dy = rb.y + rb.h / 2 - ay;
    const leave = edgeFraction(ra, dx, dy);
    const enter = edgeFraction(rb, dx, dy);
    if (leave + enter >= 1) continue; // the boxes touch: no gap to draw in
    const x1 = ax + dx * leave;
    const y1 = ay + dy * leave;
    const x2 = ax + dx * (1 - enter);
    const y2 = ay + dy * (1 - enter);
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length < 14) continue; // too short to show a line and an arrowhead
    const ux = (x2 - x1) / length;
    const uy = (y2 - y1) / length;
    const tips = (ab.size > 0 ? head(x2, y2, ux, uy) : '') + (ba.size > 0 ? head(x1, y1, -ux, -uy) : '');
    const nameA = escapeXml(names.get(a) as string);
    const nameB = escapeXml(names.get(b) as string);
    const says = [ab.size > 0 ? `${nameA} to ${nameB}: ${words(ab)}` : '', ba.size > 0 ? `${nameB} to ${nameA}: ${words(ba)}` : ''].filter(Boolean).join('. ');
    out.push(
      `<g data-area-link data-from="${escapeXml(a)}" data-to="${escapeXml(b)}"${length > far ? ' opacity="0.35"' : ''}><line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${AREA_LINK_COLOR}" stroke-width="1.6"/>${tips}<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="transparent" stroke-width="10"/><title>${says}</title></g>`,
    );
  }
  return out;
}

function continentSvg(slice: MapSlice, view: RenderView): string {
  // One cell of the continent grid is 16 pixels: a laid-out continent is 60 to 180 cells across, so it opens as a picture of a few thousand pixels at most.
  const cell = CONTINENT_CELL;
  const placed = slice.areas.flatMap((area) => (area.placement === null ? [] : [{ area, p: area.placement }]));
  const minX = Math.min(...placed.map(({ p }) => p.x));
  const minY = Math.min(...placed.map(({ p }) => p.y));
  const rects = new Map(placed.map(({ area, p }) => [area.id, { x: PAD + (p.x - minX) * cell, y: PAD + (p.y - minY) * cell, w: (p.w ?? 1) * cell - GAP, h: (p.h ?? 1) * cell - GAP }] as const));
  // the lines go first, so a box covers any end of a line that runs under it
  const boxes: string[] = areaConnectors(slice, rects);
  let maxX = 0;
  let maxY = 0;
  for (const { area } of placed) {
    const { x, y, w, h } = rects.get(area.id) as BoxRect;
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
    const name = escapeXml(area.name);
    // The area's place, sized by its rooms: hover names it with its room count, a click opens it.
    const attrs = `data-area="${escapeXml(area.id)}" fill="${DEFAULT_FILL}" stroke="#667"`;
    boxes.push(
      `<rect ${attrs} x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="3"><title>${name} (${area.rooms} rooms)</title></rect>`,
    );
    // The name grows with the box (9 px for a small one, up to 22 px for a big one) and wraps to as many lines as fit; a box too small to hold even a short
    // word of it goes without (its tooltip has the name), so a name never spills onto a neighbour.
    const usable = 0.9 * w;
    // the longest word (up to 14 letters) sets the largest type that still fits across the box, down to 8 px, before any word is cut
    const longest = Math.min(14, Math.max(1, ...area.name.split(/\s+/).map((word) => word.length)));
    const fontSize = Math.max(8, Math.min(22, Math.floor(Math.min(w, h) / 6), Math.floor(usable / (0.58 * longest))));
    const perLine = Math.floor(usable / (fontSize * 0.58));
    const maxLines = Math.max(1, Math.min(3, Math.floor(h / (fontSize * 1.6))));
    const lines = perLine >= 5 ? wrapLabel(area.name, perLine, maxLines) : [];
    lines.forEach((line, i, all) => {
      const top = y + h / 2 - ((all.length - 1) * fontSize * 1.15) / 2 + fontSize * 0.35;
      boxes.push(
        `<text x="${n(x + w / 2)}" y="${n(top + i * fontSize * 1.15)}" text-anchor="middle" font-size="${fontSize}" font-family="sans-serif" pointer-events="none">${escapeXml(line)}</text>`,
      );
    });
  }
  const unplaced = slice.areas.filter((a) => a.placement === null);
  // a catalog can leave hundreds of areas unplaced: name the first few, count the rest, so the line stays inside the picture
  const named = unplaced.slice(0, MAX_NAMED_UNPLACED).map((a) => a.name);
  const more = unplaced.length - named.length;
  const note =
    unplaced.length > 0
      ? `<text x="${PAD}" y="${n(maxY + 24)}" font-size="11" font-family="sans-serif" data-unplaced="areas">Not placed yet: ${escapeXml(named.join(', '))}${more > 0 ? escapeXml(` and ${more} more`) : ''}</text>`
      : '';
  const width = Math.max(420, maxX + PAD);
  const height = Math.max(120, maxY + PAD + (note ? 24 : 0));
  const title = escapeXml(slice.title);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" width="${n(width)}" height="${n(height)}" role="img" aria-label="${title}" data-layout="${view.layout}" data-level="continent"><title>${title}</title>${boxes.join('')}${note}</svg>`;
}

export function renderSvg(slice: MapSlice, view: RenderView = { layout: 'grid' }): string {
  if (slice.level === 'continent') {
    return slice.areas.length === 0 ? message(slice, 'Nothing mapped here yet', view) : continentSvg(slice, view);
  }
  const tile =
    view.tile !== undefined && Number.isFinite(view.tile) && view.tile >= 8 && view.tile <= 200 ? view.tile : 40;
  const labels = view.labels !== false;
  const placed = slice.rooms.filter(
    (r): r is SliceRoom & { coords: NonNullable<SliceRoom['coords']> } => r.coords !== undefined,
  );
  if (placed.length === 0)
    return message(
      slice,
      slice.rooms.length === 0 ? 'Nothing mapped here yet' : 'No room here has a position yet',
      view,
    );
  const focusZ = slice.level === 'room' ? slice.rooms.find((r) => r.id === slice.id)?.coords?.z : undefined;
  const z = view.z ?? focusZ ?? Math.min(...placed.map((r) => r.coords.z ?? 0));
  const floor = placed.filter((r) => (r.coords.z ?? 0) === z);
  if (floor.length === 0) return message(slice, `No room on floor ${n(z)}`, view);
  if (floor.length > MAX_RENDER_ROOMS)
    return message(slice, `Too many rooms to draw (${floor.length}); pick a smaller area`, view);

  const ghostCount =
    view.ghosts !== undefined && Number.isFinite(view.ghosts) ? Math.min(8, Math.max(0, Math.round(view.ghosts))) : 0;
  const ghostOffset =
    view.ghostOffset !== undefined && Number.isFinite(view.ghostOffset)
      ? Math.min(40, Math.max(0, view.ghostOffset))
      : 8;
  const sliceFrame = view.align === 'slice' || ghostCount > 0;
  const ghostFloors = new Map<number, typeof placed>();
  for (const r of placed) {
    const rz = r.coords.z ?? 0;
    const distance = Math.abs(rz - z);
    if (distance >= 1 && distance <= ghostCount) (ghostFloors.get(rz) ?? ghostFloors.set(rz, []).get(rz)!).push(r);
  }
  const ghostRoomTotal = [...ghostFloors.values()].reduce((sum, rooms) => sum + rooms.length, 0);
  const ghostsSkipped = ghostRoomTotal > MAX_GHOST_ROOMS;
  if (ghostsSkipped) ghostFloors.clear();

  const floorIds = new Set(floor.map((r) => r.id));
  const coordsOf = new Map(floor.map((r) => [r.id, r.coords] as const));
  const occupied = new Set(floor.map((r) => `${Math.round(r.coords.x)},${Math.round(r.coords.y)}`));
  const titleOf = new Map(placed.map((r) => [r.id, r.title] as const)); // every floor: a staircase names the room it goes to
  // The tangled links of the drawn floor (an exit that does not lead straight on), and for each room the rooms whose tangled exits land in it.
  const arrivals = new Map<string, string[]>();
  const joined = new Set(slice.links.filter((l) => l.to !== null).map((l) => `${l.from}>${l.to}`)); // every followed exit, to tell a one-way join from a two-way one
  const tangled: { link: Link; verdict: JoinVerdict }[] = [];
  for (const link of slice.links) {
    if (link.to === null || !floorIds.has(link.from) || !floorIds.has(link.to)) continue;
    const verdict = classifyLink(link.dir, coordsOf.get(link.from) as Coords, coordsOf.get(link.to) as Coords, occupied);
    if (verdict === 'clean') continue;
    tangled.push({ link, verdict });
    const list = arrivals.get(link.to);
    if (list) list.push(link.from);
    else arrivals.set(link.to, [link.from]);
  }

  const size = tile / 2;
  // A room with badges and labels needs its own space: wider and taller cells give a label (three lines of 16 characters) room, and a maze room's badges
  // and pills a band of their own, so nothing sits on a neighbour's tile or name.
  const roomy = tangled.length > 0 || placed.some((r) => r.kind !== undefined);
  // the badges sit on the edge of a tile and reach 11 px below it: the name starts below them
  const nameDrop = tangled.length > 0 ? 12 : 0;
  const pitchX = tile + GAP + (labels ? LABEL_SPACE_X : 0);
  const pitchY = tile + GAP + (labels ? LABEL_SPACE_Y : 0) + (roomy ? (labels ? PILL_SPACE : 14) : 0);
  const pos = (cx: number, cy: number): { x: number; y: number } => ({ x: cx * pitchX, y: cy * pitchY });
  const framed = sliceFrame ? placed : floor;
  const raw = new Map(framed.map((r) => [r.id, pos(r.coords.x, r.coords.y)] as const));
  const minX = Math.min(...[...raw.values()].map((p) => p.x));
  const minY = Math.min(...[...raw.values()].map((p) => p.y));
  // a ghost floor is shifted by up to ghostOffset * distance: room for it on the left and top as well as the right and bottom
  const reach = ghostFloors.size > 0 ? ghostCount * ghostOffset : 0;
  const at = new Map(
    [...raw].map(
      ([id, p]) => [id, { x: PAD + reach + (p.x - minX) + size, y: PAD + reach + (p.y - minY) + size }] as const,
    ),
  );
  const width = Math.max(420, Math.max(...[...at.values()].map((p) => p.x)) + PAD + reach + size);
  const height = Math.max(160, Math.max(...[...at.values()].map((p) => p.y)) + PAD + reach + size + (labels ? 56 : 0));

  const tangledRooms = new Set<string>();
  let tangles = 0;
  const lines: string[] = [];
  const tiles: string[] = [];
  const texts: string[] = [];
  const sectorsSeen = new Set<string>();
  const pointsOf = new Map<string, string>(); // each drawn tile's outline, for the ring a trace puts on the room an exit lands in
  const mark =(link: Link, x: number, y: number): void => {
    const state = escapeXml(link.state);
    const base = `data-link="${escapeXml(link.id)}" data-state="${state}"`;
    const stroke = link.state === 'conflict' ? '#c0392b' : link.state === 'confirmed' ? '#3d7a4a' : '#7a8190';
    const dash =
      link.state === 'candidate'
        ? ' stroke-dasharray="5 3"'
        : link.state === 'conflict'
          ? ' stroke-dasharray="2 2"'
          : '';
    // A line is drawn only to a room of the drawn floor: `at` also holds the rooms of the other floors (the slice frame), which are not here.
    const target = link.to !== null && floorIds.has(link.to) ? at.get(link.to) : undefined;
    if (target) {
      // both ends are on the drawn floor here: the source by the caller's check, the target by `target` above
      const verdict: JoinVerdict = classifyLink(link.dir, coordsOf.get(link.from) as Coords, coordsOf.get(link.to as string) as Coords, occupied);
      if (verdict === 'clean') {
        lines.push(
          `<line ${base} x1="${n(x)}" y1="${n(y)}" x2="${n(target.x)}" y2="${n(target.y)}" stroke="${stroke}" stroke-width="${link.state === 'conflict' ? 2 : 1.5}"${dash}/>`,
        );
        // A one-way join (nothing leads back) gets an arrowhead at the room it reaches, drawn above the tiles so it shows at their edge.
        if (!joined.has(`${link.to}>${link.from}`)) {
          const dx = target.x - x;
          const dy = target.y - y;
          const len = Math.max(1, Math.hypot(dx, dy));
          const ux = dx / len;
          const uy = dy / len;
          const tx = target.x - ux * (size + 1);
          const ty = target.y - uy * (size + 1);
          const goes = escapeXml(titleOf.get(link.to as string) as string);
          texts.push(
            `<polygon data-oneway-from="${escapeXml(link.from)}" data-oneway-to="${escapeXml(link.to as string)}" points="${n(tx)},${n(ty)} ${n(tx - ux * 10 - uy * 5)},${n(ty - uy * 10 + ux * 5)} ${n(tx - ux * 10 + uy * 5)},${n(ty - uy * 10 - ux * 5)}" fill="${stroke}" stroke="#fff" stroke-width="1" stroke-linejoin="round"><title>One way: you can go this way${goes ? ` to ${goes}` : ''} but not back</title></polygon>`,
          );
        }
        return;
      }
      // Not a clean join: no long line across other rooms. A small chip sits on the edge of this room, on the side the exit points (round for a twist, square
      // for a teleport). Hover names the target room, a click jumps to it, and selecting this room draws where each of its exits ends up (`view.trace`).
      tangles += 1;
      tangledRooms.add(link.from);
      const v = DIR_VEC[link.dir];
      const toTitle = escapeXml(titleOf.get(link.to as string) as string);
      const meaning = verdict === 'teleport' ? 'This exit lands far away' : 'This exit does not lead straight on';
      texts.push(
        `<g ${base} data-tangled="${verdict}" data-tangled-from="${escapeXml(link.from)}" data-tangled-to="${escapeXml(link.to as string)}" data-jump-to="${escapeXml(link.to as string)}">${exitChip(x + v.ux * (size + 3), y + v.uy * (size + 3), verdict)}<circle cx="${n(x + v.ux * (size + 3))}" cy="${n(y + v.uy * (size + 3))}" r="9" fill="transparent"/><title>${meaning}${toTitle ? `: ${toTitle}` : ''}</title></g>`,
      );
      return;
    }
    if (link.dir === 'U' || link.dir === 'D') return;
    const v = DIR_VEC[link.dir];
    const glyph = link.to === null ? '?' : link.offPage ? '→' : '';
    if (glyph === '') {
      // an exit to a room on another floor (not up or down): a short dashed stub out of the tile
      lines.push(
        `<line ${base} x1="${n(x + v.ux * size)}" y1="${n(y + v.uy * size)}" x2="${n(x + v.ux * (size + 14))}" y2="${n(y + v.uy * (size + 14))}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="3 3"/>`,
      );
      return;
    }
    // An exit nobody has followed (?) and an exit that leaves the area (→) are chips on the edge of the tile, on the side the exit points, the same size as
    // a tangle's badge so the two never overlap. The arrow names the room it reaches, so a viewer can go there.
    const away = link.to !== null && link.offPage ? ` data-offpage-to="${escapeXml(link.to)}"` : '';
    const meaning = away ? 'This exit leads into another area. Click to go there.' : 'This exit goes somewhere nobody has followed yet.';
    const cx = x + v.ux * (size + 3);
    const cy = y + v.uy * (size + 3);
    texts.push(
      `<g ${base}${away}><circle cx="${n(cx)}" cy="${n(cy)}" r="8" fill="#fff" stroke="${stroke}" stroke-width="1.3"/><text x="${n(cx)}" y="${n(cy + 4)}" text-anchor="middle" font-size="11" font-weight="700" font-family="sans-serif" fill="${stroke}" pointer-events="none">${glyph}</text><title>${meaning}</title></g>`,
    );
  };
  for (const link of slice.links) {
    const from = at.get(link.from);
    if (from && floorIds.has(link.from)) mark(link, from.x, from.y);
  }

  for (const room of floor) {
    const p = at.get(room.id) as { x: number; y: number };
    const terrain = terrainFill(room.sector);
    const fill = terrain ?? DEFAULT_FILL;
    if (terrain !== null) sectorsSeen.add(canonicalSector(room.sector) as string);
    const special = room.kind !== undefined ? KIND_TILE[room.kind] : tangledRooms.has(room.id) ? TANGLED_TILE : null;
    const points = octagon(p.x, p.y, special ? size * special.scale : size);
    const focus = slice.level === 'room' && room.id === slice.id;
    const context = room.context === true;
    tiles.push(
      `<polygon data-room="${escapeXml(room.id)}"${focus ? ' data-focus="true"' : ''}${context ? ' data-context="true"' : ''} points="${points}"${terrain !== null ? ` data-sector="${canonicalSector(room.sector)}"` : ''}${special ? ` data-kind="${room.kind ?? 'tangled'}"` : ''} fill="${special ? special.fill : fill}" stroke="${focus ? '#1d4ed8' : special ? special.stroke : '#556'}" stroke-width="${focus ? 2.5 : 1}"${context ? ' opacity="0.7"' : ''}><title>${escapeXml(room.title)}</title></polygon>`,
    );
    // Staircases, as in a rectangle inside the tile split down the middle: a green ▲ on the left for up, an orange ▼ on the right for down. Hover says which
    // room it goes to, a click goes there.
    for (const d of ['U', 'D'] as const) {
      const stair = slice.links.find((l) => l.from === room.id && l.dir === d);
      if (stair === undefined) continue;
      const up = d === 'U';
      const cx = p.x + (up ? -8 : 8);
      const triangle = up
        ? `${n(cx)},${n(p.y - 6)} ${n(cx - 5.5)},${n(p.y + 4)} ${n(cx + 5.5)},${n(p.y + 4)}`
        : `${n(cx)},${n(p.y + 6)} ${n(cx - 5.5)},${n(p.y - 4)} ${n(cx + 5.5)},${n(p.y - 4)}`;
      const goes = stair.to === null ? 'leads somewhere nobody has followed' : titleOf.has(stair.to) ? escapeXml(titleOf.get(stair.to) as string) : 'another area';
      texts.push(
        `<g data-stairs="${up ? 'up' : 'down'}"${stair.to !== null ? ` data-stairs-to="${escapeXml(stair.to)}"` : ''}><circle cx="${n(cx)}" cy="${n(p.y)}" r="8" fill="transparent"/><polygon points="${triangle}" fill="${up ? '#2e7d32' : '#b45309'}" stroke="#fff" stroke-width="1"/><title>${up ? 'Up' : 'Down'}: ${goes}</title></g>`,
      );
    }
    pointsOf.set(room.id, points);
    const nameLines = labels ? wrapLabel(room.title, LABEL_CHARS, LABEL_LINES) : [];
    nameLines.forEach((line, i) => {
      texts.push(
        `<text x="${n(p.x)}" y="${n(p.y + size + 13 + nameDrop + i * 12)}" text-anchor="middle" font-size="10" font-family="sans-serif" fill="#222" stroke="#f4f5f7" stroke-width="3" stroke-linejoin="round" paint-order="stroke" pointer-events="none">${escapeXml(line)}</text>`,
      );
    });
    // The pills of a maze room, in the band under its name (or just under the tile when names are off).
    if (room.kind !== undefined) {
      const exits = slice.links.filter((l) => l.from === room.id);
      const pills: PillName[] = [];
      if (room.entrance === true) pills.push('IN');
      if (exits.some((l) => l.to !== null && l.offPage)) pills.push('OUT');
      if (exits.length === 1) pills.push('END');
      if ((arrivals.get(room.id) ?? []).some((from) => !exits.some((e) => e.to === from))) pills.push('1-WAY');
      const widths = pills.map((pill) => 6.2 * pill.length + 8);
      let px = p.x - (widths.reduce((s, w) => s + w, 0) + (pills.length - 1) * 2) / 2;
      const top = nameLines.length > 0 ? p.y + size + 13 + nameDrop + (nameLines.length - 1) * 12 + 6 : p.y + size + 6 + nameDrop;
      pills.forEach((pill, i) => {
        texts.push(
          `<g data-pill="${pill}"><rect x="${n(px)}" y="${n(top)}" width="${n(widths[i])}" height="11" rx="5.5" fill="${PILL_COLOR[pill]}" stroke="#fff" stroke-width="1"/><text x="${n(px + widths[i] / 2)}" y="${n(top + 8.2)}" text-anchor="middle" font-size="8" font-weight="700" font-family="sans-serif" fill="#fff">${pill}</text><title>${PILL_MEANING[pill]}</title></g>`,
        );
        px += widths[i] + 2;
      });
    }
  }
  // Where the tangled exits of one room end up: from its chip on the edge of the tile, a curved line with an arrowhead to the room it lands in, which is
  // ringed in the colour of the line. Each line leaves square to its edge, so lines out of different exits never lie on one another.
  const traceLayer: string[] = [];
  // What a trace line should keep clear of: every drawn tile and, when names are shown, the block of its name under it.
  const blockers: Blocker[] = [];
  for (const room of floor) {
    const p = at.get(room.id) as { x: number; y: number };
    blockers.push({ x: p.x, y: p.y, r: size * 1.25, owner: room.id });
    if (labels) blockers.push({ x: p.x, y: p.y + size + 24, r: 20, owner: room.id });
  }
  const traced = view.trace !== undefined ? tangled.filter(({ link }) => link.from === view.trace) : [];
  const landings = new Map<string, number>(); // lines already drawn into each room
  traced.forEach(({ link, verdict }, i) => {
    const a = at.get(link.from) as { x: number; y: number };
    const b = at.get(link.to as string) as { x: number; y: number };
    const v = DIR_VEC[link.dir];
    const sx = a.x + v.ux * (size + 3);
    const sy = a.y + v.uy * (size + 3);
    const dx = b.x - sx;
    const dy = b.y - sy;
    const length = Math.hypot(dx, dy);
    const ex = b.x - (dx / length) * size * 0.95;
    const ey = b.y - (dy / length) * size * 0.95;
    // The line leaves square to the edge it is out from (as the original DSL map drew it), so it reads as "leave this way", then swoops toward the room:
    // a cubic whose first handle points straight out of the tile and whose second sits short of the target along the way in.
    const lead = Math.min(60, Math.max(22, length * 0.35));
    // A room behind the exit would have the line double back through its own tile, so the first handle also leans toward the side the room lies on.
    const along = dx * v.ux + dy * v.uy;
    let sideX = dx - along * v.ux;
    let sideY = dy - along * v.uy;
    let sideLength = Math.hypot(sideX, sideY);
    if (sideLength < 1e-6) {
      sideX = -v.uy;
      sideY = v.ux;
      sideLength = 1;
    }
    const lean = lead * Math.max(0, -along / length) * 1.2;
    // The first shape tried is the plain swoop; if it crosses another tile (or a name) the handles are moved until the line runs through the gaps.
    const [c1, c2] = routeCurve({ x: sx, y: sy }, { x: ex, y: ey }, v, lead, { x: (sideX / sideLength) * lean, y: (sideY / sideLength) * lean }, blockers, link.from, link.to as string);
    const heading = Math.atan2(ey - c2.y, ex - c2.x);
    const ux = Math.cos(heading);
    const uy = Math.sin(heading);
    // arrows both where the line meets the tile and half way along it, so the direction is clear wherever you look
    const arrow = `${n(ex)},${n(ey)} ${n(ex - ux * 11 - uy * 5.5)},${n(ey - uy * 11 + ux * 5.5)} ${n(ex - ux * 11 + uy * 5.5)},${n(ey - uy * 11 - ux * 5.5)}`;
    const middle = cubicPoint({ x: sx, y: sy }, c1, c2, { x: ex, y: ey }, 0.5);
    const tangent = Math.atan2(ey + c2.y - c1.y - sy, ex + c2.x - c1.x - sx);
    const midUx = Math.cos(tangent);
    const midUy = Math.sin(tangent);
    const midArrow = `${n(middle.x + midUx * 5)},${n(middle.y + midUy * 5)} ${n(middle.x - midUx * 5 - midUy * 5)},${n(middle.y - midUy * 5 + midUx * 5)} ${n(middle.x - midUx * 5 + midUy * 5)},${n(middle.y - midUy * 5 - midUx * 5)}`;
    // Every line has its own colour (like the multi-coloured arrows of the original DSL map); the dot where it leaves, its arrowhead and the ring round the
    // room it lands in all share it, so "this line goes to this room" is read by colour. A teleport stays dashed. Rings of lines that land in the same room
    // are nested, one outside the other, so none hides another.
    const color = TRACE_COLORS[i % TRACE_COLORS.length];
    const landed = landings.get(link.to as string) ?? 0;
    landings.set(link.to as string, landed + 1);
    const ring = scalePoints(pointsOf.get(link.to as string) as string, b.x, b.y, 1.12 + landed * 0.16);
    const d = `M${n(sx)} ${n(sy)}C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(ex)} ${n(ey)}`;
    traceLayer.push(
      `<g data-trace-to="${escapeXml(link.to as string)}" data-trace-exit="${escapeXml(link.dir)}" data-trace-color="${color}" pointer-events="none"><path d="${d}" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"${verdict === 'teleport' ? ' stroke-dasharray="7 4"' : ''}/><circle cx="${n(sx)}" cy="${n(sy)}" r="4.5" fill="${color}" stroke="#fff" stroke-width="1.5"/><polygon data-trace-mid points="${midArrow}" fill="${color}" stroke="#fff" stroke-width="1" stroke-linejoin="round"/><polygon points="${arrow}" fill="${color}" stroke="#fff" stroke-width="1" stroke-linejoin="round"/><polygon points="${ring}" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="3.5" stroke-linejoin="round"/></g>`,
    );
  });
  // Ghost floors, farthest first so the nearer ones sit on top of them.
  const ghostLayers: string[] = [];
  for (const gz of [...ghostFloors.keys()].sort((a, b) => Math.abs(b - z) - Math.abs(a - z))) {
    const rooms = ghostFloors.get(gz) as typeof placed;
    const distance = Math.abs(gz - z);
    const sign = gz > z ? 1 : -1;
    const dx = sign * distance * ghostOffset;
    const dy = -sign * distance * ghostOffset;
    const ids = new Set(rooms.map((r) => r.id));
    const gLines: string[] = [];
    for (const link of slice.links) {
      if (link.to === null || !ids.has(link.from) || !ids.has(link.to)) continue;
      const a = at.get(link.from) as { x: number; y: number };
      const b = at.get(link.to) as { x: number; y: number };
      gLines.push(
        `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="#7a8190" stroke-width="1"/>`,
      );
    }
    const gTiles = rooms.map((room) => {
      const p = at.get(room.id) as { x: number; y: number };
      const fill = terrainFill(room.sector) ?? DEFAULT_FILL;
      const points = octagon(p.x, p.y, size);
      return `<polygon data-ghost-room="${escapeXml(room.id)}" data-ghost-floor="${n(gz)}" points="${points}" fill="${fill}" stroke="#556" stroke-width="1"/>`;
    });
    ghostLayers.push(
      `<g data-layer="ghost" data-floor="${n(gz)}" data-distance="${distance}" opacity="${ghostOpacity(distance)}" transform="translate(${n(dx)} ${n(dy)})">${gLines.join('')}${gTiles.join('')}</g>`,
    );
  }
  // The rooms of the drawn floor (with room for their labels and exit stubs) as "x y width height": what a viewer should fit when it wants
  // "the whole floor", since the slice frame also holds every other floor and can be mostly empty space.
  const floorPoints = floor.map((r) => at.get(r.id) as { x: number; y: number });
  const padX = size + (labels ? 52 : 24);
  const bx = Math.min(...floorPoints.map((p) => p.x)) - padX;
  const by = Math.min(...floorPoints.map((p) => p.y)) - size - 24;
  const bw = Math.max(...floorPoints.map((p) => p.x)) + padX - bx;
  const bh = Math.max(...floorPoints.map((p) => p.y)) + size + (labels ? 64 : 24) - by;
  const boundsAttr = ` data-bounds="${n(bx)} ${n(by)} ${n(bw)} ${n(bh)}"`;
  const ghostAttr = ghostsSkipped ? ' data-ghosts="skipped"' : ghostCount > 0 ? ` data-ghosts="${ghostCount}"` : '';
  const sectorsAttr = sectorsSeen.size > 0 ? ` data-sectors="${TERRAIN.filter((t) => sectorsSeen.has(t.sector)).map((t) => t.sector).join(',')}"` : '';
  const title = escapeXml(slice.title);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" width="${n(width)}" height="${n(height)}" role="img" aria-label="${title}" data-layout="${view.layout}" data-level="${escapeXml(slice.level)}" data-floor="${n(z)}"${view.trace !== undefined ? ` data-trace="${escapeXml(view.trace)}"` : ''}${boundsAttr}${ghostAttr}${tangles > 0 ? ` data-tangles="${tangles}"` : ''}${sectorsAttr}><title>${title}</title>${ghostLayers.join('')}<g data-layer="links">${lines.join('')}</g><g data-layer="tiles">${tiles.join('')}</g>${traceLayer.length > 0 ? `<g data-layer="trace">${traceLayer.join('')}</g>` : ''}<g data-layer="labels">${texts.join('')}</g></svg>`;
}
