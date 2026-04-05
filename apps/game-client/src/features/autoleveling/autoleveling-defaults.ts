// apps/game-client/src/features/autoleveling/autoleveling-defaults.ts

/**
 * Autoleveling Defaults
 * ---------------------
 * Intent:
 * - Provide a safe, minimal config that does nothing unless enabled + configured by the user.
 * - Default to enabled=false to avoid accidental automation.
 * - Leave identify/fight steps empty to avoid spam.
 */

import type { AutoLevelConfig } from './autoleveling-types';

/**
 * Kept as a constant so other modules can reference it without importing the full config.
 * NOTE: Must match the version returned by createDefaultAutoLevelConfig().
 */
export const AUTOLEVELING_CONFIG_VERSION = 2;

export function createDefaultAutoLevelConfig(): AutoLevelConfig {
  return {
    version: AUTOLEVELING_CONFIG_VERSION,

    enabled: false,
    loopRounds: true,
    idleTimeoutMs: 1000,
    roundLoopTimeMs: 300_000,
    fightLoopIntervalMs: 2_500,
    moveSettleMs: 600,
    lookSettleMs: 500,
    postFightSettleMs: 2_000,
    fleePk: false,

    init: {
      continentName: null,
      areaName: null,
      continentId: null,
      areaId: null,
      trainingPath: null,

      initiationCommand: null, // UI will show placeholder; engine will default to “kill {name}”
      targets: [],
    },

    steps: {
      trainingPath: null, // currently unused; see autoleveling-types.ts comment

      start: { pre: [], exec: [], post: [] },
      move: { pre: [], exec: [], post: [] },

      // Room scan / pre-fight: exec typically contains a “look” command.
      identify: { pre: [], exec: [], post: [] },

      // fight.pre runs once on engage; fight.exec loops every fightLoopIntervalMs; fight.post runs once on exit.
      fight: { pre: [], exec: [], post: [] },

      // Post-fight: loot, rest, check health — runs after isFighting=false.
      postFight: { pre: [], exec: [], post: [] },

      reset: { endRound: [], wait: [] },
    },
  };
}
