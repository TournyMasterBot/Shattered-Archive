// The recorder: game events in, trail records out, written a moment after the last change and when it stops.
import { DispatchEvent } from '../../event-emitter/event-dispatcher';
import { memoryKvStore } from '../../autoleveling/autoleveling-idb';
import { createTrail } from './trail';
import { __resetSharedTrailForTests, FLUSH_AFTER_MS, sharedTrail, startTrailRecorder } from './trailRecorder';

const signal = new AbortController().signal;

describe('startTrailRecorder', () => {
  let stop: () => void;
  let kv: ReturnType<typeof memoryKvStore>;
  let trail: ReturnType<typeof createTrail>;
  let world: string;

  beforeEach(() => {
    jest.useFakeTimers();
    kv = memoryKvStore();
    trail = createTrail(kv);
    world = 'dsl';
    stop = startTrailRecorder(trail, () => world);
  });
  afterEach(() => {
    stop();
    jest.useRealTimers();
  });

  const settle = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  it('records every room seen, ignoring darkness and an empty payload', async () => {
    DispatchEvent('game:room-data', { room: 'Hall', sector: 'inside', exits: ['N'] });
    DispatchEvent('game:room-data', { room: 'darkness' });
    DispatchEvent('game:room-data', {});
    await settle();
    expect(await trail.find('dsl', { title: 'Hall', exits: ['N'] }, signal)).toHaveLength(1);
    expect(await trail.find('dsl', { title: 'darkness', exits: [] }, signal)).toEqual([]);
  });

  it('records where an exit led when the move succeeds after the room arrived, and when it succeeds before', async () => {
    DispatchEvent('game:room-data', { room: 'Hall', exits: ['N', 'E'] });
    DispatchEvent('game:room-data', { room: 'Study', exits: ['S'] });
    DispatchEvent('shatteredarchive:movement-succeeded', { dir: 'n', room: { room: 'Study', exits: ['S'] } }); // the room-data came first
    DispatchEvent('shatteredarchive:movement-succeeded', { dir: 's', room: { room: 'Hall', exits: ['N', 'E'] } }); // before: Study is current
    DispatchEvent('game:room-data', { room: 'Hall', exits: ['N', 'E'] });
    await settle();
    expect((await trail.find('dsl', { title: 'Hall', exits: ['N', 'E'] }, signal))[0].neighbours).toEqual([{ dir: 'N', title: 'Study' }]);
    expect((await trail.find('dsl', { title: 'Study', exits: ['S'] }, signal))[0].neighbours).toEqual([{ dir: 'S', title: 'Hall' }]);
  });

  it('ignores a successful move with no direction or no room, or before any room was seen', async () => {
    DispatchEvent('shatteredarchive:movement-succeeded', { dir: 'n', room: { room: 'Study' } }); // nothing seen yet
    DispatchEvent('shatteredarchive:movement-succeeded', null as unknown as object);
    DispatchEvent('shatteredarchive:movement-succeeded', { room: { room: 'Study' } });
    DispatchEvent('shatteredarchive:movement-succeeded', { dir: 'n', room: {} });
    await settle();
    expect(await trail.find('dsl', { title: 'Study', exits: [] }, signal)).toEqual([]);
  });

  it('files each room under the world the client is connected to at that moment', async () => {
    DispatchEvent('game:room-data', { room: 'Hall', exits: ['N'] });
    world = 'sandbox';
    DispatchEvent('game:room-data', { room: 'Hall', exits: ['N', 'S'] });
    await settle();
    expect((await trail.find('dsl', { title: 'Hall', exits: [] }, signal)).map((r) => r.exits)).toEqual([['N']]);
    expect((await trail.find('sandbox', { title: 'Hall', exits: [] }, signal)).map((r) => r.exits)).toEqual([['N', 'S']]);
  });

  it('writes a moment after the last change (one write for a burst) and again when it stops', async () => {
    DispatchEvent('game:room-data', { room: 'Hall', exits: ['N'] });
    DispatchEvent('game:room-data', { room: 'Study', exits: ['S'] });
    await settle();
    expect(await kv.keys()).toEqual([]);
    jest.advanceTimersByTime(FLUSH_AFTER_MS);
    await settle();
    expect((await kv.keys()).sort()).toEqual(['trail|dsl|hall', 'trail|dsl|study']);
    DispatchEvent('game:room-data', { room: 'Yard', exits: ['W'] });
    await settle();
    stop(); // a flush on the way out, before the timer fires
    await settle();
    expect(await kv.keys()).toContain('trail|dsl|yard');
    stop = startTrailRecorder(trail, () => world);
  });

  it('stops listening when stopped', async () => {
    stop();
    DispatchEvent('game:room-data', { room: 'After stop', exits: [] });
    await settle();
    expect(await trail.find('dsl', { title: 'After stop', exits: [] }, signal)).toEqual([]);
    stop = startTrailRecorder(trail, () => world);
  });

  it('survives a write that fails', async () => {
    const failing = createTrail({ ...kv, set: jest.fn().mockRejectedValue(new Error('quota')) });
    stop();
    stop = startTrailRecorder(failing, () => world);
    DispatchEvent('game:room-data', { room: 'Hall', exits: ['N'] });
    await settle();
    jest.advanceTimersByTime(FLUSH_AFTER_MS);
    await settle();
    await expect(failing.find('dsl', { title: 'Hall', exits: ['N'] }, signal)).resolves.toHaveLength(1);
    DispatchEvent('game:room-data', { room: 'Yard', exits: ['W'] });
    await settle();
    stop(); // the flush on the way out fails too, and nothing is thrown
    await settle();
    stop = startTrailRecorder(failing, () => world);
  });
});

describe('sharedTrail', () => {
  it('is one trail for the page, over memory when there is no IndexedDB (a test), and can be reset', () => {
    __resetSharedTrailForTests();
    const a = sharedTrail();
    expect(sharedTrail()).toBe(a);
    __resetSharedTrailForTests();
    expect(sharedTrail()).not.toBe(a);
  });

  it('records with the active map world and this module defaults when started with no arguments', async () => {
    __resetSharedTrailForTests();
    const stopDefault = startTrailRecorder();
    DispatchEvent('game:room-data', { room: 'Default Hall', exits: ['N'] });
    await Promise.resolve();
    await Promise.resolve();
    expect(await sharedTrail().find('dsl', { title: 'Default Hall', exits: ['N'] }, signal)).toHaveLength(1);
    stopDefault();
  });
});

describe('the recorder and the add-room history', () => {
  it('offers its trail as the last history source while recording, and withdraws it when stopped', async () => {
    const { __resetHistorySourcesForTests, findHistory, registerHistorySource } = await import('./history');
    __resetHistorySourcesForTests();
    const trail = createTrail(memoryKvStore());
    const stopRecording = startTrailRecorder(trail, () => 'dsl');
    registerHistorySource({ label: 'copilot', find: async () => [] }); // added later, still asked first
    DispatchEvent('game:room-data', { room: 'Seen Room', exits: ['N'] });
    await Promise.resolve();
    await Promise.resolve();
    const answer = await findHistory('dsl', { title: 'Seen Room', exits: ['N'] }, signal);
    expect(answer?.label).toBe('what this browser has seen');
    stopRecording();
    __resetHistorySourcesForTests();
  });
});
