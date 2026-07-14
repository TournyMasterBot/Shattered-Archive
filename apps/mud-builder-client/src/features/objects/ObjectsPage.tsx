import { useState } from 'react';
import type { MudObject, ObjectsSection } from '@shatteredarchive/merc-area';

import PreviewPane from '../areas/PreviewPane.js';
import { AreaSidebar, WorkbenchToast, WorkbenchToolbar, useAreaWorkbench } from '../areas/workbench.js';
import ObjectEditor from './ObjectEditor.js';
import '../areas/areas.css';

/**
 * Object editing slice: pick an area → objects listed by vnum → edit in the
 * form (values re-labelled per item type). Same preview-first flow as
 * rooms/mobs/scripts; adding/removing objects is out of scope (resets
 * reference object vnums), so the form edits existing entries only.
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

  return (
    <div className="mb-areas">
      <WorkbenchToast wb={wb} />
      <AreaSidebar wb={wb} />

      <main className="mb-area-main">
        {!wb.area && <p className="mb-muted">Select an area to edit its objects.</p>}

        {wb.area && (
          <>
            <WorkbenchToolbar wb={wb} />

            <div className="mb-editor-split">
              <nav className="mb-room-list">
                <h4>Objects ({objects.length})</h4>
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
                  <ObjectEditor obj={obj} onChange={updateObject} />
                ) : (
                  <p className="mb-muted">Pick an object to edit it.</p>
                )}
              </section>
            </div>

            {wb.preview && <PreviewPane preview={wb.preview} />}
          </>
        )}
      </main>
    </div>
  );
}
