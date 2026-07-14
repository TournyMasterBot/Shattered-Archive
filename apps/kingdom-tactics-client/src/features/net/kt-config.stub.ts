/**
 * Jest stub for `kt-config.ts` (jest runs CJS and cannot parse `import.meta`). The client jest
 * config maps `./kt-config` here; it mirrors the real module's exports with static defaults.
 */
export const DEFAULT_KT_WS = 'ws://localhost:8090/ws/kt';
export const DEFAULT_KT_MATCH_ID = 'duel-1';
