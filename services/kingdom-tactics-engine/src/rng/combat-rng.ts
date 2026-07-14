import type { ISeededRng } from './seeded-rng.js';
import { createRng } from './seeded-rng.js';

/**
 * Mix a per-match secret `salt` and a monotonic `step` counter into one well-distributed 32-bit
 * seed. Used to build the SERVER-ONLY combat/defense RNG: the salt lives only on the server (never
 * in MatchState, never broadcast), so a client cannot reproduce the stream, yet the server replays
 * it deterministically from (salt, step). Not a cryptographic hash — the secrecy of the salt is what
 * makes avoidance rolls hard to predict, not the mixing function.
 */
export function combatSeed(salt: number, step: number): number {
  let h = ((salt >>> 0) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (step >>> 0), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Build the server-only, step-counted, salted combat RNG for one action. Same (salt, step) ⇒
 * identical stream (replayable); different salt or step ⇒ a divergent stream.
 */
export function createCombatRng(salt: number, step: number): ISeededRng {
  return createRng(combatSeed(salt, step));
}

/**
 * Derive a combat salt deterministically from a match seed. Used by LOCAL/offline play so a whole
 * match (avoidance rolls included) reproduces from the seed alone — replay/debug friendly. The real
 * online server instead injects a crypto-random, secret salt (predictability offline is a non-issue;
 * only cross-network play needs the salt to be unguessable). The constant just decorrelates the salt
 * from any `combatSeed(seed, step)` stream so the two never collide.
 */
export function deriveCombatSalt(seed: number): number {
  return combatSeed(seed, 0x53414c54 /* 'SALT' */);
}
