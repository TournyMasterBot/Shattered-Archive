// apps-game-client/src/components/FocusBarVitals.tsx
import React from 'react';
import styles from '../styles/FocusBarVitals.module.scss';
import { useFocusBarVitals } from '../hooks/useFocusBarVitals';
import { useSanctuaryActive } from '../hooks/useSanctuaryActive';
import { useVitalsDamageChunk } from '../hooks/useVitalsDamageChunk';

export const FocusBarVitals: React.FC = () => {
  const { remaining, hpPct, mpPct, staPct } = useFocusBarVitals(41);
  const { hasSanctuary } = useSanctuaryActive();

  const hpChunk = useVitalsDamageChunk(hpPct);
  const mpChunk = useVitalsDamageChunk(mpPct);
  const staChunk = useVitalsDamageChunk(staPct);

  React.useEffect(() => {
  // remove after verifying
  console.log('[focus vitals pct]', { hpPct, mpPct, staPct });
}, [hpPct, mpPct, staPct]);

  return (
    <div className={styles.focusBar}>
      <div className={styles.focusBarContent}>
        <div className={styles.focusBarLabel}>
          Tick: <strong>{remaining}</strong>
        </div>

        <div className={styles.focusBarVitalsGroup}>
          <div className={`${styles.focusBarVitalRow} ${hasSanctuary ? styles.hpSanctuary : ''}`}>
            <span className={styles.focusBarVitalName}>HP</span>
            <div className={styles.focusBarVitalTrack}>
              <div className={styles.focusBarVitalFillHp} style={{ width: `${hpPct}%` }} />
              {hpChunk && (
                <div
                  key={`hp-${hpChunk.pulseKey}`}
                  className={styles.vitalsDamageChunk}
                  style={{ left: `${hpChunk.leftPct}%`, width: `${hpChunk.widthPct}%` }}
                />
              )}
            </div>
          </div>

          <div className={styles.focusBarVitalRow}>
            <span className={styles.focusBarVitalName}>MP</span>
            <div className={styles.focusBarVitalTrack}>
              <div className={styles.focusBarVitalFillMp} style={{ width: `${mpPct}%` }} />
              {mpChunk && (
                <div
                  key={`mp-${mpChunk.pulseKey}`}
                  className={styles.vitalsDamageChunk}
                  style={{ left: `${mpChunk.leftPct}%`, width: `${mpChunk.widthPct}%` }}
                />
              )}
            </div>
          </div>

          <div className={styles.focusBarVitalRow}>
            <span className={styles.focusBarVitalName}>Sta</span>
            <div className={styles.focusBarVitalTrack}>
              <div className={styles.focusBarVitalFillSta} style={{ width: `${staPct}%` }} />
              {staChunk && (
                <div
                  key={`sta-${staChunk.pulseKey}`}
                  className={styles.vitalsDamageChunk}
                  style={{ left: `${staChunk.leftPct}%`, width: `${staChunk.widthPct}%` }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FocusBarVitals;
