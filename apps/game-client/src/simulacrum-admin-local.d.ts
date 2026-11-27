/**
 * Build-time constant set by vite.config.ts `define` from the PROCESS environment (SIMULACRUM_ADMIN_LOCAL=true).
 * True only in the experimental/dev docker build. Every import of features/simulacrumAdmin must sit behind
 * `if (__SIMULACRUM_ADMIN_LOCAL__)` so a production bundle drops it; scripts/check-local-only.mjs proves the marker is absent from dist.
 */
declare const __SIMULACRUM_ADMIN_LOCAL__: boolean;
