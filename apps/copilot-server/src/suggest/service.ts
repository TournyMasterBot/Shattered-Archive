import type { Decision, EscalationTicket, JsonlStore, Suggestion } from '@shatteredarchive/copilot-core';
import type { Producer } from './producer.js';
import type { Situation } from './situation.js';

export interface SuggestionServiceDeps {
  producer: Producer;
  /** The situation right now, or undefined when nothing should be proposed (not connected, nobody logged in, the feed is stale). */
  situation: () => Situation | undefined;
  tickets: JsonlStore<EscalationTicket>;
  now: () => number;
  /** How long a suggestion stays current (default 60 s). */
  ttlMs?: number;
  /** After an attempt for a situation, wait this long before trying the same situation again (default 10 s). */
  retryMs?: number;
  /** A suggestion made for a fight is dropped when the fight has moved this many rounds on (default 2: the game moves every 3 s, a model is slower). */
  maxRoundsBehind?: number;
}

const KNOWN_LIMIT = 200;

/**
 * Keeps one current suggestion for the situation the log shows. `poke()` (called after every log pass) starts a production when there
 * is none for this situation; it never runs two at once, never retries one situation faster than `retryMs`, and a slow model never
 * blocks a request: `GET /suggestions` only reads `current()`. A suggestion whose situation has moved on, or that is older than the ttl,
 * is not current. Tickets the producer files are stored here.
 */
export class SuggestionService {
  readonly counters = { produced: 0, ticketsFiled: 0, ticketsLost: 0, withoutSuggestion: 0, held: 0, errors: 0 };
  private latest: { suggestion: Suggestion; at: number; round?: number } | undefined;
  private running: Promise<void> | undefined;
  private runAbort: AbortController | undefined;
  private lastAttempt: { key: string; at: number } | undefined;
  private readonly known = new Map<string, Suggestion>();
  private readonly stopper = new AbortController();

  constructor(private readonly deps: SuggestionServiceDeps) {}

  private get ttl(): number {
    return this.deps.ttlMs ?? 60_000;
  }

  /** A suggestion made in a fight round that is too far behind the fight now is out of date. */
  private behind(latest: { round?: number }, situation: Situation): boolean {
    const fight = situation.fight;
    if (latest.round === undefined || fight === undefined || !fight.active) return false;
    return fight.roundNow - latest.round > (this.deps.maxRoundsBehind ?? 2);
  }

  /** Start producing for the current situation if there is no current suggestion for it. */
  poke(): void {
    if (this.stopper.signal.aborted) return;
    const situation = this.deps.situation();
    if (situation === undefined) return;
    const now = this.deps.now();

    // a fight going badly cannot wait for a model: the code makes the suggestion (flee) at once, even while a model is still thinking
    const urgent = this.deps.producer.urgent(situation);
    if (urgent !== undefined) {
      if (this.latest?.suggestion.command !== urgent.command || this.latest.suggestion.situationKey !== urgent.situationKey) this.install(urgent, situation);
      return;
    }

    if (this.running !== undefined) return;
    if (this.latest !== undefined && this.latest.suggestion.situationKey === situation.situationKey && now - this.latest.at <= this.ttl && !this.behind(this.latest, situation)) return;
    const last = this.lastAttempt;
    if (last !== undefined && last.key === situation.situationKey && now - last.at < (this.deps.retryMs ?? 10_000)) return;
    this.lastAttempt = { key: situation.situationKey, at: now };
    this.running = this.run(situation).finally(() => {
      this.running = undefined;
    });
  }

  /**
   * Start over (Copilot was switched off or on): the model call in progress is aborted and its answer thrown away, the current suggestion
   * and the retry wait are forgotten. So nothing made before a switch is offered after it, and no model work goes on while Copilot is off.
   */
  reset(): void {
    this.runAbort?.abort();
    this.runAbort = undefined;
    this.latest = undefined;
    this.lastAttempt = undefined;
  }

  private async run(situation: Situation): Promise<void> {
    const mine = new AbortController();
    this.runAbort = mine;
    try {
      const result = await this.deps.producer.produce(situation, AbortSignal.any([this.stopper.signal, mine.signal]));
      if (mine.signal.aborted) return; // reset while the model was thinking: its answer belongs to a situation nobody asked about
      for (const ticket of result.tickets) {
        const saved = await this.deps.tickets.append(ticket);
        if (saved.ok) this.counters.ticketsFiled++;
        else this.counters.ticketsLost++;
      }
      if (result.suggestion === undefined) {
        if (result.held !== undefined) this.counters.held++;
        this.counters.withoutSuggestion++;
        return;
      }
      // a model answer that arrives while the fight is going badly must not replace the code's own flee
      const now = this.deps.situation();
      if (now !== undefined && this.deps.producer.urgent(now) !== undefined) return;
      this.install(result.suggestion, situation);
    } catch {
      this.counters.errors++;
    }
  }

  /** Make this the current suggestion, remembering the fight round it was made in. */
  private install(suggestion: Suggestion, situation: Situation): void {
    this.counters.produced++;
    this.latest = { suggestion, at: this.deps.now(), round: situation.fight?.active ? situation.fight.roundNow : undefined };
    this.known.set(suggestion.id, suggestion);
    if (this.known.size > KNOWN_LIMIT) this.known.delete(this.known.keys().next().value as string);
  }

  /** The suggestion for the situation the log shows now, if one is ready, fresh and not behind the fight. */
  current(): Suggestion[] {
    const latest = this.latest;
    if (latest === undefined || this.deps.now() - latest.at > this.ttl) return [];
    const situation = this.deps.situation();
    if (situation === undefined || situation.situationKey !== latest.suggestion.situationKey) return [];
    return this.behind(latest, situation) ? [] : [latest.suggestion];
  }

  /** A suggestion the server made earlier (recent ones only), by id. */
  find(id: string): Suggestion | undefined {
    return this.known.get(id);
  }

  /**
   * The owner answered (or the agent ran it by itself): that suggestion is no longer current. A `refused` record means the command
   * gate would not send it, so nothing was answered and the suggestion stays for the owner.
   */
  answered(decision: Decision): void {
    if (decision.outcome === 'refused') return;
    if (this.latest?.suggestion.id === decision.suggestionId) this.latest = undefined;
  }

  /** Resolves when no production is running (for tests and shutdown). */
  idle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  /** Stop: abort a running production and start no more. */
  stop(): void {
    this.stopper.abort();
  }
}
