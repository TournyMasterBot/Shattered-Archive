// apps/game-client/src/components/RightSidebar.tsx
import React, { useEffect } from 'react';
import styles from '../styles/LayoutShell.module.scss';
import { useStatusBlockViewModel } from '../hooks/useLayoutShell';
import AffectsBlock from './AffectsBlock';
import CompassBlock from './CompassBlock';
import RoomHeader from './RoomHeader';

/* ---------------- Status block (tick + vitals + enemy + ancillary) ---------------- */

const StatusBlock: React.FC = () => {
  const { remaining, vitals, enemy, hpPct, mpPct, staPct, ancillary } = useStatusBlockViewModel();

  // Only log ancillary when it actually changes
  useEffect(() => {
    if (
      ancillary.carryWeightPct == null &&
      ancillary.carryWeight == null &&
      ancillary.carryWeightMax == null &&
      !ancillary.isQuiet &&
      !ancillary.isFlying &&
      !ancillary.isRiding &&
      !ancillary.isFighting &&
      !ancillary.language
    ) {
      return;
    }

    console.log('[StatusBlock] ancillary changed', ancillary);
  }, [
    ancillary.carryWeight,
    ancillary.carryWeightMax,
    ancillary.carryWeightPct,
    ancillary.isQuiet,
    ancillary.isFlying,
    ancillary.isRiding,
    ancillary.isFighting,
    ancillary.language,
  ]);

  const pieces: string[] = [];

  if (ancillary.carryWeight != null && ancillary.carryWeightMax != null && ancillary.carryWeightPct != null) {
    // 🧺 120 / 300 (40%)
    pieces.push(
      `🧺 ${ancillary.carryWeight.toFixed(0)} / ${ancillary.carryWeightMax.toFixed(0)} (${ancillary.carryWeightPct.toFixed(0)}%)`,
    );
  }
  if (ancillary.isQuiet) pieces.push('🔇');
  if (ancillary.isFlying) pieces.push('🪽');
  if (ancillary.isRiding) pieces.push('🐎');
  if (ancillary.isFighting) pieces.push('⚔️');
  if (ancillary.language && ancillary.language.toLowerCase() !== 'common') {
    pieces.push(`💬 ${ancillary.language}`);
  }

  const statusText = pieces.length > 0 ? pieces.join('   ') : '';

  return (
    <div className={styles.statusBlock}>
      {/* Tick line */}
      <div className={styles.tickRow}>
        <span className={styles.tickLabel}>Next Tick:</span>
        <span className={styles.tickValue}>{remaining}</span>
      </div>

      {/* Ancillary status line (only if we have anything to show) */}
      {statusText && (
        <div className={styles.tickRow}>
          <span className={styles.tickLabel}>Status:</span>
          <span style={{ flex: 1, fontSize: '0.7rem' }}>{statusText}</span>
        </div>
      )}

      {/* Vitals + enemy bars */}
      <div className={styles.barGroup}>
        {/* Player HP */}
        <div className={`${styles.barRow} ${styles.barHp}`}>
          <span className={styles.barLabel}>HP</span>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ width: `${hpPct}%` }} />
          </div>
          <span className={styles.barValue}>
            {vitals.hp} / {vitals.hpMax}
          </span>
        </div>

        {/* Player MP */}
        <div className={`${styles.barRow} ${styles.barMp}`}>
          <span className={styles.barLabel}>MP</span>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ width: `${mpPct}%` }} />
          </div>
          <span className={styles.barValue}>
            {vitals.mp} / {vitals.mpMax}
          </span>
        </div>

        {/* Player Stamina */}
        <div className={`${styles.barRow} ${styles.barSta}`}>
          <span className={styles.barLabel}>Stam</span>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ width: `${staPct}%` }} />
          </div>
          <span className={styles.barValue}>
            {vitals.stamina} / {vitals.staminaMax}
          </span>
        </div>

        {/* Enemy HP (visible only when combat state says so) */}
        {enemy.visible && (
          <div className={`${styles.barRow} ${styles.barEnemy}`}>
            <span className={styles.barLabel}>{enemy.label || 'Enemy'}</span>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${enemy.pct}%` }} />
            </div>
            <span className={styles.barValue}>{enemy.statusText || `${enemy.pct.toFixed(0)}%`}</span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------------- Right sidebar shell ---------------- */

export const RightSidebar: React.FC = () => {
  return (
    <aside className={styles.rightPane}>
      <RoomHeader />
      <StatusBlock />
      <AffectsBlock />
      <CompassBlock />
    </aside>
  );
};

export default RightSidebar;
