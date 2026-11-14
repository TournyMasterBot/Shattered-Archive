import { validateSuggestion, validateTicket, type Mode, type Sphere } from '@shatteredarchive/copilot-core';
import { createFakeModel, type FakeAnswer } from '../models/fake';
import { makeSituation } from '../testing/situations';
import { createProducer } from './producer';
import type { Route } from './router';
import type { Situation } from './situation';

const reply = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({ command: 'look', kind: 'info', sphere: 'world', rationale: 'Look around first.', confidence: 0.9, ...over });

function setup(script: FakeAnswer[], options: { mapEvidence?: number | null; routes?: Partial<Record<Sphere, Route['facts']>>; misrouteHint?: (from: Sphere, to: Sphere) => string | undefined } = {}) {
  const model = createFakeModel(script);
  const routed: { start?: Sphere }[] = [];
  let n = 0;
  const producer = createProducer({
    model,
    route: async (situation: Situation, opts) => {
      routed.push({ start: opts.start });
      const sphere = opts.start ?? (situation.mode === 'battle' ? 'fighting' : 'world');
      return { sphere, facts: options.routes?.[sphere] ?? [], lessons: [], tried: [sphere] };
    },
    mapEvidence: () => options.mapEvidence ?? null,
    misrouteHint: options.misrouteHint,
    now: () => 5_000,
    newId: (prefix) => `${prefix}-${++n}`,
  });
  return { producer, model, routed };
}

describe('produce', () => {
  it.each<[Mode, Record<string, unknown>, string, string]>([
    ['exploration', { command: 'look', kind: 'info' }, 'info', 'world'],
    ['battle', { command: 'kill goblin', kind: 'fight-continue', sphere: 'fighting' }, 'fight-continue', 'fighting'],
    ['questing', { command: 'get all from corpse', kind: 'loot' }, 'loot', 'world'],
    ['leveling', { command: 'cast fireball', kind: 'ability' }, 'ability', 'world'],
  ])('%s: a valid answer becomes a valid suggestion of the right mode, kind and sphere', async (mode, answer, kind, sphere) => {
    const { producer } = setup([reply(answer)]);
    const result = await producer.produce(makeSituation({ mode, game: { inFight: mode === 'battle' }, situationKey: `${mode}:x` }));
    expect(result.tickets).toEqual([]);
    expect(result.suggestion).toMatchObject({ id: 's-1', character: 'Agate-F', createdAt: 5_000, mode, sphere, kind, confidence: 0.9, confidenceSource: 'model', situationKey: `${mode}:x` });
    expect(validateSuggestion(result.suggestion).ok).toBe(true);
  });

  it('the kind is the stricter of the model claim and the classifier (a model cannot call a floor command safe)', async () => {
    const { producer } = setup([reply({ command: 'drop sword', kind: 'info' })]);
    const result = await producer.produce(makeSituation());
    expect(result.suggestion?.kind).toBe('spend-or-lose');
  });

  it('a command the classifier cannot place stays unknown whatever the model says', async () => {
    const { producer } = setup([reply({ command: 'frobnicate', kind: 'info' })]);
    expect((await producer.produce(makeSituation())).suggestion?.kind).toBe('unknown');
  });

  it('a fight verb outside a fight cannot be called safe', async () => {
    const { producer } = setup([reply({ command: 'kill goblin', kind: 'info' })]);
    expect((await producer.produce(makeSituation())).suggestion?.kind).toBe('fight-start-unknown');
  });

  it('movement takes its confidence from the map evidence, never from the model (null until the map exists)', async () => {
    const stub = setup([reply({ command: 'north', kind: 'move', confidence: 0.99 })]);
    const result = await stub.producer.produce(makeSituation());
    expect(result.suggestion).toMatchObject({ kind: 'move', confidence: null, confidenceSource: 'map-evidence' });
    const known = setup([reply({ command: 'north', kind: 'move', confidence: 0.99 })], { mapEvidence: 0.4 });
    expect((await known.producer.produce(makeSituation())).suggestion).toMatchObject({ confidence: 0.4, confidenceSource: 'map-evidence' });
  });

  it('a missing or out-of-range model confidence becomes null (the policy asks)', async () => {
    for (const confidence of [undefined, 7, -1, 'high', Number.NaN]) {
      const { producer } = setup([reply({ confidence })]);
      expect((await producer.produce(makeSituation())).suggestion?.confidence).toBeNull();
    }
  });

  it('puts the archive facts into the watcher prompt', async () => {
    const { producer, model } = setup([reply()], { routes: { world: ['{"area":"Market"}'] } });
    await producer.produce(makeSituation());
    expect(model.calls[0]).toMatchObject({ role: 'watcher' });
    expect(model.calls[0].prompt).toContain('{"area":"Market"}');
  });

  it('retries once with the problem named, and uses the second answer (E5)', async () => {
    const { producer, model } = setup(['not json', reply()]);
    const result = await producer.produce(makeSituation());
    expect(result.suggestion?.command).toBe('look');
    expect(result.tickets).toEqual([]);
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1].prompt).toContain('Your previous answer was rejected: the answer is not valid JSON');
  });

  it('two unusable answers file an unknown-situation ticket and give no suggestion (E5)', async () => {
    const { producer, model } = setup(['not json', '{"command":""}']);
    const result = await producer.produce(makeSituation());
    expect(result.suggestion).toBeUndefined();
    expect(model.calls).toHaveLength(2);
    expect(result.tickets).toEqual([
      {
        id: 't-1',
        createdAt: 5_000,
        character: 'Agate-F',
        reason: 'unknown-situation',
        sphere: 'world',
        kind: 'unknown',
        situationKey: 'exploration:market-square',
        summary: 'The model gave no usable answer for exploration:market-square: command is missing or empty',
        status: 'open',
      },
    ]);
  });

  it('a wrong-sphere answer files a ticket, sends the situation to the named sphere once, and uses that answer', async () => {
    const { producer, routed } = setup([JSON.stringify({ wrongSphere: 'things' }), reply({ command: 'inventory', kind: 'info' })]);
    const result = await producer.produce(makeSituation());
    expect(routed).toEqual([{ start: undefined }, { start: 'things' }]);
    expect(result.tickets).toHaveLength(1);
    expect(result.tickets[0]).toMatchObject({ reason: 'wrong-sphere', sphere: 'world', summary: 'The model said this belongs to the things sphere, not world' });
    expect(result.suggestion).toMatchObject({ command: 'inventory', sphere: 'things' });
  });

  it('the wrong-sphere ticket carries the sphere map’s hint for that wrong turn, and only for that pair', async () => {
    const asked: [Sphere, Sphere][] = [];
    const hint = (from: Sphere, to: Sphere) => (asked.push([from, to]), from === 'world' && to === 'things' ? 'A room question may be about the items in it.' : undefined);
    const withHint = setup([JSON.stringify({ wrongSphere: 'things' }), reply({ command: 'inventory', kind: 'info' })], { misrouteHint: hint });
    const first = await withHint.producer.produce(makeSituation());
    expect(first.tickets[0].summary).toBe('The model said this belongs to the things sphere, not world. Hint: A room question may be about the items in it.');
    expect(asked).toEqual([['world', 'things']]);

    const noHintForThisPair = setup([JSON.stringify({ wrongSphere: 'fighting' }), reply({ command: 'look', kind: 'info' })], { misrouteHint: hint });
    const second = await noHintForThisPair.producer.produce(makeSituation());
    expect(second.tickets[0].summary).toBe('The model said this belongs to the fighting sphere, not world');
  });

  it('a hint that would not fit is cut so the ticket stays valid', async () => {
    const { producer } = setup([JSON.stringify({ wrongSphere: 'things' }), reply({ command: 'inventory', kind: 'info' })], { misrouteHint: () => 'x'.repeat(900) });
    const ticket = (await producer.produce(makeSituation())).tickets[0];
    expect(ticket.summary).toHaveLength(500);
    expect(validateTicket(ticket)).toEqual({ ok: true, value: ticket });
  });

  it('a second wrong-sphere answer is an unknown situation: two tickets, no suggestion', async () => {
    const { producer } = setup([JSON.stringify({ wrongSphere: 'things' }), JSON.stringify({ wrongSphere: 'fighting' })]);
    const result = await producer.produce(makeSituation());
    expect(result.suggestion).toBeUndefined();
    expect(result.tickets.map((t) => t.reason)).toEqual(['wrong-sphere', 'unknown-situation']);
    expect(result.tickets[1].summary).toContain('could not place');
    expect(result.tickets[1].sphere).toBe('things');
  });

  it('an unusable answer after a wrong-sphere note files both tickets', async () => {
    const { producer } = setup([JSON.stringify({ wrongSphere: 'things' }), 'junk', 'junk']);
    const result = await producer.produce(makeSituation());
    expect(result.tickets.map((t) => t.reason)).toEqual(['wrong-sphere', 'unknown-situation']);
  });

  it('a model that cannot be reached is a failure, not a ticket', async () => {
    const { producer, model } = setup([{ ok: false, reason: 'timeout' }]);
    expect(await producer.produce(makeSituation())).toEqual({ tickets: [], failure: 'timeout' });
    expect(model.calls).toHaveLength(1);
    const second = setup(['not json', { ok: false, reason: 'network' }]);
    expect(await second.producer.produce(makeSituation())).toEqual({ tickets: [], failure: 'network' });
  });

  it('a model failure after a wrong-sphere note keeps the ticket that was already filed', async () => {
    const { producer } = setup([JSON.stringify({ wrongSphere: 'fighting' }), { ok: false, reason: 'timeout' }]);
    const result = await producer.produce(makeSituation());
    expect(result.failure).toBe('timeout');
    expect(result.tickets.map((t) => t.reason)).toEqual(['wrong-sphere']);
  });

  it('passes the abort signal to the model', async () => {
    const { producer, model } = setup([reply()]);
    const controller = new AbortController();
    controller.abort();
    expect(await producer.produce(makeSituation(), controller.signal)).toEqual({ tickets: [], failure: 'aborted' });
    expect(model.calls).toEqual([]);
  });

  it('makes unique ids with the default generator', async () => {
    const model = createFakeModel([reply()]);
    const producer = createProducer({
      model,
      route: async () => ({ sphere: 'world', facts: [], lessons: [], tried: ['world'] }),
      mapEvidence: () => null,
      now: () => 1,
    });
    const a = await producer.produce(makeSituation());
    const b = await producer.produce(makeSituation());
    expect(a.suggestion?.id).toMatch(/^s-[0-9a-f-]{36}$/);
    expect(a.suggestion?.id).not.toBe(b.suggestion?.id);
  });
});
