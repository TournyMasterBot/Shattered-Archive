import type { Action } from '../model/action.js';
import type { MatchState } from '../model/match.js';
import type { EngineProviders } from '../engine/game-engine.js';
import { MatchSession } from './match-session.js';

/**
 * Deterministically reconstructs a completed match from its recorded action log — a fresh
 * `MatchSession` seeded with the ORIGINAL `seed`/`combatSalt` (see
 * `MatchSession.replaySeed()`), replaying every action via `replayAction` (no seat
 * authorization — the log is already trusted) rather than re-deciding AI moves, since the log
 * already IS the complete, ordered record of every human AND AI-driven action that happened.
 *
 * SERVER-SIDE USE ONLY, same as `replaySeed()` itself: `combatSalt` must never reach a client.
 * Returns one MatchState snapshot per applied action, mirroring `runAiUntilHuman`'s shape — an
 * action that fails to apply (should never happen against a faithfully-recorded log) stops the
 * replay early rather than throwing, so a corrupted/truncated log degrades to a partial replay.
 */
export function replayMatch(
  matchId: string,
  initial: MatchState,
  providers: EngineProviders,
  actionLog: readonly Action[],
  replaySeed: { seed: number; combatSalt: number },
): MatchState[] {
  const session = new MatchSession({
    matchId,
    initial,
    providers,
    seed: replaySeed.seed,
    combatSalt: replaySeed.combatSalt,
  });

  const snapshots: MatchState[] = [];
  for (const action of actionLog) {
    const result = session.replayAction(action);
    if ('error' in result) break;
    snapshots.push(result.state);
  }
  return snapshots;
}
