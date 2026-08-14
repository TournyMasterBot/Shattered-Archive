import { findRole } from './roleCatalog.js';
import type { RoomState } from './types.js';

export const UMBRASEER_BLOCKED_MESSAGE = 'Umbral forces block your sight';

/**
 * Optional house rule (`RoomSettings.darkshieldBlocksUmbraseer`, off by default): if the
 * Darkshield's protection target for a given night turns out to be Assassin-aligned, the
 * Umbraseer's sight is blocked that same night regardless of who they actually checked — meant
 * for small games that otherwise resolve too quickly, per the rules' own "Recommendations"
 * section on adding twists. Live-derived rather than baked into the stored check entry, so a
 * role reassignment or a settings toggle is reflected consistently everywhere it's displayed.
 */
export function isUmbraseerBlocked(state: RoomState, day: number): boolean {
  if (!state.settings.darkshieldBlocksUmbraseer) return false;

  const protectEntry = state.timeline.find((e) => e.kind === 'night-protect' && e.day === day);
  if (!protectEntry || protectEntry.kind !== 'night-protect') return false;

  const protectedPlayer = state.players.find((p) => p.id === protectEntry.targetId);
  const role = findRole(state.roles, protectedPlayer?.roleId);
  return role?.alignment === 'assassin';
}
