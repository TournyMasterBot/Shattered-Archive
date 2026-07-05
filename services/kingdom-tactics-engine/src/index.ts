/**
 * @shatteredarchive/kingdom-tactics-engine
 *
 * Isomorphic barrel for the Kingdom Tactics game engine: centralized DSL data,
 * deterministic rules/RNG, AI policies, and simulators. Imported by both the
 * kingdom-tactics client and server (and, later, the mobile app). No DOM and no
 * Node built-ins in shipped code — see tsconfig.json (`types: []`).
 *
 * Public surface is re-exported here as each subsystem lands (model, rng, data, …).
 */

/** Package identity marker. */
export const KINGDOM_TACTICS_ENGINE = 'kingdom-tactics-engine' as const;

// Domain model (immutable, data-only types).
export * from './model/index.js';

// Deterministic seeded RNG.
export * from './rng/index.js';

// Centralized game data + providers (distilled DSL data + authored balance).
export * from './data/index.js';

// Pure rules resolvers.
export * from './rules/index.js';

