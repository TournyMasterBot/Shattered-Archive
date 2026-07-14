import { useEffect, useState } from 'react';
import {
  emitAreaFile,
  validateScripts,
  type AreaFile,
  type MobScript,
  type MobilesSection,
  type ScriptsSection,
} from '@shatteredarchive/merc-area';

import { api, type AreaListEntry, type Capabilities, type PreviewResult } from '../../api/client.js';
import ScriptEditor from './ScriptEditor.js';
import PreviewPane from '../areas/PreviewPane.js';
import '../areas/areas.css';

type Toast = { kind: 'ok' | 'err'; text: string } | null;

/**
 * Scripts authoring slice: pick an area → scripts listed by mob → edit in the
 * form (trigger/phrase/body with the command vocabulary beside it). Same
 * preview-first flow as rooms: Preview shows the exact generated file, writes
 * stay gated behind the server capability flag. Validation runs LIVE with the
 * same rules the server and the C engine enforce.
 */
export default function ScriptsPage() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [areas, setAreas] = useState<AreaListEntry[]>([]);
  const [file, setFile] = useState<string | null>(null);
  const [area, setArea] = useState<AreaFile | null>(null);
  const [scriptIdx, setScriptIdx] = useState<number | null>(null);
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
      setScriptIdx(null);
      setPreview(null);
    } catch (e) {
      err((e as Error).message);
    }
  };

  const scriptsSection = area?.sections.find((s): s is ScriptsSection => s.kind === 'scripts');
  const scripts = scriptsSection?.scripts ?? [];
  const script = scriptIdx !== null ? scripts[scriptIdx] : null;
  const mobs = (area?.sections ?? [])
    .filter((s): s is MobilesSection => s.kind === 'mobiles')
    .flatMap((s) => s.mobiles)
    .map((m) => ({ vnum: m.vnum, shortDescr: m.shortDescr }));
  const summary = area ? validateScripts(area) : null;

  const setScripts = (next: MobScript[]) => {
    if (!area) return;
    let sections;
    if (scriptsSection) {
      sections =
        next.length > 0
          ? area.sections.map((s) => (s === scriptsSection ? { ...s, scripts: next } : s))
          : area.sections.filter((s) => s !== scriptsSection);
    } else {
      // #SCRIPTS goes last so its mobs are always already loaded at boot.
      sections = [...area.sections, { kind: 'scripts' as const, scripts: next }];
    }
    setArea({ sections });
    setPreview(null);
  };

  const addScript = () => {
    if (mobs.length === 0) {
      err('this area has no mobiles to script');
      return;
    }
    setScripts([
      ...scripts,
      { mobVnum: mobs[0].vnum, trigger: 'speech', phrase: '', body: 'say Hello, $n!' },
    ]);
    setScriptIdx(scripts.length);
  };

  const updateScript = (updated: MobScript) => {
    if (scriptIdx === null) return;
    setScripts(scripts.map((s, i) => (i === scriptIdx ? updated : s)));
  };

  const deleteScript = () => {
    if (scriptIdx === null) return;
    setScripts(scripts.filter((_, i) => i !== scriptIdx));
    setScriptIdx(null);
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
  const gateTip = writesOff ? 'Disk writes are disabled (MUD_WRITE_ENABLED is not set) — preview/download only' : undefined;
  const invalid = (summary?.errors.length ?? 0) > 0;

  return (
    <div className="mb-areas">
      {toast && (
        <div className={`mb-toast mb-toast--${toast.kind}`} role="status" onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}

      <aside className="mb-area-list">
        <h3>Areas</h3>
        <ul>
          {areas.map((a) => (
            <li key={a.file}>
              <button
                type="button"
                className={a.file === file ? 'mb-active' : ''}
                onClick={() => void openArea(a.file)}
                title={a.error ?? a.credits}
              >
                {a.name ?? a.file} {a.error ? '⚠' : ''}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="mb-area-main">
        {!area && <p className="mb-muted">Select an area to script its mobs.</p>}

        {area && (
          <>
            <div className="mb-toolbar">
              <strong>{file}</strong>
              <span className="mb-spacer" />
              <button type="button" onClick={() => void doPreview()} disabled={invalid} title={invalid ? 'fix script errors first' : undefined}>
                Preview
              </button>
              <button type="button" onClick={doDownload}>
                Download
              </button>
              <button type="button" disabled={writesOff || invalid} title={gateTip} onClick={() => void doSave()}>
                Save
              </button>
              <button type="button" disabled={writesOff} title={gateTip} onClick={() => void doReload('hot')}>
                Hot reload
              </button>
              <button
                type="button"
                className="mb-danger"
                disabled={writesOff}
                title={gateTip ?? 'Fresh-slate warm reboot (recovery fallback)'}
                onClick={() => void doReload('copyover')}
              >
                Copyover (fresh slate)
              </button>
            </div>

            {invalid && (
              <div className="mb-script-errors" role="alert">
                <strong>Script problems (must be fixed before preview/save):</strong>
                <ul>
                  {summary!.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mb-editor-split">
              <nav className="mb-room-list">
                <h4>Scripts ({scripts.length})</h4>
                <ul>
                  {scripts.map((s, i) => (
                    <li key={`${s.mobVnum}-${s.trigger}-${i}`}>
                      <button
                        type="button"
                        className={i === scriptIdx ? 'mb-active' : ''}
                        onClick={() => {
                          setScriptIdx(i);
                          setPreview(null);
                        }}
                      >
                        #{s.mobVnum} {s.trigger}
                        {s.phrase ? ` '${s.phrase}'` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={addScript}>
                  + Add script
                </button>
              </nav>
              <section>
                {script ? (
                  <ScriptEditor script={script} mobs={mobs} onChange={updateScript} onDelete={deleteScript} />
                ) : (
                  <p className="mb-muted">Pick a script or add one.</p>
                )}
              </section>
            </div>

            {preview && <PreviewPane preview={preview} />}
          </>
        )}
      </main>
    </div>
  );
}
