/** Deterministic seeded RNG (interface + Mulberry32 impl). */
export { type ISeededRng, Mulberry32, createRng } from './seeded-rng.js';
/** Server-only salted + step-counted combat RNG (unguessable defense rolls); seed-derived salt for local play. */
export { combatSeed, createCombatRng, deriveCombatSalt } from './combat-rng.js';
