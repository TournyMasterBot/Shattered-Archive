import { JsonlStore, validateLesson, validateTicket, type Decision, type EscalationTicket, type Lesson, type LessonWorld, type Suggestion } from '@shatteredarchive/copilot-core';
import { createFakeModel, type FakeAnswer } from '../models/fake';
import { MemoryFs } from '../testing/memoryFs';
import { makeLesson, makeSituation } from '../testing/situations';
import { createCorrectionHandler } from './corrections';
import { routeSituation, type Lookup } from './router';
import { BUILT_IN_SPHERES } from './spheres';

const suggestion: Suggestion = {
  id: 's-1',
  character: 'Agate-F',
  createdAt: 1,
  mode: 'exploration',
  sphere: 'fighting',
  kind: 'fight-start-unknown',
  command: 'kill goblin',
  rationale: 'Level up.',
  confidence: 0.9,
  confidenceSource: 'model',
  situationKey: 'exploration:a-dark-cave',
};
const trainerDecision: Decision = { id: 'd-1', suggestionId: 's-1', character: 'Agate-F', at: 10, outcome: 'corrected', command: 'consider goblin', why: 'do_consider first (act_info.c)', trainer: 'claude' };
const good = JSON.stringify({ rule: 'Consider a monster before fighting it.', restatement: 'The trainer chose to consider the goblin because the rule is to consider before a fight.', confident: true });

async function handler(script: FakeAnswer[], trainer: boolean) {
  const fs = new MemoryFs();
  const { store: lessons } = await JsonlStore.open<Lesson>({ fs, path: '/lessons.jsonl', validate: validateLesson });
  const { store: tickets } = await JsonlStore.open<EscalationTicket>({ fs, path: '/tickets.jsonl', validate: validateTicket });
  let n = 0;
  const h = createCorrectionHandler({
    model: createFakeModel(script),
    lessons,
    tickets,
    findSuggestion: (id) => (id === 's-1' ? suggestion : undefined),
    redact: (text) => text,
    now: () => 7_000,
    newId: (prefix) => `${prefix}-${++n}`,
    trainer,
  });
  return { h, lessons, tickets };
}

describe('the trainer\'s correction handler', () => {
  it('makes an understood correction an ACCEPTED Simulacrum lesson, stamped with the trainer', async () => {
    const { h, lessons, tickets } = await handler([good], true);
    expect(await h.handle(trainerDecision)).toBe('lesson');
    expect(lessons.query()).toEqual([
      {
        id: 'l-1',
        createdAt: 7_000,
        sphere: 'fighting',
        situationKey: 'exploration:a-dark-cave',
        scope: 'shared',
        world: 'sandbox',
        rule: 'Consider a monster before fighting it.',
        sourceDecisionId: 'd-1',
        status: 'accepted',
        trainer: 'claude',
      },
    ]);
    expect(tickets.query()).toEqual([]);
  });

  it('files a ticket (in the trainer\'s own store) for a correction the agent did not understand, and makes no lesson', async () => {
    const { h, lessons, tickets } = await handler([JSON.stringify({ rule: 'x', restatement: 'something else', confident: false })], true);
    expect(await h.handle(trainerDecision)).toBe('ticket');
    expect(lessons.query()).toEqual([]);
    expect(tickets.query()).toHaveLength(1);
  });

  it('leaves the owner\'s handler as it was: a PROPOSED lesson of the DSL with no stamp', async () => {
    const { h, lessons } = await handler([good], false);
    expect(await h.handle({ ...trainerDecision, trainer: undefined })).toBe('lesson');
    const lesson = lessons.query()[0];
    expect(lesson).toMatchObject({ world: 'dsl', status: 'proposed' });
    expect(lesson).not.toHaveProperty('trainer');
  });
});

describe('lessons and worlds in the router', () => {
  const lookup: Lookup = async () => [];
  const route = (lessons: Lesson[], world?: LessonWorld) =>
    routeSituation(makeSituation({ situationKey: 'exploration:a-dark-cave' }), { spheres: BUILT_IN_SPHERES, lookup, lessons: () => lessons, world: world === undefined ? undefined : () => world });
  const dslLesson = makeLesson({ id: 'l-dsl', situationKey: 'exploration:a-dark-cave', world: 'dsl', rule: 'A rule of the DSL.' });
  const simLesson = makeLesson({ id: 'l-sim', situationKey: 'exploration:a-dark-cave', world: 'sandbox', rule: 'A rule of the Simulacrum.' });

  it('applies a Simulacrum lesson only while the connection is the Simulacrum\'s', async () => {
    expect((await route([dslLesson, simLesson], 'sandbox')).lessons.map((l) => l.id)).toEqual(['l-sim']);
    expect((await route([dslLesson, simLesson], 'dsl')).lessons.map((l) => l.id)).toEqual(['l-dsl']);
  });

  it('treats an unknown world as the DSL: a Simulacrum lesson never steers it', async () => {
    expect((await route([dslLesson, simLesson])).lessons.map((l) => l.id)).toEqual(['l-dsl']);
  });

  it('still never applies a proposed lesson of either world', async () => {
    const proposed = makeLesson({ id: 'l-p', situationKey: 'exploration:a-dark-cave', world: 'sandbox', status: 'proposed' });
    expect((await route([proposed], 'sandbox')).lessons).toEqual([]);
  });
});
