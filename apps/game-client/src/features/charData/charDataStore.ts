// apps/game-client/src/features/charData/charDataStore.ts
// Mirrors features/room/roomDataStore.ts's pattern: a plain module-level
// cache of the last GMCP char_data, so a hook that mounts AFTER the last
// event (a live theme switch remounting the shell it lives in, a reload
// with data already flowing) can seed its initial state from it instead of
// showing 0/0 vitals until the next update.
import type { CharDataAncillary, CharDataVitals } from '../../hooks/useCharData';

type CharDataSnapshot = {
  vitals: CharDataVitals;
  ancillary: CharDataAncillary;
};

let lastCharData: CharDataSnapshot | null = null;

export function setCharData(snapshot: CharDataSnapshot): void {
  lastCharData = snapshot;
}

export function getCharData(): CharDataSnapshot | null {
  return lastCharData;
}

/** Test-only escape hatch — clears the cache between test cases so seeding
 * assertions in one test can't leak into another (shared module state). */
export function __resetForTests(): void {
  lastCharData = null;
}
