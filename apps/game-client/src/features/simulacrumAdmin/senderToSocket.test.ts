import { act, renderHook } from '@testing-library/react';
import { useGameConnection } from '../../hooks/useGameConnection';
import { createActivityLog } from './activityLog';
import { createReplyCollector } from './replyCollector';
import { createSender } from './sender';

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
  serverRaw(data: string) {
    this.emit('message', { data: JSON.stringify({ type: 'raw', data }) });
  }
}

describe('the sender through the real connection hook (E5)', () => {
  const realSocket = global.WebSocket;
  beforeEach(() => {
    jest.useFakeTimers();
    FakeSocket.instances = [];
    (global as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
  });
  afterEach(() => {
    (global as unknown as { WebSocket: unknown }).WebSocket = realSocket;
    jest.useRealTimers();
  });

  it('writes the exact built line as a data message and judges the reply that comes back', async () => {
    const { result, unmount } = renderHook(() => useGameConnection());
    act(() => result.current.connect('simulacrum.shatteredarchive.dev', 65001));
    const socket = FakeSocket.instances[0];
    act(() => socket.open());

    const collector = createReplyCollector();
    const activity = createActivityLog();
    const sender = createSender({ isActive: () => true, collector, activity });

    const pending = sender.run('transfer', 'run', { target: 'Testchar', where: '3001' });
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(socket.sent.map((m) => JSON.parse(m))).toEqual([
      { type: 'connect', host: 'simulacrum.shatteredarchive.dev', port: 65001 },
      { type: 'data', data: 'transfer Testchar 3001' },
    ]);

    act(() => socket.serverRaw('Ok.\n\r'));
    act(() => {
      jest.advanceTimersByTime(600);
    });
    const outcome = await pending;
    expect(outcome.status === 'sent' && outcome.entry).toEqual(expect.objectContaining({ line: 'transfer Testchar 3001', verdict: 'accepted' }));

    collector.dispose();
    unmount();
  });
});
