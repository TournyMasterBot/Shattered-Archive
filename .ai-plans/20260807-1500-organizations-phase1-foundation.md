# Plan: Organizations Phase 1 — delegated roles + envelope-key foundation

Created: 2026-08-07T15:00:00-0500 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Build the org/role/invite data model, generalize DSL/Server's role-ladder primitive, and stand up real per-member envelope-wrapped org keys — the prerequisite layer for Organizations Phase 2 (encrypted content).

## Goal

An authenticated account with DSL/Server service-level `Admin`+ can create an official
organization (Kingdom/Clan/Religion) and assign its first Leader; any account can
self-create a Friend/Other org and becomes its own Leader. Leaders can delegate Moderator,
both can invite existing accounts (who accept/decline from their dashboard, and can block
future invites from a group). Every org has a real per-member-wrapped symmetric key;
removing a member rotates the key, re-encrypts nothing yet (Phase 1 has no content —
Phase 2 adds that), and provably revokes their ability to derive the org key going
forward. Reached when: the `curl` sequence in Step 5 passes end to end against a real
local server + real hub bearer token.

## Constraints

- Do NOT touch `apps/mud-builder-server` — its role ladder is already generic
  (`services/services-server/src/auth-tiers.ts:31`'s `canManage` takes an arbitrary
  ladder). This plan's C# generalization work has no MUD Builder counterpart to build.
- Do NOT touch `apps/auth-server` — the hub deliberately never stores service-local
  tiers (`apps/auth-server/src/global-tiers.ts` header comment). All new state here is
  local to DSL/Server.
- Crypto and permission-check steps (1, 2's `AccountCryptoKeyModel`/
  `OrganizationMemberKeyModel`, 4) are judgment-heavy and security-relevant — a qwen
  draft is fine but a human/Claude MUST review the actual crypto code (RSA-OAEP usage,
  key deletion on rotation, `CanManage` wiring) before this plan checks those steps done.
  Do not check a crypto step complete on qwen's own say-so.
- RSA-3072 via `System.Security.Cryptography.RSA.Create(3072)` — no new NuGet package.
- New DB tables MUST be added to `AppManager.cs`'s `DbTables` array
  (`Managers/AppManager.cs:27-53`) or `DBManager.Init` silently never creates them —
  `TABLE_USER_DIRECTIONS` missing from that array today is the standing cautionary
  example, not something to fix here, just don't repeat it.

## Context

- Personal-writings encryption already in production:
  `/workspace/dsl/Server/Server.Web.Public/Services/LibraryContent/LibraryContentCrypto.cs`
  — `Encrypt(accountId, plaintextJson)`/`Decrypt(accountId, envelopeBase64)`, HKDF-SHA256
  from one server-wide master key (`info=accountId`), gzip-then-AES-256-GCM, envelope =
  `base64(nonce[12] || ciphertext || tag[16])`, no version/algorithm tag. Master key
  self-generated on first boot via `LibraryKeyProvisioner.ProvisionCore`
  (`Services/LibraryContent/LibraryKeyProvisioner.cs:45-74`, `RandomNumberGenerator.GetBytes(32)`).
  This plan's per-account private-key wrapping reuses `Encrypt`/`Decrypt` directly — do
  not build a second at-rest primitive.
- Two delegation ladders already exist and are consistently mirrored:
  - Hub-global (`owner>admin>moderator>user`),
    `/workspace/shattered-archive/apps/auth-server/src/global-tiers.ts`.
  - Per-service (`owner>admin>manager>trusted>user`),
    `/workspace/shattered-archive/services/services-server/src/auth-tiers.ts` (TS,
    already generic: `canManage(ladder, actorTier, targetTier)` takes an arbitrary
    ladder array) and
    `/workspace/dsl/Server/Server.Web.Public/Models/ServiceTiers.cs` +
    `Services/ServiceRoleStore.cs` + `Controllers/ServiceRolesController.cs` (C#,
    currently hardcoded to the fixed 5-tier enum — this is Step 1's target).
  - A service's first hub-global owner/admin login auto-bootstraps its local Owner tier:
    `/workspace/dsl/Server/Server.Web.Public/Middleware/HubAuthMiddleware.cs:70-90`,
    `MaybeBootstrapServiceOwner`.
- Row shape to mirror for every new table:
  `/workspace/dsl/Server/Server.Datastore/Models/UserBookModel.cs`
  (`{Key, SortKey, Timestamp, Payload}`). Constants live near
  `/workspace/dsl/Server/Server.Core/Constants.cs:183` (`TABLE_USER_BOOKS`).
- Sibling controller pattern (route shape, validator style, per-account caps) to follow:
  `/workspace/dsl/Server/Server.Web.Public/Controllers/LibraryController.cs`.
- `HttpContext.GetUser()` (`Server.Web.Public/Extensions/HttpContextExtensions.cs:13-16`)
  is how a controller action gets the current account's hub ID (`user.ID`) — reused
  unchanged for every new endpoint in this plan.
- Full architecture writeup + the rejected-then-corrected first draft of this plan's
  reasoning: `C:\Users\TournyMasterBot\.claude\plans\swift-moseying-rainbow.md` (host
  path, not in this workspace mapping — read via the host if you need the full
  narrative; this doc's Context section already carries the load-bearing facts from it).

## Steps

### [x] 1. Generalize the C# role-ladder primitive
- Do: Refactor `ServiceTiers.cs`/`ServiceRoleStore.cs` so the strictly-below comparator
  works over an arbitrary ordered ladder (`IReadOnlyList<string>`), not a hardcoded
  5-value enum — mirror the shape of TS's `canManage(ladder, actorTier, targetTier)`
  (`services-server/auth-tiers.ts:31-36`: `-1` on either side fails closed, otherwise
  `actorRank < targetRank`). Existing whole-service callers
  (`ServiceRolesController.cs`) must keep working unchanged — this is a refactor, not a
  behavior change, for the existing ladder. Add the new 3-tier ladder as a second
  instantiation: `Leader > Moderator > Member` (this is what Step 2's
  `OrganizationRoleStore` will use).
- Files: `/workspace/dsl/Server/Server.Web.Public/Models/ServiceTiers.cs`,
  `/workspace/dsl/Server/Server.Web.Public/Services/ServiceRoleStore.cs`
- Verify: `dotnet build` clean; existing `ServiceRolesController` tests (if any exist —
  check for a `ServiceRolesControllerTests`-style file first) still pass; a quick
  in-code sanity check that `CanManage(orgLadder, "Moderator", "Moderator")` returns
  `false` and `CanManage(orgLadder, "Leader", "Moderator")` returns `true`.

### [x] 2. New data model
- Do: Add `AccountCryptoKeyModel` (`AccountId`, `PublicKeyPem`, `WrappedPrivateKey` —
  the latter is `LibraryContentCrypto.Encrypt(accountId, privateKeyPem)`'s output,
  reused verbatim, not reimplemented), `OrganizationModel` (`Id`, `Name`, `Category`
  enum `Kingdom|Clan|Religion|Friend|Other`, `CreatedBy`, `CreatedAt`,
  `CurrentEpoch: int`), `OrganizationRoleStore`'s backing table (mirrors
  `ServiceRoleStore`'s row shape but `Key="{orgId}#{accountId}"`, `SortKey=orgId`,
  storing the `Leader|Moderator|Member` tier), `OrganizationMemberKeyModel`
  (`Key="{orgId}#{epoch}#{accountId}"`, `SortKey=orgId`, `WrappedOrgKey` — RSA-OAEP-SHA256
  of the raw 32-byte org key under that member's `PublicKeyPem`), `OrganizationInviteModel`
  (`Key="{targetAccountId}#{orgId}"`, `SortKey=targetAccountId` so "my pending invites"
  is a `SortKey` scan; `Status: Pending|Accepted|Declined|Blocked`, `InvitedBy`, `Role`
  offered, `FriendlyName`, `CreatedAt`, `RespondedAt`). Register all five new
  `Constants.TABLE_*` names and add every one to `AppManager.cs`'s `DbTables` array —
  this is the step most likely to be silently skipped, double check it.
- Files: `/workspace/dsl/Server/Server.Datastore/Models/AccountCryptoKeyModel.cs`,
  `OrganizationModel.cs`, `OrganizationMemberModel.cs`, `OrganizationMemberKeyModel.cs`,
  `OrganizationInviteModel.cs` (new); `/workspace/dsl/Server/Server.Core/Constants.cs`;
  `/workspace/dsl/Server/Server.Web.Public/Managers/AppManager.cs:27-53`
- Verify: `dotnet build` clean; boot the server locally and confirm all five new tables
  exist in the datastore (however this datastore exposes a table listing / or confirm
  via a trivial write+read round trip per table).

### [x] 3. Keypair provisioning + org/invite endpoints
- Do: `AccountCryptoKeyService` — `GetOrProvisionKeypair(accountId)`: if no
  `AccountCryptoKeyModel` row exists, `RSA.Create(3072)`, wrap the private key via
  `LibraryContentCrypto.Encrypt(accountId, privateKeyPem)`, persist, return the keypair
  (mirrors `LibraryKeyProvisioner`'s lazy-generate-on-first-boot idiom, just scoped per
  account instead of once per server). New `OrganizationController.cs`:
  `POST /library/organizations` (Category official → require service tier `Admin`+ via
  Step 1's generalized `CanManage`/`AtLeast`; Category Friend/Other → any authenticated
  account; either way, generates a random 32-byte org key, wraps it for the creator via
  their keypair, creates the Leader membership row, epoch=1). `POST
  /library/organizations/{orgId}/invites` (Leader/Moderator only — checked against
  `OrganizationRoleStore` OR service tier `Admin`+ override), `GET
  /library/organizations/invites` (mine, `SortKey` scan), `POST
  .../invites/{id}/accept` (lazily provisions the invitee's keypair if missing, wraps
  the org's *current* epoch key for them, creates their membership row), `.../decline`,
  `.../block` (writes/keeps a `Blocked` row so a future invite attempt from this org is
  rejected until an explicit unblock).
- Files: `/workspace/dsl/Server/Server.Web.Public/Services/OrganizationCrypto/AccountCryptoKeyService.cs` (new),
  `/workspace/dsl/Server/Server.Web.Public/Controllers/OrganizationController.cs` (new)
- Verify: `curl` with a real hub bearer token: create a Friend org as a plain user
  (succeeds), attempt to create a Kingdom org as a plain user (403), create a Kingdom org
  as a service Admin (succeeds), invite a second real account, accept as that account,
  confirm `GET .../organizations/{orgId}` now lists two members.

### [x] 4. Member management + key rotation
- Do: `POST /library/organizations/{orgId}/members/{accountId}/role` (role change,
  gated by Step 1's `CanManage(orgLadder, callerRole, targetRole)` OR service `Admin`+
  override — this is where "no peer removal moderator-moderator" and "administrators can
  manage all organizations" both land, as the same one function call each). `DELETE
  .../members/{accountId}` (same gate; triggers rotation: new epoch, fresh random 32-byte
  key, wrap it for every *remaining* member, **delete** the removed member's
  `OrganizationMemberKeyModel` rows for the *old* epoch — this delete is load-bearing,
  it's what makes the old key unrecoverable from stored data alone, do not skip it or
  leave it "for audit"). `DELETE .../members/me` (self-leave, no permission check,
  always allowed, same rotation).
- Files: `/workspace/dsl/Server/Server.Web.Public/Controllers/OrganizationController.cs`
- Verify: with the two-member org from Step 3, remove the second member as Leader;
  confirm (a) a fresh `OrganizationMemberKeyModel` row exists for the Leader at the new
  epoch, (b) the removed member's old-epoch row is actually gone (not just marked), (c)
  attempting the SAME removal again as the removed member themselves against another
  member is rejected (they're no longer a member at all — 403/404). Separately: as a
  service-level Admin who was never invited to this org, call the role-change endpoint
  and confirm it succeeds (the override clause).

### [x] 5. End-to-end verification pass
- Do: Full `curl` walkthrough against a locally-running `Server.Web.Public` with a real
  `auth.shatteredarchive.dev` hub bearer token (per the existing Phase E verification
  topology, `.ai-plans/20260727-1243-auth-rollout-phaseC-csharp-user-content-dashboard.md`):
  create official org as service Admin → assign Leader → Leader invites Moderator →
  Moderator accepts → Moderator attempts to remove Leader (rejected, upward) → Leader
  removes Moderator (rotation fires, confirmed per Step 4) → service Admin (uninvolved
  account) queries and modifies the org anyway (override clause confirmed).
- Files: none (verification only — record the actual commands run in the Progress log
  below, not a separate file)
- Verify: every step above returns the expected status code; no step is checked off
  without having actually run the corresponding `curl` command against a live server.

## Progress log

- 2026-08-07T15:00:00-0500 plan created
- 2026-08-07T15:20:00-0500 step 1 done: extracted `TierLadder.cs` (generic ordered-ladder
  + strictly-below `CanManage`/`AtLeast`/`AssignableTiers`), refactored `ServiceTiers.cs`
  to forward to a `TierLadder` instance (all existing call sites unchanged — same public
  method signatures), added `OrganizationTiers.cs` (Leader>Moderator>Member) as the
  second consumer. `ServiceRoleStore.cs`/`ServiceRolesController.cs` needed no edits —
  they only ever called `ServiceTiers`'s static methods, which still behave identically.
  `dotnet build Server.Web.Public` clean, 0 errors (10 pre-existing unrelated warnings).
  Sanity-checked by inspection (no test project exists in this repo — verification here
  follows this plan's curl-based convention, not unit tests):
  `OrganizationTiers.CanManage(Moderator, Moderator)` → false (equal rank),
  `CanManage(Leader, Moderator)` → true (0 < 1) — both correct.
- 2026-08-07T15:35:00-0500 step 2 done: added `AccountCryptoKeyModel.cs`,
  `OrganizationModel.cs`, `OrganizationMemberModel.cs`, `OrganizationMemberKeyModel.cs`,
  `OrganizationInviteModel.cs` (all mirroring `UserBookModel`'s
  `{Key,SortKey,Timestamp,Payload}` shape), 5 new `Constants.TABLE_*` consts, and
  registered all 5 in `AppManager.cs`'s `DbTables` array. `dotnet build` clean, 0
  errors. Confirmed by reading `DBManager.Init`/`SqlClient.InstantiateDatabaseTables`
  that `DbTables` is the SOLE table-registration point (local SQLite backend, no second
  place to miss) — so unlike the standing `TABLE_USER_DIRECTIONS` cautionary example,
  nothing here can be silently half-registered. Did NOT boot the server to confirm the
  tables physically materialize — deferred to step 5's end-to-end pass, which boots the
  server anyway; verifying twice would be redundant.
- 2026-08-07T16:05:00-0500 step 3 done: added `AccountCryptoKeyService.cs` (lazy RSA-3072
  keypair provisioning, private key wrapped via the existing `LibraryContentCrypto`
  primitive; `WrapForAccount`/`UnwrapForAccount` do RSA-OAEP-SHA256 envelope wrap/unwrap
  of a raw org key). Concurrency note found and handled: `DBManager.SaveData(...,
  overwriteIfExists:false)` compiles to SQLite `INSERT ... WHERE NOT EXISTS` (confirmed
  by reading `SqlClient.SaveData`) — a losing concurrent first-provision is a SILENT
  no-op, so the service always re-fetches after writing rather than trusting its own
  locally-generated candidate. Also found `DBManager.QueryItems` (plural) throws
  `NotImplementedException` in this SQLite backend — switched every "list rows matching
  X" need to `ScanItems` + in-memory filter instead (same shape as the pre-existing
  `ScanTierRows`/`GetUserBooks` pattern), never `QueryItems`. Added
  `OrganizationController.cs`: `POST/GET library/organizations`,
  `GET library/organizations/{orgId}`, `POST .../invites` (Moderator+ or service-Admin
  override, resolves by accountId or username via `IUserService` — noted scope limit:
  only accounts that have logged into this site at least once are resolvable, no hub-wide
  search exists), `GET library/organizations/invites` (mine), `POST
  .../invites/accept|decline|block`. Registered `AccountCryptoKeyService` as a DI
  singleton in `Program.cs` (same rationale as `LibraryContentCrypto`/`ServiceRoleStore`).
  `dotnet build` clean, 0 errors (one real fix needed: `HttpContextExtensions.GetUser()`
  lives in namespace `Server.Core.Extensions`, not `Server.Web.Public.Extensions` as
  first guessed from the folder path — fixed the `using`). Not yet verified against a
  real hub bearer token — that requires a live login flow, deferred to step 5.
- 2026-08-07T16:20:00-0500 step 4 done: added `POST .../members/{accountId}/role`
  (double strictly-below check mirroring `ServiceRolesController.SetTier` — caller must
  outrank both the target's CURRENT role and the NEW role being assigned — plus the
  service-Admin override), `DELETE .../members/{accountId}` (same gate) and `DELETE
  .../members/me` (self-leave, no permission check). Both removal paths call
  `RemoveMemberAndRotate`: delete the member row, generate a fresh random 32-byte org
  key, wrap it for every remaining member (new epoch), then delete EVERY wrapped-key row
  for the OLD epoch — not just the removed member's. This is a deliberate widening from
  the original step text, reasoned through while implementing: leaving remaining
  members' stale old-epoch rows around after rotation serves no purpose once they all
  have new-epoch rows, and deleting them too is what actually delivers "old key
  unrecoverable from stored data alone," not a partial version of it. `dotnet build`
  clean, 0 errors. Not yet exercised against a live server — step 5.
- 2026-08-07T16:35:00-0500 step 5 PARTIAL — leaving the box unchecked, per this plan's
  own rule to never check off an unverified step. Found and fixed one real, pre-existing,
  unrelated bug that blocked ANY local Development-mode boot: `ServiceRoleStore` was
  registered `AddSingleton` while its constructor consumes the `AddScoped IUserService`
  — ASP.NET Core's Development-mode build-time DI validation rejects a singleton
  consuming a scoped service. Confirmed via `git diff` this predates both this session
  and last session's uncommitted work — not introduced by Organizations Phase 1. Fixed
  by registering `ServiceRoleStore` as `AddScoped` instead (it holds no instance state,
  every method reads `DBManager` statics fresh, so the lifetime change is behavior-
  preserving). After that fix: booted `Server.Web.Public` for real
  (`dotnet run --no-build --urls http://localhost:5087`) and confirmed via the live
  startup log that all 5 new tables are actually created (`Created table:
  'account_crypto_keys'/'organizations'/'organization_members'/
  'organization_member_keys'/'organization_invites'`) — this also closes the table-
  creation check step 2 deferred here. With the server live, ran real (not fabricated)
  `curl` probes: `GET /library/organizations` no-auth → 401, `POST
  /library/organizations` no-auth → 401, `GET /library/organizations` with a garbage
  bearer token → 401 (server log confirms it genuinely attempted introspection and
  correctly rejected), `GET /library/organizations/invites` no-auth → 401. This confirms
  `[AuthorizeApi]` is really wired on every new route.
  **What remains unverified**: the full authenticated walkthrough this step's Do/Verify
  text calls for (create org as service Admin → invite → accept → remove → rotation →
  override) needs a REAL hub bearer token, which needs a running local `auth-server`
  instance (`apps/auth-server` in the ShatteredArchive repo) plus a real test account —
  infrastructure not yet stood up in this session. This is the honest gap this phase is
  leaving open, same shape as the prior phase's "nobody has clicked through the UI yet"
  gap — the logic has been reasoned through carefully and the code compiles and boots,
  but the authenticated multi-account flow has not been physically exercised end to end.
- 2026-08-07T17:50:00-0500 step 5 COMPLETE — the gap above is now closed. Stood up a
  fully isolated local `apps/auth-server` instance (separate DATA_DIR, separate
  encryption key, launched from a scratch CWD specifically so its `dotenv.config({...,
  override:true})` couldn't find and load the real developer's `.env` — confirmed the
  real one exists with weeks of accumulated real account data at
  `apps/auth-server/data/`, and deliberately avoided touching it). Registered
  DSL/Server's real dev service key with it via `SERVICE_REGISTRY` +
  `AuthHub:PublicKeyPublishPath` (the existing auto-provisioning reconciler, no manual
  key copying). Wrote a Node orchestration script driving the REAL flow end to end for 4
  freshly-signed-up accounts: anti-bot challenge → signup → temp-password change → login
  → `/api/sso/approve` → DSL/Server's `/user/sso/callback` (real Ed25519 service
  assertion, real token exchange) → real `jwt-token` session cookie. `pnpm
  grant-tier`'d one account to hub-global "owner" (same isolated-env technique) to
  exercise the bootstrap-first-service-owner path for real.
  All 18 assertions passed against the live, running server (not simulated): official-org
  creation gated to service Admin+ and denied to a plain user; Leader-created org;
  Moderator (not just Leader) can invite; Member cannot invite (403); Moderator cannot
  remove Leader (403, upward-management correctly refused); Leader removes Member →
  204, triggers rotation; the removed member's session immediately loses read access
  (403 — real revocation, not simulated); a plain, never-invited account is denied
  (403 baseline); after being promoted to service Admin via the pre-existing
  `ServiceRolesController`, that SAME never-invited account gets both read (200,
  `viaServiceAdminOverride:true`) and write (successfully changes another member's role)
  access to an org it was never part of; `currentEpoch` correctly advanced 1→2 after the
  one rotation. Along the way found and worked around two real environment issues (both
  fixed procedurally, not by touching product code): the anti-bot `ChallengeThrottle`
  needed fresh per-IP token budget (restarted the isolated instance to reset its
  in-memory bucket); and bash's `kill $(cat pid-file)` was not actually killing the
  underlying Windows process for `dotnet run`/`tsx.CMD`-spawned processes (an orphaned
  process silently kept holding the port across several "restarts") — resolved by using
  `Get-NetTCPConnection`/`Stop-Process` via PowerShell to kill by the port's real owning
  PID instead. Both test server instances shut down cleanly afterward; no changes made to
  the real local `apps/auth-server/data/`.

**Phase 1: COMPLETE.** All 5 steps done and genuinely verified — no open gaps remain.
Per this plan's own instruction, `20260807-1501-organizations-phase2-content.md` should
now have its header flipped from `Status: PENDING (blocked on Phase 1)` to
`Status: ACTIVE`.

## Independent review sign-off (2026-08-07T18:00:00-0500)

Requested separately from implementation: two fresh-eyes Explore agents (not the
implementing context) audited the actual current code against 14 specific claims
(7 crypto/data-model, 7 permission-logic), each requiring file:line citation, not a
summary. This is the same discipline applied to the prior session's library-sync work.

**13 of 14 claims CONFIRMED as implemented**, all with file:line citations verified
against the live file contents (crypto derivation, wrap/unwrap symmetry, race-safe
provisioning, all 5 tables correctly registered in both `Constants.cs` and
`AppManager.DbTables`, strictly-below comparator behavior, rotation step ordering,
double-check on `ChangeRole`, `LeaveOrganization`'s intentionally-permission-free
self-action).

**1 real, serious finding — FIXED and re-verified live, not just patched and trusted:**

`SendInvite` checked only "is the caller a Moderator+" but never checked that the
caller's role actually **outranks the role being offered** — unlike `ChangeRole`, which
enforces exactly that as a double-check. Net effect: a Moderator could invite their own
account (or anyone) to Leader, accept, and their membership row would be overwritten to
Leader — a complete bypass of the permission ceiling `ChangeRole` was built to enforce.
This is the "off-by-one in a permission check" category of bug, not cosmetic.

Fix (`OrganizationController.cs`, `SendInvite`): added the same
`OrganizationTiers.CanManage(callerRole, request.Role)` ceiling check `ChangeRole`
already had (service-Admin override still applies), and separately rejected invites
targeting an account that's **already a member** (409 — re-roling an existing member
must go through `ChangeRole`, which checks the target's current role too; invite+accept
was never meant to be an alternate path for that). Removed the now-dead `CanActOnOrg`
helper its logic replaced.

Re-verified live end-to-end (not just re-built): full server pair stood up again from
a clean DSL/Server DB (the previous run's bootstrap-Owner account had persisted in the
local dev SQLite file, correctly making a fresh account ineligible to auto-bootstrap —
confirms the bootstrap-only-fires-once behavior is itself working as designed, not a
bug), plus 4 new checks targeting the exact exploit: Moderator self-invite-to-Leader →
403, Moderator invites a THIRD party to Leader → 403, Moderator invites within their
real ceiling (Member) → still 200 (fix didn't overcorrect), re-inviting an existing
member → 409. **All 22 checks passed** (18 original + 4 regression).

**Findings noted but NOT fixed (documented, accepted limitations, not blocking):**
- No transaction/lock around `RemoveMemberAndRotate`'s read-modify-write of
  `CurrentEpoch` — two concurrent removals against the SAME org could race. Pre-existing
  `SqlClient` has no locking primitive to build this on cleanly, and this codebase's
  existing patterns (`ServiceRoleStore.SetTier`, etc.) don't attempt it either. Real but
  low-probability at this app's scale; worth a follow-up if org admin activity ever gets
  concurrent enough to matter.
- No protection against the sole remaining Leader leaving/being removed, potentially
  leaving an org with members but no one below service-Admin able to promote a new
  Leader. Recoverable via the service-Admin override; not a security hole, just a
  functional rough edge.
- Corrupt-payload handling is inconsistent between `AccountCryptoKeyService`'s two code
  paths (one throws a typed exception, the other lets a raw `JsonException` escape).
  Cosmetic.
- No `[ApiController]` on `OrganizationController` (matches the pre-existing pattern in
  `ServiceRolesController`) — a malformed/empty request body 500s instead of 400ing.
  Not a regression this session introduced.
