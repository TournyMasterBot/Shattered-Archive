import { useEffect, useId, useRef, useState } from 'react';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';
import { formatOpponentStatusText, type OpponentStatusDetail, type EnemyUiState } from '../features/combat/opponent-types';

const ENEMY_STALE_MS = 5000;

type DamageChunk = { leftPct: number; widthPct: number; key: number };

export function useOpponentStatus(): {
  enemyUi: EnemyUiState;
  isEnemyActive: boolean;
  damageChunk: DamageChunk | null;
} {
  const instanceId = useId();
  const [enemyUi, setEnemyUi] = useState<EnemyUiState>({
    lastSeenTs: 0,
    label: 'Enemy',
    pct: 0,
    statusText: '',
  });

  const [damageChunk, setDamageChunk] = useState<DamageChunk | null>(null);
  const chunkTimerRef = useRef<number | null>(null);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, []);

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

          return {
            lastSeenTs: d.ts || Date.now(),
            label: d.label?.trim() || prev.label || 'Enemy',
            pct: nextPct,
            statusText: formatOpponentStatusText(d.pct, d.minPct, d.maxPct),
          };
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
