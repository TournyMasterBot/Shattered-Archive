import { useState } from 'react';
import type { Mobile, MobilesSection } from '@shatteredarchive/merc-area';

import PreviewPane from '../areas/PreviewPane.js';
import { addMobile, deleteBlockers, newMobTemplate, nextFreeVnum, removeEntity } from '../areas/model-ops.js';
import { AreaSidebar, WorkbenchManualPane, WorkbenchToast, WorkbenchToolbar, useAreaWorkbench } from '../areas/workbench.js';
import MobEditor from './MobEditor.js';
import MobExtrasEditor from './MobExtras.js';
import '../areas/areas.css';

/**
 * Mob editing slice: pick an area → mobs listed by vnum → edit in the form.
 * Same preview-first flow as rooms/scripts. Adding allocates the next free
 * vnum in the area's declared range; deleting is blocked while resets, shops,
 * specials, or scripts still reference the mob.
 */
export default function MobsPage() {
  const wb = useAreaWorkbench();
  const [mobKey, setMobKey] = useState<string | null>(null);

  const mobSections = (wb.area?.sections ?? []).filter((s): s is MobilesSection => s.kind === 'mobiles');
  const mobs = mobSections.flatMap((s) => s.mobiles);
  const mob = mobKey !== null ? mobs.find((m) => String(m.vnum) === mobKey) ?? null : null;

  const updateMob = (updated: Mobile) => {
    if (!wb.area || !mob) return;
    wb.setAreaModel({
      sections: wb.area.sections.map((s) =>
        s.kind === 'mobiles'
          ? { ...s, mobiles: s.mobiles.map((m) => (m === mob || m.vnum === mob.vnum ? updated : m)) }
          : s,
      ),
    });
  };

  const addMob = () => {
    if (!wb.area) return;
    const vnum = nextFreeVnum(wb.area);
    if (vnum === null) {
      wb.err("no free vnum left in this area's declared range");
      return;
    }
    wb.setAreaModel(addMobile(wb.area, newMobTemplate(vnum)));
    setMobKey(String(vnum));
  };

  const deleteMob = () => {
    if (!wb.area || !mob) return;
    const blockers = deleteBlockers(wb.area, 'mob', mob.vnum);
    if (blockers.length > 0) {
      wb.err(
        `cannot delete mob #${mob.vnum} — still referenced by: ${blockers.slice(0, 3).join('; ')}` +
          (blockers.length > 3 ? ` (+${blockers.length - 3} more)` : ''),
      );
      return;
    }
    if (!window.confirm(`Delete mob #${mob.vnum}? The live prototype persists until the next copyover.`)) return;
    wb.setAreaModel(removeEntity(wb.area, 'mob', mob.vnum));
    setMobKey(null);
  };

  return (
    <div className="mb-areas">
      <WorkbenchToast wb={wb} />
      <AreaSidebar wb={wb} />

      <main className="mb-area-main">
        {!wb.area && <p className="mb-muted">Select an area to edit its mobs.</p>}

        {wb.area && (
          <>
            <WorkbenchToolbar wb={wb} />
            <WorkbenchManualPane wb={wb} />

            {!wb.manualOpen && (
            <div className="mb-editor-split">
              <nav className="mb-room-list">
                <h4>Mobs ({mobs.length})</h4>
                <button type="button" onClick={addMob}>
                  + Add mob
                </button>
                <ul>
                  {mobs.map((m) => (
                    <li key={m.vnum}>
                      <button
                        type="button"
                        className={String(m.vnum) === mobKey ? 'mb-active' : ''}
                        onClick={() => setMobKey(String(m.vnum))}
                      >
                        #{m.vnum} {m.shortDescr}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
              <section>
                {mob ? (
                  <>
                    <div className="mb-entity-actions">
                      <button type="button" className="mb-danger" onClick={deleteMob}>
                        Delete mob #{mob.vnum}
                      </button>
                    </div>
                    <MobEditor mob={mob} onChange={updateMob} />
                    <MobExtrasEditor area={wb.area} mobVnum={mob.vnum} onChange={wb.setAreaModel} />
                  </>
                ) : (
                  <p className="mb-muted">Pick a mob to edit its stats.</p>
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
