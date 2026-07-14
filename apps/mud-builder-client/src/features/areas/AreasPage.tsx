import { useEffect, useState } from 'react';
import { parseAreaFile, emitAreaFile, type AreaFile, type Room, type RoomsSection } from '@shatteredarchive/merc-area';

import { api, type AreaListEntry, type Capabilities, type PreviewResult } from '../../api/client.js';
import RoomEditor from './RoomEditor.js';
import PreviewPane from './PreviewPane.js';
import './areas.css';

type Toast = { kind: 'ok' | 'err'; text: string } | null;

/**
 * The Phase-1 vertical slice: browse areas → pick a room → edit in the form
 * (primary) or the flagged Manual tab → PREVIEW the exact generated file →
 * download, or (when the server allows writes) save + hot reload / copyover.
 */
export default function AreasPage() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [areas, setAreas] = useState<AreaListEntry[]>([]);
  const [file, setFile] = useState<string | null>(null);
  const [area, setArea] = useState<AreaFile | null>(null);
  const [roomIdx, setRoomIdx] = useState<number | null>(null);
  const [tab, setTab] = useState<'form' | 'manual'>('form');
  const [manualText, setManualText] = useState('');
  const [manualEdited, setManualEdited] = useState(false);
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
      setRoomIdx(null);
      setPreview(null);
      setManualEdited(false);
      setTab('form');
    } catch (e) {
      err((e as Error).message);
    }
  };

  const roomsSection = area?.sections.find((s): s is RoomsSection => s.kind === 'rooms');
  const rooms = roomsSection?.rooms ?? [];
  const room = roomIdx !== null ? rooms[roomIdx] : null;

  const updateRoom = (updated: Room) => {
    if (!area || roomIdx === null || !roomsSection) return;
    const sections = area.sections.map((s) =>
      s === roomsSection ? { ...s, rooms: rooms.map((r, i) => (i === roomIdx ? updated : r)) } : s,
    );
    setArea({ sections });
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
      ok(`saved ${file}${r.backupPath ? ' (backup written)' : ''}${manualEdited ? ' — included MANUAL edits' : ''}`);
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
      err(`${mode} reload failed: ${(e as Error).message}${mode === 'hot' ? ' — consider Copyover (fresh slate)' : ''}`);
    }
  };

  const openManual = () => {
    if (!area) return;
    try {
      setManualText(emitAreaFile(area));
      setTab('manual');
    } catch (e) {
      err((e as Error).message);
    }
  };

  const applyManual = () => {
    try {
      setArea(parseAreaFile(manualText));
      setManualEdited(true);
      setTab('form');
      setPreview(null);
      ok('manual edits parsed and applied to the model');
    } catch (e) {
      err(`manual text does not parse: ${(e as Error).message}`);
    }
  };

  const writesOff = !caps?.writeEnabled;
  const gateTip = writesOff ? 'Disk writes are disabled (MUD_WRITE_ENABLED is not set) — preview/download only' : undefined;

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
        {!area && <p className="mb-muted">Select an area to begin.</p>}

        {area && (
          <>
            <div className="mb-toolbar">
              <strong>{file}</strong>
              <span className="mb-tabs">
                <button type="button" className={tab === 'form' ? 'mb-active' : ''} onClick={() => setTab('form')}>
                  UI editor
                </button>
                <button type="button" className={tab === 'manual' ? 'mb-active' : ''} onClick={openManual}>
                  Manual edit ⚠
                </button>
              </span>
              {manualEdited && <span className="mb-badge-manual">MANUAL EDITS</span>}
              <span className="mb-spacer" />
              <button type="button" onClick={() => void doPreview()}>
                Preview
              </button>
              <button type="button" onClick={doDownload}>
                Download
              </button>
              <button type="button" disabled={writesOff} title={gateTip} onClick={() => void doSave()}>
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

            {tab === 'manual' && (
              <div className="mb-manual">
                <p className="mb-manual-warning">
                  ⚠ Manual mode edits the raw area file text. Changes are validated by the parser before they touch
                  the model, and saves are marked as manually edited.
                </p>
                <textarea
                  aria-label="Raw area file text"
                  rows={24}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  spellCheck={false}
                />
                <button type="button" onClick={applyManual}>
                  Parse &amp; apply
                </button>
              </div>
            )}

            {tab === 'form' && (
              <div className="mb-editor-split">
                <nav className="mb-room-list">
                  <h4>Rooms ({rooms.length})</h4>
                  <ul>
                    {rooms.map((r, i) => (
                      <li key={r.vnum}>
                        <button
                          type="button"
                          className={i === roomIdx ? 'mb-active' : ''}
                          onClick={() => {
                            setRoomIdx(i);
                            setPreview(null);
                          }}
                        >
                          #{r.vnum} {r.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
                <section>
                  {room ? <RoomEditor room={room} onChange={updateRoom} /> : <p className="mb-muted">Pick a room.</p>}
                  {preview && <PreviewPane preview={preview} />}
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
