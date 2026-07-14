/**
 * Authoritative match ownership — the embeddable "match server" shared by the online `/ws/kt`
 * gateway and local/offline play. `MatchSession` is transport-agnostic (no I/O); `LocalMatch`
 * wraps it for single-device hotseat/single-player with full feature parity.
 */
export {
  MatchSession,
  type MatchSessionOptions,
  type SeatClaim,
  type ApplyResult,
} from './match-session.js';
export { LocalMatch, createLocalMatch, type LocalMatchOptions } from './local-match.js';
