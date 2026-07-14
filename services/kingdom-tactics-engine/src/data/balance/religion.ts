/**
 * Authored bridge from a unit's DSL deity (god) to the moral alignment its worshipper
 * holds. In the DSL a character's alignment flows from their chosen god, and KT keys the
 * three moons off that alignment (White→Good, Red→Neutral, Black→Evil — see
 * data/balance/moons.ts). Chaos (Malachive) has no lunar patron, so its followers are
 * unaligned with respect to the moons.
 *
 * Pure data-layer helper (no provider/DOM/Node) — safe for the isomorphic engine.
 */
import { GODS } from '../dsl/gods.js';
import type { AlignmentKey } from '../dsl/alignment.js';

/**
 * The alignment a worshipper of `godKey` holds. Good/Neutral/Evil map straight through;
 * Chaos and unknown/absent gods resolve to `Mixed` (unaligned — no moon empowers them).
 */
export function alignmentForGod(godKey: string | undefined): AlignmentKey {
  const group = GODS.find((g) => g.key === godKey)?.group;
  switch (group) {
    case 'Good':
      return 'Good';
    case 'Neutral':
      return 'Neutral';
    case 'Evil':
      return 'Evil';
    default:
      // Chaos (Malachive) / unknown — no place in the lunar order.
      return 'Mixed';
  }
}

/** Gods grouped for a religion picker, in the DSL alignment order (Good→Neutral→Evil→Chaos). */
export function godsByAlignment(): ReadonlyArray<{ readonly group: string; readonly gods: readonly string[] }> {
  const order = ['Good', 'Neutral', 'Evil', 'Chaos'] as const;
  return order.map((group) => ({
    group,
    gods: GODS.filter((g) => g.group === group).map((g) => g.key),
  }));
}
