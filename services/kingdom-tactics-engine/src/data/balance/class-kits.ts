import type { AttackPattern, MovePattern, MovementClass } from '../../model/index.js';

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
