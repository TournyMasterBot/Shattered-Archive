import {
  initialReducerState,
  parseLogRecord,
  reduceEvents,
  type FeedEvent,
  type GameState,
  type LogEvent,
  type ReducerState,
} from '@shatteredarchive/copilot-core';

/**
 * What the in-memory ring keeps. A login is kept WITHOUT the character's real name: the name is handed once to `onFeed` (the
 * character registry) and nowhere else.
 */
export type RingEvent = Exclude<FeedEvent, { type: 'login' }> | { type: 'login'; at: number; level?: number };

export interface FeedCounters {
  /** Lines handed to the pipeline. */
  lines: number;
  /** Lines that became an event. */
  events: number;
  malformed: number;
  oversize: number;
  /** Valid records of a type Copilot has no use for. */
  ignored: number;
}

export interface PipelineOptions {
  /** Called with each batch of feed events, real login names included. Consume names at once; never store or log them. */
  onFeed?: (events: FeedEvent[]) => void | Promise<void>;
  /** Most events kept in the ring (default 500). */
  ringMaxEvents?: number;
  /** Rough character budget of the ring (default 2,000,000). The newest event is always kept. */
  ringMaxChars?: number;
}

/** A `lines` event keeps only its last lines in the ring, so one huge batch cannot fill it. */
const RING_LINES_PER_EVENT = 500;

function sizeOf(event: RingEvent): number {
  switch (event.type) {
    case 'lines':
      return event.lines.reduce((sum, line) => sum + line.length + 1, 32);
    case 'command':
      return event.command.length + 32;
    case 'room':
      return event.room.length + event.sector.length + event.exits.join('').length + 32;
    default:
      return 64;
  }
}

function forRing(event: FeedEvent): RingEvent {
  if (event.type === 'login') return event.level === undefined ? { type: 'login', at: event.at } : { type: 'login', at: event.at, level: event.level };
  if (event.type === 'lines' && event.lines.length > RING_LINES_PER_EVENT) return { ...event, lines: event.lines.slice(-RING_LINES_PER_EVENT) };
  return event;
}

/**
 * Log lines in, game state out: parse each line (`parseLogRecord`), fold the events (`reduceEvents`), keep the state and a bounded
 * ring of the latest feed events. Pure bookkeeping around copilot-core; it owns no file or timer.
 */
export class Pipeline {
  readonly counters: FeedCounters = { lines: 0, events: 0, malformed: 0, oversize: 0, ignored: 0 };
  private reducer: ReducerState = initialReducerState();
  private ring: { event: RingEvent; size: number }[] = [];
  private ringChars = 0;
  private readonly maxEvents: number;
  private readonly maxChars: number;

  constructor(private readonly options: PipelineOptions = {}) {
    this.maxEvents = options.ringMaxEvents ?? 500;
    this.maxChars = options.ringMaxChars ?? 2_000_000;
  }

  get game(): GameState {
    return this.reducer.game;
  }

  /** The latest feed events, oldest first (at most `max`, default all that are kept). */
  recent(max?: number): RingEvent[] {
    const all = this.ring.map((entry) => entry.event);
    if (max === undefined) return all;
    return max <= 0 ? [] : all.slice(-max); // slice(-0) would be the whole list
  }

  /** The ring's rough size, for the bounded-memory checks. */
  get ringSize(): { events: number; chars: number } {
    return { events: this.ring.length, chars: this.ringChars };
  }

  /** Parse and fold a batch of lines. Resolves when `onFeed` has finished, so a slow consumer slows the tailer. */
  async ingest(lines: readonly string[]): Promise<void> {
    const events: LogEvent[] = [];
    for (const line of lines) {
      this.counters.lines++;
      const parsed = parseLogRecord(line);
      if (parsed.ok) {
        events.push(parsed.event);
        this.counters.events++;
      } else {
        this.counters[parsed.reason]++;
      }
    }
    if (events.length === 0) return;

    const { state, out } = reduceEvents(this.reducer, events);
    this.reducer = state;
    if (out.length === 0) return;
    for (const event of out) this.push(forRing(event));
    await this.options.onFeed?.(out);
  }

  private push(event: RingEvent): void {
    const size = sizeOf(event);
    this.ring.push({ event, size });
    this.ringChars += size;
    while (this.ring.length > this.maxEvents || (this.ringChars > this.maxChars && this.ring.length > 1)) {
      this.ringChars -= this.ring.shift()!.size;
    }
  }
}
