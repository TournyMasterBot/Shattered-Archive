import { useEffect } from 'react';
import { parseAuthFragment } from './authFragment';
import { setToken } from './authTokenStore';
import { defaultDeviceLabel, ensureDeviceCredentials, enrollDeviceAfterLogin } from './deviceCredentials';

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
      /**
       * Enrol a device key NOW, because this is the one moment an auth-server session cookie is
       * guaranteed to exist: the user has just come back from signing in there. Enrolment
       * requires a real sign-in by design — that is what stops a stolen token from enrolling a
       * device of its own — so there is no later opportunity to do this silently.
       *
       * Best-effort and deliberately un-awaited: the login has already succeeded, and a failure
       * here must not break it. Without enrolment the user simply relies on the in-memory SSO
       * token for this page and signs in again next visit, exactly as before this existed.
       */
      void (async () => {
        await ensureDeviceCredentials();
        await enrollDeviceAfterLogin(defaultDeviceLabel());
      })();
    } else {
      // Login is optional — a failed attempt is quiet and retryable, never blocking.
      console.warn('Kingdom Tactics account login failed or was cancelled.');
    }

    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
}
