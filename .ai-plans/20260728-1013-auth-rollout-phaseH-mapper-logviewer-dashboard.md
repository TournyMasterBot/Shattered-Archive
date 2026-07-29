# Plan: Auth rollout Phase H — Mapper + LogViewer SSO, then the central dashboard roll-up

Created: 2026-07-28T10:13-05:00 · Workspace: C:\Projects\ShatteredArchive (+ C:\Projects\DSL,
C:\Projects\DslMapper, C:\Projects\DslLogViewer) · Status: ACTIVE
Task: Umbrella step H of `.ai-plans/20260726-1953-centralized-auth-rollout-all-services.md`
(program now 7/10; this is the next unstarted step, user-selected 2026-07-28).

## Goal

DslMapper and DslLogViewer — today two fully local, backend-less SPAs — gain optional SSO
login and cloud save/load against the DSL C# service's ALREADY-BUILT Phase C content APIs
(`maps/user-maps`, `api/user-content/logs`), staying 100% usable logged-out exactly as today
(anonymous-first). The C# dashboard's two "coming soon" placeholder cards (Kingdom Tactics,
MUD Builder — left there deliberately in Phase C step 6) become real, via the on-behalf-of
exchange Phase A already built end-to-end but has had no consumer until now. Done when: a map
saved in DslMapper and a log uploaded in DslLogViewer both round-trip through the cloud and
appear on the C# dashboard as their own local sections (already true for Maps/Logs, this
phase just adds mapper/logviewer AS cloud clients of those existing sections); the dashboard's
KT/MUD-Builder cards show real counts with working link-outs, or degrade cleanly if a service
is down.

## Constraints

- **Anonymous-first, unconditionally.** Neither SPA gains a login WALL. Every existing local
  feature (autosave, JSON import/export, ASCII/SVG export in DslMapper; JSONL/paste playback
  in DslLogViewer) works byte-identically logged out. Login only unlocks an ADDITIONAL cloud
  panel.
- **Public clients, no service key in either bundle** (key-custody constraint, same as
  game-client/Phase D). Both SPAs' SSO code exchange runs server-side in the DSL C# backend
  (`shattered-web`'s registered service key), never client-side. The SPA receives only its own
  user-scoped bearer token, via the same `#auth_token=...&expires_at=...` URL-fragment
  hand-off game-client already uses (never a query param, never logged server-side).
- **Don't touch the working `game-sso/*` flow.** `UserController.cs`'s `GameSsoStart`/
  `GameSsoCallback` + `GameSsoOptions` are live and game-client depends on them today. Add a
  NEW, generalized mechanism for mapper+logviewer rather than editing or generalizing the
  existing one in place — zero regression surface on game-client from this phase.
  Duplicating the ~60-line cookie/state/exchange/redirect flow a 2nd and 3rd time verbatim
  (one `*SsoOptions` class + one pair of controller actions per consumer) was the OTHER option
  considered; a single `SiteSsoOptions` dictionary keyed by client id (`mapper`, `logviewer`)
  plus one shared pair of parameterized routes is the better trade at 2 new consumers — write
  it that way, but this is an implementation judgment call, not a hard requirement.
- **On-behalf-of exchange is ALREADY BUILT — this phase only calls it.** `POST
  /api/token-exchange` with `{grantType:'on_behalf_of', token, targetService}` (Node side,
  `apps/auth-server/src/routes/token-exchange.ts`) and `AuthHubClient.ExchangeOnBehalfOfAsync`
  (C# side, `Server.Web.Public/Services/AuthHub/AuthHubClient.cs:66,134`) both already exist
  and are untested-by-real-use since Phase A. Do not re-design or re-implement either; the
  dashboard fan-out step is literally their first caller. Mints a 2-minute token scoped to
  ONE target service, bound to the same user — never raw token forwarding.
- **DslMapper and DslLogViewer are standalone repos with their OWN tooling, not this
  workspace's pnpm convention.** Both use plain `npm` (committed `package-lock.json`, no
  `pnpm-workspace.yaml` membership) and have **no test framework at all** (`package.json`
  scripts are `dev`/`build`/`lint`/`preview` only — no `test` script, no Jest/Vitest
  dependency). Do not introduce pnpm or a new test framework as a side effect of this phase.
  "Regression" in these two repos means clean `tsc -b && vite build` + a live manual smoke
  test, not a unit-test run — a genuine, documented difference from every prior phase in this
  program.
- **Production nginx/CORS-origin/redirect-URI wiring is explicitly Phase I's job**, not this
  phase's (`.ai-plans/20260726-1953-...md` step I: "nginx vhost + CORS-origin + SSO-redirect-
  URI updates across BOTH constellation TLDs... as one sweep"). This phase writes
  CONFIG-DRIVEN code (appsettings keys, `Cors:AllowedOrigins` entries, `SiteSsoOptions`
  entries) with real dev-localhost values so local E2E works end-to-end; it does not touch
  live nginx or mint real production hostnames/certs. Neither DslMapper nor DslLogViewer has
  any Docker/nginx artifact today for a production hostname to even reference yet (confirmed:
  DslMapper has none; DslLogViewer has a generic `server_name _;` with no baked-in hostname)
  — that's squarely Phase I territory.
- **Summary-endpoint convention** (per the umbrella doc's own wording): `GET
  /api/user-content/summary`, caller's bearer token introspected normally (an OBO token
  introspects identically to an SSO/API token — same `mintExchangeToken` path, just a
  shorter TTL and a different `kind`), returns counts/titles/updated-at + a link-out URL.
  Same route name on both kingdom-tactics-server and mud-builder-server for a uniform C#-side
  caller.

## Context (grounded 2026-07-28, file:line — trust this, don't re-survey)

- **DSL C# backend (`shattered-web`, `C:\Projects\DSL\Server\Server.Web.Public`)**:
  - `UserController.cs:171-262` — the `game-sso/start`+`game-sso/callback` pattern to mirror:
    a `SsoStatePayload{State,ReturnUrl}` cookie (`Path` scoped to the flow's own sub-route),
    `IsAllowedReturnOrigin()` allowlist check before ANY redirect back to the SPA,
    `authHub.ExchangeAuthorizationCodeAsync(code, <this flow's own registered redirect_uri>)`,
    `userService.GetOrProvisionAsync(accountId, username, globalRole)`, then
    `Redirect($"{returnUrl}#auth_token=...&expires_at=...")`. On any failure, redirects to
    `{returnUrl}#auth_error=1` (only exception: an invalid/missing returnUrl itself, which
    can't safely redirect anywhere and 400s instead).
  - `GameSsoOptions.cs` — the per-consumer options shape (`CallbackRedirectUri`,
    `AllowedReturnOrigins`) to generalize into a dictionary-keyed `SiteSsoOptions`.
  - `Services/AuthHub/AuthHubClient.cs:56-165` — `IAuthHubClient` already declares
    `ExchangeOnBehalfOfAsync(token, targetService)` (`:66`, implemented `:134-`, posts
    `{grantType:"on_behalf_of",token,targetService}` to auth-server's token-exchange
    endpoint with its own service assertion, `:165` `ServiceAssertion.Sign(...)`). Nothing to
    build here — call it.
  - `Controllers/MapsController.cs` (Phase C step 3) — full CRUD already live:
    `GET/POST maps/user-maps`, `PUT maps/user-maps/{id}` (rename/replace), `DELETE
    maps/user-maps/{id}`, keyed `"{accountId}#{mapId}"` (cross-account 404s naturally, not
    403 — no ownership leak).
  - Logs API (Phase C step 4, `Controllers/UserContentController.cs` or sibling) — `POST
    api/user-content/logs?filename=x` (raw body, NOT multipart), `GET .../logs` (metadata
    only), `GET .../logs/{id}` (content), `DELETE .../logs/{id}`. 8 MiB hard cap (fails
    BEFORE buffering past it even on chunked/no-Content-Length uploads), 25-per-account
    retention (oldest evicted on the 26th upload).
  - `Views/User/Dashboard.cshtml` + `wwwroot/js/user/dashboard.js` (Phase C step 6) — jQuery
    AJAX is the ONLY JS convention anywhere in this app (zero `fetch()` calls exist outside
    it) — new dashboard JS must match. Two static "coming soon" placeholder cards already
    exist for Kingdom Tactics / MUD Builder, explicitly left for this phase.
  - `appsettings.json:5` `AuthHub:ServiceName = "shattered-web"`; `appsettings.json:11-13`
    `Cors:AllowedOrigins = ["https://game-client.shatteredarchive.dev"]` — needs two more dev
    entries (`http://localhost:8080`, `http://localhost:5900`) for this phase's local E2E;
    production entries are Phase I.
- **game-client's Phase D client idiom to port** (`apps/game-client/src/features/auth/`):
  `authTokenStore.ts` (localStorage get/set/clear/isExpired, one key), `authFragment.ts`
  (PURE fragment parser — `{kind:'token',token,expiresAt}|{kind:'error'}|{kind:'none'}` — kept
  free of any DOM/env import specifically so it's unit-testable; DslMapper/DslLogViewer have
  no test runner at all, so porting it pure is still good hygiene but won't itself be tested
  there), `gameSso.ts` (`startLogin()` = whole-page `window.location.href` navigation to the
  site's start URL — a real top-level nav, not a fetch, so it's never subject to CORS),
  `siteApi.ts` (`SITE_ORIGIN` absolute for navigation; `siteApiBase()` returns `/api/site` in
  dev (vite-proxied, same-origin, zero CORS) vs the real absolute origin in prod),
  `cloudSync.ts` (fetch wrappers; a 401 clears the stored token and reports `unauthenticated`
  rather than throwing).
  `apps/game-client/vite.config.ts:93-99` — the dev-proxy idiom: `'/api/site': { target:
  siteApiTarget, changeOrigin:true, rewrite:(p)=>p.replace(/^\/api\/site/,'') }`.
- **DslMapper** (`C:\Projects\DslMapper\game-mapping`, dev port 8080, HashRouter, npm):
  exactly ONE live document today — `state/persist.ts` autosaves a single `MapDocV1` under
  one `localStorage` key; `PersistenceBar.tsx` additionally supports file Export/Import JSON
  (no multi-slot save exists anywhere yet). Cloud "named maps" is thus the FIRST multi-slot
  save/load UX in this app — each cloud save is just `state.doc` (the same `MapDocV1` JSON
  already used by file export) under a user-chosen name; loading a cloud map is the exact
  same `dispatch({type:'HYDRATE', doc})` the file-import path already uses
  (`PersistenceBar.tsx:66-67`).
- **DslLogViewer** (`C:\Projects\DslLogViewer\dsl-log-viewer`, dev port 5900, tab-based
  App.tsx, npm): `LogPlayback.tsx` already has a "Load URL" feature (`urlInput`/`urlLoading`/
  `loadFromUrl()`, `:925-936`) but it's a bare unauthenticated `fetch(url)` — can't carry a
  bearer header, so "reopen a cloud log" needs its own authenticated fetch (via a new
  `cloudLogs.ts`) feeding the SAME text-parsing path the file `<input>` (`:925`, `onFile`)
  already uses, not a reuse of `loadFromUrl` itself.
- **kingdom-tactics-server** (`apps/kingdom-tactics-server/src/http/`): `kt-api-routes.ts`
  registers `/api/kt/*` (`app.use('/api/kt', express.json(...))`, `requireAccount(guard)`
  pattern from `auth-guard.ts` — 401 with no anonymous fallback, unlike the WS join path).
  `persistence/army-layout-store.ts` (100-army cap) + `match-history-store.ts` (25-entry cap)
  are the two content stores to summarize.
- **mud-builder-server** (`apps/mud-builder-server/src/routes/`): `snippets.ts` is the
  precedent for a `kind==='account'`-only route (master/local-key actors 403, not a silently
  empty list — lets the client tell "not for you" from "you have none yet"); `snippet-store.ts`
  is the one store to summarize (counts by kind: room/mob/object/script).
- **auth-client** (`apps/auth-client/src/features/keys/KeysPage.tsx:13`) —
  `KNOWN_SERVICES = ['mud-builder-server'] as const` is stale: missing `kingdom-tactics-server`
  (registered since Phase F) and `shattered-web` (registered since Phase B/C). Umbrella step H
  explicitly calls this out ("Extend auth-client KNOWN_SERVICES with every service registered
  by now").

## Steps

### [ ] 1. DSL C# backend: generalized external-SSO proxy + dev CORS entries
- Do: new `Models/SiteSsoOptions.cs` — a dictionary keyed by client id (`mapper`,
  `logviewer`) → `{CallbackRedirectUri, AllowedReturnOrigins}`, bound from a new
  `SiteSso:Clients` appsettings section (mirrors `GameSsoOptions`'s shape per-entry). New
  actions on `UserController.cs` (or a new small `SiteSsoController.cs` if that reads
  cleaner given the existing controller's size): `GET user/site-sso/{client}/start` and
  `GET user/site-sso/{client}/callback`, structurally identical to `GameSsoStart`/
  `GameSsoCallback` (own state cookie name scoped by client id e.g. `site-sso-state-mapper`,
  same `IsAllowedReturnOrigin`/error-fragment/`#auth_token=...` contract) but reading from
  `SiteSsoOptions.Clients[client]` instead of a single hardcoded options instance; unknown
  `client` id 404s before touching cookies. Does NOT modify `GameSsoStart`/`GameSsoCallback`/
  `GameSsoOptions` at all. Add `http://localhost:8080` and `http://localhost:5900` to
  `Cors:AllowedOrigins` (dev only) and register both clients' dev redirect URIs/origins in
  `appsettings.Development.json` (or the existing dev-settings file — check which one
  `GameSsoOptions` is actually populated from before adding a new file).
- Files: `Server.Web.Public/Models/SiteSsoOptions.cs` (new), `Server.Web.Public/
  Controllers/UserController.cs` or new `SiteSsoController.cs`, `Server.Web.Public/
  appsettings.json`, `Server.Web.Public/appsettings.Development.json` (or wherever
  `GameSsoOptions` values actually live — verify first), `Program.cs` (options binding +
  DI registration).
- Verify: a scratch redirect_uri round-trip per client id (start → hub login → callback →
  `#auth_token=...` lands on `returnUrl`) works locally for both `mapper` and `logviewer`
  client ids; an unregistered client id 404s at `start`; a `returnUrl` origin not in that
  client's `AllowedReturnOrigins` 400s before any cookie is set; `game-sso/*` behavior is
  byte-identical to before this step (regression check — game-client still logs in).

### [ ] 2. Summary endpoints: kingdom-tactics-server + mud-builder-server
- Do: `GET /api/user-content/summary` on both services, each gated by that service's own
  existing account guard (`requireAccount` on kt-server; the `kind==='account'`-only pattern
  from `snippets.ts` on mud-builder-server — 403 for master/local-key actors, not an empty
  body). kt-server's response: `{armyCount, matchCount, lastMatchAt, linkOutUrl}` (armies
  from `ArmyLayoutStore.list`, matches from `MatchHistoryStore.listSummaries`, `linkOutUrl`
  pointing at kt-client's own origin). mud-builder-server's response: `{snippetCount,
  byKind:{room,mob,object,script}, linkOutUrl}` (from `SnippetStore`). Route name matches
  exactly on both for a uniform C# caller.
- Files: `apps/kingdom-tactics-server/src/http/kt-api-routes.ts` (or a small new sibling
  file if `kt-api-routes.ts` is getting crowded — check current length first),
  `kt-api-routes.test.ts`; `apps/mud-builder-server/src/routes/summary.ts` (new, small)
  + `summary.test.ts`, wired in `app.ts`.
- Verify: `pnpm --filter kingdom-tactics-server test`, `pnpm --filter mud-builder-server
  test` — isolation (two accounts see their own counts only), anonymous 401, an OBO-minted
  token (mint one via a scratch on-behalf-of exchange call against local auth-server) is
  accepted identically to a normal SSO token — proves the "OBO introspects like any other
  token" Constraint is actually true, not just asserted.

### [ ] 3. DslMapper client: SSO login + cloud named-maps save/load
- Do: new `src/features/auth/` folder porting game-client's Phase D idiom (`authTokenStore.ts`,
  `authFragment.ts`, `siteSso.ts` — `startLogin()` → `user/site-sso/mapper/start`,
  `siteApi.ts`-equivalent with `/api/site` dev proxy, `cloudMaps.ts` wrapping
  `maps/user-maps` CRUD). Vite dev-proxy entry added mirroring game-client's
  `vite.config.ts:93-99` exactly (`/api/site` → the local C# dev server, prefix-rewritten).
  UI: a login/logout control + "Cloud Maps" panel in `PersistenceBar.tsx` (or a small new
  sibling component it renders) — save current `state.doc` as a named cloud map (uses the
  SAME doc object `onExportJson`/`onSnapshot` already read), list/load/rename/delete;
  loading dispatches `{type:'HYDRATE', doc}` exactly like file-import does today. Logged-out
  behavior (autosave, export/import, ASCII/SVG) is completely unchanged — cloud panel simply
  doesn't render, or renders a "log in to save to cloud" prompt.
- Files: `game-mapping/src/features/auth/*.ts` (new), `game-mapping/src/components/
  PersistenceBar.tsx` (or new `CloudMapsPanel.tsx`), `game-mapping/vite.config.ts`.
- Verify: `npm run build` (`tsc -b && vite build`) clean; live manual smoke — log in, save
  the current map under a name, reload the page (token persists via localStorage), load it
  back, confirm the room/exit data round-trips byte-identical; log out, confirm every local
  feature (autosave/export/import/ASCII/SVG) still works with zero cloud UI visible or
  gracefully disabled.

### [ ] 4. DslLogViewer client: SSO login + cloud log upload/list/reopen
- Do: same `src/features/auth/` port as Step 3, pointed at `user/site-sso/logviewer/start`
  and `api/user-content/logs`. New `cloudLogs.ts`: `uploadCurrent(text, filename)` (raw-body
  POST, mirrors the C# endpoint's `?filename=` contract), `list()` (metadata only, never
  bulk content — matches the API's own design), `fetchContent(id)` (authenticated GET,
  bearer header — this is the piece `LogPlayback.tsx`'s existing unauthenticated
  `loadFromUrl()` CANNOT do), `remove(id)`. UI: a login/logout control + "Cloud Logs" panel
  — likely at the `App.tsx` tab-bar level (shared across both JSONL Playback and Paste/Text
  Log tabs, since either could produce "the current log text" to upload) rather than
  duplicated per-tab; "reopen" feeds fetched text into whichever tab's existing internal
  text-to-entries path already handles the file `<input>` (`onFile`, `LogPlayback.tsx:925`).
  Fully usable logged-out, unchanged.
- Files: `dsl-log-viewer/src/features/auth/*.ts` (new), `dsl-log-viewer/src/App.tsx`,
  `dsl-log-viewer/src/components/LogPlayback.tsx` (wire the reopen-from-cloud path into
  its existing entries-loading function — read it first to find that function's actual
  name/signature), `dsl-log-viewer/vite.config.ts` (new dev proxy entry, port 5900 app
  proxying to the C# dev server).
- Verify: `npm run build` clean; live manual smoke — log in, upload the currently-loaded
  log, list shows it with correct metadata, reopen renders identical playback/paste output
  to the original, delete removes it from the list; an 8 MiB+ upload attempt surfaces the
  C# API's existing 413 as a readable error, not a silent failure; logged-out behavior
  unchanged.

### [ ] 5. C# dashboard roll-up: real KT/MUD-Builder fan-out cards + auth-client fix
- Do: replace the two static "coming soon" cards in `Views/User/Dashboard.cshtml` with real
  ones. New server-side helper (or inline in the dashboard's controller action) calling
  `authHub.ExchangeOnBehalfOfAsync(<the user's shattered-web-scoped token>, "kingdom-tactics-
  server")` then an HTTP GET to that service's `/api/user-content/summary` with the returned
  OBO token as Bearer — same for `"mud-builder-server"`. Both calls run with a bounded
  timeout; a timeout, network failure, or non-2xx renders that ONE card in a degraded state
  ("temporarily unavailable") without breaking the rest of the dashboard (per the umbrella
  doc's own Verify criterion) — do not let one down service 500 the whole page.
  `wwwroot/js/user/dashboard.js` (or server-rendered, matching however Maps/Logs sections
  are currently rendered — check that before choosing client vs server rendering for
  consistency) wires the card contents + link-out buttons.
  Also: fix `apps/auth-client/src/features/keys/KeysPage.tsx:13` — `KNOWN_SERVICES =
  ['mud-builder-server', 'kingdom-tactics-server', 'shattered-web'] as const`.
- Files: `Server.Web.Public/Views/User/Dashboard.cshtml`, `Server.Web.Public/Controllers/
  UserController.cs` (or a new small controller/service for the fan-out calls), `wwwroot/js/
  user/dashboard.js`; `apps/auth-client/src/features/keys/KeysPage.tsx`,
  `KeysPage.test.tsx` if one exists (update the options-list assertion).
- Verify: live — a real account with an army saved in kingdom-tactics-client and a snippet
  saved in mud-builder shows correct non-zero counts + a working link-out on each card;
  stopping one target service locally shows that card degraded while the other stays live
  and the rest of the dashboard (Maps/Logs/Scripts/Books) is unaffected; `pnpm --filter
  auth-client test` passes with the extended `KNOWN_SERVICES`.

### [ ] 6. Full regression, docs, `.annotated`/`.ai-context`, close-out
- Do: `pnpm --filter kingdom-tactics-server test`, `pnpm --filter mud-builder-server test`,
  `pnpm --filter auth-client test` (full, not just touched files); `tsc --noEmit` where
  applicable; DSL repo's own build/test convention (check `docs/` or `.github` for it — a
  C# `dotnet build`/`dotnet test` at minimum); `npm run build` in both DslMapper and
  DslLogViewer. Live E2E across all 5 repos: SSO login on DslMapper AND DslLogViewer against
  local dev instances, a save/upload on each, dashboard fan-out cards showing real data.
  Update `docs/auth-server.md`'s consumer table (add `shattered-web`'s two new SSO clients,
  or note they're sub-clients of the existing `shattered-web` registration — clarify which),
  DSL's own docs if a consumer table exists there, DslMapper/DslLogViewer READMEs (both
  currently describe a purely-local tool — note the new optional cloud feature). Refresh
  `.annotated`/`@ai-` headers in every touched directory across all repos (per this
  repository's own convention — DslMapper/DslLogViewer may not have this convention at all;
  don't invent it there if absent, just update their READMEs). Mark this doc `Status:
  COMPLETE`; append the umbrella doc's Phase H checkbox `[x]` + a progress-log entry noting
  "Next: I" (program close-out) as the only remaining step; update
  `mud-builder-project.md`/`kt`-equivalent memory files if any exist for these newly-touched
  repos, and `MEMORY.md`'s index.
- Verify: everything above green; a fresh read of the umbrella doc shows 8/10 checked with
  only Step I unchecked.

## Verification (whole phase)
- Every touched ShatteredArchive-workspace package's own test suite green
  (kingdom-tactics-server, mud-builder-server, auth-client).
- `tsc -b && vite build` clean in both DslMapper and DslLogViewer (no test suite exists in
  either — documented Constraint, not an oversight).
- DSL repo's C# build clean (exact command TBD at Step 6 — verify its actual convention
  first rather than assuming `dotnet build` flags).
- Live smoke: a real (or scratch) hub account logs into DslMapper, saves a named map, reloads,
  loads it back byte-identical; logs into DslLogViewer, uploads the active log, reopens it
  identically; the C# dashboard shows correct Kingdom Tactics + MUD Builder card counts with
  working link-outs, and degrades cleanly (not a broken page) if one target service is
  stopped; `game-sso/*` (game-client's existing flow) still works, unmodified by this phase.

## Progress log
- 2026-07-28T10:13-05:00 plan created (Claude), Status ACTIVE, unstarted. Grounding this
  session: on-behalf-of exchange contract re-read from `token-exchange.ts` (already fully
  built in Phase A, zero server-side auth-server work needed this phase); DSL C# backend's
  `game-sso` proxy pattern read in full (`UserController.cs:171-262`,
  `GameSsoOptions.cs`) as the template to generalize, NOT modify in place;
  `AuthHubClient.ExchangeOnBehalfOfAsync` confirmed already implemented
  (`AuthHubClient.cs:66,134-165`) — the dashboard fan-out step is literally its first real
  caller; Phase C's sub-plan progress log re-read for exact Maps/Logs endpoint contracts
  (`maps/user-maps[/{id}]` full CRUD; `api/user-content/logs` upload/list/get/delete, 8MiB
  cap, 25-item retention) and confirmation the dashboard's KT/MUD-Builder cards are
  deliberately-placeholder today; kingdom-tactics-server's `kt-api-routes.ts`/`auth-guard.ts`
  and mud-builder-server's `snippets.ts` guard idioms read as the summary-endpoint template;
  DslMapper (`game-mapping/`, port 8080, HashRouter, npm, single-doc `MapDocV1` autosave, no
  test runner) and DslLogViewer (`dsl-log-viewer/`, port 5900, npm, unauthenticated
  `loadFromUrl` already present but insufficient for cloud reopen, no test runner) surveyed
  directly — both are real, working, backend-less SPAs, not scaffolds. auth-client's
  `KNOWN_SERVICES` confirmed stale (`KeysPage.tsx:13`, missing `kingdom-tactics-server` +
  `shattered-web`). game-client's Phase D `features/auth/` idiom (authTokenStore/
  authFragment/gameSso/siteApi/cloudSync + the `/api/site` vite dev-proxy rewrite) identified
  as the exact pattern to port into both new SPAs.
