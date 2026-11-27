// apps/game-client/src/features/autoleveling/autoleveling-row-text.ts

/**
 * The options a buff or fight row carries beyond its command, in words for the Review step. Only the options added on 2026-11-18
 * (combat state, enemy condition, retry): the older gates have their own wording there.
 */

import { bandLabel } from './autoleveling-enemy-condition';
import type { AutoLevelCombatState, AutoLevelEnemyGate } from './autoleveling-types';

export const COMBAT_STATE_TEXT: Record<AutoLevelCombatState, string> = {
  in: 'only in combat',
  out: 'only out of combat',
};

/** "only when the enemy is below "has quite a few wounds (about 50%)"". */
export function enemyGateText(gate: AutoLevelEnemyGate): string {
  return `only when the enemy is ${gate.op} "${bandLabel(gate.band)}"`;
}

/** The words for a row's new options, in a fixed order; empty when it carries none. */
export function describeRowOptions(row: { combatState?: AutoLevelCombatState; enemyGate?: AutoLevelEnemyGate; retryUntilSet?: false }): string[] {
  const out: string[] = [];
  if (row.combatState) out.push(COMBAT_STATE_TEXT[row.combatState]);
  if (row.enemyGate) out.push(enemyGateText(row.enemyGate));
  if (row.retryUntilSet === false) out.push('no retry');
  return out;
}
