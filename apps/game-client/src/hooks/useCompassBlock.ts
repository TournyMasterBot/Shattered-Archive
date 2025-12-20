// apps/game-client/src/hooks/useCompassBlock.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getRoomData, setRoomData } from '../features/room/roomDataStore';

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

  if (v === 'N' || v === 'NORTH') return 'N';
  if (v === 'S' || v === 'SOUTH') return 'S';
  if (v === 'E' || v === 'EAST') return 'E';
  if (v === 'W' || v === 'WEST') return 'W';
  if (v === 'NE' || v === 'NORTHEAST') return 'NE';
  if (v === 'NW' || v === 'NORTHWEST') return 'NW';
  if (v === 'SE' || v === 'SOUTHEAST') return 'SE';
  if (v === 'SW' || v === 'SOUTHWEST') return 'SW';
  if (v === 'U' || v === 'UP') return 'U';
  if (v === 'D' || v === 'DOWN') return 'D';

  return null;
}

const DIR_TO_COMMAND: Record<CompassDirection, string> = {
  N: 'n',
  S: 's',
  E: 'e',
  W: 'w',
  NE: 'ne',
  NW: 'nw',
  SE: 'se',
  SW: 'sw',
  U: 'u',
  D: 'd',
};

function exitsToSet(exits: unknown): Set<CompassDirection> {
  const list = Array.isArray(exits) ? exits : [];
  const next = new Set<CompassDirection>();

  for (const e of list) {
    const dir = normalizeExit(String(e));
    if (dir) next.add(dir);
  }

  return next;
}

export function useCompassBlock() {
  // Seed from roomDataStore so tab switching keeps exits
  const [exitSet, setExitSet] = useState<Set<CompassDirection>>(() => {
    const cached = getRoomData();
    return exitsToSet(cached?.exits);
  });

  const pendingMoveRef = useRef<CompassDirection | null>(null);
  const pendingTimerRef = useRef<number | null>(null);

  /* ---------------------------------------------
   * Room exit updates
   * ------------------------------------------- */
  useEffect(() => {
    const onRoomData = (ev: Event) => {
      const ce = ev as CustomEvent<RoomDataPayload>;
      const payload = ce.detail ?? {};

      // Update global cache
      setRoomData(payload);

      // Update local state
      setExitSet(exitsToSet(payload.exits));

      // Movement succeeded if room changed
      if (pendingMoveRef.current) {
        window.dispatchEvent(
          new CustomEvent('game:movement-succeeded', {
            detail: { direction: pendingMoveRef.current },
          }),
        );

        pendingMoveRef.current = null;
        if (pendingTimerRef.current) {
          window.clearTimeout(pendingTimerRef.current);
          pendingTimerRef.current = null;
        }
      }
    };

    window.addEventListener('game:room-data', onRoomData as EventListener);
    return () => window.removeEventListener('game:room-data', onRoomData as EventListener);
  }, []);

  /* ---------------------------------------------
   * Movement attempt
   * ------------------------------------------- */
  const move = useCallback((dir: CompassDirection) => {
    const cmd = DIR_TO_COMMAND[dir];
    if (!cmd) return;

    pendingMoveRef.current = dir;

    window.dispatchEvent(
      new CustomEvent('game:send-command', {
        detail: { cmd },
      }),
    );

    if (pendingTimerRef.current) {
      window.clearTimeout(pendingTimerRef.current);
    }

    pendingTimerRef.current = window.setTimeout(() => {
      if (pendingMoveRef.current === dir) {
        window.dispatchEvent(
          new CustomEvent('game:movement-failed', {
            detail: { direction: dir },
          }),
        );
        pendingMoveRef.current = null;
      }
    }, 1200);
  }, []);

  const hasExit = useMemo(() => (dir: CompassDirection) => exitSet.has(dir), [exitSet]);

  return {
    hasExit,
    move,
  };
}
