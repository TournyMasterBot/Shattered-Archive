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
 * SHAPE comes from the FORMAT REQUEST plus the container width, not from clipping: `rectangle`
 * with `full-width-responsive="false"` restricts Google to the square/rectangle family
 * (336x280, 300x250, 250x250, 200x200) and `.sp-ad-inner` caps at 336px wide, that family's
 * widest member. `.sp-ad-inner` deliberately does NOT set a `max-height` with
 * `overflow: hidden` — the AdSense program policies prohibit obscuring any part of an ad, so
 * clipping a creative is a policy violation rather than tidy layout. Bound the request.
 *
 * Note the slot id in production was created in the console as a RESPONSIVE unit, whose
 * generated snippet carries `data-ad-format="auto"` and `data-full-width-responsive="true"`.
 * The tag attributes override that, which is the whole reason they are spelled out here — do
 * not "fix" them to match the console snippet.
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
 */

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
        <div className="sp-ad-inner">
          <span className="sp-ad-placeholder">Ad slot (set VITE_AD_CLIENT and VITE_AD_SLOT to enable)</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sp-ad">
      <span className="sp-ad-label">Ads by Google</span>
      <div className="sp-ad-inner">
        <ins
          className="adsbygoogle"
          style={{ display: 'block', width: '100%' }}
          data-ad-client={client}
          data-ad-slot={slot}
          data-ad-format="rectangle"
          data-full-width-responsive="false"
        />
      </div>
    </aside>
  );
}
