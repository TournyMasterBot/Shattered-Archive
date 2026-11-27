import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { MapDocV1 } from '../types';
import { toAsciiArea } from './ascii';
import { renderAreaSVG, renderAreaSVGStacked } from './svgExport';

/**
 * Pins what the Mapper draws today for its own seed document (seed_data/mapdoc.json: 176 rooms), so the move into the monorepo and the
 * later rework cannot change it unnoticed. The hashes are of the exact text; if a deliberate change alters the drawing, update them in the
 * same commit and say why.
 */

const seed = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'seed_data', 'mapdoc.json'), 'utf8'),
) as MapDocV1;
const sha = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);
const count = (text: string, needle: string): number => text.split(needle).length - 1;

// the largest area's biggest floor (42 rooms): the SVG of that floor, its ASCII, and the stacked SVG of the whole area
const PINNED = { rooms: 42, svg: '6db54db089607101', ascii: '73a37955227337bc', stacked: '460d1dabb469dc7d' };

function areasWithFloors(): { areaId: string; floor: number; rooms: number }[] {
  const seen = new Map<string, number>();
  for (const r of Object.values(seed.rooms)) {
    const key = `${r.category?.areaId}|${r.coords?.vz ?? 0}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()]
    .map(([key, rooms]) => ({ areaId: key.split('|')[0], floor: Number(key.split('|')[1]), rooms }))
    .sort((a, b) => b.rooms - a.rooms || a.areaId.localeCompare(b.areaId) || a.floor - b.floor);
}

describe('the seed document', () => {
  it('has 176 rooms in 8 continents and many areas, and reads as a map document', () => {
    expect(Object.keys(seed.rooms)).toHaveLength(176);
    expect(Object.keys(seed.meta.catalog!.continents)).toHaveLength(8);
    expect(Object.keys(seed.meta.catalog!.areas).length).toBeGreaterThan(400);
    expect(seed.meta.directions).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'U', 'D']);
  });

  it('draws every one of its rooms: one tile per room across all areas and floors', () => {
    const floors = areasWithFloors();
    let tiles = 0;
    for (const { areaId, floor, rooms } of floors) {
      const svg = renderAreaSVG(seed, areaId, floor);
      expect({ areaId, floor, tiles: count(svg, '<polygon') }).toEqual({ areaId, floor, tiles: rooms });
      tiles += rooms;
    }
    expect(tiles).toBe(176);
  });

  it('draws every area stacked, with a title for the whole', () => {
    const areaIds = [...new Set(Object.values(seed.rooms).map((r) => r.category?.areaId as string))];
    for (const areaId of areaIds) {
      const svg = renderAreaSVGStacked(seed, areaId);
      const rooms = Object.values(seed.rooms).filter((r) => r.category?.areaId === areaId).length;
      expect(count(svg, '<polygon')).toBe(rooms);
      expect(svg).toContain('all floors');
    }
  });

  it('gives the same text for the largest area and floor as it always has', () => {
    const [largest] = areasWithFloors();
    const svg = renderAreaSVG(seed, largest.areaId, largest.floor);
    const ascii = toAsciiArea(seed, largest.areaId, largest.floor);
    const stacked = renderAreaSVGStacked(seed, largest.areaId);
    expect({ rooms: largest.rooms, svg: sha(svg), ascii: sha(ascii), stacked: sha(stacked) }).toEqual(PINNED);
  });
});
