import { sliceMap, type MapSlice } from './hierarchy.js';
import { ghostOpacity, renderSvg } from './render.js';
import type { MapFile } from './schema.js';
import { area, link, room, subzone } from './testing/fixtures.js';

/** A tower: four floors (-1, 0, 1, 2) of the same two-room layout, a link on floors 0 and 1, and one exit into another area. */
function tower(): MapFile {
  const floors = [-1, 0, 1, 2];
  const rooms = floors.flatMap((z) => [
    room(`a${z}`, `Hall ${z}`, { sector: 'city', coords: { x: 0, y: 0, z } }),
    room(`b${z}`, `Side ${z}`, { sector: 'inside', coords: { x: 1, y: 0, z } }),
  ]);
  const links = [
    link('lo', 'b0', 'E', 'elsewhere', { offPage: true, state: 'confirmed', confidence: 0.9 }),
    link('l0', 'a0', 'E', 'b0', { state: 'confirmed', confidence: 0.9 }),
    link('l1', 'a1', 'E', 'b1', { state: 'confirmed', confidence: 0.9 }),
  ];
  const withExits = rooms.map((r) => ({
    ...r,
    exits: Object.fromEntries(links.filter((l) => l.from === r.id).map((l) => [l.dir, l.id])),
  }));
  return { version: 1, continents: [{ id: 'c1', name: 'C', areas: [area('tw', [subzone('s1', withExits)])] }], links };
}
const tslice = (): MapSlice => sliceMap(tower(), 'area', 'tw')!;
const polygon = (svg: string, id: string) => new RegExp(`data-room="${id}" points="([^"]+)"`).exec(svg)?.[1];

describe('renderSvg: the slice frame', () => {
  it('keeps the same room at the same place on every floor, and the same picture size, with align slice', () => {
    const at = (z: number) => renderSvg(tslice(), { layout: 'grid', z, align: 'slice' });
    expect(polygon(at(0), 'b0')).toBeDefined();
    expect(polygon(at(1), 'b1')).toBe(polygon(at(0), 'b0'));
    const size = (svg: string) => /viewBox="([^"]+)"/.exec(svg)?.[1];
    expect(size(at(-1))).toBe(size(at(2)));
  });

  it('frames around the drawn floor alone by default, as before', () => {
    const sparse = sliceMap(
      {
        version: 1,
        continents: [
          {
            id: 'c',
            name: 'C',
            areas: [
              area('x', [
                subzone('s', [
                  room('p', 'P', { coords: { x: 0, y: 0, z: 0 } }),
                  room('q', 'Q', { coords: { x: 9, y: 9, z: 1 } }),
                ]),
              ]),
            ],
          },
        ],
        links: [],
      },
      'area',
      'x',
    )!;
    const first = polygon(renderSvg(sparse, { layout: 'grid', z: 0 }), 'p');
    const second = polygon(renderSvg(sparse, { layout: 'grid', z: 1 }), 'q');
    expect(first).toBe(second);
    expect(renderSvg(sparse, { layout: 'grid', z: 0 })).not.toContain('data-ghosts');
  });
});

describe('renderSvg: ghost floors', () => {
  it('draws no ghost group unless asked', () => {
    expect(renderSvg(tslice(), { layout: 'grid', z: 0 })).not.toContain('data-layer="ghost"');
    expect(renderSvg(tslice(), { layout: 'grid', z: 0, ghosts: 0 })).not.toContain('data-layer="ghost"');
  });

  it('draws the floors within the distance behind the drawn one, farthest first, each dimmer than the nearer', () => {
    const svg = renderSvg(tslice(), { layout: 'grid', z: 0, ghosts: 2 });
    const groups = [
      ...svg.matchAll(/<g data-layer="ghost" data-floor="(-?\d+)" data-distance="(\d+)" opacity="([\d.]+)"/g),
    ];
    expect(groups[0].slice(1, 3)).toEqual(['2', '2']);
    expect(groups.slice(1).map((g) => g[2])).toEqual(['1', '1']);
    const opacity = (floor: string) => Number(groups.find((g) => g[1] === floor)![3]);
    expect(opacity('2')).toBeLessThan(opacity('1'));
    expect(opacity('1')).toBe(opacity('-1'));
    expect(svg.indexOf('data-layer="ghost"')).toBeLessThan(svg.indexOf('data-layer="links"'));
    expect(svg).toContain('data-ghosts="2"');
  });

  it('shifts floors above up and to the right and floors below down and to the left, by the offset per floor', () => {
    const svg = renderSvg(tslice(), { layout: 'grid', z: 0, ghosts: 2, ghostOffset: 10 });
    const shift = (floor: string) => {
      const m = [
        ...svg.matchAll(
          /data-floor="(-?\d+)" data-distance="\d+" opacity="[\d.]+" transform="translate\(([-\d.]+) ([-\d.]+)\)"/g,
        ),
      ].find((x) => x[1] === floor)!;
      return [m[2], m[3]];
    };
    expect(shift('1')).toEqual(['10', '-10']);
    expect(shift('2')).toEqual(['20', '-20']);
    expect(shift('-1')).toEqual(['-10', '10']);
  });

  it('gives ghost rooms their own attributes (never data-room), no labels, and only links within one floor', () => {
    const svg = renderSvg(tslice(), { layout: 'grid', z: 0, ghosts: 1 });
    expect(svg.match(/data-ghost-room="/g)).toHaveLength(4);
    expect(svg).toMatch(/data-ghost-room="a1" data-ghost-floor="1"/);
    expect(svg.match(/data-room="/g)).toHaveLength(2);
    const ghostPart = svg.slice(svg.indexOf('data-layer="ghost"'), svg.indexOf('data-layer="links"'));
    expect(ghostPart).not.toContain('<text');
    expect(ghostPart.match(/<line /g)).toHaveLength(1);
  });

  it('clamps the count to 8 and the offset to 40, and draws nothing for floors that are not there', () => {
    const svg = renderSvg(tslice(), { layout: 'grid', z: 2, ghosts: 99, ghostOffset: 999 });
    expect(svg).toContain('data-ghosts="8"');
    expect(svg.match(/data-layer="ghost"/g)).toHaveLength(3);
    expect(svg).toContain('transform="translate(-40 40)"');
  });

  it('ignores a count that is not a usable number, and a offset that is not finite means the default', () => {
    for (const count of [Number.NaN, -3, Number.POSITIVE_INFINITY]) {
      expect(renderSvg(tslice(), { layout: 'grid', z: 0, ghosts: count })).not.toContain('data-layer="ghost"');
    }
    expect(renderSvg(tslice(), { layout: 'grid', z: 0, ghosts: 1, ghostOffset: Number.NaN })).toContain(
      'translate(8 -8)',
    );
  });

  it('does not move the drawn floor when ghosts are switched on with the slice frame', () => {
    const plain = polygon(renderSvg(tslice(), { layout: 'grid', z: 0, align: 'slice' }), 'b0');
    const withGhosts = polygon(renderSvg(tslice(), { layout: 'grid', z: 0, ghosts: 1, align: 'slice' }), 'b0');
    // ghosts add room for their offset on every side, so the frame moves by that much, the same on every floor
    const a = plain!.split(/[ ,]/).map(Number);
    const b = withGhosts!.split(/[ ,]/).map(Number);
    expect(b[0] - a[0]).toBeCloseTo(8, 5);
    expect(b[1] - a[1]).toBeCloseTo(8, 5);
  });

  it('colours a ghost room by its terrain, and plainly when the terrain is unknown or missing', () => {
    const map = tower();
    const rooms = map.continents[0].areas[0].subzones[0].rooms;
    rooms.find((r) => r.id === 'a1')!.sector = 'unheard-of';
    delete rooms.find((r) => r.id === 'b1')!.sector;
    const svg = renderSvg(sliceMap(map, 'area', 'tw')!, { layout: 'grid', z: 0, ghosts: 1 });
    const fill = (id: string) => new RegExp('data-ghost-room="' + id + '"[^>]* fill="([^"]+)"').exec(svg)?.[1];
    expect(fill('a1')).toBe('#dde1e6');
    expect(fill('b1')).toBe('#dde1e6');
    expect(fill('a-1')).toBe('#7E8796'); // city
  });

  it('draws ghost rooms as octagons', () => {
    const svg = renderSvg(tslice(), { layout: 'grid', z: 0, ghosts: 1 });
    const points = /data-ghost-room="a1"[^>]* points="([^"]+)"/.exec(svg)?.[1];
    expect(points?.split(' ')).toHaveLength(8);
  });

  it('leaves the ghosts out, and says so, when there are too many rooms on them', () => {
    const above = Array.from({ length: 3_001 }, (_v, i) => room(`g${i}`, 'G', { coords: { x: i, y: 0, z: 1 } }));
    const below = Array.from({ length: 3_001 }, (_v, i) => room(`h${i}`, 'H', { coords: { x: i, y: 0, z: -1 } }));
    const big = sliceMap(
      {
        version: 1,
        continents: [
          {
            id: 'c',
            name: 'C',
            areas: [
              area('big', [subzone('s', [room('here', 'Here', { coords: { x: 0, y: 0, z: 0 } }), ...above, ...below])]),
            ],
          },
        ],
        links: [],
      },
      'area',
      'big',
    )!;
    const svg = renderSvg(big, { layout: 'grid', z: 0, ghosts: 1 });
    expect(svg).toContain('data-ghosts="skipped"');
    expect(svg).not.toContain('data-layer="ghost"');
  });
});

describe('renderSvg: the bounds of the drawn floor', () => {
  const boundsOf = (svg: string) =>
    (/data-bounds="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svg) ?? []).slice(1).map(Number);

  it('names the rectangle of the rooms of the drawn floor, inside the picture, and tighter than the slice frame', () => {
    const svg = renderSvg(tslice(), { layout: 'grid', z: 0, align: 'slice' });
    const [x, y, w, h] = boundsOf(svg);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    const frame = /viewBox="0 0 ([-\d.]+) ([-\d.]+)"/.exec(svg)!;
    const frameW = Number(frame[1]);
    const frameH = Number(frame[2]);
    expect(frameW).toBeGreaterThanOrEqual(420);
    expect(x).toBeLessThan(60); // the first room is at 60,60 in this frame
    expect(y).toBeLessThan(60);
    // both rooms of floor 0 (a0 at 60 and b0 one pitch to the right) are inside it, tile and label included
    const room = (id: string) => polygonPoints(svg, id);
    for (const p of [...room('a0'), ...room('b0')]) {
      expect(p.x).toBeGreaterThanOrEqual(x);
      expect(p.x).toBeLessThanOrEqual(x + w);
      expect(p.y).toBeGreaterThanOrEqual(y);
      expect(p.y).toBeLessThanOrEqual(y + h);
    }
    expect(frameH).toBeGreaterThan(0);
  });

  it('is smaller than the picture when another floor reaches further, and follows the labels setting', () => {
    const map = tower();
    const far = map.continents[0].areas[0].subzones[0].rooms.find((r) => r.id === 'b1')!;
    far.coords = { x: 30, y: 20, z: 1 };
    const slice = sliceMap(map, 'area', 'tw')!;
    const withLabels = boundsOf(renderSvg(slice, { layout: 'grid', z: 0, align: 'slice' }));
    const frame = /viewBox="0 0 ([-\d.]+) ([-\d.]+)"/
      .exec(renderSvg(slice, { layout: 'grid', z: 0, align: 'slice' }))!
      .map(Number);
    expect(withLabels[2]).toBeLessThan(frame[1] / 2);
    expect(withLabels[3]).toBeLessThan(frame[2] / 2);
    const without = boundsOf(renderSvg(slice, { layout: 'grid', z: 0, align: 'slice', labels: false }));
    expect(without[2]).toBeLessThan(withLabels[2]);
    expect(without[3]).toBeLessThan(withLabels[3]);
  });

  it('is present in the plain, floor-framed picture too', () => {
    expect(boundsOf(renderSvg(tslice(), { layout: 'grid', z: 0 }))).toHaveLength(4);
  });
});

function polygonPoints(svg: string, id: string): { x: number; y: number }[] {
  const points = new RegExp('data-room="' + id + '" points="([^"]+)"').exec(svg)![1];
  return points.split(' ').map((p) => {
    const [x, y] = p.split(',').map(Number);
    return { x, y };
  });
}

describe('ghostOpacity', () => {
  it('starts at 0.5, falls by 40% a floor and never goes below 0.06', () => {
    expect([1, 2, 3, 4].map(ghostOpacity)).toEqual([0.5, 0.3, 0.18, 0.108]);
    expect(ghostOpacity(8)).toBe(0.06);
    expect(ghostOpacity(0)).toBe(0.5);
    expect(ghostOpacity(Number.NaN)).toBe(0.5);
  });
});

describe('renderSvg: exits into another area', () => {
  it('draws the arrow as a chip on the edge of the tile that names the target room, with its words, escaped', () => {
    const svg = renderSvg(tslice(), { layout: 'grid', z: 0 });
    expect(svg).toMatch(/<g data-link="lo" data-state="confirmed" data-offpage-to="elsewhere"><circle [^>]*r="8" fill="#fff"[^>]*\/><text [^>]*>→<\/text><title>This exit leads into another area. Click to go there.<\/title><\/g>/);
    const hostile = tower();
    hostile.links[0].to = 'a"><script>x</script>';
    const out = renderSvg(sliceMap(hostile, 'area', 'tw')!, { layout: 'grid', z: 0 });
    expect(out).not.toContain('<script>');
    expect(out).toContain('data-offpage-to="a&quot;&gt;&lt;script&gt;x&lt;/script&gt;"');
  });

  it('draws an exit to a room on another floor of the area as a short stub, never as a line across floors, with or without the slice frame', () => {
    const map = tower();
    map.links.push(link('lcross', 'a0', 'N', 'a1', { state: 'confirmed', confidence: 0.9 }));
    const slice = sliceMap(map, 'area', 'tw')!;
    for (const view of [
      { layout: 'grid' as const, z: 0 },
      { layout: 'grid' as const, z: 0, align: 'slice' as const },
      { layout: 'grid' as const, z: 0, ghosts: 2 },
    ]) {
      const svg = renderSvg(slice, view);
      const links = svg.slice(svg.indexOf('data-layer="links"'), svg.indexOf('data-layer="tiles"'));
      const line = /<line data-link="lcross"[^>]*>/.exec(links)![0];
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) =>
        Number(new RegExp(a + '="([-\\d.]+)"').exec(line)![1]),
      );
      expect(Math.hypot(x2 - x1, y2 - y1)).toBeLessThan(20); // a stub out of the room, not a line to the room on the other floor
      expect(line).toContain('stroke-dasharray="3 3"');
      expect(links).not.toContain('data-offpage-to="a1"'); // the target is in this area: nothing to open
    }
  });

  it('does not mark an exit inside the area', () => {
    expect(renderSvg(tslice(), { layout: 'grid', z: 1 })).not.toContain('data-offpage-to');
  });
});
