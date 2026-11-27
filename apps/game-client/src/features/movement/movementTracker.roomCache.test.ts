// The app-scope movement tracker (bound once): it keeps the shared current-room cache, so a window opened later (the map) knows where the player
// stands even when no HUD widget that used to fill the cache is on screen; and the same bound listeners still decide every typed move.
import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';
import { __resetForTests, getRoomData } from '../room/roomDataStore';
import { movementTracker } from './movementTracker';

type Seen = { name: string; payload: Record<string, unknown> };

describe('movementTracker, bound', () => {
  let unbind: () => void;
  let seen: Seen[];
  let stop: (() => void)[];

  beforeEach(() => {
    jest.useFakeTimers();
    __resetForTests();
    seen = [];
    stop = ['attempt', 'succeeded', 'failed'].map((kind) =>
      ListenEvent<Record<string, unknown>>(`shatteredarchive:movement-${kind}`, (payload) => void seen.push({ name: kind, payload: payload ?? {} }), { key: `test::${kind}` }),
    );
    unbind = movementTracker.bind();
  });
  afterEach(() => {
    unbind();
    stop.forEach((off) => off());
    jest.useRealTimers();
  });

  it('keeps the room of every game:room-data in the shared cache, with no HUD widget listening', () => {
    expect(getRoomData()).toBeNull();
    DispatchEvent('game:room-data', { room: 'The House of Arms', sector: 'inside', exits: ['S'] });
    expect(getRoomData()).toEqual({ room: 'The House of Arms', sector: 'inside', exits: ['S'] });
    DispatchEvent('game:room-data', { room: 'The Hall', sector: 'inside', exits: ['N', 'S'] });
    expect(getRoomData()?.room).toBe('The Hall');
  });

  it('stores an empty payload as an empty room (the map then waits for a real one) and stops when unbound', () => {
    DispatchEvent('game:room-data', null as unknown as object);
    expect(getRoomData()).toEqual({});
    unbind();
    DispatchEvent('game:room-data', { room: 'After unbind' });
    expect(getRoomData()).toEqual({});
    unbind = movementTracker.bind();
  });

  it('still decides a typed move: attempt, then success when the room changes', () => {
    DispatchEvent('game:room-data', { room: 'A', sector: 'city', exits: ['N'] });
    DispatchEvent('shatteredarchive:command-sent', { text: 'n' });
    expect(seen.map((s) => s.name)).toEqual(['attempt']);
    expect(movementTracker.pendingCount()).toBe(1);
    DispatchEvent('game:room-data', { room: 'B', sector: 'city', exits: ['S'] });
    expect(seen.map((s) => s.name)).toEqual(['attempt', 'succeeded']);
    expect(seen[1].payload).toMatchObject({ cmd: 'n', room: { room: 'B' } });
    expect(movementTracker.pendingCount()).toBe(0);
  });

  it('ignores a command that is not a move, and a payload with no text', () => {
    DispatchEvent('shatteredarchive:command-sent', { text: 'look' });
    DispatchEvent('shatteredarchive:command-sent', null as unknown as object);
    expect(seen).toEqual([]);
    expect(movementTracker.pendingCount()).toBe(0);
  });

  it('fails a move when the game says it cannot be done (a line read from the raw text)', () => {
    DispatchEvent('shatteredarchive:command-sent', { text: 'n' });
    DispatchEvent('shatteredarchive:raw-data', { text: 'Alas, you cannot go that way.\r\n' });
    expect(seen.map((s) => s.name)).toEqual(['attempt', 'failed']);
    expect(seen[1].payload).toMatchObject({ cmd: 'n', reasonLine: 'Alas, you cannot go that way.' });
    DispatchEvent('shatteredarchive:raw-data', null as unknown as object); // nothing pending, nothing to do
    expect(seen).toHaveLength(2);
  });

  it('fails a move nothing answered, after the head-of-queue window, as a timeout', () => {
    DispatchEvent('shatteredarchive:command-sent', { text: 'e' });
    jest.advanceTimersByTime(10_000);
    expect(seen.map((s) => s.name)).toEqual(['attempt', 'failed']);
    expect(seen[1].payload).toMatchObject({ reasonLine: '(timeout)' });
    expect(movementTracker.pendingCount()).toBe(0);
  });

  it('forgets what is pending when unbound, stops its timer, and a second bind is a no-op until then', () => {
    DispatchEvent('shatteredarchive:command-sent', { text: 's' });
    expect(movementTracker.pendingCount()).toBe(1);
    const second = movementTracker.bind(); // already bound: does nothing
    second();
    expect(movementTracker.pendingCount()).toBe(1);
    unbind();
    expect(movementTracker.pendingCount()).toBe(0);
    jest.advanceTimersByTime(10_000);
    expect(seen.map((s) => s.name)).toEqual(['attempt']); // no timeout fires after the unbind
    unbind = movementTracker.bind();
  });
});
