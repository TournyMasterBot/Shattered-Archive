/**
 * Google Analytics 4, the app's only telemetry.
 *
 * Same contract as the ad placement next door (see AdSlot.tsx): with `__SP_GA_ID__` empty at
 * build time this does NOTHING — no script injected, no cookie set, no request to Google. A
 * default build is silent, and turning it on is a deliberate act in the compose file.
 *
 * A `define` constant rather than `import.meta.env`, for the same reason ad-config.ts gives:
 * this repo's Jest client setup cannot compile `import.meta` anywhere in a module graph, so
 * reading env that way would make every importer of this module untestable.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `cookie_domain` IS PINNED — the security-relevant line in this file.
 *
 * GA4's default is `cookie_domain: 'auto'`, which resolves to the REGISTRABLE domain. On this
 * host that means `_ga` would be set on `.shatteredarchive.dev` and therefore transmitted to
 * EVERY sibling subdomain — the sign-in hub at auth.shatteredarchive.dev included — on every
 * request they make. Nothing in the stack reads `_ga`, so that is a blast-radius and privacy
 * problem rather than an exploitable one, but a cookie has no business reaching origins that
 * have no use for it, and this app is the one origin here that permits inline script (it
 * carries an ad unit; see deploy/nginx/includes/security-headers-ads.conf).
 *
 * Pinning it to `location.hostname` also means the visit identifier is NOT shared with any
 * sibling host, regardless of GA4 property. This app runs its OWN dedicated property
 * (2026-08-23), separate from the landing page's and Soulsteel's — but the pin stays even
 * though property-sharing is no longer the reason: it's still what keeps `_ga` off
 * auth.shatteredarchive.dev and every other sibling subdomain. deploy/index.html does the same
 * thing for the same reason.
 * ---------------------------------------------------------------------------------------
 */
declare const __SP_GA_ID__: string;

const SCRIPT_ID = 'sp-ga-loader';

/** Undefined outside a Vite build (Jest), where the constant was never substituted. */
export function readGaId(): string | undefined {
  try {
    return __SP_GA_ID__ || undefined;
  } catch {
    return undefined;
  }
}

interface GtagWindow {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}

/**
 * Injects gtag.js once. Safe to call repeatedly — the script id guard makes a second call a
 * no-op, which matters under React StrictMode's double-invoked effects.
 *
 * @param id Injected in tests; production reads the build-time constant.
 */
export function initAnalytics(id: string | undefined = readGaId()): void {
  if (!id) return;
  if (typeof document === 'undefined') return;
  if (document.getElementById(SCRIPT_ID)) return;

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);

  const w = window as unknown as GtagWindow;
  const dataLayer = (w.dataLayer = w.dataLayer ?? []);

  // Google's published snippet pushes the `arguments` object; gtag.js reads each entry
  // positionally, so a rest array is the same shape to its consumer and types cleanly.
  const gtag = (...args: unknown[]) => dataLayer.push(args);

  gtag('js', new Date());
  gtag('config', id, {
    // See the long note above — this is what keeps `_ga` off the sibling subdomains.
    cookie_domain: window.location.hostname,
    cookie_flags: 'SameSite=Lax;Secure',
  });
}
