import React from 'react';
import styles from '../../styles/hud/CompactVitalsRow.module.scss';
import { useStatusBlockViewModel } from '../../hooks/useLayoutShell';
import { useOpponentStatus } from '../../hooks/useOpponentStatus';
import { useSanctuaryActive } from '../../hooks/useSanctuaryActive';
import { computeStatusPieces } from '../../hooks/useCharData';

export const CompactVitalsRow: React.FC = () => {
  const { remaining, vitals, hpPct, mpPct, staPct, ancillary } = useStatusBlockViewModel();
  const { enemyUi, isEnemyActive } = useOpponentStatus();
  const { hasSanctuary } = useSanctuaryActive();

  const statusPieces = computeStatusPieces(ancillary);

  return (
    <div className={`${styles.card} sa-hud-vitals-row`}>
      <div className={styles.root}>
        <span className={styles.tickBadge} title="Next tick">
          ⏱ {remaining}
        </span>

        <div className={styles.gauge}>
          <span className={styles.gaugeLabel}>HP</span>
          <div className={styles.track} data-sanctuary={hasSanctuary}>
            <div
              className={`${styles.fill} sa-hud-vitals-fill-hp`}
              style={{ width: `${hpPct}%` }}
              data-hp-warning={hpPct < 25}
            />
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
      </div>

      {statusPieces.length > 0 && (
        <div className={`${styles.statusRow} sa-hud-status-row`}>
          {statusPieces.map((p) => (
            <span key={p.key} className={styles.statusPiece} title={p.title}>
              {p.text}
            </span>
          ))}
        </div>
      )}

      {isEnemyActive && (
        <div className={`${styles.enemyRow} sa-hud-vitals-enemy-row`}>
          <span className={styles.enemyLabel}>{enemyUi.label}</span>
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
