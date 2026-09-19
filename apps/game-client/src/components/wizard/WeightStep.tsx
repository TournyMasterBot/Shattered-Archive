// apps/game-client/src/components/wizard/WeightStep.tsx

/**
 * Wizard step — Weight (between Rest and Review).
 *
 * The engine checks carry-weight% once per movement step (out of combat only, same call point
 * as the Rest step's during-round check) and — the first time it crosses the configured
 * threshold — runs the drop sequence once. It won't fire again until weight drops back under
 * the threshold. No separate on/off toggle: a blank command list IS off. See
 * AutoLevelWeightConfig in autoleveling-types.ts.
 */

import React from 'react';

import styles from '../../styles/AutoLevelingWizard.module.scss';
import type { WizardDraft } from './useWizardDraft';

interface Props {
  weightAtOrAbovePct: number;
  weightCommands: string;
  onPatch: (p: Partial<WizardDraft>) => void;
}

/** Clamps to 1-100; falls back to 90 for a blank/invalid entry rather than leaving it empty. */
function parsePct(raw: string): number {
  const n = Number(raw.trim());
  return Number.isFinite(n) ? Math.max(1, Math.min(100, Math.round(n))) : 90;
}

export const WeightStep: React.FC<Props> = ({ weightAtOrAbovePct, weightCommands, onPatch }) => {
  return (
    <div className={styles.stepPanel}>
      <p className={styles.fieldHint}>
        Out of combat only, same as Rest. When your carry weight crosses the threshold below, the
        drop sequence runs once — it won't fire again until you're back under it. Leave the
        commands blank to turn this off.
      </p>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Threshold — carry weight ≥</span>
        <span className={styles.inlineField}>
          <input
            className={styles.levelInput}
            type="number"
            min={1}
            max={100}
            step={1}
            value={weightAtOrAbovePct}
            onChange={(e) => onPatch({ weightAtOrAbovePct: parsePct(e.target.value) })}
            aria-label="Weight threshold percentage"
          />
          %
        </span>
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Commands to run</span>
        <input
          className={styles.input}
          type="text"
          placeholder="e.g. drop gold;drop silver"
          value={weightCommands}
          onChange={(e) => onPatch({ weightCommands: e.target.value })}
          aria-label="Weight drop commands"
        />
        <span className={styles.fieldHint}>Semicolon-separated for multiple commands.</span>
      </div>
    </div>
  );
};

export default WeightStep;
