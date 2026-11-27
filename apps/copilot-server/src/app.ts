import express, { type ErrorRequestHandler, type Express, type Request, type Response } from 'express';
import {
  ID_PATTERN,
  countBuckets,
  validateDecision,
  validateTicket,
  type Decision,
  type EscalationTicket,
  type JsonlStore,
  type Lesson,
  type Suggestion,
} from '@shatteredarchive/copilot-core';
import { ID_PATTERN as MAP_ID_PATTERN, type MapFile } from '@shatteredarchive/shattered-maps-core';
import type { CharacterSummary, DescriptionView } from './characters/service.js';
import { validateControl } from './learning.js';
import type { StateView } from './routes/state.js';
import type { TeacherApi } from './teacher/service.js';
import { validateTrainingRequest, type Training } from './training.js';
import { BODY_LIMIT, parseLessonStatus, parseLimit, parseStatus } from './validate.js';
import type { HintAnswer, HintRoom } from './hints/types.js';
import type { HintRule, NewRule } from './hints/rules.js';
import type { NearRoom, RoomReport, WorldStats } from './world/memory.js';

/** What the hint tiers offer the HTTP side (see hints/wiring.ts). */
export interface HintsApi {
  engine: { hint(room: HintRoom, signal?: AbortSignal): Promise<HintAnswer> };
  rules(): HintRule[];
  addRule(input: NewRule): Promise<{ ok: true; rule: HintRule } | { ok: false; problem: string }>;
}

/** What the world memory offers the HTTP side: read-only. */
export interface WorldApi {
  room(id: string): RoomReport | undefined;
  /** The candidate layer: every walked room, as a map file. */
  candidates(): MapFile;
  stats(): WorldStats & { rooms: number; links: number };
  /** Walked rooms with this title in one world's memory (best match first); undefined for a world the memory does not know. */
  near(world: string, title: string, exits: readonly string[]): NearRoom[] | undefined;
}

/** `Base-G`: a codename and a gender letter. The only shape the description route accepts. */
const CODENAME_PARAM = /^[A-Za-z][A-Za-z0-9]{0,23}-[MFU]$/;

export interface Stores {
  decisions: JsonlStore<Decision>;
  tickets: JsonlStore<EscalationTicket>;
  lessons: JsonlStore<Lesson>;
}

/** The only thing logged about a request. Never a body, a query, a header or any text from the game. */
export interface RequestLogEntry {
  method: string;
  /** The matched route pattern (`/decisions`), or `unmatched`. */
  route: string;
  status: number;
}

export interface AppDeps {
  allowedOrigins: readonly string[];
  stores: Stores;
  version: string;
  startedAt: number;
  log: (entry: RequestLogEntry) => void;
  /** Filled by later phases; an empty list until then. */
  getSuggestions?: () => Suggestion[];
  getCharacters?: () => CharacterSummary[];
  /** The stored description of a character by `Base-G` codename (names already replaced), or undefined. */
  getDescription?: (codename: string) => DescriptionView | undefined;
  /** The live game state from the log feed (see routes/state.ts). Absent when the feed is not running. */
  getState?: () => StateView;
  /**
   * Called after a NEW decision was saved (not a repeat of one already stored). The request does not wait for it: a correction
   * may need a model call. A rejection is swallowed here; the handler is expected to record its own failures.
   */
  onDecision?: (decision: Decision) => void | Promise<void>;
  /** Audit bundles, findings, the owner's acceptance and the training counts. Absent: those routes answer 503. */
  teacher?: TeacherApi;
  /** The walked-evidence layer (world memory). Absent: the /world routes answer 503. */
  world?: WorldApi;
  /** The learning switch (see learning.ts). Absent: the /control routes answer 503. */
  learning?: { enabled(): boolean; set(on: boolean): boolean };
  /**
   * Claude training mode (see training.ts). Absent: the /training routes answer 503 and every decision is the owner's. While it is on, a decision
   * is the trainer's: it is stamped `trainer: claude` and stored in `trainerDecisions`, never in the owner's ledger.
   */
  training?: Training;
  trainerDecisions?: JsonlStore<Decision>;
  /** The hint tiers: `GET /hints`, `GET|POST /hints/rules`. Absent: those routes answer 503. */
  hints?: HintsApi;
}

function sendError(res: Response, status: number, error: string, details?: string[]): void {
  res.status(status).json(details ? { error, details } : { error });
}

/**
 * The Copilot HTTP API. Local-only: the origin guard admits browsers only from the configured local origins, bodies are capped at
 * 64 KB, every body is validated by the strict validators of copilot-core, and nothing from a request is logged but its method,
 * route pattern and status.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  const allowed = new Set(deps.allowedOrigins);

  // ---- origin guard + CORS ---------------------------------------------------------------------------------------------
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin === undefined) return next(); // not a browser cross-origin call (curl, the nginx health check)
    if (!allowed.has(origin)) {
      res.on('finish', () => deps.log({ method: req.method, route: 'origin-guard', status: res.statusCode }));
      return sendError(res, 403, 'origin not allowed');
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: BODY_LIMIT, strict: true }));

  app.use((req, res, next) => {
    res.on('finish', () => deps.log({ method: req.method, route: req.route?.path ?? 'unmatched', status: res.statusCode }));
    next();
  });

  // ---- routes ----------------------------------------------------------------------------------------------------------
  app.get('/health', (_req, res) => {
    res.json({ ok: true, version: deps.version, startedAt: new Date(deps.startedAt).toISOString() });
  });

  app.get('/state', (_req, res) => {
    if (!deps.getState) return sendError(res, 503, 'log feed not running');
    res.json(deps.getState());
  });

  // The owner's Copilot switch, as the server sees it: whether it reads the game logs. POST (not PUT) so the CORS allow-list stays GET and POST.
  app.get('/control', (_req, res) => {
    if (!deps.learning) return sendError(res, 503, 'control not available');
    res.json({ enabled: deps.learning.enabled() });
  });

  app.post('/control', (req: Request, res: Response) => {
    if (!deps.learning) return sendError(res, 503, 'control not available');
    const checked = validateControl(req.body);
    if (!checked.ok) return sendError(res, 400, 'invalid control request', checked.errors);
    deps.learning.set(checked.enabled);
    res.json({ enabled: deps.learning.enabled() });
  });

  // ---- hints (Phase 42): what to try in a room, from the fastest tier that knows, and what the owner or Claude taught ---------------------------------
  const EXIT_CODE = /^[A-Za-z]{1,9}$/;
  app.get('/hints', async (req, res) => {
    if (!deps.hints) return sendError(res, 503, 'hints not available');
    const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';
    if (title === '' || title.length > 200) return sendError(res, 400, 'invalid title');
    const description = typeof req.query.description === 'string' ? req.query.description : undefined;
    if (description !== undefined && description.length > 4000) return sendError(res, 400, 'description is capped at 4000 characters');
    const exits = typeof req.query.exits === 'string' && req.query.exits !== '' ? req.query.exits.split(',').map((e) => e.trim()) : [];
    if (exits.length > 12 || exits.some((e) => !EXIT_CODE.test(e))) return sendError(res, 400, 'invalid exits');
    res.json(await deps.hints.engine.hint({ title, exits, ...(description === undefined ? {} : { description }) }));
  });

  app.get('/hints/rules', (_req, res) => {
    if (!deps.hints) return sendError(res, 503, 'hints not available');
    res.json({ rules: deps.hints.rules() });
  });

  app.post('/hints/rules', async (req: Request, res: Response) => {
    if (!deps.hints) return sendError(res, 503, 'hints not available');
    const body: unknown = req.body;
    const b = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;
    if (b === undefined) return sendError(res, 400, 'invalid rule', ['the body is not an object']);
    const commands = Array.isArray(b.commands) ? b.commands : undefined;
    if (typeof b.title !== 'string' || commands === undefined || commands.some((c) => typeof c !== 'string')) return sendError(res, 400, 'invalid rule', ['title and commands are required']);
    if (b.source !== 'owner' && b.source !== 'claude') return sendError(res, 400, 'invalid rule', ['source is owner or claude']);
    if (b.note !== undefined && typeof b.note !== 'string') return sendError(res, 400, 'invalid rule', ['note is text']);
    const made = await deps.hints.addRule({ title: b.title, commands: commands as string[], source: b.source, ...(b.note === undefined ? {} : { note: b.note }) });
    if (!made.ok) return sendError(res, 400, 'invalid rule', [made.problem]);
    res.status(201).json({ rule: made.rule });
  });

  app.get('/suggestions', (_req, res) => {
    res.json({ suggestions: deps.getSuggestions ? deps.getSuggestions() : [] });
  });

  app.get('/characters', (_req, res) => {
    res.json({ characters: deps.getCharacters ? deps.getCharacters() : [] });
  });

  app.get('/characters/:codename/description', (req, res) => {
    if (!CODENAME_PARAM.test(req.params.codename)) return sendError(res, 400, 'invalid codename');
    const found = deps.getDescription?.(req.params.codename);
    if (found === undefined) return sendError(res, 404, 'no description stored');
    res.json(found);
  });

  // Claude training mode: whether it is on, which world the connection is in, and why it cannot be turned on now. POST so the CORS list stays GET and POST.
  app.get('/training', (_req, res) => {
    if (!deps.training) return sendError(res, 503, 'training not available');
    res.json(deps.training.status());
  });

  app.post('/training', (req: Request, res: Response) => {
    if (!deps.training) return sendError(res, 503, 'training not available');
    const checked = validateTrainingRequest(req.body);
    if (!checked.ok) return sendError(res, 400, 'invalid training request', checked.errors);
    const result = deps.training.set(checked.enabled);
    if (!result.ok) return res.status(409).json({ error: 'training cannot be turned on now', reason: result.reason });
    res.json(deps.training.status());
  });

  app.post('/decisions', async (req: Request, res: Response) => {
    const checked = validateDecision(req.body);
    if (!checked.ok) return sendError(res, 400, 'invalid decision', checked.errors);
    // while training is on every decision is the trainer's and goes to its own ledger; a decision that CLAIMS to be the trainer's while it is off is refused
    const training = deps.training?.enabled() === true && deps.trainerDecisions !== undefined;
    if (checked.value.trainer !== undefined && !training) return sendError(res, 403, 'training is not on');
    const decision: Decision = training ? { ...checked.value, trainer: 'claude' } : checked.value;
    const saved = await (training ? (deps.trainerDecisions as JsonlStore<Decision>) : deps.stores.decisions).append(decision);
    if (!saved.ok) return sendError(res, 500, 'could not save the decision');
    if (saved.written) void (async () => deps.onDecision?.(decision))().catch(() => undefined);
    res.status(saved.written ? 201 : 200).json({ ok: true, id: decision.id, written: saved.written });
  });

  // The owner's history per (sphere, kind), counted from the ledger: what earns a bucket its confidence. Counts only, no text.
  app.get('/stats/buckets', (_req, res) => {
    res.json({ buckets: countBuckets(deps.stores.decisions.query(() => true)) });
  });

  app.get('/lessons', (req: Request, res: Response) => {
    const limit = parseLimit(req.query.limit);
    if (!limit.ok) return sendError(res, 400, limit.error);
    const status = parseLessonStatus(req.query.status);
    if (!status.ok) return sendError(res, 400, status.error);
    const lessons = deps.stores.lessons
      .query((l) => status.value === undefined || l.status === status.value)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit.value);
    res.json({ lessons });
  });

  app.get('/tickets', (req: Request, res: Response) => {
    const limit = parseLimit(req.query.limit);
    if (!limit.ok) return sendError(res, 400, limit.error);
    const status = parseStatus(req.query.status);
    if (!status.ok) return sendError(res, 400, status.error);
    const tickets = deps.stores.tickets
      .query((t) => status.value === undefined || t.status === status.value)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit.value);
    res.json({ tickets });
  });

  app.post('/tickets', async (req: Request, res: Response) => {
    const checked = validateTicket(req.body);
    if (!checked.ok) return sendError(res, 400, 'invalid ticket', checked.errors);
    const saved = await deps.stores.tickets.append(checked.value);
    if (!saved.ok) return sendError(res, 500, 'could not save the ticket');
    res.status(saved.written ? 201 : 200).json({ ok: true, id: checked.value.id, written: saved.written });
  });

  // ---- the teaching side (Phase 15) ------------------------------------------------------------------------------------
  const noTeacher = (res: Response): void => sendError(res, 503, 'teaching side not available');

  // Writes a scrubbed audit bundle into the data folder and returns it, so a session need not read the folder. `ticketIds` optional.
  app.post('/bundles', async (req: Request, res: Response) => {
    const teacher = deps.teacher;
    if (!teacher) return noTeacher(res);
    const body: unknown = req.body ?? {};
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return sendError(res, 400, 'body must be an object');
    const { ticketIds, ...rest } = body as Record<string, unknown>;
    if (Object.keys(rest).length > 0) return sendError(res, 400, 'unknown field');
    if (ticketIds !== undefined && !(Array.isArray(ticketIds) && ticketIds.every((id) => typeof id === 'string' && ID_PATTERN.test(id)))) {
      return sendError(res, 400, 'ticketIds must be a list of ticket ids');
    }
    const result = await teacher.exportBundle(ticketIds as string[] | undefined);
    if (!result.ok) {
      if (result.error === 'unknown-ticket') return sendError(res, 404, 'unknown ticket');
      if (result.error === 'too-many-tickets') return sendError(res, 400, 'too many tickets for one bundle');
      return sendError(res, 500, 'could not write the bundle');
    }
    if (!result.written) return res.json({ written: false, tickets: 0 });
    res.status(201).json({
      written: true,
      id: result.id,
      folder: `bundles/${result.id}`,
      tickets: result.bundle.ticketCount,
      truncated: result.bundle.truncated,
      bundle: result.bundle,
      summary: result.summary,
    });
  });

  app.post('/findings', async (req: Request, res: Response) => {
    if (!deps.teacher) return noTeacher(res);
    const result = await deps.teacher.importFinding(req.body);
    if (result.ok) return res.status(result.written ? 201 : 200).json({ ok: true, id: result.id, written: result.written });
    if (result.error === 'invalid') return sendError(res, 400, 'invalid finding', result.details);
    if (result.error === 'unknown-ticket') return sendError(res, 404, 'unknown ticket');
    if (result.error === 'ticket-not-open') return sendError(res, 409, 'the ticket is not open');
    if (result.error === 'id-taken') return sendError(res, 409, 'that finding id belongs to another ticket');
    sendError(res, 500, 'could not save the finding');
  });

  app.get('/findings', (req: Request, res: Response) => {
    if (!deps.teacher) return noTeacher(res);
    const limit = parseLimit(req.query.limit);
    if (!limit.ok) return sendError(res, 400, limit.error);
    res.json({ findings: deps.teacher.listFindings(limit.value) });
  });

  // The owner's acceptance of the finding for a ticket: the only thing that lets its scenario graduate. A local service cannot tell the
  // owner from a script, so the body must say so in so many words, and the teaching skill is told never to call this.
  app.post('/tickets/:id/accept', async (req: Request, res: Response) => {
    if (!deps.teacher) return noTeacher(res);
    const ticketId = String(req.params.id);
    if (!ID_PATTERN.test(ticketId)) return sendError(res, 400, 'invalid ticket id');
    const body: unknown = req.body;
    const owner = typeof body === 'object' && body !== null && !Array.isArray(body) && (body as Record<string, unknown>).acceptedBy === 'owner' && Object.keys(body).length === 1;
    if (!owner) return sendError(res, 400, 'the body must be {"acceptedBy":"owner"}');
    const result = await deps.teacher.acceptTicket(ticketId);
    if (result.ok) return res.json({ ok: true, written: result.written, lessonsChanged: result.lessonsChanged });
    if (result.error === 'unknown-ticket') return sendError(res, 404, 'unknown ticket');
    if (result.error === 'no-finding') return sendError(res, 409, 'the ticket has no finding to accept');
    sendError(res, 500, 'could not save the acceptance');
  });

  app.get('/metrics/training', (_req, res) => {
    if (!deps.teacher) return noTeacher(res);
    res.json(deps.teacher.metrics());
  });

  // ---- world memory (Phase 20): what the walks have shown, read-only ------------------------------------------------------
  const noWorld = (res: Response): void => sendError(res, 503, 'world memory not available');

  app.get('/world/rooms/:id', (req, res) => {
    if (!deps.world) return noWorld(res);
    const id = String(req.params.id);
    if (!MAP_ID_PATTERN.test(id)) return sendError(res, 400, 'invalid room id');
    const room = deps.world.room(id);
    if (room === undefined) return sendError(res, 404, 'unknown room');
    res.json(room);
  });

  // The candidate layer as a Shattered-Maps file (validated by the reader of shattered-maps-core). Candidates are evidence, not truth.
  app.get('/world/candidates', (_req, res) => {
    if (!deps.world) return noWorld(res);
    res.json(deps.world.candidates());
  });

  // The map window's "add this room from my history": walked rooms with a title (and exits), each with the titles its exits lead to.
  // `world` is the map world's id; the DSL's is the default. A title is required; the exits are compass letters, comma separated.
  const EXIT_LETTERS = /^[A-Za-z]{1,2}$/;
  app.get('/world/near', (req, res) => {
    if (!deps.world) return noWorld(res);
    const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';
    if (title === '' || title.length > 200) return sendError(res, 400, 'invalid title');
    const exits = typeof req.query.exits === 'string' && req.query.exits !== '' ? req.query.exits.split(',').map((e) => e.trim()) : [];
    if (exits.length > 12 || exits.some((e) => !EXIT_LETTERS.test(e))) return sendError(res, 400, 'invalid exits');
    const world = typeof req.query.world === 'string' ? req.query.world : 'dsl';
    const rooms = deps.world.near(world, title, exits);
    if (rooms === undefined) return sendError(res, 404, 'unknown world');
    res.json({ rooms });
  });

  app.get('/world/stats', (_req, res) => {
    if (!deps.world) return noWorld(res);
    res.json(deps.world.stats());
  });

  // ---- everything else -------------------------------------------------------------------------------------------------
  app.use((_req, res) => sendError(res, 404, 'not found'));

  // The body parser reports a client mistake as an error with a 4xx `status`: too large (413), not JSON (400), an unsupported
  // character set or content encoding (415), a body that does not decompress (400). Only the size has its own answer; the rest
  // are "this is not a readable JSON body". Anything else is our fault and gets a fixed 500 with no detail.
  const onError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const status = typeof error === 'object' && error !== null ? (error as { status?: unknown }).status : undefined;
    if (status === 413) return sendError(res, 413, 'body too large');
    if (typeof status === 'number' && status >= 400 && status < 500) return sendError(res, 400, 'invalid json');
    deps.log({ method: 'error', route: 'unhandled', status: 500 });
    sendError(res, 500, 'internal error');
  };
  app.use(onError);

  return app;
}
