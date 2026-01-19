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

      // ✅ new object ONLY when values changed
      store.snapshot = { timeOfDay: nextTime, remaining: nextRemaining };

      store.listeners.forEach((fn) => fn());
    },

    start() {
      if (!store.tickListenerAttached) {
        const onTick = (ev: Event) => {
          const ce = ev as CustomEvent<any>;
          const data = ce.detail ?? {};

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
        };

        ListenEvent<any>('shatteredarchive:write-terminal', (payload) => {
          console.log('tick received', {
            ...payload,
          });
          (store as any)._onTick = onTick;
          store.tickListenerAttached = true;
        });
      }

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

      if (store.tickListenerAttached) {
        const onTick = (store as any)._onTick as ((ev: Event) => void) | undefined;
        if (onTick) {
          window.removeEventListener('game:tick', onTick as EventListener);
          (store as any)._onTick = undefined;
        }
        store.tickListenerAttached = false;
      }
    },

    setDuration(sec: number) {
      const n = Math.round(Number(sec));
      if (!Number.isFinite(n) || n <= 0) return;
      if (n === store.state.durationSec) return;

      store.state.durationSec = n;

      // clamp current remaining into new duration
      const nextRemaining = clampInt(store.state.remaining, 0, n);

      // publish if remaining changed due to clamp (time unchanged)
      store.publishIfChanged(store.state.timeOfDay, nextRemaining);
    },

    getSnapshot() {
      // ✅ stable reference unless changed via publishIfChanged
      return store.snapshot;
    },

    subscribe(fn: () => void) {
      store.start();
      store.listeners.add(fn);
      return () => {
        store.listeners.delete(fn);
        // keep running; no auto-stop
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
