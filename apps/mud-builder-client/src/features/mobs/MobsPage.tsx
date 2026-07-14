import { useState } from 'react';
import type { Mobile, MobilesSection } from '@shatteredarchive/merc-area';

import PreviewPane from '../areas/PreviewPane.js';
import { AreaSidebar, WorkbenchToast, WorkbenchToolbar, useAreaWorkbench } from '../areas/workbench.js';
import MobEditor from './MobEditor.js';
import '../areas/areas.css';

/**
 * Mob stat editing slice: pick an area → mobs listed by vnum → edit in the
 * form. Same preview-first flow as rooms/scripts; adding/removing mobs is out
 * of scope here (resets and scripts reference mob vnums), so the form edits
 * existing entries only.
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

  return (
    <div className="mb-areas">
      <WorkbenchToast wb={wb} />
      <AreaSidebar wb={wb} />

      <main className="mb-area-main">
        {!wb.area && <p className="mb-muted">Select an area to edit its mobs.</p>}

        {wb.area && (
          <>
            <WorkbenchToolbar wb={wb} />

            <div className="mb-editor-split">
              <nav className="mb-room-list">
                <h4>Mobs ({mobs.length})</h4>
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
                  <MobEditor mob={mob} onChange={updateMob} />
                ) : (
                  <p className="mb-muted">Pick a mob to edit its stats.</p>
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
