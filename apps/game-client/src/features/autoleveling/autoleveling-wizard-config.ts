// apps/game-client/src/features/autoleveling/autoleveling-wizard-config.ts

/**
 * Wizard draft → AutoLevelConfig
 * ------------------------------
 * The wizard collects a `WizardDraft` (area + targets + class + buffs + fight
 * commands). This turns it into the `AutoLevelConfig` the engine actually runs,
 * built fresh each time the user reaches the Start step.
 *
 * Mapping:
 *   area.dirs + speedwalk + requiredActions  → init.trainingPath   (fullRoute)
 *   enabled targets                          → init.targets        (AutoLevelTarget[])
 *   initiationCommand                        → init.initiationCommand
 *   buffs                                    → steps.start.pre     (if_affect_missing / send_every_ticks / send)
 *   buffs w/ inCombatCmd or holdNearLevel    → config.criticalBuffs
 *   fight commands                           → steps.fight.exec    (send_cooldown / send)
 *   mode / loopRounds                        → mode / loopRounds
 *
 * Buff EXECUTION (running steps.start, honouring criticalBuffs) is the engine's
 * job — see the engine shore-up step. This file only produces the config.
 */

import type {
  AutoLevelAction,
  AutoLevelAlignment,
  AutoLevelConfig,
  AutoLevelCriticalBuff,
  AutoLevelRestDuringRoundRule,
  AutoLevelTarget,
} from './autoleveling-types';
import { createDefaultAutoLevelConfig } from './autoleveling-defaults';
import type { AutoPilotArea } from './autoleveling-content-types';
import { fullRoute } from './autoleveling-content';
import type { BuffRow, FightRow } from './autoleveling-user-data';

/**
 * The slice of the wizard draft this needs. `WizardDraft`
 * (components/wizard/useWizardDraft) is structurally assignable to it — kept
 * local so features/ doesn't depend on components/.
 */
export interface ConfigDraftTarget {
  lookName: string;
  engageName: string;
  level?: number;
  enabled: boolean;
}

export interface ConfigDraft {
  area: AutoPilotArea | null;
  targets: ConfigDraftTarget[];
  mode: 'auto_level' | 'dry_run' | 'sightsee';
  loopRounds: boolean;
  initiationCommand: string;
  buffs: BuffRow[];
  fightCommands: FightRow[];
  /**
   * The player's alignment (Combat step). Optional so `WizardDraft` stays
   * structurally assignable. Absent = neutral. The mob's alignment is read live
   * from auras by the engine, not set here.
   */
  playerAlignment?: AutoLevelAlignment;
  /** Rest step (optional so WizardDraft stays structurally assignable). */
  restStartOfRound?: string;
  restEndOfRound?: string;
  restDuringRound?: AutoLevelRestDuringRoundRule[];
  /** Weight step (optional so WizardDraft stays structurally assignable). */
  weightAtOrAbovePct?: number;
  weightCommands?: string;
}

/** Pause between laps for an active leveling run — the 5-min default is a sightsee pace. */
const WIZARD_ROUND_LOOP_MS = 3_000;

function targetKey(t: ConfigDraftTarget): string {
  const base = (t.lookName || t.engageName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return base || t.engageName.trim().toLowerCase();
}

function draftTargetToConfig(t: ConfigDraftTarget): AutoLevelTarget {
  return {
    cleanName: targetKey(t),
    name: t.lookName,
    lookName: t.lookName,
    keywords: [t.engageName.trim()],
    ...(typeof t.level === 'number' ? { level: t.level } : {}),
  };
}

/** A pre-round buff row → its start-step action. */
function buffToStartAction(b: BuffRow): AutoLevelAction {
  const cmd = b.cmd.trim();
  const vitalsGate = b.vitalsGate;
  const onceKey = b.onceKey;
  if (b.refreshTicks != null) {
    return { kind: 'send_every_ticks', cmd, everyTicks: Math.max(0, Math.floor(b.refreshTicks)), vitalsGate, onceKey };
  }
  const affect = b.affect?.trim();
  if (affect) return { kind: 'if_affect_missing', affectName: affect, cmd, vitalsGate, onceKey };
  return { kind: 'send', cmd, vitalsGate, onceKey };
}

/** "wake;stand" -> [{kind:'send',cmd:'wake'}, {kind:'send',cmd:'stand'}] — same split convention as fullRoute. */
function parseRestCommands(raw: string | undefined): AutoLevelAction[] {
  return (raw ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((cmd) => ({ kind: 'send' as const, cmd }));
}

function fightRowToAction(f: FightRow): AutoLevelAction {
  const cmd = f.cmd.trim();
  const vitalsGate = f.vitalsGate;
  const onceKey = f.onceKey;
  return f.cooldownSec > 0
    ? { kind: 'send_cooldown', cmd, cooldownSec: f.cooldownSec, vitalsGate, onceKey }
    : { kind: 'send', cmd, vitalsGate, onceKey };
}

function buffToCriticalBuff(b: BuffRow): AutoLevelCriticalBuff {
  return {
    affect: b.affect!.trim(),
    cmd: b.cmd.trim(),
    ...(b.inCombatCmd?.trim() ? { inCombatCmd: b.inCombatCmd.trim() } : {}),
    ...(b.holdNearLevel ? { holdNearLevel: true } : {}),
  };
}

/**
 * Build the engine config from a wizard draft. Returns a runnable v3 config;
 * when `draft.area` is null (custom-path / nothing chosen) the route is empty
 * and the engine will refuse to start — that's expected.
 */
export function draftToConfig(draft: ConfigDraft): AutoLevelConfig {
  const def = createDefaultAutoLevelConfig();
  const area = draft.area;

  const trainingPath = area ? fullRoute(area) || null : null;

  const targets: AutoLevelTarget[] = draft.targets
    .filter((t) => t.enabled && t.lookName.trim() && t.engageName.trim())
    .map(draftTargetToConfig);

  const startPre: AutoLevelAction[] = draft.buffs.filter((b) => b.cmd.trim()).map(buffToStartAction);

  const criticalBuffs: AutoLevelCriticalBuff[] = draft.buffs
    .filter((b) => b.cmd.trim() && b.affect?.trim() && (b.inCombatCmd?.trim() || b.holdNearLevel))
    .map(buffToCriticalBuff);

  const fightExec: AutoLevelAction[] = draft.fightCommands.filter((f) => f.cmd.trim()).map(fightRowToAction);

  const mode = draft.mode ?? 'auto_level';

  return {
    ...def,
    version: 3,
    mode,
    loopRounds: draft.loopRounds,
    roundLoopTimeMs: mode === 'sightsee' ? def.roundLoopTimeMs : WIZARD_ROUND_LOOP_MS,
    criticalBuffs,
    // Only carry a non-neutral player alignment — neutral is the engine's default
    // (1× modifier). The mob's alignment is detected live from auras.
    ...(draft.playerAlignment && draft.playerAlignment !== 'neutral'
      ? { playerAlignment: draft.playerAlignment }
      : {}),
    init: {
      ...def.init,
      continentName: area?.continent ?? null,
      areaName: area?.areaName ?? null,
      areaId: area?.areaId ?? null,
      trainingPath,
      initiationCommand: draft.initiationCommand.trim() || null,
      targets,
    },
    steps: {
      ...def.steps,
      start: { pre: startPre, exec: [], post: [] },
      // Re-scan the room after each kill so multi-mob rooms get fully cleared.
      identify: { pre: [], exec: [{ kind: 'send', cmd: 'look' }], post: [] },
      fight: { pre: [], exec: fightExec, post: [] },
    },
    rest: {
      startOfRound: parseRestCommands(draft.restStartOfRound),
      endOfRound: parseRestCommands(draft.restEndOfRound),
      duringRound: draft.restDuringRound ?? [],
    },
    weight: {
      atOrAbovePct: draft.weightAtOrAbovePct ?? def.weight.atOrAbovePct,
      commands: parseRestCommands(draft.weightCommands),
    },
  };
}
