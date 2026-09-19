// apps/game-client/src/features/autoleveling/autoleveling-alignment.ts

/**
 * Alignment XP modifier
 * ---------------------
 * DSL customized the stock merc XP formula: killing a mob of the OPPOSITE
 * alignment is worth 2×, the SAME alignment 0.5×, and anything involving a
 * neutral (on either side) is 1×. The engine uses this only to normalize its
 * rolling "XP per kill" estimate (see autoleveling-engine `trackToNextLevel`):
 * each observed `tnl` drop is divided by the modifier to get a base figure, then
 * the modifier is re-applied for the prediction. Player alignment isn't in GMCP,
 * so the wizard captures it; unknown → neutral → no correction.
 */

import type { AutoLevelAlignment } from './autoleveling-types';

export function alignmentXpModifier(
  player?: AutoLevelAlignment | null,
  target?: AutoLevelAlignment | null,
): number {
  const p = player ?? 'neutral';
  const t = target ?? 'neutral';
  if (p === 'neutral' || t === 'neutral') return 1;
  return p === t ? 0.5 : 2;
}
