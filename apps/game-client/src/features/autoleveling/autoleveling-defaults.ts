// apps/game-client/src/features/autoleveling/autoleveling-defaults.ts

import type { AutoLevelConfig } from './autoleveling-types';

export function createDefaultAutoLevelConfig(): AutoLevelConfig {
  return {
    version: 2,

    enabled: false,
    loopRounds: true,
    idleTimeoutMs: 30000,
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
      trainingPath: null,

      start: { pre: [], exec: [], post: [] },
      move: { pre: [], exec: [], post: [] },

      // If you want: [{ kind:'send', cmd:'look' }] but keeping empty by default avoids spam.
      identify: { pre: [], exec: [], post: [] },

      // Optional “after engage” actions; default empty.
      fight: { pre: [], exec: [], post: [] },

      reset: { endRound: [], wait: [] },
    },
  };
}
