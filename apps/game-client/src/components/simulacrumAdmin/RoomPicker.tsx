// apps/game-client/src/components/simulacrumAdmin/RoomPicker.tsx
import React from 'react';
import styles from '../../styles/SimulacrumAdminWindow.module.scss';
import type { WorldIndex } from '../../features/simulacrumAdmin/useWorldIndex';
import type { WorldArea, WorldRoom } from '../../features/simulacrumAdmin/worldApi';
import { describeFetch, filterAreas, filterRooms } from '../../features/simulacrumAdmin/worldFilter';

export interface PickedRoom {
  vnum: number;
  name: string;
  areaFile: string;
  areaName?: string;
}

interface RoomPickerProps {
  index: WorldIndex;
  onPick: (room: PickedRoom) => void;
  /** The vnum of the room picked so far, kept marked in the list. */
  picked?: number;
}

/** Rows drawn at most: the rest is one "N more" line (E9). 3,200 rooms are never all in the page. */
const MAX_ROWS = 200;

type Scope = 'area' | 'opened';

/**
 * Choose a room: filter the areas (name, file or vnum), open one to list its rooms, then narrow the rooms by vnum (exact, prefix or a-b)
 * or name, in that area or in every area opened so far. Reads only through the shared world index.
 */
const RoomPicker: React.FC<RoomPickerProps> = ({ index, onPick, picked }) => {
  const [areaQuery, setAreaQuery] = React.useState('');
  const [roomQuery, setRoomQuery] = React.useState('');
  const [scope, setScope] = React.useState<Scope>('area');
  const [areaFile, setAreaFile] = React.useState<string | undefined>();

  const state = index.areas;
  const areaList = state.status === 'ready' ? state.data : undefined;
  const areas = React.useMemo(() => (areaList ? filterAreas(areaList, areaQuery) : []), [areaList, areaQuery]);
  const openedRooms = areaFile ? index.rooms.get(areaFile) : undefined;

  const openArea = (file: string): void => {
    setAreaFile(file);
    index.loadRooms(file);
  };

  const changeRoomQuery = (value: string): void => {
    setRoomQuery(value);
    // a vnum typed while searching every opened area opens the area that holds it, so "go to 3001" needs no click first
    const vnum = /^\d+$/.test(value.trim()) ? Number(value.trim()) : undefined;
    if (scope === 'opened' && vnum !== undefined && areaList) {
      for (const a of areaList) if (a.minVnum !== undefined && a.maxVnum !== undefined && vnum >= a.minVnum && vnum <= a.maxVnum) index.loadRooms(a.file);
    }
  };

  const candidates = React.useMemo((): Array<{ room: WorldRoom; area: WorldArea }> => {
    if (!areaList) return [];
    const files = scope === 'area' ? (areaFile ? [areaFile] : []) : [...index.rooms.keys()];
    return files.flatMap((file) => {
      const state = index.rooms.get(file);
      const area = areaList.find((a) => a.file === file);
      if (state?.status !== 'ready' || !area) return [];
      return filterRooms(state.data, roomQuery).map((room) => ({ room, area }));
    });
  }, [areaList, scope, areaFile, index.rooms, roomQuery]);
  const shown = candidates.slice(0, MAX_ROWS);

  if (state.status === 'idle' || state.status === 'loading') {
    return <p className={styles.empty}>Loading the areas…</p>;
  }
  if (state.status !== 'ready') {
    return (
      <div className={styles.notice} role="alert">
        <p>{state.message}</p>
        <button type="button" className={styles.smallButton} onClick={index.refresh}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={styles.picker}>
      <div className={styles.toolbar}>
        <span className={styles.size}>{describeFetch(state.at)}</span>
        <button type="button" className={styles.smallButton} onClick={index.refresh}>
          Refresh
        </button>
      </div>

      <div className={styles.commandsSplit}>
        <div className={styles.pickerColumn}>
          <input
            type="search"
            className={styles.input}
            placeholder="Filter areas: name, file or vnum"
            aria-label="Filter areas"
            value={areaQuery}
            onChange={(e) => setAreaQuery(e.target.value)}
          />
          <ul className={styles.commandList} aria-label="Areas">
            {areas.length === 0 && <li className={styles.empty}>No area matches.</li>}
            {areas.slice(0, MAX_ROWS).map((a) => (
              <li key={a.file}>
                <button type="button" className={styles.commandButton} aria-pressed={a.file === areaFile} onClick={() => openArea(a.file)}>
                  <span className={styles.commandName}>{a.name ?? a.file}</span>
                  {a.parseError && <span className={styles.badgeBad}>unreadable</span>}
                  <span className={styles.size}>
                    {a.minVnum !== undefined && a.maxVnum !== undefined ? `${a.minVnum}-${a.maxVnum}` : a.file}
                  </span>
                </button>
              </li>
            ))}
            {areas.length > MAX_ROWS && <li className={styles.size}>{areas.length - MAX_ROWS} more: narrow the filter.</li>}
          </ul>
        </div>

        <div className={styles.pickerColumn}>
          <div className={styles.toolbar}>
            <input
              type="search"
              className={styles.input}
              placeholder="Find a room: vnum, 3000-3099 or name"
              aria-label="Find a room"
              value={roomQuery}
              onChange={(e) => changeRoomQuery(e.target.value)}
            />
            <select className={styles.select} aria-label="Search in" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="area">This area</option>
              <option value="opened">All opened areas</option>
            </select>
          </div>

          {scope === 'area' && !areaFile && <p className={styles.empty}>Pick an area on the left, or search all opened areas.</p>}
          {scope === 'area' && openedRooms?.status === 'loading' && <p className={styles.empty}>Loading the rooms…</p>}
          {scope === 'area' && (openedRooms?.status === 'offline' || openedRooms?.status === 'error') && areaFile && (
            <div className={styles.notice} role="alert">
              <p>{openedRooms.message}</p>
              <button type="button" className={styles.smallButton} onClick={() => index.reloadRooms(areaFile)}>
                Try again
              </button>
            </div>
          )}

          <ul className={styles.commandList} aria-label="Rooms">
            {shown.map(({ room, area }) => (
              <li key={`${area.file}:${room.vnum}`}>
                <button
                  type="button"
                  className={styles.commandButton}
                  aria-pressed={room.vnum === picked}
                  aria-label={`Pick room ${room.vnum} ${room.name}`}
                  onClick={() => onPick({ vnum: room.vnum, name: room.name, areaFile: area.file, areaName: area.name })}
                >
                  <span className={styles.vnum}>{room.vnum}</span>
                  <span className={styles.commandName}>{room.name}</span>
                  {scope === 'opened' && <span className={styles.size}>{area.name ?? area.file}</span>}
                </button>
              </li>
            ))}
            {candidates.length > MAX_ROWS && <li className={styles.size}>{candidates.length - MAX_ROWS} more: narrow the search.</li>}
          </ul>
          {(scope === 'opened' || openedRooms?.status === 'ready') && candidates.length === 0 && <p className={styles.empty}>No room matches.</p>}
          {scope === 'opened' && <p className={styles.counts}>Only areas you have opened (or whose vnum range holds a number you typed) are searched.</p>}
        </div>
      </div>
    </div>
  );
};

export default RoomPicker;
