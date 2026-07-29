import { useEffect, useState } from 'react';
import type { Mobile, MobilesSection } from '@shatteredarchive/merc-area';

import type { SnippetKind } from '../../api/client.js';
import PreviewPane from '../areas/PreviewPane.js';
import DeleteBlockersPanel, { useDeleteWithBlockers } from '../areas/DeleteBlockersPanel.js';
import { addMobile, newMobTemplate, nextFreeVnum } from '../areas/model-ops.js';
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
export default function MobsPage({
  pendingSnippet,
  onGoToResets,
  onGoToScripts,
}: {
  /** Phase G: "Load into editor" from the My Content tab — adds a new mob seeded from the snippet's saved data (with a freshly-allocated vnum, never the snippet's stored one). */
  pendingSnippet?: { kind: SnippetKind; data: unknown } | null;
  /** Blocked-delete reconciliation. No onGoToMap (a mob can never be exit-referenced) or onGoToMobs (linking Mobs to itself makes no sense — the blocker text already names the other mob). */
  onGoToResets?: () => void;
  onGoToScripts?: () => void;
} = {}) {
  const wb = useAreaWorkbench();
  const [mobKey, setMobKey] = useState<string | null>(null);
  const { blockers, attemptDelete, clearBlockers } = useDeleteWithBlockers(wb, 'mob');

  useEffect(() => {
    if (!pendingSnippet || pendingSnippet.kind !== 'mob') return;
    if (!wb.area) {
      wb.err('pick an area first, then use Load from My Content again');
      return;
    }
    const vnum = nextFreeVnum(wb.area);
    if (vnum === null) {
      wb.err("no free vnum left in this area's declared range");
      return;
    }
    wb.setAreaModel(addMobile(wb.area, { ...(pendingSnippet.data as Mobile), vnum }));
    setMobKey(String(vnum));
    wb.ok(`added mob #${vnum} from snippet`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSnippet]);

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
    wb.ok(`added mob #${vnum}`);
  };

  const selectMob = (key: string | null) => {
    clearBlockers();
    setMobKey(key);
  };

  const deleteMob = () => {
    if (!mob) return;
    attemptDelete(mob.vnum, `Delete mob #${mob.vnum}? The live prototype persists until the next copyover.`, () =>
      setMobKey(null),
    );
  };

  return (
    <div className="mb-areas">
      <WorkbenchToast wb={wb} />
      <AreaSidebar wb={wb} onBeforeOpen={() => wb.confirmDiscard('switch areas')} />

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
                        onClick={() => selectMob(String(m.vnum))}
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
                    <DeleteBlockersPanel
                      entityLabel={`mob #${mob.vnum}`}
                      blockers={blockers}
                      onGoToResets={onGoToResets}
                      onGoToScripts={onGoToScripts}
                    />
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
