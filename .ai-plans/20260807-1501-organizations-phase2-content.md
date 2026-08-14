# Plan: Organizations Phase 2 — encrypted org content, audit, revision history, client UIs

Created: 2026-08-07T15:01:00-0500 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Add org-owned encrypted library content (parchment/notes/books with a breadcrumb category path), an audit log, web-only revision history with revert, and Organizations tabs in the web dashboard, game-client Library modal, and mobile.

Unblocked 2026-08-07T17:55:00-0500: `20260807-1500-organizations-phase1-foundation.md`
reached `Status: COMPLETE` with all 5 steps genuinely verified end-to-end against live
local servers (real signup, real SSO login, real org creation/invite/accept/remove,
real key rotation with confirmed revocation, real service-admin override). Phase 1's
`OrganizationController.cs`/`OrganizationTiers`/`AccountCryptoKeyService` are real,
working code to build on — read Phase 1's final Progress log before starting Step 1
here for the exact auth-check helper shapes to reuse.

**Re-paused 2026-08-07T18:30:00-0500 after Step 1, re-unblocked 2026-08-07T21:20:00-0500.**
`20260807-1830-organizations-phase2b-characters-requests-bans.md` reached
`Status: COMPLETE` — all 7 steps done, live-verified, and independently reviewed clean
(two fresh-eyes agents hunting for a repeat of the Phase 1 privilege-escalation bug
class; neither found one). Org membership/role are now character-scoped
(`OrganizationMemberModel.Key="{orgId}#{characterId}"`), content is attributed to the
authoring character (`OrgParchmentModel` etc. carry `authorCharacterId`/
`authorCharacterName`, retrofitted into Step 1's controller), and the action surface
Step 2's audit log needs to cover now includes: character joined (invite-accept /
request-approve), character left/removed, account banned/unbanned, role changed,
join request submitted/approved/denied — design Step 2 against this real surface, not
the smaller account-scoped one this doc originally assumed.

## Goal

A Moderator+ in an org can create parchment/notes/books scoped to that org, filed under
a category path up to 5 segments deep (e.g. `["Storynotes"]` or `["Recruitment",
"Flyers"]`). Members can read it. All three client surfaces (web "My Writings"-style
dashboard, game-client Library modal, mobile) show an Organizations tab with the same
breadcrumb tree. Moderators+ can see who created/edited/deleted what (audit) and, from
the web dashboard only, browse and revert past revisions of any item. Reached when the
cross-client verification in Step 7 passes.

## Constraints

- Revision browsing/revert is **web-dashboard only** — do not add it to game-client or
  mobile, per explicit user requirement.
- Org content is encrypted via Phase 1's epoch-keyed org key
  (`OrganizationMemberKeyModel` → unwrap → AES-256-GCM), not a new scheme. If Phase 1
  changed shape before this doc starts, re-read
  `20260807-1500-organizations-phase1-foundation.md`'s Progress log first.
- `CategoryPath` max 5 segments — validate server-side, don't rely on client UI to
  enforce it.
- Audit log is a DB table (this app's existing convention), not a JSONL file — that
  pattern belongs to MUD Builder/Node and should not be copied here.
- Web dashboard follows this MVC app's existing convention: Razor view + vanilla-JS
  `fetch()` file, no SPA framework (`wwwroot/js/library/my-writings.js` is the model to
  follow, not React).
- Game-client and mobile changes are additive UI only — no client-side crypto changes,
  decryption stays entirely server-side as it already is for personal writings.

## Context

- Personal-writings sibling tables/endpoints to mirror the shape of (not extend
  directly — org content needs `Epoch`/`CategoryPath` fields personal writings don't
  have): `/workspace/dsl/Server/Server.Datastore/Models/UserBookModel.cs` (row shape),
  `/workspace/dsl/Server/Server.Web.Public/Controllers/LibraryController.cs` (validator
  pattern — `TryValidateParchment`/`TryValidateUserNote`/`TryValidateAuthoredBook`, caps
  enforced only on new ids, DELETE always 204 regardless of prior existence).
- Phase 1 provides: `OrganizationRoleStore` (Leader/Moderator/Member, generalized
  `CanManage`), `OrganizationMemberKeyModel` (per-epoch wrapped org key per member),
  `AccountCryptoKeyService.GetOrProvisionKeypair`. Read Phase 1's final
  `OrganizationController.cs` before starting Step 1 here — reuse its auth-check helpers
  rather than re-deriving them.
- Game-client Library tab structure to extend:
  `/workspace/shattered-archive/apps/game-client/src/components/LibraryModal.tsx` —
  `TabId` enum (`:27`), tab bar JSX (`:988-1027`), existing two-level grouping
  (`groupByTag`/`tagKey`, `:118-147`, and its two-level use for notes —
  spool-then-tag, `:954-969` — this is the closest existing precedent for an N-level
  breadcrumb tree, extend the pattern rather than inventing a new one).
  `library-types.ts` (`:8-46` export-bundle shape — a generic multi-type wrapper,
  extending it with a 4th optional array fits directly), `library-store.ts` (IndexedDB,
  `DB_VERSION` bump needed for a new object store).
- Mobile parity target: `/workspace/shatteredarchive-mobile/dsl-client/features/book-editor/`
  (types + storage) and `components/book-editor/` (screens) — mirror whatever shape
  Step 5 (game-client) lands on, per this repo's established "port the pattern, no
  shared package across these repos" precedent (`docs/features/book-editor.md`'s Cloud
  Sync section documents the same precedent for the personal-writings sync).

## Steps

### [x] 1. Org content tables + endpoints
- Do: `OrgParchmentModel`/`OrgNoteModel`/`OrgAuthoredBookModel`
  (`Key="{orgId}#{itemId}"`, `SortKey=orgId`, plus `Epoch: int` and
  `CategoryPath: string[]` — validate ≤5 non-empty segments, each ≤60 chars, mirroring
  the tag-length cap already used for personal writings). Register in `AppManager.cs`'s
  `DbTables`. CRUD under `library/organizations/{orgId}/content/{parchment,notes,books}`:
  write requires Moderator+ (via Phase 1's `CanManage`/`AtLeast` OR service Admin+
  override), read requires Member+. Encrypt/decrypt via: caller's current-epoch
  `OrganizationMemberKeyModel` row → unwrap with caller's private key → raw org key →
  AES-256-GCM (same compress-then-encrypt order as `LibraryContentCrypto`).
- Files: `/workspace/dsl/Server/Server.Datastore/Models/OrgParchmentModel.cs`,
  `OrgNoteModel.cs`, `OrgAuthoredBookModel.cs` (new);
  `/workspace/dsl/Server/Server.Web.Public/Controllers/OrganizationContentController.cs` (new)
- Verify: `curl` as a Moderator: create an item with a 3-segment `CategoryPath`,
  confirm a 6-segment path is rejected; confirm a Member (non-Moderator) gets 403 on
  write but 200 on read; confirm a non-member gets 403 on read.

### [x] 2. Audit log
- Do: New DB table, one row per mutating org action (content create/edit/delete,
  member add/remove/role-change, invite sent/accepted/declined/blocked): `OrgId`,
  `ActorAccountId`, `Action`, `TargetId`, `Timestamp`. Write it from inside the same
  request handlers that perform each action (Phase 1's `OrganizationController` and this
  doc's Step 1 content controller both gain a call). `GET
  library/organizations/{orgId}/audit`, Moderator+ only.
- Files: `/workspace/dsl/Server/Server.Datastore/Models/OrganizationAuditLogModel.cs`
  (new); touches `OrganizationController.cs` and
  `OrganizationContentController.cs` from Step 1.
- Verify: perform one of each action type via `curl`, then `GET .../audit` as
  Moderator+ and confirm every action appears with the correct actor; confirm a plain
  Member gets 403 on the audit endpoint.

### [x] 3. Revision history + revert
- Do: Append-only snapshot table keyed by `(orgId, itemId, revisionNumber)`, written on
  every content mutation from Step 1 (full encrypted payload snapshot + `EditedBy` +
  `EditedAt` + `Action`). Cap at 50/item, prune oldest beyond cap on write. `GET
  library/organizations/{orgId}/content/{itemId}/revisions` and `POST
  .../revisions/{n}/revert` (writes the old snapshot forward as a NEW current revision —
  never destructively rewrites history). Both Moderator+ only, and — per the explicit
  requirement — only ever called from the web dashboard (Step 4), not exposed in any
  client UI.
- Files: `/workspace/dsl/Server/Server.Datastore/Models/OrganizationContentRevisionModel.cs`
  (new); touches `OrganizationContentController.cs`
- Verify: edit an item 3 times via `curl`, `GET .../revisions` shows 3 entries in order,
  revert to revision 1, confirm the live item now matches revision 1's content AND a
  NEW revision 4 was appended (history itself unchanged).

### [x] 4. Web dashboard
- Do: New Razor view + vanilla-JS file following the `my-writings.js` convention: org
  selector, breadcrumb category-path browser, member management panel (invite send,
  role change, remove — respecting the same permission gates the API already enforces,
  UI just reflects them), invite accept/decline/block UI (wherever the existing account
  dashboard page lives — locate it first, this doc doesn't yet know its exact path),
  audit log viewer, revision history browser + revert button.
- Files: `/workspace/dsl/Server/Server.Web.Public/Views/Library/Organizations.cshtml` (new),
  `/workspace/dsl/Server/Server.Web.Public/wwwroot/js/library/organizations.js` (new),
  `/workspace/dsl/Server/Server.Web.Public/Controllers/LibraryController.cs` (new
  `Organizations()` GET action, mirroring `BookEditor()`'s pattern)
- Verify: load the page logged in, create an org, invite a second real test account,
  log in as that account, confirm the invite appears and can be accepted, confirm the
  new member appears in the roster.

### [x] 5. Game-client Organizations tab
- Do: Add `'organizations'` to `LibraryModal.tsx`'s `TabId` enum, a tab button, and a
  breadcrumb-tree sidebar keyed by `CategoryPath` (extend the existing
  `groupByTag`/spool-then-tag two-level pattern to N levels — same visual idiom,
  `.treeGroup`/`.treeGroupHeader`/`.treeSubGroupHeader` classes already exist). New
  `features/library/org-content.ts` (API client) and `org-content-types.ts`. Create/
  edit/delete gated client-side by the caller's role (fetched on org load), server
  enforces regardless. No revision/audit UI.
- Files: `apps/game-client/src/components/LibraryModal.tsx`,
  `apps/game-client/src/features/library/library-types.ts`,
  `apps/game-client/src/features/library/library-store.ts` (if any local caching is
  added — confirm during implementation whether org content needs IndexedDB caching at
  all, or can be fetched live given it's shared/multi-writer data)
- Verify: `npm run dev` in `apps/game-client`; log in, open Library → Organizations tab,
  confirm content created via the web dashboard (Step 4) appears in the correct
  breadcrumb position.

### [x] 6. Mobile Organizations tab
- Do: Port Step 5's tab concept into `dsl-client`'s book-editor screens, matching
  whatever concrete shape Step 5 landed on (component structure, API client shape).
- Files: `dsl-client/features/book-editor/` (new org-content files), relevant
  `components/book-editor/` screen(s)
- Verify: Expo dev build against the local server (per `site-api.ts`'s documented
  override — `app.json`'s `extra.siteApi` pointed at the dev machine), log in, confirm
  the same org content from Steps 4/5 is visible and correctly nested.

### [x] 7. Cross-client verification
- Do: Full walkthrough — service Admin creates an official org (web) → invites a Leader
  (web, accepts from their own dashboard) → Leader invites a Moderator (web) → Moderator
  creates a 3-level-categorized item from game-client → confirm it's visible on web and
  mobile in the same breadcrumb position → Leader removes the Moderator (web) → confirm
  (direct API call with the removed account's old token) they can no longer read that
  org's content → Leader reverts a revision from the web dashboard → confirm game-client
  and mobile both show the reverted content on next load.
- Files: none (verification only)
- Verify: every leg above behaves as described; record the actual commands/steps run in
  the Progress log, not a separate file.

## Progress log

- 2026-08-07T15:01:00-0500 plan created (blocked on Phase 1 — do not activate until
  `20260807-1500-organizations-phase1-foundation.md` is `Status: COMPLETE`)
- 2026-08-07T18:15:00-0500 step 1 done. Added `OrgParchmentModel`/`OrgNoteModel`/
  `OrgAuthoredBookModel` (3 new tables, registered in `Constants.cs` + `AppManager.DbTables`)
  and `OrganizationContentController.cs` (`library/organizations/{orgId}/content/
  {parchment,notes,books}[/{id}]`, GET/PUT/DELETE, `CategoryPath` validated ≤5 segments
  ×≤60 chars, same body/page-count caps as personal writings). Read = any current org
  role (Member+); write = Moderator+; both also accept the service-Admin override.

  Two pieces of prerequisite work found necessary while implementing, done before the
  controller itself:
  1. **Refactored `LibraryContentCrypto`** (extract-method, same pattern as the
     `ServiceTiers`→`TierLadder` refactor in Phase 1): pulled the gzip-then-AES-256-GCM
     envelope logic out into static `EncryptWithKey(byte[], string)`/
     `DecryptWithKey(byte[], string)`, with the existing per-account `Encrypt`/`Decrypt`
     now thin wrappers that derive the key first and delegate. Org content reuses the
     exact same reviewed crypto with a raw org key instead of an account-derived one —
     no duplicate implementation.
  2. **Retrofitted Phase 1's `RemoveMemberAndRotate`** — this was NOT optional. Content
     didn't exist yet when Phase 1's rotation was written, so it only ever rewrapped the
     KEY. Now that org content is real, a rotation that doesn't also re-encrypt existing
     content would make every parchment/note/book in the org permanently unreadable the
     moment the old key's last wrapped copy is deleted. Added
     `OrganizationKeyUtil.ReencryptAllContent`, called with the OLD raw key (obtained
     from a remaining member's about-to-be-deleted old-epoch row) BEFORE
     `DeleteEpochKeyRows` runs. Also extracted `OrganizationController`'s private
     `GetOrgRawKey`/`KeyEpoch`/`KeyAccountId` into the same new shared
     `OrganizationKeyUtil` class (both controllers now need "get this org's raw key"
     logic; kept in one place rather than risking the two copies drifting the way
     `SendInvite`/`ChangeRole` drifted).
  3. **Service-Admin override made to actually work for content, not just metadata.**
     `GetOrganization`'s override only bypasses an application-layer permission check —
     it doesn't hand the admin a decryption key. For content, added
     `OrganizationKeyUtil.ResolveCallerContentKey`: if the caller has no wrapped-key row,
     but IS a service Admin, lazily wrap-and-persist a real key row for them (not an
     `OrganizationMemberModel` row — this doesn't make them a member) so they can
     actually decrypt, not just pass a 200-vs-403 check. Without this the override would
     have been cosmetic for content specifically.

  `dotnet build` clean, 0 errors both after the refactor and after the new controller
  (two real compile errors hit and fixed along the way: missing `Server.Core.Extensions`
  using — same mistake as Phase 1, should have remembered; and a stray
  `LibraryContent.LibraryContentCrypto` namespace-qualification typo).

  Verified live end-to-end (clean DB, full signup→SSO→org flow, 30 checks total, 0
  failures) — new checks specific to this step: Moderator creates parchment with a
  3-segment category path (200); 6-segment path rejected (400); Member can read but not
  write org content (200 / 403); non-member denied (403 baseline); **the content created
  before a member-removal rotation is still correctly readable afterward** (the
  re-encryption fix, confirmed working, not just compiling); service-Admin who was never
  a member gets a real, working read AND write path via lazy key provisioning, not a
  hollow permission bypass.
- 2026-08-08T01:10:00-0500 step 2 done. Designed against the REAL current action
  surface (per the re-unblocked note above), not the smaller one this doc originally
  assumed: `OrganizationAuditLogModel` (`Key`=fresh GUID per entry, `SortKey`=orgId) +
  a shared `Services/OrganizationAuditLog.cs` (`OrganizationAuditActions` constants,
  `Record`/`List` static helpers) called from both controllers, so the two can't drift
  the way earlier shared logic once did. 13 call sites in `OrganizationController.cs`
  (org creation, role change, member leave/removal, invite sent/accepted/declined/
  blocked, join request submitted/approved/denied, account-role grant/revoke, ban/
  unban) and 2 in `OrganizationContentController.cs` (content create-or-edit,
  content delete). Category create/delete deliberately NOT logged here — they're
  service-Admin-level label management, not scoped to any one org, and don't fit this
  per-org log's shape. Every entry carries a human-readable actor/target label
  (character name, or account username for a service-Admin/account-grant override),
  snapshotted at write time so a later character rename or deletion never corrupts old
  entries. New `GET {orgId}/audit` endpoint, gated identically to `ListBans`
  (Moderator+/Leader/service-Admin only, via the existing `IsModeratorOrAdmin` check —
  no new permission logic). `dotnet build` clean, 0 errors.

  Verified live end-to-end: extended `orgtest3.mjs` with 6 new checks (43-44) on top
  of the existing 68 (now 74 total, all passing before this addition) — a plain
  outsider (Moderator of an unrelated org, no role in the target one) gets 403 on
  `GET .../audit`; the Leader of Nordmaar, an org that by this point in the test run
  had accumulated an org creation, a join request submitted/approved, an account
  banned/unbanned, an account-level grant granted/revoked, and a content item created,
  sees every one of those actions in the log with the correct actor label (confirmed
  the ban entry is attributed to "Thalindra" and carries its reason, the org-creation
  entry is attributed to "Thalindra" too); confirmed newest-first ordering. Final
  count: 81/81 checks passed, 0 failures, on a freshly-wiped DB.

  Two environment gotchas hit during this step's verification (neither a product bug,
  both noted for next time): the isolated auth-server's per-IP challenge rate limiter
  (5-token bucket, 1 token/2min refill) got exhausted partway through a run and had to
  be waited out — discovered that simply RESTARTING the isolated auth-server process
  resets its in-memory bucket instantly, which is much faster than waiting for a
  passive refill, but restarting it does NOT reset the DSL server's sqlite DB, so the
  one-time bootstrap-owner window stays consumed — the DB must still be wiped
  separately whenever a truly clean run is needed. Also: an unrelated background
  process died silently mid-wait once (auth-server exited with no crash trace in its
  log), causing an ECONNREFUSED — restarting it and re-running fixed it; not
  reproduced a second time, treated as a one-off, not investigated further.

  Independent (single-agent) review, scoped to this step specifically rather than the
  full dual-agent phase-boundary review (reserved for when Phase 2 as a whole nears
  completion): found two real issues, both fixed and re-verified.
  1. **Information leakage (Medium):** the audit log resolved and stored the TARGET
     account's real `Username` (`InviteSent`, `AccountRoleGranted`/`Revoked`,
     `AccountBanned`/`Unbanned`) even though every sibling endpoint at the identical
     Moderator+ gate (`ListBans`, `ListAccountRoles`, and the actions' own JSON
     responses) deliberately returns `accountId` only, never a username — a real,
     repeated convention across three existing endpoints, not incidental. A
     lower-trust Moderator could read the audit log and learn real usernames they
     couldn't get any other way. Fixed by using `targetAccountId` as the `TargetLabel`
     for all five of those call sites, matching the established boundary. (`ActorLabel`
     was NOT touched — a service-Admin/account-grant actor's own username in
     attribution text is an already-reviewed, accepted Phase 1/2b/2c pattern, a
     different case from exposing a THIRD party's identity.)
  2. **Integrity (Low):** `OrganizationContentController.DeleteItem` logged
     `ContentDeleted` unconditionally, so a `DELETE` on an already-deleted or
     never-existing id (harmless no-op, still returns 204) polluted the trail with an
     entry for a mutation that didn't happen. Fixed by checking existence via
     `QueryItem` before the delete and only recording when something was actually
     removed.
  `dotnet build` clean, 0 errors after both fixes; re-ran the full suite (81 checks)
  clean, 0 failures, on a freshly-wiped DB.
- 2026-08-08T13:30:00-0500 step 3 done. `OrganizationContentRevisionModel` (new,
  `Key="{orgId}#{contentType}#{itemId}#{revisionNumber}"`,
  `SortKey="{orgId}#{contentType}#{itemId}"`) + `OrganizationContentRevisionPayload`.

  **Deliberate deviation from this doc's own endpoint path**: the plan wrote `GET
  library/organizations/{orgId}/content/{itemId}/revisions` (no content-type segment),
  but `PutItem`/`DeleteItem` are ALREADY per-type-routed (`content/parchment/{id}`,
  `content/notes/{id}`, `content/books/{id}`) with no cross-table id-uniqueness
  guarantee — a parchment and a note could legitimately share an id. Routed revisions
  the same per-type way instead (`content/{parchment,notes,books}/{id}/revisions[/{n}/
  revert]`) to avoid a real ambiguity the literal plan path would have introduced, and
  gave the revision table's Key/SortKey a `contentType` segment for the same reason.

  `PutItem`/`DeleteItem` both gained a `contentType` parameter (6 call sites updated).
  `PutItem` now calls a new `WriteRevision(...)` after every successful save
  (Created/Edited), capped at `MaxRevisionsPerItem = 50` with oldest pruned on write.
  `DeleteItem`, when the delete was real (not a no-op), now also purges every revision
  row for that item — a later PUT reusing the same id starts a genuinely new item's
  history, rather than inheriting a deleted predecessor's revisions. New
  `GetRevisions<T>`/`RevertRevision<T>`, gated by the same `HasWriteAccess` check
  writes already use (Moderator+ character, account-level grant, or service Admin —
  NOT a plain Member, unlike ordinary content reads). Revert re-validates the restored
  body against TODAY's validator (a revision written under a since-tightened rule
  doesn't get a free pass), re-stamps authorship to whoever is reverting (a new edit
  action, not literal time travel), writes the restored content as the live item, logs
  a new `ContentReverted` audit action, and appends a NEW revision via the same
  `WriteRevision` path — never rewrites existing history rows.

  **Rotation-awareness was NOT optional**, same lesson as Phase 2 Step 1's original
  `ReencryptAllContent` work: revision rows are NOT bare ciphertext like the three live
  content tables (`OrganizationContentRevisionModel`'s Payload is plaintext JSON
  wrapping ONE encrypted `encryptedContent` sub-field, so revision metadata is readable
  without decrypting first) — the existing `ReencryptTable<T>` couldn't be reused
  as-is. Added a dedicated `OrganizationKeyUtil.ReencryptRevisions`, called from
  `ReencryptAllContent` alongside the three existing calls, which re-encrypts just the
  `encryptedContent` sub-field per row. Without this, EVERY org key rotation (a routine
  event — any member removal, ban, or account-grant revoke can trigger one) would have
  silently made all pre-rotation revision history permanently undecryptable.

  `dotnet build` clean, 0 errors. Verified live end-to-end: extended `orgtest3.mjs`
  with 12 new checks (45-56) — create+edit×2 a fresh item (revisions 1/2/3 in
  ascending order with correct per-revision content), a non-member gets 403 on the
  history endpoint, revert to revision 1 appends revision 4 without touching 1-3,
  the live item matches revision 1's content post-revert, **a real key rotation
  (triggered via an account-role grant+revoke) leaves all 4 revisions still correctly
  decryptable afterward** (the ReencryptRevisions fix, confirmed working, not just
  compiling), and deleting the item purges its revision history. Final count: 101/101
  checks passed, 0 failures, on a freshly-wiped DB.

  Independent review, two parallel Explore agents this time (closing out the
  audit+revision "backend arc" before Step 4's UI work) — one on the permission/
  revert-bypass surface, one on the crypto/rotation/concurrency surface. The
  permissions reviewer found no bypass (revert correctly reuses `HasWriteAccess`,
  re-validates before saving, and every contentType/T pairing across all 12 routes is
  internally consistent) but flagged a real Low-Medium gap: `RevertRevision` never
  confirmed the live item still existed, so a revision row surviving a hypothetical
  partial-failure delete (`SqlClient`'s delete logs-and-swallows failures rather than
  throwing) could let a Moderator silently "resurrect" a deleted item via revert,
  bypassing `PutItem`'s per-org item cap. Fixed by requiring the live item to exist
  before a revert proceeds — revert restores an existing item's content, it is not an
  undelete. The crypto reviewer independently ruled out three hypothesized issues
  (the `SortKey.StartsWith` scoping is safe because org ids are fixed-length GUIDs
  with no shared prefixes possible; partial-rotation decrypt failures already skip
  one row and continue, matching `ReencryptTable`'s own established behavior, not a
  new regression; pruning logic itself was correct) but caught one real Medium/High
  finding: `WriteRevision`'s scan-then-write had no concurrency protection at all, so
  two near-simultaneous writes to the same item (two Moderators editing at once, or an
  edit racing a revert) could compute the identical "next" revision number and the
  second write would silently overwrite (destroy) the first's snapshot via
  `overwriteIfExists: true` — a real, not merely theoretical, violation of
  "append-only" given multiple Moderators can plausibly write to the same org
  concurrently. Fixed using the same idiom this codebase already relies on elsewhere
  for exactly this race (`AccountCryptoKeyService`'s lazy keypair provisioning):
  write with `overwriteIfExists: false`, re-fetch to confirm OUR row actually landed,
  retry against a fresh scan on collision (bounded at 5 attempts) instead of trusting
  a stale candidate number.

  Added regression check 56 (revert-after-delete is now correctly refused) targeting
  the resurrection-gap fix; re-ran the full suite (102 checks) clean, 0 failures, on a
  freshly-wiped DB, confirming both fixes didn't regress anything already verified.
  Phase 2 is now 3/7 steps complete — Step 4 (web dashboard) is next, and is the first
  step where a human should actually click through the UI in a browser before calling
  it done, per this repo's own established standard for UI work.
- 2026-08-08T16:00:00-0500 step 4 done. First client UI for ANY of this feature
  (Phases 1-2 Step 3 were entirely API-only until now). `LibraryController.Organizations()`
  (`[HttpGet("org-dashboard")]`, mirrors `BookEditor()`'s thin-shell-for-anonymous
  pattern exactly) + `OrganizationsViewModel` (one `IsAuthenticated` bool, everything
  else fetched client-side) + `Views/Library/Organizations.cshtml` (new) +
  `wwwroot/js/library/organizations.js` (new, ~830 lines, single `Orgs` object,
  vanilla JS, `credentials:"same-origin"` fetches, no framework — same house style as
  `my-writings.js`) + one `_nav.cshtml` link. Covers the full current backend surface,
  not just this step's original narrower "Do" bullet (written before Phase 2b/2c
  existed): org create + category create, member roster with role-change/remove,
  invite send + accept/decline/block, join-request submit + approve/deny, ban/unban,
  account-level grant/revoke, shared content (parchment/notes/books, folder paths, the
  note-spool field) with revision history browse + revert, and the audit log — every
  panel gated Moderator+/Leader in the UI matching (but never substituting for) the
  server's own enforcement.

  **Route collision caught immediately by smoke-testing, not by chance**: the natural
  route `library/organizations` was ALREADY claimed by `OrganizationController`'s own
  `[Route("library/organizations")]` (including a wildcard `{orgId}` segment), and
  colliding with it doesn't 404 — it throws `AmbiguousMatchException` at request time.
  Caught via `curl`, fixed by moving the page to `library/org-dashboard`.

  **`ListMyOrganizations` (`OrganizationController.cs`) needed a real backend fix, not
  just a UI**: it only ever returned orgs where the caller had a CHARACTER membership
  row — an org where an account holds ONLY an account-level administrative grant
  (Phase 2c's whole reason for existing) was invisible in "my organizations," which
  would have made that entire already-shipped, already-tested feature unreachable from
  this new dashboard. Fixed by also scanning `OrganizationAccountRoleModel` for the
  caller and merging both sequences; added a live regression check (32b) confirming an
  account-role-only org now appears with `viaAccountRole:true` and no `characterId`.

  **No browser tool is available in this environment.** Verification used the
  strongest substitute available: `dotnet build` clean; `node --check` for JS syntax;
  a mechanical diff confirming every `document.getElementById(...)` call in the JS has
  a matching `id=` in the CSHTML (zero mismatches); a self-written script driving a
  REAL signup → SSO login → authenticated page fetch, confirming 200 + no exception
  markers + all expected DOM present, for both anonymous and authenticated sessions;
  and — for the actual end-to-end workflow the plan's own Verify bullet describes
  (create org → invite a second account → that account accepts → appears in the
  roster) — a script that replays the EXACT HTTP requests the dashboard JS's own
  functions construct (same URL, method, body shape, field casing) rather than a
  hand-rolled equivalent, confirming the full loop succeeds. This is real evidence the
  wiring works, but it is not the same as a human clicking through the rendered page,
  and that gap is stated here plainly rather than glossed over — same honesty standard
  as `docs/features/library-sync.md`'s own disclosed gap for My Writings.

  Independent review (one Explore agent, full-file reads of both controllers plus the
  JS, tracing every API call against the actual backend signature) found one CRITICAL
  bug that static reasoning alone would very plausibly have missed: `SendInvite` is
  the ONE moderation endpoint in `OrganizationController.cs` that does NOT take the
  acting character via `?asCharacter=` (every other endpoint does) — it reads
  `AsCharacterId` from the JSON body instead. The JS's `sendInvite()` used the
  otherwise-universal `withActing()` query-string helper, so the acting character was
  silently dropped, and `ResolveCallerRole` fell through to null every time →
  **every character-acting Leader's first "Send Invite" click would have 403'd**,
  which is close to the single most common first action a new user would take. Fixed
  by sending `AsCharacterId` in the body instead; re-verified live (not just
  re-reasoned about) by replaying the corrected request shape end to end, including
  the recipient accepting and appearing in the roster — see above.

  Two more real (non-blocking) bugs from the same review, both fixed: (1) an account
  holding both a character AND an account-level grant in the same org showed up
  TWICE in "My Organizations" with no way to tell they were the same org — fixed by
  grouping the dashboard's rendering by org id, merging both standings into one line;
  (2) switching "Acting as" mid-tab left stale, no-longer-applicable Moderator
  controls (Remove buttons, role dropdowns) visible on the already-open tab until the
  user navigated away and back — fixed by re-running the active tab's loader on every
  acting-as change, not just refreshing the Overview panel. Also cleaned up: a
  confirmed-dead helper function, a confirmed-unused CSS rule, and a silent no-op
  (clicking "Leave" while "Acting as" is set to administrative capacity now explains
  why nothing happened instead of doing nothing silently). One LOW/forward-looking
  item was explicitly left as-is per the reviewer's own assessment: the Content tab's
  "Books" type always saves a flat body with no `pages` array — valid per the
  backend's own validator (pages is optional), and nothing else in the repo consumes
  `OrgAuthoredBookModel` yet, so this isn't a shipping blocker, just noted for when a
  real page-structured book UI is warranted.

  Phase 2 is now 4/7 steps complete. Steps 5-6 (game-client and mobile Organizations
  tabs) are next — porting this same feature surface into two different client
  codebases; Step 7 (cross-client verification) closes out the phase.

- 2026-08-08T20:15:00-0500 Step 4 gained real browser-driven verification, closing
  the "no browser tool" gap noted when Step 4 was first marked done above. Built a
  standalone, sandboxed Playwright driver at `Shattered-AI/tools/browser-test/`
  (deliberately outside this repo and `DSL/Server` — own dependency tree, not built
  from either shipped service; hard allowlist restricting navigation to
  `localhost`/`127.0.0.1` and `*.shatteredarchive.com`/`*.shatteredarchive.dev`
  https-only, so it can never be pointed at an arbitrary host; full design in
  `Shattered-AI/doc/browser-testing.md`). Relaunched the isolated auth-server (62000)
  + DSL-server (5099) pair and drove the actual rendered `/library/org-dashboard`
  page through a real headless Chromium: create org → send invite (as one real
  browser session) → accept invite (as a second real browser session, cookies seeded
  from a real signup+SSO login) → confirm the Members tab reflects both — full pass,
  screenshotted at each step.

  Caught one real bug live that request-replay testing had missed: the "Invites &
  Requests For You" table rendered the raw `orgId` GUID instead of the org's name
  (`organizations.js:445`), so a recipient had no way to tell which group was
  inviting them without decoding an opaque ID — confirmed visually in a screenshot
  before fixing. Root cause was server-side, not just a client oversight:
  `OrganizationInvitePayload` never carried a name and `ListMyInvites` returned the
  stored payload as-is. Fixed by resolving each row's org name in `ListMyInvites`
  (`OrganizationController.cs`) via the existing `LoadOrganization` helper and
  projecting an `orgName` field onto the response, then updating
  `organizations.js`'s `renderMyInvitesAndRequests` to display it (falling back to
  the raw id only if resolution somehow comes back empty). Rebuilt, relaunched, and
  re-ran the same real-browser flow end to end to confirm — the invites table now
  shows "Playwright Test Group ###" instead of a GUID, screenshot re-captured.

  This is now the standing verification method for future client-facing steps in
  this phase (and beyond) — real rendering and real clicks, not just HTTP replay.

- 2026-08-08T21:00:00-0500 User spotted a real visual defect from the showcase
  screenshot itself: every `.org-table` header row (Invites, Members, Requests, Bans,
  Account Roles, Content revisions, Audit) rendered as a near-white bar with
  low-contrast gray text instead of matching the card's dark theme — `.org-table th`
  had a text color but no `background-color`, so it fell through to the site's
  ambient light table-header styling. Fixed with one rule change in
  `Organizations.cshtml` (dark `#181818` background, brightened `#9aa4b8` text),
  which covers all 7 tables on the page since they share the one class. Also learned
  mid-fix: this app's `.cshtml` views are precompiled into the DLL (not
  runtime-recompiled even in Development), so a CSHTML-only change still needs a full
  `dotnet build` + relaunch before it's actually served — confirmed via `curl` before
  re-screenshotting. Re-verified with the same real-browser flow; showcase screenshot
  re-captured showing dark, readable headers throughout.

- 2026-08-08T22:30:00-0500 step 5 done (Claude) — game-client Organizations tab.
  Researched `LibraryModal.tsx` (1700+ lines) via a foreground Explore agent before
  writing anything: confirmed `groupByTag` is a single flat-level grouper (not
  recursive — Notes' "two levels" are actually two independently-composed flat
  groupings, not real tree nesting), confirmed game-client has ZERO existing
  "hub-account character" concept (grep for character/characterId/GET /characters
  across the whole app returned nothing relevant), and confirmed `cloudSync.ts`'s
  Bearer-token `authedRequest` pattern (not `librarySync.ts`'s IndexedDB-diff
  orchestration) is the right template — org content is multi-writer shared data
  with a rotating per-org key, so a local cache would just be a staleness-bug
  generator, not a feature (reasoned through explicitly, not assumed).

  **Verified the backend contract by reading the actual C# before designing
  against it, not from memory**: confirmed `HubAuthMiddleware` is a single
  app-wide middleware accepting EITHER a cookie OR an `Authorization: Bearer`
  header for every controller uniformly (`ExtractToken`, `HubAuthMiddleware.cs`
  lines 92-100) — so `OrganizationController`/`OrganizationContentController`/
  `CharacterController` all work from game-client's bearer-only client with zero
  backend changes needed, nothing assumed. Also confirmed org content items have
  NO server-guaranteed `createdAt`/`updatedAt` (the content controller stores
  whatever JSON the client sends, stamping only `id`/`authorCharacterId`/
  `authorCharacterName` itself) and `title` is genuinely optional — both would
  have been wrong guesses if typed from the web dashboard's shape alone.

  New files: `features/library/org-content-types.ts` (wire types, an N-level
  `buildCategoryTree`/`sortedChildren`/`sortedItems` set for the up-to-5-level
  `categoryPath` folder tree — `groupByTag` doesn't generalize to real nesting, so
  this is new, not reused), `features/library/org-content.ts` (thin
  `authedRequest`-shaped API client mirroring `cloudSync.ts`; deliberately has NO
  `listCharacters`/`createCharacter` — org membership is web-dashboard-only per
  scope, and every org's detail already carries `myCharacterMemberships`, so
  there's nothing here that needs a standalone character list).

  **Deliberately extracted into a new `components/OrganizationsPane.tsx`** rather
  than threading a 6th `tab === 'x'` branch through `LibraryModal.tsx`'s already
  dense save/delete/new/dirty-guard chains (the research agent flagged this
  explicitly as worth deciding, not defaulting into) — given its own top-level
  `{tab === 'organizations' && <OrganizationsPane />}` slot alongside
  colors/scratch, imports `LibraryModal.module.scss` directly rather than forking
  a new module (matches this codebase's own existing precedent —
  `CompassBlockMobile`/`MiscPane`/`PluginsPage` all import a sibling component's
  module the same way), with ~10 new small classes appended to that file
  (`.orgTopBar`, `.orgTreeGroupHeader` with inline `paddingLeft` computed from
  depth rather than 5 near-duplicate per-depth classes, `.orgStatus`/
  `.orgStatusErr`, etc.). Org/acting-as pickers reuse the existing
  `.scribeGrid`/`.scribeField`/`.scribeSelect` primitives verbatim. Content is
  fetched live on every org/content-type switch — no IndexedDB, no
  `library-store.ts` counterpart, per the reasoning above. Books use a flat body
  like parchment/notes (no page-array UI), matching the same simplification Step
  4's web dashboard already made for `OrgAuthoredBookModel`.

  `pnpm typecheck`: clean, zero errors. ESLint on the 4 touched/new files: 0
  errors, 12 warnings — 6 pre-existing (unrelated `any`/effect warnings already in
  `LibraryModal.tsx` before this change) and 6 new `react-hooks/set-state-in-effect`
  warnings in `OrganizationsPane.tsx`, all matching the SAME pattern already used
  throughout this file's pre-existing hydration effects (e.g. the Parchment/Notes
  draft-hydration effect at the file's own line ~376) — consistent with, not a
  deviation from, established convention; not refactored away.

  **Live-verified in an actual rendered browser, not just typecheck/lint** — this
  took real problem-solving, logged here since it's a reusable technique: rather
  than replicate the full game-sso popup OAuth-style hand-off (a second registered
  redirect URI + state-cookie dance) just to get a token, reused the already-proven
  web SSO login (real signup, real challenge/answers, real `/api/sso/approve`) to
  obtain a real `jwt-token` cookie value, then injected that SAME value into
  game-client's `localStorage` as a bearer token before load — valid because
  `HubAuthMiddleware.ExtractToken` resolves a token string identically regardless
  of whether it arrived via cookie or `Authorization` header (confirmed by reading
  the middleware first, not assumed). Started `pnpm dev` for game-client with
  `VITE_SITE_API` pointed at the isolated DSL server, drove the ACTUAL React app
  in headless Chromium: opened the real menu (`Game` → `Library (Notes & Books)…`
  — a plain `<div>`, not a `<button>`, discovered by reading `MainMenuBar.tsx`
  after an initial `getByRole('button', ...)` guess timed out), clicked into the
  Organizations tab, confirmed a real API-created org and a seeded 2-level-nested
  parchment item (`Recruitment → Flyers → "Seeded Flyer"`) rendered correctly with
  its real body loaded into the editor, then **wrote a brand-new item through
  actual browser clicks** (not a fetch replay) and confirmed via a direct,
  independent API re-fetch that the saved item matched exactly what was typed,
  including `categoryPath` and `authorCharacterId` attribution. One real selector
  bug caught mid-run: a bare `"textarea"` Playwright selector was silently
  grabbing an unrelated always-mounted textarea elsewhere on the page (behind the
  modal overlay) instead of this pane's — fixed by scoping to the actual CSS
  Module class substring (`textarea[class*="textArea"]`). Showcase screenshot at
  `Shattered-AI/tools/browser-test/output/showcase/organizations/game-client-tab.png`.

  Phase 2 is now 5/7 steps complete. Step 6 (mobile Organizations tab, porting
  this exact shape into `dsl-client`) is next, then Step 7 (cross-client
  verification) closes out the phase.

- 2026-08-08T23:45:00-0500 step 6 done (Claude) — mobile (`shatteredarchive-mobile`
  / `dsl-client`) Organizations screen. Researched via a foreground Explore agent
  first, same discipline as step 5 — this caught a real trap early:
  `components/book-editor/EditorSidebar.tsx` exists on disk and LOOKS like the
  sidebar component to model, but is confirmed DEAD CODE (never imported outside
  itself); the actual sidebar is reimplemented inline in `BookEditorScreen.tsx`.
  Also confirmed: `groupByTag` here is the SAME flat single-level grouper as
  game-client's (not a coincidence — game-client's version is a documented port
  FROM this one), no `categoryPath`/multi-level tree precedent exists, no
  character/organization concept exists anywhere in this app (fresh ground, same
  as web), and — the one design fork from step 5 — this app's `cloud-sync.ts` is a
  manual, bulk, upsert-only "Save/Load to cloud" model built for single-owner
  personal content, explicitly wrong for multi-writer role-gated org content (its
  own doc comment explains why a delete-reconciliation pass is unsafe there); a
  new live-fetch `organizations-api.ts` reuses its `authedRequest`/
  `CloudSyncResult<T>` SHAPE without adopting the batching model around it.

  New files: `features/organizations/organizations-types.ts` (near-verbatim port
  of game-client's org-content-types.ts — pure TS, no DOM dependency, ported
  as-is rather than re-derived), `features/organizations/organizations-api.ts`
  (Bearer-token client, SecureStore/AsyncStorage-backed token via
  `auth-token-storage.ts`), `components/organizations/OrganizationsScreen.tsx`
  (the screen — reuses `EditorArea`/`EditorFooter` UNCHANGED, since both are
  already content-agnostic; layout follows `BookEditorScreen.tsx`'s own
  main/sidebar/sidebarRail/editorPanel two-pane idiom rather than porting
  game-client's CSS split, since RN has no equivalent and this codebase already
  has its own established pattern to match instead), `app/(tabs)/organizations.tsx`
  (thin Expo Router wrapper, matching `library.tsx`'s exact one-line idiom). Wired
  as a hidden route reached via the "More" sheet (`_layout.tsx`) alongside
  Directions/Reference/Settings, not a 7th visible tab — matches this app's own
  existing convention for lower-frequency screens.

  `npx tsc --noEmit`: exactly the pre-existing 7-error baseline (`AnsiLine.tsx`,
  `Collapsible.tsx`, `ExternalLink.tsx`, `IconSymbol.tsx`,
  `chat-settings-storage.ts`, `telnet-socket.ts` — confirmed against this repo's
  known baseline), zero new errors in any of the 4 new/touched files.

  **Live-verified via `expo start --web` + the same real-browser tool**, not just
  typecheck — this needed two real fixes, both logged since they're reusable
  findings: (1) mobile has no dev proxy like game-client's Vite `/api/site`
  rewrite, so `organizations-api.ts`'s calls to the isolated DSL server were
  genuine cross-origin requests and failed with a browser-level "Failed to fetch"
  until `Cors:AllowedOrigins` (env-var-overridden for the isolated instance only,
  `Cors__AllowedOrigins__3`) included the Expo web dev origin — a real config gap
  this surfaced, not a code bug; (2) confirmed `@react-native-async-storage/
  async-storage`'s web build is a direct `window.localStorage` passthrough (read
  the actual installed package source, not assumed) under the SAME key
  (`auth.token`), so the same signup+SSO-cookie-to-bearer-token injection trick
  used for game-client worked here unmodified. `app.json` was temporarily edited
  to add `extra.siteApi` pointing at the isolated server for this test and
  reverted immediately after (confirmed via `git diff` showing no changes) — a
  committed localhost override would have pointed production builds at a dev
  server. Drove the real screen: org chip + acting-as chip + role badge populate
  correctly from a real API-created org, Notes tab shows a real seeded item
  (`Announcements → "Seeded Mobile Note"`) with its actual body loaded into the
  reused `EditorArea`. Showcase screenshot at
  `Shattered-AI/tools/browser-test/output/showcase/organizations/mobile-web-tab.png`.

  Phase 2 is now 6/7 steps complete. Step 7 (cross-client verification) closes
  out the phase.

- 2026-08-09T00:15:00-0500 step 7 done (Claude) — Status: COMPLETE, all 7 steps.
  Executed the plan's own walkthrough almost verbatim, with one deliberate,
  logged adaptation: used a self-service "friend" category org rather than an
  admin-gated "official" one — bootstrapping a real service-Admin account in the
  isolated test environment is orthogonal to what this step actually probes
  (cross-client content visibility, access-removal enforcement, revision-revert
  propagation), none of which differ by category. One real script, driving all
  four running dev surfaces (isolated auth-server, isolated DSL server,
  game-client on Vite, mobile on `expo start --web`) together: Leader creates org
  → invites Moderator (web-shaped request) → Moderator accepts → **Moderator
  creates a 3-level-categorized item through an actual game-client browser
  session** (not an API call) → confirmed visible with the correct breadcrumb on
  both the web dashboard AND mobile → Leader removes Moderator → Moderator's OLD
  session immediately gets 403 reading that org's content (key rotation
  enforcing the cutoff, not just a permission flag) → Leader reverts a revision
  from the web dashboard → confirmed the revert is visible on BOTH game-client
  and mobile on their next load. Every leg backed by a real, independent
  server-side re-fetch, not just a UI screenshot.

  **This walkthrough caught two real, previously-invisible bugs** — invisible
  precisely because Steps 4-6 each verified their own client in isolation and
  never checked what a game-client-authored item actually looked like once it
  crossed to a DIFFERENT client:

  1. The web dashboard's content list (`organizations.js` `renderContentList`)
     was flat and title-only (`li.textContent = item.title`) — it never showed
     `categoryPath` at all, unlike game-client/mobile which both build a real
     folder tree from that same field. An item game-client filed 3 folders deep
     showed up on the web dashboard with zero indication of where. Fixed with a
     sort-by-path + breadcrumb-prefix render (`"Level1 › Level2 › Level3:
     <title>"`) — a deliberately minimal fix (not a full collapsible tree
     rewrite) that achieves the actual parity goal without new UI surface.
  2. Reverting a revision from the web dashboard updated the item list and the
     revisions panel, but never refreshed the open editor's own title/category/
     body fields — a Moderator would see the pre-revert draft sitting there with
     no visible sign the revert did anything, until navigating away and back.
     Fixed by populating the editor fields directly from the just-reverted
     revision object (the same data the pre-existing "View" button already uses)
     right after a successful revert.

  Both fixes are pure client-side JS (`wwwroot/js/library/organizations.js`,
  served directly, no rebuild needed) — re-verified live after each fix by
  re-running the same script from a fresh org, not just re-reasoning about it.

  **Organizations Phase 2 is now fully COMPLETE — all 7 steps, live-verified
  end to end across all three real clients (web, game-client, mobile), with
  independent review findings fixed at every step along the way.**
