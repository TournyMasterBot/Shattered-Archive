// The hint routes: what to try in a room from the fastest tier that knows, and what the owner or Claude taught.
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { JsonlStore, validateDecision, validateLesson, validateTicket, type Decision, type EscalationTicket, type Lesson } from '@shatteredarchive/copilot-core';
import { createApp, type AppDeps, type HintsApi } from './app';
import { makeRule } from './hints/rules';
import { MemoryFs } from './testing/memoryFs';

const ORIGIN = 'https://game-client.shatteredarchive.dev';
let server: Server | undefined;
afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

async function start(hints?: HintsApi): Promise<string> {
  const fs = new MemoryFs();
  const { store: decisions } = await JsonlStore.open<Decision>({ fs, path: '/d.jsonl', validate: validateDecision });
  const { store: tickets } = await JsonlStore.open<EscalationTicket>({ fs, path: '/t.jsonl', validate: validateTicket });
  const { store: lessons } = await JsonlStore.open<Lesson>({ fs, path: '/l.jsonl', validate: validateLesson });
  const deps: AppDeps = { allowedOrigins: [ORIGIN], stores: { decisions, tickets, lessons }, version: '1', startedAt: 0, log: () => undefined, ...(hints ? { hints } : {}) };
  server = createApp(deps).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server?.once('listening', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function fakeHints() {
  const asked: unknown[] = [];
  const rules: ReturnType<typeof makeRule> extends infer R ? (R extends { ok: true; rule: infer T } ? T[] : never) : never = [];
  const api: HintsApi = {
    engine: { hint: async (room) => (asked.push(room), { tier: 'instant', commands: ['look fountain'], notes: [], tried: ['learned', 'instant'], ms: 3 }) },
    rules: () => rules,
    addRule: async (input) => {
      const made = makeRule(input, 1_000);
      if (made.ok) rules.push(made.rule);
      return made;
    },
  };
  return { api, asked, rules };
}

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body) });

describe('GET /hints', () => {
  it('asks the tiers about the room and answers with the tier, the commands and how long it took', async () => {
    const { api, asked } = fakeHints();
    const base = await start(api);
    const res = await fetch(`${base}/hints?title=Chamber%20of%20Rest&description=A%20round%20room.&exits=N,S`, { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(await res.json()).toEqual({ tier: 'instant', commands: ['look fountain'], notes: [], tried: ['learned', 'instant'], ms: 3 });
    expect(asked).toEqual([{ title: 'Chamber of Rest', exits: ['N', 'S'], description: 'A round room.' }]);
  });

  it('works with only a title', async () => {
    const { api, asked } = fakeHints();
    const base = await start(api);
    expect((await fetch(`${base}/hints?title=Hall&exits=`)).status).toBe(200);
    expect(asked).toEqual([{ title: 'Hall', exits: [] }]);
  });

  it.each([
    ['', 'no title'],
    ['?title=%20', 'a blank title'],
    [`?title=${'x'.repeat(201)}`, 'a long title'],
    [`?title=Hall&description=${'x'.repeat(4001)}`, 'a long description'],
    ['?title=Hall&exits=N,5', 'an exit that is not letters'],
    [`?title=Hall&exits=${Array(13).fill('N').join(',')}`, 'too many exits'],
  ])('refuses %s (%s)', async (query) => {
    const base = await start(fakeHints().api);
    expect((await fetch(`${base}/hints${query}`)).status).toBe(400);
  });

  it('says 503 when there are no hint tiers, on every hint route', async () => {
    const base = await start();
    expect((await fetch(`${base}/hints?title=Hall`)).status).toBe(503);
    expect((await fetch(`${base}/hints/rules`)).status).toBe(503);
    expect((await post(`${base}/hints/rules`, { title: 'Hall', commands: ['look'], source: 'owner' })).status).toBe(503);
  });
});

describe('the rules the owner or Claude teach', () => {
  it('takes a rule, answers 201 with it, and lists it', async () => {
    const { api, rules } = fakeHints();
    const base = await start(api);
    const res = await post(`${base}/hints/rules`, { title: 'Chamber of Rest', commands: ['enter orb', 'look in gate'], source: 'claude', note: 'from a session' });
    expect(res.status).toBe(201);
    expect((await res.json()).rule).toMatchObject({ title: 'Chamber of Rest', source: 'claude', commands: ['enter orb', 'look in gate'], note: 'from a session' });
    expect(rules).toHaveLength(1);
    const list = await (await fetch(`${base}/hints/rules`, { headers: { Origin: ORIGIN } })).json();
    expect(list.rules).toHaveLength(1);
  });

  it.each([
    [null, 'a body that is not an object'],
    [[], 'an array'],
    [{ commands: ['look'], source: 'owner' }, 'no title'],
    [{ title: 'Hall', source: 'owner' }, 'no commands'],
    [{ title: 'Hall', commands: ['look', 5], source: 'owner' }, 'a command that is not text'],
    [{ title: 'Hall', commands: ['look'], source: 'copilot' }, 'a source that is not owner or claude'],
    [{ title: 'Hall', commands: ['look'], source: 'owner', note: 5 }, 'a note that is not text'],
    [{ title: 'Hall', commands: [], source: 'owner' }, 'no usable command'],
  ] as [unknown, string][])('refuses %j (%s)', async (body: unknown) => {
    const base = await start(fakeHints().api);
    expect((await post(`${base}/hints/rules`, body)).status).toBe(400);
  });

  it('does not take a rule from a foreign origin', async () => {
    const base = await start(fakeHints().api);
    const res = await fetch(`${base}/hints/rules`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify({ title: 'Hall', commands: ['look'], source: 'owner' }) });
    expect(res.status).toBe(403);
  });
});
