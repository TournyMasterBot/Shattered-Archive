# Scope: Finish the sitemaps and SEO plan's open work, then close the plan

Item: item.md · Type: proposal · Scoped against: performance/Allocation-hunt @ 9191edc (ShatteredArchive); DSL repo `main` · Date: 2026-11-18
Data classification of this work: Public (page text and site structure of the public site; Search Console access is the owner's account and is never stored). Rules: docs/standards/data-classification.md, DRAFT ("owner to confirm"), followed as written.

## What the work is

The closed plan `20260805-1500-sitemaps-and-seo` left three things open: a unit test of the sitemap route filter that excludes authorized actions (step 1), bespoke page descriptions for the views that still use the sitewide fallback (step 4), and Search Console setup, which needs the owner's Google account (step 5). The owner asked to complete these and then close the plan.

## Affected areas

| Area | Role in the work | Kind | Evidence |
|---|---|---|---|
| DSL repo `Server/Server.Web.Public/Services/SitemapService.cs` (920 lines) | The code the unit test targets: the authorization gate, the denied prefixes, the per-type groups | read; possibly a test seam | gate at `:507-518` (`IAuthorizationFilter`, `IAsyncAuthorizationFilter`, `IAuthorizeData`, then `SitemapIgnore`), `DeniedPrefixes` at `:93-96`, public constructor at `:127-131` taking `IActionDescriptorCollectionProvider`, `IConfiguration`, `ILogger`; `TrueUpAsync` `:163`, `GetFile` `:284` |
| DSL repo test projects (`Server.Dsl.Tests`, `Server.Jobs.Tests`) | Where a sitemap test could live | new / change | `Server.Dsl.Tests/*.csproj:22` references only `Server.Dsl`; a search of `.csproj` and `.sln` files found no project referencing `Server.Web.Public` (it is only in `Server.sln:17`); `Server.Dsl.Tests` holds 51 files and none tests the sitemap |
| DSL repo `Server.Web.Public/Views/` | Page descriptions | change | 63 view files outside `Shared/` and the two `_View*` files: 10 set `ViewData["Description"]` (9 under `Library/`, `Maps/WorldMapV2.cshtml`), 53 do not |
| DSL repo `Views/Shared/_Layout.cshtml` | Supplies the fallback description and reads `ViewData["Description"]` | read | `:17-19` (`ViewData["Description"] as string ?? "ShatteredArchive: a DikuMUD-inspired MUD's public library..."`) |
| DSL repo `Controllers/SitemapController.cs` (76 lines), `wwwroot/robots.txt` | Serving and declaring the sitemap | read | `robots.txt:81` `Sitemap:` line; the denied prefixes there (`/user`, `/admin`, `/api/`, `/internal`, `/contribute`, `/build-area-proposals`, `/data/`) match `DeniedPrefixes` |
| `deploy/sitemap.xml` (this repo) | The `.dev` constellation's sitemap, part of step 5's Search Console submission | read | 3 `<loc>` entries |
| Google Search Console (external) | Step 5 | owner action | no repo artifact; needs the owner's Google account and DNS access for two registrable domains |
| `.ai-plans-completed/closed-incomplete/20260805-1500-sitemaps-and-seo.md` | The plan to close | change (move, dispositions) | steps 4 and 5 marked `[~]` |

## Stakeholders

- **The owner**: closes the plan, does the Search Console setup, decides wording and which pages get descriptions, runs the production deploy.
- **Search visitors and site users**: see the page titles and descriptions that search results show.
- **DSL repo maintainers**: any new test project or reference changes the solution's build.
- **Docs**: no developer document about the sitemap was found (a search of `DSL/docs` and `ShatteredArchive/docs` for "sitemap" found only an incidental mention in `docs/shattered-maps/surfaces.md`); no end-user document applies, the audience is search visitors, who see pages not documentation.
- **Other plans/items**: none open about SEO or sitemaps (a title search of `.ai-plans/{proposed,active}` found only this item).

## Data touched

| Data | Class | Read/Write/Store/Send/Log | Change in handling |
|---|---|---|---|
| Page text and descriptions of the public site | Public | Write (view files) | none |
| Sitemap contents (public URLs) | Public | Read | none |
| Search Console verification (DNS record) and the owner's Google sign-in | Restricted if it were stored; it is not | owner's action | nothing about it is written to the repo; the document would say only that the owner did it |
| Coverage report findings | Public (URLs only) or Internal | Read by the owner | any findings kept in a work-item doc are listed as categories, not copied screenshots with account data |

## Inputs for sizing

Not sized: that is for a human. Countable facts:

- Repos touched: 2 (DSL; ShatteredArchive for the plan move, one comment path and an index entry); external service: 1 (Search Console).
- Views without a description: **53**. Of those, 8 are behind denied or authorized routes (`Admin/` 6, `User/` 1, `BuildAreaProposal/` 1) and never appear in the sitemap; 17 are partials whose names start with `_` (`Directions/` 12, `Items/` 2, `Library/` 3); **28 are page views**: `Home/` 6 (Acknowledgements, ChangeLog, Directions, Feedback, Index, Privacy), `Library/` 19, `Directions/Directions.cshtml`, `Items/AllItems.cshtml`, `Scripts/Index.cshtml`. Command: for each `.cshtml` outside `Shared/`, test for the string `ViewData["Description"]`.
- Four of the 28 are the data-driven pages that produce most sitemap URLs: `ViewAbilityGroup`, `ViewBeast`, `ViewItem`, `ViewRoom`. The local site's sitemap today (counted this session with read-only GETs of `/sitemap.xml` and each sub-sitemap): ability-groups 172, beasts 1,799, items 16,942, rooms 2,082 = 20,995 of **22,136 URLs in 10 sub-sitemaps** (abilities 708, books 294, classes 48, dragons 16, races 33, routes 42). The plan recorded 10,326 URLs at its time, so the sitemap has roughly doubled since; the mapping from sub-sitemap to view is from the plan's step 2 and was not re-traced.
- Tests: existing sitemap tests 0; test files in `Server.Dsl.Tests` 51; project references from any test project to `Server.Web.Public` 0.
- Constructor dependencies the test would have to fake: 3 (`IActionDescriptorCollectionProvider`, `IConfiguration`, `ILogger<SitemapService>`); the configuration keys read: `Site:PublicBaseUrl`, `Site:SitemapDiskPath` (`:134-145`).
- Path mentions of the plan that move with it: 3 outside the plan folders: `DSL/Server/Server.Web.Public/Services/SitemapService.cs:447`, `DSL/Server/Server.Web.Public/Views/Shared/_Layout.cshtml:8` (both source comments) and this repo's `deploy/sitemap.xml:26` and `deploy/.annotated:58`. Command: `git grep -n "20260805-1500-sitemaps"` over nine repos.
- Deploy artifacts affected: the DSL site image only (views, and a test project that is not shipped); no nginx, compose or port change.
- Unknowns and risks listed below: 6.

## Dependencies and order

- A test for `SitemapService` needs a decision on where it lives (Decision 1) before it can be written.
- Descriptions are independent of the test; the wording and the page list are the owner's (Decision 2).
- Closing the plan needs step 5 resolved or given a recorded disposition (Decision 3): by the new rule WORKITEM-02 a plan with an unexecuted step is not filed as completed.
- Deploying the view changes to the live site is the owner's production deploy; local verification uses `Server/deploy-local.ps1` per the repo's rule.
- Search Console needs the owner, a Google account, and DNS access; nothing outside this repo can be done by an agent here.

## Risks and unknowns

1. **No test project can see `SitemapService` today.** Adding a reference from `Server.Dsl.Tests` to `Server.Web.Public` (a web project) or creating a new test project changes the DSL solution; whether the web project builds cleanly as a test reference was not tried. `Server.Web.Public` has no `InternalsVisibleTo` (searched), so only public members are testable; the class and its constructor are public.
2. **The gate is inside a larger method.** `TrueUpAsync` runs the whole generation (content caches, disk write to `Site:SitemapDiskPath`), so a test with fake descriptors may also need the content caches initialized or the disk path pointed at a scratch folder; what the method needs to run in isolation was not traced.
3. **Which pages should get descriptions is a content decision.** Several of the 28 are tools or editors (`BookEditor`, `LogEditor`, `ScriptBuilder`, `CharacterCreationSimulator`) that may not belong in search results at all; whether they are in the sitemap was not checked per page.
4. **Data pages at volume.** About 21,000 sitemap URLs use four views with the sitewide fallback; a per-entity description is generated text, while a fixed text repeats on every page, which search engines may treat as duplicate. Which is acceptable is the owner's call.
5. **The plan's recorded figures are stale.** 10,326 URLs then, 22,136 now; the largest sub-sitemap holds 16,942 entries, which is under the protocol's 50,000-URL limit per file; its file size was not measured against the 50 MB limit.
6. **A source comment path moves.** Closing the plan changes the path named in two DSL source comments and two ShatteredArchive files; the DSL repo has uncommitted work of its own (26 entries today), so those edits would sit beside it.

## Out of scope

- Search Console actions themselves (the owner's); redesigning the sitemap or its caching; the `.dev` SPA indexing decision (the plan closed it as "status quo"); new schema.org markup beyond what step 4 covered; production deploy; sizing or planning (this document).

## Decisions for the human

1. **Where the sitemap filter test lives.** Options: (a) add a project reference from `Server.Dsl.Tests` to `Server.Web.Public` and test through the public constructor with fakes; (b) a new test project for the web project; (c) skip the unit test and record the plan's live-verification as the disposition. Consequence: (a) and (b) change the solution's build graph; (c) leaves the authorized-action exclusion without an automated test, which the plan's step 1 asked for.
2. **Which views get a description.** Options: (a) only the four data-driven pages that carry most sitemap URLs; (b) all 28 page views; (c) the data pages plus the public content pages, leaving tools and editors on the fallback; (d) the 4 high-volume pages with generated per-entity text and the rest hand-written. Consequence: (a) leaves 24 pages on the fallback; (b) includes tool pages; (c) needs the owner's list of pages that should be indexed.
3. **How step 5 closes the plan.** Options: (a) the owner does the Search Console setup and reports, then the plan closes; (b) the plan closes now with step 5 recorded as the owner's standing action (a disposition in the plan); (c) the plan stays open until step 5 is done. Consequence: (b) files the plan as completed with a recorded unexecuted step, which WORKITEM-02 allows only with the owner's explicit word.

## Answers recorded (2026-11-18)

1. Test home: add a project reference from `Server.Dsl.Tests` to `Server.Web.Public` and test `SitemapService` through its public constructor with fakes.
2. Descriptions: all 28 page views (including the tool and editor pages) get a bespoke description.
3. Step 5: the owner does the Search Console setup and reports; the plan closes after the owner confirms both domains are verified and both sitemaps submitted.
