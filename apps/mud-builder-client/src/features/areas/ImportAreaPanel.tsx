import { useRef, useState } from 'react';

import { api, type ImportReport } from '../../api/client.js';
import { ExternalRefList } from './PreviewPane.js';
import './areas.css';

/**
 * .are import (Phase 10): pick or paste an existing area file, validate it in
 * quarantine (the server never touches disk for the report), review errors/
 * warnings/entity summary and the canonical text, then commit. Errors block
 * the commit; overwriting an existing file needs the explicit checkbox.
 */
export default function ImportAreaPanel({
  writesOff,
  gateTip,
  onImported,
  onClose,
}: {
  writesOff: boolean;
  gateTip: string | undefined;
  /** Called with the imported file name after a successful commit. */
  onImported: (file: string, note: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [file, setFile] = useState('');
  const [text, setText] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const invalidate = () => {
    // any input change makes the last report stale — never commit stale
    setReport(null);
    setOverwrite(false);
    setError(null);
  };

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    invalidate();
    setFile(f.name);
    const reader = new FileReader();
    reader.onload = () => setText(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => setError(`could not read ${f.name}`);
    reader.readAsText(f);
  };

  const validate = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.importPreview(file.trim(), text);
      setReport(r.report);
      setOverwrite(false);
    } catch (e) {
      setReport(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!report || report.errors.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.importCommit(file.trim(), text, overwrite);
      await onImported(r.file, r.note);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const downloadNormalized = () => {
    if (!report?.normalizedText) return;
    const blob = new Blob([report.normalizedText], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = report.file;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const canValidate = file.trim().length > 0 && text.trim().length > 0 && !busy;
  const commitBlocked =
    busy || writesOff || !report || report.errors.length > 0 || (report.exists && !overwrite);

  return (
    <div className="mb-import">
      <div className="mb-toolbar">
        <strong>Import .are file</strong>
        <span className="mb-spacer" />
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="mb-muted">
        The file is validated in quarantine — nothing touches the area directory until the report is clean and you
        commit. New files load at the next copyover.
      </p>

      <fieldset className="mb-fieldset">
        <legend>Source</legend>
        <label className="mb-field">
          Area file
          <input
            ref={fileInput}
            aria-label="Area file to import"
            type="file"
            accept=".are,text/plain"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </label>
        <label className="mb-field">
          File name
          <input
            aria-label="Import file name"
            value={file}
            onChange={(e) => {
              setFile(e.target.value);
              invalidate();
            }}
            placeholder="myarea.are"
          />
        </label>
        <label className="mb-field">
          File text (or paste it here)
          <textarea
            aria-label="Area file text"
            rows={10}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              invalidate();
            }}
            spellCheck={false}
          />
        </label>
        <button type="button" onClick={() => void validate()} disabled={!canValidate}>
          Validate
        </button>
      </fieldset>

      {error ? <p className="mb-toast mb-toast--err">{error}</p> : null}

      {report ? (
        <fieldset className="mb-fieldset">
          <legend>Validation report</legend>
          {report.errors.length === 0 ? (
            <p className="mb-toast mb-toast--ok">Clean — no blocking errors.</p>
          ) : (
            <>
              <p className="mb-toast mb-toast--err">{report.errors.length} error(s) block this import:</p>
              <ul className="mb-list" aria-label="Import errors">
                {report.errors.map((e) => (
                  <li key={e}>⛔ {e}</li>
                ))}
              </ul>
            </>
          )}
          {report.warnings.length > 0 ? (
            <ul className="mb-list" aria-label="Import warnings">
              {report.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          ) : null}
          {/* No onNavigate here: leaving the panel would discard the pasted upload. */}
          <ExternalRefList refs={report.externalRefs ?? []} />
          {report.summary ? (
            <p aria-label="Entity summary">
              {Object.entries(report.summary)
                .map(([kind, count]) => `${kind}: ${count}`)
                .join(' · ') || 'no entities (header-only file)'}
            </p>
          ) : null}

          {report.normalizedText !== null ? (
            <>
              <label className="mb-field">
                Canonical text (what a commit writes)
                <textarea aria-label="Canonical text" rows={10} readOnly value={report.normalizedText} spellCheck={false} />
              </label>
              <button type="button" onClick={downloadNormalized}>
                Download canonical file
              </button>
            </>
          ) : null}

          {report.exists ? (
            <label className="mb-field">
              <span>
                Overwrite existing {report.file} (timestamped backup is taken first)
              </span>
              <input
                aria-label="Overwrite existing file"
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
            </label>
          ) : null}

          <button
            type="button"
            disabled={commitBlocked}
            title={writesOff ? gateTip : report.errors.length > 0 ? 'fix the blocking errors first' : undefined}
            onClick={() => void commit()}
          >
            Commit import
          </button>
        </fieldset>
      ) : null}
    </div>
  );
}
