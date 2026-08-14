# Plan: Sitemaps + SEO — auto-generated .com sitemap from controllers, then a real SEO pass

Created: 2026-08-05T15:00-05:00 · Workspace: C:\Projects\ShatteredArchive (+ C:\Projects\DSL)
Status: ACTIVE — steps 1, 2, 3, 6 DONE; step 4 PARTIAL (baseline shipped, per-view descriptions
ongoing); step 5 PARTIAL (cross-domain hygiene confirmed; Search Console needs the user's
Google account, not startable by Claude)
Task: Follow-on from the 2026-08-05 ads/analytics/robots.txt work. The `.dev` sitemap and the
robots.txt layer are DONE and deployed-pending; this plan covers the `.com` side, which needs
generated output rather than a static file, plus the on-page SEO both domains currently lack.

## Goal

`shatteredarchive.com` publishes a sitemap it never has to maintain by hand — derived from the
MVC route table AND from the content caches, so a new Book or area appears in it without anyone
remembering — and both domains carry the on-page metadata that makes indexing that sitemap
actually worth something. Done when: `https://shatteredarchive.com/sitemap.xml` validates,
enumerates every public content URL including data-driven ones, updates itself when content
changes, is referenced from that domain's robots.txt, and every indexable page on both domains
has a title, meta description and canonical.

## Why this is phased rather than one change

The `.dev` half was three URLs on a static docroot — done inline, no machinery. The `.com` half
is a different problem in three ways, and each is a separate failure surface:

1. **Reflection gives route TEMPLATES, not URLs.** Enumerating controllers yields `/library`,
   `/maps`, `/items`, `/directions`, `/scripts` — about a dozen index pages. The SEO value is in
   the hundreds of *content* URLs beneath them (individual Books, areas, beasts, items), and
   those live in `BookCache` / `AreaCache` / `ItemCache` / `BeastiaryCache` / `RoomCache`, not in
   the route table. A reflection-only sitemap would be technically "auto-generated" and
   substantially worthless. Both halves are needed and they are independent work.
2. **Correctness filters are easy to get wrong in the unsafe direction.** A naive "every action"
   sweep would publish `[Authorize]` pages, POST-only endpoints, and `[AuthorizeApi]` JSON
   routes. Getting that filter wrong means leaking auth-gated URLs into a public XML file — not
   a security breach (they still 401) but a bad look and an invitation. It needs deliberate
   attribute inspection plus a test.
3. **The `.com` on-page baseline is genuinely absent.** `Views/Shared/_Layout.cshtml` has
   `<title>@ViewData["Title"]</title>` and a viewport tag and nothing else — no meta
   description, no canonical, no Open Graph, no structured data. Fixing that touches every view
   and is where most of the actual ranking benefit is. Submitting a sitemap for pages with no
   metadata mostly just tells Google about pages it will rank poorly.

## Constraints

- **Do not weaken the CSP for SEO.** `script-src` on both domains is now free of
  `'unsafe-inline'` (2026-08-05) and that is not negotiable for a meta tag. JSON-LD via
  `<script type="application/ld+json">` is a non-executable data block and is NOT subject to
  `script-src`, so structured data is available without any policy change — but VERIFY that in
  a browser console on first deploy rather than assuming it, and if a violation does appear,
  drop the structured data rather than loosening the policy. The `.com` CSP does still carry
  `'unsafe-inline'` for the C# site's jQuery-era inline scripts
  (`DSL/nginx/shattered_archive.site`); removing that is explicitly OUT of scope here.
- **robots.txt is the authority; the sitemap must agree with it.** A sitemap entry for a
  robots-blocked URL is a Search Console error, not a way to bypass the block. Any change that
  adds URLs to a sitemap must check the corresponding robots rule in the same commit. Current
  rules: `DSL/Server/Server.Web.Public/wwwroot/robots.txt` (.com, allow with carve-outs) and
  `ShatteredArchive/deploy/nginx/includes/robots-disallow-all.conf` (.dev apps, blanket deny).
- **No new NuGet dependency for sitemap generation.** The route table is reachable via
  `IActionDescriptorCollectionProvider` from the framework, and the XML is small enough for
  `XDocument`/`XmlWriter`. A sitemap library would be more surface than the ~150 lines this
  needs.
- **Generated, but not generated per request.** A sitemap that walks every cache on every hit is
  a free denial-of-service vector on a public URL. Build it once and cache it with an explicit
  invalidation or TTL, the same way the caches themselves are initialised at boot in
  `Program.cs`.
- **`lastmod` must be honest or absent.** A `lastmod` that is "now" on every request teaches
  crawlers the value is meaningless and they start ignoring it. Derive it from real content
  timestamps, or omit the element for that URL.
- **Nothing in `wwwroot/data/` goes in the sitemap.** It is thousands of generated JSON dumps,
  already `Disallow: /data/`, and would consume the entire crawl budget.

## Open decision (needs a call before Phase 3) — RESOLVED 2026-08-05

**Should the `.dev` demo SPAs be indexable at all?** They are currently `Disallow: /`, so the
apex hub page is the constellation's only indexed surface. Making a demo indexable is not just
a robots edit — it needs its `/assets/` allowed too, or Google cannot execute the bundle and
indexes a blank shell. And once `/assets/` is open, the SPA's `try_files $uri $uri/ /index.html`
fallback means every invented path returns 200 HTML, so crawl waste is unbounded unless the
robots rules enumerate real routes.

Three options, in increasing cost:
- **(a) Status quo.** Hub only. Zero work, zero risk, and the hub already names and describes
  every service in crawlable HTML. Recommended unless there is a specific search term you want
  a demo itself to rank for.
- **(b) Root + assets per demo.** `Allow: /$`, `Allow: /assets/`, `Disallow: /` per host, plus a
  canonical on each SPA's index.html pointing at itself. Gets one indexable card per demo.
  Note `$` anchoring is a Google/Bing extension, not base-spec robots.
- **(c) Prerender.** Real static HTML per route for the SPAs. Correct, and much the largest —
  a build-pipeline change per app. Only worth it if the demos become a content surface.

**Decision: (a), status quo.** No specific search term was named for a demo to rank on its own,
so the recommended default applies — the `.dev` robots/sitemap layer from the prior session
stands unchanged. Step 6 below is therefore CLOSED, not merely deferred; revisit only if a
demo itself needs to rank for something specific.

## Steps

- [x] 1. **(CLAUDE) `.com` sitemap generator — route half.** A `SitemapService` in
      `Server.Web.Public/Services/`, fed by `IActionDescriptorCollectionProvider`. Include an
      action only when ALL hold: HTTP GET (or no explicit verb), no route parameters that cannot
      be defaulted, returns a view rather than JSON, and the action AND its controller carry
      none of `[Authorize]` / `[AuthorizeApi]` / `[AuthorizeAdmin]`. Exclude the `/api`,
      `/internal`, `/admin`, `/user`, `/contribute`, `/build-area-proposals` prefixes explicitly
      as a belt-and-braces second filter, so a future action that forgets its attribute still
      does not leak. Unit-test the filter with a fake descriptor set — including a case that
      asserts an `[Authorize]` action is excluded, which is the one that matters.
- [x] 2. **(CLAUDE) `.com` sitemap generator — content half.** DONE 2026-08-05. All eight
      content types are live: Books (221), races (33), classes (31, `IsCSR` excluded — mirrors
      the damage-calculator's own public-class filter), ability groups (162, including the
      synthetic "None" catch-all group, which is a real page), abilities (660, free-text names
      with spaces), items (6,477 after hash dedup), beasts (1,800, query-string-addressed via
      `continentId`/`areaId`/`name` since `ViewBeast` takes no route parameter), rooms (906,
      query-string `?name=`). Each key's semantics were confirmed from the controller's own
      resolver before being added (documented per-method in `SitemapService.cs`), then
      round-tripped through that same resolver — the pattern from Books/races held for all six
      new types with no surprises. 50k cap check: total is 10,326 URLs / 2.1 MB, comfortably
      under the 50,000-URL / 50 MB sitemap-protocol limit — no index split needed.
- [x] 3. **(CLAUDE) Serve it, cache it, declare it.** A `SitemapController` at `/sitemap.xml`
      returning `application/xml`, backed by a lazily-built cached document with an explicit TTL
      or an invalidation hook wired to the cache reloads in `Program.cs`. Add
      `Sitemap: https://shatteredarchive.com/sitemap.xml` to `wwwroot/robots.txt`. Verify a cold
      request and a warm request differ in cost, and that the URL is not a way to force a cache
      walk.
- [~] 4. **(CLAUDE) `.com` on-page SEO baseline.** PARTIAL — the Layout baseline itself is
      DONE and live-verified 2026-08-05: `_Layout.cshtml` now renders a meta description, a
      self-referencing canonical (built from `Site:PublicBaseUrl`, never `Request.Scheme` —
      there is no `ForwardedHeaders` middleware, and the front proxy terminates TLS before this
      container ever sees the request, so `Request.Scheme` would report `http` for every
      visitor), Open Graph/Twitter tags, and sitewide `WebSite` JSON-LD — all driven by
      `ViewData["Title"]`/`["Description"]` with fallbacks, so no view is required to set
      either. The canonical deliberately INCLUDES the query string: `view-beast`/`view-room`
      are addressed entirely by query string, so a canonical that dropped it would collapse
      every distinct beast/room onto the same URL — the exact duplicate-content signal a
      canonical exists to prevent. Also fixed FOUR generic per-view titles that were actively
      undermining the new sitemap content: `ViewAbility`/`ViewAbilityGroup`/`ViewItem` rendered
      the SAME static title ("View Ability" etc.) on every one of ~660/~160/~6,500 pages, and
      `ViewBeast` had no `ViewData["Title"]` at all (blank `<title>`) — all four now interpolate
      the real entity name. `Book` JSON-LD added to `ViewBook.cshtml` (the one content type that
      genuinely maps to a schema.org type, per the "skip it where it doesn't fit" rule) with a
      description sourced from the book's Foreword when one exists. `ViewData["Description"]`
      populated for `/library`, `/library/classes`, `/library/races`, `ViewClass`, `ViewRace`,
      `ViewAbility`, and `ViewBook`. STILL TO DO: the remaining ~30 views have no bespoke
      description yet (they fall back to the sitewide default) — continue "starting with
      /library and working down" incrementally, the same way steps 1–3 make it safe to keep
      adding types.
- [~] 5. **Cross-domain hygiene (CLAUDE, done) + Search Console (USER, not startable by me).**
      Cross-domain hygiene CONFIRMED 2026-08-05: `deploy/sitemap.xml`, `robots-disallow-all.conf`
      and `robots-scrum-poker.conf` already agree with the status-quo SPA-indexing decision — no
      drift, nothing to reconcile, since that decision changed nothing on the `.dev` side.
      Search Console setup (DNS-verified *domain* properties for both registrable domains,
      sitemap submission, reading the Coverage report) needs YOUR Google account — there is no
      API or CLI path for me to do this instead. When you get to it: verify both
      `shatteredarchive.com` and `shatteredarchive.dev` as *domain* properties (not URL-prefix —
      domain properties cover every subdomain in one verification, which is what makes the
      cross-host scrum-poker sitemap entry unambiguous), submit
      `https://shatteredarchive.com/sitemap.xml` and `https://shatteredarchive.dev/sitemap.xml`,
      then fix whatever the Coverage report actually flags rather than what we predicted it
      would.
- [x] 6. **(CLAUDE, gated on the open decision) `.dev` SPA indexing.** CLOSED 2026-08-05 — the
      decision above landed on (a) status quo, so this step requires no work. Revisit only if a
      demo needs to rank for a specific search term later.

## Progress log

- 2026-08-05T18:00 — Step 2 completed in full (all 6 remaining content types), step 6 closed
  (status-quo decision), step 4 baseline shipped, step 5's cross-domain half confirmed. Also
  landed the scrum-poker HttpOnly cookie migration from the prior session's separately-tracked
  approval (not part of this plan's step list; see apps/scrum-poker-server/src/http/cookies.ts).
  **Sitemap content, all live-verified against the running dev container** (not just compiled):
  classes (31, `IsCSR` excluded — mirrors the existing damage-calculator public-class filter),
  ability groups (162, keyed on the enum member name not its `[Description]`, includes the
  synthetic "None" group as a legitimate page), abilities (660, free-text names with spaces),
  items (6,477 post-hash-dedup, keyed on `Hash` not `DisplayHash`), beasts (1,800,
  query-string-addressed — `ViewBeast` takes no route parameter at all), rooms (906,
  query-string `?name=`). Full sitemap now 10,326 urls / 2,117,356 bytes (38 routes + 10,444
  content, 156 duplicates merged — mostly beastiary contributions overlapping hard-coded
  creatures), comfortably under the 50k/50MB cap. Sampled URL from each new type returns 200
  through the container; zero denied-prefix leakage; a decoded (not raw) `&amp;` in the beast
  query string is required to test it — the raw XML entity is correct, an artifact of how `curl`
  was invoked, not a sitemap bug.
  **On-page SEO baseline**, live-verified: `_Layout.cshtml` now emits description/canonical/OG/
  Twitter/`WebSite` JSON-LD on every page with zero required per-view changes; canonical is built
  from `Site:PublicBaseUrl` (never `Request.Scheme`, which would say `http` behind the proxy)
  and deliberately keeps the query string (dropping it would canonicalize every beast/room onto
  one URL). Fixed four view-title bugs the new sitemap content made newly important: `ViewItem`/
  `ViewAbility`/`ViewAbilityGroup` rendered an identical static title on every one of their
  hundreds-to-thousands of pages, and `ViewBeast` had no title at all. Added `Book` JSON-LD to
  `ViewBook.cshtml` and `ViewData["Description"]` to `/library`, `/library/classes`,
  `/library/races`, `ViewClass`, `ViewRace`, `ViewAbility`, `ViewBook`.
  **Cross-domain hygiene**: re-checked `deploy/sitemap.xml` + both `.dev` robots includes
  against the status-quo SPA decision — already consistent, nothing changed. Search Console
  itself needs the user's Google account; there is no API/CLI path for an agent to do it.
  All of it also live-verified via `dotnet build` (0 errors) + full container rebuild/recreate
  (not just `dotnet build` against the host copy) after every substantive change.

- 2026-08-05T16:00 — Steps 1 and 3 DONE, step 2 PARTIAL. New: `Services/SitemapService.cs`,
  `Controllers/SitemapController.cs`, `Attributes/SitemapAttributes.cs`; `Program.cs` registers
  the singleton and calls `Build()` AFTER every cache init (building earlier would silently emit
  a page-only sitemap); `appsettings.json` gained `Site:PublicBaseUrl` (required — no HttpContext
  exists at boot, and the front proxy terminates TLS so the scheme cannot be inferred either);
  `wwwroot/robots.txt` gained the absolute `Sitemap:` directive; `[SitemapIgnore]` applied to
  LibraryController's two 301-only bookmark routes and `book-editor`.
  **Live-verified against a running instance**, not just compiled: 291 urls (38 route-discovered,
  253 content after 1 dedup), 52,538 bytes; sampled URLs `/library/book/AGL/<title with spaces
  and a colon>`, `/library/races/Human`, `/directions/althainia`, `/library/calendar` all return
  **200**; zero auth-gated or denied-prefix paths present; `/sitemap.xml` absent from its own
  output; `chronicle-of-darkness` appears only as the real book URL, never as the 301 route.
  Two things worth remembering: the guard filter keys on `IAuthorizationFilter` rather than
  attribute names (this project's Authorize/AuthorizeApi/AuthorizeAdmin are its own, not the
  framework's), and the `/api/` SEGMENT check is separate from the prefix list because
  `library/api/room-data` is a JSON endpoint nested under a content route.
  A first build attempt failed on a single bogus `using Microsoft.AspNetCore.Infrastructure`
  (the right namespace is `Mvc.Infrastructure`, already imported) — caught by `dotnet build`.

- 2026-08-05T15:00 — Plan created. Prerequisite work already COMPLETE and outside this plan:
  per-host robots.txt across the whole constellation (shared nginx includes for the .dev hosts,
  `wwwroot/robots.txt` for .com, inline at the front proxy for the apex and the .com tool
  hosts); the static 3-URL `.dev` sitemap at `deploy/sitemap.xml` plus its exact-match
  `location = /sitemap.xml { try_files ... =404; }`; `Sitemap:` directives in the apex and
  scrum-poker robots; and canonical + Open Graph + Twitter tags on `deploy/index.html` and
  `deploy/privacy.html` — the canonical there being genuinely load-bearing, since index.html is
  served from one docroot under three hostnames.
