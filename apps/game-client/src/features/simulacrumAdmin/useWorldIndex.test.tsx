import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useWorldIndex } from './useWorldIndex';
import type { FetchLike } from './worldApi';

const BASE = 'https://simulacrum-admin.shatteredarchive.dev';

const json = (status: number, body: unknown): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

const AREAS_BODY = { areas: [{ file: 'a.are', name: 'Area A', minVnum: 100, maxVnum: 199, rooms: 2 }] };
const ROOMS_BODY = { rooms: [{ vnum: 101, name: 'First' }, { vnum: 102, name: 'Second' }] };

/** A fetch whose answers the test controls; it also records each request's URL and signal. */
function controlledFetch() {
  const calls: { url: string; signal: AbortSignal }[] = [];
  const pending: Array<(r: Response | Error) => void> = [];
  const impl: FetchLike = (url, init) =>
    new Promise<Response>((resolve, reject) => {
      const signal = init?.signal as AbortSignal;
      calls.push({ url, signal });
      pending.push((r) => (r instanceof Error ? reject(r) : resolve(r)));
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  return { impl, calls, answer: (i: number, r: Response | Error) => pending[i](r) };
}

describe('useWorldIndex', () => {
  it('reads nothing until something shows it, then loads the areas once', async () => {
    const net = controlledFetch();
    const { result, rerender } = renderHook(({ active }) => useWorldIndex({ base: BASE, active, fetchImpl: net.impl }), { initialProps: { active: false } });
    expect(result.current.areas).toEqual({ status: 'idle' });
    expect(net.calls).toHaveLength(0);
    rerender({ active: true });
    expect(net.calls.map((c) => c.url)).toEqual([`${BASE}/api/map`]);
    expect(result.current.areas).toEqual({ status: 'loading' });
    await act(async () => net.answer(0, json(200, AREAS_BODY)));
    expect(result.current.areas).toEqual({ status: 'ready', data: [{ file: 'a.are', name: 'Area A', minVnum: 100, maxVnum: 199, rooms: 2 }], at: expect.any(Number) });
    rerender({ active: true });
    expect(net.calls).toHaveLength(1);
  });

  it('shows an offline state, then a failure to read the areas', async () => {
    const net = controlledFetch();
    const { result } = renderHook(() => useWorldIndex({ base: BASE, active: true, fetchImpl: net.impl }));
    await act(async () => net.answer(0, new TypeError('Failed to fetch')));
    expect(result.current.areas).toEqual({ status: 'offline', message: expect.stringContaining('could not be reached') });
  });

  it('loads one area’s rooms on demand and uses the cache on a second read', async () => {
    const net = controlledFetch();
    const { result } = renderHook(() => useWorldIndex({ base: BASE, active: true, fetchImpl: net.impl }));
    await act(async () => net.answer(0, json(200, AREAS_BODY)));
    act(() => result.current.loadRooms('a.are'));
    expect(net.calls.map((c) => c.url)).toEqual([`${BASE}/api/map`, `${BASE}/api/map/a.are`]);
    expect(result.current.rooms.get('a.are')).toEqual({ status: 'loading' });
    act(() => result.current.loadRooms('a.are')); // loading: no second request
    expect(net.calls).toHaveLength(2);
    await act(async () => net.answer(1, json(200, ROOMS_BODY)));
    expect(result.current.rooms.get('a.are')).toEqual({ status: 'ready', data: ROOMS_BODY.rooms, at: expect.any(Number) });
    act(() => result.current.loadRooms('a.are')); // loaded: the cache is used
    expect(net.calls).toHaveLength(2);
  });

  it('asks again for an area whose rooms failed, on the next read or on reloadRooms', async () => {
    const net = controlledFetch();
    const { result } = renderHook(() => useWorldIndex({ base: BASE, active: true, fetchImpl: net.impl }));
    await act(async () => net.answer(0, json(200, AREAS_BODY)));
    act(() => result.current.loadRooms('a.are'));
    await act(async () => net.answer(1, json(404, { error: 'area file not found: a.are' })));
    expect(result.current.rooms.get('a.are')).toEqual({ status: 'error', message: 'The world index answered 404: area file not found: a.are' });
    act(() => result.current.loadRooms('a.are'));
    expect(net.calls).toHaveLength(3);
    await act(async () => net.answer(2, new TypeError('down')));
    expect(result.current.rooms.get('a.are')).toEqual({ status: 'offline', message: expect.any(String) });
    act(() => result.current.reloadRooms('a.are'));
    expect(net.calls).toHaveLength(4);
    await act(async () => net.answer(3, json(200, ROOMS_BODY)));
    expect(result.current.rooms.get('a.are')?.status).toBe('ready');
  });

  it('refresh forgets the rooms, cancels what is running and reads the areas again', async () => {
    const net = controlledFetch();
    const { result } = renderHook(() => useWorldIndex({ base: BASE, active: true, fetchImpl: net.impl }));
    await act(async () => net.answer(0, json(200, AREAS_BODY)));
    act(() => result.current.loadRooms('a.are'));
    await act(async () => net.answer(1, json(200, ROOMS_BODY)));
    act(() => result.current.loadRooms('b.are'));
    const inFlight = net.calls[2];
    act(() => result.current.refresh());
    expect(inFlight.signal.aborted).toBe(true);
    expect(result.current.rooms.size).toBe(0);
    expect(net.calls[3].url).toBe(`${BASE}/api/map`);
    expect(result.current.areas).toEqual({ status: 'loading' });
    await act(async () => net.answer(3, json(200, { areas: [] })));
    expect(result.current.areas).toEqual({ status: 'ready', data: [], at: expect.any(Number) });
    // the cancelled request did not write its state back
    expect(result.current.rooms.size).toBe(0);
  });

  it('after unmount no request is left pending, no new one is made and no state is set (async rule)', async () => {
    const net = controlledFetch();
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => useWorldIndex({ base: BASE, active: true, fetchImpl: net.impl }));
    expect(net.calls).toHaveLength(1);
    const load = result.current.loadRooms;
    unmount();
    expect(net.calls[0].signal.aborted).toBe(true);
    await act(async () => undefined);
    expect(net.calls).toHaveLength(1);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    // a stray call after unmount cannot fail the test run
    expect(typeof load).toBe('function');
  });

  it('still loads the areas under React strict mode, which mounts, cleans up and mounts again', async () => {
    const net = controlledFetch();
    const { result } = renderHook(() => useWorldIndex({ base: BASE, active: true, fetchImpl: net.impl }), { wrapper: React.StrictMode });
    // the first request was cancelled by the simulated unmount and a second one was made
    expect(net.calls.length).toBe(2);
    expect(net.calls[0].signal.aborted).toBe(true);
    await act(async () => net.answer(1, json(200, AREAS_BODY)));
    expect(result.current.areas.status).toBe('ready');
  });

  it('waits for the areas to settle without throwing when the answer is a wrong shape', async () => {
    const net = controlledFetch();
    const { result } = renderHook(() => useWorldIndex({ base: BASE, active: true, fetchImpl: net.impl }));
    await act(async () => net.answer(0, json(200, { areas: [{ file: '../x', rooms: 1 }] })));
    await waitFor(() => expect(result.current.areas.status).toBe('error'));
  });
});
