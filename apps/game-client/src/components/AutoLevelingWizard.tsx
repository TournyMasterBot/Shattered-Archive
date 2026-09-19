// apps/game-client/src/components/AutoLevelingWizard.tsx

/**
 * AutoLevelingWizard (UI) — replacement for AutoLevelingModal
 * ----------------------------------------------------------
 * A linear 5-step wizard: Area -> Targets -> Combat -> Review -> Start.
 *
 * Design intent:
 * - The common path (pick a curated area, accept the defaults, hit Start) needs
 *   zero scripting. Power-user knobs (timings, raw action triplets) live behind
 *   an "Advanced" disclosure on the Combat/Review steps, never on the main flow.
 * - Curated areas come from the checked-in content pack
 *   (features/autoleveling/content). The wizard builds an AutoLevelConfig from
 *   the draft only when the user clicks Start.
 *
 * Scaffold status (plan step 1): stepper + navigation shell only. Individual
 * step panels are filled in by later plan steps.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import styles from '../styles/AutoLevelingWizard.module.scss';
import type {
  AutoLevelConfig,
  AutoLevelRunState,
  AutoLevelXpProgress,
} from '../features/autoleveling/autoleveling-types';
import { getAreaDetail } from '../features/autoleveling/autoleveling-content';
import {
  addCustomTarget as persistCustomTarget,
  getBuffOverlay,
  getCustomTargets,
  getFightOverlay,
  getPrefs,
  type FightRow,
} from '../features/autoleveling/autoleveling-user-data';
import { draftToConfig } from '../features/autoleveling/autoleveling-wizard-config';
import { AreaStep } from './wizard/AreaStep';
import { CombatStep } from './wizard/CombatStep';
import { RestStep } from './wizard/RestStep';
import { ReviewStep } from './wizard/ReviewStep';
import { TargetsStep } from './wizard/TargetsStep';
import { useCharacterLogin } from './wizard/useCharacterLevel';
import { useWizardDraft, type DraftTarget } from './wizard/useWizardDraft';
import { WeightStep } from './wizard/WeightStep';

/* ------------------------------------------------------------------------- */

export interface AutoLevelingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  isConnected: boolean;
  // Engine state & controls — provided by the single useAutoLeveling instance in MainContainer.
  config: AutoLevelConfig;
  setConfig: (next: AutoLevelConfig) => void;
  runState: AutoLevelRunState;
  xpProgress: AutoLevelXpProgress | null;
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

type StepId = 'area' | 'targets' | 'combat' | 'rest' | 'weight' | 'review' | 'start';

const STEPS: { id: StepId; label: string; blurb: string }[] = [
  { id: 'area', label: 'Area', blurb: 'Where to train' },
  { id: 'targets', label: 'Targets', blurb: 'What to kill' },
  { id: 'combat', label: 'Combat', blurb: 'Class, buffs, rotation' },
  { id: 'rest', label: 'Rest', blurb: 'Recovery, in and out of combat' },
  { id: 'weight', label: 'Weight', blurb: 'Drop items when overburdened' },
  { id: 'review', label: 'Review', blurb: 'Confirm the plan' },
  { id: 'start', label: 'Start', blurb: 'Run & monitor' },
];

// ── run-state → short label (mirrors AutoLevelingModal.toRunStateText) ──
function toRunStateText(runState: AutoLevelRunState): string {
  switch (runState.status) {
    case 'idle':
    case 'stopping':
      return 'Not running';
    case 'waiting':
      return 'Waiting';
    case 'resting':
      return 'Resting';
    case 'running': {
      const step = runState.step ?? '';
      if (step.startsWith('sightsee:waiting')) return `Sightsee — ready (round ${runState.round})`;
      if (step.includes('fight')) return `Fighting (round ${runState.round})`;
      if (step.includes('move')) return `Moving (round ${runState.round})`;
      return `Running (round ${runState.round})`;
    }
    case 'paused':
      return `Paused (round ${runState.round})`;
    case 'error':
      return `Error: ${runState.message}`;
    default:
      return 'Not running';
  }
}

const fmtInt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Mirrors the terminal's "[auto-level]" line (autoleveling-engine.ts emitXpProgress) as
// plain text, so the wizard keeps showing the last kill's numbers between rounds instead
// of the player having to scroll back through the terminal to find them.
function formatXpProgress(p: AutoLevelXpProgress): string {
  const parts = [`+${fmtInt(p.gainedXp)} xp`];
  if (p.killsLeft != null) parts.push(`~${fmtInt(p.killsLeft)} ${p.killsLeft === 1 ? 'kill' : 'kills'} to level`);
  parts.push(`${fmtInt(p.tnl)} tnl`);
  parts.push(`avg ${fmtInt(p.estKillXp)} xp/kill over ${p.sessionKills}`);
  return parts.join(' · ');
}

/* ------------------------------------------------------------------------- */

export const AutoLevelingWizard: React.FC<AutoLevelingWizardProps> = ({
  isOpen,
  onClose,
  config,
  setConfig,
  runState,
  xpProgress,
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
  const [stepIx, setStepIx] = useState(0);

  const { level: charLevel, name: charName } = useCharacterLogin();
  const { draft, patch, setArea, toggleTarget, addCustomTarget, removeCustomTarget, reset } = useWizardDraft();
  const [customChosen, setCustomChosen] = useState(false);
  const [targetsLoading, setTargetsLoading] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const step = STEPS[stepIx];
  const runStateText = useMemo(() => toRunStateText(runState), [runState]);
  const isRunning = runState.status === 'running' || runState.status === 'paused' || runState.status === 'waiting';

  // Centre on open.
  useEffect(() => {
    if (!isOpen) return;
    setPos({
      x: Math.max(0, (window.innerWidth - 900) / 2),
      y: Math.max(0, (window.innerHeight - 720) / 2),
    });
    // Jump straight to the monitor when a run is already in progress.
    setStepIx(isRunning ? STEPS.length - 1 : 0);
    if (!isRunning) {
      reset();
      setCustomChosen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Build the engine config from the draft while the user sits on the Start step
  // (and isn't mid-run). By the time they click Start it's committed + persisted.
  useEffect(() => {
    if (!isOpen || step.id !== 'start' || isRunning) return;
    if (!draft.area || customChosen) return;
    setConfig(draftToConfig(draft));
  }, [isOpen, step.id, isRunning, draft, customChosen, setConfig]);

  // Combat fight-commands, Rest during-round rules, and the Weight gate all re-fetch config
  // fresh on their own next check (see autoleveling-engine.ts) — no pause needed for these
  // three specifically. Targets/buffs/route/rest-start-end-of-round sit on a snapshot frozen
  // for the whole run and only pick up edits via pause->resume (below), so the message is
  // step-specific: Combat and Rest each mix a hot-swappable part with a frozen one.
  const LIVE_APPLY_HINT: Partial<Record<StepId, string>> = {
    combat: "Fight commands apply live below. Buffs need Pause → edit → Resume instead.",
    rest: "During-round rules apply live below. Start/end-of-round commands need Pause → edit → Resume instead.",
    weight: 'Changes here apply live.',
  };
  const showLiveApply = isRunning && !!LIVE_APPLY_HINT[step.id];
  const applyLiveChanges = useCallback(() => setConfig(draftToConfig(draft)), [draft, setConfig]);

  // Targets/buffs/route/rest-start-end-of-round have no hot-swap path at all — Pause, edit,
  // Resume is the ONLY way an edit there reaches the running engine (refreshRunSnapshot()).
  const showPauseToEditHint = isRunning && step.id === 'targets';

  const onHeaderMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = modalRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();

    const onMove = (ev: MouseEvent) => {
      if (!dragOffsetRef.current) return;
      setPos({ x: ev.clientX - dragOffsetRef.current.x, y: ev.clientY - dragOffsetRef.current.y });
    };
    const onUp = () => {
      dragOffsetRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const goNext = useCallback(() => setStepIx((i) => Math.min(STEPS.length - 1, i + 1)), []);
  const goPrev = useCallback(() => setStepIx((i) => Math.max(0, i - 1)), []);

  // Area selection → fetch the route+targets, seed the draft's target list from
  // the API's recommendations plus any targets the user saved for this area.
  const onSelectArea = useCallback(
    async (slug: string, opts: { force?: boolean } = {}) => {
      setCustomChosen(false);
      setTargetsLoading(true);
      if (!opts.force) setArea(slug, null, []);
      try {
        const prefs = await getPrefs();
        const cls = prefs.playerClass ?? null;
        const playerAlignment = (prefs.playerAlignment as 'good' | 'neutral' | 'evil' | undefined) ?? 'neutral';
        const [detail, saved, buffs, fightCommands] = await Promise.all([
          getAreaDetail(slug, opts),
          getCustomTargets(slug),
          getBuffOverlay(slug),
          cls ? getFightOverlay(slug, cls) : Promise.resolve<FightRow[]>([]),
        ]);
        const seen = new Set<string>();
        const seed: DraftTarget[] = [];
        for (const t of detail?.recommendedTargets ?? []) {
          const key = t.lookName.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          seed.push({ ...t, enabled: true, origin: 'area' });
        }
        for (const rec of saved) {
          const t = rec.data;
          const key = String(t?.lookName ?? '').toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          seed.push({ lookName: t.lookName, engageName: t.engageName, level: t.level, enabled: true, origin: 'custom' });
        }
        setArea(slug, detail, seed);
        patch({
          playerClass: cls,
          buffs,
          fightCommands,
          playerAlignment,
          // Seed from the area's own startRoom on a fresh pick, not on a cache refresh
          // (which shouldn't clobber whatever reminder the player already typed in).
          ...(opts.force ? {} : { startRoom: detail?.startRoom ?? '' }),
        });
      } finally {
        setTargetsLoading(false);
      }
    },
    [setArea, patch],
  );

  const refreshSelectedArea = useCallback(() => {
    if (draft.areaSlug) void onSelectArea(draft.areaSlug, { force: true });
  }, [draft.areaSlug, onSelectArea]);

  const onAddCustomTarget = useCallback(
    (t: { lookName: string; engageName: string }) => {
      addCustomTarget(t);
      if (draft.areaSlug) void persistCustomTarget(draft.areaSlug, t);
    },
    [addCustomTarget, draft.areaSlug],
  );

  if (!isOpen) return null;

  const canGoBack = stepIx > 0;
  const areaChosen = !!draft.areaSlug || customChosen;
  const nextDisabled =
    (step.id === 'area' && !areaChosen) ||
    (step.id === 'targets' && !draft.area && !customChosen);
  const canAdvance = stepIx < STEPS.length - 1;

  return (
    <div
      ref={modalRef}
      className={styles.modal}
      role="dialog"
      aria-modal="true"
      aria-label="Auto-leveling wizard"
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 5000 }}
    >
      <div className={styles.header} onMouseDown={onHeaderMouseDown}>
        <div className={styles.title}>Autopilot</div>
        <div className={styles.headerRight}>
          <span className={styles.runState} data-status={runState.status}>
            {runStateText}
          </span>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
      </div>

      {/* Stepper */}
      <ol className={styles.stepper}>
        {STEPS.map((s, i) => {
          const state = i === stepIx ? 'current' : i < stepIx ? 'done' : 'todo';
          return (
            <li key={s.id} className={styles.stepperItem} data-state={state}>
              <button
                type="button"
                className={styles.stepperButton}
                onClick={() => setStepIx(i)}
                aria-current={i === stepIx ? 'step' : undefined}
              >
                <span className={styles.stepIndex}>{i + 1}</span>
                <span className={styles.stepText}>
                  <span className={styles.stepLabel}>{s.label}</span>
                  <span className={styles.stepBlurb}>{s.blurb}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className={styles.body}>
        <div className={styles.stepHeader}>
          <h2 className={styles.stepHeading}>{step.label}</h2>
          <p className={styles.stepSub}>{step.blurb}</p>
          {showLiveApply && (
            <div className={styles.liveApplyBar}>
              <span>{LIVE_APPLY_HINT[step.id]}</span>
              <button type="button" className={styles.primaryButton} onClick={applyLiveChanges}>
                Apply live changes
              </button>
            </div>
          )}
          {showPauseToEditHint && (
            <div className={styles.liveApplyBar}>
              <span>Editing while running? Pause, make your changes, then Resume to apply them.</span>
            </div>
          )}
        </div>

        <div className={styles.stepPanel}>
          {step.id === 'area' && (
            <AreaStep
              selectedSlug={draft.areaSlug}
              charLevel={charLevel}
              onSelect={onSelectArea}
              onRefreshSelected={refreshSelectedArea}
              onChooseCustom={() => {
                setCustomChosen(true);
                setArea('', null, []);
              }}
              customChosen={customChosen}
            />
          )}

          {step.id === 'targets' &&
            (customChosen ? (
              <div className={styles.placeholder}>
                <p>
                  <strong>Custom path</strong> builder — coming in a later step. For now, pick a curated area on the
                  previous step.
                </p>
              </div>
            ) : (
              <TargetsStep
                areaName={draft.area?.areaName ?? (draft.areaSlug ? draft.areaSlug : null)}
                targets={draft.targets}
                loading={targetsLoading}
                onToggle={toggleTarget}
                onAddCustom={onAddCustomTarget}
                onRemoveCustom={removeCustomTarget}
              />
            ))}

          {step.id === 'combat' &&
            (customChosen ? (
              <div className={styles.placeholder}>
                <p>
                  <strong>Custom path</strong> — combat setup for custom routes comes in a later step.
                </p>
              </div>
            ) : (
              <CombatStep
                areaSlug={draft.areaSlug}
                charName={charName}
                charLevel={charLevel}
                playerClass={draft.playerClass}
                initiationCommand={draft.initiationCommand}
                buffs={draft.buffs}
                fightCommands={draft.fightCommands}
                playerAlignment={draft.playerAlignment}
                onPatch={patch}
              />
            ))}

          {step.id === 'rest' &&
            (customChosen ? (
              <div className={styles.placeholder}>
                <p>
                  <strong>Custom path</strong> — rest setup for custom routes comes in a later step.
                </p>
              </div>
            ) : (
              <RestStep
                restStartOfRound={draft.restStartOfRound}
                restEndOfRound={draft.restEndOfRound}
                restDuringRound={draft.restDuringRound}
                onPatch={patch}
              />
            ))}

          {step.id === 'weight' &&
            (customChosen ? (
              <div className={styles.placeholder}>
                <p>
                  <strong>Custom path</strong> — weight setup for custom routes comes in a later step.
                </p>
              </div>
            ) : (
              <WeightStep
                weightAtOrAbovePct={draft.weightAtOrAbovePct}
                weightCommands={draft.weightCommands}
                onPatch={patch}
              />
            ))}

          {step.id === 'review' &&
            (customChosen ? (
              <div className={styles.placeholder}>
                <p>
                  <strong>Custom path</strong> review comes in a later step.
                </p>
              </div>
            ) : (
              <ReviewStep draft={draft} onPatch={patch} />
            ))}

          {step.id === 'start' && (
            <div className={styles.monitor}>
              <div className={styles.monitorRow}>
                <span className={styles.monitorLabel}>Status</span>
                <span className={styles.monitorValue}>{runStateText}</span>
              </div>

              {isRunning && xpProgress && (
                <div className={styles.monitorRow}>
                  <span className={styles.monitorLabel}>Last kill</span>
                  <span className={styles.monitorValue}>{formatXpProgress(xpProgress)}</span>
                </div>
              )}

              <div className={styles.gateBar}>
                <span className={styles.gateLabel}>run as</span>
                <div className={styles.gateSeg} role="group" aria-label="Run mode">
                  {(
                    [
                      ['auto_level', 'Auto-level', 'Walk the route and fight for XP.'],
                      ['dry_run', 'Dry run', 'Walk the route, announce mobs, never engage.'],
                      ['sightsee', 'Sightsee', 'Stop at each encounter and wait for you.'],
                    ] as const
                  ).map(([m, label, hint]) => (
                    <button
                      key={m}
                      type="button"
                      className={`${styles.gateOpt} ${draft.mode === m ? styles.gateOptOn : ''}`}
                      aria-pressed={draft.mode === m}
                      title={hint}
                      disabled={isRunning}
                      onClick={() => patch({ mode: m })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.monitorControls}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={!socketReady || isRunning || !draft.area}
                  onClick={start}
                >
                  Start
                </button>
                <button type="button" className={styles.button} disabled={runState.status !== 'running'} onClick={pause}>
                  Pause
                </button>
                <button type="button" className={styles.button} disabled={runState.status !== 'paused'} onClick={resume}>
                  Resume
                </button>
                <button type="button" className={styles.button} disabled={!isRunning} onClick={stop}>
                  Stop
                </button>
              </div>
              <div className={styles.monitorControls}>
                <button type="button" className={styles.subtleButton} onClick={rescanRoom}>
                  Re-scan room
                </button>
                <button type="button" className={styles.subtleButton} onClick={movePrev}>
                  ◀ Prev
                </button>
                <button type="button" className={styles.subtleButton} onClick={moveNext}>
                  Next ▶
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.subtleButton} onClick={resetToDefaults}>
          Reset defaults
        </button>
        <div className={styles.footerSpacer} />
        <button type="button" className={styles.button} disabled={!canGoBack} onClick={goPrev}>
          ◀ Back
        </button>
        {canAdvance ? (
          <button type="button" className={styles.primaryButton} onClick={goNext} disabled={nextDisabled}>
            Next ▶
          </button>
        ) : (
          <button type="button" className={styles.button} onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
};

export default AutoLevelingWizard;
