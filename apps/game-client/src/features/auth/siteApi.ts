// apps\game-client\src\features\auth\siteApi.ts
// Phase D: the C# service (Server.Web.Public) game-client pairs with as its
// backend (key-custody constraint — game-client has no service key of its own).

// Absolute origin, for the login-start NAVIGATION — a top-level page redirect
// isn't subject to CORS, so there's no benefit to routing it through the dev
// proxy below; it always targets the real origin directly.
export const SITE_ORIGIN = import.meta.env.DEV ? (import.meta.env.VITE_SITE_API ?? 'http://localhost:5000') : 'https://shatteredarchive.com';

// Base for fetch() calls (cloud sync). In dev, the vite proxy (`/api/site/*` ->
// VITE_SITE_API) keeps these same-origin, dodging CORS entirely. In prod this is
// a genuine cross-origin call, relying on the Cors:AllowedOrigins tightening
// added alongside these endpoints (Phase D Step 1) rather than the historical
// allow-any default.
export function siteApiBase(): string {
  return import.meta.env.DEV ? '/api/site' : SITE_ORIGIN;
}
