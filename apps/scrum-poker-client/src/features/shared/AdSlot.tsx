import { useEffect, useRef } from 'react';

import { readAdConfig, type AdConfig } from './ad-config.js';

/**
 * The app's ONE ad placement.
 *
 * The reference site this replaces carried eight slots including a sticky footer overlay and
 * two sidebar towers; this is the deliberate opposite — a single bounded block below the
 * estimating content, never injected into the flow, and never sticky. It renders once per page.
 *
 * Labelled "Ads by Google" rather than a vague "Advertisement", and given its own bordered
 * surface, so paid content is unmistakably distinct from the app around it.
 *
 * SHAPE comes from the FORMAT REQUEST plus the container width, not from clipping: `auto` with
 * `full-width-responsive="true"` — matching how the slot id was actually created in the
 * AdSense console (2026-08-23: switched from a hardcoded `rectangle`/336px-cap request after a
 * live "No slot size for availableWidth=90" failure). `.sp-ad-inner` no longer caps its own
 * width below `.sp-ad`'s — Google's responsive algorithm picks whatever creative shape fits
 * the space it's actually given, which is far more robust than us guessing a pixel family in
 * advance. It deliberately does NOT set a `max-height` with `overflow: hidden` — the AdSense
 * program policies prohibit obscuring any part of an ad, so clipping a creative is a policy
 * violation rather than tidy layout. The bound is still real: `.sp-ad` itself is a separate,
 * bordered block below the estimating content (never inline with it — see App.css), just no
 * longer artificially narrower than that block allows.
 *
 * THE REAL 2026-08-23 ROOT CAUSE, for anyone chasing this error again: it was never a sizing
 * request problem. `.sp-ad { margin: 0 auto 24px; }` sets auto left/right margins, and per the
 * Flexbox spec an item with an auto cross-axis margin is NEVER stretched by the parent's
 * `align-items`, full stop — `align-self: stretch` on the item itself does not override this.
 * `.sp-ad` was silently shrinking to its content's width (~131px) regardless of viewport, and
 * everything nested inside it (including this component's own `width: 100%` inline styles)
 * was just inheriting that starved container. The fix is `width: 100%` on `.sp-ad` in App.css
 * — see the comment there. Live-reproduced and confirmed against production before and after.
 *
 * With no `VITE_AD_CLIENT`/`VITE_AD_SLOT` at build time it renders NOTHING: no container, no
 * placeholder, and — importantly — the loader below is never injected, so the page makes no
 * request to any ad network.
 *
 * `isDev` OVERRIDES configuration, not just fills the gap when it's missing (2026-08-06): a
 * dev build shows the placeholder EVEN IF real credentials are set, so the real `<ins>` and its
 * loader script can never ship from a dev deployment — see ad-config.ts for how `isDev` is
 * derived. That matters because the dev/experimental compose's own comment explicitly allows
 * setting real ad ids there "to exercise the wiring locally"; without this override, doing so
 * would make a dev box serve live ad requests, which is exactly the kind of non-public-site
 * traffic AdSense's invalid-traffic policy exists to catch.
 *
 * The loader code does still SIT in the bundle as dead code. It can't be tree-shaken: the
 * `config` prop exists so tests can drive this component, which means neither branch is ever a
 * statically-known constant and the minifier can't drop it. Testability is worth more than
 * deleting one unreachable URL string — but don't mistake "no ad code in the bundle" for what
 * this guarantees, which is "no ad request at runtime".
 *
 * `.sp-ad-inner`'s width/height are set INLINE below, not just via the `.sp-ad-inner` CSS
 * class (2026-08-06 fix). `<script type="module">` runs as soon as the document finishes
 * parsing and does NOT wait for `<link rel="stylesheet">` to finish loading/applying — on a
 * live incident this raced, AdSense measured an unstyled, near-zero-width container ("No slot
 * size for availableWidth=90" in the console) and fell back to legacy `document.write()`
 * rendering, which — called after the page has already loaded — WIPES AND RE-EXECUTES THE
 * ENTIRE DOCUMENT. That is a plausible single root cause for everything reported alongside it:
 * a blocked inline-script CSP violation (document.write's injected markup), and duplicate room
 * joins (the app's whole module graph re-running mid-session opens a second websocket before
 * the first ever persisted its participant secret, so neither join can see the other's row).
 * Inline sizing guarantees the correct dimensions from the very first paint, CSS or no CSS,
 * which removes the race outright rather than narrowing its window.
 */
const AD_INNER_STYLE = { width: '100%', minHeight: 100 } as const;

interface AdSlotProps {
  /** Injected in tests; production reads the build-time env. */
  config?: AdConfig;
}

const SCRIPT_ID = 'sp-ad-loader';

export default function AdSlot({ config }: AdSlotProps) {
  const resolved = config ?? readAdConfig();
  const { client, slot, isDev } = resolved;
  const configured = Boolean(client && slot);
  // isDev wins outright: a dev build never loads the real unit, configured or not.
  const showRealAd = configured && !isDev;
  const pushed = useRef(false);

  useEffect(() => {
    if (!showRealAd || pushed.current) return;
    pushed.current = true;

    // Loaded lazily and only once, from the effect rather than index.html, so an
    // unconfigured build never ships a request to an ad network.
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client!)}`;
      document.head.appendChild(script);
    }

    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      w.adsbygoogle = w.adsbygoogle ?? [];
      w.adsbygoogle.push({});
    } catch {
      // A blocked or failed ad script must never break the page it sits under.
    }
  }, [showRealAd, client]);

  if (!showRealAd) {
    // Absent in a real production build with nothing configured — a page with no ad slot
    // should look exactly like a page that was never going to have one. Visible in dev
    // (isDev true) SO THE PLACEMENT ISN'T FORGOTTEN, unconditionally: even a dev build that
    // happens to carry real credentials shows only this, never the live unit — see the
    // isDev-overrides-configuration note above.
    if (!isDev) return null;
    return (
      <aside className="sp-ad" aria-hidden="true">
        <span className="sp-ad-label">Ads by Google</span>
        <div className="sp-ad-inner" style={AD_INNER_STYLE}>
          <span className="sp-ad-placeholder">Ad slot (set VITE_AD_CLIENT and VITE_AD_SLOT to enable)</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sp-ad">
      <span className="sp-ad-label">Ads by Google</span>
      <div className="sp-ad-inner" style={AD_INNER_STYLE}>
        <ins
          className="adsbygoogle"
          style={{ display: 'block', width: '100%' }}
          data-ad-client={client}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </aside>
  );
}
