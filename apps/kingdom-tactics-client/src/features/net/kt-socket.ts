import {
  parseKtServerMessage,
  type KtClientMessage,
  type KtServerMessage,
} from '@shatteredarchive/kingdom-tactics-engine';

/**
 * The minimal surface of a WebSocket that {@link KtSocket} needs. jsdom has no `WebSocket`,
 * so tests inject a fake that implements this instead of the DOM type — no browser required.
 */
export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export type KtSocketStatus = 'connecting' | 'open' | 'closed';

/** Handlers the owner (the `useKtMatch` hook) registers on a socket. All optional. */
export interface KtSocketHandlers {
  onMessage?: (msg: KtServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  /** Fired on a transport error OR an unparseable frame (the bad frame is dropped, not thrown). */
  onError?: (err: unknown) => void;
}

/** Opens a `WebSocketLike`. Defaults to a real browser `WebSocket`; tests pass a fake factory. */
export type SocketFactory = (url: string) => WebSocketLike;

const defaultFactory: SocketFactory = (url) => new WebSocket(url) as unknown as WebSocketLike;

/**
 * A thin client transport for the `/ws/kt` protocol. It owns one `WebSocketLike`, serializes
 * outgoing {@link KtClientMessage}s, and validates every incoming frame with the engine's
 * `parseKtServerMessage` before dispatching — a malformed frame is dropped (surfaced via
 * `onError`), never thrown. No auto-reconnect in v1: a closed socket stays closed and the owner
 * decides whether to reconnect. All match rules stay server-side; this only moves bytes.
 */
export class KtSocket {
  private readonly ws: WebSocketLike;
  private _status: KtSocketStatus = 'connecting';

  constructor(
    url: string,
    private readonly handlers: KtSocketHandlers = {},
    open: SocketFactory = defaultFactory,
  ) {
    this.ws = open(url);
    this.ws.onopen = () => {
      this._status = 'open';
      this.handlers.onOpen?.();
    };
    this.ws.onclose = () => {
      this._status = 'closed';
      this.handlers.onClose?.();
    };
    this.ws.onerror = (err) => this.handlers.onError?.(err);
    this.ws.onmessage = (ev) => this.receive(ev.data);
  }

  get status(): KtSocketStatus {
    return this._status;
  }

  /** Serialize and send a client message. No-op if the socket is already closed. */
  send(msg: KtClientMessage): void {
    if (this._status === 'closed') return;
    this.ws.send(JSON.stringify(msg));
  }

  /** Close the underlying socket; flips status to `closed` immediately. */
  close(): void {
    this._status = 'closed';
    this.ws.close();
  }

  private receive(data: unknown): void {
    if (typeof data !== 'string') {
      this.handlers.onError?.(new Error('non-string frame'));
      return;
    }
    const msg = parseKtServerMessage(data);
    if (msg === null) {
      this.handlers.onError?.(new Error('unparseable server frame'));
      return;
    }
    this.handlers.onMessage?.(msg);
  }
}
