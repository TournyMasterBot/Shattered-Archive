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
};

type TickStore = {
  state: TickStoreState;
  listeners: Set<() => void>;
  intervalId: number | null;
  tickListenerAttached: boolean;

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
    },

    listeners: new Set(),
    intervalId: null,
    tickListenerAttached: false,

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

            store.state.lastTickAt = Date.now();

            // reset countdown
            const nextRemaining = store.state.durationSec;

            console.log('[tickStore] game:tick → reset countdown', {
              raw,
              lastTickAt: store.state.lastTickAt,
              durationSec: store.state.durationSec,
            });

            store.publishIfChanged(nextTime, nextRemaining);
          },
          { key: 'tickStore::event::game:tick' },
        );

        // store disposer on the singleton store instance
        (store as any)._disposeTick = disposeTick;
        store.tickListenerAttached = true;
      }

      // countdown interval
      if (store.intervalId == null) {
        store.intervalId = window.setInterval(() => {
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
