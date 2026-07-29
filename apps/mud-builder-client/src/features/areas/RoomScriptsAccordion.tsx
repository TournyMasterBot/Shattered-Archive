import type { MobilesSection, Room, RoomsSection } from '@shatteredarchive/merc-area';

import ScriptEditor from '../scripts/ScriptEditor.js';
import { useAreaScripts } from './scripts-model.js';
import type { AreaWorkbench } from './workbench.js';

/**
 * "Progs" in the user's own words — this room's `MobScript` rows
 * (`attach:'room'`, `mobVnum` field holding the room's own vnum). Area-wide
 * data, not room-placement-scoped (a room has exactly one identity, unlike a
 * mob prototype which can be placed many times), so this is simpler than
 * MobPlacementAccordion's scripts sub-accordion — no per-placement filtering.
 */
export default function RoomScriptsAccordion({ wb, room }: { wb: AreaWorkbench; room: Room }) {
  const editor = useAreaScripts(wb);
  const mine = editor.scripts.filter(({ script }) => script.attach === 'room' && script.mobVnum === room.vnum);

  const mobs = (wb.area?.sections ?? [])
    .filter((s): s is MobilesSection => s.kind === 'mobiles')
    .flatMap((s) => s.mobiles)
    .map((m) => ({ vnum: m.vnum, shortDescr: m.shortDescr }));
  const rooms = (wb.area?.sections ?? [])
    .filter((s): s is RoomsSection => s.kind === 'rooms')
    .flatMap((s) => s.rooms)
    .map((r) => ({ vnum: r.vnum, name: r.name }));

  const addRoomScript = () => {
    editor.addScript({
      attach: 'room',
      mobVnum: room.vnum,
      trigger: 'entry',
      phrase: '',
      body: 'echo A strange force seizes you!',
    });
  };

  return (
    <details className="mb-dashboard-accordion">
      <summary>Progs — room scripts ({mine.length})</summary>
      {mine.length === 0 && <p className="mb-muted">No scripts attached to this room.</p>}
      {mine.length > 0 && (
        <ul className="mb-dashboard-subitems">
          {mine.map(({ script, index }) => (
            <li key={index}>
              <details>
                <summary>
                  {script.trigger}
                  {script.phrase ? ` "${script.phrase}"` : ''}
                </summary>
                <ScriptEditor
                  script={script}
                  mobs={mobs}
                  rooms={rooms}
                  onChange={(updated) => editor.updateScript(index, updated)}
                  onDelete={() => editor.removeScript(index)}
                />
              </details>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={addRoomScript}>
        + Add room script
      </button>
    </details>
  );
}
