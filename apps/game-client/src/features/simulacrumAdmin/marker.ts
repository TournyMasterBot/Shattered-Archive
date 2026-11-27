/**
 * The string `scripts/check-local-only.mjs` looks for in a production `dist`: present in a flagged bundle, absent from a production one.
 * It must be referenced only from modules reached through `index.ts` behind `__SIMULACRUM_ADMIN_LOCAL__`.
 */
export const SIMULACRUM_ADMIN_BUNDLE_MARKER = 'sa-simulacrum-admin-local-v1';
