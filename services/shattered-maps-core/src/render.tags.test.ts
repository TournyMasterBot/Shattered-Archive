import { buildIndex, sliceMap } from './hierarchy.js';
import { renderSvg } from './render.js';
import type { RenderView } from './render.js';
import type { Link, MapFile, Room } from './schema.js';
import { area, link, room, subzone } from './testing/fixtures.js';

const at = (x: number, y: number, z = 0) => ({ x, y, z });
type Kind = 'consistent' | 'maze' | 'teleport' | 'loop';

function mapWith(rooms: Room[], links: Link[], kind: Kind = 'consistent', other?: { rooms: Room[]; links: Link[] }): MapFile {
  const exitsOf = (r: Room, all: Link[]) => ({ ...r, exits: Object.fromEntries(all.filter((l) => l.from === r.id).map((l) => [l.dir, l.id])) });
  const everything = [...links, ...(other?.links ?? [])];
  const areas = [area('a', [subzone('s', rooms.map((r) => exitsOf(r, everything)), kind)])];
  if (other) areas.push(area('b', [subzone('s2', other.rooms.map((r) => exitsOf(r, everything)))]));
  return { version: 1, continents: [{ id: 'c', name: 'C', areas }], links: everything };
}
const draw = (map: MapFile, view: Partial<RenderView> = {}) => renderSvg(sliceMap(map, 'area', 'a') as NonNullable<ReturnType<typeof sliceMap>>, { layout: 'grid', ...view });

describe('the chip of a tangled exit', () => {
  // a hall with a north exit that lands one cell SOUTH (a twist), and an east exit that lands far away off the line (a teleport)
  const map = mapWith(
    [room('hall', 'Hall', { coords: at(0, 0) }), room('cell', 'Cell', { coords: at(0, 1) }), room('far', 'Far', { coords: at(0, 9) })],
    [link('ln', 'hall', 'N', 'cell'), link('le', 'hall', 'E', 'far')],
  );
  const svg = draw(map);

  it('is a small round chip for an exit that does not lead straight on and a small square one for an exit that lands far away, with no number', () => {
    expect(svg).toMatch(/data-tangled="twist"[^>]*><circle cx="[^"]*" cy="[^"]*" r="5.5" fill="#8e44ad"/);
    expect(svg).toMatch(/data-tangled="teleport"[^>]*><rect x="[^"]*" y="[^"]*" width="11" height="11" rx="2" fill="#d35400"/);
    expect(svg).not.toContain('data-tag');
    expect(svg).toContain('data-tangles="2"');
  });

  it('sits on the edge of the room on the side the exit points', () => {
    // the hall's tile is centred on (60, 60) with a 20 px radius: north is 23 px above the centre, east 23 px to the right
    expect(svg).toMatch(/data-link="ln"[^>]*><circle cx="60" cy="37" r="5.5"/);
    expect(svg).toMatch(/data-link="le"[^>]*><rect x="77.5" y="54.5"/);
  });

  it('names the room it leads to when hovered, carries where it is from and where it goes, and a click target for a jump', () => {
    expect(svg).toContain('<title>This exit does not lead straight on: Cell</title>');
    expect(svg).toContain('<title>This exit lands far away: Far</title>');
    expect(svg).toContain('data-tangled-from="hall" data-tangled-to="cell" data-jump-to="cell"');
    expect(svg).toMatch(/<circle cx="60" cy="37" r="9" fill="transparent"\/>/);
  });

  it('leaves the title out of the words when the target has none', () => {
    const bare = mapWith([room('a1', 'A', { coords: at(0, 0) }), room('a2', '', { coords: at(0, 1) })], [link('l1', 'a1', 'N', 'a2')]);
    expect(draw(bare)).toContain('<title>This exit does not lead straight on</title>');
  });

  it('a clean join gets no chip at all', () => {
    const out = draw(mapWith([room('a1', 'A', { coords: at(0, 0) }), room('a2', 'B', { coords: at(1, 0) })], [link('l1', 'a1', 'E', 'a2')]));
    expect(out).not.toContain('data-tangled');
  });
});

describe('staircases: up on the left, down on the right', () => {
  const map = mapWith(
    [room('mid', 'Landing', { coords: at(0, 0) }), room('top', 'Attic', { coords: at(0, 0, 1) }), room('low', 'Cellar', { coords: at(0, 0, -1) })],
    [link('lu', 'mid', 'U', 'top'), link('ld', 'mid', 'D', 'low')],
  );
  const svg = draw(map, { z: 0 });

  it('puts the up triangle left of the middle of the tile and the down triangle right of it, as if a rectangle in the tile were split down the middle', () => {
    // tile centre (60, 60)
    expect(svg).toMatch(/data-stairs="up" data-stairs-to="top"><circle cx="52" cy="60" r="8"[^>]*\/><polygon points="52,54 46.5,64 57.5,64"/);
    expect(svg).toMatch(/data-stairs="down" data-stairs-to="low"><circle cx="68" cy="60" r="8"[^>]*\/><polygon points="68,66 62.5,56 73.5,56"/);
  });

  it('says which room each goes to, and a stair with no known target has no link to follow', () => {
    expect(svg).toContain('<title>Up: Attic</title>');
    expect(svg).toContain('<title>Down: Cellar</title>');
    const lost = mapWith([room('r1', 'Landing', { coords: at(0, 0) })], [link('lu', 'r1', 'U', null)]);
    const out = draw(lost);
    expect(out).toContain('data-stairs="up"><circle');
    expect(out).toContain('<title>Up: leads somewhere nobody has followed</title>');
  });
});

describe('tracing where a room’s tangled exits end up', () => {
  const rooms: Room[] = [
    room('hall', 'Hall', { coords: at(2, 2) }),
    room('cell', 'Cell', { coords: at(2, 3) }),
    room('far', 'Far', { coords: at(2, 11) }),
    room('other', 'Other', { coords: at(5, 2) }),
    room('beyond', 'Beyond', { coords: at(5, 4) }),
  ];
  const links = [link('ln', 'hall', 'N', 'cell'), link('le', 'hall', 'E', 'far'), link('lo', 'other', 'N', 'beyond')];
  const map = mapWith(rooms, links);

  it('draws nothing but the chips until a room is chosen', () => {
    const out = draw(map);
    expect(out).not.toContain('data-layer="trace"');
    expect(out).not.toContain('data-trace');
  });

  it('draws one curved line with an arrowhead to the landing room for each tangled exit of the chosen room, and rings the room it lands in', () => {
    const out = draw(map, { trace: 'hall' });
    expect(out).toContain('data-trace="hall"');
    const layer = /<g data-layer="trace">(.*?)<\/g><g data-layer="labels">/s.exec(out)?.[1] ?? '';
    expect(layer.match(/data-trace-to="/g)).toHaveLength(2);
    expect(layer).toContain('data-trace-to="cell" data-trace-exit="N"');
    expect(layer).toContain('data-trace-to="far" data-trace-exit="E"');
    expect(layer).toMatch(/C[\d. -]+ [\d. -]+ [\d. -]+ [\d. -]+ [\d. -]+ [\d. -]+"/);
    // the ring is the outline of the target's own tile
    const cellTile = /data-room="cell" points="([^"]*)"/.exec(out)?.[1];
    const points = (cellTile ?? '').split(' ').map((p) => p.split(',').map(Number));
    const ring = /<polygon points="([^"]*)" fill="#[0-9a-f]{6}" fill-opacity="0.16" stroke="#[0-9a-f]{6}" stroke-width="3.5"/.exec(layer.split('data-trace-to="cell"')[1] ?? '')?.[1] ?? '';
    const ringPoints = ring.split(' ').map((p) => p.split(',').map(Number));
    expect(ringPoints).toHaveLength(8);
    // an octagon grown 12% about its centre: every corner is farther out than the tile's own
    const middle = (ps: number[][]) => [ps.reduce((s, p) => s + p[0], 0) / 8, ps.reduce((s, p) => s + p[1], 0) / 8];
    const [mx, my] = middle(points);
    ringPoints.forEach((p, i) => expect(Math.hypot(p[0] - mx, p[1] - my)).toBeCloseTo(Math.hypot(points[i][0] - mx, points[i][1] - my) * 1.12, 0));
  });

  it('gives each line its own colour and uses it for the dot where the line leaves, the arrowhead and the ring on the room it reaches', () => {
    const layer = /<g data-layer="trace">(.*?)<\/g><g data-layer="labels">/s.exec(draw(map, { trace: 'hall' }))?.[1] ?? '';
    const lines = layer.split('<g data-trace-to=').slice(1);
    expect(lines).toHaveLength(2);
    const colours = lines.map((l) => /data-trace-color="(#[0-9a-f]{6})"/.exec(l)?.[1] as string);
    expect(colours[0]).not.toBe(colours[1]);
    lines.forEach((l, i) => {
      const c = colours[i];
      expect(l).toContain(`stroke="${c}" stroke-width="3"`);
      expect(l).toContain(`<circle cx="`);
      expect(l).toMatch(new RegExp(`<circle[^>]*r="4.5" fill="${c}"`));
      expect(l).toMatch(new RegExp(`<polygon points="[^"]*" fill="${c}" stroke="#fff"`));
      expect(l).toMatch(new RegExp(`fill="${c}" fill-opacity="0.16" stroke="${c}"`));
    });
  });

  it('keeps a teleport dashed and a twist solid, whatever their colours', () => {
    const layer = /<g data-layer="trace">(.*?)<\/g><g data-layer="labels">/s.exec(draw(map, { trace: 'hall' }))?.[1] ?? '';
    const [twist, teleport] = layer.split('<g data-trace-to=').slice(1);
    expect(twist).not.toContain('stroke-dasharray');
    expect(teleport).toContain('stroke-dasharray="7 4"');
  });

  it('nests the rings when two lines land in the same room, so neither hides the other', () => {
    const twice = mapWith(
      [room('a', 'A', { coords: at(5, 5) }), room('b', 'B', { coords: at(5, 1) })],
      [link('l1', 'a', 'S', 'b'), link('l2', 'a', 'E', 'b')],
    );
    const layer = /<g data-layer="trace">(.*?)<\/g><g data-layer="labels">/s.exec(draw(twice, { trace: 'a' }))?.[1] ?? '';
    const rings = [...layer.matchAll(/<polygon points="([^"]*)" fill="#[0-9a-f]{6}" fill-opacity/g)].map((m) => m[1]);
    expect(rings).toHaveLength(2);
    expect(rings[0]).not.toBe(rings[1]);
    const width = (r: string) => Math.max(...r.split(' ').map((p) => Number(p.split(',')[0]))) - Math.min(...r.split(' ').map((p) => Number(p.split(',')[0])));
    expect(width(rings[1])).toBeGreaterThan(width(rings[0]));
  });

  it('leaves each exit square to its edge, then swoops to the room, so the line shows which way out it is', () => {
    const layer = /<g data-layer="trace">(.*?)<\/g><g data-layer="labels">/s.exec(draw(map, { trace: 'hall' }))?.[1] ?? '';
    const curves = [...layer.matchAll(/<path d="([^"]*)" fill="none" stroke="#fff"/g)].map((m) => m[1].split(/[MC ]+/).filter(Boolean).map(Number));
    expect(curves).toHaveLength(2);
    const [north, east] = curves; // [sx, sy, first handle x, y, second handle x, y, end x, y]
    // out of the north edge: the first handle is above the start; out of the east edge: it is right of the start
    expect(north[3]).toBeLessThan(north[1]);
    expect(east[2]).toBeGreaterThan(east[0]);
    // the second handle is short of the end, on the way in, so the line does not run straight at the room
    for (const c of curves) expect(Math.hypot(c[6] - c[4], c[7] - c[5])).toBeGreaterThan(0);
  });

  it('swoops round to a room behind the exit it leaves by', () => {
    const behind = mapWith(
      [room('a', 'A', { coords: at(5, 5) }), room('b', 'B', { coords: at(5, 1) })],
      [link('l1', 'a', 'S', 'b')],
    );
    const layer = /<g data-layer="trace">(.*?)<\/g><g data-layer="labels">/s.exec(draw(behind, { trace: 'a' }))?.[1] ?? '';
    const c = (/<path d="([^"]*)" fill="none" stroke="#fff"/.exec(layer)?.[1] ?? '').split(/[MC ]+/).filter(Boolean).map(Number);
    // the first handle goes south (down the page) although the room lies north of it
    expect(c[3]).toBeGreaterThan(c[1]);
    expect(c[7]).toBeLessThan(c[1]);
    // directly behind it leans to one side so it clears its own tile; a room behind and to the east or west leans that way
    expect(c[2]).not.toBe(c[0]);
    for (const [col, lean] of [[8, 1], [2, -1]] as const) {
      const off = mapWith([room('a', 'A', { coords: at(5, 5) }), room('b', 'B', { coords: at(col, 1) })], [link('l1', 'a', 'S', 'b')]);
      const layer2 = /<g data-layer="trace">(.*?)<\/g><g data-layer="labels">/s.exec(draw(off, { trace: 'a' }))?.[1] ?? '';
      const p = (/<path d="([^"]*)" fill="none" stroke="#fff"/.exec(layer2)?.[1] ?? '').split(/[MC ]+/).filter(Boolean).map(Number);
      expect(Math.sign(p[2] - p[0])).toBe(lean);
    }
  });

  it('draws nothing for a room with no tangled exit, for a room that is not on the floor and for no room', () => {
    expect(draw(map, { trace: 'beyond' })).not.toContain('data-layer="trace"');
    expect(draw(map, { trace: 'nowhere' })).not.toContain('data-layer="trace"');
    expect(draw(map, { trace: 'nowhere' })).toContain('data-trace="nowhere"');
  });

  it('draws only the chosen room, not the tangled exits of the others', () => {
    const layer = /<g data-layer="trace">(.*?)<\/g><g data-layer="labels">/s.exec(draw(map, { trace: 'other' }))?.[1] ?? '';
    expect(layer.match(/data-trace-to="/g)).toHaveLength(1);
    expect(layer).toContain('data-trace-to="beyond"');
  });

  it('leaves clicks to the picture under it', () => {
    expect(draw(map, { trace: 'hall' })).toContain('pointer-events="none"><path d="M');
  });
});

describe('room names', () => {
  const nameOf = (title: string): string[] => {
    const svg = draw(mapWith([room('a1', title, { coords: at(0, 0) })], []));
    return [...svg.matchAll(/<text x="[^"]*" y="[^"]*" text-anchor="middle" font-size="10" font-family="sans-serif" fill="#222" stroke="#f4f5f7" stroke-width="3" stroke-linejoin="round" paint-order="stroke" pointer-events="none">([^<]*)<\/text>/g)].map((m) => m[1]);
  };

  it('writes a name of up to three lines of sixteen characters whole', () => {
    expect(nameOf('Entrance to the Great Library of the Algoron')).toEqual(['Entrance to the', 'Great Library of', 'the Algoron']);
  });

  it('ends the last line with an ellipsis when the name goes on, and the tooltip keeps the whole name', () => {
    const title = 'aaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbb cccccccccccccccc dddddddddddddddd';
    expect(nameOf(title)).toEqual(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb', 'ccccccccccccccc…']);
    expect(draw(mapWith([room('a1', title, { coords: at(0, 0) })], []))).toContain(`<title>${title}</title>`);
    expect(nameOf('one two three four five six seven eight nine ten eleven twelve')).toEqual(['one two three', 'four five six', 'seven eight nin…']);
    expect(nameOf('one two three four five six seven eight')).toEqual(['one two three', 'four five six', 'seven eight']);
  });

  it('does not add a second ellipsis to a cut word that ends the last line', () => {
    expect(nameOf('aaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbb Supercalifragilisticexpialidocious dddddddddddddddd')[2]).toBe('Supercalifragil…');
  });

  it('writes no names at all when names are off, and the pills then sit just under the tile', () => {
    const map = mapWith(
      [room('a1', 'A', { coords: at(0, 0) }), room('a2', 'B', { coords: at(5, 5) })],
      [link('l1', 'a1', 'E', 'a2')],
      'maze',
    );
    const svg = draw(map, { labels: false });
    expect(svg).not.toContain('fill="#222"');
    expect(svg).toContain('data-pill="END"');
  });
});

describe('the pills of a maze room', () => {
  const pills = (svg: string, id: string): string[] => {
    // the pills of a room sit in the band under its name: find them by the room's tile position
    const tile = new RegExp(`data-room="${id}" points="([^"]*)"`).exec(svg)?.[1] ?? '';
    const pts = [...tile.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const cx = (Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2;
    const bottom = Math.max(...pts.map((p) => p[1]));
    return [...svg.matchAll(/<g data-pill="([^"]+)"><rect x="(-?[\d.]+)" y="(-?[\d.]+)"/g)]
      .filter((m) => Number(m[3]) > bottom && Number(m[3]) < bottom + 70 && Math.abs(Number(m[2]) - cx) < 60)
      .map((m) => m[1]);
  };

  // a maze of three rooms: entry (reached from area b), mid (leaves for area b), far (a one-way landing from entry)
  const maze = mapWith(
    [room('entry', 'Entry', { coords: at(0, 0) }), room('mid', 'Middle', { coords: at(3, 0) }), room('far', 'Far', { coords: at(8, 4) })],
    [link('e1', 'entry', 'E', 'far'), link('m1', 'mid', 'W', 'entry'), link('m2', 'mid', 'S', 'outside'), link('f1', 'far', 'W', 'mid')],
    'maze',
    { rooms: [room('outside', 'Outside', { coords: at(0, 0) })], links: [link('o1', 'outside', 'E', 'entry')] },
  );
  const svg = draw(maze);

  it('marks the way in from outside with IN, an exit to another area with OUT', () => {
    expect(pills(svg, 'entry')).toContain('IN');
    expect(pills(svg, 'mid')).toContain('OUT');
  });

  it('marks a dead end with END and a landing with no way back with 1-WAY', () => {
    const dead = mapWith([room('a1', 'A', { coords: at(0, 0) }), room('a2', 'B', { coords: at(5, 5) })], [link('l1', 'a1', 'E', 'a2')], 'maze');
    const out = draw(dead);
    expect(pills(out, 'a1')).toEqual(['END']);
    expect(pills(out, 'a2')).toEqual(['1-WAY']);
    expect(out).toContain('<title>A dead end: one exit only</title>');
    expect(out).toContain('<title>You can land here, but there is no exit back to where you came from</title>');
  });

  it('a room that several tangled exits land in is marked 1-WAY once, unless it has a way back to every one of them', () => {
    const two = [room('a1', 'A', { coords: at(0, 0) }), room('a2', 'B', { coords: at(7, 0) }), room('a3', 'C', { coords: at(3, 5) })];
    const links = [link('l1', 'a1', 'S', 'a3'), link('l2', 'a2', 'S', 'a3')];
    const out = draw(mapWith(two, links, 'maze'));
    expect(pills(out, 'a3')).toEqual(['END', '1-WAY'].filter((p) => p === '1-WAY'));
    const backToOne = draw(mapWith(two, [...links, link('l3', 'a3', 'N', 'a1')], 'maze'));
    expect(pills(backToOne, 'a3')).toContain('1-WAY'); // still no way back to the second
    const backToBoth = draw(mapWith(two, [...links, link('l3', 'a3', 'N', 'a1'), link('l4', 'a3', 'E', 'a2')], 'maze'));
    expect(pills(backToBoth, 'a3')).not.toContain('1-WAY');
  });

  it('a landing that does have an exit back is not a one-way landing', () => {
    const back = mapWith([room('a1', 'A', { coords: at(0, 0) }), room('a2', 'B', { coords: at(5, 5) })], [link('l1', 'a1', 'E', 'a2'), link('l2', 'a2', 'N', 'a1')], 'maze');
    expect(draw(back)).not.toContain('data-pill="1-WAY"');
  });

  it('draws no pill in a subzone that is not a maze, loop or teleport run', () => {
    const plain = mapWith([room('a1', 'A', { coords: at(0, 0) }), room('a2', 'B', { coords: at(5, 5) })], [link('l1', 'a1', 'E', 'a2')]);
    expect(draw(plain)).not.toContain('data-pill');
  });

  it('draws two pills of one room side by side, not on top of each other', () => {
    const both = [
      ...draw(
        mapWith([room('a1', 'A', { coords: at(0, 0) }), room('a2', 'B', { coords: at(5, 5) })], [link('l1', 'a1', 'E', 'a2')], 'maze', {
          rooms: [room('o', 'Out', { coords: at(0, 0) })],
          links: [link('o1', 'o', 'E', 'a2')],
        }),
      ).matchAll(/data-pill="(IN|1-WAY)"><rect x="(-?[\d.]+)"/g),
    ].map((m) => Number(m[2]));
    expect(both).toHaveLength(2);
    expect(both[1]).toBeGreaterThan(both[0]);
  });
});

describe('the way into an area', () => {
  const map = mapWith(
    [room('in', 'In', { coords: at(0, 0) }), room('deep', 'Deep', { coords: at(1, 0) })],
    [link('l1', 'in', 'E', 'deep')],
    'consistent',
    { rooms: [room('out', 'Out', { coords: at(0, 0) })], links: [link('o1', 'out', 'E', 'in')] },
  );

  it('the index lists the links that reach each room', () => {
    const index = buildIndex(map);
    expect(index.linksTo.get('in')?.map((l) => l.id)).toEqual(['o1']);
    expect(index.linksTo.get('deep')?.map((l) => l.id)).toEqual(['l1']);
    expect(index.linksTo.has('out')).toBe(false);
  });

  it('an area slice flags the room a link from another area reaches, and no other', () => {
    const slice = sliceMap(map, 'area', 'a') as NonNullable<ReturnType<typeof sliceMap>>;
    expect(slice.rooms.find((r) => r.id === 'in')?.entrance).toBe(true);
    expect(slice.rooms.find((r) => r.id === 'deep')?.entrance).toBeUndefined();
  });

  it('a room-level view does not flag entrances', () => {
    const slice = sliceMap(map, 'room', 'in') as NonNullable<ReturnType<typeof sliceMap>>;
    expect(slice.rooms.every((r) => r.entrance === undefined)).toBe(true);
  });
});

describe('the arrow on a one-way join', () => {
  const pair = (links: Link[], titleB = 'Beta') =>
    mapWith([room('a', 'Alpha', { coords: at(0, 0) }), room('b', titleB, { coords: at(1, 0) })], links);

  it('puts an arrowhead at the room a one-way join reaches, above the tiles, and names it on hover', () => {
    const out = draw(pair([link('l1', 'a', 'E', 'b')]));
    expect(out.match(/data-oneway-from=/g)).toHaveLength(1);
    expect(out).toContain('data-oneway-from="a" data-oneway-to="b"');
    expect(out).toContain('<title>One way: you can go this way to Beta but not back</title>');
    // the arrow is drawn after the tiles
    expect(out.indexOf('data-oneway-from')).toBeGreaterThan(out.indexOf('data-room="b"'));
    // its tip is on the east-pointing line, at the west edge of the target tile: left of the target's centre, level with the line
    const tip = /data-oneway-to="b" points="([\d.-]+),([\d.-]+) /.exec(out);
    const line = /<line [^>]*x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/.exec(out);
    expect(Number(tip?.[2])).toBe(Number(line?.[4]));
    expect(Number(tip?.[1])).toBeLessThan(Number(line?.[3]));
    expect(Number(tip?.[1])).toBeGreaterThan(Number(line?.[1]));
  });

  it('draws no arrow when the join runs both ways', () => {
    expect(draw(pair([link('l1', 'a', 'E', 'b'), link('l2', 'b', 'W', 'a')]))).not.toContain('data-oneway');
  });

  it('leaves the room name out of the hover text when the room has none', () => {
    expect(draw(pair([link('l1', 'a', 'E', 'b')], ''))).toContain('<title>One way: you can go this way but not back</title>');
  });
});

describe('the arrows on a trace line and its route', () => {
  const nums = (s: string) => s.split(/[MC ]+/).filter(Boolean).map(Number);
  const pathOf = (out: string) => nums(/<path d="([^"]*)" fill="none" stroke="#fff"/.exec(out)?.[1] ?? '');
  const sample = ([x0, y0, x1, y1, x2, y2, x3, y3]: number[], t: number) => {
    const u = 1 - t;
    return { x: u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3, y: u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3 };
  };
  const centre = (out: string, id: string) => {
    const pts = (new RegExp(`data-room="${id}"[^>]*points="([^"]*)"`).exec(out)?.[1] ?? '').split(' ').map((p) => p.split(',').map(Number));
    return { x: pts.reduce((s, p) => s + p[0], 0) / pts.length, y: pts.reduce((s, p) => s + p[1], 0) / pts.length, r: (Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]))) / 2 };
  };
  const rooms = (extra: Room[] = []) => [room('a', 'Alpha', { coords: at(0, 0) }), room('far', 'Far', { coords: at(6, 3) }), ...extra];
  const links = [link('l1', 'a', 'E', 'far')];

  it('puts an arrowhead half way along the line as well as at the room it reaches, both in the line colour', () => {
    const out = draw(mapWith(rooms(), links), { trace: 'a' });
    const colour = /data-trace-color="(#[0-9a-f]{6})"/.exec(out)?.[1] as string;
    expect(out.match(/data-trace-mid/g)).toHaveLength(1);
    expect(out).toMatch(new RegExp(`<polygon data-trace-mid points="[^"]*" fill="${colour}"`));
    const mid = /data-trace-mid points="([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)"/.exec(out) as RegExpExecArray;
    const m = sample(pathOf(out), 0.5);
    // the arrow is centred on the middle of the line
    const cx = (Number(mid[1]) + Number(mid[3]) + Number(mid[5])) / 3;
    const cy = (Number(mid[2]) + Number(mid[4]) + Number(mid[6])) / 3;
    expect(Math.hypot(cx - m.x, cy - m.y)).toBeLessThan(4);
  });

  it('keeps the line out of the tiles that lie in its way', () => {
    const blockers = [room('m1', 'M1', { coords: at(3, 1) }), room('m2', 'M2', { coords: at(2, 1) }), room('m3', 'M3', { coords: at(4, 2) })];
    const clear = draw(mapWith(rooms(), links), { trace: 'a' });
    const busy = draw(mapWith(rooms(blockers), links), { trace: 'a' });
    expect(pathOf(busy)).not.toEqual(pathOf(clear));
    for (const id of ['m1', 'm2', 'm3']) {
      const c = centre(busy, id);
      for (let k = 1; k < 20; k += 1) {
        const q = sample(pathOf(busy), k / 20);
        expect(Math.hypot(q.x - c.x, q.y - c.y)).toBeGreaterThan(c.r);
      }
    }
  });
});
