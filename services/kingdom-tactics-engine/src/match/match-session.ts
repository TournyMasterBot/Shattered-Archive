import { applyAction, type EngineProviders } from '../engine/game-engine.js';
import type { Action } from '../model/action.js';
import type { MatchState } from '../model/match.js';
import type { Side } from '../model/coord.js';
import type { IAiPolicy } from '../ai/policy.js';
import type { ISeededRng } from '../rng/seeded-rng.js';
import { createRng } from '../rng/seeded-rng.js';
import { createCombatRng } from '../rng/combat-rng.js';
import { defaultCombatHooks } from '../rules/default-combat-hooks.js';
import { createAbilityResolver } from '../rules/ability-resolver.js';

/**
 * Authoritative owner of a single match — the engine's "match server" as a plain, embeddable object.
 * It wraps the reducer with seat ownership + action authorization, installs the server-only combat
 * reactions/RNG + ability resolver, and can auto-play AI-controlled seats. It is deliberately
 * transport-agnostic and ISOMORPHIC: it performs NO I/O and imports no Node/DOM built-ins, so the SAME
 * class backs the real online `/ws/kt` gateway (server-authoritative) AND local/offline hotseat play
 * (via {@link LocalMatch}) — hotseat therefore gets full feature parity (avoidance, salted combat RNG,
 * real abilities) instead of the reducer's bare auto-hit path.
 *
 * Determinism: one `createRng(seed)` stream backs BOTH human actions and AI auto-play, so a given
 * seed + action sequence reproduces the same match (replay/reconciliation).
 *
 * The combat salt is INJECTED, never generated here (that keeps this module free of `node:crypto` /
 * Web Crypto): the online server injects a crypto-random secret per match; local play derives one from
 * the seed ({@link deriveCombatSalt}). The salt is never stored in MatchState nor broadcast.
 */
export interface MatchSessionOptions {
  readonly matchId: string;
  /** Initial state (built by the caller from a mode/setup, e.g. a Duel via `buildMatch`). */
  readonly initial: MatchState;
  readonly providers: EngineProviders;
  /** Seeds the single RNG stream used for the whole match. */
  readonly seed: number;
  /** side index → policy that auto-plays it. Sides listed here cannot be claimed by humans. */
  readonly aiPolicies?: Readonly<Record<number, IAiPolicy>>;
  /** Safety cap on the `turn` counter for AI auto-play (default 200, mirrors runMatch). */
  readonly maxTurns?: number;
  /**
   * Secret salt for the combat/defense RNG. Never stored in MatchState, never sent to a client, so
   * avoidance rolls are unguessable across the network; combined with a per-action step counter it stays
   * replayable. REQUIRED — the caller owns randomness (crypto-random online, seed-derived locally).
   */
  readonly combatSalt: number;
}

/** Result of a seat claim. */
export type SeatClaim = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** Result of applying a client action: the new snapshot, or a rejection reason. */
export type ApplyResult =
  | { readonly state: MatchState; readonly lastAction: Action }
  | { readonly error: string };

/** Per-turn action cap that forces an end-turn — mirrors the simulator's anti-stall guard. */
const MAX_ACTIONS_PER_TURN = 500;

export class MatchSession {
  readonly matchId: string;
  private state: MatchState;
  private readonly providers: EngineProviders;
  private readonly rng: ISeededRng;
  private readonly aiPolicies: Readonly<Record<number, IAiPolicy>>;
  private readonly maxTurns: number;
  /** side index → clientId that holds the (human) seat. */
  private readonly seats = new Map<Side, string>();
  /** Per-match secret salt for the combat RNG — never serialized. */
  private readonly combatSalt: number;
  /** Monotonic step counter mixed with the salt so each combat action draws a fresh, replayable stream. */
  private combatStep = 0;

  constructor(opts: MatchSessionOptions) {
    this.matchId = opts.matchId;
    this.state = opts.initial;
    this.rng = createRng(opts.seed);
    this.aiPolicies = opts.aiPolicies ?? {};
    this.maxTurns = opts.maxTurns ?? 200;
    this.combatSalt = opts.combatSalt;
    // Enable server-authoritative per-hit reactions: the hooks roll against the salted, step-counted
    // stream (createCombatRng), NOT the public MatchState.rngState — so a networked client, which never
    // runs these hooks and never sees the salt, cannot predict a dodge/parry/block outcome.
    this.providers = {
      ...opts.providers,
      combatHooks: defaultCombatHooks,
      combatRng: () => createCombatRng(this.combatSalt, this.combatStep++),
      // Turn an AbilityAction's key into a castable spec via the authored mechanics registry;
      // unauthored abilities resolve to a no-op stub (deterministic — sims unaffected).
      abilityResolver: opts.providers.abilityResolver ?? createAbilityResolver(),
    };
  }

  /** The current authoritative snapshot. */
  snapshot(): MatchState {
    return this.state;
  }

  /** True once the engine has flagged the match `decided`. */
  isOver(): boolean {
    return this.state.status === 'decided';
  }

  /** Winner once decided (or 'draw'); undefined while still in progress. */
  winner(): Side | 'draw' | undefined {
    return this.state.status === 'decided' ? (this.state.winner ?? 'draw') : undefined;
  }

  /**
   * Claim a human seat on `side`. First-come: a side backed by an AI policy, or already held
   * by a different client, is rejected. Re-claiming your own seat is idempotent.
   */
  claimSeat(side: Side, clientId: string): SeatClaim {
    if (this.aiPolicies[side]) return { ok: false, reason: 'seat is AI-controlled' };
    const held = this.seats.get(side);
    if (held !== undefined && held !== clientId) return { ok: false, reason: 'seat already taken' };
    this.seats.set(side, clientId);
    return { ok: true };
  }

  /** Release any seat(s) held by `clientId` (on leave / socket close). */
  releaseSeat(clientId: string): void {
    for (const [side, holder] of this.seats) {
      if (holder === clientId) this.seats.delete(side);
    }
  }

  /**
   * Apply a human action. Authorizes seat ownership of the action's acting side (decision 4),
   * then defers turn/legality to the reducer: a same-ref result means the engine rejected it.
   */
  applyClientAction(clientId: string, action: Action): ApplyResult {
    if (this.isOver()) return { error: 'match is already decided' };

    const side = this.actingSideOf(action);
    if (side === undefined) return { error: 'unknown token' };
    if (this.seats.get(side) !== clientId) return { error: 'not your seat' };

    const next = applyAction(this.state, action, this.rng, this.providers);
    if (next === this.state) return { error: 'illegal action' };

    this.state = next;
    return { state: next, lastAction: action };
  }

  /**
   * Auto-play AI-controlled seats until a human seat is active or the match is decided,
   * returning one snapshot per applied action (decision 3). Mirrors `runMatch`'s anti-stall
   * guards: a per-turn action cap and an illegal/no-op action both convert to an end-turn,
   * and a rejected end-turn breaks the loop so a bad policy cannot spin forever.
   */
  runAiUntilHuman(): MatchState[] {
    const snapshots: MatchState[] = [];
    let segmentSide = this.state.activeSide;
    let segmentTurn = this.state.turn;
    let actionsThisTurn = 0;

    while (this.state.status === 'in-progress' && this.state.turn <= this.maxTurns) {
      const side = this.state.activeSide;
      const policy = this.aiPolicies[side];
      if (!policy) break; // a human seat is active — hand control back to the caller

      if (side !== segmentSide || this.state.turn !== segmentTurn) {
        segmentSide = side;
        segmentTurn = this.state.turn;
        actionsThisTurn = 0;
      }

      const forceEnd = actionsThisTurn >= MAX_ACTIONS_PER_TURN;
      const action: Action = forceEnd
        ? { type: 'end-turn', side }
        : policy.chooseAction(this.state, side, this.providers, this.rng);

      const next = applyAction(this.state, action, this.rng, this.providers);

      if (next === this.state) {
        // No-op (illegal, or a rejected end-turn): force an end-turn to guarantee progress;
        // if even that is a no-op, bail to avoid an infinite loop.
        if (action.type === 'end-turn') break;
        const ended = applyAction(this.state, { type: 'end-turn', side }, this.rng, this.providers);
        if (ended === this.state) break;
        this.state = ended;
        snapshots.push(this.state);
        continue;
      }

      this.state = next;
      snapshots.push(this.state);
      actionsThisTurn++;
    }

    return snapshots;
  }

  /** The side an action acts for: `end-turn` carries it; token actions derive it from the token. */
  private actingSideOf(action: Action): Side | undefined {
    if (action.type === 'end-turn') return action.side;
    const token = this.state.tokens.find((t) => t.instanceId === action.tokenId);
    return token?.side;
  }
}
