import { useEffect, useId, useRef, useState } from 'react';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';
import { formatOpponentStatusText, type OpponentStatusDetail, type EnemyUiState } from '../features/combat/opponent-types';
import { getEnemyUiSnapshot, setEnemyUiSnapshot } from '../features/combat/opponentStatusStore';

const ENEMY_STALE_MS = 5000;

const DEFAULT_ENEMY_UI: EnemyUiState = {
  lastSeenTs: 0,
  label: 'Enemy',
  pct: 0,
  statusText: '',
};

type DamageChunk = { leftPct: number; widthPct: number; key: number };

export function useOpponentStatus(): {
  enemyUi: EnemyUiState;
  isEnemyActive: boolean;
  damageChunk: DamageChunk | null;
} {
  const instanceId = useId();
  // Seed from opponentStatusStore so a remount — a live theme switch, e.g.
  // — doesn't blank a fight that's still within its staleness window.
  const [enemyUi, setEnemyUi] = useState<EnemyUiState>(() => getEnemyUiSnapshot() ?? DEFAULT_ENEMY_UI);

  const [damageChunk, setDamageChunk] = useState<DamageChunk | null>(null);
  const chunkTimerRef = useRef<number | null>(null);

  // `now` only exists to flip isEnemyActive off 5s after the last opponent line, so the 200 ms clock runs only
  // while an enemy is active. An always-on clock re-rendered every enemy bar five times a second while idle.
  const [now, setNow] = useState(() => Date.now());
  const lastSeenTs = enemyUi.lastSeenTs;
  useEffect(() => {
    if (lastSeenTs <= 0) return;
    // `now` is as old as the last tick, so refresh it before judging a line that may already be stale.
    const start = Date.now();
    setNow(start);
    if (start - lastSeenTs > ENEMY_STALE_MS) return;

    const t = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (tick - lastSeenTs > ENEMY_STALE_MS) window.clearInterval(t);
    }, 200);
    return () => window.clearInterval(t);
  }, [lastSeenTs]);

  useEffect(() => {
    const dispose = ListenEvent<OpponentStatusDetail>(
      'event:fighting:opponent',
      (d) => {
        if (!d || !Number.isFinite(d.pct)) return;

        setEnemyUi((prev) => {
          const prevSeen = prev.lastSeenTs > 0;
          const prevPct = prevSeen ? prev.pct : d.pct;
          const nextPct = d.pct;

          if (nextPct < prevPct) {
            const left = Math.max(0, Math.min(100, nextPct));
            const width = Math.max(0, Math.min(100 - left, prevPct - nextPct));

            if (width > 0.05) {
              setDamageChunk({ leftPct: left, widthPct: width, key: d.ts || Date.now() });

              if (chunkTimerRef.current) window.clearTimeout(chunkTimerRef.current);
              chunkTimerRef.current = window.setTimeout(() => setDamageChunk(null), 4500);
            }
          }

          const next: EnemyUiState = {
            lastSeenTs: d.ts || Date.now(),
            label: d.label?.trim() || prev.label || 'Enemy',
            pct: nextPct,
            statusText: formatOpponentStatusText(d.pct, d.minPct, d.maxPct),
          };
          setEnemyUiSnapshot(next);
          return next;
        });
      },
      { key: `useOpponentStatus::event:fighting:opponent::${instanceId}` },
    );

    return () => {
      try {
        dispose?.();
      } catch {
        // ignore
      }
      if (chunkTimerRef.current) window.clearTimeout(chunkTimerRef.current);
    };
  }, [instanceId]);

  const isEnemyActive = enemyUi.lastSeenTs > 0 && now - enemyUi.lastSeenTs <= ENEMY_STALE_MS;

  useEffect(() => {
    if (!isEnemyActive && damageChunk) setDamageChunk(null);
  }, [isEnemyActive, damageChunk]);

  return { enemyUi, isEnemyActive, damageChunk };
}
