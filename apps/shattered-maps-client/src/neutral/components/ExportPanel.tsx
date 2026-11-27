import { useMemo, useState } from 'react';
import { sliceMap, type MercExportResult } from '@shatteredarchive/shattered-maps-core';
import { loadForm, makeExport, requestBody, saveRange, type ExportForm } from '../builderExport';
import { downloadText } from '../fileio';
import { useNeutral } from '../state';
import styles from '../../styles/ExportPanel.module.scss';

/**
 * Export to the Builder: one area or subzone of the audited map as a Merc `.are` file, with a report of what the file has no place
 * for. The file is downloaded and imported in the Builder (its import page checks it again and the commit is the owner's step there);
 * this page never calls the Builder.
 */

export default function ExportPanel() {
  const { state } = useNeutral();
  const { focus, audited, view } = state;
  const eligible = view === 'audited' && focus !== null && (focus.level === 'area' || focus.level === 'subzone');
  const slice = useMemo(() => (eligible && focus ? sliceMap(audited, focus.level, focus.id) : null), [eligible, focus, audited]);

  if (view !== 'audited') return null;
  if (!eligible || !focus || !slice) {
    return (
      <section className={styles.panel} aria-label="Export to the Builder">
        <h3>Export to the Builder</h3>
        <p className={styles.hint}>Zoom to an area or a subzone of the audited map to export it as a Builder file.</p>
      </section>
    );
  }
  // A new form when the focus moves: the file name follows the area.
  return <Form key={`${focus.level}:${focus.id}`} level={focus.level} id={focus.id} title={slice.title} rooms={slice.rooms.length} />;
}

function Form({ level, id, title, rooms }: { level: string; id: string; title: string; rooms: number }) {
  const { state } = useNeutral();
  const [form, setForm] = useState<ExportForm>(() => loadForm(id, rooms));
  const [result, setResult] = useState<MercExportResult | null>(null);

  const run = (): void => {
    saveRange(form);
    setResult(makeExport(state.audited, state.focus, form));
  };
  const report = result?.report;
  const text = result?.text ?? null;

  return (
    <section className={styles.panel} aria-label="Export to the Builder">
      <h3>Export to the Builder</h3>
      <p className={styles.hint}>
        {level === 'area' ? 'Area' : 'Subzone'} <strong>{title}</strong>, {rooms} {rooms === 1 ? 'room' : 'rooms'}.
      </p>
      <div className={styles.fields}>
        <label>
          File name
          <input value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} maxLength={60} spellCheck={false} />
        </label>
        <label>
          First room number
          <input value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} inputMode="numeric" maxLength={5} />
        </label>
        <label>
          Last room number
          <input value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} inputMode="numeric" maxLength={5} />
        </label>
      </div>
      <p className={styles.hint}>Use a range that no area in the Builder has: the Builder reports an overlap when you import the file.</p>
      <button type="button" onClick={run}>
        Make the Builder file
      </button>

      {report && report.errors.length > 0 && (
        <ul className={styles.errors} role="alert">
          {report.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {report && text !== null && (
        <div className={styles.result} role="status">
          <p>
            <strong>{report.rooms}</strong> rooms and <strong>{report.exits}</strong> exits, numbers {form.first.trim()} to {form.last.trim()}
            {report.vnumsKept > 0 && <>; {report.vnumsKept} kept the number they had</>}
            {report.vnumsReplaced > 0 && <>; {report.vnumsReplaced} had a number that did not fit and got a new one</>}.
          </p>
          {report.candidateExits > 0 && <p>{report.candidateExits} exits were seen once or taken from an imported map, not walked both ways.</p>}
          {report.externalExits > 0 && <p>{report.externalExits} exits lead to rooms outside this export, by the number those rooms already have.</p>}
          <h4>What the file leaves out</h4>
          {report.unrepresentable.length === 0 ? (
            <p>Nothing.</p>
          ) : (
            <ul>
              {report.unrepresentable.map((u) => (
                <li key={u.what}>
                  {u.count} {u.what}
                </li>
              ))}
            </ul>
          )}
          <div className={styles.actions}>
            <button type="button" onClick={() => downloadText(form.fileName.trim(), text, 'text/plain')}>
              Download the .are file
            </button>
            <button type="button" onClick={() => downloadText(`${form.fileName.trim()}.request.json`, requestBody(form.fileName, text))}>
              Download as an import request
            </button>
          </div>
          <p className={styles.hint}>
            Import the file in MUD Builder (Import). The Builder checks it again and shows its own report; committing it there is a separate step, and a new
            area is loaded at the next copyover.
          </p>
        </div>
      )}
    </section>
  );
}
