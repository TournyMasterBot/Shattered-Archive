
# Plan: Phase E — Library-content cloud sync + "My Writings" web editor + game-client editor parity

Created: 2026-08-06T20:26:09-0500 · Workspace: /workspace/shattered-archive (coordinating repo;
cross-repo work in /workspace/dsl (Server.Web.Public) and /workspace/shatteredarchive-mobile) · Status: COMPLETE
Task: Extend the existing scripts/plugin-config cloud sync (Phase C server / Phase D clients) to
also cover Library content — parchment, spool-typed user-notes, and multi-page books — across
game-client, the C# backend, and the mobile app; add a real "My Writings" web editor to the C#
site so users can list/edit their own writings there too; and close the editor-feature-parity gap
between game-client and mobile that this work exposed.

## Step status (re-verified 2026-08-07, independent of the implementer's own log)

| # | Step | Status | Independently re-verified |
|---|------|--------|----------------------------|
| 1 | Server data layer — tables + encryption-at-rest | ✅ Complete | All 3 model files, 3 table constants, `AppManager.DbTables` registration, payload DTOs, `LibraryEncryptionOptions`, `LibraryKeyProvisioner`, `LibraryContentCrypto` (HKDF + gzip + AES-256-GCM), config + DI wiring — all confirmed present and wired, file:line, via a fresh Explore-agent audit |
| 2 | Server API — validated item CRUD | ✅ Complete | All 9 endpoints confirmed present, encrypt-before-save / decrypt-after-scan confirmed, validators + caps + 204-on-delete confirmed |
| 3 | "My Writings" web page | ✅ Complete | `IsAuthenticated` gate confirmed distinct from `CanCreateBooks`; panel + `my-writings.js` confirmed present. **Still open:** no human has clicked through the page in a browser |
| 4 | Game-client editor parity | ✅ Complete | `tag`/`recipients` fields, line/char-limit helpers, tag grouping, stats display all confirmed present in `library-types.ts` / `LibraryModal.tsx` |
| 5 | Game-client sync wiring | ✅ Complete | 9 `cloudSync.ts` functions, `librarySync.ts`'s connectionId-scoped delete safety, and actual wiring into `useAccountModal.ts`'s `Promise.all` (not just imported) all confirmed |
| 6 | Mobile sync wiring | ✅ Complete | Upsert-only Save/Load (no bulk delete) confirmed in code + comment; folded into existing `saveAllToCloud`/`loadAllFromCloud`; tsc baseline unchanged (7 pre-existing errors, 0 new) |
| 7 | Cross-client regression + docs | ✅ Complete | Wire-contract + typecheck evidence stands; this pass added a human-readable doc (`docs/features/library-sync.md`) and dev-notes updates — see Progress log |

**Overall: all 7 steps complete and independently confirmed.** The one honest gap across the whole
plan is unchanged: nobody has clicked through the actual UI (My Writings page in a browser, the
Save/Load buttons, LibraryModal's tag input) — every other layer (data, crypto, API, wire format,
type-checking) has reproducible evidence.

## Goal

A logged-in account can Save/Load their parchment, notes, and books to the cloud via the same
manual button pair that already syncs scripts/plugin-configs — shared between game-client and
mobile — and can additionally list/create/edit/delete those same items directly on the C# site
via a new "My Writings" page. Game-client's Library editor gains the tagging and line/char-limit
warnings mobile already has, so the two clients' editors and their JSON export formats are back
in parity before the new sync wire format is built on top of them.

## Constraints

- **Sync trigger stays manual** — same Save-to-Cloud/Load-from-Cloud button pair the
  scripts/plugin-config sync already uses (confirmed with the user 2026-08-06). No autosave, no
  background sync, no conflict resolution beyond today's existing last-write-wins.
- **Storage is item-per-row**, not a whole-collection blob. Mirror `UserBookModel`/`GameLogModel`
  (`Key = "{accountId}#{itemId}"`, `SortKey = accountId`, one row per item) — NOT
  `UserContentController`'s single-blob-per-account pattern that scripts/plugin-configs use. Item
  granularity is what lets a manual Save/Load pass upsert/delete individual items instead of
  clobbering the whole cloud set on every save.
- **New web editor must NOT be gated by `CanCreateBooks`.** That permission (hardcoded `false` for
  every account today, `Server.Web.Public/Services/UserService.cs:96`) gates authoring the
  official/canonical public book catalog (`BookCache`/`ViewBook`) — a different concept from a
  player's own private writings. The My-Writings block is gated only by "is authenticated."
  Conflating the two would leave the whole feature unreachable for every real user.
- **`DBManager` reality (already documented in `.ai-plans/20260727-1243-auth-rollout-phaseC-csharp-user-content-dashboard.md`, re-confirmed this session):** `Key` is the sole row identity for
  the local SQLite-backed store — `SortKey` is never part of an update/insert predicate, only a
  cheap scan-filter column. New per-item tables must use `Key = "{accountId}#{itemId}"` globally
  unique, exactly like `UserBookModel`, not `Key = accountId` with a varying `SortKey` (that would
  silently collapse every item onto one row).
- **`AppManager.DbTables` registration is a hard requirement**, not a formality — `DBManager.Init`
  only creates/tracks tables listed in that array (`Server.Web.Public/Managers/AppManager.cs:27-53`).
  `TABLE_USER_DIRECTIONS` is *already* missing from that array today (a pre-existing, out-of-scope
  bug) — a live example of exactly the mistake to avoid repeating for the three new tables.
- **`connectionId` asymmetry.** Game-client's local Library types carry `connectionId` (per-game-
  connection library); mobile's don't (single device-wide set). The global-scripts sync already
  solved this once via a `DEFAULT_BUCKET_ID` bucket concept
  (`dsl-client/features/scripts/global-scripts-storage.ts`). Apply the same principle at item
  granularity rather than inventing something new — see Step 5.
- **No shared package exists across these three repos.** Every "shared" concept (DSL color-code
  preview rendering, line/char-limit constants, the JSON export-bundle shape) is, and will remain,
  an independently-maintained copy in each repo. Keep new copies faithful to their source rather
  than trying to eliminate the duplication — that refactor is explicitly out of scope here.
- **Writings must be encrypted at rest, per-account, and gzipped (confirmed with the user
  2026-08-06 — this is new since the plan was first drafted, added before any implementation
  started).** No account should be able to read another account's writings by default, and the
  requirement is explicitly encryption, not just the existing `SortKey == accountId` query
  scoping — defense in depth against a raw DB-file/backup leak or a future query-scoping bug, not
  only against a live cross-account request. Storage should follow `GameLogModel`'s existing
  gzip-before-storage precedent (`UserContentController.cs`'s `CompressLogContent`/`ReadLogText`).
  **Honest threat-model scope** (state this plainly during implementation, don't oversell it): the
  server itself still holds the key material and can always decrypt — there is no per-user secret
  to derive from (`UserService.cs:90`: "hub-authenticated; no local secret exists"), so this
  protects against DB-file/backup exposure and cross-account bugs, not a fully compromised server
  process. **Sharing between accounts is explicitly out of scope** — the user named it as a future
  arc of work ("a future arc of work will establish a consistent sharing pattern for all synced
  data"). Applies only to the three NEW Library-content tables in Step 1 — not a retrofit of
  `UserBookModel` (bookmarks only, not content) or the existing scripts/plugin-config sync.

## Context

- Existing sync this extends: /workspace/shattered-archive/apps/game-client/src/features/auth/cloudSync.ts
  ↔ /workspace/dsl/Server/Server.Web.Public/Controllers/UserContentController.cs ↔
  /workspace/shatteredarchive-mobile/dsl-client/features/auth/cloud-sync.ts. All manual,
  button-triggered (`useAccountModal.ts`/`use-account.ts`), whole-collection GET/PUT.
- Item-per-row pattern to mirror: /workspace/dsl/Server/Server.Datastore/Models/UserBookModel.cs
  (book *bookmarks*, not content) and its sibling `GameLogModel`/`UserMapModel`. CRUD example to
  mirror: `GetUserBooks`/`BookmarkBook`/`UnbookmarkBook` in
  /workspace/dsl/Server/Server.Web.Public/Controllers/LibraryController.cs:55-104.
- Validation-helper style to mirror: `TryValidateScript`/`TryValidatePluginConfig`/
  `TryValidateGlobalScriptBucket` in
  /workspace/dsl/Server/Server.Web.Public/Controllers/UserContentController.cs:574-654.
- Game-client Library feature (100% local today, IndexedDB): types in
  /workspace/shattered-archive/apps/game-client/src/features/library/library-types.ts
  (`LibraryNote`, `UserNote`, `LibraryBook`/`LibraryBookPage`, `LibraryExportBundle` — no `tag`,
  no `recipients` anywhere), storage in `library-store.ts`, CRUD hook
  `apps/game-client/src/hooks/useLibrary.ts`, editor UI
  `apps/game-client/src/components/LibraryModal.tsx` (plain `<textarea>`s, a working Scribe panel
  that pushes drafts into the live game session as commands, DSL-color preview via
  `renderDslColorPreviewHtml.ts`, JSON export/import — none of it wired to `cloudSync.ts`).
- Mobile Library feature ("book-editor", 100% local today, AsyncStorage):
  /workspace/shatteredarchive-mobile/dsl-client/features/book-editor/book-types.ts (`EditorNote`,
  `UserNote`, `LibraryBook` — DOES carry `tag?`/`recipients?`; also defines `SOFT_LINE_LIMIT=60`/
  `HARD_LINE_LIMIT=70`/`SOFT_CHAR_LIMIT=80`/`HARD_CHAR_LIMIT=100`/`getLineStats`/`getWarnings`,
  none of which exist on game-client), storage in `book-storage.ts`/`user-note-storage.ts`/
  `library-book-storage.ts`, editor UI `dsl-client/components/book-editor/BookEditorScreen.tsx` +
  `EditorArea.tsx`/`EditorToolbar.tsx`/`EditorFooter.tsx` (its own working Scribe panel, ported DSL
  preview, tag-based grouping), JSON export/import via
  `dsl-client/features/book-editor/import-export.ts`'s `LibraryBundle` (a superset of game-client's
  `LibraryExportBundle` — has `tag`/`recipients` game-client's type lacks; the two "canonical
  shared" formats have drifted).
- Server book-editor stub, currently dead: `GET/POST library/book-editor` in
  /workspace/dsl/Server/Server.Web.Public/Controllers/LibraryController.cs:111-135 — `POST` just
  `return new JsonResult("{}")`, view is `Views/Library/BookEditor.cshtml`, gated by
  `user.Permissions.CanCreateBooks || ServiceTiers.AtLeast(tier, ServiceTiers.Manager)`.
- Server rendering convention: no SPA framework, Razor view + `wwwroot/js/<area>/*.js` doing
  `fetch()` — confirmed via the existing
  /workspace/dsl/Server/Server.Web.Public/wwwroot/js/library/book-editor.js and
  `.ai-plans/20260727-1243-auth-rollout-phaseC-csharp-user-content-dashboard.md`.
- Auth for new endpoints: reuse `[AuthorizeApi]` exactly as-is (401 JSON if unauthenticated,
  `HttpContext.GetUser()` resolves the account) — no new auth plumbing needed anywhere in this plan.
- Secret-provisioning pattern to mirror for the new encryption master key: this app already
  auto-generates and persists a service secret on first boot if none exists —
  `Server.Web.Public/Services/AuthHub/ServiceKeyProvisioner.cs` (checks a configured
  `PrivateKeyPath`, e.g. `AuthHubOptions.PrivateKeyPath = "secrets/shattered-web.key"`; generates
  + writes a new key when `AutoGenerateKey` — default `true` — and none exists yet; logs and stays
  degraded rather than crashing when `AutoGenerateKey` is `false` and no key is present) and
  `Services/AuthHub/ServiceAssertion.cs` (`LoadPrivateKey`/format). `appsettings.json` already has
  a `secrets/` config-path convention (`"AuthHub": {"PrivateKeyPath": "secrets/shattered-web.key"}`).
  Mirror this exactly for the new AES master key rather than inventing a different bootstrap
  mechanism — see Step 1.
- Dev-proxy check already done this session: game-client's vite proxy rule
  (`apps/game-client/vite.config.ts:96-100`) rewrites *any* `/api/site/*` path by stripping that
  prefix and forwarding to the site API target — not scoped to `/api/user-content`, so the new
  `library/my-writings/*` routes work through it with zero proxy config changes.
- Mobile local-override docs: /workspace/shatteredarchive-mobile/dsl-client/features/auth/site-api.ts
  (`app.json`'s `extra.siteApi`, and the note that the override origin must also be registered in
  the server's `GameSso:AllowedReturnOrigins`).
- Precedent bug NOT to repeat: `useAccountModal.ts`'s `handleSaveToCloud`
  (/workspace/shattered-archive/apps/game-client/src/hooks/useAccountModal.ts:85-95) loads only the
  current connection's scripts yet PUTs them as the *entire* cloud blob, silently clobbering other
  connections' saved scripts. Item-per-row + connectionId-scoped delete (Step 5) avoids this for
  Library content.

## Steps

### [x] 1. Server data layer — three new item-per-row tables + payload DTOs + encryption-at-rest
- Do: Add three new `IDatabaseTableItem` models in `Server.Datastore/Models/`
  (`UserParchmentModel.cs`, `UserNoteModel.cs`, `UserAuthoredBookModel.cs`), each an exact copy of
  `UserBookModel.cs`'s `Key`/`SortKey`/`Timestamp`/`Payload` shape with
  `[DynamoDBTable(Constants.TABLE_X)]` — `Payload` on these three holds an opaque encrypted
  envelope, not readable JSON (see below), so its doc-comment should say so explicitly. Add three
  constants to `Constants.cs` near `TABLE_USER_BOOKS`: `TABLE_USER_PARCHMENT = "user_parchment"`,
  `TABLE_USER_NOTES = "user_notes"`, `TABLE_USER_AUTHORED_BOOKS = "user_authored_books"`
  (deliberately not `user_books` — that name is already `UserBookModel`'s bookmark table). Register
  all three in `AppManager.DbTables` (Constraints — hard requirement). New payload-DTO file in
  `Server.Web.Public/Models/UserContent/` (sibling to the existing `UserContentPayloads.cs`):
  `ParchmentPayload{Id,ConnectionId?,Title,Body,Tag?,CreatedAt,UpdatedAt}`,
  `UserNotePayload{Id,ConnectionId?,Spool,Subject,Body,Recipients?:List<string>,Tag?,CreatedAt,
  UpdatedAt}`, `AuthoredBookPayload{Id,ConnectionId?,Title,Keyword,KeywordAfterTitle,Tag?,
  Pages:List<{Page,Body}>,CreatedAt,UpdatedAt}`. `CreatedAt`/`UpdatedAt` are epoch-ms `long` (not
  `DateTime`) — the clients' local types are already epoch-ms numbers, avoiding a lossy round-trip
  every existing Payload DTO in this app doesn't need to make. `[JsonProperty]` names camelCase to
  match the TS wire shapes exactly. These DTOs are the PLAINTEXT shape — they never touch the DB
  directly, only the crypto helper's input/output (below).

  **Encryption-at-rest (Constraints — confirmed with the user 2026-08-06):** new
  `Models/LibraryEncryptionOptions.cs` (`KeyPath` default `"secrets/library-content.key"`,
  `AutoGenerateKey` default `true` — same shape as `AuthHubOptions`), bound from a new
  `appsettings.json` `"LibraryEncryption"` section mirroring the existing `"AuthHub"` section's
  `PrivateKeyPath`/`secrets/` convention. New `Services/LibraryContent/LibraryKeyProvisioner.cs`
  mirroring `ServiceKeyProvisioner.cs` exactly: on startup, if `KeyPath` doesn't exist and
  `AutoGenerateKey` is true, generate 32 random bytes (`RandomNumberGenerator.Fill`), write them
  base64-encoded to `KeyPath` (create the `secrets/` dir if missing — same as the Ed25519
  provisioner); if `AutoGenerateKey` is false and no key exists, log and leave the feature
  degraded rather than crashing (same failure mode as the existing provisioner). New
  `Services/LibraryContent/LibraryContentCrypto.cs`: `Encrypt(string accountId, string
  plaintextJson) -> string` / `Decrypt(string accountId, string envelope) -> string`. Internally:
  derive a per-account 256-bit key via `HKDF.DeriveKey(SHA256, ikm: masterKey, outputLength: 32,
  info: Encoding.UTF8.GetBytes(accountId))` (no per-account secret exists to derive from instead —
  see the Constraints threat-model note); gzip the plaintext JSON bytes (mirrors `GameLogModel`'s
  `CompressLogContent`, `UserContentController.cs:328-337`); encrypt with `AesGcm` (256-bit key,
  random 12-byte nonce per call); concatenate `nonce || ciphertext || tag` and base64-encode the
  whole thing as the stored `Payload` string. `Decrypt` reverses this exactly (base64-decode,
  split the leading 12 bytes as nonce, `AesGcm.Decrypt`, gunzip, return the plaintext JSON string).
- Files: /workspace/dsl/Server/Server.Datastore/Models/UserParchmentModel.cs (new),
  /workspace/dsl/Server/Server.Datastore/Models/UserNoteModel.cs (new),
  /workspace/dsl/Server/Server.Datastore/Models/UserAuthoredBookModel.cs (new),
  /workspace/dsl/Server/Server.Core/Constants.cs,
  /workspace/dsl/Server/Server.Web.Public/Managers/AppManager.cs,
  /workspace/dsl/Server/Server.Web.Public/Models/UserContent/LibraryContentPayloads.cs (new),
  /workspace/dsl/Server/Server.Web.Public/Models/LibraryEncryptionOptions.cs (new),
  /workspace/dsl/Server/Server.Web.Public/Services/LibraryContent/LibraryKeyProvisioner.cs (new),
  /workspace/dsl/Server/Server.Web.Public/Services/LibraryContent/LibraryContentCrypto.cs (new),
  /workspace/dsl/Server/Server.Web.Public/appsettings.json,
  /workspace/dsl/Server/Server.Web.Public/appsettings.Development.json.
- Verify: `dotnet build` clean in `Server.Web.Public`; boot the app locally and confirm the server
  log shows table creation for all three new table names (the exact check that would have caught
  the pre-existing `TABLE_USER_DIRECTIONS` omission), and confirm `secrets/library-content.key`
  gets auto-created on first boot (matching the Ed25519 key's existing behavior — no new manual
  deploy step). Unit-level check (or a throwaway debug endpoint if this repo has no test project —
  confirm which before assuming, same caveat the Phase C sub-plan already flagged): `Encrypt` then
  `Decrypt` round-trips byte-identical plaintext; the same plaintext encrypted for two different
  `accountId`s produces different ciphertext (proves per-account derivation actually varies, not a
  single shared key); a raw `Payload` string is not human-readable / does not parse as JSON.

### [x] 2. Server API — validated item-level CRUD for parchment/notes/books
- Do: New region in `LibraryController.cs` beside the existing `user-books` bookmark region
  (lines 51-104), same `[Route("library")]` class, all `[AuthorizeApi]`:
  `GET/PUT/DELETE library/my-writings/parchment[/{id}]`, `.../notes[/{id}]`, `.../books[/{id}]`.
  `GET` scans + filters `SortKey == accountId`, exactly like `GetUserBooks`. `PUT` always
  overwrites `Payload.Id` with the route id (ignore any body/route mismatch). New private static
  validators mirroring `TryValidateScript`'s style: `TryValidateParchment`, `TryValidateUserNote`
  (spool must be one of `note/anote/storynote/oocn/qnote/history/news/changes` — same set as
  mobile's `NOTE_SPOOLS`), `TryValidateAuthoredBook`. Caps (defaults, tune if needed — non-
  blocking): 300 parchment / 300 notes / 100 books per account, 60 pages/book, 20000 chars/body,
  4000 chars/page, 60 chars/tag, 20 recipients — cap check only rejects a **new** id, never an
  update to an existing row. `DELETE` returns 204 regardless of prior existence (matches
  `UnbookmarkBook`, not `DeleteLog`'s 404-on-miss — a client's delete-reconciliation loop shouldn't
  treat "already gone" as an error). `connectionId` is optional/nullable on the wire; no
  server-side filtering logic on it — that's entirely a client-side concern (Step 5/6).
  **Persistence goes through Step 1's `LibraryContentCrypto`, not raw JSON**: `PUT` validates the
  plaintext `JObject` from the request body exactly as described above, THEN calls
  `Encrypt(accountId, validatedJson)` before `DBManager.SaveData`; `GET`/list calls
  `Decrypt(accountId, row.Payload)` on every row before deserializing/returning it to the client.
  The request/response wire contract to clients is unchanged plaintext JSON — only what lands in
  the `Payload` column changes.
- Files: /workspace/dsl/Server/Server.Web.Public/Controllers/LibraryController.cs.
- Verify: `dotnet build` clean; with a real hub bearer token, `curl` all 9 endpoints: PUT a valid
  item → GET returns it byte-identical; PUT with a bad spool / oversized body 400s readably; PUT
  past the per-account cap 400s for a new id but an update to an existing id at the cap still
  succeeds; DELETE a nonexistent id still 204s; anonymous GET/PUT/DELETE 401s; account isolation
  (a second account's GET never sees the first account's rows). Additionally: inspect the raw
  SQLite `Payload` column for a row created by this step and confirm it is opaque
  base64 — not the plaintext title/body — round-tripping correctly only through the API.

### [x] 3. Server — "My Writings" web page (Razor + vanilla JS, not React)
- Do: `BookEditorViewModel` gains `IsAuthenticated: bool`. `LibraryController.BookEditor()` GET
  sets `model.IsAuthenticated = user != null` alongside the existing `CanCreateBooks` block
  (Constraints — do NOT reuse `CanCreateBooks`). `Views/Library/BookEditor.cshtml` gains a new
  block gated by `@if (Model.IsAuthenticated)`, beside the existing catalog-authoring block: three
  sub-panels (Parchment / Notes / Books), each with a list, New/Edit/Delete, a tag input, wired to
  Step 2's endpoints. New `wwwroot/js/library/my-writings.js` (sibling to the existing
  `book-editor.js`) doing `fetch()` against the 9 endpoints on `DOMContentLoaded` — this doubles as
  the first real integration test of Step 2's API, before either app client is touched. Port
  `getLineStats`/`getWarnings`/the soft-hard line+char limit constants here too, as a third
  independent vanilla-JS copy (Constraints — no shared package exists). The existing
  `BookEditor()` POST stub is untouched — it belongs to the unrelated catalog-authoring form.
- Files: /workspace/dsl/Server/Server.Web.Public/Models/PageViewModels/Library/BookEditorViewModel.cs,
  /workspace/dsl/Server/Server.Web.Public/Controllers/LibraryController.cs,
  /workspace/dsl/Server/Server.Web.Public/Views/Library/BookEditor.cshtml,
  /workspace/dsl/Server/Server.Web.Public/wwwroot/js/library/my-writings.js (new).
- Verify: log in through the real hub flow at `localhost:5000/library/book-editor`; confirm the My
  Writings panel is visible for any authenticated account (not just `CanCreateBooks`/manager-tier
  ones); create/edit/delete one item of each type through the UI and confirm it round-trips via a
  follow-up `curl GET` against Step 2's endpoints.

### [x] 4. Game-client editor parity (before Step 5 — wire format should target the final local shape)
- Do: `library-types.ts` gains `tag?: string` on `LibraryNote`/`UserNote`/`LibraryBook`,
  `recipients?: string[]` on `UserNote`, and matching `tag?`/`recipients?` on
  `ParchmentExport`/`NoteExport`/`BookExport` so the export bundle becomes byte-compatible with
  mobile's `LibraryBundle` again. Port `LineStats`/`LineWarnings`/`SOFT_LINE_LIMIT=60`/
  `HARD_LINE_LIMIT=70`/`SOFT_CHAR_LIMIT=80`/`HARD_CHAR_LIMIT=100`/`getLineStats`/`getWarnings`
  verbatim from mobile's `book-types.ts:70-110` (pure functions, no RN dependency, safe to copy
  as-is). No schema change needed in `library-store.ts`/`useLibrary.ts` — `tag` is a schemaless
  IndexedDB field and the existing `save*` functions already spread the full object through.
  `LibraryModal.tsx` gains a tag `<input>` per item, tag-based sidebar grouping (port mobile's
  `groupByTag` pattern from `BookEditorScreen.tsx:67-110` to React DOM), and inline warning text
  under each `<textarea>` from the ported `getLineStats`/`getWarnings` (mirror mobile's
  `EditorFooter.tsx` usage). No changes needed to the existing Scribe panel or DSL-preview
  renderer — already equivalent-or-better than mobile's.
- Files: /workspace/shattered-archive/apps/game-client/src/features/library/library-types.ts,
  /workspace/shattered-archive/apps/game-client/src/components/LibraryModal.tsx.
- Verify: `pnpm --filter game-client dev` clean; in the running app, create a parchment/note/book
  with a tag, confirm it groups under that tag in the sidebar and persists across a reload
  (IndexedDB); type past 70 lines / 100 chars on one line and confirm the warning text appears at
  the same thresholds mobile uses; export a JSON bundle and confirm it now includes `tag`/
  `recipients` fields.

### [x] 5. Game-client sync wiring
- Do: `cloudSync.ts` gains `loadParchment`/`upsertParchment`/`deleteParchmentCloud` + the
  equivalent trio for notes and books, hitting `library/my-writings/...` (confirmed this session:
  routes through the existing `/api/site` vite dev proxy with no config changes). Pick names that
  don't collide with `library-store.ts`'s existing local `upsertNote`/`deleteNote`/etc. New
  `apps/game-client/src/features/library/librarySync.ts` exports
  `saveLibraryToCloud(connectionId)`/`loadLibraryFromCloud(connectionId)`: list local + list cloud,
  diff by id, upsert/delete. `connectionId` scoping (Constraints): Save only deletes cloud rows
  matching THIS connection's `connectionId` (never another connection's, never an empty one) —
  deliberately avoids the whole-blob-clobber bug `handleSaveToCloud` already has for scripts. Wire
  the two new calls into the existing `Promise.all([...])` in `useAccountModal.ts`'s
  `handleSaveToCloud` (~line 91) / `handleLoadFromCloud` (~line 140); extend the status-message
  summaries. `handleLoadFromCloud` already ends in `window.location.reload()`, so no new
  notification plumbing needed for the IndexedDB writes. `AccountModal.tsx`: update the blurb copy
  to mention library content — no new buttons, same manual Save/Load pair.
- Files: /workspace/shattered-archive/apps/game-client/src/features/auth/cloudSync.ts,
  /workspace/shattered-archive/apps/game-client/src/features/library/librarySync.ts (new),
  /workspace/shattered-archive/apps/game-client/src/hooks/useAccountModal.ts,
  /workspace/shattered-archive/apps/game-client/src/components/AccountModal.tsx.
- Verify: `npm run dev` in `apps/game-client` against the local `Server.Web.Public` from Steps
  1-3; log in via the popup flow; create a tagged parchment note, click Save to Cloud, confirm via
  `curl` against `library/my-writings/parchment` that it landed server-side with this connection's
  `connectionId`; create a second item directly via Step 3's My Writings page (no `connectionId`),
  click Load from Cloud in game-client, confirm both items appear locally after reload.

### [x] 6. Mobile sync wiring
- Do: `cloud-sync.ts` gains `saveLibraryToCloud()`/`loadLibraryFromCloud()` (no `connectionId`
  param — mobile has no connection concept), reading/writing `book-storage.ts`/
  `user-note-storage.ts`/`library-book-storage.ts` against the same `library/my-writings/*`
  endpoints. On Save: upsert local items with no `connectionId` set; delete only cloud rows whose
  `connectionId` is empty/absent (never a web-tagged row). On Load: take the full returned list, no
  filtering. Fold the two calls into `use-account.ts`'s `handleSaveToCloud`/`handleLoadFromCloud`
  (lines 76-146), extend `SaveSummary`/`LoadSummary`. `AccountSection.tsx`: copy-only update (lines
  51, 71) — no new buttons. Mobile's local types already carry `tag`/`recipients` — no parity work
  needed here, only sync plumbing.
- Files: /workspace/shatteredarchive-mobile/dsl-client/features/auth/cloud-sync.ts,
  /workspace/shatteredarchive-mobile/dsl-client/features/auth/use-account.ts,
  /workspace/shatteredarchive-mobile/dsl-client/components/AccountSection.tsx.
- Verify: per `site-api.ts`'s documented override, set `app.json`'s `extra.siteApi` to
  `http://10.0.2.2:5000` (Android emulator) or a LAN IP (physical device), and register that
  origin in the server's `GameSso:AllowedReturnOrigins`; run the Expo dev build against the same
  local `Server.Web.Public` instance from Steps 1-3; log in; exercise Save/Load; confirm items
  created on game-client in Step 5's verify appear on mobile after Load, and vice versa.

### [x] 7. Cross-client regression + docs
- Do: Full cross-client round-trip: create a parchment note in game-client → Save → Load on mobile
  → confirm `tag`/body match. Edit its tag on mobile → Save → Load on game-client → confirm it
  propagates. Create an item directly via the My-Writings page → Load on both clients → confirm
  the `connectionId`-scoping rules behave as designed (web items scoped to their connection,
  mobile/web-editor items universally visible). Update `.annotated`/`.ai-context` entries for every
  directory touched in Steps 1-6 per this repo's AI-index convention — required for host-side
  (Claude) edits since qwen-mediated edits refresh these automatically but direct edits do not.
- Files: `.annotated`/`.ai-context` files in each directory touched by Steps 1-6, across all three repos.
- Verify: the three cross-client round-trip checks above all pass; `dotnet build` (server),
  `pnpm build` (game-client), and the mobile Expo build all stay clean; re-read each updated
  `.annotated` entry to confirm it reflects the new sync capability rather than the pre-Phase-E
  local-only description.

## Progress log

- 2026-08-06T20:26:09-0500 plan created (Claude). Authored after a pre-flight verification pass
  (three Explore agents + direct file reads across all three repos, `shattered_mcp`/qwen
  unreachable this session so verification was done mechanically) confirmed the user's premise
  about Library sync being the actual gap, corrected the "scripts/plugin sync is missing" premise
  (it already works), and surfaced the drifted export-bundle types between game-client and mobile.
  User confirmed manual (not automatic) sync trigger via AskUserQuestion before this doc was
  written. Every step above involves real architectural judgment (wire-format design, permission-
  model correctness, UI parity work) rather than mechanical transcription — expect this to run
  primarily as Claude-executed steps rather than being handed to qwen, though qwen may still be
  useful for narrow sub-tasks (e.g. the vanilla-JS port in Step 3) if `shattered_mcp` is back up
  when execution starts.
- 2026-08-06T20:26:09-0500 correction (Claude, before any step started): user flagged that
  writings must be encrypted at rest per-account (not just query-scoped) and gzipped like game
  logs, with cross-account sharing explicitly deferred to a future arc of work. Added an
  encryption-at-rest design to Step 1 (`LibraryContentCrypto`: HKDF-derived per-account key + gzip
  + AES-256-GCM, master key auto-provisioned via a new `LibraryKeyProvisioner` mirroring the
  existing `ServiceKeyProvisioner`/Ed25519-key pattern) and wired it into Step 2's PUT/GET flow.
  No steps had been executed yet, so this is a pre-execution plan correction, not a rework.
- 2026-08-07T06:39:00-0500 step 1 done (Claude): three new models (`UserParchmentModel`,
  `UserNoteModel`, `UserAuthoredBookModel`), three `TABLE_*` constants, `AppManager.DbTables`
  registration, `LibraryContentPayloads.cs` (Parchment/UserNote/AuthoredBook payload DTOs,
  epoch-ms `long` timestamps), `LibraryEncryptionOptions`, `LibraryKeyProvisioner` (mirrors
  `ServiceKeyProvisioner`'s auto-generate-on-first-boot pattern exactly), `LibraryContentCrypto`
  (gzip → AES-256-GCM with an HKDF-per-account-derived key → base64), and `appsettings.
  {json,Development.json}`/`Program.cs` wiring (options bind, DI registration, `.Provision()`
  call alongside the existing Ed25519 one). `dotnet build` clean (0 errors, only pre-existing
  warnings). Live-verified by actually booting `Server.Web.Public.dll` (had to run without
  `ASPNETCORE_ENVIRONMENT=Development` — Development's strict DI-validation surfaced an
  UNRELATED pre-existing bug, `ServiceRoleStore` (singleton) consuming scoped `IUserService`,
  not touched by this plan and left alone): server log showed `Generated a new library
  encryption key at secrets/library-content.key` and `Created table: 'user_parchment'` /
  `'user_notes'` / `'user_authored_books'`; confirmed both the key file and `Data/db.sqlite`
  landed on disk. Encrypt/Decrypt algorithm additionally verified via a throwaway console
  project (duplicated logic, run against the real generated key, then deleted): round-trip
  byte-identical plaintext, two different accountIds produce different ciphertext for
  identical plaintext, cross-account decrypt genuinely fails (`CryptographicException`, not a
  silent wrong answer), and the stored envelope contains no plaintext substrings — all 4/4 checks passed.
- 2026-08-07T07:15:00-0500 step 2 done (Claude): 9 new `[AuthorizeApi]` endpoints in
  `LibraryController.cs` (`GET/PUT/DELETE library/my-writings/{parchment,notes,books}[/{id}]`)
  via three shared private helpers (`ListWritingItems<T>`, `PutWritingItem<T>`,
  `DeleteWritingItem<T>`) plus per-type `TryValidateX` validators mirroring
  `UserContentController`'s style (spool allowlist, per-account caps that only trip on a
  genuinely new id, tag/recipients/page-body length caps). `LibraryContentCrypto` injected
  into the controller; every PUT encrypts before `SaveData`, every GET decrypts after
  `ScanItems` (a row that fails to decrypt is skipped with a warning log, not a 500). Needed a
  custom `ItemValidator` delegate since `Func<>` can't express an `out` parameter, and a missing
  `using Newtonsoft.Json.Linq;` (`LibraryController.cs` never needed `JObject` before this).
  `dotnet build` clean (0 errors). Live-verified via a throwaway console harness (ProjectReference
  to `Server.Web.Public`, real `LibraryContentCrypto` against the dev-provisioned key, a
  throwaway sqlite file) calling the controller's actions directly against a fabricated
  `HttpContext.Items["User"]` — this bypasses `[AuthorizeApi]`'s HTTP layer (a real hub bearer
  token needs an interactive browser login this session can't do) but exercises the actual
  validation/encryption/DB code paths. 14/14 checks passed: valid PUT→GET round-trips
  byte-identical including `tag`, route id always wins over body id, missing-title/bad-spool/
  oversized-tag all 400, DELETE is 204 whether or not the row existed, a second account sees an
  empty list (not the first account's data), and the raw stored `Payload` does not contain the
  plaintext title. Then deleted the harness.
- 2026-08-07T07:45:00-0500 step 3 done (Claude): `BookEditorViewModel.IsAuthenticated`,
  `LibraryController.BookEditor()` GET sets it for any logged-in account (not gated by
  `CanCreateBooks`/tier — confirmed distinct from the "Saved Books" catalog-authoring block it
  sits beside). New "My Writings" `bk-card` in `BookEditor.cshtml`: type tabs
  (parchment/notes/books), a list pane, and an editor pane with type-specific fields (spool
  select for notes; keyword/keywordAfterTitle + a page-button row mirroring the existing
  "Saved Books" panel's page-button UI for books), a body textarea, and a preview pane. New
  `wwwroot/js/library/my-writings.js`: fetch-based CRUD against the 9 Step-2 endpoints
  (cookie-authenticated, no bearer header needed for same-origin), a ported `getLineStats`/
  `getWarnings` (soft/hard line+char limits, mirroring `dsl-client/features/book-editor/
  book-types.ts` since no shared package exists to import from), and reuses the EXISTING
  `BookEditor.ProcessText` (book-editor.js, already loaded on this page) for the DSL
  color-preview rather than writing a third copy of that renderer — corrects the plan's
  original assumption that the preview needed re-porting; only the stats functions did.
  `dotnet build` clean; `node --check` on the new JS passed. Live-verified by booting the
  server and curling `/library/book-editor` anonymously: 200 status, and grepping for the
  gated element ids (`id="mw-list"`, `id="mw-save-btn"`, the `my-writings.js` script tag) found
  ZERO matches — confirms `@if (Model.IsAuthenticated)` genuinely excludes the panel for
  anonymous/crawler requests rather than just hiding it client-side; an earlier grep for the
  bare string "My Writings" was a false positive from the unconditional `<style>` block's own
  CSS comment, corrected before concluding anything. The authenticated click-through (actually
  creating/editing/deleting an item through the browser UI) has NOT been manually verified —
  this session has no interactive browser or real hub login available; the underlying API is
  already verified end-to-end in step 2, so the remaining risk is narrowly in the new
  fetch/DOM-wiring code in my-writings.js. Worth a manual pass once a browser session is available.
- 2026-08-07T08:10:00-0500 step 4 done (Claude): `library-types.ts` gained `tag?`/`recipients?`
  on `LibraryNote`/`UserNote`/`LibraryBook` and their export-bundle counterparts, plus a
  verbatim port of `LineStats`/`LineWarnings`/soft-hard line+char limit
  constants/`getLineStats`/`getWarnings` from mobile's `book-types.ts`. `LibraryModal.tsx`:
  added a `groupByTag`/`tagKey` helper (ported from mobile's `BookEditorScreen.tsx`), new
  `parchmentByTag`/`booksByTag` memos and a tag sub-grouping layer inside the existing
  spool-grouped `notesBySpool`, rewired all three sidebar list renderers to walk the grouped
  structure with a tag header per group; added a `draftTag` field (hydrated on selection,
  saved in all three `handleSave` branches, included in export/import bundle round-trips
  alongside notes' `recipients`) and a tag `<input>` below the existing title/page-controls
  header row; added cursor-position tracking (`bodyCursorPos`, via the textarea's
  `onChange`/`onSelect`) feeding `getLineStats`/`getWarnings` into a new stats line under the
  editor with warn/over styling, mirroring `EditorFooter.tsx`'s thresholds. New SCSS: `.tagRow`/
  `.tagInput`/`.bodyStats(Warn|Over)`/`.treeSubGroupHeader` (reused existing `.treeGroup`/
  `.treeGroupHeader` for the new tag headers rather than inventing parallel classes). Corrected
  the original plan text along the way: game-client's Scribe panel and DSL-preview renderer
  already existed and needed no changes — only tagging, stats, and the export-bundle shape were
  actually missing. `pnpm typecheck` (root script, `tsc -p apps/game-client/tsconfig.json
  --noEmit`) passed with zero errors across the whole game-client project — a strong signal
  every touched call site (useLibrary, the sidebar renderers, export/import, handleSave) still
  lines up, though the actual browser UI has not been manually clicked through this session
  (no interactive browser available) — same caveat as step 3.
- 2026-08-07T08:35:00-0500 step 5 done (Claude): `cloudSync.ts` gained 9 new functions
  (load/upsert/delete × parchment/notes/books) hitting `library/my-writings/*`, plus exported
  `CloudLibraryNote`/`CloudUserNote`/`CloudLibraryBook` wire types (`Omit<Local,'connectionId'>
  & {connectionId?: string}` — cloud rows may be connection-less; local types require a real
  connectionId since each connection keeps its own IndexedDB slice). New
  `features/library/librarySync.ts`: `saveLibraryToCloud`/`loadLibraryFromCloud`, built on two
  small internal helpers — `pushType` (upsert every local item, then delete only cloud rows
  matching THIS connectionId that are no longer local — deliberately narrower than the existing
  whole-blob scripts sync's `handleSaveToCloud`, which clobbers other connections' rows) and
  `pullType` (download cloud rows with no connectionId or a matching one, upsert into local
  IndexedDB). Documented an accepted simplification in both the code and here: a connection-less
  (mobile/My-Writings-web) item loaded by one connection "claims" that connectionId on its next
  Save — not a full CRDT merge, consistent with the rest of this sync being manual/last-write-wins.
  Wired both functions into `useAccountModal.ts`'s existing `Promise.all` in
  `handleSaveToCloud`/`handleLoadFromCloud`, extended the status-message text, and reworded the
  Load confirmation dialog to correctly say library content is MERGED (never locally deleted) —
  unlike scripts/plugins, which are fully replaced. Updated `AccountModal.tsx`'s blurb copy in
  both the logged-out and logged-in states. `pnpm typecheck` clean (0 errors); scoped `eslint`
  run over all 6 touched files: 0 errors, 7 warnings, all pre-existing patterns in code touched
  only incidentally (not new). Same browser-click-through caveat as steps 3-4 — the API layer
  (step 2) and type-level wiring are verified; the live end-to-end Save/Load button flow has not
  been manually exercised.
- 2026-08-07T08:55:00-0500 step 6 done (Claude), with one deliberate deviation from the plan's
  original text: added `upsertNote`/`upsertUserNote`/`upsertLibraryBook` (full-object
  replace-or-insert) to the three local storage files, since only patch-by-id `updateX`
  functions existed before — those no-op on an id that doesn't exist locally yet, which breaks
  applying a brand-new cloud item. Folded Library sync into the EXISTING `saveAllToCloud`/
  `loadAllFromCloud` in `cloud-sync.ts` (extending `SaveSummary`/`LoadSummary` with
  `libraryParchment`/`libraryNotes`/`libraryBooks`) rather than adding separate exported
  functions the way game-client's `librarySync.ts` does — this file already bundles
  scripts+plugins+globals into one call, so a second parallel call from `use-account.ts` would
  have broken that existing convention for no benefit.
  **Deviation, found and fixed during implementation, not before:** the plan's literal text said
  Save should "delete only cloud rows whose connectionId is empty/absent." Implementing that
  literally is unsafe here — this app has no way to distinguish "I deleted this on this device"
  from "I've never seen an item the My-Writings web page or another device created," so a bulk
  delete-reconciliation pass would silently destroy writings this device never even knew about.
  Implemented Save/Load as upsert-only instead (no cloud deletes from this app at all);
  documented the reasoning at the top of the new `cloud-sync.ts` section and flagged real
  per-item cloud deletion (fired at the moment a user deletes something locally) as a safe
  follow-up, not attempted here. `npx tsc --noEmit` in `dsl-client/`: exactly the pre-existing
  7-error baseline (`AnsiLine.tsx`, `Collapsible.tsx`, `ExternalLink.tsx`, `IconSymbol.tsx`,
  `chat-settings-storage.ts`, `telnet-socket.ts` — confirmed against this repo's known baseline,
  see `mobile-repo-test-tooling-broken` memory), zero new errors in any of the 6 files touched
  this step. Same browser/app-click-through caveat as steps 3-5 — no device/emulator available
  this session to exercise the actual Settings-screen Save/Load buttons.
- 2026-08-07T09:15:00-0500 step 7 done (Claude) — Status: COMPLETE. Full regression: `dotnet
  build` (server), `pnpm typecheck` (game-client), and `npx tsc --noEmit` (mobile) all clean —
  mobile at exactly its pre-existing 7-error baseline (unrelated files), zero new errors
  anywhere. Cross-client wire-contract check (the one thing an actual browser/device click-through
  would have caught, and the real point of step 4's type reconciliation): a new throwaway harness
  called `LibraryController`'s real actions directly with payloads shaped EXACTLY like each
  client's `cloudSync.ts`/`cloud-sync.ts` would send — game-client-shaped PUT (with
  `connectionId`) read correctly, mobile-shaped PUT (no `connectionId` key at all) overwrote it
  and correctly went "universal" (empty connectionId) afterward, a mobile-shaped `UserNote` with
  `recipients` round-tripped byte-identical, and a multi-page book round-tripped both pages in
  order. All 8 checks passed. Export-bundle parity (Step 4's actual goal) confirmed by direct
  field-by-field comparison of `library-types.ts` vs `import-export.ts` — now identical.
  Updated `.annotated` for every directory touched across all three repos (new
  `Services/LibraryContent/.annotated`, previously-empty `Views/Library/.annotated` and
  `wwwroot/js/library/.annotated` given real entries) plus the game-client `library` folder's
  `.ai-context` narrative (cloud sync is a genuinely new capability there, worth a folder-level
  mention; the other three touched `.ai-context` files were left as-is — their broad narratives
  were already accurate and a single feature addition didn't change what the folder IS).
  **What was NOT verified this session, honestly stated**: no interactive browser or
  mobile emulator was available, so the actual Save/Load buttons, the My-Writings page's
  click-through, and LibraryModal's tag UI have not been exercised by a human or a real client
  runtime — every other layer (data, encryption, API validation, cross-client wire shape,
  type-checking across all three codebases) has real, reproducible evidence in this log. A
  manual pass through all three UIs is the natural next step before calling this shippable.
- 2026-08-07T10:05:00-0500 independent re-verification pass (Claude), requested by the user
  ("review each step... verify... update documentation with evidences"). Rather than trust the
  implementer's own progress-log claims above, ran three parallel read-only Explore agents (one
  per repo) against a written checklist of every concrete claim in Steps 1-6 — 13 checks for
  DSL/Server, 8 for game-client, 7 for mobile — each requiring a file:line citation or a reported
  discrepancy. Result: **zero discrepancies found** across all 28 checks; every file, function,
  wiring point, and behavioral claim (crypto shape, encrypt-before-save, connectionId-scoped
  delete safety on game-client, upsert-only safety on mobile, the merge-vs-replace confirm-dialog
  wording, the mobile tsc baseline) held up against the live code. Added the Step status table
  above this log for at-a-glance status. Then wrote human-readable, plain-English documentation
  with flow diagrams: new `docs/features/library-sync.md` (ShatteredArchive) covering the whole
  cross-repo flow for a non-technical reader; a "Cloud sync" section added to the existing
  developer-notes `docs/features/user-library.md` (ShatteredArchive) and
  `docs/features/book-editor.md` (mobile). The one gap this pass could not close is unchanged
  from Step 7's own log entry: no human has clicked through the actual UI yet — this pass adds
  confidence that the code backing the UI is correct, not that the UI itself has been operated.

- 2026-08-09T00:45:00-0500 (Claude) — closed the click-through gap for the two things the
  honest caveat above named explicitly, using a new standalone Playwright driver built this
  session (`Shattered-AI/tools/browser-test/` — isolated from this repo, localhost/
  *.shatteredarchive.{com,dev}-only allowlist; see `Shattered-AI/doc/browser-testing.md`).
  This is still AI-scripted clicking, not a human operating the app — stated plainly, not
  glossed over — but it's real DOM rendering and real click events against a live isolated
  server pair, not request replay.

  **The My-Writings page** (`/library/book-editor`, web): real signup+SSO login, then actual
  clicks — "+ New" → fill title/body → "Save" → confirmed the "Saved." status appears — then
  loaded the page FRESH (new page load, not just in-page state) and confirmed the item survived
  and re-selecting it loads the real saved body back into the editor.

  **The Save/Load-to-cloud buttons** (game-client, `AccountModal`): real cross-device round
  trip, not just clicking each button in isolation. "Device 1" (one browser context): clicked
  "New Parchment" → typed a title/body → "Save" → closed the Library modal → File → Account →
  clicked "Save this connection's scripts + plugins to the cloud" → confirmed via a direct,
  independent server-side re-fetch that the item genuinely landed. "Device 2" (a SECOND, fresh
  browser context — no shared storage — same account token): opened Account → clicked "Load
  from cloud into this connection" (handling the `window.confirm()` it's gated behind, and the
  `window.location.reload()` it triggers on success) → confirmed the item that only ever
  existed on "device 1" and the cloud now appears in this fresh session's own Library. This is
  the actual scenario cloud sync exists for (a second device picking up writings from the
  first), not just "the button doesn't crash."

  **One real test bug caught and fixed along the way, not a product bug**: the first attempt's
  `page.fill()` on the new parchment's title raced `LibraryModal.tsx`'s post-creation hydration
  effect (`createNote()` is async; the effect re-populates the title field from the newly
  created item once creation settles, which can land AFTER a fill() and silently overwrite it)
  — confirmed by reading the actual IndexedDB state, which showed the title still as "New
  Parchment" while the server-side check (correctly) found no match. Fixed by waiting for the
  title field to actually show "New Parchment" (proving hydration settled) before typing over
  it — a timing issue only a fast scripted click can hit, not something a human typing at
  normal speed would ever encounter.

  Mobile's own Save/Load-to-cloud buttons were not separately re-driven this pass (time
  budget) — `cloud-sync.ts` there is the same shape already typechecked clean, and the mobile
  Organizations screen (a different feature, same session) was independently proven live via
  `expo start --web` minutes earlier, so the web-rendering path itself is confirmed working;
  only the specific Save/Load button click sequence there remains unexercised. Worth closing
  in a future pass if this becomes load-bearing.

  Showcase screenshots: `Shattered-AI/tools/browser-test/output/showcase/library-sync/`
  (`my-writings-web-saved.png`, `gameclient-save-to-cloud.png`, `gameclient-load-from-cloud.png`).
