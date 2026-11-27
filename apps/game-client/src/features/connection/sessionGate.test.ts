import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';

type Gate = typeof import('./sessionGate');

let gate: Gate;
let stop: () => void;

const open = (host = 'mud.example', port = 4000) => DispatchEvent('game:remote-server:open', { host, port });
const close = () => DispatchEvent('game:remote-server:close', {});
const loginData = () => DispatchEvent('game:character-login', { name: 'Testchar' });

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetModules();
  // a fresh module per test: the gate remembers which servers send login data
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  gate = require('./sessionGate') as Gate;
  stop = gate.startSessionGate();
});

afterEach(() => {
  stop();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('session states', () => {
  it('starts down, and goes live on the first connection to a server', () => {
    expect(gate.getSessionState()).toBe('down');
    open();
    expect(gate.getSessionState()).toBe('live');
  });

  it('waits for the login on a reconnect to a server that sent login data', () => {
    open();
    loginData();
    close();
    expect(gate.getSessionState()).toBe('down');

    open();
    expect(gate.getSessionState()).toBe('awaiting-login');
    loginData();
    expect(gate.getSessionState()).toBe('live');
  });

  it.each(['game:char-data', 'game:room-data'])('takes %s as proof the character is in the game', (name) => {
    open();
    DispatchEvent(name, {});
    close();
    open();
    expect(gate.getSessionState()).toBe('awaiting-login');

    DispatchEvent(name, {});
    expect(gate.getSessionState()).toBe('live');
  });

  it('goes straight to live on a reconnect when the server never sent login data', () => {
    open();
    close();
    open();
    expect(gate.getSessionState()).toBe('live');
  });

  it('remembers login data per host and port, ignoring the case of the host', () => {
    open('mud.example', 4000);
    loginData();
    close();

    open('mud.example', 4001);
    expect(gate.getSessionState()).toBe('live');
    close();

    open('other.example', 4000);
    expect(gate.getSessionState()).toBe('live');
    close();

    open('MUD.example', 4000);
    expect(gate.getSessionState()).toBe('awaiting-login');
  });

  it('treats an open event with no host or port as one server of its own', () => {
    DispatchEvent('game:remote-server:open', {});
    loginData();
    close();
    DispatchEvent('game:remote-server:open', {});
    expect(gate.getSessionState()).toBe('awaiting-login');
  });

  it('ignores game data that arrives while down', () => {
    open();
    close();
    loginData();
    expect(gate.getSessionState()).toBe('down');

    // and it did not count as the server sending login data
    open();
    expect(gate.getSessionState()).toBe('live');
  });

  it('tells subscribers once per change, however many closes arrive, until they unsubscribe', () => {
    const seen: string[] = [];
    const unsubscribe = gate.subscribeSession((c) => seen.push(`${c.previous}>${c.state}:${c.dropped}`));

    close();
    open();
    close();
    close();
    expect(seen).toEqual(['down>live:0', 'live>down:0']);

    unsubscribe();
    open();
    expect(seen).toHaveLength(2);
  });

  it('keeps telling the other subscribers when one of them throws', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const later = jest.fn();
    gate.subscribeSession(() => {
      throw new Error('boom');
    });
    gate.subscribeSession(later);

    open();

    expect(later).toHaveBeenCalledWith({ state: 'live', previous: 'down', dropped: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('listens under its own keys, so a listener on the default key of the same event still hears it', () => {
    const other = jest.fn();
    const off = ListenEvent('game:remote-server:open', other);
    open();
    expect(other).toHaveBeenCalledTimes(1);
    expect(gate.getSessionState()).toBe('live');
    off();
  });

  it('hears nothing after it is stopped', () => {
    stop();
    open();
    expect(gate.getSessionState()).toBe('down');
  });
});

describe('scheduleDroppable', () => {
  it('schedules nothing while there is no connection', () => {
    const fn = jest.fn();
    expect(gate.scheduleDroppable(fn, 100)).toBeNull();
    open();
    jest.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('runs after the delay while connected, also while waiting for the login', () => {
    open();
    loginData();
    close();
    open();
    expect(gate.getSessionState()).toBe('awaiting-login');

    const fn = jest.fn();
    gate.scheduleDroppable(fn, 100);
    jest.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancels what is waiting when the connection drops, and counts only that', () => {
    const changes: number[] = [];
    gate.subscribeSession((c) => c.state === 'down' && changes.push(c.dropped));
    open();

    const ran = jest.fn();
    const waiting = jest.fn();
    const cancelled = jest.fn();
    const dropped = jest.fn();
    gate.scheduleDroppable(ran, 10);
    gate.scheduleDroppable(waiting, 500, dropped);
    gate.scheduleDroppable(waiting, 600);
    gate.scheduleDroppable(cancelled, 500)?.();
    jest.advanceTimersByTime(10);

    close();
    expect(changes).toEqual([2]);
    expect(dropped).toHaveBeenCalledTimes(1);

    open();
    jest.advanceTimersByTime(10_000);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(waiting).not.toHaveBeenCalled();
    expect(cancelled).not.toHaveBeenCalled();
  });
});
