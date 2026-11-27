import { JsonlStore, validateTicket, type EscalationTicket } from '@shatteredarchive/copilot-core';
import { createFakeModel } from '../models/fake';
import { MemoryFs } from '../testing/memoryFs';
import { fightSnapshot } from '../testing/fights';
import { makeSituation } from '../testing/situations';
import { createProducer } from './producer';
import { SuggestionService } from './service';
import type { FightGateFn } from '../fight/gate';
import type { Situation } from './situation';

const look = JSON.stringify({ command: 'kill goblin', kind: 'fight-continue', sphere: 'fighting', rationale: 'Keep fighting.', confidence: 0.9 });
const battle = (over: Partial<Situation> = {}): Situation => makeSituation({ mode: 'battle', game: { inFight: true }, ...over });

async function setup(options: { gate?: FightGateFn; maxRoundsBehind?: number } = {}) {
  const fs = new MemoryFs();
  const { store: tickets } = await JsonlStore.open<EscalationTicket>({ fs, path: '/t.jsonl', validate: validateTicket });
  const model = createFakeModel([look, look, look]);
  let n = 0;
  let clock = 1_000;
  let situation: Situation | undefined = battle({ fight: fightSnapshot('winning') });
  const producer = createProducer({
    model,
    route: async () => ({ sphere: 'fighting', facts: [], lessons: [], tried: ['fighting'] }),
    mapEvidence: () => null,
    fightGate: options.gate,
    now: () => clock,
    newId: (p) => `${p}-${++n}`,
  });
  const service = new SuggestionService({ producer, situation: () => situation, tickets, now: () => clock, retryMs: 0, maxRoundsBehind: options.maxRoundsBehind });
  return { service, model, set: (s: Situation | undefined) => void (situation = s), advance: (ms: number) => void (clock += ms) };
}

describe('SuggestionService and the fight', () => {
  it('makes the flee itself the moment the fight turns bad, without a model call, and keeps it', async () => {
    const t = await setup();
    t.set(battle({ fight: fightSnapshot('losing') }));
    t.service.poke();
    expect(t.service.current()).toHaveLength(1);
    expect(t.service.current()[0]).toMatchObject({ command: 'flee', kind: 'fight-continue' });
    expect(t.model.calls).toEqual([]);
    const first = t.service.current()[0].id;
    t.service.poke(); // the same urgent suggestion is not made twice
    expect(t.service.current()[0].id).toBe(first);
    expect(t.service.find(first)).toBeDefined();
    expect(t.service.counters.produced).toBe(1);
  });

  it('replaces a suggestion the model made earlier with the flee when the fight turns bad', async () => {
    const t = await setup();
    t.service.poke();
    await t.service.idle();
    expect(t.service.current()[0].command).toBe('kill goblin');
    t.set(battle({ fight: fightSnapshot('losing') }));
    t.service.poke();
    expect(t.service.current()[0].command).toBe('flee');
  });

  it('drops a model answer that arrives after the fight turned bad, so it cannot replace the flee', async () => {
    const t = await setup();
    t.service.poke(); // the model is asked while the fight is fine
    t.set(battle({ fight: fightSnapshot('losing') })); // ... and the fight turns before it answers
    await t.service.idle();
    expect(t.service.current()).toEqual([]);
    t.service.poke();
    expect(t.service.current()[0].command).toBe('flee');
  });

  it('drops a suggestion that is more than two rounds behind the fight, and makes a new one', async () => {
    const t = await setup();
    t.service.poke();
    await t.service.idle();
    expect(t.service.current()).toHaveLength(1);
    t.set(battle({ fight: { ...fightSnapshot('winning'), roundNow: 3 } })); // two rounds on: still current
    expect(t.service.current()).toHaveLength(1);
    t.set(battle({ fight: { ...fightSnapshot('winning'), roundNow: 5 } })); // three rounds on: out of date
    expect(t.service.current()).toEqual([]);
    t.service.poke();
    await t.service.idle();
    expect(t.model.calls).toHaveLength(2);
    expect(t.service.current()).toHaveLength(1);
  });

  it('does not tie a suggestion to a round when there is no fight, and honours a different limit', async () => {
    const t = await setup({ maxRoundsBehind: 0 });
    t.set(makeSituation());
    t.service.poke();
    await t.service.idle();
    expect(t.service.current()).toHaveLength(1);
    t.set(makeSituation({ fight: { ...fightSnapshot('winning'), active: false } }));
    expect(t.service.current()).toHaveLength(1);
    const fighting = await setup({ maxRoundsBehind: 0 });
    fighting.service.poke();
    await fighting.service.idle();
    expect(fighting.service.current()).toHaveLength(1);
    fighting.set(battle({ fight: { ...fightSnapshot('winning'), roundNow: 3 } }));
    expect(fighting.service.current()).toEqual([]);
  });

  it('counts a fight the rule held back, and serves no suggestion for it', async () => {
    const t = await setup({ gate: async () => ({ action: 'hold', rationale: 'too strong' }) });
    t.service.poke();
    await t.service.idle();
    expect(t.service.current()).toEqual([]);
    expect(t.service.counters).toMatchObject({ held: 1, withoutSuggestion: 1, produced: 0 });
  });
});
