import { sliceMap, type MapSlice } from './hierarchy.js';
import { escapeXml, MAX_RENDER_ROOMS, renderSvg } from './render.js';
import type { MapFile } from './schema.js';
import { area, link, room, sampleMap, subzone } from './testing/fixtures.js';

/** Six rooms in two rows of three, with a confirmed link along the top row. */
function sixRooms(titleOfFirst = 'Entry Hall'): MapFile {
  const rooms = [
    room('ra', titleOfFirst, { sector: 'city', coords: { x: 0, y: 0, z: 0 }, exits: { E: 'l1' } }),
    room('rb', 'Long Gallery', { sector: 'inside', coords: { x: 1, y: 0, z: 0 }, exits: { W: 'l2', E: 'l3' } }),
    room('rc', 'Throne Room', { sector: 'inside', coords: { x: 2, y: 0, z: 0 }, exits: { W: 'l4' } }),
    room('rd', 'Pantry', { coords: { x: 0, y: 1, z: 0 } }),
    room('re', 'Kitchen', { coords: { x: 1, y: 1, z: 0 } }),
    room('rf', 'Larder', { coords: { x: 2, y: 1, z: 0 } }),
  ];
  return {
    version: 1,
    continents: [{ id: 'c1', name: 'C', areas: [area('a1', [subzone('s1', rooms)])] }],
    links: [
      link('l1', 'ra', 'E', 'rb', { state: 'confirmed', confidence: 0.95 }),
      link('l2', 'rb', 'W', 'ra', { state: 'confirmed', confidence: 0.95 }),
      link('l3', 'rb', 'E', 'rc'),
      link('l4', 'rc', 'W', 'rb', { state: 'conflict', confidence: 0, conflictTo: ['rd'] }),
    ],
  };
}

function slice(map: MapFile, level: 'area' | 'subzone' | 'room' | 'continent', id: string): MapSlice {
  const s = sliceMap(map, level, id);
  if (!s) throw new Error('no such slice');
  return s;
}

const count = (text: string, needle: string): number => text.split(needle).length - 1;

describe('renderSvg — a six-room slice', () => {
  const svg = renderSvg(slice(sixRooms(), 'subzone', 's1'), { layout: 'grid' });

  it('draws one octagon per room at the pitch of the grid, with the room id and title on it', () => {
    expect(count(svg, '<polygon data-room=')).toBe(6);
    expect(svg).toContain(
      '<polygon data-room="ra" points="51.7,40 68.3,40 80,51.7 80,68.3 68.3,80 51.7,80 40,68.3 40,51.7"',
    );
    // the next column is 100 pixels to the right (tile 40 + gap 4 + label room 56)
    expect(svg).toContain(
      '<polygon data-room="rb" points="151.7,40 168.3,40 180,51.7 180,68.3 168.3,80 151.7,80 140,68.3 140,51.7"',
    );
    expect(svg).toContain('<title>Entry Hall</title>');
  });

  it('sizes the picture to the content, with a minimum, and says what it shows', () => {
    expect(svg).toContain('viewBox="0 0 420 260" width="420" height="260"');
    expect(svg).toContain(
      'role="img" aria-label="Area a1: Subzone s1" data-layout="grid" data-level="subzone" data-floor="0"',
    );
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('colours a tile by its sector, and uses a plain fill for a sector it does not know', () => {
    expect(svg).toMatch(/data-room="ra"[^>]*data-sector="city"[^>]*fill="#7E8796"/);
    expect(svg).toMatch(/data-room="rb"[^>]*data-sector="inside"[^>]*fill="#6F6BA8"/);
    expect(svg).toMatch(/data-room="rd"[^>]*fill="#dde1e6"/);
    expect(svg).not.toMatch(/data-room="rd"[^>]*data-sector/);
    // the key: the terrains on the floor, in palette order
    expect(svg).toMatch(/<svg [^>]*data-sectors="inside,city[^"]*"/);
    for (const sector of ['__proto__', 'constructor', 'toString']) {
      const odd = sixRooms();
      odd.continents[0].areas[0].subzones[0].rooms[0].sector = sector;
      expect(renderSvg(slice(odd, 'subzone', 's1'), { layout: 'grid' })).toMatch(/data-room="ra"[^>]*fill="#dde1e6"/);
    }
  });

  it('draws a link in the style of its state', () => {
    expect(svg).toMatch(/<line data-link="l1" data-state="confirmed"[^>]*stroke="#3d7a4a" stroke-width="1.5"\/>/);
    expect(svg).toMatch(
      /<line data-link="l3" data-state="candidate"[^>]*stroke="#7a8190" stroke-width="1.5" stroke-dasharray="5 3"\/>/,
    );
    expect(svg).toMatch(
      /<line data-link="l4" data-state="conflict"[^>]*stroke="#c0392b" stroke-width="2" stroke-dasharray="2 2"\/>/,
    );
  });

  it('escapes `<` and `&` (and quotes) in a label, in the text and in the tooltip', () => {
    const hostile = renderSvg(slice(sixRooms('Fish & Chips <b>'), 'subzone', 's1'), { layout: 'grid' });
    expect(hostile).toContain('>Fish &amp; Chips &lt;b&gt;</text>');
    expect(hostile).toContain('<title>Fish &amp; Chips &lt;b&gt;</title>');
    expect(hostile).not.toContain('<b>');
    const quoted = sixRooms();
    const s = slice(quoted, 'subzone', 's1');
    s.title = `"Q" & 'A' <script>`;
    const out = renderSvg(s, { layout: 'grid' });
    expect(out).toContain('aria-label="&quot;Q&quot; &amp; &#39;A&#39; &lt;script&gt;"');
    expect(out).toContain('<title>&quot;Q&quot; &amp; &#39;A&#39; &lt;script&gt;</title>');
  });

  it('writes no script, style sheet, link or event handler', () => {
    expect(svg).not.toMatch(/<script|<style|href=|javascript:|\son[a-z]+=|<foreignObject|<image/i);
  });

  it('can leave the labels out', () => {
    const bare = renderSvg(slice(sixRooms(), 'subzone', 's1'), { layout: 'grid', labels: false });
    expect(bare).toContain('<g data-layer="labels"></g>');
    // without labels the rows sit closer (pitch 44, not 76) and there is no room kept under the last row
    expect(bare).toContain('viewBox="0 0 420 164"');
    expect(svg).not.toContain('<g data-layer="labels"></g>');
  });

  it('uses the grid by default and a valid tile size only', () => {
    const base = renderSvg(slice(sixRooms(), 'subzone', 's1'));
    expect(base).toBe(svg);
    for (const tile of [Number.NaN, 2, 500, Infinity])
      expect(renderSvg(slice(sixRooms(), 'subzone', 's1'), { layout: 'grid', tile })).toBe(svg);
    const big = renderSvg(slice(sixRooms(), 'subzone', 's1'), { layout: 'grid', tile: 60 });
    expect(big).not.toBe(svg);
    expect(big).toContain('<polygon data-room="ra"');
  });
});

describe('renderSvg — no hexagons', () => {
  it('draws every room as an octagon: the game has eight compass directions, so a six-sided tile is not offered', () => {
    const svg = renderSvg(slice(sixRooms(), 'subzone', 's1'), { layout: 'grid', labels: false });
    for (const m of svg.matchAll(/<polygon data-room="[^"]*" points="([^"]*)"/g)) expect(m[1].trim().split(/\s+/)).toHaveLength(8);
  });

  it('draws octagons even when a saved setting still says hexagons (the old layout name is ignored, not an error)', () => {
    const svg = renderSvg(slice(sixRooms(), 'subzone', 's1'), { layout: 'hex' as unknown as 'grid', labels: false });
    expect(/<polygon data-room="ra" points="([^"]*)"/.exec(svg)?.[1]?.trim().split(/\s+/)).toHaveLength(8);
  });
});

describe('renderSvg — floors, context and marks', () => {
  const town = slice(sampleMap(), 'area', 'town');

  it('draws the lowest floor by default and a chosen floor on request', () => {
    const lowest = renderSvg(town, { layout: 'grid' });
    expect(lowest).toContain('data-floor="-1"');
    expect(count(lowest, '<polygon data-room=')).toBe(1);
    expect(lowest).toContain('data-room="r5"');
    const ground = renderSvg(town, { layout: 'grid', z: 0 });
    expect(count(ground, '<polygon data-room=')).toBe(4);
    expect(ground).toContain('data-floor="0"');
    expect(renderSvg(town, { layout: 'grid', z: 7 })).toContain('No room on floor 7');
  });

  it('marks stairs, unknown exits and links that leave the slice', () => {
    const ground = renderSvg(town, { layout: 'grid', z: 0 });
    // r3 has a way down; r1 has an unknown north exit; r4 has an east exit into another area
    expect(count(ground, 'data-stairs="down"')).toBe(1);
    expect(count(ground, 'data-stairs="up"')).toBe(0);
    expect(count(ground, '>?</text>')).toBe(1);
    expect(count(ground, '>→</text>')).toBe(1);
    expect(ground).toMatch(/<g data-link="l-r1-n" data-state="unknown-target"><circle [^>]*r="8" fill="#fff"[^>]*\/><text [^>]*>\?<\/text><title>This exit goes somewhere nobody has followed yet.<\/title><\/g>/);
    expect(ground).toMatch(/<g data-link="l-r4-e" data-state="candidate" data-offpage-to="[^"]*"><circle [^>]*r="8" fill="#fff"[^>]*\/><text [^>]*>→<\/text><title>This exit leads into another area\./);
    // a stair link has no line, and the walked links are drawn between their rooms
    expect(ground).not.toContain('data-link="l-r3-d"');
    expect(count(ground, '<line data-link=')).toBe(4); // the two exits that are chips (unknown, leaves the area) are not lines
    const cellar = renderSvg(town, { layout: 'grid', z: -1 });
    expect(count(cellar, 'data-stairs=')).toBe(0);
  });

  it('shows an up exit with its mark', () => {
    const map = sampleMap();
    const s = slice(map, 'room', 'r5');
    s.links.push(link('l-up', 'r5', 'U', 'r3'));
    expect(renderSvg(s, { layout: 'grid' })).toContain('data-stairs="up" data-stairs-to="r3"');
  });

  it('draws the focus room of a room view with a heavier outline, and neighbours from other areas dimmed', () => {
    const svg = renderSvg(slice(sampleMap(), 'room', 'r4'), { layout: 'grid' });
    expect(svg).toMatch(
      /data-room="r4" data-focus="true" points="[^"]*" data-sector="city" fill="#7E8796" stroke="#1d4ed8" stroke-width="2.5"/,
    );
    expect(svg).toMatch(
      /data-room="r6" data-context="true" points="[^"]*" data-sector="forest" fill="#2E6B4F" stroke="#556" stroke-width="1" opacity="0.7"/,
    );
    expect(svg).toContain('data-level="room"');
  });

  it('draws the floor of the focus room in a room view', () => {
    const svg = renderSvg(slice(sampleMap(), 'room', 'r5'), { layout: 'grid' });
    expect(svg).toContain('data-floor="-1"');
    expect(count(svg, '<polygon data-room=')).toBe(1);
  });

  it('writes a plain 0 for a negative zero and never NaN', () => {
    const map = sixRooms();
    map.continents[0].areas[0].subzones[0].rooms[0].coords = { x: -0, y: 0, z: 0 };
    const svg = renderSvg(slice(map, 'subzone', 's1'), { layout: 'grid' });
    expect(svg).not.toMatch(/-0[ ,"]|NaN|Infinity/);
  });
});

describe('renderSvg — odd input', () => {
  it('reads a room with no floor as floor 0, in an area view and in a room view', () => {
    const map = sixRooms();
    for (const r of map.continents[0].areas[0].subzones[0].rooms)
      r.coords = { x: r.coords?.x ?? 0, y: r.coords?.y ?? 0 };
    expect(count(renderSvg(slice(map, 'subzone', 's1'), { layout: 'grid' }), '<polygon data-room=')).toBe(6);
    const focus = renderSvg(slice(map, 'room', 'rb'), { layout: 'grid' });
    expect(focus).toContain('data-floor="0"');
    expect(focus).toContain('data-focus="true"');
  });

  it('writes a floor that is not a number as 0 instead of NaN', () => {
    const svg = renderSvg(slice(sixRooms(), 'subzone', 's1'), { layout: 'grid', z: Number.NaN });
    expect(svg).toContain('No room on floor 0');
    expect(svg).not.toContain('NaN');
  });

  it('draws no stub or mark for a link to a room that is on another floor and not off the page', () => {
    const map = sixRooms();
    map.continents[0].areas[0].subzones[0].rooms[2].coords = { x: 2, y: 0, z: 1 };
    const svg = renderSvg(slice(map, 'subzone', 's1'), { layout: 'grid', z: 0 });
    expect(count(svg, '<polygon data-room=')).toBe(5);
    expect(svg).toMatch(/<line data-link="l3" data-state="candidate"[^>]*stroke-dasharray="3 3"\/>/);
    expect(svg).not.toContain('>→</text>');
    expect(svg).not.toContain('>?</text>');
  });

  it('draws an area whose name is only spaces without a label rather than failing', () => {
    const map = sampleMap();
    map.continents[0].areas[0].name = '   ';
    map.continents[0].areas[0].placement = { x: 0, y: 0, w: 6, h: 3 };
    const svg = renderSvg(slice(map, 'continent', 'c1'), { layout: 'grid' });
    expect(svg).toContain('data-area="town"');
    expect(svg).not.toMatch(/<text [^>]*>\s*<\/text>/);
  });
});

describe('renderSvg — nothing to draw', () => {
  it('says so for an empty slice', () => {
    const empty = renderSvg(slice(sixRooms(), 'subzone', 's1'), { layout: 'grid' });
    expect(empty).toContain('<polygon');
    const s: MapSlice = {
      level: 'subzone',
      id: 'x',
      title: 'Empty <place>',
      areas: [],
      rooms: [],
      links: [],
      unplaced: [],
      derivedCoords: false,
    };
    const svg = renderSvg(s, { layout: 'grid' });
    expect(svg).toContain('>Nothing mapped here yet</text>');
    expect(svg).toContain('aria-label="Empty &lt;place&gt;"');
    expect(svg).not.toContain('<polygon');
  });

  it('says so when no room has a position', () => {
    const map = sixRooms();
    for (const r of map.continents[0].areas[0].subzones[0].rooms) delete r.coords;
    expect(renderSvg(slice(map, 'subzone', 's1'), { layout: 'grid' })).toContain(
      '>No room here has a position yet</text>',
    );
  });

  it('draws nothing when a floor has more rooms than the cap', () => {
    const rooms = Array.from({ length: MAX_RENDER_ROOMS + 1 }, (_, i) => ({
      ...room(`r${i}`, 'X'),
      coords: { x: i, y: 0, z: 0 },
    }));
    const s: MapSlice = {
      level: 'area',
      id: 'a',
      title: 'Huge',
      areas: [],
      rooms,
      links: [],
      unplaced: [],
      derivedCoords: false,
    };
    const svg = renderSvg(s, { layout: 'grid' });
    expect(svg).toContain('Too many rooms to draw (5001); pick a smaller area');
    expect(svg).not.toContain('<polygon');
    expect(svg.length).toBeLessThan(1_000);
    expect(renderSvg({ ...s, rooms: rooms.slice(0, MAX_RENDER_ROOMS) }, { layout: 'grid', labels: false })).toContain(
      '<polygon',
    );
  });
});

describe('renderSvg — a continent', () => {
  it('draws each placed area at its written box and lists the areas that are not placed', () => {
    const map = sampleMap();
    map.continents[0].areas[0].placement = { x: 0, y: 0, w: 6, h: 3 };
    const svg = renderSvg(slice(map, 'continent', 'c1'), { layout: 'grid' });
    expect(svg).toMatch(/<rect data-area="town"[^>]* x="40" y="40" width="92" height="44" rx="3"/);
    expect(svg).toContain('<title>Area town (5 rooms)</title>');
    expect(svg).toContain('>Area town</text>');
    expect(svg).toContain('data-unplaced="areas">Not placed yet: Area forest</text>');
    expect(svg).toContain('data-level="continent"');
    expect(svg).not.toContain('data-area="forest"');
  });

  it('draws areas on the continent grid relative to the smallest placement, with a default size of one cell (16 pixels)', () => {
    const map = sampleMap();
    map.continents[0].areas[1].placement = { x: 3, y: 2 };
    const svg = renderSvg(slice(map, 'continent', 'c1'), { layout: 'grid' });
    expect(svg).toMatch(/<rect data-area="forest"[^>]* x="88" y="72" width="12" height="12"/);
    expect(svg).not.toContain('Not placed yet');
  });

  it('draws every area as a box, whatever layout a saved setting names: no hexagons on a continent either', () => {
    const map = sampleMap();
    map.continents[0].areas[0].placement = { x: 0, y: 0, w: 6, h: 3 };
    const svg = renderSvg(slice(map, 'continent', 'c1'), { layout: 'hex' as unknown as 'grid' });
    expect(svg).toMatch(/<rect data-area="town"/);
    expect(svg).not.toContain('<polygon data-area');
    expect(svg).toContain('<title>Area town (5 rooms)</title>');
    expect(svg).toContain('>Area town</text>');
  });

  it('names the first few unplaced areas and counts the rest, so the line stays short', () => {
    const map = sampleMap();
    const forest = map.continents[0].areas[1];
    map.continents[0].areas.push(
      ...Array.from({ length: 5 }, (_, i) => ({ ...forest, id: `extra${i}`, name: `Extra ${i}`, subzones: [] })),
    );
    const svg = renderSvg(slice(map, 'continent', 'c1'), { layout: 'grid' });
    expect(svg).toContain('data-unplaced="areas">Not placed yet: Area forest, Extra 0, Extra 1, Extra 2 and 2 more</text>');
    expect(svg).not.toContain('Extra 3');
    // exactly the limit: all named, nothing counted
    const four = sampleMap();
    four.continents[0].areas.push(
      ...Array.from({ length: 3 }, (_, i) => ({ ...four.continents[0].areas[1], id: `e${i}`, name: `E${i}`, subzones: [] })),
    );
    expect(renderSvg(slice(four, 'continent', 'c1'), { layout: 'grid' })).toContain('Not placed yet: Area forest, E0, E1, E2</text>');
  });

  it('escapes an area name and says so for a continent with no areas', () => {
    const map = sampleMap();
    map.continents[0].areas[0].name = 'Rock & <Roll>';
    map.continents[0].areas[1].name = 'Never "placed" <x>';
    const svg = renderSvg(slice(map, 'continent', 'c1'), { layout: 'grid' });
    expect(svg).toContain('Rock &amp; &lt;Roll&gt; (5 rooms)');
    expect(svg).toContain('Not placed yet: Never &quot;placed&quot; &lt;x&gt;');
    expect(svg).not.toContain('<Roll>');
    const none = slice(
      { version: 1, continents: [{ id: 'c1', name: 'Empty', areas: [] }], links: [] },
      'continent',
      'c1',
    );
    expect(renderSvg(none, { layout: 'grid' })).toContain('Nothing mapped here yet');
  });

  it('fits an area name to its box: as many lines as fit, an ellipsis where the name goes on, a single long word cut (the tooltip has the whole name)', () => {
    const map = sampleMap();
    map.continents[0].areas[0].placement = { x: 0, y: 0, w: 8, h: 2 };
    map.continents[0].areas[0].name = 'The Extraordinarily Long Name of a Place';
    const words = renderSvg(slice(map, 'continent', 'c1'), { layout: 'grid' });
    expect(words).toContain('>The Extraordinarily Long</text>'); // the type shrinks to 8 px for the longest word, so two lines hold the whole name
    expect(words).toContain('>Name of a Place</text>');
    expect(words).toContain('<title>The Extraordinarily Long Name of a Place (5 rooms)</title>');
    map.continents[0].areas[0].name = 'Supercalifragilisticexpialidocious';
    expect(renderSvg(slice(map, 'continent', 'c1'), { layout: 'grid' })).toContain('>Supercalifragilisticexp…</text>');
    map.continents[0].areas[0].name = 'Aaa Bbb Ccc Ddd Eee Fff Ggg Hhh Iii Jjj Kkk Lll Mmm Nnn Ooo Ppp Qqq Rrr';
    const long = renderSvg(slice(map, 'continent', 'c1'), { layout: 'grid' });
    expect(long).toMatch(/>[^<]*…<\/text>/); // the name goes on past the last line: it ends with an ellipsis
  });

  it('writes no name in a box too small for even a short word, so a name never spills onto its neighbour', () => {
    const map = sampleMap();
    map.continents[0].areas[0].placement = { x: 0, y: 0, w: 2, h: 1 };
    const svg = renderSvg(slice(map, 'continent', 'c1'), { layout: 'grid' });
    expect(svg).not.toContain('>Area town</text>');
    expect(svg).toContain('<title>Area town (5 rooms)</title>');
  });

  it('grows the name with the box and wraps it to the lines that fit: a small box 8 px, a big one 22 px wrapped by words', () => {
    const map = sampleMap();
    map.continents[0].areas[0].placement = { x: 0, y: 0, w: 8, h: 2 };
    map.continents[0].areas[0].name = 'Tiny Hut';
    const small = renderSvg(slice(map, 'continent', 'c1'), { layout: 'grid' });
    expect(small).toContain('font-size="8" font-family="sans-serif" pointer-events="none">Tiny Hut</text>');
    map.continents[0].areas[0].placement = { x: 0, y: 0, w: 30, h: 20 };
    map.continents[0].areas[0].name = 'Big Forest Of The Great Old Kings And Queens';
    const big = renderSvg(slice(map, 'continent', 'c1'), { layout: 'grid' });
    expect(big).toContain('font-size="22" font-family="sans-serif" pointer-events="none">Big Forest Of The Great Old Kings</text>');
    expect(big).toContain('font-size="22" font-family="sans-serif" pointer-events="none">And Queens</text>');
    expect(big).toContain('<title>Big Forest Of The Great Old Kings And Queens (5 rooms)</title>');
  });
});

describe('escapeXml', () => {
  it('escapes the five characters that matter in element content and in attributes', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
    expect(escapeXml('plain')).toBe('plain');
    expect(escapeXml('&amp;')).toBe('&amp;amp;');
  });
});
