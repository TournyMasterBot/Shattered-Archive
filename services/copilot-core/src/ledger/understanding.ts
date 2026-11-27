import type { Suggestion } from '../contracts.js';
import { resolveVerb } from '../policy/classify.js';
import { MAX_RULE } from './records.js';

/** What the owner typed instead of the suggestion. */
export interface OwnerCorrection {
  command: string;
  why?: string;
}

/** The JSON the agent role must return when it is asked to restate a correction. */
export interface Restatement {
  /** The lesson in one sentence. */
  rule: string;
  /** The correction in the agent's own words; it must name the verb the owner chose. */
  restatement: string;
  confident: boolean;
}

export type UnderstandingResult =
  | { ok: true; rule: string; restatement: string }
  | { ok: false; ticketReason: 'correction-not-understood'; problems: string[] };

const MAX_RESTATEMENT = 500;

function normalise(command: string): string {
  return command.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Did the local agent understand a correction? A MECHANICAL check, so a model never judges a model:
 *
 *  - the answer is valid JSON of the right shape, with a non-empty `rule` and `restatement` within their length caps;
 *  - `confident` is exactly `true`;
 *  - the restatement contains the verb of the corrected command, either as typed or in full (`dro` is satisfied by "drop").
 *
 * Anything else is `correction-not-understood`, and the correction becomes an escalation ticket for a teaching session.
 */
export function checkUnderstanding(
  suggestion: Pick<Suggestion, 'command'>,
  correction: OwnerCorrection,
  modelJson: unknown,
): UnderstandingResult {
  const fail = (...problems: string[]): UnderstandingResult => ({ ok: false, ticketReason: 'correction-not-understood', problems });

  if (typeof correction.command !== 'string' || correction.command.trim() === '') return fail('the correction has no command');
  if (normalise(correction.command) === normalise(suggestion.command)) return fail('the correction is the same command as the suggestion');

  let parsed: unknown = modelJson;
  if (typeof modelJson === 'string') {
    try {
      parsed = JSON.parse(modelJson) as unknown;
    } catch {
      return fail('the answer is not valid JSON');
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return fail('the answer is not a JSON object');

  const { rule, restatement, confident } = parsed as Record<string, unknown>;
  const problems: string[] = [];
  if (typeof rule !== 'string' || rule.trim() === '') problems.push('rule is missing or empty');
  else if (rule.length > MAX_RULE) problems.push('rule is too long');
  if (typeof restatement !== 'string' || restatement.trim() === '') problems.push('restatement is missing or empty');
  else if (restatement.length > MAX_RESTATEMENT) problems.push('restatement is too long');
  if (confident !== true) problems.push('the agent is not confident');
  if (problems.length > 0) return fail(...problems);

  // the say, gossip and emote shortcuts (' " . , :) have no verb word to look for
  const trimmed = correction.command.trim();
  const typed = /^['".,:]/.test(trimmed) ? '' : trimmed.split(/\s+/)[0].replace(/[^A-Za-z0-9]/g, '');
  const words = new Set<string>();
  if (typed !== '') {
    words.add(typed.toLowerCase());
    const full = resolveVerb(typed);
    if (full) words.add(full.name);
  }
  if (words.size > 0 && ![...words].some((w) => new RegExp(`\\b${w}\\b`, 'i').test(restatement as string))) {
    return fail('the restatement does not mention the verb of the corrected command');
  }
  return { ok: true, rule: (rule as string).trim(), restatement: (restatement as string).trim() };
}
