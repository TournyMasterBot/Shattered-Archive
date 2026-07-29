import { useEffect, useState } from 'react';
import type { Room } from '@shatteredarchive/merc-area';

import type { ExternalRef, SnippetKind } from '../../api/client.js';
import DeleteBlockersPanel, { useDeleteWithBlockers } from '../areas/DeleteBlockersPanel.js';
import PreviewPane from '../areas/PreviewPane.js';
import RoomConnections from '../areas/RoomConnections.js';
import RoomEditor from '../areas/RoomEditor.js';
import { addRoom, newRoomTemplate, nextFreeVnum } from '../areas/model-ops.js';
import { AreaSidebar, WorkbenchManualPane, WorkbenchToast, WorkbenchToolbar, useAreaWorkbench } from '../areas/workbench.js';
import '../areas/areas.css';

/**
 * Rooms tab: the ONE place rooms are edited (Areas' own room list/form is
 * read-only — see AreasPage's "Edit this room" link). Same
 * pick-area/list/edit shape as Mobs/Objects, plus a read-only "Exits &
 * connections" panel (RoomConnections) so the page doubles as a way to see
 * how a room fits into the area, not just a bare field form.
 */
export default function RoomsPage({
  initialTarget,
  pendingSnippet,
  onOpenSpawn,
  onGoToResets,
  onGoToMap,
  onGoToMobs,
  onGoToScripts,
}: {
  /** Cross-tab hand-off (Map room click, Areas' "Edit this room" link, Simulate's reverse link). */
  initialTarget?: ExternalRef | null;
  /** Phase G: "Load into editor" from the My Content tab — adds a new room seeded from the snippet's saved data (with a freshly-allocated vnum, never the snippet's stored one). */
  pendingSnippet?: { kind: SnippetKind; data: unknown } | null;
  onOpenSpawn?: (vnum: number) => void;
  /** Blocked-delete reconciliation: jump to the tab that can fix the reference, focused on this room. */
  onGoToResets?: (vnum: number) => void;
  onGoToMap?: (vnum: number, file: string) => void;
  onGoToMobs?: () => void;
  onGoToScripts?: () => void;
} = {}) {
  const wb = useAreaWorkbench();
  const [roomKey, setRoomKey] = useState<string | null>(null);
  const { blockers: blockedDelete, attemptDelete, clearBlockers } = useDeleteWithBlockers(wb, 'room');

  useEffect(() => {
    if (initialTarget) {
      void wb.openArea(initialTarget.file);
      setRoomKey(String(initialTarget.vnum));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTarget]);

  useEffect(() => {
    if (!pendingSnippet || pendingSnippet.kind !== 'room') return;
    if (!wb.area) {
      wb.err('pick an area first, then use Load from My Content again');
      return;
    }
    const vnum = nextFreeVnum(wb.area);
    if (vnum === null) {
      wb.err("no free vnum left in this area's declared range");
      return;
    }
    wb.setAreaModel(addRoom(wb.area, { ...(pendingSnippet.data as Room), vnum }));
    setRoomKey(String(vnum));
    wb.ok(`added room #${vnum} from snippet`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSnippet]);

  const rooms = (wb.area?.sections ?? []).flatMap((s) => (s.kind === 'rooms' ? s.rooms : []));
  const room = roomKey !== null ? rooms.find((r) => String(r.vnum) === roomKey) ?? null : null;

  const updateRoom = (updated: Room) => {
    if (!wb.area || !room) return;
    wb.setAreaModel({
      sections: wb.area.sections.map((s) =>
        s.kind === 'rooms' ? { ...s, rooms: s.rooms.map((r) => (r === room || r.vnum === room.vnum ? updated : r)) } : s,
      ),
    });
  };

  const addNewRoom = () => {
    if (!wb.area) return;
    const vnum = nextFreeVnum(wb.area);
    if (vnum === null) {
      wb.err("no free vnum left in this area's declared range");
      return;
    }
    wb.setAreaModel(addRoom(wb.area, newRoomTemplate(vnum)));
    setRoomKey(String(vnum));
    wb.ok(`added room #${vnum}`);
  };

  const deleteRoom = () => {
    if (!room) return;
    attemptDelete(room.vnum, `Delete room #${room.vnum}? The live room persists until the next copyover.`, () =>
      setRoomKey(null),
    );
  };

  const selectRoom = (key: string | null) => {
    clearBlockers();
    setRoomKey(key);
  };

  return (
    <div className="mb-areas">
      <WorkbenchToast wb={wb} />
      <AreaSidebar wb={wb} onBeforeOpen={() => wb.confirmDiscard('switch areas')} />

      <main className="mb-area-main">
        {!wb.area && <p className="mb-muted">Select an area to edit its rooms.</p>}

        {wb.area && (
          <>
            <WorkbenchToolbar wb={wb} />
            <WorkbenchManualPane wb={wb} />

            {!wb.manualOpen && (
              <div className="mb-editor-split">
                <nav className="mb-room-list">
                  <h4>Rooms ({rooms.length})</h4>
                  <button type="button" onClick={addNewRoom}>
                    + Add room
                  </button>
                  <ul>
                    {rooms.map((r) => (
                      <li key={r.vnum}>
                        <button
                          type="button"
                          className={String(r.vnum) === roomKey ? 'mb-active' : ''}
                          onClick={() => selectRoom(String(r.vnum))}
                        >
                          #{r.vnum} {r.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
                <section>
                  {room ? (
                    <>
                      <div className="mb-entity-actions">
                        <button type="button" className="mb-danger" onClick={deleteRoom}>
                          Delete room #{room.vnum}
                        </button>
                      </div>
                      <DeleteBlockersPanel
                        entityLabel={`room #${room.vnum}`}
                        blockers={blockedDelete}
                        onGoToResets={onGoToResets && (() => onGoToResets(room.vnum))}
                        onGoToMap={onGoToMap && wb.file ? () => onGoToMap(room.vnum, wb.file!) : undefined}
                        onGoToMobs={onGoToMobs}
                        onGoToScripts={onGoToScripts}
                      />
                      <RoomEditor room={room} onChange={updateRoom} onOpenSpawn={onOpenSpawn} />
                      <RoomConnections room={room} area={wb.area} />
                    </>
                  ) : (
                    <p className="mb-muted">Pick a room.</p>
                  )}
                </section>
              </div>
            )}

            {wb.preview && <PreviewPane preview={wb.preview} onNavigate={(ref) => void wb.openArea(ref.file)} />}
          </>
        )}
      </main>
    </div>
  );
}
