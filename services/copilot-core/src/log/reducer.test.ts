import type { LogEvent, Vitals } from './events';
import { initialReducerState, MAX_PARTIAL_CHARS, reduceEvents, type FeedEvent, type ReducerState } from './reducer';
import { INITIAL_GAME_STATE, isStale, lastEventAge } from './state';

const raw = (at: number, data: string): LogEvent => ({ kind: 'raw', at, data });
const room = (at: number, name = 'Grassy plains', exits = ['N', 'E']): LogEvent => ({
  kind: 'room',
  at,
  room: name,
  sector: 'hills',
  exits,
});
const VITALS: Vitals = { hp: 100, maxHp: 100, mana: 50, maxMana: 50, move: 40, maxMove: 40 };
const char = (at: number, vitals: Vitals = VITALS, inFight?: boolean): LogEvent =>
  inFight === undefined ? { kind: 'char', at, vitals } : { kind: 'char', at, vitals, inFight };

function run(events: LogEvent[], state: ReducerState = initialReducerState()): { state: ReducerState; out: FeedEvent[] } {
  return reduceEvents(state, events);
}

describe('reduceEvents: raw fragments', () => {
  it('joins fragments split in the middle of a line and keeps the unfinished tail', () => {
    const first = run([raw(1, 'You see a do'), raw(2, 'or.\r\nA second li')]);
    expect(first.out).toEqual([{ type: 'lines', at: 2, lines: ['You see a door.'] }]);
    expect(first.state.partial).toBe('A second li');

    const second = run([raw(3, 'ne.\r\n')], first.state);
    expect(second.out).toEqual([{ type: 'lines', at: 3, lines: ['A second line.'] }]);
    expect(second.state.partial).toBe('');
  });

  it('keeps empty lines (blank lines separate paragraphs) and strips only the trailing carriage return', () => {
    const { out } = run([raw(1, 'one\r\n\r\ntwo\r\n')]);
    expect(out).toEqual([{ type: 'lines', at: 1, lines: ['one', '', 'two'] }]);
  });

  it('makes one batch of lines from consecutive raw events', () => {
    const { out } = run([raw(1, 'a\r\n'), raw(2, 'b\r\n'), raw(3, 'c\r\n')]);
    expect(out).toEqual([{ type: 'lines', at: 3, lines: ['a', 'b', 'c'] }]);
  });

  it('emits nothing for a fragment that has no line end yet', () => {
    const { out, state } = run([raw(1, 'partial')]);
    expect(out).toEqual([]);
    expect(state.partial).toBe('partial');
  });

  it('flushes an endless line instead of growing without bound', () => {
    const { out, state } = run([raw(1, 'x'.repeat(MAX_PARTIAL_CHARS + 5))]);
    expect(out).toHaveLength(1);
    expect(state.partial).toBe('');
  });
});

describe('reduceEvents: collapsing what the game repeats before every prompt', () => {
  it('turns 1,000 identical char_data events into one vitals event', () => {
    const events = Array.from({ length: 1000 }, (_, i) => char(i));
    const { out } = run(events);
    expect(out).toEqual([{ type: 'vitals', at: 0, vitals: VITALS, inFight: false }]);
  });

  it('emits a new vitals event when a value changes or the fight flag flips', () => {
    const { out } = run([char(1), char(2, { ...VITALS, hp: 90 }), char(3, { ...VITALS, hp: 90 }, true)]);
    expect(out.map((e) => e.type)).toEqual(['vitals', 'vitals', 'vitals']);
    expect(out[2]).toMatchObject({ inFight: true });
  });

  it('collapses an identical room_data and emits a change, including a return to an earlier room', () => {
    const { out } = run([room(1), room(2), room(3, 'Dark cave'), room(4, 'Grassy plains')]);
    expect(out.map((e) => (e.type === 'room' ? e.room : e.type))).toEqual(['Grassy plains', 'Dark cave', 'Grassy plains']);
  });

  it('treats the same room with different exits as a change (a door opened)', () => {
    const { out } = run([room(1, 'Hall', ['N']), room(2, 'Hall', ['N', 'S'])]);
    expect(out).toHaveLength(2);
  });

  it('drops tick events from the feed', () => {
    const { out } = run([{ kind: 'tick', at: 1, time: '3:30pm' }]);
    expect(out).toEqual([]);
  });
});

describe('reduceEvents: ordering', () => {
  it('puts a batch in timestamp order and keeps file order for equal times', () => {
    const { out } = run([raw(5, 'late\r\n'), room(1, 'Early room'), raw(3, 'middle\r\n'), raw(3, 'middle two\r\n')]);
    expect(out).toEqual([
      { type: 'room', at: 1, room: 'Early room', sector: 'hills', exits: ['N', 'E'] },
      { type: 'lines', at: 5, lines: ['middle', 'middle two', 'late'] },
    ]);
  });

  it('keeps lines that came before a room change ahead of the room event', () => {
    const { out } = run([raw(1, 'You walk north.\r\n'), room(2, 'New room'), raw(3, 'It is dark.\r\n')]);
    expect(out.map((e) => e.type)).toEqual(['lines', 'room', 'lines']);
  });
});

describe('reduceEvents: commands, login and the session', () => {
  it('keeps a command echo without its line end', () => {
    expect(run([{ kind: 'input', at: 1, data: 'look\r\n' }]).out).toEqual([{ type: 'command', at: 1, command: 'look' }]);
  });

  it('emits the login with the level when known and without it otherwise', () => {
    expect(run([{ kind: 'login', at: 1, name: 'Agate', level: 51 }]).out).toEqual([
      { type: 'login', at: 1, name: 'Agate', level: 51 },
    ]);
    expect(run([{ kind: 'login', at: 1, name: 'Agate' }]).out).toEqual([{ type: 'login', at: 1, name: 'Agate' }]);
  });

  it('announces the same room again after a connect or a close (a new session is a new view)', () => {
    const first = run([room(1)]);
    expect(run([room(2)], first.state).out).toEqual([]); // the repeat inside one session is still collapsed
    const closed = run([{ kind: 'closed', at: 3 }], first.state);
    const afterClose = run([room(4)], closed.state);
    expect(afterClose.out).toEqual([{ type: 'room', at: 4, room: 'Grassy plains', sector: 'hills', exits: ['N', 'E'] }]);
    const connected = run([{ kind: 'connect', at: 5 }], afterClose.state);
    expect(run([room(6)], connected.state).out).toEqual([{ type: 'room', at: 6, room: 'Grassy plains', sector: 'hills', exits: ['N', 'E'] }]);
  });

  it('marks connected on connect and drops an unfinished line from the previous session', () => {
    const before = run([raw(1, 'half a li')]);
    const { out, state } = run([{ kind: 'connect', at: 2 }], before.state);
    expect(out).toEqual([{ type: 'session', at: 2, state: 'connected' }]);
    expect(run([{ kind: 'connect', at: 3, target: 'dsl-mud.org:4000' }], before.state).out).toEqual([{ type: 'session', at: 3, state: 'connected', target: 'dsl-mud.org:4000' }]);
    expect(state.partial).toBe('');
    expect(state.game.connected).toBe(true);
  });

  it('marks closed on close, clears the fight flag and the unfinished line, and keeps the close code', () => {
    const fighting = run([{ kind: 'connect', at: 1 }, char(2, VITALS, true), raw(3, 'half')]);
    expect(fighting.state.game.inFight).toBe(true);
    const { out, state } = run([{ kind: 'closed', at: 4, code: 1001 }], fighting.state);
    expect(out).toEqual([{ type: 'session', at: 4, state: 'closed', code: 1001 }]);
    expect(state.game).toMatchObject({ connected: false, inFight: false });
    expect(state.partial).toBe('');
  });

  it('emits closed without a code when the log has none', () => {
    expect(run([{ kind: 'closed', at: 1 }]).out).toEqual([{ type: 'session', at: 1, state: 'closed' }]);
  });
});

describe('reduceEvents: game state', () => {
  it('records the room, vitals and fight state', () => {
    const { state } = run([room(1), char(2, VITALS, true)]);
    expect(state.game.room).toEqual({ name: 'Grassy plains', sector: 'hills', exits: ['N', 'E'] });
    expect(state.game.vitals).toEqual(VITALS);
    expect(state.game.inFight).toBe(true);
  });

  it('keeps the fight state when char_data does not say', () => {
    const first = run([char(1, VITALS, true)]);
    expect(run([char(2, { ...VITALS, hp: 5 })], first.state).state.game.inFight).toBe(true);
  });

  it('does not modify the state it was given', () => {
    const start = initialReducerState();
    const snapshot = JSON.stringify(start);
    run([raw(1, 'x\r\ny'), room(2), char(3)], start);
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it('never moves the clocks backwards when an old event arrives in a later batch', () => {
    const first = run([raw(100, 'a\r\n')]);
    const second = run([raw(50, 'b\r\n')], first.state);
    expect(second.state.game.lastTextAt).toBe(100);
    expect(second.state.game.lastEventAt).toBe(100);
  });

  it('ignores an empty batch', () => {
    const { out, state } = run([]);
    expect(out).toEqual([]);
    expect(state).toEqual(initialReducerState());
  });
});

describe('isStale (T2 / LOGTAIL-02)', () => {
  it('is stale when nothing has ever been seen', () => {
    expect(isStale(INITIAL_GAME_STATE, 1_000_000, 60_000)).toBe(true);
  });

  it('turns stale after the limit with no events, and is live again after the next text event', () => {
    const { state } = run([raw(1_000, 'a\r\n')]);
    expect(isStale(state.game, 1_000 + 60_000, 60_000)).toBe(false); // exactly at the limit is still live
    expect(isStale(state.game, 1_000 + 60_001, 60_000)).toBe(true);
    const again = run([raw(70_000, 'b\r\n')], state);
    expect(isStale(again.state.game, 70_000 + 1, 60_000)).toBe(false);
  });

  it('a command echo and a connect count as live text', () => {
    expect(isStale(run([{ kind: 'input', at: 5, data: 'look' }]).state.game, 6, 60_000)).toBe(false);
    expect(isStale(run([{ kind: 'connect', at: 5 }]).state.game, 6, 60_000)).toBe(false);
  });

  it('GMCP-only traffic (the SOH gate closed the text) does not keep the state live', () => {
    const { state } = run([raw(1_000, 'a\r\n'), room(100_000), char(100_001)]);
    expect(state.game.lastEventAt).toBe(100_001);
    expect(isStale(state.game, 100_002, 60_000)).toBe(true);
  });

  it('is not stale when the clock is behind the last event (skew)', () => {
    const { state } = run([raw(10_000, 'a\r\n')]);
    expect(isStale(state.game, 5_000, 60_000)).toBe(false);
  });
});

describe('lastEventAge', () => {
  it('is undefined with no events, the age otherwise, and never negative', () => {
    expect(lastEventAge(INITIAL_GAME_STATE, 100)).toBeUndefined();
    const { state } = run([{ kind: 'tick', at: 1_000, time: '1pm' }]);
    expect(lastEventAge(state.game, 4_000)).toBe(3_000);
    expect(lastEventAge(state.game, 500)).toBe(0);
  });
});
