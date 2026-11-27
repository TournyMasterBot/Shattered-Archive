import type { Direction, ExitDef, MapDocV1, Room } from '../types';

/** Builders for the Mapper's tests. The rooms are invented. Test helper: excluded from the type-check of the app (tsconfig `exclude`). */

export const DIRECTIONS: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'U', 'D'];

export function exit(to: string | null, extra: Partial<ExitDef> = {}): ExitDef {
  return { to, oneWay: false, door: null, status: 'unknown' as ExitDef['status'], ...extra };
}

export function room(
  vnum: string,
  cx: number,
  cy: number,
  vz: number,
  exits: Partial<Record<Direction, ExitDef>>,
  label?: string,
  sector?: string,
  areaId = 'a1',
): Room {
  const r: Room = {
    vnum,
    coords: { cx, cy, vz },
    exits,
    category: { worldId: 'w', continentId: 'c', areaId },
  };
  if (label !== undefined) r.label = label;
  if (sector !== undefined) r.sector = sector as Room['sector'];
  return r;
}

export function doc(rooms: Room[], areaName = 'Test Area'): MapDocV1 {
  return {
    meta: {
      directions: DIRECTIONS,
      catalog: {
        worlds: { w: { id: 'w', name: 'W' } },
        continents: { c: { id: 'c', name: 'C', worldId: 'w' } },
        areas: { a1: { id: 'a1', name: areaName, worldId: 'w', continentId: 'c' } },
      },
    },
    rooms: Object.fromEntries(rooms.map((r) => [r.vnum, r])),
  };
}

/**
 * Four rooms: A (0,0), B (1,0), C (0,1) on floor 0 and D above A on floor 1.
 *   A east to B, A south to C, A up to D; B west to A and south (a door) to C; C north to A and northeast to B; D down to A.
 */
export function sampleDoc(
  areaName = 'Test Area',
  labels: [string, string, string, string] = ['Alpha', 'Beta', 'Gamma', 'Up'],
): MapDocV1 {
  return doc(
    [
      room('A', 0, 0, 0, { E: exit('B'), S: exit('C'), U: exit('D') }, labels[0], 'city'),
      room('B', 1, 0, 0, { W: exit('A'), S: exit('C', { door: { type: 'simple' } }) }, labels[1], 'forest'),
      room('C', 0, 1, 0, { N: exit('A'), NE: exit('B') }, labels[2]),
      room('D', 0, 0, 1, { D: exit('A') }, labels[3]),
    ],
    areaName,
  );
}
