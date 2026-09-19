// apps/game-client/src/components/wizard/TargetsStep.tsx

import React, { useState } from 'react';

import styles from '../../styles/AutoLevelingWizard.module.scss';
import type { DraftTarget } from './useWizardDraft';

interface Props {
  areaName: string | null;
  targets: DraftTarget[];
  loading: boolean;
  onToggle: (lookName: string, enabled: boolean) => void;
  onAddCustom: (t: { lookName: string; engageName: string }) => void;
  onRemoveCustom: (lookName: string) => void;
}

export const TargetsStep: React.FC<Props> = ({
  areaName,
  targets,
  loading,
  onToggle,
  onAddCustom,
  onRemoveCustom,
}) => {
  const [look, setLook] = useState('');
  const [engage, setEngage] = useState('');

  const submitCustom = () => {
    const l = look.trim();
    const e = engage.trim();
    if (!l || !e) return;
    onAddCustom({ lookName: l, engageName: e });
    setLook('');
    setEngage('');
  };

  if (!areaName) {
    return <div className={styles.notice}>Pick an area first — its recommended targets load here.</div>;
  }

  const enabledCount = targets.filter((t) => t.enabled).length;
  const areaTargets = targets.filter((t) => t.origin === 'area');
  const customTargets = targets.filter((t) => t.origin === 'custom');

  return (
    <div className={styles.stepPanel}>
      <div className={styles.subHead}>
        <span>
          <strong>{areaName}</strong> — {enabledCount} of {targets.length} selected
        </span>
      </div>

      {loading && <div className={styles.notice}>Loading targets…</div>}

      {!loading && areaTargets.length === 0 && customTargets.length === 0 && (
        <div className={styles.notice}>
          This area has no recommended targets on record — add the ones you kill below (the name you see when you
          walk into the room, and the keyword for <code>kill</code>).
        </div>
      )}

      {areaTargets.length > 0 && (
        <ul className={styles.targetList}>
          {areaTargets.map((t) => (
            <li key={t.lookName} className={styles.targetRow}>
              <label className={styles.targetCheck}>
                <input type="checkbox" checked={t.enabled} onChange={(e) => onToggle(t.lookName, e.target.checked)} />
                <span className={styles.targetLook}>{t.lookName}</span>
              </label>
              <span className={styles.targetMeta}>
                {t.level != null && <span className={styles.targetLevel}>L{t.level}</span>}
                <code>{t.engageName}</code>
              </span>
            </li>
          ))}
        </ul>
      )}

      {customTargets.length > 0 && (
        <>
          <div className={styles.subHead}>
            <span>Your targets</span>
          </div>
          <ul className={styles.targetList}>
            {customTargets.map((t) => (
              <li key={t.lookName} className={styles.targetRow}>
                <label className={styles.targetCheck}>
                  <input type="checkbox" checked={t.enabled} onChange={(e) => onToggle(t.lookName, e.target.checked)} />
                  <span className={styles.targetLook}>{t.lookName}</span>
                </label>
                <span className={styles.targetMeta}>
                  <code>{t.engageName}</code>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => onRemoveCustom(t.lookName)}
                    aria-label={`Remove ${t.lookName}`}
                  >
                    remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className={styles.addTargetRow}>
        <input
          className={styles.input}
          type="text"
          placeholder="Look description — e.g. A centaur ranger eyes you warily."
          value={look}
          onChange={(e) => setLook(e.target.value)}
        />
        <input
          className={styles.inputNarrow}
          type="text"
          placeholder="kill keyword — e.g. ranger"
          value={engage}
          onChange={(e) => setEngage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitCustom()}
        />
        <button type="button" className={styles.button} onClick={submitCustom} disabled={!look.trim() || !engage.trim()}>
          Add
        </button>
      </div>
    </div>
  );
};
