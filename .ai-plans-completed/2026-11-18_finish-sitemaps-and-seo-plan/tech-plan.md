# Tech plan: Finish the sitemaps and SEO plan's open work, then close the plan

Item: item.md · Scope: scope.md · Planned against: performance/Allocation-hunt @ 9191edc (ShatteredArchive); DSL `main` @ abb9840c · Date: 2026-11-18
Standards: `docs/standards/csharp.md` (formatting, naming and layout, testing, async in tests: decided 2026-11-18 in this planning step) · Data classification: Public (the Search Console verification value is Restricted and never written down, E13)
Edge-case catalog: `public-page-seo.md` (SEO), `game-data-privacy.md` (PRIVNAME), `work-item-folders.md` (WORKITEM), `local-only-features.md` (LOCAL, all not applicable) · Classifiers added (user-approved 2026-11-18): SEO-01, SEO-02 (new file `docs/standards/edge-cases/public-page-seo.md`, index row added)

## Goal

(1) `SitemapService`'s route filter has an automated test, including that an authorized action, a JSON action, a non-GET, a parameterised route, a denied prefix and a `SitemapIgnore` action are excluded. (2) All 28 public page views set a bespoke, unique, length-bounded meta description, proven by a guard test and by live GETs. (3) The owner has an exact Search Console checklist; after the owner confirms it is done, the old plan is closed with its dispositions and every path to it is updated.

## Out of scope

Page titles (the 12 `/directions/*` URLs share one static title; `ScriptBuilder.cshtml:2` reads "Script Bulder"): noticed, not changed; the Search Console actions themselves; redesigning the sitemap or its caching; the `.dev` SPA indexing decision; schema.org markup; the production deploy (the owner's).

## Standards applied

- C# (`docs/standards/csharp.md`): no formatter config, match the surrounding file and add no new build warning in touched files; new logic in a static class with a file-top comment saying what it pins down; tests are xunit, one `<Feature>Tests.cs` per feature, run with `dotnet test`; tests are `public async Task`, scratch state created in `IAsyncLifetime.InitializeAsync` and removed in `DisposeAsync`, fakes hand-written in the test file, no mocking library.
- Razor views: follow the surrounding file (the existing description pattern is `ViewData["Description"] = ...;` beside the title, e.g. `Views/Library/ViewAbility.cshtml:11`).
- Scope decisions that bind this plan: the test lives in `Server.Dsl.Tests` through a new project reference to `Server.Web.Public`; all 28 page views get a description; the plan closes after the owner confirms Search Console.

## Edit map

All DSL paths are under `C:/Projects/DSL/Server/` (abbreviated `S/`); ShatteredArchive paths are relative to its root. Line numbers are as of the commits above, each with its anchor.

| File | Line(s) | Anchor | Change | Phase |
|---|---|---|---|---|
| `S/Server.Dsl.Tests/Server.Dsl.Tests.csproj` | 22 | `<ProjectReference Include="..\Server.Dsl\Server.Dsl.csproj" />` | add a second reference to `..\Server.Web.Public\Server.Web.Public.csproj` (and a `FrameworkReference` only if the build shows it is not transitive) | 1 |
| `S/Server.Dsl.Tests/SitemapServiceTests.cs` | new | file-top comment | smoke test, then the route-filter cases; fakes in the file | 1, 2 |
| `S/Server.Web.Public/Services/SitemapService.cs` | 93, 103, 127, 163, 284, 507-518, 520, 529, 538, 549, 584, 896 | `DeniedPrefixes`, `DeniedSegment`, constructor, `TrueUpAsync`, `GetFile`, the authorization gate, `SitemapIgnore`, `JsonResult`, `template.Contains`, `requires-query-parameters`, `IsGettable`, `IsDenied` | read only (the test targets these); no change | 2 |
| `S/Server.Web.Public/Helpers/PageDescription.cs` | new | file-top comment | static builder: `Bound`, `ForItem`, `ForBeast`, `ForRoom`, `ForAbilityGroup`, `ForContinents` with page-specific null fallbacks | 3 |
| `S/Server.Dsl.Tests/PageDescriptionTests.cs` | new | file-top comment | builder tests (E5, E6, E9, SEO-02, PRIVNAME-01) | 3 |
| `S/Server.Web.Public/Views/Library/ViewAbilityGroup.cshtml` | 8 | `ViewData["Title"] = Model.AbilityGroup != null ? ...` | add `ViewData["Description"]` from the helper | 4 |
| `S/Server.Web.Public/Views/Library/ViewBeast.cshtml` | 6 | `ViewData["Title"] = $"{Model.Creature.Name} (Level ...` | add description | 4 |
| `S/Server.Web.Public/Views/Library/ViewItem.cshtml` | 8 | `ViewData["Title"] = Model.Item != null ? Model.Item.Name ...` | add description | 4 |
| `S/Server.Web.Public/Views/Library/ViewRoom.cshtml` | 4 | `ViewData["Title"] = title;` | add description (list mode when `Model.Room` is null) | 4 |
| `S/Server.Web.Public/Views/Directions/Directions.cshtml` | 9 | `ViewData["Title"] = "Continent Directions";` | description from the rendered continents | 5 |
| `S/Server.Web.Public/Views/Home/{Acknowledgements,ChangeLog,Directions,Feedback,Index,Privacy}.cshtml` | 2, 2, 4, 5, 2, 2 | `ViewData["Title"] = ...` | static description | 5 |
| `S/Server.Web.Public/Views/Items/AllItems.cshtml`, `Views/Scripts/Index.cshtml` | 6, 2 | `ViewData["Title"] = "Items"`, `"Scripts Page"` | static description | 5 |
| `S/Server.Web.Public/Views/Library/{BookEditor,Calendar,CharacterCreationSimulator,DamageCalculator,DamageMatchup,FeastForAKing,Guilds,LogEditor,Organizations,ScriptBuilder,Scripting,ScriptingMushclient,Toasts,ViewAbilityList,ViewBeastiary}.cshtml` | 6, 7, 6, 6, 4, 2, 5, 6, 4, 2, 2, 2, 7, 9, 11 | `ViewData["Title"] = ...` | static description (15 views) | 5 |
| `S/Server.Dsl.Tests/ViewDescriptionGuardTests.cs` | new | file-top comment | scans the 28 page views for a description, bound and uniqueness (SEO-01, E9, E12) | 5 |
| `S/Server.Web.Public/Views/.ai-context`, `Helpers/.annotated`, `S/Server.Dsl.Tests/.annotated`, `Services/.annotated` | index lines | existing index files | entries for the rule, the helper and the new tests | 3, 5, 6 |
| `DSL/docs/site-seo/sitemap-and-seo.md` and `DSL/docs/site-seo/.ai-context` | new | n/a | developer document: sitemap generator, filter, description rules, guard test, Search Console owner checklist | 6, 7 |
| `S/Server.Web.Public/Views/Shared/_Layout.cshtml` | 8 | comment naming `.ai-plans-completed/closed-incomplete/20260805-1500-sitemaps-and-seo.md` | path updated on closing | 8 |
| `S/Server.Web.Public/Services/SitemapService.cs` | 447 | comment naming the same path | path updated on closing | 8 |
| `deploy/sitemap.xml`, `deploy/.annotated` (ShatteredArchive) | 26, 58 | the same path | path updated on closing | 8 |
| `.ai-plans-completed/closed-incomplete/20260805-1500-sitemaps-and-seo.md` | end | progress log | dispositions appended, then moved to `completed/` | 8 |

## Edge cases

| Id | Classifier | Condition | Required behaviour | Covered by |
|---|---|---|---|---|
| E1 | - | the new sitemap test runs in parallel with tests that re-initialise static caches (plan 3 found `AutoPilotClassCacheTests` and `NewClassesTests` racing on the shared ability cache; `SitemapService.AddAbilities` reads it) | the new test class carries `[Collection("AbilityCache")]` so it never runs beside them | Phase 2: five consecutive full-suite runs, no failure |
| E2 | - | `GenerateAll` swallows an exception and returns null (`SitemapService.cs`: catch in `GenerateAll`), so a test could assert on an empty result and pass vacuously | every filter test first asserts the index file exists and lists the routes sub-sitemap, then asserts on the routes file | Phase 1 smoke test, Phase 2 helper `RoutesXml()` |
| E3 | - | `TrueUpAsync` writes its files to `Site:SitemapDiskPath` | the test points the path at a folder it creates in `InitializeAsync` and removes in `DisposeAsync`; the real `Data/sitemap.xml` is never touched (asserted: its timestamp is unchanged) | Phase 2 |
| E4 | - | a fake descriptor that is unlike a real one proves nothing | descriptors use real `MethodInfo`s from a nested test controller (so `ReturnType` and `GetParameters()` are real) and the project's own `Authorize`, `AuthorizeApi`, `AuthorizeAdmin` attributes plus the framework `IAuthorizeData` | Phase 2 cases 2-5 |
| E5 | SEO-01 | a data page's model is null (`Model.Item`, `Model.Room`, `Model.AbilityGroup`) | the description is a page-specific fallback ("Items", "Rooms", "Ability groups"), never the sitewide default | Phase 3 builder tests; Phase 4 live GET of an unknown item id and an unknown room name |
| E6 | SEO-02 | an entity name has an apostrophe, a quote, an ampersand or a comma | the meta tag shows the name correctly encoded once (no double encoding) | Phase 3 (builder returns raw text), Phase 4 live GET of a name with an apostrophe and one with an ampersand, if the data has them (else the nearest present: comma) |
| E7 | SEO-01 | one view serves twelve `/directions/*` URLs | the description names the continent when the model holds one continent, a generic list sentence for `/directions/all` | Phase 3 `ForContinents`, Phase 5 live GET of three URLs |
| E8 | - | adding descriptions changes what is indexed by accident (sitemap membership) | the sitemap is unchanged: the 10 sub-sitemaps and their URL counts match before and after, and `SitemapIgnore` stays on `BookEditor` and `Organizations` | Phase 4 and 6: counts recorded before Phase 4 and compared |
| E9 | SEO-01 | two views use the same literal description | literals are unique across the 28 views | Phase 5 guard test |
| E10 | - | a description exceeds what a snippet shows | every description is at most 160 characters | Phase 3 (builder) and Phase 5 guard test (literals) and Phase 6 live check (all 28) |
| E11 | - | the DSL working tree holds 26 uncommitted entries of the owner's (books and world-map data) | every edit names its path; nothing outside the edit map is reverted or reformatted; the baseline test run records existing failures (plan 3 recorded two `PlayerBookTests` failures from the owner's book edits) and later runs are compared with it | Phase 1 baseline, every exit gate |
| E12 | SEO-01 | the guard test cannot find the view files (a different working folder, a published build) | it fails with a message naming the folder it searched; it never skips | Phase 5 guard test |
| E13 | - | the Search Console DNS verification value is Restricted | the document and chat say "the verification record Google gives you", never the value; no screenshot of the Search Console page is saved | Phase 7 |
| E14 | PRIVNAME-01 | a room, creature or item name in a test fixture, test output or doc is a real game name that could be a player's | fixtures use invented names ("Test Hall", "a test creature"); live-check output keeps names out of `test-results.md` (the shape and length only) | Phases 3, 4, 6 |
| E15 | SEO-02 | the builder is given an over-long, blank or emoji-ending name; an emoji sits at the cut | cut at a word boundary within 160, blank name uses the page fallback, no half surrogate pair | Phase 3 |
| E16 | WORKITEM-01 | the plan moves | the old path is searched in nine repos before and after; the four known mentions (above) are updated in the same step | Phase 8 |
| E17 | WORKITEM-02 | the plan closes with an unexecuted step | step 5's disposition (the owner did it, date) and step 1 and 4's (done by this item) are written into the plan before the move | Phase 8 |

Classifiers not applicable: LOCAL-01 to LOCAL-05: nothing local-only is added (no build flag, shared config, workspace project, second guard or machine address is touched); the new project reference is in a test project that the image build never sees (`S/Server.Web.Public/Dockerfile:11` copies only the Release output of `Server.Web.Public`, and `deploy-local.ps1:81` builds only that project). SEO-01 and SEO-02, PRIVNAME-01, WORKITEM-01 and WORKITEM-02 apply (rows above).

## Verification toolbox

All commands run on the host from PowerShell, bounded, output filtered; no process is killed.

- Build (as the deploy script does): `dotnet build C:/Projects/DSL/Server/Server.Web.Public/Server.Web.Public.csproj -c Release -p:CopilotLocal=true --nologo -v q -clp:ErrorsOnly`.
- Tests: `dotnet test C:/Projects/DSL/Server/Server.Dsl.Tests --nologo -v q` (whole project); targeted: add `--filter "FullyQualifiedName~Sitemap"` or `~PageDescription` or `~ViewDescriptionGuard`. Compare failures with the Phase 1 baseline.
- Coverage of the new code: `dotnet test C:/Projects/DSL/Server/Server.Dsl.Tests --collect:"XPlat Code Coverage" --results-directory <scratchpad>/cov --nologo -v q`, then read line and branch rates for `PageDescription.cs` and the filter lines of `SitemapService.cs` from the Cobertura file (the project already references `coverlet.collector`).
- Lint: none configured; "no new warning in touched files" is checked by building with `-v n` and searching the output for the touched file names.
- Local deploy for live checks (the repo rule: C# or view changes are deployed locally with the script, then checked; production is the owner's): `C:/Projects/DSL/Server/deploy-local.ps1` (its options are read from the script header at Phase 4, not guessed).
- Live checks: `curl.exe -s http://localhost:5000/<path>` and read `<meta name="description" content="...">` and `<title>`; sitemap counts via `/sitemap.xml` and each `/sitemap-<group>.xml` (baseline: abilities 708, ability-groups 172, beasts 1,799, books 294, classes 48, dragons 16, items 16,942, races 33, rooms 2,082, routes 42; total 22,136).
- Search Console: none (the owner's).
- Screenshots: none; the change is meta tags in the page head. A Playwright screenshot would not show it.

## Phases

### [x] Phase 1 — The test project can see the web project (amended: see A1)
Goal:        `Server.Dsl.Tests` builds with a reference to `Server.Web.Public`, a smoke test constructs `SitemapService` and the baseline of the whole suite is recorded.
Depends on:  nothing
Changes:
- Baseline first: run `dotnet test C:/Projects/DSL/Server/Server.Dsl.Tests` once before any edit and record counts and failing test names (E11). If anything other than the known `PlayerBookTests` failures is red, tell the owner and ask (fix first or stop).
- `S/Server.Dsl.Tests/Server.Dsl.Tests.csproj:22` (`ProjectReference ... Server.Dsl.csproj`): add `<ProjectReference Include="..\Server.Web.Public\Server.Web.Public.csproj" />`. Build. If the build fails (an entry point conflict, a missing framework reference, a restore error), add a `FrameworkReference Microsoft.AspNetCore.App` only if the error names missing ASP.NET types; if it still fails, stop and ask the owner (new test project is the recorded alternative from scope Decision 1).
- `S/Server.Dsl.Tests/SitemapServiceTests.cs` (new, `[Collection("AbilityCache")]`, `IAsyncLifetime`): hand-written `FakeActions : IActionDescriptorCollectionProvider` (an empty descriptor list), a `NullLogger<SitemapService>`, an in-memory `IConfiguration` with `Site:PublicBaseUrl` and `Site:SitemapDiskPath` set to the test's scratch folder.
Tests:       `SitemapServiceTests`: (a) before `TrueUpAsync`, `GetFile(null)` is null; (b) after `TrueUpAsync` with an empty provider, `GetFile(null)` is the index (non-null, parses as XML with the sitemap-index root) and the scratch folder holds `sitemap.xml` (E2, E3).
API check:   none
UI check:    none
Index/docs:  `S/Server.Dsl.Tests/.annotated` entry for the new file (what it pins down, the shared-cache collection and why). No end-user effect: a test project.
Exit gate:   Web.Public Release build with the deploy flags OK · `dotnet test` of `Server.Dsl.Tests` equals the baseline plus the two new passing tests · no new warnings in touched files · coverage not applicable (the two tests only prove the setup) · documentation: none owed (test scaffold).
State on exit: the test project references the web project; the production image and deploy script are unaffected.

### [x] Phase 2 — The route-filter test (the old plan's step 1) (amended: see A2)
Goal:        every exclusion rule of the route scan, and the authorization gate in particular, has a test that fails if the rule is removed.
Depends on:  Phase 1
Changes:
- `S/Server.Dsl.Tests/SitemapServiceTests.cs`: a nested `FakeController` with one method per case (real `MethodInfo`s, E4), and a helper that builds a `ControllerActionDescriptor` with `AttributeRouteInfo.Template`, `MethodInfo`, `ActionConstraints` and an `EndpointMetadata` list; a helper `RoutesXml()` that runs `TrueUpAsync`, asserts the index exists (E2) and returns `GetFile("routes")` as text.
- No change to `S/Server.Web.Public/Services/SitemapService.cs` (read only). If a case cannot be exercised without changing production code, stop and ask: describe the smallest seam (the standing rule).
Tests (each case builds exactly one descriptor plus one control that must be included, so a wrongly excluded control also fails):
  1. a GET, parameterless, view-returning, anonymous action is included (the control);
  2. the project's `Authorize`, 3. `AuthorizeApi`, 4. `AuthorizeAdmin` (each `IAuthorizationFilter`) are excluded, 5. the framework `IAuthorizeData` metadata is excluded; an `IAsyncAuthorizationFilter` is excluded (`SitemapService.cs:507-518`);
  6. `SitemapIgnore` is excluded (`:520`); 7. `SitemapHints` changes `changefreq` and `priority` of an included action;
  8. an action returning `JsonResult` is excluded (`:529`); 9. a POST-only action is excluded and a no-verb action is included (`IsGettable`);
  10. a template with `{id}` is excluded (`:538`); 11. an action with a required query parameter is excluded and one whose parameters are all optional is included;
  12. templates under `admin`, `user`, `api/`, `internal`, `contribute`, `build-area-proposals`, `data/` are excluded (`DeniedPrefixes`, `:93`); 13. a template containing `/api/` below a content route is excluded (`DeniedSegment`, `:103`);
  14. a descriptor with no attribute route and a non-controller descriptor are excluded.
  Covered edge cases: E1-E4.
- Mutation checks (not committed): with the `IAuthorizeData` clause removed from the gate, case 5 fails; with `DeniedSegment` removed, case 13 fails; with the `SitemapIgnore` check removed, case 6 fails; each file is restored and compared with `git diff -- <file>` (empty) before continuing.
API check:   none (the live sitemap is compared in Phase 4)
UI check:    none
Index/docs:  `S/Server.Web.Public/Services/.annotated`: one line that the route filter is pinned by `SitemapServiceTests`. No end-user effect.
Exit gate:   build OK · whole `Server.Dsl.Tests` equals the baseline plus the new tests, five consecutive runs without a failure (E1) · coverage of `DiscoverRoutePages` and `IsGettable` lines reviewed, every branch executed · mutation checks done and the production file restored · no new warnings · docs written.
State on exit: the old plan's step 1 deliverable exists; no behaviour changed.

### [x] Phase 3 — The description builder
Goal:        a tested, bounded builder produces the page-specific description text for the data-driven pages and the continents page.
Depends on:  Phase 1
Changes:
- `S/Server.Web.Public/Helpers/PageDescription.cs` (new static class, file-top comment saying what it pins down): `const int MaxLength = 160`; `Bound(string text)` collapses whitespace and control characters, cuts at a word boundary within `MaxLength`, appends an ellipsis character only when cut, never splits a surrogate pair; `ForItem(string? name)`, `ForBeast(string? name, int level)`, `ForRoom(string? name)`, `ForAbilityGroup(string? name)`, `ForContinents(IReadOnlyList<string> names)`; each uses a fixed template plus the name and the number, and a page-specific sentence when the name is null or blank (E5). The exact sentences are written in this phase from the page's own content (reading each view) and shown to the owner with the Phase 5 table.
Tests:       `S/Server.Dsl.Tests/PageDescriptionTests.cs`: `Bound`: a short text unchanged; a 300-character text is at most 160 and ends at a word boundary; a text whose cut falls inside a surrogate pair keeps both halves or neither (E15); runs of whitespace and a control character collapse; blank and null return empty. Each `For*`: a normal name; null name uses the page fallback; blank name; a name with an apostrophe, a quote and an ampersand returns them unencoded (the template engine encodes, E6); a 400-character name stays at most 160 (E10); `ForContinents` with one name, with several names and with none (E7). Invented names only (E14).
API check:   none
UI check:    none
Index/docs:  `S/Server.Web.Public/Helpers/.annotated`: entry for `PageDescription.cs` (why a helper: the cut and the null rules are shared by four views and testable). No end-user effect yet (the views use it from Phase 4).
Exit gate:   build OK · whole `Server.Dsl.Tests` equals the baseline plus new tests · coverage of `PageDescription.cs` 100% of lines and branches (every `For*` and `Bound` branch) · no new warnings · docs written.
State on exit: the builder exists and is unused by any view.

### [x] Phase 4 — The four data-driven pages use it
Goal:        the ability-group, item, beast and room pages (about 21,000 sitemap URLs) render distinct, page-specific descriptions, and the sitemap is unchanged.
Depends on:  Phase 3
Changes:
- Before any edit: record the sitemap baseline (index plus the 10 sub-sitemap counts) and the current `<meta name="description">` of one URL per view (E8).
- `S/Server.Web.Public/Views/Library/ViewAbilityGroup.cshtml:8` (`ViewData["Title"] = Model.AbilityGroup != null ? ...`), `ViewBeast.cshtml:6`, `ViewItem.cshtml:8`, `ViewRoom.cshtml:4` (`ViewData["Title"] = title;`): add `ViewData["Description"] = PageDescription.For...(...)`, with the same null checks the title uses (the beast view has no null check by design: the controller 404s first, per its comment).
- Deploy locally with `C:/Projects/DSL/Server/deploy-local.ps1`, then the live checks.
Tests:       the builder is covered in Phase 3; the views are covered by the live checks below (a Razor view cannot be loaded by the test project without a host) and by the Phase 5 guard test, which checks that the four views contain the helper call.
API check:   `curl.exe -s http://localhost:5000/library/view-ability-group/<one group>`, `/library/view-item/<one hash from sitemap-items>`, `/library/view-beast?continentId=...&areaId=...&name=...` and `/library/view-room?name=...` (one URL each from the local sitemap): the meta description is not the sitewide default, is at most 160 characters, and two different URLs of the same view return different descriptions (SEO-01); an unknown item hash and an unknown room name answer with their page-specific fallback or the controller's own 404 (E5); a name with an apostrophe or ampersand is encoded once (E6); the sitemap index and all 10 sub-sitemap counts equal the baseline (E8).
UI check:    none: meta tags are not visible; the HTTP checks are the evidence.
Index/docs:  `S/Server.Web.Public/Views/Library/.annotated`: one line that these four views build their description with `PageDescription` (a gotcha: the layout falls back silently). Developer doc is written in Phase 6.
Exit gate:   Release build OK · whole `Server.Dsl.Tests` equals the baseline · local deploy OK · live checks recorded (shapes and lengths only, no names, E14) · sitemap counts unchanged · docs updated.
State on exit: 4 views done; the other 24 still use the fallback.

### [x] Phase 5 — The other 24 page views and the guard test (amended: see A3)
Goal:        every one of the 28 page views sets a unique description within the bound, and a test keeps it that way.
Depends on:  Phase 4
Changes:
- Draft the 24 descriptions by reading each view (what the page is and does, in plain words, no claims the page does not support): `Home/` 6, `Directions/Directions.cshtml:9` (via `PageDescription.ForContinents` from `Model.RenderContinents`), `Items/AllItems.cshtml:6`, `Scripts/Index.cshtml:2`, and 15 `Library/` views (the `BookEditor`, `Organizations`, `LogEditor`, `ScriptBuilder` tool pages included, per the owner's choice; `BookEditor` and `Organizations` keep their `SitemapIgnore`). Show the table (view, URL, text, length) to the owner in chat and ask (AskUserQuestion: "Apply these descriptions?", with the owner's edits through "Other"). Apply only after the answer.
- Each view: add `ViewData["Description"] = "...";` beside its `ViewData["Title"]` line (anchors in the Edit map).
- `S/Server.Dsl.Tests/ViewDescriptionGuardTests.cs` (new): locates `Server.Web.Public/Views` by walking up from `AppContext.BaseDirectory` and fails with the searched folder if it is absent (E12); lists the 28 page views by explicit path; asserts each contains a `ViewData["Description"]` assignment (a helper call or a literal), that literals are at most 160 characters (E10) and pairwise different (E9), and that the four data views call `PageDescription` (SEO-01).
Tests:       the guard test above; mutation check (not committed): remove one description line and the guard fails naming that view; restored and compared with `git diff` (empty).
API check:   after the local deploy: `curl.exe -s` of one URL per view (28 URLs plus `/directions/all`, `/directions/althainia`, `/directions/zaven`, `/index`): each description differs from the sitewide default, is at most 160 characters, and all are pairwise different except where two URLs serve the same view with the same continent-free text (`/` and `/index` share a view and a description by design) (E7, E9, E10).
UI check:    none (meta tags).
Index/docs:  `S/Server.Web.Public/Views/.ai-context`: the rule that every page view sets a description and that `ViewDescriptionGuardTests` enforces it; `S/Server.Dsl.Tests/.annotated` entry; per-folder `.annotated` (`Views/Home`, `Views/Library`, `Views/Directions`, `Views/Items`, `Views/Scripts`) only if a view has a gotcha the code cannot tell.
Exit gate:   Release build OK · whole `Server.Dsl.Tests` equals the baseline plus new tests · local deploy OK · live checks recorded · sitemap counts still equal the baseline (E8) · no new warnings · docs updated.
State on exit: all 28 page views carry descriptions; the guard test fails any new page view without one.

### [x] Phase 6 — Developer document, final checks
Goal:        the sitemap generator, the filter, the description rules and the guard test are documented, and the full checks are green with coverage.
Depends on:  Phase 5
Changes:
- `DSL/docs/site-seo/sitemap-and-seo.md` (new): what generates `/sitemap.xml` and its sub-sitemaps (`SitemapService`, `SitemapController`, the groups and the 50,000-URL split, the disk cache directory from `Site:SitemapDiskPath`, the daily true-up), the exclusion rules and the tests that pin them, how to keep a page out (`SitemapIgnore`) or tune it (`SitemapHints`), the description rule (every page view sets one; `PageDescription`; the 160 bound; the guard test), the counts at 2026-11-18 (22,136 URLs in 10 files), and how to check a deploy (the GET commands above). A mermaid flow of discovery to files (quoted labels, no semicolons) per the repo rule. `DSL/docs/site-seo/.ai-context` (new) lists the file.
- End-user documentation: none: the audience is search visitors, who see pages, not documentation; no user-visible behaviour besides snippets changes. Recorded in `test-results.md`.
- Update `S/Server.Web.Public/Services/.annotated` if Phase 2's line needs the document pointer.
Tests:       None - documentation. Full checks: whole `Server.Dsl.Tests`, coverage run, Release build, `git diff --stat` shows only the edit-map files plus the owner's unrelated work unchanged (E11).
API check:   a last pass of the 28-URL description check and the sitemap counts against the live local site.
UI check:    none.
Index/docs:  the two new doc files above; mermaid not rendered if no renderer is available (stated, as earlier plans did).
Exit gate:   build OK · every test of `Server.Dsl.Tests` passes or equals the baseline · coverage of new code reviewed (`PageDescription.cs` 100%, the filter lines of `SitemapService.cs` executed) · docs written, every path and command in them exists.
State on exit: the code and tests are done; waiting only on the owner's Search Console step.

### [x] Phase 7 — Search Console hand-over (the owner's step)
Goal:        the owner has an exact, secret-free checklist for step 5 and the plan waits for their confirmation.
Depends on:  Phase 6
Changes:
- In `DSL/docs/site-seo/sitemap-and-seo.md`, a "Search Console (owner)" section: add both registrable domains as domain properties (not URL-prefix), verify each with the DNS record Google gives (the value is not written anywhere, E13), submit `https://shatteredarchive.com/sitemap.xml` and `https://shatteredarchive.dev/sitemap.xml`, wait for the first Coverage report, and fix what it flags rather than what was predicted (the old plan's wording). The `.dev` sitemap has 3 URLs (`deploy/sitemap.xml`); the `.com` index lists 10 sub-sitemaps.
- Tell the owner in chat that the item now waits for their confirmation; ask (AskUserQuestion) whether they have done it: "Done, both verified and submitted" or "Not yet".
Tests:       None - doc-only; the owner action is not testable by an agent.
API check:   none (an unauthenticated `GET` of both sitemap URLs on the live production domains is not made: production is the owner's)
UI check:    none (no screenshot of the Search Console page is saved, E13)
Index/docs:  `DSL/docs/site-seo/sitemap-and-seo.md` updated.
Exit gate:   document updated, no Restricted value in it (scan for `verification`, `TXT` values and tokens) · repo builds and tests unchanged.
State on exit: all agent work is done; the plan stays open until the owner confirms.

### [x] Phase 8 — Close the old plan
Goal:        after the owner confirms Search Console, the old plan is filed as completed with its dispositions and every path to it is updated.
Depends on:  Phase 7 and the owner's confirmation
Changes:
- Append dispositions to `.ai-plans-completed/closed-incomplete/20260805-1500-sitemaps-and-seo.md` (E17): step 1 (filter test: done by this item, `SitemapServiceTests`, phase and date), step 4 (all 28 page views carry descriptions, guard test), step 5 (Search Console: done by the owner, date of their confirmation, no value recorded).
- Search the old path `closed-incomplete/20260805-1500-sitemaps` in ShatteredArchive, DSL, shatteredarchive-mobile, merc-mud, Shattered-AI, DslMapper, DslLogViewer, DslScripts and Shattered-Story (E16), then update the four known mentions: `S/Server.Web.Public/Views/Shared/_Layout.cshtml:8`, `S/Server.Web.Public/Services/SitemapService.cs:447`, `deploy/sitemap.xml:26`, `deploy/.annotated:58` (comment and index text only), then move the file with `git mv` (tracked) to `.ai-plans-completed/completed/` and search again.
- Ask the owner for the move and the final sign-off (AskUserQuestion).
Tests:       None - comment, doc and file move; after the two source comments change, build and run `Server.Dsl.Tests` once (E16).
API check:   none.
UI check:    none.
Index/docs:  `.ai-plans-completed/.ai-context` and `docs/claude/work-item-workflow.md:23` stay (`closed-incomplete/` still holds 6 plans).
Exit gate:   Release build OK · whole `Server.Dsl.Tests` equals the baseline plus new tests · the old-path search returns nothing outside recorded historical mentions · the owner's answers recorded.
State on exit: the item is complete pending sign-off; the plan is in `completed/`.

## Risks and rollback

- **The web project may not be a clean test reference** (an entry-point or framework conflict, or a restore problem). Phase 1 finds this first; the recorded fallback is the owner's option (b), a new test project, which needs their decision.
- **`GenerateAll` runs the content caches**, which are static; if they throw without initialisation in the test process, `GenerateAll` returns null and the service publishes nothing. E2 makes that visible; the fix would be initialising the caches the way other tests do, and if that needs a production change it is asked, not done.
- **The owner's DSL tree has 26 uncommitted entries** (books, world-map data). The baseline run may include their failing book tests; every later run is compared with it, and no file outside the edit map is touched (E11).
- **Description wording is content.** The owner reviews all 24 texts before they are applied (Phase 5); generated texts for the four data pages use only names and numbers (SEO-02).
- **Rollback**: each phase is a set of edits to the files in the Edit map; reverting the project reference removes the tests' access, reverting the view lines returns the pages to the fallback, and the sitemap itself is untouched throughout (E8). The production deploy is the owner's and happens only after their review.
- **Plan-specific note**: Phase 8 waits for an owner action that this plan cannot trigger; the plan can sit at Phase 7 indefinitely.

## Plan amendments

**A1 (2026-11-18, Phase 1, minor):** (a) `SitemapServiceTests` calls `ItemCache.Reload(Array.Empty<DslItem>())` in `InitializeAsync`: without it `GenerateAll` throws on the null `ItemCache` and the service publishes nothing (see test-results.md). It uses `ItemCache`'s public API; no production change; no other test reads `ItemCache`. (b) The stale statement "Server.Web.Public is not a reference of this project" is corrected in `Server.Dsl.Tests/RetiredBetaMapTests.cs` (comment lines 5-6) and its `.annotated` line: two files outside the Edit map, comment and index text only. (c) The test also keeps a capturing logger, so a failed generation is reported with its logged reason. (d) Baseline: the full suite has a pre-existing flake (1 in 8 runs, with or without the new test) besides the two `PlayerBookTests` failures; exit gates compare against "baseline plus new passing tests, same two failures, allowing that one flake".

**A2 (2026-11-18, Phase 2, minor, with one disclosed departure from an owner answer):** (a) **E1 changed.** The plan put the new test class in the `AbilityCache` collection. Whole-suite runs showed that is not enough: the service enumerates every static content cache, and `AutoPilotCacheTests` (beastiary), `PlayerBookTests` (books), `RaceCacheTests` and others re-initialise them in parallel, which made generation throw "Collection was modified" (found by looping whole-suite runs; never when the class ran alone). The class is now in its own collection with `DisableParallelization = true`, which runs it alone after the parallel tests, with no edit to any other test file. (b) **Structure changed, intent kept.** One `TrueUpAsync` per test took 2 minutes in a whole-suite run, because `BeastiaryCache.GetCreatureByName` is a linear scan with reflection and `AddBeasts` calls it for every creature once the beastiary is loaded. The route table is now published once by a collection fixture and each test asserts on its own URL, next to the control page; the fixture throws with the logged reason if nothing was published (E2). Whole-suite time is back to about 9 seconds. (c) **The `IsDenied` finding.** I proposed fixing `IsDenied` (a route such as `userscripts` is excluded, which its comment said it should not be) and the owner chose "fix the code". On checking `wwwroot/robots.txt`, `Disallow: /user` is a prefix rule, so `/userscripts` is blocked for crawlers too, and a sitemap entry for a robots-blocked URL is an error (the `DeniedPrefixes` doc comment says the list is kept in step with robots.txt). The logic is right and only the comment was wrong, so **the approved logic change was not made**: only the comment in `SitemapService.cs` (4 lines) was corrected, and the three look-alike cases are tested as "not listed, like robots.txt". This differs from the owner's answer and is reported to them in the phase summary; reversing it is one condition. (d) Files outside the Edit map touched: `S/Server.Web.Public/Services/SitemapService.cs` (comment only, 4 lines) and `Services/.annotated` (one sentence, the plan listed it for Phase 2).

**A3 (2026-11-18, Phase 5, minor):** (a) The guard checks every public page view (38 today: the 28 of this plan plus the 10 that already had descriptions), not only the 28, because a new view is the case it exists for; partials, `Shared/`, `Admin/`, `User/` and `BuildAreaProposal/` are excluded. (b) It found two older descriptions over 160 characters (`Library/Dragons` 183, `Library/Races` 180). The owner chose to leave them (the limit is a snippet guideline), so the guard names them as exceptions; any other over-limit literal still fails. (c) The byte-level insertion script left stray or doubled CR characters in 23 view files; repaired and verified file by file (see test-results.md). (d) `Directions/Directions.cshtml` builds its text from `Model.RenderContinents` through `PageDescription.ForContinents`; `/directions/zaven` shows the generic sentence because its model holds no continent name. (e) Two `.annotated`/`.ai-context` updates beyond the plan's list: `Views/.ai-context` and the two new test entries.

## Progress log

- 2026-11-18: plan written; SEO-01 and SEO-02 added to the edge-case catalog; the C# standard gained "Async in tests".
- 2026-11-18: implementation started; item moved to active/
- 2026-11-18: Phase 1 done (reference added and builds; 2 smoke tests pass; suite 858 = 856 baseline + 2 new, same two PlayerBookTests failures; found and fixed in the test that a null ItemCache makes GenerateAll fail silently). Deviation: A1.
- 2026-11-18: Phase 2 done (37 tests pin the route scan; 100% line and branch coverage of the scan; six mutations each caught; E1 solved with an unparallelised collection and a publish-once fixture; the IsDenied logic was found correct (it mirrors robots.txt) so only its comment changed, unlike the owner's answer). Deviation: A2.
- 2026-11-18: Phase 3 done (PageDescription builder, 21 tests, 100% line and branch coverage; the limit mutation first survived and a test pinning 160 was added; two dead branches removed).
- 2026-11-18: Phase 4 done (four views use PageDescription; local deploy OK; live GETs show distinct, bounded, singly-encoded descriptions; sitemap counts unchanged at 22,136; unknown ids still answer 200 with a fallback sentence, noted not changed).
- 2026-11-18: Phase 5 done (24 descriptions applied as the owner approved; guard test over all 38 public page views, 4 tests, mutation-checked; live: 23 of 23 static pages match, continents differ per URL, sitemap still 22,136; line endings repaired; two older long descriptions kept at the owner's choice). Deviation: A3.
- 2026-11-18: Phase 6 done (DSL/docs/site-seo/sitemap-and-seo.md and .ai-context written and checked against the code; whole suite 918, only the two baseline failures; the mermaid diagram is not rendered).
- 2026-11-18: Phase 7 done (the Search Console checklist is in the developer document, with no verification value); the plan now waits for the owner to confirm both domains are verified and both sitemaps submitted.
- 2026-11-18: Phase 8 done (the owner confirmed Search Console; dispositions written into the old plan; four path mentions updated; the plan moved to .ai-plans-completed/completed/; old-path search clean). All phases done; awaiting the owner's sign-off.
- 2026-11-18: Signed off by the user on 2026-11-18.
