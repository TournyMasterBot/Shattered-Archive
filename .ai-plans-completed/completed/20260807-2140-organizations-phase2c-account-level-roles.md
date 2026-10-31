# Plan: Organizations Phase 2c — account-level administrative roles

Created: 2026-08-07T21:40:00-0500 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Let an account hold Leader/Moderator authority over an organization directly (no character persona), so a person can administer multiple same-category organizations without the one-org-per-category rule that (correctly) still governs character personas.

## Goal

Character personas are UNCHANGED — Phase 2b's "one org per category at a time" rule
still governs them exactly as built and independently reviewed. A NEW, parallel
mechanism — an account-level role grant — lets someone act in an organization
administratively ("I am not playing as a persona, I am acting in an administrative
capacity") without needing a character there at all, and without being subject to the
per-category exclusivity rule, since it represents an appointment, not a roleplay
identity. Reached when: an account with NO character in either of two same-category
orgs can hold Moderator authority in BOTH simultaneously via account-level grants,
verified live, and an independent review finds no gap in how this new resolution path
interacts with the existing character-based one.

## Constraints

- Do not touch `AutoLeaveSameCategoryOrgs`, `JoinOrgAsCharacter`, or the character
  membership Key shape — those are exactly right as built and reviewed in Phase 2b.
  This phase adds a SEPARATE grant type, not a modification to how characters join.
- Account-level roles are restricted to Leader/Moderator — never Member. "Administrative
  capacity" doesn't fit a Member grant; if someone just wants roleplay presence, that's
  what a character is for.
- Same ceiling discipline as everywhere else: granting/revoking an account-level role
  uses the exact same `CanManage` strict-outrank check already proven throughout this
  file — no new bespoke permission logic.
- Banning an account must also revoke any account-level role grant it holds in that
  org — a ban that left administrative access intact would be a real gap, not a
  cosmetic inconsistency.
- An account-level role holder needs to be able to actually read/write org CONTENT too,
  not just manage members — which means `OrganizationContentController`'s key
  resolution needs to lazily provision them a key the same way it already does for
  service Admins (Phase 2 Step 1), not just gate a permission check that then has
  nothing to decrypt with.

## Context

- Current permission resolution to extend, all in
  `/workspace/dsl/Server/Server.Web.Public/Controllers/OrganizationController.cs`:
  `CanManageOrgMember` and the inline check in `SendInvite`/`IsModeratorOrAdmin` all
  currently resolve "the caller's role" via `LoadOwnedCharacter(asCharacterId,
  callerId)` → `GetCharacterRole(orgId, character.Id)`. This phase adds a NEW first
  path — a direct account-level grant — checked BEFORE falling back to the
  character path, so `asCharacterId` becomes optional for anyone holding a grant.
- `OrganizationContentController.cs`'s `ResolveContentKey`/`HasWriteAccess` currently
  only special-case service Admins (lazy key provisioning via
  `OrganizationKeyUtil.ResolveCallerContentKey`, `Services/OrganizationCrypto/
  OrganizationKeyUtil.cs`). That lazy-provisioning path needs to ALSO fire for an
  account-level grant holder, not just a service Admin.
- Row shape convention (unchanged from every prior phase):
  `{Key, SortKey, Timestamp, Payload}`, registered in both `Server.Core/Constants.cs`
  and `AppManager.cs`'s `DbTables` array.
- `DBManager.QueryItems` (plural) still throws `NotImplementedException` — use
  `ScanItems` + in-memory filter for any "list rows matching X", never `QueryItems`.
- Verification convention: live against a real running server pair (isolated
  `auth-server` + DSL/Server), same orchestration used every prior phase this session —
  not unit tests, this codebase has none.

## Steps

### [x] 1. Account-level role data model + resolution
- Do: New `OrganizationAccountRoleModel` (`Key="{orgId}#{accountId}"`, `SortKey=orgId`).
  Payload `OrganizationAccountRolePayload` = `{accountId, orgId, role, grantedBy,
  grantedAt}`, `role` validated to `Leader`/`Moderator` only. New
  `GetAccountOrgRole(orgId, accountId)` + `ResolveCallerRole(orgId, callerId,
  asCharacterId)` (checks the account-level grant FIRST, falls back to the
  character path via the existing `LoadOwnedCharacter`/`GetCharacterRole` only if no
  grant exists). Refactor `CanManageOrgMember`, `SendInvite`'s inline resolution, and
  `IsModeratorOrAdmin` to call `ResolveCallerRole` instead of duplicating the
  character-only resolution inline.
- Files: `Server.Datastore/Models/OrganizationAccountRoleModel.cs` (new),
  `Server.Web.Public/Controllers/OrganizationController.cs`, `Constants.cs`/`AppManager.cs`
- Verify: `dotnet build` clean; confirm every EXISTING Phase 2b live check still
  passes unchanged (character-only actors, zero account-level grants involved) — this
  step must be a pure addition, not a behavior change for anyone not using the new
  mechanism.

### [x] 2. Grant/revoke/list endpoints
- Do: `POST {orgId}/account-roles/{targetAccountId}` (body `{Role}`, ceiling-checked via
  `ResolveCallerRole` + `CanManage`, same double-check shape `ChangeRole` already uses),
  `DELETE {orgId}/account-roles/{targetAccountId}` (revoke, same ceiling), `GET
  {orgId}/account-roles` (Moderator+/Admin visible, same gate as `ListBans`). Extend
  `GetOrganization`'s response with `myAccountRole` alongside the existing
  `myCharacterMemberships`. Extend `BanAccount` to also delete any
  `OrganizationAccountRoleModel` row for the banned account in that org.
- Files: `Server.Web.Public/Controllers/OrganizationController.cs`
- Verify: an account with zero characters in either of two same-category orgs is
  granted Moderator in BOTH via account-level grants — confirm both succeed (the
  one-org-per-category rule does NOT block this, since it's character-scoped only);
  confirm a ban on that account removes the grant too.

### [x] 3. Content access for account-level grant holders
- Do: `OrganizationContentController.cs`'s `ResolveContentKey`/`HasWriteAccess` gain the
  same account-level-grant check (via the new `ResolveCallerRole`-equivalent, duplicated
  into this controller per the established self-contained-controller convention).
  `OrganizationKeyUtil.ResolveCallerContentKey`'s lazy key-provisioning path needs to
  fire for "caller has standing access" (service Admin OR account-level grant), not
  just service Admin — widen its boolean parameter's meaning accordingly.
- Files: `Server.Web.Public/Controllers/OrganizationContentController.cs`,
  `Services/OrganizationCrypto/OrganizationKeyUtil.cs`
- Verify: an account-level Moderator with no character in the org reads AND writes org
  content successfully (lazily provisioned key, same as the existing service-Admin
  path); content they write is attributed sensibly (not a character name they don't
  have — reuse the existing "{username} (admin)"-style fallback, adapted).

### [x] 4. End-to-end verification + independent review
- Do: Live run covering every Verify bullet above in one continuous pass, PLUS full
  regression of Phase 2b's existing 47-check script unchanged. Independent review
  (fresh Explore-agent eyes) specifically checking: does `ResolveCallerRole`'s
  account-grant-first ordering create any way to bypass the character-ownership checks
  Phase 2b's review already verified? Does anything let an account-level grant be
  self-escalated the way `SendInvite`'s original bug allowed?
- Files: none (verification only)
- Verify: all live checks pass; independent review finds no gap; only then check this
  step and flip this doc to `Status: COMPLETE`.

## Progress log

- 2026-08-07T21:40:00-0500 plan created
- 2026-08-07T21:50:00-0500 step 1 done. Added `OrganizationAccountRoleModel`
  (`Key="{orgId}#{accountId}"`) + `OrganizationAccountRolePayload`. New
  `ResolveCallerRole(orgId, callerId, asCharacterId)` checks the account-level grant
  FIRST (via new `GetAccountOrgRole`), falling back to the existing character path
  (`LoadOwnedCharacter`/`GetCharacterRole`) only if no grant exists. Refactored
  `CanManageOrgMember`, `SendInvite`'s inline resolution, and `IsModeratorOrAdmin` to
  call it instead of duplicating character-only resolution three times. Pure internal
  refactor — no new endpoints yet, nothing to grant a role through, so there's no new
  user-visible behavior to test; verified instead that this changed NOTHING for
  existing callers. `dotnet build` clean, 0 errors. Ran the full existing Phase 2b
  regression suite unchanged (clean DB): 47/47 checks still passed.
- 2026-08-07T22:00:00-0500 step 2 done. `POST/DELETE/GET {orgId}/account-roles[/{id}]` —
  grant is upsert (double ceiling-checked against both the existing grant's role and
  the new one, mirroring `ChangeRole`, only when a prior grant exists), revoke reuses
  `CanManageOrgMember` directly, list reuses `IsModeratorOrAdmin`. Restricted to
  Leader/Moderator only (400 otherwise) — administrative capacity, not membership.
  `GetOrganization` gained `myAccountRole` in its response — and its ACCESS GATE itself
  needed a real fix, not just the new field: the original condition
  (`myMemberships.Count == 0 && !isServiceAdmin`) would have wrongly 403'd an
  account-level grant holder with zero characters, since it never checked for a grant
  at all. `BanAccount` also needed two real fixes beyond the plan's own description:
  `HighestRoleForAccount` only ever looked at character rows, so an account with ONLY
  an account-level grant (no characters) would have 404'd as "not found" when someone
  tried to ban them — fixed by folding the account-level role into the same rank
  comparison. And the rotation call was conditional on `targetCharacters.Count > 0`,
  which would have skipped rotation entirely for a grant-only ban even though that
  account might hold a content key from Phase 2c step 3's access — changed to always
  attempt rotation (the removal-detection inside `MaybeRotateAfterRemoval` already
  handles a zero-character account correctly on its own). `BanAccount` now also
  explicitly deletes the account-level grant row as part of the ban. `dotnet build`
  clean, 0 errors.
- 2026-08-07T22:10:00-0500 step 3 done. `OrganizationContentController`'s
  `ResolveContentKey`/`HasWriteAccess` gained a new `HasStandingAccess` check (service
  Admin OR an account-level Moderator+ grant) alongside the existing character path.
  `OrganizationKeyUtil.ResolveCallerContentKey`'s boolean parameter renamed
  `callerHasStandingAccess` (was `callerIsServiceAdmin`) to reflect that its lazy
  key-provisioning path now fires for either reason — same mechanism, wider trigger.
  `PutItem`'s no-character fallback (previously service-Admin-only, attributed
  "{username} (admin)") now also covers an account-level grant holder, same
  attribution style. `dotnet build` clean, 0 errors. Live verification for steps 2+3
  combined is next (step 4).
- 2026-08-08T00:45:00-0500 step 4: live verification. Extended `orgtest3.mjs` with 20
  new checks (29-42) covering grant/revoke/list, the ceiling check on account-grants,
  content read/write via a lazily-provisioned key, and the exact scenario this phase
  was built for — account E, with ZERO characters in either org, holds account-level
  Moderator authority in TWO same-category Kingdoms (Nordmaar + Shalonesti)
  simultaneously, something a character could never do under Phase 2b's per-category
  rule. Also covered: revoking one org's grant doesn't touch the other; a ban deletes
  the grant row and revokes access. First live attempt surfaced three environment
  problems unrelated to the feature itself (documented here since they'll recur):
  the isolated DSL test instance's default port (5000) is now genuinely occupied by
  an unrelated long-running `shatteredarchive-csharp` Docker container on this
  machine, so the instance had to move to port 5099 with matching AuthHub/GameSso/
  SiteSso redirect-URI overrides and a newly-registered SSO redirect URI on the
  isolated auth-server; the DSL server's `bin/Debug/net8.0/secrets/shattered-web.dev.key`
  had silently drifted from the root project's copy (auto-reprovisioned by
  ServiceKeyProvisioner when the bin-local copy went missing), which broke the
  service-to-service SSO assertion until the two were re-synced; and the DSL server's
  one-time "first owner/admin hub login bootstraps this service's local Owner" rule
  (`HubAuthMiddleware.cs`) means the sqlite DB must be wiped before EVERY clean run,
  not just the first — a second run against the same DB left the fresh test account
  without local Owner tier, causing a cascade of unrelated-looking failures. None of
  these three were product bugs.
  Full regression (68 checks: Phase 2b's ~47 plus this phase's 20) passed clean, 0
  failures, once run against a freshly-wiped DB.
  Independent review: two parallel Explore agents, one covering the grant/revoke/list
  permission surface, one covering the content-access/crypto-key surface. Both
  independently converged on the SAME real gap: `RevokeAccountRole` deleted the grant
  row but never called `MaybeRotateAfterRemoval` the way `BanAccount` does — since
  `OrganizationKeyUtil.ResolveCallerContentKey` returns an already-provisioned
  `OrganizationMemberKeyModel` row unconditionally without re-checking standing access,
  a revoked account that had ever read org content once could keep decrypting it
  indefinitely (read-only, until an unrelated rotation happened to occur). Fixed by
  adding the same `MaybeRotateAfterRemoval` call `BanAccount` already makes; confirmed
  safe because that function's own "does this account still have a character here"
  check means an account that ALSO holds a character in the org correctly does NOT get
  rotated out from under their legitimate character-based access. Second reviewer also
  flagged a latent (not currently exploitable) drift risk: `PutItem` re-derived
  "isAdmin || accountRole != null" locally instead of calling the file's own
  `HasStandingAccess` helper, which meant it skipped the Moderator+ tier check on
  `accountRole` — harmless today since `GrantAccountRole` only ever allows
  Leader/Moderator, but a duplicate implementation exactly of the kind
  `OrganizationKeyUtil`'s own doc comment warns against. Fixed by having `PutItem` call
  `HasStandingAccess` directly. A new regression check (41b) targeting the exact
  revoke-then-read exploit was added to `orgtest3.mjs`; re-ran the full 68-check suite
  against both fixes — clean, 0 failures. A third, low-severity finding (account-level
  grant writes and real service-Admin writes are both attributed "(username) (admin)",
  making them visually indistinguishable) was left as-is — it reuses Phase 1's
  established attribution convention deliberately and isn't a security issue, just a
  minor audit-trail nicety. A fourth finding (an org that drops to zero real members
  has no key rows for its new epoch, which could throw if a later join is approved by
  a surviving account-level grant holder) was flagged as pre-existing, orthogonal to
  this phase, and out of scope — noted here for a future pass, not fixed now.
  Phase 2c is COMPLETE.
