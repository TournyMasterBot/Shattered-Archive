import type { ContentRecord, Link, MapFile, Room, RoomBaseline } from '@shatteredarchive/shattered-maps-core';

/** Builders for the neutral-model tests. The places are invented. Test helper: excluded from the type-check of the app (tsconfig `exclude`). */

export const DAY = '2026-11-01';

export function content(label: string, status: ContentRecord['status'], seen: number, observed: number, count = 1): ContentRecord {
  return {
    label,
    kind: 'mob',
    status,
    seen,
    observed,
    count,
    days: [DAY],
    firstSeen: DAY,
    lastSeen: DAY,
    missed: 0,
    returns: 0,
  };
}

export function baseline(): RoomBaseline {
  return {
    visits: 6,
    days: ['2026-11-01', '2026-11-03'],
    contents: [content('a tired guard', 'fixture', 6, 6, 2), content('a wandering bard', 'transient', 1, 6)],
    was: [
      {
        label: 'a lost cat',
        kind: 'mob',
        seen: 4,
        observed: 8,
        count: 1,
        firstSeen: DAY,
        lastSeen: DAY,
        demotedOn: '2026-11-03',
        returns: 0,
      },
    ],
  };
}

export function nroom(id: string, title: string, x: number, y: number, extra: Partial<Room> = {}): Room {
  return { id, title, exits: {}, coords: { x, y, z: 0 }, sources: [{ kind: 'azah', ref: id, credit: 'Test Author', date: '2026-10-01' }], ...extra };
}

export function nlink(id: string, from: string, dir: Link['dir'], to: string | null, extra: Partial<Link> = {}): Link {
  return {
    id,
    from,
    dir,
    to,
    state: to === null ? 'unknown-target' : 'candidate',
    confidence: to === null ? 0 : 0.6,
    offPage: false,
    traversals: 0,
    reverse: false,
    ...extra,
  };
}

/**
 * Continent "Greenmarch" with two areas. "North Farm" has subzone "Fields" (rooms Gate, Barn, Well; Gate has a baseline, and a merged-away
 * alias) and subzone "Cellar" (one room); "Harbor" has one subzone "Quay" (one room, on floor 1).
 *   links: Gate E to Barn (confirmed, walked back) and Barn W to Gate; Gate N unknown; Well E to Quay (off the page);
 *   Barn S to Well in conflict with Cellar.
 */
export function candidatesMap(): MapFile {
  const links: Link[] = [
    nlink('l1', 'r-gate', 'E', 'r-barn', { state: 'confirmed', confidence: 0.95, reverse: true, traversals: 3 }),
    nlink('l2', 'r-barn', 'W', 'r-gate', { state: 'confirmed', confidence: 0.95, reverse: true, traversals: 2 }),
    nlink('l3', 'r-gate', 'N', null),
    nlink('l4', 'r-well', 'E', 'r-quay', { offPage: true }),
    nlink('l5', 'r-barn', 'S', 'r-well', { state: 'conflict', confidence: 0, conflictTo: ['r-cellar'] }),
  ];
  const gate = nroom('r-gate', 'The Gate', 0, 0, { sector: 'city', description: 'A tall gate.', baseline: baseline(), vnum: 100, exits: { E: 'l1', N: 'l3' } });
  const barn = nroom('r-barn', 'The Barn', 1, 0, { exits: { W: 'l2', S: 'l5' } });
  const well = nroom('r-well', 'The Well', 1, 1, { exits: { E: 'l4' } });
  const alias = nroom('r-old', 'The Old Gate', 0, 0, { aliasOf: 'r-gate' });
  const cellar = nroom('r-cellar', 'The Cellar', 0, 0);
  const quay = nroom('r-quay', 'The Quay', 0, 0, { coords: { x: 0, y: 0, z: 1 } });
  return {
    version: 1,
    generatedAt: '2026-11-07',
    continents: [
      {
        id: 'c-green',
        name: 'Greenmarch',
        areas: [
          {
            id: 'a-farm',
            name: 'North Farm',
            placement: { x: 0, y: 0, w: 2, h: 1 },
            subzones: [
              { id: 's-fields', name: 'Fields', kind: 'consistent', rooms: [gate, barn, well, alias] },
              { id: 's-cellar', name: 'Cellar', kind: 'maze', rooms: [cellar] },
            ],
          },
          { id: 'a-harbor', name: 'Harbor', placement: null, subzones: [{ id: 's-quay', name: 'Quay', kind: 'consistent', rooms: [quay] }] },
        ],
      },
    ],
    links,
  };
}
