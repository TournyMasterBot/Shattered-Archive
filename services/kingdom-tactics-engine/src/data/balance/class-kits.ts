import type { AttackPattern, MovePattern, MovementClass } from '../../model/index.js';
import { CLASS_ATTRIBUTES } from '../dsl/class-attributes.js';

/**
 * HAND-AUTHORED tactical tuning for a class (grid stats + chess-variant patterns).
 * This is a primary balance surface — changing a value here flows through
 * unitTemplate() into the live match, the AI, and every simulator. Keyed by the
 * class key from data/dsl/classes.ts. (Canonical DSL attributes — primary/secondary
 * stat, armor type, abilities — come from the distilled class-attributes.ts.)
 */
export interface ClassKit {
  readonly classKey: string;
  readonly baseHp: number;
  readonly attackPower: number;
  readonly defense: number;
  readonly move: MovePattern;
  readonly attack: AttackPattern;
  readonly movementClass: MovementClass;
  /** Magi classes have spell power scaled by the active moon phase. */
  readonly isMagi: boolean;
  /** Attacker's damage type (DslDamageType key); drives resist/vuln matching. */
  readonly damageType: string;
  readonly traits: readonly string[];
}

const melee = (range = 1): AttackPattern => ({ kind: 'melee', range, minRange: 1, areaRadius: 0 });

export const CLASS_KITS: Record<string, ClassKit> = {
  Warrior: {
    classKey: 'Warrior',
    baseHp: 30,
    attackPower: 10,
    defense: 8,
    move: { kind: 'orthogonal', range: 3, jumps: false },
    attack: melee(1),
    movementClass: 'ground',
    isMagi: false,
    damageType: 'Slash',
    traits: ['plate'],
  },
  Ranger: {
    classKey: 'Ranger',
    baseHp: 24,
    attackPower: 9,
    defense: 5,
    move: { kind: 'omni', range: 4, jumps: false },
    attack: { kind: 'orthogonal', range: 4, minRange: 2, areaRadius: 0 },
    movementClass: 'ground',
    isMagi: false,
    damageType: 'Pierce',
    traits: ['ranged'],
  },
  Assassin: {
    classKey: 'Assassin',
    baseHp: 20,
    attackPower: 11,
    defense: 4,
    move: { kind: 'omni', range: 5, jumps: false },
    attack: melee(1),
    movementClass: 'ground',
    isMagi: false,
    damageType: 'Stab',
    traits: ['stealth'],
  },
  Mage: {
    classKey: 'Mage',
    baseHp: 18,
    attackPower: 12,
    defense: 3,
    move: { kind: 'omni', range: 3, jumps: false },
    attack: { kind: 'omni', range: 3, minRange: 1, areaRadius: 1 },
    movementClass: 'ground',
    isMagi: true,
    damageType: 'Flame',
    traits: ['ranged', 'magi'],
  },
  Cleric: {
    classKey: 'Cleric',
    baseHp: 24,
    attackPower: 7,
    defense: 6,
    move: { kind: 'orthogonal', range: 3, jumps: false },
    attack: melee(1),
    movementClass: 'ground',
    isMagi: true,
    damageType: 'Divine',
    traits: ['magi', 'support'],
  },
};

// ---------------------------------------------------------------------------
// Default kits — every mortal class must be playable, but only a handful are
// hand-authored above. For the rest, derive a reasonable kit from the distilled
// DSL attributes: the class's `classGroup` picks a combat archetype, `armorType`
// nudges defense. These are intentionally rough (defaults now, hand-tuning later,
// mirroring the ability no-op/override pattern) — a hand kit in CLASS_KITS always
// wins. Keyed off class-attributes.ts, the canonical DSL distillation.
// ---------------------------------------------------------------------------

type Archetype = Omit<ClassKit, 'classKey'>;

/** One template per DSL `classGroup` value (Warrior/Thief/Mage/Cleric/Bard). */
const ARCHETYPES: Record<string, Archetype> = {
  Warrior: {
    baseHp: 28,
    attackPower: 9,
    defense: 7,
    move: { kind: 'orthogonal', range: 3, jumps: false },
    attack: melee(1),
    movementClass: 'ground',
    isMagi: false,
    damageType: 'Slash',
    traits: ['melee'],
  },
  Thief: {
    baseHp: 20,
    attackPower: 10,
    defense: 4,
    move: { kind: 'omni', range: 5, jumps: false },
    attack: melee(1),
    movementClass: 'ground',
    isMagi: false,
    damageType: 'Stab',
    traits: ['stealth'],
  },
  Mage: {
    baseHp: 18,
    attackPower: 12,
    defense: 3,
    move: { kind: 'omni', range: 3, jumps: false },
    attack: { kind: 'omni', range: 3, minRange: 1, areaRadius: 1 },
    movementClass: 'ground',
    isMagi: true,
    damageType: 'Flame',
    traits: ['ranged', 'magi'],
  },
  Cleric: {
    baseHp: 24,
    attackPower: 7,
    defense: 6,
    move: { kind: 'orthogonal', range: 3, jumps: false },
    attack: melee(1),
    movementClass: 'ground',
    isMagi: true,
    damageType: 'Divine',
    traits: ['magi', 'support'],
  },
  Bard: {
    baseHp: 22,
    attackPower: 8,
    defense: 5,
    move: { kind: 'omni', range: 4, jumps: false },
    attack: melee(1),
    movementClass: 'ground',
    isMagi: false,
    damageType: 'Slash',
    traits: ['support', 'song'],
  },
};

/** Fallback archetype when a class's group is unknown/null. */
const GENERIC_ARCHETYPE: Archetype = ARCHETYPES.Warrior;

/** Defense adjustment layered on the archetype from the class's DSL armor tier. */
const ARMOR_DEFENSE: Record<string, number> = {
  Plate: 3,
  Chain: 2,
  Studded: 1,
  Leather: 0,
  Cloth: -1,
};

const ATTR_BY_CLASS = new Map<string, (typeof CLASS_ATTRIBUTES)[number]>(
  CLASS_ATTRIBUTES.map((c) => [c.key, c]),
);

/**
 * Derive a playable ClassKit for any mortal class from its distilled attributes.
 * A hand-authored CLASS_KITS entry takes precedence (see unitTemplate); this only
 * fires for classes without one, so no class throws "no kit".
 */
export function defaultClassKit(classKey: string): ClassKit {
  const attr = ATTR_BY_CLASS.get(classKey);
  const arch = (attr?.classGroup ? ARCHETYPES[attr.classGroup] : undefined) ?? GENERIC_ARCHETYPE;
  const armorDef = attr?.armorType ? (ARMOR_DEFENSE[attr.armorType] ?? 0) : 0;
  return {
    ...arch,
    classKey,
    defense: Math.max(1, arch.defense + armorDef),
  };
}
