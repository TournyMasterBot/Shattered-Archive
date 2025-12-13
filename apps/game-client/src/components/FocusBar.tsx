// apps/game-client/src/components/FocusBar.tsx
import React from 'react';
import styles from '../styles/FocusBar.module.scss';
import { useTickTimer, useVitalsState } from '../hooks/useRightPaneHud';

interface FocusBarProps {
  label?: string;
}

export const FocusBar: React.FC<FocusBarProps> = ({ label = 'Vitals' }) => {
  const { remaining } = useTickTimer(41);
  const vitals = useVitalsState();

  const pct = (value: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0);

  const hpPct = pct(vitals.hp, vitals.hpMax);
  const mpPct = pct(vitals.mp, vitals.mpMax);
  const staPct = pct(vitals.stamina, vitals.staminaMax);

  return (
    <div className={styles.focusBar}>
      <div className={styles.focusBarContent}>
        <span className={styles.focusBarLabel}>
          {label}: <strong>{remaining}</strong>
        </span>

        <div className={styles.focusBarVitalsGroup}>
          <div className={styles.focusBarVitalRow}>
            <span className={styles.focusBarVitalName}>HP</span>
            <div className={styles.focusBarVitalTrack}>
              <div className={styles.focusBarVitalFillHp} style={{ width: `${hpPct}%` }} />
            </div>
          </div>

          <div className={styles.focusBarVitalRow}>
            <span className={styles.focusBarVitalName}>MP</span>
            <div className={styles.focusBarVitalTrack}>
              <div className={styles.focusBarVitalFillMp} style={{ width: `${mpPct}%` }} />
            </div>
          </div>

          <div className={styles.focusBarVitalRow}>
            <span className={styles.focusBarVitalName}>Sta</span>
            <div className={styles.focusBarVitalTrack}>
              <div className={styles.focusBarVitalFillSta} style={{ width: `${staPct}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FocusBar;
