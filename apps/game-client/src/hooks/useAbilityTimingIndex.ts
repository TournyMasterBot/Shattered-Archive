// apps/game-client/src/hooks/useAbilityTimingIndex.ts

import { useEffect, useRef, type MutableRefObject } from 'react';

import { getClassCatalogCached } from '../features/autoleveling/autoleveling-classes';
import { buildTimingIndex, type TimingIndex } from '../features/autoleveling/autoleveling-lag';

/**
 * The server's ability timing (the class feed's `lagMs` and `durationTicks`) as an index by ability name, read from the class catalog cached on this device.
 * A ref, not state: the autopilot engine reads it when it needs it. Never blocks anything: until the catalog is read (or when it is empty or cannot be read)
 * the ref holds null and every lag is unknown, so the engine keeps what it learns itself. Nothing is written after the component unmounts.
 */
export function useAbilityTimingIndex(connectionId: string): MutableRefObject<TimingIndex | null> {
  const ref = useRef<TimingIndex | null>(null);
  useEffect(() => {
    let alive = true;
    void getClassCatalogCached()
      .then((classes) => {
        if (alive) ref.current = buildTimingIndex(classes);
      })
      .catch(() => {
        console.warn('[autoleveling][hook]', 'could not read the class catalog for ability timing');
      });
    return () => {
      alive = false;
    };
  }, [connectionId]);
  return ref;
}
