import React from 'react';
import styles from '../styles/ContributeLoreModal.module.scss';
import { DispatchEvent, ListenEvent } from '../features/event-emitter/event-dispatcher';

type RawDataPayload = {
  rawText?: string;
  text?: string;
  fromUserScript?: boolean;
  receivedTimestamp?: number;
};

type IdentitySnapshot = {
  characterName?: string;
  updatedAt?: number;
};

export interface ContributeCreatureLoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
}

function getIdentitySnapshot(): IdentitySnapshot {
  const w = window as any;
  return (w.__SA_IDENTITY__ ?? {}) as IdentitySnapshot;
}

type CaptureStage = 'lore' | 'look' | null;

function isBlankLine(s: string) {
  return String(s ?? '').trim().length === 0;
}

function applyBlankLineTailTrim(lines: string[]) {
  if (lines.length >= 2 && isBlankLine(lines[lines.length - 2])) {
    return lines.slice(0, -2);
  }
  return lines;
}

type ContinentNamesResponse = { continentNames?: string[] };
type AreaNamesResponse = { areaNames?: string[] };

const MAPS_BASE = 'https://web-server.shatteredarchive.dev';

export const ContributeCreatureLoreModal: React.FC<ContributeCreatureLoreModalProps> = ({
  isOpen,
  onClose,
  connectionId,
}) => {
  const [continent, setContinent] = React.useState('');
  const [area, setArea] = React.useState('');

  const [continentNames, setContinentNames] = React.useState<string[]>([]);
  const [areasByContinent, setAreasByContinent] = React.useState<Record<string, string[]>>({});

  const [mapsLoading, setMapsLoading] = React.useState(false);
  const [continentError, setContinentError] = React.useState<string | null>(null);
  const [areaFetchErrors, setAreaFetchErrors] = React.useState<Record<string, string>>({});

  const [shortText, setShortText] = React.useState('');
  const [longText, setLongText] = React.useState('');

  const [loreLines, setLoreLines] = React.useState<string[]>([]);
  const [lookLines, setLookLines] = React.useState<string[]>([]);

  const [identity, setIdentity] = React.useState<IdentitySnapshot>({});

  const [stage, setStage] = React.useState<CaptureStage>(null);
  const [isRunning, setIsRunning] = React.useState(false);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitOk, setSubmitOk] = React.useState(false);

  const unbindRef = React.useRef<null | (() => void)>(null);
  const stageTimerRef = React.useRef<number | null>(null);
  const delayTimerRef = React.useRef<number | null>(null);
  const stageRef = React.useRef<CaptureStage>(null);

  const clearTimers = React.useCallback(() => {
    if (stageTimerRef.current != null) {
      window.clearTimeout(stageTimerRef.current);
      stageTimerRef.current = null;
    }
    if (delayTimerRef.current != null) {
      window.clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
  }, []);

  const stopListening = React.useCallback(() => {
    try {
      unbindRef.current?.();
    } catch {
      // ignore
    }
    unbindRef.current = null;
  }, []);

  const stopAll = React.useCallback(() => {
    clearTimers();
    stopListening();
    stageRef.current = null;
    setStage(null);
    setIsRunning(false);
  }, [clearTimers, stopListening]);

  const appendLineToStage = React.useCallback((which: CaptureStage, raw: string) => {
    if (!which) return;

    if (which === 'lore') {
      setLoreLines((prev) => applyBlankLineTailTrim([...prev, raw]));
    } else if (which === 'look') {
      setLookLines((prev) => applyBlankLineTailTrim([...prev, raw]));
    }
  }, []);

  const startListeningForStage = React.useCallback(
    (which: CaptureStage) => {
      stopListening();

      stageRef.current = which;
      setStage(which);

      unbindRef.current = ListenEvent<RawDataPayload>(
        'shatteredarchive:raw-data',
        (payload) => {
          const raw = String(payload?.rawText ?? payload?.text ?? '');
          if (!raw) return;
          appendLineToStage(stageRef.current, raw);
        },
        { key: 'ContributeCreatureLoreModal::raw-data-capture' },
      );
    },
    [appendLineToStage, stopListening],
  );

  // -----------------------------
  // Maps metadata loading (non-blocking)
  // -----------------------------
  const fetchContinentsAndAreas = React.useCallback((signal: AbortSignal) => {
    (async () => {
      setMapsLoading(true);
      setContinentError(null);

      try {
        const res = await fetch(`${MAPS_BASE}/maps/continent/names`, { signal });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Failed to load continents (${res.status})${text ? `: ${text}` : ''}`);
        }

        const json = (await res.json().catch(() => ({}))) as ContinentNamesResponse;
        const names = Array.isArray(json?.continentNames) ? json.continentNames.filter(Boolean) : [];

        setContinentNames(names);

        for (const c of names) {
          if (!c) continue;

          try {
            const url = `${MAPS_BASE}/maps/continent/${encodeURIComponent(c)}/get-area-names`;
            const r2 = await fetch(url, { signal });

            if (!r2.ok) {
              const t2 = await r2.text().catch(() => '');
              throw new Error(`Failed to load areas (${r2.status})${t2 ? `: ${t2}` : ''}`);
            }

            const j2 = (await r2.json().catch(() => ({}))) as AreaNamesResponse;
            const areas = Array.isArray(j2?.areaNames) ? j2.areaNames.filter(Boolean) : [];

            setAreasByContinent((prev) => ({ ...prev, [c]: areas }));
          } catch (err) {
            if (signal.aborted) return;
            const msg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
            setAreaFetchErrors((prev) => ({ ...prev, [c]: msg }));
          }
        }
      } catch (err) {
        if (signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
        setContinentError(msg);
      } finally {
        if (!signal.aborted) setMapsLoading(false);
      }
    })();
  }, []);

  React.useEffect(() => {
    if (!continent) {
      setArea('');
      return;
    }

    const areas = areasByContinent[continent] ?? [];
    if (area && !areas.includes(area)) {
      setArea('');
    }
  }, [continent, areasByContinent, area]);

  // -----------------------------
  // Capture run (8s delay)
  // -----------------------------
  const runSequence = React.useCallback(() => {
    setSubmitError(null);
    setSubmitOk(false);

    const short = String(shortText ?? '').trim();
    if (!short) {
      setSubmitError('Short is required.');
      return;
    }
    if (!connectionId || !String(connectionId).trim()) {
      setSubmitError('Missing connectionId.');
      return;
    }

    stopAll();
    setLoreLines([]);
    setLookLines([]);

    setIsRunning(true);

    startListeningForStage('lore');

    DispatchEvent('shatteredarchive:send-command', {
      cmd: `creaturelore ${short}`,
      connectionId,
    });

    stageTimerRef.current = window.setTimeout(() => {
      stopListening();
      setStage(null);

      delayTimerRef.current = window.setTimeout(() => {
        startListeningForStage('look');

        DispatchEvent('shatteredarchive:send-command', {
          cmd: `look ${short}`,
          connectionId,
        });

        stageTimerRef.current = window.setTimeout(() => {
          stopListening();
          setStage(null);
          setIsRunning(false);
          setSubmitOk(true);
        }, 1000);
      }, 8000);
    }, 1000);
  }, [shortText, connectionId, startListeningForStage, stopListening, stopAll]);

  // -----------------------------
  // Modal lifecycle
  // -----------------------------
  React.useEffect(() => {
    if (!isOpen) {
      stopAll();
      setSubmitError(null);
      setSubmitOk(false);
      setIsSubmitting(false);
      setMapsLoading(false);
      setContinentError(null);
      return;
    }

    setIdentity(getIdentitySnapshot());

    const off = ListenEvent<IdentitySnapshot>(
      'shatteredarchive:identity-updated',
      (snap) => {
        setIdentity({
          characterName: snap?.characterName,
          updatedAt: snap?.updatedAt,
        });
      },
      { key: 'ContributeCreatureLoreModal::identity-updated' },
    );

    const controller = new AbortController();
    fetchContinentsAndAreas(controller.signal);

    return () => {
      try {
        off?.();
      } catch {
        // ignore
      }
      try {
        controller.abort();
      } catch {
        // ignore
      }
      stopAll();
    };
  }, [isOpen, stopAll, fetchContinentsAndAreas]);

  if (!isOpen) return null;

  const deleteLoreLine = (idx: number) => setLoreLines((prev) => prev.filter((_, i) => i !== idx));
  const deleteLookLine = (idx: number) => setLookLines((prev) => prev.filter((_, i) => i !== idx));

  const identityStatus = (() => {
    const char = String(identity?.characterName ?? '').trim();
    return char ? char : '(character unknown)';
  })();

  const onSubmit = async () => {
    setSubmitError(null);
    setSubmitOk(false);

    const characterName = String(identity?.characterName ?? '').trim();
    const short = String(shortText ?? '').trim();
    const long = String(longText ?? '').trim();

    const creatureLore = loreLines.join('\n').trim();
    const creatureLook = lookLines.join('\n').trim();

    const selectedContinent = String(continent ?? '').trim();
    const selectedArea = String(area ?? '').trim();

    if (!short) {
      setSubmitError('Short is required.');
      return;
    }
    if (!connectionId || !String(connectionId).trim()) {
      setSubmitError('Missing connectionId.');
      return;
    }
    if (!characterName) {
      setSubmitError('Missing identity: character name not captured yet (GMCP login_data).');
      return;
    }
    if (!selectedContinent) {
      setSubmitError('Continent is required.');
      return;
    }
    if (!selectedArea) {
      setSubmitError('Area is required.');
      return;
    }
    if (!creatureLore && !creatureLook) {
      setSubmitError('Nothing to submit (no captured lines remaining).');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        connectionId,
        characterName,
        timestamp: new Date().toISOString(),
        continent: selectedContinent,
        area: selectedArea,
        short,
        long,
        creatureLore,
        creatureLook,
      };

      const res = await fetch('http://localhost:5000/contribute/creaturelore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`POST failed (${res.status})${text ? `: ${text}` : ''}`);
      }

      setSubmitOk(true);
      stopAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const shortOk = String(shortText ?? '').trim().length > 0;

  const areasForSelected = continent ? areasByContinent[continent] ?? [] : [];
  const areaLoadFailedForSelected = continent ? areaFetchErrors[continent] : undefined;

  const canSubmit =
    !isSubmitting &&
    !isRunning &&
    shortOk &&
    String(connectionId ?? '').trim().length > 0 &&
    String(identity?.characterName ?? '').trim().length > 0 &&
    String(continent ?? '').trim().length > 0 &&
    String(area ?? '').trim().length > 0 &&
    (loreLines.length > 0 || lookLines.length > 0);

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>Contribute · Creature Lore</div>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.topSection}>
            <div className={styles.formRowFull}>
              <div className={styles.selectRow}>
                <div className={styles.selectField}>
                  <label className={styles.selectLabel} htmlFor="contrib-creaturelore-continent">
                    Continent
                  </label>
                  <select
                    id="contrib-creaturelore-continent"
                    className={`${styles.input} ${styles.select}`}
                    value={continent}
                    onChange={(e) => setContinent(e.target.value)}
                    disabled={isSubmitting}
                    required
                  >
                    <option value="" disabled>
                      {mapsLoading ? 'Loading continents…' : 'Select continent'}
                    </option>
                    {continentNames.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.selectField}>
                  <label className={styles.selectLabel} htmlFor="contrib-creaturelore-area">
                    Area
                  </label>
                  <select
                    id="contrib-creaturelore-area"
                    className={`${styles.input} ${styles.select}`}
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    disabled={isSubmitting || !continent}
                    required
                  >
                    <option value="" disabled>
                      {!continent
                        ? 'Select area'
                        : areaLoadFailedForSelected
                          ? 'Areas failed to load'
                          : areasForSelected.length === 0
                            ? 'Loading areas…'
                            : 'Select area'}
                    </option>

                    {areasForSelected.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {continentError ? (
                <div className={styles.errorBox} style={{ marginTop: 8 }}>
                  Maps: {continentError}
                </div>
              ) : null}

              {continent && areaLoadFailedForSelected ? (
                <div className={styles.errorBox} style={{ marginTop: 8 }}>
                  Areas for <span className={styles.mono}>{continent}</span>: {areaLoadFailedForSelected}
                </div>
              ) : null}
            </div>

            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="contrib-creaturelore-short">
                Short
              </label>
              <input
                id="contrib-creaturelore-short"
                className={styles.input}
                value={shortText}
                onChange={(e) => setShortText(e.target.value)}
                placeholder="Creature short name…"
                disabled={isSubmitting || isRunning}
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="contrib-creaturelore-long">
                Long
              </label>
              <input
                id="contrib-creaturelore-long"
                className={styles.input}
                value={longText}
                onChange={(e) => setLongText(e.target.value)}
                placeholder="Long description…"
                disabled={isSubmitting || isRunning}
              />
            </div>

            <div className={styles.actionsRow}>
              <button
                className={styles.primaryBtn}
                type="button"
                onClick={runSequence}
                disabled={!shortOk || isRunning || isSubmitting}
                title={!shortOk ? 'Enter a Short value first.' : undefined}
              >
                CreatureLore
              </button>

              <div className={styles.hint}>
                <div>
                  Connection: <span className={styles.mono}>{connectionId}</span>
                </div>
                <div>
                  Identity: <span className={styles.mono}>{identityStatus}</span>
                </div>
                <div>
                  {isRunning ? (
                    stage === 'lore' ? (
                      <span>
                        Capturing <span className={styles.mono}>creaturelore</span> for 1 second…
                      </span>
                    ) : stage === 'look' ? (
                      <span>
                        Capturing <span className={styles.mono}>look</span> for 1 second…
                      </span>
                    ) : (
                      <span>Waiting…</span>
                    )
                  ) : (
                    <span>
                      Click CreatureLore to capture 1s of <span className={styles.mono}>creaturelore</span>, wait 8s,
                      then capture 1s of <span className={styles.mono}>look</span>.
                    </span>
                  )}
                </div>
              </div>

              {isRunning ? (
                <button className={styles.secondaryBtn} type="button" onClick={stopAll} disabled={isSubmitting}>
                  Stop
                </button>
              ) : null}
            </div>

            {submitError ? <div className={styles.errorBox}>{submitError}</div> : null}
            {submitOk ? <div className={styles.okBox}>Ready / Submitted.</div> : null}
          </div>

          <div className={styles.splitter} />

          {/* Stacked (top/bottom) panels */}
          <div className={styles.detailSection}>
            <div className={styles.detailStack}>
              {/* Lore (top) */}
              <section className={styles.detailPanel} aria-label="Creature Lore Details">
                <div className={styles.panelHeader}>
                  <div className={styles.panelTitle}>Creature Lore Details</div>
                  <div className={styles.panelMeta}>
                    <span className={styles.countPill}>{loreLines.length}</span>
                  </div>
                </div>

                <div className={styles.panelBody}>
                  {loreLines.length === 0 ? (
                    <div className={styles.empty}>No creaturelore lines captured yet.</div>
                  ) : (
                    <div className={styles.lineList}>
                      {loreLines.map((line, idx) => (
                        <div key={`lore-${idx}`} className={styles.lineRow}>
                          <button
                            className={styles.deleteBtn}
                            type="button"
                            onClick={() => deleteLoreLine(idx)}
                            aria-label="Delete line"
                            disabled={isSubmitting || isRunning}
                          >
                            ✕
                          </button>
                          <pre className={styles.lineText}>{line}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Look (bottom) */}
              <section className={styles.detailPanel} aria-label="Creature Look Details">
                <div className={styles.panelHeader}>
                  <div className={styles.panelTitle}>Creature Look Details</div>
                  <div className={styles.panelMeta}>
                    <span className={styles.countPill}>{lookLines.length}</span>
                  </div>
                </div>

                <div className={styles.panelBody}>
                  {lookLines.length === 0 ? (
                    <div className={styles.empty}>No look lines captured yet.</div>
                  ) : (
                    <div className={styles.lineList}>
                      {lookLines.map((line, idx) => (
                        <div key={`look-${idx}`} className={styles.lineRow}>
                          <button
                            className={styles.deleteBtn}
                            type="button"
                            onClick={() => deleteLookLine(idx)}
                            aria-label="Delete line"
                            disabled={isSubmitting || isRunning}
                          >
                            ✕
                          </button>
                          <pre className={styles.lineText}>{line}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>

          <div className={styles.footer}>
            <button className={styles.submitBtn} type="button" onClick={onSubmit} disabled={!canSubmit}>
              {isSubmitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContributeCreatureLoreModal;
