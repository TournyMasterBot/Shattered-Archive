import type { ChangeEvent } from 'react';
import { legacyToMapFile } from '../adapter';
import { downloadText, openFile } from '../fileio';
import { useNeutral } from '../state';
import styles from '../../styles/FileBar.module.scss';

/**
 * Opening and saving: a candidates file (a neutral map file, plain or gzipped, or a DslMapper document read through the adapter), the
 * audited file, and the two downloads (the audited map file and the review log). Choosing what to look at.
 */

const today = (): string => new Date().toISOString().slice(0, 10);

export default function FileBar() {
  const { state, dispatch } = useNeutral();

  const refuse = (errors: string[]): void =>
    dispatch({ type: 'notice', notice: { tone: 'error', text: `${errors.slice(0, 3).join(' ')}${errors.length > 3 ? ` (and ${errors.length - 3} more)` : ''}` } });

  const openCandidates = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const opened = await openFile(file);
    if (opened.kind === 'map') dispatch({ type: 'open-candidates', map: opened.map, name: file.name });
    else if (opened.kind === 'legacy') {
      const { map, report } = legacyToMapFile(opened.doc, { date: today() });
      dispatch({ type: 'open-candidates', map, name: `${file.name} (DslMapper document)`, report });
    } else refuse(opened.errors);
  };

  const openAudited = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const opened = await openFile(file);
    if (opened.kind === 'legacy') {
      refuse(['That is a DslMapper document. Open it as the candidates file and review it into the audited file.']);
      return;
    }
    if (opened.kind !== 'map') {
      refuse(opened.errors);
      return;
    }
    if (state.audited.continents.length > 0 && !window.confirm('Replace the audited file in this browser with the one you opened?')) return;
    dispatch({ type: 'open-audited', map: opened.map });
  };

  const download = (): void => downloadText(`audited-map-${today()}.json`, JSON.stringify({ ...state.audited, generatedAt: today() }));
  const downloadLog = (): void => downloadText(`review-log-${today()}.json`, JSON.stringify(state.log));
  const clear = (): void => {
    if (window.confirm('Empty the audited file and the review log in this browser? Download them first if you want to keep them.')) dispatch({ type: 'reset-audited' });
  };

  return (
    <div className={styles.bar} role="group" aria-label="Files">
      <label className={styles.file}>
        Open candidates…
        <input type="file" accept=".json,.gz,application/json,application/gzip" onChange={openCandidates} aria-label="Open a candidates file" />
      </label>
      <label className={styles.file}>
        Open audited…
        <input type="file" accept=".json,application/json" onChange={openAudited} aria-label="Open the audited file" />
      </label>
      <button type="button" onClick={download}>
        Download audited file
      </button>
      <button type="button" onClick={downloadLog}>
        Download review log
      </button>
      <button type="button" onClick={clear}>
        Empty audited file
      </button>
      <fieldset className={styles.views}>
        <legend>Showing</legend>
        <label>
          <input type="radio" name="view" checked={state.view === 'audited'} onChange={() => dispatch({ type: 'view', view: 'audited' })} /> Audited
        </label>
        <label>
          <input type="radio" name="view" checked={state.view === 'candidates'} disabled={state.candidates === null} onChange={() => dispatch({ type: 'view', view: 'candidates' })} />{' '}
          Candidates{state.candidatesName ? ` (${state.candidatesName})` : ''}
        </label>
      </fieldset>
      <a className={styles.classic} href="#/legacy">
        Classic editor
      </a>
    </div>
  );
}
