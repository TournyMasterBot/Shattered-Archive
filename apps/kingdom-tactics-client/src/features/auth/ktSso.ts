/**
 * Phase F: kt-client's login trigger. kingdom-tactics-server is a real backend (unlike
 * game-client, which has no backend of its own) and performs its own SSO code exchange using
 * its own registered key — see kt-server's `http/kt-sso-routes.ts`.
 */
import { SITE_ORIGIN } from './kt-auth-config';

export type { ParsedAuthFragment } from './authFragment';
export { parseAuthFragment } from './authFragment';

/** Navigates the WHOLE page out to kt-server's login hand-off. Never returns. */
export function startLogin(): void {
  const returnUrl = window.location.origin + window.location.pathname;
  window.location.href = `${SITE_ORIGIN}/api/kt/auth/start?returnUrl=${encodeURIComponent(returnUrl)}`;
}
