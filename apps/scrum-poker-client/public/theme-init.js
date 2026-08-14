/*
 * Applies the stored light/dark theme before first paint, so a dark-mode user never gets a
 * white flash. The app re-reads the same key on mount; this copy only wins the race and is not
 * the source of truth (see src/storage.ts, which owns the key name).
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A FILE IN public/ RATHER THAN AN INLINE <script> IN index.html.
 *
 * It used to be inline, and it was BROKEN the whole time: every CSP profile this app has ever
 * been served under sets `script-src 'self'` with no 'unsafe-inline', so the browser refused it
 * and the flash happened anyway. The failure was invisible because it is cosmetic and the app
 * corrects itself on mount — nothing logged, nothing threw.
 *
 * The fix is NOT to add 'unsafe-inline' to the CSP. That token does not create an XSS, it removes
 * the mitigation that would neuter one, and this origin's localStorage holds real per-room
 * credentials (participant secrets and host tokens). Trading script-injection defence for a
 * theme flash would be a bad bargain; an external file costs one request from the same origin
 * and satisfies `'self'` exactly.
 *
 * Vite copies public/ to the dist root verbatim, so this is served at /theme-init.js by the
 * app's own nginx (deploy/nginx/scrum-poker-client.conf) with no build-time processing.
 *
 * Loaded WITHOUT defer/async from <head>, deliberately: parsing must block here so the attribute
 * is set before the first frame. `defer` would run it after paint and reintroduce the flash.
 * ---------------------------------------------------------------------------------------
 */
(function () {
  try {
    var stored = localStorage.getItem('scrum-poker:theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored === 'light' || stored === 'dark' ? stored : prefersDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
