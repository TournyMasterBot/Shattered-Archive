import { useEffect, useState } from 'react';
import { emitAreaFile, type AreaFile } from '@shatteredarchive/merc-area';

import { api, type AreaListEntry, type Capabilities, type PreviewResult } from '../../api/client.js';
import type { FlagDef } from '../../data/flags.js';

type Toast = { kind: 'ok' | 'err'; text: string } | null;

/**
 * Shared state + actions for every "pick an area → edit a slice → preview →
 * gated write" page (Mobs, Objects, …). Same behavior as AreasPage/ScriptsPage:
 * Preview shows the exact generated file, Download is always available, and
 * Save/Hot reload/Copyover stay disabled while the server gates writes off.
 */
export interface AreaWorkbench {
  caps: Capabilities | null;
  areas: AreaListEntry[];
  file: string | null;
  area: AreaFile | null;
  preview: PreviewResult | null;
  toast: Toast;
  writesOff: boolean;
  gateTip: string | undefined;
  setToast: (t: Toast) => void;
  err: (text: string) => void;
  openArea: (f: string) => Promise<void>;
  /** Replace the working model (clears any stale preview). */
  setAreaModel: (next: AreaFile) => void;
  doPreview: () => Promise<void>;
  doDownload: () => void;
  doSave: () => Promise<void>;
  doReload: (mode: 'hot' | 'copyover') => Promise<void>;
}

export function useAreaWorkbench(): AreaWorkbench {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [areas, setAreas] = useState<AreaListEntry[]>([]);
  const [file, setFile] = useState<string | null>(null);
  const [area, setArea] = useState<AreaFile | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const ok = (text: string) => setToast({ kind: 'ok', text });
  const err = (text: string) => setToast({ kind: 'err', text });

  useEffect(() => {
    api
      .capabilities()
      .then(setCaps)
      .catch((e) => err(`server unreachable: ${(e as Error).message}`));
    api
      .listAreas()
      .then((r) => setAreas(r.areas))
      .catch((e) => err((e as Error).message));
  }, []);

  const openArea = async (f: string) => {
    try {
      const r = await api.getArea(f);
      setFile(f);
      setArea(r.area);
      setPreview(null);
    } catch (e) {
      err((e as Error).message);
    }
  };

  const setAreaModel = (next: AreaFile) => {
    setArea(next);
    setPreview(null);
  };

  const doPreview = async () => {
    if (!file || !area) return;
    try {
      setPreview(await api.preview(file, area));
    } catch (e) {
      err(`preview failed: ${(e as Error).message}`);
    }
  };

  const doDownload = () => {
    if (!file || !area) return;
    try {
      const text = emitAreaFile(area);
      const blob = new Blob([text], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      err(`could not generate file: ${(e as Error).message}`);
    }
  };

  const doSave = async () => {
    if (!file || !area) return;
    try {
      const r = await api.save(file, area);
      ok(`saved ${file}${r.backupPath ? ' (backup written)' : ''}`);
    } catch (e) {
      err(`save failed: ${(e as Error).message}`);
    }
  };

  const doReload = async (mode: 'hot' | 'copyover') => {
    if (mode === 'copyover') {
      const sure = window.confirm(
        'Copyover rebuilds the ENTIRE world from disk. Players stay connected but see a brief pause. Proceed?',
      );
      if (!sure) return;
    }
    try {
      await api.reload(mode, file ?? undefined);
      ok(mode === 'hot' ? 'hot reload signaled — the MUD applies it within a second' : 'copyover signaled');
    } catch (e) {
      err(`${mode} reload failed: ${(e as Error).message}`);
    }
  };

  const writesOff = !caps?.writeEnabled;
  const gateTip = writesOff
    ? 'Disk writes are disabled (MUD_WRITE_ENABLED is not set) — preview/download only'
    : undefined;

  return {
    caps,
    areas,
    file,
    area,
    preview,
    toast,
    writesOff,
    gateTip,
    setToast,
    err,
    openArea,
    setAreaModel,
    doPreview,
    doDownload,
    doSave,
    doReload,
  };
}

export function WorkbenchToast({ wb }: { wb: AreaWorkbench }) {
  if (!wb.toast) return null;
  return (
    <div className={`mb-toast mb-toast--${wb.toast.kind}`} role="status" onClick={() => wb.setToast(null)}>
      {wb.toast.text}
    </div>
  );
}

export function AreaSidebar({ wb }: { wb: AreaWorkbench }) {
  return (
    <aside className="mb-area-list">
      <h3>Areas</h3>
      <ul>
        {wb.areas.map((a) => (
          <li key={a.file}>
            <button
              type="button"
              className={a.file === wb.file ? 'mb-active' : ''}
              onClick={() => void wb.openArea(a.file)}
              title={a.error ?? a.credits}
            >
              {a.name ?? a.file} {a.error ? '⚠' : ''}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function WorkbenchToolbar({
  wb,
  invalid = false,
  invalidTip,
}: {
  wb: AreaWorkbench;
  invalid?: boolean;
  invalidTip?: string;
}) {
  return (
    <div className="mb-toolbar">
      <strong>{wb.file}</strong>
      <span className="mb-spacer" />
      <button type="button" onClick={() => void wb.doPreview()} disabled={invalid} title={invalid ? invalidTip : undefined}>
        Preview
      </button>
      <button type="button" onClick={wb.doDownload}>
        Download
      </button>
      <button
        type="button"
        disabled={wb.writesOff || invalid}
        title={wb.gateTip ?? (invalid ? invalidTip : undefined)}
        onClick={() => void wb.doSave()}
      >
        Save
      </button>
      <button type="button" disabled={wb.writesOff} title={wb.gateTip} onClick={() => void wb.doReload('hot')}>
        Hot reload
      </button>
      <button
        type="button"
        className="mb-danger"
        disabled={wb.writesOff}
        title={wb.gateTip ?? 'Fresh-slate warm reboot (recovery fallback)'}
        onClick={() => void wb.doReload('copyover')}
      >
        Copyover (fresh slate)
      </button>
    </div>
  );
}

/** Checkbox grid over a bit vector; unknown bits are preserved untouched. */
export function FlagGrid({
  label,
  flags,
  value,
  onChange,
}: {
  label: string;
  flags: FlagDef[];
  value: number;
  onChange: (next: number) => void;
}) {
  const known = flags.reduce((acc, f) => acc | f.bit, 0);
  const unknown = value & ~known;
  return (
    <fieldset className="mb-flag-grid">
      <legend>
        {label}
        {unknown !== 0 && <span className="mb-muted"> (+unlisted bits preserved)</span>}
      </legend>
      <div className="mb-flag-grid-items">
        {flags.map((f) => (
          <label key={f.name}>
            <input
              type="checkbox"
              checked={(value & f.bit) !== 0}
              onChange={(e) => onChange(e.target.checked ? value | f.bit : value & ~f.bit)}
            />
            {f.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Text input with known-word suggestions; unknown words are kept verbatim. */
export function WordInput({
  label,
  value,
  words,
  onChange,
}: {
  label: string;
  value: string;
  words: string[];
  onChange: (next: string) => void;
}) {
  const listId = `mb-words-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <label className="mb-form-row">
      {label}
      <input aria-label={label} list={listId} value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {words.map((w) => (
          <option key={w} value={w} />
        ))}
      </datalist>
    </label>
  );
}
