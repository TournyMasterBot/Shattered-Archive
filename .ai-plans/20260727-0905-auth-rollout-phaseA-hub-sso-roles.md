# Plan: Auth rollout Phase A — hub foundations: SSO hand-off, audience-scoped exchange, global roles

Created: 2026-07-27T09:05:28-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Build auth-server's SSO authorization-code flow, the assertion-gated token-exchange
(authorization-code + on-behalf-of grants, audience-scoped), the global account tier, the
shared consumer helpers in services-server, and auth-client's approve surface.

Sub-plan of `.ai-plans/20260726-1953-centralized-auth-rollout-all-services.md` step A —
its Constraints (anonymous-first, service isolation/key custody, DATA_DIR host mount,
no-new-surface-without-guard) all bind here. Every step is (CLAUDE): security-critical
design work; qwen must not execute this plan.

## Goal

A consumer service can complete: browser redirect → auth-client login+approve → one-time
code → backend `POST /api/token-exchange` (own Ed25519 assertion required) → an
audience-scoped bearer token that introspects with `globalRole`, and can obtain a
short-TTL token for ANOTHER service only via the on-behalf-of grant. Verified by route
tests through a real HTTP server plus a full-suite green run.

## Constraints

- Exchange endpoints REQUIRE a valid `X-Service-Assertion` — no client-side exchange
  path, ever. An assertion for service 1 can never redeem a code bound to service 2 nor
  OBO-exchange a token whose audience isn't service 1.
- One-time SSO codes are in-memory ONLY (60s TTL, single-use) — losing them on restart is
  correct. Everything else persists in the existing encrypted stores under `DATA_DIR`.
- Additive responses only: existing introspect consumers (mud-builder) must keep working
  unchanged. Audience ENFORCEMENT ships as the consumer-side guard helper + hub-side
  exchange rules; existing consumers adopt the guard in their own phases.
- Global tier ladder `owner > admin > moderator > user` (hub) and service ladder
  `owner > admin > manager > trusted > user` are DIFFERENT ladders — shared types must
  keep them distinct. Tier changes are host-script only in Phase A (admin API is A2).
- Redirect URIs are exact-string matched, registered per service via host script — no
  wildcard/prefix matching.
- Follow auth-server's existing idioms: AuthError, safe() wrapper, EncryptedFileStore,
  never leak which check failed on the trust path, test depth to match existing suites.

## Context

- `/workspace/shattered-archive/apps/auth-server/src/key-store.ts` — KeyKind 'api'|'session',
  KeyRecord {service, kind, sha256, mintedAtEpoch, expiresAt}, verify() (epoch check via
  caller callback), listKeys filters kind==='api' (so new kinds stay out of the Keys UI).
- `/workspace/shattered-archive/apps/auth-server/src/service-key-store.ts` — ServiceEntry
  {serviceName, keys[]}; verifyAssertion() peek-then-verify, nonce replay guard.
- `/workspace/shattered-archive/apps/auth-server/src/account-store.ts` — AccountRecord
  (no role field yet), epoch bumps invalidate keys.
- `/workspace/shattered-archive/apps/auth-server/src/routes/introspect.ts:42-50` — valid
  response shape {valid, accountId, service, label, username, expiresAt, tokenType}.
- `/workspace/shattered-archive/apps/auth-server/src/routes/session-guard.ts` — session +
  mustChangePassword guards for browser routes (approve route must use BOTH).
- `/workspace/shattered-archive/apps/auth-server/src/routes/test-helpers.ts` — real-server
  test harness with signup/login/cookie helpers.
- `/workspace/shattered-archive/apps/auth-server/scripts/register-service.ts` — host-script
  idiom to copy for grant-tier/revoke-tier/register-redirect-uri.
- `/workspace/shattered-archive/services/services-server/src/auth-introspect-client.ts` —
  signAssertion (epoch MILLISECONDS) + introspect(); exchange fns + guard land beside them.
- `/workspace/shattered-archive/apps/auth-client/src/App.tsx` — no router; pathname checks
  (`/reset-password`) + in-memory view state; SSO approve follows the same pattern at
  `/sso/authorize`. API wrappers in `src/api/client.ts` (cookie-auth fetch).

## Steps

### [x] 1. (CLAUDE) Stores: token kinds, redirect URIs, global role, code store
- Do: key-store.ts — extend KeyKind with `'sso' | 'obo'`, add
  `mintExchangeToken(accountId, service, kind, label, ttlMs, currentEpoch)` (purges
  long-expired sso/obo records on mint as housekeeping). service-key-store.ts —
  ServiceEntry gains `redirectUris?: string[]`; add
  addRedirectUri/removeRedirectUri/hasRedirectUri/listRedirectUris (exact match) +
  `isRegisteredService`. account-store.ts — AccountRecord gains `globalRole?: string`;
  add `setGlobalRole` (validates against the global ladder; 'user' = delete the field).
  New `sso-code-store.ts` — in-memory one-time codes {code → accountId, service,
  redirectUri, expiresAt}, 60s TTL, single-use redeem, sweep on issue/redeem.
- Files: /workspace/shattered-archive/apps/auth-server/src/{key-store.ts,
  service-key-store.ts, account-store.ts, sso-code-store.ts} + their .test.ts files.
- Verify: `pnpm --filter @shatteredarchive/auth-server test -- key-store` (and
  account-store, service-key-store, sso-code-store) green, incl. new cases: sso/obo mint
  shape + TTL, purge behavior, redirect URI exact-match miss, setGlobalRole rejects an
  unknown tier, code single-use + expiry.

### [x] 2. (CLAUDE) Routes: /api/sso/approve + /api/token-exchange + introspect globalRole
- Do: new `routes/sso.ts` — POST /api/sso/approve (sessionGuard + mustChangePasswordGuard;
  body {service, redirectUri}; validates registered service + registered exact
  redirectUri; issues one-time code; returns {code}). New `routes/token-exchange.ts` —
  POST /api/token-exchange (assertion-gated like introspect; grantType
  'authorization_code' {code, redirectUri} → redeem MUST match assertion service +
  redirectUri, mint kind 'sso' (7d TTL); grantType 'on_behalf_of' {token, targetService}
  → subject token must verify AND its service === assertion service, targetService must
  be a registered service, mint kind 'obo' (2min TTL, label `obo:<caller>`); both
  respond {token, accountId, username, service, expiresAt, tokenType, globalRole}).
  introspect.ts — add `globalRole` (account.globalRole ?? 'user') to the valid response.
  Register both modules in app.ts.
- Files: /workspace/shattered-archive/apps/auth-server/src/routes/{sso.ts,
  token-exchange.ts, sso.test.ts, token-exchange.test.ts, introspect.ts,
  introspect.test.ts}, src/{app.ts, deps.ts}.
- Verify: `pnpm --filter @shatteredarchive/auth-server test -- routes` green: full
  round-trip (login → approve → exchange → introspect new token shows globalRole +
  audience service); code replay fails; unregistered redirectUri 400; WRONG service's
  assertion redeeming a code → generic 400/403 (no oracle); OBO happy path; OBO with a
  foreign-audience subject token rejected; OBO token introspects service=targetService;
  session-cookie call to token-exchange 401s.

### [x] 3. (CLAUDE) Host scripts: grant-tier / revoke-tier / register-redirect-uri
- Do: copy register-service.ts's idiom (dotenv override note included): `grant-tier.ts
  <username> <owner|admin|moderator>`, `revoke-tier.ts <username>` (back to user),
  `register-redirect-uri.ts <service> <add|remove|list> [uri]`. Wire package.json script
  entries (no `--` between script and args on pinned pnpm).
- Files: /workspace/shattered-archive/apps/auth-server/scripts/{grant-tier.ts,
  revoke-tier.ts, register-redirect-uri.ts, .annotated}, apps/auth-server/package.json.
- Verify: run each against a throwaway DATA_DIR (env-pointed), confirm the stored record
  via a follow-up list/introspect-level check; unknown username/tier/service exit 1 with
  a readable message.

### [x] 4. (CLAUDE) services-server: tier types + exchange client fns + audience guard
- Do: new `auth-tiers.ts` — GLOBAL_TIERS/SERVICE_TIERS as distinct ordered ladders,
  tierRank(), canManage() (strictly-below), type exports. auth-introspect-client.ts —
  IntrospectResult gains `globalRole?: string`; add `exchangeAuthorizationCode(baseUrl,
  service, privateKeyPem, code, redirectUri)` and `exchangeOnBehalfOf(baseUrl, service,
  privateKeyPem, token, targetService)` (same assertion + fetch idiom as introspect);
  add `matchesAudience(result, expectedService)` guard helper (valid && service ===
  expected) consumers adopt per-phase. Export from the package index.
- Files: /workspace/shattered-archive/services/services-server/src/{auth-tiers.ts,
  auth-tiers.test.ts, auth-introspect-client.ts, index.ts}.
- Verify: `pnpm --filter @shatteredarchive/services-server test` green (canManage matrix:
  strictly-below incl. peer-refusal and unknown-tier handling); workspace typecheck of
  dependents unaffected (`pnpm --filter @shatteredarchive/auth-server build`).

### [x] 5. (CLAUDE) auth-client: SSO authorize/approve surface
- Do: App.tsx — detect `/sso/authorize` pathname (same pattern as /reset-password) and
  parse {service, redirect_uri, state}; render new `features/sso/SsoApprovePage.tsx`:
  logged-out → existing LoginPage inline first; logged-in → "Continue to <service>?"
  approve/deny; approve → new api.ssoApprove(service, redirectUri) → navigate to
  `redirect_uri?code=...&state=...`; deny → `redirect_uri?error=access_denied&state=...`.
  Malformed/missing params render an error, never a redirect. api/client.ts gains
  ssoApprove.
- Files: /workspace/shattered-archive/apps/auth-client/src/{App.tsx, api/client.ts,
  features/sso/SsoApprovePage.tsx, features/sso/SsoApprovePage.test.tsx}.
- Verify: `pnpm --filter @shatteredarchive/auth-client test` green (approve builds the
  right redirect incl. state passthrough; deny path; missing-param error state; logged-out
  shows login first) + `pnpm --filter @shatteredarchive/auth-client build`.

### [x] 6. (CLAUDE) Docs, indexes, umbrella bookkeeping
- Do: docs/auth-server.md — new sections: SSO hand-off flow (sequence + code TTLs),
  token-exchange grants + audience rules, global tiers + host scripts, redirect-URI
  registration; note additive introspect field. Refresh .annotated/.ai-context +
  @ai- headers for every touched dir/file (host-side edits don't auto-refresh). Umbrella
  plan: flip step A to [x] + progress-log line. Full-suite runs:
  auth-server, services-server, auth-client filtered suites + builds.
- Files: /workspace/shattered-archive/docs/auth-server.md, touched dirs' .annotated /
  .ai-context, /workspace/shattered-archive/.ai-plans/20260726-1953-centralized-auth-rollout-all-services.md.
- Verify: all three filtered suites + builds green (bounded output); umbrella shows A
  checked with log entry; this doc Status: COMPLETE.

## Progress log

- 2026-07-27T09:05:28-05:00 plan created (Claude) after orientation reads of
  key-store/account-store/service-key-store/introspect/app/deps/register-service/
  auth-introspect-client/App.tsx — all shapes verified current this session.
- 2026-07-27T09:2x step 1 done: KeyKind +'sso'/'obo' with mintExchangeToken (audience =
  service param; purges exchange records >24h past expiry on mint; countKind added for
  purge visibility/A2 counts), ServiceKeyStore redirect-URI add/remove/has/list
  (exact-match, http(s)-only, no fragments, service must pre-exist) + isRegisteredService
  (needs a non-revoked key), AccountRecord.globalRole + setGlobalRole ('user' clears to
  absent default; unknown tier 400) backed by new global-tiers.ts (authoritative ladder —
  auth-server does NOT depend on services-server, so the mirror lives there), new
  in-memory SsoCodeStore (injectable clock, 60s TTL, single-use, burn-on-mismatch).
  Verified: 50 tests green across the 4 store suites (key/account/service-key/sso-code).
- 2026-07-27T09:5x step 2 done: routes/sso.ts (POST /api/sso/approve — session +
  mustChangePassword guarded; ONE generic 400 for unknown-service/unregistered-URI, no
  oracle) + routes/token-exchange.ts (assertion-gated; authorization_code → 7d 'sso'
  token audience-bound to the CALLER at redeem; on_behalf_of → 2min 'obo' token, subject
  must be caller-audience and kind api/sso — 'session' and 'obo' subjects refused so OBO
  can never chain; target must be a different registered service) + introspect/exchange
  responses carry additive globalRole. deps/index/test-helpers gained ssoCodeStore;
  app.ts registers both modules. Verified: 28 new-route+introspect tests green, full
  auth-server suite 136/136 (13 suites), tsc build clean.
- 2026-07-27T10:1x step 3 done: grant-tier.ts / revoke-tier.ts /
  register-redirect-uri.ts (register-service idiom incl. the .env override pattern) +
  three package.json script entries. Smoke-ran all against a throwaway DATA_DIR from a
  scratchpad cwd (dodging the package .env clobber): grant→admin persisted+read back,
  revoke→user, redirect add/list/remove round-trip, unknown username/tier/service each
  exit 1 with readable messages. Temp seed script deleted after.
- 2026-07-27T10:2x step 4 done: services-server — new auth-tiers.ts (GLOBAL_TIERS +
  SERVICE_TIERS as distinct highest-first ladders, tierRank, canManage strictly-below
  with peers refusing and unknown tiers failing CLOSED), auth-introspect-client gains
  globalRole on IntrospectResult, ExchangeResult, matchesAudience() guard, and
  exchangeAuthorizationCode()/exchangeOnBehalfOf() (same assertion+fetch idiom as
  introspect); both modules exported from the package index. Verified: 19 tests green
  (3 suites incl. the new full canManage matrix), services-server AND auth-server tsc
  builds clean.
- 2026-07-27T10:4x step 5 done: auth-client — features/sso/SsoApprovePage.tsx
  (consent card; malformed request = error card that never redirects; approve →
  api.ssoApprove → redirect_uri?code&state preserving pre-existing query params; deny →
  error=access_denied&state without touching the API; injectable navigate for tests),
  parseSsoRequest (absolute-URL check), App.tsx /sso/authorize pathname branch (same
  no-router pattern as /reset-password — login/forced-change flows still run FIRST, so
  consent always happens on a fully-onboarded session), api.ssoApprove wrapper.
  Verified: 17 auth-client tests green (3 suites incl. 7 new) + vite build clean.
- 2026-07-27T11:0x step 6 done + plan COMPLETE: docs/auth-server.md gained the "SSO
  hand-off + token exchange" section (flow, both grants, audience rules, TTLs,
  burn-on-mismatch), globalRole on the introspect example + audience guidance
  (matchesAudience at every call site), and three host-script table rows;
  docs/auth-client.md Pages table gained SsoApprovePage; .annotated refreshed for
  auth-server src/routes/scripts, services-server src, auth-client src; @ai- headers
  updated on key-store/account-store/service-key-store. Final verification: auth-server
  136/136 (13 suites), services-server 19/19, auth-client 17/17 — 172 tests green; all
  three builds clean (run earlier this step). NOT deployed — the live auth-server
  container still runs pre-Phase-A code; deploy + nginx (the /sso/authorize SPA path
  needs no new vhost work, it's the same SPA) happen with Phase I or on request.
  Umbrella step A flipped [x] same session.
- 2026-07-27T11:3x **DEPLOYED + LIVE SIGN-OFF** (user-requested same session). Deploy:
  `docker compose -f deploy/docker-compose.shattered-archive-experimental.yml up -d
  --build auth-server auth-client` — both images rebuilt, both containers recreated,
  auth-server healthy in 13s, live data intact across the recreate (bind-mounted
  accounts/keys/service-keys files + `auth-server-secrets` named volume, the host-mount
  Constraint proven for real). Live E2E evidence (node --use-system-ca against the real
  edge at https://auth.shatteredarchive.dev — hosts-file loopback + Windows-store dev CA;
  curl exit-35 is the CA bundle, documented in auth-server.md):
  * part1 12/12 PASS: signup 201 → login → forced password change → /api/sso/approve 201
    → authorization_code exchange 201 (audience=phase-a-smoke, tokenType=sso,
    globalRole=user, TTL 7.00d, bound to the smoke user) → code replay 400 → introspect
    valid+audience+sso+globalRole.
  * grant-tier admin on the live store → part2 7/7 PASS: introspect shows admin WITHOUT
    a restart (mtime reload), on_behalf_of 201 (audience=mud-builder-server,
    tokenType=obo, TTL 2.00min, same user), OBO token introspects valid at its target.
  * /sso/authorize serves the SPA through the edge (200 text/html).
  * Post-revoke: the smoke service's assertion 401s (revocation live).
  Host scripts register-service/register-redirect-uri/grant-tier/revoke-tier/
  revoke-service-key ALL exercised against LIVE data (.env-aside procedure, restored and
  verified after). Cleanup: smoke tier reverted, smoke service key revoked, scratch
  PEM/state deleted. Residue: one inert `phase-a-smoke-1785163724` account (no
  account-delete exists; tier=user, its only sso token dies with the 7d TTL — A2's
  admin surface is the right future home for account cleanup). docs/auth-server.md
  Deployment section updated with the live status, the new consumer registration step,
  and the edge-probe quirk. One noise item: node crashes with a libuv teardown assert
  AFTER "ALL CHECKS PASSED" on Windows exit — cosmetic, all checks had completed.
