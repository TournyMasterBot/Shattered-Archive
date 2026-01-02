import type { AutoLevelConfig } from './autoleveling-types';

export const AUTOLEVELING_CONFIG_VERSION = 1;

export function createDefaultAutoLevelConfig(): AutoLevelConfig {
  return {
    version: AUTOLEVELING_CONFIG_VERSION,

    enabled: false,
    loopRounds: false,
    idleTimeoutMs: 30000,
    fleePk: false,

    init: {
      continentId: null,
      areaId: null,
      trainingPathId: null,
      desiredBuffs: [],
      abilityThresholds: [],
      escapeCommands: [],
      abilityCooldowns: {},
    },

    steps: {
      start: { pre: [], exec: [], post: [] },
      move: { pre: [], exec: [], post: [] },
      identify: { pre: [], exec: [], post: [] },
      fight: { pre: [], exec: [] },
      reset: { endRound: [], wait: [] },
    },
  };
}

export const createDefaultAutoLevelingConfig = createDefaultAutoLevelConfig;
