import { renderAreaSVG, renderAreaSVGStacked } from './svgExport';
import { TERRAIN_ORDER } from './terrainPalette';
import { doc, exit, room, sampleDoc } from '../testing/fixtures';

const EMPTY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#0f0f10"/><text x="16" y="28" fill="#ddd" font-family="ui-sans-serif,system-ui" font-size="14">No rooms to render.</text></svg>';
const count = (text: string, needle: string): number => text.split(needle).length - 1;
const titles = (svg: string): string[] => [...svg.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);

describe('renderAreaSVG', () => {
  it('says so when the area or the floor has no rooms', () => {
    expect(renderAreaSVG(sampleDoc(), 'nope', 0)).toBe(EMPTY);
    expect(renderAreaSVG(sampleDoc(), 'a1', 9)).toBe(EMPTY);
    expect(renderAreaSVG(doc([]), 'a1', 0)).toBe(EMPTY);
  });

  it('draws a valid svg of one floor: a tile per room, the labels, the title and the size from the content', () => {
    const svg = renderAreaSVG(sampleDoc(), 'a1', 0);
    expect(
      svg.startsWith(
        '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="420" height="504" viewBox="0 0 420 504">',
      ),
    ).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(count(svg, '<polygon')).toBe(3); // A, B and C; D is on another floor
    for (const label of ['Alpha', 'Beta', 'Gamma']) expect(svg).toContain(label);
    expect(svg).not.toContain('>Up<');
    expect(titles(svg)).toEqual(['Test Area — Floor 0']);
  });

  it('draws the other floor on request', () => {
    const svg = renderAreaSVG(sampleDoc(), 'a1', 1);
    expect(count(svg, '<polygon')).toBe(1);
    expect(titles(svg)).toEqual(['Test Area — Floor 1']);
    expect(svg).toContain('Up');
  });

  it('escapes & and < in the area name and in a label (not > or quotes: that is how the Mapper has always written it)', () => {
    const svg = renderAreaSVG(sampleDoc('Area <One> & Co', ['Al<pha>', 'Be&ta', 'Gamma', 'Up']), 'a1', 0);
    expect(svg).toContain('Area &lt;One> &amp; Co — Floor 0');
    expect(svg).toContain('Al&lt;pha>');
    expect(svg).toContain('Be&amp;ta');
    expect(svg).not.toContain('Al<pha');
    expect(svg).not.toContain('Be&ta');
  });

  it('takes the picture size from the options', () => {
    const svg = renderAreaSVG(sampleDoc(), 'a1', 0, { width: 800, height: 600 });
    expect(svg).toContain('width="800"');
    expect(svg).toContain('viewBox="0 0 800');
  });

  it('draws a legend of the terrain kinds unless it is turned off, and puts it in the corner asked for', () => {
    const withLegend = renderAreaSVG(sampleDoc(), 'a1', 0);
    const without = renderAreaSVG(sampleDoc(), 'a1', 0, { includeLegend: false });
    expect(without.length).toBeLessThan(withLegend.length);
    expect(count(withLegend, '<rect')).toBeGreaterThan(count(without, '<rect'));
    // the default corner is top left; the other corners draw something else
    expect(renderAreaSVG(sampleDoc(), 'a1', 0, { legendCorner: 'tl' })).toBe(withLegend);
    expect(renderAreaSVG(sampleDoc(), 'a1', 0, { legendCorner: 'tr' })).not.toBe(withLegend);
    // KNOWN QUIRK of the original code, kept as it is by the move (docs/shattered-maps/app.md): tr, bl and br come out identical
    const others = (['tr', 'bl', 'br'] as const).map((legendCorner) =>
      renderAreaSVG(sampleDoc(), 'a1', 0, { legendCorner }),
    );
    expect(new Set(others).size).toBe(1);
    expect(renderAreaSVG(sampleDoc(), 'a1', 0, { legendMargin: 40 })).not.toBe(withLegend);
    expect(TERRAIN_ORDER.length).toBeGreaterThan(7);
  });

  it('draws a door, a one-way exit and an exit with no target without failing', () => {
    const d = doc([
      room(
        'A',
        0,
        0,
        0,
        {
          E: exit('B', { door: { type: 'simple' } }),
          S: exit('C', { door: { type: 'locked', keyId: 'k' } }),
          N: exit(null),
          NE: exit('B', { oneWay: true }),
        },
        'A',
      ),
      room('B', 1, 0, 0, { W: exit('A') }, 'B'),
      room('C', 0, 1, 0, {}, 'C'),
    ]);
    const svg = renderAreaSVG(d, 'a1', 0);
    expect(count(svg, '<polygon')).toBe(3);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('works for rooms at negative coordinates and keeps the picture the same shape as for positive ones', () => {
    const a = renderAreaSVG(doc([room('A', 0, 0, 0, { E: exit('B') }, 'A'), room('B', 1, 0, 0, {}, 'B')]), 'a1', 0);
    const b = renderAreaSVG(doc([room('A', -5, -5, 0, { E: exit('B') }, 'A'), room('B', -4, -5, 0, {}, 'B')]), 'a1', 0);
    expect(b).toBe(a);
  });

  it('draws a single room, and ignores an exit that leaves the area', () => {
    const d = doc([room('A', 0, 0, 0, { E: exit('elsewhere') }, 'Alone')]);
    const svg = renderAreaSVG(d, 'a1', 0);
    expect(count(svg, '<polygon')).toBe(1);
    expect(svg).toContain('Alone');
  });

  it('is the same every time for the same document', () => {
    expect(renderAreaSVG(sampleDoc(), 'a1', 0)).toBe(renderAreaSVG(sampleDoc(), 'a1', 0));
  });
});

describe('renderAreaSVGStacked', () => {
  it('says so when the area has no rooms', () => {
    expect(renderAreaSVGStacked(sampleDoc(), 'nope')).toBe(EMPTY);
  });

  it('draws every floor, ground first, and a title for the whole', () => {
    const svg = renderAreaSVGStacked(sampleDoc(), 'a1');
    expect(titles(svg)).toEqual(['Test Area — Floor 0', 'Test Area — Floor 1', 'Test Area — all floors']);
    expect(count(svg, '<polygon')).toBe(4); // A, B, C and D
  });

  it('orders floors above ground first (nearest first), then below ground (nearest first)', () => {
    const d = doc([
      room('A', 0, 0, 0, {}, 'A'),
      room('B', 0, 0, 2, {}, 'B'),
      room('C', 0, 0, -1, {}, 'C'),
      room('D', 0, 0, 1, {}, 'D'),
      room('E', 0, 0, -3, {}, 'E'),
    ]);
    const order = titles(renderAreaSVGStacked(d, 'a1')).filter((t) => t.includes('Floor'));
    expect(order).toEqual([
      'Test Area — Floor 0',
      'Test Area — Floor 1',
      'Test Area — Floor 2',
      'Test Area — Floor -1',
      'Test Area — Floor -3',
    ]);
  });

  it('draws floors without a ground floor too, and escapes the area name', () => {
    const d = doc([room('A', 0, 0, 2, {}, 'A')], 'Tower & <Keep>');
    const svg = renderAreaSVGStacked(d, 'a1');
    expect(titles(svg)).toEqual(['Tower &amp; &lt;Keep> — Floor 2', 'Tower &amp; &lt;Keep> — all floors']);
  });
});
