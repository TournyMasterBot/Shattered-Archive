// apps/game-client/src/hooks/useCompassBlock.ts
import { useEffect, useMemo, useState } from 'react';

export type CompassDirection = 'NW' | 'N' | 'NE' | 'W' | 'E' | 'SW' | 'S' | 'SE' | 'U' | 'D';

export type RoomDataPayload = {
  room?: string;
  sector?: string;
  exits?: string[];
};

function normalizeExit(x: string): CompassDirection | null {
  const v = String(x ?? '')
    .trim()
    .toUpperCase();

  // short forms
  if (v === 'N') return 'N';
  if (v === 'S') return 'S';
  if (v === 'E') return 'E';
  if (v === 'W') return 'W';
  if (v === 'NE') return 'NE';
  if (v === 'NW') return 'NW';
  if (v === 'SE') return 'SE';
  if (v === 'SW') return 'SW';
  if (v === 'U' || v === 'UP') return 'U';
  if (v === 'D' || v === 'DOWN') return 'D';

  // long forms (just in case)
  if (v === 'NORTH') return 'N';
  if (v === 'SOUTH') return 'S';
  if (v === 'EAST') return 'E';
  if (v === 'WEST') return 'W';
  if (v === 'NORTHEAST') return 'NE';
  if (v === 'NORTHWEST') return 'NW';
  if (v === 'SOUTHEAST') return 'SE';
  if (v === 'SOUTHWEST') return 'SW';

  return null;
}

export function useCompassBlock() {
  const [exitSet, setExitSet] = useState<Set<CompassDirection>>(() => new Set());

  useEffect(() => {
    const onRoomData = (ev: Event) => {
      const ce = ev as CustomEvent<RoomDataPayload>;
      const exits = Array.isArray(ce.detail?.exits) ? ce.detail.exits : [];

      console.log('[useCompassBlock] room exits:', exits);

      const next = new Set<CompassDirection>();
      for (const e of exits) {
        const dir = normalizeExit(e);
        if (dir) next.add(dir);
      }

      setExitSet(next);
    };

    window.addEventListener('game:room-data', onRoomData as EventListener);
    return () => window.removeEventListener('game:room-data', onRoomData as EventListener);
  }, []);

  const hasExit = useMemo(() => (dir: CompassDirection) => exitSet.has(dir), [exitSet]);

  return { hasExit };
}
