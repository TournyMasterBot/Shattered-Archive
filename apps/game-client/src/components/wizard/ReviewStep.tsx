// apps/game-client/src/components/wizard/ReviewStep.tsx

/**
 * Wizard step 4 — Review.
 *
 * A plain-language summary of the draft. Mostly read-only; the AutoLevelConfig is only
 * built when the user hits Start on the next step. The one editable field (startRoom) is
 * a reminder only — nothing here validates it against where the player actually is.
 */

import React, { useState } from 'react';

import styles from '../../styles/AutoLevelingWizard.module.scss';
import { fullRoute } from '../../features/autoleveling/autoleveling-content';
import { routeToText } from '../../features/autoleveling/autoleveling-route-overrides';
import { describeRowOptions } from '../../features/autoleveling/autoleveling-row-text';
import type { BuffRow } from '../../features/autoleveling/autoleveling-user-data';
import type { WizardDraft, WizardMode } from './useWizardDraft';

interface Props {
  draft: WizardDraft;
  onPatch: (p: Partial<WizardDraft>) => void;
  /** Saves the player's edited route (steps separated by `;` or new lines); resolves with a message when refused. */
  onSaveRoute?: (text: string) => Promise<string | null>;
  /** Drops the player's route for this area and goes back to the shared one. */
  onResetRoute?: () => Promise<void>;
}

const MODE_LABEL: Record<WizardMode, string> = {
  auto_level: 'Auto-level — fight for XP',
  dry_run: 'Dry run — walk the route, no fighting',
  sightsee: 'Sightsee — pause at each encounter',
};

function describeBuffGate(b: BuffRow): string {
  if (b.refreshTicks != null) return `every ${b.refreshTicks} tick${b.refreshTicks === 1 ? '' : 's'}`;
  if (b.affect) return `recast if “${b.affect}” drops`;
  if (b.affect === '') return 'recast if its affect drops';
  return 'every round';
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const ReviewStep: React.FC<Props> = ({ draft, onPatch, onSaveRoute, onResetRoute }) => {
  const [routeEditing, setRouteEditing] = useState(false);
  const [routeText, setRouteText] = useState('');
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeSaving, setRouteSaving] = useState(false);

  const {
    area,
    targets,
    buffs,
    fightCommands,
    playerClass,
    initiationCommand,
    mode,
    loopRounds,
    playerAlignment,
    startRoom,
    restStartOfRound,
    restEndOfRound,
    restDuringRound,
    weightAtOrAbovePct,
    weightCommands,
    routeDefaultDirs,
    routeOverridden,
  } = draft;

  if (!area) {
    return <div className={styles.notice}>Pick a curated area to see the plan summary.</div>;
  }

  const routeStepList = fullRoute(area).split(';').filter(Boolean);
  const routeSteps = routeStepList.length;
  const enabled = targets.filter((t) => t.enabled);

  const startRouteEdit = () => {
    setRouteText(routeToText(area.dirs));
    setRouteError(null);
    setRouteEditing(true);
  };
  const cancelRouteEdit = () => {
    setRouteEditing(false);
    setRouteError(null);
  };
  const saveRouteEdit = async () => {
    if (!onSaveRoute || routeSaving) return;
    setRouteSaving(true);
    try {
      const message = await onSaveRoute(routeText);
      if (message) setRouteError(message);
      else cancelRouteEdit();
    } finally {
      setRouteSaving(false);
    }
  };
  const resetRoute = async () => {
    if (!onResetRoute) return;
    await onResetRoute();
    cancelRouteEdit();
  };

  return (
    <div className={styles.stepPanel}>
      <dl className={styles.reviewList}>
        <div className={styles.reviewRow}>
          <dt>Area</dt>
          <dd>
            <strong>{area.areaName}</strong> <span className={styles.reviewDim}>({area.continent})</span> · L
            {area.levelRange[0]}–{area.levelRange[1]}
            {area.isExcellentLevelingArea && (
              <span className={styles.badgeStar} title="Excellent leveling area">
                {' '}
                ★
              </span>
            )}
          </dd>
        </div>

        <div className={styles.reviewRow}>
          <dt>Start room</dt>
          <dd>
            <input
              type="text"
              className={`${styles.input} ${styles.reviewStartRoomInput}`}
              value={startRoom}
              onChange={(e) => onPatch({ startRoom: e.target.value })}
              placeholder={area.startRoom || 'not set'}
              aria-label="Start room"
            />
            <div className={styles.fieldHint}>
              Just a reminder of where to stand before you hit Start — not checked against your actual room.
            </div>
          </dd>
        </div>

        <div className={styles.reviewRow}>
          <dt>Route</dt>
          <dd>
            {routeSteps} step{routeSteps === 1 ? '' : 's'} per round
            {routeOverridden && <span className={`${styles.editedBadge} ${styles.routeBadge}`}>edited</span>}
            {area.speedwalkToStart ? ' (approach speedwalk not yet wired in — start already at the area entrance)' : ''}
            {onSaveRoute && !routeEditing && (
              <div className={styles.routeActions}>
                <button
                  type="button"
                  className={`${styles.linkButton} ${styles.linkAction}`}
                  onClick={startRouteEdit}
                  aria-label="Edit route"
                >
                  edit route
                </button>
                {routeOverridden && onResetRoute && (
                  <button
                    type="button"
                    className={`${styles.linkButton} ${styles.linkAction}`}
                    onClick={() => void resetRoute()}
                    aria-label="Reset route to default"
                  >
                    reset to default
                  </button>
                )}
              </div>
            )}
            {routeEditing && (
              <div role="group" aria-label="Edit route">
                <textarea
                  className={`${styles.input} ${styles.routeEditText}`}
                  aria-label="Route steps"
                  value={routeText}
                  rows={5}
                  spellCheck={false}
                  onChange={(e) => setRouteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation(); // cancels the route edit only; the window around it stays
                      cancelRouteEdit();
                    }
                  }}
                />
                <div className={styles.fieldHint}>
                  One command per step, separated by <code>;</code> or a new line, e.g. <code>e;se;n</code>. Saved for
                  you only{area.requiredActions.length > 0 ? '; the area’s required actions still run first' : ''}.
                </div>
                <div className={styles.routeActions}>
                  <button type="button" className={styles.button} onClick={() => void saveRouteEdit()} disabled={routeSaving}>
                    Save route
                  </button>
                  <button type="button" className={styles.button} onClick={cancelRouteEdit} disabled={routeSaving}>
                    Cancel
                  </button>
                </div>
                {routeError && (
                  <div className={styles.fieldError} role="alert">
                    {routeError}
                  </div>
                )}
              </div>
            )}
            {routeOverridden && !routeEditing && (
              <div className={styles.fieldHint}>Shared route: {routeDefaultDirs.length} steps</div>
            )}
            {routeSteps > 0 && (
              <details className={styles.reviewDisclosure}>
                <summary>Show steps</summary>
                {/* Explicit index text, not a native <ol> — inside a scrolling container the
                    browser's own list-item counters were rendering wrong (observed 9,0,1,2…
                    instead of 1,2,3…), so the count is just printed as plain content instead
                    of relying on CSS counter behavior here. */}
                <ul className={styles.reviewStepList}>
                  {routeStepList.map((s, i) => (
                    <li key={i}>
                      {i + 1}. <code>{s}</code>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </dd>
        </div>

        <div className={styles.reviewRow}>
          <dt>Targets</dt>
          <dd>
            {enabled.length === 0 ? (
              <span className={styles.reviewWarn}>none selected — the run just walks the route</span>
            ) : (
              <details className={styles.reviewDisclosure}>
                <summary>
                  {enabled.length} of {targets.length} selected
                </summary>
                <ul className={styles.reviewSubList}>
                  {enabled.map((t, i) => (
                    <li key={i}>
                      {t.lookName}{' '}
                      <span className={styles.reviewDim}>
                        (<code>{t.engageName}</code>)
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </dd>
        </div>

        <div className={styles.reviewRow}>
          <dt>Class</dt>
          <dd>{playerClass ?? <span className={styles.reviewWarn}>not set</span>}</dd>
        </div>

        <div className={styles.reviewRow}>
          <dt>Alignment</dt>
          <dd>
            <strong>{cap(playerAlignment)}</strong>
            <span className={styles.reviewDim}>
              {' '}
              — mob alignment detected live from <code>(Golden Aura)</code> / <code>(Red Aura)</code> for the kill-XP
              estimate
            </span>
          </dd>
        </div>

        <div className={styles.reviewRow}>
          <dt>Engage with</dt>
          <dd>
            <code>{initiationCommand.trim() || 'kill {name}'}</code>
          </dd>
        </div>

        <div className={styles.reviewRow}>
          <dt>Pre-round buffs</dt>
          <dd>
            {buffs.length === 0 ? (
              <span className={styles.reviewDim}>none</span>
            ) : (
              <ul className={styles.reviewSubList}>
                {buffs.map((b, i) => (
                  <li key={i}>
                    <code>{b.cmd || '(empty)'}</code>
                    <span className={styles.reviewDim}> — {describeBuffGate(b)}</span>
                    {b.unverified ? <span className={styles.reviewWarn}> · unverified</span> : null}
                    {b.disabled ? <span className={styles.reviewWarn}> · paused: will not be used</span> : null}
                    {b.inCombatCmd ? (
                      <span className={styles.reviewDim}>
                        {' '}
                        · in combat: <code>{b.inCombatCmd}</code>
                      </span>
                    ) : null}
                    {b.holdNearLevel ? <span className={styles.reviewDim}> · holds near level-up</span> : null}
                    {describeRowOptions(b).map((t) => (
                      <span key={t} className={styles.reviewDim}> · {t}</span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>

        <div className={styles.reviewRow}>
          <dt>Fight commands</dt>
          <dd>
            {fightCommands.length === 0 ? (
              <span className={styles.reviewDim}>none (auto-attack only)</span>
            ) : (
              <ul className={styles.reviewSubList}>
                {fightCommands.map((f, i) => (
                  <li key={i}>
                    <code>{f.cmd || '(empty)'}</code>
                    <span className={styles.reviewDim}>
                      {' '}
                      {f.disabled ? 'paused: will not be used' : f.cooldownSec > 0 ? `every ${f.cooldownSec}s` : 'every tick'}
                    </span>
                    {describeRowOptions(f).map((t) => (
                      <span key={t} className={styles.reviewDim}> · {t}</span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>

        <div className={styles.reviewRow}>
          <dt>Rest</dt>
          <dd>
            {!restStartOfRound.trim() && !restEndOfRound.trim() && restDuringRound.length === 0 ? (
              <span className={styles.reviewDim}>none configured</span>
            ) : (
              <>
                {restStartOfRound.trim() && (
                  <div>
                    wake: <code>{restStartOfRound}</code>
                  </div>
                )}
                {restEndOfRound.trim() && (
                  <div>
                    rest: <code>{restEndOfRound}</code>
                  </div>
                )}
                {restDuringRound.length > 0 && (
                  <ul className={styles.reviewSubList}>
                    {restDuringRound.map((r, i) => {
                      const thresholds = (['hp', 'mp', 'mv'] as const)
                        .filter((s) => r[s] != null)
                        .map((s) => `${s.toUpperCase()} ≤ ${r[s]}%`)
                        .join(' and ');
                      const recover = (['hp', 'mp', 'mv'] as const)
                        .filter((s) => r.recoverTo[s] != null)
                        .map((s) => `${s.toUpperCase()} ≥ ${r.recoverTo[s]}%`)
                        .join(', ');
                      return (
                        <li key={i}>
                          {thresholds || <span className={styles.reviewWarn}>no threshold set</span>}
                          <span className={styles.reviewDim}> → recover to {recover || 'nothing set'}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </dd>
        </div>

        <div className={styles.reviewRow}>
          <dt>Weight</dt>
          <dd>
            {!weightCommands.trim() ? (
              <span className={styles.reviewDim}>off</span>
            ) : (
              <>
                drop at <strong>{weightAtOrAbovePct}%</strong> carry weight: <code>{weightCommands}</code>
              </>
            )}
          </dd>
        </div>

        <div className={styles.reviewRow}>
          <dt>Mode</dt>
          <dd>
            {MODE_LABEL[mode] ?? mode}
            {loopRounds ? ' · loops until stopped' : ' · one pass'}
          </dd>
        </div>
      </dl>

      <p className={styles.fieldHint}>
        Hit <strong>Next</strong>, then <strong>Start</strong> on the run screen. Nothing is sent to the game until
        you press Start.
      </p>
    </div>
  );
};
