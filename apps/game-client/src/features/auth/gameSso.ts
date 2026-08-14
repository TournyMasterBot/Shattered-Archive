// apps\game-client\src\features\auth\gameSso.ts
// Phase D: game-client is a public client (no service key of its own) — the C#
// site's backend performs the actual code exchange; this module only starts the
// hand-off. See authFragment.ts for the pure parser of what comes back.
//
// The hand-off runs in a POPUP, never in this window. Logging in used to set
// window.location, which tore down the whole app — including the live telnet
// WebSocket — and dropped the player out of the game just to save some scripts.
// The popup lands on auth-callback.html (same origin, no bundle, no connection
// of its own), which writes the token to the localStorage this window reads, so
// the playing tab is never navigated and the socket is never touched.

import { SITE_ORIGIN } from './siteApi';
import { getToken, isExpired, subscribeToToken, type StoredAuthToken } from './authTokenStore';

export type { ParsedAuthFragment } from './authFragment';
export { parseAuthFragment } from './authFragment';

export type LoginOutcome =
  | { kind: 'success'; token: StoredAuthToken }
  /** The popup went away without leaving a token — the user dismissed it. */
  | { kind: 'cancelled' }
  /** Still open, still nothing, long past any real login. */
  | { kind: 'timeout' }
  /** The browser refused to open the window at all (pop-up blocker). */
  | { kind: 'blocked' };

/** The bundle-free landing page; see auth-callback.html / src/auth-callback.ts. */
const CALLBACK_PATH = '/auth-callback.html';

// A NAMED window, so a second click re-focuses the login already in flight
// instead of opening a rival one that races it for the same state cookie.
const POPUP_NAME = 'shattered-archive-login';

const POLL_MS = 400;

// Generous: this covers a full hub login (password, possibly 2FA, possibly
// creating the account) with the popup sitting idle. The user dismissing the
// window resolves immediately via the `closed` check, so this ceiling only
// bites on a genuinely abandoned attempt, and stays well inside the 10-minute
// game-sso state cookie the C# side sets.
const TIMEOUT_MS = 3 * 60 * 1000;

function popupFeatures(): string {
  const width = 520;
  const height = 720;
  // Centre on the window the user is actually looking at, not the primary
  // monitor — screenX/outerWidth are what make this correct on a second screen.
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  return `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
}

function validToken(): StoredAuthToken | null {
  const stored = getToken();
  return stored && !isExpired(stored) ? stored : null;
}

/**
 * Opens the hub login in a popup and resolves once it settles. Never navigates
 * this window, so the caller's game connection survives the whole exchange.
 */
export function startLogin(): Promise<LoginOutcome> {
  const returnUrl = window.location.origin + CALLBACK_PATH;
  const startUrl = `${SITE_ORIGIN}/user/game-sso/start?returnUrl=${encodeURIComponent(returnUrl)}`;

  // What "logged in" looked like BEFORE we opened anything, so a token already
  // sitting in storage can't be mistaken for the result of this attempt.
  const baselineToken = validToken()?.token ?? null;

  const popup = window.open(startUrl, POPUP_NAME, popupFeatures());
  if (!popup) return Promise.resolve<LoginOutcome>({ kind: 'blocked' });
  popup.focus?.();

  return new Promise<LoginOutcome>((resolve) => {
    let settled = false;
    let poll = 0;
    let timer = 0;
    let unsubscribe: () => void = () => {};

    const finish = (outcome: LoginOutcome): void => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timer);
      unsubscribe();
      resolve(outcome);
    };

    const closePopup = (): void => {
      try {
        popup.close();
      } catch {
        // Cross-origin or already gone — nothing to do either way.
      }
    };

    // The fast path: the callback page's write raises `storage` here the instant
    // it lands, well before it closes itself.
    const checkForNewToken = (): void => {
      const stored = validToken();
      if (stored && stored.token !== baselineToken) {
        closePopup();
        finish({ kind: 'success', token: stored });
      }
    };

    unsubscribe = subscribeToToken(checkForNewToken);

    // The backstop: `storage` is the documented mechanism but not something to
    // stake the only signal on, and it says nothing about the user closing the
    // window. Polling covers both.
    poll = window.setInterval(() => {
      checkForNewToken();
      if (settled) return;
      if (popup.closed) {
        // The window is gone. Any token valid RIGHT NOW means the login worked —
        // accepted even when byte-identical to the baseline, since re-authing an
        // already-valid session still leaves the user signed in, which is the
        // honest outcome to report. Nothing valid means they dismissed it.
        const stored = validToken();
        finish(stored ? { kind: 'success', token: stored } : { kind: 'cancelled' });
      }
    }, POLL_MS);

    timer = window.setTimeout(() => {
      closePopup();
      finish({ kind: 'timeout' });
    }, TIMEOUT_MS);
  });
}
