import { renderHook, act } from '@testing-library/react';

import { useKtMatch } from './useKtMatch';
import type { WebSocketLike } from '../kt-socket';

/** DOM-free fake WebSocket the tests drive by hand. */
class FakeSocket implements WebSocketLike {
  sent: string[] = [];
  closed = false;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.onclose?.(undefined);
  }
  emitOpen(): void {
    this.onopen?.(undefined);
  }
  emitFrame(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  lastSent(): unknown {
    return JSON.parse(this.sent[this.sent.length - 1]);
  }
}

const state = { activeSide: 0 } as unknown;

function setup() {
  const sockets: FakeSocket[] = [];
  const factory = () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  };
  const hook = renderHook(() => useKtMatch(factory));
  return { hook, sockets, current: () => sockets[sockets.length - 1] };
}

describe('useKtMatch', () => {
  it('sends join on open, then tracks joined → snapshot → over frames', () => {
    const { hook, current } = setup();
    expect(hook.result.current.status).toBe('idle');

    act(() => hook.result.current.connect({ url: 'ws://t/ws/kt', matchId: 'duel-1', side: 0 }));
    expect(hook.result.current.status).toBe('connecting');

    act(() => current().emitOpen());
    expect(hook.result.current.status).toBe('open');
    expect(current().lastSent()).toEqual({ type: 'join', matchId: 'duel-1', side: 0 });

    act(() => current().emitFrame({ type: 'joined', matchId: 'duel-1', side: 0, state, protocol: 1 }));
    expect(hook.result.current.side).toBe(0);
    expect(hook.result.current.snapshot).toEqual(state);

    const next = { activeSide: 1 };
    act(() => current().emitFrame({ type: 'snapshot', matchId: 'duel-1', state: next }));
    expect(hook.result.current.snapshot).toEqual(next);

    act(() => current().emitFrame({ type: 'over', matchId: 'duel-1', state: next, winner: 0 }));
    expect(hook.result.current.over).toBe(true);
    expect(hook.result.current.winner).toBe(0);
  });

  it('submit sends a well-formed action while open, and not after over', () => {
    const { hook, current } = setup();
    act(() => hook.result.current.connect({ url: 'ws://t/ws/kt', matchId: 'duel-1', side: 0 }));
    act(() => current().emitOpen());

    const action = { type: 'move', tokenId: 'a', to: { x: 1, y: 1 } } as never;
    act(() => hook.result.current.submit(action));
    expect(current().lastSent()).toEqual({ type: 'action', matchId: 'duel-1', action });

    const before = current().sent.length;
    act(() => current().emitFrame({ type: 'over', matchId: 'duel-1', state, winner: 0 }));
    act(() => hook.result.current.submit(action)); // ignored — match is over
    expect(current().sent.length).toBe(before);
  });

  it('surfaces a server error frame', () => {
    const { hook, current } = setup();
    act(() => hook.result.current.connect({ url: 'ws://t/ws/kt', matchId: 'duel-1' }));
    act(() => current().emitOpen());
    act(() => current().emitFrame({ type: 'error', matchId: 'duel-1', message: 'seat taken' }));
    expect(hook.result.current.error).toBe('seat taken');
  });

  it('leave sends a leave frame and closes the socket', () => {
    const { hook, current } = setup();
    act(() => hook.result.current.connect({ url: 'ws://t/ws/kt', matchId: 'duel-1' }));
    act(() => current().emitOpen());
    const sock = current();
    act(() => hook.result.current.leave());
    expect(sock.lastSent()).toEqual({ type: 'leave', matchId: 'duel-1' });
    expect(sock.closed).toBe(true);
    expect(hook.result.current.status).toBe('idle');
  });

  it('unmount sends leave and closes', () => {
    const { hook, current } = setup();
    act(() => hook.result.current.connect({ url: 'ws://t/ws/kt', matchId: 'duel-1' }));
    act(() => current().emitOpen());
    const sock = current();
    hook.unmount();
    expect(sock.lastSent()).toEqual({ type: 'leave', matchId: 'duel-1' });
    expect(sock.closed).toBe(true);
  });

  it('ignores late frames from a superseded connection', () => {
    const { hook, sockets } = setup();
    act(() => hook.result.current.connect({ url: 'ws://t/ws/kt', matchId: 'duel-1' }));
    act(() => sockets[0].emitOpen());
    act(() => hook.result.current.connect({ url: 'ws://t/ws/kt', matchId: 'duel-2' }));
    act(() => sockets[1].emitOpen());
    // A late snapshot from the FIRST socket must not commit over the new connection.
    act(() => sockets[0].emitFrame({ type: 'snapshot', matchId: 'duel-1', state: { activeSide: 9 } }));
    expect(hook.result.current.snapshot).toBeNull();
  });
});
