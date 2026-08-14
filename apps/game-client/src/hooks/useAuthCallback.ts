// apps\game-client\src\hooks\useAuthCallback.ts
// Phase D: on mount, checks window.location.hash for the game-sso hand-off's
// result (see features/auth/gameSso.ts's parseAuthFragment) and stores the
// token, then strips the fragment so it never lingers in history/screenshots.
// No router exists in this app (App.tsx renders a single <MainContainer/>), so
// this runs as a plain effect rather than a dedicated route/page.

import React from 'react';
import { parseAuthFragment } from '../features/auth/authFragment';
import { setToken } from '../features/auth/authTokenStore';

export function useAuthCallback(): void {
  React.useEffect(() => {
    const parsed = parseAuthFragment(window.location.hash);
    if (parsed.kind === 'none') return;

    if (parsed.kind === 'token') {
      setToken(parsed.token, parsed.expiresAt);
    } else {
      // Login is optional — a failed attempt is quiet and retryable, never
      // blocking, so just log it rather than surfacing intrusive UI.
      console.warn('Shattered Archive account login failed or was cancelled.');
    }

    // Strip the fragment either way — it must not persist in the URL.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
}
