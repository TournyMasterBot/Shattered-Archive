import { validateSuggestion } from '@shatteredarchive/copilot-core';
import type { FightGateFn } from '../fight/gate';
import { createFakeModel } from '../models/fake';
import { fightSnapshot } from '../testing/fights';
import { makeSituation } from '../testing/situations';
import { createProducer } from './producer';

const kill = JSON.stringify({ command: 'kill goblin', kind: 'fight-start-unknown', sphere: 'fighting', rationale: 'Level up on the goblin.', confidence: 0.9 });

function setup(gate?: FightGateFn) {
  const model = createFakeModel([kill]);
  let n = 0;
  const producer = createProducer({
    model,
    route: async () => ({ sphere: 'fighting', facts: [], lessons: [], tried: ['fighting'] }),
    mapEvidence: () => null,
    fightGate: gate,
    now: () => 5_000,
    newId: (p) => `${p}-${++n}`,
  });
  return { producer, model };
}

describe('produce with the fight rule', () => {
  it('keeps the model\'s command when there is no gate, or the gate lets it through', async () => {
    expect((await setup().producer.produce(makeSituation())).suggestion?.command).toBe('kill goblin');
    const asked: string[] = [];
    const { producer } = setup(async (_s, command) => {
      asked.push(command);
      return { action: 'allow' };
    });
    const result = await producer.produce(makeSituation());
    expect(result.suggestion?.command).toBe('kill goblin');
    expect(result.suggestion?.rationale).toBe('Level up on the goblin.');
    expect(asked).toEqual(['kill goblin']);
  });

  it('puts the safe command in the suggestion when the gate replaces it, with the reason, as an information command', async () => {
    const { producer } = setup(async () => ({ action: 'replace', command: 'consider goblin', rationale: '"goblin" is not identified by the archive: consider it first.' }));
    const result = await producer.produce(makeSituation());
    expect(result.suggestion).toMatchObject({ command: 'consider goblin', kind: 'info', rationale: '"goblin" is not identified by the archive: consider it first.', confidence: 0.95, confidenceSource: 'model', sphere: 'fighting' });
    expect(validateSuggestion(result.suggestion).ok).toBe(true);
  });

  it('gives no suggestion at all when the gate holds the fight back, and says why', async () => {
    const { producer } = setup(async () => ({ action: 'hold', rationale: 'considered "goblin": too strong to fight' }));
    const result = await producer.produce(makeSituation());
    expect(result.suggestion).toBeUndefined();
    expect(result.held).toBe('considered "goblin": too strong to fight');
    expect(result.tickets).toEqual([]);
  });

  it('cuts a very long reason to the length of a rationale', async () => {
    const { producer } = setup(async () => ({ action: 'replace', command: 'consider goblin', rationale: 'x'.repeat(900) }));
    expect((await producer.produce(makeSituation())).suggestion?.rationale).toHaveLength(500);
  });
});

describe('urgent', () => {
  it('makes a flee suggestion from a fight that is being lost, without asking the model', () => {
    const { producer, model } = setup();
    const suggestion = producer.urgent(makeSituation({ mode: 'battle', game: { inFight: true }, fight: fightSnapshot('losing') }));
    expect(suggestion).toMatchObject({ command: 'flee', kind: 'fight-continue', sphere: 'fighting', mode: 'battle', confidence: null, character: 'Agate-F' });
    expect(suggestion?.rationale).toContain('fight monitor');
    expect(validateSuggestion(suggestion).ok).toBe(true);
    expect(model.calls).toEqual([]);
  });

  it('has nothing urgent when there is no fight, or it is going well', () => {
    const { producer } = setup();
    expect(producer.urgent(makeSituation())).toBeUndefined();
    expect(producer.urgent(makeSituation({ mode: 'battle', game: { inFight: true }, fight: fightSnapshot('winning') }))).toBeUndefined();
  });
});
