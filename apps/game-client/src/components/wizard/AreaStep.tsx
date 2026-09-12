// apps/game-client/src/components/wizard/AreaStep.tsx

import React, { useEffect, useMemo, useRef, useState } from 'react';

import styles from '../../styles/AutoLevelingWizard.module.scss';
import type { AutoPilotAreaSummary } from '../../features/autoleveling/autoleveling-content-types';
import {
  areasByContinent,
  areasForLevel,
  areasForLevelRange,
  getAreaIndex,
  hasMeaningfulLevelRange,
  isLevelInRange,
} from '../../features/autoleveling/autoleveling-content';

interface Props {
  selectedSlug: string | null;
  charLevel: number | null;
  onSelect: (slug: string) => void;
  onChooseCustom: () => void;
  customChosen: boolean;
  /** Force-refetch the currently selected area's route/targets past the IndexedDB cache. */
  onRefreshSelected?: () => void;
}

const MAX_LEVEL = 51;
const clampLevel = (n: number) => Math.max(1, Math.min(MAX_LEVEL, Math.round(n)));

type LevelRange = { min: number | null; max: number | null };
const NO_RANGE: LevelRange = { min: null, max: null };
const isGated = (r: LevelRange) => r.min != null || r.max != null;

/** Default gate around a character level — deliberately wide (MUD areas are forgiving). */
function defaultRange(level: number): LevelRange {
  return { min: clampLevel(level - 5), max: clampLevel(level + 5) };
}

export const AreaStep: React.FC<Props> = ({
  selectedSlug,
  charLevel,
  onSelect,
  onChooseCustom,
  customChosen,
  onRefreshSelected,
}) => {
  const [index, setIndex] = useState<AutoPilotAreaSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Level gate: either bound is optional (null = open-ended that side; both null = show all).
  // Seeded from the character level once, then user-owned.
  const [range, setRange] = useState<LevelRange>(NO_RANGE);
  const rangeTouched = useRef(false);
  useEffect(() => {
    if (charLevel != null && !rangeTouched.current) setRange(defaultRange(charLevel));
  }, [charLevel]);

  const setRangeField = (field: 'min' | 'max', raw: string) => {
    rangeTouched.current = true;
    const trimmed = raw.trim();
    const n = Number(trimmed);
    setRange((r) => ({
      ...r,
      [field]: trimmed === '' || !Number.isFinite(n) ? null : clampLevel(n),
    }));
  };

  useEffect(() => {
    let alive = true;
    getAreaIndex()
      .then((areas) => {
        if (!alive) return;
        setIndex(areas);
        if (areas.length === 0) setError('No leveling areas available (is the server reachable?).');
      })
      .catch(() => alive && setError('Could not load leveling areas.'));
    return () => {
      alive = false;
    };
  }, []);

  // Bypasses the 7-day IndexedDB soft cache — for after a content redeploy, so a tester
  // isn't stuck looking at stale routes/targets until the cache naturally expires.
  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const areas = await getAreaIndex({ force: true });
      setIndex(areas);
      if (areas.length === 0) setError('No leveling areas available (is the server reachable?).');
      onRefreshSelected?.();
    } catch {
      setError('Could not refresh leveling areas.');
    } finally {
      setRefreshing(false);
    }
  };

  const levelMatched = useMemo(
    () => new Set(charLevel != null && index ? areasForLevel(index, charLevel).map((a) => a.slug) : []),
    [index, charLevel],
  );

  const groups = useMemo(() => {
    if (!index) return [];
    const q = query.trim().toLowerCase();
    let list = index;
    if (q) list = list.filter((a) => a.areaName.toLowerCase().includes(q) || a.continent.toLowerCase().includes(q));
    if (isGated(range)) list = areasForLevelRange(list, range.min, range.max);
    return areasByContinent(list);
  }, [index, query, range]);

  const totalShown = groups.reduce((n, g) => n + g.areas.length, 0);

  return (
    <div className={styles.stepPanel}>
      <div className={styles.toolbar}>
        <input
          className={styles.input}
          type="text"
          placeholder="Search areas or continents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search areas"
        />
        <button
          type="button"
          className={styles.iconButton}
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh area data"
          title="Re-fetch area data, bypassing the cache"
        >
          {refreshing ? '…' : '⟳'}
        </button>
      </div>

      <div className={styles.rangeBar}>
        <span className={styles.rangeLabel}>Level range</span>
        <input
          className={styles.levelInput}
          type="number"
          min={1}
          max={MAX_LEVEL}
          placeholder="any"
          value={range.min ?? ''}
          onChange={(e) => setRangeField('min', e.target.value)}
          aria-label="Minimum level"
        />
        <span className={styles.rangeDash}>–</span>
        <input
          className={styles.levelInput}
          type="number"
          min={1}
          max={MAX_LEVEL}
          placeholder="any"
          value={range.max ?? ''}
          onChange={(e) => setRangeField('max', e.target.value)}
          aria-label="Maximum level"
        />
        {isGated(range) ? (
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              rangeTouched.current = true;
              setRange(NO_RANGE);
            }}
          >
            show all
          </button>
        ) : (
          charLevel != null && (
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                rangeTouched.current = true;
                setRange(defaultRange(charLevel));
              }}
            >
              around level {charLevel}
            </button>
          )
        )}
        <span className={styles.rangeCount}>{index ? `${totalShown} area${totalShown === 1 ? '' : 's'}` : ''}</span>
      </div>

      {error && <div className={styles.notice}>{error}</div>}
      {!index && !error && <div className={styles.notice}>Loading areas…</div>}

      <div className={styles.areaList}>
        {groups.map((g) => (
          <div key={g.continent} className={styles.areaGroup}>
            <div className={styles.areaGroupTitle}>{g.continent}</div>
            {g.areas.map((a) => {
              const matched = levelMatched.has(a.slug);
              const inBand = charLevel != null && isLevelInRange(a, charLevel);
              return (
                <button
                  key={a.slug}
                  type="button"
                  className={`${styles.areaRow} ${selectedSlug === a.slug ? styles.areaRowSelected : ''} ${
                    matched ? styles.areaRowMatched : ''
                  }`}
                  onClick={() => onSelect(a.slug)}
                  aria-pressed={selectedSlug === a.slug}
                >
                  <span className={styles.areaName}>
                    {a.areaName}
                    {a.isExcellentLevelingArea && <span className={styles.badgeStar} title="Excellent leveling area">★</span>}
                  </span>
                  <span className={styles.areaMeta}>
                    <span className={inBand ? styles.levelInBand : undefined}>
                      {hasMeaningfulLevelRange(a) ? `L${a.levelRange[0]}–${a.levelRange[1]}` : 'level range not set'}
                    </span>
                    <span className={styles.dot}>·</span>
                    {a.stepCount} steps
                    <span className={styles.dot}>·</span>
                    {a.targetCount} target{a.targetCount === 1 ? '' : 's'}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        {index && groups.length === 0 && (
          <div className={styles.notice}>
            No areas {query ? `match “${query}”` : 'in that level range'}
            {isGated(range) ? ' — widen it or “show all”.' : '.'}
          </div>
        )}

        <button
          type="button"
          className={`${styles.areaRow} ${styles.areaRowCustom} ${customChosen ? styles.areaRowSelected : ''}`}
          onClick={onChooseCustom}
          aria-pressed={customChosen}
        >
          <span className={styles.areaName}>Custom path…</span>
          <span className={styles.areaMeta}>Build your own route or import from Mudlet</span>
        </button>
      </div>
    </div>
  );
};
