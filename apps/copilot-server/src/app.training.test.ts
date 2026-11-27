import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { JsonlStore, validateDecision, validateLesson, validateTicket, type Decision, type EscalationTicket, type LedgerFs, type Lesson } from '@shatteredarchive/copilot-core';
import { createApp, type AppDeps } from './app';
import { createTraining } from './training';
import type { World } from './world/worlds';

class MemoryFs implements LedgerFs {
  files = new Map<string, string>();
  async append(path: string, text: string): Promise<void> {
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

const decision: Decision = { id: 'd1', suggestionId: 's1', character: 'Agate-F', at: 1000, outcome: 'corrected', command: 'consider goblin', why: 'Consider first.' };
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function start(options: { world?: World | undefined; learning?: boolean; noTraining?: boolean; noTrainerStore?: boolean } = {}) {
  const fs = new MemoryFs();
  const { store: decisions } = await JsonlStore.open<Decision>({ fs, path: '/d.jsonl', validate: validateDecision });
  const { store: tickets } = await JsonlStore.open<EscalationTicket>({ fs, path: '/t.jsonl', validate: validateTicket });
  const { store: lessons } = await JsonlStore.open<Lesson>({ fs, path: '/l.jsonl', validate: validateLesson });
  const { store: trainerDecisions } = await JsonlStore.open<Decision>({ fs, path: '/td.jsonl', validate: validateDecision });
  const state = { world: 'world' in options ? options.world : ('sandbox' as World | undefined), learning: options.learning ?? true };
  const handled: Decision[] = [];
  const deps: AppDeps = {
    allowedOrigins: [],
    stores: { decisions, tickets, lessons },
    version: '1',
    startedAt: 0,
    log: () => undefined,
    onDecision: (d) => void handled.push(d),
    ...(options.noTraining ? {} : { training: createTraining({ world: () => state.world, learning: () => state.learning }) }),
    ...(options.noTrainerStore ? {} : { trainerDecisions }),
  };
  const server: Server = createApp(deps).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, decisions, trainerDecisions, state, handled, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

let h: Awaited<ReturnType<typeof start>>;
afterEach(async () => {
  await h?.close();
});

describe('GET and POST /training', () => {
  it('turns on for the Simulacrum and says so, and off again', async () => {
    h = await start();
    expect(await (await fetch(`${h.base}/training`)).json()).toEqual({ enabled: false, world: 'sandbox', canEnable: true });
    const on = await fetch(`${h.base}/training`, json({ enabled: true }));
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ enabled: true, world: 'sandbox', canEnable: true });
    expect(await (await fetch(`${h.base}/training`, json({ enabled: false }))).json()).toEqual({ enabled: false, world: 'sandbox', canEnable: true });
  });

  it('answers 409 with the reason when the connection is not the Simulacrum\'s or Copilot is off, and stays off', async () => {
    h = await start({ world: 'dsl' });
    const refused = await fetch(`${h.base}/training`, json({ enabled: true }));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'training cannot be turned on now', reason: 'not-simulacrum' });
    h.state.world = 'sandbox';
    h.state.learning = false;
    expect(await (await fetch(`${h.base}/training`, json({ enabled: true }))).json()).toMatchObject({ reason: 'copilot-off' });
    expect(await (await fetch(`${h.base}/training`)).json()).toMatchObject({ enabled: false, canEnable: false, refusal: 'copilot-off' });
  });

  it('refuses a bad body with 400, and answers 503 when the server has no training', async () => {
    h = await start();
    expect((await fetch(`${h.base}/training`, json({ enabled: 'yes' }))).status).toBe(400);
    expect((await fetch(`${h.base}/training`, json({ enabled: true, extra: 1 }))).status).toBe(400);
    await h.close();
    h = await start({ noTraining: true });
    expect((await fetch(`${h.base}/training`)).status).toBe(503);
    expect((await fetch(`${h.base}/training`, json({ enabled: true }))).status).toBe(503);
  });
});

describe('POST /decisions while training is on', () => {
  it('stamps the trainer, stores the decision apart from the owner\'s ledger, and hands the stamped decision on', async () => {
    h = await start();
    await fetch(`${h.base}/training`, json({ enabled: true }));
    const res = await fetch(`${h.base}/decisions`, json(decision));
    expect(res.status).toBe(201);
    expect(h.decisions.query()).toEqual([]);
    expect(h.trainerDecisions.query()).toEqual([{ ...decision, trainer: 'claude' }]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(h.handled).toEqual([{ ...decision, trainer: 'claude' }]);
    // an owner's decision with the same id is a different ledger: the repeat in the trainer's is a repeat
    expect((await fetch(`${h.base}/decisions`, json(decision))).status).toBe(200);
  });

  it('keeps the owner\'s ledger the owner\'s again once training is off, and counts only the owner\'s answers', async () => {
    h = await start();
    await fetch(`${h.base}/training`, json({ enabled: true }));
    await fetch(`${h.base}/decisions`, json(decision));
    await fetch(`${h.base}/training`, json({ enabled: false }));
    await fetch(`${h.base}/decisions`, json({ ...decision, id: 'd2' }));
    expect(h.decisions.query().map((d) => d.id)).toEqual(['d2']);
    expect(h.decisions.query()[0]).not.toHaveProperty('trainer');
    expect(h.trainerDecisions.query().map((d) => d.id)).toEqual(['d1']);
  });

  it('stops being the trainer\'s the moment the connection is no longer the Simulacrum\'s', async () => {
    h = await start();
    await fetch(`${h.base}/training`, json({ enabled: true }));
    h.state.world = 'dsl';
    await fetch(`${h.base}/decisions`, json(decision));
    expect(h.decisions.query()).toHaveLength(1);
    expect(h.trainerDecisions.query()).toEqual([]);
  });

  it('refuses a decision that claims to be the trainer\'s while training is off, or has no trainer store', async () => {
    h = await start();
    const claimed = await fetch(`${h.base}/decisions`, json({ ...decision, trainer: 'claude' }));
    expect(claimed.status).toBe(403);
    expect(h.decisions.query()).toEqual([]);
    await h.close();
    h = await start({ noTrainerStore: true });
    await fetch(`${h.base}/training`, json({ enabled: true }));
    expect((await fetch(`${h.base}/decisions`, json({ ...decision, trainer: 'claude' }))).status).toBe(403);
    expect((await fetch(`${h.base}/decisions`, json(decision))).status).toBe(201); // stored as the owner's: there is no other place
    expect(h.decisions.query()).toHaveLength(1);
  });
});
