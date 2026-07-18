import { useState } from 'react';
import type { MudObject, ObjectsSection } from '@shatteredarchive/merc-area';

import PreviewPane from '../areas/PreviewPane.js';
import { addObject, deleteBlockers, newObjectTemplate, nextFreeVnum, removeEntity } from '../areas/model-ops.js';
import { AreaSidebar, WorkbenchManualPane, WorkbenchToast, WorkbenchToolbar, useAreaWorkbench } from '../areas/workbench.js';
import ObjectEditor from './ObjectEditor.js';
import '../areas/areas.css';

/**
 * Object editing slice: pick an area → objects listed by vnum → edit in the
 * form (values re-labelled per item type). Same preview-first flow as
 * rooms/mobs/scripts. Adding allocates the next free vnum in the area's
 * declared range; deleting is blocked while resets or exits reference it.
 */
export default function ObjectsPage() {
  const wb = useAreaWorkbench();
  const [objKey, setObjKey] = useState<string | null>(null);

  const objSections = (wb.area?.sections ?? []).filter((s): s is ObjectsSection => s.kind === 'objects');
  const objects = objSections.flatMap((s) => s.objects);
  const obj = objKey !== null ? objects.find((o) => String(o.vnum) === objKey) ?? null : null;

  const updateObject = (updated: MudObject) => {
    if (!wb.area || !obj) return;
    wb.setAreaModel({
      sections: wb.area.sections.map((s) =>
        s.kind === 'objects'
          ? { ...s, objects: s.objects.map((o) => (o === obj || o.vnum === obj.vnum ? updated : o)) }
          : s,
      ),
    });
  };

  const addObj = () => {
    if (!wb.area) return;
    const vnum = nextFreeVnum(wb.area);
    if (vnum === null) {
      wb.err("no free vnum left in this area's declared range");
      return;
    }
    wb.setAreaModel(addObject(wb.area, newObjectTemplate(vnum)));
    setObjKey(String(vnum));
  };

  const deleteObj = () => {
    if (!wb.area || !obj) return;
    const blockers = deleteBlockers(wb.area, 'object', obj.vnum);
    if (blockers.length > 0) {
      wb.err(
        `cannot delete object #${obj.vnum} — still referenced by: ${blockers.slice(0, 3).join('; ')}` +
          (blockers.length > 3 ? ` (+${blockers.length - 3} more)` : ''),
      );
      return;
    }
    if (!window.confirm(`Delete object #${obj.vnum}? The live prototype persists until the next copyover.`)) return;
    wb.setAreaModel(removeEntity(wb.area, 'object', obj.vnum));
    setObjKey(null);
  };

  return (
    <div className="mb-areas">
      <WorkbenchToast wb={wb} />
      <AreaSidebar wb={wb} />

      <main className="mb-area-main">
        {!wb.area && <p className="mb-muted">Select an area to edit its objects.</p>}

        {wb.area && (
          <>
            <WorkbenchToolbar wb={wb} />
            <WorkbenchManualPane wb={wb} />

            {!wb.manualOpen && (
            <div className="mb-editor-split">
              <nav className="mb-room-list">
                <h4>Objects ({objects.length})</h4>
                <button type="button" onClick={addObj}>
                  + Add object
                </button>
                <ul>
                  {objects.map((o) => (
                    <li key={o.vnum}>
                      <button
                        type="button"
                        className={String(o.vnum) === objKey ? 'mb-active' : ''}
                        onClick={() => setObjKey(String(o.vnum))}
                      >
                        #{o.vnum} {o.shortDescr}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
              <section>
                {obj ? (
                  <>
                    <div className="mb-entity-actions">
                      <button type="button" className="mb-danger" onClick={deleteObj}>
                        Delete object #{obj.vnum}
                      </button>
                    </div>
                    <ObjectEditor obj={obj} onChange={updateObject} />
                  </>
                ) : (
                  <p className="mb-muted">Pick an object to edit it.</p>
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
