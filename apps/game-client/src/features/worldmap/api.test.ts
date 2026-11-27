import { createWorldMapApi, type WorldMapApi } from './api';

const BASE = 'https://site.test';

type Reply = { status?: number; body?: unknown; jsonThrows?: boolean; reject?: Error };

/** A fetch that answers from a list, in order, and records every call. */
function fakeFetch(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const reply = replies.shift() ?? { status: 500, body: { error: 'unexpected call' } };
    if (reply.reject) throw reply.reject;
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (reply.jsonThrows) throw new SyntaxError('bad json');
        return reply.body;
      },
    } as unknown as Response;
  });
  return { fn: fn as unknown as typeof fetch, calls, remaining: () => replies.length };
}

const signal = () => new AbortController().signal;

const indexBody = {
  available: true,
  versionId: 'v1',
  publishedAt: '2026-11-08',
  credits: ['Azah'],
  continents: [{ id: 'c1', name: 'Althainia', areas: 1, rooms: 2 }],
  areas: [{ id: 'town', name: 'Old Town', continentId: 'c1', rooms: 2 }],
};

const room = (id: string, title: string) => ({ id, title, exits: {}, sources: [] });

function page(
  areaId: string,
  rooms: ReturnType<typeof room>[],
  nextOffset: number | null,
  extra: { versionId?: string; subzoneId?: string; links?: unknown[] } = {},
) {
  return {
    versionId: extra.versionId ?? 'v1',
    area: {
      id: areaId,
      name: 'Old Town',
      continentId: 'c1',
      placement: null,
      subzones: [{ id: extra.subzoneId ?? 'main', name: 'Main', kind: 'consistent', rooms }],
    },
    links: extra.links ?? [],
    offset: 0,
    shown: rooms.length,
    total: 2,
    nextOffset,
    credits: ['Azah'],
  };
}

function make(
  replies: Reply[],
  extra: { now?: () => number; freshnessMs?: number } = {},
): { api: WorldMapApi; calls: ReturnType<typeof fakeFetch>['calls']; remaining: () => number } {
  const f = fakeFetch(replies);
  return {
    api: createWorldMapApi({ baseUrl: `${BASE}/`, fetchFn: f.fn, ...extra }),
    calls: f.calls,
    remaining: f.remaining,
  };
}

describe('getIndex', () => {
  it('reads the index from the site, with the trailing slash of the base ignored', async () => {
    const { api, calls } = make([{ body: indexBody }]);
    const r = await api.getIndex(signal());
    expect(r).toEqual({
      ok: true,
      value: expect.objectContaining({
        available: true,
        versionId: 'v1',
        credits: ['Azah'],
        publishedAt: '2026-11-08',
      }),
    });
    expect(calls[0].url).toBe(`${BASE}/api/world-map/index`);
    expect((calls[0].init.headers as Record<string, string>).Accept).toBe('application/json');
    expect(calls[0].init.cache).toBeUndefined();
  });

  it('accepts an empty index (nothing published) without credits or lists', async () => {
    const { api } = make([{ body: { available: false, versionId: 'none' } }]);
    const r = await api.getIndex(signal());
    expect(r).toEqual({
      ok: true,
      value: { available: false, versionId: 'none', publishedAt: undefined, credits: [], continents: [], areas: [] },
    });
  });

  it.each([
    ['not an object', 'text'],
    ['an array', []],
    ['available not a boolean', { ...indexBody, available: 'yes' }],
    ['no version id', { ...indexBody, versionId: 5 }],
    ['a continent without a name', { ...indexBody, continents: [{ id: 'c1', areas: 1, rooms: 1 }] }],
    ['an area with a numeric id', { ...indexBody, areas: [{ id: 3, name: 'x', continentId: 'c1', rooms: 1 }] }],
  ])('refuses %s as invalid', async (_name, body) => {
    const { api } = make([{ body }]);
    expect(await api.getIndex(signal())).toEqual({ ok: false, error: { kind: 'invalid' } });
  });

  it("keeps the site's own error text for a refusal, cut to 200 characters", async () => {
    const { api } = make([{ status: 500, body: { error: 'x'.repeat(300) } }]);
    const r = await api.getIndex(signal());
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === 'http') {
      expect(r.error.status).toBe(500);
      expect(r.error.message).toHaveLength(200);
    } else throw new Error('expected an http error');
  });

  it('says what the status was when the refusal has no usable body', async () => {
    const { api } = make([{ status: 503, jsonThrows: true }]);
    expect(await api.getIndex(signal())).toEqual({
      ok: false,
      error: { kind: 'http', status: 503, message: 'The server answered 503.' },
    });
  });

  it('is invalid when a 200 is not JSON', async () => {
    const { api } = make([{ jsonThrows: true }]);
    expect(await api.getIndex(signal())).toEqual({ ok: false, error: { kind: 'invalid' } });
  });

  it('is offline when the request cannot be made', async () => {
    const { api } = make([{ reject: new TypeError('Failed to fetch') }]);
    expect(await api.getIndex(signal())).toEqual({ ok: false, error: { kind: 'offline' } });
  });

  it('answers aborted, not offline, when the caller cancelled', async () => {
    const controller = new AbortController();
    const abortError = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
    const { api } = make([{ reject: abortError }, { reject: new TypeError('x') }]);
    expect(await api.getIndex(controller.signal)).toEqual({ ok: false, error: { kind: 'aborted' } });
    controller.abort();
    expect(await api.getIndex(controller.signal)).toEqual({ ok: false, error: { kind: 'aborted' } });
  });

  it('answers aborted when the cancel arrives while the body is being read', async () => {
    const controller = new AbortController();
    const fetchFn = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      },
    })) as unknown as typeof fetch;
    const api = createWorldMapApi({ baseUrl: BASE, fetchFn });
    expect(await api.getIndex(controller.signal)).toEqual({ ok: false, error: { kind: 'aborted' } });
  });
});

describe('search', () => {
  it('asks for the title, encoded, with the largest page', async () => {
    const { api, calls } = make([
      {
        body: {
          versionId: 'v1',
          q: 'Mill & Road',
          total: 1,
          results: [{ roomId: 'r1', title: 'Mill & Road', areaId: 'town', areaName: 'Old Town', subzoneId: 'main' }],
        },
      },
    ]);
    const r = await api.search('Mill & Road', signal());
    expect(calls[0].url).toBe(`${BASE}/api/world-map/search?q=Mill%20%26%20Road&limit=100`);
    expect(r.ok && r.value.results[0].roomId).toBe('r1');
  });

  it.each([
    ['no results list', { versionId: 'v1', q: 'x', total: 0 }],
    [
      'a result without an area',
      { versionId: 'v1', q: 'x', total: 1, results: [{ roomId: 'r1', title: 't', areaName: 'A', subzoneId: 's' }] },
    ],
    ['a total that is not a number', { versionId: 'v1', q: 'x', total: '1', results: [] }],
  ])('refuses %s', async (_n, body) => {
    const { api } = make([{ body }]);
    expect(await api.search('x', signal())).toEqual({ ok: false, error: { kind: 'invalid' } });
  });

  it('passes an offline failure through', async () => {
    const { api } = make([{ reject: new TypeError('x') }]);
    expect(await api.search('x', signal())).toEqual({ ok: false, error: { kind: 'offline' } });
  });
});

describe('getArea', () => {
  it('joins the pages of an area into one map file and asks for the next offset', async () => {
    const link = {
      id: 'l1',
      from: 'r1',
      dir: 'E',
      to: 'r2',
      state: 'confirmed',
      confidence: 1,
      offPage: false,
      traversals: 0,
      reverse: false,
    };
    const { api, calls } = make([
      { body: page('town', [room('r1', 'Square')], 300, { links: [link] }) },
      { body: page('town', [room('r2', 'Road')], null, { links: [] }) },
    ]);
    const r = await api.getArea('town', signal());
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/api/world-map/area/town?limit=300&offset=0`,
      `${BASE}/api/world-map/area/town?limit=300&offset=300`,
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      id: 'town',
      name: 'Old Town',
      continentId: 'c1',
      versionId: 'v1',
      credits: ['Azah'],
    });
    const area = r.value.map.continents[0].areas[0];
    expect(area.subzones).toHaveLength(1); // the same subzone on both pages is one subzone
    expect(area.subzones[0].rooms.map((x) => x.id)).toEqual(['r1', 'r2']);
    expect(r.value.map.links).toEqual([link]);
  });

  it('keeps different subzones of different pages apart', async () => {
    const { api } = make([
      { body: page('town', [room('r1', 'A')], 300, { subzoneId: 'one' }) },
      { body: page('town', [room('r2', 'B')], null, { subzoneId: 'two' }) },
    ]);
    const r = await api.getArea('town', signal());
    expect(r.ok && r.value.map.continents[0].areas[0].subzones.map((s) => s.id)).toEqual(['one', 'two']);
  });

  it('reads an area once and reuses it', async () => {
    const { api, calls } = make([{ body: page('town', [room('r1', 'A')], null) }]);
    const first = await api.getArea('town', signal());
    const second = await api.getArea('town', signal());
    expect(calls).toHaveLength(1);
    expect(first.ok && second.ok && second.value).toBe(first.ok && first.value);
  });

  it.each([['Upper'], ['has space'], ['../x'], [''], ['a'.repeat(65) + '!']])(
    'refuses the id %j without asking the site',
    async (id) => {
      const { api, calls } = make([]);
      expect(await api.getArea(id, signal())).toEqual({ ok: false, error: { kind: 'invalid' } });
      expect(calls).toHaveLength(0);
    },
  );

  it('is invalid when the answer is for another area, or not the page shape', async () => {
    expect(await make([{ body: page('other', [room('r1', 'A')], null) }]).api.getArea('town', signal())).toEqual({
      ok: false,
      error: { kind: 'invalid' },
    });
    expect(await make([{ body: { versionId: 'v1' } }]).api.getArea('town', signal())).toEqual({
      ok: false,
      error: { kind: 'invalid' },
    });
    expect(await make([{ body: { ...page('town', [], null), nextOffset: 0 } }]).api.getArea('town', signal())).toEqual({
      ok: false,
      error: { kind: 'invalid' },
    });
    expect(
      await make([
        {
          body: {
            ...page('town', [], null),
            area: {
              id: 'town',
              name: 'x',
              continentId: 'c',
              placement: null,
              subzones: [{ id: 's', name: 'S', kind: 'consistent', rooms: [5] }],
            },
          },
        },
      ]).api.getArea('town', signal()),
    ).toEqual({ ok: false, error: { kind: 'invalid' } });
  });

  it('is invalid when the area has no continent id, and accepts a page without credits', async () => {
    const noContinent = page('town', [], null);
    delete (noContinent.area as Partial<typeof noContinent.area>).continentId;
    expect(await make([{ body: noContinent }]).api.getArea('town', signal())).toEqual({
      ok: false,
      error: { kind: 'invalid' },
    });
    const noCredits = { ...page('town', [room('r1', 'A')], null), credits: undefined };
    const r = await make([{ body: noCredits }]).api.getArea('town', signal());
    expect(r.ok && r.value.credits).toEqual([]);
  });

  it('uses the global fetch when none is given', async () => {
    const original = globalThis.fetch;
    const spy = jest.fn(async () => ({ ok: true, status: 200, json: async () => indexBody }) as unknown as Response);
    globalThis.fetch = spy as unknown as typeof fetch;
    try {
      const api = createWorldMapApi({ baseUrl: BASE });
      expect((await api.getIndex(signal())).ok).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('is invalid when the site published a new version between two pages', async () => {
    const { api } = make([
      { body: page('town', [room('r1', 'A')], 300, { versionId: 'v1' }) },
      { body: page('town', [room('r2', 'B')], null, { versionId: 'v2' }) },
    ]);
    expect(await api.getArea('town', signal())).toEqual({ ok: false, error: { kind: 'invalid' } });
  });

  it('is invalid when the paging does not move forward', async () => {
    const { api } = make([
      { body: page('town', [room('r1', 'A')], 300) },
      { body: page('town', [room('r2', 'B')], 300) },
    ]);
    expect(await api.getArea('town', signal())).toEqual({ ok: false, error: { kind: 'invalid' } });
  });

  it('stops a server that never finishes its paging', async () => {
    let offset = 0;
    const fetchFn = jest.fn(async () => {
      offset += 300;
      return {
        ok: true,
        status: 200,
        json: async () => page('town', [room(`r${offset}`, 'A')], offset),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const api = createWorldMapApi({ baseUrl: BASE, fetchFn });
    expect(await api.getArea('town', signal())).toEqual({ ok: false, error: { kind: 'invalid' } });
    expect((fetchFn as unknown as jest.Mock).mock.calls.length).toBe(400);
  });

  it('passes a failure on the second page through and caches nothing', async () => {
    const { api, calls } = make([
      { body: page('town', [room('r1', 'A')], 300) },
      { reject: new TypeError('x') },
      { body: page('town', [room('r1', 'A')], null) },
    ]);
    expect(await api.getArea('town', signal())).toEqual({ ok: false, error: { kind: 'offline' } });
    const again = await api.getArea('town', signal());
    expect(again.ok).toBe(true);
    expect(calls).toHaveLength(3);
  });
});

describe('getRoomArea', () => {
  const body = (roomId: string, areaId = 'forest') => ({ versionId: 'v1', roomId, areaId, areaName: 'Deep Forest' });

  it('asks which area a room is in, encoded, and returns it', async () => {
    const { api, calls } = make([{ body: body('az.1:b') }]);
    const r = await api.getRoomArea('az.1:b', signal());
    expect(calls[0].url).toBe(`${BASE}/api/world-map/room/az.1%3Ab`);
    expect(r).toEqual({ ok: true, value: { roomId: 'az.1:b', areaId: 'forest', areaName: 'Deep Forest' } });
  });

  it('remembers the answer, and forgets it when the site restarted', async () => {
    let t = 0;
    const { api, calls } = make(
      [
        { body: { ok: true, startedAt: 'T1' } },
        { body: body('r1') },
        { body: { ok: true, startedAt: 'T2' } },
        { body: body('r1') },
      ],
      { now: () => t, freshnessMs: 1000 },
    );
    await api.checkFresh(signal());
    await api.getRoomArea('r1', signal());
    await api.getRoomArea('r1', signal());
    expect(calls).toHaveLength(2); // the health check and one room request
    t = 5000;
    await api.checkFresh(signal());
    await api.getRoomArea('r1', signal());
    expect(calls).toHaveLength(4);
    expect(calls[3].init.cache).toBe('reload');
  });

  it.each([[''], ['UPPER'], ['has space'], ['../x'], ['-lead'], ['a'.repeat(65)]])(
    'refuses the id %j without a request',
    async (id) => {
      const { api, calls } = make([]);
      expect(await api.getRoomArea(id, signal())).toEqual({ ok: false, error: { kind: 'invalid' } });
      expect(calls).toHaveLength(0);
    },
  );

  it('is invalid for an answer about another room, a bad area id, or not the shape', async () => {
    expect(await make([{ body: body('other') }]).api.getRoomArea('r1', signal())).toEqual({
      ok: false,
      error: { kind: 'invalid' },
    });
    expect(await make([{ body: body('r1', 'Bad Area') }]).api.getRoomArea('r1', signal())).toEqual({
      ok: false,
      error: { kind: 'invalid' },
    });
    expect(await make([{ body: { roomId: 'r1', areaId: 'forest' } }]).api.getRoomArea('r1', signal())).toEqual({
      ok: false,
      error: { kind: 'invalid' },
    });
    expect(await make([{ body: 'text' }]).api.getRoomArea('r1', signal())).toEqual({
      ok: false,
      error: { kind: 'invalid' },
    });
  });

  it('passes a 404, offline and a cancelled call through, and caches none of them', async () => {
    const { api } = make([
      { status: 404, body: { error: 'No such room in the world map.' } },
      { reject: new TypeError('x') },
      { body: body('r1') },
    ]);
    expect(await api.getRoomArea('r1', signal())).toEqual({
      ok: false,
      error: { kind: 'http', status: 404, message: 'No such room in the world map.' },
    });
    expect(await api.getRoomArea('r1', signal())).toEqual({ ok: false, error: { kind: 'offline' } });
    expect((await api.getRoomArea('r1', signal())).ok).toBe(true);
  });
});

describe('checkFresh', () => {
  const health = (startedAt: string): Reply => ({ body: { ok: true, startedAt, version: '1' } });

  it('asks /api/health, not more often than the interval, and keeps the areas while the site has not restarted', async () => {
    let t = 0;
    const { api, calls } = make([health('T1'), { body: page('town', [room('r1', 'A')], null) }, health('T1')], {
      now: () => t,
      freshnessMs: 1000,
    });
    await api.checkFresh(signal());
    await api.getArea('town', signal());
    t = 500;
    await api.checkFresh(signal()); // too soon: no request
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/api/health`,
      `${BASE}/api/world-map/area/town?limit=300&offset=0`,
    ]);
    t = 2000;
    await api.checkFresh(signal());
    await api.getArea('town', signal());
    expect(calls).toHaveLength(3); // the health call only: the area is still in memory
  });

  it('drops the areas when the site restarted and fetches each URL past the browser cache once', async () => {
    let t = 0;
    const { api, calls } = make(
      [
        health('T1'),
        { body: page('town', [room('r1', 'A')], null) },
        health('T2'),
        { body: page('town', [room('r1', 'A')], null) },
        { body: indexBody },
        { body: indexBody },
      ],
      { now: () => t, freshnessMs: 1000 },
    );
    await api.checkFresh(signal());
    await api.getArea('town', signal());
    expect(calls[1].init.cache).toBeUndefined(); // before any restart the browser's own cache rules apply
    t = 2000;
    await api.checkFresh(signal());
    await api.getArea('town', signal());
    expect(calls[3].init.cache).toBe('reload'); // refetched
    await api.getIndex(signal());
    await api.getIndex(signal());
    expect(calls[4].init.cache).toBe('reload');
    expect(calls[5].init.cache).toBeUndefined(); // only the first fetch of a URL after a restart
  });

  it.each([
    ['health unreachable', { reject: new TypeError('x') }],
    ['health refused', { status: 503, body: {} }],
    ['health not JSON', { jsonThrows: true }],
    ['health without startedAt', { body: { ok: true } }],
  ] as [string, Reply][])('ignores a failing health check (%s) and keeps what it has', async (_n, reply) => {
    let t = 0;
    const { api, calls } = make([health('T1'), { body: page('town', [room('r1', 'A')], null) }, reply], {
      now: () => t,
      freshnessMs: 1000,
    });
    await api.checkFresh(signal());
    await api.getArea('town', signal());
    t = 5000;
    await expect(api.checkFresh(signal())).resolves.toBeUndefined();
    await api.getArea('town', signal());
    expect(calls).toHaveLength(3);
  });
});

describe('mapPrefix (the route of another world, given only by a local-only module)', () => {
  const sandbox = (replies: Reply[]) => {
    const f = fakeFetch(replies);
    return { ...f, api: createWorldMapApi({ baseUrl: BASE, mapPrefix: '/api/world-map/other', fetchFn: f.fn }) };
  };

  it('asks every route of the map under the prefix', async () => {
    const { api, calls } = sandbox([
      { body: indexBody },
      { body: { versionId: 'v1', q: 'x', total: 0, offset: 0, shown: 0, nextOffset: null, results: [] } },
      { body: { versionId: 'v1', roomId: 'r1', areaId: 'town', areaName: 'Old Town' } },
      { body: page('town', [room('a', 'Hall'), room('b', 'Study')], null) },
    ]);
    await api.getIndex(signal());
    await api.search('x', signal());
    await api.getRoomArea('r1', signal());
    await api.getArea('town', signal());
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/api/world-map/other/index`,
      `${BASE}/api/world-map/other/search?q=x&limit=100`,
      `${BASE}/api/world-map/other/room/r1`,
      expect.stringMatching(/^https:\/\/site\.test\/api\/world-map\/other\/area\/town\?limit=300&offset=0$/),
    ]);
  });
});
