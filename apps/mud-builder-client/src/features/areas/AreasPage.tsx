import { useEffect, useState } from 'react';
import { parseAreaFile, emitAreaFile, type AreaFile, type Room, type RoomsSection } from '@shatteredarchive/merc-area';

import {
  api,
  ApiError,
  type AreaListEntry,
  type Capabilities,
  type ExternalRef,
  type PreviewResult,
} from '../../api/client.js';
import { addRoom as addRoomToModel, deleteBlockers, newRoomTemplate, nextFreeVnum, removeEntity } from './model-ops.js';
import RoomEditor from './RoomEditor.js';
import AreaHeaderEditor from './AreaHeaderEditor.js';
import PreviewPane from './PreviewPane.js';
import { ConflictPanel, NewAreaForm, PresenceBadge, PresenceBanner, usePresence } from './workbench.js';
import ImportAreaPanel from './ImportAreaPanel.js';
import './areas.css';

type Toast = { kind: 'ok' | 'err'; text: string } | null;

/**
 * The Phase-1 vertical slice: browse areas → pick a room → edit in the form
 * (primary) or the flagged Manual tab → PREVIEW the exact generated file →
 * download, or (when the server allows writes) save + hot reload / copyover.
 */
export default function AreasPage({
  initialTarget,
  onOpenSpawn,
}: { initialTarget?: ExternalRef | null; onOpenSpawn?: (vnum: number) => void } = {}) {
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
  const [importing, setImporting] = useState(false);
  const [baseHash, setBaseHash] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const { presence, presenceName } = usePresence(file);

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

  const openArea = async (f: string, selectRoomVnum?: number) => {
    try {
      const r = await api.getArea(f);
      setFile(f);
      setArea(r.area);
      setBaseHash(r.baseHash ?? null);
      setConflict(false);
      const loadedRooms = r.area.sections.find((s): s is RoomsSection => s.kind === 'rooms')?.rooms ?? [];
      const idx = selectRoomVnum === undefined ? -1 : loadedRooms.findIndex((room) => room.vnum === selectRoomVnum);
      setRoomIdx(idx >= 0 ? idx : null);
      setPreview(null);
      setManualEdited(false);
      setTab('form');
    } catch (e) {
      err((e as Error).message);
    }
  };

  // Cross-page navigation target (e.g. a World-dashboard external-ref link).
  useEffect(() => {
    if (initialTarget) {
      setImporting(false);
      void openArea(initialTarget.file, initialTarget.kind === 'room' ? initialTarget.vnum : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTarget]);

  /** Open the area (and room, when it is one) that defines an external ref. */
  const navigateToRef = (ref: ExternalRef) => {
    setImporting(false);
    void openArea(ref.file, ref.kind === 'room' ? ref.vnum : undefined);
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

  const addRoom = () => {
    if (!area) return;
    const vnum = nextFreeVnum(area);
    if (vnum === null) {
      err("no free vnum left in this area's declared range");
      return;
    }
    const next = addRoomToModel(area, newRoomTemplate(vnum));
    setArea(next);
    setPreview(null);
    const nextRooms = next.sections.find((s): s is RoomsSection => s.kind === 'rooms')?.rooms ?? [];
    setRoomIdx(nextRooms.findIndex((r) => r.vnum === vnum));
  };

  const deleteRoom = () => {
    if (!area || !room) return;
    const blockers = deleteBlockers(area, 'room', room.vnum);
    if (blockers.length > 0) {
      err(
        `cannot delete room #${room.vnum} — still referenced by: ${blockers.slice(0, 3).join('; ')}` +
          (blockers.length > 3 ? ` (+${blockers.length - 3} more)` : ''),
      );
      return;
    }
    if (!window.confirm(`Delete room #${room.vnum}? The live room persists until the next copyover.`)) return;
    setArea(removeEntity(area, 'room', room.vnum));
    setRoomIdx(null);
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
      ok(`saved ${file} over the conflicting version${r.backupPath ? ' (their version is in the backup)' : ''}`);
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
        <NewAreaForm
          writesOff={!caps?.writeEnabled}
          gateTip={!caps?.writeEnabled ? 'Disk writes are disabled (MUD_WRITE_ENABLED is not set)' : undefined}
          onCreate={createArea}
        />
        <button type="button" className={importing ? 'mb-active' : ''} onClick={() => setImporting((v) => !v)}>
          Import .are file…
        </button>
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
              <PresenceBadge presence={presence} presenceName={presenceName} file={a.file} />
            </li>
          ))}
        </ul>
      </aside>

      <main className="mb-area-main">
        {importing && (
          <ImportAreaPanel
            writesOff={writesOff}
            gateTip={gateTip}
            onClose={() => setImporting(false)}
            onImported={async (f, note) => {
              setImporting(false);
              try {
                const list = await api.listAreas();
                setAreas(list.areas);
                await openArea(f);
              } catch (e) {
                err((e as Error).message);
                return;
              }
              ok(`imported ${f} — ${note}`);
            }}
          />
        )}

        {!importing && !area && <p className="mb-muted">Select an area to begin.</p>}

        {!importing && area && (
          <>
            <PresenceBanner presence={presence} presenceName={presenceName} file={file} />
            {conflict && file && (
              <ConflictPanel
                file={file}
                onReload={() => void conflictReload()}
                onSaveAnyway={() => void conflictSaveAnyway()}
              />
            )}
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
              <AreaHeaderEditor
                area={area}
                onChange={(next) => {
                  setArea(next);
                  setPreview(null);
                }}
              />
            )}

            {tab === 'form' && (
              <div className="mb-editor-split">
                <nav className="mb-room-list">
                  <h4>Rooms ({rooms.length})</h4>
                  <button type="button" onClick={addRoom}>
                    + Add room
                  </button>
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
                  {room ? (
                    <>
                      <div className="mb-entity-actions">
                        <button type="button" className="mb-danger" onClick={deleteRoom}>
                          Delete room #{room.vnum}
                        </button>
                      </div>
                      <RoomEditor room={room} onChange={updateRoom} onOpenSpawn={onOpenSpawn} />
                    </>
                  ) : (
                    <p className="mb-muted">Pick a room.</p>
                  )}
                  {preview && <PreviewPane preview={preview} onNavigate={navigateToRef} />}
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
