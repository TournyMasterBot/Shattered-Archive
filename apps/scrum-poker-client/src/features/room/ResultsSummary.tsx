import type { RoomSettings, RoomStats } from '@shatteredarchive/scrum-poker-core';

/**
 * Post-reveal numbers. Average and median are each behind their own room setting because a
 * team that has agreed to use one of them does not want the other quietly arguing with it.
 * Both are null when nobody picked a numeric card (an all-`?` round), in which case the stat
 * is omitted rather than shown as a zero.
 */
export default function ResultsSummary({ stats, settings }: { stats: RoomStats; settings: RoomSettings }) {
  const showAverage = settings.showAverage && stats.average !== null;
  const showMedian = settings.showMedian && stats.median !== null;

  return (
    <div className="sp-summary">
      {showAverage && (
        <div className="sp-stat">
          <span className="sp-stat-label">Average</span>
          <span className="sp-stat-value">{stats.average}</span>
        </div>
      )}
      {showMedian && (
        <div className="sp-stat">
          <span className="sp-stat-label">Median</span>
          <span className="sp-stat-value">{stats.median}</span>
        </div>
      )}
      {stats.consensus && <span className="sp-consensus">Consensus</span>}

      <div className="sp-distribution">
        {stats.distribution.map((tally) => (
          <span key={tally.card} className="sp-distribution-chip">
            {tally.card}
            <b>×{tally.count}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
