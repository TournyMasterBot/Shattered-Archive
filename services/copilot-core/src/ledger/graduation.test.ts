import type { Lesson } from '../contracts';
import {
  computeScenarioStates,
  detectLessonConflicts,
  GRADUATION_CLEAN_OCCURRENCES,
  scenarioKey,
  type Scenario,
  type ScenarioEvent,
} from './graduation';

const door: Scenario = { sphere: 'interaction', kind: 'interact', situationKey: 'hall-door' };
const bridge: Scenario = { sphere: 'world', kind: 'move', situationKey: 'rope-bridge' };

const ticket = (at: number, scenario = door): ScenarioEvent => ({ type: 'ticket', at, scenario });
const accepted = (at: number, scenario = door): ScenarioEvent => ({ type: 'accepted', at, scenario });
const occurrence = (at: number, scenario = door): ScenarioEvent => ({ type: 'occurrence', at, scenario });
const occurrences = (from: number, count: number, scenario = door): ScenarioEvent[] =>
  Array.from({ length: count }, (_, i) => occurrence(from + i, scenario));

const stateOf = (events: ScenarioEvent[], scenario = door) => computeScenarioStates(events).get(scenarioKey(scenario));

describe('scenarioKey', () => {
  it('names sphere, kind and situation', () => {
    expect(scenarioKey(door)).toBe('interaction:interact:hall-door');
  });
});

describe('computeScenarioStates: graduation', () => {
  it('requires an owner acceptance: ten clean occurrences without one never graduate', () => {
    const state = stateOf([ticket(1), ...occurrences(2, 25)]);
    expect(state).toMatchObject({ claudeNeeded: 1, accepted: false, cleanSinceAcceptance: 0, graduated: false });
  });

  it('acceptance without the ten later occurrences stays open', () => {
    const state = stateOf([ticket(1), accepted(2), ...occurrences(3, GRADUATION_CLEAN_OCCURRENCES - 1)]);
    expect(state).toMatchObject({ accepted: true, cleanSinceAcceptance: 9, graduated: false });
  });

  it('acceptance plus ten clean occurrences graduates', () => {
    const state = stateOf([ticket(1), accepted(2), ...occurrences(3, GRADUATION_CLEAN_OCCURRENCES)]);
    expect(state).toMatchObject({ claudeNeeded: 1, accepted: true, cleanSinceAcceptance: 10, graduated: true });
  });

  it('occurrences before the acceptance do not count towards it', () => {
    const state = stateOf([ticket(1), ...occurrences(2, 20), accepted(30), ...occurrences(31, 3)]);
    expect(state).toMatchObject({ cleanSinceAcceptance: 3, graduated: false });
  });

  it('a ticket in between resets the count and removes the acceptance', () => {
    const state = stateOf([ticket(1), accepted(2), ...occurrences(3, 8), ticket(20), ...occurrences(21, 10)]);
    expect(state).toMatchObject({ claudeNeeded: 2, accepted: false, cleanSinceAcceptance: 0, graduated: false });
  });

  it('a new acceptance after a second ticket starts the count again', () => {
    const state = stateOf([ticket(1), accepted(2), ...occurrences(3, 8), ticket(20), accepted(21), ...occurrences(22, 10)]);
    expect(state).toMatchObject({ claudeNeeded: 2, accepted: true, graduated: true });
  });

  it('a ticket after graduation re-opens the scenario', () => {
    const graduated = [ticket(1), accepted(2), ...occurrences(3, 10)];
    expect(stateOf(graduated)?.graduated).toBe(true);
    expect(stateOf([...graduated, ticket(50)])).toMatchObject({ graduated: false, accepted: false, claudeNeeded: 2 });
  });

  it('a second acceptance restarts the clean count from zero', () => {
    const state = stateOf([ticket(1), accepted(2), ...occurrences(3, 6), accepted(10), ...occurrences(11, 5)]);
    expect(state).toMatchObject({ cleanSinceAcceptance: 5, graduated: false });
  });

  it('puts events in time order whatever order they are given in', () => {
    const events = [...occurrences(3, 10), accepted(2), ticket(1)].reverse().reverse();
    expect(stateOf(events)).toMatchObject({ graduated: true });
    expect(stateOf([...occurrences(3, 10), accepted(2), ticket(1)].reverse())).toMatchObject({ graduated: true });
  });

  it('tracks scenarios independently', () => {
    const states = computeScenarioStates([ticket(1, door), ticket(2, bridge), accepted(3, bridge), ...occurrences(4, 10, bridge)]);
    expect(states.get(scenarioKey(door))).toMatchObject({ claudeNeeded: 1, graduated: false });
    expect(states.get(scenarioKey(bridge))).toMatchObject({ claudeNeeded: 1, graduated: true });
    expect(states.size).toBe(2);
  });

  it('has no states for no events', () => {
    expect(computeScenarioStates([]).size).toBe(0);
  });

  it('does not modify the events it is given', () => {
    const events = [occurrence(3), ticket(1), accepted(2)];
    const copy = JSON.stringify(events);
    computeScenarioStates(events);
    expect(JSON.stringify(events)).toBe(copy);
  });
});

const lesson = (id: string, overrides: Partial<Lesson> = {}): Lesson => ({
  id,
  createdAt: 1,
  sphere: 'world',
  situationKey: 'rope-bridge',
  scope: 'shared',
  world: 'dsl',
  rule: 'Cross the rope bridge one at a time.',
  sourceDecisionId: 'd1',
  status: 'proposed',
  ...overrides,
});

describe('detectLessonConflicts (E6)', () => {
  it('reports two lessons that give different rules for the same situation, world and scope', () => {
    const a = lesson('a', { rule: 'Cross the bridge.' });
    const b = lesson('b', { rule: 'Never cross the bridge.' });
    const conflicts = detectLessonConflicts([a, b]);
    expect(conflicts).toEqual([{ sphere: 'world', situationKey: 'rope-bridge', lessons: [a, b] }]);
  });

  it('does NOT report lessons with different worlds: both survive with their tags', () => {
    const live = lesson('a', { world: 'dsl', rule: 'Cross the bridge.' });
    const sandbox = lesson('b', { world: 'sandbox', rule: 'Never cross the bridge.' });
    expect(detectLessonConflicts([live, sandbox])).toEqual([]);
  });

  it('does NOT report lessons with different scopes or scope keys', () => {
    const shared = lesson('a', { rule: 'Cross the bridge.' });
    const warrior = lesson('b', { scope: 'class', scopeKey: 'Warrior', rule: 'Never cross the bridge.' });
    const mage = lesson('c', { scope: 'class', scopeKey: 'Mage', rule: 'Always cross the bridge.' });
    expect(detectLessonConflicts([shared, warrior, mage])).toEqual([]);
  });

  it('does not report the same rule written with different spacing or case', () => {
    expect(detectLessonConflicts([lesson('a', { rule: 'Cross the  Bridge.' }), lesson('b', { rule: ' cross the bridge. ' })])).toEqual([]);
  });

  it('does not report different situations or spheres', () => {
    expect(detectLessonConflicts([lesson('a'), lesson('b', { situationKey: 'other', rule: 'Something else.' })])).toEqual([]);
    expect(detectLessonConflicts([lesson('a'), lesson('b', { sphere: 'things', rule: 'Something else.' })])).toEqual([]);
  });

  it('ignores rejected and superseded lessons', () => {
    const a = lesson('a', { rule: 'Cross.' });
    expect(detectLessonConflicts([a, lesson('b', { status: 'rejected', rule: 'Do not.' }), lesson('c', { status: 'superseded', rule: 'Wait.' })])).toEqual([]);
  });

  it('counts accepted and proposed lessons, and groups three-way disagreements once', () => {
    const lessons = [lesson('a', { status: 'accepted', rule: 'A.' }), lesson('b', { rule: 'B.' }), lesson('c', { rule: 'C.' })];
    const conflicts = detectLessonConflicts(lessons);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].lessons.map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not change or drop any lesson', () => {
    const lessons = [lesson('a', { rule: 'A.' }), lesson('b', { rule: 'B.' })];
    const copy = JSON.stringify(lessons);
    detectLessonConflicts(lessons);
    expect(JSON.stringify(lessons)).toBe(copy);
  });
});
