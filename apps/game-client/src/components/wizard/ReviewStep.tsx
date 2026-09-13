// apps/game-client/src/components/wizard/ReviewStep.tsx

/**
 * Wizard step 4 — Review.
 *
 * A plain-language summary of the draft. Mostly read-only; the AutoLevelConfig is only
 * built when the user hits Start on the next step. The one editable field (startRoom) is
 * a reminder only — nothing here validates it against where the player actually is.
 */

import React from 'react';

import styles from '../../styles/AutoLevelingWizard.module.scss';
import { fullRoute } from '../../features/autoleveling/autoleveling-content';
import type { BuffRow } from '../../features/autoleveling/autoleveling-user-data';
import type { WizardDraft, WizardMode } from './useWizardDraft';

interface Props {
  draft: WizardDraft;
  onPatch: (p: Partial<WizardDraft>) => void;
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

export const ReviewStep: React.FC<Props> = ({ draft, onPatch }) => {
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
  } = draft;

  if (!area) {
    return <div className={styles.notice}>Pick a curated area to see the plan summary.</div>;
  }

  const routeStepList = fullRoute(area).split(';').filter(Boolean);
  const routeSteps = routeStepList.length;
  const enabled = targets.filter((t) => t.enabled);

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
            {area.speedwalkToStart ? ' (approach speedwalk not yet wired in — start already at the area entrance)' : ''}
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
                    {b.inCombatCmd ? (
                      <span className={styles.reviewDim}>
                        {' '}
                        · in combat: <code>{b.inCombatCmd}</code>
                      </span>
                    ) : null}
                    {b.holdNearLevel ? <span className={styles.reviewDim}> · holds near level-up</span> : null}
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
                    <span className={styles.reviewDim}> {f.cooldownSec > 0 ? `every ${f.cooldownSec}s` : 'every tick'}</span>
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
