import { useCallback, useEffect, useState } from 'react';
import type {
  AreaFile,
  SimDoorState,
  SimMobGroup,
  SimObjectNode,
  SimulateResetsResult,
} from '@shatteredarchive/merc-area';

import { api } from '../../api/client.js';
import { DOOR_NAMES } from '../../data/flags.js';
import '../areas/areas.css';

/**
 * AI-ANNOTATION
 * @ai-summary Simulate pane (Phase 13): renders GET /api/areas/:file/spawn —
 *   a per-room accordion of what actually spawns on FIRST BOOT (mobs with
 *   gear trees, room objects with nested contents, door states, randomized-
 *   exit rooms), warnings up top, a boot-state disclaimer, and a room filter.
 * @ai-public SimulatePane (default)
 * @ai-notes Strictly a VIEW over the on-disk SAVED file (same convention as
 *   World/Map) — it does not reflect unsaved edits in the form above; a
 *   Refresh button re-fetches after a save. What is and isn't modeled lives
 *   in merc-area/simulate.ts's own header comment, not duplicated here.
 */

interface RoomView {
  room: number;
  mobs: SimMobGroup[];
  objects: SimObjectNode[];
  doors: SimDoorState[];
  randomized: boolean;
}

/** The API groups by "has a spawn" (rooms) vs. flat door/randomized lists — merge them into one view per room for the accordion. */
function mergeRooms(result: SimulateResetsResult): RoomView[] {
  const map = new Map<number, RoomView>();
  const get = (room: number): RoomView => {
    let v = map.get(room);
    if (!v) {
      v = { room, mobs: [], objects: [], doors: [], randomized: false };
      map.set(room, v);
    }
    return v;
  };
  for (const r of result.rooms) {
    const v = get(r.room);
    v.mobs = r.mobs;
    v.objects = r.objects;
  }
  for (const d of result.doors) get(d.room).doors.push(d);
  for (const room of result.randomizedExits) get(room).randomized = true;
  return [...map.values()].sort((a, b) => a.room - b.room);
}

function roomNames(area: AreaFile | null): Map<number, string> {
  const names = new Map<number, string>();
  for (const s of area?.sections ?? []) {
    if (s.kind === 'rooms') for (const r of s.rooms) names.set(r.vnum, r.name);
  }
  return names;
}

function ObjectTree({ node, prefix }: { node: SimObjectNode; prefix?: string }) {
  return (
    <li>
      {prefix && <span className="mb-muted">{prefix}: </span>}#{node.vnum} {node.name}
      {node.contents.length > 0 && (
        <ul className="mb-spawn-contents">
          {node.contents.map((c, i) => (
            <ObjectTree key={i} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

function MobGroupView({ group }: { group: SimMobGroup }) {
  return (
    <li className="mb-spawn-mob">
      #{group.vnum} {group.name}
      {group.count > 1 && <span className="mb-muted"> ×{group.count}</span>}
      {(group.equipped.length > 0 || group.carried.length > 0) && (
        <ul className="mb-spawn-gear">
          {group.equipped.map((e) => (
            <ObjectTree key={`e-${e.slot}-${e.vnum}`} node={e} prefix={e.slot} />
          ))}
          {group.carried.map((c, i) => (
            <ObjectTree key={`c-${i}`} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

function RoomDetail({ view, name, open }: { view: RoomView; name?: string; open?: boolean }) {
  const mobCount = view.mobs.reduce((n, g) => n + g.count, 0);
  const bits = [
    mobCount > 0 ? `${mobCount} mob${mobCount === 1 ? '' : 's'}` : '',
    view.objects.length > 0 ? `${view.objects.length} object${view.objects.length === 1 ? '' : 's'}` : '',
    view.doors.length > 0 ? `${view.doors.length} door${view.doors.length === 1 ? '' : 's'}` : '',
    view.randomized ? 'randomized exits' : '',
  ].filter(Boolean);
  return (
    <details className="mb-spawn-room" open={open}>
      <summary>
        Room #{view.room}
        {name ? ` — ${name}` : ''}
        {bits.length > 0 ? ` (${bits.join(', ')})` : ' (nothing spawns here)'}
      </summary>
      {view.mobs.length > 0 && (
        <ul className="mb-spawn-list">
          {view.mobs.map((g, i) => (
            <MobGroupView key={i} group={g} />
          ))}
        </ul>
      )}
      {view.objects.length > 0 && (
        <ul className="mb-spawn-list">
          {view.objects.map((o, i) => (
            <ObjectTree key={i} node={o} />
          ))}
        </ul>
      )}
      {view.doors.length > 0 && (
        <ul className="mb-spawn-list">
          {view.doors.map((d, i) => (
            <li key={i}>
              {DOOR_NAMES[d.door] ?? `door ${d.door}`}: <strong>{d.state}</strong>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export default function SimulatePane({
  file,
  area,
  initialRoomTarget,
}: {
  file: string | null;
  area: AreaFile | null;
  /** Cross-tab hand-off (e.g. the Areas tab's RoomEditor "See what spawns here" link) — jumps the filter to this room. */
  initialRoomTarget?: { vnum: number } | null;
}) {
  const [result, setResult] = useState<SimulateResetsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    if (!file) return;
    setResult(null);
    setError(null);
    api
      .spawn(file)
      .then(setResult)
      .catch((e) => setError((e as Error).message));
  }, [file]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (initialRoomTarget) setFilter(String(initialRoomTarget.vnum));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoomTarget]);

  if (!file) return null;

  const names = roomNames(area);
  const rooms = result ? mergeRooms(result) : [];
  const q = filter.trim().toLowerCase();
  const filtered = q ? rooms.filter((r) => String(r.room).includes(q) || (names.get(r.room) ?? '').toLowerCase().includes(q)) : rooms;

  return (
    <div className="mb-simulate">
      <p className="mb-muted">
        Simulated FIRST-BOOT spawn state only — what #RESETS produces on a fresh boot, straight from the saved file.
        It does not reflect unsaved edits above, and does not model repop drift once players are on (kills, spawns
        already alive).
      </p>
      <div className="mb-row">
        <button type="button" onClick={load}>
          Refresh
        </button>
        <label className="mb-field">
          <span>Filter rooms</span>
          <input aria-label="Filter rooms" type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="vnum or name" />
        </label>
      </div>

      {error && <p className="mb-toast mb-toast--err">{error}</p>}
      {!result && !error && <p className="mb-muted">Loading…</p>}

      {result && result.warnings.length > 0 && (
        <div className="mb-spawn-warnings">
          {result.warnings.map((w) => (
            <p key={w} className="mb-warning">
              {w}
            </p>
          ))}
        </div>
      )}

      {result && (
        <div className="mb-spawn-rooms">
          {filtered.length === 0 && <p className="mb-muted">No rooms match.</p>}
          {filtered.map((r) => (
            <RoomDetail key={r.room} view={r} name={names.get(r.room)} open={q.length > 0 && filtered.length === 1} />
          ))}
        </div>
      )}
    </div>
  );
}
