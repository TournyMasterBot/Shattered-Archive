import { Pipeline } from '../tail/pipeline.js';
import { createWorldFeed, type ViewSink } from './feed.js';
import { WORLD_TARGETS } from './worlds.js';

/** The only game the `dsl` world is built from: the production MUD's player port. Anything else is another world or a test server. */
export const DSL_TARGET = WORLD_TARGETS.dsl[0];

const CONNECT = '"type":"game:remote-server:connect"';
const CLOSED = '"type":"game:server:connection:client-closed"';
/** Lines handed to the pipeline at once. */
const BATCH = 2000;

export interface ReplayCounters {
  /** Records read. */
  lines: number;
  /** Records handed to the pipeline (the rest belong to another target, or to no connection). */
  fed: number;
  /** Records skipped because the connection they belong to is another target or there is none. */
  skipped: number;
  /** Connections seen, by `host:port`. */
  connections: Record<string, number>;
}

export interface ReplayDeps {
  /** Where the room views go: a `WorldMemory` (the walked layer) or an Azah tracer (verification). */
  memory: ViewSink;
  /** The `host:port` targets of the ONE world to build the layer from (default: the DSL's). A connection to any other target adds nothing. */
  targets?: readonly string[];
  /** The name every replayed view is attributed to. A fixed placeholder: no real character name is read or stored. */
  character?: string;
}

/**
 * Replays game-server jsonl records (oldest first, across files) into a `ViewSink` through the SAME path live play uses: `Pipeline`
 * (parse and fold) then the world feed (room view and arrival) then `WorldMemory.apply`. Records are fed only while the current
 * connection is one of the chosen world's targets; a connection to anything else (the Simulacrum, a test server) adds nothing, so worlds cannot mix.
 *
 * The connection a record belongs to is the latest `game:remote-server:connect` before it, until a `client-closed`. Records outside any
 * connection are skipped.
 */
export class Replay {
  readonly counters: ReplayCounters = { lines: 0, fed: 0, skipped: 0, connections: {} };
  private readonly targets: readonly string[];
  private readonly pipeline: Pipeline;
  private inTarget = false;
  private batch: string[] = [];

  constructor(deps: ReplayDeps) {
    this.targets = deps.targets ?? WORLD_TARGETS.dsl;
    const character = deps.character ?? 'Replay-X';
    const feed = createWorldFeed({ memory: deps.memory, character: () => character, label: () => 'unknown' });
    this.pipeline = new Pipeline({ onFeed: (events) => feed.handle(events), ringMaxEvents: 1 });
  }

  /** One record of a jsonl file. */
  async line(raw: string): Promise<void> {
    this.counters.lines += 1;
    if (raw.includes(CONNECT)) {
      await this.drain();
      const target = connectTarget(raw);
      this.counters.connections[target] = (this.counters.connections[target] ?? 0) + 1;
      this.inTarget = this.targets.includes(target);
    }
    if (!this.inTarget) {
      this.counters.skipped += 1;
      return;
    }
    // server notes, GMCP the pipeline ignores and the like are not worth the JSON.parse
    if (!raw.startsWith('{"type":"game:')) {
      this.counters.skipped += 1;
      return;
    }
    this.counters.fed += 1;
    this.batch.push(raw);
    if (raw.includes(CLOSED)) {
      await this.drain();
      this.inTarget = false;
    } else if (this.batch.length >= BATCH) {
      await this.drain();
    }
  }

  /** Hands the waiting records to the pipeline. Call after the last record of a file. */
  async drain(): Promise<void> {
    if (this.batch.length === 0) return;
    const lines = this.batch;
    this.batch = [];
    await this.pipeline.ingest(lines);
  }
}

/** `host:port` of a connect record, or `unknown` when it cannot be read. */
export function connectTarget(raw: string): string {
  try {
    const record = JSON.parse(raw) as { payload?: { host?: unknown; port?: unknown } };
    const { host, port } = record.payload ?? {};
    return typeof host === 'string' && typeof port === 'number' ? `${host}:${port}` : 'unknown';
  } catch {
    return 'unknown';
  }
}
