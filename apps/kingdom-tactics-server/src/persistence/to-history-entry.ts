import crypto from 'crypto';
import type { MatchSession } from '@shatteredarchive/kingdom-tactics-engine';
import type { MatchHistoryEntry } from './match-history-store.js';

/** Builds a storable history entry from a just-decided MatchSession (see `tryClaimForRecording`). */
export function toHistoryEntry(session: MatchSession): MatchHistoryEntry {
  return {
    id: crypto.randomBytes(8).toString('hex'),
    matchId: session.matchId,
    playedAt: new Date().toISOString(),
    participants: session.claimedSeats(),
    winner: session.winner() ?? 'draw',
    initial: session.initial(),
    actionLog: session.getActionLog(),
    replaySeed: session.replaySeed(),
  };
}
