/**
 * Phase F: runtime auth/API config. `import.meta.env` is injected by Vite at build time; jest
 * runs modules as CJS and cannot evaluate it, so the client jest config maps this module to
 * `kt-auth-config.stub.ts` (see moduleNameMapper) — mirrors `features/net/kt-config.ts`'s
 * established pattern for the exact same problem. Keep the two files' exported names in sync.
 */
const KT_API = (import.meta.env?.VITE_KT_API as string | undefined) ?? 'http://localhost:51000';
const IS_DEV = Boolean(import.meta.env?.DEV);

/**
 * Absolute origin for the login-start page NAVIGATION. In dev, kt-server runs on a genuinely
 * separate port (`VITE_KT_API`) — the vite dev proxy doesn't apply to a top-level navigation
 * target on a different origin anyway. In production this deploys single-subdomain, same as
 * mud-builder/auth (confirmed against how game-client's OWN Dockerfile actually behaves: it
 * declares no ARG/ENV for VITE_GAME_API/VITE_GAME_SECURE at all, so those compose build args
 * are silently unused — the real, working pattern is kt-client's own origin, with the edge
 * nginx routing `/api/kt`/`/ws/kt` on that SAME subdomain back to kt-server) — so `SITE_ORIGIN`
 * is just the current page's origin there, not a separate baked-in server origin.
 */
export const SITE_ORIGIN = IS_DEV ? KT_API : window.location.origin;

/**
 * Base for fetch() calls — always relative. In dev, the vite proxy (`/api/kt/*` -> `VITE_KT_API`,
 * no path rewrite — see vite.config.ts) keeps these same-origin. In production, the edge nginx
 * proxies the SAME path on kt-client's own subdomain back to kt-server — same "relative, someone
 * else routes it" convention either way, no CORS needed in either environment.
 */
export function siteApiBase(): string {
  return '';
}
