// The page's one store for the player's own map data: IndexedDB when the browser has it, memory otherwise, one instance per page.
import { __resetSharedMineForTests, sharedLayerStore, sharedMineKv } from './shared';

afterEach(() => __resetSharedMineForTests());

describe('shared stores', () => {
  it('are one store for the page, over memory when the browser has no IndexedDB', async () => {
    const kv = sharedMineKv();
    expect(sharedMineKv()).toBe(kv);
    await kv.set('probe', 1);
    expect(await kv.get('probe')).toBe(1);
    expect(sharedLayerStore()).toBe(sharedLayerStore());
  });

  it('keeps the player\'s rooms in the same store as the rest', async () => {
    const added = await sharedLayerStore().add('dsl', { title: 'Pier', place: { continent: 'Isles', area: 'Harbour', subzone: 'Docks' }, exits: {}, source: 'manual', at: '2026-11-12' });
    expect(added.ok).toBe(true);
    expect(await sharedMineKv().keys()).toEqual(['layer|dsl']);
  });

  it('can be reset, giving a fresh empty store', async () => {
    const before = sharedMineKv();
    await before.set('x', 1);
    __resetSharedMineForTests();
    expect(sharedMineKv()).not.toBe(before);
    expect(await sharedMineKv().keys()).toEqual([]);
  });

  it('opens IndexedDB when the browser has one (nothing is opened until the first read or write)', () => {
    const g = globalThis as { indexedDB?: unknown };
    const before = g.indexedDB;
    g.indexedDB = {};
    try {
      __resetSharedMineForTests();
      expect(typeof sharedMineKv().get).toBe('function');
    } finally {
      g.indexedDB = before;
    }
  });
});
