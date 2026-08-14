import { useEffect, useState } from 'react';
import type { MudObject, ObjectsSection } from '@shatteredarchive/merc-area';

import type { SnippetKind } from '../../api/client.js';
import PreviewPane from '../areas/PreviewPane.js';
import DeleteBlockersPanel, { useDeleteWithBlockers } from '../areas/DeleteBlockersPanel.js';
import { addObject, newObjectTemplate, nextFreeVnum } from '../areas/model-ops.js';
import { AreaSidebar, WorkbenchManualPane, WorkbenchToast, WorkbenchToolbar, useAreaWorkbench } from '../areas/workbench.js';
import ObjectEditor from './ObjectEditor.js';
import '../areas/areas.css';

/**
 * Object editing slice: pick an area → objects listed by vnum → edit in the
 * form (values re-labelled per item type). Same preview-first flow as
 * rooms/mobs/scripts. Adding allocates the next free vnum in the area's
 * declared range; deleting is blocked while resets or exits reference it.
 */
export default function ObjectsPage({
  pendingSnippet,
  onGoToResets,
  onGoToMap,
}: {
  /** Phase G: "Load into editor" from the My Content tab — adds a new object seeded from the snippet's saved data (with a freshly-allocated vnum, never the snippet's stored one). */
  pendingSnippet?: { kind: SnippetKind; data: unknown } | null;
  /** Blocked-delete reconciliation. No onGoToMobs/onGoToScripts — an object can never be shop/special/script-referenced (only resets and exit keys reference objects). onGoToMap has no vnum to focus (unlike a room delete) — it's a plain tab switch. */
  onGoToResets?: () => void;
  onGoToMap?: () => void;
} = {}) {
  const wb = useAreaWorkbench();
  const [objKey, setObjKey] = useState<string | null>(null);
  const { blockers, attemptDelete, clearBlockers } = useDeleteWithBlockers(wb, 'object');

  useEffect(() => {
    if (!pendingSnippet || pendingSnippet.kind !== 'object') return;
    if (!wb.area) {
      wb.err('pick an area first, then use Load from My Content again');
      return;
    }
    const vnum = nextFreeVnum(wb.area);
    if (vnum === null) {
      wb.err("no free vnum left in this area's declared range");
      return;
    }
    wb.setAreaModel(addObject(wb.area, { ...(pendingSnippet.data as MudObject), vnum }));
    setObjKey(String(vnum));
    wb.ok(`added object #${vnum} from snippet`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSnippet]);

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
    wb.ok(`added object #${vnum}`);
  };

  const selectObj = (key: string | null) => {
    clearBlockers();
    setObjKey(key);
  };

  const deleteObj = () => {
    if (!obj) return;
    attemptDelete(
      obj.vnum,
      `Delete object #${obj.vnum}? The live prototype persists until the next copyover.`,
      () => setObjKey(null),
    );
  };

  return (
    <div className="mb-areas">
      <WorkbenchToast wb={wb} />
      <AreaSidebar wb={wb} onBeforeOpen={() => wb.confirmDiscard('switch areas')} />

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
                        onClick={() => selectObj(String(o.vnum))}
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
                    <DeleteBlockersPanel
                      entityLabel={`object #${obj.vnum}`}
                      blockers={blockers}
                      onGoToResets={onGoToResets}
                      onGoToMap={onGoToMap}
                    />
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
