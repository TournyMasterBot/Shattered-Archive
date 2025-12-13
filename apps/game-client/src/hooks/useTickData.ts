import { useEffect, useState } from 'react';

const DEFAULT_TICK_DURATION = 41;

// Shared timestamp across all hook instances
let lastTickAt: number | null = null;

export interface TickData {
  timeOfDay: string;
  remaining: number;
}

/**
 * Core GMCP tick hook.
 *
 * - Listens for `game:tick` CustomEvents (dispatched in useGameConnection).
 * - On each GMCP tick:
 *    - updates the in-game time string (e.g. "9:30pm")
 *    - records when the tick arrived (lastTickAt)
 *    - snaps the countdown back to `durationSec`
 * - Uses a small interval to derive the remaining seconds from lastTickAt.
 */
export function useTickData(durationSec: number = DEFAULT_TICK_DURATION): TickData {
  const [timeOfDay, setTimeOfDay] = useState<string>('--:--');
  const [remaining, setRemaining] = useState<number>(durationSec);

  useEffect(() => {
    const handleTick = (ev: Event) => {
      const custom = ev as CustomEvent<any>;
      const data = custom.detail || {};

      const raw = typeof data.time === 'string' ? data.time.trim() : '';
      if (raw) {
        setTimeOfDay(raw);
      }

      // Mark when this tick hit the client and reset countdown
      lastTickAt = Date.now();
      setRemaining(durationSec);

      // Debug: confirm this fires on each GMCP tick
      console.log('[useTickData] game:tick → reset countdown', {
        raw,
        lastTickAt,
        durationSec,
      });
    };

    window.addEventListener('game:tick', handleTick as EventListener);

    const id = window.setInterval(() => {
      if (lastTickAt == null) return;

      const elapsedSec = (Date.now() - lastTickAt) / 1000;
      const next = durationSec - elapsedSec;

      const clamped = Math.max(0, Math.min(durationSec, Math.round(next)));

      setRemaining((prev) => (prev !== clamped ? clamped : prev));
    }, 250); // ~4 times per second

    return () => {
      window.removeEventListener('game:tick', handleTick as EventListener);
      window.clearInterval(id);
    };
  }, [durationSec]);

  return { timeOfDay, remaining };
}
