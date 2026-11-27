/**
 * Build-time constant set by vite.config.ts `define` from the PROCESS environment (COPILOT_LOCAL=true).
 * True only in the experimental/dev docker build. Every Copilot import must sit behind `if (__COPILOT_LOCAL__)`
 * so a production bundle drops it; scripts/check-local-only.mjs proves the marker is absent from dist.
 */
declare const __COPILOT_LOCAL__: boolean;
