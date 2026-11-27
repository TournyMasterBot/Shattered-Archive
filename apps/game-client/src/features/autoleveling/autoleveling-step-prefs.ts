// apps/game-client/src/features/autoleveling/autoleveling-step-prefs.ts

/**
 * What the wizard's Rest and Weight steps and the wait between laps remember (live findings 2026-11-14: "several steps do not preserve their
 * set values"), and which targets the player unticked for an area. Pure rules; the storage is in autoleveling-user-data.ts.
 *
 * One set for the character, in the existing global `pref` record (owner decision, 2026-11-18); the targets the player unticked are per area,
 * in a `pref` record of their own. Both ride on the `pref` kind that the server already accepts with any data, so no server change is needed.
 * Only what differs from the default is stored (SETTINGS-01/02): an untouched step stores nothing, and a future change of a default reaches
 * everyone who never changed it.
 */

import type { AutoLevelRestDuringRoundRule } from './autoleveling-types';

export const LAP_WAIT_DEFAULT_MIN = 3;
export const LAP_WAIT_MIN = 1;
export const LAP_WAIT_MAX = 60;
export const WEIGHT_PCT_DEFAULT = 90;
/** Longest rest or weight command text kept: far above any real command list, far below anything that could bloat the record. */
export const MAX_STEP_TEXT = 500;
export const MAX_REST_RULES = 20;
/** Most unticked-target ids kept for one area. */
export const MAX_DESELECTED = 500;
const MAX_ID_CHARS = 200;

/** The values as the wizard draft holds them (every field always present). */
export interface StepValues {
  restStartOfRound: string;
  restEndOfRound: string;
  restDuringRound: AutoLevelRestDuringRoundRule[];
  weightAtOrAbovePct: number;
  weightCommands: string;
  lapWaitMin: number;
}

/** The values as stored: only what differs from the default. */
export interface StepPrefs {
  rest?: { startOfRound?: string; endOfRound?: string; duringRound?: AutoLevelRestDuringRoundRule[] };
  weight?: { atOrAbovePct?: number; commands?: string };
  lapWaitMin?: number;
}

export const STEP_DEFAULTS: StepValues = {
  restStartOfRound: '',
  restEndOfRound: '',
  restDuringRound: [],
  weightAtOrAbovePct: WEIGHT_PCT_DEFAULT,
  weightCommands: '',
  lapWaitMin: LAP_WAIT_DEFAULT_MIN,
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.length <= MAX_STEP_TEXT ? v : undefined);

const wholeInRange = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;

function pct(v: unknown): number | undefined {
  return wholeInRange(v, 0, 100);
}

function vitals(v: unknown): { hp?: number; mp?: number; mv?: number } {
  const o = isObject(v) ? v : {};
  const out: { hp?: number; mp?: number; mv?: number } = {};
  for (const k of ['hp', 'mp', 'mv'] as const) {
    const n = pct(o[k]);
    if (n !== undefined) out[k] = n;
  }
  return out;
}

/** One during-round rest rule: only the known fields, percents whole and 0-100; anything else is dropped. A non-object is no rule. */
function rule(v: unknown): AutoLevelRestDuringRoundRule | null {
  if (!isObject(v)) return null;
  return { ...vitals(v), recoverTo: vitals(v.recoverTo) };
}

/** Whatever was stored or arrived from the cloud, reduced to what is valid; nothing invalid survives, nothing throws, input is not changed. */
export function normalizeStepPrefs(data: unknown): StepPrefs {
  const d = isObject(data) ? data : {};
  const out: StepPrefs = {};

  if (isObject(d.rest)) {
    const rest: NonNullable<StepPrefs['rest']> = {};
    const start = text(d.rest.startOfRound);
    const end = text(d.rest.endOfRound);
    if (start !== undefined) rest.startOfRound = start;
    if (end !== undefined) rest.endOfRound = end;
    if (Array.isArray(d.rest.duringRound)) {
      rest.duringRound = d.rest.duringRound
        .slice(0, MAX_REST_RULES)
        .map(rule)
        .filter((r): r is AutoLevelRestDuringRoundRule => r !== null);
    }
    if (Object.keys(rest).length) out.rest = rest;
  }

  if (isObject(d.weight)) {
    const weight: NonNullable<StepPrefs['weight']> = {};
    const p = wholeInRange(d.weight.atOrAbovePct, 1, 100);
    const c = text(d.weight.commands);
    if (p !== undefined) weight.atOrAbovePct = p;
    if (c !== undefined) weight.commands = c;
    if (Object.keys(weight).length) out.weight = weight;
  }

  const lap = wholeInRange(d.lapWaitMin, LAP_WAIT_MIN, LAP_WAIT_MAX);
  if (lap !== undefined) out.lapWaitMin = lap;
  return out;
}

/** The draft values for stored prefs: every missing piece is the default. */
export function stepValuesFrom(prefs: StepPrefs | null | undefined): StepValues {
  const p = normalizeStepPrefs(prefs);
  return {
    restStartOfRound: p.rest?.startOfRound ?? STEP_DEFAULTS.restStartOfRound,
    restEndOfRound: p.rest?.endOfRound ?? STEP_DEFAULTS.restEndOfRound,
    restDuringRound: p.rest?.duringRound ?? [],
    weightAtOrAbovePct: p.weight?.atOrAbovePct ?? STEP_DEFAULTS.weightAtOrAbovePct,
    weightCommands: p.weight?.commands ?? STEP_DEFAULTS.weightCommands,
    lapWaitMin: p.lapWaitMin ?? STEP_DEFAULTS.lapWaitMin,
  };
}

/**
 * The prefs to store for the draft values: only what differs from the default. Text that is too long and numbers out of range are not
 * stored (they fall back to the default on the next read); the editor never produces them.
 */
export function stepPrefsFrom(values: StepValues): StepPrefs {
  const clean = normalizeStepPrefs({
    rest: { startOfRound: values.restStartOfRound, endOfRound: values.restEndOfRound, duringRound: values.restDuringRound },
    weight: { atOrAbovePct: values.weightAtOrAbovePct, commands: values.weightCommands },
    lapWaitMin: values.lapWaitMin,
  });
  const out: StepPrefs = {};

  const rest: NonNullable<StepPrefs['rest']> = {};
  if (clean.rest?.startOfRound !== undefined && clean.rest.startOfRound !== STEP_DEFAULTS.restStartOfRound) rest.startOfRound = clean.rest.startOfRound;
  if (clean.rest?.endOfRound !== undefined && clean.rest.endOfRound !== STEP_DEFAULTS.restEndOfRound) rest.endOfRound = clean.rest.endOfRound;
  // the default is no rules, so any rule at all differs from it
  if (clean.rest?.duringRound && clean.rest.duringRound.length > 0) rest.duringRound = clean.rest.duringRound;
  if (Object.keys(rest).length) out.rest = rest;

  const weight: NonNullable<StepPrefs['weight']> = {};
  if (clean.weight?.atOrAbovePct !== undefined && clean.weight.atOrAbovePct !== STEP_DEFAULTS.weightAtOrAbovePct) weight.atOrAbovePct = clean.weight.atOrAbovePct;
  if (clean.weight?.commands !== undefined && clean.weight.commands !== STEP_DEFAULTS.weightCommands) weight.commands = clean.weight.commands;
  if (Object.keys(weight).length) out.weight = weight;

  if (clean.lapWaitMin !== undefined && clean.lapWaitMin !== STEP_DEFAULTS.lapWaitMin) out.lapWaitMin = clean.lapWaitMin;
  return out;
}

/** The unticked-target ids of a stored selection record, or null when the data is not a selection. Capped; ids are short strings. */
export function normalizeDeselected(data: unknown): string[] | null {
  if (!isObject(data) || !Array.isArray(data.deselected)) return null;
  const ids: string[] = [];
  for (const id of data.deselected) {
    if (typeof id !== 'string' || !id || id.length > MAX_ID_CHARS || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= MAX_DESELECTED) break;
  }
  return ids;
}
