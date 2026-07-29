import type { AreaFile, Room, RoomsSection } from '@shatteredarchive/merc-area';

import { DOOR_NAMES, LOCK_STATES } from '../../data/flags.js';

/**
 * Read-only "how does this room fit into the area" panel: for each exit,
 * direction, resolved target (this area's own rooms only — no server round
 * trip), and lock state. Pure presentation, no fetches, no mutation — shared
 * between RoomsPage (the room-editor's own visualization) and AreasPage's
 * read-only room view.
 */
export default function RoomConnections({ room, area }: { room: Room; area: AreaFile | null }) {
  const roomsSection = area?.sections.find((s): s is RoomsSection => s.kind === 'rooms');
  const localRooms = new Map((roomsSection?.rooms ?? []).map((r) => [r.vnum, r]));

  return (
    <fieldset className="mb-fieldset mb-room-connections">
      <legend>Exits &amp; connections ({room.exits.length})</legend>
      {room.exits.length === 0 ? (
        <p className="mb-muted">This room has no exits.</p>
      ) : (
        <ul className="mb-connections-list">
          {room.exits.map((ex, i) => {
            const target = localRooms.get(ex.toVnum);
            const lock = LOCK_STATES.find((l) => l.value === ex.locks)?.label ?? `lock state ${ex.locks}`;
            return (
              <li key={i}>
                <strong>{DOOR_NAMES[ex.door] ?? `door ${ex.door}`}</strong> →{' '}
                {target ? (
                  <>
                    #{target.vnum} {target.name}
                  </>
                ) : (
                  <span className="mb-muted">#{ex.toVnum} (external / not in this area)</span>
                )}{' '}
                <span className="mb-muted">— {lock}</span>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
