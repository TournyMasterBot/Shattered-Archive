import { ACTION_KINDS, FLOOR_KINDS, SPHERES, type ActionKind, type Sphere, type Suggestion } from '../contracts';
import { reduceEvents, initialReducerState } from '../log/reducer';
import type { LogEvent } from '../log/events';
import type { BucketStats } from './confidence';
import { decide, ESCALATE_BELOW, type PolicyState } from './decide';
import type { FightTarget } from './classify';
import { DEFAULT_SETTINGS, normalizeSettings, type TrustSettings } from './settings';

const NOW = 1_000_000;
const KNOWN_MOB: FightTarget = { kind: 'mob', levelKnown: true, killable: true, reasonKnown: true };

/** A live game state (text 1 second ago), optionally in a fight. */
function liveGame(inFight = false): PolicyState['game'] {
  const events: LogEvent[] = [{ kind: 'raw', at: NOW - 1000, data: 'x\r\n' }];
  if (inFight) events.push({ kind: 'char', at: NOW - 900, vitals: { hp: 1, maxHp: 1, mana: 1, maxMana: 1, move: 1, maxMove: 1 }, inFight: true });
  return reduceEvents(initialReducerState(), events).state.game;
}

function state(overrides: Partial<PolicyState> = {}, bucket: BucketStats | undefined = { approved: 50, total: 50 }): PolicyState {
  return { game: liveGame(), stats: () => bucket, ...overrides };
}

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 's1',
    character: 'Agate-F',
    createdAt: NOW,
    mode: 'exploration',
    sphere: 'world',
    kind: 'move',
    command: 'north',
    rationale: 'the map says north',
    confidence: 0.95,
    confidenceSource: 'model',
    situationKey: 'k',
    ...overrides,
  };
}

const MOVE_ON: TrustSettings = normalizeSettings({ rules: { 'world:move': { enabled: true, threshold: 0.8 } } });

describe('decide: the happy path and its edges', () => {
  it('runs a move by itself when a rule is on, the history is long enough and the confidence is high enough', () => {
    expect(decide(suggestion(), MOVE_ON, state(), NOW)).toEqual({ outcome: 'auto', reason: 'rule-allows', kind: 'move', ruleId: 'world:move' });
  });

  it('defaults to ask with every rule off', () => {
    expect(decide(suggestion(), DEFAULT_SETTINGS as TrustSettings, state(), NOW)).toMatchObject({ outcome: 'ask', reason: 'no-rule' });
  });

  it('asks when the rule is present but switched off', () => {
    const off = normalizeSettings({ rules: { 'world:move': { enabled: false, threshold: 0.8 } } });
    expect(decide(suggestion(), off, state(), NOW)).toMatchObject({ outcome: 'ask', reason: 'no-rule' });
  });

  it('asks for another sphere or another kind than the one the rule covers', () => {
    expect(decide(suggestion({ sphere: 'things' }), MOVE_ON, state(), NOW)).toMatchObject({ outcome: 'ask', reason: 'no-rule' });
    expect(decide(suggestion({ command: 'look', kind: 'info' }), MOVE_ON, state(), NOW)).toMatchObject({ outcome: 'ask', reason: 'no-rule' });
  });

  it('asks for an unknown sphere', () => {
    expect(decide(suggestion({ sphere: 'sky' as Sphere }), MOVE_ON, state(), NOW)).toMatchObject({ outcome: 'ask', reason: 'no-rule' });
  });

  it('a threshold equal to the effective confidence passes; just above it asks', () => {
    // 50 of 50 earns about 0.9287; a 0.9287... rating is the cap, so set the rating as the limiting side instead
    const rule = (t: number): TrustSettings => normalizeSettings({ rules: { 'world:move': { enabled: true, threshold: t } } });
    expect(decide(suggestion({ confidence: 0.8 }), rule(0.8), state(), NOW).outcome).toBe('auto');
    expect(decide(suggestion({ confidence: 0.79999 }), rule(0.8), state(), NOW)).toMatchObject({ outcome: 'ask', reason: 'below-threshold' });
  });

  it('the earned approval rate caps a high rating: 20 of 20 is about 0.84, so a 0.9 threshold does not pass', () => {
    const rule = normalizeSettings({ rules: { 'world:move': { enabled: true, threshold: 0.9 } } });
    expect(decide(suggestion({ confidence: 0.99 }), rule, state({}, { approved: 20, total: 20 }), NOW)).toMatchObject({
      outcome: 'ask',
      reason: 'below-threshold',
    });
    expect(decide(suggestion({ confidence: 0.99 }), rule, state({}, { approved: 100, total: 100 }), NOW).outcome).toBe('auto');
  });

  it('19 owner decisions in the bucket ask, 20 run (P4)', () => {
    expect(decide(suggestion({ confidence: 0.84 }), MOVE_ON, state({}, { approved: 19, total: 19 }), NOW)).toMatchObject({
      outcome: 'ask',
      reason: 'insufficient-samples',
    });
    expect(decide(suggestion({ confidence: 0.84 }), MOVE_ON, state({}, { approved: 20, total: 20 }), NOW).outcome).toBe('auto');
  });

  it('asks when the bucket has no statistics at all', () => {
    expect(decide(suggestion(), MOVE_ON, state({ stats: () => undefined }), NOW)).toMatchObject({ outcome: 'ask', reason: 'insufficient-samples' });
  });

  it('asks with a poor approval history even at high model confidence', () => {
    expect(decide(suggestion({ confidence: 0.99 }), MOVE_ON, state({}, { approved: 5, total: 30 }), NOW)).toMatchObject({
      outcome: 'ask',
      reason: 'below-threshold',
    });
  });

  it('map movement uses the evidence the suggestion carries as its confidence', () => {
    const edge = suggestion({ confidence: 0.95, confidenceSource: 'map-evidence' });
    expect(decide(edge, MOVE_ON, state(), NOW).outcome).toBe('auto');
    expect(decide({ ...edge, confidence: 0.6 }, MOVE_ON, state(), NOW)).toMatchObject({ outcome: 'ask', reason: 'below-threshold' });
  });
});

describe('decide: stale state (T2, A1)', () => {
  it('asks when the text feed is older than the limit, even for an enabled, well-earned move', () => {
    const stale = state({ game: liveGame() });
    const later = NOW + 61_000;
    expect(decide(suggestion(), MOVE_ON, stale, later)).toMatchObject({ outcome: 'ask', reason: 'stale' });
  });

  it('runs again when the feed is fresh', () => {
    expect(decide(suggestion(), MOVE_ON, state(), NOW + 59_000).outcome).toBe('auto');
  });

  it('a state with no events at all is stale', () => {
    expect(decide(suggestion(), MOVE_ON, state({ game: initialReducerState().game }), NOW)).toMatchObject({ outcome: 'ask', reason: 'stale' });
  });

  it('uses the stale limit from the settings', () => {
    const tight = normalizeSettings({ staleAfterSeconds: 5, rules: { 'world:move': { enabled: true, threshold: 0.8 } } });
    expect(decide(suggestion(), tight, state(), NOW + 6_000)).toMatchObject({ reason: 'stale' });
  });

  it('checks staleness before anything else, so a floor command on a stale feed reports stale', () => {
    expect(decide(suggestion({ command: 'quit', kind: 'irreversible' }), MOVE_ON, state(), NOW + 120_000).reason).toBe('stale');
  });
});

describe('decide: the hard floor (A1)', () => {
  const floorCommands: [string, ActionKind][] = [
    ['drop sword', 'spend-or-lose'], ['dro sword', 'spend-or-lose'], ['sell all', 'spend-or-lose'], ['giv 5 gold bob', 'spend-or-lose'],
    ['quaff blue', 'spend-or-lose'],
    ['say hi', 'speak'], ['gos hi', 'speak'], ['tell bob x', 'speak'], ["'hello", 'speak'],
    ['quit', 'irreversible'], ['qui', 'irreversible'], ['delete', 'irreversible'], ['steal gold bob', 'irreversible'],
    ['murder bob', 'pk'],
  ];

  it.each(floorCommands)('%s is never auto, with every rule enabled for every kind', (command, kind) => {
    const everything: Record<string, unknown> = {};
    for (const sphere of SPHERES) for (const k of ACTION_KINDS) everything[`${sphere}:${k}`] = { enabled: true, threshold: 0.5 };
    const settings = normalizeSettings({ rules: everything });
    for (const sphere of SPHERES) {
      const result = decide(suggestion({ sphere, command, kind: 'move', confidence: 1 }), settings, state(), NOW);
      expect(result.outcome).toBe('ask');
      expect(result.reason).toBe('floor');
      expect(result.kind).toBe(kind);
    }
  });

  it('a hand-built settings object that enables a floor kind still does not auto-run it (defence in depth)', () => {
    const forged = { schemaVersion: 1, staleAfterSeconds: 60, rules: { 'world:speak': { enabled: true, threshold: 0.5 } } } as TrustSettings;
    expect(decide(suggestion({ command: 'say hi', kind: 'speak' }), forged, state(), NOW)).toMatchObject({ outcome: 'ask', reason: 'floor' });
  });

  it('a producer that labels a floor command as a move cannot loosen it: the classifier decides', () => {
    expect(decide(suggestion({ command: 'drop all', kind: 'move' }), MOVE_ON, state(), NOW)).toMatchObject({ outcome: 'ask', reason: 'floor', kind: 'spend-or-lose' });
  });

  it('a producer that labels a move as a floor kind makes it stricter, never looser', () => {
    expect(decide(suggestion({ command: 'north', kind: 'speak' }), MOVE_ON, state(), NOW)).toMatchObject({ outcome: 'ask', reason: 'floor', kind: 'speak' });
  });

  it('every floor kind is covered by a command above', () => {
    expect(new Set(floorCommands.map(([, kind]) => kind))).toEqual(new Set(FLOOR_KINDS));
  });

  it('PK never runs, even against a player the agent knows everything about', () => {
    const target: FightTarget = { kind: 'player', levelKnown: true, killable: true, reasonKnown: true };
    const result = decide(suggestion({ command: 'kill bob', kind: 'fight-start-known' }), MOVE_ON, state({ target }), NOW);
    expect(result).toMatchObject({ outcome: 'ask', reason: 'floor', kind: 'pk' });
  });
});

describe('decide: unknown commands and fights', () => {
  it('an unknown verb escalates, whatever its confidence and rules', () => {
    expect(decide(suggestion({ command: 'xyzzy', kind: 'move', confidence: 1 }), MOVE_ON, state(), NOW)).toMatchObject({
      outcome: 'escalate',
      reason: 'unknown-class',
      kind: 'unknown',
    });
  });

  it('a command line that could hide a second command escalates', () => {
    expect(decide(suggestion({ command: 'north;drop all' }), MOVE_ON, state(), NOW)).toMatchObject({ outcome: 'escalate', reason: 'unknown-class' });
  });

  it('an invalid claimed kind is read as unknown and asks at least as strictly', () => {
    expect(decide(suggestion({ kind: 'teleport' as ActionKind }), MOVE_ON, state(), NOW)).toMatchObject({ outcome: 'escalate', kind: 'unknown' });
  });

  it('a fight start against a target not fully known escalates, even with an enabled rule', () => {
    const settings = normalizeSettings({ rules: { 'fighting:fight-start-unknown': { enabled: true, threshold: 0.5 } } });
    for (const target of [undefined, { ...KNOWN_MOB, reasonKnown: false }, { ...KNOWN_MOB, levelKnown: false }, { ...KNOWN_MOB, killable: false }]) {
      const result = decide(suggestion({ sphere: 'fighting', command: 'kill goblin', kind: 'fight-start-known' }), settings, state({ target }), NOW);
      expect(result).toMatchObject({ outcome: 'escalate', reason: 'unknown-target', kind: 'fight-start-unknown' });
    }
  });

  it('a fight start against a fully known mob follows the rules like any other kind', () => {
    const settings = normalizeSettings({ rules: { 'fighting:fight-start-known': { enabled: true, threshold: 0.8 } } });
    const command = suggestion({ sphere: 'fighting', command: 'kill goblin', kind: 'fight-start-known', confidence: 0.9 });
    expect(decide(command, settings, state({ target: KNOWN_MOB }), NOW)).toMatchObject({ outcome: 'auto', ruleId: 'fighting:fight-start-known' });
    expect(decide(command, DEFAULT_SETTINGS as TrustSettings, state({ target: KNOWN_MOB }), NOW)).toMatchObject({ outcome: 'ask', reason: 'no-rule' });
  });

  it('continuing a fight is classified from the live fight state', () => {
    const settings = normalizeSettings({ rules: { 'fighting:fight-continue': { enabled: true, threshold: 0.8 } } });
    const command = suggestion({ sphere: 'fighting', command: 'bash', kind: 'fight-continue', confidence: 0.9 });
    expect(decide(command, settings, state({ game: liveGame(true) }), NOW)).toMatchObject({ outcome: 'auto', kind: 'fight-continue' });
    // the same command with no fight in the game is a fight start against an unknown target
    expect(decide(command, settings, state(), NOW)).toMatchObject({ outcome: 'escalate', reason: 'unknown-target' });
  });
});

describe('decide: missing and broken confidence (A1)', () => {
  it.each([null, NaN, undefined, -0.1, 1.2, '0.9', Infinity])('confidence %p asks, even with a rule and a long history', (confidence) => {
    const result = decide(suggestion({ confidence: confidence as never }), MOVE_ON, state(), NOW);
    expect(result).toMatchObject({ outcome: 'ask', reason: 'no-confidence' });
  });

  it('a model rating below the escalation level escalates as well as asking', () => {
    expect(ESCALATE_BELOW).toBe(0.3);
    expect(decide(suggestion({ confidence: 0.29 }), MOVE_ON, state(), NOW)).toMatchObject({ outcome: 'escalate', reason: 'very-low-confidence' });
    expect(decide(suggestion({ confidence: 0.3 }), MOVE_ON, state(), NOW)).toMatchObject({ outcome: 'ask', reason: 'below-threshold' });
  });

  it('escalates a very low rating even when every rule is off', () => {
    expect(decide(suggestion({ confidence: 0.1 }), DEFAULT_SETTINGS as TrustSettings, state(), NOW)).toMatchObject({ outcome: 'escalate' });
  });
});

describe('decide: a settings blob that is unreadable falls back to ask', () => {
  it.each([undefined, null, 'x', 5, [], { rules: 'all' }, { rules: { 'world:move': 'on' } }])('%p', (blob) => {
    expect(decide(suggestion(), normalizeSettings(blob), state(), NOW)).toMatchObject({ outcome: 'ask', reason: 'no-rule' });
  });
});

describe('decide: does not modify its inputs', () => {
  it('leaves the suggestion, the settings and the state as they were', () => {
    const s = suggestion();
    const st = state();
    const snapshot = JSON.stringify([s, MOVE_ON, st.game]);
    decide(s, MOVE_ON, st, NOW);
    expect(JSON.stringify([s, MOVE_ON, st.game])).toBe(snapshot);
  });
});
