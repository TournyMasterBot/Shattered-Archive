/**
 * @shatteredarchive/copilot-core — the pure logic of Copilot.
 *
 * Contracts, parsers, policy, ledger and scrubbing, imported unchanged by copilot-server
 * (which owns files, network and the clock) and by the game-client (which owns the UI and the
 * only path to the MUD). Local-only: nothing here may be imported by a production build.
 */

export * from './contracts.js';
export * from './color/ansi.js';
export * from './color/dslColors.js';
export * from './color/ansiToDsl.js';
export * from './characters/whoisic.js';
export * from './characters/matrix.js';
export * from './characters/registry.js';
export * from './privacy/scrub.js';
export * from './policy/classify.js';
export * from './policy/confidence.js';
export * from './policy/floor.js';
export * from './policy/settings.js';
export * from './policy/decide.js';
export * from './policy/buckets.js';
export * from './ledger/records.js';
export * from './ledger/understanding.js';
export * from './ledger/store.js';
export * from './ledger/graduation.js';
export * from './log/events.js';
export * from './log/state.js';
export * from './log/reducer.js';
export * from './fight/consider.js';
export * from './fight/condition.js';
export * from './fight/damage.js';
export * from './fight/monitor.js';
export * from './fight/knowledge.js';
export * from './fight/gate.js';
export * from './fight/considerTracker.js';
export * from './fight/offensiveSpells.js';
