// apps/game-client/src/components/AffectsBlock.tsx
import React, { useEffect, useMemo, useState } from 'react';
import styles from '../styles/LayoutShell.module.scss';
import { useAffectsBlock } from '../hooks/useAffectsBlock';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';
import type { GourdEntry } from '../features/plugins/core-plugins/gourd.plugin';

type AffectsUiSettings = {
  showTime: boolean;
  showAggregates: boolean;
  showAffects: boolean;
};

const STORAGE_KEY = 'shatteredarchive.ui.affectsBlock';

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

function getDurationClass(d: number): string {
  if (d <= 0) return styles.affectDurationRed;
  if (d === 1) return styles.affectDurationYellow;
  return '';
}

export const AffectsBlock: React.FC = () => {
  const { affects, timeOfDay } = useAffectsBlock();

  const [menuOpen, setMenuOpen] = useState(false);
  const [ui, setUi] = useState<AffectsUiSettings>(() => loadSettings());

  // Gourd plugin state
  const [gourdActive, setGourdActive] = useState(false);
  const [gourds, setGourds] = useState<GourdEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'affects' | 'gourds'>('affects');

  useEffect(() => {
    saveSettings(ui);
  }, [ui]);

  // Listen for gourd plugin events
  useEffect(() => {
    const offActive = ListenEvent<{ active: boolean }>(
      'plugin:gourd:active',
      ({ active }) => {
        setGourdActive(active);
        if (!active) {
          setGourds([]);
          setActiveTab('affects');
        }
      },
      { key: 'AffectsBlock:plugin:gourd:active' },
    );

    const offList = ListenEvent<{ list: GourdEntry[] }>(
      'plugin:gourd:list-updated',
      ({ list }) => {
        setGourds(Array.isArray(list) ? list : []);
      },
      { key: 'AffectsBlock:plugin:gourd:list-updated' },
    );

    return () => {
      offActive();
      offList();
    };
  }, []);

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
      {/* ── Tab bar (only when gourd plugin is active) ── */}
      {gourdActive && (
        <div className={styles.affectsTabBar}>
          <button
            type="button"
            className={`${styles.affectsTab} ${activeTab === 'affects' ? styles.affectsTabActive : ''}`}
            onClick={() => setActiveTab('affects')}
          >
            Affects
          </button>
          <button
            type="button"
            className={`${styles.affectsTab} ${activeTab === 'gourds' ? styles.affectsTabActive : ''}`}
            onClick={() => setActiveTab('gourds')}
          >
            Gourds
            {gourds.length > 0 && <span className={styles.affectsTabBadge}>{gourds.length}</span>}
          </button>
        </div>
      )}

      {/* ── Affects panel ── */}
      {activeTab === 'affects' && (
        <>
          <div className={styles.affectsHeader}>
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

            <div className={styles.affectsTitle}>Affects Summary</div>
            <div className={styles.affectsTime}>{ui.showTime ? timeOfDay : ''}</div>
          </div>

          <div className={styles.affectsScroll}>
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

            {ui.showAffects && (
              <>
                {affects.length === 0 && <div className={styles.affectEmpty}>No active affects.</div>}

                {affects.map((a) => {
                  const durationClass = getDurationClass(a.d);

                  return (
                    <div key={`${a.n}|${a.lc}|${a.m}|${a.t}|${a.d}`} className={styles.affectItem}>
                      <div className={styles.affectName}>
                        {a.n}{' '}
                        <span
                          className={durationClass}
                          data-duration-class={durationClass || 'none'}
                          style={{ opacity: 0.7 }}
                        >
                          ({a.d})
                        </span>
                      </div>

                      {(a.lc && a.lc !== 'none') || a.m !== 0 ? (
                        <div className={styles.affectDetails}>
                          {a.lc && a.lc !== 'none' ? `${a.lc}: ` : ''}
                          {a.m}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Gourds panel ── */}
      {activeTab === 'gourds' && (
        <>
          <div className={styles.affectsHeader}>
            <div className={styles.affectsTitle}>Gourd List</div>
            <div className={styles.affectsTime}>
              {gourds.length} gourd{gourds.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div className={styles.affectsScroll}>
            {gourds.length === 0 ? (
              <div className={styles.affectEmpty}>
                No gourds tracked. Type <code>scan gourds</code> to populate.
              </div>
            ) : (
              gourds.map((g, i) => (
                <div key={`${g.name}|${g.nameIndex}`} className={styles.gourdItem}>
                  <div className={styles.gourdNumber}>#{i + 1}</div>
                  <div className={styles.gourdInfo}>
                    <div className={styles.gourdName}>
                      {g.nameIndex}.{g.name}
                    </div>
                    <div className={styles.gourdSpells}>{g.spells.join(', ')}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AffectsBlock;
