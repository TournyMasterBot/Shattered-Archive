import { useState } from 'react';
import type { Social } from '@shatteredarchive/merc-area';

import PreviewPane from '../areas/PreviewPane.js';
import { newSocialTemplate, removeSocial, socialsOf, upsertSocial } from '../areas/model-ops.js';
import { AreaSidebar, TextField, WorkbenchManualPane, WorkbenchToast, WorkbenchToolbar, useAreaWorkbench } from '../areas/workbench.js';
import '../areas/areas.css';

/**
 * Socials editing slice (stock: only social.are has a #SOCIALS section). The
 * game loads socials into the global social_table at boot ONLY — hot reload
 * deliberately skips #SOCIALS (area_reload.c stage_socials), so edits here
 * take effect at the next copyover.
 *
 * Field mapping (db2.c load_socials order): `$` in the file = unset = blank
 * input here; empty strings are unrepresentable, so blank ⇒ null on change.
 * Early-terminated stock socials (fewer than 8 lines) keep their short field
 * list untouched unless the builder explicitly adds lines.
 */
const FIELD_LABELS = [
  'You see (no target)',
  'Others see (no target)',
  'You see (target found)',
  'Others see (target found)',
  'Target sees',
  'You see (target not found)',
  'You see (self-target)',
  'Others see (self-target)',
];

export default function SocialsPage() {
  const wb = useAreaWorkbench();
  const [socialKey, setSocialKey] = useState<string | null>(null);

  const socials = wb.area ? socialsOf(wb.area) : [];
  const social = socialKey !== null ? socials.find((s) => s.name === socialKey) ?? null : null;

  const update = (next: Social) => {
    if (!wb.area || !social) return;
    wb.setAreaModel(upsertSocial(wb.area, next, social.name));
    if (next.name !== social.name) setSocialKey(next.name);
  };

  const addSocial = () => {
    if (!wb.area) return;
    let name = 'newsocial';
    for (let i = 2; socials.some((s) => s.name.toLowerCase() === name.toLowerCase()); i++) {
      name = `newsocial${i}`;
    }
    wb.setAreaModel(upsertSocial(wb.area, newSocialTemplate(name)));
    setSocialKey(name);
  };

  const deleteSocial = () => {
    if (!wb.area || !social) return;
    if (!window.confirm(`Delete social '${social.name}'? The live social persists until the next copyover.`)) return;
    wb.setAreaModel(removeSocial(wb.area, social.name));
    setSocialKey(null);
  };

  const setField = (i: number, text: string) => {
    if (!social) return;
    const fields = social.fields.map((f, j) => (j === i ? (text === '' ? null : text) : f));
    update({ ...social, fields });
  };

  const addFieldLine = () => {
    if (!social || social.fields.length >= 8) return;
    update({ ...social, fields: [...social.fields, null] });
  };

  return (
    <div className="mb-areas">
      <WorkbenchToast wb={wb} />
      <AreaSidebar wb={wb} />

      <main className="mb-area-main">
        {!wb.area && <p className="mb-muted">Select an area to edit its socials (stock: social.are).</p>}

        {wb.area && (
          <>
            <WorkbenchToolbar wb={wb} />
            <WorkbenchManualPane wb={wb} />

            {!wb.manualOpen && (
              <div className="mb-editor-split">
                <nav className="mb-room-list">
                  <h4>Socials ({socials.length})</h4>
                  <button type="button" onClick={addSocial}>
                    + Add social
                  </button>
                  <ul>
                    {socials.map((s) => (
                      <li key={s.name}>
                        <button
                          type="button"
                          className={s.name === socialKey ? 'mb-active' : ''}
                          onClick={() => setSocialKey(s.name)}
                        >
                          {s.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
                <section>
                  <p className="mb-muted">
                    Socials load at boot only — hot reload skips #SOCIALS, so saved changes take effect at the next
                    copyover.
                  </p>
                  {social ? (
                    <>
                      <div className="mb-entity-actions">
                        <button type="button" className="mb-danger" onClick={deleteSocial}>
                          Delete social '{social.name}'
                        </button>
                      </div>
                      <fieldset className="mb-fieldset">
                        <legend>Social '{social.name}'</legend>
                        <div className="mb-form-grid">
                          <TextField
                            label="Social name"
                            value={social.name}
                            onChange={(name) => update({ ...social, name })}
                          />
                        </div>
                        <p className="mb-muted">
                          Blank = unset ($). act() tokens: $n you, $N the target, $e/$E he-she, $m/$M him-her, $s/$S
                          his-her.
                        </p>
                        {social.fields.map((f, i) => (
                          <TextField
                            key={i}
                            label={FIELD_LABELS[i] ?? `Message line ${i + 1}`}
                            value={f ?? ''}
                            onChange={(text) => setField(i, text)}
                          />
                        ))}
                        {social.fields.length < 8 && (
                          <button type="button" onClick={addFieldLine}>
                            + Add message line ({social.fields.length} of 8 present)
                          </button>
                        )}
                      </fieldset>
                    </>
                  ) : (
                    <p className="mb-muted">Pick a social.</p>
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
