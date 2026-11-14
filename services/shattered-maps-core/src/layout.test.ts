import { layoutUnplaced } from './layout.js';
import type { Coords, Direction, Link, MapFile, Room } from './schema.js';
import { validateMapFile } from './validate.js';

interface Spec {
  id: string;
  exits?: Partial<Record<Direction, string>>;
  coords?: Coords;
  aliasOf?: string;
}

function mk(specs: Spec[]): MapFile {
  const links: Link[] = [];
  const rooms: Room[] = specs.map((s) => {
    const exits: Partial<Record<Direction, string>> = {};
    for (const [dir, to] of Object.entries(s.exits ?? {}) as [Direction, string][]) {
      const id = `l-${s.id}-${dir.toLowerCase()}`;
      exits[dir] = id;
      links.push({ id, from: s.id, dir, to, state: 'candidate', confidence: 0.6, offPage: false, traversals: 1, reverse: false });
    }
    const room: Room = { id: s.id, title: `Room ${s.id}`, exits, sources: [] };
    if (s.coords) room.coords = s.coords;
    if (s.aliasOf) room.aliasOf = s.aliasOf;
    return room;
  });
  return { version: 1, continents: [{ id: 'c1', name: 'C', areas: [{ id: 'a1', name: 'A', placement: null, subzones: [{ id: 's1', name: 'S', kind: 'consistent', rooms }] }] }], links };
}

const coordsOf = (map: MapFile): Record<string, Coords | undefined> => Object.fromEntries(map.continents[0].areas[0].subzones[0].rooms.map((r) => [r.id, r.coords]));

describe('layoutUnplaced', () => {
  it('follows exits on the renderer\'s grid: north is up, east is right, U and D change the floor', () => {
    const { map, placed, groups } = layoutUnplaced(mk([{ id: 'a', exits: { N: 'b', E: 'c', U: 'd', SW: 'e' } }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }]));
    expect(coordsOf(map)).toEqual({
      // the leftmost column of a group is column 0, so the whole picture is shifted one to the right
      a: { x: 1, y: 0, z: 0 },
      b: { x: 1, y: -1, z: 0 },
      c: { x: 2, y: 0, z: 0 },
      d: { x: 1, y: 0, z: 1 },
      e: { x: 0, y: 1, z: 0 },
    });
    expect(placed).toBe(5);
    expect(groups).toBe(1);
    expect(validateMapFile(map).ok).toBe(true);
  });

  it('places a room that only has an exit INTO the placed rooms, on the opposite side', () => {
    // b leads east into a: b is west of a. (a is first in the list, so it is the group start.)
    const { map } = layoutUnplaced(mk([{ id: 'a' }, { id: 'b', exits: { E: 'a' } }]));
    expect(coordsOf(map)).toEqual({ a: { x: 1, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 } });
  });

  it('a diagonal and a floor change leave room for both', () => {
    const { map } = layoutUnplaced(mk([{ id: 'a', exits: { D: 'b', NW: 'c' } }, { id: 'b' }, { id: 'c' }]));
    expect(coordsOf(map)).toMatchObject({ a: { x: 1, y: 0, z: 0 }, b: { x: 1, y: 0, z: -1 }, c: { x: 0, y: -1, z: 0 } });
  });

  it('a cell that is taken sends the room to the nearest free cell; the link is unchanged', () => {
    // a's east and (through b) b's west both lead to the same cell
    const { map } = layoutUnplaced(mk([{ id: 'a', exits: { E: 'b', S: 'c' } }, { id: 'b' }, { id: 'c', exits: { NE: 'd' } }, { id: 'd' }]));
    const c = coordsOf(map);
    const cells = new Set(Object.values(c).map((p) => `${p?.x},${p?.y},${p?.z}`));
    expect(cells.size).toBe(4);
    expect(c.a).toEqual({ x: 0, y: 0, z: 0 });
    expect(c.b).toEqual({ x: 1, y: 0, z: 0 });
    expect(map.links.map((l) => l.to)).toEqual(['b', 'c', 'd']);
  });

  it('rooms no exit connects form groups, each laid out apart and to the right of the one before', () => {
    const { map, groups } = layoutUnplaced(mk([{ id: 'a', exits: { E: 'b' } }, { id: 'b' }, { id: 'x', exits: { W: 'y' } }, { id: 'y' }, { id: 'z' }]));
    const c = coordsOf(map);
    expect(groups).toBe(3);
    expect(c.a).toEqual({ x: 0, y: 0, z: 0 });
    expect(c.b).toEqual({ x: 1, y: 0, z: 0 });
    // x leads west to y, so the group spans two columns: it starts after a gap
    expect((c.y as Coords).x).toBe(4);
    expect((c.x as Coords).x).toBe(5);
    expect((c.z as Coords).x).toBeGreaterThan((c.x as Coords).x + 1);
    const all = Object.values(c) as Coords[];
    expect(new Set(all.map((p) => `${p.x},${p.y},${p.z}`)).size).toBe(all.length);
  });

  it('never moves a room that has a position, hangs the rest off it, and starts new groups right of it', () => {
    const { map, placed, groups } = layoutUnplaced(mk([{ id: 'a', coords: { x: 10, y: 5, z: 2 }, exits: { E: 'b' } }, { id: 'b' }, { id: 'lone' }]));
    const c = coordsOf(map);
    expect(c.a).toEqual({ x: 10, y: 5, z: 2 });
    expect(c.b).toEqual({ x: 11, y: 5, z: 2 });
    expect((c.lone as Coords).x).toBe(14);
    expect(placed).toBe(2);
    expect(groups).toBe(1);
  });

  it('a placed room with no z is on floor 0, and a room already placed that an exit points at is left where it is', () => {
    const { map } = layoutUnplaced(mk([{ id: 'a', coords: { x: 0, y: 0 }, exits: { U: 'b', E: 'c' } }, { id: 'b' }, { id: 'c', coords: { x: 7, y: 7, z: 0 } }]));
    expect(coordsOf(map).b).toEqual({ x: 0, y: 0, z: 1 });
    expect(coordsOf(map).c).toEqual({ x: 7, y: 7, z: 0 });
  });

  it('searches past occupied cells for the nearest free one', () => {
    const { map } = layoutUnplaced(
      mk([
        { id: 'a', coords: { x: 0, y: 0, z: 0 }, exits: { E: 'b' } },
        { id: 'p1', coords: { x: 1, y: 0, z: 0 } },
        { id: 'p2', coords: { x: 0, y: -1, z: 0 } },
        { id: 'p3', coords: { x: 1, y: -1, z: 0 } },
        { id: 'b' },
      ]),
    );
    expect(coordsOf(map).b).toEqual({ x: 2, y: -1, z: 0 });
  });

  it('a room with an exit into a placed room that has no floor number goes on floor 0', () => {
    const { map } = layoutUnplaced(mk([{ id: 'a', coords: { x: 5, y: 5 } }, { id: 'b', exits: { E: 'a' } }]));
    expect(coordsOf(map).b).toEqual({ x: 4, y: 5, z: 0 });
  });

  it('ignores merged-away rooms and exits that lead nowhere', () => {
    const base = mk([{ id: 'a', exits: { N: 'gone', E: 'b' } }, { id: 'b' }, { id: 'gone', aliasOf: 'b' }]);
    base.links.find((l) => l.id === 'l-a-n')!.to = 'missing';
    const { map, placed } = layoutUnplaced(base);
    expect(placed).toBe(2);
    expect(coordsOf(map).gone).toBeUndefined();
    base.links.find((l) => l.id === 'l-a-e')!.to = null;
    base.links.find((l) => l.id === 'l-a-e')!.state = 'unknown-target';
    expect(layoutUnplaced(base).groups).toBe(2);
  });

  it('does not change its input and is deterministic', () => {
    const input = mk([{ id: 'a', exits: { N: 'b', S: 'c' } }, { id: 'b', exits: { S: 'c' } }, { id: 'c' }]);
    const before = JSON.stringify(input);
    const first = layoutUnplaced(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify(layoutUnplaced(input).map)).toBe(JSON.stringify(first.map));
  });

  it('a map with no rooms has nothing to place', () => {
    expect(layoutUnplaced({ version: 1, continents: [], links: [] })).toEqual({ map: { version: 1, continents: [], links: [] }, placed: 0, groups: 0 });
  });
});
