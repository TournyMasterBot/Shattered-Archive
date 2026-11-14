// Exploration recorded for fog of war: a visit only when the map session is CERTAIN of the room; nothing for guesses, lookalikes or unmapped rooms.
// siteApi.ts reads import.meta.env, which the jest transform does not support; the recorder only needs sessions that never touch the network.
jest.mock('../../auth/siteApi', () => ({ siteApiBase: () => 'https://site.test' }));

import { DispatchEvent } from '../../event-emitter/event-dispatcher';
import { memoryKvStore } from '../../autoleveling/autoleveling-idb';
import type { Location, Observation, WorldMapSession } from '../session';
import type { Scope } from './identity';
import { startVisitRecorder } from './visitRecorder';
import { createVisitStore } from './visits';

const scope: Scope = { world: 'dsl', account: 'acct-1', character: 'Aldric-M' };
const area = { id: 'town', name: 'Town', continentId: 'c1', versionId: 'v1', credits: [], map: { version: 1, continents: [], links: [] } } as never;
const located = (roomIds: string[], exact = true): Location => ({ status: 'located', area, roomIds, z: 0, exact });

function manualSession() {
  const pending: { observation: Observation; signal: AbortSignal; resolve: (l: Location | null) => void; reject: (e: unknown) => void }[] = [];
  const session: WorldMapSession = {
    observe: jest.fn((observation, signal) => new Promise<Location | null>((resolve, reject) => pending.push({ observation, signal, resolve, reject }))),
    reset: jest.fn(),
  };
  return { session, pending };
}

describe('startVisitRecorder', () => {
  let stop: () => void;
  let store: ReturnType<typeof createVisitStore>;
  let recorded: string[];
  let manual: ReturnType<typeof manualSession>;
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  };

  beforeEach(() => {
    store = createVisitStore(memoryKvStore());
    recorded = [];
    manual = manualSession();
    stop = startVisitRecorder({ store, session: () => manual.session, scope: () => scope, onRecorded: (id) => recorded.push(id) });
  });
  afterEach(() => stop());

  it('records the room when the session is certain which one it is', async () => {
    DispatchEvent('game:room-data', { room: ' Market Square ', exits: ['n', 's'] });
    expect(manual.pending[0].observation).toEqual({ title: 'Market Square', exits: ['n', 's'] });
    manual.pending[0].resolve(located(['r1']));
    await flush();
    expect(recorded).toEqual(['r1']);
    expect([...store.visited(scope, 'character')]).toEqual(['r1']);
  });

  it('records a room once however often it is entered', async () => {
    for (const _ of [1, 2]) {
      DispatchEvent('game:room-data', { room: 'Market Square' });
      manual.pending[manual.pending.length - 1].resolve(located(['r1']));
      await flush();
    }
    expect(recorded).toEqual(['r1']);
  });

  it.each([
    ['a guess (the title matched, the exits did not)', located(['r1'], false)],
    ['one of several lookalikes', located(['r1', 'r2'])],
    ['a room that is not on the map', { status: 'unmapped' } as Location],
    ['several areas with that title', { status: 'ambiguous', areas: [] } as Location],
    ['a map that is not available', { status: 'unavailable', reason: 'offline', message: 'x' } as Location],
    ['a cancelled lookup', null],
  ])('records nothing for %s', async (_name, answer) => {
    DispatchEvent('game:room-data', { room: 'Market Square' });
    manual.pending[0].resolve(answer);
    await flush();
    expect(recorded).toEqual([]);
    expect(store.visited(scope, 'user').size).toBe(0);
  });

  it('ignores an event with no room title, passing an absent exit list as an empty one', async () => {
    DispatchEvent('game:room-data', { room: '  ' });
    DispatchEvent('game:room-data', {});
    expect(manual.session.observe).not.toHaveBeenCalled();
    DispatchEvent('game:room-data', { room: 'Old Well' });
    expect(manual.pending[0].observation).toEqual({ title: 'Old Well', exits: [] });
  });

  it('cancels the older lookup when a newer room arrives, and a late answer for the old one records nothing', async () => {
    DispatchEvent('game:room-data', { room: 'First' });
    DispatchEvent('game:room-data', { room: 'Second' });
    expect(manual.pending[0].signal.aborted).toBe(true);
    manual.pending[0].resolve(located(['r1']));
    manual.pending[1].resolve(located(['r2']));
    await flush();
    expect(recorded).toEqual(['r2']);
  });

  it('goes on when the map cannot be used', async () => {
    DispatchEvent('game:room-data', { room: 'Market Square' });
    manual.pending[0].reject(new Error('down'));
    await flush();
    expect(recorded).toEqual([]);
    DispatchEvent('game:room-data', { room: 'Old Well' });
    manual.pending[1].resolve(located(['r3']));
    await flush();
    expect(recorded).toEqual(['r3']);
  });

  it('stops listening and cancels the lookup in flight when stopped', async () => {
    DispatchEvent('game:room-data', { room: 'Market Square' });
    stop();
    expect(manual.pending[0].signal.aborted).toBe(true);
    DispatchEvent('game:room-data', { room: 'After stop' });
    expect(manual.pending).toHaveLength(1);
    stop = startVisitRecorder({ store, session: () => manual.session, scope: () => scope });
  });

  it('files the visit under the scope read when the room arrived, not when the answer came', async () => {
    let now: Scope = scope;
    stop();
    stop = startVisitRecorder({ store, session: () => manual.session, scope: () => now });
    DispatchEvent('game:room-data', { room: 'Market Square' });
    now = { ...scope, character: 'Mira-F' };
    manual.pending[manual.pending.length - 1].resolve(located(['r1']));
    await flush();
    expect([...store.visited(scope, 'character')]).toEqual(['r1']);
    expect(store.visited({ ...scope, character: 'Mira-F' }, 'character').size).toBe(0);
  });
});

describe('startVisitRecorder with its defaults', () => {
  it('takes the shared store, the shared session and the active world, and the scope of the page', async () => {
    jest.resetModules();
    const shared = await import('../mine/shared');
    shared.__resetSharedMineForTests();
    const sessions = await import('../useWorldMap');
    const observe = jest.spyOn(sessions.sharedWorldMapSession(), 'observe').mockResolvedValue(located(['r7']));
    const events = await import('../../event-emitter/event-dispatcher');
    const { startVisitRecorder: start } = await import('./visitRecorder');
    const stopDefault = start();
    events.DispatchEvent('game:room-data', { room: 'Default Room', exits: ['n'] });
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    expect(observe).toHaveBeenCalledTimes(1);
    expect([...shared.sharedVisitStore().visited({ world: 'dsl', account: 'local', character: '' }, 'user')]).toEqual(['r7']);
    stopDefault();
    shared.__resetSharedMineForTests();
  });
});
