// apps\game-client\src\features\auth\gameSso.ts
// Phase D: game-client is a public client (no service key of its own) — the C#
// site's backend performs the actual code exchange; this module only starts the
// hand-off. See authFragment.ts for the pure parser of what comes back.

import { SITE_ORIGIN } from './siteApi';

export type { ParsedAuthFragment } from './authFragment';
export { parseAuthFragment } from './authFragment';

/** Navigates the WHOLE page out to the hub via this site's game-sso hand-off. Never returns. */
export function startLogin(): void {
  const returnUrl = window.location.origin + window.location.pathname;
  window.location.href = `${SITE_ORIGIN}/user/game-sso/start?returnUrl=${encodeURIComponent(returnUrl)}`;
}
