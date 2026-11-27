// apps/copilot-server/src/hints/wiring.ts
//
// Builds the hint tiers from the server's pieces and offers them to the HTTP side (`GET /hints`, `GET|POST /hints/rules`) and to the suggestion producer.
// No model is needed for any of it: the learned rules are a ledger, the instant tier is a word-list lookup on the DSL site, the local-model tier is off unless
// `COPILOT_HINTS_LOCAL=1`, and the escalation is an ordinary ticket.

import { formatCodename, type EscalationTicket, type JsonlStore } from '@shatteredarchive/copilot-core';
import type { CharacterService } from '../characters/service.js';
import type { CopilotServerConfig } from '../config.js';
import { createHintEngine, type HintEngine } from './engine.js';
import { instantTier, localTier } from './instant.js';
import { learnedTier, makeRule, type HintRule, type NewRule } from './rules.js';

export interface HintTiersDeps {
  config: Pick<CopilotServerConfig, 'archiveUrl' | 'hintsLocal'>;
  characters: Pick<CharacterService, 'current'>;
  tickets: Pick<JsonlStore<EscalationTicket>, 'append'>;
  rules: JsonlStore<HintRule>;
  now?: () => number;
  fetch?: typeof fetch;
}

export interface HintTiers {
  engine: HintEngine;
  rules(): HintRule[];
  /** Teaches a rule (the owner's, or Claude's in a session). Refused with the reason when it is not a usable rule. */
  addRule(input: NewRule): Promise<{ ok: true; rule: HintRule } | { ok: false; problem: string }>;
}

export function createHintTiers(deps: HintTiersDeps): HintTiers {
  const now = deps.now ?? Date.now;
  const { archiveUrl } = deps.config;
  const engine = createHintEngine({
    learned: learnedTier(deps.rules),
    instant: archiveUrl === undefined ? async () => null : instantTier({ baseUrl: archiveUrl, fetch: deps.fetch }),
    local: archiveUrl === undefined ? undefined : localTier({ baseUrl: archiveUrl, fetch: deps.fetch, allowed: () => deps.config.hintsLocal }),
    // nothing above knew this room: a ticket for Claude (or the owner) to answer in a session; the answer becomes a learned rule, so the next ask is instant
    escalate: async (room, tried) => {
      const active = deps.characters.current;
      // a ticket names the character it belongs to: with nobody playing there is nothing to file it under (the engine tries again next time)
      if (active === undefined) throw new Error('no character is playing');
      const key = room.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100);
      const asked = tried.filter((t) => t !== 'escalated').join(', ');
      const result = await deps.tickets.append({
        id: `hint-${key.slice(0, 30)}-${now().toString(36)}`,
        createdAt: now(),
        character: formatCodename(active.codename, active.gender),
        reason: 'unknown-situation',
        sphere: 'interaction',
        kind: 'unknown',
        situationKey: `hint:${key}`,
        summary: `hint: no answer for the room ${room.title.slice(0, 120)} from ${asked}; teach it with POST /hints/rules`,
        status: 'open',
      });
      if (!result.ok) throw new Error('the ticket could not be written');
    },
    now,
  });
  return {
    engine,
    rules: () => deps.rules.query(),
    async addRule(input) {
      const made = makeRule(input, now());
      if (!made.ok) return made;
      const written = await deps.rules.append(made.rule);
      return written.ok ? made : { ok: false, problem: 'the rule could not be written' };
    },
  };
}
