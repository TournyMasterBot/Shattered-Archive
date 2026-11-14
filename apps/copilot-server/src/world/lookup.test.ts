import { createNameLabeler } from './lookup';

interface Calls {
  urls: string[];
}

function fakeFetch(routes: Record<string, unknown | (() => unknown)>, calls: Calls = { urls: [] }): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.urls.push(url.replace('http://archive.test', ''));
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (key === undefined) return new Response('{}', { status: 404 });
    const value = routes[key];
    const body = typeof value === 'function' ? (value as () => unknown)() : value;
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

const creatures = (...names: string[]): { creatures: { name: string }[] } => ({
  creatures: names.map((name) => ({ name })),
});

const items = [
  { item_name: 'a black demonic skull' },
  { item_name: 'the brass bell' },
  { item_name: 'axe' },
  { item_name: 5 },
  null,
  {},
];

describe('createNameLabeler', () => {
  it('says mob for an unindented line that contains a creature name, item for an indented line that contains an item name, else unknown', async () => {
    const labeler = createNameLabeler({
      baseUrl: 'http://archive.test/',
      fetch: fakeFetch({
        '/api/agent/bestiary': creatures('A Nightwarden of Drakkara', 'a gully dwarf'),
        '/data/items.json': items,
      }),
    });
    await labeler.refresh();
    expect(labeler.size).toEqual({ creatures: 2, items: 2 });
    expect(labeler.label('A Nightwarden of Drakkara tends to the tower above.', 'creature')).toBe('mob');
    expect(labeler.label('A gully dwarf is sweeping the floor.', 'creature')).toBe('mob');
    expect(labeler.label('A black demonic skull trickles quietly with water here.', 'object')).toBe('item');
    expect(labeler.label('The brass bell hangs by the door.', 'object')).toBe('item');
    // the kind follows where the line was printed: a creature name on an object line is not a creature
    expect(labeler.label('A gully dwarf is sweeping the floor.', 'object')).toBe('unknown');
    expect(labeler.label('A black demonic skull trickles quietly with water here.', 'creature')).toBe('unknown');
    expect(labeler.label('Something nobody has heard of rests here.', 'creature')).toBe('unknown');
    expect(labeler.label('', 'creature')).toBe('unknown');
    expect(labeler.label('!!!', 'object')).toBe('unknown');
  });

  it('matches whole words only and ignores names that are too short to mean anything', async () => {
    const labeler = createNameLabeler({
      baseUrl: 'http://archive.test',
      fetch: fakeFetch({ '/api/agent/bestiary': creatures('a bat', 'imp dancer'), '/data/items.json': items }),
    });
    await labeler.refresh();
    expect(labeler.size.creatures).toBe(1); // "bat" is under 5 characters
    expect(labeler.label('A bat flutters overhead.', 'creature')).toBe('unknown');
    expect(labeler.label('An imp dancer twirls here.', 'creature')).toBe('mob');
    expect(labeler.label('A nimp dancers troupe rests here.', 'creature')).toBe('unknown');
    expect(labeler.label('An axe lies here.', 'object')).toBe('unknown'); // "axe" is too short
  });

  it('says unknown for everything before the names are loaded, and without an archive address', async () => {
    const calls: Calls = { urls: [] };
    const labeler = createNameLabeler({
      baseUrl: 'http://archive.test',
      fetch: fakeFetch({ '/api/agent/bestiary': creatures('a gully dwarf'), '/data/items.json': items }, calls),
    });
    expect(labeler.label('A gully dwarf is here.', 'creature')).toBe('unknown');
    const none = createNameLabeler({ fetch: fakeFetch({}, calls) });
    await none.refresh();
    expect(none.label('A gully dwarf is here.', 'creature')).toBe('unknown');
    expect(calls.urls).toEqual([]);
  });

  it('reads the creature list page by page until there is no next offset', async () => {
    const calls: Calls = { urls: [] };
    const pages = [
      { creatures: [{ name: 'a gully dwarf' }], nextOffset: 1 },
      { creatures: [{ name: 'a wandering minstrel' }], nextOffset: 2 },
      { creatures: [{ name: 'a surly innkeeper' }], nextOffset: null },
    ];
    let page = 0;
    const labeler = createNameLabeler({
      baseUrl: 'http://archive.test',
      fetch: fakeFetch({ '/api/agent/bestiary': () => pages[page++], '/data/items.json': items }, calls),
    });
    await labeler.refresh();
    expect(labeler.size.creatures).toBe(3);
    expect(calls.urls.filter((u) => u.startsWith('/api/agent/bestiary'))).toEqual([
      '/api/agent/bestiary?limit=500&offset=0',
      '/api/agent/bestiary?limit=500&offset=1',
      '/api/agent/bestiary?limit=500&offset=2',
    ]);
  });

  it('stops paging when the server does not advance the offset', async () => {
    const calls: Calls = { urls: [] };
    const labeler = createNameLabeler({
      baseUrl: 'http://archive.test',
      fetch: fakeFetch(
        { '/api/agent/bestiary': { creatures: [{ name: 'a gully dwarf' }], nextOffset: 0 }, '/data/items.json': items },
        calls,
      ),
    });
    await labeler.refresh();
    expect(calls.urls.filter((u) => u.startsWith('/api/agent/bestiary'))).toHaveLength(1);
  });

  it('keeps the names while they are fresh, refreshes after the time to live, and runs one load at a time', async () => {
    let now = 1_000;
    const calls: Calls = { urls: [] };
    const labeler = createNameLabeler({
      baseUrl: 'http://archive.test',
      now: () => now,
      ttlMs: 10_000,
      fetch: fakeFetch({ '/api/agent/bestiary': creatures('a gully dwarf'), '/data/items.json': items }, calls),
    });
    await Promise.all([labeler.refresh(), labeler.refresh(), labeler.refresh()]);
    expect(calls.urls).toHaveLength(2); // one bestiary page, one item list
    now += 9_999;
    await labeler.refresh();
    expect(calls.urls).toHaveLength(2);
    now += 2;
    await labeler.refresh();
    expect(calls.urls).toHaveLength(4);
  });

  it('a failed fetch keeps what was loaded, tries again after the retry time, and never throws', async () => {
    let now = 0;
    let failing = false;
    const calls: Calls = { urls: [] };
    const labeler = createNameLabeler({
      baseUrl: 'http://archive.test',
      now: () => now,
      ttlMs: 100,
      retryMs: 1_000,
      fetch: fakeFetch(
        {
          '/api/agent/bestiary': () => (failing ? new Error('connection refused') : creatures('a gully dwarf')),
          '/data/items.json': () => (failing ? new Error('connection refused') : items),
        },
        calls,
      ),
    });
    await labeler.refresh();
    expect(labeler.size.creatures).toBe(1);
    failing = true;
    now = 200;
    await expect(labeler.refresh()).resolves.toBeUndefined();
    expect(labeler.label('A gully dwarf is here.', 'creature')).toBe('mob');
    const failed = calls.urls.length;
    now = 900; // inside the retry wait
    await labeler.refresh();
    expect(calls.urls).toHaveLength(failed);
    failing = false;
    now = 1_300;
    await labeler.refresh();
    expect(calls.urls.length).toBeGreaterThan(failed);
  });

  it('treats an HTTP error or an unexpected item list as a failed load', async () => {
    const http = createNameLabeler({ baseUrl: 'http://archive.test', fetch: fakeFetch({}) });
    await http.refresh();
    expect(http.size).toEqual({ creatures: 0, items: 0 });
    const notAList = createNameLabeler({
      baseUrl: 'http://archive.test',
      fetch: fakeFetch({ '/api/agent/bestiary': creatures('a gully dwarf'), '/data/items.json': { items: [] } }),
    });
    await notAList.refresh();
    expect(notAList.size).toEqual({ creatures: 0, items: 0 }); // both or neither: a half-loaded set is not used
  });

  it('survives a creature entry with no usable name and a missing creature list', async () => {
    const labeler = createNameLabeler({
      baseUrl: 'http://archive.test',
      fetch: fakeFetch({
        '/api/agent/bestiary': { creatures: [null, {}, { name: 7 }, { name: 'a gully dwarf' }] },
        '/data/items.json': [],
      }),
    });
    await labeler.refresh();
    expect(labeler.size.creatures).toBe(1);
    const none = createNameLabeler({
      baseUrl: 'http://archive.test',
      fetch: fakeFetch({ '/api/agent/bestiary': {}, '/data/items.json': [] }),
    });
    await none.refresh();
    expect(none.size.creatures).toBe(0);
  });
});

describe('createNameLabeler: defaults and limits', () => {
  it('works with no options at all: no archive, so every label is unknown and nothing is fetched', async () => {
    const labeler = createNameLabeler();
    await labeler.refresh();
    expect(labeler.label('A gully dwarf is here.', 'creature')).toBe('unknown');
    expect(labeler.size).toEqual({ creatures: 0, items: 0 });
  });

  it('stops reading item names at the cap, and puts names that share a first word in one bucket', async () => {
    const many = Array.from({ length: 60_100 }, (_, i) => ({ item_name: `unique relic number ${i}` }));
    const labeler = createNameLabeler({
      baseUrl: 'http://archive.test',
      fetch: fakeFetch({
        '/api/agent/bestiary': creatures('a gully dwarf', 'a gully hound'),
        '/data/items.json': many,
      }),
    });
    await labeler.refresh();
    expect(labeler.size).toEqual({ creatures: 2, items: 60_000 });
    expect(labeler.label('A gully hound growls here.', 'creature')).toBe('mob');
    expect(labeler.label('A unique relic number 59999 gleams here.', 'object')).toBe('item');
    expect(labeler.label('A unique relic number 60050 gleams here.', 'object')).toBe('unknown'); // past the cap
  });
});
