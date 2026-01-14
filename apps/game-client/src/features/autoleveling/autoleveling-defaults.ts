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

export function createDefaultAutoLevelConfig(): AutoLevelConfig {
  return {
    version: 2,

    enabled: false,
    loopRounds: true,
    idleTimeoutMs: 1000,
    roundLoopTimeMs: 300_000,
    fleePk: false,

    init: {
      continentName: null,
      areaName: null,
      continentId: null,
      areaId: null,
      trainingPath: null,

      initiationCommand: null, // UI will show placeholder; engine will default to "kill {name}"
      targets: [],
    },

    steps: {
      trainingPath: null, // currently unused; see autoleveling-types.ts comment

      start: { pre: [], exec: [], post: [] },
      move: { pre: [], exec: [], post: [] },

      identify: { pre: [], exec: [], post: [] },

      // Optional “after engage” actions; default empty.
      fight: { pre: [], exec: [], post: [] },

      reset: { endRound: [], wait: [] },
    },
  };
}
