import { useCallback, useMemo } from 'react';
import { NeutralProvider, useNeutral } from "./state";
import { activeMap, type NeutralState } from "./store";
import type { ItemStatus } from './review';
import FileBar from './components/FileBar';
import ExportPanel from './components/ExportPanel';
import ReviewPanel from './components/ReviewPanel';
import RoomPanel from './components/RoomPanel';
import SliceView from './components/SliceView';
import ZoomControl from './components/ZoomControl';
import '../styles/neutral-base.scss';
import styles from '../styles/NeutralApp.module.scss';

/**
 * The Mapper on the neutral map model: zoom from a continent down to one room, gaps and conflicts and off-page links drawn as such, the
 * baseline of a room, and the review of candidates into the audited layer file. The classic editor stays at `#/legacy`.
 */

function Screen() {
  const { state, dispatch } = useNeutral();
  const map = activeMap(state);
  const { focus, selected, view, log, notice, importReport } = state;

  const roomStatus = useMemo(() => {
    const latest = new Map<string, ItemStatus>();
    for (const d of log.decisions) if (d.kind === 'room') latest.set(d.id, d.status);
    return latest;
  }, [log]);
  const statusOf = useCallback((id: string): ItemStatus => roomStatus.get(id) ?? 'candidate', [roomStatus]);

  const selectedRoomId = selected?.kind === 'room' ? selected.id : selected?.kind === 'link' ? (map.links.find((l) => l.id === selected.id)?.from ?? null) : null;
  const empty = map.continents.length === 0;

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1>Shattered Maps</h1>
        <FileBar />
      </header>

      {notice && (
        <div className={`${styles.notice} ${notice.tone === 'error' ? styles.error : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dispatch({ type: 'notice', notice: null })}>
            ×
          </button>
        </div>
      )}

      {importReport && (
        <details className={styles.report} open>
          <summary>
            Read {importReport.rooms} rooms and {importReport.links} exits from the DslMapper document ({importReport.continents} continents, {importReport.areas} areas)
          </summary>
          {importReport.notes.length === 0 ? <p>Nothing was left behind.</p> : <ul>{importReport.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </details>
      )}

      {focus && !empty && <ZoomControl map={map} focus={focus} onFocus={(f) => dispatch({ type: 'focus', focus: f })} />}

      {empty || !focus ? (
        <main className={styles.empty}>
          <h2>{view === 'audited' ? 'The audited file is empty' : 'Nothing in this file'}</h2>
          <p>Open a candidates file (a map file from Copilot or the Azah import, or a DslMapper document) and review what is in it into the audited file.</p>
        </main>
      ) : (
        <main className={styles.main}>
          <div className={styles.map}>
            <SliceView
              map={map}
              focus={focus}
              floor={state.floor}
              onFloor={(floor) => dispatch({ type: 'floor', floor })}
              onFocus={(f) => dispatch({ type: 'focus', focus: f })}
              onSelectRoom={(id) => dispatch({ type: 'select', selected: { kind: 'room', id } })}
              selectedRoom={selectedRoomId}
              statusOf={view === 'candidates' ? statusOf : undefined}
            />
          </div>
          <aside className={styles.side}>
            {selectedRoomId && (
              <RoomPanel
                map={map}
                roomId={selectedRoomId}
                selectedLink={selected?.kind === 'link' ? selected.id : null}
                onSelectLink={(id) => dispatch({ type: 'select', selected: { kind: 'link', id } })}
                onGoTo={(id) => dispatch({ type: 'focus', focus: { level: 'room', id } })}
              />
            )}
            <ReviewPanel />
            <ExportPanel />
          </aside>
        </main>
      )}
    </div>
  );
}

export default function NeutralApp({ initial }: { initial?: NeutralState }) {
  return (
    <NeutralProvider initial={initial}>
      <Screen />
    </NeutralProvider>
  );
}
