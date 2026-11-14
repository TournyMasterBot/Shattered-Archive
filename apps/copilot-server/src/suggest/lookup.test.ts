import { makeSituation } from '../testing/situations';
import { httpLookup } from './lookup';

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

describe('httpLookup', () => {
  it('asks the areas endpoint for the world and the bestiary for fighting, by room name, and returns short fact lines', async () => {
    const urls: string[] = [];
    const lookup = httpLookup({
      baseUrl: 'https://archive.example/',
      fetch: async (url) => {
        urls.push(String(url));
        return json({ total: 9, areas: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] });
      },
    });
    const facts = await lookup('world', makeSituation());
    expect(facts).toEqual(['{"name":"A"}', '{"name":"B"}', '{"name":"C"}']);
    await lookup('fighting', makeSituation({ game: { room: { name: 'Dark Cave & Co', sector: '', exits: [] } } }));
    expect(urls).toEqual([
      'https://archive.example/api/agent/areas?q=Market%20Square&limit=3',
      'https://archive.example/api/agent/bestiary?q=Dark%20Cave%20%26%20Co&limit=3',
    ]);
  });

  it('accepts a bare list and cuts long facts', async () => {
    const lookup = httpLookup({ baseUrl: 'https://archive.example', fetch: async () => json([{ text: 'x'.repeat(1000) }]) });
    const facts = await lookup('world', makeSituation());
    expect(facts).toHaveLength(1);
    expect(facts[0]).toHaveLength(240);
  });

  it('has no facts for a sphere without an endpoint, for an unknown room, or for an answer that holds no list', async () => {
    let calls = 0;
    const lookup = httpLookup({
      baseUrl: 'https://archive.example',
      fetch: async () => {
        calls++;
        return json({ total: 0 });
      },
    });
    expect(await lookup('interaction', makeSituation())).toEqual([]);
    expect(await lookup('things', makeSituation())).toEqual([]);
    expect(await lookup('world', makeSituation({ game: { room: undefined } }))).toEqual([]);
    expect(calls).toBe(0);
    expect(await lookup('world', makeSituation())).toEqual([]);
    const text = httpLookup({ baseUrl: 'https://archive.example', fetch: async () => json('just text') });
    expect(await text('world', makeSituation())).toEqual([]);
    const nul = httpLookup({ baseUrl: 'https://archive.example', fetch: async () => json(null) });
    expect(await nul('world', makeSituation())).toEqual([]);
  });

  it('has no facts for an HTTP error, a network failure, a bad body or a timeout, and obeys the caller signal', async () => {
    const make = (fetchImpl: typeof fetch, timeoutMs?: number) => httpLookup({ baseUrl: 'https://archive.example', fetch: fetchImpl, timeoutMs });
    expect(await make(async () => json({}, 500))('world', makeSituation())).toEqual([]);
    expect(
      await make(async () => {
        throw new TypeError('down');
      })('world', makeSituation()),
    ).toEqual([]);
    expect(await make(async () => new Response('not json'))('world', makeSituation())).toEqual([]);
    const hang = (_u: unknown, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    expect(await make(hang as typeof fetch, 20)('world', makeSituation())).toEqual([]);
    const controller = new AbortController();
    const pending = make(hang as typeof fetch, 5000)('world', makeSituation(), controller.signal);
    setTimeout(() => controller.abort(), 10);
    expect(await pending).toEqual([]);
  });

  it('uses the global fetch and a default timeout when none are given', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => json({ areas: [{ name: 'G' }] })) as typeof fetch;
    try {
      expect(await httpLookup({ baseUrl: 'https://archive.example' })('world', makeSituation())).toEqual(['{"name":"G"}']);
    } finally {
      globalThis.fetch = original;
    }
  });
});
