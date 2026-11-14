/**
 * The neutral grid/hex export: a flat, tool-agnostic JSON of one slice, for drawing programs, the Builder import
 * preview and tests. No map-file internals (history, undo images, sources) leak into it, and the output is stable:
 * cells sort by floor, row, column, then id; exits follow the fixed direction order; the keys are written in a fixed
 * order, so the same slice always gives the same text.
 *
 * `grid`: a cell's `x`/`y` are the room's grid coordinates (y grows southward). `hex`: they are read as axial `q`/`r` of a
 * flat-top hex layout (N is straight up), which has no east or west exit: such exits are listed in `unsupportedExits`
 * instead of being bent into the layout.
 */

import { DIRECTIONS, type Direction, type LinkState } from './schema.js';
import type { MapSlice } from './hierarchy.js';

export type Layout = 'grid' | 'hex';

export interface NeutralExit {
  dir: Direction;
  to: string | null;
  state: LinkState;
  confidence: number;
  offPage: boolean;
}

export interface NeutralCell {
  id: string;
  title: string;
  sector: string | null;
  x: number;
  y: number;
  z: number;
  exits: NeutralExit[];
  /** Labels of what the room is expected to hold, in the order first seen. */
  fixtures: string[];
}

export interface NeutralExport {
  format: 'shattered-maps-neutral';
  version: 1;
  layout: Layout;
  level: string;
  id: string;
  title: string;
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } | null;
  cells: NeutralCell[];
  /** Rooms with no coordinates: in the slice, not drawable. */
  unplaced: string[];
  /** Hex only: exits whose direction the layout cannot show. */
  unsupportedExits: { room: string; dir: Direction }[];
  /** Continent level only: the areas with their written placements. */
  areas: {
    id: string;
    name: string;
    placement: { x: number; y: number; w?: number; h?: number } | null;
    rooms: number;
  }[];
}

const HEX_UNSUPPORTED: readonly Direction[] = ['E', 'W'];

export function exportNeutral(slice: MapSlice, layout: Layout): NeutralExport {
  const cells: NeutralCell[] = [];
  const unsupported: { room: string; dir: Direction }[] = [];
  for (const room of slice.rooms) {
    if (room.coords === undefined) continue;
    const exits: NeutralExit[] = [];
    for (const dir of DIRECTIONS) {
      const link = slice.links.find((l) => l.from === room.id && l.dir === dir);
      if (!link) continue;
      exits.push({ dir, to: link.to, state: link.state, confidence: link.confidence, offPage: link.offPage });
      if (layout === 'hex' && HEX_UNSUPPORTED.includes(dir)) unsupported.push({ room: room.id, dir });
    }
    cells.push({
      id: room.id,
      title: room.title,
      sector: room.sector ?? null,
      x: room.coords.x,
      y: room.coords.y,
      z: room.coords.z ?? 0,
      exits,
      fixtures: (room.baseline?.contents ?? []).filter((c) => c.status === 'fixture').map((c) => c.label),
    });
  }
  cells.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  unsupported.sort((a, b) => a.room.localeCompare(b.room) || DIRECTIONS.indexOf(a.dir) - DIRECTIONS.indexOf(b.dir));
  const bounds =
    cells.length === 0
      ? null
      : {
          minX: Math.min(...cells.map((c) => c.x)),
          maxX: Math.max(...cells.map((c) => c.x)),
          minY: Math.min(...cells.map((c) => c.y)),
          maxY: Math.max(...cells.map((c) => c.y)),
          minZ: Math.min(...cells.map((c) => c.z)),
          maxZ: Math.max(...cells.map((c) => c.z)),
        };
  return {
    format: 'shattered-maps-neutral',
    version: 1,
    layout,
    level: slice.level,
    id: slice.id,
    title: slice.title,
    bounds,
    cells,
    unplaced: [...slice.unplaced].sort(),
    unsupportedExits: unsupported,
    areas: [...slice.areas].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** The export as text: two-space JSON and a trailing newline. */
export function exportNeutralJson(slice: MapSlice, layout: Layout): string {
  return `${JSON.stringify(exportNeutral(slice, layout), null, 2)}\n`;
}
