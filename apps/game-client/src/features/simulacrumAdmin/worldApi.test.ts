import { fetchAreas, fetchRooms, stripColourCodes, type FetchLike } from './worldApi';

const BASE = 'https://simulacrum-admin.shatteredarchive.dev';

/** A fake response: only what the client reads. */
const respond = (status: number, body: unknown, raw = false): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (raw) throw new SyntaxError('Unexpected token');
      return body;
    },
  }) as unknown as Response;

const fetching = (response: Response | Error): jest.MockedFunction<FetchLike> =>
  jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });

describe('stripColourCodes', () => {
  it('removes {x-style codes and turns {{ back into {', () => {
    expect(stripColourCodes('{RAshen {Wtrail{x {{literal}')).toBe('Ashen trail {literal}');
    expect(stripColourCodes('plain')).toBe('plain');
  });
});

describe('fetchAreas', () => {
  it('parses the area list: colour codes out of names, unknown fields ignored, a parse error kept', async () => {
    const fetchImpl = fetching(
      respond(200, {
        areas: [
          { file: 'midgaard.are', name: '{CMidgaard{x', minVnum: 3000, maxVnum: 3099, rooms: 40, extra: 'ignored' },
          { file: 'broken.are', rooms: 0, parseError: 'bad section' },
        ],
        links: [],
      }),
    );
    const result = await fetchAreas(BASE, undefined, fetchImpl, () => 1234);
    expect(result).toEqual({
      ok: true,
      at: 1234,
      data: [
        { file: 'midgaard.are', name: 'Midgaard', minVnum: 3000, maxVnum: 3099, rooms: 40 },
        { file: 'broken.are', rooms: 0, parseError: 'bad section' },
      ],
    });
  });

  it('asks for /api/map with no credentials and no cache', async () => {
    const fetchImpl = fetching(respond(200, { areas: [] }));
    const controller = new AbortController();
    await fetchAreas(BASE, controller.signal, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE}/api/map`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
    });
  });

  it('gives an offline state, not an exception, when the request cannot be made (E8)', async () => {
    const result = await fetchAreas(BASE, undefined, fetching(new TypeError('Failed to fetch')));
    expect(result).toEqual({ ok: false, kind: 'offline', message: expect.stringContaining('could not be reached') });
  });

  it('is offline, not a crash, in an environment that has no fetch', async () => {
    const original = global.fetch;
    // @ts-expect-error simulating an environment without fetch
    delete global.fetch;
    try {
      expect(await fetchAreas(BASE)).toEqual(expect.objectContaining({ ok: false, kind: 'offline' }));
    } finally {
      global.fetch = original;
    }
  });

  it('gives aborted for a request that was cancelled, by the signal or by the error', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await fetchAreas(BASE, controller.signal, fetching(new TypeError('x')))).toEqual({
      ok: false,
      kind: 'aborted',
      message: 'The request was cancelled.',
    });
    expect((await fetchAreas(BASE, undefined, fetching(new DOMException('stop', 'AbortError')))).ok).toBe(false);
    const aborted = await fetchAreas(BASE, undefined, fetching(new DOMException('stop', 'AbortError')));
    expect(aborted).toEqual(expect.objectContaining({ kind: 'aborted' }));
  });

  it('gives an error with the server’s own words for an error body', async () => {
    const result = await fetchAreas(BASE, undefined, fetching(respond(500, { error: 'internal error: boom' })));
    expect(result).toEqual({ ok: false, kind: 'error', message: 'The world index answered 500: internal error: boom' });
  });

  it('gives an error for an error status whose body has no message', async () => {
    const result = await fetchAreas(BASE, undefined, fetching(respond(403, {})));
    expect(result).toEqual({ ok: false, kind: 'error', message: 'The world index answered 403' });
  });

  it('gives an error for a body that is not JSON', async () => {
    const result = await fetchAreas(BASE, undefined, fetching(respond(200, undefined, true)));
    expect(result).toEqual({ ok: false, kind: 'error', message: expect.stringContaining('not JSON') });
  });

  it.each([
    ['a body that is not an object', 'nope'],
    ['a body with no areas', {}],
    ['areas that are not a list', { areas: {} }],
    ['an entry that is not an object', { areas: ['x'] }],
    ['a file name that is not an area file', { areas: [{ file: '../x', rooms: 1 }] }],
    ['a file that is not a string', { areas: [{ file: 5, rooms: 1 }] }],
    ['a room count that is not a number', { areas: [{ file: 'a.are', rooms: '3' }] }],
    ['a negative room count', { areas: [{ file: 'a.are', rooms: -1 }] }],
    ['a name that is not text', { areas: [{ file: 'a.are', rooms: 1, name: 7 }] }],
    ['a vnum that is not a number', { areas: [{ file: 'a.are', rooms: 1, minVnum: 'x' }] }],
    ['a parse error that is not text', { areas: [{ file: 'a.are', rooms: 1, parseError: 1 }] }],
  ])('rejects %s', async (_what, body) => {
    const result = await fetchAreas(BASE, undefined, fetching(respond(200, body)));
    expect(result).toEqual({ ok: false, kind: 'error', message: expect.stringContaining('shape') });
  });

  it('uses the browser fetch and the clock by default', async () => {
    const original = global.fetch;
    global.fetch = jest.fn(async () => respond(200, { areas: [] })) as unknown as typeof fetch;
    try {
      const result = await fetchAreas(BASE);
      expect(result.ok && result.data).toEqual([]);
      expect(result.ok && typeof result.at).toBe('number');
    } finally {
      global.fetch = original;
    }
  });
});

describe('fetchRooms', () => {
  it('keeps only the vnum and the name of each room, colour codes out', async () => {
    const fetchImpl = fetching(
      respond(200, {
        file: 'midgaard.are',
        name: 'Midgaard',
        rooms: [
          { vnum: 3001, name: '{WThe Temple{x', sectorType: 0, exits: [{ door: 'north', toVnum: 3002 }] },
          { vnum: 3002, name: 'The Altar' },
        ],
      }),
    );
    const result = await fetchRooms(BASE, 'midgaard.are', undefined, fetchImpl, () => 5);
    expect(result).toEqual({
      ok: true,
      at: 5,
      data: [
        { vnum: 3001, name: 'The Temple' },
        { vnum: 3002, name: 'The Altar' },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE}/api/map/midgaard.are`, expect.objectContaining({ credentials: 'omit' }));
  });

  it('never builds a URL from a name that is not an area file, and makes no request', async () => {
    const fetchImpl = fetching(respond(200, { rooms: [] }));
    for (const bad of ['../etc/passwd', 'a.txt', 'a/b.are', '', 'x.are?y=1']) {
      expect(await fetchRooms(BASE, bad, undefined, fetchImpl)).toEqual({ ok: false, kind: 'error', message: 'That is not an area file name.' });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['a room with no vnum', { rooms: [{ name: 'x' }] }],
    ['a vnum of zero', { rooms: [{ vnum: 0, name: 'x' }] }],
    ['a vnum that is a string', { rooms: [{ vnum: '3001', name: 'x' }] }],
    ['a room with no name', { rooms: [{ vnum: 3001 }] }],
    ['a room that is not an object', { rooms: [3001] }],
    ['rooms that are not a list', { rooms: {} }],
    ['a body with no rooms', {}],
  ])('rejects %s', async (_what, body) => {
    const result = await fetchRooms(BASE, 'a.are', undefined, fetching(respond(200, body)));
    expect(result).toEqual({ ok: false, kind: 'error', message: expect.stringContaining('shape') });
  });

  it('gives the missing-file answer of the server as an error', async () => {
    const result = await fetchRooms(BASE, 'gone.are', undefined, fetching(respond(404, { error: 'area file not found: gone.are' })));
    expect(result).toEqual({ ok: false, kind: 'error', message: 'The world index answered 404: area file not found: gone.are' });
  });

  it('uses the browser fetch and the clock by default', async () => {
    const original = global.fetch;
    global.fetch = jest.fn(async () => respond(200, { rooms: [{ vnum: 3001, name: 'The Temple' }] })) as unknown as typeof fetch;
    try {
      const result = await fetchRooms(BASE, 'midgaard.are');
      expect(result.ok && result.data).toEqual([{ vnum: 3001, name: 'The Temple' }]);
      expect(result.ok && typeof result.at).toBe('number');
    } finally {
      global.fetch = original;
    }
  });

  it('gives offline when the network is down and aborted when cancelled', async () => {
    expect((await fetchRooms(BASE, 'a.are', undefined, fetching(new TypeError('down')))).ok).toBe(false);
    const controller = new AbortController();
    controller.abort();
    expect(await fetchRooms(BASE, 'a.are', controller.signal, fetching(new TypeError('x')))).toEqual(expect.objectContaining({ kind: 'aborted' }));
  });
});
