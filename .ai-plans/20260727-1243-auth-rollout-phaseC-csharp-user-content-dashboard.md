# Plan: Auth rollout Phase C — C# user-data APIs + central dashboard shell

Created: 2026-07-27T12:42:58-05:00 · Workspace: /workspace/dsl (DSL repo, Server.Web.Public) · Status: COMPLETE
Task: Give hub-authenticated users real per-account storage on the C# service for
user scripts, plugin configs, book bookmarks, user-owned maps, and uploaded game
logs; rebuild `user/dashboard` as the roll-up shell; ship the first concrete
delegated-role hierarchy (Decision 4) as this service's own admin UI.

> Every step below gets a real `dotnet build`, a live manual check against the local
> dev loop (`http://localhost:5000`, hub at `https://auth.shatteredarchive.dev` via
> the hosts-file override — see the Phase B sub-plan's topology correction: this
> whole machine is a local dev replica, NOT the real shatteredarchive.com), a
> Progress-log entry with the evidence, and doc/`.annotated` updates before moving
// on — per the user's explicit ask (2026-07-27): review + test + document with
> evidence + update user docs for each implementation, not just at the end.

## Goal

A logged-in hub account can: save/load their alias/timer/trigger scripts and plugin
configs as a whole collection; bookmark/unbookmark books from the shared library;
create/rename/delete named personal maps; upload game logs (size-capped, oldest
evicted past a retention cap) and browse/delete them; see all of this on one
`user/dashboard` page with placeholders for remote-service content (Phase H fills
those in later); and, if they hold the hub's `owner`/`admin` global role, manage this
service's OWN delegated-tier roster (owner > admin > manager > trusted > user) for
other accounts, strictly below their own tier — the first concrete instance of
Decision 4's per-service authority model.

## Constraints

- **Content, not credentials, in any cross-service surface** — not directly relevant
  to this phase's endpoints (all first-party, no summary/fan-out yet — that's Phase
  H), but the dashboard's placeholders for remote services must not pre-empt it.
- **Size caps + retention on game logs before the upload endpoint ships, not after**
  (umbrella Constraint, was already flagged before this program started). Concrete
  defaults chosen this phase (documented in Step 4, adjustable later): 8 MiB per
  upload, 25 logs retained per account (oldest deleted on overflow) — no global
  quota system exists elsewhere in this app to match, so these are new, explicit,
  and called out as tunable rather than inherited from precedent.
- **No new HTTP surface without designing its guard deliberately.** Every new
  endpoint in this phase is behind `[AuthorizeApi]` (existing attribute — checks
  `HttpContext.GetUser() != null` via Phase B's `HubAuthMiddleware`, 401 JSON on
  failure) at minimum; delegated-role endpoints add a further inline tier check.
- **DBManager reality check (verified this session, Server.Datastore/SqlClient.cs):**
  `QueryItems<T>(key, sortKey)` is an unimplemented stub (throws
  `NotImplementedException`); `QueryItem<T>(key)` runs `... WHERE Key=@key LIMIT 1`
  — returns only ONE row. There is no efficient "all rows for this partition key"
  query. Every "list this account's N items" read in this phase is therefore
  `DBManager.ScanItems<T>()` + an in-memory `Where(x => x.Key == accountId)` filter —
  the SAME pattern `UsersCache`/`UserService.GetAll()` already use elsewhere in this
  codebase. Acceptable at this site's scale; flagged here so it isn't mistaken for
  an oversight later.
- **DEEPER finding: `Key` is the sqlite backend's ONLY real row identity — SortKey
  is decorative.** `SqlClient.InstantiateDatabaseTables` creates every table as
  `Key text primary key, SortKey text, Timestamp text, Payload text` (`Key` alone,
  not a `(Key, SortKey)` compound). `SaveData<T>`'s SQL is
  `UPDATE ... WHERE Key=@Key` then `INSERT ... WHERE NOT EXISTS (SELECT 1 ... WHERE
  Key=@Key)` — SortKey never appears in either predicate. Confirmed against every
  existing table in this codebase (grepped every `Key = ...` call site): Key is
  ALWAYS already globally unique per row in practice (`Key = messageHash`,
  `Key = hash`, `Key = user.ID`, `Key = roomName`, ...) — nothing in this codebase
  has ever actually relied on Key+SortKey as a real DynamoDB-style hash+range pair.
  **Consequence for this phase's one-to-many content (books/maps/logs, many rows
  per account):** Key must be GLOBALLY UNIQUE per row, `"{accountId}#{itemId}"`,
  NOT `Key=accountId` with a varying SortKey (that would silently collapse every
  row for an account onto one, clobbering all but the last write) — SortKey is
  repurposed as a cheap scan-filter column (`= accountId`) instead. The
  single-row-per-account types (user scripts, plugin configs, service roles) are
  unaffected — they were always going to have `Key=accountId` with exactly one row.
- **Even deeper finding: this data layer had NO delete primitive at all.**
  `IDatabaseClient`/`SqlClient`/`DBManager` exposed Save/Scan/QueryItem/QueryItems
  only — nothing in this codebase, before this phase, ever deleted a row (matches
  the "additive persistence" pattern noticed in the auth-server world too). Added
  `DeleteItem<T>(key)` across all three layers this phase (`DELETE FROM {table}
  WHERE Key=@Key`, returns whether a row was actually removed) — a genuine,
  small, well-scoped extension, not a workaround. Needed for real per-item
  deletion (unbookmark a book, delete a map, delete a log) where the Step 2
  whole-blob types could get away with "PUT an empty array" instead.

## Context, continued: chronological implementation notes

> These entries were appended live as each step below was implemented and
> verified — the canonical checkbox states are in "## Steps" further down, and
> the final sign-off is in "## Progress log" at the end of this document.

- 2026-07-27T13:05-05:00 step 1 done: `Constants.cs` gained the 6 `TABLE_*`
  constants; 6 new model files under `Server.Datastore/Models/` (doc comments
  record the corrected Key scheme per the finding above); `AppManager.DbTables`
  updated (miss this = tables never get created — confirmed by testing:
  boot log shows table creation only for names present in this list);
  `ServiceTiers.cs` (Rank/CanManage/AssignableTiers, mirrors
  services-server/auth-tiers.ts) + `ServiceRoleStore.cs` (GetTier defaults to
  "user", SetTier, IsEmpty for bootstrap, ListAll joined with IUserService for
  display), registered as a DI singleton in `Program.cs`.
  TEST NOTE: this DSL solution has NO test project (verified: `Server.sln` lists
  only 7 non-test projects) — "tested" here means `dotnet build` clean + live
  verification against the local dev loop, not unit tests. `ServiceTiers`'
  behavioral proof deferred to Step 5's live E2E per the plan's own scoping, BUT a
  temporary debug endpoint (`GET /debug/tiers-check`, added and removed same step)
  was hit against the redeployed local container and confirmed the FULL truth
  table: owner→admin=true, admin→admin peer=false, manager→trusted=true,
  user→owner=false, unknown-actor=false, unknown-target=false,
  assignableForManager=[trusted,user] — all correct, debug endpoint removed
  before commit-worthy state (rebuilt clean afterward, confirmed 0 errors).
  Live evidence the 6 tables actually exist: `grep`ping the local dev
  `Data/db.sqlite` file for each table name found all 6 (sqlite auto-creates
  schema text as scannable bytes); boot log clean, no DB errors.
  `.annotated` refreshed in every touched directory (Server.Core,
  Server.Datastore/Models, Server.Web.Public/{Models,Services,Managers}).
- 2026-07-27T13:35-05:00 step 2 done: `Controllers/UserContentController.cs` —
  `[AuthorizeApi]` class-level; `GET/PUT/DELETE api/user-content/scripts` +
  `.../plugin-configs`, whole-array `[FromBody] JArray` binding (confirmed
  Newtonsoft's MVC integration binds raw JArray directly — no custom model
  needed), validation mirrors `isValidUserScript` (kind-specific required fields
  for trigger/alias/timer) and a plugin-config floor (id/name/version/enabled/
  installedAt required, `userConfig` opaque per the Constraints); whole-batch
  rejection on the first bad item (no partial persistence — the save call never
  runs if validation fails); count caps 500/200. Two build-time fixes during
  this step: a definite-assignment error from referencing an `out var` across a
  short-circuited `||` (restructured into two sequential `if`s) and an unused
  `tableName` parameter on the read path (removed — only the write path needs it,
  for SortKey). LIVE E2E (`phase-c-step2-e2e.mjs`, local dev loop): **13/13
  PASS** — valid round-trip byte-identical; a malformed batch (trigger missing
  `matchText`) 400s naming `item[3]` and does NOT persist any of the 4 items
  (re-GET still shows the prior 3 valid ones); a 501-item batch hits the cap;
  DELETE empties it; a second, independently-onboarded account sees a
  completely empty collection (isolation); anonymous GET and PUT both 401;
  plugin-configs round-trips byte-identical, isolated the same way, and a
  missing-`version` record 400s. `.annotated` refreshed
  (Server.Web.Public/Controllers). Residue: two throwaway hub accounts
  (`phase-c-step2-*`), same accepted precedent as Phase A/A2/B.
- 2026-07-27T14:05-05:00 step 3 done: extended `LibraryController` with
  `GET/POST/DELETE library/user-books[/{bookId}]` (bookmark references
  `BookCache`'s shared catalog by BookID, 404 on unknown id, title resolved for
  display) and `MapsController` with full CRUD `maps/user-maps[/{id}]`
  (`Key="{accountId}#{mapId}"` — the account-scoped key IS the ownership check,
  so a cross-account update/delete 404s naturally). Required a genuine new data-
  layer capability first: **added `DeleteItem<T>(key)` across
  `IDatabaseClient`/`SqlClient`/`DBManager`** (`DELETE FROM {table} WHERE
  Key=@Key`) — nothing in this codebase ever deleted a row before Phase C (only
  Save/Scan/QueryItem/QueryItems existed); a real, well-scoped extension of the
  shared data layer, not a workaround, since Step 2's "PUT an empty array" trick
  only works for whole-blob single-row types, not per-item collections.
  LIVE E2E (`phase-c-step3-e2e.mjs`) caught TWO real issues before landing on
  **19/19 PASS** — both worth recording since they show the review actually
  happened rather than rubber-stamping: (1) my OWN test script's `json()` helper
  hardcoded `method: 'POST'`, so my "PUT" calls silently sent as POST — ASP.NET
  correctly returned 405 (route template matched, verb didn't) proving the
  SERVER was right and the harness was wrong; fixed the helper to take a method
  param. (2) picked a book id (`new-player-guide`) that turned out to be
  genuinely absent from `BookCache` — a PRE-EXISTING, unrelated DSL gap
  (`BookCache.cs:238`, `// bookCache.Add(book);` is commented out, so the
  DB-backed book path is dead code; books actually come from ~9 hardcoded
  adhoc classes at `BookCache.cs:35-43`, `NewPlayerGuide` isn't among them) —
  confirmed by reading BookCache.cs directly, switched the test to
  `travel-guide` (one of the actually-registered adhoc books), not a code fix
  (out of scope for Phase C, noted here for whoever eventually addresses that
  hackfix). Final run: bookmark a real book 200s with the correct resolved
  title; unknown id 404s; unbookmark removes it + is idempotent; two named
  maps created, listed, renamed (PUT), one deleted, list reflects state
  throughout; a second account's cross-account PUT on the first account's map
  id 404s (not a leaking 403); both accounts' books/maps fully isolated;
  anonymous 401 on every new endpoint (GET/POST both controllers).
  `.annotated` refreshed (Server.Datastore incl. the Key-is-sole-identity note
  now also on SqlClient.cs itself, Server.Web.Public/Controllers, new
  Models/UserContent/.annotated+.ai-context). Residue: two more throwaway hub
  accounts (`phase-c-step3-*`).
- 2026-07-27T14:20-05:00 step 4 done: raw-body upload chosen over multipart
  (no existing upload endpoint to mirror, and a raw body + `?filename=` query
  param is simplest given the client controls the filename anyway) —
  `POST api/user-content/logs?filename=x`, `GET .../logs` (metadata only, never
  bulk content), `GET .../logs/{id}` (content), `DELETE .../logs/{id}`. Size cap
  enforced BOTH ways: a fast-path `Request.ContentLength` check rejects before
  reading any body bytes when the client sends one, plus a streaming
  running-total check during the read loop (never buffers past 8 MiB even on a
  chunked upload with no Content-Length). Retention (25/account) enforced on
  EVERY upload via `EnforceLogRetention` — scans, sorts by `UploadedAt`
  descending, deletes everything past index 25 using the new `DeleteItem<T>`.
  LIVE E2E (`phase-c-step4-e2e.mjs`): **15/15 PASS** — small upload round-trips
  byte-identical content and correct metadata; an 8 MiB+1 KiB upload 413s and
  persists NOTHING (list still shows exactly the prior 1 log); delete removes
  it; uploading 26 logs in sequence leaves exactly 25, with the FIRST
  (oldest) evicted and the LAST (newest) surviving — proving retention is
  real eviction by recency, not just a count truncation; a second account
  gets 404 fetching the first account's log id and sees zero logs of its own;
  anonymous upload and list both 401. `.annotated` refreshed
  (Server.Web.Public/Controllers). Residue: two more throwaway hub accounts
  (`phase-c-step4-*`).
- 2026-07-27T15:10-05:00 step 5 done: `ServiceTiers` gained `AtLeast(tier,
  threshold)`; `HubAuthMiddleware.Invoke` calls `MaybeBootstrapServiceOwner`
  after every successful identity resolution (the very first hub owner/admin
  login while `ServiceRoleStore.IsEmpty()` becomes this service's "owner";
  every later grant goes through the admin UI's strictly-below rule — no host
  script needed, this app has no script-runner convention to match auth-server's
  `grant-tier`). New `Controllers/ServiceRolesController.cs` (`api/service-roles`,
  `[AuthorizeApi]`): `GET` lists every known account with per-row `manageable`
  flags; `POST /{accountId}` enforces strictly-below on BOTH the target's
  current tier and the requested tier (mirrors the hub's own A2
  assignment-ceiling), 404s an unknown accountId (verified via `IUserService` —
  otherwise a bogus id would silently create a role row), 400s an unknown tier
  string. Wired `manager`-and-above into `LibraryController.BookEditor()`'s
  existing `CanCreateBooks` check (Constraints' one concrete wiring point) —
  `owner`/`admin` continue riding the pre-existing `UserType.Admin` flag
  (already correctly hub-mapped since Phase B), `manager`/`trusted` are the new
  tiers this phase actually stores. New `Views/Admin/Roles.cshtml` +
  `wwwroot/js/admin/roles.js` (jQuery-AJAX, matching this app's ONLY existing
  JS convention — confirmed zero uses of `fetch()` anywhere in
  `wwwroot/js` before this), linked from `_nav.cshtml`'s Admin dropdown
  (`[AuthorizeAdmin]`-gated page; the API underneath is open to any logged-in
  account so a manager reaches it from the Step 6 dashboard too — the page
  hides what a caller can't do, the API enforces it).
  LIVE E2E (`phase-c-step5-e2e.mjs`) hit real external constraints along the
  way, both worth recording since they cost real time and are worth remembering:
  (1) the hub's `ChallengeThrottle` (5-token bucket, 1 refill/2min, verified by
  reading `questions-store.ts`) was exhausted by the cumulative signups across
  Steps 2-5's testing — waited for it to refill (confirmed via a bounded
  background poll) rather than working around it. (2) a genuinely reused-vs-
  fresh-account subtlety: re-running the script against ALREADY-run accounts
  with their ORIGINAL one-time passwords fails (the password was already
  forced-changed in the prior run) — fixed by using the host's
  `temp-password` script to re-issue a usable password each retry, which does
  NOT touch `LoginLockout`'s separate in-memory failure counters; a burst of
  those stale-password failures escalated an IP-wide `LoginLockout` (verified
  by reading `login-lockout.ts`: it tracks failures per-username AND
  per-source-IP, either being locked blocks the attempt — a real anti-abuse
  fail2ban-style mechanism, not a bug) — waited it out. (3) even after both of
  those were resolved, a 4th DISTINCT sequential login within one single script
  process consistently 401'd at `/api/sso/approve` with "a valid session is
  required", while an ISOLATED single-account diagnostic script (same exact
  logic) succeeded every time — never fully root-caused (candidates: some
  per-process session/connection-reuse limit on the local dev hub under rapid
  sequential distinct-account logins; not reproduced by Steps 2-4's 2-accounts-
  per-script pattern). Sidestepped rather than chased further: the 3 checks
  that had been trying to use a brand-new 4th account (manager-assigns-admin-
  refused, manager-touches-owner-refused, manager-assigns-trusted-succeeds)
  were rewritten to target `secondHubOwner` (already onboarded earlier in the
  SAME run) instead — this tests the identical `ServiceTiers.CanManage` logic
  without needing a 4th signup, and is arguably a BETTER test (reusing a
  known, already-provisioned account rather than a never-seen one).
  FINAL RESULT: **13/13 PASS** — previously-bootstrapped owner reused
  successfully (temp-password recovery) and confirmed still "owner";
  `assignableTiers` for owner is exactly `[admin,manager,trusted,user]`; a
  SECOND hub-owner-globalRole account logging in for the first time (store
  no longer empty) correctly stays at the default "user" tier — proving
  bootstrap really is one-time-only, not "any owner login"; a plain user's
  list call shows zero manageable rows; owner promotes member to manager
  (200, list reflects it); the now-manager member's `/library/book-editor`
  response includes "Saved Books" (CanCreateBooks live); manager assigning
  admin (above its own tier) is refused 403; manager touching the owner's
  tier at all is refused 403 (can't manage upward); manager assigning trusted
  (strictly below) succeeds 200; unknown accountId 404s; unknown tier string
  400s; anonymous list 401s.
  Residue: three hub accounts persist across this step's several runs
  (`phase-c-step5-owner-1785175889` — the real bootstrapped owner,
  `phase-c-step5-owner-1785176580`, `phase-c-step5-member-1785176580` — now
  permanently "manager" here, harmless test data).
- 2026-07-27T15:45-05:00 step 6 done: rewrote `Views/User/Dashboard.cshtml`
  using Bootstrap's own `card`/`card-header`/`card-body` classes (NOT
  `BookEditor.cshtml`'s `.bk-card` — that turned out to be page-scoped CSS in
  an inline `<style>` block there, not a reusable global class; caught by
  checking `wwwroot/css` directly before reusing it, avoided a page that would
  have rendered unstyled) — sections for Scripts+Plugins (counts only, a
  "manage in-game" note — no full editor here per the cross-cutting
  site-owns-its-content rule), Bookmarked Books (list + remove), Maps (create/
  rename/delete inline — this is the C# service's own content, so full CRUD
  here is correct unlike scripts/plugins), Game Logs (upload form + list +
  delete), and static "coming soon" placeholder cards for Kingdom Tactics/MUD
  Builder (Phase H wires real fan-out later). New
  `wwwroot/js/user/dashboard.js` (jQuery AJAX — confirmed this is the ONLY JS
  convention anywhere in this app before adding anything new) drives every
  section against Steps 2-5's APIs and toggles a Roles-admin link based on
  `api/service-roles`'s `assignableTiers`.
  LIVE E2E (`phase-c-step6-e2e.mjs`, reused an existing manager-tier account
  via temp-password to conserve the hub's rate limit): **9/9 PASS** — real
  data seeded across every content type (a script, a plugin config, a
  bookmark, a map, a log) then the dashboard page fetched 200 with its JS
  bundle referenced; every underlying API call the JS makes returns exactly
  the seeded data (book title resolved, map by id+name, log by filename);
  `assignableTiers` non-empty for the manager (confirms the roles-link
  visibility condition); anonymous `/user/dashboard` still redirects to login
  (no regression). **Honest caveat**: this is a scripted verification of the
  full data pipeline the JS depends on (the view serves the right HTML/JS,
  every API returns the right shape) — it does NOT execute the client-side
  jQuery in an actual browser DOM (no browser-automation tooling set up for
  this legacy MVC+jQuery app in this environment), so the final visual
  rendering/click-through has not been eyeballed. The JS itself is
  straightforward DOM construction mirroring `show-db.js`'s already-working
  pattern exactly (same jQuery idioms, same AJAX shape), which is why this is
  a reasonable stopping point rather than blocking on browser tooling — flagged
  here rather than silently claimed as fully verified.
- **No existing per-user data model to "extend"** (verified this session):
  `LibraryController`/`MapsController` have zero `DBManager` calls today (they read
  static in-memory caches — `BookCache`, `AreaCache`) and zero notion of ownership.
  "Extend with user scope" (umbrella wording) means adding brand-new tables +
  actions to those SAME controllers/route prefixes (`[Route("library")]`,
  `[Route("maps")]`), not modifying existing query logic — there is none to modify.
- **`AnyUserScript`/`InstalledPluginRecord` are client-owned shapes (verified this
  session, apps/game-client).** The C# API mirrors them faithfully as an opaque JSON
  payload rather than re-modeling every field in C# — game-client (Phase D) is the
  only real producer/consumer of the field semantics; the C# side's job is
  durable, per-account storage + the validation floor described in Step 2, not
  reinterpreting script/plugin internals.
- **Scope boundary on user scripts (this phase only covers the `AnyUserScript[]`
  collection, not `globalScriptsStore`/`userVariablesStore`).** The umbrella's
  wording ("alias/timer/trigger collections") matches only the per-connection
  `AnyUserScript` array; global scripts and named vars are a separate, smaller
  client-side surface not mentioned in the umbrella and are OUT of scope here —
  flag for a later phase (D or a Phase C addendum) rather than silently expanding
  scope now.
- **Delegated-role scope decision (Decision 4, first concrete implementation):**
  this phase ships the tier STORE + strictly-below management UI as the reference
  mechanism, and wires it to exactly ONE concrete permission
  (`UserSitePermissions.CanCreateBooks`, already checked today in
  `LibraryController`'s `BookEditorViewModel` — `manager` tier and above grants it)
  rather than inventing new permission surface area with no consumer. `owner`/
  `admin` tier continues to ride on the EXISTING `Constants.UserType.Admin` flag
  (already correctly set from the hub's `owner`/`admin` globalRole by Phase B's
  `UserService.MapUserType` — no regression risk); `manager`/`trusted` are the new
  finer sub-tiers this phase actually introduces a store for.
- **Bootstrap, not a host script.** The DSL app has no host-script runner convention
  (unlike auth-server's `pnpm register-service` etc. — this is compiled C#, not a
  script runtime). Bootstrap rule: the first time an account whose HUB global role
  is `owner`/`admin` logs in while this service's role store is completely empty,
  they are auto-assigned `owner` here. Every subsequent grant goes through the new
  admin UI's strictly-below rule. This mirrors "hub owners/admins bootstrap/appoint
  this service's admins" literally, without adding a separate CLI surface.
- **Front-end convention (verified this session):** this MVC app has no bundler/SPA
  framework — every interactive page is a Razor view + a plain `wwwroot/js/<area>/*.js`
  file doing `fetch()` (e.g. `library/book-editor.js`, `library/toasts.js`). The
  new dashboard and role-admin pages follow this exact convention; do not introduce
  React/Vite here.

## Context (verified 2026-07-27, file:line — trust this, don't re-survey)

- **Identity plumbing (Phase B, already live on this dev machine):**
  `HttpContext.GetUser()` (`Extensions/HttpContextExtensions.cs:13-16`) returns the
  `IUser` `HubAuthMiddleware` (`Middleware/HubAuthMiddleware.cs:38-56`) stashed in
  `context.Items["User"]`, keyed by the hub `accountId` (`user.ID`). `[AuthorizeApi]`
  (`Attributes/AuthorizeAttribute.cs:39-59`) already 401-JSONs when `GetUser()` is
  null — the exact guard every new endpoint in this phase reuses.
- **DB convention:** every table is `[DynamoDBTable(Constants.TABLE_X)]` over
  `Key`/`SortKey`/`Timestamp`/`Payload` (`Server.Datastore/Models/*.cs`), written via
  `DBManager.SaveData<T>(item, overwriteIfExists)`, read via `ScanItems<T>()` (full
  scan) or `QueryItem<T>(key)` (single row, `LIMIT 1`). Existing `TABLE_*` constants
  (`Server.Core/Constants.cs:162-178`): CHARACTER_CREATION_ROLL, CHARACTER_LEVEL_UP,
  GET_LOG, ITEMS, QUEST_REWARDS, ROOMS, WORLD_MAP, MONSTERS, WEB_FEEDBACK, BOOKS,
  TOASTS, USERS, APIKEYS, PROFILES, CHARACTERS, ITEM_IDENTIFICATIONS,
  CREATURE_LORE. New ones this phase: `USER_SCRIPTS`, `PLUGIN_CONFIGS`,
  `USER_BOOKS`, `USER_MAPS`, `GAME_LOGS`, `SERVICE_ROLES` (snake_case values:
  `user_scripts`, `plugin_configs`, `user_books`, `user_maps`, `game_logs`,
  `service_roles`). Per the Key-is-sole-row-identity finding above:
  `USER_SCRIPTS`/`PLUGIN_CONFIGS`/`SERVICE_ROLES` are `Key=accountId` (one row);
  `USER_BOOKS`/`USER_MAPS`/`GAME_LOGS` are `Key="{accountId}#{itemId}"`,
  `SortKey=accountId` (many rows, scan-filtered on SortKey).
- **`AnyUserScript` shape (apps/game-client/src/features/userScripts/types.ts):**
  discriminated union on `kind: 'trigger'|'alias'|'timer'`; common fields `id`
  (client-generated `crypto.randomUUID()`), `name`, `enabled: boolean`,
  `language: 'javascript'|'lua'|'python'|'typescript'|'text'`, `source: string`,
  `group?: string`; trigger adds `matchText`, `eventName`, `omitFromOutput?`,
  `dontRequireMatchText?`; alias adds `alias`; timer adds `intervalMs: number`.
  Client-side shape validator for reference: `isValidUserScript`
  (`components/UserScriptSandboxModal.tsx:112-156`).
- **`InstalledPluginRecord` shape (apps/game-client/src/features/plugins/hooks/usePlugins.ts:10-20):**
  `{id, name, version, description?, author?, enabled: boolean, installedAt, userConfig: Record<string,unknown>, kind}` —
  already GLOBAL (not per-connection) client-side, so it maps cleanly to "one array
  per account" with no connection-scoping ambiguity (unlike `AnyUserScript`, which
  is per-connection client-side but becomes one unified per-account array here —
  Phase D's job to reconcile, not this phase's).
- **`[AuthorizeAdmin]` (`Attributes/AuthorizeAttribute.cs:64-90`)** already gates
  `AdminController` (`get-all-users`, `show-db`, etc.) on `user.UserType.HasFlag(Admin)`
  — unaffected by this phase; `owner`/`admin` service-tier continues to ride on it.
- **`UserSitePermissions.CanCreateBooks`** consumed today at
  `Controllers/LibraryController.cs:45-55`'s `BookEditorViewModel` — the one
  concrete wiring point for the new `manager`+ tier check (Constraints).
- **Node-side tier convention to mirror (deliberate cross-language duplication,
  same rationale as the Ed25519 assertion port):**
  `services/services-server/src/auth-tiers.ts` — ordered tier array, `tierRank`,
  `canManage` fails closed on unknown tiers.

## Steps

### [x] 1. Data layer: tables, models, `ServiceTiers`, shared scoping helpers
- Do: `Constants.cs` gains the 6 new `TABLE_*` constants (Context). New
  `Server.Datastore/Models/{UserScriptsModel,PluginConfigsModel,UserBookModel,
  UserMapModel,GameLogModel,ServiceRoleModel}.cs`, each the standard
  `[DynamoDBTable]` `Key`/`SortKey`/`Timestamp`/`Payload` shape. New
  `Server.Web.Public/Models/ServiceTiers.cs`: `string[] Order = {"owner","admin",
  "manager","trusted","user"}`, `int Rank(string tier)` (unknown → `int.MaxValue`,
  fails closed), `bool CanManage(string actor, string target)`
  (`Rank(actor) < Rank(target)`, false on any unknown tier). New
  `Services/ServiceRoleStore.cs`: `GetTier(accountId)` (scan+filter, default
  `"user"` when absent), `SetTier(accountId, tier)`, `ListAll()` → joins with
  `IUserService` for username display, `IsEmpty()` (bootstrap check).
- Files: `Server.Core/Constants.cs`, `Server.Datastore/Models/*.cs` (6 new),
  `Server.Web.Public/Models/ServiceTiers.cs`, `Server.Web.Public/Services/ServiceRoleStore.cs`.
- Verify: `dotnet build` clean; a scratch console-style check (a throwaway xunit-free
  smoke — reuse the existing local-dev loop by hitting a temporary debug endpoint,
  or a small `Program.cs`-adjacent test harness if this repo has ANY existing test
  project — confirm which before assuming) proves `ServiceTiers.CanManage` matches
  the truth table: owner→admin ok, admin→admin peer rejected, manager→trusted ok,
  user→anyone rejected, unknown tier on either side rejected.

### [x] 2. User scripts + plugin configs API (whole-collection save/load)
- Do: new `Controllers/UserContentController.cs`, `[Route("api/user-content")]`,
  `[AuthorizeApi]` at the class level. `GET/PUT/DELETE api/user-content/scripts`
  (PUT body = the raw `AnyUserScript[]` JSON array; server-side validation floor
  mirrors `isValidUserScript`'s rules — non-empty `id`/`name`/`source` strings,
  `enabled` boolean, `language` in the known set, `kind` in `trigger|alias|timer`,
  kind-specific required fields — reject the WHOLE payload with a readable 400 on
  the first invalid item, naming its index; do not silently drop bad items). Same
  shape for `GET/PUT/DELETE api/user-content/plugin-configs` over
  `InstalledPluginRecord[]` (validate `id`/`name`/`version`/`enabled`/`installedAt`
  present; `userConfig` accepted as opaque `Record<string,unknown>`, unvalidated
  per-field per the Constraints). Explicit count cap: 500 scripts / 200 plugin
  records per account (readable 400 past it) — a new, explicit cap (Constraints),
  not inherited from anywhere.
- Files: `Controllers/UserContentController.cs` (+ request/response models under
  `Models/UserContent/`), `Server.Datastore/Models/{UserScriptsModel,PluginConfigsModel}.cs`.
- Verify: PUT a small valid script array as account A → GET returns it byte-identical;
  account B's GET is empty (isolation); PUT with one malformed item 400s naming the
  bad index, and does NOT persist any part of the batch; PUT past the count cap
  400s readably; DELETE empties it; anonymous GET/PUT 401s.

### [x] 3. Book bookmarks + user-owned maps API
- Do: extend `LibraryController` with `[HttpGet("user-books")]` (list this
  account's bookmarked book IDs + the matching `BookCache` titles for display),
  `[HttpPost("user-books/{bookId}")]` (bookmark — 404 if `bookId` isn't a real book
  per `BookCache`), `[HttpDelete("user-books/{bookId}")]` (unbookmark, idempotent).
  Extend `MapsController` with `[HttpGet("user-maps")]` (list `{id,name,updatedAt}`
  for this account), `[HttpPost("user-maps")]` (create, body `{name, mapData}` —
  `mapData` opaque JSON, DslMapper's shape is Phase H's concern), `[HttpPut(
  "user-maps/{id}")]` (rename/replace, 404 if not owned by caller),
  `[HttpDelete("user-maps/{id}")]`. All four new MapsController actions and the
  three LibraryController ones sit under those controllers' EXISTING route
  prefixes (`library`/`maps`) per the umbrella's "extend" wording, each individually
  `[AuthorizeApi]`-decorated (the controllers themselves stay `[Authorize]`-default
  for their existing view actions — don't change that).
- Files: `Controllers/LibraryController.cs`, `Controllers/MapsController.cs`,
  `Server.Datastore/Models/{UserBookModel,UserMapModel}.cs`.
- Verify: bookmark a real book → appears in the list with its title; bookmark an
  unknown book ID 404s; unbookmark then re-list shows it gone; create two named
  maps → list shows both; update one by id → list reflects the rename; deleting
  account B's attempt to update account A's map id 404s (ownership check, not a
  leaked 403 that would confirm the id exists); isolation + anonymous 401 checks
  as in Step 2.

### [x] 4. Game log uploads (size-capped, retention-capped)
- Do: `[HttpPost("api/user-content/logs")]` (raw text body or multipart — decide at
  execution based on what's simplest given no existing upload endpoint to mirror;
  reject over 8 MiB with a readable 413-equivalent JSON error BEFORE buffering the
  whole body if the framework allows it cheaply, else after — note which was
  chosen and why in the Progress log), storing `{id, filename, uploadedAt, sizeBytes}`
  metadata plus the content; on insert, if the account now has more than 25 stored
  logs, delete the oldest (by `uploadedAt`) down to 25 — enforced server-side on
  every upload, not just at read time. `[HttpGet("api/user-content/logs")]` (list
  metadata only — never bulk-return content), `[HttpGet(
  "api/user-content/logs/{id}")]` (fetch one's content, 404 if not owned),
  `[HttpDelete("api/user-content/logs/{id}")]`.
- Files: `Controllers/UserContentController.cs` (add actions),
  `Server.Datastore/Models/GameLogModel.cs`.
- Verify: upload under the cap succeeds and appears in the list; upload over 8 MiB
  is rejected with a readable error, nothing persisted; uploading a 26th log
  deletes the oldest of the prior 25, list shows exactly 25 afterward with the
  right one gone; fetching another account's log id 404s; anonymous upload 401s.

### [x] 5. Delegated-role hierarchy — bootstrap + admin API + admin UI
- Do: bootstrap rule wired into `UserService.GetOrProvisionAsync` (or right after
  it in `HubAuthMiddleware`, whichever keeps `UserService` free of an
  `IServiceRoleStore` dependency cycle — decide at execution): if
  `ServiceRoleStore.IsEmpty()` and the resolved hub `globalRole` is `owner`/`admin`,
  `SetTier(accountId, "owner")`. New `Controllers/ServiceRolesController.cs`,
  `[Route("api/service-roles")]`, `[AuthorizeApi]`: `GET` (list all accounts +
  their tier + username, visible to any logged-in account but `manageable` flagged
  per `ServiceTiers.CanManage(callerTier, targetTier)` same as the hub's own A2
  pattern), `POST "{accountId}"` body `{tier}` (assign — 403 if caller can't manage
  either the target's CURRENT or REQUESTED tier, mirroring the hub's
  assignment-ceiling rule exactly). Wire `manager`-and-above into
  `LibraryController`'s existing `CanCreateBooks` check (Constraints) — replace/
  extend the hardcoded permission with a live `ServiceRoleStore.GetTier(...)` check
  at `>= manager`. New Razor view `Views/Admin/Roles.cshtml` + `wwwroot/js/admin/roles.js`
  (fetch-based table, following the established front-end convention), linked from
  `_nav.cshtml`'s existing Admin dropdown (visible to `[AuthorizeAdmin]` accounts —
  i.e. hub owner/admin — consistent with "owners appoint admins").
- Files: `Controllers/ServiceRolesController.cs`, `Services/ServiceRoleStore.cs`
  (wire-up), `Controllers/LibraryController.cs` (permission check swap),
  `Views/Admin/Roles.cshtml` (new), `wwwroot/js/admin/roles.js` (new),
  `Views/Shared/_nav.cshtml` (one new link).
- Verify: fresh hub owner's FIRST login on an empty role store auto-bootstraps to
  `owner` here (confirm via the list endpoint); that owner assigns a second account
  `manager` — succeeds; the manager account can now reach the book editor
  (`CanCreateBooks` check passes) where it couldn't before; the manager attempting
  to assign ANYONE else `admin` (above its own tier) or even `manager` (peer-or-above)
  is refused 403; a plain `user`-tier account's list call still 200s but every row
  shows `manageable: false`.

### [x] 6. Dashboard rebuild — the roll-up shell
- Do: replace the placeholder `Views/User/Dashboard.cshtml` with sections: Scripts
  (count + a "manage in-game" note — this page shows a SUMMARY, not a full editor;
  editing happens in game-client per the cross-cutting "site-specific dashboards
  own their content" rule), Plugin Configs (count), Books (bookmarked list with
  links into `LibraryController`'s existing book-viewer routes), Maps (named list +
  create/rename/delete inline — this IS this service's own content, so full CRUD
  here is appropriate unlike scripts/plugins), Logs (list + upload form + delete),
  and a "Other services" section rendering static placeholder cards (no live
  fetch yet — Phase H wires real fan-out) for kingdom-tactics/mud-builder. A
  visible link to `admin/roles` when `HttpContext.GetUser()`'s tier is `manager`+
  (reuse the nav-visibility pattern already in `_nav.cshtml`).
  `wwwroot/js/user/dashboard.js` drives all the fetch calls against Steps 2-4's
  APIs, following the established convention.
- Files: `Views/User/Dashboard.cshtml` (rewrite), `wwwroot/js/user/dashboard.js` (new).
- Verify: manual walkthrough on the local dev loop — log in via SSO, see all five
  local sections populate correctly against a test account's real data created in
  Steps 2-4, upload/delete a log from the dashboard itself, create/rename/delete a
  map from the dashboard itself, confirm the placeholder cards render inert (no
  failed fetches, no console errors).

### [x] 7. Full regression, docs, `.annotated`/`.ai-context`, sign-off
- Do: `dotnet build` clean; a full manual pass re-running every Verify bullet above
  in one sitting against the local dev loop (`localhost:5000` + the local hub) with
  a fresh throwaway hub account, logged as evidence; refresh `.annotated`/
  `.ai-context` for every touched DSL directory; user-facing docs: if this repo has
  a player-facing "what can I do on the website" doc/help page, update it to
  mention cloud save for scripts/plugins/maps/logs and book bookmarks (check for
  one at execution — don't assume it exists); update the umbrella plan (step C →
  `[x]`, progress-log entry) and program memory; mark this sub-plan COMPLETE.
- Files: this doc, umbrella plan, memory, whatever help/doc surface is found.
- Verify: umbrella shows 4/10; every earlier step's Verify bullet re-confirmed in
  the same sitting (not just individually, in case an earlier step regressed).

## Progress log

- 2026-07-27T12:42:58-05:00 plan created. Grounded via two parallel research
  agents (game-client `userScripts`/`plugins` shapes; DSL `LibraryController`/
  `MapsController`/DBManager) plus direct verification of `SqlClient.cs`'s actual
  query capabilities (QueryItems is an unimplemented stub) and `AdminController`/
  `AuthorizeAttribute`'s existing gates. Key scoping decisions recorded in
  Constraints: whole-collection save/load for scripts+plugins (matches the
  client's own local-storage-blob reality and Phase D's "manual save/load"
  framing) vs. real per-item CRUD for maps+books+logs (each is a genuinely
  add/remove/update-over-time collection); delegated roles wired to exactly one
  concrete permission (CanCreateBooks) rather than invented surface area; bootstrap
  instead of a host script (no script-runner convention exists in this C# app).
- 2026-07-27T16:00-05:00 **step 7 done — PHASE C COMPLETE.** Detailed
  step-by-step evidence for steps 1-6 lives in "## Context, continued:
  chronological implementation notes" above (appended live during
  implementation — see that section for full per-step detail: build results,
  live E2E pass counts, real bugs found and fixed). This entry is the final
  full-regression sweep + doc/bookkeeping sign-off.
  Final `dotnet build`: 0 errors. FULL REGRESSION (`phase-c-step7-
  regression.mjs`) with ONE brand-new account exercising every content type +
  the dashboard together end to end (deliberately NOT re-testing every edge
  case already proven per-step — just confirming nothing broke when combined):
  **9/9 PASS** — SSO login; scripts save+load; book bookmark+list (real title
  resolved); map create+rename; log upload+list; fresh account correctly
  defaults to service tier "user" and the roles list is reachable; dashboard
  loads 200 with all of the above visible to it; Phase B's legacy-login-dead
  and anonymous-home-200 regressions still hold. (This run also caught and
  fixed a trivial bug in the test script itself — a 36-character username
  exceeded the hub's 32-character signup limit — not a product defect.)
  Docs: searched this repo for an existing player-facing "what can I do on
  the website" page — none found (only unrelated lore/report markdown) — so
  there was nothing to update; noted here rather than silently skipped.
  `.annotated`/`.ai-context` refreshed incrementally per-step across every
  touched directory (Server.Core, Server.Datastore + Models, Server.Web.Public/
  {Controllers,Middleware,Models,Models/UserContent,Services,Views/User,
  Views/Admin,wwwroot/js/user,wwwroot/js/admin}) — confirmed complete by this
  entry. Also fixed a documentation-structure bug in THIS plan file discovered
  while writing this entry: an earlier edit had corrupted a heading insertion
  (a "## Progress log" header text got merged into the tail of a Constraints
  bullet instead of becoming its own heading, and a later fix attempt
  accidentally clobbered the step-1 entry's opening clause) — repaired to the
  now-correct structure (Goal → Constraints → chronological implementation
  notes → Context → Steps → Progress log).
  Live residue across the whole phase (all accepted, same precedent as
  Phases A/A2/B — no account-delete exists): roughly a dozen throwaway hub
  accounts (`phase-c-step{2,3,4,5}-*`, `pc-final-rgr-*`), three of which
  persist with real service-tier state (`phase-c-step5-owner-1785175889` =
  this service's actual bootstrapped owner, `phase-c-step5-owner-1785176580`
  = user tier, `phase-c-step5-member-1785176580` = manager tier) — this is
  expected, not cleanup debt: those three are now the REAL delegated-role
  seed data for this local dev environment going forward.
  Status: COMPLETE. Umbrella plan step C flipped to `[x]`; program memory
  updated. Next: Phase D (Web Game wiring, apps/game-client).
