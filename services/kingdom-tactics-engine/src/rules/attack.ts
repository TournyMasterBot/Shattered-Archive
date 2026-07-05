import type { IGameDataProvider } from '../data/index.js';
import type { BoardToken, MatchState, StatusEffect, UnitTemplate } from '../model/index.js';
import type { ISeededRng } from '../rng/index.js';
import { tileAt } from './board.js';
import { legalTargets } from './targeting.js';
import { resolveDamage } from './damage.js';
import { rollSave } from './saves.js';
import { templateForMember } from './squadron.js';

/**
 * A castable ability. A spell may carry a damage component (which AUTO-HITS, per the DSL
 * rules) and/or a maladiction component (a debuff status that only lands if it beats the
 * target's save — see rules/saves.ts). A spell with both is applied in two parts: the
 * damage always lands, the maladiction is rolled separately.
 */
export interface AbilitySpec {
  readonly key: string;
  /** When true, applies auto-hit damage using the caster's attackPower/damageType. */
  readonly damage?: boolean;
  /** Optional debuff applied only when its save lands. */
  readonly maladiction?: {
    readonly status: StatusEffect;
    /** The maladiction's own save modifier (SaveInput.saves). */
    readonly saves?: number;
    /** Hidden base-save boost/gimp (SaveInput.baseSave). */
    readonly baseSave?: number;
  };
}

/** Resolve a token to a representative UnitTemplate (squadron → its first member). */
function resolveTemplate(token: BoardToken, provider: IGameDataProvider): UnitTemplate {
  const templateId = token.kind === 'unit' ? token.templateId : token.members[0].templateId;
  return templateForMember(templateId, provider);
}

const markActed = (t: BoardToken): BoardToken =>
  t.kind === 'unit' ? { ...t, hasActed: true } : { ...t, hasActed: true };

const applyDamageToToken = (t: BoardToken, amount: number): BoardToken =>
  t.kind === 'unit'
    ? { ...t, hp: Math.max(0, t.hp - amount) }
    : { ...t, hpPool: Math.max(0, t.hpPool - amount) };

const withStatuses = (t: BoardToken, statuses: readonly StatusEffect[]): BoardToken =>
  t.kind === 'unit' ? { ...t, statuses } : { ...t, statuses };

const terrainKeyAt = (state: MatchState, token: BoardToken): string =>
  tileAt(state.board, token.pos)?.terrain ?? 'Field';

/**
 * Apply a basic (weapon) attack: validates the target is legal, resolves damage, and
 * returns a NEW MatchState with the defender's hp/hpPool reduced and the attacker marked
 * hasActed. Illegal target or missing tokens → state returned unchanged. Pure.
 */
export function applyAttack(
  state: MatchState,
  attackerId: string,
  targetId: string,
  provider: IGameDataProvider,
  rng?: ISeededRng,
): MatchState {
  const attacker = state.tokens.find((t) => t.instanceId === attackerId);
  const target = state.tokens.find((t) => t.instanceId === targetId);
  if (!attacker || !target) return state;
  if (!legalTargets(state, attackerId, provider).includes(targetId)) return state;

  const result = resolveDamage({
    attacker: resolveTemplate(attacker, provider),
    defender: resolveTemplate(target, provider),
    defenderTerrainKey: terrainKeyAt(state, target),
    moonPhase: state.moon.phase,
    defenderStatusKeys: target.statuses.map((s) => s.key),
    provider,
    rng,
  });

  const tokens = state.tokens.map((t) => {
    if (t.instanceId === attackerId) return markActed(t);
    if (t.instanceId === targetId) return applyDamageToToken(t, result.amount);
    return t;
  });
  return { ...state, tokens };
}

/**
 * Apply a spell/ability. Two-part per the DSL rules: any damage component AUTO-HITS, while
 * a maladiction component rolls the save (rules/saves.ts) and is only appended to the
 * target's statuses when it lands. Returns a NEW MatchState; caster marked hasActed. Pure
 * (RNG advances). Unlike applyAttack, targeting is not range-gated here — spells carry their
 * own targeting and may affect allies.
 */
export function applyAbility(
  state: MatchState,
  casterId: string,
  targetId: string,
  ability: AbilitySpec,
  provider: IGameDataProvider,
  rng: ISeededRng,
): MatchState {
  const caster = state.tokens.find((t) => t.instanceId === casterId);
  const target = state.tokens.find((t) => t.instanceId === targetId);
  if (!caster || !target) return state;

  const casterTpl = resolveTemplate(caster, provider);
  const targetTpl = resolveTemplate(target, provider);

  // Damage component: auto-hit.
  let damageAmount = 0;
  if (ability.damage) {
    damageAmount = resolveDamage({
      attacker: casterTpl,
      defender: targetTpl,
      defenderTerrainKey: terrainKeyAt(state, target),
      moonPhase: state.moon.phase,
      defenderStatusKeys: target.statuses.map((s) => s.key),
      provider,
      rng,
    }).amount;
  }

  // Maladiction component: rolls the save; only lands on success.
  let landedStatuses: readonly StatusEffect[] | null = null;
  if (ability.maladiction) {
    const save = rollSave(
      {
        casterInt: casterTpl.stats.int,
        targetWis: targetTpl.stats.wis,
        saves: ability.maladiction.saves,
        baseSave: ability.maladiction.baseSave,
      },
      rng,
    );
    if (save.landed) landedStatuses = [...target.statuses, ability.maladiction.status];
  }

  const tokens = state.tokens.map((t) => {
    if (t.instanceId === casterId) return markActed(t);
    if (t.instanceId === targetId) {
      let nt = damageAmount > 0 ? applyDamageToToken(t, damageAmount) : t;
      if (landedStatuses) nt = withStatuses(nt, landedStatuses);
      return nt;
    }
    return t;
  });
  return { ...state, tokens };
}
