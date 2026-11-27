/* eslint-disable @typescript-eslint/no-explicit-any -- moved as-is from the DslMapper repository; typed with the neutral map model in the rework phase */
// src/render/exportSVG.ts
import { MapDocV1, Room, Direction, ExitDef, TerrainKind } from "../types";
import { TERRAIN_FILL, TERRAIN_ORDER } from "./terrainPalette";
import { dirUnit, reverseDir } from "./dir";

/* ---------------- Geometry & shared helpers (mirrors OctRenderer) ---------------- */
const TILE = 40;
const GAP = 4;
const HEAD_CLEAR = 10;

const LABEL_FONT_SIZE = 12;
const LABEL_LINE_STEP = 14;
const CHAR_W = 7;
const LABEL_PAD_X = 8;
const LABEL_PAD_Y = 4;

type Rect = { x: number; y: number; w: number; h: number };

/** 8-way unit vectors for declared exits */
const DIR_VEC: Record<Direction, { ux: number; uy: number }> = {
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

function edgePortForDir(cx: number, cy: number, dir: Direction, push: number) {
  const r = TILE / 2;
  const k = 0.4142 * r;
  const offsets: Record<Exclude<Direction, "U" | "D">, [number, number]> = {
    N: [0, -r],
    NE: [r, -k],
    E: [r, 0],
    SE: [r, k],
    S: [0, r],
    SW: [-r, k],
    W: [-r, 0],
    NW: [-r, -k],
  };
  const dv = DIR_VEC[dir] || { ux: 0, uy: 0 };
  const off =
    dir === "U" || dir === "D"
      ? [0, 0]
      : offsets[dir as Exclude<Direction, "U" | "D">];

  const baseX = cx + off[0];
  const baseY = cy + off[1];
  return { x: baseX + dv.ux * push, y: baseY + dv.uy * push };
}

/* ---------------- Layout mappers (content-fit like OctRenderer's makeContentMapper) ---------------- */
function makeContentMapper(rooms: Room[], pad = 96) {
  if (rooms.length === 0) {
    return {
      width: pad * 2 + TILE,
      height: pad * 2 + TILE,
      map: (_cx: number, _cy: number) => ({ x: pad + TILE / 2, y: pad + TILE / 2 }),
    };
  }
  let minCx = Infinity, maxCx = -Infinity, minCy = Infinity, maxCy = -Infinity;
  for (const r of rooms) {
    const { cx, cy } = r.coords;
    if (cx < minCx) minCx = cx;
    if (cx > maxCx) maxCx = cx;
    if (cy < minCy) minCy = cy;
    if (cy > maxCy) maxCy = cy;
  }
  const pitchX = TILE + GAP;
  const pitchY = TILE + GAP;
  const cols = maxCx - minCx + 1;
  const rows = maxCy - minCy + 1;

  const contentW = cols * pitchX;
  const contentH = rows * pitchY;

  const width = Math.max(420, Math.round(contentW + pad * 2));
  const height = Math.max(320, Math.round(contentH + pad * 2));

  const map = (cx: number, cy: number) => ({
    x: pad + (cx - minCx) * pitchX + TILE / 2,
    y: pad + (cy - minCy) * pitchY + TILE / 2,
  });

  return { map, width, height, pad };
}

/* ---------------- Label wrapping & collision avoidance ---------------- */
function wrapLabel(s: string, maxChars = 14, maxLines = 3): string[] {
  const words = (s ?? "").toString().split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = (cur ? cur + " " : "") + w;
    if (trial.length > maxChars && cur) {
      out.push(cur);
      cur = w;
      if (out.length >= maxLines) break;
    } else {
      cur = trial;
    }
  }
  if (cur && out.length < maxLines) out.push(cur);
  return out;
}

function buildLabelRects(
  rooms: Room[],
  map: (cx: number, cy: number) => { x: number; y: number },
  yShift = 0
): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  for (const r of rooms) {
    const { x, y } = map(r.coords.cx, r.coords.cy);
    const lines = wrapLabel(r.label || r.vnum);
    const maxChars = Math.max(1, ...lines.map((ln) => ln.length));
    const textW = maxChars * CHAR_W;
    const textH = lines.length * LABEL_LINE_STEP;
    const firstY = y + yShift - ((lines.length - 1) * LABEL_LINE_STEP) / 2;
    const boxX = x - textW / 2 - LABEL_PAD_X;
    const boxY = firstY - LABEL_FONT_SIZE - LABEL_PAD_Y;
    const w = textW + LABEL_PAD_X * 2;
    const h = textH + LABEL_PAD_Y * 2;
    rects.set(r.vnum, { x: boxX, y: boxY, w, h });
  }
  return rects;
}

// approximate each tile (octagon) as an axis-aligned square obstacle (matches live)
const TILE_PAD = 6;
function buildTileRects(
  rooms: Room[],
  map: (cx: number, cy: number) => { x: number; y: number }
): Map<string, Rect> {
  const r = TILE / 2 + TILE_PAD;
  const size = 2 * r;
  const rects = new Map<string, Rect>();
  for (const room of rooms) {
    const { x, y } = map(room.coords.cx, room.coords.cy);
    rects.set(room.vnum, { x: x - r, y: y - r, w: size, h: size });
  }
  return rects;
}

function lineRectIntersectionT(
  x1: number, y1: number, x2: number, y2: number, r: Rect
): [number, number] | null {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    const pi = p[i], qi = q[i];
    if (pi === 0) { if (qi < 0) return null; }
    else {
      const t = qi / pi;
      if (pi < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else       { if (t < t0) return null; if (t < t1) t1 = t; }
    }
  }
  return [t0, t1];
}

function lineMinusRects(
  x1: number, y1: number, x2: number, y2: number,
  rects: Rect[], gapPx = 8
): Array<[number, number, number, number]> {
  const L = Math.hypot(x2 - x1, y2 - y1);
  const gapT = L > 0 ? gapPx / L : 0;
  const cuts: Array<[number, number]> = [];
  for (const r of rects) {
    const t = lineRectIntersectionT(x1, y1, x2, y2, r);
    if (!t) continue;
    const [a, b] = t;
    const A = Math.max(0, a - gapT);
    const B = Math.min(1, b + gapT);
    if (B > 0 && A < 1) cuts.push([A, B]);
  }
  if (!cuts.length) return [[x1, y1, x2, y2]];
  cuts.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const c of cuts) {
    if (!merged.length || c[0] > merged[merged.length - 1][1]) {
      merged.push([...c]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], c[1]);
    }
  }
  const out: Array<[number, number, number, number]> = [];
  let prev = 0;
  for (const [a, b] of merged) {
    if (a > prev) {
      out.push([
        x1 + (x2 - x1) * prev,
        y1 + (y2 - y1) * prev,
        x1 + (x2 - x1) * a,
        y1 + (y2 - y1) * a,
      ]);
    }
    prev = Math.max(prev, b);
  }
  if (prev < 1) out.push([x1 + (x2 - x1) * prev, y1 + (y2 - y1) * prev, x2, y2]);
  return out;
}

/* ---------------- Curves ---------------- */
function quadPoint(
  t: number,
  p0: [number, number],
  p1: [number, number],
  p2: [number, number]
): [number, number] {
  const mt = 1 - t;
  const a = mt * mt, b = 2 * mt * t, c = t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]];
}

function chopQuadToSegments(
  p0: [number, number], p1: [number, number], p2: [number, number], stepPx = 10
): Array<[number, number, number, number]> {
  const dx = p2[0] - p0[0], dy = p2[1] - p0[1];
  const L = Math.hypot(dx, dy);
  const N = Math.max(6, Math.min(80, Math.ceil(L / stepPx)));
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) pts.push(quadPoint(i / N, p0, p1, p2));
  const out: Array<[number, number, number, number]> = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    out.push([x1, y1, x2, y2]);
  }
  return out;
}

/* ---------------- Colors ---------------- */
const STRAIGHT_COLOR = "rgba(255,255,255,0.95)";
const CURVE_PALETTE = ["#35A7FF", "#FF6F91", "#FFC75F", "#C34A36", "#7DFFB3", "#B967FF"];

function hstr(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}
function pickCurveColor(from: string, to: string, i: number) {
  const base = hstr(`curve:${from}->${to}`) + i * 97;
  return CURVE_PALETTE[base % CURVE_PALETTE.length];
}

/* ---------------- Shapes ---------------- */
function octPoints(x: number, y: number, size: number) {
  const r = size / 2;
  const k = 0.4142 * r;
  const pts: [number, number][] = [
    [x - k, y - r], [x + k, y - r], [x + r, y - k], [x + r, y + k],
    [x + k, y + r], [x - k, y + r], [x - r, y + k], [x - r, y - k],
  ];
  return pts.map((p) => p.join(",")).join(" ");
}

function arrowHeadPath(x: number, y: number, ux: number, uy: number) {
  const size = 8;
  const px = -uy, py = ux;
  const tipX = x, tipY = y;
  const leftX = x - ux * size - px * (size * 0.5);
  const leftY = y - uy * size - py * (size * 0.5);
  const rightX = x - ux * size + px * (size * 0.5);
  const rightY = y - uy * size + py * (size * 0.5);
  return `M ${tipX} ${tipY} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`;
}

/* ---------------- Door glyphs ---------------- */
function doorGlyphSimplePath(x: number, y: number, ux: number, uy: number) {
  const px = -uy, py = ux;
  const half = 6;
  const x1 = x - px * half, y1 = y - py * half;
  const x2 = x + px * half, y2 = y + py * half;
  return {
    under: `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(0,0,0,0.9)" stroke-width="5" stroke-linecap="round"/>`,
    over:  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`
  };
}
function doorGlyphLockedPath(x: number, y: number) {
  const bodyR = 5, shackleR = 4;
  const shX = x, shY = y - bodyR - 2;
  return `
    <circle cx="${x}" cy="${y}" r="${bodyR + 1.5}" fill="none" stroke="rgba(0,0,0,0.9)" stroke-width="3"/>
    <circle cx="${x}" cy="${y}" r="${bodyR}" fill="none" stroke="#fff" stroke-width="2"/>
    <path d="M ${shX - shackleR} ${shY} a ${shackleR} ${shackleR} 0 0 1 ${2*shackleR} 0" fill="none" stroke="rgba(0,0,0,0.9)" stroke-width="3"/>
    <path d="M ${shX - shackleR} ${shY} a ${shackleR} ${shackleR} 0 0 1 ${2*shackleR} 0" fill="none" stroke="#fff" stroke-width="2"/>
  `;
}

/* ---------------- Public API ---------------- */
type RenderOpts = {
  width?: number;
  height?: number;
  background?: string;
  includeLegend?: boolean;
  legendCorner?: "tl" | "tr" | "bl" | "br";
  legendMargin?: number;
};

/** Single-floor export that mirrors the live renderer (curves, colors, content-fit). */
export function renderAreaSVG(
  doc: MapDocV1,
  areaId: string,
  level: number,
  opts: RenderOpts = {}
): string {
  const rooms = Object.values(doc.rooms).filter(
    (r) => r.category?.areaId === areaId && (r.coords?.vz ?? 0) === level
  );
  if (rooms.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#0f0f10"/><text x="16" y="28" fill="#ddd" font-family="ui-sans-serif,system-ui" font-size="14">No rooms to render.</text></svg>`;
  }

  // Content-fit layout (prevents clipping & huge whitespace)
  const pad = 96;
  const mapper = makeContentMapper(rooms, pad);
  const width = opts.width ?? mapper.width;
  let height = opts.height ?? mapper.height;

  // Legend reservation on top band
  const includeLegend = opts.includeLegend !== false;
  const corner = opts.legendCorner ?? "tl";
  const legendMargin = opts.legendMargin ?? 12;

  type LegendDims = {
    width: number; height: number; cols: number; rows: number;
    padH: number; padV: number; rowH: number; colW: number; hdrH: number;
  };
  function measureLegend(): LegendDims {
    const padV = 12, padH = 12;
    const rowH = 18, colW = 132, hdrH = 22;
    const items = TERRAIN_ORDER.length;
    const cols = items > 7 ? 2 : 1;
    const rows = Math.ceil(items / cols);
    const width = padH * 2 + cols * colW;
    const height = padV * 2 + hdrH + rows * rowH;
    return { width, height, cols, rows, padH, padV, rowH, colW, hdrH };
  }

  let legendDims: LegendDims | null = null;
  let legendX = 0, legendY = 0;
  let topBand = 0;

  if (includeLegend) {
    legendDims = measureLegend();
    const band = legendDims.height + legendMargin;
    topBand = band;
    height += band;
    if (corner === "tl") { legendX = 12; legendY = 12; }
    else                 { legendX = Math.max(12, width - legendDims.width - 12); legendY = 12; }
  }

  const bg = opts.background ?? "#0f0f10";

  // Positions (content-fit) with top band shift
  const pos = new Map<string, { x: number; y: number }>();
  rooms.forEach((r) => {
    const p = mapper.map(r.coords.cx, r.coords.cy);
    pos.set(r.vnum, { x: p.x, y: p.y + topBand });
  });

  // Obstacles for trimming edges
  const labelRects = buildLabelRects(rooms, (cx, cy) => mapper.map(cx, cy), topBand);
  const tileRectsMap = buildTileRects(rooms, (cx, cy) => {
    const p = mapper.map(cx, cy);
    return { x: p.x, y: p.y + topBand };
  });
  const avoidRectsAll = new Map<string, Rect>();
  for (const [k, v] of labelRects) avoidRectsAll.set(`L:${k}`, v);
  for (const [k, v] of tileRectsMap) avoidRectsAll.set(`T:${k}`, v);

  // Edges
  type Edge = { from: Room; to: Room; dir: Direction; oneWay: boolean; door: ExitDef['door'] };
  const byVnum = new Map<string, Room>();
  rooms.forEach((r) => byVnum.set(r.vnum, r));

  const edges: Edge[] = [];
  for (const r of rooms) {
    for (const [dir, ex] of Object.entries(r.exits) as [Direction, ExitDef][]) {
      if (!ex?.to) continue;
      if (dir === "U" || dir === "D") continue;
      const tgt = byVnum.get(ex.to);
      if (!tgt) continue;
      if ((tgt.coords.vz ?? 0) !== level || (r.coords.vz ?? 0) !== level) continue;
      edges.push({ from: r, to: tgt, dir, oneWay: !!ex.oneWay, door: ex.door ?? null });
    }
  }

  // Inset distances (match live)
  const rEdge = TILE / 2;
  const k = 0.4142 * rEdge;
  const margin = 4;
  const insetStart = k + margin;
  const insetEnd   = k + margin + HEAD_CLEAR;

  let edgeMarkup = "";

  edges.forEach((e, idx) => {
    const a = pos.get(e.from.vnum)!;
    const b = pos.get(e.to.vnum)!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const { ux, uy } = dirUnit(dx, dy);

    // Avoid list excluding endpoints' tiles
    const avoid: Rect[] = [];
    for (const rr of rooms) {
      const lab = labelRects.get(rr.vnum);
      if (lab) avoid.push(lab);
      const tile = tileRectsMap.get(rr.vnum);
      if (tile && rr.vnum !== e.from.vnum && rr.vnum !== e.to.vnum) avoid.push(tile);
    }

    const ax = a.x + ux * insetStart, ay = a.y + uy * insetStart;
    const bx = b.x - ux * insetEnd,   by = b.y - uy * insetEnd;

    const segmentsStraight = lineMinusRects(ax, ay, bx, by, avoid, 6);
    const lastStraight = segmentsStraight[segmentsStraight.length - 1] ?? [ax, ay, bx, by];

    // Curve decision (same rules)
    const declared = DIR_VEC[e.dir];
    const dot = declared.ux * ux + declared.uy * uy;
    const EPS = 1e-6;
    const geomAxisAligned = Math.abs(dx) < EPS || Math.abs(dy) < EPS;
    const declaredDiagonal = Math.abs(declared.ux) > 0 && Math.abs(declared.uy) > 0;
    const declaredCardinal = !declaredDiagonal;
    const SHOULD_CURVE =
      (declaredDiagonal && geomAxisAligned) ||
      (declaredCardinal && !geomAxisAligned) ||
      dot < 0.3;

    let segments = segmentsStraight;
    let arrowTipX = lastStraight[2], arrowTipY = lastStraight[3];
    let arrowUX = ux, arrowUY = uy;
    const strokeColor = SHOULD_CURVE ? pickCurveColor(e.from.vnum, e.to.vnum, idx) : STRAIGHT_COLOR;

    if (SHOULD_CURVE) {
      const exitVec = DIR_VEC[e.dir];
      const enterVec = DIR_VEC[reverseDir(e.dir)];

      const startPort = edgePortForDir(a.x, a.y, e.dir, +8);
      const endOuter  = edgePortForDir(b.x, b.y, reverseDir(e.dir), +10);
      const endPort   = { x: endOuter.x - enterVec.ux * HEAD_CLEAR, y: endOuter.y - enterVec.uy * HEAD_CLEAR };

      const LEAD_OUT = 65;
      const LEAD_IN  = 35;

      const leadStart = { x: startPort.x + exitVec.ux * LEAD_OUT, y: startPort.y + exitVec.uy * LEAD_OUT };
      const leadEnd   = { x: endPort.x   - enterVec.ux * LEAD_IN, y: endPort.y   - enterVec.uy * LEAD_IN };

      // Control point with robust side choice (SVG y is down)
      const chordX = leadEnd.x - leadStart.x, chordY = leadEnd.y - leadStart.y;
      const L = Math.hypot(chordX, chordY) || 1;
      const ccUx = chordX / L, ccUy = chordY / L;
      const pxn = -ccUy, pyn = ccUx;

      const midx = (leadStart.x + leadEnd.x) / 2;
      const midy = (leadStart.y + leadEnd.y) / 2;

      const cross = exitVec.ux * chordY - exitVec.uy * chordX;
      let side: number;
      if (Math.abs(cross) > 1e-3) side = cross < 0 ? 1 : -1; // invert vs math coords
      else {
        // fallback: bias away from center of cluster (approx avg)
        let sx = 0, sy = 0;
        rooms.forEach(r => { const p = mapper.map(r.coords.cx, r.coords.cy); sx += p.x; sy += p.y; });
        sx /= rooms.length; sy = sy / rooms.length + topBand;
        const toCenX = sx - midx, toCenY = sy - midy;
        side = pxn * toCenX + pyn * toCenY > 0 ? 1 : -1;
      }

      const MIN_BULGE = 40;
      const bulge = Math.max(MIN_BULGE, Math.min(240, 0.55 * L));
      const ctrl = { x: midx + pxn * bulge * side, y: midy + pyn * bulge * side };

      const segs: Array<[number, number, number, number]> = [];
      for (const s of lineMinusRects(startPort.x, startPort.y, leadStart.x, leadStart.y, avoid, 6)) segs.push(s);

      const tiny = chopQuadToSegments([leadStart.x, leadStart.y], [ctrl.x, ctrl.y], [leadEnd.x, leadEnd.y], 10);
      for (const [x1, y1, x2, y2] of tiny) {
        for (const p of lineMinusRects(x1, y1, x2, y2, avoid, 6)) segs.push(p);
      }

      for (const s of lineMinusRects(leadEnd.x, leadEnd.y, endPort.x, endPort.y, avoid, 6)) segs.push(s);

      segments = segs;
      arrowTipX = endPort.x; arrowTipY = endPort.y;
      arrowUX = enterVec.ux; arrowUY = enterVec.uy;
    }

    // Forward segments
    for (const [x1, y1, x2, y2] of segments) {
      edgeMarkup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeColor}" stroke-opacity="0.95" stroke-width="2" stroke-linecap="round"/>`;
    }
    // Arrowhead
    edgeMarkup += `<path d="${arrowHeadPath(arrowTipX, arrowTipY, arrowUX, arrowUY)}" fill="${strokeColor}"/>`;

    // Door glyph at midpoint of straight chord (use original ax/bx with HEAD_CLEAR applied)
    if (e.door) {
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      if ((e.door as any).type === "simple") {
        const g = doorGlyphSimplePath(mx, my, ux, uy);
        edgeMarkup += g.under + g.over;
      } else if ((e.door as any).type === "locked") {
        edgeMarkup += doorGlyphLockedPath(mx, my);
      }
    }

    // Implied dotted reverse
    const rev = reverseDir(e.dir);
    const targetHasReverse = !!e.to.exits?.[rev] && e.to.exits[rev]?.to === e.from.vnum;
    if (!e.oneWay && !targetHasReverse) {
      const revSegs = lineMinusRects(
        b.x - ux * (k + margin),
        by + uy * (insetEnd - (k + margin)),
        a.x + ux * insetEnd,
        a.y + uy * insetEnd,
        avoid,
        6
      );
      for (const [x1, y1, x2, y2] of revSegs) {
        edgeMarkup += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeColor}" stroke-opacity="0.65" stroke-width="2" stroke-dasharray="6 6" stroke-linecap="round"/>`;
      }
    }
  });

  // Tiles + labels
  let tileMarkup = "";
  const primaryVnum = doc.meta.catalog?.areas?.[areaId]?.primaryVnum;
  for (const r of rooms) {
    const { x, y } = pos.get(r.vnum)!;
    const isPrimary = !!primaryVnum && r.vnum === primaryVnum;
    const sector: TerrainKind = (r.sector as TerrainKind) ?? TerrainKind.Unknown;
    const fill = (TERRAIN_FILL[sector] ?? "#555") + "E6";
    const lines = wrapLabel(r.label || r.vnum);
    const firstY = y - ((lines.length - 1) * LABEL_LINE_STEP) / 2;
    tileMarkup += `
      <polygon points="${octPoints(x, y, TILE)}"
        fill="${fill}"
        stroke="${isPrimary ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.22)"}"
        stroke-width="${isPrimary ? 2 : 1}" />`;
    lines.forEach((ln, i) => {
      const ty = firstY + i * LABEL_LINE_STEP;
      tileMarkup += `
        <text x="${x}" y="${ty}" text-anchor="middle"
          font-size="${LABEL_FONT_SIZE}" font-weight="600"
          fill="white" stroke="black" stroke-width="3" paint-order="stroke"
          font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">${escapeText(ln)}</text>`;
    });
  }

  // Legend
  let legendMarkup = "";
  if (includeLegend && legendDims) {
    const L = legendDims;
    const legendPadH = L.padH, legendPadV = L.padV;
    legendMarkup += `<g transform="translate(${legendX},${legendY})">
      <rect x="0" y="0" width="${L.width}" height="${L.height}" rx="10" ry="10"
        fill="rgba(20,20,24,0.92)" stroke="rgba(255,255,255,0.12)"/>
      <text x="${legendPadH}" y="${legendPadV + 14}" fill="#ddd" font-size="12" font-weight="600"
        font-family="ui-sans-serif,system-ui">Terrain</text>`;
    for (let c = 0; c < L.cols; c++) {
      for (let r = 0; r < L.rows; r++) {
        const idx = c * L.rows + r;
        if (idx >= TERRAIN_ORDER.length) break;
        const t = TERRAIN_ORDER[idx];
        const sw = TERRAIN_FILL[t] + "E6";
        const x = legendPadH + c * L.colW;
        const y = legendPadV + L.hdrH + r * L.rowH;
        legendMarkup += `
          <circle cx="${x + 6}" cy="${y + 6}" r="6"
            fill="${sw}" stroke="rgba(255,255,255,0.22)"/>
          <text x="${x + 18}" y="${y + 10}" fill="#ddd" font-size="12"
            font-family="ui-sans-serif,system-ui">${escapeText(t)}</text>`;
      }
    }
    legendMarkup += `</g>`;
  }

  const title = (doc.meta.catalog?.areas?.[areaId]?.name || areaId) + ` — Floor ${level}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bg}"/>
  <text x="${Math.round(width/2)}" y="24" fill="#d8d8d8" text-anchor="middle"
        font-family="ui-sans-serif,system-ui" font-size="14">${escapeText(title)}</text>
  <g>${edgeMarkup}</g>
  <g>${tileMarkup}</g>
  ${legendMarkup}
  <title>${escapeText(title)}</title>
</svg>`;
}

/**
 * Multi-floor export: Floor 0, then +1, +2…, then −1, −2…,
 * each rendered via the single-floor renderer (legend only on top).
 */
export function renderAreaSVGStacked(
  doc: MapDocV1,
  areaId: string,
  opts: RenderOpts = {}
): string {
  const byVz = new Map<number, Room[]>();
  for (const r of Object.values(doc.rooms)) {
    if (r.category?.areaId !== areaId) continue;
    const vz = r.coords?.vz ?? 0;
    (byVz.get(vz) ?? byVz.set(vz, []).get(vz)!).push(r);
  }
  if (byVz.size === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#0f0f10"/><text x="16" y="28" fill="#ddd" font-family="ui-sans-serif,system-ui" font-size="14">No rooms to render.</text></svg>`;
  }

  const floors = Array.from(byVz.keys());
  const floorsUp   = floors.filter(v => v > 0).sort((a,b)=>a-b);
  const floorsZero = floors.includes(0) ? [0] : [];
  const floorsDown = floors.filter(v => v < 0).sort((a,b)=>b-a);
  const ordered = [...floorsZero, ...floorsUp, ...floorsDown];

  const parts: { svg: string; w: number; h: number }[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const vz = ordered[i];
    const includeLegend = i === 0 && (opts.includeLegend ?? true);
    const svg = renderAreaSVG(doc, areaId, vz, { ...opts, includeLegend });
    const mW = svg.match(/width="(\d+)"/);
    const mH = svg.match(/height="(\d+)"/);
    const w = mW ? parseInt(mW[1], 10) : 800;
    const h = mH ? parseInt(mH[1], 10) : 600;
    const inner = svg.replace(/^.*?<svg[^>]*>/s, "").replace(/<\/svg>\s*$/s, "");
    parts.push({ svg: `<g>${inner}</g>`, w, h });
  }

  const width = Math.max(...parts.map(p => p.w));
  const gapY = 48;
  const totalH = parts.reduce((s,p)=>s+p.h, 0) + gapY * (parts.length - 1);

  let y = 0;
  let content = "";
  for (const p of parts) {
    const dx = Math.round((width - p.w)/2);
    content += `<g transform="translate(${dx},${y})">${p.svg}</g>`;
    y += p.h + gapY;
  }

  const bg = opts.background ?? "#0f0f10";
  const areaName = doc.meta.catalog?.areas?.[areaId]?.name || areaId;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalH}" viewBox="0 0 ${width} ${totalH}">
  <rect width="100%" height="100%" fill="${bg}"/>
  ${content}
  <title>${escapeText(areaName)} — all floors</title>
</svg>`;
}

/* ---------------- Utils ---------------- */
function escapeText(s: string): string {
  return (s ?? "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
