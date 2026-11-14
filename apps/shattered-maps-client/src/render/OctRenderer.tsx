/* eslint-disable @typescript-eslint/no-explicit-any -- moved as-is from the DslMapper repository; typed with the neutral map model in the rework phase */
// src/render/OctRenderer.tsx
import React from "react";
import { Room, Direction, ExitDef, TerrainKind } from "../types";
import { dirUnit, reverseDir } from "./dir";
import { TERRAIN_FILL } from "./terrainPalette";

type Props = {
  rooms: Room[];
  level: number;
  focusVnum?: string | null;
  primaryVnum?: string | null;
  centerCx?: number;
  centerCy?: number;
  /** 'container' = fill parent; 'content' = SVG wraps content tightly (scrolls in parent) */
  fit?: "container" | "content";
};

const TILE = 40;
const GAP = 4;
// Extra gap before the arrowhead so it doesn't tuck under the tile.
const HEAD_CLEAR = 10;

/* ---------------- helpers for two coordinate systems ---------------- */
// 8-way unit vectors for declared exits (not computed from geometry)
const DIR_VEC: Record<Direction, { ux: number; uy: number }> = {
  N: { ux: 0, uy: -1 },
  NE: { ux: Math.SQRT1_2, uy: -Math.SQRT1_2 },
  E: { ux: 1, uy: 0 },
  SE: { ux: Math.SQRT1_2, uy: Math.SQRT1_2 },
  S: { ux: 0, uy: 1 },
  SW: { ux: -Math.SQRT1_2, uy: Math.SQRT1_2 },
  W: { ux: -1, uy: 0 },
  NW: { ux: -Math.SQRT1_2, uy: -Math.SQRT1_2 },
  U: { ux: 0, uy: 0 }, // not used here
  D: { ux: 0, uy: 0 }, // not used here
};

// Return a point on the octagon edge for a given direction, with a small push out/in.
function edgePortForDir(cx: number, cy: number, dir: Direction, push: number) {
  const r = TILE / 2;
  const k = 0.4142 * r; // same k used in Oct()
  // Edge midpoints for octagon aligned to 8 directions
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
  // push>0 goes outward from the tile, push<0 goes inward
  const px = baseX + dv.ux * push;
  const py = baseY + dv.uy * push;
  return { x: px, y: py };
}

function gridToPx_centered(
  cx: number,
  cy: number,
  center: { cx: number; cy: number },
  w: number,
  h: number
) {
  const dx = cx - center.cx;
  const dy = cy - center.cy;
  const pitchX = TILE + GAP;
  const pitchY = TILE + GAP;
  const x = Math.round(w / 2 + dx * pitchX);
  const y = Math.round(h / 2 + dy * pitchY);
  return { x, y };
}

/** Tight content layout: compute mapping that places min grid at padding and sizes SVG to bounds. */
function makeContentMapper(rooms: Room[], pad = 96) {
  if (rooms.length === 0) {
    return {
      map: (_cx: number, _cy: number) => ({
        x: pad + TILE / 2,
        y: pad + TILE / 2,
      }),
      width: pad * 2 + TILE,
      height: pad * 2 + TILE,
    };
  }

  let minCx = Infinity,
    maxCx = -Infinity,
    minCy = Infinity,
    maxCy = -Infinity;
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

  const width = Math.max(320, Math.round(contentW + pad * 2));
  const height = Math.max(240, Math.round(contentH + pad * 2));

  const map = (cx: number, cy: number) => ({
    x: pad + (cx - minCx) * pitchX + TILE / 2,
    y: pad + (cy - minCy) * pitchY + TILE / 2,
  });

  return { map, width, height };
}

/* ---------------- tiny helpers for the curve special-case ---------------- */
function roomsCentroidPx(
  rooms: Room[],
  map: (cx: number, cy: number) => { x: number; y: number }
) {
  if (!rooms.length) return { x: 0, y: 0 };
  let sx = 0,
    sy = 0;
  for (const r of rooms) {
    const p = map(r.coords.cx, r.coords.cy);
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / rooms.length, y: sy / rooms.length };
}

function quadPoint(
  t: number,
  p0: [number, number],
  p1: [number, number],
  p2: [number, number]
): [number, number] {
  const mt = 1 - t;
  const a = mt * mt,
    b = 2 * mt * t,
    c = t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]];
}

function chopQuadToSegments(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  stepPx = 10
): Array<[number, number, number, number]> {
  const dx = p2[0] - p0[0],
    dy = p2[1] - p0[1];
  const L = Math.hypot(dx, dy);
  const N = Math.max(6, Math.min(80, Math.ceil(L / stepPx)));
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) pts.push(quadPoint(i / N, p0, p1, p2));
  const out: Array<[number, number, number, number]> = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    out.push([x1, y1, x2, y2]);
  }
  return out;
}

/* ---------------- octagon + label ---------------- */
function Oct({
  x,
  y,
  size,
  label,
  isPrimary,
  sectorFill,
}: {
  x: number;
  y: number;
  size: number;
  label: string;
  isPrimary: boolean;
  sectorFill: string;
}) {
  const r = size / 2;
  const k = 0.4142 * r;
  const pts = [
    [x - k, y - r],
    [x + k, y - r],
    [x + r, y - k],
    [x + r, y + k],
    [x + k, y + r],
    [x - k, y + r],
    [x - r, y + k],
    [x - r, y - k],
  ]
    .map((p) => p.join(","))
    .join(" ");

  const wrapLabel = (text: string, maxChars = 14, maxLines = 3) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > maxChars && cur) {
        lines.push(cur.trim());
        cur = w;
      } else {
        cur += " " + w;
      }
    }
    if (cur) lines.push(cur.trim());
    return lines.slice(0, maxLines);
  };
  const lines = wrapLabel(label);

  return (
    <>
      <polygon
        points={pts}
        fill={`${sectorFill}E6`}
        stroke={isPrimary ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.22)"}
        strokeWidth={isPrimary ? 2 : 1}
      />
      {lines.map((ln, i) => (
        <text
          key={i}
          x={x}
          y={y - ((lines.length - 1) * 14) / 2 + i * 14}
          textAnchor="middle"
          fontSize="12"
          fill="white"
          stroke="black"
          strokeWidth={3}
          paintOrder="stroke"
          style={{ dominantBaseline: "middle", fontWeight: 600 }}
        >
          {ln}
        </text>
      ))}
    </>
  );
}

/* ---------------- door glyphs ---------------- */
function DoorGlyph({
  x,
  y,
  ux,
  uy,
  kind,
}: {
  x: number;
  y: number;
  ux: number;
  uy: number;
  kind: "simple" | "locked";
}) {
  const px = -uy,
    py = ux;

  if (kind === "simple") {
    const half = 6;
    const x1 = x - px * half,
      y1 = y - py * half;
    const x2 = x + px * half,
      y2 = y + py * half;
    return (
      <>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="rgba(0,0,0,0.9)"
          strokeWidth={5}
          strokeLinecap="round"
        />
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#fff"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </>
    );
  }

  // locked: small padlock
  const bodyR = 5;
  const shackleR = 4;
  const shX = x,
    shY = y - bodyR - 2;

  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={bodyR + 1.5}
        fill="none"
        stroke="rgba(0,0,0,0.9)"
        strokeWidth={3}
      />
      <circle
        cx={x}
        cy={y}
        r={bodyR}
        fill="none"
        stroke="#fff"
        strokeWidth={2}
      />
      <path
        d={`M ${shX - shackleR},${shY} a ${shackleR},${shackleR} 0 0 1 ${
          2 * shackleR
        },0`}
        fill="none"
        stroke="rgba(0,0,0,0.9)"
        strokeWidth={3}
      />
      <path
        d={`M ${shX - shackleR},${shY} a ${shackleR},${shackleR} 0 0 1 ${
          2 * shackleR
        },0`}
        fill="none"
        stroke="#fff"
        strokeWidth={2}
      />
    </g>
  );
}

/* ---------------- arrowhead ---------------- */
function ArrowHead({
  x,
  y,
  ux,
  uy,
  color = "rgba(255,255,255,0.9)",
}: {
  x: number;
  y: number;
  ux: number;
  uy: number;
  color?: string;
}) {
  const size = 8;
  const px = -uy,
    py = ux;
  const tipX = x,
    tipY = y;
  const leftX = x - ux * size - px * (size * 0.5);
  const leftY = y - uy * size - py * (size * 0.5);
  const rightX = x - ux * size + px * (size * 0.5);
  const rightY = y - uy * size + py * (size * 0.5);
  return (
    <polygon
      points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`}
      fill={color}
    />
  );
}

/* ---------------- label/tile rects for path-avoid ---------------- */
const LABEL_LINE_STEP = 14;
const CHAR_W = 7;
const LABEL_PAD_X = 8;
const LABEL_PAD_Y = 4;

type Rect = { x: number; y: number; w: number; h: number };

function wrapLabel(s: string, maxChars = 14, maxLines = 3): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur += " " + w;
    }
  }
  if (cur) lines.push(cur.trim());
  return lines.slice(0, maxLines);
}

function buildLabelRects(
  rooms: Room[],
  map: (cx: number, cy: number) => { x: number; y: number }
): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  for (const r of rooms) {
    const { x, y } = map(r.coords.cx, r.coords.cy);
    const lines = wrapLabel(r.label || r.vnum);
    const maxChars = Math.max(1, ...lines.map((ln) => ln.length));
    const textW = maxChars * CHAR_W;
    const textH = lines.length * LABEL_LINE_STEP;
    const firstY = y - ((lines.length - 1) * LABEL_LINE_STEP) / 2;
    const boxX = x - textW / 2 - LABEL_PAD_X;
    const boxY = firstY - 12 - LABEL_PAD_Y; // 12px font-size baseline
    const w = textW + LABEL_PAD_X * 2;
    const h = textH + LABEL_PAD_Y * 2;
    rects.set(r.vnum, { x: boxX, y: boxY, w, h });
  }
  return rects;
}

// approximate each tile (octagon) as an axis-aligned square obstacle.
const TILE_PAD = 6; // tweak: how far lines should stay away from tile fill
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
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: Rect
): [number, number] | null {
  let t0 = 0,
    t1 = 1;
  const dx = x2 - x1,
    dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    const pi = p[i],
      qi = q[i];
    if (pi === 0) {
      if (qi < 0) return null;
    } else {
      const t = qi / pi;
      if (pi < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return [t0, t1];
}

function lineMinusRects(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rects: Rect[],
  gapPx = 8
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
  if (cuts.length === 0) return [[x1, y1, x2, y2]];
  cuts.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const c of cuts) {
    if (!merged.length || c[0] > merged[merged.length - 1][1]) {
      merged.push([...c]);
    } else {
      merged[merged.length - 1][1] = Math.max(
        merged[merged.length - 1][1],
        c[1]
      );
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
  if (prev < 1)
    out.push([x1 + (x2 - x1) * prev, y1 + (y2 - y1) * prev, x2, y2]);
  return out;
}

/* ---------------- colors ---------------- */
// Single neutral color for straight edges.
const STRAIGHT_COLOR = "rgba(255,255,255,0.95)";

// Bright accent palette for curved edges so they pop.
const CURVE_PALETTE = [
  "#35A7FF", // vivid blue
  "#FF6F91", // pink
  "#FFC75F", // amber
  "#C34A36", // brick
  "#7DFFB3", // aqua-green
  "#B967FF", // violet
];

// quick djb2 hash
function hstr(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}
function pickCurveColor(from: string, to: string, i: number) {
  const base = hstr(`curve:${from}->${to}`) + i * 97;
  return CURVE_PALETTE[base % CURVE_PALETTE.length];
}

/* ---------------- main ---------------- */
export default function OctRenderer({
  rooms,
  level,
  primaryVnum,
  centerCx,
  centerCy,
  fit = "container",
}: Props) {
  const ref = React.useRef<SVGSVGElement | null>(null);
  const [size, setSize] = React.useState({ w: 800, h: 600 });

  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([entry]) => {
      const cr = entry.contentRect;
      setSize({ w: cr.width, h: cr.height });
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  // choose mapping
  const contentMapper = React.useMemo(
    () => (fit === "content" ? makeContentMapper(rooms, 120) : null),
    [rooms, fit]
  );

  const map = React.useCallback(
    (cx: number, cy: number) => {
      if (contentMapper) return contentMapper.map(cx, cy);
      // centered mode
      const center = (() => {
        if (typeof centerCx === "number" && typeof centerCy === "number")
          return { cx: centerCx, cy: centerCy };
        // prefer primary
        if (primaryVnum) {
          const pr = rooms.find((r) => r.vnum === primaryVnum);
          if (pr) return { cx: pr.coords.cx, cy: pr.coords.cy };
        }
        return { cx: 0, cy: 0 };
      })();
      return gridToPx_centered(cx, cy, center, size.w, size.h);
    },
    [contentMapper, centerCx, centerCy, primaryVnum, rooms, size]
  );

  // centroid used by the curve special-case
  const clusterCenter = React.useMemo(
    () => roomsCentroidPx(rooms, map),
    [rooms, map]
  );

  // edges list (skip U/D)
  type Edge = {
    from: Room;
    to: Room;
    dir: Direction;
    oneWay: boolean;
    door: ExitDef["door"];
  };

  React.useEffect(() => {
    console.log("Rooms array:", rooms);
    console.log("Current level:", level);
  }, [rooms, level]);

  const edges: Edge[] = React.useMemo(() => {
    const out: Edge[] = [];
    const byVnum = new Map<string, Room>();
    for (const r of rooms) byVnum.set(r.vnum, r);
    for (const r of rooms) {
      for (const [dir, ex] of Object.entries(r.exits) as [
        Direction,
        ExitDef
      ][]) {
        if (!ex?.to) continue;
        if (dir === "U" || dir === "D") continue;
        const tgt = byVnum.get(ex.to);
        if (!tgt) continue;
        if ((tgt.coords.vz ?? 0) !== level || (r.coords.vz ?? 0) !== level) {
          console.log(
            `Excluding edge from ${r.vnum} to ${ex.to} due to level mismatch.`
          );
          continue;
        }
        out.push({
          from: r,
          to: tgt,
          dir,
          oneWay: !!ex.oneWay,
          door: ex.door ?? null,
        });
      }
    }
    return out;
  }, [rooms, level]);

  const labelRects = React.useMemo(
    () => buildLabelRects(rooms, map),
    [rooms, map]
  );
  const tileRectsAll = React.useMemo(
    () => buildTileRects(rooms, map),
    [rooms, map]
  );

  // determine SVG size
  const svgWidth = contentMapper ? contentMapper.width : "100%";
  const svgHeight = contentMapper ? contentMapper.height : "100%";

  return (
    <svg
      ref={ref}
      width={svgWidth}
      height={svgHeight}
      style={{ display: "block", background: "#0f0f10" }}
    >
      {/* edges */}
      {edges.map((e, i) => {
        const a = map(e.from.coords.cx, e.from.coords.cy);
        const b = map(e.to.coords.cx, e.to.coords.cy);
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const { ux, uy } = dirUnit(dx, dy);

        // push line off octagon; leave extra clearance before the arrowhead
        const r = TILE / 2;
        const k = 0.4142 * r;
        const margin = 4;
        const insetStart = k + margin;
        const insetEnd = k + margin + HEAD_CLEAR;

        const ax = a.x + ux * insetStart,
          ay = a.y + uy * insetStart;
        const bx = b.x - ux * insetEnd,
          by = b.y - uy * insetEnd;

        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;

        // Build avoid list = labels + tiles (excluding endpoints so the edge can attach)
        const avoid: Rect[] = [];
        rooms.forEach((rr) => {
          const lab = labelRects.get(rr.vnum);
          if (lab) avoid.push(lab);
          const tile = tileRectsAll.get(rr.vnum);
          if (tile && rr.vnum !== e.from.vnum && rr.vnum !== e.to.vnum)
            avoid.push(tile);
        });

        const segmentsStraight = lineMinusRects(ax, ay, bx, by, avoid, 6);
        const rev = reverseDir(e.dir);
        const targetHasReverse =
          !!e.to.exits?.[rev] && e.to.exits[rev]?.to === e.from.vnum;

        const lastStraight = segmentsStraight[segmentsStraight.length - 1] || [
          ax,
          ay,
          bx,
          by,
        ];

        // ----- SPECIAL CASE: curve only when declared direction mismatches geometry -----
        const declared = DIR_VEC[e.dir];
        const dot = declared.ux * ux + declared.uy * uy; // 1=aligned, -1=opposite

        // classify geometry vs declaration
        const EPS = 1e-6;
        const geomAxisAligned = Math.abs(dx) < EPS || Math.abs(dy) < EPS; // pure N/S or E/W
        const declaredDiagonal =
          Math.abs(declared.ux) > 0 && Math.abs(declared.uy) > 0;
        const declaredCardinal = !declaredDiagonal;

        // Force curves for diagonal<->cardinal mismatches; else fallback to angle threshold
        const SHOULD_CURVE =
          (declaredDiagonal && geomAxisAligned) ||
          (declaredCardinal && !geomAxisAligned) ||
          dot < 0.3;

        let segments = segmentsStraight;
        let arrowTip: { x: number; y: number };
        let arrowDir: { ux: number; uy: number };
        const strokeColor = SHOULD_CURVE
          ? pickCurveColor(e.from.vnum, e.to.vnum, i)
          : STRAIGHT_COLOR;

        if (!SHOULD_CURVE) {
          // Happy path (unchanged)
          const [lx1, ly1, lx2, ly2] = lastStraight;
          const { ux: lux, uy: luy } = dirUnit(lx2 - lx1, ly2 - ly1);
          arrowTip = { x: lx2, y: ly2 };
          arrowDir = { ux: lux, uy: luy };
        } else {
          // Curve leaves/arrives on the declared faces with short straight leaders
          const exitVec = DIR_VEC[e.dir];
          const enterVec = DIR_VEC[reverseDir(e.dir)];

          const startPort = edgePortForDir(a.x, a.y, e.dir, +8);
          const endOuter = edgePortForDir(b.x, b.y, reverseDir(e.dir), +10);
          const endPort = {
            x: endOuter.x - enterVec.ux * HEAD_CLEAR,
            y: endOuter.y - enterVec.uy * HEAD_CLEAR,
          };

          // leaders
          const LEAD_OUT = 65; // px
          const LEAD_IN = 35; // px

          const leadStart = {
            x: startPort.x + exitVec.ux * LEAD_OUT,
            y: startPort.y + exitVec.uy * LEAD_OUT,
          };
          const leadEnd = {
            x: endPort.x - enterVec.ux * LEAD_IN,
            y: endPort.y - enterVec.uy * LEAD_IN,
          };

          // control point: perpendicular bulge with robust side choice
          const chordX = leadEnd.x - leadStart.x;
          const chordY = leadEnd.y - leadStart.y;
          const L = Math.hypot(chordX, chordY) || 1;
          const ccUx = chordX / L,
            ccUy = chordY / L;
          const pxn = -ccUy,
            pyn = ccUx;

          const midx = (leadStart.x + leadEnd.x) / 2;
          const midy = (leadStart.y + leadEnd.y) / 2;

          // Decide bend side. SVG Y increases downward, so invert the usual cross sign.
          const cross = exitVec.ux * chordY - exitVec.uy * chordX;
          let side: number;
          if (Math.abs(cross) > 1e-3) {
            side = cross < 0 ? 1 : -1; // inverted sign vs math coords
          } else {
            const toCenX = clusterCenter.x - midx;
            const toCenY = clusterCenter.y - midy;
            side = pxn * toCenX + pyn * toCenY > 0 ? 1 : -1;
          }

          const MIN_BULGE = 40;
          const bulge = Math.max(MIN_BULGE, Math.min(240, 0.55 * L));
          const ctrl = {
            x: midx + pxn * bulge * side,
            y: midy + pyn * bulge * side,
          };

          const segs: Array<[number, number, number, number]> = [];

          // start straight
          for (const s of lineMinusRects(
            startPort.x,
            startPort.y,
            leadStart.x,
            leadStart.y,
            avoid,
            6
          ))
            segs.push(s);

          // curved middle (chopped to tiny segments, each clipped against obstacles)
          const tiny = chopQuadToSegments(
            [leadStart.x, leadStart.y],
            [ctrl.x, ctrl.y],
            [leadEnd.x, leadEnd.y],
            10
          );
          for (const [x1, y1, x2, y2] of tiny) {
            for (const p of lineMinusRects(x1, y1, x2, y2, avoid, 6))
              segs.push(p);
          }

          // final straight into the face
          for (const s of lineMinusRects(
            leadEnd.x,
            leadEnd.y,
            endPort.x,
            endPort.y,
            avoid,
            6
          ))
            segs.push(s);

          segments = segs;

          // Arrow sits at the endPort, pointing exactly along the declared entering vector
          arrowTip = { x: endPort.x, y: endPort.y };
          arrowDir = { ux: enterVec.ux, uy: enterVec.uy };
        }

        return (
          <g key={i} pointerEvents="none">
            {/* forward segments */}
            {segments.map(([x1, y1, x2, y2], si) => (
              <line
                key={si}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={strokeColor}
                strokeOpacity={0.95}
                strokeWidth={2}
                strokeLinecap="round"
              />
            ))}

            {/* doors (midpoint of straight chord) */}
            {e.door && (e.door as any).type === "simple" && (
              <DoorGlyph x={mx} y={my} ux={ux} uy={uy} kind="simple" />
            )}
            {e.door && (e.door as any).type === "locked" && (
              <DoorGlyph x={mx} y={my} ux={ux} uy={uy} kind="locked" />
            )}

            {/* arrowhead colored to match the edge */}
            <ArrowHead
              x={arrowTip.x}
              y={arrowTip.y}
              ux={arrowDir.ux}
              uy={arrowDir.uy}
              color={strokeColor}
            />

            {/* implied dotted reverse remains straight and lighter */}
            {!e.oneWay &&
              !targetHasReverse &&
              lineMinusRects(
                b.x - ux * (k + margin),
                by + uy * (insetEnd - (k + margin)),
                a.x + ux * insetEnd,
                a.y + uy * insetEnd,
                []
              ).map(([x1, y1, x2, y2], si) => (
                <line
                  key={`rev-${si}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={strokeColor}
                  strokeOpacity={0.65}
                  strokeWidth={2}
                  strokeDasharray="6 6"
                  strokeLinecap="round"
                />
              ))}
          </g>
        );
      })}

      {/* tiles */}
      {rooms.map((r) => {
        const { x, y } = map(r.coords.cx, r.coords.cy);
        const sector: TerrainKind = r.sector ?? TerrainKind.Unknown;
        const sectorFill = TERRAIN_FILL[sector];
        const isPrimary = !!primaryVnum && r.vnum === primaryVnum;
        return (
          <g key={r.vnum}>
            <Oct
              x={x}
              y={y}
              size={TILE}
              label={r.label || r.vnum}
              isPrimary={isPrimary}
              sectorFill={sectorFill}
            />
          </g>
        );
      })}
    </svg>
  );
}
