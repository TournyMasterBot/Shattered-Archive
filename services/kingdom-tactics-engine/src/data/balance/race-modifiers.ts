import type { MovementClass } from '../../model/index.js';

/**
 * HAND-AUTHORED per-race grid deltas applied on top of a class kit. These are the
 * tactical translation of a race's flavor; the race's canonical base stats,
 * resistances, and size come from the distilled race-attributes.ts and are merged
 * in by the data provider. Keyed by the race key from data/dsl/races.ts.
 */
export interface RaceModifier {
  readonly raceKey: string;
  readonly hpDelta: number;
  readonly attackDelta: number;
  readonly defenseDelta: number;
  readonly moveRangeDelta: number;
  /** Overrides the class kit's movement class (e.g. a flying race). */
  readonly movementClassOverride?: MovementClass;
  readonly traits: readonly string[];
}

export const RACE_MODIFIERS: Record<string, RaceModifier> = {
  Human: { raceKey: 'Human', hpDelta: 0, attackDelta: 0, defenseDelta: 0, moveRangeDelta: 0, traits: [] },
  MountainDwarf: {
    raceKey: 'MountainDwarf',
    hpDelta: 6,
    attackDelta: 1,
    defenseDelta: 2,
    moveRangeDelta: -1,
    traits: ['sturdy'],
  },
  DarkElf: {
    raceKey: 'DarkElf',
    hpDelta: -2,
    attackDelta: 2,
    defenseDelta: 0,
    moveRangeDelta: 1,
    traits: ['darkvision'],
  },
  Ogre: {
    raceKey: 'Ogre',
    hpDelta: 12,
    attackDelta: 3,
    defenseDelta: 1,
    moveRangeDelta: -1,
    traits: ['large'],
  },
  Pixie: {
    raceKey: 'Pixie',
    hpDelta: -6,
    attackDelta: -1,
    defenseDelta: -1,
    moveRangeDelta: 2,
    movementClassOverride: 'flying',
    traits: ['flying'],
  },
};

/** Neutral fallback for races without an authored modifier yet. */
export const DEFAULT_RACE_MODIFIER: RaceModifier = {
  raceKey: '',
  hpDelta: 0,
  attackDelta: 0,
  defenseDelta: 0,
  moveRangeDelta: 0,
  traits: [],
};
