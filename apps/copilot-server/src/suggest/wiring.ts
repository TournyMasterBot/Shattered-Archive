import { formatCodename, isStale, type EscalationTicket, type JsonlStore, type Lesson } from '@shatteredarchive/copilot-core';
import type { CharacterService } from '../characters/service.js';
import type { HintEngine } from '../hints/engine.js';
import type { CopilotServerConfig } from '../config.js';
import { createFakeModel } from '../models/fake.js';
import { createOllamaClient } from '../models/ollama.js';
import type { ModelClient } from '../models/types.js';
import type { Pipeline } from '../tail/pipeline.js';
import { createCorrectionHandler, type CorrectionHandler } from './corrections.js';
import { createFightGate } from '../fight/gate.js';
import { httpMonsterLookup } from '../fight/monsterLookup.js';
import type { FightWatch } from '../fight/watch.js';
import type { World } from '../world/worlds.js';
import { createHintFacts } from './hintFacts.js';
import { httpLookup } from './lookup.js';
import { createProducer } from './producer.js';
import { routeSituation, type Lookup } from './router.js';
import { SuggestionService } from './service.js';
import { inferMode, recentLines, situationKeyFor, type Situation } from './situation.js';
import { readSpheres } from './spheres.js';

export interface SuggestionParts {
  service: SuggestionService;
  corrections: CorrectionHandler;
  /** The handler of the AI trainer's corrections (Claude training mode), when the trainer's stores were given. */
  trainerCorrections?: CorrectionHandler;
  /** The model behind the producer (the server warms it at start and at every switch-on). */
  model: ModelClient;
}

export interface SuggestionWiring {
  config: CopilotServerConfig;
  characters: CharacterService;
  pipeline: Pipeline;
  tickets: JsonlStore<EscalationTicket>;
  lessons: JsonlStore<Lesson>;
  now?: () => number;
  /** A model to use instead of the configured backend (tests). */
  model?: ModelClient;
  /**
   * The evidence the walked map has for a movement command in a room (see ProducerDeps.mapEvidence). Absent: none, so every movement
   * asks the owner.
   */
  mapEvidence?: (roomTitle: string | undefined, command: string) => number | null;
  /**
   * What the log feed has learned about fights, and the world of the connection. With it, no fight is proposed against a monster that
   * is not identified (archive lookup, else `consider`) and a fight in progress is followed by the code. Absent: no fight rule (tests).
   */
  fight?: { watch: FightWatch; world: () => World | undefined };
  /**
   * The AI trainer's own stores (Claude training mode, Simulacrum only): its lessons are read by the router next to the owner's (the router
   * keeps each lesson to its own world), and its corrections are handled apart from the owner's.
   */
  trainer?: { lessons: JsonlStore<Lesson>; tickets: JsonlStore<EscalationTicket> };
  /** The hint tiers (learned, instant, local, escalate), asked for every situation so the hint command is used regularly. Absent: no hints in the prompt. */
  hints?: HintEngine;
}

const RECENT_LINES = 12;

/** The model for the configured backend, or undefined for `none`. The Ollama client refuses anything that is not local. */
export function createModel(config: CopilotServerConfig): ModelClient | undefined {
  const { model } = config;
  if (model.backend === 'fake') return createFakeModel();
  if (model.backend === 'ollama') {
    return createOllamaClient({
      baseUrl: model.ollamaUrl as string,
      models: { watcher: model.watcherModel as string, agent: model.agentModel as string },
      timeoutMs: model.timeoutMs,
    });
  }
  return undefined;
}

/**
 * Connects the producer, the router, the correction handler and the suggestion service to the live state. Undefined when no model is
 * configured: then only the character registry's own `whoisic` offer exists.
 */
export async function createSuggestionParts(wiring: SuggestionWiring): Promise<SuggestionParts | undefined> {
  const { config, characters, pipeline, tickets, lessons } = wiring;
  const now = wiring.now ?? Date.now;
  const model = wiring.model ?? createModel(config);
  if (model === undefined) return undefined;

  const spheres = await readSpheres(config.spheresPath);
  const lookup: Lookup = config.archiveUrl === undefined ? async () => [] : httpLookup({ baseUrl: config.archiveUrl });
  const producer = createProducer({
    model,
    route: (situation, options) =>
      routeSituation(situation, { spheres, lookup, lessons: () => [...lessons.query(), ...(wiring.trainer?.lessons.query() ?? [])], world: wiring.fight?.world, ...(wiring.hints === undefined ? {} : { hints: createHintFacts(wiring.hints) }) }, options),
    // movement takes its confidence from the walked map; with no map (or no evidence for this exit) every movement asks
    mapEvidence: (situation, command) => wiring.mapEvidence?.(situation.game.room?.name, command) ?? null,
    misrouteHint: spheres.misrouteHint,
    fightGate:
      wiring.fight === undefined
        ? undefined
        : createFightGate({
            watch: wiring.fight.watch,
            world: wiring.fight.world,
            monsterLookup: config.archiveUrl === undefined ? undefined : httpMonsterLookup({ baseUrl: config.archiveUrl }),
            now,
          }),
    now,
  });

  const situation = (): Situation | undefined => {
    const game = pipeline.game;
    const active = characters.current;
    if (active === undefined || !game.connected || isStale(game, now(), config.staleSeconds * 1000)) return undefined;
    const mode = inferMode(game);
    const fight = wiring.fight?.watch.fight(now());
    return {
      character: formatCodename(active.codename, active.gender),
      mode,
      game,
      lines: recentLines(pipeline.recent(), RECENT_LINES, (text) => characters.redact(text)),
      now: now(),
      situationKey: situationKeyFor(mode, game),
      ...(fight?.active ? { fight } : {}),
    };
  };

  const service = new SuggestionService({ producer, situation, tickets, now });
  const corrections = createCorrectionHandler({
    model,
    lessons,
    tickets,
    findSuggestion: (id) => service.find(id),
    redact: (text) => characters.redact(text),
    now,
  });
  const trainerCorrections =
    wiring.trainer === undefined
      ? undefined
      : createCorrectionHandler({
          model,
          lessons: wiring.trainer.lessons,
          tickets: wiring.trainer.tickets,
          findSuggestion: (id) => service.find(id),
          redact: (text) => characters.redact(text),
          now,
          trainer: true,
        });
  return { service, corrections, trainerCorrections, model };
}
