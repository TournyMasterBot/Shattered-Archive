import type { AreaLink, MapSlice } from './hierarchy.js';
import { renderSvg } from './render.js';

const box = (id: string, name: string, x: number, y: number, w = 4, h = 4) => ({ id, name, placement: { x, y, w, h }, rooms: 10 });
const slice = (areas: MapSlice['areas'], areaLinks?: AreaLink[]): MapSlice => ({ level: 'continent', id: 'c', title: 'C', areas, rooms: [], links: [], unplaced: [], derivedCoords: false, ...(areaLinks ? { areaLinks } : {}) });
const draw = (areas: MapSlice['areas'], areaLinks?: AreaLink[]) => renderSvg(slice(areas, areaLinks), { layout: 'grid' });
const lineOf = (out: string, from: string, to: string) => new RegExp(`<g data-area-link data-from="${from}" data-to="${to}"><line x1="([\\d.-]+)" y1="([\\d.-]+)" x2="([\\d.-]+)" y2="([\\d.-]+)"`).exec(out);

// two boxes of 4 cells with 4 empty cells between them, side by side; a third one far to the south
const three = [box('a', 'Alpha', 0, 0), box('b', 'Beta', 8, 0), box('c', 'Gamma', 0, 12)];

describe('the lines between the areas of a continent', () => {
  it('draws no line when the slice has no area links', () => {
    expect(draw(three)).not.toContain('data-area-link');
    expect(draw(three, [])).not.toContain('data-area-link');
  });

  it('draws a line from the edge of one box to the edge of the next, across the gap, with an arrowhead at the box the exits go into', () => {
    const out = draw(three, [{ from: 'a', to: 'b', dir: 'E', count: 2 }]);
    const line = lineOf(out, 'a', 'b');
    expect(line).not.toBeNull();
    const [x1, y1, x2, y2] = line!.slice(1).map(Number);
    const a = /data-area="a" fill="[^"]*" stroke="[^"]*" x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/.exec(out)!.slice(1).map(Number);
    const b = /data-area="b" fill="[^"]*" stroke="[^"]*" x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/.exec(out)!.slice(1).map(Number);
    // it leaves the east edge of a and reaches the west edge of b, level with their middles
    expect(x1).toBeCloseTo(a[0] + a[2], 0);
    expect(x2).toBeCloseTo(b[0], 0);
    expect(y1).toBeCloseTo(a[1] + a[3] / 2, 0);
    expect(y2).toBeCloseTo(b[1] + b[3] / 2, 0);
    // one arrowhead only, with its tip on the edge of b
    const group = /<g data-area-link data-from="a" data-to="b">(.*?)<\/g>/s.exec(out)![1];
    expect(group.match(/<polygon /g)).toHaveLength(1);
    expect(group).toContain(`<polygon points="${x2.toFixed(0)}`.slice(0, 18));
  });

  it('draws arrowheads at both ends when exits go both ways, and one at the other end when only the second area has them', () => {
    const both = draw(three, [{ from: 'a', to: 'b', dir: 'E', count: 1 }, { from: 'b', to: 'a', dir: 'W', count: 1 }]);
    expect(/<g data-area-link data-from="a" data-to="b">(.*?)<\/g>/s.exec(both)![1].match(/<polygon /g)).toHaveLength(2);
    // given the other way round (b to a only) the pair is still one line, with one arrowhead, at a
    const back = draw(three, [{ from: 'b', to: 'a', dir: 'W', count: 1 }]);
    expect(back.match(/data-area-link /g)).toHaveLength(1);
    const lineBack = /<g data-area-link data-from="a" data-to="b"><line x1="([\d.-]+)"[^>]*\/><polygon points="([\d.-]+),/.exec(back);
    expect(Number(lineBack?.[2])).toBeCloseTo(Number(lineBack?.[1]), 0);
  });

  it('says on hover which way and how many exits, with the area names', () => {
    const out = draw(three, [
      { from: 'a', to: 'b', dir: 'E', count: 3 },
      { from: 'a', to: 'b', dir: 'NE', count: 1 },
      { from: 'b', to: 'a', dir: 'W', count: 1 },
    ]);
    expect(out).toContain('<title>Alpha to Beta: east (3), northeast. Beta to Alpha: west</title>');
  });

  it('lists directions with the same number of exits in name order', () => {
    const out = draw(three, [{ from: 'a', to: 'b', dir: 'S', count: 1 }, { from: 'a', to: 'b', dir: 'E', count: 1 }]);
    expect(out).toContain('Alpha to Beta: east, south');
  });

  it('names an up or down exit and a direction it has no word for', () => {
    expect(draw(three, [{ from: 'a', to: 'b', dir: 'U', count: 1 }])).toContain('Alpha to Beta: up');
    expect(draw(three, [{ from: 'a', to: 'b', dir: 'X' as never, count: 1 }])).toContain('Alpha to Beta: X');
  });

  it('joins boxes that are not side by side along the line between their middles', () => {
    const out = draw(three, [{ from: 'a', to: 'c', dir: 'S', count: 1 }]);
    const [x1, y1, x2, y2] = lineOf(out, 'a', 'c')!.slice(1).map(Number);
    expect(x1).toBeCloseTo(x2, 0); // straight down
    expect(y2).toBeGreaterThan(y1);
  });

  it('draws no line between boxes that touch, for an area that is not placed, or for an area that is not in the slice', () => {
    expect(draw([box('a', 'Alpha', 0, 0), box('b', 'Beta', 4, 0)], [{ from: 'a', to: 'b', dir: 'E', count: 1 }])).not.toContain('data-area-link');
    const unplaced = [box('a', 'Alpha', 0, 0), { id: 'u', name: 'Unplaced', placement: null, rooms: 3 }];
    expect(draw(unplaced, [{ from: 'a', to: 'u', dir: 'E', count: 1 }])).not.toContain('data-area-link');
    expect(draw(three, [{ from: 'a', to: 'zzz', dir: 'E', count: 1 }])).not.toContain('data-area-link');
    // boxes on top of each other have no gap at all
    expect(draw([box('a', 'Alpha', 0, 0), box('b', 'Beta', 1, 1)], [{ from: 'a', to: 'b', dir: 'E', count: 1 }])).not.toContain('data-area-link');
    expect(draw([box('a', 'Alpha', 0, 0), box('b', 'Beta', 0, 0)], [{ from: 'a', to: 'b', dir: 'E', count: 1 }])).not.toContain('data-area-link');
  });

  it('draws a line that runs diagonally between boxes that are corner to corner', () => {
    const out = draw([box('a', 'Alpha', 0, 0), box('b', 'Beta', 9, 9)], [{ from: 'a', to: 'b', dir: 'SE', count: 1 }]);
    const [x1, y1, x2, y2] = lineOf(out, 'a', 'b')!.slice(1).map(Number);
    expect(x2).toBeGreaterThan(x1);
    expect(y2).toBeGreaterThan(y1);
  });

  it('draws the lines before the boxes, so a box covers the end of a line that runs under it', () => {
    const out = draw(three, [{ from: 'a', to: 'b', dir: 'E', count: 1 }]);
    expect(out.indexOf('data-area-link')).toBeLessThan(out.indexOf('data-area="a"'));
  });

  it('draws a line faint when it crosses a long way and at full strength when it is a short hop', () => {
    const out = draw([box('a', 'Alpha', 0, 0), box('b', 'Beta', 8, 0), box('c', 'Gamma', 40, 0)], [{ from: 'a', to: 'b', dir: 'E', count: 1 }, { from: 'a', to: 'c', dir: 'E', count: 1 }]);
    expect(out).toContain('<g data-area-link data-from="a" data-to="b"><line');
    expect(out).toContain('<g data-area-link data-from="a" data-to="c" opacity="0.35"><line');
  });

  it('on a big picture only a line over 15% of it is faint: a 200 px line fades on a small picture and stays strong on a wide one', () => {
    // a to b: 3 cells of gap = 48 px less the box gap; a to c: 17 cells of gap, about 270 px. A far box at x=200 makes the picture 3,200 px wide (limit 480 px).
    const links = [{ from: 'a', to: 'b', dir: 'E' as const, count: 1 }, { from: 'a', to: 'c', dir: 'E' as const, count: 1 }];
    const small = draw([box('a', 'Alpha', 0, 0), box('b', 'Beta', 8, 0), box('c', 'Gamma', 25, 0)], links);
    expect(small).toContain('<g data-area-link data-from="a" data-to="c" opacity="0.35">');
    const wide = draw([box('a', 'Alpha', 0, 0), box('b', 'Beta', 8, 0), box('c', 'Gamma', 25, 0), box('z', 'Zed', 200, 0)], links);
    expect(wide).toContain('<g data-area-link data-from="a" data-to="c"><line');
  });

  it('lets a click on an area name reach its box (the name does not catch it), so tapping the middle of a box opens the area', () => {
    const out = draw(three);
    const names = [...out.matchAll(/<text [^>]*>(Alpha|Beta|Gamma)<\/text>/g)];
    expect(names).toHaveLength(3);
    for (const m of names) expect(m[0]).toContain('pointer-events="none"');
  });

  it('gives the line a wide transparent copy so a hover finds it', () => {
    expect(draw(three, [{ from: 'a', to: 'b', dir: 'E', count: 1 }])).toMatch(/stroke="transparent" stroke-width="10"/);
  });
});
