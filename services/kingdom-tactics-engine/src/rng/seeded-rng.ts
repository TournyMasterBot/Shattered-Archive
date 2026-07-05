/**
 * Deterministic pseudo-random source. The engine takes RNG only through this
 * interface (never `Math.random`), so matches are reproducible from a seed and can
 * be snapshotted (`state()`) for replays and netcode reconciliation.
 */
export interface ISeededRng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [0, maxExclusive). Returns 0 if maxExclusive <= 0. */
  int(maxExclusive: number): number;
  /** Uniformly pick an element; throws on an empty array. */
  pick<T>(arr: readonly T[]): T;
  /** Current internal state as a single 32-bit number (see restore via createRng). */
  state(): number;
  /** Independent copy positioned at the same state. */
  clone(): ISeededRng;
}

/**
 * Mulberry32 — a small, fast, well-distributed 32-bit PRNG. Its entire state is one
 * uint32, and the constructor seed IS that state, so `createRng(rng.state())`
 * reconstructs an identical stream (used to persist/restore MatchState.rngState).
 */
export class Mulberry32 implements ISeededRng {
  private s: number;

  constructor(seedOrState: number) {
    this.s = seedOrState >>> 0;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('ISeededRng.pick(): empty array');
    return arr[this.int(arr.length)];
  }

  state(): number {
    return this.s >>> 0;
  }

  clone(): ISeededRng {
    return new Mulberry32(this.s);
  }
}

/** Construct a seeded RNG. Passing a value returned by `state()` restores that stream. */
export function createRng(seedOrState: number): ISeededRng {
  return new Mulberry32(seedOrState);
}
