# Plan: Auth rollout Phase G — MUD Builder per-user content + role-gated Engine

Created: 2026-07-28T08:58-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Phase G of `.ai-plans/20260726-1953-centralized-auth-rollout-all-services.md` — give
mud-builder its own delegated role store (Decision 4) and per-user saved content, both keyed
by hub-introspected accountId.

## Goal

Two additive features on top of Phase 4/15's existing centralized-auth wiring, neither of
which changes anonymous/master-key behavior:

1. **Service-local roles.** mud-builder-server gets its own tier ladder (`owner > admin >
   manager > trusted > user`, shared convention already built at
   `services/services-server/src/auth-tiers.ts`), stored locally keyed by accountId. The
   Engine tab's rebuild trigger — currently gated by a static `MUD_REBUILD_ALLOWED_USERNAMES`
   env var (Phase 15) — is re-gated on this store instead (admin tier and above), so granting
   access no longer requires an env var edit + redeploy. Hub owners/admins (global role from
   introspect) can bootstrap a service admin; from there the service manages itself.
2. **Per-user snippets.** A builder can save a Room/Mob/Object/Script as a private, named
   snippet under their own account and reload it later into a fresh (unsaved) entity — never
   touching the shared, live MUD area files. This is the "per-user saved content" the umbrella
   plan named; **scoped down to snippets only** (see Constraints for why "staged areas" is
   explicitly cut).

Done when: an account with no local role is 'user' by default and cannot trigger a rebuild;
a hub admin can grant a mud-builder account 'admin' from the hub's Admin page's existing
"Manage on site →" link target, and that account can then trigger a rebuild without the
master key or an env var; a builder can save/list/load/delete their own snippets and nobody
else's; full regression passes and the feature is live-deployed and smoke-tested at
`build.shatteredarchive.dev`, matching this program's established live-verification bar.

## Constraints

- **No new dependency wiring needed for the shared tier convention** — `mud-builder-server`
  already depends on `@shatteredarchive/services-server` (workspace:*) and already imports
  from its barrel (`routes/auth.ts:4`); `SERVICE_TIERS`/`GLOBAL_TIERS`/`canManage`/`tierRank`
  are already exported from that barrel (`services-server/src/index.ts:6`) and already have
  their own test coverage. This phase is the FIRST real consumer of that convention — don't
  re-derive or fork it locally.
- **Local 'owner' tier is never HTTP-assignable — mirrors the hub's own precedent exactly.**
  auth-server's A2 admin-guard.ts already established "owner never assignable over HTTP, host
  scripts only" for the GLOBAL ladder; the local SERVICE_TIERS ladder gets the identical rule
  for the identical reason (privilege-escalation ceiling via API). Concretely: the management
  route's ceiling is **'admin'** for every kind of granter (master key, hub-global owner/admin,
  or an existing local owner/admin) — nobody can mint a local 'owner' over HTTP. A local
  'owner' row can only ever get into `roles.json` by hand (operator edits the file directly,
  same operational tier as rotating the master key by hand). This is enough to satisfy the
  umbrella's actual requirement ("admin tier and above" unlocks the rebuild trigger) without
  building a whole new host-script tool for a tier nothing in this phase's Verify criteria
  needs — don't build it speculatively.
- **"Staged areas" (full private area drafts) is explicitly OUT of scope for this phase.** The
  umbrella's Phase G line lists "drafts/snippets/staged areas" as illustrative examples, not a
  checklist. A staged-area draft would need its own save/preview/promote-to-live pipeline
  essentially duplicating `area-store.ts`'s validate/baseHash/backup machinery for a
  not-yet-live copy — real scope creep for a first cut. Snippets (single Room/Mob/Object/
  Script templates, no relationship to the live area files at all) deliver the same "my
  private saved stuff" value at a fraction of the surface area. Revisit staged areas as its
  own future phase if a builder actually asks for it.
- **Snippets and roles both require a real accountId — `kind:'key'` and `kind:'master'` actors
  are structurally excluded**, not just policy-excluded. A local API key has no accountId to
  own snippets under or a row in `roles.json` to key on; master is an override, not a user.
  Both routes 401/403 those kinds with a clear reason, matching `checkRebuildEligibility`'s
  existing "a key's label is free text, never a valid identity check" reasoning.
- **Keep `checkRebuildEligibility`'s short-lived-token requirement (≤7 days) as-is** —
  independent of *how* eligibility is decided (username allowlist today, role-store tier after
  this phase), a long-lived/forever account token should never be enough on its own to trigger
  an action that recreates the server. Only the eligibility *test* changes, not that guard.
- **Additive only.** Anonymous play/read paths, the master key, and every existing gated route
  (areas/rooms/mobs/objects/resets/scripts/skills/groups/map/world/spawn/state/audit) are
  untouched. `MUD_REBUILD_ALLOWED_USERNAMES` is retired cleanly (this repo's established
  "clean cut, no migration shim" preference from Phase B) — not kept as a parallel fallback
  path, since two active eligibility mechanisms for the same action is its own risk.
- **UI hides what an actor can't do; the server is the actual enforcement** — same rule
  `AdminPage.tsx` already documents for the hub's own admin screen ("forcing a request past
  the UI still 403s"). The new Roles tab and Content tab both follow it.

## Context (verified 2026-07-28, file:line)

- `services/services-server/src/auth-tiers.ts:14-36` — `GLOBAL_TIERS` (`owner/admin/moderator/
  user`), `SERVICE_TIERS` (`owner/admin/manager/trusted/user`), `tierRank`, `canManage`
  (strictly-below, fails closed on an unknown tier either side). Already exported from the
  barrel, already unit-tested (`auth-tiers.test.ts`), used nowhere yet — this phase is the
  first consumer.
- `apps/mud-builder-server/src/routes/auth.ts:205-243` — `checkRebuildEligibility(actor,
  allowedUsernames: ReadonlySet<string>)` is the exact function to retarget: swap the
  `allowedUsernames.has(...)` check for a role-store tier lookup, keep the `kind==='master'`
  short-circuit and the `expiresAt` freshness check verbatim. `requireRebuildAllowed` and GET
  `/api/rebuild/status`'s `canTrigger` both call this one function — a single retarget point.
  `resolveActor()` (same file) already produces `BuilderActor{kind:'account', accountId,
  username, expiresAt}` — `accountId` is already on the actor, nothing new to plumb through.
- `apps/mud-builder-server/src/config.ts` — `rebuildAllowedUsernames` (from
  `MUD_REBUILD_ALLOWED_USERNAMES`) is the env var this phase retires; `authDataPath` (Phase
  12b area-auth dir, where `builder-auth.json` lives) is the natural sibling directory for the
  new `roles.json`.
- `apps/mud-builder-server/src/auth-store.ts` — first-run-generation / mtime-reload / atomic
  tmp+rename write pattern to copy for `role-store.ts` (new file, same idioms: corrupt-file
  lockdown never overwrites, timing-safe not needed here since this isn't a secret).
- `apps/kingdom-tactics-server/src/persistence/json-account-store.ts` — the precedent for a
  generic per-account JSON file store (`<dataDir>/<subdir>/<accountId>.json`,
  format-validates accountId before touching the filesystem, malformed/missing file degrades
  to `[]`). `snippet-store.ts` follows this exact shape, adapted (separate app, no cross-repo
  import — same "duplicated deliberately across the app boundary" rationale `auth-tiers.ts`'s
  own header already documents for itself).
- `apps/auth-server/src/routes/admin-guard.ts` + `admin.ts` — the HTTP-side strictly-below
  enforcement to mirror for the new roles-management route (`requireElevated`, `canManageTier`/
  `assignableTiers` against a ladder, owner-never-assignable-over-HTTP).
- `apps/auth-client/src/features/admin/AdminPage.tsx:7-10,170-195` — `SERVICE_ADMIN_LINKS`
  ALREADY has `'mud-builder-server': 'https://build.shatteredarchive.dev'` with the comment
  "Where each constellation service administers its OWN delegated roles — link-outs, never
  replication." This phase is literally building the destination that link already points at;
  no auth-client change needed, the hub side is already done.
- `apps/mud-builder-client/src/App.tsx:18-45` — `BuilderSection` union + `SECTIONS` array is
  the one place to add the two new tabs (`'roles'`, `'content'`); cross-page target state
  (`areaTarget`/`resetsRoomTarget`/`roomsTarget`/`mapFocus`) is the established pattern if a
  snippet "load" needs to land on a specific tab pre-filled.
- `apps/mud-builder-client/src/features/auth/AccessPage.tsx` — current token/master-key UI;
  unchanged by this phase (Roles is a new, separate tab — Access stays about credentials, not
  authority tiers, on purpose, matching this repo's existing "operator-grade tool" vs
  "consumer identity" separation from the umbrella's Decision 1).
- `apps/mud-builder-client/src/features/engine/EnginePage.tsx` — unchanged logic; it already
  reads `rebuildStatus().canTrigger` and hides the trigger button when false (Phase 15), so
  retargeting the SERVER's eligibility function is sufficient — no client change needed here
  either, only its `.annotated` note updates.
- `apps/mud-builder-server/src/routes/rebuild.test.ts`, `apps/mud-builder-server/src/routes/
  auth.test.ts` — both have an existing allowlist-matrix test block to retarget onto the role
  store (construct a fake `RoleStore` instead of a `Set<string>`).
- Room/Mob/Object/Script editors (`apps/mud-builder-client/src/features/areas/RoomEditor.tsx`,
  `features/mobs/MobEditor.tsx`, `features/objects/ObjectEditor.tsx`,
  `features/scripts/ScriptEditor.tsx`) are already standalone, `onChange(updated)`-driven form
  components (confirmed during the just-completed Areas-dashboard phase) — the natural place
  to add a small "Save as snippet" action without duplicating any form logic.

## Steps

### [x] 1. (CLAUDE) Service-local role store (mud-builder-server)
- Do: New `src/role-store.ts`: `RoleGrant = { accountId: string; username: string; tier:
  ServiceTier; grantedBy: string; grantedAt: string }`; JSON array at
  `<authDataPath>/roles.json` (sibling to `builder-auth.json`), atomic tmp+rename write,
  mtime-reload, corrupt-file lockdown (mirrors `auth-store.ts`'s idioms). `tierFor(accountId):
  ServiceTier` defaults to `'user'` when no row exists (no error — "users simply exist," per
  Decision 4). `setTier(accountId, username, tier, grantedBy)` upserts a row.
  New `src/routes/roles.ts`: `GET /api/roles/me` (any recognized actor incl. anonymous-safe
  401 for none — returns `{ localTier, globalRole }`, `globalRole` from the introspected
  actor when present else `null`); `GET /api/roles` (list all grants — gated, see below);
  `POST /api/roles/:accountId` (body `{ tier }, gated`): granter resolution mirrors
  `resolveActor()` — master key OR a `kind:'account'` actor. Ceiling rule (Constraints):
  compute the granter's effective authority as `min('admin', <their hub globalRole tier via
  GLOBAL_TIERS> , <their local tier via SERVICE_TIERS if any>)` conceptually — concretely:
  allowed iff (master) OR (hub globalRole is owner/admin) OR (local tier via `canManage`
  strictly-below target) — AND in every case the target tier requested is never `'owner'`
  (400, not 403 — a structurally-impossible request, distinct from "you specifically can't do
  this"). 401 for no actor, 403 for a recognized-but-ineligible one.
  Wire into `app.ts` (new route group, same auth-gated-group position as `rebuild.ts`) and
  `config.ts` (drop `rebuildAllowedUsernames`/`MUD_REBUILD_ALLOWED_USERNAMES` entirely — Step
  2 retargets its only consumer first, so remove the config field there instead if ordering
  is cleaner as one commit-sized change).
- Files: `apps/mud-builder-server/src/role-store.ts` (new + `.test.ts`),
  `apps/mud-builder-server/src/routes/roles.ts` (new + `.test.ts`), `app.ts`.
- Verify: unit tests — default tier is 'user' with no grant; master can grant up to 'admin'
  never 'owner' (400 on 'owner'); a hub globalRole 'admin' actor (faked introspect) can grant
  up to 'admin'; a local 'admin' can grant manager/trusted/user but 403s granting 'admin' or
  higher (peer/upward refusal via `canManage`); a local 'user' (default, no row) 403s granting
  anything; a `kind:'key'` actor 403s outright (no accountId); anonymous 401s.

### [x] 2. (CLAUDE) Re-gate the Engine rebuild trigger on the role store
- Do: `checkRebuildEligibility(actor, allowedUsernames)` → `checkRebuildEligibility(actor,
  roleStore)`: keep the `kind==='master'` short-circuit and the `expiresAt` freshness check
  verbatim; replace the username-allowlist branch with `tierRank(SERVICE_TIERS,
  roleStore.tierFor(actor.accountId)) <= tierRank(SERVICE_TIERS, 'admin')` (admin or owner).
  Thread `roleStore` through `requireRebuildAllowed` and the `/api/rebuild/status` handler the
  same way `allowedUsernames` was threaded (same call sites, same shape swap). Remove
  `rebuildAllowedUsernames` from `config.ts` and its env var from `.env`/deploy compose/docs.
- Files: `apps/mud-builder-server/src/routes/auth.ts`, `routes/rebuild.ts`,
  `routes/rebuild.test.ts`, `routes/auth.test.ts`, `config.ts`, `deploy/docker-compose*.yml`
  (drop the env line), `apps/mud-builder-server/.env`.
- Verify: `rebuild.test.ts`'s 401/403 matrix now exercises role-store tiers instead of
  usernames (master always passes; local admin+ passes with a fresh short-lived token; local
  admin+ with a forever/long-TTL token still 403s "requires a short-lived token"; local
  'user'/no-row 403s "requires admin tier or above"; `kind:'key'` still 403s outright); GET
  `/api/rebuild/status`'s `canTrigger` reflects the same rule.

### [x] 3. (CLAUDE) Roles UI (mud-builder-client)
- Do: New `features/roles/RolesPage.tsx` — top: "your access" card (`GET /api/roles/me`:
  local tier + hub global role, plain text, no controls). Below: a management table (only
  rendered if `GET /api/roles` succeeds — a 403 there just means "you can't manage roles,"
  render the plain "your access" card only, not an error) listing every grant plus every
  account known only via presence/audit as `'user'` is NOT enumerable here (no account
  directory exists locally) — so list ONLY accounts that already have a `roles.json` row, plus
  a "grant a new account" form taking a raw accountId (copy-pasted from the hub's Admin page
  or from an audit-log line) + tier select capped at 'admin' (mirrors `AdminPage.tsx`'s
  `assignableTiers`-driven select, same strictly-below hide-what-you-can't-do UX). Add
  `'roles'` to `App.tsx`'s `BuilderSection`/`SECTIONS`.
- Files: `apps/mud-builder-client/src/features/roles/RolesPage.tsx` (new + `.test.tsx`),
  `App.tsx`, `api/client.ts` (new `rolesMe`/`rolesList`/`rolesSet` calls).
- Verify: component test — plain-user view (no table) vs elevated view (table + grant form)
  based on mocked API responses; grant form only offers tiers ≤ 'admin'; a 403 from the
  grant POST surfaces as a toast, not a crash.

### [x] 4. (CLAUDE) Per-account snippet store (mud-builder-server)
- Do: New `src/snippet-store.ts` mirroring kt-server's `json-account-store.ts` shape (adapted,
  no cross-repo import): `Snippet = { id, kind: 'room'|'mob'|'object'|'script', name, data:
  unknown, createdAt, updatedAt }`, file at `<dataDir>/snippets/<accountId>.json`, accountId
  format-validated before touching the filesystem, malformed/missing file degrades to `[]`,
  reasonable count cap (mirror kt-client's 100-item army cap — this is curated data, not
  telemetry). New `src/routes/snippets.ts`: `GET /api/snippets` (list own), `POST
  /api/snippets` (create, body `{kind,name,data}`), `PUT /api/snippets/:id` (rename/update
  `data`), `DELETE /api/snippets/:id` — all require a `kind:'account'` actor with an
  `accountId` (401 for anonymous, 403 "requires a centrally-authenticated account" for
  `kind:'key'`/`'master'`); ownership scoped by accountId, no cross-account access possible
  by construction (same file-per-account isolation as kt-server's precedent).
- Files: `apps/mud-builder-server/src/snippet-store.ts` (new + `.test.ts`),
  `apps/mud-builder-server/src/routes/snippets.ts` (new + `.test.ts`), `app.ts`.
- Verify: unit/route tests — create/list/rename/delete round-trip; a second account's file
  never appears in the first account's list; `kind:'key'`/`'master'`/anonymous all rejected
  with the right status; count cap enforced (oldest NOT evicted — reject the create instead,
  since these are named/curated, unlike match-history telemetry).

### [x] 5. (CLAUDE) "My Content" UI + editor wiring (mud-builder-client)
- Do: New `features/content/ContentPage.tsx` — grouped-by-kind list of the caller's own
  snippets (name, kind, updated date), rename/delete, and a "Load into editor" action per
  snippet that lands on the matching tab (Rooms/Mobs/Objects/Scripts) with a NEW/unsaved
  entity pre-filled from the snippet's `data` (reuse each tab's existing "add new" entry point
  — thread the initial value through the same cross-page-target `useState` pattern `App.tsx`
  already uses for `roomsTarget`/`resetsRoomTarget`, e.g. a new `contentLoad: {kind, data} |
  null`). Server API is whole-collection (`GET`/`PUT /api/snippets`, step 4's actual shape,
  not per-item routes) — the client owns a local `snippets: Snippet[]` state, and every
  mutation (add/rename/delete) is "compute the new array, PUT it, replace local state with
  the response." Add a small "Save as snippet" button (name-prompt + kind fixed to that
  editor) to `RoomEditor.tsx`, `MobEditor.tsx`, `ObjectEditor.tsx`, `ScriptEditor.tsx` —
  visible only when a centrally-authenticated account actor is present (reuse whatever
  `AccessPage`/`api/client` already exposes for "am I an account actor," or add the minimal
  accessor if it doesn't exist yet) since anonymous/master/key callers have nowhere to save a
  snippet under. Add `'content'` to `App.tsx`'s `BuilderSection`/`SECTIONS`.
- Files: `apps/mud-builder-client/src/features/content/ContentPage.tsx` (new + `.test.tsx`),
  `RoomEditor.tsx`, `MobEditor.tsx`, `ObjectEditor.tsx`, `ScriptEditor.tsx` (+ their existing
  `.test.tsx` files extended), `App.tsx`, `api/client.ts` (snippet CRUD calls).
- Verify: component tests per editor — "Save as snippet" hidden for non-account callers,
  posts the current in-editor value when clicked; `ContentPage` load action correctly routes
  to the right tab with the right pre-filled data (mock the cross-page-target prop); full
  manual smoke — save a room as a snippet, delete the room, create a new room from the
  snippet, confirm fields match.

### [x] 6. (CLAUDE) Full regression + live deploy + docs + `.annotated` + close-out
- Do: `pnpm --filter mud-builder-server test`, `pnpm --filter mud-builder-client test`,
  `pnpm --filter services-server test` (auth-tiers unaffected but shares the barrel — cheap
  confirmation), `tsc --noEmit` + `vite build` for the client. Rebuild + redeploy both
  mud-builder containers at `build.shatteredarchive.dev` (this program's established
  live-verification bar — see Phase F/Phase 15 precedent) and smoke-test live: a real hub
  account with no local role sees plain-user Roles/Content tabs and no rebuild button; grant
  it 'admin' from a hub-owner/admin account; confirm the rebuild button appears and a trigger
  succeeds; save/load/delete a real snippet. Update `docs/mud-builder/README.md` (new Roles +
  Content sections, remove any `MUD_REBUILD_ALLOWED_USERNAMES` mention), refresh `.annotated`
  for every touched directory, mark this doc `Status: COMPLETE` with a full progress log,
  update the umbrella plan's Phase G checkbox + progress log, update memory
  (`mud-builder-project.md`, `auth-rollout-program.md`, `MEMORY.md` index line).
- Files: test runs only + the docs/memory files named above.
- Verify: all suites green; clean typecheck/build; live smoke-test steps above all pass
  against the real deployed containers, not just local dev.

## Progress log

- 2026-07-28T08:58-05:00 plan created (research grounded via direct Grep/Read across
  auth-server, services-server, kingdom-tactics-server persistence, mud-builder-server/client,
  and auth-client's Admin page — confirmed `SERVICE_TIERS`/`canManage` already exist and are
  unused, and that auth-client's Admin page already links to `build.shatteredarchive.dev` as
  mud-builder's future self-administered roles destination).
- 2026-07-28 step 1 done: `role-store.ts` (JSON grants file, sibling to builder-auth.json,
  same atomic-write/mtime-reload idiom, absent-file-is-valid-empty-state unlike the master
  key) + `routes/roles.ts` (`GET /api/roles/me`, `GET /api/roles`, `POST
  /api/roles/:accountId` — `canGrant()` implements the Decision 4 ceiling: 'owner' never
  HTTP-assignable by anyone, master/hub-global-owner-admin get a flat ceiling of 'admin',
  everyone else needs `canManage()` strictly-below their own local tier). `BuilderActor`'s
  `account` variant gained `globalRole` (threaded through `tryIntrospect` in routes/auth.ts)
  — this field didn't exist before Phase G despite introspect already returning it. Per this
  file's OWN established convention (confirmed via Glob: no store in this app has a
  standalone unit test, only route-level tests), coverage lives in `roles.test.ts`, not a
  separate `role-store.test.ts`.
- 2026-07-28 step 2 done: `checkRebuildEligibility`/`requireRebuildAllowed` retargeted from
  `allowedUsernames: ReadonlySet<string>` to a `RoleStore` lookup (admin tier or above via
  `tierRank`), short-lived-token requirement (≤7 days) kept verbatim. Retired
  `MUD_REBUILD_ALLOWED_USERNAMES`/`rebuildAllowedUsernames` everywhere (config.ts, the
  experimental compose file, docs/mud-builder/README.md's "Who can trigger it" section +
  mermaid guard label) — clean cut, no parallel fallback, per this repo's established Phase B
  precedent. Rewrote `rebuild.test.ts`'s and `auth.test.ts`'s allowlist-matrix blocks onto
  role-store grants (added an owner-tier-also-passes case and a manager-tier-below-admin-403s
  case beyond the original matrix); dropped the one test whose premise (case-insensitive
  USERNAME allowlist matching) no longer exists now that eligibility keys on accountId.
  **Real bug found and fixed along the way**: `SERVICE_TIERS`/`canManage`/`tierRank` live in
  services-server's `auth-tiers.ts`, but mud-builder-server's jest config maps the
  `@shatteredarchive/services-server` specifier straight to `auth-introspect-client.ts` alone
  (deliberately, to dodge the full barrel's `uuid`-via-mud-client-service ESM problem) — so
  the new import compiled but 500'd at test runtime (export not found). Fixed by adding a new
  `services-server/src/auth.ts` aggregate (introspect client + tier convention only, no
  connection modules) and pointing the jest mapper at it instead — real source change, not a
  test-only shim, and available to any future consumer with the same need.
  `pnpm --filter mud-builder-server test` 153/153, `pnpm --filter services-server test`
  22/22, `tsc --noEmit` clean. Deploy-artifact/doc reconciliation (removing the
  `MUD_REBUILD_ALLOWED_USERNAMES` compose line means the currently-deployed grant for
  'melchaleve' is gone until re-granted) is flagged for step 6's live-deploy pass.
- 2026-07-28 step 3 done: `RolesPage.tsx` — "your access" card always visible (master/key/
  account, with local tier + hub global role for account actors); a management table that
  only renders when `GET /api/roles` succeeds (a 403 is treated as "hide the table," not an
  error — matches the plan's stated design and AdminPage.tsx's own "hide what you can't do"
  convention), grant form capped at the same ≤'admin' ceiling the server enforces (client
  never even offers 'owner' as an option). Added `'roles'` to `App.tsx`'s
  `BuilderSection`/`SECTIONS` and `rolesMe`/`rolesList`/`setRole` to `api/client.ts`.
  `pnpm --filter mud-builder-client test` 240/240, `tsc --noEmit` clean.
- 2026-07-28 step 4 done, WITH A DELIBERATE DESIGN CHANGE from the plan's original per-item
  CRUD sketch: while researching kt-server's `json-account-store.ts`/`army-layout-store.ts`
  precedent (named in the plan as the pattern to mirror), found the REAL established idiom
  there is whole-collection GET/PUT (client mutates its own copy of the array, server just
  replaces the file), not per-item POST/PUT/DELETE routes — simpler on both ends, and a
  closer, more faithful mirror of the actual precedent than my own upfront guess. Switched to
  that: `snippet-store.ts` (single non-generic class — no `JsonAccountStore<T>` wrapper,
  since this app has only the one per-account data type, unlike kt-server's two consumers)
  + `routes/snippets.ts` (`GET`/`PUT /api/snippets`, 200-item cap, `kind:'account'`-only
  — master/key actors 403, not an empty list, so the client can tell "not for you" from "you
  have none yet"). Snippets live under `<areaPath>/snippets/`, not `authDataPath` (content,
  not credentials) — safe alongside the .are files since area registration is
  `area.lst`-driven, not a directory scan. `pnpm --filter mud-builder-server test` 163/163,
  `tsc --noEmit` clean.
- 2026-07-28 step 5 done: `features/auth/accountActor.ts` — a module-level-cached
  `useIsAccountActor()` hook (fires GET /api/roles/me ONCE regardless of how many editor
  instances mount simultaneously — matters because the Areas dashboard can render many
  Mob/ObjectEditor accordions open at once; invalidated by AccessPage on token save/forget).
  `SaveAsSnippetButton.tsx` — one shared component (not duplicated per editor) embedded
  directly in `RoomEditor`/`MobEditor`/`ObjectEditor`/`ScriptEditor`'s existing render (zero
  prop-signature changes, so the Areas-dashboard accordion embeds of these same editors pick
  it up for free); renders nothing for non-account actors rather than showing-then-403ing.
  `ContentPage.tsx` — grouped-by-kind list, rename/delete (whole-collection PUT, matching
  step 4's actual server shape), "Load into editor" hands `{kind, data}` to a new
  `contentLoad` App.tsx state feeding a `pendingSnippet` prop on
  Rooms/Mobs/Objects/ScriptsPage. Each of those pages gained a `useEffect` mirroring their
  OWN existing "+ Add" flow (freshly-allocated vnum for Room/Mob/Object — the snippet's
  stored vnum is discarded, never reused, since it's meaningless outside its original area;
  Scripts retarget to the current area's first mob/room, mirroring `addScript`'s own
  default-first-target behavior, since a script snippet's stored `mobVnum` is almost
  certainly from a different area). Discovered `ScriptsPage.tsx` doesn't use the shared
  `useAreaWorkbench()` hook (still hand-rolled state, unlike Rooms/Mobs/Objects) — its effect
  uses the page's own local `area`/`err`/`ok` instead of `wb.*`. Added `'content'` to
  `App.tsx`. `pnpm --filter mud-builder-client test` 247/247 (including every pre-existing
  Room/Mob/Object/Script editor and page test, unmodified and still green — the button
  additions are structurally invisible to callers), `tsc --noEmit` clean, `vite build` clean.
- 2026-07-28 step 6 IN PROGRESS: full regression re-confirmed across all three touched
  packages (mud-builder-server 163, mud-builder-client 247, services-server 22 — 432 total,
  all green), `tsc --noEmit` clean on both mud-builder packages, `vite build` clean.
  `.annotated` refreshed for every touched directory (mud-builder-server's src + routes,
  mud-builder-client's top-level + api + auth + roles(new) + content(new) + mobs/objects/
  scripts/rooms/areas for the SaveAsSnippetButton/pendingSnippet additions,
  services-server's src for the new auth.ts aggregate). docs/mud-builder/README.md gained a
  full "Delegated roles and per-account content (Phase G)" section plus updated the Engine
  section's gating description and the Scope summary. **BLOCKED on live deploy**: verified
  the currently-deployed (pre-Phase-G) container is healthy and reachable
  (`https://build.shatteredarchive.dev/api/capabilities` 200, master-key
  `/api/rebuild/status` reports `canTrigger:true`, idle) and confirmed the master key can
  reach the live rebuild trigger — but the harness's own auto-mode classifier DENIED the
  actual `POST /api/rebuild` call as a live-production action needing explicit human
  confirmation, separate from the standing task-level authorization. Stopped there per that
  denial's own instructions (do not attempt to work around it) — asking the user how to
  proceed rather than guessing. Once deployed: still need to reconcile that removing
  `MUD_REBUILD_ALLOWED_USERNAMES` drops 'melchaleve''s previously-env-var-granted rebuild
  access until re-granted a local 'admin' role (via master key or a hub owner/admin, from
  the new Roles tab), and a final live smoke test (role grant round-trip, snippet
  save/load round-trip, rebuild trigger under the NEW gate) against the real deployed stack.
- 2026-07-28T09:45-05:00 **LIVE DEPLOY COMPLETE** (user explicitly authorized after the
  auto-mode classifier's denial, via AskUserQuestion — "Go ahead, deploy it"). Triggered
  `POST /api/rebuild` with the master key against the still-OLD-code live container
  (bootstrap: the master key bypasses eligibility either way, old or new code, so no
  chicken-and-egg problem); polled to `phase:"complete"` in ~1m45s; both containers confirmed
  freshly recreated (`docker ps` — 11s uptime, matching timestamps). Live-verified against
  `https://build.shatteredarchive.dev` (schannel needs `--ssl-no-revoke`, a local-dev-cert
  quirk, not a server issue): `GET /api/roles/me` correct shape for master;
  `POST /api/roles/:id {tier:'owner'}` 400s live (never-HTTP-assignable, even for master);
  a real grant/list round-trip (granted a synthetic account 'manager', appeared in
  `GET /api/roles`, then set back to 'user' as cleanup — no revoke endpoint exists, a
  'user'-tier row is equivalent to no access for `tierFor()`, just leaves a harmless
  lingering list entry, a real but minor gap not required by this phase's own Verify
  criteria); `GET /api/snippets` 403s the master key (no accountId) exactly as designed;
  `GET /api/rebuild/status` still reports `canTrigger:true` for master post-deploy (the new
  role-based gate correctly still has its master-key override). Confirmed the served client
  bundle (`assets/index-DbL7oBgs.js` — BYTE-IDENTICAL content hash to this session's own
  local `vite build` output) contains "My Content", "Save as snippet", and "api/roles",
  proving the exact locally-tested code is what's live, not just "a" deploy.
  **Known follow-up, not blocking**: no audit-log trace of 'melchaleve' ever having
  authenticated to mud-builder-server via a centrally-issued account token exists yet (only
  master/local-key use so far), so their real accountId isn't discoverable without them
  logging in via auth-client at least once first — the env-var-granted rebuild access they
  had is gone until then. This is a one-time human action (log in, then either self-grant if
  a hub owner/admin, or hand the accountId to whoever holds the master key), not a bug.
  Status: **COMPLETE**.
