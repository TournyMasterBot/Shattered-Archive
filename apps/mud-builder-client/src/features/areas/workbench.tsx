import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { emitAreaFile, parseAreaFile, type AreaFile } from '@shatteredarchive/merc-area';

import {
  api,
  ApiError,
  type AreaListEntry,
  type Capabilities,
  type PresenceEntry,
  type PreviewResult,
} from '../../api/client.js';
import type { FlagDef } from '../../data/flags.js';
import { Toast as ToastView, type ToastState } from '../shared/Toast.js';

/** @deprecated use ToastState from features/shared/Toast.js — kept as an alias so existing imports keep compiling. */
type Toast = ToastState;

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
  ok: (text: string) => void;
  err: (text: string) => void;
  warn: (text: string) => void;
  info: (text: string) => void;
  openArea: (f: string) => Promise<void>;
  /** Replace the working model (clears any stale preview). */
  setAreaModel: (next: AreaFile) => void;
  doPreview: () => Promise<void>;
  doDownload: () => void;
  doSave: () => Promise<void>;
  doReload: (mode: 'hot' | 'copyover') => Promise<void>;
  /** True after a save 409'd: the on-disk file changed since it was loaded. */
  conflict: boolean;
  /** Conflict path 1: discard local edits and reload the on-disk file. */
  conflictReload: () => Promise<void>;
  /** Conflict path 2: overwrite anyway (explicit confirm, saves without baseHash). */
  conflictSaveAnyway: () => Promise<void>;
  /** Advisory presence: who is editing what right now (includes self). */
  presence: PresenceEntry[];
  /** This session's presence name (key label or "master") — null until the first heartbeat lands. */
  presenceName: string | null;
  /** Manual raw-text editing: the generated file, editable, parse-validated back into the model. */
  manualOpen: boolean;
  manualText: string;
  /** True once manual text has been applied to the model (saves are labeled). */
  manualEdited: boolean;
  setManualText: (t: string) => void;
  toggleManual: () => void;
  applyManual: () => void;
  /** Create a new area file (server registers it in area.lst); opens it on success. */
  createArea: (input: { file: string; name: string; minVnum: number; maxVnum: number }) => Promise<boolean>;
  /** True when `area` differs from the last successful open/save/reload — nothing tracks this beyond a snapshot compare. */
  isDirty: boolean;
  /** No-ops (returns true) when clean; window.confirm's naming actionLabel when dirty. */
  confirmDiscard: (actionLabel: string) => boolean;
}

/** Heartbeat cadence — one third of the server's 60s presence TTL. */
export const PRESENCE_BEAT_MS = 20_000;

/**
 * Advisory presence: heartbeat the open file and poll who else is editing.
 * Failures are swallowed (presence must never get in the way of editing) —
 * an unauthenticated session simply casts no shadow.
 */
export function usePresence(file: string | null): { presence: PresenceEntry[]; presenceName: string | null } {
  const [presence, setPresence] = useState<PresenceEntry[]>([]);
  const [presenceName, setPresenceName] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (file) {
        try {
          const beat = await api.presenceBeat(file);
          if (!stopped) setPresenceName(beat.name);
        } catch {
          /* advisory only */
        }
      }
      try {
        const r = await api.presence();
        if (!stopped) setPresence(r.entries);
      } catch {
        /* advisory only */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), PRESENCE_BEAT_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [file]);

  return { presence, presenceName };
}

/** Names (other than self) currently editing the given file. */
export function othersEditing(presence: PresenceEntry[], presenceName: string | null, file: string | null): string[] {
  if (!file) return [];
  return presence.filter((e) => e.file === file && e.name !== presenceName).map((e) => e.name);
}

export function useAreaWorkbench(): AreaWorkbench {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [areas, setAreas] = useState<AreaListEntry[]>([]);
  const [file, setFile] = useState<string | null>(null);
  const [area, setArea] = useState<AreaFile | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  const [manualEdited, setManualEdited] = useState(false);
  const [baseHash, setBaseHash] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const { presence, presenceName } = usePresence(file);
  /** Snapshot of `area` as of the last successful open/save/reload — the dirty baseline. State (not a ref): must trigger a re-render so `isDirty` recomputes. */
  const [syncedSnapshot, setSyncedSnapshot] = useState<string | null>(null);
  const syncSnapshot = (a: AreaFile | null) => {
    setSyncedSnapshot(a ? JSON.stringify(a) : null);
  };

  const ok = (text: string) => setToast({ kind: 'ok', text });
  const err = (text: string) => setToast({ kind: 'err', text });
  const warn = (text: string) => setToast({ kind: 'warn', text });
  const info = (text: string) => setToast({ kind: 'info', text });

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
      syncSnapshot(r.area);
      setBaseHash(r.baseHash ?? null);
      setConflict(false);
      setPreview(null);
      setManualOpen(false);
      setManualEdited(false);
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
      const r = await api.save(file, area, baseHash ?? undefined);
      if (r.hash) setBaseHash(r.hash);
      setConflict(false);
      syncSnapshot(area);
      ok(`saved ${file}${r.backupPath ? ' (backup written)' : ''}${manualEdited ? ' — included MANUAL edits' : ''}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        err(`someone else saved ${file} since you loaded it — resolve the conflict below`);
        return;
      }
      err(`save failed: ${(e as Error).message}`);
    }
  };

  const conflictReload = async () => {
    if (!file) return;
    if (!window.confirm(`Discard YOUR unsaved changes to ${file} and reload what is on disk now?`)) return;
    await openArea(file);
    ok(`reloaded ${file} from disk — your previous edits were discarded`);
  };

  const conflictSaveAnyway = async () => {
    if (!file || !area) return;
    if (!window.confirm(`Overwrite ${file} with YOUR version, discarding the other builder's save? A backup of theirs is taken first.`)) return;
    try {
      const r = await api.save(file, area); // no baseHash: unconditional
      if (r.hash) setBaseHash(r.hash);
      setConflict(false);
      syncSnapshot(area);
      ok(`saved ${file} over the conflicting version${r.backupPath ? ' (their version is in the backup)' : ''}`);
    } catch (e) {
      err(`save failed: ${(e as Error).message}`);
    }
  };

  const toggleManual = () => {
    if (manualOpen) {
      setManualOpen(false);
      return;
    }
    if (!area) return;
    try {
      setManualText(emitAreaFile(area));
      setManualOpen(true);
    } catch (e) {
      err(`could not generate file text: ${(e as Error).message}`);
    }
  };

  /**
   * Parse the raw text and, only when syntactically valid, replace the model —
   * every form on the page re-renders from the applied text, so a pasted
   * snippet is immediately reviewable in the UI. Invalid text never touches
   * the model.
   */
  const applyManual = () => {
    try {
      setArea(parseAreaFile(manualText));
      setPreview(null);
      setManualEdited(true);
      setManualOpen(false);
      ok('manual edits parsed and applied — the forms now show them');
    } catch (e) {
      err(`manual text does not parse: ${(e as Error).message}`);
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

  const createArea = async (input: { file: string; name: string; minVnum: number; maxVnum: number }) => {
    try {
      const r = await api.createArea(input);
      const list = await api.listAreas();
      setAreas(list.areas);
      await openArea(r.file);
      ok(`created ${r.file} — ${r.note}`);
      return true;
    } catch (e) {
      err(`create failed: ${(e as Error).message}`);
      return false;
    }
  };

  const writesOff = !caps?.writeEnabled;
  const gateTip = writesOff
    ? 'Disk writes are disabled (MUD_WRITE_ENABLED is not set) — preview/download only'
    : undefined;

  const isDirty = useMemo(
    () => area != null && syncedSnapshot != null && JSON.stringify(area) !== syncedSnapshot,
    [area, syncedSnapshot],
  );
  const confirmDiscard = (actionLabel: string): boolean => {
    if (!isDirty) return true;
    return window.confirm(`You have unsaved changes to ${file}. Discard them and ${actionLabel}?`);
  };

  /** Browser-level "are you sure" on tab close/refresh while dirty — covers every consumer of this hook for free. */
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

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
    ok,
    err,
    warn,
    info,
    openArea,
    setAreaModel,
    doPreview,
    doDownload,
    doSave,
    doReload,
    conflict,
    conflictReload,
    conflictSaveAnyway,
    presence,
    presenceName,
    manualOpen,
    manualText,
    manualEdited,
    setManualText,
    toggleManual,
    applyManual,
    createArea,
    isDirty,
    confirmDiscard,
  };
}

/**
 * Save-conflict panel: shown after a 409, offering the two honest ways out.
 * The user's model is untouched until they choose.
 */
export function ConflictPanel({
  file,
  onReload,
  onSaveAnyway,
}: {
  file: string;
  onReload: () => void;
  onSaveAnyway: () => void;
}) {
  return (
    <div className="mb-conflict" role="alert" aria-label="Save conflict">
      <strong>⚠ Save conflict:</strong> {file} changed on disk since you loaded it — another builder (or an import)
      saved in between. Your edits are still here, unsaved.
      <div className="mb-row">
        <button type="button" onClick={onReload}>
          Reload from disk (discard mine)
        </button>
        <button type="button" className="mb-danger" onClick={onSaveAnyway}>
          Save anyway (overwrite theirs)
        </button>
      </div>
    </div>
  );
}

/** Banner inside the editor when another builder is on the SAME file. */
export function PresenceBanner({
  presence,
  presenceName,
  file,
}: {
  presence: PresenceEntry[];
  presenceName: string | null;
  file: string | null;
}) {
  const others = othersEditing(presence, presenceName, file);
  if (others.length === 0) return null;
  return (
    <div className="mb-presence-banner" role="status" aria-label="Also editing">
      👥 Also editing {file}: <strong>{others.join(', ')}</strong> — coordinate before saving.
    </div>
  );
}

/** Sidebar badge: other builders' names on one area entry. */
export function PresenceBadge({
  presence,
  presenceName,
  file,
}: {
  presence: PresenceEntry[];
  presenceName: string | null;
  file: string;
}) {
  const others = othersEditing(presence, presenceName, file);
  if (others.length === 0) return null;
  return (
    <span className="mb-presence-badge" title={`Editing now: ${others.join(', ')}`}>
      👥 {others.join(', ')}
    </span>
  );
}

export function WorkbenchToast({ wb }: { wb: AreaWorkbench }) {
  return <ToastView toast={wb.toast} onDismiss={() => wb.setToast(null)} />;
}

/**
 * Compact "+ New area" form (sidebar): file, name, vnum range → POST
 * /api/areas. Plain props so both the shared AreaSidebar and AreasPage's
 * bespoke sidebar can host it.
 */
export function NewAreaForm({
  writesOff,
  gateTip,
  onCreate,
}: {
  writesOff: boolean;
  gateTip?: string;
  onCreate: (input: { file: string; name: string; minVnum: number; maxVnum: number }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState('');
  const [name, setName] = useState('');
  const [minVnum, setMinVnum] = useState(0);
  const [maxVnum, setMaxVnum] = useState(0);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={writesOff}
        title={gateTip ?? 'Create a new area file (registered in area.lst)'}
      >
        + New area
      </button>
    );
  }

  const create = async () => {
    const f = file.trim().endsWith('.are') || file.trim() === '' ? file.trim() : `${file.trim()}.are`;
    if (await onCreate({ file: f, name: name.trim(), minVnum, maxVnum })) {
      setOpen(false);
      setFile('');
      setName('');
      setMinVnum(0);
      setMaxVnum(0);
    }
  };

  return (
    <div className="mb-new-area">
      <label className="mb-field">
        <span>File (.are)</span>
        <input aria-label="New area file name" value={file} onChange={(e) => setFile(e.target.value)} placeholder="myzone.are" />
      </label>
      <label className="mb-field">
        <span>Area name</span>
        <input aria-label="New area name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Zone" />
      </label>
      <div className="mb-row">
        <label className="mb-field">
          <span>Min vnum</span>
          <input aria-label="New area min vnum" type="number" value={minVnum} onChange={(e) => setMinVnum(Number(e.target.value) || 0)} />
        </label>
        <label className="mb-field">
          <span>Max vnum</span>
          <input aria-label="New area max vnum" type="number" value={maxVnum} onChange={(e) => setMaxVnum(Number(e.target.value) || 0)} />
        </label>
      </div>
      <div className="mb-row">
        <button type="button" onClick={() => void create()}>
          Create
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <p className="mb-muted">New files load into the game at the next copyover.</p>
    </div>
  );
}

export function AreaSidebar({
  wb,
  onBeforeOpen,
  extraToolbar,
}: {
  wb: AreaWorkbench;
  /** Optional guard run before switching areas (e.g. wb.confirmDiscard) — returning false cancels the switch. Omit for the default "always proceed" behavior every other tab already has. */
  onBeforeOpen?: (file: string) => boolean;
  /** Extra content rendered between "+ New area" and the area list (e.g. Areas' own "Import .are file…" toggle). */
  extraToolbar?: ReactNode;
}) {
  return (
    <aside className="mb-area-list">
      <h3>Areas</h3>
      <NewAreaForm writesOff={wb.writesOff} gateTip={wb.gateTip} onCreate={wb.createArea} />
      {extraToolbar}
      <ul>
        {wb.areas.map((a) => (
          <li key={a.file}>
            <button
              type="button"
              className={a.file === wb.file ? 'mb-active' : ''}
              onClick={() => {
                if (!onBeforeOpen || onBeforeOpen(a.file)) void wb.openArea(a.file);
              }}
              title={a.error ?? a.credits}
            >
              {a.name ?? a.file} {a.error ? '⚠' : ''}
            </button>
            <PresenceBadge presence={wb.presence} presenceName={wb.presenceName} file={a.file} />
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
    <>
      <PresenceBanner presence={wb.presence} presenceName={wb.presenceName} file={wb.file} />
      {wb.conflict && wb.file && (
        <ConflictPanel
          file={wb.file}
          onReload={() => void wb.conflictReload()}
          onSaveAnyway={() => void wb.conflictSaveAnyway()}
        />
      )}
      <div className="mb-toolbar">
      <strong>{wb.file}</strong>
      {wb.isDirty && (
        <span className="mb-unsaved-indicator" title="Unsaved changes">
          ● unsaved changes
        </span>
      )}
      <button type="button" className={wb.manualOpen ? 'mb-active' : ''} onClick={wb.toggleManual}>
        Manual edit ⚠
      </button>
      {wb.manualEdited && <span className="mb-badge-manual">MANUAL EDITS</span>}
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
    </>
  );
}

/**
 * Raw generated-file editor: the exact text the emitter produces, editable.
 * "Parse & apply" validates syntax and back-applies the text to the model, so
 * technical and non-technical collaborators can review the same change — one
 * as code, one in the forms.
 */
export function WorkbenchManualPane({ wb }: { wb: AreaWorkbench }) {
  if (!wb.manualOpen) return null;
  return (
    <div className="mb-manual">
      <p className="mb-manual-warning">
        ⚠ Manual mode edits the raw area file text. Changes are validated by the parser before they touch the
        model; once applied, the forms show them and saves are marked as manually edited.
      </p>
      <textarea
        aria-label="Raw area file text"
        rows={24}
        value={wb.manualText}
        onChange={(e) => wb.setManualText(e.target.value)}
        spellCheck={false}
      />
      <button type="button" onClick={wb.applyManual}>
        Parse &amp; apply
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
    <label className="mb-field">
      <span>{label}</span>
      <input aria-label={label} list={listId} value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {words.map((w) => (
          <option key={w} value={w} />
        ))}
      </datalist>
    </label>
  );
}

/** Compact labeled number input (label above, room-editor idiom). */
export function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="mb-field">
      <span>{label}</span>
      <input aria-label={label} type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
  );
}

/** Compact labeled text input (label above, room-editor idiom). */
export function TextField({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
}) {
  return (
    <label className="mb-field">
      <span>{label}</span>
      {rows ? (
        <textarea aria-label={label} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}
