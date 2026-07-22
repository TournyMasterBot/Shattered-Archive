# Plan: Centralized auth service — Phase 2 (auth-client UI + one real /api/introspect consumer)

Created: 2026-07-19T23:00:00-0500 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Build `apps/auth-client` (the browser UI for the `auth-server` built in Phase 1 —
signup/login/account/keys), deploy it (Dockerfile + both compose files + the nginx
`location /` split on `auth.shatteredarchive.dev`), and wire up ONE real service
(`mud-builder-server`) to actually call `POST /api/introspect` with a signed assertion —
the mechanism Phase 1 built and tested only with a synthetic in-test keypair.

> DELEGATION / OWNERSHIP — READ FIRST
> This is Phase 2 of 2 (Phase 1 — `apps/auth-server` core — is `Status: COMPLETE` at
> `.ai-plans/20260719-1240-centralized-auth-service-phase1-server.md`; read its Context
> and Constraints sections first, they are not repeated in full here).
> - **Note on concurrent ACTIVE plans**: at the time this doc was created, 3 OTHER
>   unrelated `.ai-plans/*.md` docs were already `Status: ACTIVE` in this repo
>   (mud-builder Phase 13, two kingdom-tactics plans) — this is evidently how this repo
>   actually operates (parallel independent workstreams), not a single global lock. The
>   qplan skill's "exactly one ACTIVE doc" guidance is about avoiding qwen's `plan_step
>   {}` auto-attach picking the wrong (stale) doc if this one is handed to `/plan
>   resume` — if that ever happens, re-check which doc is most-recently-modified before
>   trusting qwen's "no active plan"/"plan complete" response.
> - Almost everything here is **(CLAUDE)** — a new React app, a cross-service crypto
>   integration, and deploy wiring are not qwen-appropriate. Step 1 (client scaffold) is
>   tagged **(QWEN-SAFE)** as pure boilerplate mirroring an existing package, same
>   caveat as Phase 1's step 1: box stays unchecked until a HOST build confirms it.
> - **Verification is a HOST (Claude/human) task** throughout: `pnpm --filter
>   @shatteredarchive/auth-client build`, `pnpm --filter @shatteredarchive/auth-server
>   test` (regression-checks Phase 1 is untouched), and `pnpm --filter
>   @shatteredarchive/mud-builder-server test`.

## Goal
`apps/auth-client` exists as a working React 19 + Vite UI (dev port 62080, matching the
`<digit>0080` convention) covering the full Phase 1 API surface: anti-bot signup
challenge, login, the forced-first-login password change, account management
(change-password, add/verify email, rotate-master), and API key management
(create/list/rotate/revoke, show-once token display) — structurally mirroring
`apps/mud-builder-client/src/features/auth/AccessPage.tsx`'s token-status state machine
and show-once-token pattern (already the noted Phase 1 Context reference). It is
deployed at `https://auth.shatteredarchive.dev` alongside `auth-server` in both compose
files. Separately, `mud-builder-server` gains a real, working call to `POST
/api/introspect` — proving the Ed25519 assertion mechanism end-to-end against a REAL
external consumer, not just Phase 1's synthetic in-test keypair. Done when `pnpm --filter
@shatteredarchive/auth-client build` passes, `pnpm --filter @shatteredarchive/auth-server
test` still passes unmodified (no Phase 1 regression), and a live introspect call from
`mud-builder-server` against a running `auth-server` returns `{valid:true,...}` for a real
API key.

## Constraints
- **Do not modify `apps/auth-server`'s behavior or its Phase 1 tests.** Phase 1 is
  `Status: COMPLETE` and independently verified (94/94 tests, live Docker verification).
  If this phase needs a NEW auth-server capability that genuinely doesn't exist yet, stop
  and flag it — do not silently extend Phase 1 code without documenting why here.
- **Sessions are httpOnly cookies, not client-managed tokens.** `auth-client` never reads
  or stores the `sa_session` cookie itself — every API call uses `fetch(..., {credentials:
  'include'})` and lets the browser handle it. API key tokens (from `POST /api/keys`) ARE
  shown to the user (show-once, per Phase 1's design) but are for the user to copy
  elsewhere — `auth-client` does not use them for its own auth.
- **No client-side telemetry/tracking** (repo-wide rule, `.github/copilot-instructions.md`).
  If a future `isHumanScore` behavioral signal is added to the signup form (mentioned as
  an explicit future possibility in Phase 1's Constraints), it must stay 100%
  client-side, never transmitted — but it is NOT required by this phase's Goal and should
  only be built if the user asks; do not add it speculatively.
- **React 19 + Vite + `@vitejs/plugin-react-swc`**, matching `apps/mud-builder-client`
  exactly (confirmed in Phase 1's Context) — do not introduce a different client stack
  (no Next.js, no Redux, no React Router unless the page count genuinely needs it — check
  `apps/mud-builder-client`'s own navigation pattern first and mirror it if it fits).
- **Dev port 62080, matching the already-reserved `docs/ports.md` entry** (added during
  Phase 1's documentation pass, currently marked "Phase 2 — not yet built"). `PUBLIC_ORIGIN`
  on the `auth-server` side already points at `http://localhost:62080` (dev) /
  `https://auth.shatteredarchive.dev` (deployed) — this phase makes that origin real.
- **The introspect-signing helper is NEW shared server-side code — decide where it lives,
  do not duplicate `auth-server`'s `crypto-primitives.ts` by copy-paste.** Recommendation
  (Claude's call, flag if you want this different): add it to `services/services-server`
  (`src/auth-introspect-client.ts`) — every current and future Node consumer
  (`mud-builder-server`, `web-server`, `game-server`, `kingdom-tactics-server`) already
  depends on this package, so this is the lowest-friction shared home. Do NOT create a new
  top-level `sdks/*` package for one helper — `sdks/sdks-client`/`sdks-server` are existing
  umbrella packages, not a per-integration pattern, and inventing a third top-level
  category for this is unjustified scope.
- **`shattered-service.key` (the consuming service's own private key) must never be
  committed** — already covered by the exact-filename `.gitignore` pattern Phase 1 added;
  verify `mud-builder-server`'s own `.gitignore`/data dir doesn't need a redundant entry
  (it shouldn't — the root pattern is filename-based, not path-based).
- **No breaking changes to `mud-builder-server`'s existing auth model.** Its own
  `builder-auth.json` bearer-token guard (Phase 9 of the MUD Builder plan) is unrelated
  and must keep working exactly as-is — the introspect call is an ADDITIVE capability
  (e.g., a new optional route or a documented manual verification path), not a replacement
  for the existing guard. Pick the smallest real integration that proves the mechanism
  works — do not redesign mud-builder-server's auth around this.

## Context — inherited from Phase 1 (verified, not re-verified here unless noted)
- **`apps/auth-server` is fully built and deployed** at port 62000 /
  `https://auth.shatteredarchive.dev`, `expose`-only behind nginx's resolver+variable
  pattern in `deploy/nginx/edge-subdomains.conf` (currently routes ALL of `location /` to
  `auth-server` — this phase adds the split). API reference: `docs/auth-server.md`. Run
  instructions: `apps/auth-server/README.md`.
- **`POST /api/introspect` contract** (from `apps/auth-server/src/routes/introspect.ts`):
  header `X-Service-Assertion: <compact>` where compact is
  `base64url(JSON{service,iat,exp,nonce}) + '.' + base64url(ed25519 signature)`, body
  `{token}`. Returns `{valid:false}` for an unknown/expired token (200, not an error) or
  `{valid:true,accountId,service,label}`; a bad/missing/expired ASSERTION is 401. Assertion
  window: `exp - iat <= 60s`, `iat` not future-dated beyond a 5s skew tolerance, `nonce`
  must be unique (in-memory replay guard on the auth-server side, ~65s memory).
- **Host scripts already built** (Phase 1, `apps/auth-server/scripts/`):
  `register-service.ts <name>` prints a fresh Ed25519 private key PEM once (save as
  `shattered-service.key` on the CONSUMING service's host — auth-server never stores it);
  `revoke-service-key.ts <name> <keyId>` for no-downtime rotation.
  `pnpm --filter @shatteredarchive/auth-server register-service -- mud-builder-server`
  is how this phase provisions the real keypair.
- **Client reference to mirror**: `apps/mud-builder-client/src/features/auth/AccessPage.tsx`
  — `TokenStatus` state machine (`loading|open|none|invalid|key|master`), show-once token
  display pattern, `api/client.ts`-style typed fetch wrapper. `apps/mud-builder-client`'s
  `package.json`/`vite.config.ts`/folder layout is the scaffold template for step 1.
- **Deploy reference to mirror**: `deploy/mud-builder-client.Dockerfile` (nginx +
  `try_files $uri $uri/ /index.html` SPA conf) and the `build.shatteredarchive.dev` nginx
  block's `location /api/` + `location /` split — `auth.shatteredarchive.dev` currently
  has only `location /` (added in Phase 1, routes everything to `auth-server`); this phase
  splits it the same way `build.shatteredarchive.dev` is split.
- **Root `package.json` already has placeholders from Phase 1's documentation pass**:
  `dev:auth-client`/`start:auth-client` point at `@shatteredarchive/auth-client`, which
  doesn't exist yet (verified: `pnpm --filter @shatteredarchive/auth-client dev` exits 0
  with "No projects matched" — harmless, not an error). `start:oauth` already combines
  `start:auth-client` + `start:auth-server`. Once step 1 lands, these scripts start
  working with NO further root `package.json` changes needed.
- **Port registry** (`docs/ports.md`): `apps/auth-client: 62080` already reserved.

## Steps

### [x] 1. (QWEN-SAFE — box stays unchecked until HOST build verify) auth-client workspace scaffold
- Do: Create `apps/auth-client`, mirroring `apps/mud-builder-client` (package.json deps —
  React 19, Vite, `@vitejs/plugin-react-swc`; scripts — `dev`,`build`,`preview`,`format`;
  `tsconfig.json`; `vite.config.ts` with dev port 62080 and an `API_BASE` env-driven
  constant defaulting to `http://localhost:62000`) minus anything area/MUD-specific.
  Minimal `src/main.tsx`/`src/App.tsx` shell with a placeholder route/page so `pnpm dev`
  serves something at `http://localhost:62080`. `.env`/`.env.example` pattern matching
  `apps/auth-server`'s (tracked `.env` with dev defaults, per Phase 1's finding that
  `.env.example` would itself be gitignored here).
- Files: `apps/auth-client/package.json`, `vite.config.ts`, `tsconfig.json`, `.env`,
  `index.html`, `src/main.tsx`, `src/App.tsx`.
- Verify (HOST): `pnpm install --frozen-lockfile` resolves; `pnpm --filter
  @shatteredarchive/auth-client build` succeeds; `pnpm --filter @shatteredarchive/auth-client
  dev` serves on 62080. Box + Progress log only after this HOST check passes.

### [x] 2. (CLAUDE) API client module + session/account state
- Do: `src/api/client.ts` — typed `fetch` wrapper over every Phase 1 endpoint
  (`docs/auth-server.md` is the source of truth for shapes), ALWAYS `credentials:
  'include'`, throwing a typed `ApiError{status,message}` on a non-2xx response (mirror
  `mud-builder-client/src/api/client.ts`'s `ApiError` pattern if it has one — check first).
  A small session-state hook/context (`useAuthSession` or similar) that calls `GET
  /api/auth/me` on mount to determine: logged out / logged in+mustChangePassword / logged
  in+ready, and exposes login/logout/refresh.
- Files: `apps/auth-client/src/api/client.ts`, a session context/hook file.
- Verify (HOST): covered by step 5's tests (or a lighter host-only check per what step 5
  actually adds — box once step 5's client-side tests, if any, exercise this or once a
  live `pnpm dev` walk-through in the browser confirms `me` round-trips against a running
  `auth-server`). Box + Progress log.

### [x] 3. (CLAUDE) Signup + login pages
- Do: A signup flow (`GET /api/auth/challenge` → 3-question form → submit → show the
  one-time password ONCE with a "write this down" notice, matching Phase 1's own route
  response wording) and a login form. Route between them and the logged-in shell based on
  step 2's session state.
- Files: `apps/auth-client/src/features/auth/SignupPage.tsx`,
  `apps/auth-client/src/features/auth/LoginPage.tsx` (naming illustrative — follow
  whatever `apps/mud-builder-client/src/features/` convention actually looks like).
- Verify (HOST): manual — `pnpm dev` against a locally running `auth-server` (per its own
  README), walk signup → login in a real browser. Box + Progress log; note in the log if a
  headless/automated check was added instead of (or in addition to) the manual walk.

### [x] 4. (CLAUDE) Forced password change + account page + keys page
- Do: A forced-change screen shown whenever session state reports
  `mustChangePassword: true` (blocking navigation to everything except itself and
  logout, mirroring the server's own allowlist — the CLIENT-side gate is UX only, the
  SERVER still enforces it regardless). An account page: change-password (voluntary),
  add/verify email, rotate-master (with a clear "this invalidates every key" confirm,
  mirroring `AccessPage.tsx`'s `rotateMaster` `window.confirm` pattern). A keys page:
  list/create/rotate/revoke with the show-once token box, structurally mirroring
  `AccessPage.tsx`'s API-key panel almost directly (same shapes: `ApiKeyInfo`, show-once
  token, rotate/revoke buttons).
- Files: `apps/auth-client/src/features/account/*`, `apps/auth-client/src/features/keys/*`.
- Verify (HOST): manual browser walk-through covering: forced change blocks navigation
  until completed; change-password/rotate-master both keep the user logged in (new
  session, not a logout — verify by checking `GET /api/auth/me` still 200s right after);
  key create/rotate/revoke round-trip. Box + Progress log with what was walked through.

### [x] 5. (CLAUDE) Deploy wiring — Dockerfile, both compose files, nginx split
- Do:
  1. `deploy/auth-client.Dockerfile` — mirror `deploy/mud-builder-client.Dockerfile`
     exactly (nginx runtime stage + Vite build stage, same pinned digests as every other
     Dockerfile in this repo).
  2. Add an `auth-client` service to BOTH compose files, mirroring `mud-builder-client`'s
     entry (no `expose`/`ports` needed — nginx reaches it by container name on port 80
     like every other client image; network alias `auth-client.shatteredarchive.dev`).
  3. `deploy/nginx/edge-subdomains.conf`'s `auth.shatteredarchive.dev` block: split
     `location /` (currently 100% to `auth-server`) into `location /api/` + `location =
     /health` → `auth-server:62000` (same resolver+variable pattern already there) and
     `location /` → `auth-client:80`, mirroring `build.shatteredarchive.dev`'s split
     exactly. Add `auth-client.shatteredarchive.dev` is NOT needed on nginx's own alias
     list (per Phase 1's corrected understanding of what that list is for) — only the
     externally-facing `auth.shatteredarchive.dev` alias, already added in Phase 1.
- Files: `deploy/auth-client.Dockerfile` (new), `deploy/docker-compose.yml`,
  `deploy/docker-compose.shattered-archive-experimental.yml`,
  `deploy/nginx/edge-subdomains.conf`.
- Verify (HOST): `docker compose -f deploy/docker-compose.shattered-archive-experimental.yml
  config` parses cleanly; `docker build -f deploy/auth-client.Dockerfile`; a live `docker
  compose up -d --build auth-server auth-client` (nginx too, if convenient) with a real
  browser hit against `http://auth-client` container or, better, through the edge if nginx
  is also brought up — confirm the SPA loads and can reach `/api/auth/challenge` through
  the split. Tear down afterward, matching Phase 1's cleanup discipline. Box + Progress log.

### [x] 6. (CLAUDE) Real consumer: mud-builder-server calls /api/introspect
- Do:
  1. `services/services-server/src/auth-introspect-client.ts` (see Constraints for why
     this package): `signAssertion(service, privateKeyPem)` (Ed25519, same compact format
     as `auth-server`'s `crypto-primitives.ts` — duplicated deliberately, NOT imported
     across the app boundary) and `introspect(authServerBaseUrl, service, privateKeyPem,
     token): Promise<{valid:boolean; accountId?:string; label?:string}>` (does the HTTP
     call + header). Reads the private key from `SERVICE_PRIVATE_KEY_PATH` (the env var
     Phase 1's `apps/auth-server/.env` already documents as "the convention Phase 2
     consumers will read").
  2. Provision the real keypair: `pnpm --filter @shatteredarchive/auth-server
     register-service -- mud-builder-server`, save the printed private key to
     `shattered-service.key` in `mud-builder-server`'s local dev setup (git-ignored,
     per Phase 1's `.gitignore` pattern) — document the exact host path in this doc's
     Progress log once decided (candidate: `apps/mud-builder-server/shattered-service.key`
     or a data-dir location, matching where other per-install secrets already live there).
  3. Wire ONE small, additive integration point in `mud-builder-server` — the smallest
     thing that proves the mechanism works without redesigning its existing
     `builder-auth.json` guard (see Constraints). Candidate (confirm or replace with a
     better one if the actual code suggests otherwise — read `apps/mud-builder-server/src/
     routes/auth.ts` and `app.ts` again before deciding): a NEW, clearly-optional route
     like `GET /api/auth/introspect-check?token=...` (master-only, like the rest of
     `/api/auth`) that calls the new helper and returns its result — a manual/documented
     way to prove the mechanism, not a replacement for the existing bearer-token guard.
  4. `AUTH_SERVER_URL`/`SERVICE_PRIVATE_KEY_PATH` additions to
     `apps/mud-builder-server/.env`(`.env.example` if that convention exists there —
     check, Phase 1 found this repo doesn't actually use `.env.example`) and, if wired
     into deploy, the relevant compose service's `environment:` block (dev/experimental
     only — do NOT wire this into prod compose unless the user asks; this is a proof-of-
     mechanism, not a production dependency yet).
- Files: `services/services-server/src/auth-introspect-client.ts` (+ its test),
  `apps/mud-builder-server/src/routes/auth.ts` (or wherever step 6.3 lands),
  `apps/mud-builder-server/.env`.
- Verify (HOST): with a REAL running `auth-server` (per its README) and a REAL registered
  `mud-builder-server` service key: mint a real API key via `auth-client`'s keys page (or
  curl), call the new mud-builder-server integration point with that token, confirm
  `{valid:true,...}`; confirm an unknown/garbage token returns `{valid:false}`; confirm a
  WRONG/unregistered private key at `SERVICE_PRIVATE_KEY_PATH` fails cleanly (401 surfaced
  as a clear error, not a crash). This is the Goal's actual "prove the mechanism end-to-end
  against a real consumer" claim — do not box this step on unit tests alone. Box + Progress
  log with the exact commands run.

### [x] 7. (CLAUDE) Tests, host build/test pass, docs, close out Phase 2
- Do:
  1. `apps/auth-client` — at minimum, component/logic tests for the session-state hook and
     the show-once-token display behavior (mirror whatever test depth
     `mud-builder-client` actually has for `AccessPage.tsx` — check before assuming a
     level of coverage). `services/services-server/src/auth-introspect-client.test.ts` —
     sign/verify shape, a mocked-fetch introspect call (success/failure/network-error
     paths), matching `crypto-primitives.test.ts`'s coverage style from Phase 1.
  2. HOST: `pnpm --filter @shatteredarchive/auth-client build` and `test`; `pnpm --filter
     @shatteredarchive/services-server test`; **re-run `pnpm --filter
     @shatteredarchive/auth-server test` and confirm it is STILL 94/94 with no
     modifications to that package** (the Constraints' no-Phase-1-regression rule, proven,
     not assumed).
  3. Update `apps/auth-client/.ai-context`+`.annotated`, `services/services-server/
     .annotated` (add the new file), root `README.md`'s Documentation list (a new
     `docs/auth-client.md` if the endpoint/page surface is big enough to warrant one —
     Claude's call at the time, follow `docs/auth-server.md`'s format if so), and
     `apps/auth-server/README.md`'s "Phase 2" framing (it currently says Phase 2 "adds
     the browser UI... and one example consumer" in future tense — update once true).
  4. Append a final Progress-log line and set `Status: COMPLETE`.
- Files: new test files, `.ai-context`/`.annotated` files, doc updates, this plan doc.
- Verify (HOST): all three `test` commands above exit 0. Box + final Progress-log entry +
  `Status: COMPLETE`.

## Progress log
- 2026-07-19T23:00 plan created (Claude), Status ACTIVE, unstarted. Phase 2 of 2 — Phase 1
  (`apps/auth-server`) is independently complete and twice-reviewed (see its own doc).
  Scope decided from Phase 1's own Progress log commitment: `apps/auth-client` UI, its
  deploy wiring, and ONE real `/api/introspect` consumer (`mud-builder-server`, per Phase
  1's recommendation). Judgment calls made while writing this doc, flagged rather than
  silently assumed:
  - The introspect-signing helper goes in `services/services-server` (existing shared
    package every consumer already depends on) rather than a new top-level package —
    reasoned out in Constraints.
  - The `mud-builder-server` integration point is a NEW, additive, master-only route
    proving the mechanism works, not a replacement for its existing
    `builder-auth.json` bearer-token guard — deliberately the smallest real integration,
    not a redesign. The exact route shape is left as a "confirm or replace" decision for
    whoever executes step 6, since it depends on re-reading that app's current
    `routes/auth.ts`/`app.ts` at execution time rather than this plan guessing stale.
  - Step 6's `shattered-service.key` host path for `mud-builder-server` is deliberately
    left undecided here (to be recorded in the Progress log when step 6 actually runs)
    rather than guessed now.
- 2026-07-19T23:1x step 1 DONE and boxed (Claude). Scaffolded `apps/auth-client` mirroring
  `apps/mud-builder-client` (React 19 + Vite 8 + `@vitejs/plugin-react-swc`; no
  `@shatteredarchive/merc-area`-style workspace dep needed, so `dependencies` is just
  react/react-dom). `vite.config.ts` proxies `/api` and `/health` to `VITE_AUTH_API`
  (default `http://localhost:62000`) at dev port 62080 (`docs/ports.md`) — proxied
  same-origin deliberately, so a future `credentials:'include'` fetch sees `auth-server`'s
  Set-Cookie as same-origin in dev, matching how the deployed nginx split will behave.
  Files: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.jest.json`,
  `jest.config.cjs` + `jest.style-stub.cjs` (local config, same reason mud-builder-client
  needs one — root aggregator can't reach a co-located test when `--rootDir .` IS the
  `-client` dir), `.env` (tracked, dev defaults — matches the `auth-server`/no-`.env.example`
  convention Phase 1 established), `index.html`, `src/main.tsx`, `src/App.tsx` (placeholder
  shell), `src/App.css`, `src/index.css`; root `jest.config.cjs`
  (`LOCAL_CONFIG_PACKAGES`/`LOCAL_CONFIG_IGNORES` +auth-client).
  Verified on HOST: `pnpm install` resolved cleanly (7 new packages); `pnpm --filter
  @shatteredarchive/auth-client build` succeeded (vite build, ~435ms); a real `vite`
  dev server on 62080 served the expected HTML (`curl` confirmed); `pnpm --filter
  @shatteredarchive/auth-client test` — 0 tests, exits 0 (`--passWithNoTests`, expected
  until step 7); `eslint apps/auth-client --max-warnings=0` — clean. Root `package.json`'s
  Phase-1-era `dev:auth-client`/`start:oauth` placeholders (previously a harmless "No
  projects matched" no-op) now resolve to this real package — confirmed live (hit a port
  conflict from my own leftover manual test process, not a wiring problem; cleared and
  re-confirmed the port frees correctly).
- 2026-07-19T23:4x steps 2-4 DONE and boxed together (Claude) — built as one continuous pass
  since the pages share one state machine. `src/api/client.ts`: typed `request<T>`/`ApiError`
  wrapper (mirrors `mud-builder-client/src/api/client.ts`), always `credentials:'include'`,
  covers every Phase 1 endpoint per `docs/auth-server.md` (challenge/signup/login/logout/me/
  forgot/reset, account change-password/email/email-verify/rotate-master, keys list/create/
  rotate/revoke) — response shapes cross-checked directly against `routes/account.ts` and
  `key-store.ts` rather than trusting the docs alone (caught that `rotateKey`'s response omits
  `service`/`label`, unlike `mintApiKey`'s — `IssuedKey`'s fields are optional to match).
  `src/auth/useAuthSession.ts`: `loading|loggedOut|mustChangePassword|ready` state machine,
  `GET /api/auth/me` on mount, treats a 401 as "logged out" (not an error). Pages: `SignupPage`
  (challenge -> 3-question form -> show-once password), `LoginPage`, `ForgotPasswordPage`
  (not separately itemized in the plan's step 3/4 file lists — added as the obvious consumer
  of the already-built `forgot-password`/`reset-password` endpoints; handles both the "request
  a link" and, when landing on `/reset-password?token=...`, the "set new password" sub-flow),
  `ForcedChangePage` (blocks everything but itself/logout, mirroring the server's own
  allowlist), `AccountPage` (change-password, add/verify email — auto-verifies on mount when
  landing on `/verify-email?token=...`, rotate-master with a `window.confirm`), `KeysPage`
  (list/create/rotate/revoke + show-once token, structurally mirrors `AccessPage.tsx`'s key
  panel). `App.tsx` rewired to switch on `useAuthSession()`'s status instead of the step-1
  placeholder shell; no router added (mirrors `mud-builder-client`'s own state-based nav,
  confirmed it has no `react-router` dependency before deciding this). `App.css` gained
  `auc-field`/`auc-fieldset`/`auc-toast`/`auc-list`/`auc-nav` rules mirroring `mb-*`'s
  visual language under the `auc-` namespace (per the MUD Builder UI memory: never literally
  reuse mud-builder's CSS files/classes, but the layout idiom is fine to mirror).
  Verified on HOST: `pnpm --filter @shatteredarchive/auth-client build` — succeeds. `eslint
  apps/auth-client` — 0 errors, 3 warnings, all `react-hooks/set-state-in-effect` on the
  mount-fetch `useEffect(() => { void x(); }, [x])` pattern explicitly copied from
  `AccessPage.tsx` — re-linted that reference file under the same `--max-warnings=0` and
  confirmed it produces the IDENTICAL warning, so this is a pre-existing repo-wide pattern,
  not a regression. `pnpm --filter @shatteredarchive/auth-client test` — 0 tests, exits 0
  (expected until step 7). Full END-TO-END manual verification (no real browser available in
  this environment, so this is a scripted `curl` walkthrough through the ACTUAL `vite` dev
  proxy on 62080 against a REAL `auth-server` on 62000 — the most rigorous check possible
  here, but flagged as not a literal browser click-through per CLAUDE.md's guidance to say so
  explicitly): seeded `apps/auth-server/data/dsl-questions.json` from the tracked
  `.example.json` (didn't exist yet — first real run against this checkout) and a temporary
  local `DATA_ENCRYPTION_KEY` in `.env` (reverted after, confirmed via `git status` that
  `.env` is untracked — a Phase-1 documentation gap: the plan says "tracked .env with dev
  defaults" but `git ls-files`/`git log` show it was never actually `git add`ed; flagging
  here for step 7's doc pass, not fixing silently). Exercised in order, cookie-jar-per-caller,
  through `http://localhost:62080/api/...`: challenge -> signup -> login (mustChangePassword
  true) -> `me` -> `GET /api/keys` correctly 403s `MUST_CHANGE_PASSWORD` -> change-password ->
  `me` immediately after shows the caller is STILL logged in with `mustChangePassword:false`
  (proves the fresh-session-on-epoch-bump mechanic survives the proxy) -> keys now 200s ->
  create/list/rotate/revoke key (response shapes matched `IssuedKey`/`ApiKeyInfo` exactly) ->
  request email verification -> rotate-master -> `me` immediately after still shows the SAME
  logged-in account on the new session -> logout -> `me` now 401s. Separately: re-logged-in,
  pulled the real mailed link from the auth-server log
  (`http://localhost:62080/verify-email?token=...`, confirming the `PUBLIC_ORIGIN` wiring is
  correct end to end), POSTed that token to `/api/account/email/verify` exactly as
  `AccountPage`'s mount effect would, confirmed `emailVerified` flips true; did the same for
  the mailed `/reset-password?token=...` link, reset the password, and confirmed login with
  the new password succeeds. Cleaned up after: killed both dev servers, reverted `.env`,
  deleted the smoke-test `data/` dir and cookie jars, confirmed ports 62000/62080 free with no
  orphaned processes.
- 2026-07-19T23:5x step 5 DONE and boxed (Claude). `deploy/auth-client.Dockerfile` mirrors
  `mud-builder-client.Dockerfile`'s two-stage shape (Vite build stage -> nginx runtime,
  identical pinned digests to every other Dockerfile in the repo) but with a MINIMAL COPY set
  (`apps/auth-client` only, no `types`/`utils`/`services`/`sdks`) — confirmed against
  `auth-server.Dockerfile`'s own precedent that `pnpm install --frozen-lockfile` only needs
  the workspace member directories actually being installed/built, not the whole monorepo,
  since `auth-client`'s only deps are `react`/`react-dom` (no workspace packages). New
  `deploy/nginx/auth-client.conf` (byte-identical SPA `try_files` conf to
  `mud-builder-client.conf`). `deploy/nginx/edge-subdomains.conf`'s `auth.shatteredarchive.dev`
  block split exactly like `build.shatteredarchive.dev`: `location /api/` + `location =
  /health` -> `auth-server:62000` (unchanged), `location /` -> NEW `auth-client:80`.
  Both compose files gained an `auth-client` service.
  DEVIATION FROM THE PLAN'S LITERAL WORDING, flagged: step 5's Do-block said "mirroring
  mud-builder-client's entry" for BOTH compose files, but `mud-builder-client` (and all of
  mud-builder) turns out to not exist in `deploy/docker-compose.yml` (prod) at all — grepped
  and confirmed, it's dev/experimental-only tooling. `auth-server` itself, by contrast, IS
  already in prod compose (Phase 1 put it there — `auth.shatteredarchive.dev` is a real
  production surface, not an internal dev tool). Since `auth-client` is `auth-server`'s UI
  counterpart on that same real subdomain, I mirrored `auth-server`'s OWN prod-compose entry
  (`container_name: shatteredarchive-prod-auth-client`, `shatteredarchive-prod` network) for
  the prod file instead of literally copying a mud-builder-client shape that doesn't exist
  there — the more relevant, currently-true precedent over the plan's stale phrasing.
  Verified on HOST: `docker compose -f docker-compose.yml config --quiet` and
  `-f docker-compose.shattered-archive-experimental.yml config --quiet` — both exit 0.
  `docker build -f deploy/auth-client.Dockerfile .` — succeeds; ran the built image standalone
  on `-p 18081:80`, confirmed `/` serves the real `index.html` (200) AND a deep link
  (`/account`) also 200s via the `try_files ... /index.html` fallback — this specifically
  proves the emailed verify-email/reset-password links will load the SPA correctly when
  clicked directly against the deployed client rather than 404ing. Cleaned up that image
  after. Then a REAL `docker compose up -d --build auth-server auth-client` against the
  experimental file: both containers started, `auth-server` reported Docker-healthcheck
  `healthy`; confirmed BIDIRECTIONAL container-DNS-name reachability on the shared network —
  `docker exec` into `auth-server` and `http.get('http://auth-client:80/')` -> 200; `docker
  exec` into `auth-client` and `wget -qO- http://auth-server:62000/health` -> `{"status":"ok"}`
  — this is exactly the resolution nginx's `set $auth_client auth-client:80` /
  `set $auth_server auth-server:62000` depend on, so it stands in for bringing up the full
  nginx edge (which would have pulled in game-server/web-server/game-client/web-client too —
  the plan explicitly marks that part "if convenient"; skipped as disproportionate to what
  step 5 needed to prove). Tore down: stopped+removed both containers, removed the two
  auth-server volumes created by this test run (fresh/empty, safe to discard), confirmed via
  `docker ps -a` neither container remains.
- 2026-07-20T00:1x step 6 DONE and boxed (Claude), including a REAL BUG found and fixed
  during verification — not just wiring. `services/services-server/src/auth-introspect-client.ts`:
  `signAssertion(service, privateKeyPem)` + `introspect(authServerBaseUrl, service,
  privateKeyPem, token)`, exported from the package's `index.ts` barrel per the Constraints'
  chosen home. `apps/mud-builder-server/src/config.ts` gained `authServerUrl`
  (`AUTH_SERVER_URL`, defaults `http://localhost:62000`) and optional
  `servicePrivateKeyPath` (`SERVICE_PRIVATE_KEY_PATH`, unset = feature off).
  `routes/auth.ts` gained `GET /api/auth/introspect-check?token=...` inside the EXISTING
  `registerAuthRoutes` (so it inherits the master-only `requireMaster` guard for free, no new
  middleware) — reads the key file, calls `introspect()`, maps a missing-config to 501, a
  missing token param to 400, and an introspect failure (bad/unregistered/expired assertion,
  network error) to a clean 502 rather than letting it throw uncaught. `app.ts` now passes
  `config` through to `registerAuthRoutes` (3rd param). `.env` documents
  `AUTH_SERVER_URL`/`SERVICE_PRIVATE_KEY_PATH`, blank/commented (feature stays off by
  default, matching the Constraints' "additive, not required" framing).
  REAL BUG found and fixed during Verify, not caught by any existing test: my first
  `signAssertion` implementation encoded `iat`/`exp` as Unix SECONDS
  (`Math.floor(Date.now()/1000)`), but `service-key-store.ts`'s `verifyAssertion` compares
  them against `Date.now()` — MILLISECONDS — confirmed by re-reading that file's OWN test
  fixtures (`service-key-store.test.ts`'s `sign()` helper: `now = Date.now(); exp: now +
  30_000`). Seconds-unit `exp` (~1.79e9) is always less than milliseconds-unit `now`
  (~1.79e12), so `exp < now` was unconditionally true — every assertion, however validly
  signed, was rejected as "expired." Fixed by switching `signAssertion` to `Date.now()` (ms)
  throughout, `ASSERTION_TTL_MS = 30_000`. This was NOT visible from a code read or from
  `tsc`/eslint — it only surfaced by actually driving a real assertion through a real running
  auth-server, which is exactly why the plan's Verify step insists on this being a live
  end-to-end check rather than unit tests alone.
  A SECOND gotcha, environmental not a code bug: after fixing the source, the running
  `mud-builder-server` dev process kept failing identically — `tsx` resolves
  `@shatteredarchive/services-server` via node_modules to its `dist/` build (matching the
  package's own existing import in `index.ts`), and editing the TS source doesn't touch that
  already-built `dist/`, nor does a running (non-watch) `tsx` process reload it. Required an
  explicit `pnpm --filter @shatteredarchive/services-server build` AND a full process restart
  before the fix actually took effect — documented here since it will bite again on any
  future edit to this package during local dev.
  Separately (test-infra only, not this feature's runtime code): `pnpm --filter
  @shatteredarchive/mud-builder-server build` initially failed — 3 existing test fixtures
  (`audit-view.test.ts`, `auth.test.ts`, `presence.test.ts`) hand-construct a
  `MudBuilderConfig` object and don't know about the new required `authServerUrl` field;
  fixed by adding it to each fixture. Then `pnpm ... test` failed to even LOAD 4 suites —
  mapping `@shatteredarchive/services-server` to its full `index.ts` barrel (to let tests run
  against TS source, this app's established pattern for its other workspace deps) transitively
  pulls in `mud-client-service.ts`, which imports `uuid` (ESM-only), and ts-jest's default
  node_modules-ignore chokes on it. A `transformIgnorePatterns`/extra `.js` transform
  entry did NOT fix this (tried and reverted). The actual fix: scope
  `mud-builder-server/jest.config.cjs`'s `moduleNameMapper` for `@shatteredarchive/
  services-server` to POINT DIRECTLY AT `auth-introspect-client.ts`, not the barrel —
  nothing else in this app's test graph needs another services-server export, and this
  sidesteps the uuid/ESM issue entirely rather than fighting Jest's transform pipeline.
  Verified on HOST: `pnpm --filter @shatteredarchive/services-server build` and `pnpm
  --filter @shatteredarchive/mud-builder-server build` — both clean. `pnpm --filter
  @shatteredarchive/mud-builder-server test` — 73/73 passing (up from 46/73 passing +
  4 suites failing to load, pre-fix). `eslint` on all new/changed files — 0
  warnings at `--max-warnings=0`. Then a REAL end-to-end run: registered a genuine service
  keypair (`pnpm --filter @shatteredarchive/auth-server exec tsx scripts/register-service.ts
  mud-builder-server` — NOTE: the documented `register-service -- mud-builder-server` form
  misfired in this shell, passing literal `"--"` as the service name; flagging for step 7's
  README check), started real `auth-server` + `mud-builder-server` dev processes, signed up
  a real account through the full challenge/signup/login/forced-change flow, minted a real
  API key, then hit the NEW `GET /api/auth/introspect-check` with the real master key from
  the existing `merc-mud` checkout's `builder-auth.json`: a valid token returned
  `{valid:true,accountId,service,label}`; an unknown/garbage token returned `{valid:false}`;
  swapping `SERVICE_PRIVATE_KEY_PATH` to a freshly-generated, NEVER-registered keypair
  produced a clean `502` (not a crash — `/health` still 200'd right after) with a readable
  error; a missing `token` query param returned a clean `400`. All four cases match the
  plan's Verify list exactly. Cleanup: killed both dev processes (had to `taskkill` — a
  second, unrelated finding: `TaskStop` on this host reliably leaves the actual spawned
  `tsx`/`node` child process running as an orphan holding its port, only killing pnpm's
  wrapper shell; every dev-server stop this session needed a `netstat`-then-`taskkill`
  follow-up to actually free the port — noting this so a future session doesn't trust
  `TaskStop` alone for these), reverted both `.env` files to their committed/blank state,
  deleted the smoke-test `apps/auth-server/data/` dir, cookie jar, and both scratch private
  key files.
- 2026-07-20T00:3x step 7 DONE and boxed, Phase 2 COMPLETE (Claude). Tests added:
  `apps/auth-client/src/auth/useAuthSession.test.ts` (6 cases: loading->loggedOut/
  mustChangePassword/ready off a mocked `/api/auth/me`, `login()`/`logout()` update
  account+status with `credentials:'include'` confirmed, a non-401 failure lands on
  `loggedOut` with a visible error rather than hanging on `loading` — see the real bug
  fixed below), `apps/auth-client/src/features/keys/KeysPage.test.tsx` (4 cases: list,
  create-shows-token-once, rotate/revoke behind a confirm, dismissed-confirm is a no-op —
  depth mirrors `AccessPage.test.tsx`), `services/services-server/src/
  auth-introspect-client.test.ts` (8 cases: signAssertion shape + cross-keypair rejection +
  ms-unit window/fresh-nonce, `introspect()` success/trailing-slash-strip/valid-false/
  non-2xx-throw/network-error-propagation via mocked `fetch`).
  A SECOND real bug found while writing tests, not just wiring: `useAuthSession`'s `refresh()`
  left `status` stuck at `'loading'` forever on any NON-401 failure (a genuine 500 or network
  error), while `App.tsx`'s error toast only renders in the `loggedOut` branch — so a real
  server error would show "Loading…" forever with the error message never reaching the user.
  Fixed: any failure (401 or otherwise) now resolves to `loggedOut`, distinguished only by
  whether `error` is set. Pinned by the new test's "surfaces a non-401 failure as a visible
  error instead of leaving status stuck on loading" case.
  A repo-wide, PRE-EXISTING (not introduced this phase) tooling gap found and worked around
  while running these tests: `pnpm --filter <pkg> test`'s `--rootDir .` flag breaks for every
  package using the shared ROOT `jest.config.cjs` (its `projects:` array's `<rootDir>/apps/...`
  entries resolve against the OVERRIDDEN rootDir, not the repo root) — confirmed this isn't
  Phase-2-specific by reproducing the identical failure on `@shatteredarchive/web-server`, an
  unrelated package untouched this session. `services-server` had zero tests before this
  phase, so nothing had ever exercised its own `pnpm test` script to surface this. Not fixed
  (out of scope — a pre-existing repo-wide script bug, not this feature's code); verified
  services-server's new test via the root config directly instead:
  `npx jest --config jest.config.cjs --selectProjects server ... auth-introspect-client.test.ts`.
  Docs/AI-context refreshed: NEW `apps/auth-client/.ai-context` + `.annotated` (top-level and
  `src/`, created from scratch — this app had none until now) documenting the state-machine
  design and the API-shape cross-checks made against `auth-server`'s actual route code, not
  just `docs/auth-server.md`. `services/services-server/src/.annotated` (correcting an
  initial misplaced edit to the WRONG file — the package's top-level `.annotated` only
  indexes top-level files like `package.json`; the per-file entries belong in `src/.annotated`,
  caught by checking existing convention before it was too late) + `.ai-context` gained the
  new module. `apps/mud-builder-server`'s `.annotated`/`src/.annotated`/`src/routes/.annotated`
  one-liners updated for `config.ts`/`app.ts`/`routes/auth.ts`/`jest.config.cjs`.
  `apps/auth-server/.ai-context` and `README.md`'s Phase-2-is-future framing corrected to
  past tense now that it's real. NEW `docs/auth-client.md` (endpoints/pages table, following
  `docs/auth-server.md`'s format) + root `README.md`'s Repository Structure and Documentation
  list updated to reference it. `docs/ports.md`'s `auth-client: 62080 (Phase 2 — not yet
  built)` note removed (it now is). A THIRD finding surfaced and documented in `apps/
  auth-server/README.md` rather than fixed in code (it's a pnpm/corepack behavior, not this
  repo's bug): `pnpm --filter <pkg> <script> -- <args>` on this environment's pinned
  `pnpm@11.x` forwards the literal `--` token through as an argument instead of stripping it
  (reproduced deliberately with `register-service -- --help`, confirmed the script received
  `["--", "--help"]`) — silently breaks the documented `temp-password`/`register-service`/
  `revoke-service-key -- <args>` invocation form (this is exactly how step 6's first
  `register-service` call misfired, registering a service literally named `"--"`). Documented
  the working `pnpm --filter <pkg> exec tsx scripts/<script>.ts <args>` fallback in the README
  rather than silently discovering it and moving on.
  Final HOST verify, everything green: `pnpm --filter @shatteredarchive/auth-client build`
  (succeeds) and `test` (10/10); `pnpm --filter @shatteredarchive/auth-server test` — **94/94,
  confirmed unmodified this phase** (`git diff --stat apps/auth-server/src
  apps/auth-server/scripts` — empty, the Constraints' no-Phase-1-regression rule proven, not
  assumed); `pnpm --filter @shatteredarchive/mud-builder-server build` and `test` — 73/73;
  services-server's new test — 8/8 (via the root config directly, per the tooling-gap
  workaround above). `eslint` on every new/changed file — 0 errors; the only warnings are the
  pre-existing `react-hooks/set-state-in-effect` pattern already present in the mirrored
  `AccessPage.tsx` reference (re-verified identical on that file too), not a regression.
  `git status --short` reviewed end to end: file set matches exactly what this log describes,
  no drift, nothing unexpected. Phase 2 Goal fully met: `apps/auth-client` covers the full
  Phase 1 API surface with a working UI, is deployed alongside `auth-server` behind the same
  nginx split pattern as `build.shatteredarchive.dev`, and `mud-builder-server` proved the
  Ed25519 `/api/introspect` mechanism end to end against a REAL registered service key (not
  Phase 1's synthetic in-test keypair) — including catching and fixing a real units-mismatch
  bug (seconds vs. milliseconds) that no unit test had caught, exactly the class of issue this
  step's live-verification requirement (over unit tests alone) was written to catch.
  `Status: COMPLETE`. No commit has been made — all Phase 1 + Phase 2 changes remain
  uncommitted working-tree changes (`apps/auth-server/` itself was never `git add`ed even in
  Phase 1, confirmed via `git ls-files`); that's a normal pending-first-commit state, not a
  documentation gap, since committing was never requested this session.
- 2026-07-20T01:0x FOLLOW-UP (Claude, post-completion): fixed both tooling gaps step 7 had
  flagged but deliberately left unfixed as out-of-scope.
  (1) The `--rootDir .` jest breakage — root-caused further than "pre-existing, unrelated":
  passing `--rootDir .` overrides `<rootDir>` for the WHOLE shared `jest.config.cjs`, which
  breaks its `projects: ['<rootDir>/apps/auth-client', ...]` string-entry resolution for every
  package using it, not just the one being tested. Confirmed 13 affected `package.json`s
  (`services/services-server`, `apps/{web,game}-server`, `apps/web-client`, `utils/{utils,
  types}-{client,server}`, `types-global`, `utils-global`, `sdks/{sdks-server,sdks-client}` —
  `services/services-client/src/package.json` excluded: NOT a recognized workspace member,
  the `services/*` glob doesn't reach one level deeper into `src/`, confirmed via `pnpm -r
  list`, so it's dead code, not a live 13th case). Tried `--roots .` first — it doesn't break
  config resolution, but a RELATIVE `.` resolves against the shared config's rootDir (repo
  root) rather than pnpm's cwd, so it silently scoped to the ENTIRE monorepo and caused a
  real `JavaScript heap out of memory` crash (reproduced twice) instead of a clean error.
  Landed on `--testPathPatterns <pkg-repo-relative-path>` (Jest 30's renamed
  `--testPathPattern`) instead — a plain regex against already-resolved absolute test paths,
  so it never touches rootDir resolution and needs no cwd-relative trickery. Verified all 12
  live packages via real `pnpm --filter <pkg> test`: `services-server` runs its new 2 suites/
  15 tests cleanly; the other 11 correctly report "0 matches" (confirmed via `find` that they
  all genuinely have zero `.test.ts` files — not a matching bug, a pre-existing test-coverage
  gap out of scope for this fix).
  (2) The pnpm `-- <args>` quirk — found the ACTUAL fix instead of just a workaround:
  `pnpm --filter <pkg> <script> -- <args>` forwards the literal `--` through on this repo's
  pinned `pnpm@11.8.0`, but `pnpm --filter <pkg> <script> <args>` (no `--` at all) forwards
  correctly — confirmed live for `temp-password`/`register-service`. Since none of
  `auth-server`'s host scripts take flag-shaped arguments, the separator was never actually
  needed. Replaced the earlier `pnpm exec` workaround (documented previously in
  `apps/auth-server/README.md`) with the simpler real fix everywhere the `-- <arg>` form was
  written: `apps/auth-server/README.md`, `docs/auth-server.md`'s host-scripts table, the
  `Usage:` comment in each of `register-service.ts`/`issue-temp-password.ts`/
  `revoke-service-key.ts`, and `apps/mud-builder-server/.env`'s comment.
  Confirmed no regressions: re-ran `auth-client`/`auth-server`/`mud-builder-server`/
  `services-server`'s test suites after all of this — unaffected (these four already used
  their own local `jest.config.cjs`, not the shared one this fix touched).
