// src/render/ascii.ts
import { MapDocV1, Room, Direction, ExitDef } from "../types";
import { dirToGrid } from "./dir";

/**
 * ASCII export for a single area + vertical level on the flat-top octagon grid.
 * - Rooms plotted on a widened interleaved grid (labels get 3 chars).
 * - Connectors are drawn along the full path between room centers (multi-segment),
 *   using the same deltas as the renderer/editor.
 * - Labels are written last so they don't get overwritten.
 */
export function toAsciiArea(doc: MapDocV1, areaId: string, level: number): string {
  const rooms: Room[] = Object.values(doc.rooms).filter(
    (r) => r.category?.areaId === areaId && (r.coords?.vz ?? 0) === level
  );
  if (rooms.length === 0) return "";

  // ----- choose center: area primary if present, else centroid -----
  const primaryVnum = doc.meta.catalog?.areas?.[areaId]?.primaryVnum;
  let cx0 = 0,
    cy0 = 0;
  if (primaryVnum && doc.rooms[primaryVnum]) {
    cx0 = doc.rooms[primaryVnum].coords.cx;
    cy0 = doc.rooms[primaryVnum].coords.cy;
  } else {
    cx0 = Math.round(rooms.reduce((s, r) => s + r.coords.cx, 0) / rooms.length);
    cy0 = Math.round(rooms.reduce((s, r) => s + r.coords.cy, 0) / rooms.length);
  }

  // ----- ASCII grid pitch -----
  // Wider pitch so each room has a 3-char slot and connector cells between rooms.
  const ROOM_W = 4; // horizontal pitch (cells between room centers)
  const ROOM_H = 2; // vertical pitch (cells between room centers)
  const HALF_W = ROOM_W / 2; // 2
  const HALF_H = ROOM_H / 2; // 1

  // sparse canvas then compact-render
  const cells = new Map<string, string>();
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  const setChar = (x: number, y: number, ch: string, overwrite = false) => {
    const key = `${x},${y}`;
    if (!overwrite && cells.has(key)) return;
    cells.set(key, ch);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  const charFor = (dx: number, dy: number): string => {
    // dx,dy ∈ {-1,0,1}
    if (dx === 0 && (dy === -1 || dy === 1)) return "|";
    if (dy === 0 && (dx === -1 || dx === 1)) return "-";
    if ((dx === 1 && dy === -1) || (dx === -1 && dy === 1)) return "/";
    if ((dx === 1 && dy === 1) || (dx === -1 && dy === -1)) return "\\";
    return "."; // fallback
  };

  // Compute room ASCII center positions (gx,gy)
  const roomPos = new Map<string, { gx: number; gy: number }>();
  for (const r of rooms) {
    const lx = r.coords.cx - cx0;
    const ly = r.coords.cy - cy0;
    const gx = lx * ROOM_W;
    const gy = ly * ROOM_H;
    roomPos.set(r.vnum, { gx, gy });
  }

  // Draw connectors along the full path (not just one midpoint)
  for (const r of rooms) {
    const src = roomPos.get(r.vnum)!;
    for (const [dir, ex] of Object.entries(r.exits) as [Direction, ExitDef][]) {
      if (!ex?.to) continue;

      const dst = roomPos.get(ex.to);
      if (!dst) continue;

      // Determine step direction in ASCII space based on dir
      const [ux, uy] = dirToGrid(dir); // unit step in editor grid
      if (ux === 0 && uy === 0) continue;

      const stepX = ux * HALF_W; // 2 for E/W, 0 for N/S, etc.
      const stepY = uy * HALF_H; // 1 for N/S, 0 for E/W, etc.

      // Number of half-steps between centers (skip endpoints to avoid writing on labels)
      const totalHalfSteps = Math.max(
        Math.abs((dst.gx - src.gx) / HALF_W),
        Math.abs((dst.gy - src.gy) / HALF_H)
      );

      const glyph = charFor(Math.sign(ux), Math.sign(uy));
      for (let k = 1; k < totalHalfSteps; k++) {
        const x = src.gx + stepX * k;
        const y = src.gy + stepY * k;
        setChar(x, y, glyph, true); // allow connectors to overlap other connectors
      }
    }
  }

  // Labels last so they never get wiped by a connector
  for (const r of rooms) {
    const { gx, gy } = roomPos.get(r.vnum)!;
    const s = (r.label || r.vnum).toString().slice(0, 3).padEnd(3, " ");
    setChar(gx - 1, gy, s[0], true);
    setChar(gx + 0, gy, s[1], true);
    setChar(gx + 1, gy, s[2], true);
  }

  if (minX === Infinity) return "";

  // small padding
  minX -= 1;
  maxX += 1;

  const W = maxX - minX + 1;
  const H = maxY - minY + 1;
  const grid: string[][] = Array.from({ length: H }, () =>
    Array.from({ length: W }, () => " ")
  );

  for (const [key, ch] of cells) {
    const [xs, ys] = key.split(",");
    const x = Number(xs) - minX;
    const y = Number(ys) - minY;
    if (y >= 0 && y < H && x >= 0 && x < W) grid[y][x] = ch;
  }

  const lines = grid.map((row) => row.join("").replace(/\s+$/g, ""));
  const title =
    (doc.meta.catalog?.areas?.[areaId]?.name || areaId) + ` (vz=${level})`;
  return [title, "", ...lines].join("\n");
}
