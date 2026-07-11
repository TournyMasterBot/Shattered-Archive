import { legalActions, type EngineProviders } from '../engine/game-engine.js';
import type { Action } from '../model/action.js';
import type { MatchState } from '../model/match.js';
import type { GameModeId } from '../model/mode.js';
import type { IAiPolicy } from '../ai/policy.js';
import { deriveCombatSalt } from '../rng/combat-rng.js';
import { buildMatch, type ArmyRoster, type TerrainChoice } from '../setup/build-match.js';
import { MatchSession } from './match-session.js';

/**
 * A single LOCAL/offline match driven by the SAME authoritative {@link MatchSession} the online
 * `/ws/kt` gateway uses — just with no socket. This is how hotseat (pass-and-play) and single-player
 * get full feature parity (dodge/parry/block avoidance, the salted combat RNG, real ability mechanics)
 * without standing up a server and without the UI re-implementing any rules: the engine stays the sole
 * owner of the reducer, exactly as online.
 *
 * Seat model: every side NOT backed by an AI policy is claimed to one local client ('local'), so a
 * single device may act for whichever side's turn it is — the reducer's active-side lock still enforces
 * "only the active side can act". (We don't care about local cheating; only cross-network play needs
 * seat/RNG secrecy, and that path is the real server.)
 *
 * Determinism: the combat salt is derived from the seed ({@link deriveCombatSalt}), so an offline match
 * — avoidance rolls included — reproduces from the seed alone (replay/debug/rematch are byte-identical).
 */
export interface LocalMatchOptions {
  readonly modeId: GameModeId;
  readonly rosters: readonly ArmyRoster[];
  readonly providers: EngineProviders;
  readonly seed: number;
  /** side index → policy that auto-plays it (default: none — all seats are local humans/hotseat). */
  readonly aiPolicies?: Readonly<Record<number, IAiPolicy>>;
  /** Board terrain (default 'flat'). */
  readonly terrain?: TerrainChoice;
}

/** The local client id that owns every non-AI seat (single device). */
const LOCAL_CLIENT = 'local';

/**
 * Wraps a {@link MatchSession} for local play. Mutable (holds the live session); `reset` rebuilds it
 * deterministically from the original options. A React hook (client `useMatch`) mirrors `snapshot()`
 * into render state; headless callers can use it directly.
 */
export class LocalMatch {
  private session: MatchSession;

  constructor(private readonly opts: LocalMatchOptions) {
    this.session = this.build();
  }

  private build(): MatchSession {
    const { modeId, rosters, providers, seed, aiPolicies, terrain } = this.opts;
    const initial = buildMatch(modeId, rosters, providers, { seed, terrain });
    const session = new MatchSession({
      matchId: 'local',
      initial,
      providers,
      seed,
      aiPolicies,
      combatSalt: deriveCombatSalt(seed),
    });
    // Claim every human (non-AI) seat to the single local client so this device may act for it.
    for (const roster of rosters) {
      if (!aiPolicies?.[roster.side]) session.claimSeat(roster.side, LOCAL_CLIENT);
    }
    return session;
  }

  /** Current match snapshot (drives rendering). */
  snapshot(): MatchState {
    return this.session.snapshot();
  }

  /** True once the match is `decided`. */
  isOver(): boolean {
    return this.session.isOver();
  }

  /** Legal, non-`end-turn` actions the given token can take on the active side this turn. */
  legalActionsFor(tokenId: string): Action[] {
    const s = this.session.snapshot();
    return legalActions(s, s.activeSide, this.opts.providers).filter(
      (a) => a.type !== 'end-turn' && a.tokenId === tokenId,
    );
  }

  /** Apply a local human action (any non-AI seat). Returns false and no-ops if the engine rejects it. */
  act(action: Action): boolean {
    return !('error' in this.session.applyClientAction(LOCAL_CLIENT, action));
  }

  /**
   * Auto-play AI-controlled seats until a local human seat is active or the match is decided.
   * Returns true if any action was applied (the caller should re-read `snapshot()`).
   */
  runAi(): boolean {
    return this.session.runAiUntilHuman().length > 0;
  }

  /** Rebuild the match from the original options (rematch) — deterministic from the seed. */
  reset(): void {
    this.session = this.build();
  }
}

/** Convenience factory mirroring the other engine `create*` helpers. */
export function createLocalMatch(opts: LocalMatchOptions): LocalMatch {
  return new LocalMatch(opts);
}
