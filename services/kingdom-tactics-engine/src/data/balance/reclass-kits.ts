/**
 * HAND-AUTHORED reclass overrides. A reclass starts from a base class kit and
 * applies these deltas, so it inherits and specializes the base. Keyed by the
 * reclass key from data/dsl/classes.ts (isReclass flags live in class-attributes.ts).
 */
export interface ReclassKit {
  readonly classKey: string;
  /** Base class kit this reclass builds on. */
  readonly baseClassKey: string;
  readonly hpDelta: number;
  readonly attackDelta: number;
  readonly defenseDelta: number;
  readonly addTraits: readonly string[];
}

export const RECLASS_KITS: Record<string, ReclassKit> = {
  Dragonslayer: {
    classKey: 'Dragonslayer',
    baseClassKey: 'Warrior',
    hpDelta: 4,
    attackDelta: 3,
    defenseDelta: 0,
    addTraits: ['dragonslayer'],
  },
};
