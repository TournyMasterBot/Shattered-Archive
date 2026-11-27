import { act, renderHook, waitFor } from '@testing-library/react';

// siteApi.ts reads import.meta.env, which the jest transform does not support; the base only has to be a URL here.
jest.mock('../auth/siteApi', () => ({ siteApiBase: () => 'https://site.test' }));

import { DispatchEvent } from '../event-emitter/event-dispatcher';
import { __resetForTests as resetRoomData, setRoomData } from '../room/roomDataStore';
import type { Location, Observation, WorldMapSession } from './session';
import { __resetWorldMapSessionForTests, sharedWorldMapApi, sharedWorldMapSession, useWorldMap } from './useWorldMap';
import { __resetMapWorldsForTests, DSL_WORLD, registerMapWorld, setActiveMapWorld } from './world';

const unmapped: Location = { status: 'unmapped' };

/** A session whose answers the test resolves by hand, so ordering can be controlled. */
function manualSession() {
  const pending: {
    observation: Observation;
    signal: AbortSignal;
    resolve: (l: Location | null) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const session: WorldMapSession = {
    observe: jest.fn(
      (observation, signal) =>
        new Promise<Location | null>((resolve, reject) => pending.push({ observation, signal, resolve, reject })),
    ),
    reset: jest.fn(),
  };
  return { session, pending };
}

beforeEach(() => resetRoomData());

describe('useWorldMap', () => {
  it('is idle until a room is known', () => {
    const { session } = manualSession();
    const { result } = renderHook(() => useWorldMap(session));
    expect(result.current).toEqual({ phase: 'idle' });
    expect(session.observe).not.toHaveBeenCalled();
  });

  it('starts from the room the game last reported', async () => {
    setRoomData({ room: '  Market Square ', exits: ['north', 'east'] });
    const { session, pending } = manualSession();
    const { result } = renderHook(() => useWorldMap(session));
    expect(result.current).toEqual({ phase: 'loading', title: 'Market Square' });
    expect(pending[0].observation).toEqual({ title: 'Market Square', exits: ['north', 'east'] });
    await act(async () => pending[0].resolve(unmapped));
    expect(result.current).toEqual({ phase: 'done', title: 'Market Square', location: unmapped });
  });

  it('follows every game:room-data and passes an absent exit list as an empty one', async () => {
    const { session, pending } = manualSession();
    const { result } = renderHook(() => useWorldMap(session));
    act(() => DispatchEvent('game:room-data', { room: 'Old Well' }));
    expect(pending[0].observation).toEqual({ title: 'Old Well', exits: [] });
    await act(async () => pending[0].resolve(unmapped));
    expect(result.current).toMatchObject({ phase: 'done', title: 'Old Well' });
  });

  it('ignores an event without a room title', () => {
    const { session } = manualSession();
    renderHook(() => useWorldMap(session));
    act(() => DispatchEvent('game:room-data', { room: '   ' }));
    act(() => DispatchEvent('game:room-data', {}));
    expect(session.observe).not.toHaveBeenCalled();
  });

  it('aborts the older request when a newer room arrives, and a late answer for the old one changes nothing', async () => {
    const { session, pending } = manualSession();
    const { result } = renderHook(() => useWorldMap(session));
    act(() => DispatchEvent('game:room-data', { room: 'First', exits: [] }));
    act(() => DispatchEvent('game:room-data', { room: 'Second', exits: [] }));
    expect(pending[0].signal.aborted).toBe(true);
    expect(pending[1].signal.aborted).toBe(false);
    await act(async () => pending[1].resolve({ status: 'unmapped' }));
    expect(result.current).toEqual({ phase: 'done', title: 'Second', location: unmapped });
    await act(async () => pending[0].resolve({ status: 'unavailable', reason: 'offline', message: 'late' }));
    expect(result.current).toEqual({ phase: 'done', title: 'Second', location: unmapped });
  });

  it('stays loading when the session says the call was cancelled', async () => {
    const { session, pending } = manualSession();
    const { result } = renderHook(() => useWorldMap(session));
    act(() => DispatchEvent('game:room-data', { room: 'Somewhere' }));
    await act(async () => pending[0].resolve(null));
    expect(result.current).toEqual({ phase: 'loading', title: 'Somewhere' });
  });

  it('turns an unexpected failure into an unavailable answer, unless a newer room already took over', async () => {
    const { session, pending } = manualSession();
    const { result } = renderHook(() => useWorldMap(session));
    act(() => DispatchEvent('game:room-data', { room: 'A' }));
    await act(async () => pending[0].reject(new Error('boom')));
    expect(result.current).toEqual({
      phase: 'done',
      title: 'A',
      location: { status: 'unavailable', reason: 'error', message: 'The map could not be used.' },
    });
    act(() => DispatchEvent('game:room-data', { room: 'B' }));
    act(() => DispatchEvent('game:room-data', { room: 'C' }));
    await act(async () => pending[1].reject(new Error('late failure')));
    expect(result.current).toEqual({ phase: 'loading', title: 'C' });
  });

  it('stops listening and aborts the request in flight when it unmounts', () => {
    const { session, pending } = manualSession();
    const { unmount } = renderHook(() => useWorldMap(session));
    act(() => DispatchEvent('game:room-data', { room: 'A' }));
    unmount();
    expect(pending[0].signal.aborted).toBe(true);
    act(() => DispatchEvent('game:room-data', { room: 'B' }));
    expect(session.observe).toHaveBeenCalledTimes(1);
  });

  it('two panes at once both follow the player (their listener keys differ)', async () => {
    const one = manualSession();
    const two = manualSession();
    renderHook(() => useWorldMap(one.session));
    renderHook(() => useWorldMap(two.session));
    act(() => DispatchEvent('game:room-data', { room: 'Shared' }));
    await waitFor(() => {
      expect(one.session.observe).toHaveBeenCalledTimes(1);
      expect(two.session.observe).toHaveBeenCalledTimes(1);
    });
  });
});

describe('sharedWorldMapApi', () => {
  it('is one client per page, the one the shared session reads through, until it is reset for a test', () => {
    __resetWorldMapSessionForTests();
    const api = sharedWorldMapApi();
    expect(sharedWorldMapApi()).toBe(api);
    expect(typeof api.getRoomArea).toBe('function');
    __resetWorldMapSessionForTests();
    expect(sharedWorldMapApi()).not.toBe(api);
  });
});

describe('sharedWorldMapSession', () => {
  it('is one session per page until it is reset for a test', () => {
    __resetWorldMapSessionForTests();
    const a = sharedWorldMapSession();
    expect(sharedWorldMapSession()).toBe(a);
    __resetWorldMapSessionForTests();
    expect(sharedWorldMapSession()).not.toBe(a);
  });

  it('is what the hook uses when no session is passed', async () => {
    __resetWorldMapSessionForTests();
    const shared = sharedWorldMapSession();
    const spy = jest.spyOn(shared, 'observe').mockResolvedValue(unmapped);
    setRoomData({ room: 'Default Session Room', exits: [] });
    const { result } = renderHook(() => useWorldMap());
    await waitFor(() => expect(result.current.phase).toBe('done'));
    expect(spy).toHaveBeenCalledWith({ title: 'Default Session Room', exits: [] }, expect.anything());
    __resetWorldMapSessionForTests();
  });
});

describe('one client and one session per world', () => {
  const other = { id: 'other', label: 'Other game', mapPrefix: '/api/world-map/other' };
  afterEach(() => {
    __resetWorldMapSessionForTests();
    __resetMapWorldsForTests();
  });

  it('a world\'s areas never reach another world\'s window: each world has its own client and session, kept until reset', () => {
    __resetWorldMapSessionForTests();
    const dsl = sharedWorldMapApi();
    const dslSession = sharedWorldMapSession();
    expect(sharedWorldMapApi(DSL_WORLD)).toBe(dsl);
    const apiOther = sharedWorldMapApi(other);
    expect(apiOther).not.toBe(dsl);
    expect(sharedWorldMapApi(other)).toBe(apiOther);
    expect(sharedWorldMapSession(other)).not.toBe(dslSession);
    expect(sharedWorldMapSession(other)).toBe(sharedWorldMapSession(other));
    expect(sharedWorldMapSession(DSL_WORLD)).toBe(dslSession);
  });

  it('with no world given the client of the world being shown is used, and it asks that world\'s route', async () => {
    const fetched: string[] = [];
    const realFetch = global.fetch;
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      fetched.push(String(url));
      return { ok: true, status: 200, json: async () => ({ available: false }) } as unknown as Response;
    }) as unknown as typeof fetch;
    try {
      registerMapWorld(other);
      setActiveMapWorld('other');
      await sharedWorldMapApi().getIndex(new AbortController().signal);
      setActiveMapWorld('dsl');
      await sharedWorldMapApi().getIndex(new AbortController().signal);
    } finally {
      global.fetch = realFetch;
    }
    expect(fetched.filter((u) => u.includes('/index'))).toEqual(['https://site.test/api/world-map/other/index', 'https://site.test/api/world-map/index']);
  });
});

describe('useWorldMap and the player\'s own rooms', () => {
  it('forgets the last area and looks at the room again when a room is added in the active world, not when one is added in another', async () => {
    const { __resetSharedMineForTests, sharedLayerStore } = await import('./mine/shared');
    __resetSharedMineForTests();
    setRoomData({ room: 'The House of Arms', exits: ['n'] });
    const { session, pending } = manualSession();
    const { result } = renderHook(() => useWorldMap(session));
    await act(async () => pending[0].resolve(unmapped));
    expect(result.current).toMatchObject({ phase: 'done', location: unmapped });
    const room = { title: 'The House of Arms', place: { continent: 'C', area: 'A', subzone: 'S' }, exits: {}, source: 'manual' as const, at: '2026-11-12' };

    await act(async () => void (await sharedLayerStore().add('elsewhere', room)));
    expect(session.reset).not.toHaveBeenCalled();
    expect(pending).toHaveLength(1);

    await act(async () => void (await sharedLayerStore().add('dsl', room)));
    expect(session.reset).toHaveBeenCalledTimes(1);
    expect(pending).toHaveLength(2);
    expect(pending[1].observation).toEqual({ title: 'The House of Arms', exits: ['n'] });
    expect(result.current).toEqual({ phase: 'loading', title: 'The House of Arms' });
    __resetSharedMineForTests();
  });
});
