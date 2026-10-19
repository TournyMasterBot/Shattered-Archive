// apps/game-client/src/features/combat/opponentStatusStore.ts
// Mirrors features/room/roomDataStore.ts's pattern: a plain module-level
// cache of the last enemy status, so a hook that mounts AFTER the last
// event — a live theme switch remounting the shell it lives in — can seed
// from it instead of showing a blank "Enemy 0%" bar. Caching the full
// EnemyUiState (lastSeenTs included) is enough on its own: isEnemyActive is
// always DERIVED fresh from lastSeenTs vs. the current clock, so a recently
// (but not currently) active fight correctly stays "active" across the
// remount rather than needing its own separate staleness bookkeeping.
import type { EnemyUiState } from './opponent-types';

let lastEnemyUi: EnemyUiState | null = null;

export function setEnemyUiSnapshot(enemyUi: EnemyUiState): void {
  lastEnemyUi = enemyUi;
}

export function getEnemyUiSnapshot(): EnemyUiState | null {
  return lastEnemyUi;
}

/** Test-only escape hatch — clears the cache between test cases so seeding
 * assertions in one test can't leak into another (shared module state). */
export function __resetForTests(): void {
  lastEnemyUi = null;
}
