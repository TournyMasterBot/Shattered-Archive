// apps/game-client/src/features/combat/opponent-types.ts
export type OpponentStatusDetail = {
  ts: number;
  label?: string;
  pct: number; // estimated percent for the UI bar
  minPct: number; // inclusive lower bound
  maxPct: number; // EXCLUSIVE upper bound for ranged buckets (e.g. 30 means "< 30"); use 100 for "< 100"
  statusText: string; // what to show in the UI value slot
};

export type EnemyUiState = {
  lastSeenTs: number;
  label: string;
  pct: number;
  statusText: string;
};

// (You can keep these; RightSidebar won't use opacity anymore)
const ENEMY_FADE_IN_MS = 350;
const ENEMY_HOLD_MS = 4500;
const ENEMY_FADE_OUT_MS = 1800;

function clamp01(n: number) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function computeEnemyOpacity(ageMs: number): number {
  if (ageMs < 0) return 0;
  if (ageMs < ENEMY_FADE_IN_MS) return clamp01(ageMs / ENEMY_FADE_IN_MS);

  const tHoldEnd = ENEMY_FADE_IN_MS + ENEMY_HOLD_MS;
  if (ageMs < tHoldEnd) return 1;

  const tOut = ageMs - tHoldEnd;
  if (tOut < ENEMY_FADE_OUT_MS) return clamp01(1 - tOut / ENEMY_FADE_OUT_MS);

  return 0;
}

export function enemyColorClass(stylesObj: Record<string, string>, pct: number): string {
  if (pct >= 75) return stylesObj.enemyGreen;
  if (pct >= 50) return stylesObj.enemyYellow;
  if (pct >= 30) return stylesObj.enemyRedOrange;
  if (pct >= 15) return stylesObj.enemyBurnishedRed;
  return stylesObj.enemyBrightRed;
}

// Optional convenience: use this from your emitter to avoid incorrect strings.
export function formatOpponentStatusText(_estPct: number, minPct: number, maxPct: number): string {
  // "100%" bucket
  if (minPct === 100 && maxPct === 100) return `100%`;
  // Range bucket (max is exclusive)
  return `(${minPct}%–${maxPct}%)`;
}
