import type { IGameDataProvider, StanceModifier } from '../data/index.js';
import type { MatchState, UnitTemplate } from '../model/index.js';
import type { ISeededRng } from '../rng/index.js';

/**
 * Everything a per-hit combat reaction needs to make its decision. Assembled by
 * `applyAttack`/`applyAbility` for ONE attacker striking ONE defender and handed to each
 * `CombatHooks` callback. All randomness a hook needs comes from `rng` (a seeded stream the
 * reducer threads through), so avoidance/defense rolls are deterministically replayable from
 * (initial state, seed) — never `Math.random`.
 */
export interface CombatContext {
  readonly state: MatchState;
  readonly attacker: UnitTemplate;
  readonly defender: UnitTemplate;
  readonly attackerId: string;
  readonly defenderId: string;
  /** The attacker's damage type (a DslDamageType key, e.g. 'Slash', 'Flame'). */
  readonly damageType: string;
  /** True for a spell's damage component (`applyAbility`), false for a weapon (`applyAttack`).
   *  Spells auto-hit and skip avoidance by default (see `onAvoid`). */
  readonly isSpell: boolean;
  /** Status-effect keys currently on the defender (granted/charged auras ride here). */
  readonly defenderStatusKeys: readonly string[];
  /** Resolved combat stance of each participant (defaults to `normal` for stanceless tokens).
   *  `onAvoid` shifts the roll by `defenderStance.evasionMod − attackerStance.toHitMod`. */
  readonly attackerStance: StanceModifier;
  readonly defenderStance: StanceModifier;
  readonly provider: IGameDataProvider;
  /**
   * Seeded RNG — the SOLE randomness source for hooks, so replays are deterministic. In the
   * server-authoritative deployment this is a SERVER-ONLY stream seeded from a per-match secret
   * salt + a step counter (see `EngineProviders.combatRng`): the salt never enters `MatchState`,
   * so it is never broadcast, and the client — which never runs these hooks — cannot predict a
   * dodge/parry/block outcome. When no salted source is supplied it falls back to the reducer's
   * public rng (fine for pure engine tests).
   */
  readonly rng: ISeededRng;
}

/**
 * The fine, per-HIT combat-reaction seam. Optional and default-absent: `applyAttack`/
 * `applyAbility` called without hooks behave exactly as the Phase-2b deterministic pipeline.
 * Distinct from the reducer's coarse per-ACTION `EngineProviders.triggers` hook.
 *
 * Authoritative order inside a single attack (see the combat-reactions plan):
 *   avoid (step 2) → resolveDamage → onDefend typed shields (step 3) → apply (step 4)
 *   → onHit reactions, only if the hit landed (step 5).
 */
export interface CombatHooks {
  /** Step 2 — return true if the attack is avoided entirely (dodge/parry/block): 0 damage,
   *  NO hit, so reactions are skipped too. Weapon attacks only by default; a spell passes
   *  `ctx.isSpell === true` and a hook may opt in via a magic-evasion aura. */
  onAvoid?(ctx: CombatContext): boolean;
  /** Step 3 — adjust the resolved incoming damage for shielding/defensive auras, keyed by the
   *  incoming damage TYPE. Return the possibly-reduced amount; 0 = fully negated (counts as no
   *  hit, so reactions are skipped). */
  onDefend?(incoming: number, ctx: CombatContext): number;
  /** Step 5 — fires ONLY when a hit landed (amount ≥ 1 after onDefend). Return a NEW MatchState
   *  with reactions applied (e.g. thorn damage to the attacker). Receives the damage dealt. */
  onHit?(dealt: number, ctx: CombatContext): MatchState;
}
