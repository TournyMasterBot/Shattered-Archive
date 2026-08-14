# Plan: Soulsteel — central-auth sign-in, per-account archive, C# dashboard reload

Created: 2026-08-13T19:12:00-05:00 · Workspace: /workspace/shattered-archive · Status: ACTIVE
Task: Let a signed-in Herald archive a finished/in-progress Soulsteel game to their central
account, and reopen that archive later — including from the C# "shattered archive" user
dashboard, and even after the room's local IndexedDB record and the live room itself are long
gone.

> **Depends on** `20260813-1911-soulsteel-herald-tool-mvp.md` shipping first (client/server
> scaffold, domain model, deploy wiring). Don't start this until that plan's Step 7 has verified
> the base app end-to-end — every step below extends things that plan creates.

## Goal

From an open Soulsteel room, a signed-in Herald can click "Archive this game," which snapshots the
current `RoomState` (players, roles, full timeline, settings) to their account on
`soulsteel-server`. Later — on a different device, or after the original room's IndexedDB record
is gone — they can either reopen it from Soulsteel's own "My Archives" list, or from the central
C# user-content dashboard (`shatteredarchive.com`'s account area), where clicking an archived
entry deep-links back into Soulsteel and rehydrates the original room state read-only. Reached
when: sign-in works end-to-end (soulsteel-client → auth.shatteredarchive.dev → back), an archived
room round-trips byte-identical through `soulsteel-server`, and the C# dashboard lists and can
open a Soulsteel archive that no longer exists anywhere else.

## Constraints

- **Skip mud-builder's local-API-key/master-key actor system.** `mud-builder-server`'s
  `AuthStore`/`BuilderActor` (`kind: 'account'|'local-key'|'master'`) exists because that app has
  real local-automation use cases (CI, scripts) alongside human accounts. Soulsteel has exactly one
  actor kind — a centrally-authenticated Herald — so mirror **kingdom-tactics-server's** simpler
  shape instead: `http/auth-guard.ts`'s `requireAccount(resolveAccountId)` + `@shatteredarchive/
  services-server`'s `introspect()` helper (used at `apps/kingdom-tactics-server/src/index.ts:64`),
  not mud-builder's heavier actor system.
- **Reuse the generic per-account-file store shape, don't reinvent it.** Two apps already have the
  identical "one JSON file per accountId, whole-collection read/replace" idiom:
  `apps/kingdom-tactics-server/src/persistence/json-account-store.ts` (the generic `JsonAccountStore<T>`)
  and `apps/mud-builder-server/src/snippet-store.ts` (a non-generic copy of the same shape, whose
  own header explains it's duplicated across the app boundary deliberately — same rationale
  `services-server/src/auth-tiers.ts` documents for itself). Soulsteel's archive store is a third
  copy of this same shape — duplicate it again for consistency with the existing convention rather
  than reaching for a cross-app import. (If a third near-identical copy starts to feel wrong, that's
  a legitimate future "promote to `services-server`" cleanup — not something to attempt inside this
  plan.)
- **An archived room is closer to a "log" than a "snippet."** It's a substantial, timestamped,
  point-in-time blob (not a small editable template), so on the C# side mirror
  `UserContentController.cs`'s `logs` endpoints shape (`POST` create, `GET` list-metadata-only,
  `GET /{id}` full content, `DELETE /{id}`, size cap + retention enforced on upload) rather than
  the `scripts`/`plugin-configs` whole-collection-PUT shape.
- **Archiving is explicit and Herald-initiated, never automatic.** No background sync of every
  keystroke to the server — the MVP plan's Constraint against server-side persistence still holds
  for the *live* room; only an explicit "Archive this game" action reaches the server. This keeps
  the account-linked footprint small and matches the user's framing ("no persistent storage beyond
  IndexedDB **at this time**" — this plan is the deliberate, later exception, and even then only
  for what the Herald chooses to save).
- **The C# dashboard integration is read/list/delete, not two-way sync.** The dashboard shows what
  was archived and links back into Soulsteel to view it; it does not edit archive content itself
  (matches how `LibraryController`/`MapsController`'s `user-books`/`user-maps` extensions in
  `.ai-plans/20260727-1243-auth-rollout-phaseC-csharp-user-content-dashboard.md` work — list +
  open, not embedded editing).
- **This whole plan is gated on the account actually being centrally-authenticated** — an
  anonymous Herald still gets full local (IndexedDB-only) functionality from the base plan; sign-in
  only unlocks the archive feature. Never make Soulsteel *require* an account to run a game.

## Context (verified 2026-08-13, file:line — MCP/qwen stack was down, read directly)

- **Server-side auth wiring to mirror**: `apps/kingdom-tactics-server/src/index.ts:7,30-34,48-78,119`
  — imports `introspect`/`matchesAudience`/`exchangeCode` from `@shatteredarchive/services-server`;
  reads `AUTH_SERVER_URL`/`SERVICE_PRIVATE_KEY_PATH` from env; `buildAccountIdResolver` wraps
  `introspect(authServerUrl, SERVICE_NAME, privateKeyPem, token)` in a try/catch that degrades to
  "no account" on any failure (network, expired token, etc.) rather than throwing.
  `apps/kingdom-tactics-server/src/http/auth-guard.ts` (`bearerToken`, `requireAccount`) is the
  Express middleware shape — a clean 401 on missing/invalid token for account-scoped routes (unlike
  the WS join path, which degrades to anonymous; archive routes have no anonymous meaning, so 401
  is right here too, per `auth-guard.ts:4-9`'s own comment).
- **Service registration**: `pnpm --filter @shatteredarchive/auth-server register-service
  soulsteel-server`, run against auth-server's live data dir, mints an Ed25519 keypair; the private
  half is git-ignored (`.gitignore`'s `shattered-service.key` pattern) and lands at
  `apps/soulsteel-server/secrets/shattered-service.key`, bind-mounted read-only into the container
  (mirrors `deploy/docker-compose.shattered-archive-experimental.yml:270-275,376-380` for
  mud-builder/KT). Rotation needs `revoke-service-key` on the old key id after the new one is live
  — same two-step as the existing services.
- **Per-account store to mirror**: `apps/kingdom-tactics-server/src/persistence/json-account-store.ts`
  (generic `JsonAccountStore<T>`, `<dataDir>/<subdir>/<accountId>.json`, safe-empty-on-missing-file,
  `VALID_ACCOUNT_ID` defense-in-depth on the filename) and
  `apps/mud-builder-server/src/routes/snippets.ts` (route shape: `requireAnyActor`-gated
  GET/PUT, 403 for a non-account actor, 400 on a malformed item naming the shape). Soulsteel's
  version needs list-metadata + get-by-id + delete (log-shaped, not whole-collection PUT — see
  Constraints), so route shape is closer to the C# `logs` endpoints (Context below) translated to
  Express: `POST /api/soulsteel/archives`, `GET /api/soulsteel/archives` (metadata only), `GET
  /api/soulsteel/archives/:id` (full `RoomState`), `DELETE /api/soulsteel/archives/:id`.
- **C# `logs` endpoints to mirror** (`C:/Projects/DSL/Server/Server.Web.Public/Controllers/
  UserContentController.cs:174-330`): `[HttpPost("logs")]` streams+size-caps the body (413 over
  cap), stores gzip-compressed via `DBManager.SaveData` keyed `Key = "{AccountId}#{id}"`, `SortKey
  = AccountId` (enables the `ScanItems` + `Where(r => r.SortKey == AccountId)` list pattern used by
  `[HttpGet("logs")]`); `[HttpGet("logs/{id}")]` decompresses and returns content;
  `[HttpDelete("logs/{id}")]` removes it; `EnforceLogRetention(AccountId)` runs after every upload
  to cap count. `Views/User/Dashboard.cshtml` is the existing dashboard view (confirmed to exist)
  where a new "Soulsteel Archives" section belongs, listing filename/size/uploadedAt-equivalents
  and linking out.
- **Central auth flow docs**: `docs/auth-server.md:242-313` ("SSO hand-off + token exchange") for
  the one-time sign-in redirect (`POST /api/sso/approve` → `POST /api/token-exchange`), and
  `docs/auth-server.md:351-560` ("Device-bound credentials") for the silent, no-prompt reauth a
  returning browser uses afterward — this second mechanism is what keeps the Herald signed in
  across sessions without re-doing the SSO redirect every time. `apps/kingdom-tactics-client/src/
  features/auth/kt-auth-config.ts` is the client-side reference for how a single-subdomain app
  (client+server same origin, per the MVP plan) points at these without CORS: relative fetch paths,
  `SITE_ORIGIN` only used for the login-start page NAVIGATION.
- **This plan's own MVP predecessor** established: single subdomain `soulsteel.shatteredarchive.dev`
  (`/api/soulsteel/` to the server, `/` to the client SPA), port `64000`/`64080`, and explicitly
  deferred `services/soulsteel-core` and any server persistence — both now needed here.

## Steps

### [ ] 1. `soulsteel-server`: auth wiring + per-account archive store + routes
- Do: Add `services/soulsteel-core` (finally justified — client and server now share the archive
  wire contract): `RoomStateArchive` type (the MVP plan's `RoomState` plus `{archiveId, accountId
  omitted from the wire type, archivedAt}`). In `soulsteel-server`: read `AUTH_SERVER_URL`/
  `AUTH_SERVER_PUBLIC_URL`/`SERVICE_PRIVATE_KEY_PATH` from env (mirror kt-server's
  `buildAccountIdResolver`, degrade-to-anonymous only for read paths that have a meaningful
  anonymous behavior — archive routes don't, so 401 per Constraints); add `http/auth-guard.ts`
  (copy kt-server's `requireAccount`); add `archive-store.ts` (a `JsonAccountStore`-shaped class,
  duplicated per Constraints, capped count + size per account); add `http/archive-routes.ts`
  registering `POST/GET/GET-by-id/DELETE /api/soulsteel/archives` per Context's route shape.
- Files: /workspace/shattered-archive/services/soulsteel-core/package.json (new),
  /workspace/shattered-archive/services/soulsteel-core/src/room-archive.ts (new),
  /workspace/shattered-archive/apps/soulsteel-server/src/http/auth-guard.ts (new),
  /workspace/shattered-archive/apps/soulsteel-server/src/archive-store.ts (new),
  /workspace/shattered-archive/apps/soulsteel-server/src/http/archive-routes.ts (new),
  /workspace/shattered-archive/apps/soulsteel-server/src/index.ts (wire the new routes + auth
  resolver in), /workspace/shattered-archive/apps/soulsteel-server/package.json (add
  `@shatteredarchive/soulsteel-core` + `@shatteredarchive/services-server` introspect usage if not
  already a dep from the MVP plan).
- Verify: `pnpm --filter @shatteredarchive/auth-server register-service soulsteel-server` mints a
  key against local auth-server; with a valid account bearer token, `POST /api/soulsteel/archives`
  → `GET .../archives` lists it → `GET .../archives/:id` returns byte-identical `RoomState` → 401
  on all four routes with no/invalid token; a second account's list is empty (isolation).

### [ ] 2. `soulsteel-client`: sign-in, "Archive this game," "My Archives"
- Do: `src/features/auth/soulsteel-auth-config.ts` (mirror `kt-auth-config.ts`'s shape — relative
  fetch paths, `SITE_ORIGIN` only for the login-start navigation) and a sign-in entry point
  following `docs/auth-server.md`'s SSO hand-off + device-bound-credential flow (Context). An
  "Archive this game" button on `RoomPage` (only enabled when signed in) posts the current
  `RoomState` to `POST /api/soulsteel/archives`. A "My Archives" panel (reachable from
  `LandingPage`) lists the signed-in account's archives (`GET .../archives`) and, on selection,
  fetches the full state (`GET .../archives/:id`) and opens it — as a clearly-marked **read-only**
  view (Constraints: this plan is read/list/delete, not sync) at a distinct route,
  e.g. `/archive/:id`, separate from the live `/room/:id` editing route.
- Files: /workspace/shattered-archive/apps/soulsteel-client/src/features/auth/
  soulsteel-auth-config.ts (new), /workspace/shattered-archive/apps/soulsteel-client/src/features/
  room/ArchiveButton.tsx (new), /workspace/shattered-archive/apps/soulsteel-client/src/features/
  archive/MyArchives.tsx (new), /workspace/shattered-archive/apps/soulsteel-client/src/features/
  archive/ArchiveViewer.tsx (new, read-only render reusing the MVP's `Timeline`/roster
  components), /workspace/shattered-archive/apps/soulsteel-client/src/routing/ (extend for
  `/archive/:id`), /workspace/shattered-archive/apps/soulsteel-client/src/features/landing/
  LandingPage.tsx (add the "My Archives" entry point).
- Verify: signed-out state shows no archive UI (or a clear "sign in to archive" prompt); signed-in
  round-trip — archive a game, navigate away (simulate the local room being gone by clearing
  IndexedDB), open "My Archives," reload the archived game read-only and confirm the full
  timeline/roster matches what was archived.

### [ ] 3. C# dashboard: archive endpoints + "Soulsteel Archives" dashboard section
- Do: Add `logs`-shaped endpoints for Soulsteel archives to `UserContentController.cs` (or a new
  `SoulsteelArchivesController.cs` under `[Route("api/user-content")]` if keeping the existing file
  from growing further is preferred — match whatever `LibraryController`/`MapsController`'s
  extension precedent in `.ai-plans/20260727-1243-auth-rollout-phaseC-csharp-user-content-dashboard.md`
  favored): `POST api/user-content/soulsteel-archives` (accepts the JSON `RoomStateArchive`
  payload, size-capped, retention-enforced same as `EnforceLogRetention`), `GET
  .../soulsteel-archives` (metadata: id, player count, day reached, win result, archivedAt), `GET
  .../soulsteel-archives/{id}` (full payload, used by the dashboard's "open" link — NOT rendered
  server-side, just proxied through to Soulsteel), `DELETE .../soulsteel-archives/{id}`. Add a
  "Soulsteel Archives" section to `Views/User/Dashboard.cshtml` listing the metadata with an "Open
  in Soulsteel" link to `https://soulsteel.shatteredarchive.dev/archive/{id}` (Step 2's read-only
  route) — note this means Soulsteel's `ArchiveViewer` must itself call `GET
  api/soulsteel/archives/:id` (Step 1, same account, same bearer/session) rather than the C# side
  ever handing over the content directly; the dashboard's own `GET .../soulsteel-archives/{id}` is
  for its own optional inline preview/delete-confirmation, not the hand-off mechanism.
- Files: /workspace/dsl/Server/Server.Web.Public/Controllers/UserContentController.cs (or new
  SoulsteelArchivesController.cs), /workspace/dsl/Server/Server.Web.Public/Models/UserContent/ (new
  request/response models, matching the existing `GameLogPayload`-style shape), /workspace/dsl/
  Server/Server.Web.Public/Views/User/Dashboard.cshtml.
- Verify: PUT/POST a small archive as account A → GET returns it; account B's list is empty
  (isolation, same pattern as the existing `UserContentController` tests per the Phase C plan's
  Progress log); anonymous GET/POST both 401; the Dashboard view renders the new section and its
  "Open in Soulsteel" link resolves to the correct URL shape.

### [ ] 4. Deploy + nginx wiring for auth, and full end-to-end verification
- Do: Add `AUTH_SERVER_URL: "http://auth-server.shatteredarchive.dev:62000"`,
  `AUTH_SERVER_PUBLIC_URL: "https://auth.shatteredarchive.dev"`, `SERVICE_PRIVATE_KEY_PATH`, and
  the secrets bind-mount to `soulsteel-server`'s block in **both** compose files (mirror
  `deploy/docker-compose.shattered-archive-experimental.yml:376-380`'s KT block); add a `DATA_DIR`
  + named volume now that there's real persistence to keep across recreates (mirror the scrum-poker
  `scrum-poker-data` volume pattern). On the nginx edge (`deploy/nginx/edge-subdomains.conf`), add a
  light `limit_req_zone` for `POST /api/soulsteel/archives` (mirror `builder_api`'s reasoning —
  this is now a write endpoint reachable by any signed-in account). If device-key browser
  enrollment is wanted (silent reauth per `docs/auth-server.md`'s device-bound-credentials
  section), add `soulsteel.shatteredarchive.dev` to auth-server's `DEVICE_ORIGIN_SERVICES` list.
  Then run the full loop against the experimental stack: sign in on Soulsteel, play/archive a
  game, sign in on the C# dashboard as the same account, see the archive listed, click through, and
  confirm the reopened read-only view matches — including after deleting the original room's
  IndexedDB record, proving the "long since torn down" case actually works.
- Files: /workspace/shattered-archive/deploy/docker-compose.shattered-archive-experimental.yml,
  /workspace/shattered-archive/deploy/docker-compose.yml,
  /workspace/shattered-archive/deploy/nginx/edge-subdomains.conf, auth-server's
  `DEVICE_ORIGIN_SERVICES` config (locate during this step — not read this session).
- Verify: the end-to-end loop above passes; `docker compose config` validates; a second account
  cannot see or open the first account's archive (isolation check repeated at the deployed-stack
  level, not just unit tests).

## Progress log

- 2026-08-13T19:12:00-05:00 plan created alongside `20260813-1911-soulsteel-herald-tool-mvp.md`, at
  the user's request for the auth-integrated "reload a torn-down room from the C# dashboard"
  feature. MCP/qwen stack was down at plan-writing time — oriented via direct Grep/Read of
  kingdom-tactics-server's simpler (vs. mud-builder's heavier) auth-actor pattern, the existing
  generic `JsonAccountStore` shape (now about to become a third duplicate — flagged as a possible
  future dedup, not attempted here), the C# `UserContentController.cs` `logs` endpoint family as
  the closest existing shape to an "archived game," and `docs/auth-server.md`'s documented SSO +
  device-credential flows so the client step doesn't have to reverse-engineer the auth handshake
  from scratch. Deliberately sequenced after the MVP plan and scoped to explicit,
  Herald-initiated archiving only — no background sync, no dashboard-side editing.
