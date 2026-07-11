import type { Coord, Side } from './coord.js';
import type { StanceKey } from '../data/balance/stances.js';

/** How a token traverses terrain (drives passability + terrain move cost). */
export type MovementClass = 'ground' | 'flying' | 'aquatic';

/** Resolved five-stat block (matches DSL Stats order str/int/wis/dex/con). */
export interface StatBlock {
  readonly str: number;
  readonly int: number;
  readonly wis: number;
  readonly dex: number;
  readonly con: number;
}

/** Chess-variant movement shape. `range` = max tiles this turn. */
export interface MovePattern {
  readonly kind: 'orthogonal' | 'diagonal' | 'omni' | 'knight';
  readonly range: number;
  /** When true, ignores blockers/terrain cost between origin and destination. */
  readonly jumps: boolean;
}

/** Chess-variant attack shape. `areaRadius` 0 = single target tile. */
export interface AttackPattern {
  readonly kind: 'orthogonal' | 'diagonal' | 'omni' | 'melee';
  readonly range: number;
  readonly minRange: number;
  readonly areaRadius: number;
}

/**
 * A fully-resolved unit blueprint (race × class composed with balance data). This
 * is the ONLY place resolved combat numbers come from — the live match, the AI, and
 * all simulators obtain units via IGameDataProvider.unitTemplate(), so rebalancing a
 * class/race flows everywhere. Immutable and data-only.
 */
export interface UnitTemplate {
  /** Stable id, e.g. "Human:Warrior". */
  readonly id: string;
  readonly raceKey: string;
  readonly classKey: string;
  readonly name: string;

  readonly maxHp: number;
  readonly stats: StatBlock;

  readonly move: MovePattern;
  readonly attack: AttackPattern;
  readonly attackPower: number;
  readonly defense: number;
  readonly movementClass: MovementClass;
  /** Attacker's damage type (a DslDamageType key, e.g. 'Slash', 'Flame'); drives
   * defender resistance/vulnerability matching. See data/dsl/damage-types.ts. */
  readonly damageType: string;
  /** Distilled DSL armor type (Cloth…Plate); the sole armor-based defensive factor. */
  readonly armorType: string;

  readonly abilities: readonly string[];
  readonly resistances: readonly string[];
  readonly vulnerabilities: readonly string[];
  /** e.g. 'large', 'unlimited-mana', 'permadeath', 'magi', 'toughness'. */
  readonly traits: readonly string[];

  /** Deployment-point cost for army building. */
  readonly cost: number;

  /** DSL `IsRecass`: true for a reclass, false for a base class. Drives the army-builder
   * base/reclass tree and the tier point cost. Optional so combat-only test literals need not set it. */
  readonly isReclass?: boolean;
  /** DSL `ClassGroup`: the base-class archetype this class belongs to (Warrior/Thief/Mage/Cleric/Bard).
   * The army-builder tree groups reclasses under their base class by this. Absent ⇒ the class key. */
  readonly classGroup?: string;
  /** Effective caster LEVEL: level cap × the class cast factor (below-level casters cast at a
   * fraction), + elf (+1). In-match buffs (imbue +3) apply later. Absent ⇒ unknown. */
  readonly castingLevel?: number;
  /** Race×class DAMAGE boost/gimp percent already folded into `attackPower` (BoostedClasses:
   * boost 10 / superboost 20 / SUPERBOOST 30; gimps negative). 0 = no modifier. */
  readonly damageBoostPct?: number;
}

/** A time-limited effect on a token (buff/debuff/condition). */
export interface StatusEffect {
  readonly key: string;
  /** Turns remaining; -1 = permanent for the match. */
  readonly remaining: number;
  readonly magnitude?: number;
}

/** A single deployed unit instance on the board. Immutable snapshot. */
export interface Unit {
  readonly kind: 'unit';
  readonly instanceId: string;
  readonly templateId: string;
  readonly side: Side;
  readonly pos: Coord;
  /** Current hit points (<= template.maxHp). */
  readonly hp: number;
  readonly statuses: readonly StatusEffect[];
  /** True once this token has used its MOVE this turn. Independent of hasActed: a token
   * gets one move and one action per turn, spendable in either order (see engine reducer). */
  readonly hasMoved: boolean;
  /** True once this token has taken its action (attack/ability) this turn. */
  readonly hasActed: boolean;
  /** Combat posture, shifting hit/avoidance + damage. Set as a FREE minor action and persists
   * across turns. Absent ⇒ 'normal' (a no-op). See data/balance/stances.ts. */
  readonly stance?: StanceKey;
}
