import { ListenEvent } from '../event-emitter/event-dispatcher';
import { isSimulacrumConnection, readAdditions, type Additions, type ReadableStorage } from './connectionGate';

/** What the rest of the feature may know about the connection. */
export interface ConnectionState {
  /** A socket to some game server is open. */
  connected: boolean;
  host?: string;
  port?: number;
  /** The socket is open AND its host and port are accepted: the only state in which anything is captured or sent. */
  active: boolean;
}

export interface ConnectionRuntime {
  /** The same object until something changes, so `useSyncExternalStore` can compare snapshots by identity. */
  getState(): ConnectionState;
  subscribe(listener: () => void): () => void;
  /** Runs when the connection stops being active (closed, or moved to another host). Returns the remover. */
  onDeactivate(callback: () => void): () => void;
  /** Removes every listener this runtime registered. */
  dispose(): void;
}

export interface ConnectionRuntimeOptions {
  /** Read on every open event, so an edit to the stored additions applies to the next connection. */
  additions?: () => Additions;
  storage?: ReadableStorage;
}

interface SocketPayload {
  host?: unknown;
  port?: unknown;
}

// Each key is unique to this feature: the shared dispatcher keeps ONE listener per key, so the default key (`<event>::event`) would
// replace a listener the app already registered for the same event (plan amendment A1, E26).
export const KEY_OPEN = 'simulacrumAdmin::connection-open';
export const KEY_CLOSE = 'simulacrumAdmin::connection-close';

const INACTIVE: ConnectionState = Object.freeze({ connected: false, active: false }) as ConnectionState;

/**
 * Follows `game:remote-server:open` / `game:remote-server:close` (emitted by `hooks/useGameConnection.ts`) and decides whether the client
 * is on the simulacrum. The connection leaving the accepted set runs the deactivate callbacks, which clear the buffers (E2). The live DSL
 * game is never active, so nothing from it is stored or sent (E3).
 */
export function createConnectionRuntime(options: ConnectionRuntimeOptions = {}): ConnectionRuntime {
  const readExtra = options.additions ?? (() => readAdditions(options.storage));
  let state: ConnectionState = INACTIVE;
  const listeners = new Set<() => void>();
  const deactivateCallbacks = new Set<() => void>();

  const set = (next: ConnectionState): void => {
    if (next === state) return; // already there: nobody needs to hear about it
    const wasActive = state.active;
    state = next;
    if (wasActive && !next.active) {
      for (const callback of [...deactivateCallbacks]) callback();
    }
    for (const listener of [...listeners]) listener();
  };

  const stopOpen = ListenEvent<SocketPayload>(
    'game:remote-server:open',
    (payload) => {
      const host = typeof payload?.host === 'string' ? payload.host : undefined;
      const port = typeof payload?.port === 'number' ? payload.port : undefined;
      set({ connected: true, host, port, active: isSimulacrumConnection(host, port, readExtra()) });
    },
    { key: KEY_OPEN },
  );
  const stopClose = ListenEvent<SocketPayload>('game:remote-server:close', () => set(INACTIVE), { key: KEY_CLOSE });

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onDeactivate(callback) {
      deactivateCallbacks.add(callback);
      return () => deactivateCallbacks.delete(callback);
    },
    dispose() {
      stopOpen();
      stopClose();
      listeners.clear();
      deactivateCallbacks.clear();
    },
  };
}
