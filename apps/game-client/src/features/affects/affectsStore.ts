// apps/game-client/src/features/affects/affectsStore.ts
// Mirrors features/room/roomDataStore.ts's pattern: a plain module-level
// cache of the current normalized affects list (written by useAffectsBlock,
// which already computes it), so a hook that mounts AFTER the last update —
// a live theme switch remounting the shell it lives in — can seed from it
// instead of starting blank until the next game:affects-* event.
import type { AffectData } from '@shatteredarchive/types-global';

let lastAffects: AffectData[] = [];

export function setAffects(affects: AffectData[]): void {
  lastAffects = affects;
}

export function getAffects(): AffectData[] {
  return lastAffects;
}

/** Test-only escape hatch — clears the cache between test cases so seeding
 * assertions in one test can't leak into another (shared module state). */
export function __resetForTests(): void {
  lastAffects = [];
}
