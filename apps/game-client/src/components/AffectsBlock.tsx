import React, { useEffect, useMemo, useState } from 'react';
import styles from '../styles/LayoutShell.module.scss';
import { useAffectsBlock } from '../hooks/useAffectsBlock';

type AffectsUiSettings = {
  showTime: boolean;
  showAggregates: boolean;
  showAffects: boolean;
};

const STORAGE_KEY = 'sa.ui.affectsBlock';

function loadSettings(): AffectsUiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { showTime: true, showAggregates: true, showAffects: true };
    const parsed = JSON.parse(raw) as Partial<AffectsUiSettings>;
    return {
      showTime: parsed.showTime ?? true,
      showAggregates: parsed.showAggregates ?? true,
      showAffects: parsed.showAffects ?? true,
    };
  } catch {
    return { showTime: true, showAggregates: true, showAffects: true };
  }
}

function saveSettings(s: AffectsUiSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export const AffectsBlock: React.FC = () => {
  const { affects, timeOfDay } = useAffectsBlock();

  const [menuOpen, setMenuOpen] = useState(false);
  const [ui, setUi] = useState<AffectsUiSettings>(() => loadSettings());

  useEffect(() => {
    saveSettings(ui);
  }, [ui]);

  // Group by location only; sum modifiers; do NOT sum durations.
  const aggregates = useMemo(() => {
    const map = new Map<string, { lc: string; sumM: number; count: number }>();

    for (const a of affects) {
      const lc = a.lc && a.lc !== 'none' ? a.lc : 'none';
      const cur = map.get(lc);
      if (cur) {
        cur.sumM += a.m;
        cur.count += 1;
      } else {
        map.set(lc, { lc, sumM: a.m, count: 1 });
      }
    }

    // Sort: largest absolute modifier first, then location name
    return Array.from(map.values()).sort((x, y) => {
      const ax = Math.abs(x.sumM);
      const ay = Math.abs(y.sumM);
      if (ay !== ax) return ay - ax;
      return x.lc.localeCompare(y.lc);
    });
  }, [affects]);

  const toggle = (key: keyof AffectsUiSettings) => {
    setUi((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className={styles.affectsBlock}>
      <div className={styles.affectsHeader}>
        {/* Left: gear + menu */}
        <div className={styles.affectsMenuWrap}>
          <button
            type="button"
            className={styles.affectsGearButton}
            aria-label="Affects display settings"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            ⚙
          </button>

          {menuOpen && (
            <div className={styles.affectsMenuPanel} role="menu">
              <button
                type="button"
                className={styles.affectsMenuRow}
                role="menuitem"
                onClick={() => toggle('showTime')}
              >
                <span className={`${styles.affectsMenuDot} ${ui.showTime ? styles.affectsMenuDotOn : ''}`} />
                <span>Time</span>
              </button>

              <button
                type="button"
                className={styles.affectsMenuRow}
                role="menuitem"
                onClick={() => toggle('showAggregates')}
              >
                <span className={`${styles.affectsMenuDot} ${ui.showAggregates ? styles.affectsMenuDotOn : ''}`} />
                <span>Aggregates</span>
              </button>

              <button
                type="button"
                className={styles.affectsMenuRow}
                role="menuitem"
                onClick={() => toggle('showAffects')}
              >
                <span className={`${styles.affectsMenuDot} ${ui.showAffects ? styles.affectsMenuDotOn : ''}`} />
                <span>Affects</span>
              </button>
            </div>
          )}
        </div>

        {/* Middle: title */}
        <div className={styles.affectsTitle}>Affects Summary</div>

        {/* Right: time (optional) */}
        <div className={styles.affectsTime}>{ui.showTime ? timeOfDay : ''}</div>
      </div>

      <div className={styles.affectsScroll}>
        {/* Aggregates at top */}
        {ui.showAggregates && aggregates.length > 0 && (
          <div className={styles.affectsAggregatesSection}>
            {aggregates.map((g) => (
              <div key={`agg|${g.lc}`} className={styles.affectsAggregateRow}>
                <div className={styles.affectsAggregateLeft}>
                  <span className={styles.affectsAggregateLoc}>{g.lc}</span>
                  {g.count > 1 ? <span className={styles.affectsAggregateCount}>({g.count}x)</span> : null}
                </div>
                <span className={styles.affectsAggregateText}>{g.sumM}</span>
              </div>
            ))}
          </div>
        )}

        {/* Affects list */}
        {ui.showAffects && (
          <>
            {affects.length === 0 && <div className={styles.affectEmpty}>No active affects.</div>}

            {affects.map((a) => (
              <div key={`${a.n}|${a.lc}|${a.m}|${a.t}|${a.d}`} className={styles.affectItem}>
                <div className={styles.affectName}>
                  {a.n} <span style={{ opacity: 0.7 }}>({a.d})</span>
                </div>

                {(a.lc && a.lc !== 'none') || a.m !== 0 ? (
                  <div className={styles.affectDetails}>
                    {a.lc && a.lc !== 'none' ? `${a.lc}: ` : ''}
                    {a.m}
                  </div>
                ) : null}
              </div>
            ))}
          </>
        )}

        {/* If both are hidden, just keep the scroll area empty (space reserved). */}
      </div>
    </div>
  );
};

export default AffectsBlock;
