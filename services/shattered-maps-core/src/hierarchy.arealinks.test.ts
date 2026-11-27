import { areaLinksOf, sliceMap } from './hierarchy.js';
import type { MapFile } from './schema.js';
import { area, link, room, subzone } from './testing/fixtures.js';

const rooms = (id: string) => [room(`${id}1`, `${id}1`, { coords: { x: 0, y: 0, z: 0 } }), room(`${id}2`, `${id}2`, { coords: { x: 1, y: 0, z: 0 } })];
const map: MapFile = {
  version: 1,
  continents: [
    { id: 'c', name: 'C', areas: [area('a', [subzone('as', rooms('a'))]), area('b', [subzone('bs', rooms('b'))])] },
    { id: 'd', name: 'D', areas: [area('z', [subzone('zs', rooms('z'))])] },
  ],
  links: [
    link('1', 'a1', 'E', 'b1'),
    link('2', 'a2', 'E', 'b1'),
    link('3', 'b1', 'W', 'a1'),
    link('4', 'a1', 'E', 'a2'), // inside one area: not counted
    link('5', 'a1', 'N', null), // not followed: not counted
    link('6', 'a2', 'S', 'z1'), // into another continent
    link('7', 'a2', 'W', 'nowhere'), // a room the map does not have: not counted
  ],
};

describe('the exits between the areas of a continent', () => {
  it('counts followed exits that leave an area, per pair and direction, in a stable order', () => {
    expect(areaLinksOf(map)).toEqual([
      { from: 'a', to: 'b', dir: 'E', count: 2 },
      { from: 'a', to: 'z', dir: 'S', count: 1 },
      { from: 'b', to: 'a', dir: 'W', count: 1 },
    ]);
  });

  it('puts the ones between the areas of a continent in its slice, and none that leave the continent', () => {
    const slice = sliceMap(map, 'continent', 'c');
    expect(slice?.areaLinks).toEqual([
      { from: 'a', to: 'b', dir: 'E', count: 2 },
      { from: 'b', to: 'a', dir: 'W', count: 1 },
    ]);
  });

  it('sorts several directions of one pair by direction', () => {
    const both: MapFile = { ...map, links: [link('1', 'a1', 'S', 'b1'), link('2', 'a1', 'E', 'b2')] };
    expect(areaLinksOf(both).map((l) => l.dir)).toEqual(['E', 'S']);
  });
});
