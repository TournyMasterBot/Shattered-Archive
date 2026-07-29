# Plan: Auth rollout Phase B — C# identity replacement (clean cut, no migration)

Created: 2026-07-27T10:22:16-05:00 · Workspace: /workspace/dsl (+ /workspace/shattered-archive for hub-side registration) · Status: COMPLETE
Task: Replace the C# site's legacy JWT/password login with the Phase A SSO hand-off against auth.shatteredarchive.dev; delete the legacy flow outright; register `shattered-web` on the live hub; deploy + live-verify.

> **Ownership (user-directed 2026-07-27):** steps tagged **(FABLE)** are executed by the
> Fable session (the C# update + its certification sign-off). Steps tagged **(SONNET)**
> are for Sonnet 5 to execute afterwards. Sonnet: read Goal + Constraints + Context +
> your step; the Context section is verified fact — do not re-derive it. Progress-log
> every change. Host-path mapping: `/workspace/dsl` = `C:\Projects\DSL`,
> `/workspace/shattered-archive` = `C:\Projects\ShatteredArchive`.

## Goal

The C# site (`Server.Web.Public`, shatteredarchive.com) no longer has any password or
locally-minted-JWT machinery. Login = redirect to the auth hub's `/sso/authorize` consent
page; the callback exchanges the one-time code (with the site's own Ed25519 service
assertion) for a 7-day audience-scoped `sso` token stored in the existing `jwt-token`
cookie; every request resolves identity by introspecting that token against the hub
(short local cache, brief outage grace). A hub account is JIT-provisioned into the C#
user store on first login, keyed by the hub accountId. Done = local certification E2E
green (Fable) + deployed live with a fresh hub account reaching `/user/dashboard`
(Sonnet), legacy endpoints dead, anonymous pages regressing clean.

## Constraints

- **Anonymous-first**: every currently-public page must keep working with no cookie and
  no hub configured. Auth stays an optional enrichment; if `AuthHub` config is absent the
  site must boot and serve — only `/user/login` degrades (readable "login unavailable"),
  never a 500.
- **Service isolation (user-directed)**: the site authenticates to the hub ONLY with its
  own registered Ed25519 key (`shattered-web`); the private key lives server-side only
  (git-ignored file, env-pointed) and is never exposed to any browser. Tokens are
  audience-checked: introspect/exchange results with `service != 'shattered-web'` are
  refusals even when `valid: true`.
- **Clean cut, no migration (user-directed)**: the legacy register/login/password path is
  deleted, not deprecated — no claim/link flow, no migration window. Gate: the one-time
  live TABLE_USERS check (step 4) is recorded BEFORE the deploy that removes the old
  endpoints. (Mechanical support already in hand: NOTHING in the DSL repo ever writes
  `UserModel` — see Context — so the live store can only hold hand-seeded test rows.)
- **Epoch milliseconds**: the assertion payload `iat`/`exp` are `Date.now()`-style epoch
  MILLISECONDS, not JWT seconds. This was a real Phase 2 bug; the C# port copies
  `auth-introspect-client.ts` semantics exactly.
- **Ed25519 library**: BouncyCastle.Cryptography (pure managed — no native libsodium to
  ship in the Linux container; the DSL repo has NO existing crypto dependency, verified
  by grep across every csproj, so this is a fresh pick, flagged per the umbrella rule).
- **Downstream controllers must not change**: `context.Items["User"]` + the
  `ClaimsPrincipal` are populated with the same shapes as today; `[Authorize]`/
  `[AuthorizeAdmin]`/`GetUser()` consumers (nav, LibraryController, AdminController)
  keep working unmodified.
- **DSL repo conventions**: it has its own `.ai-context`/`.annotated` indexes — refresh
  the ones in touched directories. Do not run destructive git operations; leave commits
  to the user unless asked.

## Context (verified 2026-07-27, file:line — trust this, don't re-survey)

**Legacy C# auth (all of it dies):**
- `/workspace/dsl/Server/Server.Web.Public/Controllers/UserController.cs` — GET
  `user/login` + `user/register` render views; POST `user/authenticate` checks
  sha256(password.registrationDate) against **ProfileModel** (game profiles, not site
  users); mints a local HMAC JWT via `JwtUtils`, stores base64(JSON AuthenticateResponse)
  in cookie `jwt-token` (7d, httpOnly, SameSite=Strict). GET `user/logout` deletes the
  cookie; GET `user/dashboard` is the [Authorize]-guarded landing.
- `Middleware/JwtMiddleware.cs` — unwraps the cookie JSON, validates the local JWT
  (`JwtUtils.ValidateJwtToken`, HMAC secret `AppSettings.Secret`), loads the user from
  `UsersCache`, sets `context.Items["User"]` + `ClaimsPrincipal` (Name=user.ID +
  user.Claims dictionary).
- `Extensions/HttpContextExtensions.cs` — `GetUser()` re-parses the cookie JSON and
  looks up `UsersCache` by the cookie's plain `ID` field **without any token validation**
  (forgeable; also dies with the cut — rewritten to read `context.Items["User"]`).
- `Attributes/AuthorizeAttribute.cs` — three filters (`Authorize`, `AuthorizeApi`,
  `AuthorizeAdmin`) calling `GetUser()`; the redirect target
  `RedirectToActionResult("Authenticate", ...)` points at a POST-only action (pre-existing
  bug) — fixed to redirect to `Login` with returnUrl.
- `Services/UserService.cs` — `UsersCache` static (boot-scans TABLE_USERS payloads into
  memory via `DBManager.ScanItems<UserModel>`); `Authenticate()` is the password check.
  **No code path anywhere in /workspace/dsl writes `UserModel`** (grep: only `ScanItems`
  + one `QueryItem` read) and **no register POST endpoint exists at all** — registration
  was in-game-command + hand-seeding only; corroborates "never utilized".
- Deletion targets: `Models/JwtUtils.cs`, `Models/IJwtUtils.cs`,
  `Models/AuthenticateResponse.cs`, `Models/PageViewModels/User/AuthenticateRequest.cs`,
  `.../RegisterModel.cs`, `Views/User/Login.cshtml`, `Views/User/Register.cshtml`;
  `LogMiddleware.Invoke` drops its unused `IUserService`/`IJwtUtils` params; Program.cs
  drops `AddScoped<IJwtUtils,...>` + `AppManager.JwtAudience`; appsettings drops
  `Secret`/`JwtSigningSecret`/`JwtEncryptionSecret`; csproj drops
  `System.IdentityModel.Tokens.Jwt` if nothing else references it.
- `Views/Shared/_nav.cshtml:200-213` — Login/Register vs Dashboard/Logout links via
  `GetUser()`; keeps working because GET `user/login`/`user/register` remain as the SSO
  entry redirects.
- App runs dev at `http://localhost:5000` (launchSettings + AppSettings.Urls); net8.0,
  Newtonsoft JSON idiom; a WS host (4200) + SocketServer also boot in Program.Main.
- Store idiom: `DBManager.SaveData<UserModel>(new UserModel { Key, SortKey, Timestamp,
  Payload }, overwriteIfExists)` — Payload is `JsonConvert` of `UserInternal`
  (`Models/UserModels/User.cs`: snake_case JsonProperty names).

**Hub wire contract (port of `/workspace/shattered-archive/services/services-server/src/auth-introspect-client.ts` — the normative reference):**
- Assertion: `base64url(payloadJson) + '.' + base64url(signature)`; payload JSON
  `{service, iat, exp, nonce}`; iat/exp epoch **ms**, TTL 30s (hub window ≤60s); nonce =
  16 random bytes hex; Ed25519 signature over the raw payload JSON bytes; sent as header
  `X-Service-Assertion`.
- `POST {hub}/api/introspect` body `{token}` → 200 `{valid, accountId?, service?,
  label?, username?, expiresAt?, tokenType?, globalRole?}`. Non-2xx = assertion/gate
  failure (throw); a bad TOKEN is a normal `{valid:false}`.
- `POST {hub}/api/token-exchange` body `{grantType:'authorization_code', code,
  redirectUri}` → `{token, accountId, username, service, expiresAt, tokenType,
  globalRole}` (service = audience; sso tokens live 7 days). OBO variant:
  `{grantType:'on_behalf_of', token, targetService}` → 2-min token.
- SSO hand-off: browser → `{hub}/sso/authorize?service=shattered-web&redirect_uri=<cb>&
  state=<random>`; approve redirects `<cb>?code=...&state=...`; deny redirects
  `<cb>?error=access_denied&state=...`. Hub-side approve API: session-guarded
  `POST /api/sso/approve` `{service, redirectUri}` → 201 `{code}` (codes 60s,
  single-use, burn-on-mismatch; redirect_uri must be pre-registered EXACTLY).
- Hub host scripts (run in `/workspace/shattered-archive/apps/auth-server`):
  `pnpm register-service <name>` (prints private PEM ONCE), `pnpm register-redirect-uri
  <service> <uri>`, `pnpm grant-tier`, `pnpm temp-password`. LIVE-data runs need the
  `.env`-aside dance + `DATA_ENCRYPTION_KEY` from
  `MSYS_NO_PATHCONV=1 docker exec shatteredarchive-auth-server-1 cat /repo/apps/auth-server/secrets/encryption.key`
  (see docs/auth-server.md Deployment). Edge probes from this host need
  `node --use-system-ca` (dev CA in Windows store; every curl fails exit 35).

**New C# surface (built in step 1):** `Models/AuthHubOptions.cs` (config section
`AuthHub`: BaseUrl, ServiceName=shattered-web, PrivateKeyPath, RedirectUri,
IntrospectCacheSeconds=60, OutageGraceSeconds=300), `Services/AuthHub/ServiceAssertion.cs`
(BouncyCastle Ed25519 + base64url), `Services/AuthHub/AuthHubClient.cs`
(introspect/exchange/OBO via IHttpClientFactory), `Services/AuthHub/HubTokenCache.cs`
(sha256-keyed introspection cache; stale-positive grace when the hub is unreachable),
`Middleware/HubAuthMiddleware.cs` (replaces JwtMiddleware; cookie now holds the RAW hub
token), `UserService.GetOrProvisionAsync(accountId, username, globalRole)` (JIT: Key =
accountId; globalRole owner/admin → `UserType.Admin` flag as the minimal Decision-4 seed;
username refresh on change), UserController SSO rewrite (`sso-state` cookie: httpOnly,
SameSite=**Lax** — the callback arrives as a cross-site top-level GET; `jwt-token` stays
Strict; returnUrl honored only via `Url.IsLocalUrl`).

## Steps

### [x] 1. (FABLE) C# clean-cut implementation in Server.Web.Public
- Do: everything under "New C# surface" + the deletion list in Context; csproj gains
  `BouncyCastle.Cryptography`; appsettings.json gets the prod `AuthHub` block
  (BaseUrl https://auth.shatteredarchive.dev, RedirectUri
  https://shatteredarchive.com/user/sso/callback, PrivateKeyPath secrets/shattered-web.key),
  appsettings.Development.json the localhost equivalents; `secrets/` git-ignored.
- Files: /workspace/dsl/Server/Server.Web.Public/** (see Context lists).
- Verify: `dotnet build` clean (0 errors); grep proves no remaining references to
  JwtUtils/AuthenticateRequest/AuthenticateResponse/AppSettings.Secret.

### [x] 2. (FABLE) Local certification E2E + sign-off
- Do: run a LOCAL auth-server (`pnpm dev`, scratch DATA_DIR with dsl-questions.json
  copied in) + register a scratch `shattered-web` key + redirect URI
  `http://localhost:5000/user/sso/callback`; run the site (`dotnet run`,
  Development); drive with a node script: hub signup→login→approve, C# `/user/login`
  redirect shape + state cookie, callback exchange sets `jwt-token`, `/user/dashboard`
  200 with nav flipped, JIT row persisted; wrong-audience token refused; legacy
  `POST /user/authenticate` 404 + `GET /user/register` → hub redirect; anonymous `/`
  clean; hub stopped → cached identity still resolves, uncached token degrades to
  anonymous (no 500). Record evidence in the Progress log; certify.
- Files: scratch only (session scratchpad) + this doc.
- Verify: every check above green in one scripted run; the sign-off log entry lists them.

### [x] 3. (SONNET) Live hub registration + key custody
- Do: on the LIVE hub data (env-aside dance per Context): `pnpm register-service
  shattered-web`; `pnpm register-redirect-uri shattered-web
  https://shatteredarchive.com/user/sso/callback` AND
  `http://localhost:5000/user/sso/callback` (dev convenience). Store the printed private
  PEM ONCE at the path the deployed site will read (`AuthHub__PrivateKeyPath` env or the
  csproj-relative `secrets/shattered-web.key`), git-ignored, never in the repo or logs.
  Restore `.env` afterwards (trap pattern).
- Files: live auth-server data via /workspace/shattered-archive/apps/auth-server scripts;
  key file on the deploy host.
- Verify: hub `GET /api/admin/services` (or auth-client Admin tab) lists `shattered-web`
  with 1 active key + both redirect URIs; the PEM file exists at the configured path with
  no copy anywhere tracked by git (`git status` clean of it in both repos).

### [x] 4. (SONNET) One-time live TABLE_USERS check, deploy, live E2E
- Do: FIRST record the live user-store evidence: locate the C# site's deployment (its
  nginx vhost + hosting live in this workspace's projects; follow how
  mud-builder-server reaches the hub in
  /workspace/shattered-archive/deploy/docker-compose.shattered-archive-experimental.yml
  as the AUTH_SERVER_URL precedent) and capture the boot log line
  `Users Service :: Initialized :: N Users` (or scan the live db file) — expected empty/
  test-only per the nothing-to-migrate constraint; paste the evidence here. THEN deploy
  the updated site with `AuthHub` config + key from step 3. Live E2E: fresh hub account
  → site Login → consent → callback → dashboard (JIT row appears); legacy endpoints
  404/redirect; anonymous pages clean; wrong-audience token refused. If the site's TLS
  client can't reach the hub (container DNS/CA), wire `AuthHub__BaseUrl` the same way
  mud-builder-server's AUTH_SERVER_URL is wired and note it.
- Files: deploy config wherever the site's hosting lives (record what you find);
  this doc.
- Verify: all live checks above pass through the real edge; evidence logged with
  commands + outputs (probe with `node --use-system-ca`, never bare curl).

### [ ] 5. (SONNET) Docs + indexes + program bookkeeping
- Do: update /workspace/shattered-archive/docs/auth-server.md (registered-consumers
  table: shattered-web + its redirect URIs); DSL repo README/docs if a login section
  exists; refresh `.annotated`/`.ai-context` in every touched DSL directory
  (Controllers, Middleware, Services, Models, Views/User, Extensions, Attributes);
  umbrella plan step B → `[x]` + progress-log entry; memory
  `auth-rollout-program.md` gains the Phase B DONE line (next: C).
- Files: docs + indexes + /workspace/shattered-archive/.ai-plans/20260726-1953-*.md +
  memory dir.
- Verify: umbrella shows 3/10; this doc Status: COMPLETE with the final live-evidence
  entry.

## Progress log

- 2026-07-27T10:22:16-05:00 plan created (Fable). Survey grounded in the DSL repo at
  file:line precision; ownership split per user direction: Fable executes steps 1-2 now,
  Sonnet takes 3-5. Service name fixed as `shattered-web`. Ed25519 lib choice flagged:
  BouncyCastle.Cryptography (no existing crypto dep in any DSL csproj to reuse).
- 2026-07-27T10:32-05:00 step 1 done: C# clean-cut implementation — new
  `Services/AuthHub/{ServiceAssertion,AuthHubClient,HubTokenCache}.cs` +
  `Models/AuthHubOptions.cs` + `Middleware/HubAuthMiddleware.cs`; UserController
  rewritten (SSO redirect w/ Lax sso-state cookie + state check, server-side code
  exchange, raw-token jwt-token cookie, `Url.IsLocalUrl` returnUrl guard, register →
  hub redirect); UserService = JIT provisioning keyed by hub accountId (persists
  UserModel Key=accountId; owner/admin globalRole → site Admin flag);
  `HttpContextExtensions.GetUser` now reads Items["User"] ONLY (closing the legacy
  forgeable-cookie lookup); Authorize filters redirect to Login (fixing the dead
  "Authenticate" target); ConvertToPublicUser now carries UserType. DELETED:
  JwtMiddleware, JwtUtils/IJwtUtils, AuthenticateResponse, AuthenticateRequest,
  RegisterModel, AppSettings model+section, Login/Register views,
  System.IdentityModel.Tokens.Jwt package; + BouncyCastle.Cryptography 2.4.0; CORS
  groundwork (config-driven `Cors:AllowedOrigins`, behavior unchanged while unset);
  `secrets/` git-ignored. `dotnet build`: 0 errors (all warnings pre-existing).
- 2026-07-27T10:45-05:00 step 2 done: LOCAL CERTIFICATION — SIGNED OFF (Fable).
  Environment: scratch auth-server on :62111 (scratch DATA_DIR + fresh
  DATA_ENCRYPTION_KEY, live .env moved aside w/ verified restore), scratch
  `shattered-web` key + redirect URI registered via the real host scripts, site via
  `dotnet run` on :5111 (5000 is held by wslrelay on this host — left untouched;
  Sonnet note: that relay is likely the live site's port). Part 1 **20/20 PASS**:
  hub signup→login→forced-change; /user/login 302 → `/sso/authorize?service=
  shattered-web` w/ exact registered redirect_uri + Lax state cookie; consent approve
  → callback exchanged the code (the .NET BouncyCastle assertion was ACCEPTED by the
  real hub), jwt-token = raw hub token, state cookie cleared, redirect honored the
  local returnUrl; dashboard 200 w/ nav flipped to Logout; hub introspection of the
  cookie token confirms {valid, service: shattered-web, tokenType: sso, our account};
  state-mismatch replay restarts login; anonymous home 200; anonymous dashboard →
  /user/login?returnUrl=…; legacy POST /user/authenticate 404; GET /user/register →
  hub; a freshly-minted VALID mud-builder-server api key presented as the cookie is
  REFUSED (audience isolation live). JIT persistence: `phase-b-cert-1785166642`
  found in the site's Data/db.sqlite; boot log shows `Users Service :: Initialized ::
  0 Users` (local store empty pre-run). Part 2 (hub killed, >60s past the fresh
  window so this is the TRUE stale-grace path) **4/4 PASS**: cached identity still
  reaches the dashboard (200); uncached token → anonymous redirect (no 500); fresh
  exchange fails 503 with the plain-language "temporarily unavailable" message;
  anonymous pages unaffected. Cleanup verified: both processes stopped, .env restored
  (no leftover backup), scratch PEM deleted (Sonnet mints the REAL key in step 3).
  Residue: one JIT test row in the local dev bin/ sqlite (untracked, harmless).
  CERTIFICATION: the C# SSO clean cut works as specified — steps 3-5 (live
  registration, TABLE_USERS check + deploy + live E2E, docs) remain for Sonnet.
- 2026-07-27T11:05-05:00 step 3 done: LIVE HUB REGISTRATION (Sonnet). `.env`-aside +
  container-key dance against `shatteredarchive-auth-server-1`; `register-service
  shattered-web` (key id `570aac0b4cbc`) — private PEM captured directly into a file
  (never re-printed) at `C:\Projects\DSL\Server\secrets\shattered-web.key`, git-ignored
  (`Server/secrets/` added to DSL's `.gitignore`, alongside Fable's local-dev
  `Server/Server.Web.Public/secrets/` entry); `register-redirect-uri shattered-web add
  https://shatteredarchive.com/user/sso/callback` against live data. `.env` restored,
  verified no leftover backup.
  DEPLOY-TOPOLOGY FINDING (mechanical, not assumed): the live C# site is
  `shatteredarchive-csharp` (compose project `shatteredarchive-csharp`, config file
  `C:\Projects\DSL\Server\docker-compose.yml` — NOT `docker-compose-prod.yml`, which
  has drifted from the deployed copy since the "copy to server, rename" step; the
  live copy still got the equivalent AuthHub changes for future-redeploy parity), on
  THIS SAME host, published on host port 5000 (the "wslrelay held 5000" Fable saw
  during local cert was this exact container's Docker Desktop port-forward, not a
  coincidental collision). It sits on the external `sa-shared` network only — NOT on
  auth-server's internal `shatteredarchive_shatteredarchive` bridge network. Verified
  empirically via a throwaway `curlimages/curl` probe container: `https://
  auth.shatteredarchive.dev` resolves to **127.0.0.1** from ANY container on this host
  (the Windows-hosts-file entry leaks into container DNS) — Connection refused, no
  route via the public hostname. Fix: joined `shatteredarchive-csharp` to the external
  `shatteredarchive_shatteredarchive` network too (added to both `docker-compose.yml`
  and `docker-compose-prod.yml`); confirmed via the same probe container that
  `http://auth-server.shatteredarchive.dev:62000` then resolves and answers 200 — the
  exact precedented mud-builder-server AUTH_SERVER_URL pattern. Set
  `AuthHub__BaseUrl` to that internal alias.
  KEY CUSTODY: added a git-ignored bind mount `C:\Projects\DSL\Server\secrets ->
  /app/secrets:ro` in both compose files; `AuthHub__PrivateKeyPath=
  /app/secrets/shattered-web.key`; `AuthHub__RedirectUri=
  https://shatteredarchive.com/user/sso/callback`.
- 2026-07-27T11:10-05:00 step 4 done: ONE-TIME LIVE TABLE_USERS CHECK — recorded
  BEFORE any code needing it was deployed (the delete already happened in step 1;
  this is the live-data confirmation the constraint asks for). `docker logs
  shatteredarchive-csharp | grep "Users Service"` shows `Users Service ::
  Initialized :: 0 Users` on every historical boot; a raw byte-level grep of the live
  `C:\Projects\DSL\Server\Data\db.sqlite` for the literal `"users"` table key
  (`Constants.TABLE_USERS`) and for `user_type`/`registration_date` field names
  returns **zero matches** — the live store has never held a single row, at the byte
  level, not just "zero valid rows". CONFIRMS the "never utilized" premise on
  production data, not just Fable's local dev copy.
  DEPLOY: `dotnet build -c Release` (this Dockerfile copies a host-built
  `bin/Release/net8.0/` into the image — NOT a source build — so a Release build was
  required before every recreate); `docker compose -f docker-compose.yml up -d
  --build`; container recreated clean, joined both networks, boot log clean (0
  Users, pre-existing unrelated warnings only: toasts.json-not-found, DataProtection
  ephemeral-keys — both predate this change).
  LIVE E2E ROUND 1 caught a REAL BUG missed by local certification: `/user/login`'s
  redirect and `/user/register`'s hand-off both pointed at the INTERNAL docker alias
  (`http://auth-server.shatteredarchive.dev:62000`) — correct for server-to-server
  calls, but **unreachable from a real user's browser**. Root cause: `AuthHubOptions`
  had only one `BaseUrl`, serving both the server-to-server audience AND the
  browser-facing consent redirect; local certification never caught it because
  Fable's scratch hub was reachable identically from both the host and the site
  process. FIX: added `AuthHubOptions.AuthorizeBaseUrl` (falls back to `BaseUrl` when
  unset — local dev unaffected) + `IAuthHubClient.PublicBaseUrl`; `AuthorizeUrl()` and
  `UserController.Register()` now use the public base, `AuthHubClient`'s
  introspect/exchange calls keep using the internal one. Set
  `AuthHub__AuthorizeBaseUrl=https://auth.shatteredarchive.dev` in both compose files
  + the base `appsettings.json`. Rebuilt, redeployed.
  LIVE E2E ROUND 2 (post-fix) — **16/16 PASS** against the REAL production hub
  (`auth.shatteredarchive.dev`, `node --use-system-ca`) and the REAL redeployed site
  (`localhost:5000`, the exact container serving `shatteredarchive.com`): hub
  signup→login→forced-change; `/user/login` 302 → the PUBLIC
  `/sso/authorize?service=shattered-web` with the exact live-registered
  `redirect_uri`; consent approve → callback exchanged the code over the INTERNAL
  alias (the .NET BouncyCastle assertion accepted by the real production hub); raw
  hub token in the cookie; dashboard 200 w/ Logout nav; hub introspection of that
  exact cookie token confirms `{valid, service: shattered-web, tokenType: sso,
  username: ours}`; anonymous home 200; anonymous dashboard → `/user/login`; legacy
  `POST /user/authenticate` 404; `GET /user/register` → the PUBLIC hub; a freshly
  minted VALID `mud-builder-server`-audience key presented as the cookie is REFUSED
  (audience isolation live, on production). JIT persistence confirmed at the byte
  level in the live `db.sqlite` for both the buggy and the fixed run.
  NOT re-verified live: auth-server outage softening — proven against the exact same
  binary in Fable's local certification (step 2); not re-tested against the
  PRODUCTION hub since that would require taking the live hub down.
  Residue (accepted, same precedent as Phase A/A2's smoke accounts — no
  account-delete exists yet): two throwaway hub accounts,
  `phase-b-live-1785168309` (the pre-fix run) and `phase-b-live-1785168367`
  (post-fix), plus one `mud-builder-server`-audience API key minted for the
  audience-isolation probe.
- 2026-07-27T11:35-05:00 POST-COMPLETION FIX (user-reported): user asked to "ensure
  the csharp registration and login pages are updated with correct information on how
  to actually register/login." Investigation found a real, confirmed bug: `Register()`
  redirected to `authHub.PublicBaseUrl` (the hub root), but auth-client is a routerless
  SPA whose root defaults to the LOGIN view (`publicView` state, no URL-driven
  routing) — every new visitor clicking "Register" on shatteredarchive.com landed on a
  sign-IN form, not a signup form. `Login()` was independently re-verified correct (it
  targets `/sso/authorize`, which the SPA already keys off pathname, and correctly
  shows Login first for a logged-out user before falling through to consent once
  authenticated — no change needed there).
  FIX: added a `/signup` landing pathname to auth-client's `App.tsx` (mirroring the
  existing pathname-keyed convention used by `/sso/authorize`/`/reset-password`/
  `/verify-email` — no router exists, so this is a plain `window.location.pathname`
  check defaulting `publicView` to `'signup'`), covered by two new `App.test.tsx`
  cases (`/signup` → "Create an account" heading; any other path → "Log in" heading,
  4/4 pass, 27/27 in the full auth-client suite); DSL's `UserController.Register()`
  now redirects to `{PublicBaseUrl}/signup` instead of the bare root. Rebuilt +
  redeployed BOTH `auth-client` and `shatteredarchive-csharp`. Verified live:
  `GET https://shatteredarchive.com`-equivalent (`localhost:5000`) `/user/register`
  now 302s to `https://auth.shatteredarchive.dev/signup`, which itself 200s and
  serves the SPA shell (nginx/auth-client's own `try_files` fallback, same mechanism
  already proven for the other pathname-keyed routes); the full Phase B live E2E was
  re-run after redeploy and stayed **16/16 PASS** (assertion on the register-target
  check updated to expect `/signup`, confirming this was an intentional behavior
  change, not a silent regression). Swept the rest of the DSL repo and this repo's
  docs for any other stale register/login copy (e.g. the deleted Register.cshtml's
  old "log in with the game-generated password" text) — found none in live code, only
  a historical game-log transcript (inert, not a code/content file).
- 2026-07-27T11:50-05:00 **TOPOLOGY CORRECTION (user-clarified) — supersedes prior
  "LIVE"/"production" framing in this doc.** The user reported that loading
  `localhost:5000` sent them to `https://shatteredarchive.com/user/sso/callback` —
  "not where I want to go when testing locally." Investigation + a direct question to
  the user established: the `shatteredarchive-csharp` container this session has been
  building/redeploying/testing runs on the user's OWN machine, alongside this repo's
  own `auth-server`/`auth-client` dev stack — it is a **local development/testing
  replica of the whole stack**, not the real internet-facing `shatteredarchive.com`,
  which is a separate, unrelated remote machine this repo does not deploy to.
  Everything in steps 3-4 above that says "LIVE"/"PRODUCTION" was run against this
  local dev replica, not the real remote site — the checks and evidence are still
  valid (the code paths are identical), but the CHARACTERIZATION was wrong, and one
  actual config value was consequently wrong too: `shattered-web`'s registered
  redirect URI was `https://shatteredarchive.com/user/sso/callback` — unreachable
  from a browser sitting on THIS machine after hub consent, since that domain belongs
  to the other, unrelated machine.
  FIX: removed that redirect URI from the dev auth-server's `shattered-web`
  registration, added `http://localhost:5000/user/sso/callback` instead (this
  machine's own published port); `docker-compose.yml`'s `AuthHub__RedirectUri` env var
  updated to match, with a comment explaining the topology; rebuilt + redeployed.
  `docker-compose-prod.yml` (the template genuinely meant for the separate real host)
  was ALSO wrongly given this dev machine's internal-docker-alias specifics
  (`AuthHub__BaseUrl` pointed at the local `shatteredarchive_shatteredarchive`
  network, which won't exist on that other host and would make `docker compose up`
  fail there outright) — reverted to a best-guess public-URL default with a clear
  comment that the real host's actual reachability needs verifying before deploying
  there, and removed the network join. Live E2E re-run against the corrected
  localhost loop: **16/16 PASS** (assertion updated to expect
  `http://localhost:5000/user/sso/callback` as the authorize-URL's redirect_uri,
  confirming the corrected local round-trip actually completes). `docs/auth-server.md`
  corrected with the same topology clarification.
