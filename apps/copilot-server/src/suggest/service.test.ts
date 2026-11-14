import { JsonlStore, validateTicket, type Decision, type EscalationTicket, type Suggestion } from '@shatteredarchive/copilot-core';
import { createFakeModel, type FakeAnswer } from '../models/fake';
import type { ModelClient } from '../models/types';
import { MemoryFs } from '../testing/memoryFs';
import { makeSituation } from '../testing/situations';
import { createProducer } from './producer';
import { SuggestionService } from './service';
import type { Situation } from './situation';

const look = JSON.stringify({ command: 'look', kind: 'info', sphere: 'world', rationale: 'Look.', confidence: 0.9 });

async function setup(script: FakeAnswer[] = [look], customModel?: ModelClient) {
  const fs = new MemoryFs();
  const { store: tickets } = await JsonlStore.open<EscalationTicket>({ fs, path: '/t.jsonl', validate: validateTicket });
  const fake = createFakeModel(script);
  const model = customModel ?? fake;
  let n = 0;
  let clock = 1_000;
  let situation: Situation | undefined = makeSituation();
  const producer = createProducer({
    model,
    route: async () => ({ sphere: 'world', facts: [], lessons: [], tried: ['world'] }),
    mapEvidence: () => null,
    now: () => clock,
    newId: (p) => `${p}-${++n}`,
  });
  const service = new SuggestionService({ producer, situation: () => situation, tickets, now: () => clock, ttlMs: 60_000, retryMs: 10_000 });
  return {
    service,
    model: fake,
    tickets,
    fs,
    advance: (ms: number) => void (clock += ms),
    setSituation: (s: Situation | undefined) => void (situation = s),
  };
}

const decisionFor = (suggestion: Suggestion): Decision => ({ id: 'd-1', suggestionId: suggestion.id, character: 'Agate-F', at: 2_000, outcome: 'approved', command: suggestion.command });

describe('SuggestionService', () => {
  it('produces for the current situation after a poke, and then serves it as current', async () => {
    const t = await setup();
    expect(t.service.current()).toEqual([]);
    t.service.poke();
    await t.service.idle();
    expect(t.service.current()).toHaveLength(1);
    expect(t.service.current()[0]).toMatchObject({ command: 'look', situationKey: 'exploration:market-square' });
    expect(t.service.counters).toMatchObject({ produced: 1, withoutSuggestion: 0, errors: 0 });
    expect(t.service.find(t.service.current()[0].id)).toBeDefined();
    expect(t.service.find('nope')).toBeUndefined();
  });

  it('does nothing when there is no situation (not connected, nobody logged in, or stale)', async () => {
    const t = await setup();
    t.setSituation(undefined);
    t.service.poke();
    await t.service.idle();
    expect(t.model.calls).toEqual([]);
    expect(t.service.current()).toEqual([]);
  });

  it('does not produce again while a current suggestion exists for the same situation', async () => {
    const t = await setup();
    t.service.poke();
    await t.service.idle();
    t.service.poke();
    await t.service.idle();
    expect(t.model.calls).toHaveLength(1);
    t.advance(61_000); // the ttl passed: a fresh one is made
    expect(t.service.current()).toEqual([]);
    t.service.poke();
    await t.service.idle();
    expect(t.model.calls).toHaveLength(2);
  });

  it('never runs two productions at once: a poke while one is running does nothing', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    const slow: ModelClient = {
      generate: async () => {
        calls++;
        await gate;
        return { ok: true, text: look };
      },
    };
    const t = await setup([look], slow);
    t.service.poke();
    t.service.poke();
    t.advance(20_000);
    t.service.poke();
    await new Promise((resolve) => setTimeout(resolve, 20)); // the production reaches the model
    expect(calls).toBe(1);
    release();
    await t.service.idle();
    expect(calls).toBe(1);
    expect(t.service.current()).toHaveLength(1);
  });

  it('a new situation gets a new suggestion and the old one is no longer current', async () => {
    const t = await setup();
    t.service.poke();
    await t.service.idle();
    t.setSituation(makeSituation({ situationKey: 'exploration:temple', game: { room: { name: 'Temple', sector: 'inside', exits: [] } } }));
    expect(t.service.current()).toEqual([]);
    t.service.poke();
    await t.service.idle();
    expect(t.service.current()[0].situationKey).toBe('exploration:temple');
  });

  it('does not retry the same situation faster than retryMs after a failed attempt', async () => {
    const t = await setup([{ ok: false, reason: 'timeout' }]);
    t.service.poke();
    await t.service.idle();
    expect(t.service.counters.withoutSuggestion).toBe(1);
    t.advance(5_000);
    t.service.poke();
    await t.service.idle();
    expect(t.model.calls).toHaveLength(1);
    t.advance(6_000);
    t.service.poke();
    await t.service.idle();
    expect(t.model.calls).toHaveLength(2);
  });

  it('files the tickets the producer made, and counts the ones it could not save', async () => {
    const t = await setup(['junk', 'junk']);
    t.service.poke();
    await t.service.idle();
    expect(t.tickets.query()).toHaveLength(1);
    expect(t.service.counters).toMatchObject({ ticketsFiled: 1, withoutSuggestion: 1 });

    const lost = await setup(['junk', 'junk']);
    lost.fs.failAppend = true;
    lost.service.poke();
    await lost.service.idle();
    expect(lost.service.counters.ticketsLost).toBe(1);
  });

  it('counts an unexpected error and carries on', async () => {
    const t = await setup([() => { throw new Error('boom'); }]);
    t.service.poke();
    await t.service.idle();
    expect(t.service.counters.errors).toBe(1);
    expect(t.service.current()).toEqual([]);
  });

  it('answered() drops the suggestion the owner just decided on, and only that one', async () => {
    const t = await setup();
    t.service.poke();
    await t.service.idle();
    const suggestion = t.service.current()[0];
    t.service.answered({ ...decisionFor(suggestion), suggestionId: 'another' });
    expect(t.service.current()).toHaveLength(1);
    t.service.answered(decisionFor(suggestion));
    expect(t.service.current()).toEqual([]);
    expect(t.service.find(suggestion.id)).toBeDefined(); // still known: a correction needs it
  });

  it('answered() ignores a refused record: the command never ran, so the suggestion stays for the owner', async () => {
    const t = await setup();
    t.service.poke();
    await t.service.idle();
    const suggestion = t.service.current()[0];
    t.service.answered({ ...decisionFor(suggestion), outcome: 'refused', rule: 'user-typing' });
    expect(t.service.current()).toHaveLength(1);
    t.service.answered({ ...decisionFor(suggestion), outcome: 'auto', rule: 'world:move' });
    expect(t.service.current()).toEqual([]); // a run by the agent's own rule does retire it
  });

  it('answered() with nothing current does nothing', async () => {
    const t = await setup();
    t.service.answered({ id: 'd', suggestionId: 's', character: 'Agate-F', at: 1, outcome: 'rejected' });
    expect(t.service.current()).toEqual([]);
  });

  it('remembers only the most recent suggestions', async () => {
    const t = await setup([look]);
    for (let i = 0; i < 205; i++) {
      t.setSituation(makeSituation({ situationKey: `exploration:room-${i}` }));
      t.service.poke();
      await t.service.idle();
    }
    expect(t.service.counters.produced).toBe(205);
    expect(t.service.find('s-1')).toBeUndefined();
    expect(t.service.find('s-205')).toBeDefined();
  });

  it('uses a 60 s ttl and a 10 s retry delay when none are given', async () => {
    const t = await setup();
    let clock = 1_000;
    const service = new SuggestionService({
      producer: createProducer({ model: createFakeModel(['junk', 'junk', look]), route: async () => ({ sphere: 'world', facts: [], lessons: [], tried: ['world'] }), mapEvidence: () => null, now: () => clock }),
      situation: () => makeSituation(),
      tickets: t.tickets,
      now: () => clock,
    });
    service.poke();
    await service.idle();
    clock += 9_000;
    service.poke(); // inside the default retry delay
    await service.idle();
    expect(service.counters.withoutSuggestion).toBe(1);
    clock += 2_000;
    service.poke();
    await service.idle();
    expect(service.counters.produced).toBe(1);
    clock += 59_000;
    expect(service.current()).toHaveLength(1);
    clock += 2_000;
    expect(service.current()).toEqual([]);
  });

  it('stop() aborts the running production and starts no more', async () => {
    const t = await setup();
    t.service.stop();
    t.service.poke();
    await t.service.idle();
    expect(t.model.calls).toEqual([]);

    const running = await setup();
    running.service.poke();
    running.service.stop();
    await running.service.idle();
    expect(running.service.current()).toEqual([]);
  });

  describe('reset() (Copilot switched off or on)', () => {
    it('forgets the current suggestion and the retry wait, so the situation is produced for again at once', async () => {
      const t = await setup();
      t.service.poke();
      await t.service.idle();
      expect(t.service.current()).toHaveLength(1);
      t.service.reset();
      expect(t.service.current()).toEqual([]);
      t.service.poke(); // no 10 s retry wait after a reset, and no suggestion to be current
      await t.service.idle();
      expect(t.model.calls).toHaveLength(2);
      expect(t.service.current()).toHaveLength(1);
    });

    it('aborts the model call in progress and throws its answer away, files no ticket and counts nothing as produced', async () => {
      let aborted = false;
      let calls = 0;
      const slow: ModelClient = {
        generate: (_role, _prompt, signal) =>
          new Promise((resolve) => {
            calls++;
            if (calls > 1) return resolve({ ok: true, text: look }); // after the reset the model answers at once
            signal?.addEventListener('abort', () => {
              aborted = true;
              resolve({ ok: true, text: look }); // even a model that answers anyway after the abort
            });
          }),
      };
      const t = await setup([look], slow);
      t.service.poke();
      await new Promise((resolve) => setTimeout(resolve, 20)); // the production reaches the model
      t.service.reset();
      await t.service.idle();
      expect(aborted).toBe(true);
      expect(t.service.current()).toEqual([]);
      expect(t.service.counters).toMatchObject({ produced: 0, errors: 0, ticketsFiled: 0 });

      // and the next poke produces normally, with no retry wait
      t.service.poke();
      await t.service.idle();
      expect(calls).toBe(2);
      expect(t.service.current()).toHaveLength(1);
    });

    it('with nothing in progress and nothing current does nothing', async () => {
      const t = await setup();
      t.service.reset();
      t.service.reset();
      expect(t.service.current()).toEqual([]);
      expect(t.model.calls).toEqual([]);
    });
  });
});
