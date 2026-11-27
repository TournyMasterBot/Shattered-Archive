// apps/game-client/src/features/connection/sessionGate.ts
//
// Whether the game session can be acted on. Timers and delayed commands ask here, so nothing fires into a
// dropped connection or at the login prompt of the next one.
//
//   down            no connection (also before the first connect)
//   awaiting-login  connected again to a server that has sent login data; the character is not in the game yet
//   live            timers may run
//
// A server that has never sent login data (GMCP off) goes straight to live on connect.
import { ListenEvent } from '../event-emitter/event-dispatcher';

export type SessionState = 'down' | 'awaiting-login' | 'live';

export interface SessionChange {
  state: SessionState;
  previous: SessionState;
  /** Delayed commands cancelled by this change; only a change to `down` cancels any. */
  dropped: number;
}

type SessionListener = (change: SessionChange) => void;
type OpenPayload = { host?: string; port?: number };

// What proves the character is in the game: login data, then the data that precedes every prompt.
const IN_GAME_EVENTS = ['game:character-login', 'game:char-data', 'game:room-data'] as const;

let state: SessionState = 'down';
let server = '';
const serversWithLoginData = new Set<string>();
const listeners = new Set<SessionListener>();
const pending = new Map<ReturnType<typeof setTimeout>, (() => void) | undefined>();

function setState(next: SessionState, dropped = 0): void {
  if (next === state) return;

  const change: SessionChange = { state: next, previous: state, dropped };
  state = next;

  for (const listener of [...listeners]) {
    try {
      listener(change);
    } catch {
      console.warn('[sessionGate] a session listener failed');
    }
  }
}

function onOpen(payload: OpenPayload | undefined): void {
  server = `${String(payload?.host ?? '').toLowerCase()}:${payload?.port ?? ''}`;
  setState(serversWithLoginData.has(server) ? 'awaiting-login' : 'live');
}

function onInGame(): void {
  if (state === 'down') return;

  serversWithLoginData.add(server);
  setState('live');
}

function onClose(): void {
  if (state === 'down') return;

  const dropped = pending.size;
  for (const [timer, onDrop] of pending) {
    clearTimeout(timer);
    onDrop?.();
  }
  pending.clear();

  setState('down', dropped);
}

/**
 * Listen to the connection. Call it before anything else subscribes to the connection events, so that a
 * script reacting to the open already sees an open session. Calling it again replaces the same listeners.
 */
export function startSessionGate(): () => void {
  const stops = [
    ListenEvent<OpenPayload>('game:remote-server:open', onOpen, { key: 'sessionGate::open' }),
    ListenEvent('game:remote-server:close', onClose, { key: 'sessionGate::close' }),
    ...IN_GAME_EVENTS.map((name) => ListenEvent(name, onInGame, { key: `sessionGate::${name}` })),
  ];

  return () => {
    for (const stop of stops) stop();
  };
}

export function getSessionState(): SessionState {
  return state;
}

export function subscribeSession(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A one-off delayed action that a dropped connection cancels (`onDrop` is then called instead).
 * Returns a cancel function, or null when there is no connection and nothing was scheduled.
 */
export function scheduleDroppable(fn: () => void, delayMs: number, onDrop?: () => void): (() => void) | null {
  if (state === 'down') return null;

  const timer = setTimeout(() => {
    pending.delete(timer);
    fn();
  }, delayMs);
  pending.set(timer, onDrop);

  return () => {
    clearTimeout(timer);
    pending.delete(timer);
  };
}
