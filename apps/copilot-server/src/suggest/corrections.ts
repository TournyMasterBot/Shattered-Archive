import { randomUUID } from 'node:crypto';
import {
  checkUnderstanding,
  type Decision,
  type EscalationTicket,
  type JsonlStore,
  type Lesson,
  type Suggestion,
} from '@shatteredarchive/copilot-core';
import type { ModelClient } from '../models/types.js';
import { buildRestatePrompt } from './prompt.js';

export type CorrectionOutcome = 'lesson' | 'ticket' | 'ignored';

export interface CorrectionDeps {
  model: ModelClient;
  lessons: JsonlStore<Lesson>;
  tickets: JsonlStore<EscalationTicket>;
  /** The suggestion a decision answers, if the server still has it. */
  findSuggestion: (id: string) => Suggestion | undefined;
  /** Replaces character names with codenames in anything shown to a model. */
  redact: (text: string) => string;
  now: () => number;
  newId?: (prefix: string) => string;
  /**
   * The handler of the AI trainer's corrections (Claude training mode): a correction that was understood becomes an ACCEPTED lesson for the
   * Simulacrum, stamped with the trainer, so it steers Copilot there at once; it never applies to the DSL (the router filters by world). The
   * owner's handler leaves the lesson proposed until a teaching session accepts it.
   */
  trainer?: boolean;
}

const defaultId = (prefix: string): string => `${prefix}-${randomUUID()}`;

/**
 * What happens to an owner's correction (diagram D6). The agent role restates it as JSON; a MECHANICAL check (`checkUnderstanding`)
 * decides whether it was understood. Understood: a lesson with status `proposed` is stored. It is never applied as shared until a
 * teaching session accepts it (E6): the router only reads `accepted` lessons. Not understood, the model unavailable, or the original
 * suggestion gone: an escalation ticket for the teaching session.
 */
export function createCorrectionHandler(deps: CorrectionDeps) {
  const newId = deps.newId ?? defaultId;

  async function openTicket(decision: Decision, suggestion: Suggestion | undefined, summary: string): Promise<CorrectionOutcome> {
    const saved = await deps.tickets.append({
      id: newId('t'),
      createdAt: deps.now(),
      character: decision.character,
      reason: 'correction-not-understood',
      sphere: suggestion?.sphere ?? 'world',
      kind: suggestion?.kind ?? 'unknown',
      situationKey: suggestion?.situationKey ?? 'unknown',
      summary: summary.slice(0, 500),
      status: 'open',
      decisionId: decision.id,
    });
    return saved.ok ? 'ticket' : 'ignored';
  }

  return {
    /** Handle a decision that was just saved. Only a correction with a command needs anything; the rest is `ignored`. Never throws. */
    async handle(decision: Decision): Promise<CorrectionOutcome> {
      if (decision.outcome !== 'corrected' || decision.command === undefined) return 'ignored';
      try {
        const suggestion = deps.findSuggestion(decision.suggestionId);
        if (suggestion === undefined) return await openTicket(decision, undefined, 'The suggestion this correction answers is no longer available');

        const reply = await deps.model.generate('agent', buildRestatePrompt(suggestion, decision.command, decision.why, deps.redact));
        if (!reply.ok) return await openTicket(decision, suggestion, `The agent could not be asked (${reply.reason})`);

        const understood = checkUnderstanding(suggestion, { command: decision.command, why: decision.why }, reply.text);
        if (!understood.ok) return await openTicket(decision, suggestion, `The agent did not understand the correction: ${understood.problems.join('; ')}`);

        const saved = await deps.lessons.append({
          id: newId('l'),
          createdAt: deps.now(),
          sphere: suggestion.sphere,
          situationKey: suggestion.situationKey,
          scope: 'shared',
          world: deps.trainer ? 'sandbox' : 'dsl',
          rule: understood.rule,
          sourceDecisionId: decision.id,
          status: deps.trainer ? 'accepted' : 'proposed',
          ...(deps.trainer ? { trainer: 'claude' as const } : {}),
        });
        return saved.ok ? 'lesson' : await openTicket(decision, suggestion, 'The lesson could not be saved');
      } catch {
        return 'ignored'; // a failing store must not break the request that triggered this
      }
    },
  };
}

export type CorrectionHandler = ReturnType<typeof createCorrectionHandler>;
