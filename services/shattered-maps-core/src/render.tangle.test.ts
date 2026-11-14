import { sliceMap } from './hierarchy.js';
import { applyKinds, proposeKinds } from './kinds.js';
import { classifyLink, renderSvg } from './render.js';
import type { Link, MapFile, Room } from './schema.js';
import { area, link, room, subzone } from './testing/fixtures.js';

const at = (x: number, y: number, z = 0) => ({ x, y, z });
const none: ReadonlySet<string> = new Set();

describe('classifyLink: does the link make a clean join?', () => {
  it('a neighbour one cell the way the exit points is clean, in every compass direction', () => {
    const o = at(5, 5);
    const cases: [Parameters<typeof classifyLink>[0], number, number][] = [
      ['N', 5, 4], ['S', 5, 6], ['E', 6, 5], ['W', 4, 5], ['NE', 6, 4], ['SE', 6, 6], ['SW', 4, 6], ['NW', 4, 4],
    ];
    for (const [dir, x, y] of cases) expect(classifyLink(dir, o, at(x, y), none)).toBe('clean');
  });

  it('a straight run of several empty cells is clean, and one cell of slack sideways is allowed', () => {
    expect(classifyLink('E', at(0, 0), at(5, 0), none)).toBe('clean');
    expect(classifyLink('E', at(0, 0), at(3, 1), none)).toBe('clean');
    expect(classifyLink('NE', at(0, 0), at(3, -2), none)).toBe('clean');
  });

  it('up and down are never judged by the grid', () => {
    expect(classifyLink('U', at(0, 0), at(9, 9, 1), none)).toBe('clean');
    expect(classifyLink('D', at(0, 0), at(0, 0, -1), none)).toBe('clean');
  });

  it('a room in the way makes it a twist, wherever along the line it stands', () => {
    expect(classifyLink('E', at(0, 0), at(4, 0), new Set(['2,0']))).toBe('twist');
    expect(classifyLink('E', at(0, 0), at(4, 0), new Set(['0,0', '4,0']))).toBe('clean'); // only the rooms between count
  });

  it('the wrong side or more than a cell sideways is a twist when near and a teleport when it lands four or more cells away', () => {
    expect(classifyLink('N', at(5, 5), at(5, 6), none)).toBe('twist');
    expect(classifyLink('E', at(5, 5), at(5, 7), none)).toBe('twist');
    expect(classifyLink('N', at(5, 5), at(5, 11), none)).toBe('teleport');
    expect(classifyLink('E', at(0, 0), at(-6, 0), none)).toBe('teleport');
    expect(classifyLink('NE', at(0, 0), at(5, 0), none)).toBe('teleport');
    expect(classifyLink('NE', at(0, 0), at(1, -4), none)).toBe('teleport');
  });
});

function mapWith(rooms: Room[], links: Link[], kind: 'consistent' | 'maze' | 'teleport' | 'loop' = 'consistent'): MapFile {
  const withExits = rooms.map((r) => ({ ...r, exits: Object.fromEntries(links.filter((l) => l.from === r.id).map((l) => [l.dir, l.id])) }));
  return { version: 1, continents: [{ id: 'c', name: 'C', areas: [area('a', [subzone('s', withExits, kind)])] }], links };
}
const draw = (map: MapFile, view: Partial<Parameters<typeof renderSvg>[1]> = {}) => renderSvg(sliceMap(map, 'area', 'a') as NonNullable<ReturnType<typeof sliceMap>>, { layout: 'grid', ...view });

describe('renderSvg: links that do not make a clean join', () => {
  const clean = mapWith(
    [room('r1', 'West', { coords: at(0, 0) }), room('r2', 'East', { coords: at(1, 0) })],
    [link('l1', 'r1', 'E', 'r2', { state: 'confirmed' }), link('l2', 'r2', 'W', 'r1', { state: 'confirmed' })],
  );

  it('draws a clean join as the one full line it always was, with no tangle marks', () => {
    const svg = draw(clean);
    expect(svg.match(/<line data-link=/g)).toHaveLength(2);
    expect(svg).not.toContain('data-tangled');
    expect(svg).not.toContain('data-tangles');
    expect(svg).not.toContain('data-kind');
  });

  const twisted = mapWith(
    [room('r1', 'Hall', { coords: at(0, 0) }), room('r2', 'Cellar', { coords: at(0, 1) }), room('r3', 'Far Hall', { coords: at(9, 0) })],
    [link('l1', 'r1', 'N', 'r2'), link('l2', 'r1', 'E', 'r3'), link('l3', 'r3', 'W', 'r1')],
  );

  it('draws a twist as a small round chip on the edge of the room, and names where it leads', () => {
    const svg = draw(twisted);
    // N from (0,0) lands one cell SOUTH: a twist. E to (9,0) is straight on and far but clean; the hourglass needs a wrong line:
    expect(svg).toContain('data-link="l1" data-state="candidate" data-tangled="twist" data-tangled-from="r1" data-tangled-to="r2" data-jump-to="r2"');
    expect(svg).toContain('<title>This exit does not lead straight on: Cellar</title>');
    expect(svg).toContain('data-tangles="1"');
    expect(svg).not.toMatch(/<line data-link="l1"/);
    expect(svg).toMatch(/<circle cx="[^"]*" cy="[^"]*" r="5.5" fill="#8e44ad"/);
  });

  it('a far landing off the line gets the small square chip and the words for it', () => {
    const teleport = mapWith(
      [room('r1', 'Portal', { coords: at(0, 0) }), room('r2', 'Elsewhere', { coords: at(0, 9) })],
      [link('l1', 'r1', 'N', 'r2')],
    );
    const svg = draw(teleport);
    expect(svg).toContain('data-tangled="teleport" data-tangled-from="r1" data-tangled-to="r2"');
    expect(svg).toContain('<title>This exit lands far away: Elsewhere</title>');
    expect(svg).toMatch(/<rect x="[^"]*" y="[^"]*" width="11" height="11" rx="2" fill="#d35400"/);
  });

  it('draws the rooms that have a tangled exit as coloured octagons, and says so on the tile', () => {
    const svg = draw(twisted);
    expect(svg).toMatch(/<polygon data-room="r1" points="[^"]*" data-kind="tangled" fill="#e9dcf5" stroke="#8e44ad"/);
    expect(svg).toMatch(/<polygon data-room="r2" points="[^"]*" fill="#dde1e6"/); // the untangled neighbour keeps its octagon
    // the game has eight compass directions: an octagon has 8 corners, never the 6 of a hexagon
    const hexPoints = /data-room="r1" points="([^"]*)"/.exec(svg)?.[1]?.trim().split(/\s+/);
    expect(hexPoints).toHaveLength(8);
  });

  it('draws the special rooms as octagons too when a saved setting still names the old hexagon layout', () => {
    const svg = draw(twisted, { layout: 'hex' as unknown as 'grid' });
    const points = /data-room="r1" points="([^"]*)"/.exec(svg)?.[1]?.trim().split(/\s+/);
    expect(points).toHaveLength(8);
    expect(svg).toMatch(/data-room="r1"[^>]*data-kind="tangled"/);
  });

  it('a link to a target that is not on the drawn floor keeps its old look, and a link with no target too', () => {
    const map = mapWith(
      [room('r1', 'Hall', { coords: at(0, 0) }), room('r2', 'Upstairs', { coords: at(0, 0, 1) })],
      [link('l1', 'r1', 'E', 'r2'), link('l2', 'r1', 'S', null)],
    );
    const svg = draw(map, { z: 0 });
    expect(svg).not.toContain('data-tangled');
    expect(svg).toContain('stroke-dasharray="3 3"');
  });

  it('a room whose tangled link points at a room without a title still draws the stub (the tooltip has no name)', () => {
    const map = mapWith([room('r1', 'Hall', { coords: at(0, 0) }), room('r2', '', { coords: at(0, 1) })], [link('l1', 'r1', 'N', 'r2')]);
    expect(draw(map)).toContain('<title>This exit does not lead straight on</title>');
  });
});

describe('renderSvg: the kind of a subzone', () => {
  const rooms = [room('r1', 'A', { coords: at(0, 0) }), room('r2', 'B', { coords: at(1, 0) })];
  const links = [link('l1', 'r1', 'E', 'r2'), link('l2', 'r2', 'W', 'r1')];

  it('draws the rooms of a maze, a loop and a teleport run as coloured octagons, the teleport ones smaller', () => {
    const maze = draw(mapWith(rooms, links, 'maze'));
    expect(maze).toMatch(/data-room="r1" points="[^"]*" data-kind="maze" fill="#f2dfb0" stroke="#b9770e"/);
    expect(draw(mapWith(rooms, links, 'loop'))).toMatch(/data-kind="loop" fill="#cfe3f5" stroke="#2874a6"/);
    const teleport = draw(mapWith(rooms, links, 'teleport'));
    expect(teleport).toMatch(/data-kind="teleport" fill="#e6d5f2" stroke="#8e44ad"/);
    const span = (svg: string): number => {
      const xs = [...(/data-room="r1" points="([^"]*)"/.exec(svg)?.[1] ?? '').matchAll(/(-?[\d.]+),/g)].map((m) => Number(m[1]));
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(span(teleport)).toBeLessThan(span(maze));
  });

  it('a consistent subzone keeps its octagons and the slice carries no kind for it', () => {
    const map = mapWith(rooms, links, 'consistent');
    expect(sliceMap(map, 'area', 'a')?.rooms.every((r) => r.kind === undefined)).toBe(true);
    expect(draw(map)).not.toContain('data-kind');
  });

  it('the slice at every level carries the kind of the subzone a room is in', () => {
    const map = mapWith(rooms, links, 'maze');
    for (const [level, id] of [['area', 'a'], ['subzone', 's'], ['room', 'r1']] as const)
      expect(sliceMap(map, level, id)?.rooms.every((r) => r.kind === 'maze')).toBe(true);
  });
});

describe('proposeKinds and applyKinds', () => {
  // a 6 x 6 block of rooms whose east exits all land two rows down: a maze by the exits' own account
  function block(kind: 'consistent' | 'maze' = 'consistent', straight = false): MapFile {
    const rooms: Room[] = [];
    const links: Link[] = [];
    for (let y = 0; y < 6; y += 1)
      for (let x = 0; x < 6; x += 1) rooms.push(room(`r${x}-${y}`, 'Hall', { coords: at(x, y) }));
    let n = 0;
    for (const r of rooms) {
      const { x, y } = r.coords as { x: number; y: number };
      const targetY = straight ? y : (y + 2) % 6;
      if (x < 5) links.push(link(`l${(n += 1)}`, r.id, 'E', `r${x + 1}-${targetY}`));
    }
    return mapWith(rooms, links, kind);
  }

  it('proposes a subzone whose exits mostly do not lead straight on, with the counts, and never one that is in order', () => {
    const proposals = proposeKinds(block(), { minExits: 20 });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ areaId: 'a', subzoneId: 's', kind: 'maze', exits: 30 });
    expect(proposals[0]?.share).toBeGreaterThan(0.9);
    expect(proposeKinds(block('consistent', true), { minExits: 20 })).toEqual([]);
  });

  it('leaves out small subzones, shares under the limit, subzones already marked, and counts a floor change on a level exit as twisted', () => {
    expect(proposeKinds(block())).toHaveLength(1); // 30 exits is exactly the default minimum
    expect(proposeKinds(block(), { minExits: 31 })).toEqual([]);
    expect(proposeKinds(block(), { minExits: 20, minShare: 1.01 })).toEqual([]);
    expect(proposeKinds(block('maze'), { minExits: 20 })).toEqual([]);
    const climb = mapWith([room('a', 'A', { coords: at(0, 0, 0) }), room('b', 'B', { coords: at(1, 0, 1) })], [link('l1', 'a', 'E', 'b')]);
    expect(proposeKinds(climb, { minExits: 1, minShare: 1 })).toHaveLength(1);
  });

  it('skips exits with no target, rooms with no coordinates and aliases, and orders the worst first', () => {
    const map = block();
    const sz = map.continents[0]!.areas[0]!.subzones[0]!;
    sz.rooms.push(room('nocoords', 'X'), room('alias', 'Y', { coords: at(9, 9), aliasOf: 'r0-0' }));
    map.links.push(link('lx', 'r0-0', 'S', null), link('ly', 'nocoords', 'S', 'r0-0'));
    expect(proposeKinds(map, { minExits: 20 })[0]?.exits).toBe(30);
    const second = block();
    const rooms = (ids: [string, number, number][]) => ids.map(([id, x, y]) => room(id, id, { coords: at(x, y) }));
    second.continents.push({
      id: 'c2',
      name: 'C2',
      areas: [
        area('b', [
          subzone('t', rooms([['p', 0, 0], ['q', 0, 9]])), // one exit, all twisted: ties s on share, loses on exits
          subzone('u', rooms([['u1', 0, 0], ['u2', 1, 0], ['u3', 0, 9]])), // two exits, one twisted: 50%
        ]),
      ],
    });
    second.links.push(link('lz', 'p', 'N', 'q'), link('lw', 'u1', 'E', 'u2'), link('lv', 'u1', 'N', 'u3'));
    const [t0, u0] = second.continents[1]!.areas[0]!.subzones;
    t0!.rooms[0]!.exits = { N: 'lz' };
    u0!.rooms[0]!.exits = { E: 'lw', N: 'lv' };
    const order = proposeKinds(second, { minExits: 1, minShare: 0.3 });
    expect(order.map((p) => p.subzoneId)).toEqual(['s', 't', 'u']); // equal share: more exits first; then 50%
  });

  it('counts an exit up or down as straight on, ignores an exit that names no link or leads nowhere, and proposes nothing for a subzone with no exits', () => {
    const map = mapWith(
      [room('a', 'A', { coords: at(0, 0, 0) }), room('b', 'B', { coords: at(0, 0, 1) })],
      [link('lu', 'a', 'U', 'b'), link('ld', 'b', 'D', 'a'), link('lnull', 'a', 'S', null)],
    );
    map.continents[0]!.areas[0]!.subzones[0]!.rooms[1]!.exits = { D: 'ld' };
    const [first] = map.continents[0]!.areas[0]!.subzones[0]!.rooms;
    first!.exits = { U: 'lu', S: 'lnull', E: 'missing-link' };
    expect(proposeKinds(map, { minExits: 1, minShare: 0 })).toMatchObject([{ exits: 2, twisted: 0, share: 0 }]);
    // coordinates with no floor number count as floor 0
    const flat = mapWith([room('f1', 'F1', { coords: { x: 0, y: 0 } }), room('f2', 'F2', { coords: { x: 1, y: 0 } })], [link('lf', 'f1', 'E', 'f2')]);
    flat.continents[0]!.areas[0]!.subzones[0]!.rooms[0]!.exits = { E: 'lf' };
    expect(proposeKinds(flat, { minExits: 1, minShare: 0 })).toMatchObject([{ exits: 1, twisted: 0 }]);
    const empty = mapWith([room('x', 'X', { coords: at(0, 0) })], []);
    expect(proposeKinds(empty, { minExits: 0, minShare: 0.3 })).toEqual([]);
  });

  it('applies confirmed kinds without changing the input, reports what changed and what the map does not have', () => {
    const map = block();
    const before = JSON.stringify(map);
    const { map: next, changed, unknown } = applyKinds(map, { s: 'maze', nope: 'loop' });
    expect(JSON.stringify(map)).toBe(before);
    expect(next.continents[0]?.areas[0]?.subzones[0]?.kind).toBe('maze');
    expect(changed).toEqual(['s']);
    expect(unknown).toEqual(['nope']);
    const again = applyKinds(next, { s: 'maze' });
    expect(again.changed).toEqual([]);
    expect(again.unknown).toEqual([]);
    expect(applyKinds(map, {}).changed).toEqual([]);
  });
});
