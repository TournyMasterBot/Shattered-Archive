import { JsonlStore, validateLesson, validateTicket, type Decision, type EscalationTicket, type Lesson, type Suggestion } from '@shatteredarchive/copilot-core';
import { createFakeModel, type FakeAnswer } from '../models/fake';
import { MemoryFs } from '../testing/memoryFs';
import { createCorrectionHandler } from './corrections';

const suggestion: Suggestion = {
  id: 's-1',
  character: 'Agate-F',
  createdAt: 1,
  mode: 'exploration',
  sphere: 'interaction',
  kind: 'info',
  command: 'look',
  rationale: 'Look around.',
  confidence: 0.9,
  confidenceSource: 'model',
  situationKey: 'exploration:market-square',
};
const corrected: Decision = { id: 'd-1', suggestionId: 's-1', character: 'Agate-F', at: 10, outcome: 'corrected', command: 'drop sword', why: 'It is cursed' };
const good = JSON.stringify({ rule: 'Drop cursed gear in the square.', restatement: 'The owner chose to drop the sword because it is cursed.', confident: true });

async function setup(script: FakeAnswer[], over: { known?: Suggestion | undefined; failTickets?: boolean; failLessons?: boolean } = {}) {
  const fs = new MemoryFs();
  const { store: lessons } = await JsonlStore.open<Lesson>({ fs, path: '/lessons.jsonl', validate: validateLesson });
  const { store: tickets } = await JsonlStore.open<EscalationTicket>({ fs, path: '/tickets.jsonl', validate: validateTicket });
  const model = createFakeModel(script);
  let n = 0;
  const handler = createCorrectionHandler({
    model,
    lessons,
    tickets,
    findSuggestion: (id) => ('known' in over ? over.known : suggestion)?.id === id ? ('known' in over ? over.known : suggestion) : undefined,
    redact: (text) => text.replace(/Zorvak/g, 'Agate-M'),
    now: () => 7_000,
    newId: (prefix) => `${prefix}-${++n}`,
  });
  return { handler, lessons, tickets, model, fs };
}

describe('createCorrectionHandler.handle', () => {
  it('an understood correction becomes a PROPOSED lesson tagged with the world, sphere and situation (E6)', async () => {
    const { handler, lessons, tickets } = await setup([good]);
    expect(await handler.handle(corrected)).toBe('lesson');
    expect(lessons.query()).toEqual([
      {
        id: 'l-1',
        createdAt: 7_000,
        sphere: 'interaction',
        situationKey: 'exploration:market-square',
        scope: 'shared',
        world: 'dsl',
        rule: 'Drop cursed gear in the square.',
        sourceDecisionId: 'd-1',
        status: 'proposed',
      },
    ]);
    expect(tickets.query()).toEqual([]);
  });

  it('asks the agent role with the correction, through the redactor', async () => {
    const { handler, model } = await setup([good]);
    await handler.handle({ ...corrected, command: 'tell Zorvak hello', why: 'Zorvak is nearby' });
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0].role).toBe('agent');
    expect(model.calls[0].prompt).toContain('OWNER COMMAND: tell Agate-M hello');
    expect(model.calls[0].prompt).not.toContain('Zorvak');
  });

  it.each([
    ['an answer that is not JSON', 'I understand!', 'not valid JSON'],
    ['an agent that is not confident', JSON.stringify({ rule: 'r', restatement: 'drop it', confident: false }), 'not confident'],
    ['a restatement that does not name the verb', JSON.stringify({ rule: 'r', restatement: 'something else entirely', confident: true }), 'verb'],
  ])('%s opens a correction-not-understood ticket and no lesson', async (_label, text, problem) => {
    const { handler, lessons, tickets } = await setup([text]);
    expect(await handler.handle(corrected)).toBe('ticket');
    expect(lessons.query()).toEqual([]);
    expect(tickets.query()).toHaveLength(1);
    expect(tickets.query()[0]).toMatchObject({
      reason: 'correction-not-understood',
      sphere: 'interaction',
      kind: 'info',
      situationKey: 'exploration:market-square',
      decisionId: 'd-1',
      status: 'open',
      character: 'Agate-F',
    });
    expect(tickets.query()[0].summary).toContain(problem);
  });

  it('a model that cannot be reached opens a ticket that says why', async () => {
    const { handler, tickets } = await setup([{ ok: false, reason: 'timeout' }]);
    expect(await handler.handle(corrected)).toBe('ticket');
    expect(tickets.query()[0].summary).toBe('The agent could not be asked (timeout)');
  });

  it('a suggestion the server no longer has opens a ticket without asking the model', async () => {
    const { handler, tickets, model } = await setup([good], { known: undefined });
    expect(await handler.handle(corrected)).toBe('ticket');
    expect(model.calls).toEqual([]);
    expect(tickets.query()[0]).toMatchObject({ sphere: 'world', kind: 'unknown', situationKey: 'unknown' });
    expect(tickets.query()[0].summary).toContain('no longer available');
  });

  it('a correction of the same command is not understood (nothing was corrected)', async () => {
    const { handler, tickets } = await setup([good]);
    expect(await handler.handle({ ...corrected, command: 'look' })).toBe('ticket');
    expect(tickets.query()[0].summary).toContain('same command');
  });

  it.each([
    ['approved', { outcome: 'approved' as const }],
    ['rejected', { outcome: 'rejected' as const }],
    ['auto', { outcome: 'auto' as const }],
    ['a correction with no command', { command: undefined }],
  ])('%s needs nothing', async (_label, over) => {
    const { handler, lessons, tickets, model } = await setup([good]);
    expect(await handler.handle({ ...corrected, ...over })).toBe('ignored');
    expect([lessons.query(), tickets.query(), model.calls]).toEqual([[], [], []]);
  });

  it('a lesson that cannot be saved opens a ticket; a ticket that cannot be saved is ignored; nothing throws', async () => {
    const lessonFails = await setup([good]);
    lessonFails.fs.failPathEnding = 'lessons.jsonl';
    expect(await lessonFails.handler.handle(corrected)).toBe('ticket');
    expect(lessonFails.tickets.query()[0].summary).toBe('The lesson could not be saved');

    const bothFail = await setup([good]);
    bothFail.fs.failAppend = true;
    expect(await bothFail.handler.handle(corrected)).toBe('ignored');
  });

  it('never throws, even when something unexpected breaks', async () => {
    const { handler } = await setup([() => { throw new Error('boom'); }]);
    expect(await handler.handle(corrected)).toBe('ignored');
  });

  it('makes ids with the default generator', async () => {
    const fs = new MemoryFs();
    const { store: lessons } = await JsonlStore.open<Lesson>({ fs, path: '/l.jsonl', validate: validateLesson });
    const { store: tickets } = await JsonlStore.open<EscalationTicket>({ fs, path: '/t.jsonl', validate: validateTicket });
    const handler = createCorrectionHandler({ model: createFakeModel([good]), lessons, tickets, findSuggestion: () => suggestion, redact: (t) => t, now: () => 1 });
    await handler.handle(corrected);
    expect(lessons.query()[0].id).toMatch(/^l-[0-9a-f-]{36}$/);
  });
});
