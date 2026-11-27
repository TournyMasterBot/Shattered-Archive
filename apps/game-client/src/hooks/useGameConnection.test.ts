import { act, renderHook } from '@testing-library/react';
import { DispatchEvent, ListenEvent } from '../features/event-emitter/event-dispatcher';
import { useGameConnection } from './useGameConnection';

/** A stand-in for the browser WebSocket that records what the client writes and lets the test play the server. */
class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  private handlers: Record<string, Array<(ev: unknown) => void>> = {};
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  addEventListener(type: string, fn: (ev: unknown) => void) {
    (this.handlers[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: (ev: unknown) => void) {
    this.handlers[type] = (this.handlers[type] ?? []).filter((h) => h !== fn);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  emit(type: string, ev: unknown = {}) {
    for (const h of [...(this.handlers[type] ?? [])]) h(ev);
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.emit('open');
  }
  server(message: object) {
    this.emit('message', { data: JSON.stringify(message) });
  }
}

const realSocket = global.WebSocket;
const stops: Array<() => void> = [];
let events: string[];
let echoes: string[];

beforeEach(() => {
  FakeSocket.instances = [];
  (global as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
  events = [];
  echoes = [];
  for (const name of ['game:remote-server:open', 'game:remote-server:close', 'game:remote-server:raw', 'game:socket-error']) {
    stops.push(ListenEvent(name, () => events.push(name), { key: `useGameConnection.test::${name}` }));
  }
  stops.push(
    ListenEvent<{ rawText: string }>('shatteredarchive:write-terminal', (p) => echoes.push(p.rawText), {
      key: 'useGameConnection.test::terminal',
    }),
  );
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  (global as unknown as { WebSocket: unknown }).WebSocket = realSocket;
});

const sendCommand = (cmd: string) => act(() => DispatchEvent('shatteredarchive:send-command', { cmd }));
const sentData = (socket: FakeSocket) => socket.sent.map((m) => JSON.parse(m)).filter((m) => m.type === 'data');

function connect() {
  const hook = renderHook(() => useGameConnection());
  act(() => hook.result.current.connect('simulacrum.shatteredarchive.dev', 65001));
  return hook;
}

describe('a command while there is no open socket', () => {
  it('is neither echoed nor sent before the socket opens, after it closes, or after a disconnect', () => {
    const { result, unmount } = connect();
    const socket = FakeSocket.instances[0];

    sendCommand('look');
    expect(echoes).toEqual([]);

    act(() => socket.open());
    sendCommand('look');
    expect(echoes).toHaveLength(1);
    expect(sentData(socket)).toEqual([{ type: 'data', data: 'look' }]);

    act(() => {
      socket.close();
      socket.emit('close');
    });
    sendCommand('score');
    expect(echoes).toHaveLength(1);
    expect(sentData(socket)).toHaveLength(1);

    act(() => result.current.disconnect());
    sendCommand('score');
    expect(echoes).toHaveLength(1);
    unmount();
  });
});

describe('events of a replaced socket', () => {
  it('are ignored, so the new connection stays up', () => {
    const { result, unmount } = connect();
    const first = FakeSocket.instances[0];
    act(() => first.open());
    act(() => result.current.connect('simulacrum.shatteredarchive.dev', 65001));
    const second = FakeSocket.instances[1];
    act(() => second.open());
    expect(result.current.isConnected).toBe(true);
    events.length = 0;

    // the old socket reports late
    act(() => {
      first.emit('close');
      first.emit('error');
      first.emit('open');
      first.server({ type: 'raw', data: 'stale\n\r' });
    });

    expect(events).toEqual([]);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.lastError).toBeNull();

    act(() => second.server({ type: 'raw', data: 'fresh\n\r' }));
    expect(events).toEqual(['game:remote-server:raw']);
    unmount();
  });

  it('still reports a close and an error of the current socket', () => {
    const { result, unmount } = connect();
    const socket = FakeSocket.instances[0];
    act(() => socket.open());
    events.length = 0;

    act(() => {
      socket.emit('error');
      socket.emit('close');
    });

    expect(events).toEqual(['game:socket-error', 'game:remote-server:close']);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.lastError).toBe('WebSocket error');
    unmount();
  });

  it('announces one close when the server ends the session, not a second one from the closed socket', () => {
    const { result, unmount } = connect();
    const socket = FakeSocket.instances[0];
    act(() => socket.open());
    events.length = 0;

    act(() => socket.server({ type: 'close', reason: 'bye' }));
    const afterServerClose = events.length;
    act(() => socket.emit('close'));

    expect(events).toHaveLength(afterServerClose);
    expect(result.current.isConnected).toBe(false);
    unmount();
  });
});
