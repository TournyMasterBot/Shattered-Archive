import type { Decision } from '@shatteredarchive/copilot-core';
import { createCopilotApi } from './api';

/** jsdom has no Response: the client only reads ok, status and json(). */
const json = (body: unknown, status = 200): Response => ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(JSON.stringify(body)) }) as unknown as Response;
const notJson = (status = 200): Response => ({ ok: status < 300, status, json: async () => { throw new SyntaxError('Unexpected token <'); } }) as unknown as Response;
const suggestion = {
  id: 's1',
  character: 'Agate-F',
  createdAt: 5,
  mode: 'exploration',
  sphere: 'world',
  kind: 'info',
  command: 'look',
  rationale: 'Look around.',
  confidence: 0.9,
  confidenceSource: 'model',
  situationKey: 'exploration:hall',
};
const decision: Decision = { id: 'd1', suggestionId: 's1', character: 'Agate-F', at: 10, outcome: 'approved', command: 'look' };
const state = { connected: true, stale: false, staleAfterSeconds: 60, lastEventAgeSeconds: 2, inFight: false, room: { name: 'Hall', sector: 'inside', exits: ['N'] }, extra: 1 };

function api(fetchImpl: typeof fetch, timeoutMs?: number) {
  return createCopilotApi({ baseUrl: 'https://copilot.test/', fetch: fetchImpl, timeoutMs });
}
const never = (_url: unknown, init?: RequestInit): Promise<Response> =>
  new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));

describe('getState', () => {
  it('reads the state and asks the right URL once', async () => {
    const urls: string[] = [];
    const result = await api(async (url) => {
      urls.push(String(url));
      return json(state);
    }).getState(new AbortController().signal);
    expect(result).toEqual({ ok: true, value: state });
    expect(urls).toEqual(['https://copilot.test/state']);
  });

  it.each([
    ['not an object', 'text'],
    ['missing fields', { connected: true }],
    ['a room that is not an object', { ...state, room: 5 }],
    ['an age that is not a number or null', { ...state, lastEventAgeSeconds: 'x' }],
    ['an array', [state]],
  ])('is invalid for %s', async (_label, body) => {
    expect(await api(async () => json(body)).getState(new AbortController().signal)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('accepts no room and no event age yet', async () => {
    const result = await api(async () => json({ ...state, room: null, lastEventAgeSeconds: null })).getState(new AbortController().signal);
    expect(result.ok).toBe(true);
  });
});

describe('getSuggestions', () => {
  it('returns the suggestions that pass validation and drops the rest', async () => {
    const result = await api(async () => json({ suggestions: [suggestion, { ...suggestion, id: 'bad', kind: 'dance' }, 7] })).getSuggestions(new AbortController().signal);
    expect(result).toEqual({ ok: true, value: [suggestion] });
  });

  it('is invalid when the answer has no list', async () => {
    expect(await api(async () => json({ nope: [] })).getSuggestions(new AbortController().signal)).toEqual({ ok: false, reason: 'invalid' });
    expect(await api(async () => json(null)).getSuggestions(new AbortController().signal)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('getCharacters', () => {
  it('returns the list, and is invalid without one', async () => {
    const characters = [{ codename: 'Agate-F', kind: 'test', gender: 'F', hasDescription: true }];
    expect(await api(async () => json({ characters })).getCharacters(new AbortController().signal)).toEqual({ ok: true, value: characters });
    expect(await api(async () => json({})).getCharacters(new AbortController().signal)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('is invalid when the answer is not an object', async () => {
    expect(await api(async () => json(null)).getCharacters(new AbortController().signal)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('passes a failure on', async () => {
    expect(await api(async () => json({}, 500)).getCharacters(new AbortController().signal)).toEqual({ ok: false, reason: 'http', status: 500 });
  });
});

describe('getOpenTickets', () => {
  const ticket = { id: 't1', createdAt: 5, character: 'Agate-F', reason: 'low-confidence', sphere: 'world', kind: 'move', situationKey: 'exploration:hall', summary: 'Unsure which exit.', status: 'open' };

  it('asks for the open tickets only, and keeps the valid ones', async () => {
    const urls: string[] = [];
    const result = await api(async (url) => {
      urls.push(String(url));
      return json({ tickets: [ticket, { id: 'bad' }] });
    }).getOpenTickets(new AbortController().signal);
    expect(urls).toEqual(['https://copilot.test/tickets?status=open&limit=200']);
    expect(result).toEqual({ ok: true, value: [ticket] });
  });

  it('is invalid when the answer holds no ticket list, and http on an error status', async () => {
    expect(await api(async () => json({})).getOpenTickets(new AbortController().signal)).toEqual({ ok: false, reason: 'invalid' });
    expect(await api(async () => json(null)).getOpenTickets(new AbortController().signal)).toEqual({ ok: false, reason: 'invalid' });
    expect(await api(async () => json({}, 500)).getOpenTickets(new AbortController().signal)).toEqual({ ok: false, reason: 'http', status: 500 });
  });
});

describe('postDecision', () => {
  it('posts a valid decision as JSON and reports whether it was new', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const result = await api(async (url, init) => {
      seen.push({ url: String(url), init });
      return json({ ok: true, id: 'd1', written: true }, 201);
    }).postDecision(decision, new AbortController().signal);
    expect(result).toEqual({ ok: true, value: { written: true } });
    expect(seen[0].url).toBe('https://copilot.test/decisions');
    expect(seen[0].init?.method).toBe('POST');
    expect(JSON.parse(String(seen[0].init?.body))).toEqual(decision);
  });

  it('sends nothing for an invalid decision', async () => {
    let calls = 0;
    const result = await api(async () => {
      calls++;
      return json({});
    }).postDecision({ ...decision, outcome: 'maybe' } as unknown as Decision, new AbortController().signal);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(calls).toBe(0);
  });

  it('is invalid when the answer does not say whether it was written', async () => {
    expect(await api(async () => json({ ok: true })).postDecision(decision, new AbortController().signal)).toEqual({ ok: false, reason: 'invalid' });
    expect(await api(async () => json(null)).postDecision(decision, new AbortController().signal)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('passes on the status of a rejection', async () => {
    expect(await api(async () => json({ error: 'invalid decision' }, 400)).postDecision(decision, new AbortController().signal)).toEqual({ ok: false, reason: 'http', status: 400 });
  });
});

describe('postDecision with a bucket', () => {
  it('sends the sphere and kind of the bucket', async () => {
    const seen: RequestInit[] = [];
    await api(async (_url, init) => {
      seen.push(init ?? {});
      return json({ ok: true, id: 'd1', written: true }, 201);
    }).postDecision({ ...decision, sphere: 'world', kind: 'info' }, new AbortController().signal);
    expect(JSON.parse(String(seen[0].body))).toMatchObject({ sphere: 'world', kind: 'info' });
  });
});

describe('getBucketStats', () => {
  it('reads the table and asks the right URL once', async () => {
    const urls: string[] = [];
    const result = await api(async (url) => {
      urls.push(String(url));
      return json({ buckets: { 'world:move': { approved: 18, total: 20 } } });
    }).getBucketStats(new AbortController().signal);
    expect(result).toEqual({ ok: true, value: { 'world:move': { approved: 18, total: 20 } } });
    expect(urls).toEqual(['https://copilot.test/stats/buckets']);
  });

  it('drops entries that are not real buckets with possible counts', async () => {
    const result = await api(async () => json({ buckets: { 'world:move': { approved: 3, total: 2 }, 'sky:move': { approved: 1, total: 1 }, 'world:info': { approved: 1, total: 1 } } })).getBucketStats(
      new AbortController().signal,
    );
    expect(result).toEqual({ ok: true, value: { 'world:info': { approved: 1, total: 1 } } });
  });

  it.each([['no buckets key', {}], ['buckets not an object', { buckets: 5 }], ['buckets an array', { buckets: [] }], ['a body that is not an object', 'text']])('is invalid for %s', async (_label, body) => {
    expect(await api(async () => json(body)).getBucketStats(new AbortController().signal)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('passes on a server error and an unreachable server', async () => {
    expect(await api(async () => json({}, 503)).getBucketStats(new AbortController().signal)).toEqual({ ok: false, reason: 'http', status: 503 });
    expect(
      await api(async () => {
        throw new TypeError('network');
      }).getBucketStats(new AbortController().signal),
    ).toEqual({ ok: false, reason: 'offline' });
  });
});

describe('postTicket', () => {
  const ticket = {
    id: 't-s1',
    createdAt: 5,
    character: 'Agate-F',
    reason: 'unknown-situation' as const,
    sphere: 'world' as const,
    kind: 'unknown' as const,
    situationKey: 'exploration:hall',
    summary: 'Copilot did not know what kind of command this was.',
    status: 'open' as const,
  };

  it('posts a valid ticket as JSON and reports whether it was new', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const result = await api(async (url, init) => {
      seen.push({ url: String(url), init });
      return json({ ok: true, id: 't-s1', written: false }, 200);
    }).postTicket(ticket, new AbortController().signal);
    expect(result).toEqual({ ok: true, value: { written: false } });
    expect(seen[0].url).toBe('https://copilot.test/tickets');
    expect(seen[0].init?.method).toBe('POST');
    expect(JSON.parse(String(seen[0].init?.body))).toEqual(ticket);
  });

  it('sends nothing for an invalid ticket', async () => {
    let calls = 0;
    const result = await api(async () => {
      calls++;
      return json({});
    }).postTicket({ ...ticket, reason: 'bored' } as never, new AbortController().signal);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(calls).toBe(0);
  });

  it('is invalid when the answer does not say whether it was written, and passes on an error status', async () => {
    expect(await api(async () => json({ ok: true })).postTicket(ticket, new AbortController().signal)).toEqual({ ok: false, reason: 'invalid' });
    expect(await api(async () => json(null)).postTicket(ticket, new AbortController().signal)).toEqual({ ok: false, reason: 'invalid' });
    expect(await api(async () => json({}, 400)).postTicket(ticket, new AbortController().signal)).toEqual({ ok: false, reason: 'http', status: 400 });
  });
});

describe('failures', () => {
  it('an unreachable server is offline, not an exception (E1)', async () => {
    const result = await api(async () => {
      throw new TypeError('Failed to fetch');
    }).getSuggestions(new AbortController().signal);
    expect(result).toEqual({ ok: false, reason: 'offline' });
  });

  it('a server that takes too long is offline', async () => {
    expect(await api(never as typeof fetch, 20).getState(new AbortController().signal)).toEqual({ ok: false, reason: 'offline' });
  });

  it('an error status is http with the status', async () => {
    expect(await api(async () => notJson(503)).getState(new AbortController().signal)).toEqual({ ok: false, reason: 'http', status: 503 });
  });

  it('a body that is not JSON is invalid', async () => {
    expect(await api(async () => notJson()).getState(new AbortController().signal)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('aborting before or during a call gives aborted and cancels the request (unmount)', async () => {
    const early = new AbortController();
    early.abort();
    expect(await api(never as typeof fetch).getState(early.signal)).toEqual({ ok: false, reason: 'aborted' });

    let cancelled = false;
    const slow = (_url: unknown, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => {
          cancelled = true;
          reject(new DOMException('aborted', 'AbortError'));
        }),
      );
    const controller = new AbortController();
    const pending = api(slow as typeof fetch, 5000).getSuggestions(controller.signal);
    setTimeout(() => controller.abort(), 10);
    expect(await pending).toEqual({ ok: false, reason: 'aborted' });
    expect(cancelled).toBe(true);
  });

  it('uses the global fetch and a 10 s default timeout when none are given', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => json(state)) as typeof fetch;
    try {
      expect((await createCopilotApi({ baseUrl: 'https://copilot.test' }).getState(new AbortController().signal)).ok).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('setLearning (the Copilot switch, told to the server)', () => {
  const signal = () => new AbortController().signal;

  it('posts exactly { enabled } to /control and returns the state the server now has', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const api = createCopilotApi({
      baseUrl: 'http://x',
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return { ok: true, status: 200, json: async () => ({ enabled: true }) } as Response;
      }) as unknown as typeof fetch,
    });
    expect(await api.setLearning(true, signal())).toEqual({ ok: true, value: { enabled: true } });
    expect(calls[0].url).toBe('http://x/control');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ enabled: true });
  });

  it.each([
    ['an answer that is not the state', { ok: true }, { ok: false, reason: 'invalid' }],
    ['an answer that is not even an object', null, { ok: false, reason: 'invalid' }],
    ['a refusal', undefined, { ok: false, reason: 'http', status: 400 }],
  ])('reports %s', async (_label, body, expected) => {
    const api = createCopilotApi({
      baseUrl: 'http://x',
      fetch: (async () => (body === undefined ? ({ ok: false, status: 400 } as Response) : ({ ok: true, status: 200, json: async () => body } as Response))) as unknown as typeof fetch,
    });
    expect(await api.setLearning(false, signal())).toEqual(expected);
  });

  it('is offline when the server cannot be reached', async () => {
    const api = createCopilotApi({
      baseUrl: 'http://x',
      fetch: (async () => {
        throw new TypeError('Failed to fetch');
      }) as unknown as typeof fetch,
    });
    expect(await api.setLearning(true, signal())).toEqual({ ok: false, reason: 'offline' });
  });

  it('reads learning from the state, accepts a server that does not send it, and refuses one that sends something else', async () => {
    const state = { connected: true, stale: false, staleAfterSeconds: 60, lastEventAgeSeconds: 1, inFight: false, room: null };
    const answer = (body: unknown) =>
      createCopilotApi({ baseUrl: 'http://x', fetch: (async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch }).getState(signal());
    expect(await answer({ ...state, learning: false })).toMatchObject({ ok: true, value: { learning: false } });
    expect(await answer(state)).toMatchObject({ ok: true });
    expect(await answer({ ...state, learning: 'yes' })).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('getTraining and setTraining', () => {
  const status = { enabled: false, world: 'sandbox', canEnable: true };

  it('reads the status of Claude training from the right URL', async () => {
    const urls: string[] = [];
    const result = await api(async (url) => (urls.push(String(url)), json(status))).getTraining(new AbortController().signal);
    expect(result).toEqual({ ok: true, value: status });
    expect(urls).toEqual(['https://copilot.test/training']);
  });

  it('keeps a refusal reason and a world that is the production game, and a status with no connection', async () => {
    const refused = { enabled: false, world: 'dsl', canEnable: false, refusal: 'not-simulacrum' };
    expect(await api(async () => json(refused)).getTraining(new AbortController().signal)).toEqual({ ok: true, value: refused });
    expect((await api(async () => json({ enabled: false, canEnable: false })).getTraining(new AbortController().signal)).ok).toBe(true);
  });

  it.each([null, 'x', {}, { enabled: 'no', canEnable: true }, { enabled: true, canEnable: 1 }, { enabled: true, canEnable: true, world: 'elsewhere' }, { enabled: true, canEnable: true, refusal: 'because' }])(
    'does not trust the answer %j',
    async (body) => {
      expect(await api(async () => json(body)).getTraining(new AbortController().signal)).toEqual({ ok: false, reason: 'invalid' });
    },
  );

  it('posts exactly the switch, answers with the status, and passes an error status on when the server said no', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const ok = await api(async (url, init) => (calls.push({ url: String(url), init }), json({ ...status, enabled: true }))).setTraining(true, new AbortController().signal);
    expect(ok).toEqual({ ok: true, value: { ...status, enabled: true } });
    expect(calls[0].url).toBe('https://copilot.test/training');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ enabled: true });
    expect(await api(async () => json({ error: 'training cannot be turned on now', reason: 'not-simulacrum' }, 409)).setTraining(true, new AbortController().signal)).toEqual({ ok: false, reason: 'http', status: 409 });
  });
});

describe('nearRooms (the walked rooms the add-room flow offers)', () => {
  const wire = { id: 'r1abc', title: 'Hall', sector: 'inside', visits: 3, sameExits: true, exits: [{ dir: 'N', toTitle: 'Study', state: 'confirmed' }, { dir: 'E' }, { nope: 1 }, 'x'], fixtures: [] };

  it('asks /world/near with the title, the exits and the world, and keeps only what the window uses', async () => {
    const urls: string[] = [];
    const result = await api(async (url) => (urls.push(String(url)), json({ rooms: [wire] }))).nearRooms('sandbox', 'The Hall', ['N', 'SE'], new AbortController().signal);
    expect(urls).toEqual(['https://copilot.test/world/near?title=The+Hall&exits=N%2CSE&world=sandbox']);
    expect(result).toEqual({ ok: true, value: [{ title: 'Hall', sector: 'inside', visits: 3, sameExits: true, exits: [{ dir: 'N', toTitle: 'Study' }, { dir: 'E' }] }] });
  });

  it('drops an entry that is not a room, and leaves out a sector that is not text', async () => {
    const body = { rooms: [null, { title: 1 }, { title: 'A', visits: 1, sameExits: false, exits: 'no' }, { title: 'B', sector: 4, visits: 2, sameExits: false, exits: [] }] };
    expect(await api(async () => json(body)).nearRooms('dsl', 'B', [], new AbortController().signal)).toEqual({
      ok: true,
      value: [{ title: 'B', visits: 2, sameExits: false, exits: [] }],
    });
  });

  it.each([null, 'x', {}, { rooms: 'no' }])('does not trust the answer %j', async (body) => {
    expect(await api(async () => json(body)).nearRooms('dsl', 'B', [], new AbortController().signal)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('passes a failure through', async () => {
    expect(await api(async () => json({}, 404)).nearRooms('dsl', 'B', [], new AbortController().signal)).toEqual({ ok: false, reason: 'http', status: 404 });
  });
});
