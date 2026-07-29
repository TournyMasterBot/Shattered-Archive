import { useEffect, useRef } from 'react';

import { readAdConfig, type AdConfig } from './ad-config.js';

/**
 * The app's ONE ad placement.
 *
 * The reference site this replaces carried eight slots including a sticky footer overlay and
 * two sidebar towers; this is the deliberate opposite — a single bounded block below the
 * fold-level content, capped at 120px by `.sp-ad-inner`, never injected into the estimating
 * flow, and never sticky. It renders once per page.
 *
 * With no `VITE_AD_CLIENT`/`VITE_AD_SLOT` at build time it renders NOTHING: no container, no
 * placeholder, and — importantly — the loader below is never injected, so the page makes no
 * request to any ad network.
 *
 * The loader code does still SIT in the bundle as dead code. It can't be tree-shaken: the
 * `config` prop exists so tests can drive this component, which means `configured` is never a
 * statically-known false and the minifier can't drop the branch. Testability is worth more
 * than deleting one unreachable URL string — but don't mistake "no ad code in the bundle" for
 * what this guarantees, which is "no ad request at runtime".
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
  const pushed = useRef(false);

  useEffect(() => {
    if (!configured || pushed.current) return;
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
  }, [configured, client]);

  if (!configured) {
    // Visible while developing so the placement isn't forgotten; absent in production.
    if (!isDev) return null;
    return (
      <aside className="sp-ad" aria-hidden="true">
        <span className="sp-ad-label">Advertisement</span>
        <div className="sp-ad-inner">
          <span className="sp-ad-placeholder">Ad slot (set VITE_AD_CLIENT and VITE_AD_SLOT to enable)</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sp-ad">
      <span className="sp-ad-label">Advertisement</span>
      <div className="sp-ad-inner">
        <ins
          className="adsbygoogle"
          style={{ display: 'block', width: '100%' }}
          data-ad-client={client}
          data-ad-slot={slot}
          data-ad-format="horizontal"
          data-full-width-responsive="false"
        />
      </div>
    </aside>
  );
}
