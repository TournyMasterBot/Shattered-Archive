# Plan: Centralized auth — Phase 5 rollout program (all services + central C# dashboard)

Created: 2026-07-26T19:53:40-0500 · Workspace: c:\Projects\ShatteredArchive (coordinating repo;
cross-repo work in C:\Projects\DSL, C:\Projects\DslMapper, C:\Projects\DslLogViewer,
C:\Projects\shatteredarchive-mobile) · Status: ACTIVE

Task: Wire every Shattered Archive service to the central auth service (`apps/auth-server`,
the identity hub) and give each service a user-content dashboard keyed to the central
identity, with the DSL C# web service (`Server.Web.Public`) as the cross-service roll-up
dashboard. This is an **umbrella/program plan**: each phase-step below is sized to become its
own detailed `.ai-plans/` doc at execution time (the same way the mud-builder phases ran),
with this doc tracking overall order and completion.

> **HISTORY — READ BEFORE WIRING game-server.** Phase 3
> (`.ai-plans/20260720-0052-centralized-auth-service-phase3-more-consumers.md`) originally
> wired `web-server` + `game-server` + `kingdom-tactics-server`, and the user **explicitly
> reverted** the `web-server`/`game-server` halves on 2026-07-20 ("Undo any changes made to
> game client and web server related to authentication"). This plan re-opens the **game**
> pair as a fresh, user-directed decision (2026-07-26 request explicitly lists Web Game).
> `web-server`/`web-client` remain OUT of scope — the user's service list does not include
> them. `psd-viewer-*` is explicitly "Not needed".

## Goal

One account (auth-server identity) works across every Shattered Archive property:

| Service | Wiring state today | Target |
|---|---|---|
| auth-server/-client | The hub itself | Gains SSO hand-off flow, global roles + user management (list/manage strictly-below), delegation surface, and a visual refresh drawing from the C# site's style |
| mud-builder pair | **Already wired** (Phases 2/4, live since 2026-07-24) — the reference pattern | Adds per-user saved content; Engine tab gated by an auth-server role |
| game pair | Unwired (Phase 3 reversion) | game-client login + save userScripts/books/configs into the C# service's store |
| kingdom-tactics pair | Host-script only (Phase 3 `introspect-check`) | Real WS auth + persisted match history/replays/army layouts + dashboard |
| C# Server.Web.Public (DSL repo) | Own separate JWT user system (deployed but never utilized) | Auth-server identity **replaces its own login in total** — legacy flow deleted outright, nothing to migrate; central content repository + roll-up dashboard |
| DslMapper (own repo) | No auth, no backend | Optional login + save maps (stored via the C# service) |
| DslLogViewer (own repo) | No auth, no backend | Optional login + save game logs (stored via the C# service) |
| shatteredarchive-mobile (own repo) | No auth | Same C# user-data APIs as game-client (colocated scripts/books/plugin configs) |

Cross-cutting rule from the user: site-specific dashboards own their content; the C# central
dashboard shows a **high-level view** of content from all services and **links out** for
actions — it never replicates another service's editing behaviors.

Architecture statement (user, 2026-07-26 evening): **auth sits at the center of the
universe** — `auth.shatteredarchive.dev` is the sole authoritative source of identity under
this model. The **C# service is the central content repository** that helps users manage
their content. Every other service **surfaces usage aspects** of that identity + content.
The flagship user-visible outcome: the game clients (web + mobile) synchronize to the
central server — cloud backup of settings/scripts, and any other device can fetch the same
profile/content.

Access rule (user, 2026-07-26 late): **anonymous access is always allowed.** Every consumer
service works without an account or any user configuration. Authentication is an optional
*enrichment* — it carries a user's preferences between Shattered Archive services and acts
as remote storage — never a gate on core functionality.

Security rule (user, 2026-07-26 late): the services are part of a larger ecosystem but are
**discrete entities**. Each service uses only its own API keys and never executes on behalf
of another service; cross-service access always goes through a hub-brokered token exchange
(service 1 ↔ auth-server ↔ service 2). There must never be a mechanism by which compromising
one service impacts another — the only accepted single point of trust is auth-server itself.
Service identity is proven by a **well-known public/private keypair registered with the
hub**; the private half is NEVER exposed to a client, yet an assertion signed by it MUST be
present in every token exchange as proof of service trust.

## Why (context)

The mud-builder pair proved the mechanism end to end (Ed25519 service assertions →
`/api/introspect`, local-store-first with introspect fallback, live deployment with key
rotation discipline). Every other property still has either no auth at all (game, KT, mapper,
log viewer, mobile) or a completely separate identity silo (the C# site's own JWT users).
Users currently cannot carry content between properties, and nothing consumer-facing can ask
"who are you" without a paste-an-API-key ritual. The hub exists and is deployed; this program
is about consumers.

## Constraints

- **Anonymous-first, everywhere.** Users can access every consumer service anonymously, with
  no account and no user configuration. Authentication is an optional enrichment (preference
  carry-over between services + remote storage) and must never become a gate on a service's
  core function — no phase in this program may add a login wall to anything usable without
  one today. Two standing cases are outside this rule's scope: mud-builder's bearer guard is
  an authoring-tool access control that predates this program, and the C# site's *per-user
  data* features naturally require the account — its public pages (books, etc.) stay
  anonymous even after the Phase B login replacement (the "hard login dependency" below is
  about the login *path*, not about reaching the site).
- **Local-first where a local path is retained by design; the C# service is the deliberate
  exception.** For services keeping a local auth path (mud-builder's `builder-auth.json` +
  master key, KT's anonymous play), that path is always checked first and keeps working with
  `auth-server` unreachable — introspection stays additive there. The C# service, by
  explicit user direction (2026-07-26), **replaces its login with auth-server identity in
  total** — auth-server is a hard login dependency there by design (mitigate outages with
  a short local validation cache for already-seen tokens, not a parallel login).
- **Legacy C# accounts: nothing to migrate (user, 2026-07-26).** The legacy
  register/login/JWT flow (`Middleware/JwtMiddleware.cs`, `Controllers/UserController.cs`)
  was deployed to production but **never actually utilized** — no real accounts or
  user-owned content sit behind it, so it is safe to simply walk away from the
  implementation. No migration window, no claim/link flow, no legacy-credential
  verification: Phase B deletes the legacy flow outright and replaces it with hub SSO +
  JIT provisioning. The only safety step retained is a one-time look at the live user
  store at execution to confirm it really is empty/test-only before deletion (recorded in
  the sub-plan, not a gate).
- **Cross-repo hygiene.** DSL, DslMapper, DslLogViewer, and mobile are separate repos with
  their own conventions (npm vs pnpm, C# vs TS). Follow each repo's own style there; this
  ShatteredArchive `.ai-plans/` doc (and its sub-plans) is the coordinating record either way.
  `shattered-service.key` is gitignored by filename **only in this repo** — any repo that
  gains a service key must add its own gitignore entry (verify at execution, don't assume).
- **Service-key lifecycle discipline** (from the deployed mud-builder wiring,
  `docs/auth-server.md` § Deployment): keys are registered with the host script
  `register-service <name>` against the LIVE auth-server data (mind the `.env`
  `override:true` clobber trap and the `DATA_ENCRYPTION_KEY` from the named volume — see
  memory `auth-server-mud-builder-wiring`); private PEMs are per-install bind mounts;
  rotation is register-new → replace file → recreate → verify → revoke-old, never
  revoke-first. No `--` between pnpm script name and args on pinned pnpm@11.x.
- **Auth user-profile data lives on the docker host (user, 2026-07-26).** All account/profile
  state — accounts, keys/sessions, global roles, SSO redirect registrations, and every new
  store this program adds — must persist under auth-server's `DATA_DIR`, which is already a
  host **bind mount** (`deploy/docker-compose.shattered-archive-experimental.yml:330-336`,
  `../apps/auth-server/data` → `/repo/apps/auth-server/data`), so container rebuilds never
  lose user profiles. No phase may write profile state to a container-local path or hide it
  in a new named volume. The one deliberate exception stays: the `DATA_ENCRYPTION_KEY` file
  remains in the `auth-server-secrets` named volume (rebuild-durable too, but intentionally
  not casually host-visible/editable — see the compose file's own comment). Phase I's deploy
  audit re-verifies durability with an actual container recreate.
- **Service isolation — discrete entities, hub-brokered trust only (user, 2026-07-26).**
  Each service authenticates to the hub with ITS OWN Ed25519 key and never executes on
  behalf of another service. Cross-service access is only ever obtained through a token
  exchange brokered by auth-server: service 1 presents its own assertion plus the user's
  service-1-scoped token; the hub mints a short-TTL token scoped to service 2 and bound to
  that same user; service 2 validates it as its own audience. Two consequences this program
  must build, not just state: (1) bearer tokens become **audience-scoped** — a token minted
  for service 1 is rejected by service 2; the `service` field stops being a pure label and
  becomes enforced (shared guard helper + hub-side exchange rules); (2) no service ever
  holds, forwards, or accepts another service's credentials — raw token forwarding across
  services is banned; (3) **key custody**: service identity is a well-known public/private
  keypair registered with auth-server — the private half lives server-side only and is
  NEVER exposed to a client (not in a browser bundle, not in a mobile app, not visible in
  any client-observable request), yet an assertion signed by it MUST be present in every
  token exchange as proof of service trust. Consequence: browser/mobile apps are **public
  clients** — each pairs with the backend service it stores data through, and THAT backend
  performs its exchange (game-client, DslMapper, DslLogViewer, and mobile pair with the C#
  service; kt-client with kingdom-tactics-server; mud-builder-client with
  mud-builder-server). Design target: compromising any one service must not grant access to
  any other; the only accepted single point of trust is auth-server itself.
- **`KNOWN_SERVICES` in `apps/auth-client/src/features/keys/KeysPage.tsx:13` grows by one
  entry per service as it actually registers** — extend the array, not the server. Today the
  `service` tag is a pure label (`/api/introspect` never filters on it); Phase A upgrades it
  to an **enforced audience** per the service-isolation constraint. The flip must plan for
  existing mud-builder account keys (already labeled `mud-builder-server`, so they should
  pass — verify rather than assume, and decide re-mint vs. grandfather in the sub-plan).
- **Reuse `services/services-server/src/auth-introspect-client.ts` as-is for every Node
  consumer** (all apps already depend on `@shatteredarchive/services-server`). The .NET
  implementation in the DSL repo deliberately duplicates the compact assertion format
  (`base64url(payloadJson) + '.' + base64url(signature)`, epoch **milliseconds**, ≤60s
  window) — same reasoning as the client's own header comment about not importing across
  app boundaries. The seconds-vs-milliseconds mismatch was a real Phase 2 bug; the C# port
  must copy the ms semantics, not "standard JWT" seconds.
- **Ed25519 in .NET requires a library** (not in the BCL) — BouncyCastle or NSec, chosen by
  DSL-repo conventions at execution time. Flag, don't silently pick, if the DSL repo has an
  existing crypto dependency to reuse.
- **One constellation, one workspace.** The properties span `*.shatteredarchive.com` AND
  `*.shatteredarchive.dev`; all are owned by the same creator, all have nginx configs
  defined in projects in this workspace, and all use Let's Encrypt for SSL. SSO redirect
  URIs, CORS origin lists, vhosts, and certs are therefore all manageable from here — no
  external coordination — but cookies can never span the two TLDs, which is a structural
  argument for the hand-off flow in Decision 1, not an inconvenience to work around.
- **Content, not credentials, in summaries.** The central-dashboard aggregation endpoints
  expose titles/counts/timestamps + a link-out URL — never tokens, never other users' data.
- **Big-file caution for logs.** DslLogViewer uploads are user game logs (potentially tens of
  MB). The storage phase must set explicit size caps + retention before the upload endpoint
  ships, not after.
- **No new HTTP surface on a service without designing its guard deliberately** — Phase 3's
  constraint stands. Each phase-step that adds routes designs the guard in its own sub-plan
  (all of them reuse the introspect-fallback guard shape, but each names its local-first
  story explicitly).

## Context (verified 2026-07-26, file:line)

- **Hub contract** (`docs/auth-server.md`): port 62000, deployed at
  `https://auth.shatteredarchive.dev` in both composes; accounts w/ epoch invalidation;
  sessions ARE key records (24h TTL, `sa_session` httpOnly SameSite=Lax cookie, host-scoped);
  API keys minted per service label; `POST /api/introspect` gated by `X-Service-Assertion`
  (Ed25519, ≤60s), returns `{valid, accountId, service, label, username, expiresAt,
  tokenType}` (last three added Phase 15, additive). Host scripts: `register-service`,
  `revoke-service-key`, `temp-password`.
- **Shared Node client**: `services/services-server/src/auth-introspect-client.ts:37`
  (`signAssertion`) and `:56` (`introspect`) — exported from the package barrel; assertion
  TTL 30s in **milliseconds** (`:34` comment documents the ms trap).
- **Reference consumer**: `apps/mud-builder-server/src/routes/auth.ts` — `authGuard` checks
  local `builder-auth.json` first, falls back to `tryIntrospect` (silent no-op null when
  `AUTH_SERVER_URL`/`SERVICE_PRIVATE_KEY_PATH` unset); `requireMaster` needed the same
  fallback (2026-07-24 bug). Deployed wiring details: `docs/auth-server.md` § Deployment +
  memory `auth-server-mud-builder-wiring`.
- **game-server** (`apps/game-server/src/index.ts`, 366 lines): a WS telnet proxy at
  `/ws/game` (`:182`) with a host:port allowlist (default `dsl-mud.org:4000`, `:39`) — no
  auth, no persistence, plain `/` + `/health` HTTP surface (`:156`).
- **game-client**: has a real client-side user-scripting stack today —
  `src/features/userScripts/` (runtime singleton), `src/features/plugins/` (plugin host +
  core plugins + per-plugin settings), `hooks/useUserScriptSandbox.ts` — this is the content
  that becomes server-saved. Where exactly it persists today (localStorage keys, shapes) is
  a sub-plan verification item, not assumed here.
- **kingdom-tactics-server** (`apps/kingdom-tactics-server/.ai-context`): Express 5 + `ws`
  at `/ws/kt`, server-authoritative `MatchSession`/`MatchRegistry`, port 51000, "No
  auth/reconnect in v1 (Phase 7)". Already has `scripts/introspect-check.ts` + `.env` block
  from Phase 3. Deterministic engine + action log means replays are re-simulation from a
  stored action log (cheap), not video/state dumps; hidden-outcome rolls use a server-only
  salt (memory `kt-combat-reactions-salted-rng`) — a replay/spectator path must not leak it.
- **C# Server.Web.Public** (`C:\Projects\DSL\Server\Server.Web.Public`): ASP.NET MVC with
  its OWN complete user system — `Middleware/JwtMiddleware.cs:18` (jwt-token cookie →
  `IJwtUtils.ValidateJwtToken` → `IUserService.PublicGetById` → `context.Items["User"]` +
  per-user Claims), `Controllers/UserController.cs` (register/login/authenticate/dashboard,
  `[Authorize]` at `:14`), `Controllers/LibraryController.cs` (books, 788 lines),
  `Controllers/MapsController.cs` (70 lines), `Controllers/ScriptsController.cs` (a 21-line
  stub view — the user-scripts API does NOT exist yet), plus Admin/Contribute/Internal
  controllers. JWT secrets via `appsettings`/env. Serves the public DSL site (different
  domain from `*.shatteredarchive.dev` — cross-origin is a given, cookies do not carry).
- **DslMapper** (`C:\Projects\DslMapper\game-mapping`): standalone Vite/React SPA, own repo,
  npm lockfile, no backend of any kind.
- **DslLogViewer** (`C:\Projects\DslLogViewer\dsl-log-viewer`): standalone Vite/React SPA,
  own repo, no backend (repo has nginx/docker deploy files for static serving).
- **Mobile** (`C:\Projects\shatteredarchive-mobile\dsl-client`): Expo/React Native app
  (android/, app.json, metro), pnpm-workspace, shares the DSL-client feature set (memory
  `mobile-connection-persistence`).
- **auth-client**: `KNOWN_SERVICES = ['mud-builder-server']`
  (`apps/auth-client/src/features/keys/KeysPage.tsx:13`).

## Decision points (revised 2026-07-26 evening per user direction — see Progress log)

1. **Cross-site login = SSO hand-off flow, not key-pasting.** Recommended: an OAuth-lite
   authorization-code hand-off — a consumer site redirects to auth-client's login with
   `service` + a pre-registered `redirect_uri`; after login auth-server mints a **one-time,
   short-TTL code**; the consumer's *backend* exchanges the code at a new
   assertion-gated endpoint (`POST /api/token-exchange`) for a service-scoped bearer token
   (a normal key record, `tokenType:'sso'` or an expiring `api` key). Rationale: the
   `sa_session` cookie is host-scoped to `auth.shatteredarchive.dev`, and the constellation
   spans TWO TLDs (`*.shatteredarchive.com` + `*.shatteredarchive.dev`) — no cookie scope
   can cover both, so a redirect hand-off is structurally required, not merely preferred.
   Key-pasting (mud-builder's Access tab) stays fine for operator-grade tools but is wrong
   for consumer login. This is Phase A's core build. **STATUS: effectively confirmed** by
   the 2026-07-26 direction (the C# service now takes identity from the hub *in total*,
   which requires exactly this flow as its login).
2. **Storage home for DslMapper maps + DslLogViewer logs = the C# service.** It already has
   `MapsController` and the user's own framing colocates DSL-ecosystem user data there
   (game scripts, books). Alternative (a new Node user-content service) rejected as a whole
   new deployable for no gain. Logs get size caps + retention (Constraints).
   **STATUS: confirmed** — the 2026-07-26 direction names the C# service as "the central
   repository that can help users manage content".
3. **game-server's telnet proxy stays unauthenticated in this program.** The Web Game
   deliverable is save-your-stuff, which is game-client ↔ C# service; the proxy itself
   gates by MUD-host allowlist and gained nothing user-visible from a login wall. (Also the
   respectful reading of the 2026-07-20 reversion: wire the game experience, don't gate the
   pipe.) Revisit only if per-user proxy features (e.g. server-side character profiles)
   appear later.
4. **Roles = a delegated authority hierarchy, administered per service** (USER-DIRECTED
   2026-07-26 — replaces the original flat-strings-at-the-hub recommendation). The model:
   - **Tiers**: `owner` > `admin` > `manager` > `trusted` > `user`. Owners select admins,
     admins handle managers, managers have trusted users, and users simply exist and have
     their content saved to the centralized location.
   - **The hub stores only global authority**: an account-level global role
     (`owner`/`admin`/`moderator`, extensible list, default `user` — per user direction
     2026-07-26 late evening) surfaced on introspect/exchange responses (additive field).
     Hub owners/admins have permission to grant domain-specific privileges *under each
     service* — i.e. they bootstrap/appoint that service's admins. The same
     strictly-below rule governs hub-side management: you can list users, but only
     **manage** (assign roles to, issue recovery for) accounts of lesser privilege than
     your own.
   - **Each service owns its domain-specific role store**, keyed by authAccountId, with
     grants administered FROM that service's own UI (delegated authority): every tier may
     manage only tiers strictly below its own. The C# service implements this through its
     existing JWT-claims machinery ("JWT roles may be maintained through the csharp
     service"), re-keyed to auth identity; Node services get a small shared convention
     (types + guard helper in `services-server`), with each service's store built in its
     own phase.
   This powers mud-builder's "elevated permission may manage the actual build server"
   (admin-tier and above) without a central policy engine, and keeps authorization close to
   the domain that understands it while identity stays central.

## Steps

### [x] A. (CLAUDE) Hub foundations: SSO hand-off + per-service roles (apps/auth-server, apps/auth-client)
- Do: design + build the authorization-code hand-off (Decision 1): registered redirect URIs
  per consumer service (stored alongside the service-key registry), auth-client login/consent
  screen reuse, one-time code store (short TTL, single-use, bound to service),
  `POST /api/token-exchange` gated by the same `X-Service-Assertion` mechanism as introspect.
  Tokens minted here are **audience-scoped** (service-isolation Constraint): responses carry
  the audience, the shared guard helper rejects any token presented to a service it wasn't
  minted for, and the hub's exchange rules enforce it server-side. Also design the
  **on-behalf-of exchange** here (service 1's assertion + the user's service-1 token → a
  short-TTL service-2-scoped token bound to the same user) — Phase H's dashboard fan-out is
  its first consumer; raw cross-service token forwarding is banned. Every exchange path
  (authorization-code AND on-behalf-of) REQUIRES a valid service assertion — proof of
  service trust per the key-custody constraint; there is no client-side exchange, and a
  service's private key never appears in any client-visible surface.
  Every new persistent store lands under `DATA_DIR` (host-mount Constraint); one-time codes
  may stay in-memory — they are deliberately ephemeral and losing them on a rebuild is
  correct behavior.
  Add the hub's half of Decision 4 (revised): a global account tier (`owner`/`admin`,
  default `user`) with `grant-tier`/`revoke-tier` host scripts, surfaced as an additive
  field on introspect + exchange responses; plus the documented delegated-roles convention
  (tier ladder, strictly-below rule, service-local stores keyed by authAccountId) with
  shared TS types + a guard helper in `services-server` — each consumer service builds its
  own store in its own phase. Full test coverage at auth-server's existing depth; docs
  (`docs/auth-server.md`, auth-client doc).
- Files: `apps/auth-server/src/**` (new routes + stores), `apps/auth-server/scripts/**`,
  `apps/auth-client/src/**` (SSO approve/redirect surface), `services/services-server/src/
  auth-introspect-client.ts` (add `exchangeCode()` next to `introspect()` — shared home,
  same rationale), docs.
- Verify: unit + live local round-trip — a scratch consumer completes redirect → code →
  exchange → introspect shows the minted token with the global-role field; code
  reuse/replay fails; wrong assertion 401s; a token minted for service A is rejected by
  service B's guard (audience enforcement negative test); an on-behalf-of exchange yields a
  token valid ONLY at the target service and still bound to the original user. Sub-plan doc
  required (this is the program's riskiest design work).

### [x] A2. (CLAUDE) Hub user management + delegation surface + auth-client visual refresh (apps/auth-server, apps/auth-client)
- Do: **admin API on auth-server** (guarded by global role, strictly-below rule
  throughout): list users (paged/searchable — username, global role, created, key/session
  counts, `mustChangePassword` state; never password hashes or token material), assign/
  revoke global roles on lesser-privileged accounts only (a moderator cannot touch an
  admin; an admin cannot touch an owner or a peer admin), issue a recovery temp-password
  (promotes the existing `temp-password` host script's logic to a guarded route — host
  script stays as the break-glass path). **Delegation surface**: a per-user view of which
  constellation services the account is known to (service role stores queried where they
  exist, else key labels as a hint) with link-outs to each service's own role-admin UI —
  the hub shows standing and links out; per-service grants happen in the service (Decision
  4). **auth-client admin section** for all of it, gated by the caller's own role.
  **Visual refresh**: restyle auth-client (login/keys/account + the new admin section) to
  "feel comfortable" — drawing from the C# site's design language
  (`Server.Web.Public/wwwroot/css/site.css` + its font/img assets are the reference) with
  a modern feel; extract shared tokens (palette/typography/spacing) into auth-client's CSS
  rather than importing the legacy stylesheet wholesale. The refreshed look becomes the
  constellation's reference identity style (Phase C's C# dashboard rebuild should converge
  on it from the other side).
- Files: `apps/auth-server/src/routes/**` (new admin routes + tests), `apps/auth-client/
  src/features/**` (admin section, styling), docs (`docs/auth-server.md`,
  `docs/auth-client.md`).
- Verify: strictly-below matrix tested at the API (owner→admin ok, admin→admin peer
  rejected, moderator→admin rejected, everyone→owner rejected); list endpoint refuses
  plain users; temp-password route audit-logs and forces change-on-login; UI hides
  management affordances the caller's role can't use (and the API still rejects if forced);
  visual pass reviewed against the C# site side-by-side (user's call on "comfortable").

### [x] B. (CLAUDE) C# identity replacement — clean cut, no migration (DSL repo: Server.Web.Public)
- **Sub-plan: `.ai-plans/20260727-1022-auth-rollout-phaseB-csharp-clean-cut.md`** —
  ownership split per user direction 2026-07-27: Fable executes the C# update + local
  certification (its steps 1-2); Sonnet 5 executes the rest (live registration, the
  one-time TABLE_USERS check + deploy + live E2E, docs/bookkeeping — its steps 3-5).
  Service name fixed: `shattered-web`. Ed25519 lib: BouncyCastle.Cryptography (flagged
  in the sub-plan; no existing DSL crypto dep to reuse).
- Do: .NET service-assertion client (Ed25519 lib per Constraints; compact ms-based format,
  port the `auth-introspect-client.ts` semantics exactly — epoch **milliseconds**, not
  JWT-standard seconds); **replace the login**: the C# site's login becomes Phase A's SSO
  flow against `auth.shatteredarchive.dev`, `JwtMiddleware` resolves identity from
  auth-server tokens (introspect, with a short local validation cache for outage softening)
  → C# user record keyed by authAccountId, JIT-provisioned on first login, populating
  `context.Items["User"]`/claims exactly as today so downstream controllers don't change;
  **legacy flow deleted outright** (nothing-to-migrate Constraint): after the one-time
  empty/test-only check of the live user store, the legacy register/login endpoints and
  password machinery are removed — no migration window, no claim/link flow;
  local role/claims store re-keyed to auth identity per Decision 4 (delegated hierarchy —
  minimal seed here, its admin UI lands with the dashboard in Phase C); register the
  service key against live auth-server data (name fixed at execution, e.g.
  `shattered-web`); CORS groundwork for the constellation origins + mobile.
- Files: DSL repo (`Server.Web.Public/Middleware`, `Services`, `Controllers/UserController.cs`,
  models, csproj dep). Coordinating notes + verification evidence land in this repo's
  sub-plan doc.
- Verify: fresh auth-server account logs in via SSO, gets JIT-provisioned, reaches the
  dashboard; the pre-deletion check of the live user store is recorded in the sub-plan
  (empty/test-only confirmed); legacy login/register endpoints are gone (404 or redirect
  into the SSO flow — no half-alive password path); public unauthenticated pages
  regress clean; auth-server outage degrades readably (cached validations keep working
  briefly, fresh logins fail with a clear message — never a silent 500).

### [x] C. (CLAUDE) C# user-data APIs + central dashboard shell (DSL repo)
- **Sub-plan: `.ai-plans/20260727-1243-auth-rollout-phaseC-csharp-user-content-dashboard.md`**
  — grounded via research on game-client's actual userScripts/plugins shapes and
  the DSL DBManager's real query capabilities (QueryItems is an unimplemented
  stub — every list read is scan+filter). 7 steps: data layer, scripts+plugins
  API (whole-collection), books+maps API (per-item CRUD), game-log uploads
  (size+retention capped), delegated-role hierarchy (bootstrap + admin UI, wired
  to CanCreateBooks), dashboard rebuild, full regression+docs+sign-off.
- Do: real REST APIs (JSON, bearer-guarded via Phase B) for: user scripts
  (alias/timer/trigger collections — schema shaped with game-client's actual
  `features/userScripts` shapes, verified there first), per-user books access (extend
  LibraryController's existing model with user scope), user-owned maps (extend
  MapsController), plugin/config blobs, and uploaded game logs (size caps + retention per
  Constraints). Rebuild `user/dashboard` as the roll-up shell: sections per service with
  local content inline (scripts/books/maps/logs live here) and placeholders for remote
  services (filled in Phase H). Include the C# service's own delegated-role administration
  UI (Decision 4: owners appoint admins, each tier manages strictly below — this is the
  first concrete implementation of the hierarchy, and its UX becomes the reference for
  other services' role screens).
- Verify: CRUD round-trips per content type under two different accounts stay isolated;
  size cap rejects oversize log upload with a readable error; anonymous/expired-token calls
  401 cleanly.

### [x] D. (CLAUDE) Web Game wiring (apps/game-client; game-server untouched per Decision 3)
- **Sub-plan: `.ai-plans/20260727-1420-auth-rollout-phaseD-game-client-wiring.md`**
  — grounded via research into game-client's app shell (no router), settings-
  modal idiom, and connectionId scoping. Real premise correction found and
  recorded: game-client's "library" feature (player-authored book drafts) is
  UNRELATED to Phase C's book-bookmark API — book sync is out of scope this
  phase, scripts + plugin-configs only. 4 steps: DSL backend game-SSO
  endpoints + CORS tightening (finally flips off the historical
  AllowAnyOrigin default), game-client token storage + login trigger, cloud
  sync module + Account panel UI, full regression + live E2E + docs.
- Do: login UI in game-client via Phase A SSO — game-client is a **public client** (no
  service key in the bundle; its code exchange runs in the C# service's backend per the
  key-custody constraint, the SPA receives only its user-scoped bearer token); token held
  client-side (its storage story
  designed in the sub-plan — this is a game that already persists locally); sync layer:
  userScripts/plugin-configs/books bookmarks save-to-cloud + load-from-cloud against
  Phase C APIs with explicit conflict story (local-first, manual "save/load" before any
  auto-sync); offline/logged-out behavior identical to today.
- Verify: create alias on web logged in → visible via C# dashboard → edit there is NOT
  required (link-out only, per the cross-cutting rule) → reload game-client sees it; logged
  OUT game-client behaves exactly as today (regression).

### [ ] E. (CLAUDE) Mobile wiring (shatteredarchive-mobile repo) — CODE COMPLETE, device verification pending
- Do: same Phase C APIs from the Expo app: SSO via AuthSession/deep-link return, token in
  secure storage (public client like game-client — exchange via the C# backend, never an
  embedded service key), scripts/books/plugin-config sync sharing the exact same shapes as
  game-client ("colocated with game web client scripts" — one store, two clients);
  connection-manager singleton (memory `mobile-connection-persistence`) must not regress.
- Verify: alias created on web appears on mobile after sync and vice versa; auth survives
  app background/restart; logged-out mobile unchanged.

### [x] F. (CLAUDE) Kingdom Tactics: WS auth + persistence + dashboard (apps/kingdom-tactics-*)
- Do: promote the Phase 3 host-script proof into a real guard — token presented in the WS
  hello/claim frame, introspected server-side, accountId attached to the seat; persist
  match history + action-log replays (deterministic re-simulation; never persist/serve the
  hidden-outcome salt) + army layouts keyed by accountId (storage engine chosen in
  sub-plan); kt-client gains login (Phase A SSO) + a dashboard (history list, replay
  viewer reusing the engine, army-layout save/load); summary endpoint for Phase H.
  Anonymous play stays possible (local-first: auth adds persistence, never gates the game).
- Verify: play a match logged in → it appears in history → replay reproduces the recorded
  outcome exactly (engine determinism assert) → army layout round-trips; anonymous match
  still works end to end; auth-server down ⇒ anonymous path unaffected.

### [x] G. (CLAUDE) MUD Builder: per-user content + role-gated Engine (apps/mud-builder-*)
- Do: per-user saved content (private drafts/snippets/staged areas keyed by introspected
  accountId — scope defined in sub-plan against what builders actually author) in a new
  store beside `builder-auth.json`; a "My content" dashboard view in the client; gate the
  Engine tab's rebuild trigger by mud-builder's own service-local delegated role store
  (Decision 4 — admin tier and above; hub owners/admins bootstrap it; master key remains
  an override — local-first); summary endpoint for Phase H.
- Verify: two accounts' saved content is isolated; a plain-user account sees Engine
  read-only while an admin-tier account can trigger; master key still works with
  auth-server down.

### [ ] H. (CLAUDE) Site dashboards for Mapper + LogViewer, then central roll-up (DslMapper, DslLogViewer, DSL repos)
- Do: DslMapper — SSO login + save/load named maps via Phase C's maps API, "my maps"
  dashboard list; DslLogViewer — SSO login + upload current log/list/reopen via the logs
  API. Both SPAs stay fully usable logged-out — login only adds the cloud save/load
  features (anonymous-first constraint); both are **public clients** of the C# service —
  no service key in either bundle, their SSO code exchange runs in the C# backend
  (key-custody constraint). Then the roll-up: a summary-endpoint convention (`GET /api/user-content/summary`,
  caller's bearer token introspected, returns counts/titles/updated-at + link-out URL) on
  kingdom-tactics-server + mud-builder-server; the C# dashboard fans out server-side via
  Phase A's **on-behalf-of exchange** (its own assertion + the user's C#-scoped token → a
  short-TTL token scoped to each target service, still bound to the same user — never raw
  forwarding of the user's token across services, never impersonation via its own service
  assertion; service-isolation Constraint) and renders the high-level cards with link-outs,
  per the cross-cutting rule. Extend
  auth-client `KNOWN_SERVICES` with every service registered by now.
- Verify: a map saved in DslMapper and a log uploaded in DslLogViewer both appear on the C#
  dashboard as cards linking back to those sites; a service being down renders a degraded
  card, not a broken dashboard; summary endpoints refuse a foreign/invalid token.

### [ ] I. (CLAUDE) Program close-out: deploy, rotate-capable secrets audit, docs
- Do: wire every new consumer into its deploy surface (experimental compose for SA apps;
  DSL repo's own compose for the C# service) with per-install key mounts + env; nginx
  vhost + CORS-origin + SSO-redirect-URI updates across BOTH constellation TLDs (all nginx
  configs and Let's Encrypt certs are defined in this workspace's projects — audit them as
  one sweep); verify the rotation runbook against ONE service live (register-new → swap →
  verify → revoke-old); update `docs/auth-server.md` consumer table, per-app docs,
  `.ai-context`/`.annotated` everywhere touched; memory update; mark each sub-plan and
  this program COMPLETE.
- Verify: live smoke of one real account across ≥3 properties (login once per site via SSO,
  content visible on the central dashboard); recreate the auth-server container and confirm
  accounts/roles/keys/registrations all survive (host-mount Constraint made real); no
  plaintext secrets in any repo (`git grep` audit); all suites green in every touched repo.

## Progress log
- 2026-07-26T19:53 program plan created (Claude), Status ACTIVE, unstarted. Grounding done
  this session: hub contract re-read (`docs/auth-server.md`), shared introspect client
  re-read (`auth-introspect-client.ts`), Phase 3 reversion history re-read (its scope-change
  note drives this plan's game-server stance + Decision 3), C# service surveyed
  (JwtMiddleware/UserController/Library/Maps/Scripts controllers — own JWT user system,
  scripts API is a stub view), game-server confirmed to be an unauthenticated WS telnet
  proxy, game-client confirmed to have a real client-side userScripts/plugins stack,
  DslMapper/DslLogViewer confirmed backend-less SPAs, mobile confirmed Expo app,
  `KNOWN_SERVICES` located (`KeysPage.tsx:13`). Four decision points recorded with
  recommended defaults — confirm/override each before its phase runs; Phase A is the
  critical path (B–H all consume its SSO flow; B additionally feeds C, C feeds D/E and half
  of H).
- 2026-07-26T20:0x user direction received and folded in (Claude). Three substantive
  revisions: (1) `auth.shatteredarchive.dev` is THE authoritative identity source — the C#
  service **replaces** its own login with hub identity in total (Phase B rewritten from
  additive bridge → replacement + one-time legacy claim/link migration; the "never break
  existing C# users" constraint narrowed to "existing accounts/content must survive the
  migration"); (2) roles become a **delegated authority hierarchy** (owner > admin >
  manager > trusted > user), administered from each service, hub stores only global
  owner/admin tier — Decision 4 rewritten, Phase A/C/G adjusted (C# implements the
  hierarchy first via its JWT-claims machinery and its dashboard hosts the reference
  role-admin UI); (3) recorded the constellation facts (spans `*.shatteredarchive.com` +
  `*.shatteredarchive.dev`, one owner, all nginx + Let's Encrypt configs live in this
  workspace) as a new Constraint — it hardens Decision 1 (two TLDs ⇒ cookie SSO is
  structurally impossible ⇒ redirect hand-off confirmed) and folds a
  cross-TLD nginx/CORS/redirect-URI sweep into Phase I. Decisions 1 and 2 marked
  confirmed; Decision 3 (proxy stays unauthenticated) still stands as the default, not
  yet explicitly confirmed.
- 2026-07-26T20:1x second user direction folded in (Claude): the hub itself needs user
  management — list users, assign global roles (`owner`/`admin`/`moderator`, extensible),
  with the strictly-below rule for who may manage whom — plus a per-user delegation
  surface into the constellation services, and an auth-client visual refresh drawing from
  the C# site's design language (`wwwroot/css/site.css` located as the reference) with a
  modern feel. Added as new step **A2** (between A and B) rather than growing A: A stays
  the SSO/data-model critical path that B–H block on; A2 is UI/management surface that
  only needs A's role field to exist. Decision 4's hub bullet updated (global tier list
  extended beyond owner/admin; strictly-below management rule stated at the hub too).
- 2026-07-26T20:2x third user direction folded in (Claude): **anonymous access is always
  allowed** — authentication is an optional enrichment (cross-service preference carry-over
  + remote storage), never a gate on core functionality. Promoted from scattered per-phase
  verifies (F's "never gates the game", D/E's logged-out regressions, B's public-pages
  check) to a program-wide rule: stated in the Goal section's access rule, added as the
  leading Constraint (with its two scoped-out cases: mud-builder's pre-existing authoring
  bearer guard, and the C# site's per-user data features — public pages stay anonymous),
  Phase H's Mapper/LogViewer wording made explicit that both SPAs stay fully usable
  logged-out, and the Goal table's Mapper/LogViewer targets reworded to "Optional login".
- 2026-07-26T20:3x fourth user direction folded in (Claude): auth user-profile data must be
  mounted to the docker host so it survives container rebuilds. Verified against the live
  compose file first: `DATA_DIR` is ALREADY a host bind mount
  (`deploy/docker-compose.shattered-archive-experimental.yml:330-336`, `../apps/auth-server/
  data`), so today's accounts/keys/sessions already have the property — the real risk was a
  future phase adding a store outside it. Encoded as a new Constraint (all new profile
  stores under `DATA_DIR`; no container-local writes, no new named volumes for profile
  state; the `auth-server-secrets` encryption-key named volume stays as the one deliberate
  exception), a Phase A note (persistent stores under `DATA_DIR`; one-time SSO codes stay
  in-memory on purpose), and a Phase I verify (actual container recreate proving
  accounts/roles/keys survive).
- 2026-07-26T20:4x fifth user direction folded in (Claude): the legacy C# login system,
  while deployed to production, was **never actually utilized** — safe to walk away from
  the implementation entirely. The "accounts must survive" constraint rewritten to
  "nothing to migrate"; Phase B retitled "clean cut, no migration" and its
  claim/link-migration-window machinery deleted from the Do/Verify (replaced by: one-time
  empty/test-only check of the live user store recorded in the sub-plan, then the legacy
  register/login endpoints and password machinery are removed outright — no half-alive
  password path); Goal-table row updated to match. This meaningfully de-risks Phase B —
  the migration window was its hairiest part.
- 2026-07-26T20:5x sixth user direction folded in (Claude): **service isolation + key
  custody**. Services are discrete entities — each uses only its own registered Ed25519
  keypair, never executes on behalf of another service; cross-service access only via
  hub-brokered token exchange (service 1 ↔ auth-server ↔ service 2); compromising one
  service must never impact another (auth-server is the sole accepted single point of
  trust); private keys are NEVER client-exposed yet MUST be presented (as assertions) in
  every exchange. Encoded as: a Goal security-rule paragraph; a new service-isolation
  Constraint with three built consequences — (1) tokens become **audience-scoped** (the
  `service` field stops being a pure label; the `KNOWN_SERVICES` constraint rewritten
  accordingly, with the mud-builder legacy-key flip called out), (2) raw cross-service
  token forwarding banned, (3) key custody with the public-client pairing map (SPAs/mobile
  pair with the backend they store through; that backend performs the exchange); Phase A
  gains the on-behalf-of exchange design + audience-enforcement negative tests; Phase H's
  dashboard fan-out reworked from "forwards the user's own token" to the on-behalf-of
  exchange; Phases D/E/H annotated with their public-client exchange homes (the C#
  backend).
- 2026-07-27T11:0x **step A DONE** (Claude) — sub-plan
  `.ai-plans/20260727-0905-auth-rollout-phaseA-hub-sso-roles.md`, Status COMPLETE, all
  6 steps verified. Built: SSO authorization-code hand-off (in-memory 60s single-use
  burn-on-mismatch codes; session-guarded /api/sso/approve; auth-client /sso/authorize
  consent surface), assertion-gated POST /api/token-exchange with BOTH grants
  (authorization_code → 7d audience-scoped 'sso' token; on_behalf_of → 2min 'obo' token,
  subject must be caller-audience kind api/sso — sessions never leave the hub, OBO never
  chains), globalRole global tier (authoritative ladder in auth-server/global-tiers.ts,
  grant-tier/revoke-tier/register-redirect-uri host scripts, additive
  introspect/exchange field), and the consumer half in services-server (auth-tiers.ts
  ladders + strictly-below canManage failing closed on unknown tiers,
  exchangeAuthorizationCode/exchangeOnBehalfOf, matchesAudience guard). 172 tests green
  (auth-server 136, services-server 19, auth-client 17), all builds clean, host scripts
  smoke-run against a throwaway DATA_DIR. Docs: auth-server.md SSO/exchange section +
  auth-client.md Pages row. NOT yet deployed to the live container (Phase I or on
  request). Next: A2 (hub user management + visual refresh) or B (C# clean-cut
  identity replacement) — B no longer blocks on migration design per the 2026-07-26
  direction.
- 2026-07-27T11:3x step A **deployed + live-verified** (user-requested): both auth
  containers rebuilt/recreated, data survived the recreate (host-mount constraint proven
  live), and a full E2E through the real edge passed — 12/12 part1 checks (SSO
  approve → exchange → introspect incl. replay refusal) + 7/7 part2 checks (grant-tier
  visible without a restart, on_behalf_of to mud-builder-server, OBO introspects at its
  target audience) + /sso/authorize serves the SPA + a revoked service key 401s. All
  five host scripts exercised against live data. Full evidence in the Phase A sub-plan's
  final log entry; docs/auth-server.md Deployment updated. Phase A is DONE and LIVE.
- 2026-07-27T13:0x **step A2 DONE + DEPLOYED** (Claude) — sub-plan
  `.ai-plans/20260727-1145-auth-rollout-phaseA2-hub-admin-visual-refresh.md`, Status
  COMPLETE. Built: requireElevated admin guard (plain 'user' 403s on everything, list
  included) + strictly-below matrix server-side (manage only below your CURRENT tier;
  assign only below your own; owner never assignable over HTTP), paged/searchable user
  list with live credential counts and manageable flags (never secret material),
  guarded one-time temp-passwords (forced change + epoch bump), append-only
  DATA_DIR/audit.log, GET /api/admin/services delegation surface with client-side
  link-outs, additive me().globalRole, auth-client Admin tab + AdminPage, and the
  visual refresh: C# site.css design tokens (grep-verified exact values) as CSS custom
  properties — the constellation's reference identity style. 170 auth-server+client
  tests green; live E2E 12/12 through the edge incl. assignment-ceiling 403 and the
  audit trail. NOTE for the user: judge the "comfortable" look live at
  https://auth.shatteredarchive.dev. Next: B (C# clean-cut identity replacement).
- 2026-07-27T10:22-05:00 Phase B sub-plan created
  (`20260727-1022-auth-rollout-phaseB-csharp-clean-cut.md`) with a Fable/Sonnet
  ownership split per user direction: Fable = C# update + certification sign-off,
  Sonnet 5 = live registration/deploy/docs. Grounded in a fresh DSL-repo survey; key
  finding recorded: NOTHING in the DSL repo writes UserModel and no register POST
  exists — mechanical corroboration of the "never utilized" premise for the clean cut.
- 2026-07-27T10:45-05:00 Phase B FABLE HALF DONE + CERTIFIED (sub-plan steps 1-2 [x]):
  the C# clean cut is implemented (legacy JWT/password machinery deleted outright,
  SSO hand-off + Ed25519 assertion client + cached introspection middleware + JIT
  provisioning in) and locally certified 20/20 + 4/4 against a scratch hub through
  real HTTP — incl. audience isolation (a valid foreign-service token refused) and
  outage softening (stale-grace 200 / anonymous degrade / readable 503). Box B stays
  unchecked: Sonnet owns live registration, the one-time TABLE_USERS check + deploy +
  live E2E, and docs (sub-plan steps 3-5).
- 2026-07-27T11:20-05:00 Phase B COMPLETE + DEPLOYED LIVE (Sonnet finished steps 3-5).
  `shattered-web` registered against live hub data + its production redirect URI; the
  live `shatteredarchive-csharp` container (own compose project, this same host,
  `C:\Projects\DSL\Server\docker-compose.yml`) needed joining auth-server's internal
  `shatteredarchive_shatteredarchive` network — `auth.shatteredarchive.dev` resolves
  to 127.0.0.1 from inside ANY container here (hosts-file leak into container DNS),
  confirmed via a throwaway probe container before touching the live service. Live
  TABLE_USERS check: zero rows at the byte level in production's db.sqlite (not just
  zero valid ones) — hard confirmation of "never utilized" on real data, not just
  Fable's local copy. Rebuilt (Release; this Dockerfile copies a host-built binary,
  not a source build) and redeployed. LIVE E2E ROUND 1 caught a real bug local
  certification missed: the browser-facing SSO redirect used the internal-only
  docker alias (unreachable from an actual browser) because AuthHubOptions had a
  single BaseUrl serving both the server-to-server and browser-facing audiences.
  Fixed with a second `AuthorizeBaseUrl` field (falls back to BaseUrl, so local dev
  is unaffected) + `IAuthHubClient.PublicBaseUrl`; rebuilt, redeployed. LIVE E2E
  ROUND 2: **16/16 PASS** against the real production hub and the real redeployed
  site — full SSO round trip, hub-side introspect confirms audience `shattered-web`/
  `tokenType sso`, anonymous regression clean, legacy endpoints dead, and a
  freshly-minted foreign-audience token is refused (audience isolation proven on
  production, not just locally). Full evidence:
  `.ai-plans/20260727-1022-auth-rollout-phaseB-csharp-clean-cut.md`. Docs
  (`docs/auth-server.md` gained the deploy-topology + dual-base-URL lesson) and
  `.annotated`/`.ai-context` refreshed. Residue (same accepted precedent as Phase
  A/A2): two throwaway hub accounts + one foreign-audience probe key. Umbrella now
  3/10. Next: **C** (C# user-data APIs + central dashboard shell).
- 2026-07-27T11:50-05:00 **CORRECTION**: the entry above (and the sub-plan) wrongly
  called the `shatteredarchive-csharp` deploy "live"/"production." User clarified:
  that container is a **local development/testing replica** on the user's own
  machine, running alongside this repo's own `auth-server`/`auth-client` dev stack —
  the real `shatteredarchive.com` is a separate, unrelated remote machine untouched by
  any of this program's work so far. Concretely wrong as a result: `shattered-web`'s
  redirect URI was registered as `https://shatteredarchive.com/...` (unreachable from
  a browser on the dev machine) — fixed to `http://localhost:5000/user/sso/callback`;
  `docker-compose-prod.yml` (the actual template for the real separate host) had been
  wrongly given this dev machine's internal-network specifics, which would have made
  it fail to start there — reverted with a clear TODO for whoever eventually deploys
  to the real host to verify its actual reachability to an auth hub. Live E2E re-run
  16/16 against the corrected local loop. Full detail in the sub-plan's own
  correction entry. Lesson for phases C-I: do not assume any docker container visible
  from this workspace is "the real production site" without confirming — this
  environment is the developer's own local test replica of the stack.
- 2026-07-27T16:00-05:00 **Phase C COMPLETE** (sub-plan
  `.ai-plans/20260727-1243-auth-rollout-phaseC-csharp-user-content-dashboard.md`,
  all 7 steps done + verified). New per-account cloud storage on the C#
  service: whole-collection scripts + plugin-config save/load (mirrors
  game-client's exact local shapes, server-side validation floor, count-capped);
  real per-item CRUD for book bookmarks and named maps (discovered and fixed a
  fundamental data-layer gap along the way — the sqlite backend's `Key` is the
  ONLY real row identity, `SortKey` is decorative, so one-to-many content needs
  a globally-unique composite `Key`; also added the first-ever `DeleteItem<T>`
  primitive, since nothing in this codebase had ever deleted a row before);
  game-log uploads with real size (8 MiB) and retention (25/account, oldest
  evicted) caps; Decision 4's delegated-role hierarchy shipped for real
  (owner>admin>manager>trusted>user, hub-owner bootstrap, strictly-below
  assignment ceiling, wired to the `CanCreateBooks` permission) — a full live
  bootstrap was proven end to end including that it correctly does NOT
  re-fire for a second owner login; and `user/dashboard` rebuilt as the
  roll-up shell surfacing all of the above plus placeholder cards for Phase
  H's remote-service fan-out. Every step individually build-verified + live
  E2E'd against the local dev loop (13-19 checks per step, real bugs caught
  and fixed at nearly every step — validation-batch atomicity, a book id that
  doesn't actually exist in this DSL install, a test harness verb bug, and a
  genuine hub `LoginLockout`/`ChallengeThrottle` rate-limit encounter that
  cost real debugging time but confirmed those anti-abuse mechanisms work as
  designed) plus a final 9-check full-regression sweep with one fresh account
  touching every content type + the dashboard together. No player-facing doc
  existed to update (searched, confirmed absent). Umbrella now 4/10. Next:
  **D** (Web Game wiring, apps/game-client).
- 2026-07-27T19:10-05:00 **Phase D COMPLETE** (sub-plan
  `.ai-plans/20260727-1420-auth-rollout-phaseD-game-client-wiring.md`, all 4
  steps done + verified). game-client (no router, no service key of its own —
  a public client) gets an optional hub login: the C# site's backend performs
  the code exchange on game-client's behalf (key custody), hands the token
  back over a URL fragment, and game-client can then save/load the current
  connection's userScripts + plugin configs to/from Phase C's per-account
  APIs. Two real bugs caught by live testing: `AuthHubClient.AuthorizeUrl`
  was hardcoded to the site's OWN redirect URI for every caller (a real
  browser would've silently landed on the wrong callback — fixed with
  explicit `redirectUri` overloads on both the authorize and exchange calls,
  since the hub's code store requires an exact match between the two); and a
  first E2E run "passed" by accident by reading a value back out of its own
  wrongly-generic output instead of asserting what a real redirect chain
  actually carries. `Cors:AllowedOrigins` flipped for real, off the historical
  `AllowAnyOrigin` default Phase B had left in place. Every step build- and
  live-E2E-verified against the real local dev hub + C# backend (11/11,
  10/10 unit, 14/14 across two runs, and a final consolidated regression
  pass) with two runs' worth of real bugs caught and fixed, not just tests
  patched around; full detail incl. two client-side findings worth
  remembering (a private vs. public API split on `UserScriptRuntime`, and
  `usePlugins.ts` having no live cross-component sync) in the sub-plan and in
  memory (`auth-rollout-program.md`). `docs/auth-server.md` gained a Phase D
  narrative section and `docs/features/user-account.md` (new) documents the
  feature for future maintainers, linked from `docs/context.md`'s doc map.
  Umbrella now 5/10. Next: **E** (Mobile wiring, shatteredarchive-mobile).
- 2026-07-27T19:20-05:00 **Phase E DEFERRED** (user-directed): an open branch
  in `shatteredarchive-mobile` already adds better iOS compatibility, and the
  user does not want auth wiring done twice against a codebase mid-refactor
  there. Skipping ahead to **F** (Kingdom Tactics) instead; E stays `[ ]` and
  unstarted, to be picked back up once that iOS branch lands/merges — do not
  start E without re-confirming that branch's status first.
- 2026-07-28T13:20-05:00 **Phase F COMPLETE** (sub-plan
  `.ai-plans/20260727-1930-auth-rollout-phaseF-kingdom-tactics.md`, all 4
  steps done + live-verified, incl. a real docker deployment). Kingdom
  Tactics' WS `join` frame now carries an optional bearer token (introspected
  server-side, attached to the claimed seat as an accountId) purely
  additively — no token, an invalid one, or an unreachable hub all degrade
  to today's fully-anonymous join, never a rejection. Completed matches
  persist as history + a deterministically-replayable action log (the
  hidden-outcome combat salt never leaves the server; replay runs
  server-side and returns only the resulting state sequence) plus
  account-scoped army-layout cloud sync, all gated by the SAME introspection
  wiring as the WS resolver but the OPPOSITE failure policy (401, not
  anonymous — "my match history" has no anonymous equivalent).
  kingdom-tactics-server is, unlike game-client, a REAL backend and performs
  its OWN SSO code exchange with its OWN registered key (a standard Phase A
  consumer, not a borrowed-key one) — its new `/api/kt/auth/start`/
  `/api/kt/auth/callback` routes are this service's first-ever HTTP surface
  beyond `/`/`/health`. kt-client gained a login + dashboard + a replay
  viewer that reuses the existing `Arena` component in read-only mode (zero
  new board-rendering code) and army-layout cloud save/load.
  **Deployed for real this phase** (per explicit user direction, "Full
  deploy now"), not just prepped: two new Dockerfiles, a new
  `kingdom-tactics.shatteredarchive.dev` edge-nginx subdomain
  (single-subdomain design — confirmed as the REAL working pattern in this
  repo by finding that game-client's OWN Dockerfile silently ignores the
  separate-subdomain build args its compose block passes), new compose
  service entries, a real hub redirect-URI registration for the deployed
  callback URL, and the two containers actually built and started — live
  end-to-end verified through the ACTUAL deployed containers and edge
  routing (9/9), with the rest of the running stack (18 other containers)
  confirmed unaffected. Two real bugs caught by doing this for real rather
  than stopping at prep: a missing `COPY deploy/.env` line (crash-looped on
  first boot) and a `.dockerignore` gap that would have baked this session's
  own live-test residue (real, if low-stakes, test data + a private key)
  into the image. `.dockerignore` fix benefits every existing service's
  future builds too, not just this one. One new hosts-file entry is needed
  on the user's machine for browser access (`kingdom-tactics.shatteredarchive.dev`)
  — flagged explicitly, since this repo/session cannot edit that system
  file itself. Full evidence, all real bugs found/fixed, and the exact
  design-correction reasoning (why single-subdomain over the originally-
  planned separate-subdomain approach) are in the sub-plan's own Step 4
  entry. Umbrella now 6/10. Next: **G** (MUD Builder per-user content +
  role-gated Engine) — or resume **E** (Mobile) if that iOS branch has
  landed by then.
- 2026-07-28T14:05-05:00 **Phase F final sign-off** (user added the
  `kingdom-tactics.shatteredarchive.dev` hosts entry and asked for a final
  live-tested review). Caught and fixed one more real deploy bug that only
  surfaces over the ACTUAL public scheme: this repo's nginx keeps HTTP
  (`edge-subdomains.conf`) and HTTPS (`nginx/includes/tls-dev.conf`) as two
  separate, hand-mirrored file trees with no shared routing — Phase F's own
  Step 4 only added the HTTP block, so `https://` 404'd at nginx's default
  catch-all, meaning a real login would have silently failed. Fixed (added
  the matching HTTPS block, restarted nginx to reload it — `docker compose
  up -d` alone does NOT reload a bind-mounted file's content). Full 10/10
  live E2E re-run through the real public hostname/HTTPS/`wss://`, incl. a
  complete match played to a decision — the highest-fidelity verification
  this program has done yet. **Lesson for every future phase that adds a
  new subdomain**: `edge-subdomains.conf` and `nginx/includes/tls-dev.conf`
  BOTH need the new server block, or HTTPS silently 404s while HTTP works
  fine — easy to miss since local dev testing often defaults to the
  Host-header/direct-connection shortcuts that never exercise the HTTPS
  path at all.
- 2026-07-28T09:45-05:00 **Phase G COMPLETE + DEPLOYED LIVE** (sub-plan
  `.ai-plans/20260728-0858-mud-builder-phaseG-roles-content.md`). Two additive
  features: (1) mud-builder's own delegated role ladder
  (`owner>admin>manager>trusted>user`, Decision 4) — a new Roles tab, a
  `canGrant()` ceiling rule mirroring auth-server's own admin-guard.ts
  invariant exactly ('owner' never HTTP-assignable by anyone, including
  master), and the Engine tab's rebuild trigger retargeted from Phase 15's
  static `MUD_REBUILD_ALLOWED_USERNAMES` env-var allowlist onto this store
  (admin tier+); (2) private per-account snippets — save/load
  Room/Mob/Object/Script templates via a new My Content tab, never touching
  the live area files, whole-collection GET/PUT (discovered mid-build that
  this — not per-item CRUD — is kingdom-tactics-server's actual established
  precedent for per-account storage, a better mirror than the sub-plan's own
  upfront guess). Real bug found and fixed along the way: mud-builder-server's
  jest config mapped `@shatteredarchive/services-server` straight to
  `auth-introspect-client.ts` alone (dodging the full barrel's `uuid`-via-
  mud-client-service ESM problem) — needing `SERVICE_TIERS`/`canManage` too
  required a new `services-server/src/auth.ts` aggregate (introspect client +
  tier convention, real source, not a test shim). 432 tests green across the
  three touched packages, clean typecheck/build, live-deployed to
  `build.shatteredarchive.dev` (rebuild triggered via the OLD code's
  still-live master-key path — no chicken-and-egg problem since master
  bypasses eligibility either way) and smoke-tested against the real running
  containers: the served client bundle's content hash matched the local
  build byte-for-byte, the 'owner' ceiling 400s live even for master, a
  grant/list round-trip against a synthetic account worked, snippets 403s
  the master key correctly (no accountId). One live deploy classifier denial
  along the way — the harness's auto-mode classifier blocked the raw
  `POST /api/rebuild` call as a production action needing explicit
  confirmation separate from the standing task authorization; stopped and
  asked rather than working around it, user said go ahead. **Known
  follow-up**: removing the env-var allowlist means 'melchaleve' has no
  recorded accountId yet (never authenticated to mud-builder-server via an
  account token before) — needs one login via auth-client, then either
  self-grant (if a hub owner/admin) or hand the accountId to whoever holds
  the master key. Umbrella now 7/10. Next: **H** (Site dashboards for Mapper
  + LogViewer, then central roll-up) — or resume **E** (Mobile) if that iOS
  branch has landed by then.
- 2026-08-01T00:00-05:00 **Phase E code complete** (user-directed resume, ahead
  of H). Deferral condition re-checked first as the plan required: the iOS
  branch has NOT landed (`feature/ios-device-builds` is 7 commits ahead of
  `origin/main`, nothing merged back). Resumed anyway because the user asked
  and because building ON that branch — which is checked out and clean — is
  precisely what avoids the "auth wiring done twice" the deferral was guarding
  against. New `dsl-client/features/auth/` (auth-fragment, auth-token-storage,
  site-api, game-sso, cloud-sync, use-account) + `components/AccountSection.tsx`
  in a new Settings "Account" section. Same public-client posture as
  game-client: no service key ships, the C# site brokers the exchange.
  Divergences from the web client, all forced and all deliberate:
  (1) the popup becomes `WebBrowser.openAuthSessionAsync` — the browser layers
  OVER the app rather than replacing it, so the connection-manager singleton
  and its FGS keepalive are untouched, satisfying the no-regression constraint
  by construction rather than by test; (2) token lives in Keychain/Keystore via
  a NEW `expo-secure-store` dep (user chose this over the zero-native-cost
  AsyncStorage option), key `auth.token` since SecureStore rejects the ':' the
  other stores use; (3) return URL is a hardcoded `dslclient://auth-callback`,
  not `Linking.createURL()`, which returns a per-machine `exp://<lan-ip>:8081`
  URL under Expo Go that no server-side allowlist can match. That exact string
  was added to `GameSso:AllowedReturnOrigins` in BOTH DSL appsettings files —
  legal because `IsAllowedReturnOrigin` (UserController.cs:254) compares
  `scheme://authority`, so a custom scheme validates fine. Both committed
  native projects already register the scheme, so no prebuild is needed.
  **Two real shape gaps found and handled in cloud-sync.ts** (the "exact same
  shapes" premise in this step's Do was only half true): plugin state is
  per-plugin locally but one array of full records in the cloud, so there is an
  explicit mapping layer that applies through the engine (so `onEnable` runs)
  and cycles an enabled plugin whose config changed; and the cloud carries
  scripts in 'lua'/'python'/'typescript', which this app has no runtime for —
  they are stored verbatim rather than dropped (a round trip through a phone
  must not destroy web-authored work) and the count is surfaced in the UI.
  Books sync stays out of scope, consistent with Phase D's correction. Also
  fixed a pre-existing blocker: `dsl-client/pnpm-workspace.yaml` had a
  duplicated `nodeLinker` key that made EVERY `pnpm add` in that repo fail.
  Verified mechanically: full suite 225/225 green (17 suites, incl. 6 new
  fragment-parser tests), `tsc --noEmit` at the documented 7-error baseline
  with none in new code, eslint clean on every new/edited file.
  **NOT verified, and why**: this step's Verify clause (web↔mobile round trip,
  auth surviving background/restart) needs a real device — and iOS needs
  `pod install` for the new native module, which cannot run from this Windows
  host. Step stays `[ ]` until that happens. Umbrella still 7/10.
- 2026-08-01T00:00-05:00 **Phase E follow-on: mobile script-language parity**
  (user-directed, closing the gap the previous entry flagged). The mobile app
  now RUNS all five of the web client's script languages instead of carrying
  three of them as inert data: `features/scripts/lua-runtime.ts` (fengari — the
  plain package, not the web's `fengari-web`, whose browser glue is meaningless
  on RN; identical lua/lauxlib/lualib/to_luastring surface),
  `python-runtime.ts` (Skulpt, same engine as web), `ts-transpile.ts` (sucrase
  ~1.6MB instead of the web's full `typescript` ~8MB — same type-erasure job at
  a size that belongs in a phone bundle). Bundle cost ~2.5MB, all lazily
  required so a player who writes none of these never initialises them.
  `UserScriptLanguage` widened to match web exactly; ScriptEditorModal offers
  all five (LANGUAGE_* tables replacing the two-language ternaries);
  cloud-sync's "unrunnable scripts" warning deleted as obsolete.
  **Deliberate design rule, worth keeping**: the Lua/Python bindings mirror the
  web client's EXACTLY — no supersets — because scripts sync between the two
  clients through one account, so a binding present on only one side yields
  scripts that silently do nothing after a round trip. Where mobile's sandbox
  API has no equivalent (httpGetJson, runGlobal — there is no global-script
  store here) the binding is simply absent, which is what web's own `if (api.x)`
  guards would do anyway.
  **Real finding about the WEB client**: its Python `read()`
  (pythonRuntime.ts:192) throws unconditionally, so `import math` — any stdlib
  import — fails there. Mobile's serves Skulpt's bundled stdlib instead (still
  no filesystem reach). This is the one intentional behavioural divergence, and
  it is strictly a superset, so no script that works on web breaks here.
  Verified by 14 new tests that drive the REAL interpreters (not mocks) through
  the actual sandbox API — loops, api-table vs bare-global spellings, global/
  named var round trips, stdlib import, and syntax/runtime errors landing on
  api.error instead of throwing at the per-line trigger loop. Suite 239/239,
  tsc at the 7-error baseline, eslint clean (the 5 warnings in touched files
  are all pre-existing, confirmed against HEAD).
  **Still device-unverified, and now with a sharper risk**: iOS runs Hermes
  (`ios/Podfile.properties.json`), while `android/gradle.properties` carries a
  contradictory `hermesEnabled=true` alongside `expo.jsEngine=jsc` — worth
  resolving. Lua is immune (an interpreter needs no eval), but Python and
  TypeScript both end in dynamic code, exactly like the JS path that already
  ships — so if `new Function` were blocked on device, existing JS scripts
  would already be broken, making this no worse than today's status quo.
- 2026-08-01T00:00-05:00 **Phase E follow-on 2: global script store + shared-
  interface alignment** (user-directed, all three repos per an explicit scope
  decision). Global scripts — the per-language shared source files that
  triggers/aliases/timers call via `runGlobal("global.<lang>.<thing>")` — now
  exist on mobile AND sync, which required new backend surface because the
  cloud had NO globals endpoint and the web client never synced them either.
  * **DSL (C#)**: `TABLE_GLOBAL_SCRIPTS` + `GlobalScriptsModel` + GET/PUT/DELETE
    `/api/user-content/global-scripts`, validated per bucket (connectionId,
    sources restricted to the four EXECUTABLE languages — 'text' has no global
    form — 256KB/language, 50 buckets, duplicate connectionId rejected rather
    than letting client iteration order decide the winner). Builds clean.
  * **game-client**: globalScriptsStore gains the cloud shape
    (GlobalScriptBucket + getAllGlobalScriptBuckets/replaceGlobalScriptBuckets)
    and Account save/load carries globals. getAllGlobalScriptBuckets reads
    localStorage DIRECTLY, not the cache: a connection this session never
    opened was never cached, and a cache-only read would silently drop its
    globals on save.
  * **mobile**: global-scripts-storage.ts (device-wide, syncing as the
    "default" bucket per the scoping decision) + global-runtime.ts with real
    persistent per-language state + the globals editor (Scripts → Globals).
    Its save is a read-modify-write that preserves every OTHER bucket —
    a blind PUT of just the phone's bucket would wipe the web's connections.
  * **the shared interface**: mobile's `ScriptSandboxApi` was a SUBSET of the
    web's — missing `runGlobal` and `httpGetJson`. Both added and bound across
    every runtime (JS/TS/text via script-runtime, plus the Lua and Python
    bridges), so all five languages now bridge from ONE interface definition
    rather than each hand-rolling its surface. Text scripts also gained the
    bare-global-identifier line form. The type now carries a comment saying to
    keep it in step with the web's copy, which is the actual invariant.
  **Two more real bugs found in the WEB client while porting** (both mean its
  Python globals cannot work today, and neither is fixed there yet):
  (1) `importMainWithBody(name, ...)` registers the module as `__main__`
  regardless of `name`, so globalRuntime's throwaway caller doing
  `import <name> as g` can never resolve; mobile keeps the returned module
  OBJECT and reads attributes off it directly (which also stops interpolating a
  caller-supplied function name into Python source). (2) the earlier `read()`
  finding still stands. **Parity rule held**: JS/TS globals use the web's
  CommonJS `exports.foo = ...` wrapper and a bare `function foo(){}` is
  deliberately NOT collected, because it is not collected on the web either —
  supporting it would produce globals that work on the phone and silently do
  nothing in the browser. The UI hints teach the correct convention.
  Verified: mobile 252/252 (13 new global-runtime tests driving the real
  interpreters, incl. persistence-across-calls and reload-on-edit), game-client
  50/50, both typecheck clean (mobile at its 7-error baseline), C# builds,
  eslint clean apart from pre-existing warnings. Still device-unverified, and
  the globals round trip is now also **live-unverified** — the new C# endpoint
  has never been exercised against a running service.
- 2026-08-01T00:00-05:00 **Script PORTABILITY (export/import), and a correction
  to the previous entry's Python claim.** User pushed back on "web Python is
  broken"; reproduced both claims against the web's exact code path and the
  earlier entry was too broad. Corrected: web per-script Python WORKS for the
  bridge API (sendCommand/log/loops all fine) — its throwing `read()` only
  breaks `print()` and `import <anything>`. The GLOBAL-python bug is real and
  confirmed: `importMainWithBody(name,...)` registers the module as `__main__`
  regardless of `name`, so globalRuntime's `import <name> as g` fails with "No
  module named sa_globals" and web global-python functions cannot be called.
  **The user then reframed the actual goal: export/import portability**
  (web→mobile, mobile→web, web→web, mobile→mobile incl. iOS+Android), NOT cloud
  sync. Auditing that found the languages were never the real blocker — the
  ENVELOPE was:
  * web wrote `{schema, items:[{key, value}]}`; mobile's import accepted only a
    bare array or `{scripts:[]}` ⇒ **web→mobile broken**
  * mobile wrote a bare array ⇒ **mobile→web broken**
  * web's import filtered `it.key === targetKey` (the CURRENT connection's
    storage key) ⇒ **web→web broken across two different connections** — a file
    only ever imported back into the connection it was exported from
  * neither export carried global scripts ⇒ any imported script calling
    runGlobal silently did nothing
  Fixed with ONE envelope both clients read and write (new mobile
  `features/scripts/script-export.ts`; web's tryParseExportFile/buildExport/
  handleImportApply relaxed and extended): `key` and `storage` are now
  INFORMATIONAL on import, globals ride along as a `kind: 'globalScripts'` item,
  and both sides still read the legacy bare-array / `{scripts:[]}` files. A
  legacy file yields globals=null rather than empty sources, so importing an old
  export cannot wipe the importing device's globals. isValidUserScript is
  structural only, so a script with fields from a newer client survives.
  Verified: 10 new round-trip tests asserting each of the four goals against the
  REAL parsers (incl. a synthesized web-format file with a foreign key/storage),
  mobile 262/262, game-client 50/50, both typecheck clean, 0 lint errors.
  iOS/Android need no divergence — one code path, and the format is plain JSON.
  Still unverified: a real device run and a real file handed between two actual
  installs; the C# global-scripts endpoint remains live-untested.
- 2026-08-01T00:00-05:00 **Web client's Python defects FIXED** (user-directed;
  closes the follow-up left open by the previous two entries). Both fixes went
  into `apps/game-client/src/features/userScripts/pythonRuntime.ts` and needed
  NO change to globalRuntime.ts — the signatures were kept, only the internals
  replaced:
  (1) `read()` no longer throws; it serves Skulpt's bundled stdlib
  (`Sk.builtinFiles.files`), which restores every `import` AND `print()`. The
  print() breakage is the non-obvious half: Skulpt reaches for `sys` to get at
  stdout, so a throwing read() killed print even with no user import in sight.
  Nothing reachable this way touches a real filesystem or the network.
  (2) global modules are now held as Skulpt module OBJECTS in a Map keyed by
  module name, and `callPythonModuleFunction` reads the attribute off that
  object via tp$getattr + callsimOrSuspendArray. The old path loaded under
  `moduleName` then ran a throwaway module doing `import <moduleName> as g`,
  which could never resolve because importMainWithBody registers as `__main__`
  regardless of the name. Side benefit: no more interpolating a caller-supplied
  function name into generated Python source.
  Both now behave identically to mobile's implementation, which is the actual
  requirement — a Python script has to be portable between the two clients.
  **Why this survived so long**: the bridge API (sendCommand/log/loops) worked
  throughout, so Python "worked" for anyone not using print, import, or globals.
  That is exactly the trap that made the earlier progress-log entry overstate
  the bug, and the user was right to push back on it.
  Verified with a NEW `pythonRuntime.test.ts` running the REAL Skulpt engine in
  game-client's own jest project (9 tests: bridge/loops regression, print(),
  stdlib import, syntax-error routing, global call, None args, module-level
  state across calls, missing function, never-loaded module). Client suite
  50 → 59, all passing; tsc clean. Mobile suite still green after refreshing the
  now-stale "the web client is broken" comments in its own runtime and tests.
  Not verified: a browser run against a live game session.
- 2026-08-01T00:00-05:00 **auth.shatteredarchive.dev wired for PRODUCTION**
  (user-directed). Three files, one per hop of the real chain — a topology the
  user corrected mid-task and worth recording plainly:
  `internet -> DSL/nginx/shattered_archive.site (FRONT proxy, TLS terminates
  here) -> docker host 51.222.137.28 -> ShatteredArchive/deploy/nginx/
  edge-subdomains.conf (container edge, runs tls-off.conf) -> app containers`.
  * FRONT proxy (DSL/nginx/shattered_archive.site): auth. was a 503 "coming
    soon" STUB — the actual reason the hub was unreachable publicly. Replaced
    with a real proxy block to the docker host, modelled on the scrum-poker
    block per that file's own go-live instructions, minus the websocket carve-
    out (the hub has none — the docker edge splits /api/* and /health to
    auth-server:62000 and / to auth-client:80 itself). HTTP->HTTPS needed NO
    change: the port-80 block already covers *.shatteredarchive.dev and ends in
    an unconditional 301. build./kingdom-tactics. stay stubs.
  * SA prod compose (deploy/docker-compose.yml): auth-server now ALSO joins
    sa-shared under the SAME alias it has internally. This was the real cross-
    project gap — the C# site is a DIFFERENT compose project and could not
    resolve the hub on any network they shared, so it had no internal route at
    all and would have had to hairpin out through the public front proxy.
  * C# prod compose (DSL/Server/docker-compose-prod.yml): replaced the
    unverified guess AuthHub__BaseUrl=https://auth.shatteredarchive.dev with the
    pair Phase B's live bug proved necessary — BaseUrl=
    http://auth-server.shatteredarchive.dev:62000 (server-to-server, internal
    alias, plain HTTP, direct to the port so service traffic is not charged
    against the edge's browser-sized limit_req zones) and AuthorizeBaseUrl=
    https://auth.shatteredarchive.dev (browser-facing consent redirect).
    AuthorizeBaseUrl falling back to BaseUrl when unset is EXACTLY the Phase B
    failure — an internal alias handed to real browsers — so set both, always.
    Also added GameSso__AllowedReturnOrigins__1=dslclient://auth-callback
    explicitly rather than relying on appsettings.json supplying index 1 while
    the compose supplies index 0 (that merge works, but makes the allowlist
    depend on two files agreeing about array indices). Recorded the ordering
    constraint: sa-shared is owned by the SA prod stack, so it must come up
    first or `docker compose up` here fails outright.
  Verified mechanically: `docker compose config` clean on both compose files,
  the rendered auth-server really does carry the alias on BOTH networks,
  AuthHub:AuthorizeBaseUrl confirmed present in AuthHubOptions.cs (with
  NormalizedAuthorizeBaseUrl doing the fallback), and the edited front-proxy
  config passes a real `nginx -t` (nginx:alpine container, cert-stubbed copy,
  since the letsencrypt paths do not exist on this machine).
  NOT verified and cannot be from here: this is the local dev-replica machine;
  the real production host is a separate box this repo does not deploy to.
  Live checklist for whoever does: shared multi-SAN cert must already include
  auth. (it does per ssl-cert.md) and be installed BEFORE this config; SA prod
  stack up before the C# stack; then confirm a browser login round trip AND a
  server-to-server token exchange.
- 2026-08-01T00:00-05:00 **Device build FIXED: fengari's Node-core imports broke
  the Metro bundle** (user hit it on a real Pixel 8 dev-client run). First
  genuine on-device finding of this whole mobile arc, and it invalidates the
  earlier assumption that jest passing meant the language runtimes would load.
  Root cause: fengari targets Node AND the browser and picks between them with
  `typeof process === "undefined"`. React Native DEFINES `process`, so fengari
  took the NODE branch and required os / fs / path / child_process / tmp /
  readline-sync. Metro resolves requires STATICALLY, so this failed the whole
  BUNDLE, not just an unreachable call — the build died on luaconf.js importing
  "os". (`fengari-web` is NOT the fix: same VM plus DOM glue, and it would take
  the same Node branch here because the deciding factor is `process`, not the
  package.)
  Fixed with six shims in `dsl-client/shims/`, wired via metro.config.js's
  `resolver.resolveRequest` and SCOPED to requests whose originModulePath is
  inside fengari. The scoping is the load-bearing part: the global alternative
  (`resolver.extraNodeModules`) would hand a deliberately-crippled `fs` to any
  other dependency that legitimately wanted one, converting a loud bundling
  error into a silent runtime failure somewhere unrelated.
  Most shims THROW rather than emulate, which is enforcement rather than an
  unfinished polyfill: they back Lua's io.*, os.remove/rename, os.execute,
  os.tmpname and debug.debug — none of which a user script should reach on a
  phone, given scripts arrive from a synced cloud account and from files people
  hand around. The web client cannot do any of it either, so nothing portable is
  lost. Each message names the Lua feature and points at the script API.
  readline-sync is stubbed as a WHOLE PACKAGE rather than through its own Node
  imports, so it does not drag fs/child_process/path into the bundle for a
  feature that can never run.
  Verified: `npx expo export` now succeeds for BOTH platforms (android 7.58MB,
  ios 7.59MB Hermes bytecode), suite still 262/262, eslint clean on the shims
  and metro config.
  Two things this run did NOT settle, worth stating plainly: the bundle building
  does not prove `new Function` WORKS at runtime under Hermes (it is a runtime
  capability, and JS/TS/Python all depend on it — Lua does not, being an
  interpreter), and `android/gradle.properties` still carries the contradictory
  `hermesEnabled=true` + `expo.jsEngine=jsc` noted earlier, while the export
  emits .hbc bytecode. Both want a real on-device script run to confirm.
- 2026-08-01T00:00-05:00 **JS-engine discrepancy RESOLVED — it was dead config,
  not a conflict.** The `hermesEnabled=true` + `expo.jsEngine=jsc` pair in
  android/gradle.properties (flagged twice in earlier entries as a risk) turned
  out to have no behavioural effect at all, and the earlier entries overstated
  it. Traced mechanically:
  * ANDROID engine is chosen SOLELY by `hermesEnabled`, consumed directly in
    android/app/build.gradle:186 —
    `if (hermesEnabled.toBoolean()) { implementation("com.facebook.react:hermes-android") }`
  * `expo.jsEngine` is an iOS-ONLY property. The only readers in node_modules are
    @expo/config-plugins' ios/BuildProperties.js and the iOS branches of
    @expo/cli's exportHermes.js. No .gradle file reads it. iOS sets it correctly
    in ios/Podfile.properties.json ("hermes"), which its Podfile consumes for
    :hermes_enabled.
  * expo export's own consistency check (exportHermes.js isEnableHermesManaged)
    reads the APP CONFIG (app.json has no jsEngine -> defaults to Hermes) and
    cross-checks gradle.properties' `hermesEnabled` — both said Hermes, which is
    why the export never raised its "engine configuration is inconsistent" error.
  So the app has been running Hermes on BOTH platforms all along. Resolution was
  to DELETE the misleading line (with a comment explaining why not to re-add it)
  rather than change engines. Proof it was inert: the Android bundle hash after
  removal is byte-identical to before (entry-b5991906f65d445019276b0cf831d38b.hbc).
  **Justification for staying on Hermes**, recorded because the scripting feature
  makes this a real decision rather than a default: Hermes gates eval()/
  new Function() behind a build-time flag (`-enable-eval`, visible in hermesc's
  --help), and script-runtime.ts compiles every JS and TS user script with
  `new Function` — Python too, since Skulpt compiles Python to JS. Only Lua is
  immune (fengari is a true interpreter, generating no code). The decisive
  evidence is that this already works: JS user scripts predate all of this work
  and run on device under Hermes. Switching to JSC would therefore not be a fix
  but an unverified change, and on iOS would additionally require pod install
  plus rebuilding the committed native project on the free-team-signing branch.
  A `hermesEnabled` comment now states this so nobody flips it casually.
  Could NOT be proven locally: hermesc is compile-only ("hermesc does not support
  -exec"), so Hermes' runtime eval behaviour cannot be exercised on this Windows
  host — it needs one JS user script run on the device.
  **SECOND, UNRELATED discrepancy found and deliberately NOT changed**: the new
  architecture flag disagrees across platforms — android/gradle.properties says
  `newArchEnabled=false` while app.json says `true` and ios/Podfile.properties
  .json says `"true"`. So Android builds old-arch and iOS new-arch today. Unlike
  the engine line this one IS behavioural, but flipping it can break native
  modules (this app ships several: tcp-socket, foreground-service, speech
  recognition) and belongs with a real device test rather than a config cleanup.
  Flagged for the user, left alone.

## OPEN ITEM (needs evaluation, not yet actioned)

**Mobile new-architecture flag disagrees across platforms** — raised 2026-08-01,
deliberately left unchanged pending a real device evaluation.

| file | value |
|------|-------|
| `dsl-client/android/gradle.properties` | `newArchEnabled=false` |
| `dsl-client/app.json` | `"newArchEnabled": true` |
| `dsl-client/ios/Podfile.properties.json` | `"newArchEnabled": "true"` |

So **Android builds old-arch and iOS builds new-arch today**. Unlike the
`expo.jsEngine` line resolved the same day, this one IS behavioural — it is not
dead config.

Why it was not simply "fixed": flipping Android to the new architecture can break
native modules, and this app ships several that matter to its core loop —
`react-native-tcp-socket` (the game connection itself), `@supersami/rn-foreground-service`
(background keepalive, see memory `mobile-connection-persistence`), and
`expo-speech-recognition`. A config-only change with no device run would be
exactly the kind of unverified edit that the JS-engine investigation showed is
easy to talk yourself into.

Evaluation should answer, on a real device per platform:
1. Does Android still build and run with `newArchEnabled=true`?
2. Do tcp-socket, the foreground service, and speech recognition still work?
3. Does the background connection still survive backgrounding (the regression
   this repo cares most about)?
4. If new-arch is not viable on Android yet, is the correct resolution instead to
   set app.json + iOS back to `false` so all three agree the other way?

Note that app.json's value is what `expo prebuild` would WRITE into
gradle.properties, so a future prebuild flips Android to new-arch silently. That
makes this worth resolving rather than leaving indefinitely.
- 2026-08-01T00:00-05:00 **Plugin interoperability: configuration now travels by
  FILE as well as by cloud** (user-directed). Cloud sync already carried plugin
  configs; export/import did not, so a configured plugin could not be handed to
  another device or the other client without an account.
  **Premise checked first, and it holds**: all 18 plugin ids are IDENTICAL
  between the two clients (affect-echo, brew, colorkit, combat-compression,
  disarm, enchant, gourd, highlighter, people, questbot, respell, roller,
  standup, stun-highlight, text-to-speech, voice-dictation, warlock-alphabet,
  weapon-flag-squelch). That id overlap is the whole reason sharing config is
  meaningful rather than theoretical; an id the importing client lacks is
  skipped and reported, never an error.
  * Extracted the local<->portable plugin mapping out of features/auth/
    cloud-sync.ts into `features/scripts/plugin-records.ts`, so cloud sync and
    file export use ONE implementation. It belongs with scripts; auth was only
    ever one consumer.
  * Envelope gained a `kind: 'pluginConfigs'` item on BOTH clients, carrying the
    same InstalledPluginRecord shape the cloud endpoint uses — one shape, two
    transports. Mobile applies it LIVE through the engine (onEnable runs, a
    reconfigured plugin is cycled). Web merges by id into its installed list and
    skips unknown ids rather than adding phantom Plugins-page rows.
  * Kept the null-vs-empty distinction that already guarded globals: a null
    plugin item means "leave local config alone" (what every pre-existing export
    file yields), while [] means "a file that genuinely carries none". Collapsing
    them would let an old export silently wipe plugin configuration.
  **Real bug caught by the test suite, worth remembering**: importing the record
  type/validator from plugin-records.ts made script-export.ts pull in
  plugin-registry -> all 18 plugin modules -> expo-speech-recognition, a NATIVE
  module, and the format module stopped loading under Jest entirely ("Cannot find
  native module 'ExpoSpeechRecognition'"). Note the failure mode: 252 tests still
  "passed" while the suite itself failed to run, which is easy to skim past. Fixed
  by giving script-export.ts ownership of InstalledPluginRecord and
  isValidPluginRecord and pointing the dependency plugin-records -> script-export,
  never back — the format module must stay free of runtime imports so parsing a
  file never drags in the plugin host.
  Verified: mobile 266/266 (14 export tests, incl. config VALUES surviving the
  round trip, a web-format file with a plugin item, and the null-vs-[] case),
  game-client 59/59, both typecheck clean (mobile at its 7-error baseline), 0
  lint errors, and `expo export` still bundles Android.
  Web caveat, unchanged from before: usePlugins has no cross-component live-sync
  event, so imported plugin config on the WEB needs a page reload to show up in
  an already-mounted Plugins page. Mobile applies immediately.
- 2026-08-06T00:00-05:00 **Phase E: Android deep-link redirect FIXED — root cause
  traced from the user's own on-device report** (real Pixel run: mobile sync
  button works, but the authorization deep link never visibly returned control
  to the app, so the token never lands and sync can't complete). Checked the
  obvious suspects first and both were already correct: AndroidManifest's
  intent-filter (`dslclient` scheme, singleTask, `ReactActivityDelegateWrapper`
  in `MainActivity.kt`). The real break is inside `expo-web-browser@14`'s OWN
  Android implementation of `openAuthSessionAsync`
  (`_authSessionIsNativelySupported()` returns `Platform.OS !== 'android'`, so
  Android never gets iOS's native ASWebAuthenticationSession path) — its polyfill
  waits on `Linking.addEventListener('url', ...)` imported from `'react-native'`
  core, whose Android `NativeEventEmitter` is constructed with `undefined`
  (`NativeLinkingManager` is iOS-only; RN core's `IntentModule.java` never emits
  any device event on Android at all — read directly, not assumed).
  `expo-linking`'s own `addEventListener('url', ...)` is no better: its
  `RNLinking.ts` is a literal `export default Linking from 'react-native'`, the
  exact same dead path. The ONE working native bridge in this dependency set is
  `expo-linking`'s `useLinkingURL()` hook, backed by a DIFFERENT mechanism
  (`LinkingReactActivityLifecycleListener.onNewIntent` → `ExpoLinkingModule`'s
  own `onURLReceived` event) that `Linking` from `'react-native'` never sees.
  Net effect: the deep link WAS opening the app correctly the whole time —
  `openAuthSessionAsync`'s Android promise just always settled via its
  AppState-based "browser dismissed" fallback, because its success path
  structurally never fires. This exactly matches a comment already sitting
  dead in `game-sso.ts` ("on Android the session can report dismissal even
  though the deep link did land") — that fallback existed but nothing ever
  populated a token for it to find.
  Fixed with a new `features/auth/android-auth-redirect-bridge.ts`, mounted
  once at the app root (`app/_layout.tsx`, alongside the existing
  `registerConnectionService()`/`connectionManager.init()` singletons): it uses
  the working `useLinkingURL()` to catch the `dslclient://auth-callback`
  redirect directly and writes the token via the EXISTING `setAuthToken()` +
  `parseAuthFragment()` — no new parsing or storage path. This makes
  `startLogin()`'s pre-existing "an already-valid token wins over a reported
  dismissal" fallback the actual completion mechanism, instead of depending on
  winning a race against `openAuthSessionAsync`'s internal AppState listener.
  `openAuthSessionAsync` itself and the iOS path are untouched — iOS was never
  broken.
  Verified mechanically: `tsc --noEmit` unchanged from the documented 7-error
  baseline (none in the new file or the edited layout), `eslint` 0 errors on
  both touched files (only pre-existing warnings, same shape as before the
  edit), existing auth-fragment suite still 6/6 green. Pure JS/TS change, no
  new native dependency — **no native rebuild needed**, just fresh JS on the
  device (dev-client reload, or a new EAS/OTA build for whichever install the
  user is testing).
  **NOT verified and cannot be from here**: the actual end-to-end redirect on a
  real device — exactly what this fix targets and only the user's Pixel can
  confirm. Step E's checkbox stays unchecked until that live retest (plus the
  still-open web↔mobile round-trip and background/restart checks) passes.
- 2026-08-06T00:00-05:00 **Phase E: second, independent Android bug found via
  live device debugging with the user** (real Pixel, `adb logcat` + a live VPS
  server-log tail during an actual sign-in attempt — this is the first time
  this step has been debugged against the REAL production host rather than
  the local dev-replica, and it surfaced things neither environment alone
  would have). Two real findings, in the order they were isolated:
  1. **Server side was never the problem.** Live-tailed `shatteredarchive-csharp`
     during a fresh attempt: `/user/game-sso/start` → hub consent →
     `/user/game-sso/callback` → `POST auth-server.../api/token-exchange`
     returned 201 in 6ms. `sa-shared` network membership, the
     `AuthHub__BaseUrl` internal-alias fix, and the token exchange itself are
     ALL confirmed live and correct — closes out the "never verified against
     real prod" caveat two entries above for this specific path. The earlier
     "game-sso hand-off is missing a valid return target" error the user hit
     was exactly what the code predicts for a REPLAYED callback (the state
     cookie is deleted unconditionally on the first hit,
     `UserController.cs:228`, before any validation) — a self-inflicted
     artifact of retrying after a manual "open in browser" detour, not a bug.
  2. **The real remaining break was two-layered on the CLIENT, found by
     `adb logcat` across two consecutive live attempts.** First attempt
     (Edge as the resolved Custom Tabs provider): the app-launched intent
     opened fine, but nothing ever came back — Edge appears not to hand a
     REDIRECT-triggered (not directly-tapped) navigation to an unknown scheme
     off to Android at all, unlike Chrome. Second attempt (Chrome): the deep
     link DID return and DID open the app — landing on Expo Router's
     `+not-found` screen. Root cause: Expo Router treats a custom scheme's
     authority as a route PATH, and there was no screen registered for
     `auth-callback`, so the callback always dead-ended there regardless of
     whether the previous entry's bridge had already captured the token.
     Fixed with a real route, `app/auth-callback.tsx`: reads the raw URL via
     `useLinkingURL()` (route params only cover the query string, and the
     token rides in a `#fragment` by design), writes it through the same
     `parseAuthFragment`/`setAuthToken` used everywhere else, then
     `router.replace('/(tabs)/settings')` so the user lands somewhere real
     instead of a dead screen. `android-auth-redirect-bridge.ts` (previous
     entry) stays alongside it, not superseded — it still independently wins
     the separate race for `startLogin()`'s own `openAuthSessionAsync`
     promise; the two writes are idempotent against each other.
     The Edge-vs-Chrome asymmetry is a browser-choice finding, not something
     fixable in this app's code — flagged for the user, not acted on.
  Verified mechanically: `tsc --noEmit` still at the 7-error baseline (none in
  the new file), `eslint` clean on `app/auth-callback.tsx`, full mobile suite
  278/278. **Still not independently verified**: a live retest with Chrome as
  the resolved browser, past this exact fix — that's the next thing for the
  user to try. Step E's checkbox stays unchecked until that passes.
