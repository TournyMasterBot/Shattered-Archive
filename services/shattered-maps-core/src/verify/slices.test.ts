import type { Link, MapFile } from '../schema.js';
import { mergeSlices } from './slices.js';

const link = (id: string): Link => ({ id, from: 'r1', dir: 'N', to: 'r2', state: 'candidate', confidence: 0.4, offPage: false, traversals: 0, reverse: false });
const slice = (continent: string, area: string, links: Link[]): MapFile => ({
  version: 1,
  continents: [{ id: continent, name: `Continent ${continent}`, areas: [{ id: area, name: `Area ${area}`, placement: null, subzones: [] }] }],
  links,
});

describe('mergeSlices', () => {
  it('puts the areas of one continent together and keeps the continents apart', () => {
    const merged = mergeSlices([slice('c1', 'a1', [link('l1')]), slice('c2', 'a2', []), slice('c1', 'a3', [link('l2')])]);
    expect(merged.continents.map((c) => [c.id, c.areas.map((a) => a.id)])).toEqual([
      ['c1', ['a1', 'a3']],
      ['c2', ['a2']],
    ]);
    expect(merged.links.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(merged.version).toBe(1);
    expect(merged).not.toHaveProperty('generatedAt');
  });

  it('keeps an area and a link that appear in two slices once, the first time', () => {
    const first = link('l1');
    const second = { ...link('l1'), confidence: 0.9 };
    const merged = mergeSlices([slice('c1', 'a1', [first]), slice('c1', 'a1', [second])], '2026-11-11');
    expect(merged.continents[0].areas).toHaveLength(1);
    expect(merged.links).toEqual([first]);
    expect(merged.generatedAt).toBe('2026-11-11');
  });

  it('is an empty map for no slices, and does not change its inputs', () => {
    expect(mergeSlices([])).toEqual({ version: 1, continents: [], links: [] });
    const input = slice('c1', 'a1', [link('l1')]);
    const before = JSON.stringify(input);
    mergeSlices([input, input]);
    expect(JSON.stringify(input)).toBe(before);
  });
});
