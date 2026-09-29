import React, { useMemo } from 'react';
import styles from '../../styles/hud/CompactVitalsRow.module.scss';
import { useStatusBlockViewModel } from '../../hooks/useLayoutShell';
import { useOpponentStatus } from '../../hooks/useOpponentStatus';
import { useSanctuaryActive } from '../../hooks/useSanctuaryActive';
import { useLevelProgress } from '../../hooks/useLevelProgress';
import { computeStatusPieces } from '../../hooks/useCharData';
import { ansiToHtml } from '@shatteredarchive/utils-client/ansi-to-html';

export const CompactVitalsRow: React.FC = () => {
  const { remaining, vitals, hpPct, mpPct, staPct, ancillary } = useStatusBlockViewModel();
  const { enemyUi, isEnemyActive } = useOpponentStatus();
  const { hasSanctuary } = useSanctuaryActive();
  const levelProgress = useLevelProgress();

  const statusPieces = computeStatusPieces(ancillary);

  // Mirrors RightSidebar's classic-layout treatment: the opponent probe
  // deliberately keeps the label's raw ANSI so a mob's color-coded name
  // renders the same way here as it does in the terminal.
  const enemyLabelHtml = useMemo(
    () => (isEnemyActive ? ansiToHtml(enemyUi.label) : ''),
    [isEnemyActive, enemyUi.label],
  );

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

        {/* Hidden at max level, or until level (login_data) and tnl (char_data) are both known. */}
        {levelProgress.visible && (
          <div
            className={`${styles.gauge} sa-hud-vitals-exp-gauge`}
            title={`Level ${levelProgress.level} — ${levelProgress.tnl?.toLocaleString('en-US')} exp to next level`}
          >
            <span className={styles.gaugeLabel}>EXP</span>
            <div className={styles.track}>
              <div className={`${styles.fill} sa-hud-vitals-fill-exp`} style={{ width: `${levelProgress.pct}%` }} />
            </div>
            <span className={styles.value}>{Math.round(levelProgress.pct)}%</span>
          </div>
        )}
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
          <span className={styles.enemyLabel} dangerouslySetInnerHTML={{ __html: enemyLabelHtml }} />
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
