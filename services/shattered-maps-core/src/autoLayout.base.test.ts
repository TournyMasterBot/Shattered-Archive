import { autoSpec } from './autoLayout.js';
import { layoutContinent } from './continentLayout.js';
import type { Direction, Link, MapFile, Room } from './schema.js';
import { area, link, room, subzone } from './testing/fixtures.js';

const r = (id: string): Room => room(id, id, { coords: { x: 0, y: 0, z: 0 } });
function world(areas: Record<string, string[]>, links: Link[]): MapFile {
  return { version: 1, continents: [{ id: 'c', name: 'C', areas: Object.entries(areas).map(([id, ids]) => area(id, [subzone(`${id}-s`, ids.map(r))])) }], links };
}
const l = (id: string, from: string, dir: Direction, to: string | null) => link(id, from, dir, to);

describe('autoSpec: building on an owner spec and sizing the boxes', () => {
  // the owner placed east of hub; far and north are not in the owner spec but are joined by exits
  const map = world(
    { hub: ['h1', 'h2', 'h3'], east: ['e1'], far: ['f1'], north: ['n1'], island: ['i1'] },
    [l('1', 'h1', 'E', 'e1'), l('2', 'e1', 'E', 'f1'), l('3', 'h2', 'N', 'n1')],
  );
  const owner = { center: 'hub', relations: [{ area: 'east', of: 'hub', dir: 'E' as const }], gap: 3, sizeBy: 'extent' as const };

  it('keeps the owner relations as written and relates the rest outward from the areas the owner placed', () => {
    const spec = autoSpec(map, 'c', { base: owner }) as NonNullable<ReturnType<typeof autoSpec>>;
    expect(spec.center).toBe('hub');
    expect(spec.relations[0]).toEqual({ area: 'east', of: 'hub', dir: 'E' });
    expect(spec.relations).toContainEqual({ area: 'far', of: 'east', dir: 'E' });
    expect(spec.relations).toContainEqual({ area: 'north', of: 'hub', dir: 'N' });
    // an area no exit reaches is left out: it keeps its place
    expect(spec.relations.some((rel) => rel.area === 'island')).toBe(false);
  });

  it('takes the gap and the size mode of the owner spec unless told otherwise', () => {
    expect(autoSpec(map, 'c', { base: owner })).toMatchObject({ gap: 3, sizeBy: 'extent' });
    expect(autoSpec(map, 'c', { base: owner, gap: 2, sizeBy: 'rooms' })).toMatchObject({ gap: 2, sizeBy: 'rooms' });
  });

  it('passes the cells per room on, from the options or from the owner spec', () => {
    expect(autoSpec(map, 'c', { cellsPerRoom: 0.8 })?.cellsPerRoom).toBe(0.8);
    expect(autoSpec(map, 'c', { base: { ...owner, cellsPerRoom: 0.5 } })?.cellsPerRoom).toBe(0.5);
    expect(autoSpec(map, 'c')).not.toHaveProperty('cellsPerRoom');
  });

  it('ignores owner relations that name an area the continent does not have, and a centre it does not have', () => {
    const odd = { center: 'hub', relations: [{ area: 'ghost', of: 'hub', dir: 'W' as const }, { area: 'east', of: 'hub', dir: 'E' as const }] };
    expect(autoSpec(map, 'c', { base: odd })?.relations.some((rel) => rel.area === 'ghost')).toBe(false);
    expect(autoSpec(map, 'c', { base: { center: 'nowhere', relations: [] } })?.center).toBe('hub');
  });

  it('keeps an owner-placed area that no exit reaches, and walks on from the others', () => {
    const placed = { center: 'hub', relations: [{ area: 'island', of: 'hub', dir: 'W' as const }] };
    const spec = autoSpec(map, 'c', { base: placed }) as NonNullable<ReturnType<typeof autoSpec>>;
    expect(spec.relations[0]).toEqual({ area: 'island', of: 'hub', dir: 'W' });
    expect(spec.relations.map((rel) => rel.area)).toEqual(['island', 'east', 'north', 'far']);
  });

  it('returns the owner spec when no exit joins two areas, and nothing without one', () => {
    const alone = world({ a: ['a1'], b: ['b1'] }, []);
    expect(autoSpec(alone, 'c', { base: { center: 'a', relations: [] } })).toEqual({ center: 'a', relations: [], gap: 1, sizeBy: 'rooms' });
    expect(autoSpec(alone, 'c')).toBeNull();
  });

  it('a smaller cells-per-room makes every box smaller and keeps their order of size', () => {
    const boxes = [
      { id: 'a', x: 0, y: 0, w: 4, h: 4, rooms: 100 },
      { id: 'b', x: 10, y: 0, w: 4, h: 4, rooms: 10 },
    ];
    const relations = [{ area: 'b', of: 'a', dir: 'E' as const }];
    const big = layoutContinent(boxes, { center: 'a', relations, sizeBy: 'rooms' });
    const small = layoutContinent(boxes, { center: 'a', relations, sizeBy: 'rooms', cellsPerRoom: 0.4 });
    const side = (res: typeof big, id: string) => (res.placements.get(id) as { w: number }).w;
    expect(side(small, 'a')).toBeLessThan(side(big, 'a'));
    expect(side(small, 'a')).toBeGreaterThan(side(small, 'b'));
  });
});
