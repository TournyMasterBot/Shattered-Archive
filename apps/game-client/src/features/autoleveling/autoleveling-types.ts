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
  /**
   * Send cmd only if at least cooldownSec seconds have passed since it was last
   * sent by THIS engine run. Used for fight commands that have an in-game reuse
   * timer (bash, kick, a quaffed pot). cooldownSec 0 behaves like a plain send.
   * Syntax in the step editor: cooldown <sec> <command>
   */
  | { kind: 'send_cooldown'; cmd: string; cooldownSec: number }
  /**
   * Send cmd only if at least everyTicks game ticks have elapsed since it was
   * last sent by THIS engine run. A "tick" is the GMCP `tick` event (~40s on
   * DSL). Used for buffs that never register a GMCP affect (berserk, fury) so
   * `if_affect_missing` cannot gate them. everyTicks 0 behaves like a plain send.
   * Syntax in the step editor: every_ticks <n> <command>
   */
  | { kind: 'send_every_ticks'; cmd: string; everyTicks: number }
  | { kind: 'wait_ms'; ms: number }
  | { kind: 'wait_text'; text: string; caseInsensitive?: boolean; timeoutMs?: number }
  | { kind: 'wait_regex'; pattern: string; flags?: string; timeoutMs?: number }
  | { kind: 'wait_fighting'; value: boolean; timeoutMs?: number }
  /** Conditional sends — checked against live GMCP vitals at execution time. */
  | { kind: 'if_hp_pct_below'; pct: number; cmd: string }
  | { kind: 'if_mp_pct_below'; pct: number; cmd: string }
  | { kind: 'if_mv_pct_below'; pct: number; cmd: string }
  /**
   * Send cmd only when the named affect is NOT currently active.
   * affectName is matched case-insensitively against GMCP AffectData.n.
   * Syntax in the step editor: if_affect_missing "affect name" command
   */
  | { kind: 'if_affect_missing'; affectName: string; cmd: string };

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
  start: AutoLevelPhaseTriplet;
  move: AutoLevelPhaseTriplet;

  /**
   * Room scan / pre-fight step.
   * exec typically contains a "look" command; the engine's encounter detection
   * (lookName match in terminal text) injects a fight sequence when a target is found.
   */
  identify: AutoLevelPhaseTriplet;

  /**
   * Fight step (engine-owned engagement happens before this).
   * - pre  : runs once when engagement succeeds, before the fight loop starts.
   * - exec : looped every `fightLoopIntervalMs` while isFighting=true.
   *          Supports conditional actions: if_hp_pct_below, if_mp_pct_below, if_mv_pct_below.
   * - post : runs once after the fight loop exits (isFighting=false).
   */
  fight: AutoLevelPhaseTriplet;

  /**
   * Post-fight step — runs once after isFighting=false.
   * Typical use: loot corpses, check health, rest if needed.
   */
  postFight: AutoLevelPhaseTriplet;

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

export type AutoLevelMode = 'disabled' | 'dry_run' | 'auto_level' | 'sightsee';

/** Alignment for the kill-XP estimate. Absent = neutral (no XP correction applied). */
export type AutoLevelAlignment = 'good' | 'neutral' | 'evil';

/**
 * A buff the engine watches at runtime, built by the wizard from buff rows that
 * carry an in-combat action and/or a hold-near-level flag. The pre-round recast
 * of a buff still lives in `steps.start.pre`; this list is the extra behaviour
 * that reacts to the affect dropping (mid-combat or near a level-up).
 *
 * Consumed by the engine in a later step — safe to be empty.
 */
export type AutoLevelCriticalBuff = {
  /** GMCP affect name (matched case-insensitively against AffectData.n). */
  affect: string;
  /** The normal out-of-combat recast — used for the post-combat top-up. */
  cmd: string;
  /** Fast item action to use if the affect drops while `is_fighting` (quaff/brandish/zap). */
  inCombatCmd?: string;
  /** Stop refreshing (let it fall) when close to leveling — `tnl` ≤ est. next-kill XP. */
  holdNearLevel?: boolean;
  /** Minimum seconds between reactions for this affect (anti-flap). */
  cooldownSec?: number;
};

export type AutoLevelConfig = {
  version: 3;
  mode: AutoLevelMode;

  init: AutoLevelInitConfigV2;
  steps: AutoLevelStepConfig;

  /** Runtime-watched buffs (in-combat reapply / hold-near-level). May be empty. */
  criticalBuffs: AutoLevelCriticalBuff[];

  /**
   * Alignment inputs for the engine's rolling kill-XP estimate (DSL rule:
   * opposite = 2×, same = 0.5×, any-neutral = 1×). Absent = neutral.
   * - `playerAlignment` is set by the wizard's Combat step (a character property).
   * - `targetAlignment` is an optional manual override; normally the engine reads
   *   the mob's alignment live from the `(Golden Aura)` / `(Red Aura)` line prefix.
   */
  playerAlignment?: AutoLevelAlignment;
  targetAlignment?: AutoLevelAlignment;

  loopRounds: boolean;
  roundLoopTimeMs: number;
  idleTimeoutMs: number;

  /**
   * How long to wait (ms) between each iteration of the fight.exec loop.
   * Defaults to 2500ms. Minimum enforced at 500ms by the engine.
   */
  fightLoopIntervalMs: number;

  /**
   * How long to pause (ms) after a movement command succeeds before the next step.
   * Defaults to 600ms.
   */
  moveSettleMs: number;

  /**
   * How long to pause (ms) after sending a non-movement command (e.g. `look`) before
   * processing encounter detections. Allows server response text to arrive before the
   * engine decides whether a mob is present. Defaults to 500ms.
   */
  lookSettleMs: number;

  /**
   * How long to pause (ms) after the postFight triplet completes before re-scanning
   * the room or moving on. Gives the server time to settle after looting/resting.
   * Defaults to 2000ms.
   */
  postFightSettleMs: number;

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

/**
 * Snapshot of the rolling kill-XP estimate, taken on every XP gain (see
 * AutoLevelingEngine.emitXpProgress). Kept as its own piece of state — separate from
 * AutoLevelRunState — so it survives status transitions instead of being wiped by the
 * next `setRunState` call, letting the UI keep showing "last kill" info while waiting
 * between rounds.
 */
export interface AutoLevelXpProgress {
  /** tnl drop from the most recent kill. */
  gainedXp: number;
  /** tnl (xp to next level) after that kill. */
  tnl: number;
  /** Rolling-estimate kills remaining to level, or null if there's no estimate yet. */
  killsLeft: number | null;
  /** Rolling average xp/kill (alignment-adjusted) driving the estimate above. */
  estKillXp: number;
  /** Kills counted so far this run. */
  sessionKills: number;
  /** Date.now() when this snapshot was taken. */
  ts: number;
}
