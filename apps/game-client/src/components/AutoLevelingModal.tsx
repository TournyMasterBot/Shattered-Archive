// apps/game-client/src/components/AutoLevelingModal.tsx

/**
 * AutoLevelingModal (UI)
 * ----------------------
 * Intent:
 * - Provide the configuration UI for the autoleveling system.
 * - Persist config via `useAutoLeveling(connectionId)` (localStorage-backed).
 * - Load "maps" data (continents -> areas -> beasts/targets) from cached IndexedDB + remote endpoints.
 * - Provide advanced "step editors" for scripted actions, but NOTE:
 *   - The engine owns *engagement* now (initiation command + keyword fallbacks).
 *   - The fight.* step triplet is intended 'after engagement succeeds'.
 *
 * Inferred step order (from engine):
 *  1) start.(pre/exec/post)  [once per round]
 *  2) For each trainingPath segment (semicolon-separated):
 *     2a) move.pre
 *     2b) send segment cmd
 *     2c) if segment is a movement direction:
 *          - wait for movement-succeeded/failed
 *          - move.post
 *          - identify.(pre/exec/post)
 *         else:
 *          - move.post
 *     2d) flushInjected() (runs encounter injection: engage -> fight -> wait fighting end)
 *  3) reset.endRound
 *  4) reset.wait
 *  5) loop to next round if loopRounds=true
 *
 * UI Safety gates:
 * - Start button uses SAVED config (not draft) and is disabled when:
 *    - not connected
 *    - socket not ready
 *    - config.enabled is false
 *    - there are unsaved changes (draft != config)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../styles/AutoLevelingModal.module.scss';

import type { AutoLevelConfig, AutoLevelMode, AutoLevelRunState, AutoLevelTarget } from '../features/autoleveling/autoleveling-types';

import { parseActionsFromEditor, serializeActionsToEditor } from '../features/autoleveling/autoleveling-actions';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';

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
import type { BuildStep, UserBuiltPath } from '../features/autoleveling/autoleveling-user-paths';
import type { ManualTarget } from '../features/autoleveling/autoleveling-saved-targets';
import {
  loadSavedTargets,
  manualToAutoLevel,
  saveSavedTargets,
} from '../features/autoleveling/autoleveling-saved-targets';
import {
  deleteUserPath,
  exportPathsToJson,
  loadUserPaths,
  parseImportJson,
  saveUserPaths,
  serializeBuildPath,
  triggerJsonDownload,
  upsertUserPath,
} from '../features/autoleveling/autoleveling-user-paths';

/* ----------------------------- debug helpers ------------------------------ */

const UI_LOG_PREFIX = '[autoleveling][ui]';

function keywordsFromFirstKeyword(firstKeyword: string | undefined | null): string[] {
  // Intent:
  // - Produce a keyword list for engagement attempts.
  // - [0] is the raw firstKeyword string (trimmed).
  // - Then split on spaces, remove empties, sort longest-first.
  // - De-dupe while preserving order.
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
    return false;
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

type TabKey = 'setup' | 'configure' | 'build';

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
  | 'postFight.pre'
  | 'postFight.exec'
  | 'postFight.post'
  | 'reset.endRound'
  | 'reset.wait';

interface AutoLevelingModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  isConnected: boolean;
  // Engine state & controls — provided by the single useAutoLeveling instance in MainContainer.
  config: AutoLevelConfig;
  setConfig: (next: AutoLevelConfig) => void;
  runState: AutoLevelRunState;
  socketReady: boolean;
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  resetToDefaults: () => void;
  moveNext: () => void;
  movePrev: () => void;
  rescanRoom: () => void;
}

function toRunStateText(runState: AutoLevelRunState): string {
  switch (runState.status) {
    case 'idle':
    case 'stopping':
      return 'Not Running';

    case 'waiting':
      return 'Waiting';

    case 'resting':
      return 'Idle';

    case 'running': {
      const step = runState.step ?? '';
      if (step.startsWith('sightsee:waiting')) return `Sightsee — Ready (round ${runState.round})`;
      if (step.includes('fight')) return `Fighting (round ${runState.round})`;
      if (step.includes('move')) return `Moving (round ${runState.round})`;
      return `Idle (round ${runState.round})`;
    }

    case 'paused': {
      const step = runState.step ?? '';
      if (step.includes('fight')) return `Paused — Fighting (round ${runState.round})`;
      if (step.includes('move')) return `Paused — Moving (round ${runState.round})`;
      return `Paused (round ${runState.round})`;
    }

    case 'error':
      return `Error: ${runState.message}`;

    default:
      return 'Not Running';
  }
}

function buildStepEditors(config: AutoLevelConfig): Record<StepKey, string> {
  // Intent:
  // - Convert structured action arrays -> editable text areas.
  // - Each textarea is "one action per line" using autoleveling-actions.ts parsing rules.
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

    'postFight.pre': serializeActionsToEditor(s.postFight?.pre ?? []),
    'postFight.exec': serializeActionsToEditor(s.postFight?.exec ?? []),
    'postFight.post': serializeActionsToEditor(s.postFight?.post ?? []),

    'reset.endRound': serializeActionsToEditor(s.reset.endRound),
    'reset.wait': serializeActionsToEditor(s.reset.wait),
  };
}

function applyEditors(base: AutoLevelConfig, stepEditors: Record<StepKey, string>): AutoLevelConfig {
  // Intent:
  // - Convert edited textarea text back into structured action arrays.
  const get = (k: StepKey) => parseActionsFromEditor(stepEditors[k] ?? '');

  return {
    ...base,
    steps: {
      ...base.steps,
      start: { pre: get('start.pre'), exec: get('start.exec'), post: get('start.post') },
      move: { pre: get('move.pre'), exec: get('move.exec'), post: get('move.post') },
      identify: { pre: get('identify.pre'), exec: get('identify.exec'), post: get('identify.post') },
      fight: { pre: get('fight.pre'), exec: get('fight.exec'), post: get('fight.post') },
      postFight: { pre: get('postFight.pre'), exec: get('postFight.exec'), post: get('postFight.post') },
      reset: { endRound: get('reset.endRound'), wait: get('reset.wait') },
    },
  };
}

function uniqStrings(input: string[] | null | undefined): string[] {
  // Intent: simple stable de-dupe while preserving order.
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

function beastStableKey(b: Beast): string {
  // Intent:
  // - Provide a stable, non-empty key for UI selection + persistence.
  // - Some API rows may have empty cleanName (seen in logs), which breaks controlled checkbox state.
  // - Priority: cleanName -> filepath -> lookName -> name.
  const clean = String((b as any).cleanName ?? '').trim();
  if (clean) return clean;

  const filepath = String((b as any).filepath ?? '').trim();
  if (filepath) return filepath;

  const lookName = String((b as any).lookName ?? '').trim();
  if (lookName) return lookName;

  const name = String((b as any).name ?? '').trim();
  if (name) return name;

  return '';
}

function beastToTarget(b: Beast): AutoLevelTarget {
  // Intent:
  // - Convert an API "Beast" record into a persisted AutoLevelTarget.
  // - Targets are stored rich so the engine can operate without re-fetching maps.
  // - keywords are computed from firstKeyword (if provided by API shape).
  //
  // Important:
  // - cleanName is used as the *stable key* for UI selection.
  // - Some beasts can have empty cleanName; we fall back to filepath/lookName/name to keep checkboxes controlled.
  const firstKeyword = (b as any).firstKeyword;
  const keywords = keywordsFromFirstKeyword(firstKeyword);

  return {
    cleanName: beastStableKey(b),
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

export const AutoLevelingModal: React.FC<AutoLevelingModalProps> = ({
  isOpen,
  onClose,
  connectionId,
  isConnected,
  config,
  setConfig,
  runState,
  socketReady,
  start,
  stop,
  pause,
  resume,
  resetToDefaults,
  moveNext,
  movePrev,
  rescanRoom,
}) => {

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

  // Build tab state
  const [buildContinent, setBuildContinent] = useState('');
  const [buildAreaNames, setBuildAreaNames] = useState<string[]>([]);
  const [buildAreaLoading, setBuildAreaLoading] = useState(false);
  const [buildArea, setBuildArea] = useState('');
  const [buildMode, setBuildMode] = useState<'auto_level' | 'sightsee'>('auto_level');
  const [buildSteps, setBuildSteps] = useState<BuildStep[]>([]);
  const [buildDirInput, setBuildDirInput] = useState('');
  const [buildMobLook, setBuildMobLook] = useState('');
  const [buildMobEngage, setBuildMobEngage] = useState('');
  const [buildPathName, setBuildPathName] = useState('');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [buildInteractive, setBuildInteractive] = useState(false);

  // Persisted user-built paths
  const [userPaths, setUserPaths] = useState<UserBuiltPath[]>(() => loadUserPaths());

  // Manual targets (Configure tab)
  const [manualTargets, setManualTargets] = useState<ManualTarget[]>([]);
  const [manualLookInput, setManualLookInput] = useState('');
  const [manualEngageInput, setManualEngageInput] = useState('');

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
    uiDbg('debug enabled?', { enabled: isAutoLevelingDebugEnabled() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    uiDbg('runState changed', runState);
  }, [isOpen, runState]);

  // Load manual targets when modal opens with a pre-set area
  useEffect(() => {
    if (!isOpen) return;
    const continent = (draft.init.continentName ?? '').trim();
    const area = (draft.init.areaName ?? '').trim();
    if (!continent || !area) { setManualTargets([]); return; }
    setManualTargets(loadSavedTargets(continent, area));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    uiDbg('config changed (saved)', {
      mode: config.mode,
      loopRounds: config.loopRounds,
      idleTimeoutMs: config.idleTimeoutMs,
    });
  }, [isOpen, config.mode, config.loopRounds, config.idleTimeoutMs]);

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

  const showStop = useMemo(() => {
    const v = config.mode !== 'disabled' && runState.status === 'running';
    uiDbg('showStop computed', { mode: config.mode, status: runState.status, showStop: v });
    return v;
  }, [config.mode, runState.status]);

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

    uiDbg('continents effect: begin');

    (async () => {
      const cached = await getContinentNamesCached();
      uiDbg('continents cache result', { has: !!cached?.length, count: cached?.length ?? 0 });
      if (!canceled && cached?.length) setContinentNames(uniqStrings(cached));
    })();

    (async () => {
      setLoadingContinents(true);
      uiDbg('continents remote fetch: start');
      try {
        const remote = await fetchContinentNamesRemote();
        uiDbg('continents remote fetch: success', { count: remote?.length ?? 0 });
        if (!canceled) setContinentNames(uniqStrings(remote));
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? 'Failed to load continents');
        uiWarn('continents remote fetch: error', msg);
        if (!canceled) setMapsError(msg);
      } finally {
        if (!canceled) setLoadingContinents(false);
        uiDbg('continents remote fetch: done');
      }
    })();

    return () => {
      canceled = true;
      uiDbg('continents effect: cleanup');
    };
  }, [isOpen]);

  /* ------------ areas ------------ */

  useEffect(() => {
    if (!isOpen) return;

    const continent = selectedContinentName.trim();
    uiDbg('areas effect: begin', { selectedContinentName, continent });

    if (!continent) {
      uiDbg('areas effect: no continent -> clear dependent state');
      setAreaNames([]);
      setBeasts([]);
      setTrainingPaths([]);
      return;
    }

    let canceled = false;
    setMapsError(null);

    (async () => {
      const cached = await getAreaNamesCached(continent);
      uiDbg('areas cache result', { continent, has: !!cached?.length, count: cached?.length ?? 0 });
      if (!canceled && cached?.length) setAreaNames(uniqStrings(cached));
    })();

    (async () => {
      setLoadingAreas(true);
      uiDbg('areas remote fetch: start', { continent });
      try {
        const remote = await fetchAreaNamesRemote(continent);
        uiDbg('areas remote fetch: success', { continent, count: remote?.length ?? 0 });
        if (!canceled) setAreaNames(uniqStrings(remote));
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? 'Failed to load areas');
        uiWarn('areas remote fetch: error', { continent, msg });
        if (!canceled) setMapsError(msg);
      } finally {
        if (!canceled) setLoadingAreas(false);
        uiDbg('areas remote fetch: done', { continent });
      }
    })();

    return () => {
      canceled = true;
      uiDbg('areas effect: cleanup', { continent });
    };
  }, [isOpen, selectedContinentName]);

  /* ------------ beasts (and infer areaId/continentId) ------------ */

  useEffect(() => {
    if (!isOpen) return;

    const area = selectedAreaName.trim();
    uiDbg('beasts effect: begin', { selectedAreaName, area });

    if (!area) {
      uiDbg('beasts effect: no area -> clear dependent state');
      setBeasts([]);
      setTrainingPaths([]);
      return;
    }

    let canceled = false;
    setMapsError(null);

    (async () => {
      const cached = await getBeastsCached(area);
      uiDbg('beasts cache result', { area, has: !!cached?.length, count: cached?.length ?? 0 });
      if (!canceled && cached) setBeasts(cached);
    })();

    (async () => {
      setLoadingBeasts(true);
      uiDbg('beasts remote fetch: start', { area });
      try {
        const remote = await fetchBeastsRemote(area);
        if (canceled) return;

        uiDbg('beasts remote fetch: success', { area, count: remote?.length ?? 0 });
        setBeasts(remote);

        // If your API includes these, infer them; otherwise leave null.
        const inferredAreaId = (remote as any)?.[0]?.area_id ?? null;
        const inferredContinentId =
          (remote as any)?.[0]?.continent != null ? String((remote as any)[0].continent) : null;

        uiDbg('beasts inference', {
          inferredAreaId,
          inferredContinentId,
          prevAreaId: draft.init.areaId,
          prevContinentId: draft.init.continentId,
        });

        const patch: Partial<AutoLevelConfig['init']> = {};
        if (inferredAreaId && inferredAreaId !== draft.init.areaId) patch.areaId = inferredAreaId;
        if (inferredContinentId && inferredContinentId !== draft.init.continentId)
          patch.continentId = inferredContinentId;

        if (Object.keys(patch).length) {
          uiDbg('beasts applying inferred ids', patch);
          commitLocationPatch(patch);
        } else {
          uiDbg('beasts inferred ids: no patch needed');
        }
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? 'Failed to load beasts');
        uiWarn('beasts remote fetch: error', { area, msg });
        if (!canceled) setMapsError(msg);
      } finally {
        if (!canceled) setLoadingBeasts(false);
        uiDbg('beasts remote fetch: done', { area });
      }
    })();

    return () => {
      canceled = true;
      uiDbg('beasts effect: cleanup', { area });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedAreaName, commitLocationPatch, draft.init.areaId, draft.init.continentId]);

  /* ------------ training paths (by areaId) ------------ */

  useEffect(() => {
    if (!isOpen) return;

    const areaId = (draft.init.areaId ?? '').trim();
    uiDbg('training paths effect: begin', { areaId });

    if (!areaId) {
      uiDbg('training paths effect: no areaId -> clear');
      setTrainingPaths([]);
      return;
    }

    let canceled = false;
    setMapsError(null);

    (async () => {
      setLoadingTrainingPaths(true);
      uiDbg('training paths remote fetch: start', { areaId });
      try {
        const remote = await fetchTrainingPathsRemote(areaId);
        uiDbg('training paths remote fetch: success', { areaId, count: remote?.length ?? 0 });
        if (!canceled) setTrainingPaths(remote ?? []);
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? 'Failed to load training paths');
        uiWarn('training paths remote fetch: error', { areaId, msg });
        if (!canceled) setMapsError(msg);
      } finally {
        if (!canceled) setLoadingTrainingPaths(false);
        uiDbg('training paths remote fetch: done', { areaId });
      }
    })();

    return () => {
      canceled = true;
      uiDbg('training paths effect: cleanup', { areaId });
    };
  }, [isOpen, draft.init.areaId]);

  /* ------------ build tab: area names for selected continent ------------ */

  useEffect(() => {
    if (!isOpen || !buildContinent) { setBuildAreaNames([]); setBuildArea(''); return; }
    let canceled = false;
    setBuildAreaLoading(true);
    (async () => {
      try {
        const cached = await getAreaNamesCached(buildContinent);
        if (!canceled && cached?.length) setBuildAreaNames(uniqStrings(cached));
        const remote = await fetchAreaNamesRemote(buildContinent);
        if (!canceled) setBuildAreaNames(uniqStrings(remote));
      } catch { /* ignore */ } finally {
        if (!canceled) setBuildAreaLoading(false);
      }
    })();
    return () => { canceled = true; };
  }, [isOpen, buildContinent]);

  /* ------------ build tab: serialised path preview ------------ */

  const buildPathString = useMemo(() => serializeBuildPath(buildSteps), [buildSteps]);

  // Training paths merged from API presets + user-built paths for the currently-selected area
  const combinedTrainingPaths = useMemo((): NamedTrainingPath[] => {
    const api = trainingPaths;
    const user = userPaths
      .filter(
        (p) =>
          p.continentName.toLowerCase() === selectedContinentName.toLowerCase() &&
          p.areaName.toLowerCase() === selectedAreaName.toLowerCase(),
      )
      .map((p) => ({
        id: p.id,
        name: `${p.name} (${p.mode === 'auto_level' ? 'Auto' : 'Sightsee'})`,
        raw: p.raw,
      }));
    return [...api, ...user];
  }, [trainingPaths, userPaths, selectedContinentName, selectedAreaName]);

  /* ------------ user path CRUD ------------ */

  const onSaveUserPath = useCallback(() => {
    const name = buildPathName.trim();
    const raw = buildPathString;
    if (!name || !raw) return;

    const now = new Date().toISOString();
    const path: UserBuiltPath = {
      id: crypto.randomUUID(),
      name,
      continentName: buildContinent,
      areaName: buildArea,
      mode: buildMode,
      steps: buildSteps,
      raw,
      createdAt: now,
      updatedAt: now,
    };

    const next = upsertUserPath(userPaths, path);
    saveUserPaths(next);
    setUserPaths(next);
    setBuildPathName('');
  }, [buildPathName, buildPathString, buildContinent, buildArea, buildMode, buildSteps, userPaths]);

  const onDeleteUserPath = useCallback((id: string) => {
    const next = deleteUserPath(userPaths, id);
    saveUserPaths(next);
    setUserPaths(next);
  }, [userPaths]);

  const onExportAll = useCallback(() => {
    const json = exportPathsToJson(userPaths);
    const ts = new Date().toISOString().slice(0, 10);
    triggerJsonDownload(json, `autoleveling-paths-${ts}.json`);
  }, [userPaths]);

  const onExportSingle = useCallback((path: UserBuiltPath) => {
    const json = exportPathsToJson([path]);
    const safe = path.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    triggerJsonDownload(json, `path-${safe}.json`);
  }, []);

  const onImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so same file can be re-imported
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseImportJson(text);
      if (result.imported.length === 0) {
        setImportMessage(`Nothing imported. ${result.errors[0] ?? 'File contained no valid paths.'}`);
        return;
      }
      let merged = userPaths;
      for (const p of result.imported) merged = upsertUserPath(merged, p);
      saveUserPaths(merged);
      setUserPaths(merged);
      const skipped = result.skipped > 0 ? ` (${result.skipped} skipped)` : '';
      setImportMessage(`Imported ${result.imported.length} path${result.imported.length !== 1 ? 's' : ''}${skipped}.`);
    };
    reader.readAsText(file);
  }, [userPaths]);

  const onBuildSelectContinent = useCallback((name: string) => {
    setBuildContinent(name);
    setBuildArea('');
    setBuildAreaNames([]);
  }, []);

  const onBuildAddDir = useCallback((dir: string) => {
    const d = dir.trim().toLowerCase();
    if (!d) return;
    setBuildSteps((prev) => [...prev, { kind: 'move', dir: d }]);
    setBuildDirInput('');
    if (buildInteractive) {
      DispatchEvent('shatteredarchive:send-command' as any, { cmd: d, connectionId });
    }
  }, [buildInteractive, connectionId]);

  const onBuildAddMob = useCallback(() => {
    const look = buildMobLook.trim();
    const engage = buildMobEngage.trim();
    if (!look || !engage) return;
    setBuildSteps((prev) => [...prev, { kind: 'mob', lookName: look, engageName: engage }]);
    setBuildMobLook('');
    setBuildMobEngage('');
  }, [buildMobLook, buildMobEngage]);

  const onBuildRemoveStep = useCallback((idx: number) => {
    setBuildSteps((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const onBuildMoveStep = useCallback((idx: number, dir: -1 | 1) => {
    setBuildSteps((prev) => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }, []);

  const onBuildApply = useCallback(() => {
    if (!buildPathString) return;
    setDraft((p) => ({ ...p, mode: buildMode, init: { ...p.init, trainingPath: buildPathString } }));
    setTab('configure');
  }, [buildPathString, buildMode]);

  const onSelectContinent = useCallback(
    (continentName: string) => {
      uiDbg('onSelectContinent', { continentName });

      const idx = continentNames.findIndex((c) => c === continentName);
      const continentId = idx >= 0 ? String(idx + 1) : null;

      uiDbg('onSelectContinent computed continentId', { idx, continentId });

      setManualTargets([]);

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
      uiDbg('onSelectArea', { areaName });

      const continent = selectedContinentName;
      const manuals = areaName && continent ? loadSavedTargets(continent, areaName) : [];
      setManualTargets(manuals);

      commitLocationPatch({
        areaName: areaName || null,
        areaId: null,
        targets: manuals.map(manualToAutoLevel),
        trainingPath: null,
      });

      setBeasts([]);
      setTrainingPaths([]);
    },
    [commitLocationPatch, selectedContinentName],
  );

  const isSelected = useCallback(
    (targetKey: string) => {
      const key = String(targetKey ?? '').trim();
      if (!key) return false;
      return selectedTargets.some((t) => String(t.cleanName ?? '').trim() === key);
    },
    [selectedTargets],
  );

  const toggleTarget = useCallback((b: Beast) => {
    const t = beastToTarget(b);

    uiDbg('toggleTarget', {
      key: t.cleanName,
      cleanName: String((b as any).cleanName ?? ''),
      filepath: String((b as any).filepath ?? ''),
      lookName: t.lookName,
      keywords: t.keywords,
    });

    if (!String(t.cleanName ?? '').trim()) {
      uiWarn('toggleTarget blocked: empty key (cleanName/file/lookup/name all empty?)', { beast: b });
      return;
    }

    setDraft((prev) => {
      const cur = prev.init.targets ?? [];
      const exists = cur.some((x) => String(x.cleanName ?? '').trim() === t.cleanName);

      const next = exists ? cur.filter((x) => String(x.cleanName ?? '').trim() !== t.cleanName) : [...cur, t];

      uiDbg('toggleTarget applied', { exists, prevCount: cur.length, nextCount: next.length });

      return { ...prev, init: { ...prev.init, targets: next } };
    });
  }, []);

  const selectAllTargets = useCallback(() => {
    const next = beasts
      .map(beastToTarget)
      .filter((t) => String(t.cleanName ?? '').trim() && t.lookName && (t.keywords?.length ?? 0) > 0);

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
    for (const t of next) byId.set(String(t.cleanName).trim(), t);

    uiDbg('selectAllTargets unique by cleanName', { uniqueCount: byId.size });

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
              onClick={() => {
                uiDbg('editor add line clicked', { key });
                setStepEditors((prev) => ({ ...prev, [key]: (prev[key] ?? '') + (prev[key] ? '\n' : '') }));
              }}
            >
              + Add line
            </button>
          </div>
        </div>

        <div className={styles.lines}>
          <textarea
            className={styles.textarea}
            value={stepEditors[key] ?? ''}
            onChange={(e) => {
              uiDbg('editor changed', { key, chars: e.target.value.length });
              setStepEditors((prev) => ({ ...prev, [key]: e.target.value }));
            }}
            spellCheck={false}
          />
        </div>

        <div className={styles.help}>
          Lines: <code>wait_ms 500</code>, <code>wait_text You feel rested</code>, <code>wait_regex /^You slay/i</code>,
          <code>wait_fighting true</code> / <code>wait_fighting false</code>, otherwise sent as a command.
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.title}>Autopilot</div>

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
            onClick={() => {
              uiDbg('tab -> setup');
              setTab('setup');
            }}
          >
            Setup
          </button>

          <button
            type="button"
            className={`${styles.tab} ${tab === 'configure' ? styles.tabActive : ''}`}
            onClick={() => {
              uiDbg('tab -> configure');
              setTab('configure');
            }}
          >
            Configure
          </button>

          <button
            type="button"
            className={`${styles.tab} ${tab === 'build' ? styles.tabActive : ''}`}
            onClick={() => {
              uiDbg('tab -> build');
              setTab('build');
            }}
          >
            Build
          </button>

          <div className={styles.spacer} />

          <button
            type="button"
            className={styles.discardButton}
            disabled={!hasChanges}
            onClick={discard}
            title={!hasChanges ? 'No changes to discard' : 'Discard draft changes and revert to saved config'}
          >
            Discard
          </button>
          <button
            type="button"
            className={styles.saveButton}
            disabled={!hasChanges}
            onClick={save}
            title={!hasChanges ? 'No changes to save' : 'Save draft changes to persistent config'}
          >
            Save
          </button>
        </div>

        <div className={styles.body}>
          {tab === 'build' ? (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Path Builder</div>
                <div className={styles.sectionHeaderSub}>Build a training path, then Apply to Configure</div>
              </div>

              {/* Location */}
              <div className={styles.row}>
                <label className={styles.label}>
                  Continent
                  <select
                    className={styles.select}
                    value={buildContinent}
                    onChange={(e) => onBuildSelectContinent(e.target.value)}
                    disabled={loadingContinents}
                  >
                    <option value="">{loadingContinents ? 'Loading…' : 'Select a continent'}</option>
                    {continentNames.map((c, i) => (
                      <option key={`${c}:${i}`} value={c}>{c}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.label}>
                  Zone
                  <select
                    className={styles.select}
                    value={buildArea}
                    onChange={(e) => setBuildArea(e.target.value)}
                    disabled={!buildContinent || buildAreaLoading}
                  >
                    <option value="">
                      {!buildContinent ? 'Select a continent first' : buildAreaLoading ? 'Loading…' : 'Select a zone'}
                    </option>
                    {buildAreaNames.map((a, i) => (
                      <option key={`${a}:${i}`} value={a}>{a}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.label}>
                  Mode
                  <div className={styles.row} style={{ marginTop: 2 }}>
                    {(['auto_level', 'sightsee'] as const).map((m) => (
                      <label key={m} className={styles.labelInline}>
                        <input
                          className={styles.checkbox}
                          type="radio"
                          name="buildMode"
                          value={m}
                          checked={buildMode === m}
                          onChange={() => setBuildMode(m)}
                        />
                        {m === 'auto_level' ? 'Auto Level' : 'Sightsee'}
                      </label>
                    ))}
                  </div>
                </label>

                <label
                  className={styles.label}
                  title="When on, each direction step is also sent to the game live — walk through the area while recording the path"
                >
                  Interactive Build
                  <label className={`${styles.labelInline} ${buildInteractive ? styles.buildInteractiveActive : ''}`} style={{ marginTop: 2 }}>
                    <input
                      className={styles.checkbox}
                      type="checkbox"
                      checked={buildInteractive}
                      onChange={(e) => setBuildInteractive(e.target.checked)}
                    />
                    {buildInteractive ? 'On — commands sent live' : 'Off'}
                  </label>
                  <div className={styles.help}>
                    Move through the area normally — each direction you add is sent to the game in real time.
                  </div>
                </label>
              </div>

              {/* Add direction */}
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Add Movement</div>
              </div>
              <div className={styles.row}>
                <div className={styles.buildDirGrid}>
                  {['nw','n','ne','w','','e','sw','s','se'].map((d, i) =>
                    d ? (
                      <button key={d} type="button" className={styles.buildDirBtn} onClick={() => onBuildAddDir(d)}>{d}</button>
                    ) : (
                      <span key={`gap:${i}`} />
                    )
                  )}
                  {['u','d'].map((d) => (
                    <button key={d} type="button" className={styles.buildDirBtn} onClick={() => onBuildAddDir(d)}>{d}</button>
                  ))}
                </div>
                <label className={styles.label} style={{ flex: 1 }}>
                  Custom direction
                  <div className={styles.row}>
                    <input
                      className={styles.input}
                      value={buildDirInput}
                      onChange={(e) => setBuildDirInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') onBuildAddDir(buildDirInput); }}
                      placeholder="e.g. open door"
                    />
                    <button type="button" className={styles.inlineButton} onClick={() => onBuildAddDir(buildDirInput)}>
                      + Add
                    </button>
                  </div>
                </label>
              </div>

              {/* Add mob */}
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Add Mob Encounter</div>
                <div className={styles.sectionHeaderSub}>
                  Stored as <code>look name|engage name</code> in the path
                </div>
              </div>
              <div className={styles.row}>
                <label className={styles.label}>
                  Look name
                  <input
                    className={styles.input}
                    value={buildMobLook}
                    onChange={(e) => setBuildMobLook(e.target.value)}
                    placeholder="a giant rat"
                  />
                  <div className={styles.help}>The name shown in the room description.</div>
                </label>
                <label className={styles.label}>
                  Engage name
                  <input
                    className={styles.input}
                    value={buildMobEngage}
                    onChange={(e) => setBuildMobEngage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onBuildAddMob(); }}
                    placeholder="rat"
                  />
                  <div className={styles.help}>The keyword used to start combat.</div>
                </label>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                  <button
                    type="button"
                    className={styles.inlineButton}
                    onClick={onBuildAddMob}
                    disabled={!buildMobLook.trim() || !buildMobEngage.trim()}
                  >
                    + Add mob
                  </button>
                </div>
              </div>

              {/* Step list */}
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Steps</div>
                <div className={styles.sectionHeaderSub}>{buildSteps.length} step{buildSteps.length !== 1 ? 's' : ''}</div>
              </div>

              {buildSteps.length === 0 ? (
                <div className={styles.beastEmpty}>No steps yet. Add movements or mob encounters above.</div>
              ) : (
                <div className={styles.buildStepList}>
                  {buildSteps.map((s, i) => (
                    <div key={i} className={styles.buildStep}>
                      <span className={s.kind === 'mob' ? styles.buildStepBadgeMob : styles.buildStepBadgeMove}>
                        {s.kind === 'mob' ? 'mob' : 'move'}
                      </span>
                      <span className={styles.buildStepText}>
                        {s.kind === 'move' ? s.dir : `${s.lookName} | ${s.engageName}`}
                      </span>
                      <div className={styles.buildStepActions}>
                        <button type="button" className={styles.buildStepBtn} onClick={() => onBuildMoveStep(i, -1)} disabled={i === 0} title="Move up">↑</button>
                        <button type="button" className={styles.buildStepBtn} onClick={() => onBuildMoveStep(i, 1)} disabled={i === buildSteps.length - 1} title="Move down">↓</button>
                        <button type="button" className={`${styles.buildStepBtn} ${styles.buildStepBtnRemove}`} onClick={() => onBuildRemoveStep(i)} title="Remove">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Preview, save, and apply */}
              {buildSteps.length > 0 && (
                <>
                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionHeaderTitle}>Preview</div>
                  </div>
                  <div className={styles.buildPreview}>{buildPathString}</div>

                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionHeaderTitle}>Save Path</div>
                    <div className={styles.sectionHeaderSub}>Persist to this browser for later use</div>
                  </div>
                  <div className={styles.row}>
                    <label className={styles.label} style={{ flex: 1 }}>
                      Path name
                      <div className={styles.row}>
                        <input
                          className={styles.input}
                          value={buildPathName}
                          onChange={(e) => setBuildPathName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') onSaveUserPath(); }}
                          placeholder="e.g. Althainia NE loop"
                        />
                        <button
                          type="button"
                          className={styles.saveButton}
                          onClick={onSaveUserPath}
                          disabled={!buildPathName.trim()}
                          title={!buildContinent || !buildArea ? 'Select a continent and zone to associate this path' : ''}
                        >
                          Save
                        </button>
                      </div>
                      {(!buildContinent || !buildArea) && (
                        <div className={styles.help}>Tip: select a continent and zone above so this path appears in the Configure dropdown.</div>
                      )}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2, gap: 6 }}>
                      <button type="button" className={styles.saveButton} onClick={onBuildApply}>
                        Apply to Configure →
                      </button>
                      <button type="button" className={styles.discardButton} onClick={() => setBuildSteps([])}>
                        Clear all
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Saved paths */}
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Saved Paths</div>
                <div className={styles.sectionHeaderSub}>{userPaths.length} saved</div>
              </div>

              <div className={styles.row} style={{ marginBottom: 6 }}>
                <button
                  type="button"
                  className={styles.inlineButton}
                  onClick={onExportAll}
                  disabled={userPaths.length === 0}
                  title="Download all saved paths as a JSON file"
                >
                  Export all
                </button>
                <label className={styles.inlineButton} title="Import paths from a JSON file" style={{ cursor: 'pointer' }}>
                  Import
                  <input
                    type="file"
                    accept=".json,application/json"
                    style={{ display: 'none' }}
                    onChange={onImportFile}
                  />
                </label>
                {importMessage && (
                  <span className={styles.buildImportMsg}>{importMessage}</span>
                )}
              </div>

              {userPaths.length === 0 ? (
                <div className={styles.beastEmpty}>No saved paths yet. Build one above and click Save.</div>
              ) : (
                <div className={styles.buildStepList}>
                  {userPaths.map((p) => (
                    <div key={p.id} className={styles.buildStep}>
                      <span className={p.mode === 'auto_level' ? styles.buildStepBadgeMove : styles.buildStepBadgeMob}>
                        {p.mode === 'auto_level' ? 'Auto' : 'Sightsee'}
                      </span>
                      <div className={styles.buildStepText} style={{ flexDirection: 'column', display: 'flex', gap: 1 }}>
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                        {(p.continentName || p.areaName) && (
                          <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>
                            {[p.continentName, p.areaName].filter(Boolean).join(' › ')}
                          </span>
                        )}
                      </div>
                      <div className={styles.buildStepActions}>
                        <button
                          type="button"
                          className={styles.buildStepBtn}
                          onClick={() => {
                            setBuildSteps(p.steps);
                            setBuildMode(p.mode);
                            setBuildContinent(p.continentName);
                            setBuildArea(p.areaName);
                            setBuildPathName(p.name);
                          }}
                          title="Load into builder"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.buildStepBtn}
                          onClick={() => onExportSingle(p)}
                          title="Export this path"
                        >
                          Export
                        </button>
                        <button
                          type="button"
                          className={`${styles.buildStepBtn} ${styles.buildStepBtnRemove}`}
                          onClick={() => onDeleteUserPath(p.id)}
                          title="Delete this path"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : tab === 'setup' ? (
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>General</div>
                <div className={styles.sectionHeaderSub}>{hasChanges ? 'Unsaved changes' : ''}</div>
              </div>

              <div className={styles.row}>
                {(
                  [
                    { value: 'disabled',   label: 'Disabled',   title: 'Engine is off — no automation' },
                    { value: 'dry_run',    label: 'Dry Run',    title: 'Walk through the area without engaging mobs — use this to verify routing and lookName matches' },
                    { value: 'auto_level', label: 'Auto Level', title: 'Full automation: fights mobs and loops the training path' },
                    { value: 'sightsee',   label: 'Sightsee',   title: 'Step room-by-room using Move Next / Move Prev — no auto-fighting' },
                  ] as { value: AutoLevelMode; label: string; title: string }[]
                ).map(({ value, label, title }) => (
                  <label key={value} className={styles.labelInline} title={title}>
                    <input
                      className={styles.checkbox}
                      type="radio"
                      name="autoLevelMode"
                      value={value}
                      checked={draft.mode === value}
                      onChange={() => setDraft((p) => ({ ...p, mode: value }))}
                    />
                    {label}
                  </label>
                ))}

                <label className={styles.labelInline}>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={draft.loopRounds}
                    onChange={(e) => {
                      uiDbg('draft.loopRounds changed', { value: e.target.checked });
                      setDraft((p) => ({ ...p, loopRounds: e.target.checked }));
                    }}
                  />
                  Loop rounds
                </label>

                <label className={styles.labelInline}>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={draft.fleePk}
                    onChange={(e) => {
                      uiDbg('draft.fleePk changed', { value: e.target.checked });
                      setDraft((p) => ({ ...p, fleePk: e.target.checked }));
                    }}
                  />
                  Flee pk
                </label>
              </div>

              <div className={styles.row}>
                <label className={styles.label}>
                  Round wait (min)
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step={1}
                    value={Math.round((draft.roundLoopTimeMs ?? 300_000) / 60_000)}
                    onChange={(e) => {
                      const mins = Math.max(0, Number(e.target.value) || 0);
                      setDraft((p) => ({ ...p, roundLoopTimeMs: mins * 60_000 }));
                    }}
                    disabled={!draft.loopRounds}
                    style={{ width: 70 }}
                  />
                  <div className={styles.help}>Minutes to wait between rounds when Loop rounds is on.</div>
                </label>

                <label className={styles.label}>
                  Fight loop (sec)
                  <input
                    className={styles.input}
                    type="number"
                    min={2}
                    step={0.5}
                    value={((draft.fightLoopIntervalMs ?? 2_500) / 1000).toFixed(1)}
                    onChange={(e) => {
                      const secs = Math.max(2, Number(e.target.value) || 2.5);
                      setDraft((p) => ({ ...p, fightLoopIntervalMs: Math.round(secs * 1000) }));
                    }}
                    style={{ width: 70 }}
                  />
                  <div className={styles.help}>Seconds between each pass of the fight.exec loop.</div>
                </label>

                <label className={styles.label}>
                  Move settle (ms)
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step={50}
                    value={draft.moveSettleMs ?? 600}
                    onChange={(e) => {
                      const ms = Math.max(0, Number(e.target.value) || 600);
                      setDraft((p) => ({ ...p, moveSettleMs: ms }));
                    }}
                    style={{ width: 70 }}
                  />
                  <div className={styles.help}>Pause after each movement before the next step.</div>
                </label>

                <label className={styles.label}>
                  Look settle (ms)
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step={100}
                    value={draft.lookSettleMs ?? 500}
                    onChange={(e) => {
                      const ms = Math.max(0, Number(e.target.value) || 500);
                      setDraft((p) => ({ ...p, lookSettleMs: ms }));
                    }}
                    style={{ width: 70 }}
                  />
                  <div className={styles.help}>Pause after look/scan commands to let server response arrive before detecting mobs.</div>
                </label>

                <label className={styles.label}>
                  Post-fight settle (ms)
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step={500}
                    value={draft.postFightSettleMs ?? 2_000}
                    onChange={(e) => {
                      const ms = Math.max(0, Number(e.target.value) || 2000);
                      setDraft((p) => ({ ...p, postFightSettleMs: ms }));
                    }}
                    style={{ width: 70 }}
                  />
                  <div className={styles.help}>Pause after a fight ends before re-scanning the room or moving on.</div>
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
                  onClick={() => {
                    uiDbg('start clicked');
                    start();
                  }}
                  title={
                    hasChanges
                      ? 'Save or Discard changes before starting'
                      : config.mode === 'disabled'
                        ? 'Select a mode before starting'
                        : !socketReady
                          ? 'Socket not ready'
                          : !isConnected
                            ? 'Not connected'
                            : ''
                  }
                >
                  Start
                </button>
                {/*
                {showStop ? (
                  <button
                    type="button"
                    className={styles.inlineButton}
                    onClick={() => {
                      uiDbg('stop clicked');
                      stop();
                    }}
                  >
                    Stop
                  </button>
                ) : null}
                  */}
                {config.mode !== 'disabled' ? (
                  <>
                    <button
                      type="button"
                      className={styles.inlineButton}
                      onClick={() => { uiDbg('pause clicked'); pause(); }}
                      disabled={runState.status !== 'running'}
                    >
                      Pause
                    </button>

                    <button
                      type="button"
                      className={styles.inlineButton}
                      onClick={() => { uiDbg('resume clicked'); resume(); }}
                      disabled={runState.status !== 'paused'}
                    >
                      Resume
                    </button>

                    <button
                      type="button"
                      className={styles.inlineButton}
                      onClick={() => { uiDbg('stop clicked'); stop(); }}
                      disabled={runState.status === 'idle' || runState.status === 'stopping'}
                    >
                      Stop
                    </button>

                    {config.mode === 'sightsee' ? (
                      <>
                        <button
                          type="button"
                          className={styles.inlineButton}
                          onClick={() => { uiDbg('move prev clicked'); movePrev(); }}
                          disabled={
                            runState.status !== 'running' ||
                            (runState as any).step === 'sightsee:waiting:noprev'
                          }
                          title={
                            (runState as any).step === 'sightsee:waiting:noprev'
                              ? 'Nothing to go back to'
                              : 'Send the reverse of the last movement (go back one room)'
                          }
                        >
                          ← Prev
                        </button>
                        <button
                          type="button"
                          className={styles.inlineButton}
                          onClick={() => { uiDbg('move next clicked'); moveNext(); }}
                          disabled={runState.status !== 'running'}
                          title="Advance to the next step in the training path"
                        >
                          Next →
                        </button>
                        <button
                          type="button"
                          className={styles.inlineButton}
                          onClick={() => { uiDbg('rescan room clicked'); rescanRoom(); }}
                          disabled={runState.status !== 'running'}
                          title="Re-fire look/scan commands to refresh the room description"
                        >
                          🔍 Look
                        </button>
                      </>
                    ) : null}
                  </>
                ) : null}

                <button
                  type="button"
                  className={styles.inlineButton}
                  onClick={() => {
                    uiDbg('reset defaults clicked');
                    resetToDefaults();
                  }}
                >
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

                <label className={styles.label} style={{ flex: 2 }}>
                  Training path
                  {(combinedTrainingPaths.length > 0 || loadingTrainingPaths) && (
                    <select
                      className={styles.select}
                      value={combinedTrainingPaths.find((p) => p.raw === draft.init.trainingPath)?.id ?? ''}
                      onChange={(e) => {
                        const found = combinedTrainingPaths.find((p) => p.id === e.target.value);
                        if (found) {
                          uiDbg('training path preset selected', { id: found.id, name: found.name });
                          setDraft((p) => ({ ...p, init: { ...p.init, trainingPath: found.raw } }));
                        }
                      }}
                      disabled={loadingTrainingPaths}
                    >
                      <option value="">{loadingTrainingPaths ? 'Loading…' : '— Select a saved path —'}</option>
                      {combinedTrainingPaths.map((p, i) => (
                        <option key={`${p.id}:${i}`} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  )}
                  <input
                    className={styles.input}
                    value={draft.init.trainingPath ?? ''}
                    onChange={(e) => {
                      uiDbg('draft.init.trainingPath changed', { value: e.target.value });
                      setDraft((p) => ({ ...p, init: { ...p.init, trainingPath: e.target.value || null } }));
                    }}
                    placeholder={loadingTrainingPaths ? 'Loading…' : 'n;n;n;w;w  (or use Build tab)'}
                  />
                  <div className={styles.help}>
                    Semicolon-separated commands. Use the <strong>Build</strong> tab to construct a path visually.
                    Mob steps use the format <code>look name|engage name</code>.
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
                    onChange={(e) => {
                      uiDbg('draft.init.initiationCommand changed', { value: e.target.value });
                      setDraft((p) => ({ ...p, init: { ...p.init, initiationCommand: e.target.value || null } }));
                    }}
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

              {/* Manual target entry */}
              {selectedAreaName && (
                <div className={styles.row} style={{ gap: 8, marginBottom: 8 }}>
                  <label className={styles.label} style={{ flex: 1 }}>
                    Look name
                    <input
                      className={styles.input}
                      value={manualLookInput}
                      onChange={e => setManualLookInput(e.target.value)}
                      placeholder="e.g. a giant rat"
                    />
                  </label>
                  <label className={styles.label} style={{ flex: 1 }}>
                    Engage name
                    <input
                      className={styles.input}
                      value={manualEngageInput}
                      onChange={e => setManualEngageInput(e.target.value)}
                      placeholder="e.g. rat"
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.inlineButton}
                    style={{ alignSelf: 'flex-end', marginBottom: 2 }}
                    disabled={!manualLookInput.trim() || !manualEngageInput.trim()}
                    onClick={() => {
                      if (!selectedContinentName || !selectedAreaName) return;
                      const look = manualLookInput.trim();
                      const engage = manualEngageInput.trim();
                      if (!look || !engage) return;
                      const nextManuals = [...manualTargets, { lookName: look, engageName: engage }];
                      setManualTargets(nextManuals);
                      saveSavedTargets(selectedContinentName, selectedAreaName, nextManuals);
                      setDraft(prev => ({
                        ...prev,
                        init: {
                          ...prev.init,
                          targets: [
                            ...(prev.init.targets ?? []),
                            manualToAutoLevel({ lookName: look, engageName: engage })
                          ]
                        }
                      }));
                      setManualLookInput('');
                      setManualEngageInput('');
                    }}
                  >
                    + Add manual target
                  </button>
                </div>
              )}

              <div className={styles.beastList}>
                {!selectedAreaName ? (
                  <div className={styles.beastEmpty}>Select an area to see available targets.</div>
                ) : loadingBeasts && beasts.length === 0 ? (
                  <div className={styles.beastEmpty}>Loading targets…</div>
                ) : beasts.length === 0 && manualTargets.length === 0 ? (
                  <div className={styles.beastEmpty}>No targets returned for this area.</div>
                ) : (
                  <>
                    {/* Manual targets first */}
                    {manualTargets.map((mt, i) => {
                      const t = manualToAutoLevel(mt);
                      const checked = isSelected(t.cleanName);
                      return (
                        <div key={`manual:${t.cleanName}:${i}`} className={styles.beastRow}>
                          <input
                            className={styles.checkbox}
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              // Toggle in draft targets
                              setDraft(prev => {
                                const cur = prev.init.targets ?? [];
                                const exists = cur.some(x => String(x.cleanName ?? '').trim() === t.cleanName);
                                const next = exists
                                  ? cur.filter(x => String(x.cleanName ?? '').trim() !== t.cleanName)
                                  : [...cur, t];
                                return { ...prev, init: { ...prev.init, targets: next } };
                              });
                            }}
                          />
                          <div className={styles.beastMain}>
                            <div className={styles.beastName}>{mt.lookName} <span style={{ fontWeight: 400, opacity: 0.7 }}>(manual)</span></div>
                            <div className={styles.beastMeta}>engage: {mt.engageName}</div>
                            <button
                              type="button"
                              className={styles.inlineButton}
                              style={{ marginLeft: 8 }}
                              onClick={() => {
                                // Remove manual target
                                const nextManuals = manualTargets.filter((_, idx) => idx !== i);
                                setManualTargets(nextManuals);
                                saveSavedTargets(selectedContinentName, selectedAreaName, nextManuals);
                                setDraft(prev => ({
                                  ...prev,
                                  init: {
                                    ...prev.init,
                                    targets: (prev.init.targets ?? []).filter(x => x.cleanName !== t.cleanName)
                                  }
                                }));
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {/* API targets */}
                    {beasts.map((b, i) => {
                      const key = beastStableKey(b);
                      const checked = isSelected(key);
                      const firstKeyword =
                        (b as any).firstKeyword ?? (b as any).first_keyword ?? (b as any).firstkeyword ?? null;
                      const computedKeywords = keywordsFromFirstKeyword(firstKeyword);

                      return (
                        <div key={`${key || 'beast'}:${i}`} className={styles.beastRow}>
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
                                  <b>key:</b> <code>{key}</code>
                                </div>

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
                    })}
                  </>
                )}
              </div>

              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderTitle}>Advanced</div>
                <div className={styles.sectionHeaderSub}>Optional power-user configuration</div>
              </div>

              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.inlineButton}
                  onClick={() => {
                    uiDbg('advanced toggled', { next: !advancedOpen });
                    setAdvancedOpen((p) => !p);
                  }}
                >
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
                      {editor('fight.pre', '4a. Pre-fight (runs once on engage)')}
                      {editor('fight.exec', '4b. Fight loop (repeats every fight loop interval)')}
                      {editor('fight.post', '4c. Post-fight (runs once when fighting ends)')}
                    </div>
                  </div>

                  <div className={styles.blockCard}>
                    <div className={styles.blockHeader}>
                      <div className={styles.blockHeaderLeft}>
                        <div className={styles.blockNumber}>5</div>
                        <div className={styles.blockTitle}>Post-fight</div>
                      </div>
                    </div>
                    <div className={styles.blockBody}>
                      {editor('postFight.pre', '5a. Pre post-fight')}
                      {editor('postFight.exec', '5b. Post-fight (loot, rest, check health)')}
                      {editor('postFight.post', '5c. Post post-fight')}
                    </div>
                  </div>

                  <div className={styles.blockCard}>
                    <div className={styles.blockHeader}>
                      <div className={styles.blockHeaderLeft}>
                        <div className={styles.blockNumber}>6</div>
                        <div className={styles.blockTitle}>Reset</div>
                      </div>
                    </div>
                    <div className={styles.blockBody}>
                      {editor('reset.endRound', '6a. End round')}
                      {editor('reset.wait', '6b. Wait')}
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
