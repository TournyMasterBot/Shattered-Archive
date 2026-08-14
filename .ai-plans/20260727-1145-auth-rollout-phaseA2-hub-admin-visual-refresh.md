# Plan: Auth rollout Phase A2 — hub user management, delegation surface, auth-client visual refresh

Created: 2026-07-27T11:45:00-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Admin API on auth-server (list users, strictly-below role management, guarded
temp-password with an audit trail), a delegation surface into constellation services,
an auth-client admin section, and a visual refresh drawing from the C# site's design
language — then deploy + live-verify like Phase A.

Sub-plan of `.ai-plans/20260726-1953-centralized-auth-rollout-all-services.md` step A2.
Every step is (CLAUDE): security-critical admin surface; qwen must not execute this plan
(qwen DID contribute the read-only site.css design-token extraction).

## Goal

An elevated account (moderator+) can, from auth-client's new Admin section: search/page
the user list, change global roles and issue recovery temp-passwords for accounts of
STRICTLY lesser privilege (the API enforces the matrix even if the UI is bypassed), and
see each registered service with a link-out to its own role admin. Every management
action lands in an append-only audit log. The whole client wears the refreshed
C#-derived look. Deployed live with evidence.

## Constraints

- **Strictly-below at the API, not just the UI**: a plain `user` tier gets 403 on every
  admin route (including list); an actor can only manage a target whose CURRENT role is
  strictly below their own, and can only ASSIGN roles strictly below their own (owner →
  admin/moderator/user; admin → moderator/user; moderator → user). Owner assignment
  stays host-script-only. UI hides unusable affordances but the API rejects regardless.
- **Never expose secrets**: list responses carry username/globalRole/createdAt/
  mustChangePassword/email-state/key+session counts — never password hashes, never
  token material. Temp-password responses show the one-time password exactly once.
- **Audit trail**: role changes and temp-passwords append `{at, actorId, actorUsername,
  action, targetId, targetUsername, detail}` to a plain JSONL `audit.log` under
  `DATA_DIR` (host-mount constraint; mirrors mud-builder's audit.log precedent —
  greppable, never parsed back by the app).
- **Additive `/api/auth/me`**: gains `globalRole` so the client can show/hide the Admin
  tab; existing consumers unaffected.
- **Visual refresh = shared tokens, not a stylesheet import**: extract palette/type/
  spacing from `Server.Web.Public/wwwroot/css/site.css` into CSS custom properties in
  auth-client; keep the auc-* class namespace; "comfortable" is the user's side-by-side
  call at review. This look becomes the constellation's reference identity style.
- Same idioms as Phase A: AuthError, safe(), sessionGuard + mustChangePasswordGuard,
  no-oracle 404s for cross-account probes, tests at existing depth.

## Context

- `/workspace/shattered-archive/apps/auth-server/src/routes/auth.ts:20-28` —
  toPublicSummary (add globalRole here for /api/auth/me).
- `/workspace/shattered-archive/apps/auth-server/src/routes/keys.ts:26-28` — the
  guard-stacking idiom (`app.use(path, json, sessionGuard, mustChangePasswordGuard)`)
  the admin router copies, plus a new tier guard on top.
- `/workspace/shattered-archive/apps/auth-server/src/global-tiers.ts` — GLOBAL_TIERS
  ladder (authoritative); strictly-below comparisons implemented against it server-side
  (do NOT import services-server's mirror into auth-server).
- `/workspace/shattered-archive/apps/auth-server/src/key-store.ts` — countKind exists;
  A2 adds per-account live counts for the list response.
- `/workspace/shattered-archive/apps/auth-server/src/account-store.ts` —
  setGlobalRole + adminSetTemporaryPassword + generateOneTimePassword already exist
  (Phase A / Phase 1); admin routes compose them, stores stay mostly untouched.
- `/workspace/shattered-archive/apps/auth-client/src/App.tsx` — tab shell (account/keys
  nav) the Admin tab joins; `useAuthSession` supplies the account summary.
- `/workspace/shattered-archive/apps/auth-client/src/App.css` — 100-line dark-leaning
  minimal sheet, the refresh target; index.css is a 61-byte reset.
- C# reference: `C:/Projects/DSL/Server/Server.Web.Public/wwwroot/css/site.css` (55KB,
  host path — read-only reference, qwen-extracted tokens verified by grep before use).
- Deploy: same compose/procedure as Phase A (sub-plan 20260727-0905's DEPLOYED entry —
  incl. the node --use-system-ca edge-probe quirk and the .env-aside live-script dance).

## Steps

### [x] 1. (CLAUDE) auth-server: admin guard, audit log, admin routes (+ tests)
- Do: `routes/admin-guard.ts` — requireTier middleware (after sessionGuard): loads the
  actor's account, 403 for tier 'user', stashes actor+tier in res.locals; helpers
  `canManageTier(actor, target)` and `assignableTiers(actor)` against GLOBAL_TIERS.
  `audit-log.ts` — append-only JSONL writer under DATA_DIR (fs.appendFileSync, one
  line per entry, never read back). `routes/admin.ts` — GET /api/admin/users
  (?query=&offset=&limit=, live per-account key/session counts via a new
  keyStore.countForAccount(accountId) that skips revoked/expired records; every listed
  row also carries `manageable: boolean` for the UI), POST /api/admin/users/:id/role
  (strictly-below on CURRENT target role AND on the new role; audits), POST
  /api/admin/users/:id/temp-password (strictly-below; adminSetTemporaryPassword +
  generateOneTimePassword; one-time password in the response; audits), GET
  /api/admin/services (serviceName, active key count, redirectUris — the delegation
  surface's data). auth.ts toPublicSummary gains globalRole. Register in app.ts.
- Files: /workspace/shattered-archive/apps/auth-server/src/routes/{admin-guard.ts,
  admin.ts, admin.test.ts}, src/{audit-log.ts, audit-log.test.ts, key-store.ts,
  key-store.test.ts}, routes/auth.ts, src/app.ts.
- Verify: `pnpm --filter @shatteredarchive/auth-server test` green with the FULL
  strictly-below matrix at API level (user 403s on list; moderator cannot touch
  admin/peer; admin cannot touch owner/peer admin nor assign admin; owner cannot be
  assigned via API), temp-password forces mustChangePassword + bumps epoch (old session
  dies), audit.log gains lines for both actions, counts exclude revoked/expired, query
  paging works, cross-account id probe 404s not 403s.

### [x] 2. (CLAUDE) auth-client: Admin section (users + delegation) (+ tests)
- Do: api/client.ts admin wrappers + AccountSummary.globalRole; App.tsx shows an Admin
  tab only when me().globalRole !== 'user' (API still enforces if forced);
  `features/admin/AdminPage.tsx` — Users panel (search input, paged table: username,
  role, created, must-change flag, key/session counts; per-row role `<select>` limited
  to assignableTiers(actor) and only on manageable rows; temp-password button behind a
  confirm, one-time password shown once) + Services panel (from GET /api/admin/services;
  link-outs via a static SERVICE_ADMIN_LINKS map — mud-builder-server →
  https://build.shatteredarchive.dev's Access tab — rows without a link render
  link-less).
- Files: /workspace/shattered-archive/apps/auth-client/src/{api/client.ts, App.tsx,
  features/admin/AdminPage.tsx, features/admin/AdminPage.test.tsx}.
- Verify: `pnpm --filter @shatteredarchive/auth-client test` green — tab hidden for
  plain users; unmanageable rows show no controls; role change + temp-password flows
  round-trip against mocked fetch incl. show-once; services panel renders link-outs.

### [x] 3. (CLAUDE) Visual refresh from the C# design language
- Do: verify qwen's site.css token extraction by grepping the quoted values, then
  rebuild index.css/App.css around CSS custom properties (palette, type scale, spacing,
  radius, buttons/inputs/tables/nav) so every existing page + SSO consent + new Admin
  section wears the C#-derived look with a modern feel; keep the auc-* namespace and
  the widened layout the admin table needs. No behavior changes — all suites stay green
  untouched.
- Files: /workspace/shattered-archive/apps/auth-client/src/{index.css, App.css},
  (class additions only where a page needs a new hook).
- Verify: `pnpm --filter @shatteredarchive/auth-client test` + `vite build` green;
  visual side-by-side vs the C# site is presented to the user for the "comfortable"
  call (screenshots or live).

### [x] 4. (CLAUDE) Docs, indexes, deploy + live sign-off, bookkeeping
- Do: docs/auth-server.md — Admin API section (routes, strictly-below rules, audit
  log); docs/auth-client.md — Admin page row + refresh note; .annotated/@ai- refreshes
  everywhere touched; deploy both containers (same compose command as Phase A) and
  live-verify with evidence: grant a smoke account moderator → list users via the API,
  strictly-below refusal against an admin-tier target, temp-password round-trip +
  audit.log line on live data, admin tab visible in the served SPA; revert smoke
  grants; umbrella A2 → [x] + progress log; this doc Status COMPLETE.
- Verify: all suites + builds green; live evidence logged here like Phase A's
  DEPLOYED entry.

## Progress log

- 2026-07-27T11:45 plan created (Claude). Phase A deployed + live-verified earlier this
  session; site.css design-token extraction delegated to local qwen (running in
  background at plan time). toPublicSummary/keys-guard idioms grounded by grep this
  session.
- 2026-07-27T12:0x step 1 done: routes/admin-guard.ts (requireElevated 403s tier
  'user' everywhere; canManageTier/assignableTiers strictly-below against the
  authoritative GLOBAL_TIERS — owner never assignable over HTTP), audit-log.ts
  (append-only JSONL under DATA_DIR, never read back), routes/admin.ts (GET users
  paged/searchable w/ live per-account counts via new keyStore.countForAccount +
  manageable flags + assignableTiers; POST :id/role double-checks target's CURRENT
  tier AND the new tier; POST :id/temp-password → one-time password, forced change,
  epoch bump, audited; GET services via new serviceKeyStore.listServices),
  accountStore.listAll, /api/auth/me + login/signup summaries gain additive
  globalRole, deps/index/test-helpers gained auditLog, app.ts registers the module.
  Verified: 9 new tests (full strictly-below matrix, secret-material regex on the
  list payload, temp-password kills prior session + audits, search/paging, revoked
  count drop, services listing, me.globalRole) — full suite 145/145 (15 suites),
  tsc clean.
- 2026-07-27T12:2x step 2 done: features/admin/AdminPage.tsx (searchable/paged user
  table w/ live credential counts; role select offered ONLY on manageable rows and
  limited to the server's assignableTiers; temp-password behind a confirm w/ show-once
  display; delegation panel listing registered services w/ SERVICE_ADMIN_LINKS
  link-outs — unknown services render link-less), api/client.ts admin wrappers +
  AccountSummary.globalRole, App.tsx Admin tab hidden for plain users (API enforces
  regardless — new App.test.tsx proves both visibility states). NOTE: qwen backend was
  down (fetch failed) for the site.css extraction — step 3 falls back to targeted greps
  per the "MCP is an optimizer, never a gate" rule. Verified: auth-client 25/25 (5
  suites incl. 6 new AdminPage + 2 App), vite build clean. (Two initial test failures
  were URL-index bugs in the test MOCK, not the component — fixed in the mock.)
- 2026-07-27T12:4x step 3 done: design tokens extracted from site.css via targeted
  greps (qwen down) and VERIFIED by quoting exact values — dark neutrals (#1e1e1e/
  #252525 rows, #242934 tile, #1f1f1f chips, #444 borders + rgba(255,255,255,.06)),
  text #d4d4d4/#ecf0f6/#a9b2c0, accents #6f93ff/#f19a47 with #1D94E4 link hover and
  #ffd08a hover warmth, 8px radii + pill chips + soft shadows, Vera Sans Mono/Monaco
  mono accents. index.css now carries the token set as CSS custom properties (the
  constellation's reference identity style); App.css rebuilt on the tokens — panel
  cards, pill nav with the blue→orange header underline, striped rounded admin table,
  chip buttons w/ warm hover; auc-* class names unchanged so no test churn. Verified:
  25/25 + vite build clean (CSS 4.06kB). Side-by-side "comfortable" review remains the
  user's call at deploy.
- 2026-07-27T13:0x step 4 done + plan COMPLETE + **DEPLOYED + LIVE SIGN-OFF**. Docs:
  auth-server.md "Admin (Phase A2)" section (routes, strictly-below rules, audit log,
  me.globalRole) + auth-client.md AdminPage row + refresh note; .annotated refreshed
  (auth-server src/routes, auth-client src). Deploy: both containers rebuilt/recreated
  again. Live E2E 12/12 PASS through the real edge: smoke account recovered via
  host temp-password + granted moderator (visible on me() WITHOUT a restart), second
  throwaway account created, admin list 200 w/ manageable flags + assignableTiers
  exactly ['user'] + no secret material in the payload, promote-to-admin refused 403
  (assignment ceiling live), moderator-issued temp password 200 → the managed account
  logged in with it (mustChangePassword set) and got 403 on the admin list
  (requireElevated live), services listing shows mud-builder-server. Live audit.log
  carries the temp-password entry (actor phase-a-smoke-1785163724 → target
  phase-a2-smoke-1785164801). Cleanup: moderator tier reverted to user, scratch
  temp-password files deleted, .env restored. Residue: one more inert
  phase-a2-smoke-* account (same no-delete situation as Phase A — account deletion is
  a natural A2 follow-up if wanted). Visual "comfortable" verdict remains with the
  user at https://auth.shatteredarchive.dev.
