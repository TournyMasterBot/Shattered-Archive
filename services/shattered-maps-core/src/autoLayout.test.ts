import { autoSpec } from './autoLayout.js';
import { layoutContinent } from './continentLayout.js';
import type { Direction, Link, MapFile, Room } from './schema.js';
import { area, link, room, subzone } from './testing/fixtures.js';

const r = (id: string): Room => room(id, id, { coords: { x: 0, y: 0, z: 0 } });
function world(areas: Record<string, string[]>, links: Link[], second: Record<string, string[]> = {}): MapFile {
  const mk = (rec: Record<string, string[]>) => Object.entries(rec).map(([id, ids]) => area(id, [subzone(`${id}-s`, ids.map(r))]));
  return {
    version: 1,
    continents: [
      { id: 'c', name: 'C', areas: mk(areas) },
      ...(Object.keys(second).length > 0 ? [{ id: 'd', name: 'D', areas: mk(second) }] : []),
    ],
    links,
  };
}
const l = (id: string, from: string, dir: Direction, to: string | null) => link(id, from, dir, to);

describe('autoSpec: a layout spec from the links between areas', () => {
  const chain = world(
    { hub: ['h1', 'h2', 'h3'], east: ['e1'], farEast: ['f1'], north: ['n1', 'n2'] },
    [l('1', 'h1', 'E', 'e1'), l('2', 'e1', 'W', 'h1'), l('3', 'e1', 'E', 'f1'), l('4', 'h2', 'N', 'n1')],
  );

  it('starts from the biggest connected area and places the rest in the direction of the exits, outward', () => {
    const spec = autoSpec(chain, 'c') as NonNullable<ReturnType<typeof autoSpec>>;
    expect(spec.center).toBe('hub');
    expect(spec.relations).toEqual([
      { area: 'east', of: 'hub', dir: 'E' },
      { area: 'north', of: 'hub', dir: 'N' },
      { area: 'farEast', of: 'east', dir: 'E' },
    ]);
    expect(spec).toMatchObject({ gap: 1, sizeBy: 'rooms' });
  });

  it('reads an exit that only the other area has, as the opposite direction', () => {
    const spec = autoSpec(world({ a: ['a1', 'a2'], b: ['b1'] }, [l('1', 'b1', 'W', 'a1')]), 'c');
    expect(spec?.relations).toEqual([{ area: 'b', of: 'a', dir: 'E' }]);
  });

  it('takes the direction most exits agree on, and the first compass direction on a tie', () => {
    const many = autoSpec(world({ a: ['a1', 'a2', 'a3'], b: ['b1'] }, [l('1', 'a1', 'E', 'b1'), l('2', 'a2', 'E', 'b1'), l('3', 'a3', 'S', 'b1')]), 'c');
    expect(many?.relations[0].dir).toBe('E');
    const tie = autoSpec(world({ a: ['a1', 'a2', 'a3'], b: ['b1'] }, [l('1', 'a1', 'S', 'b1'), l('2', 'a2', 'E', 'b1')]), 'c');
    expect(tie?.relations[0].dir).toBe('E'); // E comes before S in compass order
  });

  it('counts up and down as north and south, so a stair-only pair still gets a place', () => {
    expect(autoSpec(world({ a: ['a1', 'a2'], b: ['b1'] }, [l('1', 'a1', 'U', 'b1')]), 'c')?.relations).toEqual([{ area: 'b', of: 'a', dir: 'N' }]);
    expect(autoSpec(world({ a: ['a1', 'a2'], b: ['b1'] }, [l('1', 'a1', 'D', 'b1')]), 'c')?.relations).toEqual([{ area: 'b', of: 'a', dir: 'S' }]);
  });

  it('visits the strongest connection first and breaks ties by id', () => {
    const spec = autoSpec(
      world({ hub: ['h1', 'h2', 'h3'], b: ['b1'], a: ['a1'], c: ['c1'] }, [l('1', 'h1', 'N', 'b1'), l('2', 'h2', 'E', 'a1'), l('3', 'h3', 'S', 'c1'), l('4', 'h3', 'S', 'c1')]),
      'c',
    );
    expect(spec?.relations.map((x) => x.area)).toEqual(['c', 'a', 'b']);
  });

  it('ignores links inside an area, links with no target, links to rooms of another continent, and areas nothing joins', () => {
    const map = world(
      { a: ['a1', 'a2'], b: ['b1'], lone: ['x1'] },
      [l('1', 'a1', 'E', 'a2'), l('2', 'a1', 'N', null), l('3', 'a1', 'S', 'z1'), l('4', 'a2', 'E', 'b1')],
      { other: ['z1'] },
    );
    const spec = autoSpec(map, 'c');
    expect(spec?.relations).toEqual([{ area: 'b', of: 'a', dir: 'E' }]);
    expect(spec?.relations.map((x) => x.area)).not.toContain('lone');
  });

  it('is null for an unknown continent and for one whose areas no link joins', () => {
    expect(autoSpec(chain, 'nope')).toBeNull();
    expect(autoSpec(world({ a: ['a1'], b: ['b1'] }, [l('1', 'a1', 'E', 'a2')]), 'c')).toBeNull();
  });

  it('honours the options, and feeds layoutContinent without overlap', () => {
    const spec = autoSpec(chain, 'c', { gap: 2, sizeBy: 'extent' }) as NonNullable<ReturnType<typeof autoSpec>>;
    expect(spec).toMatchObject({ gap: 2, sizeBy: 'extent' });
    const boxes = [
      { id: 'hub', x: 0, y: 0, w: 4, h: 4, rooms: 3 },
      { id: 'east', x: 0, y: 0, w: 3, h: 3, rooms: 1 },
      { id: 'farEast', x: 0, y: 0, w: 3, h: 3, rooms: 1 },
      { id: 'north', x: 0, y: 0, w: 3, h: 3, rooms: 2 },
    ];
    const out = layoutContinent(boxes, spec);
    expect(out.overlapsAfter).toBe(0);
    expect((out.placements.get('east')?.x ?? 0) > (out.placements.get('hub')?.x ?? 99)).toBe(true);
  });
});
