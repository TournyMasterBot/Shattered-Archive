// apps/game-client/src/components/wizard/RestStep.tsx

/**
 * Wizard step — Rest (between Combat and Review).
 *
 * All rest behavior is out-of-combat only (enforced by the engine, not this UI).
 * Start/end-of-round commands run every lap unconditionally; during-round rules step in
 * mid-route when vitals drop too low, reusing the SAME end/start-of-round command lists as
 * their "go rest" / "wake up" actions rather than carrying their own — see
 * AutoLevelRestConfig in autoleveling-types.ts.
 */

import React from 'react';

import styles from '../../styles/AutoLevelingWizard.module.scss';
import type { AutoLevelRestDuringRoundRule } from '../../features/autoleveling/autoleveling-types';
import type { WizardDraft } from './useWizardDraft';

interface Props {
  restStartOfRound: string;
  restEndOfRound: string;
  restDuringRound: AutoLevelRestDuringRoundRule[];
  onPatch: (p: Partial<WizardDraft>) => void;
}

type VitalsStat = 'hp' | 'mp' | 'mv';
const VITALS_STATS: readonly { value: VitalsStat; label: string }[] = [
  { value: 'hp', label: 'HP' },
  { value: 'mp', label: 'MP' },
  { value: 'mv', label: 'Stamina' },
];

/** '' (blank = "not checked") -> undefined; otherwise clamped 0-100. */
function parsePct(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : undefined;
}

export const RestStep: React.FC<Props> = ({ restStartOfRound, restEndOfRound, restDuringRound, onPatch }) => {
  const updateRule = (i: number, patch: Partial<AutoLevelRestDuringRoundRule>) =>
    onPatch({ restDuringRound: restDuringRound.map((r, ix) => (ix === i ? { ...r, ...patch } : r)) });

  const setThreshold = (i: number, stat: VitalsStat, raw: string) => updateRule(i, { [stat]: parsePct(raw) });

  const setRecoverTo = (i: number, stat: VitalsStat, raw: string) =>
    updateRule(i, { recoverTo: { ...restDuringRound[i].recoverTo, [stat]: parsePct(raw) } });

  const addRule = () => onPatch({ restDuringRound: [...restDuringRound, { recoverTo: {} }] });
  const removeRule = (i: number) => onPatch({ restDuringRound: restDuringRound.filter((_, ix) => ix !== i) });

  return (
    <div className={styles.stepPanel}>
      <p className={styles.fieldHint}>
        All rest behavior is <strong>out of combat only</strong>. Start/end-of-round commands run
        every lap automatically; during-round rules step in mid-route if your vitals drop too low.
      </p>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Start of round — wake up</span>
        <input
          className={styles.input}
          type="text"
          placeholder="e.g. wake;stand"
          value={restStartOfRound}
          onChange={(e) => onPatch({ restStartOfRound: e.target.value })}
          aria-label="Start of round command"
        />
        <span className={styles.fieldHint}>
          Runs at the very top of every round, before pre-round buffs. Semicolon-separated for
          multiple commands — goes through your own aliases/scripts, same as typing it yourself.
        </span>
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>End of round — rest</span>
        <input
          className={styles.input}
          type="text"
          placeholder="e.g. rest, sleep, or camp"
          value={restEndOfRound}
          onChange={(e) => onPatch({ restEndOfRound: e.target.value })}
          aria-label="End of round command"
        />
        <span className={styles.fieldHint}>
          Runs at the end of every lap. Also reused as the "go rest" action for the during-round
          rules below. Goes through your own aliases/scripts, same as typing it yourself — a
          rest macro you've already built will actually expand here, not just get sent literally.
        </span>
      </div>

      <div className={styles.subHead}>
        <span>
          During-round rest rules <span className={styles.countPill}>{restDuringRound.length}</span>
        </span>
        <span className={styles.subHeadActions}>
          <button type="button" className={styles.linkButton} onClick={addRule}>
            + add rule
          </button>
        </span>
      </div>

      {restDuringRound.length === 0 && (
        <div className={styles.notice}>No rules — the character never stops mid-route to rest.</div>
      )}

      {restDuringRound.map((rule, i) => (
        <div key={i} className={styles.buffCard}>
          <div className={styles.gateBar}>
            <span className={styles.gateLabel}>rest if</span>
            {VITALS_STATS.map((s) => (
              <span key={s.value} className={styles.inlineField}>
                {s.label} ≤
                <input
                  className={styles.levelInput}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={rule[s.value] ?? ''}
                  placeholder="off"
                  onChange={(e) => setThreshold(i, s.value, e.target.value)}
                  aria-label={`${s.label} threshold for rest rule ${i + 1}`}
                />
                %
              </span>
            ))}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => removeRule(i)}
              aria-label={`Remove rest rule ${i + 1}`}
            >
              remove
            </button>
          </div>

          <div className={styles.gateBar}>
            <span className={styles.gateLabel}>recover to</span>
            {VITALS_STATS.map((s) => (
              <span key={s.value} className={styles.inlineField}>
                {s.label} ≥
                <input
                  className={styles.levelInput}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={rule.recoverTo[s.value] ?? ''}
                  placeholder="off"
                  onChange={(e) => setRecoverTo(i, s.value, e.target.value)}
                  aria-label={`${s.label} recovery target for rest rule ${i + 1}`}
                />
                %
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
