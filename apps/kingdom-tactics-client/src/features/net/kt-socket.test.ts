import { KtSocket, type WebSocketLike } from './kt-socket';
import type { KtServerMessage } from '@shatteredarchive/kingdom-tactics-engine';

/** A DOM-free fake WebSocket the tests drive by hand. */
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

  // test drivers
  emitOpen(): void {
    this.onopen?.(undefined);
  }
  emitFrame(data: unknown): void {
    this.onmessage?.({ data });
  }
}

function connect(handlers = {}) {
  let fake!: FakeSocket;
  const socket = new KtSocket('ws://test/ws/kt', handlers, (url) => {
    expect(url).toBe('ws://test/ws/kt');
    fake = new FakeSocket();
    return fake;
  });
  return { socket, fake };
}

const state = { activeSide: 0 } as unknown;

describe('KtSocket', () => {
  it('opens via the injected factory and starts connecting', () => {
    const { socket, fake } = connect();
    expect(fake).toBeTruthy();
    expect(socket.status).toBe('connecting');
  });

  it('flips to open and fires onOpen', () => {
    const onOpen = jest.fn();
    const { socket, fake } = connect({ onOpen });
    fake.emitOpen();
    expect(socket.status).toBe('open');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('serializes a join on send', () => {
    const { socket, fake } = connect();
    socket.send({ type: 'join', matchId: 'duel-1', side: 0 });
    expect(fake.sent).toHaveLength(1);
    expect(JSON.parse(fake.sent[0])).toEqual({ type: 'join', matchId: 'duel-1', side: 0 });
  });

  it('parses an incoming joined frame and dispatches it typed', () => {
    const received: KtServerMessage[] = [];
    const { fake } = connect({ onMessage: (m: KtServerMessage) => received.push(m) });
    const frame = { type: 'joined', matchId: 'duel-1', side: 0, state, protocol: 1 };
    fake.emitFrame(JSON.stringify(frame));
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(frame);
  });

  it('drops a garbage frame without throwing and surfaces onError', () => {
    const onMessage = jest.fn();
    const onError = jest.fn();
    const { fake } = connect({ onMessage, onError });
    expect(() => fake.emitFrame('{not json')).not.toThrow();
    expect(() => fake.emitFrame(JSON.stringify({ type: 'bogus' }))).not.toThrow();
    expect(onMessage).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('close() flips status and closes the underlying socket', () => {
    const { socket, fake } = connect();
    socket.close();
    expect(socket.status).toBe('closed');
    expect(fake.closed).toBe(true);
  });

  it('does not send once closed', () => {
    const { socket, fake } = connect();
    socket.close();
    socket.send({ type: 'leave', matchId: 'duel-1' });
    expect(fake.sent).toHaveLength(0);
  });
});
