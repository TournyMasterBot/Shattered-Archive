import type { MapFile, Room } from '@shatteredarchive/shattered-maps-core';
import type { ApiError, ApiResult, LoadedArea, SearchHit, SearchResult, WorldMapApi, WorldMapIndex } from './api';
import { createWorldMapSession, matchInArea, normalizeTitle } from './session';

const signal = () => new AbortController().signal;

function room(id: string, title: string, exits: string[], extra: Partial<Room> = {}): Room {
  const slots: Record<string, string> = {};
  for (const e of exits) slots[e] = `l-${id}-${e}`;
  return { id, title, exits: slots, sources: [], ...extra } as Room;
}

function area(id: string, name: string, rooms: Room[]): LoadedArea {
  const map = {
    version: 1,
    continents: [
      {
        id: 'c1',
        name: 'C',
        areas: [
          { id, name, placement: null, subzones: [{ id: `${id}-main`, name: 'Main', kind: 'consistent', rooms }] },
        ],
      },
    ],
    links: [],
  } as unknown as MapFile;
  return { id, name, continentId: 'c1', versionId: 'v1', credits: ['Azah'], map };
}

const hit = (roomId: string, title: string, areaId: string, areaName: string): SearchHit => ({
  roomId,
  title,
  areaId,
  areaName,
  subzoneId: `${areaId}-main`,
});

const ok = <T>(value: T): ApiResult<T> => ({ ok: true, value });
const err = (error: ApiError): ApiResult<never> => ({ ok: false, error });

const publishedIndex: WorldMapIndex = {
  available: true,
  versionId: 'v1',
  credits: ['Azah'],
  continents: [],
  areas: [{ id: 'town', name: 'Old Town', continentId: 'c1', rooms: 3 }],
};

function fakeApi(parts: {
  index?: ApiResult<WorldMapIndex>;
  search?: (q: string) => ApiResult<SearchResult>;
  areas?: Record<string, LoadedArea | ApiError>;
}) {
  const api = {
    checkFresh: jest.fn(async (): Promise<void> => undefined),
    getIndex: jest.fn(async () => parts.index ?? ok(publishedIndex)),
    search: jest.fn(async (q: string) =>
      parts.search ? parts.search(q) : ok({ versionId: 'v1', q, total: 0, results: [] }),
    ),
    getArea: jest.fn(async (id: string) => {
      const found = parts.areas?.[id];
      if (!found) return err({ kind: 'http', status: 404, message: 'No such area' });
      return 'kind' in found ? err(found) : ok(found);
    }),
  };
  return api as typeof api & WorldMapApi;
}

const searchHits =
  (...hits: SearchHit[]) =>
  (q: string) =>
    ok({ versionId: 'v1', q, total: hits.length, results: hits });

const town = area('town', 'Old Town', [
  room('r1', 'Market Square', ['N', 'E', 'S']),
  room('r2', 'A Dark Tunnel', ['E', 'W'], { coords: { x: 1, y: 0, z: -1 } }),
  room('r3', 'A Dark Tunnel', ['N', 'S']),
  room('r4', 'Merged Away', ['N'], { aliasOf: 'r1' }),
]);

describe('normalizeTitle', () => {
  it('lower-cases, trims and collapses white space', () => {
    expect(normalizeTitle('  A   Dark\tTunnel \n')).toBe('a dark tunnel');
    expect(normalizeTitle(undefined as unknown as string)).toBe('');
  });
});

describe('matchInArea', () => {
  it('prefers the rooms whose exits are the same set and says so', () => {
    const m = matchInArea(town, 'a dark tunnel', new Set(['W', 'E']));
    expect(m?.exact).toBe(true);
    expect(m?.rooms.map((r) => r.id)).toEqual(['r2']);
  });
  it('falls back to every room of that title when no exit set matches', () => {
    const m = matchInArea(town, 'a dark tunnel', new Set(['U']));
    expect(m).toEqual({
      exact: false,
      rooms: expect.arrayContaining([expect.objectContaining({ id: 'r2' }), expect.objectContaining({ id: 'r3' })]),
    });
  });
  it('has nothing for an unknown title and ignores a merged-away room', () => {
    expect(matchInArea(town, 'nowhere', new Set())).toBeNull();
    expect(matchInArea(town, 'merged away', new Set(['N']))).toBeNull();
  });
});

describe('observe: the area the player was last in', () => {
  it('places the player from the network the first time, then without any request while they stay in that area', async () => {
    const api = fakeApi({ search: searchHits(hit('r2', 'A Dark Tunnel', 'town', 'Old Town')), areas: { town } });
    const session = createWorldMapSession(api);
    const first = await session.observe({ title: 'A Dark Tunnel', exits: ['east', 'west'] }, signal());
    expect(first).toEqual({ status: 'located', area: town, roomIds: ['r2'], z: -1, exact: true });
    expect(api.search).toHaveBeenCalledWith('A Dark Tunnel', expect.anything());
    const callsAfterFirst =
      api.getIndex.mock.calls.length + api.search.mock.calls.length + api.getArea.mock.calls.length;

    const second = await session.observe({ title: '  a dark  tunnel', exits: ['n', 's'] }, signal());
    expect(second).toMatchObject({ status: 'located', roomIds: ['r3'], z: 0, exact: true });
    expect(api.getIndex.mock.calls.length + api.search.mock.calls.length + api.getArea.mock.calls.length).toBe(
      callsAfterFirst,
    );
  });

  it('reports several identical-looking rooms and a title-only match as such', async () => {
    const twins = area('town', 'Old Town', [
      room('a', 'Hall', ['N']),
      room('b', 'Hall', ['N']),
      room('c', 'Cellar', ['U']),
    ]);
    const api = fakeApi({
      search: searchHits(hit('a', 'Hall', 'town', 'Old Town'), hit('b', 'Hall', 'town', 'Old Town')),
      areas: { town: twins },
    });
    const session = createWorldMapSession(api);
    expect(await session.observe({ title: 'Hall', exits: ['N'] }, signal())).toMatchObject({
      status: 'located',
      roomIds: ['a', 'b'],
      exact: true,
    });
    expect(await session.observe({ title: 'Cellar', exits: ['D'] }, signal())).toMatchObject({
      status: 'located',
      roomIds: ['c'],
      exact: false,
    });
  });

  it('forgets the area on reset', async () => {
    const api = fakeApi({ search: searchHits(hit('r1', 'Market Square', 'town', 'Old Town')), areas: { town } });
    const session = createWorldMapSession(api);
    await session.observe({ title: 'Market Square', exits: ['N', 'E', 'S'] }, signal());
    session.reset();
    await session.observe({ title: 'Market Square', exits: ['N', 'E', 'S'] }, signal());
    expect(api.search).toHaveBeenCalledTimes(2);
  });

  it('asks the site again when the new room is not in the last area', async () => {
    const forest = area('forest', 'Deep Forest', [room('f1', 'Mossy Path', ['N', 'S'])]);
    const api = fakeApi({
      search: (q) =>
        ok({
          versionId: 'v1',
          q,
          total: 1,
          results:
            q === 'Mossy Path'
              ? [hit('f1', 'Mossy Path', 'forest', 'Deep Forest')]
              : [hit('r1', 'Market Square', 'town', 'Old Town')],
        }),
      areas: { town, forest },
    });
    const session = createWorldMapSession(api);
    await session.observe({ title: 'Market Square', exits: ['N', 'E', 'S'] }, signal());
    const moved = await session.observe({ title: 'Mossy Path', exits: ['N', 'S'] }, signal());
    expect(moved).toMatchObject({ status: 'located', roomIds: ['f1'] });
    expect(api.search).toHaveBeenCalledTimes(2);
  });
});

describe('observe: asking the site', () => {
  it('answers unmapped for a title shorter than two characters without a request', async () => {
    const api = fakeApi({});
    expect(await createWorldMapSession(api).observe({ title: ' x ', exits: [] }, signal())).toEqual({
      status: 'unmapped',
    });
    expect(api.getIndex).not.toHaveBeenCalled();
  });

  it.each([
    ['available false', ok<WorldMapIndex>({ ...publishedIndex, available: false })],
    ['no areas', ok<WorldMapIndex>({ ...publishedIndex, areas: [] })],
  ])('says nothing has been published when the index has %s', async (_n, index) => {
    const api = fakeApi({ index });
    expect(await createWorldMapSession(api).observe({ title: 'Market Square', exits: [] }, signal())).toEqual({
      status: 'unavailable',
      reason: 'not-published',
      message: 'No map has been published yet.',
    });
    expect(api.search).not.toHaveBeenCalled();
  });

  it.each([
    [
      'offline',
      { kind: 'offline' } as ApiError,
      { status: 'unavailable', reason: 'offline', message: 'The map could not be reached.' },
    ],
    [
      'an http refusal',
      { kind: 'http', status: 500, message: 'The world map manifest could not be read.' } as ApiError,
      { status: 'unavailable', reason: 'error', message: 'The world map manifest could not be read.' },
    ],
    [
      'an answer that is not understood',
      { kind: 'invalid' } as ApiError,
      { status: 'unavailable', reason: 'error', message: 'The map answer was not understood.' },
    ],
  ])('maps %s from every step to an unavailable answer', async (_n, error, expected) => {
    expect(
      await createWorldMapSession(fakeApi({ index: err(error) })).observe(
        { title: 'Market Square', exits: [] },
        signal(),
      ),
    ).toEqual(expected);
    expect(
      await createWorldMapSession(fakeApi({ search: () => err(error) })).observe(
        { title: 'Market Square', exits: [] },
        signal(),
      ),
    ).toEqual(expected);
    const failingArea = fakeApi({
      search: searchHits(hit('r1', 'Market Square', 'town', 'Old Town')),
      areas: { town: error },
    });
    expect(await createWorldMapSession(failingArea).observe({ title: 'Market Square', exits: [] }, signal())).toEqual(
      expected,
    );
  });

  it('answers null for a cancelled call at each step', async () => {
    const aborted: ApiError = { kind: 'aborted' };
    expect(
      await createWorldMapSession(fakeApi({ index: err(aborted) })).observe(
        { title: 'Market Square', exits: [] },
        signal(),
      ),
    ).toBeNull();
    expect(
      await createWorldMapSession(fakeApi({ search: () => err(aborted) })).observe(
        { title: 'Market Square', exits: [] },
        signal(),
      ),
    ).toBeNull();
    expect(
      await createWorldMapSession(
        fakeApi({ search: searchHits(hit('r1', 'Market Square', 'town', 'Old Town')), areas: { town: aborted } }),
      ).observe({ title: 'Market Square', exits: [] }, signal()),
    ).toBeNull();
    const controller = new AbortController();
    const api = fakeApi({});
    api.checkFresh.mockImplementation(async () => controller.abort());
    expect(
      await createWorldMapSession(api).observe({ title: 'Market Square', exits: [] }, controller.signal),
    ).toBeNull();
    expect(api.getIndex).not.toHaveBeenCalled();
  });

  it('answers unmapped when no room has exactly that title (a search matches substrings) or the area has no such room', async () => {
    const substring = fakeApi({ search: searchHits(hit('r1', 'Market Square East', 'town', 'Old Town')) });
    expect(await createWorldMapSession(substring).observe({ title: 'Market Square', exits: [] }, signal())).toEqual({
      status: 'unmapped',
    });
    const staleHit = fakeApi({
      search: searchHits(hit('zz', 'Market Square', 'town', 'Old Town')),
      areas: { town: area('town', 'Old Town', [room('r9', 'Elsewhere', [])]) },
    });
    expect(await createWorldMapSession(staleHit).observe({ title: 'Market Square', exits: [] }, signal())).toEqual({
      status: 'unmapped',
    });
    const none = fakeApi({});
    expect(await createWorldMapSession(none).observe({ title: 'Market Square', exits: [] }, signal())).toEqual({
      status: 'unmapped',
    });
  });

  it('compares the areas a title is in and picks the one whose exits match', async () => {
    const a = area('a', 'Area A', [room('a1', 'Crossroads', ['N', 'S'])]);
    const b = area('b', 'Area B', [room('b1', 'Crossroads', ['E', 'W'])]);
    const api = fakeApi({
      search: searchHits(hit('a1', 'Crossroads', 'a', 'Area A'), hit('b1', 'Crossroads', 'b', 'Area B')),
      areas: { a, b },
    });
    expect(
      await createWorldMapSession(api).observe({ title: 'Crossroads', exits: ['E', 'W'] }, signal()),
    ).toMatchObject({ status: 'located', roomIds: ['b1'], exact: true });
    expect(api.getArea).toHaveBeenCalledTimes(2);
  });

  it('prefers the areas with an exact match over those with only the title', async () => {
    const a = area('a', 'Area A', [room('a1', 'Crossroads', ['U'])]);
    const b = area('b', 'Area B', [room('b1', 'Crossroads', ['E', 'W'])]);
    const api = fakeApi({
      search: searchHits(hit('a1', 'Crossroads', 'a', 'Area A'), hit('b1', 'Crossroads', 'b', 'Area B')),
      areas: { a, b },
    });
    expect(
      await createWorldMapSession(api).observe({ title: 'Crossroads', exits: ['E', 'W'] }, signal()),
    ).toMatchObject({ status: 'located', roomIds: ['b1'] });
  });

  it('uses the title-only matches when no area has the exits, and says ambiguous when two areas tie', async () => {
    const a = area('a', 'Area A', [room('a1', 'Crossroads', ['N'])]);
    const b = area('b', 'Area B', [room('b1', 'Crossroads', ['S']), room('b2', 'Crossroads', ['U'])]);
    const api = fakeApi({
      search: searchHits(hit('a1', 'Crossroads', 'a', 'Area A'), hit('b1', 'Crossroads', 'b', 'Area B')),
      areas: { a, b },
    });
    expect(await createWorldMapSession(api).observe({ title: 'Crossroads', exits: ['E', 'W'] }, signal())).toEqual({
      status: 'ambiguous',
      areas: [
        { id: 'a', name: 'Area A', count: 1 },
        { id: 'b', name: 'Area B', count: 2 },
      ],
    });
  });

  it('does not load a crowd of areas: more than four named is ambiguous at once', async () => {
    const hits = ['a', 'b', 'c', 'd', 'e'].map((id) => hit(`${id}1`, 'Crossroads', id, `Area ${id}`));
    const api = fakeApi({ search: searchHits(...hits) });
    const r = await createWorldMapSession(api).observe({ title: 'Crossroads', exits: [] }, signal());
    expect(r).toMatchObject({
      status: 'ambiguous',
      areas: expect.arrayContaining([{ id: 'e', name: 'Area e', count: 1 }]),
    });
    expect(api.getArea).not.toHaveBeenCalled();
  });

  it('matches in the last area without loading any other when the title is also in other areas', async () => {
    const a = area('a', 'Area A', [room('a1', 'Crossroads', ['N']), room('a2', 'Start', ['N'])]);
    const hits = ['a', 'b', 'c', 'd', 'e'].map((id) => hit(`${id}1`, 'Crossroads', id, `Area ${id}`));
    const api = fakeApi({
      search: (q) =>
        ok({ versionId: 'v1', q, total: 1, results: q === 'Start' ? [hit('a2', 'Start', 'a', 'Area A')] : hits }),
      areas: { a },
    });
    const session = createWorldMapSession(api);
    await session.observe({ title: 'Start', exits: ['N'] }, signal());
    api.getArea.mockClear();
    const r = await session.observe({ title: 'Crossroads', exits: ['N'] }, signal());
    expect(r).toMatchObject({ status: 'located', roomIds: ['a1'] });
    expect(api.getArea).not.toHaveBeenCalled(); // already in memory as the last area: matched locally
  });
});
