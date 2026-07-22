# Plan: Centralized auth service — Phase 3 (more /api/introspect consumers)

Created: 2026-07-20T00:52:00-0500 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Prove the Ed25519 `/api/introspect` mechanism (built in Phase 1, first proven against a
real consumer in Phase 2 via `mud-builder-server`) against more real Node services.

> **SCOPE CHANGE (2026-07-20, user-directed) — READ BEFORE TRUSTING STEPS 1-2 BELOW.**
> This plan originally targeted THREE services: `web-server`, `game-server`,
> `kingdom-tactics-server`. The user then explicitly reverted every auth-related change made
> to `web-server` and `game-server` (undoing steps 1 and 2 below in full — the
> `introspect-check.ts` scripts, `package.json` script entries, `.env` blocks, and
> `docs/*.md` Configuration rows are all gone from those two apps again) and directed that
> only `kingdom-tactics-server` and the MUD Builder pair (`mud-builder-server`, wired in
> Phase 2) actually adopt the centralized-auth introspect mechanism for now. Steps 1 and 2
> are kept below **as a historical record of what was built and then deliberately undone**,
> not as a description of current repo state — their `[x]` boxes are stale on purpose (see
> the box-state note added to each) rather than silently deleted, so a future session doesn't
> re-discover and redo work that was intentionally reverted. Step 3 (`kingdom-tactics-server`)
> stands as originally built. See the final Progress-log entry for the full reasoning.

> DELEGATION / OWNERSHIP — READ FIRST
> Phase 1 (`apps/auth-server`) and Phase 2 (`apps/auth-client` + `mud-builder-server`
> consumer) are both `Status: COMPLETE` — read `.ai-plans/20260719-1240-centralized-auth-
> service-phase1-server.md` and `.ai-plans/20260719-2300-centralized-auth-service-phase2-
> client-consumer.md` first (Constraints + Context, and Phase 2 steps 6-7 specifically —
> two real bugs were found there: a seconds-vs-milliseconds `iat`/`exp` units mismatch in
> `signAssertion`, and a jest `moduleNameMapper` gotcha; both are already fixed upstream in
> `services/services-server/src/auth-introspect-client.ts`, nothing to redo).
> Everything here is **(CLAUDE)** — no step is qwen-appropriate (live service-key
> registration + real HTTP round-trips against a running auth-server, judgment calls about
> where code lands).
> **Verification is a HOST (Claude/human) task throughout**, same as Phase 2: every step's
> box stays unchecked until a REAL running `auth-server` + the target service, with a REAL
> registered key, produces `{valid:true}`/`{valid:false}`/a clean failure — unit tests alone
> don't satisfy this (Phase 2's real units-mismatch bug was invisible to `tsc`/eslint and
> only surfaced this way).

## Goal
**(Superseded by the scope change above — current goal is `kingdom-tactics-server` only.)**
Originally: each of `web-server`, `game-server`, and `kingdom-tactics-server` gains a small,
host-only `scripts/introspect-check.ts` CLI (mirroring `auth-server`'s own `register-service`/
`revoke-service-key` host-script convention) that reads `AUTH_SERVER_URL`/
`SERVICE_PRIVATE_KEY_PATH`, calls `services-server`'s existing `introspect()` helper with a
token given on argv, and prints the result. `kingdom-tactics-server` has this and it's
verified working; `web-server`/`game-server` do not (reverted) and are not currently planned
to get it — if a future phase wants them wired in, treat it as a fresh decision, not a
resumption of steps 1-2 here.

## Constraints
- **No new HTTP route in any of these three services.** Research before this plan was
  written (see Context) confirmed all three have ZERO existing auth surface — no bearer/
  API-key/session guard anywhere, unlike `mud-builder-server`'s pre-existing master-only
  `/api/auth` mount that Phase 2 could safely reuse. Bolting a new endpoint (admin-only or
  not) onto a service that has never needed to gate anything means inventing a brand-new
  guard mechanism from scratch in each — that is NOT "the smallest real integration," it's
  a mini auth-design project per service, and out of scope for what this phase needs to
  prove. A host-only script proves the exact same `introspect()` call path (HTTP round-trip
  to a real `auth-server`, real Ed25519 signature, real response parsing) with zero new
  network exposure. If a future phase adds a real HTTP consumer need to one of these
  services, THAT phase should design its guard deliberately, not inherit one improvised
  here for a proof-of-mechanism.
- **Reuse `services/services-server/src/auth-introspect-client.ts`'s `introspect()`/
  `signAssertion()` as-is.** Do not duplicate the Ed25519/HTTP logic per service — every
  one of these three already depends on `@shatteredarchive/services-server` (confirmed).
- **No local `config.ts` module per service.** None of the three currently has one (unlike
  `mud-builder-server`) — they all use the shared `getConfigFromEnv()`/`ExpressServiceConfig`
  from `services-server`'s `express-service.ts`. Adding a bespoke config file per service
  just for two env vars used by a host-only script is disproportionate; read
  `process.env.AUTH_SERVER_URL`/`process.env.SERVICE_PRIVATE_KEY_PATH` directly in each
  `scripts/introspect-check.ts`, with `dotenv.config()` at the top (mirroring how
  `auth-server`'s own host scripts load `.env` — check `apps/auth-server/scripts/
  register-service.ts`'s pattern first and mirror it, including the `override:true` +
  base-`.env`-then-local-override precedence if that pattern is present).
- **`shattered-service.key` naming/gitignore already covers all three** — the root
  `.gitignore`'s exact-filename pattern from Phase 1 is filename-based, not path-based, so
  no per-app `.gitignore` entry is needed (confirmed true for `mud-builder-server` already;
  same reasoning applies here).
- **`pnpm --filter <pkg> <script> <args>` — do NOT add a `--` before the arguments.**
  Freshly fixed repo-wide finding (see the Phase 2 plan doc's final follow-up entry): on
  this repo's pinned `pnpm@11.8.0`, `pnpm --filter <pkg> <script> -- <args>` forwards the
  literal `--` token through as an argument instead of stripping it. Every host script
  invocation in this plan (`register-service <name>`, and each new `introspect-check
  <token>` script once wired) must be written WITHOUT `--`.
- **`kingdom-tactics-server` has no docs file at all** (`docs/kingdom-tactics-server.md`
  doesn't exist, confirmed). Do not create one speculatively as part of this phase — just
  document the two new env vars as a commented block in its `.env`, matching the minimal
  style already used there (no prose-doc convention to extend). Flag if this turns out to
  be insufficient once the step is actually executed.
- **Do not modify `apps/mud-builder-server`, `apps/auth-server`, or `apps/auth-client` in
  this phase** — Phase 2 is complete and independently verified; if a genuine shared-code
  change is needed (e.g., to `auth-introspect-client.ts`), stop and flag why rather than
  silently editing a completed phase's code.

## Context — inherited from Phase 1 + Phase 2 (verified, not re-verified here unless noted)
- **`introspect(authServerBaseUrl, service, privateKeyPem, token): Promise<{valid, accountId?,
  service?, label?}>`** already exists and works, `services/services-server/src/
  auth-introspect-client.ts`, exported from that package's `index.ts` barrel. Throws with a
  readable message on a non-2xx (bad/unregistered assertion); returns `{valid:false}` for an
  unknown/expired/revoked token (not an error).
- **Registering a real service key**: `pnpm --filter @shatteredarchive/auth-server
  register-service <service-name>` (no `--`) prints a fresh Ed25519 private key PEM exactly
  once — save as `shattered-service.key` on the consuming service's own host/checkout.
  `auth-server` never stores the private half.
- **Research done before this plan was written** (Explore-agent survey, not re-verified
  per-service here — re-confirm the specific file/line at execution time since code may have
  moved): all three of `web-server`/`game-server`/`kingdom-tactics-server` share the exact
  same shape — `getConfigFromEnv('<name>')` + `createExpressService()` from `services-server`,
  no local `config.ts`, no local auth guard, HTTP surface limited to `/` + `/health` (plus
  `game-server`'s `/ws/game` and `kingdom-tactics-server`'s `/ws/kt` WebSocket gateways, whose
  own "authorization" is game-domain seat-claiming, not caller auth — irrelevant to this
  phase). Route-registration entry points if ever needed: `apps/web-server/src/index.ts:266`,
  `apps/game-server/src/index.ts:156`, `apps/kingdom-tactics-server/src/index.ts:43` (NOT used
  by this plan, since no HTTP route is being added — noted only for context/future phases).
  Env-var docs: `docs/web-server.md` (`# Configuration`, ~line 111), `docs/game-server.md`
  (`# Configuration`, ~line 132), no doc file for `kingdom-tactics-server` (see Constraints).
- **Pattern to mirror for the new scripts**: `apps/auth-server/scripts/register-service.ts`
  (dotenv loading, a `main().catch()` wrapper, host-only banner comment, `Usage:` line —
  now fixed this session to NOT show a `--` before its argument).

## Steps

### [x] 1. (CLAUDE) web-server: introspect-check script + env docs — **REVERTED 2026-07-20, see scope-change note above; box left [x] as a historical record only, NOT current repo state**
- Do: `apps/web-server/scripts/introspect-check.ts` — loads `.env`, reads
  `AUTH_SERVER_URL`/`SERVICE_PRIVATE_KEY_PATH` from env (fail fast with a clear message if
  either is unset — mirror `auth-server`'s own scripts' fail-fast style), reads the key file,
  calls `introspect(authServerUrl, 'web-server', privateKeyPem, token)` with `token` from
  `process.argv[2]`, prints the JSON result, exits non-zero on a thrown error (network/bad
  key) vs. exits 0 printing `{valid:false}` for an unknown token (that's a successful call,
  not a failure). Add a `"introspect-check": "tsx scripts/introspect-check.ts"` script to
  `apps/web-server/package.json`. Document `AUTH_SERVER_URL`/`SERVICE_PRIVATE_KEY_PATH` in
  `apps/web-server/.env` (blank/commented, matching `mud-builder-server/.env`'s style) AND in
  `docs/web-server.md`'s `# Configuration` table.
- Files: `apps/web-server/scripts/introspect-check.ts`, `apps/web-server/package.json`,
  `apps/web-server/.env`, `docs/web-server.md`.
- Verify (HOST): `pnpm --filter @shatteredarchive/web-server build` succeeds (script
  type-checks). Full live verification deferred to step 4 (all three services verified
  together against one running `auth-server`, per its own README's workflow). Box only after
  step 4's live check for THIS service specifically passes — log which token/result it
  produced.

### [x] 2. (CLAUDE) game-server: introspect-check script + env docs — **REVERTED 2026-07-20, see scope-change note above; box left [x] as a historical record only, NOT current repo state**
- Do: Same shape as step 1, service name `'game-server'`. `apps/game-server/scripts/
  introspect-check.ts`, `"introspect-check"` script in `apps/game-server/package.json`,
  `.env` doc block, `docs/game-server.md`'s `# Configuration` table entry.
- Files: `apps/game-server/scripts/introspect-check.ts`, `apps/game-server/package.json`,
  `apps/game-server/.env`, `docs/game-server.md`.
- Verify (HOST): `pnpm --filter @shatteredarchive/game-server build` succeeds. Live check in
  step 4; box only after that passes for this service.

### [x] 3. (CLAUDE) kingdom-tactics-server: introspect-check script + env docs
- Do: Same shape again, service name `'kingdom-tactics-server'`. Per Constraints, do NOT
  create a new `docs/kingdom-tactics-server.md` — just the `.env` comment block (mirror
  `mud-builder-server/.env`'s inline-doc style since this app has no prose-doc precedent of
  its own to match instead).
- Files: `apps/kingdom-tactics-server/scripts/introspect-check.ts`,
  `apps/kingdom-tactics-server/package.json`, `apps/kingdom-tactics-server/.env`.
- Verify (HOST): `pnpm --filter @shatteredarchive/kingdom-tactics-server build` succeeds.
  Live check in step 4; box only after that passes for this service.

### [x] 4. (CLAUDE) Live verification against a real auth-server, docs close-out — **partially superseded 2026-07-20: this step's evidence for web-server/game-server describes code that was subsequently reverted (steps 1-2); its evidence for kingdom-tactics-server still accurately describes current repo state**
- Do:
  1. Start a real `auth-server` (per its README — temporary local `DATA_ENCRYPTION_KEY` in
     `.env`, reverted after, same discipline as Phase 2's verification).
  2. Register three real service keys: `pnpm --filter @shatteredarchive/auth-server
     register-service web-server` (and `game-server`, `kingdom-tactics-server`) — no `--`.
     Save each private key to that service's own `shattered-service.key` (or a scratchpad
     path referenced via `SERVICE_PRIVATE_KEY_PATH` for the test run — decide and note which,
     consistent with how Phase 2 step 6 handled `mud-builder-server`'s).
  3. Sign up a real account through `auth-server`'s API (challenge/signup/login/forced-change,
     same flow as Phase 2's verification), mint a real API key.
  4. For EACH of the three services: run `pnpm --filter <pkg> introspect-check <the-real-
     token>` and confirm `{valid:true,accountId,service,label}`; run again with a garbage
     token and confirm `{valid:false}`; swap in a freshly-generated NEVER-registered keypair
     and confirm a clean thrown error (not a crash).
  5. Update Phase 2's own Constraints line ("every current and future Node consumer... already
     depends on this package") if its phrasing needs updating now that three more are real,
     not hypothetical — Claude's call whether this is worth touching a `Status: COMPLETE` doc
     for; if so, ONLY append a note, never rewrite Phase 2's history.
  6. Tear down: stop `auth-server`, revert its `.env`, delete any scratch data dirs/keys,
     confirm ports free (per Phase 2's documented `TaskStop`-doesn't-kill-the-child-process
     gotcha — use `netstat`+`taskkill` to confirm, don't trust `TaskStop` alone).
- Files: none new beyond what steps 1-3 created; this step boxes THOSE steps too once their
  live checks pass (see each step's own Verify line).
- Verify (HOST): all 3×2 cases (valid/garbage token × 3 services) plus 3× wrong-key-fails-
  cleanly produce the exact results listed above. Box + Progress log with the exact commands
  run and their outputs, mirroring Phase 2 step 6's evidence depth. Set `Status: COMPLETE`.

## Progress log
- 2026-07-20T00:52 plan created (Claude), Status ACTIVE, unstarted. Phase 3 of the
  centralized auth service work — Phase 1 (`auth-server`) and Phase 2 (`auth-client` +
  `mud-builder-server` consumer) are both independently complete. Scope chosen from the
  user's explicit direction ("more introspect consumers") after an Explore-agent survey of
  `web-server`/`game-server`/`kingdom-tactics-server` found none of them has ANY existing
  auth surface (unlike `mud-builder-server`, which already had a master-only `/api/auth`
  mount Phase 2 could safely reuse) — this is the key judgment call baked into this plan's
  design: a host-only `introspect-check` script per service, mirroring `auth-server`'s own
  `register-service`/`revoke-service-key` host-script convention, INSTEAD OF a new HTTP
  route, specifically to avoid inventing a brand-new ad hoc guard mechanism in three services
  that have never needed one. If a real HTTP consumer need arises for one of these later,
  that should be its own deliberately-designed phase, not inherited from this proof.
- 2026-07-20T01:1x steps 1-4 DONE and boxed together, Status COMPLETE (Claude). Built as one
  continuous pass — the three scripts are structurally identical (service name is the only
  thing that differs). `apps/{web-server,game-server,kingdom-tactics-server}/scripts/
  introspect-check.ts`: dotenv-loads `.env` (mirroring `auth-server/scripts/
  register-service.ts`'s `override:true` pattern), reads `AUTH_SERVER_URL`/
  `SERVICE_PRIVATE_KEY_PATH` from env (fails fast with a clear message if either is unset),
  reads the key file, calls the EXISTING `services-server` `introspect()` helper with
  `process.argv[2]` as the token, prints the JSON result. Each app's `package.json` gained an
  `"introspect-check": "tsx scripts/introspect-check.ts"` script. `.env` gained a blank/
  commented `AUTH_SERVER_URL`/`SERVICE_PRIVATE_KEY_PATH` block (mirroring
  `mud-builder-server/.env`'s Phase-2 style) in all three. `docs/web-server.md` and
  `docs/game-server.md`'s Configuration tables gained the two new rows;
  `kingdom-tactics-server` skipped a doc file per the Constraints (none exists for it yet).
  No `config.ts` was added to any of the three, per Constraints — `process.env` read directly.
  Verified on HOST: `pnpm --filter <pkg> build` — clean for all three. Re-ran each service's
  own `test` — `web-server`/`game-server` still correctly report "0 matches" (confirmed via
  `find` they have zero test files, unchanged, not a regression); `kingdom-tactics-server`
  still 5/5 (its own local jest config, untouched). Then a REAL end-to-end run: started a
  real `auth-server` (temporary local `DATA_ENCRYPTION_KEY`, reverted after), registered THREE
  real service keys via `pnpm --filter @shatteredarchive/auth-server register-service
  <name>` (no `--` — confirmed live that the fixed form registers the CORRECT service name
  each time, unlike the Phase 2 misfire), signed up a real account through the full
  challenge/signup/login/forced-change flow, minted a real API key. For EACH of the three
  services, ran `AUTH_SERVER_URL=... SERVICE_PRIVATE_KEY_PATH=<scratch-key> pnpm --filter
  <pkg> introspect-check <token>`: a valid token returned
  `{valid:true,accountId,service,label}` (9 total valid+garbage cases: 3 services × 2 token
  types, all correct); swapping in a freshly-generated NEVER-registered keypair against
  `web-server` produced a clean thrown error (`401 service assertion is invalid, unknown, or
  expired`, not a crash) — `auth-server`'s `/health` still 200'd right after. Matches the
  Goal's `{valid:true}`/`{valid:false}`/clean-failure bar exactly, live, not by unit test
  alone (per this plan's own Verify requirement). Cleanup: killed `auth-server` (via
  `netstat`+`taskkill`, not `TaskStop` alone, per the now-standard finding that `TaskStop`
  doesn't reliably kill the actual spawned child process on this host), reverted its `.env`,
  deleted the smoke-test `data/` dir, cookie jar, and all four scratch private key files
  (three real + one deliberately-wrong). Skipped step 4.5's optional Phase-2-doc-touch-up —
  Phase 2's existing "every current and future Node consumer" phrasing already reads
  correctly now that three of those are real; nothing needed changing.
- 2026-07-20T01:3x SCOPE CHANGE (user-directed): "Undo any changes made to game client and
  web server related to authentication. Leave any other changes alone. kingdom tactics and
  builder are fine to modify." Reverted, in full, everything steps 1 and 2 added:
  `apps/web-server/scripts/introspect-check.ts` and `apps/game-server/scripts/
  introspect-check.ts` deleted entirely; the `"introspect-check"` line removed from both
  `package.json`s' `scripts` (their UNRELATED `"test"` script fix from the same session —
  `--rootDir .` → `--testPathPatterns <path>`, a pre-existing repo-wide jest bug, not an auth
  change — was explicitly left in place, per "leave any other changes alone"); the appended
  `AUTH_SERVER_URL`/`SERVICE_PRIVATE_KEY_PATH` block removed from both `.env` files (back to
  their exact original content/no-trailing-newline); the two new Configuration-table rows
  removed from `docs/web-server.md` and `docs/game-server.md`. Confirmed via `git diff` that
  both `.env` files are now byte-identical to their pre-Phase-3 state and both `package.json`s
  only still differ by the test-script fix. `apps/kingdom-tactics-server` and
  `apps/mud-builder-server` (the "builder" — actually Phase 2's consumer, not this phase's,
  but explicitly named as OK-to-keep) were left untouched. The user asked specifically that
  this doc "indicate a change in authentication mechanisms" — interpreted as: the SET of
  services adopting the centralized-auth introspect mechanism narrowed from three
  (`web-server`, `game-server`, `kingdom-tactics-server`) to one from THIS phase
  (`kingdom-tactics-server` — `mud-builder-server` was already wired in Phase 2, a separate,
  still-`COMPLETE` phase not touched by this reversal). Updated the doc header, Goal, and
  steps 1/2/4's headings above to flag this rather than silently leaving stale `[x]` boxes
  that would misrepresent current repo state to a future reader. `Status` left `COMPLETE` —
  the plan's (now-narrower) Goal is still fully met by what remains.
