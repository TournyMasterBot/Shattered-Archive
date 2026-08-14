import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AreaFile,
  DiffSpawnStateResult,
  LiveSnapshot,
  RoomDrift,
  SimDoorState,
  SimMobGroup,
  SimObjectNode,
  SimulateResetsResult,
} from '@shatteredarchive/merc-area';
import { diffSpawnState } from '@shatteredarchive/merc-area';

import { api } from '../../api/client.js';
import { DOOR_NAMES } from '../../data/flags.js';
import '../areas/areas.css';

/**
 * AI-ANNOTATION
 * @ai-summary Simulate pane (Phase 13): renders GET /api/areas/:file/spawn —
 *   a per-room accordion of what actually spawns on FIRST BOOT (mobs with
 *   gear trees, room objects with nested contents, door states, randomized-
 *   exit rooms), warnings up top, a boot-state disclaimer, and a room filter.
 *   Phase 14c adds "Compare live": POST /api/state/refresh then polls GET
 *   /api/state/live for a fresh snapshot and diffs it against the boot-state
 *   simulation (merc-area's diffSpawnState) — missing mobs, extra/missing
 *   objects, live player counts, and door-state drift, annotated per room.
 * @ai-public SimulatePane (default)
 * @ai-notes Strictly a VIEW over the on-disk SAVED file (same convention as
 *   World/Map) — it does not reflect unsaved edits in the form above; a
 *   Refresh button re-fetches after a save. What is and isn't modeled lives
 *   in merc-area/simulate.ts's own header comment, not duplicated here. The
 *   live-compare poll bounds itself at ~10s and never throws into the render
 *   path — a game that never answers just shows a "did not respond" note.
 *   IMPORTANT: state.snapshot.json covers the WHOLE WORLD (state_snapshot.c
 *   has no concept of "area"), but the boot simulation is single-area — the
 *   live snapshot is filtered down to this area's own room vnums (from the
 *   `area` prop) BEFORE diffSpawnState ever sees it, or every OTHER area's
 *   populated rooms would show up as false "extra" drift (caught live during
 *   Phase 14c's own deploy verification: real cross-area rooms — 111 of
 *   them — surfaced as spurious drift before this filter was added).
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

/** Live drift entries carry vnums only (state_snapshot.c never emits a game string) — names resolve here, client-side, from the parsed model. */
function mobNames(area: AreaFile | null): Map<number, string> {
  const names = new Map<number, string>();
  for (const s of area?.sections ?? []) {
    if (s.kind === 'mobiles') for (const m of s.mobiles) names.set(m.vnum, m.shortDescr);
  }
  return names;
}

function objNames(area: AreaFile | null): Map<number, string> {
  const names = new Map<number, string>();
  for (const s of area?.sections ?? []) {
    if (s.kind === 'objects') for (const o of s.objects) names.set(o.vnum, o.shortDescr);
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

function RoomDetail({
  view,
  name,
  open,
  drift,
  mobNameOf,
  objNameOf,
  file,
  onEditRoom,
}: {
  view: RoomView;
  name?: string;
  open?: boolean;
  drift?: RoomDrift;
  mobNameOf: Map<number, string>;
  objNameOf: Map<number, string>;
  file: string;
  /** Reverse of RoomEditor's "See what spawns here" link — jumps to the Rooms tab's editor for this room. */
  onEditRoom?: (vnum: number, file: string) => void;
}) {
  const mobCount = view.mobs.reduce((n, g) => n + g.count, 0);
  const bits = [
    mobCount > 0 ? `${mobCount} mob${mobCount === 1 ? '' : 's'}` : '',
    view.objects.length > 0 ? `${view.objects.length} object${view.objects.length === 1 ? '' : 's'}` : '',
    view.doors.length > 0 ? `${view.doors.length} door${view.doors.length === 1 ? '' : 's'}` : '',
    view.randomized ? 'randomized exits' : '',
    drift ? 'drift' : '',
  ].filter(Boolean);
  return (
    <details className="mb-spawn-room" open={open || !!drift}>
      <summary>
        Room #{view.room}
        {name ? ` — ${name}` : ''}
        {bits.length > 0 ? ` (${bits.join(', ')})` : ' (nothing spawns here)'}
        {onEditRoom && (
          <button
            type="button"
            className="mb-ref-link mb-room-edit-link"
            onClick={(e) => {
              // The button lives inside <summary> — without this, the click would also
              // bubble into the browser's native details-toggle handler.
              e.preventDefault();
              e.stopPropagation();
              onEditRoom(view.room, file);
            }}
          >
            Edit this room →
          </button>
        )}
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
      {drift && (
        <div className="mb-spawn-drift">
          {drift.missingMobs.length > 0 && (
            <ul className="mb-spawn-list mb-spawn-drift-missing">
              {drift.missingMobs.map((m, i) => (
                <li key={i}>
                  ▼ #{m.vnum} {mobNameOf.get(m.vnum) ?? 'mob'} — expected {m.expected}, live {m.actual}
                </li>
              ))}
            </ul>
          )}
          {drift.extraObjects.length > 0 && (
            <ul className="mb-spawn-list mb-spawn-drift-extra">
              {drift.extraObjects.map((o, i) => (
                <li key={i}>
                  ▲ #{o.vnum} {objNameOf.get(o.vnum) ?? 'object'} — {o.count} extra (likely player-dropped)
                </li>
              ))}
            </ul>
          )}
          {drift.missingObjects.length > 0 && (
            <ul className="mb-spawn-list mb-spawn-drift-missing">
              {drift.missingObjects.map((o, i) => (
                <li key={i}>
                  ▼ #{o.vnum} {objNameOf.get(o.vnum) ?? 'object'} — expected {o.expected}, live {o.actual}
                </li>
              ))}
            </ul>
          )}
          {drift.doorChanges.length > 0 && (
            <ul className="mb-spawn-list">
              {drift.doorChanges.map((d, i) => (
                <li key={i}>
                  {DOOR_NAMES[d.door] ?? `door ${d.door}`}: boot <strong>{d.boot}</strong> → live <strong>{d.live}</strong>
                </li>
              ))}
            </ul>
          )}
          {drift.players > 0 && (
            <p className="mb-muted">
              👤 {drift.players} player{drift.players === 1 ? '' : 's'} here now
            </p>
          )}
        </div>
      )}
    </details>
  );
}

export default function SimulatePane({
  file,
  area,
  initialRoomTarget,
  onEditRoom,
}: {
  file: string | null;
  area: AreaFile | null;
  /** Cross-tab hand-off (e.g. the Rooms tab's RoomEditor "See what spawns here" link) — jumps the filter to this room. */
  initialRoomTarget?: { vnum: number } | null;
  /** Reverse of the above — jumps to the Rooms tab's editor for a room shown here. */
  onEditRoom?: (vnum: number, file: string) => void;
}) {
  const [result, setResult] = useState<SimulateResetsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [drift, setDrift] = useState<DiffSpawnStateResult | null>(null);
  const [driftAgeMs, setDriftAgeMs] = useState<number | null>(null);
  const [driftLoading, setDriftLoading] = useState(false);
  const [driftError, setDriftError] = useState<string | null>(null);

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

  // Boot-state and live-state are two different questions about two different snapshots —
  // switching areas invalidates any drift we were showing for the old one.
  useEffect(() => {
    setDrift(null);
    setDriftAgeMs(null);
    setDriftError(null);
  }, [file]);

  // state.snapshot.json covers the whole world, not just this area — scope it down to
  // THIS area's own room vnums before diffing (see @ai-notes above).
  const areaRoomVnums = useMemo(() => {
    const vnums = new Set<number>();
    for (const s of area?.sections ?? []) {
      if (s.kind === 'rooms') for (const r of s.rooms) vnums.add(r.vnum);
    }
    return vnums;
  }, [area]);

  const compareLive = useCallback(async () => {
    if (!file || !result) return;
    setDriftLoading(true);
    setDriftError(null);
    try {
      let previousTs: number | null = null;
      try {
        previousTs = (await api.stateLive()).snapshot.ts;
      } catch {
        previousTs = null; // no snapshot on record yet — the next one to appear counts as fresh
      }

      await api.stateRefresh();

      const deadline = Date.now() + 10_000;
      let fresh: Awaited<ReturnType<typeof api.stateLive>> | null = null;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const live = await api.stateLive();
          if (previousTs === null || live.snapshot.ts !== previousTs) {
            fresh = live;
            break;
          }
        } catch {
          // no snapshot yet — keep polling until the deadline
        }
      }

      if (!fresh) {
        setDriftError('The game did not respond — is it running with the new engine? Are writes enabled?');
        return;
      }
      const scoped: LiveSnapshot = {
        ts: fresh.snapshot.ts,
        rooms: fresh.snapshot.rooms.filter((r) => areaRoomVnums.has(r.vnum)),
      };
      setDrift(diffSpawnState(result, scoped));
      setDriftAgeMs(fresh.ageMs);
    } catch (e) {
      setDriftError((e as Error).message);
    } finally {
      setDriftLoading(false);
    }
  }, [file, result]);

  if (!file) return null;

  const names = roomNames(area);
  const mobNameOf = mobNames(area);
  const objNameOf = objNames(area);
  const rooms = result ? mergeRooms(result) : [];
  const q = filter.trim().toLowerCase();
  const filtered = q ? rooms.filter((r) => String(r.room).includes(q) || (names.get(r.room) ?? '').toLowerCase().includes(q)) : rooms;
  const driftByRoom = new Map((drift?.rooms ?? []).map((d) => [d.room, d]));

  return (
    <div className="mb-simulate">
      <p className="mb-muted">
        Simulated FIRST-BOOT spawn state only — what #RESETS produces on a fresh boot, straight from the saved file.
        It does not reflect unsaved edits above. "Compare live" additionally shows drift against the RUNNING game
        (kills, loot, player drops, doors left open) as of the moment you ask.
      </p>
      <div className="mb-row">
        <button type="button" onClick={load}>
          Refresh
        </button>
        <button type="button" onClick={() => void compareLive()} disabled={!result || driftLoading}>
          {driftLoading ? 'Comparing…' : 'Compare live'}
        </button>
        <label className="mb-field">
          <span>Filter rooms</span>
          <input aria-label="Filter rooms" type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="vnum or name" />
        </label>
      </div>

      {error && <p className="mb-toast mb-toast--err">{error}</p>}
      {!result && !error && <p className="mb-muted">Loading…</p>}
      {driftError && <p className="mb-toast mb-toast--err">{driftError}</p>}
      {drift && (
        <p className="mb-muted">
          Live as of {driftAgeMs !== null ? Math.max(0, Math.round(driftAgeMs / 1000)) : '?'}s ago — {drift.summary.roomsWithDrift} room
          {drift.summary.roomsWithDrift === 1 ? '' : 's'} drifted ({drift.summary.mobsMissing} mob
          {drift.summary.mobsMissing === 1 ? '' : 's'} missing, {drift.summary.objectsExtra} extra object
          {drift.summary.objectsExtra === 1 ? '' : 's'}) · <button type="button" onClick={() => void compareLive()}>Refresh</button>
        </p>
      )}

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
            <RoomDetail
              key={r.room}
              view={r}
              name={names.get(r.room)}
              open={q.length > 0 && filtered.length === 1}
              drift={driftByRoom.get(r.room)}
              mobNameOf={mobNameOf}
              objNameOf={objNameOf}
              file={file}
              onEditRoom={onEditRoom}
            />
          ))}
        </div>
      )}
    </div>
  );
}
