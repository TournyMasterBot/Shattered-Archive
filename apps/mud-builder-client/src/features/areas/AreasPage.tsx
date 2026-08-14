import { useEffect, useState } from 'react';

import type { ExternalRef } from '../../api/client.js';
import AreaHeaderEditor from './AreaHeaderEditor.js';
import ImportAreaPanel from './ImportAreaPanel.js';
import PreviewPane from './PreviewPane.js';
import RoomDashboardEntry from './RoomDashboardEntry.js';
import { addRoom, newRoomTemplate, nextFreeVnum } from './model-ops.js';
import { AreaSidebar, WorkbenchManualPane, WorkbenchToast, WorkbenchToolbar, useAreaWorkbench } from './workbench.js';
import './areas.css';

/**
 * Areas tab: an organizational dashboard for one whole area at a glance —
 * left nav (area list) + header stay as always, but the main content is a
 * filterable, scrollable list of every room, each a RoomDashboardEntry
 * accordion nesting its mobs/objects/progs (and, under a mob, its equipment
 * and scripts). Fully editable, not a preview — the same records the focused
 * tabs (Rooms/Mobs/Objects/Resets/Scripts) edit. Those tabs remain the
 * narrow "edit exactly this one thing" alternative; Areas is "see and edit
 * everything in this area."
 */
export default function AreasPage({
  initialTarget,
  onOpenSpawn,
  onGoToResets,
  onGoToMap,
  onGoToMobs,
  onGoToScripts,
}: {
  initialTarget?: ExternalRef | null;
  onOpenSpawn?: (vnum: number) => void;
  /** Blocked-delete reconciliation, threaded straight through to each RoomDashboardEntry. */
  onGoToResets?: (vnum: number) => void;
  onGoToMap?: (vnum: number, file: string) => void;
  onGoToMobs?: () => void;
  onGoToScripts?: () => void;
} = {}) {
  const wb = useAreaWorkbench();
  const [importing, setImporting] = useState(false);
  const [roomFilter, setRoomFilter] = useState('');
  /** The room to auto-expand — a just-added room, or wherever navigation (initialTarget / a preview ref link) pointed. */
  const [focusRoomVnum, setFocusRoomVnum] = useState<number | null>(null);

  useEffect(() => {
    if (!initialTarget) return;
    if (!wb.confirmDiscard('switch areas')) return;
    setImporting(false);
    void wb.openArea(initialTarget.file);
    if (initialTarget.kind === 'room') setFocusRoomVnum(initialTarget.vnum);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTarget]);

  const rooms = (wb.area?.sections ?? []).flatMap((s) => (s.kind === 'rooms' ? s.rooms : []));
  const needle = roomFilter.trim().toLowerCase();
  const filtered = needle
    ? rooms.filter((r) => String(r.vnum).includes(needle) || r.name.toLowerCase().includes(needle))
    : rooms;

  const addNewRoom = () => {
    if (!wb.area) return;
    const vnum = nextFreeVnum(wb.area);
    if (vnum === null) {
      wb.err("no free vnum left in this area's declared range");
      return;
    }
    wb.setAreaModel(addRoom(wb.area, newRoomTemplate(vnum)));
    setFocusRoomVnum(vnum);
    wb.ok(`added room #${vnum}`);
  };

  const navigateToRef = (ref: ExternalRef) => {
    if (!wb.confirmDiscard('switch areas')) return;
    setImporting(false);
    void wb.openArea(ref.file);
    if (ref.kind === 'room') setFocusRoomVnum(ref.vnum);
  };

  return (
    <div className="mb-areas">
      <WorkbenchToast wb={wb} />
      <AreaSidebar
        wb={wb}
        onBeforeOpen={() => {
          const proceed = wb.confirmDiscard('switch areas');
          if (proceed) setImporting(false);
          return proceed;
        }}
        extraToolbar={
          <button type="button" className={importing ? 'mb-active' : ''} onClick={() => setImporting((v) => !v)}>
            Import .are file…
          </button>
        }
      />

      <main className="mb-area-main">
        {importing && (
          <ImportAreaPanel
            writesOff={wb.writesOff}
            gateTip={wb.gateTip}
            onClose={() => setImporting(false)}
            onImported={async (f, note) => {
              setImporting(false);
              await wb.openArea(f);
              wb.setToast({ kind: 'ok', text: `imported ${f} — ${note}` });
            }}
          />
        )}

        {!importing && !wb.area && <p className="mb-muted">Select an area to begin.</p>}

        {!importing && wb.area && (
          <>
            <WorkbenchToolbar wb={wb} />
            <WorkbenchManualPane wb={wb} />

            {!wb.manualOpen && (
              <>
                <AreaHeaderEditor area={wb.area} onChange={wb.setAreaModel} />

                <div className="mb-room-dashboard">
                  <div className="mb-row">
                    <label className="mb-field mb-field--grow">
                      <span>Filter rooms</span>
                      <input
                        aria-label="Filter rooms"
                        value={roomFilter}
                        onChange={(e) => setRoomFilter(e.target.value)}
                        placeholder="vnum or name"
                      />
                    </label>
                    <div className="mb-row-actions">
                      <button type="button" onClick={addNewRoom}>
                        + Add room
                      </button>
                    </div>
                  </div>
                  <h4>
                    Rooms ({filtered.length}
                    {filtered.length !== rooms.length ? ` of ${rooms.length}` : ''})
                  </h4>
                  {filtered.length === 0 && <p className="mb-muted">No rooms match.</p>}
                  {filtered.map((r) => (
                    <RoomDashboardEntry
                      key={r.vnum}
                      wb={wb}
                      room={r}
                      defaultOpen={r.vnum === focusRoomVnum}
                      onOpenSpawn={onOpenSpawn}
                      onGoToResets={onGoToResets}
                      onGoToMap={onGoToMap}
                      onGoToMobs={onGoToMobs}
                      onGoToScripts={onGoToScripts}
                    />
                  ))}
                </div>
              </>
            )}

            {wb.preview && <PreviewPane preview={wb.preview} onNavigate={navigateToRef} />}
          </>
        )}
      </main>
    </div>
  );
}
