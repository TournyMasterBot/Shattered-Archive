import React from 'react';
import { fetchAreas, fetchRooms, type FetchLike, type WorldArea, type WorldResult, type WorldRoom } from './worldApi';

export type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T; at: number }
  | { status: 'offline' | 'error'; message: string };

export interface WorldIndex {
  areas: LoadState<WorldArea[]>;
  /** The rooms of the areas that were opened, by file. */
  rooms: ReadonlyMap<string, LoadState<WorldRoom[]>>;
  /** Fetches one area's rooms unless they are loaded or loading (the session cache). */
  loadRooms(file: string): void;
  /** Fetches one area's rooms again (after a failure, or when the game's world changed). */
  reloadRooms(file: string): void;
  /** Forgets everything and reads the area list again. */
  refresh(): void;
}

interface Options {
  base: string;
  /** The index is read only while something shows it; nothing is requested for a window that never opens the World tab. */
  active: boolean;
  fetchImpl?: FetchLike;
}

const LOADING = { status: 'loading' } as const;

const fromResult = <T>(result: WorldResult<T>): LoadState<T> | undefined => {
  if (result.ok) return { status: 'ready', data: result.data, at: result.at };
  if (result.kind === 'aborted') return undefined; // superseded or unmounted: the newer state stands
  return { status: result.kind, message: result.message };
};

/**
 * Lazily loads the area list, then each area's rooms on demand, and keeps them for the life of the window. Every request takes an
 * `AbortSignal`; unmounting or refreshing aborts the ones still running, so nothing is left pending and no state is set afterwards
 * (typescript.md, async and state).
 */
export function useWorldIndex({ base, active, fetchImpl }: Options): WorldIndex {
  const [areas, setAreas] = React.useState<LoadState<WorldArea[]>>({ status: 'idle' });
  const [rooms, setRooms] = React.useState<ReadonlyMap<string, LoadState<WorldRoom[]>>>(() => new Map());
  const controllers = React.useRef(new Set<AbortController>());
  const roomsRef = React.useRef(rooms);
  const started = React.useRef(false);
  React.useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  const start = React.useCallback((): AbortController => {
    const controller = new AbortController();
    controllers.current.add(controller);
    return controller;
  }, []);
  const finish = React.useCallback((controller: AbortController): void => {
    controllers.current.delete(controller);
  }, []);

  /** Starts the area request; the caller decides whether to show 'loading' (an effect must not set state in its body). */
  const requestAreas = React.useCallback((): void => {
    const controller = start();
    void fetchAreas(base, controller.signal, fetchImpl).then((result) => {
      finish(controller);
      const next = fromResult(result);
      if (next) setAreas(next);
    });
  }, [base, fetchImpl, start, finish]);

  const fetchOne = React.useCallback(
    (file: string): void => {
      const controller = start();
      setRooms((all) => new Map(all).set(file, { status: 'loading' }));
      void fetchRooms(base, file, controller.signal, fetchImpl).then((result) => {
        finish(controller);
        const next = fromResult(result);
        if (next) setRooms((all) => new Map(all).set(file, next));
      });
    },
    [base, fetchImpl, start, finish],
  );

  // the first time something shows the index, read the areas; 'loading' is derived below, so no state is set in this effect
  React.useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    requestAreas();
  }, [active, requestAreas]);

  // leaving the page: abort what is still running
  React.useEffect(() => {
    const running = controllers.current;
    return () => {
      for (const controller of running) controller.abort();
      running.clear();
      started.current = false; // a remount (React strict mode runs the effects twice) reads the areas again
    };
  }, []);

  const loadRooms = React.useCallback(
    (file: string): void => {
      const known = roomsRef.current.get(file);
      if (known && known.status !== 'offline' && known.status !== 'error') return;
      fetchOne(file);
    },
    [fetchOne],
  );

  const refresh = React.useCallback((): void => {
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear();
    setRooms(new Map());
    setAreas({ status: 'loading' });
    requestAreas();
  }, [requestAreas]);

  return { areas: active && areas.status === 'idle' ? LOADING : areas, rooms, loadRooms, reloadRooms: fetchOne, refresh };
}
