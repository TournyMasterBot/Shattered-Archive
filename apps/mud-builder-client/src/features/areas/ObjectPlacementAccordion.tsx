import type { MudObject, ObjectsSection, Reset } from '@shatteredarchive/merc-area';

import ObjectEditor from '../objects/ObjectEditor.js';
import { ResetRowFields, contentsOf, type ResetsEditor } from '../resets/reset-editing.js';
import type { AreaWorkbench } from './workbench.js';

/**
 * One `O` reset (an object placed in the room this accordion belongs to),
 * nested under RoomDashboardEntry. Editing the object's own fields
 * (ObjectEditor) edits the SHARED prototype record — same vnum the Objects
 * tab edits. "Contents" is the contiguous run of `P` rows that fill THIS
 * specific placement (contentsOf, reset-editing.tsx) — objects have no
 * per-mob-style "scripts" accordion; script attachment is mob/room only.
 */
export default function ObjectPlacementAccordion({
  wb,
  resets,
  index,
}: {
  wb: AreaWorkbench;
  resets: ResetsEditor;
  index: number;
}) {
  const oReset = resets.resets[index];
  if (oReset.command !== 'O') return null;
  const objVnum = oReset.arg1;
  const contentIndices = contentsOf(resets.resets, index);

  const objects = (wb.area?.sections ?? []).filter((s): s is ObjectsSection => s.kind === 'objects').flatMap((s) => s.objects);
  const obj = objects.find((o) => o.vnum === objVnum);

  const updateObject = (updated: MudObject) => {
    if (!wb.area) return;
    wb.setAreaModel({
      sections: wb.area.sections.map((s) =>
        s.kind === 'objects' ? { ...s, objects: s.objects.map((o) => (o.vnum === updated.vnum ? updated : o)) } : s,
      ),
    });
  };

  const removePlacement = () => {
    const contentsNote = contentIndices.length > 0 ? ` Its ${contentIndices.length} content item(s) go with it.` : '';
    if (!window.confirm(`Remove object #${objVnum} from this room?${contentsNote}`)) return;
    const removeSet = new Set([index, ...contentIndices]);
    resets.setResets(resets.resets.filter((_, i) => !removeSet.has(i)));
    wb.ok(`removed object #${objVnum} from this room`);
  };

  /** Appended right after this placement's existing contents — contentsOf reads contiguity, so it must land there, not at the array end. */
  const addContentItem = () => {
    const inner = resets.opts.object[0]?.vnum ?? 0;
    const row: Reset = { command: 'P', ifFlag: 0, arg1: inner, arg2: 1, arg3: objVnum, arg4: 1, comment: '' };
    const next = [...resets.resets];
    next.splice(index + 1 + contentIndices.length, 0, row);
    resets.setResets(next);
  };

  return (
    <details className="mb-dashboard-accordion">
      <summary>
        Object — #{objVnum} {obj?.shortDescr ?? 'unknown object'}
      </summary>
      {!obj ? (
        <p className="mb-warning">Object #{objVnum} is not defined in this area (cross-area vnum?) — only this reset row can be edited here.</p>
      ) : (
        <>
          <p className="mb-muted">Editing this object's own fields affects every room or container it's placed in — same shared prototype as the Objects tab.</p>
          <ObjectEditor obj={obj} onChange={updateObject} />
        </>
      )}

      <fieldset className="mb-fieldset">
        <legend>This placement (reset #{index + 1})</legend>
        <div className="mb-row mb-reset-fields">
          <ResetRowFields reset={oReset} idx={index} opts={resets.opts} onChange={(patch) => resets.update(index, patch)} />
        </div>
      </fieldset>

      <details className="mb-dashboard-accordion mb-dashboard-accordion--nested">
        <summary>Contents ({contentIndices.length})</summary>
        {contentIndices.length === 0 && <p className="mb-muted">Nothing placed inside this container.</p>}
        {contentIndices.length > 0 && (
          <ul className="mb-dashboard-subitems">
            {contentIndices.map((idx) => {
              const r = resets.resets[idx];
              if (r.command === '*') return null;
              return (
                <li key={idx} className="mb-row">
                  <span className="mb-reset-cmd">{r.command}</span>
                  <div className="mb-row mb-reset-fields">
                    <ResetRowFields reset={r} idx={idx} opts={resets.opts} onChange={(patch) => resets.update(idx, patch)} />
                  </div>
                  <button type="button" aria-label={`Remove reset ${idx + 1}`} className="mb-danger" onClick={() => resets.remove(idx)}>
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button type="button" onClick={addContentItem}>
          + Add item inside
        </button>
      </details>

      <div className="mb-entity-actions">
        <button type="button" className="mb-danger" onClick={removePlacement}>
          Remove this placement
        </button>
      </div>
    </details>
  );
}
