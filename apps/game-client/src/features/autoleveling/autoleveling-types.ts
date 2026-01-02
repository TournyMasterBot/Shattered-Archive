export type AutoLevelAction =
  | { kind: 'send'; cmd: string }
  | { kind: 'wait_ms'; ms: number }
  | { kind: 'wait_text'; text: string; caseInsensitive?: boolean; timeoutMs?: number }
  | { kind: 'wait_regex'; pattern: string; flags?: string; timeoutMs?: number };

export type AutoLevelPhaseTriplet = {
  pre: AutoLevelAction[];
  exec: AutoLevelAction[];
  post: AutoLevelAction[];
};

export type AutoLevelStepConfig = {
  start: AutoLevelPhaseTriplet;
  move: AutoLevelPhaseTriplet;
  identify: AutoLevelPhaseTriplet;
  fight: {
    pre: AutoLevelAction[];
    exec: AutoLevelAction[];
  };
  reset: {
    endRound: AutoLevelAction[];
    wait: AutoLevelAction[];
  };
};

export type DesiredBuff = {
  id: string;
  enabled: boolean;
  cmd: string;
};

export type AbilityThresholdRule = {
  id: string;
  enabled: boolean;

  stat: 'hpPct' | 'mpPct' | 'stamPct' | 'hp' | 'mp' | 'stam';
  op: '>=' | '>' | '<=' | '<';
  value: number;

  cmd: string;

  throttle: 'none' | 'once_per_round' | 'once_per_fight' | 'ability_cooldown';

  /**
   * Used when throttle === 'ability_cooldown'
   * If omitted, the engine will fall back to cmd as the key.
   */
  cooldownKey?: string;
};

export type AutoLevelInitConfig = {
  continentId: string | null;
  areaId: string | null;
  trainingPathId: string | null;

  desiredBuffs: DesiredBuff[];

  /** Renamed in UI to “Fight Abilities” */
  abilityThresholds: AbilityThresholdRule[];

  /** One per line, used for flee/emergency sequences */
  escapeCommands: string[];

  /**
   * Cooldown lookup map (milliseconds).
   * Example: { "bash": 3000, "kick": 1500 }
   */
  abilityCooldowns: Record<string, number>;
};

export type AutoLevelConfig = {
  version: 1;
  enabled: boolean;

  init: AutoLevelInitConfig;
  steps: AutoLevelStepConfig;

  loopRounds: boolean;
  idleTimeoutMs: number;

  fleePk: boolean;
};

export type AutoLevelRunState =
  | { status: 'idle' }
  | { status: 'running'; round: number; step: string; actionIndex: number }
  | { status: 'stopping' }
  | { status: 'error'; message: string };
