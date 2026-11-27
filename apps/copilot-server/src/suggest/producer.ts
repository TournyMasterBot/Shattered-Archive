import { randomUUID } from 'node:crypto';
import {
  MAX_SUMMARY,
  classifyCommand,
  moreRestrictive,
  toConfidence,
  type ActionKind,
  type Confidence,
  type EscalationTicket,
  type Sphere,
  type Suggestion,
} from '@shatteredarchive/copilot-core';
import type { ModelClient, ModelFailure } from '../models/types.js';
import type { FightGateFn } from '../fight/gate.js';
import { urgentFor } from '../fight/urgent.js';
import { buildRepairPrompt, buildWatcherPrompt, parseWatcherAnswer, type WatcherAnswer } from './prompt.js';
import type { Route } from './router.js';
import type { Situation } from './situation.js';

export interface ProduceResult {
  suggestion?: Suggestion;
  /** Escalation tickets to file: an unusable answer (E5), or a situation sent to the wrong sphere. */
  tickets: EscalationTicket[];
  /** The fight rule held the command back (a monster too strong, or a fight the game does not allow): there is no suggestion, and this says why. */
  held?: string;
  /** Set when the model could not be reached (timeout, refused, no model): nothing for a teacher to learn from it. */
  failure?: ModelFailure;
}

export interface ProducerDeps {
  model: ModelClient;
  route: (situation: Situation, options: { start?: Sphere; signal?: AbortSignal }) => Promise<Route>;
  /**
   * The evidence the map has for a movement command (0 to 1), or null when it has none. Movement takes its confidence from here,
   * never from the model's rating. Until the map exists this is `() => null`, which makes every movement an ask.
   */
  mapEvidence: (situation: Situation, command: string) => number | null;
  /**
   * The rule that keeps a fight from starting blind (see fight/gate.ts): each proposed command goes through it, and a fight command whose
   * monster is not identified is replaced by a `consider`, or held back. Absent: every command stands as the model proposed it.
   */
  fightGate?: FightGateFn;
  /** The sphere map's hint for a wrong turn from one sphere to another, put in the `wrong-sphere` ticket (absent: none). */
  misrouteHint?: (from: Sphere, to: Sphere) => string | undefined;
  now: () => number;
  newId?: (prefix: string) => string;
}

/** The watcher's answer, or the reason the model could not be asked. */
type Answer = WatcherAnswer | { ok: false; failure: ModelFailure };

/** The longest rationale a suggestion carries (the prompt asks the model for one sentence; this bounds the code-made ones). */
const MAX_RATIONALE = 500;

const defaultId = (prefix: string): string => `${prefix}-${randomUUID()}`;

/**
 * Builds suggestions from the live situation. One watcher call, one repair call at most (E5); an answer that is still unusable files an
 * `unknown-situation` ticket and gives no suggestion. A model that says the situation is not in its sphere is sent to the sphere it names
 * once (and a `wrong-sphere` ticket records the misroute for the teacher); a second such answer is an unknown situation.
 */
export function createProducer(deps: ProducerDeps) {
  const newId = deps.newId ?? defaultId;

  function ticket(situation: Situation, reason: EscalationTicket['reason'], sphere: Sphere, kind: ActionKind, summary: string): EscalationTicket {
    return {
      id: newId('t'),
      createdAt: deps.now(),
      character: situation.character,
      reason,
      sphere,
      kind,
      situationKey: situation.situationKey,
      summary,
      status: 'open',
    };
  }

  /** Ask the watcher, and once more if the answer is unusable. */
  async function ask(situation: Situation, route: Route, signal?: AbortSignal): Promise<Answer> {
    let problem = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = attempt === 0 ? buildWatcherPrompt(situation, route) : buildRepairPrompt(situation, route, problem);
      const reply = await deps.model.generate('watcher', prompt, signal);
      if (!reply.ok) return { ok: false, failure: reply.reason };
      const answer = parseWatcherAnswer(reply.text);
      if (answer.ok) return answer;
      problem = answer.problem;
    }
    return { ok: false, problem };
  }

  function build(situation: Situation, route: Route, answer: Extract<WatcherAnswer, { kind: 'command' }>): Suggestion {
    const kind = moreRestrictive(answer.actionKind, classifyCommand(answer.command, { inFight: situation.game.inFight }));
    const movement = kind === 'move';
    const confidence: Confidence = movement ? toConfidence(deps.mapEvidence(situation, answer.command)) : toConfidence(answer.confidence);
    return {
      id: newId('s'),
      character: situation.character,
      createdAt: deps.now(),
      mode: situation.mode,
      sphere: route.sphere,
      kind,
      command: answer.command,
      rationale: answer.rationale,
      confidence,
      confidenceSource: movement ? 'map-evidence' : 'model',
      situationKey: situation.situationKey,
    };
  }

  return {
    /**
     * A suggestion the code makes by itself from the fight's own numbers, with no model: leaving a fight that is being lost cannot wait for
     * a model that is seconds behind. Undefined when nothing is urgent.
     */
    urgent(situation: Situation): Suggestion | undefined {
      const urgent = situation.fight === undefined ? undefined : urgentFor(situation.fight);
      if (urgent === undefined) return undefined;
      return {
        id: newId('s'),
        character: situation.character,
        createdAt: deps.now(),
        mode: situation.mode,
        sphere: 'fighting',
        kind: classifyCommand(urgent.command, { inFight: situation.game.inFight }),
        command: urgent.command,
        rationale: urgent.rationale,
        confidence: null,
        confidenceSource: 'model',
        situationKey: situation.situationKey,
      };
    },

    async produce(situation: Situation, signal?: AbortSignal): Promise<ProduceResult> {
      const tickets: EscalationTicket[] = [];
      let route = await deps.route(situation, { signal });
      let answer = await ask(situation, route, signal);

      if (answer.ok && answer.kind === 'wrong-sphere') {
        // the sphere map's hint for this wrong turn tells the teacher (and, in the summary, the owner) where the model usually goes astray
        const hint = deps.misrouteHint?.(route.sphere, answer.sphere);
        const said = `The model said this belongs to the ${answer.sphere} sphere, not ${route.sphere}`;
        tickets.push(ticket(situation, 'wrong-sphere', route.sphere, 'unknown', (hint === undefined ? said : `${said}. Hint: ${hint}`).slice(0, MAX_SUMMARY)));
        route = await deps.route(situation, { start: answer.sphere, signal });
        answer = await ask(situation, route, signal);
      }

      if ('failure' in answer) return { tickets, failure: answer.failure };
      if (!answer.ok) {
        tickets.push(ticket(situation, 'unknown-situation', route.sphere, 'unknown', `The model gave no usable answer for ${situation.situationKey}: ${answer.problem}`));
        return { tickets };
      }
      if (answer.kind === 'wrong-sphere') {
        tickets.push(ticket(situation, 'unknown-situation', route.sphere, 'unknown', `The model could not place ${situation.situationKey} in any sphere`));
        return { tickets };
      }
      const suggestion = build(situation, route, answer);
      const gate = await deps.fightGate?.(situation, suggestion.command, signal);
      if (gate?.action === 'hold') return { tickets, held: gate.rationale };
      if (gate?.action === 'replace') {
        suggestion.command = gate.command;
        suggestion.rationale = gate.rationale.slice(0, MAX_RATIONALE);
        suggestion.kind = classifyCommand(gate.command, { inFight: situation.game.inFight });
        suggestion.confidence = toConfidence(0.95);
        suggestion.confidenceSource = 'model';
      }
      return { suggestion, tickets };
    },
  };
}

export type Producer = ReturnType<typeof createProducer>;
