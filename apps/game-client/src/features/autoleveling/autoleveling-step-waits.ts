// apps/game-client/src/features/autoleveling/autoleveling-step-waits.ts

/**
 * Route steps that are not a move and are not instant. The engine used to wait a fixed half second after any non-movement step, so a
 * `heel` (the steed runs to you, 2 to 11 s) or a `ride st` (3 s on average, up to 12 s) was followed at once by the next move: 16 of 99
 * mounts in the game-server logs of 2026-11-19..25 had a move sent before "You mount" arrived, and the character walked on without its steed.
 *
 * Only lines seen in those logs are listed. A step with no rule here keeps the old fixed settle.
 */

import { plainLine } from './autoleveling-cast-outcome';

/** What to do when the game never answers, or answers with a failure: carry on (the next step has its own check) or pause for the player. */
export type StepMiss = 'continue' | 'pause';

export interface SlowStepRule {
  /** Shown in the terminal notice. */
  label: string;
  /** The step command (case-insensitive, whole line). */
  command: RegExp;
  /** Lines that mean it is done (matched against the plain line: no colour, lowercase, single spaces, no final dot). */
  done: readonly RegExp[];
  /** Lines that mean it will not work. */
  failed: readonly RegExp[];
  /** Longest wait; the slowest answer in the logs was 12.9 s. */
  timeoutMs: number;
  onMiss: StepMiss;
}

export const SLOW_STEP_RULES: readonly SlowStepRule[] = [
  {
    label: 'heel',
    command: /^heel$/i,
    // "An unholy steed comes running in." (17 times, up to 10.9 s after) · "An unholy steed gallops in." · the steed is already under you
    done: [/ (comes running|gallops) in$/, /^you are already riding your pet/],
    failed: [/^no way! you are still fighting/],
    timeoutMs: 20_000,
    // the `ride` that follows has its own check; a `heel` whose answer is unknown (the steed already here) must not stop the run
    onMiss: 'continue',
  },
  {
    label: 'ride',
    command: /^ride\s+\S.*$/i,
    done: [/^you mount /, /^your already riding a mount/, /^you are already riding/],
    // "They're not here." (the steed has not arrived) · "You can't ride that." · "You can not ride anything while flying."
    failed: [/^they'?re not here$/, /^you can'?t ride that$/, /^you can not ride anything while flying$/],
    timeoutMs: 20_000,
    // walking on unmounted sends the character into the next fight without its charge, so the player decides
    onMiss: 'pause',
  },
];

/** The rule for a route step, or null for an ordinary (or instant) step. */
export function slowStepFor(cmd: string): SlowStepRule | null {
  const text = String(cmd ?? '').trim();
  return SLOW_STEP_RULES.find((r) => r.command.test(text)) ?? null;
}

/** Whether one line of game text finishes the step, fails it, or says nothing about it. */
export function classifyStepLine(rule: SlowStepRule, rawLine: string): 'done' | 'failed' | null {
  const line = plainLine(rawLine);
  if (!line) return null;
  if (rule.done.some((re) => re.test(line))) return 'done';
  if (rule.failed.some((re) => re.test(line))) return 'failed';
  return null;
}

/**
 * A command the PLAYER typed (the engine did not send it) that keeps the game busy long enough for the engine to wait for it: a cast, or a
 * step with a rule above. Everything else (who, score, a channel, an alias that is only a look) never delays the run. Casting is `c` or
 * `cast`; the engine's own casts are written `cast '...'` and never reach this function (they are matched as its own sends first).
 */
export function manualCommandKind(cmd: string): { kind: 'cast' } | { kind: 'rule'; rule: SlowStepRule } | null {
  const text = String(cmd ?? '').trim();
  if (/^(c|ca|cas|cast)\s+\S/i.test(text)) return { kind: 'cast' };
  const rule = slowStepFor(text);
  return rule ? { kind: 'rule', rule } : null;
}
