// apps/game-client/src/features/movement/classifyMovement.ts
//
// Single shared movement classifier, replacing the two independently-drifted copies that
// used to live in useCompassBlock.ts (normalizeExit) and autoleveling-engine.ts
// (isMovementCommand/MOVE_DIRS) — see .ai-plans/20260813-1325-movement-tracking-fix.md.

/**
 * Corpus-verified real movement tokens (30-day + historical DSL MUD sweep, see the
 * movement-tracking-fix plan's Context). autoleveling-engine.ts's old MOVE_DIRS also
 * carried the full-word "up"/"down" forms as accepted standalone commands — the live
 * corpus never once sent them as a bare command, so they're dropped here rather than
 * silently kept as dead-but-harmless entries.
 */
export const MOVE_DIRS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd']);

export type CompassDirection = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' | 'U' | 'D';

export const DIR_TO_COMMAND: Record<CompassDirection, string> = {
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

/**
 * Classifies an already-split single command (never a raw `;`-stacked line — callers
 * split on `;` before classifying) as a movement command or not. Checks only the FIRST
 * whitespace-separated token, matching how a real move is actually sent to the MUD
 * (e.g. a compound like "open door" is not a move; "n" is). Returns the canonical
 * lowercase direction token used on the wire — no long-form ("north") fallback, since
 * the corpus confirms real sends never use one.
 */
export function classifyMovement(cmd: string): { isMove: boolean; dir?: string } {
  const trimmed = String(cmd ?? '').trim();
  if (!trimmed) return { isMove: false };
  const first = trimmed.split(/\s+/)[0]?.toLowerCase() ?? '';
  if (MOVE_DIRS.has(first)) return { isMove: true, dir: first };
  return { isMove: false };
}

/**
 * Normalizes an exit/direction spelling — short ("n"), long ("north"), or already
 * uppercase compass form — to the uppercase CompassDirection the compass UI renders, or
 * null if unrecognized. Used for GMCP room_data exit lists and movement-attempt payloads,
 * which (unlike outbound sends) can legitimately arrive in long form.
 */
export function normalizeExit(x: string): CompassDirection | null {
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

/** Converts a GMCP room_data exits array into a set of normalized CompassDirection values. */
export function exitsToSet(exits: unknown): Set<CompassDirection> {
  const list = Array.isArray(exits) ? exits : [];
  const next = new Set<CompassDirection>();

  for (const e of list) {
    const dir = normalizeExit(String(e));
    if (dir) next.add(dir);
  }

  return next;
}
