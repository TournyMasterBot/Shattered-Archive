import type { Action, MatchState } from '@shatteredarchive/kingdom-tactics-engine';
import { JsonAccountStore } from './json-account-store.js';

export interface MatchHistoryParticipant {
  readonly side: number;
  readonly accountId: string | null;
}

/**
 * One completed match. `initial`/`actionLog`/`replaySeed` are everything `replayMatch` needs to
 * deterministically reconstruct it — `replaySeed.combatSalt` is the hidden-outcome secret and
 * MUST NEVER be returned by any HTTP response (see `MatchHistorySummary`, which strips it, and
 * the dedicated replay ROUTE, which consumes it server-side and returns only the resulting
 * state sequence).
 */
export interface MatchHistoryEntry {
  readonly id: string;
  readonly matchId: string;
  readonly playedAt: string;
  readonly participants: readonly MatchHistoryParticipant[];
  readonly winner: number | 'draw';
  readonly initial: MatchState;
  readonly actionLog: readonly Action[];
  readonly replaySeed: { readonly seed: number; readonly combatSalt: number };
}

export type MatchHistorySummary = Omit<MatchHistoryEntry, 'initial' | 'actionLog' | 'replaySeed'>;

/** Oldest evicted past this cap, per account — matches Phase C's game-log retention precedent. */
const MAX_ENTRIES_PER_ACCOUNT = 25;

export class MatchHistoryStore {
  private readonly store: JsonAccountStore<MatchHistoryEntry>;

  constructor(dataDir: string) {
    this.store = new JsonAccountStore<MatchHistoryEntry>(dataDir, 'match-history');
  }

  /**
   * Records one completed match under EVERY participant's own file — each account only ever
   * sees its own copy, retention-capped on every write. A no-op if no participant carries an
   * accountId (a fully-anonymous match is never recorded).
   */
  record(entry: MatchHistoryEntry): void {
    const accountIds = [...new Set(entry.participants.map((p) => p.accountId).filter((id): id is string => !!id))];
    for (const accountId of accountIds) {
      const next = [...this.store.list(accountId), entry].slice(-MAX_ENTRIES_PER_ACCOUNT);
      this.store.save(accountId, next);
    }
  }

  listSummaries(accountId: string): MatchHistorySummary[] {
    return this.store.list(accountId).map(({ initial: _initial, actionLog: _actionLog, replaySeed: _replaySeed, ...summary }) => summary);
  }

  /** A single entry — only ever looked up scoped to the requesting account's own file, so a player can only fetch their own matches. */
  get(accountId: string, id: string): MatchHistoryEntry | undefined {
    return this.store.list(accountId).find((e) => e.id === id);
  }
}
