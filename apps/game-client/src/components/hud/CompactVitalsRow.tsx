import React from 'react';
import styles from '../../styles/hud/CompactVitalsRow.module.scss';
import { useStatusBlockViewModel } from '../../hooks/useLayoutShell';
import { useOpponentStatus } from '../../hooks/useOpponentStatus';

export const CompactVitalsRow: React.FC = () => {
  const { vitals, hpPct, mpPct, staPct } = useStatusBlockViewModel();
  const { enemyUi, isEnemyActive } = useOpponentStatus();

  return (
    <div className={`${styles.root} sa-hud-vitals-row`}>
      <div className={styles.gauge}>
        <span className={styles.gaugeLabel}>HP</span>
        <div className={styles.track}>
          <div className={`${styles.fill} sa-hud-vitals-fill-hp`} style={{ width: `${hpPct}%` }} data-hp-warning={hpPct < 25} />
        </div>
        <span className={styles.value}>
          {vitals.hp} / {vitals.hpMax}
        </span>
      </div>

      <div className={styles.gauge}>
        <span className={styles.gaugeLabel}>Mana</span>
        <div className={styles.track}>
          <div className={`${styles.fill} sa-hud-vitals-fill-mp`} style={{ width: `${mpPct}%` }} />
        </div>
        <span className={styles.value}>
          {vitals.mp} / {vitals.mpMax}
        </span>
      </div>

      <div className={styles.gauge}>
        <span className={styles.gaugeLabel}>MOVE</span>
        <div className={styles.track}>
          <div className={`${styles.fill} sa-hud-vitals-fill-move`} style={{ width: `${staPct}%` }} />
        </div>
        <span className={styles.value}>
          {vitals.stamina} / {vitals.staminaMax}
        </span>
      </div>

      {isEnemyActive && (
        <div className={`${styles.enemyRow} sa-hud-vitals-enemy-row`}>
          <span className={styles.gaugeLabel}>{enemyUi.label}</span>
          <div className={styles.track}>
            <div className={`${styles.fill} sa-hud-vitals-fill-enemy`} style={{ width: `${enemyUi.pct}%` }} />
          </div>
          <span className={styles.value}>{enemyUi.statusText}</span>
        </div>
      )}
    </div>
  );
};

export default CompactVitalsRow;
