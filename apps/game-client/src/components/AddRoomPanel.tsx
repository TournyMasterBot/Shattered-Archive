// apps/game-client/src/components/AddRoomPanel.tsx
//
// The map window's "add a room" panel: a room the published map does not have (or that the player wants on their own map), filed under a
// continent, an area and a subzone. It lies over the picture inside the map window (no extra dialog). Filled in from the player's own game
// history when a source knows the room (Copilot's walked layer, else what this browser has seen), with the rooms its exits lead to offered as
// choices; or typed by hand. A save goes to the player's own layer in this browser, never to the published map. The world is fixed: the
// layer belongs to the game the client is connected to.

import React from 'react';
import { DIRECTIONS, layerRooms, type Direction } from '@shatteredarchive/shattered-maps-core';
import styles from '../styles/WorldMapWindow.module.scss';
import type { WorldMapApi } from '../features/worldmap/api';
import {
  findRooms,
  loadDraft,
  saveRoom,
  subzonesOf,
  type DraftData,
  type Here,
  type Observed,
  type PlaceChoice,
  type RoomChoice,
} from '../features/worldmap/mine/draft';
import type { LayerStore } from '../features/worldmap/mine/layerStore';

const NEW = '__new__';
const NONE = '';

export interface AddRoomPanelProps {
  api: WorldMapApi;
  store: LayerStore;
  /** The world the layer belongs to (never chosen here). */
  world: { id: string; label: string };
  /** The room the player is standing in; null to type a room in by hand. */
  observed: Observed | null;
  /** The area the player was last found in: where the room is filed unless they say otherwise. */
  here: Here | null;
  onClose: () => void;
}

interface Pick {
  /** An existing id, or NEW. */
  value: string;
  /** The name of a new one. */
  name: string;
}

const today = (): string => new Date().toISOString().slice(0, 10);

function choiceOf(pick: Pick, options: { id: string; name: string }[]): PlaceChoice | null {
  if (pick.value === NEW) return pick.name.trim() === '' ? null : { kind: 'new', name: pick.name.trim() };
  const found = options.find((o) => o.id === pick.value);
  return found ? { kind: 'existing', id: found.id, name: found.name } : null;
}

/** One of the three place selects: the existing options, "New…", and a name box when New is chosen. */
const PlaceSelect: React.FC<{
  label: string;
  pick: Pick;
  options: { id: string; name: string }[];
  onChange: (pick: Pick) => void;
}> = ({ label, pick, options, onChange }) => (
  <>
    <label htmlFor={`add-${label}`}>{label}</label>
    <span>
      <select id={`add-${label}`} aria-label={label} value={pick.value} onChange={(e) => onChange({ value: e.target.value, name: pick.name })}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
        <option value={NEW}>New…</option>
      </select>
      {pick.value === NEW && (
        <input
          type="text"
          aria-label={`New ${label.toLowerCase()} name`}
          placeholder={`Name of the new ${label.toLowerCase()}`}
          maxLength={200}
          value={pick.name}
          onChange={(e) => onChange({ value: NEW, name: e.target.value })}
        />
      )}
    </span>
  </>
);

const AddRoomPanel: React.FC<AddRoomPanelProps> = ({ api, store, world, observed, here, onClose }) => {
  const [data, setData] = React.useState<DraftData | null>(null);
  const [title, setTitle] = React.useState(observed?.title ?? '');
  const [sector, setSector] = React.useState('');
  const [continent, setContinent] = React.useState<Pick>({ value: NEW, name: '' });
  const [area, setArea] = React.useState<Pick>({ value: NEW, name: '' });
  const [subzone, setSubzone] = React.useState<Pick>({ value: NEW, name: 'Main' });
  const [subzones, setSubzones] = React.useState<{ id: string; name: string }[]>([]);
  const [manualDirs, setManualDirs] = React.useState<Direction[]>([]);
  const [targets, setTargets] = React.useState<Partial<Record<Direction, string>>>({});
  const [found, setFound] = React.useState<Partial<Record<Direction, RoomChoice[]>>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [mine, setMine] = React.useState<{ roomId: string; title: string; areaName: string }[]>([]);

  // ---- what is known about the room, and the places it can go ----
  React.useEffect(() => {
    const controller = new AbortController();
    void loadDraft(api, world.id, observed ?? { title: '', exits: [] }, here, controller.signal).then((loaded) => {
      if (controller.signal.aborted) return;
      setData(loaded);
      setSector(loaded.sector);
      if (loaded.defaultPlace) {
        setContinent({ value: loaded.defaultPlace.continentId, name: '' });
        setArea({ value: loaded.defaultPlace.areaId, name: '' });
      }
      const preset: Partial<Record<Direction, string>> = {};
      for (const row of loaded.exits) if (row.preselected !== null) preset[row.dir] = row.preselected;
      setTargets(preset);
    });
    return () => controller.abort();
    // the panel is opened for one room: reading it again while it is open would throw away what was typed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the subzones of the chosen area (the first is preselected; a new area has none)
  React.useEffect(() => {
    if (area.value === NEW) return;
    const controller = new AbortController();
    void subzonesOf(api, area.value, controller.signal).then((list) => {
      if (controller.signal.aborted) return;
      setSubzones(list);
      setSubzone(list.length > 0 ? { value: list[0].id, name: '' } : { value: NEW, name: 'Main' });
    });
    return () => controller.abort();
  }, [api, area.value]);

  // the rooms already added in this world, so one can be taken back
  React.useEffect(() => {
    let live = true;
    const refresh = (): void => {
      void store.get(world.id).then((layer) => {
        if (live) setMine(layerRooms(layer).map((r) => ({ roomId: r.roomId, title: r.title, areaName: r.areaName })));
      });
    };
    refresh();
    const off = store.subscribe((changed) => changed === world.id && refresh());
    return () => {
      live = false;
      off();
    };
  }, [store, world.id]);

  const places = data?.places ?? { continents: [], areas: [] };
  const areaOptions = continent.value === NEW ? [] : places.areas.filter((a) => a.continentId === continent.value);
  const directions: Direction[] = observed ? (data?.exits.map((r) => r.dir) ?? []) : manualDirs;
  const rowFor = (dir: Direction) => data?.exits.find((r) => r.dir === dir);

  const onContinent = (next: Pick): void => {
    setContinent(next);
    const first = next.value === NEW ? undefined : places.areas.find((a) => a.continentId === next.value);
    if (first) setArea({ value: first.id, name: '' });
    else {
      setArea({ value: NEW, name: '' });
      setSubzone({ value: NEW, name: 'Main' });
      setSubzones([]);
    }
  };

  const onArea = (next: Pick): void => {
    setArea(next);
    if (next.value === NEW) {
      setSubzone({ value: NEW, name: 'Main' });
      setSubzones([]);
    }
  };

  const search = async (dir: Direction, text: string): Promise<void> => {
    const rooms = await findRooms(api, text, new AbortController().signal);
    setFound((f) => ({ ...f, [dir]: rooms }));
  };

  const submit = async (): Promise<void> => {
    const continentChoice = choiceOf(continent, places.continents);
    const areaChoice = choiceOf(area, areaOptions);
    const subzoneChoice = choiceOf(subzone, subzones);
    if (title.trim() === '') return setError('The room needs a title.');
    if (!continentChoice || !areaChoice || !subzoneChoice) return setError('Choose a continent, an area and a subzone, or give the new ones a name.');
    setSaving(true);
    setError(null);
    const exits: Partial<Record<Direction, string | null>> = {};
    for (const dir of directions) exits[dir] = (targets[dir] ?? NONE) === NONE ? null : (targets[dir] as string);
    const result = await saveRoom(
      store,
      world.id,
      { title, sector, source: data?.historyLabel ? 'walked' : 'manual', exits, continent: continentChoice, area: areaChoice, subzone: subzoneChoice },
      today(),
    );
    setSaving(false);
    if (result.ok) onClose();
    else setError(result.reason);
  };

  return (
    <div className={styles.addPanel} role="group" aria-label="Add a room" data-ui>
      <h3>{observed ? 'Add this room' : 'Add a room'}</h3>
      <p>
        Saved in this browser for {world.label === '' ? 'this game' : world.label}, on top of the published map. It is not added to the published map.
        {data?.historyLabel ? ` Filled in from ${data.historyLabel}.` : observed && data ? ' Nothing in your history for this room yet.' : ''}
      </p>

      <fieldset>
        <legend>The room</legend>
        <div className={styles.addRow}>
          <label htmlFor="add-title">Room title</label>
          <input id="add-title" type="text" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          <label htmlFor="add-sector">Sector</label>
          <input id="add-sector" type="text" maxLength={200} placeholder="inside, city, forest… (optional)" value={sector} onChange={(e) => setSector(e.target.value)} />
        </div>
      </fieldset>

      <fieldset>
        <legend>Where it goes</legend>
        <div className={styles.addRow}>
          <span>World</span>
          <span>{world.label === '' ? 'This game (the DSL)' : world.label}</span>
          <PlaceSelect label="Continent" pick={continent} options={places.continents} onChange={onContinent} />
          <PlaceSelect label="Area" pick={area} options={areaOptions} onChange={onArea} />
          <PlaceSelect label="Subzone" pick={subzone} options={subzones} onChange={setSubzone} />
        </div>
      </fieldset>

      <fieldset>
        <legend>Exits</legend>
        {!observed && (
          <div className={styles.addExit} role="group" aria-label="Which exits the room has">
            {DIRECTIONS.map((dir) => (
              <label key={dir}>
                <input
                  type="checkbox"
                  checked={manualDirs.includes(dir)}
                  onChange={(e) => setManualDirs((list) => (e.target.checked ? DIRECTIONS.filter((d) => d === dir || list.includes(d)) : list.filter((d) => d !== dir)))}
                />
                {dir}
              </label>
            ))}
          </div>
        )}
        {directions.length === 0 && <p>{observed ? 'The game showed no exits here.' : 'Tick the exits the room has.'}</p>}
        {directions.map((dir) => {
          const row = rowFor(dir);
          const options = [...(row?.choices ?? []), ...(found[dir] ?? [])].filter((c, i, all) => all.findIndex((o) => o.roomId === c.roomId) === i);
          return (
            <div key={dir} className={styles.addExit}>
              <strong>{dir}</strong>
              <select
                aria-label={`Exit ${dir} leads to`}
                value={targets[dir] ?? NONE}
                onChange={(e) => setTargets((t) => ({ ...t, [dir]: e.target.value }))}
              >
                <option value={NONE}>{row?.suggestedTitle ? `Not sure (history: ${row.suggestedTitle})` : "I don't know"}</option>
                {options.map((c) => (
                  <option key={c.roomId} value={c.roomId}>
                    {c.title} · {c.areaName}
                  </option>
                ))}
              </select>
              <input
                type="text"
                aria-label={`Find a room for exit ${dir}`}
                placeholder="Find a room…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void search(dir, e.currentTarget.value);
                  }
                }}
              />
            </div>
          );
        })}
      </fieldset>

      <div className={styles.addActions}>
        <button type="button" onClick={() => void submit()} disabled={saving}>
          Save room
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
      {error && (
        <p className={styles.addError} role="alert">
          {error}
        </p>
      )}

      {mine.length > 0 && (
        <div className={styles.addMine}>
          <strong>Rooms I added ({mine.length})</strong>
          <ul>
            {mine.map((r) => (
              <li key={r.roomId}>
                <span>
                  {r.title} · {r.areaName}
                </span>
                <button type="button" aria-label={`Remove ${r.title}`} onClick={() => void store.remove(world.id, r.roomId)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AddRoomPanel;
