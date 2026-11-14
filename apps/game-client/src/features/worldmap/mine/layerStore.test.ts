// The player's own rooms: kept per world in IndexedDB (a memory store here), read once, never mixed between worlds, damaged data ignored.
import { buildIndex, type AddRoomSpec } from '@shatteredarchive/shattered-maps-core';
import { memoryKvStore } from '../../autoleveling/autoleveling-idb';
import { createLayerStore, LAYER_KEY_PREFIX, UNREADABLE_SUFFIX } from './layerStore';

const spec = (title: string, extra: Partial<AddRoomSpec> = {}): AddRoomSpec => ({
  title,
  place: { continent: 'Isles', area: 'Harbour', subzone: 'Docks' },
  exits: {},
  source: 'manual',
  at: '2026-11-12',
  ...extra,
});

function counter(): () => number {
  let n = 0;
  return () => ((n += 1) * 0.0371) % 1;
}

describe('createLayerStore', () => {
  it('adds a room, keeps it in the store and in memory, and tells subscribers which world changed', async () => {
    const kv = memoryKvStore();
    const store = createLayerStore(kv, counter());
    const heard: string[] = [];
    const off = store.subscribe((w) => heard.push(w));
    expect(store.version('dsl')).toBe(0);
    const r = await store.add('dsl', spec('Pier'));
    expect(r.ok).toBe(true);
    expect(heard).toEqual(['dsl']);
    expect(store.version('dsl')).toBe(1);
    expect(buildIndex(await store.get('dsl')).rooms.size).toBe(1);
    expect(await kv.keys()).toEqual([`${LAYER_KEY_PREFIX}dsl`]);
    off();
    await store.add('dsl', spec('Quay'));
    expect(heard).toEqual(['dsl']); // unsubscribed
  });

  it('reads what an earlier page load stored, and a new store over the same data sees it', async () => {
    const kv = memoryKvStore();
    const first = createLayerStore(kv, counter());
    await first.add('dsl', spec('Pier'));
    const second = createLayerStore(kv, counter());
    expect(buildIndex(await second.get('dsl')).rooms.size).toBe(1);
  });

  it('gives two reads that overlap the same object', async () => {
    const store = createLayerStore(memoryKvStore(), counter());
    const [a, b] = await Promise.all([store.get('dsl'), store.get('dsl')]);
    expect(a).toBe(b);
  });

  it('mints ids from Math.random when it is given no random source', async () => {
    const store = createLayerStore(memoryKvStore());
    const r = await store.add('dsl', spec('Pier'));
    expect(r.ok && /^r[0-9a-z]{10}$/.test(r.roomId)).toBe(true);
  });

  it('reads again a room whose exit leads to a room of the published map (the file must pass the strict reader)', async () => {
    const kv = memoryKvStore();
    const first = createLayerStore(kv, counter());
    expect((await first.add('dsl', spec('Annex', { exits: { N: 'published-room', S: null } }))).ok).toBe(true);
    const later = createLayerStore(kv, counter());
    expect([...buildIndex(await later.get('dsl')).rooms.values()].map((l) => l.room.title)).toEqual(['Annex']);
    expect(await kv.keys()).toEqual([`${LAYER_KEY_PREFIX}dsl`]); // and nothing was set aside as unreadable
  });

  it('keeps worlds apart', async () => {
    const store = createLayerStore(memoryKvStore(), counter());
    await store.add('dsl', spec('Pier'));
    expect(buildIndex(await store.get('sandbox')).rooms.size).toBe(0);
    expect(store.version('sandbox')).toBe(0);
  });

  it('treats a damaged stored file as empty, keeps a copy of it, and replaces it on the next add', async () => {
    const damaged = { version: 9, nonsense: true };
    const kv = memoryKvStore({ [`${LAYER_KEY_PREFIX}dsl`]: damaged });
    const store = createLayerStore(kv, counter());
    expect(buildIndex(await store.get('dsl')).rooms.size).toBe(0);
    expect(await kv.get(`${LAYER_KEY_PREFIX}dsl${UNREADABLE_SUFFIX}`)).toEqual(damaged);
    await store.add('dsl', spec('Pier'));
    expect(buildIndex(await store.get('dsl')).rooms.size).toBe(1);
    expect(await kv.get(`${LAYER_KEY_PREFIX}dsl${UNREADABLE_SUFFIX}`)).toEqual(damaged);
  });

  it('makes a copy of nothing when nothing is stored', async () => {
    const kv = memoryKvStore();
    await createLayerStore(kv, counter()).get('dsl');
    expect(await kv.keys()).toEqual([]);
  });

  it('answers a refused add without storing or telling anyone', async () => {
    const kv = memoryKvStore();
    const store = createLayerStore(kv, counter());
    const heard: string[] = [];
    store.subscribe((w) => heard.push(w));
    const r = await store.add('dsl', spec(' '));
    expect(r).toEqual({ ok: false, reason: 'The room needs a title.' });
    expect(heard).toEqual([]);
    expect(await kv.keys()).toEqual([]);
  });

  it('runs quick adds one after the other, so none is lost', async () => {
    const store = createLayerStore(memoryKvStore(), counter());
    await Promise.all([store.add('dsl', spec('A')), store.add('dsl', spec('B')), store.add('dsl', spec('C'))]);
    const titles = [...buildIndex(await store.get('dsl')).rooms.values()].map((l) => l.room.title).sort();
    expect(titles).toEqual(['A', 'B', 'C']);
  });

  it('removes a room, and does nothing (no event) for an unknown one', async () => {
    const store = createLayerStore(memoryKvStore(), counter());
    const added = await store.add('dsl', spec('Pier'));
    if (!added.ok) throw new Error('setup');
    const heard: string[] = [];
    store.subscribe((w) => heard.push(w));
    await store.remove('dsl', 'nope');
    expect(heard).toEqual([]);
    await store.remove('dsl', added.roomId);
    expect(heard).toEqual(['dsl']);
    expect(buildIndex(await store.get('dsl')).rooms.size).toBe(0);
  });

  it('keeps working after a failed job (the queue does not stay broken)', async () => {
    const kv = memoryKvStore();
    const failing = { ...kv, set: jest.fn().mockRejectedValueOnce(new Error('quota')).mockImplementation(kv.set) };
    const store = createLayerStore(failing, counter());
    await expect(store.add('dsl', spec('A'))).rejects.toThrow('quota');
    const again = await store.add('dsl', spec('B'));
    expect(again.ok).toBe(true);
  });
});
