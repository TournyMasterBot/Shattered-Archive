/**
 * Runtime connection defaults for the online slice. `import.meta.env.VITE_KT_WS` is injected by
 * Vite at build time. Jest runs modules as CJS and cannot evaluate `import.meta`, so the client
 * jest config maps this module to `kt-config.stub.ts` (see moduleNameMapper) — keep the two files'
 * exported names in sync.
 */
export const DEFAULT_KT_WS =
  (import.meta.env?.VITE_KT_WS as string | undefined) ?? 'ws://localhost:8090/ws/kt';

export const DEFAULT_KT_MATCH_ID = 'duel-1';
