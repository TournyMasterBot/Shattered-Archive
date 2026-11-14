// The map client with the player's own rooms laid over the published one: index, areas, search, "which area is this room in".
import { buildIndex, emptyLayer, type AddRoomSpec, type MapFile } from '@shatteredarchive/shattered-maps-core';
import { memoryKvStore } from '../../autoleveling/autoleveling-idb';
import type { ApiResult, LoadedArea, RoomArea, SearchResult, WorldMapApi, WorldMapIndex } from '../api';
import { extendIndex, LAYER_VERSION_ID, withLayer } from './layeredApi';
import { createLayerStore } from './layerStore';

const signal = new AbortController().signal;

function published(): MapFile {
  return {
    version: 1,
    continents: [
      {
        id: 'c1',
        name: 'Mainland',
        areas: [
          {
            id: 'town',
            name: 'Town',
            placement: null,
            subzones: [
              {
                id: 'main',
                name: 'Main',
                kind: 'consistent',
                rooms: [{ id: 'r1', title: 'Square', exits: { E: 'l1' }, coords: { x: 0, y: 0, z: 0 }, sources: [{ kind: 'walked' }] }],
              },
            ],
          },
        ],
      },
    ],
    links: [{ id: 'l1', from: 'r1', dir: 'E', to: null, state: 'unknown-target', confidence: 0, offPage: false, traversals: 0, reverse: false }],
  };
}

const index: WorldMapIndex = {
  available: true,
  versionId: 'v1',
  credits: [],
  continents: [{ id: 'c1', name: 'Mainland', areas: 1, rooms: 1 }],
  areas: [{ id: 'town', name: 'Town', continentId: 'c1', rooms: 1 }],
};

function fakeBase(overrides: Partial<WorldMapApi> = {}): WorldMapApi & { state: { areaCalls: number } } {
  const state = { areaCalls: 0 };
  const api: WorldMapApi = {
    checkFresh: jest.fn(async () => undefined),
    getIndex: async () => ({ ok: true, value: index }),
    getArea: async (id): Promise<ApiResult<LoadedArea>> => {
      state.areaCalls += 1;
      return id === 'town'
        ? { ok: true, value: { id: 'town', name: 'Town', continentId: 'c1', versionId: 'v1', credits: [], map: published() } }
        : { ok: false, error: { kind: 'http', status: 404, message: 'no such area' } };
    },
    search: async (q): Promise<ApiResult<SearchResult>> => ({ ok: true, value: { versionId: 'v1', q, total: 1, results: [{ roomId: 'r1', title: 'Square', areaId: 'town', areaName: 'Town', subzoneId: 'main' }] } }),
    getRoomArea: async (roomId): Promise<ApiResult<RoomArea>> =>
      roomId === 'r1' ? { ok: true, value: { roomId, areaId: 'town', areaName: 'Town' } } : { ok: false, error: { kind: 'http', status: 404, message: 'none' } },
    ...overrides,
  };
  return Object.assign(api, { state });
}

const spec = (title: string, extra: Partial<AddRoomSpec> = {}): AddRoomSpec => ({
  title,
  place: { continentId: 'c1', continent: 'Mainland', areaId: 'town', area: 'Town', subzone: 'Annex' },
  exits: { W: 'r1' },
  source: 'walked',
  at: '2026-11-12',
  ...extra,
});

async function setup(extra: Partial<WorldMapApi> = {}) {
  const base = fakeBase(extra);
  const store = createLayerStore(memoryKvStore(), (() => {
    let n = 0;
    return () => ((n += 1) * 0.0371) % 1;
  })());
  return { base, store, api: withLayer(base, store, 'dsl') };
}

describe('extendIndex', () => {
  it('returns the published index as it is when the layer is empty', () => {
    expect(extendIndex(index, emptyLayer())).toBe(index);
  });
});

describe('withLayer', () => {
  it('passes everything through while the layer is empty', async () => {
    const { api, base } = await setup();
    expect(await api.getIndex(signal)).toEqual({ ok: true, value: index });
    const area = await api.getArea('town', signal);
    expect(area.ok && buildIndex(area.value.map).rooms.size).toBe(1);
    expect((await api.search('sq', signal)).ok).toBe(true);
    await api.checkFresh(signal);
    expect(base.checkFresh).toHaveBeenCalledTimes(1);
  });

  it('merges an added room into the published area, next to the room its exit leads to', async () => {
    const { api, store } = await setup();
    const added = await store.add('dsl', spec('Armoury'));
    if (!added.ok) throw new Error('setup');
    const area = await api.getArea('town', signal);
    if (!area.ok) throw new Error('expected the area');
    const rooms = buildIndex(area.value.map);
    expect(rooms.rooms.get(added.roomId)?.room.title).toBe('Armoury');
    expect(rooms.rooms.get(added.roomId)?.room.coords).toBeDefined();
    expect(rooms.rooms.get(added.roomId)?.subzoneId).toBe('s-annex');
    expect(area.value.versionId).toBe('v1');
  });

  it('remembers the merged area until the layer changes, then merges again', async () => {
    const { api, store, base } = await setup();
    await store.add('dsl', spec('Armoury'));
    const first = await api.getArea('town', signal);
    const second = await api.getArea('town', signal);
    expect(first.ok && second.ok && first.value === second.value).toBe(true);
    await store.add('dsl', spec('Stable'));
    const third = await api.getArea('town', signal);
    expect(third.ok && first.ok && third.value !== first.value).toBe(true);
    expect(third.ok && buildIndex(third.value.map).rooms.size).toBe(3);
    expect(base.state.areaCalls).toBe(3); // the published area is asked each time (the base client keeps its own copy)
  });

  it('opens an area only the layer has, from the layer alone', async () => {
    const { api, store } = await setup();
    await store.add('dsl', spec('Pier', { place: { continent: 'Isles', area: 'Harbour', subzone: 'Docks' }, exits: {} }));
    const area = await api.getArea('a-harbour', signal);
    expect(area.ok && [area.value.name, area.value.continentId, area.value.versionId]).toEqual(['Harbour', 'c-isles', LAYER_VERSION_ID]);
    expect(area.ok && buildIndex(area.value.map).rooms.size).toBe(1);
  });

  it('answers the published error for an area neither side has, and for any other failure', async () => {
    const { api, store } = await setup();
    await store.add('dsl', spec('Armoury'));
    expect(await api.getArea('nowhere', signal)).toEqual({ ok: false, error: { kind: 'http', status: 404, message: 'no such area' } });
    const offline = await setup({ getArea: async () => ({ ok: false, error: { kind: 'offline' } }) });
    await offline.store.add('dsl', spec('Pier', { place: { continent: 'Isles', area: 'Harbour', subzone: 'Docks' }, exits: {} }));
    expect(await offline.api.getArea('a-harbour', signal)).toEqual({ ok: false, error: { kind: 'offline' } });
  });

  it('adds the layer to the index: counts, a new area and a new continent, and marks an unpublished world as available', async () => {
    const { api, store } = await setup();
    await store.add('dsl', spec('Armoury'));
    await store.add('dsl', spec('Pier', { place: { continent: 'Isles', area: 'Harbour', subzone: 'Docks' }, exits: {} }));
    await store.add('dsl', spec('Quay', { place: { continent: 'Isles', area: 'Harbour', subzone: 'Docks' }, exits: {} }));
    const r = await api.getIndex(signal);
    if (!r.ok) throw new Error('expected the index');
    expect(r.value.areas.map((a) => [a.id, a.rooms])).toEqual([['town', 2], ['a-harbour', 2]]);
    expect(r.value.continents.map((c) => [c.id, c.name, c.areas, c.rooms])).toEqual([['c1', 'Mainland', 1, 2], ['c-isles', 'Isles', 1, 2]]);
    const none = await setup({ getIndex: async () => ({ ok: true, value: { ...index, available: false, areas: [], continents: [] } }) });
    await none.store.add('dsl', spec('Pier', { place: { continent: 'Isles', area: 'Harbour', subzone: 'Docks' }, exits: {} }));
    const only = await none.api.getIndex(signal);
    expect(only.ok && only.value.available).toBe(true);
  });

  it('passes an index failure through', async () => {
    const { api } = await setup({ getIndex: async () => ({ ok: false, error: { kind: 'offline' } }) });
    expect(await api.getIndex(signal)).toEqual({ ok: false, error: { kind: 'offline' } });
  });

  it('adds the layer hits after the published ones in a search, and passes a failure through', async () => {
    const { api, store } = await setup();
    await store.add('dsl', spec('Square Annex'));
    const r = await api.search('square', signal);
    expect(r.ok && [r.value.total, r.value.results.map((h) => h.title)]).toEqual([2, ['Square', 'Square Annex']]);
    const unmatched = await api.search('zzz', signal);
    expect(unmatched.ok && unmatched.value.total).toBe(1);
    const down = await setup({ search: async () => ({ ok: false, error: { kind: 'offline' } }) });
    expect(await down.api.search('x', signal)).toEqual({ ok: false, error: { kind: 'offline' } });
  });

  it('answers which area a layer room is in from the layer, and any other room from the published map', async () => {
    const { api, store } = await setup();
    const added = await store.add('dsl', spec('Armoury'));
    if (!added.ok) throw new Error('setup');
    expect(await api.getRoomArea(added.roomId, signal)).toEqual({ ok: true, value: { roomId: added.roomId, areaId: 'town', areaName: 'Town' } });
    expect(await api.getRoomArea('r1', signal)).toEqual({ ok: true, value: { roomId: 'r1', areaId: 'town', areaName: 'Town' } });
    expect((await api.getRoomArea('zz', signal)).ok).toBe(false);
  });
});
