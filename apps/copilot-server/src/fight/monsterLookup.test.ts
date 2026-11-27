import { httpMonsterLookup, namesKeyword } from './monsterLookup';

const answer = (body: unknown, ok = true): typeof fetch => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe('namesKeyword', () => {
  it('is true when a word of the name, the short description or the keywords starts with the typed word', () => {
    expect(namesKeyword({ name: 'a cave goblin' }, 'gob')).toBe(true);
    expect(namesKeyword({ name: 'The Goblin King' }, 'GOBLIN')).toBe(true);
    expect(namesKeyword({ shortDescription: 'a wolf' }, 'wolf')).toBe(true);
    expect(namesKeyword({ keywords: ['orc', 'chief'] }, 'chi')).toBe(true);
    expect(namesKeyword({ keywords: 'big red dragon' }, 'dragon')).toBe(true);
  });

  it('is false for a creature that only shares a letter, other fields, or something that is not a creature', () => {
    expect(namesKeyword({ name: 'a goblin' }, 'lin')).toBe(false); // a word must START with it
    expect(namesKeyword({ room: 'The goblin cave', name: 'a bat' }, 'goblin')).toBe(false);
    expect(namesKeyword({ name: 12, keywords: [1, 'bat'] }, 'goblin')).toBe(false);
    expect(namesKeyword(null, 'goblin')).toBe(false);
    expect(namesKeyword('goblin', 'goblin')).toBe(false);
    expect(namesKeyword({ name: '' }, 'goblin')).toBe(false);
  });
});

describe('httpMonsterLookup', () => {
  it('asks the bestiary for the keyword and identifies the monster only from results that name it', async () => {
    const urls: string[] = [];
    const doFetch = (async (url: string) => {
      urls.push(url);
      return { ok: true, json: async () => ({ shown: 3, creatures: [{ name: 'a goblin guard', level: 6 }, { name: 'a bat', room: 'goblin cave' }, { name: 'goblin chief', level: 9 }] }) };
    }) as unknown as typeof fetch;
    const lookup = httpMonsterLookup({ baseUrl: 'https://archive.example/', fetch: doFetch, timeoutMs: 2000 });
    const result = await lookup('goblin');
    expect(urls).toEqual(['https://archive.example/api/agent/bestiary?q=goblin&limit=9']);
    expect(result.found).toBe(true);
    expect(result.facts).toHaveLength(2);
    expect(result.facts[0]).toContain('goblin guard');
  });

  it('is "not identified" for a stranger in the list, an empty list, a bad answer, an error status and a failed request', async () => {
    const options = { baseUrl: 'https://archive.example' };
    expect(await httpMonsterLookup({ ...options, fetch: answer({ creatures: [{ name: 'a bat' }] }) })('goblin')).toEqual({ found: false, facts: [] });
    expect(await httpMonsterLookup({ ...options, fetch: answer({ creatures: [] }) })('goblin')).toEqual({ found: false, facts: [] });
    expect(await httpMonsterLookup({ ...options, fetch: answer('nonsense') })('goblin')).toEqual({ found: false, facts: [] });
    expect(await httpMonsterLookup({ ...options, fetch: answer(null) })('goblin')).toEqual({ found: false, facts: [] });
    expect(await httpMonsterLookup({ ...options, fetch: answer({ shown: 0, nextOffset: null }) })('goblin')).toEqual({ found: false, facts: [] });
    expect(await httpMonsterLookup({ ...options, fetch: answer([{ name: 'a goblin' }], false) })('goblin')).toEqual({ found: false, facts: [] });
    const failing = (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    expect(await httpMonsterLookup({ ...options, fetch: failing })('goblin')).toEqual({ found: false, facts: [] });
  });

  it('uses the platform fetch when none is given', async () => {
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => [{ name: 'a goblin' }] } as unknown as Response);
    try {
      expect((await httpMonsterLookup({ baseUrl: 'https://archive.example' })('goblin')).found).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('reads a list that is the whole answer, cuts a long fact, and never asks for a blank keyword', async () => {
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return { ok: true, json: async () => [{ name: 'goblin', note: 'x'.repeat(1000) }] };
    }) as unknown as typeof fetch;
    const lookup = httpMonsterLookup({ baseUrl: 'https://archive.example', fetch: counting });
    const found = await lookup('goblin', new AbortController().signal);
    expect(found.facts[0]).toHaveLength(240);
    expect(await lookup('')).toEqual({ found: false, facts: [] });
    expect(calls).toBe(1);
  });
});
