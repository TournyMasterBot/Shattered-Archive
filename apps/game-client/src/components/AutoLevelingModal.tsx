// apps/game-client/src/components/AutoLevelingModal.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../styles/AutoLevelingModal.module.scss';

import type { AutoLevelConfig, AutoLevelRunState, AutoLevelTarget } from '../features/autoleveling/autoleveling-types';
import { useAutoLeveling } from '../hooks/useAutoLeveling';

import { parseActionsFromEditor, serializeActionsToEditor } from '../features/autoleveling/autoleveling-actions';

import type { Beast, NamedTrainingPath } from '../features/autoleveling/autoleveling-maps-client';
import {
  fetchAreaNamesRemote,
  fetchBeastsRemote,
  fetchContinentNamesRemote,
  fetchTrainingPathsRemote,
  getAreaNamesCached,
  getBeastsCached,
  getContinentNamesCached,
} from '../features/autoleveling/autoleveling-maps-client';

/* ----------------------------- debug helpers ------------------------------ */

const UI_LOG_PREFIX = '[autoleveling][ui]';

function keywordsFromFirstKeyword(firstKeyword: string | undefined | null): string[] {
  const raw = String(firstKeyword ?? '').trim();
  if (!raw) return [];

  const parts = raw
    .split(/\s+/g)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length); // longest first

  const out = [raw, ...parts.filter((p) => p !== raw)];

  const seen = new Set<string>();
  return out.filter((k) => (seen.has(k) ? false : (seen.add(k), true)));
}

function isAutoLevelingDebugEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && (window as any).__AUTOLEVELING_DEBUG__ === true) return true;

    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('autoleveling.debug') : null;
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;

    try {
      const dev = typeof import.meta !== 'undefined' && !!(import.meta as any).env?.DEV;
      return dev;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

function uiDbg(...args: any[]) {
  if (!isAutoLevelingDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.debug(UI_LOG_PREFIX, ...args);
}

function uiWarn(...args: any[]) {
  if (!isAutoLevelingDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.warn(UI_LOG_PREFIX, ...args);
}

/* ------------------------------------------------------------------------- */

type TabKey = 'setup' | 'configure';

type StepKey =
  | 'start.pre'
  | 'start.exec'
  | 'start.post'
  | 'move.pre'
  | 'move.exec'
  | 'move.post'
  | 'identify.pre'
  | 'identify.exec'
  | 'identify.post'
  | 'fight.pre'
  | 'fight.exec'
  | 'fight.post'
  | 'reset.endRound'
  | 'reset.wait';

interface AutoLevelingModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  isConnected: boolean;
}

function toRunStateText(runState: AutoLevelRunState): string {
  switch (runState.status) {
    case 'idle':
      return 'Idle';
    case 'running':
      return `Running: round ${runState.round} • ${runState.step} • #${runState.actionIndex + 1}`;
    case 'paused':
      return `Paused: round ${runState.round} • ${runState.step} • #${runState.actionIndex + 1}`;
    case 'stopping':
      return 'Stopping…';
    case 'error':
      return `Error: ${runState.message}`;
    default:
      return 'Idle';
  }
}

function buildStepEditors(config: AutoLevelConfig): Record<StepKey, string> {
  const s = config.steps;
  return {
    'start.pre': serializeActionsToEditor(s.start.pre),
    'start.exec': serializeActionsToEditor(s.start.exec),
    'start.post': serializeActionsToEditor(s.start.post),

    'move.pre': serializeActionsToEditor(s.move.pre),
    'move.exec': serializeActionsToEditor(s.move.exec),
    'move.post': serializeActionsToEditor(s.move.post),

    'identify.pre': serializeActionsToEditor(s.identify.pre),
    'identify.exec': serializeActionsToEditor(s.identify.exec),
    'identify.post': serializeActionsToEditor(s.identify.post),

    'fight.pre': serializeActionsToEditor(s.fight.pre),
    'fight.exec': serializeActionsToEditor(s.fight.exec),
    'fight.post': serializeActionsToEditor(s.fight.post),

    'reset.endRound': serializeActionsToEditor(s.reset.endRound),
    'reset.wait': serializeActionsToEditor(s.reset.wait),
  };
}

function applyEditors(base: AutoLevelConfig, stepEditors: Record<StepKey, string>): AutoLevelConfig {
  const get = (k: StepKey) => parseActionsFromEditor(stepEditors[k] ?? '');

  return {
    ...base,
    steps: {
      ...base.steps,
      start: { pre: get('start.pre'), exec: get('start.exec'), post: get('start.post') },
      move: { pre: get('move.pre'), exec: get('move.exec'), post: get('move.post') },
      identify: { pre: get('identify.pre'), exec: get('identify.exec'), post: get('identify.post') },
      fight: { pre: get('fight.pre'), exec: get('fight.exec'), post: get('fight.post') },
      reset: { endRound: get('reset.endRound'), wait: get('reset.wait') },
    },
  };
}

function uniqStrings(input: string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input ?? []) {
    const s = String(raw ?? '').trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function beastToTarget(b: Beast): AutoLevelTarget {
  const firstKeyword = (b as any).firstKeyword;
  const keywords = keywordsFromFirstKeyword(firstKeyword);

  return {
    cleanName: String(b.cleanName ?? ''),
    name: String(b.name ?? ''),
    lookName: String(b.lookName ?? ''),
    keywords,

    level: typeof b.level === 'number' ? b.level : undefined,
    damageDice: String((b as any).damageDice ?? ''),
    damageType: String((b as any).damageType ?? ''),
    health: typeof (b as any).health === 'number' ? (b as any).health : undefined,

    immunities: Array.isArray((b as any).immunities) ? (b as any).immunities : [],
    resistances: Array.isArray((b as any).resistances) ? (b as any).resistances : [],
    vulnerabilities: Array.isArray((b as any).vulnerabilities) ? (b as any).vulnerabilities : [],
    affects: Array.isArray((b as any).affects) ? (b as any).affects : [],
    offensiveTactics: Array.isArray((b as any).offensiveTactics) ? (b as any).offensiveTactics : [],
  };
}

export const AutoLevelingModal: React.FC<AutoLevelingModalProps> = ({ isOpen, onClose, connectionId, isConnected }) => {
  const { config, setConfig, runState, socketReady, start, stop, pause, resume, resetToDefaults } =
    useAutoLeveling(connectionId);

  const [tab, setTab] = useState<TabKey>('setup');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [draft, setDraft] = useState<AutoLevelConfig>(() => config);
  const [stepEditors, setStepEditors] = useState<Record<StepKey, string>>(() => buildStepEditors(config));

  const [continentNames, setContinentNames] = useState<string[]>([]);
  const [areaNames, setAreaNames] = useState<string[]>([]);
  const [beasts, setBeasts] = useState<Beast[]>([]);

  const [loadingContinents, setLoadingContinents] = useState(false);
  const [loadingAreas, setLoadingAreas] = useState(false);
  const [loadingBeasts, setLoadingBeasts] = useState(false);

  const [mapsError, setMapsError] = useState<string | null>(null);

  const [trainingPaths, setTrainingPaths] = useState<NamedTrainingPath[]>([]);
  const [loadingTrainingPaths, setLoadingTrainingPaths] = useState(false);

  const runStateText = useMemo(() => toRunStateText(runState), [runState]);

  const hasChanges = useMemo(() => {
    const appliedDraft = applyEditors(draft, stepEditors);
    return JSON.stringify(appliedDraft) !== JSON.stringify(config);
  }, [draft, stepEditors, config]);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(config);
    setStepEditors(buildStepEditors(config));
    setTab('setup');
    setAdvancedOpen(false);

    uiDbg('modal opened', { connectionId, isConnected, socketReady, version: config.version });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const save = useCallback(() => {
    const next = applyEditors(draft, stepEditors);
    uiDbg('save clicked', { next });
    setConfig(next);
  }, [draft, stepEditors, setConfig]);

  const discard = useCallback(() => {
    uiDbg('discard clicked');
    setDraft(config);
    setStepEditors(buildStepEditors(config));
  }, [config]);

  const canStart = useMemo(() => {
    return isConnected && socketReady && config.enabled && !hasChanges;
  }, [isConnected, socketReady, config.enabled, hasChanges]);

  const showStop = useMemo(() => {
    if (!config.enabled) return false;
    return runState.status === 'running' || runState.status === 'paused' || runState.status === 'stopping';
  }, [config.enabled, runState.status]);

  const selectedContinentName = draft.init.continentName ?? '';
  const selectedAreaName = draft.init.areaName ?? '';
  const selectedTargets = draft.init.targets ?? [];

  const commitLocationPatch = useCallback((patch: Partial<AutoLevelConfig['init']>) => {
    uiDbg('commitLocationPatch', patch);
    setDraft((p) => ({ ...p, init: { ...p.init, ...patch } }));
  }, []);

  /* ------------ continents ------------ */

  useEffect(() => {
    if (!isOpen) return;

    let canceled = false;
    setMapsError(null);

    (async () => {
      const cached = await getContinentNamesCached();
      if (!canceled && cached?.length) setContinentNames(uniqStrings(cached));
    })();

    (async () => {
      setLoadingContinents(true);
      try {
        const remote = await fetchContinentNamesRemote();
        if (!canceled) setContinentNames(uniqStrings(remote));
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? 'Failed to load continents');
        if (!canceled) setMapsError(msg);
      } finally {
        if (!canceled) setLoadingContinents(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [isOpen]);

  /* ------------ areas ------------ */

  useEffect(() => {
    if (!isOpen) return;

    const continent = selectedContinentName.trim();
    if (!continent) {
      setAreaNames([]);
      setBeasts([]);
      setTrainingPaths([]);
      return;
    }

    let canceled = false;
    setMapsError(null);

    (async () => {
      const cached = await getAreaNamesCached(continent);
      if (!canceled && cached?.length) setAreaNames(uniqStrings(cached));
    })();

    (async () => {
      setLoadingAreas(true);
      try {
        const remote = await fetchAreaNamesRemote(continent);
        if (!canceled) setAreaNames(uniqStrings(remote));
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? 'Failed to load areas');
        if (!canceled) setMapsError(msg);
      } finally {
        if (!canceled) setLoadingAreas(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [isOpen, selectedContinentName]);

  /* ------------ beasts (and infer areaId/continentId) ------------ */

  useEffect(() => {
    if (!isOpen) return;

    const area = selectedAreaName.trim();
    if (!area) {
      setBeasts([]);
      setTrainingPaths([]);
      return;
    }

    let canceled = false;
    setMapsError(null);

    (async () => {
      const cached = await getBeastsCached(area);
      if (!canceled && cached) setBeasts(cached);
    })();

    (async () => {
      setLoadingBeasts(true);
      try {
        const remote = await fetchBeastsRemote(area);
        if (canceled) return;

        setBeasts(remote);

        // If your API includes these, infer them; otherwise leave null.
        const inferredAreaId = (remote as any)?.[0]?.area_id ?? null;
        const inferredContinentId =
          (remote as any)?.[0]?.continent != null ? String((remote as any)[0].continent) : null;

        const patch: Partial<AutoLevelConfig['init']> = {};
        if (inferredAreaId && inferredAreaId !== draft.init.areaId) patch.areaId = inferredAreaId;
        if (inferredContinentId && inferredContinentId !== draft.init.continentId)
          patch.continentId = inferredContinentId;

        if (Object.keys(patch).length) commitLocationPatch(patch);
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? 'Failed to load beasts');
        if (!canceled) setMapsError(msg);
      } finally {
        if (!canceled) setLoadingBeasts(false);
      }
    })();

    return () => {
      canceled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedAreaName, commitLocationPatch, draft.init.areaId, draft.init.continentId]);

  /* ------------ training paths (by areaId) ------------ */

  useEffect(() => {
    if (!isOpen) return;

    const areaId = (draft.init.areaId ?? '').trim();
    if (!areaId) {
      setTrainingPaths([]);
      return;
    }

    let canceled = false;
    setMapsError(null);

    (async () => {
      setLoadingTrainingPaths(true);
      try {
        const remote = await fetchTrainingPathsRemote(areaId);
        if (!canceled) setTrainingPaths(remote ?? []);
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? 'Failed to load training paths');
        if (!canceled) setMapsError(msg);
      } finally {
        if (!canceled) setLoadingTrainingPaths(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [isOpen, draft.init.areaId]);

  const onSelectContinent = useCallback(
    (continentName: string) => {
      const idx = continentNames.findIndex((c) => c === continentName);
      const continentId = idx >= 0 ? String(idx + 1) : null;

      commitLocationPatch({
        continentName: continentName || null,
        continentId,
        areaName: null,
        areaId: null,
        targets: [],
        trainingPath: null,
      });

      setAreaNames([]);
      setBeasts([]);
      setTrainingPaths([]);
    },
    [commitLocationPatch, continentNames],
  );

  const onSelectArea = useCallback(
    (areaName: string) => {
      commitLocationPatch({
        areaName: areaName || null,
        areaId: null,
        targets: [],
        trainingPath: null,
      });
      setBeasts([]);
      setTrainingPaths([]);
    },
    [commitLocationPatch],
  );

  const isSelected = useCallback(
    (cleanName: string) => {
      return selectedTargets.some((t) => t.cleanName === cleanName);
    },
    [selectedTargets],
  );

  const toggleTarget = useCallback((b: Beast) => {
    const t = beastToTarget(b);

    setDraft((prev) => {
      const cur = prev.init.targets ?? [];
      const exists = cur.some((x) => x.cleanName === t.cleanName);

      const next = exists ? cur.filter((x) => x.cleanName !== t.cleanName) : [...cur, t];

      return { ...prev, init: { ...prev.init, targets: next } };
    });
  }, []);

  const selectAllTargets = useCallback(() => {
    const next = beasts.map(beastToTarget).filter((t) => t.cleanName && t.lookName && (t.keywords?.length ?? 0) > 0);

    uiDbg('selectAllTargets', {
      beastsCount: beasts.length,
      filteredCount: next.length,
      sample: next.slice(0, 10).map((t) => ({
        cleanName: t.cleanName,
        lookName: t.lookName,
        keywords: t.keywords,
      })),
    });

    const byId = new Map<string, AutoLevelTarget>();
    for (const t of next) byId.set(t.cleanName, t);

    commitLocationPatch({ targets: Array.from(byId.values()) });
  }, [beasts, commitLocationPatch]);

  const clearTargets = useCallback(() => {
    uiDbg('clearTargets');
    commitLocationPatch({ targets: [] });
  }, [commitLocationPatch]);

  const editor = (key: StepKey, label: string) => {
    return (
      <div className={styles.phaseCard}>
        <div className={styles.phaseHeader}>
          <div className={styles.phaseTitle}>{label}</div>
          <div className={styles.phaseHeaderRight}>
            <button
              type="button"
              className={styles.inlineButton}
              onClick={() =>
                setStepEditors((prev) => ({ ...prev, [key]: (prev[key] ?? '') + (prev[key] ? '\n' : '') }))
              }
            >
              + Add line
            </button>
          </div>
        </div>

        <div className={styles.lines}>
          <textarea
            className={styles.textarea}
            value={stepEditors[key] ?? ''}
            onChange={(e) => setStepEditors((prev) => ({ ...prev, [key]: e.target.value }))}
            spellCheck={false}
          />
        </div>

        <div className={styles.help}>
          Lines: <code>wait_ms 500</code>, <code>wait_text You feel rested</code>, <code>wait_regex /^You slay/i</code>,
          otherwise sent as a command.
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.title}>Auto Leveling</div>

          <div className={styles.headerRight}>
            <span className={styles.runState}>{runStateText}</span>
            <button type="button" className={styles.closeButton} onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'setup' ? styles.tabActive : ''}`}
            onClick={() => setTab('setup')}
          >
            Setup
          </button>

          <button
            type="button"
            className={`${styles.tab} ${tab === 'configure' ? styles.tabActive : ''}`}
            onClick={() => setTab('configure')}
          >
            Configure
          </button>

          <div className={styles.spacer} />

          <button type="button" className={styles.discardButton} disabled={!hasChanges} onClick={discard}>
            Discard
          </button>
          <button type="button" className={styles.saveButton} disabled={!hasChanges} onClick={save}>
            Save
          </button>
        </div>

        <div className={styles.body}>
          {tab === 'setup' ? (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>General</div>
                <div className={styles.sectionHeaderSub}>{hasChanges ? 'Unsaved changes' : ''}</div>
              </div>

              <div className={styles.row}>
                <label className={styles.labelInline}>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) => setDraft((p) => ({ ...p, enabled: e.target.checked }))}
                  />
                  Enabled
                </label>

                <label className={styles.labelInline}>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={draft.loopRounds}
                    onChange={(e) => setDraft((p) => ({ ...p, loopRounds: e.target.checked }))}
                  />
                  Loop rounds
                </label>

                <label className={styles.labelInline}>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={draft.fleePk}
                    onChange={(e) => setDraft((p) => ({ ...p, fleePk: e.target.checked }))}
                  />
                  Flee pk
                </label>
              </div>

              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Controls</div>
                <div className={styles.sectionHeaderSub}>Start uses saved config</div>
              </div>

              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.inlineButton}
                  onClick={() => start()}
                  disabled={!canStart}
                  title={
                    hasChanges
                      ? 'Save or Discard changes before starting'
                      : !config.enabled
                        ? 'Enable Auto Leveling'
                        : !socketReady
                          ? 'Socket not ready'
                          : !isConnected
                            ? 'Not connected'
                            : ''
                  }
                >
                  Start
                </button>

                {showStop ? (
                  <button type="button" className={styles.inlineButton} onClick={() => stop()}>
                    Stop
                  </button>
                ) : null}

                {config.enabled ? (
                  <>
                    <button
                      type="button"
                      className={styles.inlineButton}
                      onClick={() => pause()}
                      disabled={runState.status !== 'running'}
                    >
                      Pause
                    </button>

                    <button
                      type="button"
                      className={styles.inlineButton}
                      onClick={() => resume()}
                      disabled={runState.status !== 'paused'}
                    >
                      Resume
                    </button>
                  </>
                ) : null}

                <button type="button" className={styles.inlineButton} onClick={() => resetToDefaults()}>
                  Reset defaults
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Location</div>
                <div className={styles.sectionHeaderSub}>
                  {mapsError
                    ? mapsError
                    : loadingContinents || loadingAreas || loadingBeasts || loadingTrainingPaths
                      ? 'Loading…'
                      : ''}
                </div>
              </div>

              <div className={styles.row}>
                <label className={styles.label}>
                  Continent
                  <select
                    className={styles.select}
                    value={selectedContinentName}
                    onChange={(e) => onSelectContinent(e.target.value)}
                    disabled={loadingContinents}
                  >
                    <option value="">{loadingContinents ? 'Loading…' : 'Select a continent'}</option>
                    {continentNames.map((c, i) => (
                      <option key={`${c}:${i}`} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.label}>
                  Area
                  <select
                    className={styles.select}
                    value={selectedAreaName}
                    onChange={(e) => onSelectArea(e.target.value)}
                    disabled={!selectedContinentName || loadingAreas}
                  >
                    <option value="">
                      {!selectedContinentName
                        ? 'Select a continent first'
                        : loadingAreas
                          ? 'Loading…'
                          : 'Select an area'}
                    </option>
                    {areaNames.map((a, i) => (
                      <option key={`${a}:${i}`} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.label}>
                  Training path
                  <input
                    className={styles.input}
                    list="autoleveling-training-paths"
                    value={draft.init.trainingPath ?? ''}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, init: { ...p.init, trainingPath: e.target.value || null } }))
                    }
                    placeholder={loadingTrainingPaths ? 'Loading…' : 'n;n;n;w;w'}
                    disabled={!draft.init.areaId || loadingTrainingPaths}
                  />
                  <datalist id="autoleveling-training-paths">
                    {trainingPaths.map((p, i) => (
                      <option key={`${p.id}:${i}`} value={p.raw} label={p.name} />
                    ))}
                  </datalist>
                  <div className={styles.help}>
                    Split commands with <code>;</code>. Empty segments are allowed and will be sent.
                  </div>
                </label>
              </div>

              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Combat</div>
                <div className={styles.sectionHeaderSub}>Only this is required</div>
              </div>

              <div className={styles.row}>
                <label className={styles.label} style={{ flex: 1 }}>
                  Initiation command (optional)
                  <input
                    className={styles.input}
                    value={draft.init.initiationCommand ?? ''}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, init: { ...p.init, initiationCommand: e.target.value || null } }))
                    }
                    placeholder="kill {name}"
                  />
                  <div className={styles.help}>
                    Uses <code>{'{name}'}</code> to substitute a keyword. If left blank, defaults to{' '}
                    <code>kill {'{name}'}</code>.
                  </div>
                </label>
              </div>

              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Targets</div>
                <div className={styles.sectionHeaderSub}>
                  {selectedAreaName ? `${selectedTargets.length} selected` : 'Pick an area to load targets'}
                </div>
              </div>

              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.inlineButton}
                  onClick={selectAllTargets}
                  disabled={!selectedAreaName || loadingBeasts || beasts.length === 0}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className={styles.inlineButton}
                  onClick={clearTargets}
                  disabled={!selectedAreaName || selectedTargets.length === 0}
                >
                  Clear
                </button>
              </div>

              <div className={styles.beastList}>
                {!selectedAreaName ? (
                  <div className={styles.beastEmpty}>Select an area to see available targets.</div>
                ) : loadingBeasts && beasts.length === 0 ? (
                  <div className={styles.beastEmpty}>Loading targets…</div>
                ) : beasts.length === 0 ? (
                  <div className={styles.beastEmpty}>No targets returned for this area.</div>
                ) : (
                  beasts.map((b, i) => {
                    const checked = isSelected(b.cleanName);
                    const firstKeyword =
                      (b as any).firstKeyword ?? (b as any).first_keyword ?? (b as any).firstkeyword ?? null;
                    const computedKeywords = keywordsFromFirstKeyword(firstKeyword);

                    return (
                      <div key={`${b.cleanName}:${i}`} className={styles.beastRow}>
                        <input
                          className={styles.checkbox}
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTarget(b)}
                        />

                        <div className={styles.beastMain}>
                          <div className={styles.beastName}>{b.name}</div>
                          <div className={styles.beastMeta}>
                            lvl {b.level} • {b.damageDice} {b.damageType} • hp {b.health}
                          </div>

                          <details style={{ marginTop: 6 }}>
                            <summary style={{ cursor: 'pointer' }}>Details</summary>
                            <div className={styles.help}>
                              <div>
                                <b>lookName:</b> <code>{b.lookName}</code>
                              </div>

                              <div>
                                <b>firstKeyword:</b> <code>{String(firstKeyword ?? '')}</code>
                              </div>

                              <div>
                                <b>keywords:</b> <code>{computedKeywords.join(', ')}</code>
                              </div>
                              <div>
                                <b>immunities:</b> {(b.immunities ?? []).join(', ') || '—'}
                              </div>
                              <div>
                                <b>resistances:</b> {(b.resistances ?? []).join(', ') || '—'}
                              </div>
                              <div>
                                <b>vulnerabilities:</b> {(b.vulnerabilities ?? []).join(', ') || '—'}
                              </div>
                              <div>
                                <b>affects:</b> {(b.affects ?? []).join(', ') || '—'}
                              </div>
                              <div>
                                <b>offensive tactics:</b> {(b.offensiveTactics ?? []).join(', ') || '—'}
                              </div>
                            </div>
                          </details>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Advanced</div>
                <div className={styles.sectionHeaderSub}>Optional power-user configuration</div>
              </div>

              <div className={styles.row}>
                <button type="button" className={styles.inlineButton} onClick={() => setAdvancedOpen((p) => !p)}>
                  {advancedOpen ? 'Hide advanced' : 'Show advanced'}
                </button>
              </div>

              {advancedOpen ? (
                <>
                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionHeaderTitle}>Configure steps</div>
                    <div className={styles.sectionHeaderSub}>
                      The engine owns engagement; fight steps run after engagement succeeds
                    </div>
                  </div>

                  <div className={styles.blockCard}>
                    <div className={styles.blockHeader}>
                      <div className={styles.blockHeaderLeft}>
                        <div className={styles.blockNumber}>1</div>
                        <div className={styles.blockTitle}>Start</div>
                      </div>
                    </div>
                    <div className={styles.blockBody}>
                      {editor('start.pre', '1a. Pre-start')}
                      {editor('start.exec', '1b. Start')}
                      {editor('start.post', '1c. Post-start')}
                    </div>
                  </div>

                  <div className={styles.blockCard}>
                    <div className={styles.blockHeader}>
                      <div className={styles.blockHeaderLeft}>
                        <div className={styles.blockNumber}>2</div>
                        <div className={styles.blockTitle}>Move</div>
                      </div>
                    </div>
                    <div className={styles.blockBody}>
                      {editor('move.pre', '2a. Pre-move')}
                      {editor('move.exec', '2b. Move')}
                      {editor('move.post', '2c. Post-move')}
                    </div>
                  </div>

                  <div className={styles.blockCard}>
                    <div className={styles.blockHeader}>
                      <div className={styles.blockHeaderLeft}>
                        <div className={styles.blockNumber}>3</div>
                        <div className={styles.blockTitle}>Identify</div>
                      </div>
                    </div>
                    <div className={styles.blockBody}>
                      {editor('identify.pre', '3a. Pre-identify')}
                      {editor('identify.exec', '3b. Identify')}
                      {editor('identify.post', '3c. Post-identify')}
                    </div>
                  </div>

                  <div className={styles.blockCard}>
                    <div className={styles.blockHeader}>
                      <div className={styles.blockHeaderLeft}>
                        <div className={styles.blockNumber}>4</div>
                        <div className={styles.blockTitle}>Fight</div>
                      </div>
                    </div>
                    <div className={styles.blockBody}>
                      {editor('fight.pre', '4a. Pre-fight')}
                      {editor('fight.exec', '4b. Fight (after engage)')}
                      {editor('fight.post', '4c. Post-fight')}
                    </div>
                  </div>

                  <div className={styles.blockCard}>
                    <div className={styles.blockHeader}>
                      <div className={styles.blockHeaderLeft}>
                        <div className={styles.blockNumber}>5</div>
                        <div className={styles.blockTitle}>Reset</div>
                      </div>
                    </div>
                    <div className={styles.blockBody}>
                      {editor('reset.endRound', '5a. End round')}
                      {editor('reset.wait', '5b. Wait')}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutoLevelingModal;
