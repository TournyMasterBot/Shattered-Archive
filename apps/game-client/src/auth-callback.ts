// apps/game-client/src/auth-callback.ts
// Landing page for the game-sso hand-off, loaded by auth-callback.html.
//
// Its whole reason to exist is that the hand-off used to come back to the app's
// own URL, which meant logging in navigated the WHOLE page — dropping the game
// socket and disconnecting the player mid-session. The login now runs in a
// popup that lands HERE instead: a page with no bundle, no React and no
// connection of its own, so the tab actually playing the game is never touched.
//
// Same origin as the app, so writing the token via authTokenStore puts it in
// the very localStorage the opener reads, and the opener learns about it from
// the resulting `storage` event (see authTokenStore.subscribeToToken).

import { parseAuthFragment } from './features/auth/authFragment';
import { setToken } from './features/auth/authTokenStore';

const message = document.getElementById('message');
const hint = document.getElementById('hint');

function report(text: string, hintText: string): void {
  if (message) message.textContent = text;
  if (hint) hint.textContent = hintText;
}

const parsed = parseAuthFragment(window.location.hash);

// Strip the fragment before anything else can read it: the token must not sit
// in this window's URL, its history entry, or a screenshot.
window.history.replaceState(null, '', window.location.pathname);

if (parsed.kind === 'token') {
  setToken(parsed.token, parsed.expiresAt);
  report('Signed in.', 'This window closes by itself.');
} else if (parsed.kind === 'error') {
  // Login is optional and always retryable, so this stays quiet and
  // non-blocking — matching how the in-app callback path treats a failure.
  report('Sign-in was cancelled or failed.', 'You can close this window and try again.');
} else {
  report('Nothing to sign in with.', 'You can close this window.');
}

// Only auto-close what we opened. A window with no opener is someone who
// navigated here directly — closing it would just look broken, and close()
// is a no-op for non-script-opened windows anyway.
if (window.opener && parsed.kind !== 'none') {
  // A beat so the outcome is legible rather than a flash, and so the storage
  // write has certainly landed before this context goes away.
  window.setTimeout(() => window.close(), parsed.kind === 'token' ? 600 : 2500);
}
