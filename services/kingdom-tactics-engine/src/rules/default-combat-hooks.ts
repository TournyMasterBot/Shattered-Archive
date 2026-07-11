import type { BoardToken, MatchState } from '../model/index.js';
import type { CombatContext, CombatHooks } from './combat-hooks.js';
import {
  auraFilterMatches,
  MAGIC_EVASION_KEY,
  reactivesFor,
  shieldsFor,
} from '../data/balance/auras.js';
import { rollAvoidance } from '../data/balance/defenses.js';
import { resolveDamage } from './damage.js';
import { tileAt } from './board.js';

/** All aura-bearing keys on the defender: innate template traits + granted status effects. */
function defenderAuraKeys(ctx: CombatContext): readonly string[] {
  return [...ctx.defender.traits, ...ctx.defenderStatusKeys];
}

const applyThorn = (t: BoardToken, amount: number): BoardToken =>
  t.kind === 'unit'
    ? { ...t, hp: Math.max(0, t.hp - amount) }
    : { ...t, hpPool: Math.max(0, t.hpPool - amount) };

/**
 * The stock combat-reaction implementation, driven entirely by the authored defense + aura data
 * (data/balance/{defenses,auras}.ts) and the seeded stream in `ctx.rng`. Stateless: every input
 * arrives via `CombatContext`, so the SAME object is reused for every hit and replays deterministically.
 * Enable it by putting it on `EngineProviders.combatHooks` (the server does this with a salted,
 * server-only `combatRng`; see the combat-reactions plan). Absent ⇒ Phase-2b behavior unchanged.
 */
export const defaultCombatHooks: CombatHooks = {
  /** Step 2 — dodge/parry/block. Weapon attacks roll normally; spells auto-hit and only roll when
   *  the defender carries a magic-evasion aura. */
  onAvoid(ctx: CombatContext): boolean {
    // Stance shift: the defender's posture raises its avoidance, the attacker's lowers it.
    const avoidMod = ctx.defenderStance.evasionMod - ctx.attackerStance.toHitMod;
    if (ctx.isSpell) {
      if (!defenderAuraKeys(ctx).includes(MAGIC_EVASION_KEY)) return false;
      return rollAvoidance(ctx.defender, ctx.rng, avoidMod);
    }
    return rollAvoidance(ctx.defender, ctx.rng, avoidMod);
  },

  /** Step 3 — typed shielding auras. A matching `negate` shield zeroes the hit; `reduce` shields
   *  scale it down multiplicatively. */
  onDefend(incoming: number, ctx: CombatContext): number {
    const shields = shieldsFor(defenderAuraKeys(ctx));
    let amount = incoming;
    for (const s of shields) {
      if (!auraFilterMatches(s.filter, ctx.damageType)) continue;
      if (s.mode === 'negate') return 0;
      if (s.mode === 'reduce') amount *= 1 - s.magnitude;
    }
    return amount;
  },

  /** Step 5 — reactive thorns: the defender strikes back at the attacker, routed through
   *  resolveDamage (so it respects the attacker's armor/resist/con), scaled by the aura magnitude. */
  onHit(_dealt: number, ctx: CombatContext): MatchState {
    const reactives = reactivesFor(defenderAuraKeys(ctx)).filter(
      (a) => a.mode === 'thorns' && auraFilterMatches(a.filter, ctx.damageType),
    );
    if (reactives.length === 0) return ctx.state;

    const attackerToken = ctx.state.tokens.find((t) => t.instanceId === ctx.attackerId);
    if (!attackerToken) return ctx.state;
    const attackerTerrain = tileAt(ctx.state.board, attackerToken.pos)?.terrain ?? 'Field';

    let total = 0;
    for (const a of reactives) {
      const base = resolveDamage({
        attacker: ctx.defender, // the thorns-bearer strikes back
        defender: ctx.attacker, // at the original attacker
        defenderTerrainKey: attackerTerrain,
        moonPhase: ctx.state.moon.phase,
        defenderStatusKeys: attackerToken.statuses.map((s) => s.key),
        provider: ctx.provider,
      }).amount;
      total += Math.max(1, Math.round(base * a.magnitude));
    }

    const tokens = ctx.state.tokens.map((t) =>
      t.instanceId === ctx.attackerId ? applyThorn(t, total) : t,
    );
    return { ...ctx.state, tokens };
  },
};
