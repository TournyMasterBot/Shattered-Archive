import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import {
  JsonlStore,
  validateDecision,
  validateLesson,
  validateTicket,
  type Decision,
  type EscalationTicket,
  type LedgerFs,
  type Lesson,
  type Suggestion,
} from '@shatteredarchive/copilot-core';
import { createApp, type AppDeps, type RequestLogEntry } from './app';
import type { CharacterSummary, DescriptionView } from './characters/service';
import type { StateView } from './routes/state';

/** A tiny in-memory file system for the stores. `failAppend` makes writes throw. */
class MemoryFs implements LedgerFs {
  files = new Map<string, string>();
  failAppend = false;
  async append(path: string, text: string): Promise<void> {
    if (this.failAppend) throw new Error('disk full: /secret/path');
    this.files.set(path, (this.files.get(path) ?? '') + text);
  }
  async read(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }
  async size(path: string): Promise<number | undefined> {
    return this.files.get(path)?.length;
  }
  async rename(from: string, to: string): Promise<void> {
    this.files.set(to, this.files.get(from) ?? '');
    this.files.delete(from);
  }
  async list(prefix: string): Promise<string[]> {
    return [...this.files.keys()].filter((p) => p.startsWith(prefix));
  }
}

const ORIGIN = 'https://game-client.shatteredarchive.dev';

const decision: Decision = { id: 'd1', suggestionId: 's1', character: 'Agate-F', at: 1000, outcome: 'approved', command: 'north' };
const ticket: EscalationTicket = {
  id: 't1',
  createdAt: 1000,
  character: 'Agate-F',
  reason: 'unknown-situation',
  sphere: 'interaction',
  kind: 'interact',
  situationKey: 'hall-door',
  summary: 'The agent did not know how to open the door.',
  status: 'open',
};

interface Harness {
  base: string;
  fs: MemoryFs;
  logs: RequestLogEntry[];
  deps: AppDeps;
  close: () => Promise<void>;
}

async function start(overrides: Partial<AppDeps> = {}): Promise<Harness> {
  const fs = new MemoryFs();
  const { store: decisions } = await JsonlStore.open<Decision>({ fs, path: '/d.jsonl', validate: validateDecision });
  const { store: tickets } = await JsonlStore.open<EscalationTicket>({ fs, path: '/t.jsonl', validate: validateTicket });
  const { store: lessons } = await JsonlStore.open<Lesson>({ fs, path: '/l.jsonl', validate: validateLesson });
  const logs: RequestLogEntry[] = [];
  const deps: AppDeps = {
    allowedOrigins: [ORIGIN, 'http://localhost:30080'],
    stores: { decisions, tickets, lessons },
    version: '9.9.9',
    startedAt: Date.UTC(2026, 10, 6, 12, 0, 0),
    log: (entry) => logs.push(entry),
    ...overrides,
  };
  const server: Server = createApp(deps).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    fs,
    logs,
    deps,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let h: Harness;
afterEach(async () => {
  await h?.close();
});

const json = (body: unknown, extra: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...extra },
  body: JSON.stringify(body),
});

describe('GET /health', () => {
  it('answers ok with the version and the start time', async () => {
    h = await start();
    const res = await fetch(`${h.base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: '9.9.9', startedAt: '2026-11-06T12:00:00.000Z' });
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});

describe('origin guard (a foreign Origin is refused)', () => {
  it('refuses a foreign origin on GET and POST with 403 and does not run the handler', async () => {
    h = await start();
    for (const origin of ['https://evil.example', 'null', 'http://game-client.shatteredarchive.dev.evil.com', 'https://GAME-CLIENT.shatteredarchive.dev']) {
      const get = await fetch(`${h.base}/health`, { headers: { Origin: origin } });
      expect(get.status).toBe(403);
      expect(await get.json()).toEqual({ error: 'origin not allowed' });
      expect(get.headers.get('access-control-allow-origin')).toBeNull();

      const post = await fetch(`${h.base}/decisions`, json(decision, { Origin: origin }));
      expect(post.status).toBe(403);
    }
    expect(h.deps.stores.decisions.query()).toEqual([]);
  });

  it('lets an allowed origin through with the CORS headers', async () => {
    h = await start();
    const res = await fetch(`${h.base}/health`, { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('vary')).toBe('Origin');
  });

  it('answers the preflight of an allowed origin with 204 and the allowed methods and headers', async () => {
    h = await start();
    const res = await fetch(`${h.base}/decisions`, {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
    expect(res.headers.get('access-control-allow-headers')).toBe('Content-Type');
  });

  it('refuses the preflight of a foreign origin', async () => {
    h = await start();
    const res = await fetch(`${h.base}/decisions`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
  });

  it('admits a request with no Origin header (curl, a health check)', async () => {
    h = await start();
    expect((await fetch(`${h.base}/health`)).status).toBe(200);
  });
});

describe('POST /decisions', () => {
  it('saves a valid decision (201), and answers 200 with written:false for the identical retry', async () => {
    h = await start();
    const first = await fetch(`${h.base}/decisions`, json(decision));
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ ok: true, id: 'd1', written: true });
    const again = await fetch(`${h.base}/decisions`, json(decision));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, id: 'd1', written: false });
    expect(h.deps.stores.decisions.query()).toEqual([decision]);
  });

  it('rejects an invalid decision with 400, lists the problems, and stores nothing', async () => {
    h = await start();
    const res = await fetch(`${h.base}/decisions`, json({ ...decision, outcome: 'maybe', extra: 1 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'invalid decision',
      details: ['outcome is not one of the allowed values', 'unknown field extra'],
    });
    expect(h.deps.stores.decisions.query()).toEqual([]);
  });

  it('rejects a body that is not an object, with the same 400', async () => {
    h = await start();
    for (const body of [[], [decision]]) {
      expect((await fetch(`${h.base}/decisions`, json(body))).status).toBe(400);
    }
  });

  it('rejects malformed JSON with 400 invalid json, and a primitive JSON body', async () => {
    h = await start();
    const bad = await fetch(`${h.base}/decisions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"id": ' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'invalid json' });
    const primitive = await fetch(`${h.base}/decisions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '42' });
    expect(primitive.status).toBe(400);
  });

  it('rejects a body in an unsupported character set or content encoding with 400', async () => {
    h = await start();
    const charset = await fetch(`${h.base}/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=no-such-charset' },
      body: JSON.stringify(decision),
    });
    expect(charset.status).toBe(400);
    expect(await charset.json()).toEqual({ error: 'invalid json' });
    const encoding = await fetch(`${h.base}/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'br' },
      body: JSON.stringify(decision),
    });
    expect(encoding.status).toBe(400);
    expect(await encoding.json()).toEqual({ error: 'invalid json' });
  });

  it('rejects a body that is not sent as JSON (no content type)', async () => {
    h = await start();
    const res = await fetch(`${h.base}/decisions`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(decision) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid decision', details: ['body must be an object'] });
  });

  it('rejects a body over 64 KB with 413 (E3)', async () => {
    h = await start();
    const res = await fetch(`${h.base}/decisions`, json({ ...decision, why: 'x'.repeat(70 * 1024) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'body too large' });
  });

  it('accepts a body just under the limit when it is otherwise valid (the per-field cap still applies)', async () => {
    h = await start();
    const res = await fetch(`${h.base}/decisions`, json({ ...decision, why: 'x'.repeat(60 * 1024) }));
    expect(res.status).toBe(400); // under the body limit, over the 500-character why cap
    expect(((await res.json()) as { details: string[] }).details).toEqual(['why is longer than 500 characters']);
  });

  it('answers 500 without leaking the cause when the file system fails', async () => {
    h = await start();
    h.fs.failAppend = true;
    const res = await fetch(`${h.base}/decisions`, json(decision));
    expect(res.status).toBe(500);
    const body = JSON.stringify(await res.json());
    expect(body).toBe('{"error":"could not save the decision"}');
    expect(body).not.toContain('secret');
  });
});

describe('POST /decisions: onDecision', () => {
  it('hands a newly saved decision to the handler without making the request wait for it', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const seen: Decision[] = [];
    h = await start({
      onDecision: async (d) => {
        seen.push(d);
        await gate;
      },
    });
    const res = await fetch(`${h.base}/decisions`, json(decision)); // answered while the handler is still waiting
    expect(res.status).toBe(201);
    expect(seen).toEqual([decision]);
    release();
  });

  it('does not call it for a repeat of a decision that is already stored, or for an invalid one', async () => {
    const onDecision = jest.fn();
    h = await start({ onDecision });
    await fetch(`${h.base}/decisions`, json(decision));
    await fetch(`${h.base}/decisions`, json(decision));
    await fetch(`${h.base}/decisions`, json({ ...decision, id: 'd2', outcome: 'maybe' }));
    expect(onDecision).toHaveBeenCalledTimes(1);
  });

  it('a handler that throws or rejects does not change the answer', async () => {
    h = await start({
      onDecision: () => {
        throw new Error('sync boom /secret');
      },
    });
    expect((await fetch(`${h.base}/decisions`, json(decision))).status).toBe(201);
    await h.close();
    h = await start({ onDecision: async () => Promise.reject(new Error('async boom')) });
    expect((await fetch(`${h.base}/decisions`, json(decision))).status).toBe(201);
  });
});

describe('GET /stats/buckets', () => {
  const answer = (id: string, outcome: Decision['outcome'], extra: Partial<Decision> = {}): Decision => ({
    id,
    suggestionId: `s-${id}`,
    character: 'Agate-F',
    at: 1,
    outcome,
    sphere: 'world',
    kind: 'move',
    ...extra,
  });

  it('is empty before any decision', async () => {
    h = await start();
    const res = await fetch(`${h.base}/stats/buckets`, { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(await res.json()).toEqual({ buckets: {} });
    expect(h.logs).toEqual([{ method: 'GET', route: '/stats/buckets', status: 200 }]);
  });

  it('counts the owner’s answers per bucket from the ledger, and nothing else', async () => {
    h = await start();
    for (let i = 0; i < 3; i++) await fetch(`${h.base}/decisions`, json({ ...answer(`a${i}`, 'approved', { command: 'north' }) }));
    await fetch(`${h.base}/decisions`, json(answer('c1', 'corrected', { command: 'south', why: 'wrong exit' })));
    await fetch(`${h.base}/decisions`, json(answer('r1', 'rejected', { sphere: 'fighting', kind: 'fight-continue' })));
    await fetch(`${h.base}/decisions`, json(answer('x1', 'auto', { command: 'north', rule: 'world:move' })));
    await fetch(`${h.base}/decisions`, json(answer('f1', 'refused', { rule: 'user-typing' })));
    await fetch(`${h.base}/decisions`, json({ id: 'old1', suggestionId: 's', character: 'Agate-F', at: 1, outcome: 'approved', command: 'north' }));
    const body = (await (await fetch(`${h.base}/stats/buckets`)).json()) as { buckets: unknown };
    expect(body.buckets).toEqual({ 'world:move': { approved: 3, total: 4 }, 'fighting:fight-continue': { approved: 0, total: 1 } });
  });

  it('keeps counting after the ledger is read again (it survives a restart)', async () => {
    h = await start();
    await fetch(`${h.base}/decisions`, json(answer('a1', 'approved', { command: 'north' })));
    const reopened = await JsonlStore.open<Decision>({ fs: h.fs, path: '/d.jsonl', validate: validateDecision });
    const restarted = await start({ stores: { ...h.deps.stores, decisions: reopened.store } });
    const body = (await (await fetch(`${restarted.base}/stats/buckets`)).json()) as { buckets: unknown };
    expect(body.buckets).toEqual({ 'world:move': { approved: 1, total: 1 } });
    await restarted.close();
  });

  it('is refused for a foreign origin', async () => {
    h = await start();
    expect((await fetch(`${h.base}/stats/buckets`, { headers: { Origin: 'https://evil.example' } })).status).toBe(403);
  });
});

describe('GET /lessons', () => {
  const lesson: Lesson = {
    id: 'l1',
    createdAt: 100,
    sphere: 'world',
    situationKey: 'exploration:hall',
    scope: 'shared',
    world: 'dsl',
    rule: 'Read the board.',
    sourceDecisionId: 'd1',
    status: 'proposed',
  };

  it('lists lessons newest first, filtered by status and limited', async () => {
    h = await start();
    await h.deps.stores.lessons.append(lesson);
    await h.deps.stores.lessons.append({ ...lesson, id: 'l2', createdAt: 200, status: 'accepted' });
    await h.deps.stores.lessons.append({ ...lesson, id: 'l3', createdAt: 300 });
    expect(((await (await fetch(`${h.base}/lessons`)).json()) as { lessons: Lesson[] }).lessons.map((l) => l.id)).toEqual(['l3', 'l2', 'l1']);
    expect(((await (await fetch(`${h.base}/lessons?status=proposed`)).json()) as { lessons: Lesson[] }).lessons.map((l) => l.id)).toEqual(['l3', 'l1']);
    expect(((await (await fetch(`${h.base}/lessons?limit=1`)).json()) as { lessons: Lesson[] }).lessons.map((l) => l.id)).toEqual(['l3']);
  });

  it('rejects a bad status or limit with 400', async () => {
    h = await start();
    for (const query of ['status=open', 'status=proposed&status=accepted', 'limit=0', 'limit=abc']) {
      expect((await fetch(`${h.base}/lessons?${query}`)).status).toBe(400);
    }
  });
});

describe('/tickets', () => {
  it('POST saves a valid ticket and rejects an invalid one', async () => {
    h = await start();
    const ok = await fetch(`${h.base}/tickets`, json(ticket));
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ ok: true, id: 't1', written: true });
    expect((await fetch(`${h.base}/tickets`, json(ticket))).status).toBe(200);

    const bad = await fetch(`${h.base}/tickets`, json({ ...ticket, kind: 'teleport' }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe('invalid ticket');
  });

  it('POST answers 500 when the file system fails', async () => {
    h = await start();
    h.fs.failAppend = true;
    const res = await fetch(`${h.base}/tickets`, json(ticket));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'could not save the ticket' });
  });

  it('GET lists newest first, filters by status, and honours the limit', async () => {
    h = await start();
    await fetch(`${h.base}/tickets`, json({ ...ticket, id: 'a', createdAt: 1 }));
    await fetch(`${h.base}/tickets`, json({ ...ticket, id: 'b', createdAt: 3, status: 'resolved' }));
    await fetch(`${h.base}/tickets`, json({ ...ticket, id: 'c', createdAt: 2 }));

    const all = (await (await fetch(`${h.base}/tickets`)).json()) as { tickets: EscalationTicket[] };
    expect(all.tickets.map((t) => t.id)).toEqual(['b', 'c', 'a']);
    const open = (await (await fetch(`${h.base}/tickets?status=open`)).json()) as { tickets: EscalationTicket[] };
    expect(open.tickets.map((t) => t.id)).toEqual(['c', 'a']);
    const one = (await (await fetch(`${h.base}/tickets?limit=1`)).json()) as { tickets: EscalationTicket[] };
    expect(one.tickets.map((t) => t.id)).toEqual(['b']);
  });

  it('GET refuses a bad status or limit with 400', async () => {
    h = await start();
    for (const query of ['status=closed', 'limit=0', 'limit=501', 'limit=abc', 'limit=1&limit=2', 'status=open&status=resolved']) {
      const res = await fetch(`${h.base}/tickets?${query}`);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toMatch(/limit|status/);
    }
  });

  it('GET ignores query parameters it does not know', async () => {
    h = await start();
    expect((await fetch(`${h.base}/tickets?status[a]=b&other=1`)).status).toBe(200);
  });
});

describe('GET /suggestions and /characters', () => {
  it('are empty until later phases provide them', async () => {
    h = await start();
    expect(await (await fetch(`${h.base}/suggestions`)).json()).toEqual({ suggestions: [] });
    expect(await (await fetch(`${h.base}/characters`)).json()).toEqual({ characters: [] });
  });

  it('return what the injected providers give', async () => {
    const suggestion = { id: 's1' } as Suggestion;
    const characters: CharacterSummary[] = [{ codename: 'Agate-F', kind: 'test', gender: 'F', hasDescription: true }];
    h = await start({ getSuggestions: () => [suggestion], getCharacters: () => characters });
    expect(await (await fetch(`${h.base}/suggestions`)).json()).toEqual({ suggestions: [suggestion] });
    expect(await (await fetch(`${h.base}/characters`)).json()).toEqual({ characters });
  });
});

describe('GET /characters/:codename/description', () => {
  const view: DescriptionView = {
    codename: 'Agate-F',
    kind: 'test',
    gender: 'F',
    at: 5,
    fields: { Eyes: 'green' },
    hasDescription: true,
    rawAnsi: '\x1b[31mred\x1b[0m',
    dsl: '{Rred{x',
    text: 'red',
    unmapped: [],
  };

  it('returns the stored description in both colour forms', async () => {
    const asked: string[] = [];
    h = await start({
      getDescription: (codename) => {
        asked.push(codename);
        return codename === 'Agate-F' ? view : undefined;
      },
    });
    const res = await fetch(`${h.base}/characters/Agate-F/description`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(view);
    expect(asked).toEqual(['Agate-F']);
    expect(h.logs).toEqual([{ method: 'GET', route: '/characters/:codename/description', status: 200 }]); // the pattern, not the typed value
  });

  it('answers 404 when nothing is stored, and also when the registry is not running', async () => {
    h = await start({ getDescription: () => undefined });
    const res = await fetch(`${h.base}/characters/Orion-U/description`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no description stored' });
    await h.close();
    h = await start();
    expect((await fetch(`${h.base}/characters/Orion-U/description`)).status).toBe(404);
  });

  it.each(['Agate', 'Agate-X', 'ag%20ate-M', '..%2F..%2Fetc-M', 'A'.repeat(30) + '-M', '9x-M'])('rejects the codename %j with 400 before looking anything up', async (codename) => {
    const getDescription = jest.fn();
    h = await start({ getDescription });
    const res = await fetch(`${h.base}/characters/${codename}/description`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid codename' });
    expect(getDescription).not.toHaveBeenCalled();
  });

  it('is refused for a foreign origin', async () => {
    h = await start({ getDescription: () => view });
    expect((await fetch(`${h.base}/characters/Agate-F/description`, { headers: { Origin: 'https://evil.example' } })).status).toBe(403);
  });
});

describe('GET /state', () => {
  const view: StateView = {
    connected: true,
    stale: false,
    staleAfterSeconds: 60,
    lastEventAgeSeconds: 2,
    lastTextAgeSeconds: 3,
    inFight: false,
    learning: true,
    room: { name: 'Market Square', sector: 'city', exits: ['N'] },
    vitals: null,
    feed: { lines: 3, events: 3, malformed: 0, oversize: 0, ignored: 0 },
    tail: { files: 1, lines: 3, resets: 0, renames: 0, oversize: 0, ioErrors: 0, consumerErrors: 0, scans: 1 },
  };

  it('returns what the log feed provides, to an allowed origin', async () => {
    h = await start({ getState: () => view });
    const res = await fetch(`${h.base}/state`, { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(await res.json()).toEqual(view);
    expect(h.logs).toEqual([{ method: 'GET', route: '/state', status: 200 }]);
  });

  it('answers 503 while the log feed is not running', async () => {
    h = await start();
    const res = await fetch(`${h.base}/state`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'log feed not running' });
  });

  it('is refused for a foreign origin', async () => {
    h = await start({ getState: () => view });
    expect((await fetch(`${h.base}/state`, { headers: { Origin: 'https://evil.example' } })).status).toBe(403);
  });
});

describe('the /world routes (walked evidence, read-only)', () => {
  const report = { id: 'r1abc', title: 'Hall', visits: 2, days: 1, exits: [], fixtures: [], transient: [], was: [] };
  const map = { version: 1 as const, continents: [], links: [] };
  const stats = { views: 1, textOk: 1, textAbsent: 0, textDark: 0, textDisagrees: 0, newRooms: 1, matched: 0, ambiguous: 0, traversals: 0, refused: 0, writeFailures: 0, rooms: 1, links: 0 };
  const world = (): NonNullable<AppDeps['world']> => ({ room: (id) => (id === 'r1abc' ? report : undefined), candidates: () => map, stats: () => stats, near: (id, title) => (id === 'dsl' || id === 'sandbox' ? [{ ...report, title, sameExits: true }] : undefined) });

  it('serves a room report, the candidate layer and the counts to an allowed origin', async () => {
    h = await start({ world: world() });
    const room = await fetch(`${h.base}/world/rooms/r1abc`, { headers: { Origin: ORIGIN } });
    expect(room.status).toBe(200);
    expect(room.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(await room.json()).toEqual(report);
    expect(await (await fetch(`${h.base}/world/candidates`)).json()).toEqual(map);
    expect(await (await fetch(`${h.base}/world/stats`)).json()).toEqual(stats);
    expect(h.logs.map((l) => `${l.route} ${l.status}`)).toEqual(['/world/rooms/:id 200', '/world/candidates 200', '/world/stats 200']);
  });

  it('answers 404 for a room it does not have and 400 for an id that is not an id, before asking the memory', async () => {
    const asked: string[] = [];
    h = await start({ world: { ...world(), room: (id) => (asked.push(id), undefined) } });
    expect((await fetch(`${h.base}/world/rooms/r-unknown`)).status).toBe(404);
    for (const bad of ['R1ABC', 'a%20b', '..%2f..%2fetc', 'x'.repeat(65), '%3Cscript%3E']) {
      const res = await fetch(`${h.base}/world/rooms/${bad}`);
      expect({ bad, status: res.status }).toEqual({ bad, status: 400 });
      expect(await res.json()).toEqual({ error: 'invalid room id' });
    }
    expect(asked).toEqual(['r-unknown']);
  });

  it('answers 503 while the world memory is not running', async () => {
    h = await start();
    for (const route of ['/world/rooms/r1abc', '/world/candidates', '/world/stats']) {
      const res = await fetch(`${h.base}${route}`);
      expect({ route, status: res.status, body: await res.json() }).toEqual({ route, status: 503, body: { error: 'world memory not available' } });
    }
  });

  it('serves the walked rooms near a title for the add-room flow, for the DSL by default and for another world by id', async () => {
    h = await start({ world: world() });
    const dsl = await fetch(`${h.base}/world/near?title=Hall&exits=N,SE`, { headers: { Origin: ORIGIN } });
    expect(dsl.status).toBe(200);
    expect(dsl.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(await dsl.json()).toEqual({ rooms: [{ ...report, title: 'Hall', sameExits: true }] });
    expect((await (await fetch(`${h.base}/world/near?title=Hall&world=sandbox`)).json()).rooms).toHaveLength(1);
    expect((await fetch(`${h.base}/world/near?title=Hall&exits=`)).status).toBe(200);
  });

  it('refuses a /world/near with no title, a long title, bad exits or an unknown world, and says 503 with no memory', async () => {
    h = await start({ world: world() });
    const status = async (query: string): Promise<number> => (await fetch(`${h.base}/world/near${query}`)).status;
    expect(await status('')).toBe(400);
    expect(await status('?title=%20')).toBe(400);
    expect(await status(`?title=${'x'.repeat(201)}`)).toBe(400);
    expect(await status('?title=Hall&exits=N,north')).toBe(400);
    expect(await status(`?title=Hall&exits=${Array(13).fill('N').join(',')}`)).toBe(400);
    expect(await status('?title=Hall&world=nowhere')).toBe(404);
    await h.close();
    h = await start();
    expect(await status('?title=Hall')).toBe(503);
  });

  it('is refused for a foreign origin, and does not take a write', async () => {
    h = await start({ world: world() });
    expect((await fetch(`${h.base}/world/candidates`, { headers: { Origin: 'https://evil.example' } })).status).toBe(403);
    expect((await fetch(`${h.base}/world/candidates`, json({}))).status).toBe(404);
  });
});

describe('unknown routes and methods', () => {
  it('answer 404 JSON', async () => {
    h = await start();
    const res = await fetch(`${h.base}/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
    expect((await fetch(`${h.base}/decisions`, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${h.base}/health`, { method: 'POST' })).status).toBe(404);
  });
});

describe('no request body or text reaches the logger', () => {
  it('logs only the method, route pattern and status, whatever the body, query or path said', async () => {
    h = await start();
    const secret = 'ZORVAK-TOLD-ME-A-SECRET-PASSWORD';
    await fetch(`${h.base}/decisions`, json({ ...decision, why: secret }));
    await fetch(`${h.base}/decisions`, json({ ...decision, id: 'd2', why: secret, extra: secret }));
    await fetch(`${h.base}/decisions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: `{"why":"${secret}` });
    await fetch(`${h.base}/tickets?status=${secret}`);
    await fetch(`${h.base}/${secret}`, { headers: { Origin: 'https://evil.example' } });
    await fetch(`${h.base}/${secret}`);

    expect(h.logs.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(h.logs)).not.toContain(secret);
    for (const entry of h.logs) {
      expect(Object.keys(entry).sort()).toEqual(['method', 'route', 'status']);
    }
    expect(h.logs).toContainEqual({ method: 'POST', route: '/decisions', status: 201 });
    expect(h.logs).toContainEqual({ method: 'GET', route: 'origin-guard', status: 403 });
    expect(h.logs).toContainEqual({ method: 'GET', route: 'unmatched', status: 404 });
  });
});

describe('an unexpected failure', () => {
  it.each(['a thrown string', 42])('answers 500 even when what was thrown is not an Error (%p)', async (thrown) => {
    h = await start({
      getSuggestions: () => {
        throw thrown;
      },
    });
    const res = await fetch(`${h.base}/suggestions`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
  });

  it('answers 500 internal error with no stack or cause, and logs a fixed entry', async () => {
    h = await start({
      getSuggestions: () => {
        throw new Error('boom: /secret/path/with/detail');
      },
    });
    const res = await fetch(`${h.base}/suggestions`);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe('{"error":"internal error"}');
    expect(h.logs).toContainEqual({ method: 'error', route: 'unhandled', status: 500 });
    expect(JSON.stringify(h.logs)).not.toContain('secret');
  });
});

describe('GET and POST /control (the Copilot switch, as the server sees it)', () => {
  const learningStub = () => {
    let on = false;
    const calls: boolean[] = [];
    return { calls, learning: { enabled: () => on, set: (next: boolean) => (calls.push(next), (on = next), true) } };
  };

  it('reports off at the start, switches on and off, and answers with the state it now has', async () => {
    const stub = learningStub();
    h = await start({ learning: stub.learning });
    expect(await (await fetch(`${h.base}/control`)).json()).toEqual({ enabled: false });
    const on = await fetch(`${h.base}/control`, json({ enabled: true }));
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ enabled: true });
    expect(await (await fetch(`${h.base}/control`)).json()).toEqual({ enabled: true });
    expect(await (await fetch(`${h.base}/control`, json({ enabled: false }))).json()).toEqual({ enabled: false });
    expect(stub.calls).toEqual([true, false]);
  });

  it.each([{}, { enabled: 'true' }, { enabled: true, extra: 1 }, [true]])('refuses the body %j with 400 and changes nothing', async (body) => {
    const stub = learningStub();
    h = await start({ learning: stub.learning });
    const res = await fetch(`${h.base}/control`, json(body));
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'invalid control request' });
    expect(stub.calls).toEqual([]);
  });

  it('answers 503 on both routes when the server has no switch', async () => {
    h = await start();
    expect((await fetch(`${h.base}/control`)).status).toBe(503);
    expect((await fetch(`${h.base}/control`, json({ enabled: true }))).status).toBe(503);
  });

  it('is behind the origin guard: a foreign origin cannot turn it on, an allowed one can, and the preflight allows POST', async () => {
    const stub = learningStub();
    h = await start({ learning: stub.learning });
    const foreign = await fetch(`${h.base}/control`, json({ enabled: true }, { Origin: 'https://evil.example' }));
    expect(foreign.status).toBe(403);
    expect(stub.calls).toEqual([]);
    const allowed = await fetch(`${h.base}/control`, json({ enabled: true }, { Origin: ORIGIN }));
    expect(allowed.status).toBe(200);
    expect(stub.calls).toEqual([true]);
    const preflight = await fetch(`${h.base}/control`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
  });
});
