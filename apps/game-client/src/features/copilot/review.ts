import type { Decision, Suggestion } from '@shatteredarchive/copilot-core';
import type { CopilotApi } from './api';
import type { CommandGate, GateRefusal } from './gate';

/** A correction needs a reason the teaching session can use; a rejection may carry one. */
export const WHY_MIN = 3;
export const WHY_MAX = 280;

export type WhyCheck = { ok: true; value: string } | { ok: false; message: string };

/** `required`: a correction. Optional (a rejection): an empty note is fine, a note that is given must still fit. */
export function checkWhy(raw: string, required: boolean): WhyCheck {
  const value = raw.trim();
  if (value === '' && !required) return { ok: true, value };
  if (value.length < WHY_MIN) return { ok: false, message: `Say why, in at least ${WHY_MIN} characters.` };
  if (value.length > WHY_MAX) return { ok: false, message: `Keep the why to ${WHY_MAX} characters or fewer.` };
  return { ok: true, value };
}

export const REFUSAL_TEXT: Record<GateRefusal, string> = {
  'copilot-off': 'Not sent: Copilot is switched off. Turn it on, then approve again.',
  'user-typing': 'Not sent: you typed a moment ago. Approve again when you are done.',
  'autopilot-running': 'Not sent: Autopilot is running. Approve again when it stops.',
  'invalid-command': 'Not sent: the command is empty, over 200 characters, or holds a line break.',
};

export type ReviewAction = 'approved' | 'corrected' | 'rejected';

/** One line of the session log. */
export interface ReviewLogEntry {
  at: number;
  suggestionId: string;
  /** What the owner chose, or `auto` when an enabled rule ran it by itself. */
  action: ReviewAction | 'auto';
  /** For `auto`: the rule that allowed it (`<sphere>:<kind>`). */
  rule?: string;
  /** The command that went to the game (absent for a rejection and for a refusal). */
  command?: string;
  /** The answer is on the server's ledger. False when the command was sent but the server could not be reached. */
  recorded: boolean;
  /** The gate would not send it: nothing was sent and nothing was recorded; the suggestion stays. */
  refused?: GateRefusal;
}

export type ReviewResult = { done: true; entry: ReviewLogEntry } | { done: false; refused: GateRefusal; entry: ReviewLogEntry };

export interface ReviewerOptions {
  api: CopilotApi;
  gate: CommandGate;
  /** Read at each call, so a window that remounts (or React's double mount in development) never holds a signal that was already aborted. */
  signal: () => AbortSignal;
  now?: () => number;
  newId?: () => string;
}

export interface Reviewer {
  approve(suggestion: Suggestion): Promise<ReviewResult>;
  correct(suggestion: Suggestion, command: string, why: string): Promise<ReviewResult>;
  reject(suggestion: Suggestion, why: string): Promise<ReviewResult>;
}

let counter = 0;
/** A fresh id that passes the ledger's id rule (letters, digits, `_` and `-`, at most 64). */
export function newDecisionId(): string {
  counter += 1;
  return `d-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The bucket an answer is counted in: the suggestion's own sphere and kind, whatever the answer was (a correction counts against the
 * bucket the wrong suggestion came from). The policy may look a stricter kind up later; that bucket has fewer answers, so it asks.
 */
export function bucketOf(suggestion: Suggestion): Pick<Decision, 'sphere' | 'kind'> {
  return { sphere: suggestion.sphere, kind: suggestion.kind };
}

/**
 * The owner's three answers. An approved or corrected command goes to the game ONLY through the command gate; if the gate refuses,
 * nothing is sent and NOTHING is recorded, so the suggestion stays for another try (a recorded `approved` would claim a command that
 * never ran). When the gate sends, the answer is then posted; if the server cannot be reached, the log says it was sent but not
 * recorded. A rejection sends nothing.
 */
export function createReviewer(options: ReviewerOptions): Reviewer {
  const now = options.now ?? Date.now;
  const newId = options.newId ?? newDecisionId;

  async function answer(suggestion: Suggestion, action: 'approved' | 'corrected', command: string, why?: string): Promise<ReviewResult> {
    const sent = options.gate.send(command);
    const at = now();
    if (!sent.ok) {
      return { done: false, refused: sent.reason, entry: { at, suggestionId: suggestion.id, action, recorded: false, refused: sent.reason } };
    }
    const sentCommand = command.trim();
    const decision: Decision = { ...bucketOf(suggestion), id: newId(), suggestionId: suggestion.id, character: suggestion.character, at, outcome: action, command: sentCommand };
    if (why !== undefined) decision.why = why;
    const posted = await options.api.postDecision(decision, options.signal());
    return { done: true, entry: { at, suggestionId: suggestion.id, action, command: sentCommand, recorded: posted.ok } };
  }

  return {
    approve: (suggestion) => answer(suggestion, 'approved', suggestion.command),
    correct: (suggestion, command, why) => answer(suggestion, 'corrected', command, why),
    async reject(suggestion, why) {
      const at = now();
      const decision: Decision = { ...bucketOf(suggestion), id: newId(), suggestionId: suggestion.id, character: suggestion.character, at, outcome: 'rejected' };
      if (why !== '') decision.why = why;
      const posted = await options.api.postDecision(decision, options.signal());
      return { done: true, entry: { at, suggestionId: suggestion.id, action: 'rejected', recorded: posted.ok } };
    },
  };
}
