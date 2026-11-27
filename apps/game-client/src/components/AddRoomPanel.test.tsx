import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { buildIndex, layerRooms } from '@shatteredarchive/shattered-maps-core';
import { memoryKvStore } from '../features/autoleveling/autoleveling-idb';
import type { ApiResult, LoadedArea, SearchHit, WorldMapApi, WorldMapIndex } from '../features/worldmap/api';
import { __resetHistorySourcesForTests, registerHistorySource } from '../features/worldmap/mine/history';
import { createLayerStore, type LayerStore } from '../features/worldmap/mine/layerStore';
import AddRoomPanel from './AddRoomPanel';

const hit = (roomId: string, title: string, areaId = 'town', areaName = 'Town'): SearchHit => ({ roomId, title, areaId, areaName, subzoneId: 'main' });
const index: WorldMapIndex = {
  available: true,
  versionId: 'v1',
  credits: [],
  continents: [
    { id: 'c1', name: 'Mainland', areas: 2, rooms: 3 },
    { id: 'c2', name: 'Isles', areas: 1, rooms: 1 },
  ],
  areas: [
    { id: 'town', name: 'Town', continentId: 'c1', rooms: 2 },
    { id: 'forest', name: 'Forest', continentId: 'c1', rooms: 1 },
    { id: 'harbour', name: 'Harbour', continentId: 'c2', rooms: 1 },
  ],
};

function makeApi(hits: SearchHit[] = [], subzones: Record<string, { id: string; name: string }[]> = {}): WorldMapApi {
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
        map: {
          version: 1,
          continents: [
            {
              id: 'c1',
              name: 'Mainland',
              areas: [{ id, name: id, placement: null, subzones: (subzones[id] ?? [{ id: `${id}-main`, name: 'Main', kind: 'consistent' as const }]).map((s) => ({ ...s, kind: 'consistent' as const, rooms: [] })) }],
            },
          ],
          links: [],
        },
      },
    }),
    search: async (q) => ({ ok: true, value: { versionId: 'v1', q, total: hits.length, results: hits.filter((h) => h.title.toLowerCase().includes(q.toLowerCase())) } }),
    getRoomArea: async () => ({ ok: false, error: { kind: 'offline' } }),
  };
}

const world = { id: 'dsl', label: '' };
let store: LayerStore;
const onClose = jest.fn();

function open(props: Partial<React.ComponentProps<typeof AddRoomPanel>> = {}) {
  return render(
    <AddRoomPanel
      api={makeApi([hit('r1', 'Armoury Lane'), hit('r9', 'Armoury Lane', 'forest', 'Forest')])}
      store={store}
      world={world}
      observed={{ title: 'The House of Arms', exits: ['n', 's'], sector: 'inside' }}
      here={{ areaId: 'town', continentId: 'c1' }}
      onClose={onClose}
      {...props}
    />,
  );
}

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement | HTMLSelectElement;
const stored = async () => layerRooms(await store.get('dsl'));

beforeEach(() => {
  jest.clearAllMocks();
  __resetHistorySourcesForTests();
  let n = 0;
  store = createLayerStore(memoryKvStore(), () => ((n += 1) * 0.0371) % 1);
});

describe('AddRoomPanel for the room the player is in', () => {
  it('is filled in from the history: the title, the sector, the area they were last in, and the exits with the rooms they could lead to', async () => {
    registerHistorySource({
      label: 'your Copilot history',
      find: async () => [{ source: 'copilot', title: 'The House of Arms', sector: 'inside', exits: ['N', 'S'], neighbours: [{ dir: 'N', title: 'Armoury Lane' }, { dir: 'S', title: 'Unknown Road' }], visits: 3, sameExits: true }],
    });
    open();
    await screen.findByText(/Filled in from your Copilot history/);
    expect(field('Room title').value).toBe('The House of Arms');
    expect(field('Sector').value).toBe('inside');
    await waitFor(() => expect(field('Area').value).toBe('town'));
    expect(field('Continent').value).toBe('c1');
    await waitFor(() => expect(field('Subzone').value).toBe('town-main'));
    expect(screen.getByText('This game (the DSL)')).toBeInTheDocument();
    // two rooms are called Armoury Lane: the choice is the player's
    expect(field('Exit N leads to').value).toBe('');
    expect(within(field('Exit N leads to')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Not sure (history: Armoury Lane)', 'Armoury Lane · Town', 'Armoury Lane · Forest']);
    expect(within(field('Exit S leads to')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Not sure (history: Unknown Road)']);
  });

  it('saves the room into the player\'s layer with the chosen exits and closes', async () => {
    open();
    await screen.findByText(/Nothing in your history for this room yet/);
    await waitFor(() => expect(field('Subzone').value).toBe('town-main'));
    const find = field('Find a room for exit N');
    fireEvent.change(find, { target: { value: 'armoury' } });
    fireEvent.keyDown(find, { key: 'Enter' });
    await waitFor(() => expect(within(field('Exit N leads to')).getAllByRole('option').length).toBe(3));
    fireEvent.change(field('Exit N leads to'), { target: { value: 'r1' } });
    fireEvent.change(field('Sector'), { target: { value: 'city' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save room' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const added = buildIndex(await store.get('dsl'));
    const room = [...added.rooms.values()][0];
    expect(room).toMatchObject({ areaId: 'town', continentId: 'c1', subzoneId: 'town-main' });
    expect(room.room).toMatchObject({ title: 'The House of Arms', sector: 'city', sources: [{ kind: 'manual' }] });
    expect(added.links.size).toBe(2);
    expect([...added.links.values()].map((l) => [l.dir, l.to])).toEqual([['N', 'r1'], ['S', null]]);
  });

  it('says a room from history was walked, not typed', async () => {
    registerHistorySource({ label: 'x', find: async () => [{ source: 'browser', title: 'The House of Arms', exits: ['N'], neighbours: [], visits: 1, sameExits: true }] });
    open();
    await screen.findByText(/Filled in from x/);
    await waitFor(() => expect(field('Subzone').value).toBe('town-main'));
    fireEvent.click(screen.getByRole('button', { name: 'Save room' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect((await stored())[0].roomId).toBeDefined();
    expect(buildIndex(await store.get('dsl')).rooms.values().next().value?.room.sources).toEqual([expect.objectContaining({ kind: 'walked' })]);
  });

  it('files the room under a new area of an existing continent, with a new subzone', async () => {
    open();
    await waitFor(() => expect(field('Subzone').value).toBe('town-main'));
    fireEvent.change(field('Area'), { target: { value: '__new__' } });
    expect(field('Subzone').value).toBe('__new__');
    fireEvent.change(field('New area name'), { target: { value: 'Quarry' } });
    fireEvent.change(field('New subzone name'), { target: { value: 'Pit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save room' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect((await stored())[0]).toMatchObject({ continentId: 'c1', areaId: 'a-quarry', subzoneId: 's-pit', areaName: 'Quarry' });
  });

  it('moves to the first area of another continent, and to a new area when the continent is new', async () => {
    open();
    await waitFor(() => expect(field('Subzone').value).toBe('town-main'));
    fireEvent.change(field('Continent'), { target: { value: 'c2' } });
    await waitFor(() => expect(field('Area').value).toBe('harbour'));
    expect(within(field('Area')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Harbour', 'New…']);
    fireEvent.change(field('Continent'), { target: { value: '__new__' } });
    expect(field('Area').value).toBe('__new__');
    expect(field('Subzone').value).toBe('__new__');
    expect((field('New subzone name') as HTMLInputElement).value).toBe('Main');
    fireEvent.change(field('New continent name'), { target: { value: 'Far Isles' } });
    fireEvent.change(field('New area name'), { target: { value: 'Mist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save room' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect((await stored())[0]).toMatchObject({ continentId: 'c-far-isles', areaId: 'a-mist', subzoneId: 's-main' });
  });

  it('asks for what is missing: a title, then a name for each new place, and shows the reason the layer gives', async () => {
    open();
    await waitFor(() => expect(field('Subzone').value).toBe('town-main'));
    fireEvent.change(field('Room title'), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save room' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The room needs a title.');
    fireEvent.change(field('Room title'), { target: { value: 'The House of Arms' } });
    fireEvent.change(field('Area'), { target: { value: '__new__' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save room' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a continent, an area and a subzone');
    expect(onClose).not.toHaveBeenCalled();

    const refusing: LayerStore = { ...store, add: async () => ({ ok: false, reason: 'The layer is full.' }) };
    open({ store: refusing });
    await waitFor(() => expect(screen.getAllByLabelText('Subzone')[1]).toHaveValue('town-main'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Save room' })[1]);
    await waitFor(() => expect(screen.getAllByRole('alert').some((a) => a.textContent === 'The layer is full.')).toBe(true));
  });

  it('closes without saving on Cancel', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await stored()).toEqual([]);
  });

  it('says the game showed no exits when there are none', async () => {
    open({ observed: { title: 'Dark Room', exits: [] } });
    expect(await screen.findByText('The game showed no exits here.')).toBeInTheDocument();
  });
});

describe('AddRoomPanel by hand', () => {
  it('has the player tick the exits, find the rooms they lead to, and name the new place', async () => {
    open({ observed: null, here: null });
    expect(screen.getByRole('heading', { name: 'Add a room' })).toBeInTheDocument();
    expect(await screen.findByText('Tick the exits the room has.')).toBeInTheDocument();
    fireEvent.change(field('Room title'), { target: { value: 'Hidden Cellar' } });
    fireEvent.click(screen.getByLabelText('S'));
    fireEvent.click(screen.getByLabelText('N'));
    expect(screen.getAllByText(/^(N|S)$/, { selector: 'strong' }).map((e) => e.textContent)).toEqual(['N', 'S']); // in map order
    const find = field('Find a room for exit N');
    fireEvent.change(find, { target: { value: 'armoury' } });
    fireEvent.keyDown(find, { key: 'a' }); // other keys search nothing
    fireEvent.keyDown(find, { key: 'Enter' });
    await waitFor(() => expect(within(field('Exit N leads to')).getAllByRole('option').length).toBe(3));
    fireEvent.change(field('Exit N leads to'), { target: { value: 'r1' } });
    fireEvent.change(field('New continent name'), { target: { value: 'Under' } });
    fireEvent.change(field('New area name'), { target: { value: 'Caves' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save room' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const added = buildIndex(await store.get('dsl'));
    expect([...added.links.values()].map((l) => [l.dir, l.to])).toEqual([['N', 'r1'], ['S', null]]);
    expect((await stored())[0]).toMatchObject({ title: 'Hidden Cellar', continentId: 'c-under', areaId: 'a-caves' });
  });

  it('forgets an exit that is unticked, and a search of a short text finds nothing', async () => {
    open({ observed: null, here: null });
    await screen.findByText('Tick the exits the room has.');
    fireEvent.click(screen.getByLabelText('E'));
    expect(field('Exit E leads to')).toBeInTheDocument();
    const find = field('Find a room for exit E');
    fireEvent.change(find, { target: { value: 'a' } });
    fireEvent.keyDown(find, { key: 'Enter' });
    await act(async () => undefined);
    expect(within(field('Exit E leads to')).getAllByRole('option')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('E'));
    expect(screen.queryByLabelText('Exit E leads to')).toBeNull();
  });

  it('says the world is the game the client is connected to', async () => {
    open({ observed: null, here: null, world: { id: 'sandbox', label: 'Simulacrum' } });
    expect(await screen.findByText('Simulacrum')).toBeInTheDocument();
    expect(screen.getByText(/Saved in this browser for Simulacrum/)).toBeInTheDocument();
  });
});

describe('AddRoomPanel: rooms already added', () => {
  it('lists them and takes one back', async () => {
    await store.add('dsl', { title: 'Pier', place: { continent: 'Isles', area: 'Harbour', subzone: 'Docks' }, exits: {}, source: 'manual', at: '2026-11-12' });
    open({ observed: null, here: null });
    expect(await screen.findByText('Rooms I added (1)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pier' }));
    await waitFor(() => expect(screen.queryByText(/Rooms I added/)).toBeNull());
    expect(await stored()).toEqual([]);
  });

  it('does not list rooms of another world', async () => {
    await store.add('sandbox', { title: 'Pier', place: { continent: 'Isles', area: 'Harbour', subzone: 'Docks' }, exits: {}, source: 'manual', at: '2026-11-12' });
    open({ observed: null, here: null });
    await screen.findByText('Tick the exits the room has.');
    expect(screen.queryByText(/Rooms I added/)).toBeNull();
    await act(async () => void (await store.add('dsl', { title: 'Quay', place: { continent: 'Isles', area: 'Harbour', subzone: 'Docks' }, exits: {}, source: 'manual', at: '2026-11-12' })));
    expect(await screen.findByText('Rooms I added (1)')).toBeInTheDocument();
    await act(async () => void (await store.add('sandbox', { title: 'Other', place: { continent: 'Isles', area: 'Harbour', subzone: 'Docks' }, exits: {}, source: 'manual', at: '2026-11-12' })));
    expect(screen.getByText('Rooms I added (1)')).toBeInTheDocument();
  });
});

describe('AddRoomPanel: edge cases', () => {
  it('preselects the room an exit leads to when only one room has the title the history gives', async () => {
    registerHistorySource({
      label: 'your Copilot history',
      find: async () => [{ source: 'copilot', title: 'The House of Arms', exits: ['N'], neighbours: [{ dir: 'N', title: 'Unique Lane' }], visits: 2, sameExits: true }],
    });
    open({ api: makeApi([hit('r5', 'Unique Lane')]), observed: { title: 'The House of Arms', exits: ['N'] } });
    await waitFor(() => expect(field('Exit N leads to').value).toBe('r5'));
  });

  it('offers the existing areas of the continent, and keeps the subzone choice when another existing area is picked', async () => {
    open();
    await waitFor(() => expect(field('Subzone').value).toBe('town-main'));
    fireEvent.change(field('Area'), { target: { value: 'forest' } });
    await waitFor(() => expect(field('Subzone').value).toBe('forest-main'));
  });

  it('suggests a new subzone called Main for an area that has none', async () => {
    open({ api: makeApi([], { town: [] }) });
    await waitFor(() => expect(field('Area').value).toBe('town'));
    await act(async () => undefined); // its subzones were read: none
    expect((field('New subzone name') as HTMLInputElement).value).toBe('Main');
    expect(field('Subzone').value).toBe('__new__');
  });

  it('asks for a place when the map could not be read and none was suggested', async () => {
    const api: WorldMapApi = { ...makeApi(), getIndex: async () => ({ ok: false, error: { kind: 'offline' } }) };
    open({ api });
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Save room' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a continent, an area and a subzone');
  });

  it('ignores the subzones of an area that arrive after the panel was closed', async () => {
    let release: (value: ApiResult<LoadedArea>) => void = () => undefined;
    const base = makeApi();
    const slow: WorldMapApi = { ...base, getArea: () => new Promise((resolve) => (release = resolve)) };
    const view = open({ api: slow });
    await act(async () => undefined);
    view.unmount();
    const loaded = await base.getArea('town', new AbortController().signal);
    await act(async () => release(loaded));
    expect(screen.queryByRole('group', { name: 'Add a room' })).toBeNull();
  });

  it('ignores an answer that arrives after the panel was closed', async () => {
    let release: (value: ApiResult<WorldMapIndex>) => void = () => undefined;
    const slow: WorldMapApi = { ...makeApi(), getIndex: () => new Promise((resolve) => (release = resolve)) };
    const view = open({ api: slow });
    await act(async () => undefined); // the panel has asked for the index
    view.unmount();
    await act(async () => release({ ok: true, value: index }));
    expect(screen.queryByRole('group', { name: 'Add a room' })).toBeNull();
  });
});

describe('AddRoomPanel: closed at once', () => {
  it('does not update after it was closed before the saved rooms were read', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = open({ observed: null, here: null });
    view.unmount();
    await act(async () => undefined);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
