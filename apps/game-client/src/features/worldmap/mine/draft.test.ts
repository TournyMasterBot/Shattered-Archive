// What the add-room panel shows and saves: the exits of the room with what the history says they lead to, the places to file it in, the save.
import { buildIndex } from '@shatteredarchive/shattered-maps-core';
import { memoryKvStore } from '../../autoleveling/autoleveling-idb';
import type { ApiResult, LoadedArea, SearchHit, WorldMapApi, WorldMapIndex } from '../api';
import { directionsOf, findRooms, loadDraft, roomsTitled, saveRoom, subzonesOf, type RoomForm } from './draft';
import { __resetHistorySourcesForTests, registerHistorySource, type HistoryRoom } from './history';
import { createLayerStore } from './layerStore';

const signal = new AbortController().signal;
const hit = (roomId: string, title: string, areaId = 'town', areaName = 'Town'): SearchHit => ({ roomId, title, areaId, areaName, subzoneId: 'main' });

const index: WorldMapIndex = {
  available: true,
  versionId: 'v1',
  credits: [],
  continents: [{ id: 'c1', name: 'Mainland', areas: 2, rooms: 3 }],
  areas: [
    { id: 'town', name: 'Town', continentId: 'c1', rooms: 2 },
    { id: 'forest', name: 'Forest', continentId: 'c1', rooms: 1 },
  ],
};

function api(overrides: Partial<WorldMapApi> = {}, hits: SearchHit[] = []): WorldMapApi {
  return {
    checkFresh: async () => undefined,
    getIndex: async () => ({ ok: true, value: index }),
    getArea: async (id): Promise<ApiResult<LoadedArea>> => ({
      ok: true,
      value: {
        id,
        name: id,
        continentId: 'c1',
        versionId: 'v1',
        credits: [],
        map: { version: 1, continents: [{ id: 'c1', name: 'Mainland', areas: [{ id, name: id, placement: null, subzones: [{ id: `${id}-main`, name: 'Main', kind: 'consistent', rooms: [] }, { id: `${id}-yard`, name: 'Yard', kind: 'consistent', rooms: [] }] }] }, { id: 'c2', name: 'Other', areas: [{ id: 'elsewhere', name: 'E', placement: null, subzones: [{ id: 'e-s', name: 'E', kind: 'consistent', rooms: [] }] }] }], links: [] },
      },
    }),
    search: async (q) => ({ ok: true, value: { versionId: 'v1', q, total: hits.length, results: hits } }),
    getRoomArea: async () => ({ ok: false, error: { kind: 'offline' } }),
    ...overrides,
  };
}

const history = (extra: Partial<HistoryRoom> = {}): HistoryRoom => ({
  source: 'copilot',
  title: 'The House of Arms',
  sector: 'inside',
  exits: ['N', 'S'],
  neighbours: [
    { dir: 'N', title: 'Armoury Lane' },
    { dir: 'S', title: 'Nowhere Road' },
  ],
  visits: 5,
  sameExits: true,
  ...extra,
});

beforeEach(() => __resetHistorySourcesForTests());

describe('directionsOf', () => {
  it('orders exits as the map does and understands long names', () => {
    expect(directionsOf(['south', 'N', 'up', 'bogus'])).toEqual(['N', 'S', 'U']);
    expect(directionsOf([])).toEqual([]);
  });
});

describe('roomsTitled and findRooms', () => {
  it('keeps the hits whose title is exactly the one asked (case and spacing ignored), at most the limit', async () => {
    const a = api({}, [hit('r1', 'Armoury  Lane'), hit('r2', 'Armoury Lane North'), hit('r3', 'armoury lane', 'forest', 'Forest'), hit('r4', 'ARMOURY LANE')]);
    expect((await roomsTitled(a, 'Armoury Lane', signal)).map((r) => r.roomId)).toEqual(['r1', 'r3', 'r4']);
    expect(await roomsTitled(a, 'Armoury Lane', signal, 2)).toHaveLength(2);
  });

  it('finds nothing when the search fails, and nothing for a one-letter text', async () => {
    const down = api({ search: async () => ({ ok: false, error: { kind: 'offline' } }) });
    expect(await roomsTitled(down, 'Hall', signal)).toEqual([]);
    expect(await findRooms(down, 'Hall', signal)).toEqual([]);
    expect(await findRooms(api({}, [hit('r1', 'Hall')]), 'h', signal)).toEqual([]);
  });

  it('finds rooms whose title contains the text, as choices', async () => {
    const a = api({}, [hit('r1', 'Hall of Kings'), hit('r2', 'Hall of Lanterns')]);
    expect(await findRooms(a, ' hall ', signal, 1)).toEqual([{ roomId: 'r1', title: 'Hall of Kings', areaId: 'town', areaName: 'Town' }]);
  });
});

describe('subzonesOf', () => {
  it('lists the subzones of the area asked, not of another area in the same file', async () => {
    expect(await subzonesOf(api(), 'town', signal)).toEqual([{ id: 'town-main', name: 'Main' }, { id: 'town-yard', name: 'Yard' }]);
  });
  it('lists nothing when the area cannot be read', async () => {
    expect(await subzonesOf(api({ getArea: async () => ({ ok: false, error: { kind: 'offline' } }) }), 'town', signal)).toEqual([]);
  });
});

describe('loadDraft', () => {
  it('rows for every exit, with what the history says each leads to and the map rooms that could be', async () => {
    registerHistorySource({ label: 'your Copilot history', find: async () => [history()] });
    const a = api({}, [hit('r1', 'Armoury Lane')]);
    const data = await loadDraft(a, 'dsl', { title: 'The House of Arms', exits: ['s', 'n'] }, null, signal);
    expect(data.historyLabel).toBe('your Copilot history');
    expect(data.sector).toBe('inside');
    expect(data.exits).toEqual([
      { dir: 'N', suggestedTitle: 'Armoury Lane', choices: [{ roomId: 'r1', title: 'Armoury Lane', areaId: 'town', areaName: 'Town' }], preselected: 'r1' },
      { dir: 'S', suggestedTitle: 'Nowhere Road', choices: [], preselected: null },
    ]);
    expect(data.places.continents).toEqual([{ id: 'c1', name: 'Mainland' }]);
    expect(data.defaultPlace).toEqual({ continentId: 'c1', areaId: 'town' }); // the area of a neighbour
  });

  it('files in the area the player was last found in, and does not preselect when several rooms share the title', async () => {
    registerHistorySource({ label: 'x', find: async () => [history({ sameExits: false }), history()] });
    const a = api({}, [hit('r1', 'Armoury Lane'), hit('r2', 'Armoury Lane', 'forest', 'Forest')]);
    const data = await loadDraft(a, 'dsl', { title: 'The House of Arms', exits: ['n'], sector: 'city' }, { areaId: 'forest', continentId: 'c1' }, signal);
    expect(data.defaultPlace).toEqual({ continentId: 'c1', areaId: 'forest' });
    expect(data.sector).toBe('city'); // what the game said wins over the history
    expect(data.exits[0].preselected).toBeNull();
    expect(data.exits[0].choices).toHaveLength(2);
  });

  it('uses the first history room when none has the same exits', async () => {
    registerHistorySource({ label: 'x', find: async () => [history({ sameExits: false, neighbours: [{ dir: 'N', title: 'Armoury Lane' }] })] });
    const data = await loadDraft(api({}, [hit('r1', 'Armoury Lane')]), 'dsl', { title: 'T', exits: ['N'] }, null, signal);
    expect(data.exits[0].suggestedTitle).toBe('Armoury Lane');
  });

  it('works with no history: plain exit rows, no label, no place to suggest', async () => {
    const data = await loadDraft(api(), 'dsl', { title: 'The House of Arms', exits: ['N'] }, null, signal);
    expect(data).toMatchObject({ historyLabel: null, sector: '', exits: [{ dir: 'N', choices: [], preselected: null }], defaultPlace: null });
  });

  it('asks no history source for a blank title (adding a room by hand)', async () => {
    const find = jest.fn(async () => [history()]);
    registerHistorySource({ label: 'x', find });
    const data = await loadDraft(api(), 'dsl', { title: '', exits: [] }, null, signal);
    expect(find).not.toHaveBeenCalled();
    expect(data).toMatchObject({ historyLabel: null, exits: [] });
    expect(data.places.areas.map((a) => a.id)).toEqual(['town', 'forest']);
  });

  it('works when the map cannot be read: no places, and a neighbour whose area is not in the list suggests none', async () => {
    registerHistorySource({ label: 'x', find: async () => [history()] });
    const down = api({ getIndex: async () => ({ ok: false, error: { kind: 'offline' } }) }, [hit('r1', 'Armoury Lane', 'lost', 'Lost')]);
    const data = await loadDraft(down, 'dsl', { title: 'T', exits: ['N'] }, null, signal);
    expect(data.places).toEqual({ continents: [], areas: [] });
    expect(data.defaultPlace).toBeNull();
  });
});

describe('saveRoom', () => {
  const form = (extra: Partial<RoomForm> = {}): RoomForm => ({
    title: 'The House of Arms',
    sector: ' inside ',
    source: 'walked',
    exits: { N: 'r1', S: null },
    continent: { kind: 'existing', id: 'c1', name: 'Mainland' },
    area: { kind: 'existing', id: 'town', name: 'Town' },
    subzone: { kind: 'new', name: 'Armoury' },
    ...extra,
  });

  it('files the room under the chosen existing and new places, with its exits', async () => {
    const store = createLayerStore(memoryKvStore());
    const r = await saveRoom(store, 'dsl', form(), '2026-11-12');
    if (!r.ok) throw new Error('expected ok');
    const found = buildIndex(await store.get('dsl')).rooms.get(r.roomId);
    expect(found).toMatchObject({ areaId: 'town', continentId: 'c1', subzoneId: 's-armoury' });
    expect(found?.room).toMatchObject({ title: 'The House of Arms', sector: 'inside', sources: [{ kind: 'walked', date: '2026-11-12' }] });
    expect(Object.keys(found?.room.exits ?? {})).toEqual(['N', 'S']);
  });

  it('files a room in a new continent, area and subzone, and leaves the sector out when blank', async () => {
    const store = createLayerStore(memoryKvStore());
    const r = await saveRoom(
      store,
      'dsl',
      form({ sector: '  ', source: 'manual', exits: {}, continent: { kind: 'new', name: 'Far Isles' }, area: { kind: 'new', name: 'Mist Harbour' }, subzone: { kind: 'existing', id: 's-docks', name: 'Docks' } }),
      '2026-11-12',
    );
    if (!r.ok) throw new Error('expected ok');
    const found = buildIndex(await store.get('dsl')).rooms.get(r.roomId);
    expect(found).toMatchObject({ continentId: 'c-far-isles', areaId: 'a-mist-harbour', subzoneId: 's-docks' });
    expect(found?.room.sector).toBeUndefined();
  });

  it('says why a room cannot be filed', async () => {
    const store = createLayerStore(memoryKvStore());
    expect(await saveRoom(store, 'dsl', form({ title: ' ' }), '2026-11-12')).toEqual({ ok: false, reason: 'The room needs a title.' });
  });
});
