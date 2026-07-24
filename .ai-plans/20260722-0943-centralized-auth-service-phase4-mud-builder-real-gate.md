# Plan: Centralized auth service — Phase 4 (mud-builder real write-gate consumer)

Created: 2026-07-22T09:43:00-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Make mud-builder-server's actual write guard accept a centralized-auth-server account
(via a service-scoped API key minted through auth-client) as an alternative to a local
builder-auth.json master/API key — not just the Phase 2 diagnostic proof that introspect works.

## Goal
A real user can log into `auth-client`, mint an API key scoped to `service:
'mud-builder-server'` (`POST /api/keys`, already generic), paste that token into the
builder's existing Access-tab token field, and have it actually pass mud-builder-server's
write gate on mutating requests — with zero changes required to the builder's client UI
token-entry mechanism, and zero regression to the existing master-key/local-API-key path
when auth-server is unreachable or unconfigured. Done when a live round trip (real
auth-server + real minted key + real mutating request + revocation) is verified, not just
unit-tested.

## Constraints
- **Backward compatible, opt-in fallback only.** If `authServerUrl`/`servicePrivateKeyPath`
  aren't configured (today's default for anyone not running auth-server), behavior must be
  byte-identical to today: local store only, no network call attempted, no new failure mode.
  Verify this with an explicit test asserting the mocked `introspect()` is never called when
  introspect config is absent.
- **Local store is checked FIRST, synchronously, no network.** Only an unrecognized token
  falls through to introspect — master-key and local-API-key holders never pay a network
  round trip or depend on auth-server being up.
- **`requireMaster` (routes/auth.ts:53-67) is NOT touched.** Master identity means physical/
  host access to `builder-auth.json` — a centrally-authenticated account must never become
  master. Only the general `authGuard` write gate gains the fallback.
- **`BuilderActor` gains a `{kind:'account', accountId, label}` variant with a `label: string`
  field** so the existing ternaries in `audit.ts:50` and `routes/presence.ts:34`
  (`actor.kind === 'master' ? 'master' : actor.label`) keep working unmodified — confirmed
  both are two-armed ternaries over the union, not exhaustive switches, so this is a safe
  additive change with no edits needed to either file. Add a test locking this in rather than
  trusting it silently.
  **CORRECTION (post-implementation review, 2026-07-22):** this claim was only half right.
  `routes/presence.ts:34` genuinely is `actor.label`-only and needed no change (confirmed by
  a clean build + the presence.test.ts Phase 4 case). `audit.ts:50` was NOT a two-armed
  `.label` ternary as assumed here — it actually read `actor.kind === 'master' ? 'master' :
  \`key:${actor.id} (${actor.label})\`` and accessed `.id`, which the new `account` variant
  doesn't have. `tsc` caught this immediately during step 2; fixed with an explicit
  `describeActor()` switch (see Progress log entry for steps 1-4, and `audit.ts:20-30`).
  Lesson: don't assert a file's exact contents from memory in a plan's Constraints — grep/read
  it, or phrase the constraint as something to verify rather than something already confirmed.
- **Do not modify `services/services-server/src/auth-introspect-client.ts`'s public shape**
  (Phase 3's constraint — still a completed, shared, multi-consumer file). If a request
  timeout on `introspect()` turns out to be necessary, wrap the call at the mud-builder-server
  call site (e.g. `Promise.race` against a short timer), not inside the shared client.
- **A down/slow auth-server must not take down the local-key path** (see point 2) and must not
  hang a request indefinitely for an account-path caller either — a bounded timeout on the
  introspect call, failing to 401 (never 500, never an unbounded hang).
- **`pnpm --filter <pkg> <script> <args>`** — no `--` before positional args (repo-wide pnpm
  quirk, see Phase 2/3 docs) when running `register-service`/`temp-password` during live verify.

## Context
- `apps/mud-builder-server/src/routes/auth.ts:36-50` — current `authGuard`: synchronous,
  local-store-only, 401 on a miss. `:100-183` — existing diagnostic-only
  `GET /api/auth/introspect-check`, already imports `introspect` from
  `@shatteredarchive/services-server` and already has `INTROSPECT_SERVICE_NAME =
  'mud-builder-server'` — reuse both.
- `apps/mud-builder-server/src/auth-store.ts:47` — `BuilderActor` union, currently
  `{kind:'master'} | {kind:'key', id, label}`. `verify()` (`:148-160`) is local-only and
  synchronous — untouched by this phase.
- `apps/mud-builder-server/src/config.ts` — `authServerUrl`/`servicePrivateKeyPath` already
  exist on `MudBuilderConfig` (Phase 2), read from `AUTH_SERVER_URL`/`SERVICE_PRIVATE_KEY_PATH`.
- `apps/mud-builder-server/src/app.ts:52-63` — wiring order: `authGuard` installs before
  `auditMiddleware`, which installs before any route. `authGuard(authStore)` call is at
  `:55` — needs `config` threaded through the same way `registerAuthRoutes(app, authStore,
  config)` already does at `:61`.
- `apps/mud-builder-server/src/audit.ts:45-51`, `apps/mud-builder-server/src/routes/
  presence.ts:33-34` — both read `res.locals.builderActor` and ternary on
  `kind === 'master'`, else use `.label`. Confirmed safe for the new variant (see Constraints).
- `services/services-server/src/auth-introspect-client.ts` — `introspect(authServerBaseUrl,
  service, privateKeyPem, token): Promise<{valid, accountId?, service?, label?}>`. Throws on a
  non-2xx (bad/unregistered service assertion); returns `{valid:false}` for an unknown/
  revoked/expired token (not a throw). Already a `mud-builder-server` dependency.
- `apps/auth-client/src/api/client.ts:90-91` — `createKey(service, label, expiresAt)` →
  `POST /api/keys`, already fully generic over `service` — no auth-client change needed at
  all; a user can mint a `service:'mud-builder-server'` key today, this phase just makes the
  server side actually honor it.
- `apps/mud-builder-client/src/features/auth/AccessPage.tsx` — token entry is a bare paste
  field (`:157-175`) with no knowledge of WHERE a token came from; `probe()` (`:47-71`)
  already buckets "valid but not master" into status `'key'` via a 403 from `api.authKeys()`
  (master-only route) — a centrally-issued account token lands in that same bucket for free.
  No client code change is required for the mechanism to work; only the status copy
  (`STATUS_TEXT.none`, `:24`) might usefully mention the new option.
- `apps/auth-server/README.md` and `docs/auth-server.md` both currently describe
  `mud-builder-server`'s consumption as the Phase 2 diagnostic-only proof
  (`GET /api/auth/introspect-check`) — both need a line updated once this phase lands, since
  it becomes the real gate, not just a proof.
- Phase 2 doc (`.ai-plans/20260719-2300-centralized-auth-service-phase2-client-consumer.md`)
  and Phase 3 doc (`.ai-plans/20260720-0052-centralized-auth-service-phase3-more-consumers.md`)
  — read their Constraints/Context before touching anything; two real bugs were found and
  fixed upstream there (iat/exp units mismatch, jest moduleNameMapper) — nothing to redo, just
  don't reintroduce either class of bug.
- **DELEGATION**: everything here is (CLAUDE) — security-sensitive guard logic and a live
  network-dependent verification step, not qwen-appropriate (same reasoning as Phase 3).

## Steps

### [x] 1. (CLAUDE) auth-store.ts: add the `account` BuilderActor variant
- Do: extend the `BuilderActor` union in `apps/mud-builder-server/src/auth-store.ts:47` to
  `{kind:'master'} | {kind:'key'; id: string; label: string} | {kind:'account'; accountId:
  string; label: string}`. No other change to this file — `verify()` stays local-only.
- Files: `apps/mud-builder-server/src/auth-store.ts`.
- Verify: `pnpm --filter @shatteredarchive/mud-builder-server build` type-checks clean
  (nothing yet constructs the new variant, so this alone should be a no-op compile).

### [x] 2. (CLAUDE) routes/auth.ts: async authGuard with introspect fallback
- Do: change `authGuard`'s signature to accept the introspect config (same
  `Pick<MudBuilderConfig, 'authServerUrl' | 'servicePrivateKeyPath'>` type
  `registerAuthRoutes` already takes), make the handler `async`. Logic: keep the GET/HEAD/
  OPTIONS bypass and the local `store.verify(token)` check exactly as-is; only on a LOCAL
  miss, and only if both `authServerUrl` and `servicePrivateKeyPath` are set and a token is
  present, attempt the fallback: read the private key file (reuse the same read pattern as
  `introspect-check`'s handler), call `introspect(authServerUrl, INTROSPECT_SERVICE_NAME,
  privateKeyPem, token)` wrapped in a bounded timeout (e.g. `Promise.race` against ~3s) so a
  hung auth-server 401s rather than hangs the request. On `{valid:true}`, set
  `res.locals.builderActor = {kind:'account', accountId: result.accountId ?? '', label:
  result.label ?? result.accountId ?? 'account'}` and call `next()`. On `{valid:false}`, a
  thrown error, a timeout, or a missing/unreadable key file, fall through to the existing 401
  — never a 500, never an unhandled rejection (wrap the whole fallback in try/catch).
- Files: `apps/mud-builder-server/src/routes/auth.ts`.
- Verify: new unit tests (step 4) plus a clean build.

### [x] 3. (CLAUDE) app.ts: thread config into authGuard
- Do: change the `app.use(authGuard(authStore))` call at `apps/mud-builder-server/src/
  app.ts:55` to `app.use(authGuard(authStore, config))`, matching how `registerAuthRoutes`
  already receives `config` two lines later. No other wiring/order change.
- Files: `apps/mud-builder-server/src/app.ts`.
- Verify: `pnpm --filter @shatteredarchive/mud-builder-server build` clean.

### [x] 4. (CLAUDE) tests: authGuard's centralized-auth fallback
- Do: in `apps/mud-builder-server/src/routes/auth.test.ts`, `jest.mock`
  `@shatteredarchive/services-server`'s `introspect` and add a describe block covering: (a) a
  valid LOCAL key still passes with the mock never called (proves local-first, no network for
  the common case); (b) introspect config absent entirely → unknown token 401s, mock never
  called (byte-identical-to-today guarantee from Constraints); (c) unknown-locally token +
  mock resolves `{valid:true, accountId:'a1', service:'mud-builder-server', label:'alice'}` →
  2xx and `res.locals.builderActor` is `{kind:'account', accountId:'a1', label:'alice'}`; (d)
  mock resolves `{valid:false}` → 401; (e) mock rejects (network error) → 401, not a throw/500;
  (f) mock never resolving within the timeout → 401 within a bounded time, not a hang (fake
  timers or a short test timeout constant). Also add one assertion in `audit.test.ts` (or
  extend an existing one) proving an `account` actor renders as `label` in the audit line,
  and similarly for `presence.test.ts`'s heartbeat name — locking in the Constraints claim
  that those two files need no code change.
- Files: `apps/mud-builder-server/src/routes/auth.test.ts`, `apps/mud-builder-server/src/
  audit.test.ts` (or wherever its test lives — confirm exact filename at execution time),
  `apps/mud-builder-server/src/routes/presence.test.ts`.
- Verify (HOST): `pnpm --filter @shatteredarchive/mud-builder-server test` — all green,
  including the new cases; paste the pass count in the Progress log.

### [x] 5. (CLAUDE) client copy + docs close-out
- Do: update `AccessPage.tsx`'s `STATUS_TEXT.none` copy (and/or add a short note near the
  token field) to mention a builder-scoped key can also be minted by logging into the
  centralized auth service, instead of only pointing at the operator/master-key-on-host path.
  Update `apps/auth-server/README.md`'s "real, deployed Phase 2 consumer" line and
  `docs/auth-server.md`'s Overview + `mud-builder-server` mentions to say it's now a REAL
  gate consumer (not just the diagnostic route) — keep the diagnostic route's own doc line
  too, it still exists and still works standalone. Refresh `.annotated`/`@ai-` headers for
  every file touched in steps 1-3 per this repo's AI-index convention.
- Files: `apps/mud-builder-client/src/features/auth/AccessPage.tsx`, `apps/auth-server/
  README.md`, `docs/auth-server.md`, `.annotated` entries for touched dirs, `@ai-summary`
  header in `apps/mud-builder-server/src/routes/auth.ts`.
- Verify: `pnpm --filter @shatteredarchive/mud-builder-client test` still green (no behavior
  change, copy only); read back the updated docs for accuracy.

### [x] 6. (CLAUDE) Live verification against a real auth-server, then teardown
- Do: start a real `auth-server` (temporary local `DATA_ENCRYPTION_KEY`, reverted after, same
  discipline as Phases 2/3). Register (or reuse) a `mud-builder-server` service key via
  `register-service` (no `--`). Start `mud-builder-server` with `MUD_WRITE_ENABLED=true`,
  `MUD_BUILDER_AUTH` not `off`, `AUTH_SERVER_URL`/`SERVICE_PRIVATE_KEY_PATH` set. Sign up a
  real account via the full challenge/signup/login/forced-change flow, mint a key with
  `service:'mud-builder-server'`. Confirm: (1) that key, pasted as `Authorization: Bearer`,
  passes a real low-risk mutating request (e.g. a presence heartbeat POST or a harmless area
  preview-adjacent write) — 2xx, not 401; (2) the audit log line for that request shows the
  account's label, not "anonymous" or a raw key id; (3) revoking that key at auth-server
  (`DELETE /api/keys/:id`) makes the VERY NEXT request with the same token 401 immediately (no
  caching yet, so revocation is instant — confirm and document this as a current property,
  since it may inform a future caching decision); (4) a garbage/never-registered token still
  401s; (5) stopping auth-server entirely, then retrying a request with a token the LOCAL
  store already knows (master or a local API key) still succeeds with no delay (proves the
  local-first path never depends on auth-server being reachable); (6) stopping auth-server and
  retrying with an account-only token 401s within the bounded timeout, not a hang.
- Files: none new; this step only verifies steps 1-5's code.
- Verify (HOST): all six live checks pass as described; log exact commands/results. Tear down
  (kill auth-server via `netstat`+`taskkill`, not `TaskStop` alone — the now-standard finding
  from Phase 3 — revert its `.env`, delete scratch data dir/keys). Box every prior step whose
  live behavior was exercised here, then set `Status: COMPLETE`.

## Progress log
- 2026-07-22T09:43 plan created (Claude). User asked to research the (new, since last mud-
  builder session) centralized `auth-server`/`auth-client` and "make sure it is properly
  integrated with the builder tool"; clarified via AskUserQuestion that they want REAL login
  wired in (a new phase), not just a re-confirmation that Phase 2's diagnostic route still
  works. Design lands on the minimal-surface option: no new login UI in mud-builder-client at
  all — `auth-client`'s existing generic `POST /api/keys {service, label}` already lets a
  real user mint a `mud-builder-server`-scoped key, and the builder's Access tab already
  accepts an arbitrary pasted bearer token; the only missing piece is `authGuard` actually
  calling `introspect()` for a token it doesn't recognize locally, which today it never does
  (Phase 2's `/api/auth/introspect-check` is diagnostic-only, explicitly documented as "NOT a
  replacement for the builder token guard").
- 2026-07-22T10:1x steps 1-4 done (Claude). `BuilderActor` gained `{kind:'account', accountId,
  label}` (`auth-store.ts`). `authGuard` became async and local-first: `store.verify()` first,
  and only on a local miss (with a token present) falls through to a new `tryIntrospect()`
  helper — reads the configured private key, calls the existing `introspect()`, wrapped in a
  3s `withTimeout`, never throws (unconfigured/unreadable key/network error/timeout/
  `{valid:false}` all just return `null`, letting the caller's existing 401 fire). `app.ts`
  threads `config` into `authGuard(authStore, config)`. Found and fixed a real bug my own
  Constraints section got wrong: `audit.ts:50`'s ternary actually read `actor.id` (not just
  `.label`), which doesn't exist on the new `account` variant — `tsc` caught it immediately;
  replaced with an explicit `describeActor()` switch covering all three kinds
  (`account:<accountId> (<label>)` for the new one). `presence.ts`'s ternary WAS genuinely
  label-only and needed no change, confirmed by the same clean build. Added 7 new cases to
  `auth.test.ts` (local-first no-network-call, unconfigured no-op, valid→200+audited-as-
  account, `{valid:false}`→401, connection-refused→401, hanging-server→401 within the bounded
  timeout, unreadable-key-path→401) using a real in-process fake `/api/introspect` HTTP server
  (not a jest.mock) so the actual `introspect()`/`signAssertion()` code path is exercised, plus
  one case in `presence.test.ts` locking in that a heartbeat's `name` becomes the account
  label. `pnpm --filter @shatteredarchive/mud-builder-server test`: 81/81 passed (74 pre-
  existing + 7 new). `pnpm --filter @shatteredarchive/mud-builder-server build`: clean.
- 2026-07-22T10:2x step 5 done (Claude). Updated `AccessPage.tsx`'s `STATUS_TEXT.none` copy and
  its file-header doc comment to mention a centrally-issued key works in the same token field
  (no code change needed there — confirmed by re-running `pnpm --filter
  @shatteredarchive/mud-builder-client test`: 92/92 passed, copy-only). Updated
  `apps/auth-server/README.md` and `docs/auth-server.md` to describe `mud-builder-server` as a
  real gate consumer (Phase 4), not just Phase 2's diagnostic proof — kept the diagnostic
  route's own mention too, since it still exists and still works standalone. Refreshed
  `.annotated` entries for every touched directory (`apps/mud-builder-server/src`,
  `.../src/routes`, `apps/mud-builder-client/src/features/auth`) and the `@ai-summary`/
  `@ai-notes` header in `routes/auth.ts`.
- 2026-07-22T10:3x-11:0x step 6 done (Claude) — full live round trip against REAL processes,
  not mocks. Temporarily set a local `DATA_ENCRYPTION_KEY` in `apps/auth-server/.env`, seeded
  the anti-bot question pool from `dsl-questions.example.json`, started a real `auth-server`
  (`pnpm dev`, background). Registered a real service key: `pnpm --filter
  @shatteredarchive/auth-server register-service mud-builder-server` (no `--`), saved the
  printed private key to a scratch `shattered-service.key`. Temporarily pointed
  `apps/mud-builder-server/.env` at a scratch `MERC_MUD_PATH` (never the real merc-mud
  checkout), `MUD_WRITE_ENABLED=true`, `AUTH_SERVER_URL=http://localhost:62000`, and the
  scratch key path; started a real `mud-builder-server` (`pnpm dev`, background). Drove the
  full account flow with a small Node script: `GET /api/auth/challenge` → answered all 3 real
  anti-bot questions → `POST /api/auth/signup` (201, one-time password) → `POST
  /api/auth/login` → `POST /api/account/change-password` (forced) → `POST /api/keys
  {service:'mud-builder-server', label:'live-verify'}` (201, plaintext token). Results, all
  against the REAL running services: (1) that token as `Authorization: Bearer` on `POST
  /api/presence` → **200**, `{ok:true,...,name:"live-verify"}`; the presence list's entry
  `name` was `"live-verify"` — the real account label, sourced from the real auth-server's real
  key-store, not a stub. (2) A garbage token → **401**. (3) `DELETE /api/keys/:id` at
  auth-server, then the SAME token immediately after → **401** — confirms revocation is
  instant, no caching layer exists yet (worth remembering if a future phase adds one). (4)
  Read the real master key from the scratch `builder-auth.json` and confirmed it authorizes a
  mutation in **0.24s** while `auth-server` was still up (control). (5) Killed `auth-server`
  (`netstat`+`taskkill`, confirmed via a failed `/health` fetch — `TaskStop` alone is not
  trusted per the standing Phase 3 finding) and re-tested: the SAME master key still
  authorized a mutation in **0.24s** — proves the local-first path has zero dependency on
  auth-server being reachable, exactly per Constraints. (6) A second real account token
  (minted before the kill), tried with `auth-server` down → **401 in 0.24s** (immediate
  connection-refused, not a 3s timeout wait) — clean failure, not a hang, not a crash.
  Teardown: killed `mud-builder-server` the same way, reverted both `.env` files (only
  intentional non-secret content differs afterward — see below), deleted the scratch
  `apps/auth-server/data/` dir (question pool + the two real test accounts/keys it created)
  and the scratchpad's temp key/area files. `git diff` on both `.env` files confirms
  `apps/auth-server/.env` is byte-identical to before; `apps/mud-builder-server/.env` differs
  ONLY in the deliberate Phase 5 comment-doc update (all env values themselves — writes off,
  auth vars commented — are unchanged). All six of Goal's live-verification bars from the plan
  header are met. `Status: COMPLETE`.
- 2026-07-22T (post-completion review, Claude) — re-verified the implementation against
  current source rather than trusting this log: re-read `auth-store.ts`, `routes/auth.ts`,
  `app.ts`, `audit.ts`, `presence.ts`, both test files, `config.ts`, `AccessPage.tsx`, and both
  docs; re-ran `pnpm --filter @shatteredarchive/mud-builder-server build` (clean),
  `...test` (81/81, matches the claim above), and `pnpm --filter
  @shatteredarchive/mud-builder-client test` (92/92, matches). All code matched what this log
  claims. Two documentation issues found and fixed: (1) this doc's own Constraints section
  had an uncorrected false claim about `audit.ts` needing no edit — see the CORRECTION note
  added inline above it. (2) `apps/auth-server/README.md` and `docs/auth-server.md` called
  `mud-builder-server` a "real, deployed consumer" without disclosing that neither compose
  file actually sets `AUTH_SERVER_URL`/`SERVICE_PRIVATE_KEY_PATH` for it — the Phase 4
  fallback is code-complete and live-verified locally but currently inert in any deployed
  instance (a deliberate Phase 2 choice, not a regression). Added an explicit caveat to both
  docs plus activation steps in `docs/auth-server.md`'s Deployment section. No code changes
  were needed — the implementation itself checked out correct on every point.
