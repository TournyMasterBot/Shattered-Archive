/** Test-only builders for map files. Not exported from the package and excluded from the build (tsconfig `exclude`). */

import type { Area, Direction, Link, MapFile, Room, Subzone } from '../schema.js';

/** A seeded random source so ids are repeatable. */
export function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function counter(prefix = 'l'): () => string {
  let i = 0;
  return () => {
    i += 1;
    return `${prefix}${String(i).padStart(4, '0')}`;
  };
}

export function room(id: string, title: string, extra: Partial<Room> = {}): Room {
  return { id, title, exits: {}, sources: [{ kind: 'walked' }], ...extra };
}

export function link(id: string, from: string, dir: Direction, to: string | null, extra: Partial<Link> = {}): Link {
  return {
    id,
    from,
    dir,
    to,
    state: to === null ? 'unknown-target' : 'candidate',
    confidence: to === null ? 0 : 0.6,
    offPage: false,
    traversals: to === null ? 0 : 1,
    reverse: false,
    ...extra,
  };
}

export function subzone(id: string, rooms: Room[], kind: Subzone['kind'] = 'consistent'): Subzone {
  return { id, name: `Subzone ${id}`, kind, rooms };
}

export function area(id: string, subzones: Subzone[], placement: Area['placement'] = null): Area {
  return { id, name: `Area ${id}`, placement, subzones };
}

/**
 * Two areas on one continent.
 *   town (placed at 0,0): r1 Market Square (0,0)  r2 Mill Road (1,0)  r3 Old Well (0,1)  r4 Gate (1,1)  r5 Cellar (0,1,z=-1)
 *   forest (not placed):  r6 Mill Road (0,0)  (the same title as r2, a different place)
 * Links: r1 E -> r2 and r2 W -> r1 (confirmed), r1 S -> r3, r2 S -> r4 (candidates), r3 D -> r5, r4 E -> r6 (off the town page),
 * r1 N declared and not followed (unknown-target).
 */
export function sampleMap(): MapFile {
  const links = [
    link('l-r1-e', 'r1', 'E', 'r2', { state: 'confirmed', confidence: 0.95, reverse: true, traversals: 2 }),
    link('l-r2-w', 'r2', 'W', 'r1', { state: 'confirmed', confidence: 0.95, reverse: true, traversals: 1 }),
    link('l-r1-s', 'r1', 'S', 'r3'),
    link('l-r2-s', 'r2', 'S', 'r4'),
    link('l-r3-d', 'r3', 'D', 'r5'),
    link('l-r4-e', 'r4', 'E', 'r6', { offPage: true }),
    link('l-r1-n', 'r1', 'N', null),
  ];
  const slot = (id: string): Partial<Record<Direction, string>> => {
    const exits: Partial<Record<Direction, string>> = {};
    for (const l of links) if (l.from === id) exits[l.dir] = l.id;
    return exits;
  };
  return {
    version: 1,
    generatedAt: '2026-11-07',
    continents: [
      {
        id: 'c1',
        name: 'Test Continent',
        areas: [
          area(
            'town',
            [
              subzone('town-main', [
                room('r1', 'Market Square', {
                  sector: 'city',
                  coords: { x: 0, y: 0, z: 0 },
                  exits: slot('r1'),
                  vnum: 1001,
                }),
                room('r2', 'Mill Road', { sector: 'city', coords: { x: 1, y: 0, z: 0 }, exits: slot('r2') }),
                room('r3', 'Old Well', { sector: 'inside', coords: { x: 0, y: 1, z: 0 }, exits: slot('r3') }),
                room('r4', 'Gate', { sector: 'city', coords: { x: 1, y: 1, z: 0 }, exits: slot('r4') }),
                room('r5', 'Cellar', { sector: 'underground', coords: { x: 0, y: 1, z: -1 }, exits: slot('r5') }),
              ]),
            ],
            { x: 0, y: 0, w: 2, h: 1 },
          ),
          area('forest', [
            subzone('forest-main', [
              room('r6', 'Mill Road', { sector: 'forest', coords: { x: 0, y: 0, z: 0 }, exits: slot('r6') }),
            ]),
          ]),
        ],
      },
    ],
    links,
  };
}
