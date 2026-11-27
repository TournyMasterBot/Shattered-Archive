import type { Decision, Lesson } from '../contracts';
import { TRAINERS } from '../contracts';
import { validateDecision, validateLesson } from './records';

const decision: Decision = { id: 'd1', suggestionId: 's1', character: 'Agate-F', at: 1000, outcome: 'corrected', command: 'consider goblin', why: 'Consider before fighting (act_info.c do_consider).' };
const lesson: Lesson = {
  id: 'l1',
  createdAt: 1000,
  sphere: 'fighting',
  situationKey: 'exploration:a-dark-cave',
  scope: 'shared',
  world: 'sandbox',
  rule: 'Consider a monster before fighting it.',
  sourceDecisionId: 'd1',
  status: 'accepted',
};

describe('the trainer stamp', () => {
  it('has one trainer: Claude', () => {
    expect([...TRAINERS]).toEqual(['claude']);
  });

  it('is accepted on a decision, kept when stored, and absent from an owner decision', () => {
    const stamped = validateDecision({ ...decision, trainer: 'claude' });
    expect(stamped).toEqual({ ok: true, value: { ...decision, trainer: 'claude' } });
    const owner = validateDecision(decision);
    expect(owner.ok && 'trainer' in owner.value).toBe(false);
  });

  it('refuses any other trainer, on a decision and on a lesson', () => {
    expect(validateDecision({ ...decision, trainer: 'owner' }).ok).toBe(false);
    expect(validateDecision({ ...decision, trainer: true }).ok).toBe(false);
    expect(validateLesson({ ...lesson, trainer: 'owner' }).ok).toBe(false);
  });

  it('is accepted on a Simulacrum lesson, and a lesson of the DSL can never be a trainer\'s', () => {
    expect(validateLesson({ ...lesson, trainer: 'claude' })).toEqual({ ok: true, value: { ...lesson, trainer: 'claude' } });
    const owner = validateLesson(lesson);
    expect(owner.ok && 'trainer' in owner.value).toBe(false);
    const dsl = validateLesson({ ...lesson, world: 'dsl', trainer: 'claude' });
    expect(dsl).toEqual({ ok: false, errors: ['a trainer lesson must be for the sandbox world'] });
  });
});
