import { useCallback, useRef, useState } from 'react';
import {
  createLocalMatch,
  type Action,
  type ArmyRoster,
  type GameModeId,
  type IAiPolicy,
  type LocalMatch,
  type MatchState,
  type TerrainChoice,
} from '@shatteredarchive/kingdom-tactics-engine';

import { providers } from '../../../state/providers';

export interface UseMatchOptions {
  readonly modeId: GameModeId;
  readonly rosters: readonly ArmyRoster[];
  readonly seed: number;
  /** side index → policy that auto-plays it (default: none — all seats human/hotseat). */
  readonly aiPolicies?: Readonly<Record<number, IAiPolicy>>;
  /** Board terrain (default 'flat'). */
  readonly terrain?: TerrainChoice;
}

export interface UseMatch {
  /** Current match snapshot (drives rendering). */
  readonly snapshot: MatchState;
  /** Legal actions the given token can take on the active side this turn. */
  readonly legalActionsFor: (tokenId: string) => Action[];
  /** Apply a (human) action. Returns false and no-ops if the engine rejects it. */
  readonly act: (action: Action) => boolean;
  /** Auto-play AI-controlled seats until a human seat is active or the match is decided. */
  readonly runAi: () => void;
  /** Rebuild the match from the original rosters + seed (rematch). */
  readonly reset: () => void;
}

/**
 * Owns a single LOCAL match by driving the engine's authoritative {@link LocalMatch} — the SAME
 * `MatchSession` the online `/ws/kt` gateway uses, minus the socket. So hotseat/single-player get
 * full feature parity (dodge/parry/block avoidance, the salted combat RNG, real ability mechanics),
 * and the client still never re-implements a rule: it only relays actions and mirrors snapshots.
 *
 * The LocalMatch lives in a ref (the synchronous source of truth for event handlers, so StrictMode's
 * double-invoke can't double-advance the RNG); its snapshot is mirrored into React state for render.
 * The combat salt is derived from the seed, so a seed + action sequence reproduces the match exactly.
 */
export function useMatch(opts: UseMatchOptions): UseMatch {
  const { modeId, rosters, seed, aiPolicies, terrain } = opts;

  const matchRef = useRef<LocalMatch | null>(null);
  if (matchRef.current === null) {
    matchRef.current = createLocalMatch({ modeId, rosters, providers, seed, aiPolicies, terrain });
  }
  const [snapshot, setSnapshot] = useState<MatchState>(() => matchRef.current!.snapshot());

  const legalActionsFor = useCallback(
    (tokenId: string): Action[] => matchRef.current!.legalActionsFor(tokenId),
    [],
  );

  const act = useCallback((action: Action): boolean => {
    const match = matchRef.current!;
    if (match.isOver()) return false;
    if (!match.act(action)) return false; // engine rejected it (illegal / no-op / not your turn)
    setSnapshot(match.snapshot());
    return true;
  }, []);

  const runAi = useCallback(() => {
    const match = matchRef.current!;
    if (match.runAi()) setSnapshot(match.snapshot());
  }, []);

  const reset = useCallback(() => {
    // Rebuild from the LATEST opts (a caller may rematch with a new seed/rosters). Deterministic:
    // the LocalMatch re-derives its combat salt from the seed, so a rematch is byte-identical.
    const match = createLocalMatch({ modeId, rosters, providers, seed, aiPolicies, terrain });
    matchRef.current = match;
    setSnapshot(match.snapshot());
  }, [modeId, rosters, seed, aiPolicies, terrain]);

  return { snapshot, legalActionsFor, act, runAi, reset };
}
