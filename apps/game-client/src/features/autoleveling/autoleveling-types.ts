// apps/game-client/src/features/autoleveling/autoleveling-types.ts

/**
 * Autoleveling Types (schema)
 * --------------------------
 * Intent:
 * - Defines the persisted config schema and runtime runState.
 * - v2 is intentionally gated (no implicit migration) to avoid half-baked mappings.
 *
 * Strong step-order inference (engine-driven):
 * - A "Round" is a full loop of:
 *    start triplet -> (trainingPath segments: move + identify + injected encounters) -> reset.endRound -> reset.wait
 * - Encounters (fight flow) are injected asynchronously when terminal output contains a target's lookName.
 * - Engagement is owned by the engine:
 *    initiationCommand template + keyword attempts until fighting starts.
 */

export type AutoLevelAction =
  | { kind: 'send'; cmd: string }
  | { kind: 'wait_ms'; ms: number }
  | { kind: 'wait_text'; text: string; caseInsensitive?: boolean; timeoutMs?: number }
  | { kind: 'wait_regex'; pattern: string; flags?: string; timeoutMs?: number }
  | { kind: 'wait_fighting'; value: boolean; timeoutMs?: number };

export type AutoLevelPhaseTriplet = {
  /**
   * pre / exec / post is a consistent structure used across major steps.
   * It helps keep "setup", "do the thing", "cleanup" separated.
   */
  pre: AutoLevelAction[];
  exec: AutoLevelAction[];
  post: AutoLevelAction[];
};

export type AutoLevelStepConfig = {
  /**
   * Optional end-to-end movement route, expressed as semicolon-separated commands.
   * NOTE: In the current engine implementation, the authoritative training path is `config.init.trainingPath`,
   * not this `steps.trainingPath` field. This field is currently effectively unused.
   */
  trainingPath?: string | null;

  start: AutoLevelPhaseTriplet;
  move: AutoLevelPhaseTriplet;
  identify: AutoLevelPhaseTriplet;

  /**
   * Optional fight actions you want to run *after* engagement succeeds.
   * (The engine now owns engagement: initiation command + keyword fallbacks.)
   */
  fight: AutoLevelPhaseTriplet;

  reset: {
    endRound: AutoLevelAction[];
    wait: AutoLevelAction[];
  };
};

/**
 * Targets are stored as “rich” records so the engine has everything it needs
 * without re-querying maps.
 *
 * - lookName is used for encounter detection (terminal output includes match)
 * - keywords are used for engagement attempts in order (first is usually best)
 */
export type AutoLevelTarget = {
  cleanName: string; // stable key
  name: string; // display (may include ANSI)
  lookName: string;
  keywords: string[];

  // helpful metadata for UI
  level?: number;
  damageDice?: string;
  damageType?: string;
  health?: number;

  immunities?: string[];
  resistances?: string[];
  vulnerabilities?: string[];
  affects?: string[];
  offensiveTactics?: string[];
};

export type AutoLevelInitConfigV2 = {
  /** Human-readable selection used by UI (optional but persisted). */
  continentName?: string | null;
  areaName?: string | null;

  /** IDs inferred from beasts response (persisted). */
  continentId: string | null;
  areaId: string | null;

  /**
   * The end-to-end movement path. Semicolon-separated commands.
   * This is what the engine uses for the round loop.
   */
  trainingPath?: string | null;

  /**
   * Optional. If blank, engine defaults to: "kill {name}"
   * Supported placeholders:
   *  - {name}  (preferred)
   *  - {target} (back-compat)
   *  - {keyword}
   */
  initiationCommand?: string | null;

  /**
   * Targets selected in UI.
   */
  targets: AutoLevelTarget[];
};

export type AutoLevelConfig = {
  version: 2;
  enabled: boolean;

  init: AutoLevelInitConfigV2;
  steps: AutoLevelStepConfig;

  loopRounds: boolean;
  roundLoopTimeMs: number;
  idleTimeoutMs: number;

  fleePk: boolean;
};

export type AutoLevelRunState =
  | { status: 'idle' }
  | { status: 'waiting' }
  | { status: 'resting' }
  | { status: 'running'; round: number; step: string; actionIndex: number }
  | { status: 'paused'; round: number; step: string; actionIndex: number }
  | { status: 'stopping' }
  | { status: 'error'; message: string };
