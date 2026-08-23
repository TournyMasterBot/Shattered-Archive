/*
 * shatteredarchive.dev landing page — ad and analytics initialisation.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A SEPARATE FILE RATHER THAN AN INLINE <script>.
 *
 * It exists so the page's Content-Security-Policy can say `script-src 'self' <google hosts>`
 * with NO 'unsafe-inline'. That one token is the entire reason: 'unsafe-inline' does not itself
 * create an XSS, it removes the mitigation that would otherwise neuter one, and on the apex
 * domain that mitigation is worth more than the convenience of a single-file page — a script
 * running here can set a `Domain=.shatteredarchive.dev` cookie and therefore reach every
 * sibling subdomain, the auth hub included.
 *
 * The page's <style> block is deliberately still inline, and that is not an inconsistency:
 * `style-src 'unsafe-inline'` is unavoidable regardless (AdSense injects inline styles into the
 * ad container, and React does the same on the scrum-poker host), and style injection is not
 * script execution. Externalising the CSS would buy nothing and would break rendering on the
 * two OTHER hostnames that serve this same file from disk at `location = /`
 * (game-server. and web-client.), whose blocks proxy every other path to Docker and would
 * therefore 404 a stylesheet request.
 *
 * That same 404 behaviour applies to THIS file on those two hosts, which is fine and in fact
 * preferable: the landing page still renders correctly there, just without an ad or analytics.
 * ---------------------------------------------------------------------------------------
 *
 * DEPLOY NOTE: this file must be copied to /var/www/shatteredarchive-dev alongside index.html
 * and privacy.html. A missing site.js is a silent no-ad page, not an error.
 */

/*
 * The page's single ad placement.
 *
 * Mirrors the contract of the React component that does the same job in scrum-poker
 * (apps/scrum-poker-client/src/features/shared/AdSlot.tsx): with either value below empty, the
 * container is REMOVED from the DOM and the loader script is never injected, so the page makes
 * no request to any ad network. There is no placeholder and no reserved gap — an unconfigured
 * page simply has no ad region.
 *
 * To change accounts:
 *   client — publisher id in `ca-pub-…` form. Note the `ca-` prefix, which the `pub-…` value
 *            in ads.txt does not carry.
 *   slot   — the ad UNIT id for THIS placement (a ~10-digit number from the AdSense console).
 *            It is not the publisher id again, and a unit created for another site serves blanks.
 *
 * ads.txt is already served for this domain — see the `location = /ads.txt` block in the front
 * proxy's shatteredarchive.dev server (DSL/nginx/shattered_archive.site). It is answered at the
 * registrable-domain root, so it covers the subdomains too.
 *
 * NOTE ON FORMAT. The unit id below was created in the console as a RESPONSIVE unit, and the
 * snippet Google hands out for it carries `data-ad-format="auto"` with
 * `data-full-width-responsive="true"`. That pairing is what lets Google choose any height it
 * likes, which is precisely the "obtrusive" outcome this placement is designed to avoid. The tag
 * attributes override the console default, so this page requests `rectangle` +
 * `full-width-responsive="false"` instead, confining the unit to the square/rectangle family
 * inside a 336px-wide container. Same slot id, same reporting — bounded shape. Do not paste the
 * console snippet over this verbatim.
 */
var AD_CONFIG = {
  client: 'ca-pub-1852178360854840',
  slot: '2791506790',
};

/*
 * Google Analytics 4.
 *
 * `cookie_domain` is pinned to the exact hostname and that is the security-relevant line here.
 * GA4's default is `cookie_domain: 'auto'`, which resolves to the REGISTRABLE domain — it would
 * set `_ga` on `.shatteredarchive.dev`, meaning the analytics cookie is then transmitted to
 * every sibling subdomain, the auth hub included. Nothing in the stack reads `_ga`, so that is a
 * privacy and blast-radius concern rather than an exploit, but there is no reason to spray a
 * cookie across origins that have no use for it. Host-scoping also means the landing page and
 * scrum-poker keep separate cookies rather than one shared identifier following a visitor
 * between them.
 *
 * Leave GA_ID empty to disable: no gtag request is made and no cookie is set.
 */
var GA_ID = 'G-KY4ED1369H';

(function () {
  var slot = document.getElementById('sa-ad');
  if (!slot) return;

  if (!AD_CONFIG.client || !AD_CONFIG.slot) {
    slot.remove();
    return;
  }

  var ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.display = 'block';
  ins.style.width = '100%';
  ins.setAttribute('data-ad-client', AD_CONFIG.client);
  ins.setAttribute('data-ad-slot', AD_CONFIG.slot);
  // rectangle = the square/rectangle family (336x280, 300x250, 250x250, 200x200).
  // `.sa-ad-inner`'s 336px cap is what Google measures, so the two together fix the shape
  // without clipping anything.
  ins.setAttribute('data-ad-format', 'rectangle');
  // Off deliberately: full-width-responsive would let Google stretch the unit to the viewport
  // width and pick its own height, which is the takeover this design avoids.
  ins.setAttribute('data-full-width-responsive', 'false');
  document.getElementById('sa-ad-inner').appendChild(ins);
  slot.hidden = false;

  var script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src =
    'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
    encodeURIComponent(AD_CONFIG.client);
  document.head.appendChild(script);

  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (e) {
    // A blocked or failed ad script must never break the page it sits under.
  }
})();

(function () {
  if (!GA_ID) return;

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  gtag('js', new Date());
  gtag('config', GA_ID, {
    // See the note on GA_ID above — this is what keeps `_ga` off the sibling subdomains.
    cookie_domain: window.location.hostname,
    cookie_flags: 'SameSite=Lax;Secure',
  });
})();
