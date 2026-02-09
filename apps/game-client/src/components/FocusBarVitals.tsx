// apps-game-client/src/components/FocusBarVitals.tsx
import React from 'react';
import styles from '../styles/FocusBarVitals.module.scss';
import { useFocusBarVitals } from '../hooks/useFocusBarVitals';
import { useSanctuaryActive } from '../hooks/useSanctuaryActive';

export const FocusBarVitals: React.FC = () => {
  const { remaining, hpPct, mpPct, staPct } = useFocusBarVitals(41); // same default as StatusBlock
  const { hasSanctuary } = useSanctuaryActive();

  return (
    <div className={styles.focusBar}>
      <div className={styles.focusBarContent}>
        {/* Left: label + tick */}
        <div className={styles.focusBarLabel}>
          Tick: <strong>{remaining}</strong>
        </div>

        {/* Right: compact vitals bars */}
        <div className={styles.focusBarVitalsGroup}>
          <div className={`${styles.focusBarVitalRow} ${hasSanctuary ? styles.hpSanctuary : ''}`}>
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

export default FocusBarVitals;
