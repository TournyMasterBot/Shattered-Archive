import { useState } from 'react';
import type { Reset, Room } from '@shatteredarchive/merc-area';

import DeleteBlockersPanel, { useDeleteWithBlockers } from './DeleteBlockersPanel.js';
import MobPlacementAccordion from './MobPlacementAccordion.js';
import ObjectPlacementAccordion from './ObjectPlacementAccordion.js';
import RoomConnections from './RoomConnections.js';
import RoomEditor from './RoomEditor.js';
import RoomScriptsAccordion from './RoomScriptsAccordion.js';
import { useResetsEditor } from '../resets/reset-editing.js';
import type { AreaWorkbench } from './workbench.js';

/**
 * One room in the Areas dashboard: a top-level, closed-by-default accordion
 * (children mounted only while open — a large area shouldn't pay rendering
 * cost for every room at once). Fully editable, not a preview: RoomEditor is
 * embedded directly, and the mob/object placements + room scripts nested
 * below edit the SAME underlying records the focused tabs (Rooms/Mobs/
 * Objects/Resets/Scripts) do.
 */
export default function RoomDashboardEntry({
  wb,
  room,
  defaultOpen = false,
  onOpenSpawn,
  onGoToResets,
  onGoToMap,
  onGoToMobs,
  onGoToScripts,
}: {
  wb: AreaWorkbench;
  room: Room;
  defaultOpen?: boolean;
  onOpenSpawn?: (vnum: number) => void;
  /** Blocked-delete reconciliation — same shape as RoomsPage's, so the "Go fix it" experience is identical from either tab. */
  onGoToResets?: (vnum: number) => void;
  onGoToMap?: (vnum: number, file: string) => void;
  onGoToMobs?: () => void;
  onGoToScripts?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const resetsEditor = useResetsEditor(wb);
  const { blockers, attemptDelete, clearBlockers } = useDeleteWithBlockers(wb, 'room');

  const updateRoom = (updated: Room) => {
    if (!wb.area) return;
    wb.setAreaModel({
      sections: wb.area.sections.map((s) =>
        s.kind === 'rooms' ? { ...s, rooms: s.rooms.map((r) => (r.vnum === updated.vnum ? updated : r)) } : s,
      ),
    });
  };

  const mobBlocks = resetsEditor.blocks.filter((b) => {
    const r = resetsEditor.resets[b.start];
    return r.command === 'M' && r.arg3 === room.vnum;
  });
  const objectStarts = resetsEditor.blocks
    .filter((b) => {
      const r = resetsEditor.resets[b.start];
      return r.command === 'O' && r.arg3 === room.vnum;
    })
    .map((b) => b.start);

  const deleteRoom = () => {
    attemptDelete(room.vnum, `Delete room #${room.vnum}? The live room persists until the next copyover.`, () => setOpen(false));
  };

  const addMobPlacement = () => {
    if (resetsEditor.opts.mob.length === 0) {
      wb.err('this area has no mobiles to place');
      return;
    }
    const row: Reset = { command: 'M', ifFlag: 0, arg1: resetsEditor.opts.mob[0].vnum, arg2: 1, arg3: room.vnum, arg4: 1, comment: '' };
    resetsEditor.setResets([...resetsEditor.resets, row]);
    wb.ok(`placed mob #${row.arg1} in room #${room.vnum}`);
  };

  const addObjectPlacement = () => {
    if (resetsEditor.opts.object.length === 0) {
      wb.err('this area has no objects to place');
      return;
    }
    const row: Reset = { command: 'O', ifFlag: 0, arg1: resetsEditor.opts.object[0].vnum, arg2: 0, arg3: room.vnum, arg4: 0, comment: '' };
    resetsEditor.setResets([...resetsEditor.resets, row]);
    wb.ok(`placed object #${row.arg1} in room #${room.vnum}`);
  };

  return (
    <details
      className="mb-dashboard-room"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        #{room.vnum} {room.name}
        <span className="mb-muted">
          {' '}
          — {mobBlocks.length} mob{mobBlocks.length === 1 ? '' : 's'}, {objectStarts.length} object
          {objectStarts.length === 1 ? '' : 's'}
        </span>
      </summary>

      {open && (
        <div className="mb-dashboard-room-body">
          <div className="mb-entity-actions">
            <button type="button" className="mb-danger" onClick={deleteRoom}>
              Delete room #{room.vnum}
            </button>
          </div>
          <DeleteBlockersPanel
            entityLabel={`room #${room.vnum}`}
            blockers={blockers}
            onGoToResets={onGoToResets && (() => onGoToResets(room.vnum))}
            onGoToMap={onGoToMap && wb.file ? () => onGoToMap(room.vnum, wb.file!) : undefined}
            onGoToMobs={onGoToMobs}
            onGoToScripts={onGoToScripts}
          />
          {blockers.length > 0 && (
            <button type="button" onClick={clearBlockers}>
              Dismiss
            </button>
          )}

          <RoomEditor room={room} onChange={updateRoom} onOpenSpawn={onOpenSpawn} />
          <RoomConnections room={room} area={wb.area} />

          <fieldset className="mb-fieldset">
            <legend>Mobs in this room ({mobBlocks.length})</legend>
            {mobBlocks.length === 0 && <p className="mb-muted">No mobs placed here.</p>}
            {mobBlocks.map((b) => (
              <MobPlacementAccordion key={b.start} wb={wb} resets={resetsEditor} block={b} />
            ))}
            <button type="button" onClick={addMobPlacement}>
              + Place a mob here
            </button>
          </fieldset>

          <fieldset className="mb-fieldset">
            <legend>Objects in this room ({objectStarts.length})</legend>
            {objectStarts.length === 0 && <p className="mb-muted">No objects placed here.</p>}
            {objectStarts.map((idx) => (
              <ObjectPlacementAccordion key={idx} wb={wb} resets={resetsEditor} index={idx} />
            ))}
            <button type="button" onClick={addObjectPlacement}>
              + Place an object here
            </button>
          </fieldset>

          <RoomScriptsAccordion wb={wb} room={room} />
        </div>
      )}
    </details>
  );
}
