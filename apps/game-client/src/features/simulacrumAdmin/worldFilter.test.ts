import { describeFetch, filterAreas, filterRooms } from './worldFilter';
import type { WorldArea, WorldRoom } from './worldApi';

const AREAS: WorldArea[] = [
  { file: 'midgaard.are', name: 'Midgaard', minVnum: 3000, maxVnum: 3099, rooms: 40 },
  { file: 'firefield.are', name: 'Fire Field', minVnum: 20000, maxVnum: 20099, rooms: 12 },
  { file: 'noname.are', minVnum: 500, maxVnum: 599, rooms: 3 },
  { file: 'broken.are', rooms: 0, parseError: 'bad' },
];
const ROOMS: WorldRoom[] = [
  { vnum: 3001, name: 'The Temple of Midgaard' },
  { vnum: 3002, name: 'The Altar' },
  { vnum: 3010, name: 'A Dark Alley' },
  { vnum: 3100, name: 'Market Square' },
];

describe('filterAreas', () => {
  it('keeps every area for an empty query, in order, as a copy', () => {
    const all = filterAreas(AREAS, '   ');
    expect(all).toEqual(AREAS);
    expect(all).not.toBe(AREAS);
  });

  it('matches part of the name or of the file, ignoring case', () => {
    expect(filterAreas(AREAS, 'FIRE').map((a) => a.file)).toEqual(['firefield.are']);
    expect(filterAreas(AREAS, 'gaard.a').map((a) => a.file)).toEqual(['midgaard.are']);
    expect(filterAreas(AREAS, 'field').map((a) => a.file)).toEqual(['firefield.are']);
  });

  it('matches a vnum inside the range of an area, and an area with no range only by name or file', () => {
    expect(filterAreas(AREAS, '3050').map((a) => a.file)).toEqual(['midgaard.are']);
    expect(filterAreas(AREAS, '3000').map((a) => a.file)).toEqual(['midgaard.are']);
    expect(filterAreas(AREAS, '3099').map((a) => a.file)).toEqual(['midgaard.are']);
    expect(filterAreas(AREAS, '3100')).toEqual([]);
    expect(filterAreas(AREAS, '2999')).toEqual([]);
  });

  it('matches a range a-b by any overlap, whichever way it is written', () => {
    expect(filterAreas(AREAS, '3090-3200').map((a) => a.file)).toEqual(['midgaard.are']);
    expect(filterAreas(AREAS, '3200 - 3090').map((a) => a.file)).toEqual(['midgaard.are']);
    expect(filterAreas(AREAS, '400-600').map((a) => a.file)).toEqual(['noname.are']);
    expect(filterAreas(AREAS, '100-200')).toEqual([]);
    expect(filterAreas(AREAS, '1-30000').map((a) => a.file)).toEqual(['midgaard.are', 'firefield.are', 'noname.are']);
  });

  it('finds nothing for a query that matches nothing', () => {
    expect(filterAreas(AREAS, 'zzz')).toEqual([]);
  });
});

describe('filterRooms', () => {
  it('keeps every room for an empty query', () => {
    expect(filterRooms(ROOMS, '')).toEqual(ROOMS);
  });

  it('matches an exact vnum and a vnum prefix, in the original order', () => {
    expect(filterRooms(ROOMS, '3001').map((r) => r.vnum)).toEqual([3001]);
    expect(filterRooms(ROOMS, '300').map((r) => r.vnum)).toEqual([3001, 3002]);
    expect(filterRooms(ROOMS, '3').map((r) => r.vnum)).toEqual([3001, 3002, 3010, 3100]);
    expect(filterRooms(ROOMS, '9')).toEqual([]);
  });

  it('matches an inclusive range a-b, whichever way it is written', () => {
    expect(filterRooms(ROOMS, '3002-3010').map((r) => r.vnum)).toEqual([3002, 3010]);
    expect(filterRooms(ROOMS, '3010 - 3002').map((r) => r.vnum)).toEqual([3002, 3010]);
    expect(filterRooms(ROOMS, '3011-3099')).toEqual([]);
  });

  it('matches part of the name, ignoring case', () => {
    expect(filterRooms(ROOMS, 'altar').map((r) => r.vnum)).toEqual([3002]);
    expect(filterRooms(ROOMS, 'MIDGAARD').map((r) => r.vnum)).toEqual([3001]);
    expect(filterRooms(ROOMS, 'zzz')).toEqual([]);
  });

  it('also matches a number inside a name', () => {
    expect(filterRooms([{ vnum: 5, name: 'Room 12 of 20' }], '12').map((r) => r.vnum)).toEqual([5]);
  });

  it('filters 3,200 rooms well inside a fixed time bound (E9)', () => {
    const many: WorldRoom[] = Array.from({ length: 3200 }, (_, i) => ({ vnum: 1000 + i, name: `Room number ${i}` }));
    const started = performance.now();
    for (const query of ['1500', '1500-2500', 'number 31', '']) filterRooms(many, query);
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe('describeFetch', () => {
  it('says when the data was loaded', () => {
    expect(describeFetch(new Date(2026, 10, 13, 9, 5, 7).getTime())).toMatch(/^Loaded \d{2}:\d{2}:\d{2}$/);
  });
});
