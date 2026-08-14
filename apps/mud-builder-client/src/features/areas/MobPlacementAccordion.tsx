import type { Mobile, MobilesSection, Reset, RoomsSection } from '@shatteredarchive/merc-area';

import MobEditor from '../mobs/MobEditor.js';
import ScriptEditor from '../scripts/ScriptEditor.js';
import { ResetRowFields, type ResetBlock, type ResetsEditor } from '../resets/reset-editing.js';
import { useAreaScripts } from './scripts-model.js';
import type { AreaWorkbench } from './workbench.js';

/**
 * One `M` reset (a mob placed in the room this accordion belongs to), nested
 * under RoomDashboardEntry. Editing the mob's own fields (MobEditor) edits
 * the SHARED prototype record — the same vnum the Mobs tab edits, correct by
 * design (2026-07-26 plan Constraints). Equipment is THIS placement's `G`/`E`
 * riders (block-scoped); Scripts is area-wide (mobVnum-scoped, independent of
 * which room this placement lives in) — two different scoping semantics kept
 * visually distinct.
 */
export default function MobPlacementAccordion({
  wb,
  resets,
  block,
}: {
  wb: AreaWorkbench;
  resets: ResetsEditor;
  block: ResetBlock;
}) {
  const mReset = resets.resets[block.start];
  if (mReset.command !== 'M') return null;
  const mobVnum = mReset.arg1;
  const riderIndices = Array.from({ length: block.span - 1 }, (_, i) => block.start + 1 + i);

  const mobiles = (wb.area?.sections ?? []).filter((s): s is MobilesSection => s.kind === 'mobiles').flatMap((s) => s.mobiles);
  const rooms = (wb.area?.sections ?? [])
    .filter((s): s is RoomsSection => s.kind === 'rooms')
    .flatMap((s) => s.rooms)
    .map((r) => ({ vnum: r.vnum, name: r.name }));
  const mobOptions = mobiles.map((m) => ({ vnum: m.vnum, shortDescr: m.shortDescr }));
  const mob = mobiles.find((m) => m.vnum === mobVnum);

  const updateMobile = (updated: Mobile) => {
    if (!wb.area) return;
    wb.setAreaModel({
      sections: wb.area.sections.map((s) =>
        s.kind === 'mobiles' ? { ...s, mobiles: s.mobiles.map((m) => (m.vnum === updated.vnum ? updated : m)) } : s,
      ),
    });
  };

  const removePlacement = () => {
    const riderNote = riderIndices.length > 0 ? ` Its ${riderIndices.length} equipment/give row(s) go with it.` : '';
    if (!window.confirm(`Remove mob #${mobVnum} from this room?${riderNote}`)) return;
    resets.setResets(resets.resets.filter((_, i) => i < block.start || i >= block.start + block.span));
    wb.ok(`removed mob #${mobVnum} from this room`);
  };

  /** Inserted immediately after this block's last row — computeBlocks only groups CONTIGUOUS G/E/P after an M. */
  const addRider = (command: 'G' | 'E') => {
    const obj = resets.opts.object[0]?.vnum ?? 0;
    const row: Reset =
      command === 'G'
        ? { command: 'G', ifFlag: 0, arg1: obj, arg2: 1, arg3: 0, arg4: 0, comment: '' }
        : { command: 'E', ifFlag: 0, arg1: obj, arg2: 1, arg3: 16, arg4: 0, comment: '' };
    const next = [...resets.resets];
    next.splice(block.start + block.span, 0, row);
    resets.setResets(next);
  };

  const scriptsEditor = useAreaScripts(wb);
  const mobScripts = scriptsEditor.scripts.filter(({ script }) => (script.attach ?? 'mob') === 'mob' && script.mobVnum === mobVnum);

  return (
    <details className="mb-dashboard-accordion">
      <summary>
        Mob — #{mobVnum} {mob?.shortDescr ?? 'unknown mob'}
      </summary>
      {!mob ? (
        <p className="mb-warning">Mob #{mobVnum} is not defined in this area (cross-area vnum?) — only this reset row can be edited here.</p>
      ) : (
        <>
          <p className="mb-muted">Editing this mob's own fields affects every room it's placed in — same shared prototype as the Mobs tab.</p>
          <MobEditor mob={mob} onChange={updateMobile} />
        </>
      )}

      <fieldset className="mb-fieldset">
        <legend>This placement (reset #{block.start + 1})</legend>
        <div className="mb-row mb-reset-fields">
          <ResetRowFields reset={mReset} idx={block.start} opts={resets.opts} onChange={(patch) => resets.update(block.start, patch)} />
        </div>
      </fieldset>

      <details className="mb-dashboard-accordion mb-dashboard-accordion--nested">
        <summary>Equipment ({riderIndices.length})</summary>
        {riderIndices.length === 0 && <p className="mb-muted">No equipped or given items on this placement.</p>}
        {riderIndices.length > 0 && (
          <ul className="mb-dashboard-subitems">
            {riderIndices.map((idx) => {
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
        <div className="mb-row-actions">
          <button type="button" onClick={() => addRider('G')}>
            + Give item
          </button>
          <button type="button" onClick={() => addRider('E')}>
            + Equip item
          </button>
        </div>
      </details>

      <details className="mb-dashboard-accordion mb-dashboard-accordion--nested">
        <summary>Scripts ({mobScripts.length})</summary>
        {mobScripts.length === 0 && <p className="mb-muted">No scripts attached to this mob.</p>}
        {mobScripts.length > 0 && (
          <ul className="mb-dashboard-subitems">
            {mobScripts.map(({ script, index }) => (
              <li key={index}>
                <details>
                  <summary>
                    {script.trigger}
                    {script.phrase ? ` "${script.phrase}"` : ''}
                  </summary>
                  <ScriptEditor
                    script={script}
                    mobs={mobOptions}
                    rooms={rooms}
                    onChange={(updated) => scriptsEditor.updateScript(index, updated)}
                    onDelete={() => scriptsEditor.removeScript(index)}
                  />
                </details>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => scriptsEditor.addScript({ mobVnum, trigger: 'speech', phrase: '', body: 'say Hello, $n!' })}
        >
          + Add script
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
