import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';
import { DEFAULT_HOSTS, DEFAULT_PORTS } from './connectionGate';
import { createConnectionRuntime, type ConnectionRuntime } from './runtime';

const SIM_HOST = DEFAULT_HOSTS[1];
const SIM_PORT = DEFAULT_PORTS[0];
const open = (host: unknown, port: unknown): void =>
  DispatchEvent('game:remote-server:open', { type: 'socket-opened', host, port, receivedTimestamp: 'x' });
const close = (): void => DispatchEvent('game:remote-server:close', { type: 'socket-closed', payload: {} });

describe('createConnectionRuntime', () => {
  const runtimes: ConnectionRuntime[] = [];
  const make = (...args: Parameters<typeof createConnectionRuntime>): ConnectionRuntime => {
    const runtime = createConnectionRuntime(...args);
    runtimes.push(runtime);
    return runtime;
  };
  afterEach(() => {
    for (const runtime of runtimes.splice(0)) runtime.dispose();
  });

  it('starts inactive and not connected', () => {
    expect(make().getState()).toEqual({ connected: false, active: false });
  });

  it('becomes active when the socket opens on an accepted host and port', () => {
    const runtime = make();
    open(SIM_HOST, SIM_PORT);
    expect(runtime.getState()).toEqual({ connected: true, host: SIM_HOST, port: SIM_PORT, active: true });
  });

  it('stays inactive on the live DSL game while still reporting that a socket is open (E3)', () => {
    const runtime = make();
    open('dsl-mud.org', 4000);
    expect(runtime.getState()).toEqual({ connected: true, host: 'dsl-mud.org', port: 4000, active: false });
  });

  it('is inactive when the event carries no usable host or port', () => {
    const runtime = make();
    open(undefined, undefined);
    expect(runtime.getState().active).toBe(false);
    open(SIM_HOST, String(SIM_PORT));
    expect(runtime.getState().active).toBe(false);
  });

  it('uses the stored additions on every open event, so an edit applies to the next connection', () => {
    let extra: { hosts: string[]; ports: number[] } = { hosts: [], ports: [] };
    const runtime = make({ additions: () => extra });
    open('localhost', SIM_PORT);
    expect(runtime.getState().active).toBe(false);
    extra = { hosts: ['localhost'], ports: [] };
    open('localhost', SIM_PORT);
    expect(runtime.getState().active).toBe(true);
  });

  it('reads the additions from the storage it is given', () => {
    const storage = { getItem: () => JSON.stringify({ hosts: ['localhost'], ports: [65099] }) };
    const runtime = make({ storage });
    open('localhost', 65099);
    expect(runtime.getState().active).toBe(true);
  });

  it('runs the deactivate callbacks once when the socket closes while active, and clears nothing when it was not active (E2)', () => {
    const runtime = make();
    const cleared = jest.fn();
    runtime.onDeactivate(cleared);

    open('dsl-mud.org', 4000);
    close();
    expect(cleared).not.toHaveBeenCalled();

    open(SIM_HOST, SIM_PORT);
    close();
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(runtime.getState()).toEqual({ connected: false, active: false });

    close(); // already inactive
    expect(cleared).toHaveBeenCalledTimes(1);
  });

  it('runs the deactivate callbacks when a new connection moves from the simulacrum to another host (E2)', () => {
    const runtime = make();
    const cleared = jest.fn();
    runtime.onDeactivate(cleared);
    open(SIM_HOST, SIM_PORT);
    open('dsl-mud.org', 4000);
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(runtime.getState().active).toBe(false);
  });

  it('does not run a removed deactivate callback', () => {
    const runtime = make();
    const cleared = jest.fn();
    const remove = runtime.onDeactivate(cleared);
    remove();
    open(SIM_HOST, SIM_PORT);
    close();
    expect(cleared).not.toHaveBeenCalled();
  });

  it('keeps the same state object until something changes, and notifies subscribers on each change', () => {
    const runtime = make();
    const heard = jest.fn();
    const stop = runtime.subscribe(heard);
    const before = runtime.getState();
    expect(runtime.getState()).toBe(before);
    close(); // already inactive and unconnected: no change
    expect(heard).not.toHaveBeenCalled();
    expect(runtime.getState()).toBe(before);

    open(SIM_HOST, SIM_PORT);
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    close();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('dispose removes its listeners: later events change nothing and call nothing', () => {
    const runtime = make();
    const heard = jest.fn();
    const cleared = jest.fn();
    runtime.subscribe(heard);
    runtime.onDeactivate(cleared);
    open(SIM_HOST, SIM_PORT);
    heard.mockClear();

    runtime.dispose();
    close();
    open(SIM_HOST, SIM_PORT);
    expect(heard).not.toHaveBeenCalled();
    expect(cleared).not.toHaveBeenCalled();
    expect(runtime.getState().active).toBe(true); // frozen where it was: nothing updates it any more
  });

  describe('sharing the event bus with the app (E26)', () => {
    it('does not replace a listener the app registered for the same events with the default key', () => {
      const appOpen = jest.fn();
      const appClose = jest.fn();
      const stopApp = [ListenEvent('game:remote-server:open', appOpen), ListenEvent('game:remote-server:close', appClose)];
      try {
        const runtime = make();
        open(SIM_HOST, SIM_PORT);
        close();
        expect(appOpen).toHaveBeenCalledTimes(1);
        expect(appClose).toHaveBeenCalledTimes(1);
        expect(runtime.getState().connected).toBe(false); // ours heard the close too
      } finally {
        stopApp.forEach((stop) => stop());
      }
    });

    it('is not replaced by a listener the app registers afterwards with the default key', () => {
      const runtime = make();
      const appOpen = jest.fn();
      const stopApp = ListenEvent('game:remote-server:open', appOpen);
      try {
        open(SIM_HOST, SIM_PORT);
        expect(appOpen).toHaveBeenCalledTimes(1);
        expect(runtime.getState().active).toBe(true);
      } finally {
        stopApp();
      }
    });

    it('disposing it leaves the app listener working', () => {
      const appOpen = jest.fn();
      const stopApp = ListenEvent('game:remote-server:open', appOpen);
      try {
        const runtime = make();
        runtime.dispose();
        open(SIM_HOST, SIM_PORT);
        expect(appOpen).toHaveBeenCalledTimes(1);
      } finally {
        stopApp();
      }
    });
  });
});
