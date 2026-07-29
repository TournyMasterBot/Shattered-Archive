import { useEffect } from 'react';
import { parseAuthFragment } from './authFragment';
import { setToken } from './authTokenStore';

/**
 * Phase F: on mount, checks `window.location.hash` for the kt-sso hand-off's result and stores
 * the token, then strips the fragment so it never lingers in history/screenshots. No router
 * exists in this app (App.tsx renders a single `<ScreenRouter/>`), so this runs as a plain
 * effect rather than a dedicated route/page — mirrors game-client's `useAuthCallback` (Phase D).
 */
export function useAuthCallback(): void {
  useEffect(() => {
    const parsed = parseAuthFragment(window.location.hash);
    if (parsed.kind === 'none') return;

    if (parsed.kind === 'token') {
      setToken(parsed.token, parsed.expiresAt);
    } else {
      // Login is optional — a failed attempt is quiet and retryable, never blocking.
      console.warn('Kingdom Tactics account login failed or was cancelled.');
    }

    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
}
