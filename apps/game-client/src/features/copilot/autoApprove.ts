import {
  bucketStats,
  decide,
  type Decision,
  type EscalationTicket,
  type GameState,
  type PolicyReason,
  type Suggestion,
  type TicketReason,
  type TrustSettings,
} from '@shatteredarchive/copilot-core';
import type { CopilotApi, ServerState } from './api';
import type { Focus } from './focus';
import type { CommandGate, GateRefusal } from './gate';
import { newDecisionId, type ReviewLogEntry } from './review';

const SEEN_KEEP = 200;

/** What happened to one suggestion. Only `ran` and `refused` carry a log entry for the window. */
export type AutoResult =
  | { kind: 'seen' }
  /** The server could not answer (or the window closed): nothing ran by itself and the owner decides. */
  | { kind: 'unavailable' }
  /** `training`: the focus is Training, so nothing runs by itself whatever the settings say. */
  | { kind: 'ask'; reason: PolicyReason | 'training' }
  | { kind: 'escalated'; reason: PolicyReason; filed: boolean }
  | { kind: 'ran'; entry: ReviewLogEntry }
  | { kind: 'refused'; refused: GateRefusal; entry: ReviewLogEntry };

export interface AutoApproverOptions {
  api: CopilotApi;
  gate: CommandGate;
  /** The live settings, read at the moment of each decision (a rule the owner just switched off must not run). */
  settings: () => TrustSettings;
  /**
   * The live focus, read just before a command would be sent (after the server's answers): in `training` nothing runs by itself, so
   * switching to Training stops a command that was about to run.
   */
  focus: () => Focus;
  /** Read at each call, so the window closing stops anything not yet sent. */
  signal: () => AbortSignal;
  now?: () => number;
  newId?: () => string;
}

export interface AutoApprover {
  /** Looks at a suggestion once. Asking again for the same id does nothing (`seen`), so a refusal is never retried in a loop. */
  consider(suggestion: Suggestion): Promise<AutoResult>;
}

/**
 * The game state the policy needs, rebuilt from the server's answer. Staleness is measured on the text feed's age as of the moment
 * the answer arrived, and a server that calls the feed stale (it may use a shorter limit) or does not report the age at all makes it
 * stale here too: when in doubt nothing runs by itself.
 */
export function toGameState(state: ServerState, receivedAt: number): GameState {
  const age = state.lastTextAgeSeconds;
  const live = !state.stale && typeof age === 'number' && Number.isFinite(age) && age >= 0;
  return { connected: state.connected, inFight: state.inFight, ...(live ? { lastTextAt: receivedAt - age * 1000 } : {}) };
}

/** The only reasons `decide` escalates for; each files a ticket the teacher can use. Fixed texts: no game text or command goes in. */
type EscalateReason = 'very-low-confidence' | 'unknown-class' | 'unknown-target';

const TICKET: Record<EscalateReason, { reason: TicketReason; summary: string }> = {
  'very-low-confidence': { reason: 'low-confidence', summary: 'Copilot rated its own suggestion very low, so it asked the owner and filed this.' },
  'unknown-class': { reason: 'unknown-situation', summary: 'The suggested command is not one Copilot can classify, so it asked the owner and filed this.' },
  'unknown-target': { reason: 'danger', summary: 'The suggestion starts a fight with a target whose level, kill-ability or reason is not all known.' },
};

/**
 * Lets an enabled rule run a suggestion without the owner. It never decides anything itself: `decide` (copilot-core) is the only place
 * that does, with the live settings, the owner's history per bucket and the freshness of the log feed. An `auto` answer goes to the game
 * only through the command gate and is recorded as an `auto` decision with the rule that allowed it. A gate that refuses is recorded
 * as `refused` and the suggestion stays for the owner: it is looked at once and never retried. An `escalate` answer files a ticket
 * (once: its id comes from the suggestion's). A server that cannot be reached means nothing runs by itself.
 */
export function createAutoApprover(options: AutoApproverOptions): AutoApprover {
  const now = options.now ?? Date.now;
  const newId = options.newId ?? newDecisionId;
  const seen = new Set<string>();

  return {
    async consider(suggestion) {
      // marked before the first await: two polls that both list it cannot both run it
      if (seen.has(suggestion.id)) return { kind: 'seen' };
      seen.add(suggestion.id);
      if (seen.size > SEEN_KEEP) seen.delete(seen.values().next().value as string);

      const [state, buckets] = await Promise.all([options.api.getState(options.signal()), options.api.getBucketStats(options.signal())]);
      const receivedAt = now();
      if (!state.ok || !buckets.ok || options.signal().aborted) return { kind: 'unavailable' };

      const outcome = decide(suggestion, options.settings(), { game: toGameState(state.value, receivedAt), stats: (s, k) => bucketStats(buckets.value, s, k) }, now());

      if (outcome.outcome === 'ask') return { kind: 'ask', reason: outcome.reason };

      if (outcome.outcome === 'escalate') {
        const why = TICKET[outcome.reason as EscalateReason];
        const ticket: EscalationTicket = {
          id: `t-${suggestion.id}`.slice(0, 64),
          createdAt: now(),
          character: suggestion.character,
          reason: why.reason,
          sphere: suggestion.sphere,
          kind: outcome.kind,
          situationKey: suggestion.situationKey,
          summary: why.summary,
          status: 'open',
        };
        const filed = await options.api.postTicket(ticket, options.signal());
        return { kind: 'escalated', reason: outcome.reason, filed: filed.ok };
      }

      // outcome.outcome === 'auto'. In Training the owner answers everything: the rule that would have run it is not used, and the
      // suggestion stays for approval. (Read again here, not only at the start: the owner may have switched while the server answered.)
      if (options.focus() === 'training') return { kind: 'ask', reason: 'training' };
      const rule = outcome.ruleId as string; // always set for an `auto` answer
      const sent = options.gate.send(suggestion.command);
      const at = now();
      const bucket = { sphere: suggestion.sphere, kind: outcome.kind };
      if (!sent.ok) {
        const decision: Decision = { ...bucket, id: newId(), suggestionId: suggestion.id, character: suggestion.character, at, outcome: 'refused', rule: sent.reason };
        const posted = await options.api.postDecision(decision, options.signal());
        return { kind: 'refused', refused: sent.reason, entry: { at, suggestionId: suggestion.id, action: 'auto', rule, recorded: posted.ok, refused: sent.reason } };
      }
      const command = suggestion.command.trim();
      const decision: Decision = { ...bucket, id: newId(), suggestionId: suggestion.id, character: suggestion.character, at, outcome: 'auto', command, rule };
      const posted = await options.api.postDecision(decision, options.signal());
      return { kind: 'ran', entry: { at, suggestionId: suggestion.id, action: 'auto', rule, command, recorded: posted.ok } };
    },
  };
}
