import { validateMapFile } from '@shatteredarchive/shattered-maps-core';
import { candidatesMap } from '../testing/neutralFixtures';
import { breadcrumb, busiestFloor, children, defaultFocus, floorsOf, zoomIn, zoomOut } from './zoom';

const map = candidatesMap();

describe('the fixture', () => {
  it('is a valid neutral map file (so the tests below are about real files)', () => {
    const verdict = validateMapFile(map);
    expect(verdict.ok ? [] : verdict.errors).toEqual([]);
  });
});

describe('defaultFocus', () => {
  it('opens on the first continent, and on nothing for an empty map', () => {
    expect(defaultFocus(map)).toEqual({ level: 'continent', id: 'c-green' });
    expect(defaultFocus({ version: 1, continents: [], links: [] })).toBeNull();
  });
});

describe('breadcrumb', () => {
  it('lists the path from the continent down, at every level', () => {
    expect(breadcrumb(map, { level: 'continent', id: 'c-green' }).map((c) => c.name)).toEqual(['Greenmarch']);
    expect(breadcrumb(map, { level: 'area', id: 'a-farm' }).map((c) => [c.level, c.name])).toEqual([
      ['continent', 'Greenmarch'],
      ['area', 'North Farm'],
    ]);
    expect(breadcrumb(map, { level: 'subzone', id: 's-cellar' }).map((c) => c.name)).toEqual(['Greenmarch', 'North Farm', 'Cellar']);
    expect(breadcrumb(map, { level: 'room', id: 'r-quay' }).map((c) => c.name)).toEqual(['Greenmarch', 'Harbor', 'Quay', 'The Quay']);
  });

  it('is empty for something that is not in the map, or for a merged-away room', () => {
    for (const focus of [
      { level: 'continent', id: 'nope' },
      { level: 'area', id: 'nope' },
      { level: 'subzone', id: 'nope' },
      { level: 'room', id: 'nope' },
      { level: 'room', id: 'r-old' },
    ] as const)
      expect(breadcrumb(map, focus)).toEqual([]);
  });
});

describe('zoomOut', () => {
  it('goes up one level at a time, and stops at the continent', () => {
    expect(zoomOut(map, { level: 'room', id: 'r-barn' })).toEqual({ level: 'subzone', id: 's-fields' });
    expect(zoomOut(map, { level: 'subzone', id: 's-fields' })).toEqual({ level: 'area', id: 'a-farm' });
    expect(zoomOut(map, { level: 'area', id: 'a-farm' })).toEqual({ level: 'continent', id: 'c-green' });
    expect(zoomOut(map, { level: 'continent', id: 'c-green' })).toBeNull();
    expect(zoomOut(map, { level: 'room', id: 'nope' })).toBeNull();
  });
});

describe('children and zoomIn', () => {
  it('lists what lies below, with room counts that leave out merged-away rooms', () => {
    expect(children(map, { level: 'continent', id: 'c-green' })).toEqual([
      { level: 'area', id: 'a-farm', name: 'North Farm', rooms: 4 },
      { level: 'area', id: 'a-harbor', name: 'Harbor', rooms: 1 },
    ]);
    expect(children(map, { level: 'area', id: 'a-farm' })).toEqual([
      { level: 'subzone', id: 's-fields', name: 'Fields', rooms: 3 },
      { level: 'subzone', id: 's-cellar', name: 'Cellar', rooms: 1 },
    ]);
    expect(children(map, { level: 'subzone', id: 's-fields' }).map((c) => c.name)).toEqual(['The Gate', 'The Barn', 'The Well']);
    expect(children(map, { level: 'room', id: 'r-gate' })).toEqual([]);
    expect(children(map, { level: 'subzone', id: 'nope' })).toEqual([]);
    expect(children(map, { level: 'continent', id: 'nope' })).toEqual([]);
    expect(children(map, { level: 'area', id: 'nope' })).toEqual([]);
  });

  it('lists the areas that hold rooms first, in the file\'s order, and the empty ones after them', () => {
    const catalog = JSON.parse(JSON.stringify(map));
    catalog.continents[0].areas.unshift({ id: 'a-empty', name: 'Unmapped', placement: null, subzones: [{ id: 's-none', name: 'Main', kind: 'consistent', rooms: [] }] });
    catalog.continents[0].areas.push({ id: 'a-gone', name: 'Gone', placement: null, subzones: [] });
    expect(children(catalog, { level: 'continent', id: 'c-green' }).map((c) => [c.name, c.rooms])).toEqual([
      ['North Farm', 4],
      ['Harbor', 1],
      ['Unmapped', 0],
      ['Gone', 0],
    ]);
  });

  it('zooms into a named child, into an only child, and nowhere when there is a choice', () => {
    expect(zoomIn(map, { level: 'continent', id: 'c-green' }, 'a-harbor')).toEqual({ level: 'area', id: 'a-harbor' });
    expect(zoomIn(map, { level: 'area', id: 'a-harbor' })).toEqual({ level: 'subzone', id: 's-quay' });
    expect(zoomIn(map, { level: 'area', id: 'a-farm' })).toBeNull();
    expect(zoomIn(map, { level: 'area', id: 'a-farm' }, 'a-harbor')).toBeNull();
    expect(zoomIn(map, { level: 'room', id: 'r-gate' })).toBeNull();
  });
});

describe('floors', () => {
  it('counts the placed rooms on each floor, ascending, and ignores rooms with no position', () => {
    const rooms = [{ coords: { z: 1 } }, { coords: {} }, { coords: { z: -1 } }, { coords: { z: 1 } }, {}];
    expect(floorsOf(rooms)).toEqual([
      { z: -1, rooms: 1 },
      { z: 0, rooms: 1 },
      { z: 1, rooms: 2 },
    ]);
  });

  it('opens on the floor with the most rooms (the lowest of equals), and on 0 when nothing is placed', () => {
    expect(busiestFloor([{ coords: { z: 1 } }, { coords: { z: 1 } }, { coords: { z: 0 } }])).toBe(1);
    expect(busiestFloor([{ coords: { z: 2 } }, { coords: { z: 0 } }])).toBe(0);
    expect(busiestFloor([{}, {}])).toBe(0);
    expect(busiestFloor([])).toBe(0);
  });
});
