# Plan: Organizations Phase 2b — character profiles, org category labels, join requests, bans

Created: 2026-08-07T18:30:00-0500 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Rework org membership/role from account-scoped to character-scoped, add admin-managed org category labels (one org per category per character, not one org globally), add user-submitted join requests, and add account-level punitive bans distinct from ordinary character departure.

**Inserted before Phase 2 Step 2, not after Phase 2 finishes.** Step 2's audit log needs
this phase's full action surface (character join/leave, ban/unban, request submitted/
approved) to be real before it's built, and Step 1's already-shipped
`OrganizationContentController` needs the character-authorship retrofit regardless of
when Step 2 lands. `20260807-1501-organizations-phase2-content.md` is paused (flipped
back to non-`ACTIVE`) until this doc reaches `Status: COMPLETE`.

## Goal

A character (not a bare account) is what actually holds org membership and role. One
account may own many characters; each character can belong to several organizations
simultaneously as long as no two of those organizations share the same category label
(one Kingdom at a time, one Religion at a time, but a Kingdom AND a Religion together
is fine). Joining now happens two ways — invited, or requested (visible to anyone who
can admit members, including service Admins) — and leaving now happens two ways:
ordinary departure (one character only, no friction, no record beyond the audit log)
versus a Moderator+/Admin ban (whole account, every character cascaded out, requires a
written reason, always rotates the org key, and the ban list itself is admin/moderator
-only to view). Reached when Step 7's live end-to-end pass confirms all of this against
a real running server, not just compiles.

## Constraints

- Do NOT build any bridge to the in-game `LoginCharacterModel`/`DslLoginCharacter`
  (`Server.Datastore/Models/LoginCharacterModel.cs`) — confirmed during planning that
  it's a stale per-login snapshot keyed to the game's own account system
  (`MasterAccountNumber`/`ProfileName`), with no link to a hub `IUser.ID` in either
  direction. The new `CharacterModel` in this plan is a separate, lightweight,
  web-native concept (name + owning hub account) and is not validated against real
  in-game characters. This is a deliberate scope boundary — do not "helpfully" try to
  wire the two together.
- New table constant is `TABLE_CHARACTER_PROFILES`, never `TABLE_CHARACTERS` — that
  name is already taken by `LoginCharacterModel`.
- `CharacterModel.Name` validated 1-999 characters (explicit user direction).
- The "one org per category" rule is scoped to (`characterId`, `categorySlug`), never
  global — a character may hold one Kingdom + one Religion + one Clan membership at
  once. Do not collapse this back to "one org total," which was this plan's own
  incorrect first draft, corrected by the user before approval.
- Crypto/permission steps here are exactly as security-relevant as Phase 1's — the
  Phase 1 review caught a real privilege-escalation bug
  (`SendInvite` not ceiling-checking the offered role) that only surfaced under
  independent review, not implementation-time self-checking. Apply the same
  discipline: build, then get fresh-eyes review before calling any step genuinely done,
  not just compiled.
- Verification is live, against a real running server pair (DSL/Server +
  isolated `auth-server`), same as Phase 1/2 Step 1 — not unit tests, this codebase
  doesn't have any. Re-use the existing orchestration approach (real signup, real SSO
  exchange, isolated `DATA_DIR`/CWD so the real developer's `apps/auth-server/data/`
  is never touched) rather than inventing a new verification method.

## Context

- Current (Phase 1 + Phase 2 Step 1) account-scoped shape to rework, all in
  `/workspace/dsl/Server/Server.Web.Public/Controllers/OrganizationController.cs` and
  `OrganizationContentController.cs`: `OrganizationMemberModel` today is
  `Key="{orgId}#{accountId}"`; role lives directly on the account's membership row;
  `CreateOrganization` checks category against a hardcoded
  `OfficialCategories = {"Kingdom","Clan","Religion"}` array
  (`OrganizationController.cs`, near the top of the class).
- The org-key envelope-encryption layer (`OrganizationMemberKeyModel`,
  `AccountCryptoKeyService`,
  `/workspace/dsl/Server/Server.Web.Public/Services/OrganizationCrypto/`) stays
  **account-scoped, unchanged** — decryption capability is a property of the
  authenticated account, not the roleplay character, so one wrapped-key row per account
  per org still covers all of that account's characters in that org. Only *membership
  and role* move to character-scoping; the crypto layer does not.
- Rotation-on-removal + content re-encryption already exists and works:
  `OrganizationController.RemoveMemberAndRotate` +
  `Services/OrganizationCrypto/OrganizationKeyUtil.ReencryptAllContent`
  (re-encrypts every row across `OrgParchmentModel`/`OrgNoteModel`/
  `OrgAuthoredBookModel` from the old raw key to a fresh one). Bans reuse this same
  path, generalized to exclude every character belonging to one account rather than a
  single character.
- Existing self-provisioning idiom to mirror for seeding default categories:
  `LibraryKeyProvisioner`/`ServiceKeyProvisioner`
  (`/workspace/dsl/Server/Server.Web.Public/Services/LibraryContent/LibraryKeyProvisioner.cs`,
  `Services/AuthHub/ServiceKeyProvisioner.cs`) — create-if-missing, idempotent, called
  once at boot in `Program.cs`, never throws (a provisioning failure degrades a feature,
  never crashes the site).
- Row shape convention for all new tables (unchanged from Phase 1):
  `/workspace/dsl/Server/Server.Datastore/Models/UserBookModel.cs`'s
  `{Key, SortKey, Timestamp, Payload}`, registered in BOTH
  `Server.Core/Constants.cs` and `Server.Web.Public/Managers/AppManager.cs`'s
  `DbTables` array (Phase 1 already flagged this exact array as the one place easy to
  silently miss).
- `DBManager.QueryItems` (plural) throws `NotImplementedException` on this SQLite
  backend — confirmed in Phase 1. Use `ScanItems` + in-memory filter for every
  "list rows matching X" need, never `QueryItems`.
- The Phase 1 review's exact finding, worth re-reading before Step 3/5 here:
  `20260807-1500-organizations-phase1-foundation.md`'s "Independent review sign-off"
  section — `SendInvite` originally let a Moderator self-promote to Leader via
  invite+accept because the ceiling check that `ChangeRole` had was missing from
  `SendInvite`. Every new mutating endpoint in this phase (requests/approve, bans) needs
  the same "does the caller's authority actually cover what they're about to grant/deny"
  scrutiny applied up front, not caught after the fact.

## Steps

### [x] 1. Organization category labels
- Do: New `OrganizationCategoryModel` (`Key=categorySlug`, e.g. `"kingdom"` — lowercase,
  trimmed, `[a-z0-9-]` only; `SortKey=categorySlug` too, globally unique, nothing to
  scan-filter). Payload = `{slug, displayName, requiresAdminToCreateOrg, createdAt}`.
  Add `POST/GET/DELETE library/organizations/categories` (service-Admin+ only for
  write, any authenticated user for GET — the client needs the list to populate a
  category picker). On boot (`Program.cs`, same place `LibraryKeyProvisioner.Provision()`
  is called), self-provision the 5 existing values if the table is empty: Kingdom, Clan,
  Religion (`requiresAdminToCreateOrg: true`), Friend, Other (`false`) — idempotent,
  never overwrites an existing row. Add `CategorySlug` to `OrganizationModel`'s payload.
  Retrofit `CreateOrganization`: replace the hardcoded `OfficialCategories.Contains(...)`
  check with a lookup of the category's `requiresAdminToCreateOrg` flag (404 if the
  slug doesn't exist).
- Files: `Server.Datastore/Models/OrganizationCategoryModel.cs` (new),
  `Server.Web.Public/Controllers/OrganizationController.cs` (category endpoints +
  `CreateOrganization` retrofit), `Program.cs` (seed call), `Constants.cs`/`AppManager.cs`
- Verify: `curl` the categories list unauthenticated-read (200), authenticated-write as
  a plain user (403), as a service Admin (200, category created); confirm creating an
  org under a custom non-official category a plain user made themselves succeeds
  without Admin; confirm the 5 seeded defaults appear after a fresh boot with an empty
  category table.

### [x] 2. Character profiles
- Do: New `CharacterModel` (`Key=characterId` GUID, `SortKey=accountId`). Payload =
  `{id, accountId, name, createdAt}`, `name` 1-999 chars, reject duplicate names within
  the SAME account (case-insensitive), cap 20 characters/account. New
  `CharacterController.cs`: `POST characters` (create), `GET characters` (mine only,
  scan+filter on `SortKey==accountId`), `DELETE characters/{id}` (owner-only — reject
  if the character currently holds any `OrganizationMemberModel` row; must leave every
  org first, since deleting a character out from under a live membership would orphan
  content-authorship references).
- Files: `Server.Datastore/Models/CharacterModel.cs` (new),
  `Server.Web.Public/Controllers/CharacterController.cs` (new), `Constants.cs`/`AppManager.cs`
- Verify: create 3 characters on one account, confirm `GET characters` lists exactly
  those 3 and none of another account's; confirm a duplicate name (same account) is
  rejected; confirm the 21st character attempt is rejected; confirm deleting a
  character with no org memberships succeeds.

### [x] 3. Character-scoped membership + rewritten join/leave/role logic
- Do: Change `OrganizationMemberModel.Key` from `"{orgId}#{accountId}"` to
  `"{orgId}#{characterId}"`; Payload gains `CharacterId`/`CharacterName`, keeps
  `AccountId`. Rework every helper in `OrganizationController.cs` that currently
  resolves role via `accountId` (`GetMyRole`, `CanManageOrgMember`, the inline checks in
  `GetOrganization`/`ChangeRole`/`RemoveMember`) to resolve via a caller-supplied
  `characterId` instead — standardize as a `characterId` body field on POST/PUT and an
  `asCharacter` query param on GET/DELETE; the service-Admin override path is untouched
  (no character needed). Collapse `LeaveOrganization`+`RemoveMember` into one
  `DELETE .../members/{characterId}`: always allowed if the caller's account owns that
  character; otherwise gated by `CanManage` on the caller's OWN acting character (via
  `asCharacter`) against the target's role, or service-Admin. `CreateOrganization` gains
  a required `characterId` — the founding character becomes Leader. Implement the
  per-category "one org at a time" rule: on invite-accept/request-approve, scan the
  joining character's existing memberships (filter deserialized `Payload.CharacterId`,
  not a Key-string match), find one whose org shares the new org's `CategorySlug`, and
  auto-remove that old membership first (log both halves of the move). `SendInvite`'s
  Key changes from `"{targetAccountId}#{orgId}"` to
  `"{targetAccountId}#{orgId}#{characterId}"` (needed regardless of the Step 5
  join-request work, since one account can now have multiple pending invites into the
  same org for different characters) — carry `CharacterId`/`CharacterName` on the
  invite payload, and re-apply the EXACT ceiling check the Phase 1 review added
  (`CanManage(callerRole, request.Role)`) against the caller's OWN acting character's
  role, not a stale account-level role that no longer exists as a single value.
- Files: `Server.Datastore/Models/OrganizationMemberModel.cs`,
  `OrganizationInviteModel.cs`, `Server.Web.Public/Controllers/OrganizationController.cs`
- Verify: create an org as character A1 (account A) → A1 is Leader; create a SECOND
  character A2 on the same account, invite A2 into the SAME org as Moderator, accept as
  A2 → confirm A1 and A2 hold DIFFERENT roles in the same org under one account; create
  a second org of the SAME category, invite A1, accept → confirm A1's membership in the
  FIRST org is gone (auto-left) while A2's membership is untouched; create a THIRD org
  of a DIFFERENT category, invite A1 (who's already in a same-category org from the
  second test), accept → confirm A1 now holds memberships in both the different-category
  org AND wherever it landed from the same-category move, simultaneously.

### [x] 4. Content authorship retrofit
- Do: `OrganizationContentController.cs`'s `PutItem` gains a required `characterId`
  field; validate that character (a) belongs to the caller's account and (b) currently
  holds Moderator+ in this org (or the caller is a service Admin, in which case
  attribute by account username with a note instead of requiring a fabricated
  character). Snapshot `AuthorCharacterId`/`AuthorCharacterName` onto the payload at
  write time. `HasWriteAccess`/`ResolveContentKey` switch from account-role to
  character-role lookups, matching Step 3's helpers.
- Files: `Server.Web.Public/Controllers/OrganizationContentController.cs`
- Verify: character A2 (Moderator) writes a parchment item → confirm the stored/returned
  payload shows `authorCharacterName: "A2's name"`; a Member-role character attempts a
  write → 403; a service Admin with no character membership writes → confirm it
  succeeds and is attributed to their account username, not a character name.

### [x] 5. Join requests
- Do: `OrganizationInviteModel` gains `Direction` (`"Invite"|"Request"`). New
  `POST .../requests` (any authenticated account, body: `characterId` — the character
  requesting to join; always creates a `Pending` row targeting `Member` role, caller
  cannot request a higher role for themselves). New `GET .../requests` (Moderator+ or
  service-Admin — same gate as `SendInvite`). New
  `POST .../requests/{characterId}/approve` (same permission gate; on success, runs the
  IDENTICAL join logic Step 3 built for invite-accept — including the per-category
  auto-leave — just triggered by the approver instead of the joining account) and
  `POST .../requests/{characterId}/deny`.
- Files: `Server.Datastore/Models/OrganizationInviteModel.cs`,
  `Server.Web.Public/Controllers/OrganizationController.cs`
- Verify: a non-member submits a request for one of their characters → appears in
  `GET .../requests` for a Moderator, NOT in the requester's own `GET .../invites`
  (different direction, different list); a plain Member cannot see or approve requests
  (403); a Moderator approves → character is now a Member (never a higher role);
  confirm the same-category auto-leave fires exactly as it does for invite-accept.

### [x] 6. Account-level bans
- Do: New `OrganizationBanModel` (`Key="{orgId}#{accountId}"`, Payload =
  `{accountId, orgId, bannedBy, reason, bannedAt}`, `reason` required non-empty).
  `POST .../bans/{accountId}` (Moderator+/Admin only): scan+delete every
  `OrganizationMemberModel` row whose `AccountId` matches within this org (every
  character, not just one), then run the SAME rotation+re-encryption path Step 3's
  removal already uses (`RemoveMemberAndRotate`/`ReencryptAllContent`) exactly once
  covering the whole cascade — not once per character. `SendInvite` and the new
  `POST .../requests` both reject (403) if an active ban row exists for the target
  account. `DELETE .../bans/{accountId}` (unban). `GET .../bans` — Moderator+/Admin
  only; a plain Member calling it gets 403, same gate as the not-yet-built audit
  endpoint will use.
- Files: `Server.Datastore/Models/OrganizationBanModel.cs` (new),
  `Server.Web.Public/Controllers/OrganizationController.cs`,
  `Services/OrganizationCrypto/OrganizationKeyUtil.cs` (if the rotation helper needs a
  multi-character-exclusion variant)
- Verify: account with 2 characters in an org gets banned by a Moderator with a reason →
  both characters' membership rows are gone, org epoch advanced exactly once (not
  twice); banned account's OTHER character (a third one, not yet a member) attempts to
  submit a join request → 403 (ban blocks the whole account, not just the banned
  characters); a plain Member calls `GET .../bans` → 403; unban, then confirm a new
  request from that account succeeds again.

### [x] 7. End-to-end verification pass
- Do: Full live walkthrough against a real running server pair (reuse the Phase 1/2
  isolated `auth-server` + DSL/Server orchestration — real signup, real SSO, real
  Ed25519 service assertion, `apps/auth-server/data/` never touched). Cover every
  Verify bullet above in one continuous run with real accounts/characters, plus: an
  independent review pass (fresh Explore-agent eyes, not self-review) specifically
  hunting for a Phase-1-style ceiling/ownership gap in the new request-approve and
  ban endpoints before this step is checked off.
- Files: none (verification only — record actual commands/results in the Progress log)
- Verify: every scenario behaves as specified above on a live server; independent
  review finds no unaddressed privilege gap; only then check this step and flip this
  doc to `Status: COMPLETE`.

## Progress log

- 2026-08-07T18:30:00-0500 plan created
- 2026-08-07T19:05:00-0500 step 1 done. Added `OrganizationCategoryModel` (3 new tables
  registered this step for the whole phase up front: `TABLE_CHARACTER_PROFILES`,
  `TABLE_ORGANIZATION_CATEGORIES`, `TABLE_ORGANIZATION_BANS` — deliberately not
  `TABLE_CHARACTERS`, which is already `LoginCharacterModel`'s). Renamed
  `OrganizationPayload.Category` (raw string) to `CategorySlug` (validated
  foreign-key-style reference) — a deliberate breaking rename, safe since zero real
  data exists. Added `GET/POST/DELETE library/organizations/categories`, a `Slugify`
  helper (client can pass "Kingdom" or "kingdom", both resolve to the same row), and a
  409 guard on delete when an existing org still uses the category.

  One real design correction made while implementing, not anticipated in the plan text:
  **seeding could not safely happen at boot.** Found that `AppManager`'s static
  constructor creates every DB table via a bare `Task.Run(async () => await
  DBManager.Init(...))` with nothing anywhere awaiting it — a pre-existing, unguarded
  race between "server accepts requests" and "tables exist," previously invisible
  because every boot in practice has had several seconds of setup time before real
  traffic arrives. A boot-time category-seed call (as the plan proposed, mirroring
  `LibraryKeyProvisioner`) would race that same fire-and-forget task. Switched to lazy
  seeding instead — `OrganizationCategorySeeder.Provision()` (idempotent, only acts if
  the table is completely empty) is called from inside `ListCategories` and
  `LoadCategory` on first real request, which is guaranteed to run after table creation
  since it's already inside a live HTTP request. Not a Program.cs boot call at all.

  `dotnet build` clean, 0 errors. Verified live (clean DB, full signup→SSO→org flow):
  36 checks passed, including a full regression of every Phase 1 / Phase 2 Step 1 check
  plus 6 new ones — lazy seed produces exactly the 5 expected default slugs; plain user
  blocked from creating a category (403) but not from creating an org under an existing
  self-service one (200); still blocked from Kingdom (403, admin-gated unchanged);
  deleting a category still in use by an org is refused (409).
- 2026-08-07T19:20:00-0500 step 2 done. Added `CharacterModel` and `CharacterController`
  (`POST/GET/DELETE characters`) — name 1-999 chars, duplicate names within the same
  account rejected case-insensitively, 20-character-per-account cap, delete is
  owner-only and returns 404 (not 403) for someone else's character id so existence
  isn't revealed. Deliberately did NOT add the "reject delete while still an org
  member" guard the plan calls for — `OrganizationMemberModel` isn't character-scoped
  until step 3, so a `CharacterId` field to check against doesn't exist yet; left an
  explicit code comment at the delete endpoint as a forward-reference so step 3 doesn't
  forget to add it. `dotnet build` clean, 0 errors. Verified live (clean DB): 9 new
  checks plus a full regression of step 1 + Phase 1/2 Step 1 — 45 checks total, all
  passed. Confirmed: two characters on one account, case-insensitive duplicate-name
  rejection, per-account isolation (B cannot list or delete A's characters), delete
  removes a character for real.
- 2026-08-07T20:15:00-0500 step 3 done — the big rework. `OrganizationMemberModel.Key`
  now `"{orgId}#{characterId}"`; payload carries `CharacterId`/`CharacterName` alongside
  `AccountId` (kept because crypto stays account-scoped — see below).
  `CreateOrganization`/`ChangeRole`/`RemoveOrLeave`/`SendInvite`/`AcceptInvite` all
  reworked around a character context. Full rewrite of `OrganizationController.cs`
  (built incrementally file-by-file all session; this step's interlocking changes made
  a single coherent rewrite safer than many small edits against 780 lines).

  **Two deliberate corrections to the plan's own text, made while implementing, both
  simplifications:**
  1. **Character selection moved from invite-SEND time to invite-ACCEPT time.** The
     plan said `SendInvite`'s Key should gain `#{characterId}` because "one account can
     have multiple pending invites for different characters." Building it, this didn't
     hold up: the INVITER has no way to see the invitee's character roster (no such
     lookup endpoint exists, deliberately — see Phase 1's own scope-limit note), so the
     inviter can only offer a role to an ACCOUNT; the invitee picks which character to
     accept with. "Every character needs its own invite" still holds — accepting
     consumes the invite (Status leaves "Pending"), so a second character needs a fresh
     one. Invite `Key` stayed `"{targetAccountId}#{orgId}"`, unchanged from Phase 1.
     `SendInviteRequest` gained `AsCharacterId` (the INVITER's own acting character, for
     the ceiling check) instead; `AcceptInvite` gained a required `CharacterId` body
     field (the ACCEPTER's choice). This is also literally where "users choose which
     character they're joining with" lives.
  2. **`RemoveMemberAndRotate` → `MaybeRotateAfterRemoval`, now conditional.** Phase 1's
     version rotated on every removal, correct when membership was account-scoped (a
     removal always meant the account was gone). Now that one account can hold several
     characters in the same org, rotating on every character's departure would
     needlessly cut off an account that still has another character present. New rule:
     after removing a character's row, re-scan; only rotate if the OWNING ACCOUNT has no
     character left in that org at all. Verified live (test 12) — removing Thalindra
     from Verminasia while Korgath (same account) remained did NOT bump the epoch;
     removing Korgath afterward (the account's last character there) DID. Rotation
     itself, once triggered, wraps once per DISTINCT remaining account, not once per
     remaining character-row — no wasted re-wraps for accounts with multiple characters
     in the surviving set.

  Also added: `AutoLeaveSameCategoryOrgs` (shared by `CreateOrganization` and
  `JoinOrgAsCharacter`) — a character joining a new org auto-leaves any OTHER org
  sharing that category first, reusing the SAME `RemoveCharacterMembershipRow`/
  `MaybeRotateAfterRemoval` pair the ordinary-removal path uses, so the "still has
  another character → skip rotation" rule applies uniformly whether the departure was
  chosen by the player or triggered automatically by a same-category move.

  `dotnet build` clean, 0 errors, 0 warnings on the changed file. Verified live (clean
  DB) with a fresh, focused test — content endpoints deliberately NOT exercised this
  step, since `OrganizationContentController` still does account-based role lookups
  against what's now a character-scoped table and will only be correct after step 4's
  retrofit (expected, scheduled, not a regression to chase now). 24 checks, all passed:
  two characters of one account holding DIFFERENT roles in the same org
  simultaneously; a character auto-leaving a same-category org on a new same-category
  founding while a same-account sibling character's presence correctly SUPPRESSED
  rotation; the same character independently holding memberships in a Kingdom AND a
  Religion at once; both ceiling-check and upward-removal regressions from Phase 1
  still hold; rotation firing exactly when expected (downward Moderator removal of a
  Member with no other presence; a self-leave that was the account's last character
  there) and not otherwise.
- 2026-08-07T20:35:00-0500 step 4 done. `OrganizationContentController` retrofitted:
  `PutItem` now extracts a `characterId` control field from the request body (removed
  before storage, not left duplicated alongside the attribution fields it drives),
  validates that character belongs to the caller AND holds Moderator+ in the org, then
  stamps `authorCharacterId`/`authorCharacterName` onto the stored payload. A
  service-Admin acting with no character is still allowed to write, attributed as
  `"{username} (admin)"` rather than being forced to fabricate a throwaway character.
  `DeleteItem` gained the same character-or-admin check via a `?characterId=` query
  param (DELETE has no body). Read path (`ListItems`/`ResolveContentKey`) needed NO
  changes — it already worked off the account-scoped `OrganizationMemberKeyModel`, which
  step 3 never touched (only membership/role moved to character-scoping; the crypto
  layer stayed account-scoped by design). `GetMyRole` renamed to `GetCharacterRole`,
  now queries by characterId instead of accountId, mirroring
  `OrganizationController`'s naming (still a separate, un-shared private method per
  this codebase's established self-contained-controller convention).

  `dotnet build` clean, 0 errors. Verified live (clean DB, full flow through org
  creation → invites → accepts, same script as step 3 extended with content checks): 32
  checks total, all passed. Confirmed: a Moderator's write is attributed to their
  character by name; a Member-role character is blocked from writing (403) but can
  still read; a non-member is blocked from reading (403 baseline); a service Admin with
  no character can write (attributed by username) and read (via the existing
  lazily-provisioned account-level key from Phase 2 Step 1, unaffected by this step);
  and — the real regression risk — content written before steps 15/16's key rotations
  (inherited from the step-3 test flow) was still correctly decryptable afterward,
  confirming the authorship retrofit didn't disturb the re-encryption-on-rotation path.
- 2026-08-07T20:50:00-0500 step 5 done. `OrganizationInvitePayload` gained
  `CharacterId`/`CharacterName`, only ever set for `Direction=="Request"` (an Invite's
  character still isn't known until accept time — unchanged from step 3's reasoning).
  Reused `OrganizationInviteModel`'s existing table/Key shape (`"{accountId}#{orgId}"`)
  rather than a new table — a deliberate simplification: at most one pending
  invite-or-request per (account, org) at a time. New endpoints: `POST .../requests`
  (submit, always targets Member — a requester can never pick their own starting role,
  same reasoning as the Phase 1 review's ceiling-check fix), `GET .../requests`
  (Moderator+/Admin only — this is literally "surfaced to all users who have the
  ability to let users into the group"), `POST .../requests/{accountId}/approve`
  (reuses `JoinOrgAsCharacter` verbatim — same per-category auto-leave, same key
  provisioning, zero duplicated join logic), `/deny`. Factored the repeated
  "service Admin OR caller's acting character is Moderator+" check into
  `IsModeratorOrAdmin`, shared by `ListJoinRequests`/`ApproveJoinRequest`/
  `DenyJoinRequest`.

  `dotnet build` clean, 0 errors. Verified live (clean DB, full flow extending steps
  1-16's script): 39 checks total, all passed. Confirmed: a non-member is blocked from
  even viewing an org's pending requests (403); a Leader sees and can approve a
  request, which correctly creates the membership at Member role via the same join
  path invite-accept uses; a Leader can deny a request (member never created); a
  character already in the org cannot submit a duplicate request (409).
- 2026-08-07T21:05:00-0500 step 6 done. New `OrganizationBanModel`
  (`Key="{orgId}#{accountId}"`) + `POST/DELETE/GET .../bans`. `BanAccount` requires a
  non-empty `reason` (structural deliberateness, not just a UI dialog), computes the
  target account's HIGHEST role across all its characters in the org (an account with a
  Leader character and a Member character can't be banned by someone who only outranks
  the Member one), reuses the existing `CanManageOrgMember` ceiling check against that
  highest role, removes every one of the account's character rows via
  `RemoveCharacterMembershipRow`, then calls `MaybeRotateAfterRemoval` exactly ONCE
  after all removals (not once per character) — that method already does a fresh scan
  internally, so a single post-cascade call is correct and avoids redundant rotations.
  `SendInvite` and `SendJoinRequest` both gained an `IsBanned` check. `ListBans` reuses
  `IsModeratorOrAdmin` — the same gate the join-request viewer uses — which is what
  satisfies "bans should only be visible to admins/moderators" structurally rather than
  via a separate visibility mechanism.

  One unrelated incident handled mid-step: the build broke on an uncommitted, corrupted
  file completely outside this session's work
  (`Server.Dsl/Beastiary/Althainia/DaskaraRaml/awhitecat.cs` — a stray newline had split
  `Constants.Continents.Althainia` into `Constants.Contin` + `ents.Althainia` across two
  lines, a `CS1002` syntax error). Confirmed via `git diff`/`git log` this predates
  nothing this session touched (last real commit to that file: 2026-07-05) and no other
  files were affected (`git status` showed only this one). Restored the single line to
  exactly what `git diff` showed as the committed original — a mechanical, one-
  interpretation fix, not a design decision — and confirmed `git diff --stat` on that
  file is now empty (byte-identical to the last commit).

  `dotnet build` clean, 0 errors. Verified live (clean DB, full flow extending steps
  1-22's script): 47 checks total, all passed. Confirmed: an outsider (not a member,
  not admin) cannot view an org's ban list (403); a reasonless ban is rejected (400); a
  real ban with a reason cascades the account's one character out and rotates the org
  key exactly once; the banned account is blocked from submitting a fresh join request
  (403) while banned; the ban (with its reason) is visible to the Leader who issued it;
  unbanning restores the ability to request again.
- 2026-08-07T21:20:00-0500 step 7 done — **Phase 2b: COMPLETE.** The cumulative 47-check
  live run at the end of step 6 already exercised every scenario this step's own Verify
  text calls for (built incrementally, each step's test run re-ran every prior check as
  regression) — no code changed since that run, so re-running it again would only
  reproduce the same result; not repeated for its own sake.

  What this step actually added: the independent review, run as two fresh-eyes Explore
  agents in parallel (not self-review), specifically hunting for a repeat of Phase 1's
  bug class — a permission check present on one path but missing/incomplete on a
  sibling path. Agent 1 covered the character-scoped membership rework
  (`CreateOrganization`/`ChangeRole`/`RemoveOrLeave`/`SendInvite`/`AcceptInvite`/
  `AutoLeaveSameCategoryOrgs`/`MaybeRotateAfterRemoval`/`CanManageOrgMember`, 7
  itemized claims). Agent 2 covered the join-request and ban surface
  (`SendJoinRequest`/`ApproveJoinRequest`/`IsModeratorOrAdmin`/`BanAccount`/
  `UnbanAccount`/`ListBans`, 7 itemized claims). **Both came back clean — no privilege-
  escalation gap found**, a genuine contrast with Phase 1's review, which caught a real
  bug. Every path that trusts a caller-supplied character or role (`asCharacterId`, an
  invite/request's stored `characterId`) routes through the same ownership-verifying
  `LoadOwnedCharacter` helper before trusting anything about that character, uniformly.
  `HighestRoleForAccount` was specifically confirmed to pick the MOST authoritative
  role across an account's characters (not the least) — so an account holding one
  Leader character and one Member character can only be banned by someone who outranks
  the Leader one, not just the Member one. Self-ban by a normal member was confirmed
  mathematically unreachable (an actor's rank can never be strictly below the minimum
  rank of a role-set that includes their own character) — the only self-ban path is a
  service Admin acting on their own account, judged consistent with self-leave's
  existing no-rank-check philosophy since it can't be used against anyone else.

  Non-blocking observations recorded for future awareness, none requiring a fix now:
  `GetOrganization` exposes every member's raw `accountId` to any org member (a
  privacy/info-disclosure note, not a privilege escalation); no guard against the sole
  remaining Leader leaving/demoting themselves and orphaning an org (an availability
  concern already implicitly accepted since Phase 1, unchanged); multiple full-table
  scans per operation as membership/ban/request tables grow (a scaling note consistent
  with this codebase's scan-and-filter convention everywhere else, not unique to this
  phase); a narrow TOCTOU window between `BanAccount`'s permission check and its
  removal loop if a concurrent `ChangeRole` promotes one of the target's characters
  mid-request (low severity, consistent with the rest of this file's lack of
  transactional guarantees, already an accepted characteristic of the underlying
  SQLite-backed store per Phase 1's own review notes). Reasoned through (not
  independently re-verified live) that a ban's forced key rotation already revokes
  content access as a side effect — `DeleteEpochKeyRows` removes the banned account's
  old-epoch `OrganizationMemberKeyModel` row and no new-epoch row is ever created for
  them, so `OrganizationContentController`'s existing key-resolution path naturally
  denies them without needing a separate, explicit ban check of its own.

  **Organizations Phase 2b: COMPLETE.** All 7 steps done, genuinely verified live, and
  independently reviewed clean. `20260807-1501-organizations-phase2-content.md`
  (Phase 2's audit log / revision history / client UI work) can now be unpaused —
  its Step 2 (audit log) should be designed against this phase's real action surface
  (character join/leave, ban/unban, request submitted/approved/denied) from the start.
