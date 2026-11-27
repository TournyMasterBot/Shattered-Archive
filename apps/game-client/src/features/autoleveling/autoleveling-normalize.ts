// apps/game-client/src/features/autoleveling/autoleveling-normalize.ts
import type {
  AutoLevelAction,
  AutoLevelConfig,
  AutoLevelMode,
  AutoLevelPhaseTriplet,
  AutoLevelStepConfig,
} from './autoleveling-types';
import { createDefaultAutoLevelConfig } from './autoleveling-defaults';

const VALID_MODES: AutoLevelMode[] = ['disabled', 'dry_run', 'auto_level', 'sightsee'];

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object';
}

function _asBool(x: unknown, fallback: boolean): boolean {
  return typeof x === 'boolean' ? x : fallback;
}

function _asNum(x: unknown, fallback: number): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
}

function _asStrOrNull(x: unknown): string | null {
  if (x === null) return null;
  if (typeof x !== 'string') return null;
  const s = x.trim();
  return s.length ? s : null;
}

function _newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function normalizeActions(x: unknown): AutoLevelAction[] {
  if (!Array.isArray(x)) return [];
  // keep only objects with a kind; silently drop bad entries
  return x.filter((a) => isObj(a) && typeof a.kind === 'string') as AutoLevelAction[];
}

function normalizeTriplet(x: unknown, fallback: AutoLevelPhaseTriplet): AutoLevelPhaseTriplet {
  if (!isObj(x)) return fallback;
  return {
    pre: normalizeActions(x.pre),
    exec: normalizeActions(x.exec),
    post: normalizeActions(x.post),
  };
}

function _normalizeSteps(x: unknown, fallback: AutoLevelStepConfig): AutoLevelStepConfig {
  if (!isObj(x)) return fallback;

  const start = normalizeTriplet(x.start, fallback.start);
  const move = normalizeTriplet(x.move, fallback.move);
  const identify = normalizeTriplet(x.identify, fallback.identify);

  const fight = isObj(x.fight)
    ? { pre: normalizeActions(x.fight.pre), exec: normalizeActions(x.fight.exec), post: normalizeActions(x.fight.post) }
    : fallback.fight;

  const postFight = normalizeTriplet(x.postFight, fallback.postFight);

  const reset = isObj(x.reset)
    ? { endRound: normalizeActions(x.reset.endRound), wait: normalizeActions(x.reset.wait) }
    : fallback.reset;

  return { start, move, identify, fight, postFight, reset };
}

function _normalizeEscapeCommands(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.map((s) => (typeof s === 'string' ? s.trim() : '')).filter((s) => s.length > 0);
}

/**
 * v2 → v3 migration: the old modal's config shape carried forward, with the new
 * `version: 3` and an empty `criticalBuffs`. Everything else is preserved so a
 * user's tuned timings / targets survive.
 */
export function migrateAutoLevelConfigV2ToV3(v2: Record<string, unknown>): AutoLevelConfig {
  const def = createDefaultAutoLevelConfig();
  return {
    ...def,
    ...v2,
    version: 3,
    criticalBuffs: Array.isArray(v2.criticalBuffs) ? v2.criticalBuffs : [],
    init: { ...def.init, ...(isObj(v2.init) ? v2.init : {}) },
    steps: { ...def.steps, ...(isObj(v2.steps) ? v2.steps : {}) },
  };
}

/**
 * Repairs unknown/old/broken shapes into a fully-formed AutoLevelConfig.
 * - Also supports older configs that accidentally placed fleePk/escapeCommands inside init.
 * - Migrates old `enabled: boolean` to the new `mode: AutoLevelMode` field.
 */
function _normalizeAutoLevelConfig(raw: AutoLevelConfig): AutoLevelConfig {
  const def = createDefaultAutoLevelConfig();

  // Migrate: configs prior to mode used enabled:boolean — map to equivalent mode.
  // `raw` comes from storage and may predate typed fields (mode, ...): read it loosely.
  const loose = raw as unknown as Record<string, unknown>;
  // `abilityCooldowns` is a legacy field the current init type no longer declares; it is carried through as before.
  const initLoose = loose.init as
    | (Partial<AutoLevelConfig['init']> & { abilityCooldowns?: Record<string, unknown> })
    | undefined;
  const stepsLoose = loose.steps as Partial<AutoLevelConfig['steps']> | undefined;
  const rawMode = loose.mode;
  const rawEnabled = loose.enabled;
  const mode: AutoLevelMode = VALID_MODES.includes(rawMode as AutoLevelMode)
    ? (rawMode as AutoLevelMode)
    : typeof rawEnabled === 'boolean'
      ? rawEnabled
        ? 'auto_level'
        : 'disabled'
      : def.mode;

  return {
    ...def,
    ...raw,
    version: 3,
    mode,
    criticalBuffs: Array.isArray(loose.criticalBuffs)
      ? (loose.criticalBuffs as AutoLevelConfig['criticalBuffs'])
      : def.criticalBuffs,
    init: {
      ...def.init,
      ...initLoose,
      abilityCooldowns: {
        ...(initLoose?.abilityCooldowns ?? {}),
      },
    } as AutoLevelConfig['init'],
    steps: {
      ...def.steps,
      ...stepsLoose,
      start: { ...def.steps.start, ...stepsLoose?.start },
      move: { ...def.steps.move, ...stepsLoose?.move },
      identify: { ...def.steps.identify, ...stepsLoose?.identify },
      fight: { ...def.steps.fight, ...stepsLoose?.fight },
      postFight: { ...def.steps.postFight, ...stepsLoose?.postFight },
      reset: { ...def.steps.reset, ...stepsLoose?.reset },
    },
  };
}
