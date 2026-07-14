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

// Deterministic reducer over MatchState.
export * from './engine/game-engine.js';

// Pluggable AI policies.
export * from './ai/policy.js';
export * from './ai/random-policy.js';
export * from './ai/greedy-policy.js';

// Headless simulators (match / batch / scenario).
export * from './sim/types.js';
export * from './sim/match-simulator.js';
export * from './sim/batch-simulator.js';
export * from './sim/scenario-simulator.js';

// /ws/kt transport contract (shared by the KT client + server).
export * from './net/protocol.js';

// Match-setup / deployment factory (army rosters -> initial MatchState).
export * from './setup/build-match.js';

// Authoritative match ownership (MatchSession) + local/offline driver (LocalMatch) —
// the same engine-owned reducer path for online gateway and hotseat/single-player.
export * from './match/index.js';

