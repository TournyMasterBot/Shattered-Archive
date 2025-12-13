// apps/game-client/src/components/AffectsBlock.tsx
import React from 'react';
import styles from '../styles/LayoutShell.module.scss';
import { useAffectsBlock } from '../hooks/useAffectsBlock';

export const AffectsBlock: React.FC = () => {
  const { affects, timeOfDay } = useAffectsBlock();

  return (
    <div className={styles.affectsBlock}>
      <div className={styles.affectsHeader}>
        <div className={styles.affectsTime}>{timeOfDay}</div>
        <div className={styles.affectsTitle}>Affects Summary</div>
      </div>

      <div className={styles.affectsScroll}>
        {affects.length === 0 && <div className={styles.affectEmpty}>No active affects.</div>}

        {affects.map((a) => (
          <div key={`${a.n}|${a.lc}|${a.m}|${a.t}`} className={styles.affectItem}>
            <div className={styles.affectName}>
              {a.n} <span style={{ opacity: 0.7 }}>({a.d})</span>
            </div>

            {/* Optional details line */}
            {(a.lc && a.lc !== 'none') || a.m !== 0 ? (
              <div className={styles.affectDetails}>
                {a.lc && a.lc !== 'none' ? `${a.lc}: ` : ''}
                {a.m}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AffectsBlock;
