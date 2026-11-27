import path from 'node:path';
import { randomInt } from 'node:crypto';
import type { Server } from 'node:http';
import {
  formatCodename,
  validateDecision,
  validateFinding,
  validateLesson,
  validateOccurrence,
  validateTicket,
  JsonlStore,
  type Decision,
  type EscalationTicket,
  type Finding,
  type Lesson,
  type ScenarioOccurrence,
} from '@shatteredarchive/copilot-core';
import { createApp, type RequestLogEntry } from './app.js';
import { ConfigError, loadConfig, type CopilotServerConfig } from './config.js';
import { createCharacterFeed } from './characters/feed.js';
import { readMatrixFile } from './characters/matrixFile.js';
import { CharacterService } from './characters/service.js';
import { nodeLedgerFs, nodeWorldIo } from './fs.js';
import { createLearning, type Learning } from './learning.js';
import { buildStateView } from './routes/state.js';
import { Pipeline } from './tail/pipeline.js';
import { createTeacher } from './teacher/service.js';
import { Tailer } from './tail/tailer.js';
import { createSuggestionParts, type SuggestionParts } from './suggest/wiring.js';
import { createHintTiers } from './hints/wiring.js';
import { validateRule, type HintRule } from './hints/rules.js';
import { combineEvidence, createAuditedEvidence, loadAuditedLayer, noEvidence } from './world/audited.js';
import { createFightWatch } from './fight/watch.js';
import { createTraining } from './training.js';
import { createWorldFeed } from './world/feed.js';
import { createNameLabeler } from './world/lookup.js';
import { WorldMemory } from './world/memory.js';
import { fanOut, WorldRouter } from './world/router.js';

export const VERSION = '0.1.0';
const LEDGER_MAX_BYTES = 20 * 1024 * 1024;

/** What to print when the server cannot start. A config refusal carries its own safe message; nothing else is described. */
export function describeStartupError(error: unknown): string {
  return error instanceof ConfigError ? `[copilot-server] ${error.message}` : '[copilot-server] failed to start';
}

/**
 * Read the configuration, open the ledger in the data directory, and listen. Throws a ConfigError (before touching any file) unless
 * Copilot is enabled and every setting is local. Resolves when the server is listening.
 */
export async function startServer(
  env: Record<string, string | undefined>,
  log: (line: string) => void = console.log,
  tail: { pollMs?: number; scanMs?: number } = {},
  options: {
    /** How long to wait between tries to load the model while the model server is unreachable (default 10 s; there are 6 tries at start). */
    warmRetryMs?: number;
  } = {},
): Promise<{
  server: Server;
  config: CopilotServerConfig;
  pipeline: Pipeline;
  tailer: Tailer;
  characters: CharacterService;
  suggestions: SuggestionParts | undefined;
  world: WorldMemory;
  learning: Learning;
}> {
  const config = loadConfig(env);

  const ledger = path.join(config.dataDir, 'ledger');
  const { store: decisions, report: decisionReport } = await JsonlStore.open<Decision>({
    fs: nodeLedgerFs,
    path: path.join(ledger, 'decisions.jsonl'),
    validate: validateDecision,
    maxBytes: LEDGER_MAX_BYTES,
  });
  const { store: tickets, report: ticketReport } = await JsonlStore.open<EscalationTicket>({
    fs: nodeLedgerFs,
    path: path.join(ledger, 'tickets.jsonl'),
    validate: validateTicket,
    maxBytes: LEDGER_MAX_BYTES,
  });
  const { store: lessons, report: lessonReport } = await JsonlStore.open<Lesson>({
    fs: nodeLedgerFs,
    path: path.join(ledger, 'lessons.jsonl'),
    validate: validateLesson,
    maxBytes: LEDGER_MAX_BYTES,
  });
  const { store: findings, report: findingReport } = await JsonlStore.open<Finding>({
    fs: nodeLedgerFs,
    path: path.join(ledger, 'findings.jsonl'),
    validate: validateFinding,
    maxBytes: LEDGER_MAX_BYTES,
  });
  const { store: occurrences } = await JsonlStore.open<ScenarioOccurrence>({
    fs: nodeLedgerFs,
    path: path.join(ledger, 'occurrences.jsonl'),
    validate: validateOccurrence,
    maxBytes: LEDGER_MAX_BYTES,
  });
  // The AI trainer's own ledger (Claude training mode, Simulacrum only): kept apart from the owner's, never counted toward its earned confidence.
  const trainerDir = path.join(config.dataDir, 'training');
  const { store: trainerDecisions } = await JsonlStore.open<Decision>({ fs: nodeLedgerFs, path: path.join(trainerDir, 'decisions.jsonl'), validate: validateDecision, maxBytes: LEDGER_MAX_BYTES });
  const { store: trainerLessons } = await JsonlStore.open<Lesson>({ fs: nodeLedgerFs, path: path.join(trainerDir, 'lessons.jsonl'), validate: validateLesson, maxBytes: LEDGER_MAX_BYTES });
  const { store: trainerTickets } = await JsonlStore.open<EscalationTicket>({ fs: nodeLedgerFs, path: path.join(trainerDir, 'tickets.jsonl'), validate: validateTicket, maxBytes: LEDGER_MAX_BYTES });
  // What the owner or Claude taught for rooms (the learned hint tier): a ledger of its own, never counted toward the earned confidence of anything.
  const { store: hintRules } = await JsonlStore.open<HintRule>({ fs: nodeLedgerFs, path: path.join(config.dataDir, 'hints', 'rules.jsonl'), validate: validateRule, maxBytes: LEDGER_MAX_BYTES });
  if (findingReport.records > 0 || findingReport.skipped > 0) {
    log(`[copilot-server] findings loaded: ${findingReport.records} (${findingReport.skipped} skipped)`);
  }
  log(
    `[copilot-server] ledger loaded: ${decisionReport.records} decisions (${decisionReport.skipped} skipped), ${ticketReport.records} tickets (${ticketReport.skipped} skipped)`,
  );
  if (lessonReport.records > 0 || lessonReport.skipped > 0) {
    log(`[copilot-server] lessons loaded: ${lessonReport.records} (${lessonReport.skipped} skipped)`);
  }

  // The character registry. Without the private test matrix nobody is registered (a test character must never get a real codename).
  const matrixLoad = await readMatrixFile(config.matrixPath);
  log(
    matrixLoad.matrix === undefined
      ? '[copilot-server] test-character matrix not available: no character will be registered'
      : `[copilot-server] test-character matrix loaded: ${matrixLoad.rows} rows (${matrixLoad.rejected} rejected)`,
  );
  const { service: characters, skipped: characterSkipped } = await CharacterService.open({
    fs: nodeLedgerFs,
    dir: path.join(config.dataDir, 'characters'),
    matrix: matrixLoad.matrix,
    now: Date.now,
  });
  log(
    `[copilot-server] character registry loaded: ${characters.list().length} characters (${characterSkipped} skipped)`,
  );
  const characterFeed = createCharacterFeed(characters);
  // The teaching side: bundles for a Claude Code session, its findings, the owner's acceptance and the training counts.
  const teacher = createTeacher({
    fs: nodeLedgerFs,
    dataDir: config.dataDir,
    tickets,
    decisions,
    lessons,
    findings,
    occurrences,
    redact: (text) => characters.redact(text),
  });

  // The walked-evidence layers: what the character has seen of each world (rooms, exits, what rooms usually hold). One layer per world: the
  // DSL's is the one the routes serve, the Simulacrum's is its own file, and a view goes to the layer of the world its CONNECTION went to.
  const openWorld = (file: string) =>
    WorldMemory.open({
      io: nodeWorldIo,
      file: path.join(config.dataDir, 'world', file),
      baseline: config.worldBaseline,
      random: () => randomInt(0, 4_294_967_296) / 4_294_967_296,
    });
  const { memory: world, loaded: worldLoaded } = await openWorld('memory.json');
  const { memory: sandboxWorld } = await openWorld('sandbox.json');
  log(`[copilot-server] world memory: ${worldLoaded} (${world.counts.rooms} rooms, ${world.counts.links} exits)`);
  log(`[copilot-server] simulacrum memory: ${sandboxWorld.counts.rooms} rooms`);
  // The DSL's audited map (Azah's map checked against the owner's play), when one has been built: live evidence for movement, DSL views only.
  let audited: ReturnType<typeof createAuditedEvidence> | undefined;
  try {
    const layer = await loadAuditedLayer(path.join(config.dataDir, 'world-map', 'audited'));
    audited = layer === undefined ? undefined : createAuditedEvidence(layer);
  } catch (error) {
    log(`[copilot-server] the audited map could not be used: ${(error as Error).message}`);
  }
  log(`[copilot-server] audited map: ${audited === undefined ? 'none' : 'loaded'}`);
  const router = new WorldRouter({ dsl: audited === undefined ? world : fanOut(world, audited.tracer), sandbox: sandboxWorld });
  const names = createNameLabeler({ baseUrl: config.archiveUrl });
  const worldFeed = createWorldFeed({
    memory: router,
    onSession: (session) => router.setTarget(session.state === 'connected' ? session.target : undefined),
    character: () => {
      const active = characters.current;
      return active === undefined ? undefined : formatCodename(active.codename, active.gender);
    },
    label: names.label,
    refreshNames: () => void names.refresh(),
  });

  // The log feed: tail the game-server jsonl, fold it into the game state. Stops when the server closes. The character registry sees
  // each batch first, so the active character is known when the world memory stores a room view.
  const fightWatch = createFightWatch();
  const pipeline = new Pipeline({
    onFeed: async (events) => {
      await characterFeed.handle(events);
      await worldFeed.handle(events);
      fightWatch.handle(events);
    },
  });
  // The hint tiers (learned rules, the instant word list, the local model when allowed, a ticket when nothing knows the room): no model is needed for them.
  const hints = createHintTiers({ config, characters, tickets, rules: hintRules });
  // Suggestions need a model; with backend none only the registry's own whoisic offer exists.
  const suggestions = await createSuggestionParts({
    config,
    characters,
    pipeline,
    tickets,
    lessons,
    hints: hints.engine,
    fight: { watch: fightWatch, world: () => router.current },
    trainer: { lessons: trainerLessons, tickets: trainerTickets },
    // each source knows a room only while the connection is of its own world, so at most one of them speaks for the current room
    mapEvidence: combineEvidence([world.edgeEvidence.bind(world), sandboxWorld.edgeEvidence.bind(sandboxWorld), audited?.edgeEvidence ?? noEvidence]),
  });
  log(`[copilot-server] model backend: ${config.model.backend}`);
  // Learning is OFF at every start: the owner turns Copilot on in the game client, which tells the server (POST /control). Off means the
  // tailer does no pass at all, and turning it on skips to the end of every file, so nothing written while off is ever learned.
  const learning = createLearning((on) => {
    tailer.setPaused(!on);
    // either way the suggestions start over: no model call goes on while off, and nothing made before a switch is offered after it
    suggestions?.service.reset();
    log(`[copilot-server] learning ${on ? 'on' : 'off'}`);
    if (on) void warmModel(1); // a model the server unloaded while idle is loaded again before the first suggestion needs it
  });
  // Loads the model into the model server's memory, so the first suggestion does not wait for the load. The model server may still be
  // starting when this one is (separate compose projects): `attempts` tries, `warmRetryMs` apart, while it is unreachable. One at a time.
  let warming = false;
  const warmModel = async (attempts: number): Promise<void> => {
    const model = suggestions?.model;
    if (model?.warm === undefined || warming) return;
    warming = true;
    try {
      for (let attempt = 1; attempt <= attempts && !stopTail.signal.aborted; attempt++) {
        const reports = await model.warm(stopTail.signal);
        for (const report of reports) {
          log(`[copilot-server] model ${report.model}: ${report.state === 'missing' ? 'not installed on the model server (ollama pull it)' : report.state}`);
        }
        if (!reports.some((report) => report.state === 'unreachable') || attempt === attempts) break;
        await new Promise((resolve) => setTimeout(resolve, options.warmRetryMs ?? 10_000));
      }
    } finally {
      warming = false;
    }
  };
  const tailer = new Tailer({
    dir: config.logDir,
    checkpointPath: path.join(config.dataDir, 'tail', 'checkpoints.json'),
    onBatch: (batch) => pipeline.ingest(batch.lines),
    onPollEnd: async () => {
      await characterFeed.settle(Date.now());
      // a pass that was already running when Copilot was switched off ends after the switch: it must not start a model call
      if (learning.enabled()) suggestions?.service.poke();
    },
    ...tail,
  });
  tailer.setPaused(true);
  const stopTail = new AbortController();
  // Claude training mode: on only while Copilot is on and the connection is the Simulacrum's; it turns itself off when either stops holding.
  const training = createTraining({ world: () => router.current, learning: () => learning.enabled(), onChange: (on) => log(`[copilot-server] Claude training ${on ? 'on' : 'off'}`) });

  const app = createApp({
    allowedOrigins: config.allowedOrigins,
    stores: { decisions, tickets, lessons },
    training,
    trainerDecisions,
    version: VERSION,
    startedAt: Date.now(),
    getState: () =>
      buildStateView(pipeline.game, Date.now(), config.staleSeconds * 1000, pipeline.counters, tailer.stats, learning.enabled()),
    getCharacters: () => characters.list(),
    getDescription: (codename) => characters.getDescription(codename),
    getSuggestions: () => {
      if (!learning.enabled()) return []; // Copilot is off: nothing is offered, whatever was made before it was switched off
      const offer = characters.descriptionSuggestion(pipeline.game.connected);
      return [...(offer === undefined ? [] : [offer]), ...(suggestions?.service.current() ?? [])];
    },
    onDecision: async (decision) => {
      // the trainer's answers are not the owner's: no scenario occurrence, its own corrections handler (a Simulacrum lesson), nothing for the owner's teaching
      if (decision.trainer !== undefined) {
        suggestions?.service.answered(decision);
        await suggestions?.trainerCorrections?.handle(decision);
        return;
      }
      // looked up before `answered` retires it: the situation is what makes this an occurrence of a scenario
      await teacher.recordOccurrence(decision, suggestions?.service.find(decision.suggestionId));
      suggestions?.service.answered(decision);
      await suggestions?.corrections.handle(decision);
    },
    teacher,
    hints,
    learning,
    world: {
      room: (id) => world.room(id),
      candidates: () => world.candidates(),
      stats: () => ({ ...world.stats, ...world.counts }),
      near: (id, title, exits) => (id === 'dsl' ? world.near(title, exits) : id === 'sandbox' ? sandboxWorld.near(title, exits) : undefined),
    },
    // method, route pattern and status only; see app.ts
    log: (entry: RequestLogEntry) => log(`[copilot-server] ${entry.method} ${entry.route} ${entry.status}`),
  });

  // Express 5 passes a listen failure (such as a port already in use) to this callback instead of throwing.
  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(config.port, config.host, (error?: Error) =>
      error ? reject(error) : resolve(listening),
    );
  });
  server.once('close', () => {
    stopTail.abort();
    suggestions?.service.stop();
  });
  void tailer.run(stopTail.signal);
  void warmModel(6);
  log('[copilot-server] learning is off until the game client turns Copilot on');
  log(`[copilot-server] listening on ${config.host}:${config.port} (local-only)`);
  return { server, config, pipeline, tailer, characters, suggestions, world, learning };
}
