// The instant tier (the word list behind the `hint` user script) and the local-model tier (`hint:ai`): their requests, what they keep of the answers, and when they stay silent.
import { commandsFromAnswer, commandsFromHints, instantTier, localTier, MAX_TIER_COMMANDS } from './instant';

const json = (body: unknown, status = 200): Response => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

const hints = {
  hints: {
    unlistedObjectSeen: true,
    worked: [{ command: 'enter orb', outcome: 'response', count: 4 }],
    candidates: [
      { keyword: 'fountain', kind: 'water', commands: ['look fountain', 'drink fountain', 'enter orb'] },
      { keyword: 'gate', kind: 'portal', commands: ['look in gate', 'LOOK FOUNTAIN'] },
    ],
    struckOff: [{ command: 'drink fountain', count: 3 }],
  },
};

describe('commandsFromHints', () => {
  it('puts what the logs showed working first, then the suggestions, with a struck-off command and a repeat left out', () => {
    expect(commandsFromHints(hints)).toEqual({
      commands: ['enter orb', 'look fountain', 'look in gate'],
      notes: ['an unlisted object is here (a blank-indent line)', '1 command struck off: the logs show the game rejecting them'],
    });
  });

  it('keeps at most MAX_TIER_COMMANDS, and ignores what is not shaped like an answer', () => {
    const many = { hints: { candidates: [{ commands: Array.from({ length: 20 }, (_, i) => `look thing${i}`) }] } };
    expect(commandsFromHints(many).commands).toHaveLength(MAX_TIER_COMMANDS);
    for (const bad of [null, 'x', [], {}, { hints: 'x' }, { hints: { candidates: 'x', worked: 'x', struckOff: 'x' } }, { hints: { struckOff: [null, { command: 5 }] } }, { hints: { candidates: [null, { commands: 'x' }, { commands: [4, ' '] }], worked: [null, { command: 5 }] } }]) {
      expect(commandsFromHints(bad)).toEqual({ commands: [], notes: [] });
    }
    expect(commandsFromHints({ hints: { struckOff: [{ command: 'a' }, { command: 'b' }] } }).notes).toEqual(['2 commands struck off: the logs show the game rejecting them']);
  });
});

describe('instantTier', () => {
  it('asks /api/agent/room-hints with the room and its exits, and hands on the commands', async () => {
    const urls: string[] = [];
    const tier = instantTier({ baseUrl: 'http://site.test/', fetch: async (url) => (urls.push(String(url)), json(hints)) });
    const answer = await tier({ title: 'Chamber of Rest', description: 'A round room with a fountain.', exits: ['N', 'S'] });
    expect(answer?.commands).toEqual(['enter orb', 'look fountain', 'look in gate']);
    const url = new URL(urls[0]);
    expect(url.pathname).toBe('/api/agent/room-hints');
    expect(url.searchParams.get('title')).toBe('Chamber of Rest');
    expect(url.searchParams.get('description')).toBe('A round room with a fountain.');
    expect(url.searchParams.getAll('exits')).toEqual(['N', 'S']);
    expect(url.searchParams.get('unlisted')).toBe('false');
  });

  it('cuts a long description and a long exit list to what the route accepts', async () => {
    const urls: string[] = [];
    const tier = instantTier({ baseUrl: 'http://site.test', fetch: async (url) => (urls.push(String(url)), json(hints)) });
    await tier({ title: 'Hall', description: 'x'.repeat(9000), exits: Array.from({ length: 30 }, () => 'N') });
    const url = new URL(urls[0]);
    expect(url.searchParams.get('description')).toHaveLength(3900);
    expect(url.searchParams.getAll('exits')).toHaveLength(12);
  });

  it('cannot answer with no title, no commands, an error status, a failed call or an answer that is not JSON', async () => {
    const make = (fetchImpl: typeof fetch) => instantTier({ baseUrl: 'http://site.test', fetch: fetchImpl });
    expect(await make(async () => json(hints))({ title: ' ' })).toBeNull();
    expect(await make(async () => json({ hints: { candidates: [] } }))({ title: 'Hall' })).toBeNull();
    expect(await make(async () => json({}, 500))({ title: 'Hall' })).toBeNull();
    expect(await make(async () => Promise.reject(new Error('down')))({ title: 'Hall' })).toBeNull();
    expect(await make(async () => ({ ok: true, json: async () => Promise.reject(new SyntaxError('x')) }) as unknown as Response)({ title: 'Hall' })).toBeNull();
  });

  it('passes the caller\'s cancel signal on, and works with no signal and the default fetch and timeout', async () => {
    const controller = new AbortController();
    const seen: AbortSignal[] = [];
    const tier = instantTier({ baseUrl: 'http://site.test', fetch: async (_url, init) => (seen.push(init?.signal as AbortSignal), json(hints)) });
    await tier({ title: 'Hall' }, controller.signal);
    controller.abort();
    expect(seen[0].aborted).toBe(true);
    const offline = instantTier({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 50 });
    expect(await offline({ title: 'Hall' })).toBeNull();
  });
});

describe('commandsFromAnswer', () => {
  it('keeps the lines that look like commands: bullets, numbers and backticks removed, prose and repeats dropped', () => {
    const answer = ['Here are some ideas:', '- look fountain', '2. `drink fountain`', '3) enter orb', 'look fountain', 'This is a long sentence that is not a command at all.', 'push button.', ''].join('\n');
    expect(commandsFromAnswer(answer)).toEqual(['look fountain', 'drink fountain', 'enter orb']);
    expect(commandsFromAnswer(undefined as unknown as string)).toEqual([]);
  });
});

describe('localTier', () => {
  const answer = { result: { ok: true, model: 'm', answer: '- look fountain\n- enter orb' } };

  it('does not call anything, and loads no model, unless it is allowed', async () => {
    const fetchSpy = jest.fn(async () => json(answer));
    const tier = localTier({ baseUrl: 'http://site.test', fetch: fetchSpy as never, allowed: () => false });
    expect(await tier({ title: 'Hall' })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts the room to /api/agent/room-hints/ai when allowed, and hands on the commands with a warning that they can be wrong', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const tier = localTier({
      baseUrl: 'http://site.test/',
      allowed: () => true,
      fetch: async (url, init) => (calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }), json(answer)),
    });
    const result = await tier({ title: 'Hall', description: 'A hall.', exits: ['N'] });
    expect(result).toEqual({ commands: ['look fountain', 'enter orb'], notes: ['written by the local model from the room text: check each command, it can be wrong'] });
    expect(calls).toEqual([{ url: 'http://site.test/api/agent/room-hints/ai', body: { title: 'Hall', description: 'A hall.', exits: ['N'], objects: [], creatures: [], unlisted: false } }]);
  });

  it('cannot answer with no title, an error, a model that said it could not, an answer with no commands, or a failed call', async () => {
    const make = (fetchImpl: typeof fetch) => localTier({ baseUrl: 'http://site.test', allowed: () => true, fetch: fetchImpl });
    expect(await make(async () => json(answer))({ title: '' })).toBeNull();
    expect(await make(async () => json(answer, 503))({ title: 'Hall' })).toBeNull();
    expect(await make(async () => json({ result: { ok: false, error: 'busy' } }))({ title: 'Hall' })).toBeNull();
    expect(await make(async () => json({ result: { ok: true, answer: 'Sorry, I have no idea what to do here at all.' } }))({ title: 'Hall' })).toBeNull();
    expect(await make(async () => json({ result: 'x' }))({ title: 'Hall' })).toBeNull();
    expect(await make(async () => Promise.reject(new Error('down')))({ title: 'Hall' })).toBeNull();
  });

  it('passes the cancel signal on and uses the default fetch when none is given', async () => {
    const controller = new AbortController();
    const tier = localTier({ baseUrl: 'http://127.0.0.1:9', allowed: () => true, timeoutMs: 50 });
    expect(await tier({ title: 'Hall' }, controller.signal)).toBeNull();
  });
});
