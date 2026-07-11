// apps\game-client\src\features\tick\tickStore.ts
import { useSyncExternalStore } from 'react';
import { ListenEvent } from '../event-emitter/event-dispatcher';

const DEFAULT_TICK_DURATION = 41;

export type TickSnapshot = {
  timeOfDay: string;
  remaining: number;
};

type TickStoreState = {
  durationSec: number;
  lastTickAt: number | null;
  timeOfDay: string;
  remaining: number;
  connected: boolean;
};

type TickStore = {
  state: TickStoreState;
  listeners: Set<() => void>;
  intervalId: number | null;
  tickListenerAttached: boolean;
  connListenerAttached: boolean;

  // IMPORTANT: stable snapshot object reference
  snapshot: TickSnapshot;

  start: () => void;
  stop: () => void;
  setDuration: (sec: number) => void;

  // must return stable reference unless values changed
  getSnapshot: () => TickSnapshot;

  subscribe: (fn: () => void) => () => void;

  // internal helper to publish if something changed
  publishIfChanged: (nextTime: string, nextRemaining: number) => void;
};

const STORE_KEY = '__shatteredarchive_tick_store__';

function clampInt(n: number, min: number, max: number) {
  const x = Math.round(n);
  return Math.max(min, Math.min(max, x));
}

function createStore(): TickStore {
  const initial: TickSnapshot = {
    timeOfDay: '--:--',
    remaining: DEFAULT_TICK_DURATION,
  };

  const store: TickStore = {
    state: {
      durationSec: DEFAULT_TICK_DURATION,
      lastTickAt: null,
      timeOfDay: initial.timeOfDay,
      remaining: initial.remaining,
      connected: false,
    },

    listeners: new Set(),
    intervalId: null,
    tickListenerAttached: false,
    connListenerAttached: false,

    snapshot: initial,

    publishIfChanged(nextTime: string, nextRemaining: number) {
      const prev = store.snapshot;
      if (prev.timeOfDay === nextTime && prev.remaining === nextRemaining) return;

      store.state.timeOfDay = nextTime;
      store.state.remaining = nextRemaining;

      store.snapshot = { timeOfDay: nextTime, remaining: nextRemaining };
      store.listeners.forEach((fn) => fn());
    },

    start() {
      // attach ONE HMR-safe tick listener
      if (!store.tickListenerAttached) {
        const disposeTick = ListenEvent<any>(
          'game:tick',
          (payload) => {
            const data = payload ?? {};

            const raw = typeof data.time === 'string' ? data.time.trim() : '';
            const nextTime = raw || store.state.timeOfDay;

            // A tick can only arrive over a live connection — treat it as proof
            // of connectivity in case the open event fired before we subscribed.
            store.state.connected = true;
            store.state.lastTickAt = Date.now();

            // reset countdown
            const nextRemaining = store.state.durationSec;

            /* DEBUG
            console.log('[tickStore] game:tick → reset countdown', {
              raw,
              lastTickAt: store.state.lastTickAt,
              durationSec: store.state.durationSec,
            });
            */

            store.publishIfChanged(nextTime, nextRemaining);
          },
          { key: 'tickStore::event::game:tick' },
        );

        // store disposer on the singleton store instance
        (store as any)._disposeTick = disposeTick;
        store.tickListenerAttached = true;
      }

      // attach ONE HMR-safe connection listener pair so the countdown only
      // advances while a play-server connection is live. On disconnect we clear
      // the last-tick anchor and reset the display so nothing keeps ticking down.
      if (!store.connListenerAttached) {
        const disposeOpen = ListenEvent<any>(
          'game:remote-server:open',
          () => {
            store.state.connected = true;
          },
          { key: 'tickStore::event::remote-open' },
        );

        const disposeClose = ListenEvent<any>(
          'game:remote-server:close',
          () => {
            store.state.connected = false;
            store.state.lastTickAt = null;
            store.publishIfChanged('--:--', store.state.durationSec);
          },
          { key: 'tickStore::event::remote-close' },
        );

        (store as any)._disposeConn = () => {
          disposeOpen();
          disposeClose();
        };
        store.connListenerAttached = true;
      }

      // countdown interval
      if (store.intervalId == null) {
        store.intervalId = window.setInterval(() => {
          // Do not advance the countdown when there is no active connection.
          if (!store.state.connected) return;
          if (store.state.lastTickAt == null) return;

          const elapsedSec = (Date.now() - store.state.lastTickAt) / 1000;
          const next = store.state.durationSec - elapsedSec;
          const clamped = clampInt(next, 0, store.state.durationSec);

          if (clamped !== store.state.remaining) {
            store.publishIfChanged(store.state.timeOfDay, clamped);
          }
        }, 250);
      }
    },

    stop() {
      if (store.intervalId != null) {
        window.clearInterval(store.intervalId);
        store.intervalId = null;
      }

      // cleanly dispose the HMR-safe listener
      if (store.tickListenerAttached) {
        const disposeTick = (store as any)._disposeTick as undefined | (() => void);
        if (disposeTick) {
          try {
            disposeTick();
          } catch {
            // ignore
          }
        }

        (store as any)._disposeTick = undefined;
        store.tickListenerAttached = false;
      }

      // cleanly dispose the connection listeners
      if (store.connListenerAttached) {
        const disposeConn = (store as any)._disposeConn as undefined | (() => void);
        if (disposeConn) {
          try {
            disposeConn();
          } catch {
            // ignore
          }
        }

        (store as any)._disposeConn = undefined;
        store.connListenerAttached = false;
      }
    },

    setDuration(sec: number) {
      const n = Math.round(Number(sec));
      if (!Number.isFinite(n) || n <= 0) return;
      if (n === store.state.durationSec) return;

      store.state.durationSec = n;

      const nextRemaining = clampInt(store.state.remaining, 0, n);
      store.publishIfChanged(store.state.timeOfDay, nextRemaining);
    },

    getSnapshot() {
      return store.snapshot;
    },

    subscribe(fn: () => void) {
      store.start();
      store.listeners.add(fn);
      return () => {
        store.listeners.delete(fn);
      };
    },
  };

  return store;
}

function getStore(): TickStore {
  const g = globalThis as any;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = createStore();
  }
  return g[STORE_KEY] as TickStore;
}

/**
 * SAFE: can be used by many components without duplicated intervals/listeners.
 */
export function useTickData(durationSec: number = DEFAULT_TICK_DURATION): TickSnapshot {
  const store = getStore();

  // Important: only adjusts store when truly different (and publish is guarded)
  store.setDuration(durationSec);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
