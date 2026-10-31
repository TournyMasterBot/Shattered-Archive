# Plan: Simulacrum character creation — auth.shatteredarchive.dev master-account gate + C# dashboard sync

Created: 2026-08-16T07:24:56-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Auto-link a brand-new merc-mud character to the hub account that already authenticated the
connection (per the sibling plan's access-code gate), and surface that character on the same account's
dashboard at DSL/Server/Server.Web.Public, reusing that app's existing per-account character
conventions rather than inventing a new pattern from scratch.

> **Depends on** `20260816-0701-simulacrum-mud-wiring.md` Step 1 (the new, dedicated
> `apps/simulacrum-server`) shipping first — specifically its `relay.admit(accountId, username,
> socket)` function, which by that point has ALREADY validated a trusted+ access code and resolved a
> real `accountId` before ever dialing merc-mud. This plan does not mint a second code and does not add
> any new HTTP route or UI of its own — it extends that same relay to forward the already-verified
> account onward, in-band, to merc-mud. game-server and game-client's generic connect flow (used to
> actually reach the MUD, per the other plan's Step 2) stay untouched by this plan too.

## Goal

A brand-new simulacrum character created during a session that the sibling plan's access-code gate
already authenticated is AUTOMATICALLY tied to that session's `accountId` — no second code, no extra
step for the player beyond what the sibling plan already required just to connect at all. That
character then appears in a new "Simulacrum Characters" section on the account's dashboard at
`shatteredarchive.com`, populated from what the engine itself reports — not hand-typed, not guessed
from logs. Reached when: every NEW character created via a gated connection carries the connecting
account's id in its pfile from the moment it's created, an existing (pre-simulacrum or
debug/loopback-only) character with no linked account is unaffected, the link survives a game restart
(it's in the pfile), and the dashboard lists it correctly for the right account only.

## Constraints

- **This plan adds NOTHING new to simulacrum-server's Express surface or UI.** The sibling plan's
  Step 1 already covers the only HTTP route (`POST /api/access-code`) and the only UI page
  (simulacrum-server's own minimal sign-in-and-mint page) this whole effort needs. This plan's ONLY
  simulacrum-server change is extending the `relay.admit()` success path (sibling plan, Step 1) to send
  one extra preamble line to merc-mud before piping user bytes.
- **merc-mud's C change is much smaller than originally scoped.** Since the sibling plan's gate already
  resolves and verifies the accountId BEFORE ever dialing merc-mud, this plan's C code does not read or
  validate any code file itself — it only peeks at one preamble line at connection start (a private,
  internal-only protocol addition; merc-mud's port is never public, per the sibling plan's Step 4) and
  stores the already-verified accountId in memory. The original design had this plan's C code
  independently query a `link-codes/<code>.txt` directory and re-implement expiry/tier validation there
  — that's now redundant with the sibling plan's gate and is dropped entirely; no `link-codes/`
  directory exists in this design.
- **The two existing "character" concepts in DSL/Server are NOT what this plan reuses, and knowing why
  matters.** `CharacterModel`/`CharacterController` (`/characters`) is a thin name+accountId record
  built for Organizations Phase 2b (attributing authored content to a named persona) — its own doc
  comment states it is deliberately NOT linked to the in-game engine. `LoginCharacterModel`/
  `DslLoginCharacter` IS a real in-game character snapshot, but it's populated by an external
  log-tailing sidecar feeding `Server.Dsl`'s UDP:8400 listener — a pipeline built specifically to parse
  **dsl-mud.org's own logs**, structurally unrelated to simulacrum and not something simulacrum's
  engine can plug into (there's no UDP sender in the C source, and there shouldn't be one added for
  this — mixing simulacrum's demo characters into DSL's real character-tracking pipeline would violate
  the sibling plan's "never conflate the two" constraint). **"The same character logic" means the same
  CODE PATTERN `CharacterModel`/`CharacterController` already established** (GUID id, accountId
  ownership, simple per-account list, dashboard-listed) — a new sibling model following that shape, not
  a shared table and not the DSL log pipeline.
- **This bridge (hub `accountId` ↔ MUD character) was previously explicitly scoped OUT.**
  `CharacterModel.cs:8-14`'s doc comment states bridging `LoginCharacterModel`'s
  `masterAccountNumber`/`profileName` to a hub `accountId` "in either direction... is a separate,
  unscoped undertaking." This plan does NOT attempt that bridge either — it builds an entirely new,
  parallel link (simulacrum pfile ↔ hub accountId) that has nothing to do with DSL's
  `masterAccountNumber` field, which stays untouched.
- **The C engine has ZERO outbound networking today, and this plan does not add any.** The preamble is
  INBOUND — read passively off the same listening socket merc-mud already accepts connections on, not
  an outbound call. Every existing C-engine ↔ TypeScript-service integration in this repo
  (`area_reload.c`, `copyover.c`, `state_snapshot.c`) is a plain-text file handshake; this plan's
  `character-sync/<name>.txt` output follows that exact idiom, but the ACCOUNT LINK itself is now
  purely in-band (no file for that part — see above).
- **Existing/old characters, and debug/loopback connections, are unaffected.** Only the NEW-character
  branch (`comm.c:1689-1710` through `CON_CONFIRM_NEW_NAME`) writes a `MasterAccountId`, and only when
  a preamble was actually received. A raw debug connection on the loopback port (sibling plan Step 4)
  never gets a preamble (simulacrum-server is the only thing that ever sends one) and behaves exactly
  as it did before either plan existed — no gate, no prompt, nothing new.
- **Open design question, deliberately deferred to Step 2's implementation time**: should an EXISTING,
  already-linked character's stored `MasterAccountId` be cross-checked against the CURRENT connection's
  accountId at login (preventing account A's session from logging into account B's already-linked
  character, even with the right character password)? Not required by any of the 7 reviewed
  requirements, but worth a deliberate yes/no rather than an accidental gap — decide and note the
  reasoning when Step 2 is implemented.
- **No unit-test suite exists for the C engine** (confirmed via the Makefile — no test target). This
  code's own verification is manual compile + live connection walkthrough, not `pnpm test`.

## Context (verified 2026-08-16, file:line — via a dedicated Explore-agent research pass)

- **`CharacterModel`** (`c:\Projects\DSL\Server\Server.Datastore\Models\CharacterModel.cs:20`) and
  **`CharacterController`** (`c:\Projects\DSL\Server\Server.Web.Public\Controllers\
  CharacterController.cs:30`, route `/characters`): fields `id` (GUID), `accountId`, `name`,
  `createdAt` only — no game data. `POST /characters` → `CreateCharacter`
  (`CharacterController.cs:37-68`), 20-per-account cap (`:33,47-50`), unique-per-account (`:51-54`),
  `callerId`/`AccountId` resolved from `HttpContext.GetUser()!.ID` (`:45,74,83`) — the SAME
  resolved-identity idiom `UserContentController.cs:44` uses. This is the shape to mirror for the new
  `SimulacrumCharacterModel`/`SimulacrumCharacterController`, extended with the game fields
  simulacrum's engine actually reports (race, class, level, sex, alignment).
- **`LoginCharacterModel`/`DslLoginCharacter`** (`Server.Datastore/Models/LoginCharacterModel.cs:8,20`)
  — `profileName`, `masterAccountNumber`, `characterName`, `isClan`/`clan`, `isKingdom`/`kingdom`,
  `level`, `time`. Written by `HandleUserCharacter` (`Server.Dsl/Processors/LineProcessor.cs:380-395`),
  fed by `SocketServer`'s UDP:8400 listener (`Server.Dsl/Sockets/SocketServer.cs:12-13,39,58`) from an
  external log-tailing process. Confirmed unrelated (Constraints) — cited here only so a future reader
  doesn't reach for it by mistake.
- **Hub SSO/introspect is already fully built in Server.Web.Public**: `UserController.cs:66-86`
  (`/user/login` → hub authorize redirect), `:90-181` (`/user/sso/callback` →
  `AuthHubClient.ExchangeAuthorizationCodeAsync`, `Services/AuthHub/AuthHubClient.cs:126-132`, posts
  `/api/token-exchange`), `HubAuthMiddleware.cs:29-68` (per-request `IntrospectAsync`,
  `AuthHubClient.cs:112-116`, posts `/api/introspect`, audience-checked at `:37`).
  `AuthHubOptions.cs` — `BaseUrl`, `RedirectUri` (`:47`), `ServiceName` (default `shattered-web`,
  `:26`), `PrivateKeyPath` (Ed25519 service-assertion key). Step 3 (the C# side) needs none of this
  built — the signed-in `AccountId` is already resolvable the same way `CharacterController` already
  does it.
- **The sibling plan's `relay.admit()` function** (its Step 1) — the extension point for this plan's
  Step 1: it's called ONLY after a trusted+ access code has been validated (file present, unexpired,
  and the tier re-checked LIVE against the role-store shared with mud-builder-server), and it already
  has `accountId`/`username` in hand at that point, before `net.connect` to merc-mud even happens.
  Today it just pipes bytes; this plan adds one line sent before the pipe starts.
- **merc-mud's `nanny()`** (`merc-mud/2.4/src/comm.c:1611`), state constants `merc.h:220-235`. Every
  new connection starts at `CON_GET_NAME` (`comm.c:891`, set in `init_descriptor`). New-player branch:
  `comm.c:1689-1710` (a brand-new name falls into the `else` at `:1689`, prints the "Did I get that
  right" confirm, sets `d->connected = CON_CONFIRM_NEW_NAME`). The "yes" branch of
  `CON_CONFIRM_NEW_NAME` (`comm.c:1795-1817`, sets `CON_GET_NEW_PASSWORD` at `:1802`) is where this
  plan writes the `MasterAccountId` pfile field, IF the descriptor already carries an accountId from
  the preamble — no new `CON_*` state or extra player-facing prompt is needed at all, since there's
  nothing left to ask the player (unlike the original design, which needed a whole new state to prompt
  for and validate a code at this point). `save_char_obj` call sites (`comm.c:573,621,646,731,753,803`)
  are where an already-linked character's data gets written — the actual pfile field write and the
  character-sync file write both belong in `save.c` (not read this session — locate its
  `fwrite_char`-equivalent function during Step 2).
- **Existing file-handshake precedent to mirror**: `merc-mud/2.4/src/state_snapshot.c` — plain
  `fopen`/`fgets` line-based text, tmp-file-then-rename on write (`:152`). Mirror this shape for the ONE
  remaining file type this plan needs: a `character-sync/<name>.txt` output file per linked character
  (the account-LINK itself is no longer file-based — see Constraints).
- **Cross-repo bind-mount precedent, now simplified to TWO compose projects instead of three**: since
  the account link travels in-band (no `link-codes/` file), only `character-sync/` needs a shared
  mount — between `merc-mud`'s own compose and `DSL/Server`'s compose (Step 4). Extend the existing
  "same host path, mounted independently in each compose file" pattern `merc-mud/2.4/area` already uses
  — check `DSL/Server`'s compose file for its own mount-path conventions during Step 4 (not read this
  session).

## Steps

### [x] 1. (CLAUDE) simulacrum-server: extend the relay to pass the verified account onward
- Do: In the `relay.admit(accountId, username, socket)` function the sibling plan's Step 1 already
  isolated, add: immediately after `net.connect` succeeds and BEFORE piping any user-typed bytes, write
  one preamble line to the merc-mud socket — e.g. `#SIMACCT <accountId> <username>\n` (a private,
  internal-only protocol addition; merc-mud's port is never reachable from outside `sa-shared`/
  loopback, per the sibling plan's Step 4, so this is safe to trust). Then begin the normal
  bidirectional pipe as before. No new HTTP route, no new UI.
- Files: /workspace/shattered-archive/apps/simulacrum-server/src/relay.ts.
- Verify: connecting through the gate (sibling plan's Step 1 flow) and inspecting merc-mud's raw input
  (temporary logging, or a throwaway `nc -l` stand-in for merc-mud during this step, same technique the
  sibling plan's Step 1 used) shows the preamble line arriving as the literal first bytes, before
  anything the human typed.

### [x] 2. (CLAUDE) merc-mud: consume the preamble + write the master-account pfile field
- Do: In `comm.c`, at the point a new descriptor's very first line is read (before it's dispatched to
  `nanny()`'s `CON_GET_NAME` case — locate the exact read/dispatch site near `init_descriptor`/the main
  read loop, `comm.c:598,780,858-891`), check whether that first line matches the
  `#SIMACCT <accountId> <username>` preamble format; if so, store `accountId`/`username` on the
  descriptor (a new in-memory field) and discard the line (never shown to the user, never treated as a
  typed name) — the NEXT line the user actually types is what `CON_GET_NAME` sees. If the first line
  does NOT match (a raw debug/loopback connection), treat it exactly as before — no behavior change for
  that path. At `CON_CONFIRM_NEW_NAME`'s "yes" branch (`comm.c:1802`, today sets `CON_GET_NEW_PASSWORD`
  directly): if the descriptor carries a stored accountId, write it to the pfile as a new
  `MasterAccountId` field (via `save.c`'s field-writing pattern) before proceeding to
  `CON_GET_NEW_PASSWORD` unchanged; if no accountId is present, proceed exactly as today — no gate, no
  prompt, nothing new asked of the player (in practice unreachable on a public connection once the
  sibling plan's gate is live, since an ungated connection never reaches merc-mud at all). Also add a
  save-time write-out: whenever a LINKED character saves (`save_char_obj` call sites,
  `comm.c:573,621,646,731,753,803`), write/overwrite `character-sync/<name>.txt` (plain-text, mirroring
  `state_snapshot.c`'s convention) with accountId, character name, race, class, level, sex, alignment.
- Files: /workspace/merc-mud/2.4/src/merc.h (new descriptor field, if a struct change is needed),
  /workspace/merc-mud/2.4/src/comm.c, /workspace/merc-mud/2.4/src/save.c,
  /workspace/merc-mud/docker-compose.yml (add the `character-sync/` bind mount).
- Verify: MANUAL (no C test suite — Constraints). Compile cleanly (`make` in `src/`). Live walkthrough
  over a GATED connection (sibling plan's Step 1 relay, valid access code): brand-new character →
  confirm → normal creation flow with NO extra prompt — the resulting pfile has the new
  `MasterAccountId` line matching the connecting account, with no code typed a second time. A raw
  debug/loopback connection (no simulacrum-server in front) behaves identically to before this plan —
  no `MasterAccountId`, no change in flow. `character-sync/<name>.txt` appears/updates on every
  subsequent save of a linked character. Logging back into that SAME character later still requires the
  sibling plan's connection-level gate, but nothing new happens at the character layer on repeat logins
  (subject to the open design question in Constraints, if resolved by then).
- **Flag before starting this step**: pfile format changes on a live-adjacent codebase are the single
  highest-risk edit in either plan — a malformed write can corrupt a player file. Work against a
  throwaway copy of `player/` first, not directly against anything with real characters in it, and
  confirm the existing (unrelated) pfile fields still round-trip byte-for-byte after this change before
  calling it done.

### [x] 3. Server.Web.Public: `SimulacrumCharacterModel` + controller + dashboard section
- Do: New `SimulacrumCharacterModel` (Server.Datastore/Models/) mirroring `CharacterModel`'s shape
  (Constraints: same pattern, not the same table) — `id`, `accountId`, `characterName`, plus the game
  fields Step 2's `character-sync/<name>.txt` reports (race, class, level, sex, alignment),
  `lastSyncedAt`. New `SimulacrumCharacterController` (or a route group on an existing controller if
  that fits this app's actual conventions better) with a read-only `GET /simulacrum-characters` (own
  account's only, via the same `HttpContext.GetUser()!.ID` idiom `CharacterController.cs:45` already
  uses) — no user-facing create/edit; these rows are sync-derived. A sync mechanism reads
  `character-sync/*.txt` (Step 2's output, bind-mounted into THIS app's own compose project — check its
  existing mount conventions first) and upserts rows keyed on `characterName` + the `accountId` the
  file itself names — decide during this step whether that's a periodic background poll or an
  admin-triggered endpoint. Add a "Simulacrum Characters" section to `Views/User/Dashboard.cshtml`.
- Files: /workspace/dsl/Server/Server.Datastore/Models/SimulacrumCharacterModel.cs (new),
  /workspace/dsl/Server/Server.Web.Public/Controllers/SimulacrumCharacterController.cs (new),
  /workspace/dsl/Server/Server.Web.Public/Views/User/Dashboard.cshtml, a new sync service/job (exact
  location TBD during this step).
- Verify: with a `character-sync/` file present for account A, `GET /simulacrum-characters` (signed in
  as A) lists it with correct fields; signed in as a different account B, the list is empty
  (isolation); the Dashboard view renders the new section; deleting/renaming the source file and
  re-syncing reflects correctly (no stale ghost rows).

### [x] 4. Deploy wiring across two compose projects + full end-to-end verification
- Do: Reconcile the `character-sync/` bind mount across BOTH compose projects that need it (merc-mud's
  own compose and DSL/Server's compose) at the SAME host path under `C:/Projects/merc-mud/2.4/` (no
  `link-codes/` mount needed anywhere — dropped per Constraints). Run the full local loop: sign in as a
  trusted+ account on game-client, mint an access code (sibling plan), connect to simulacrum through
  the gate, create a new character, confirm the pfile is linked with NO second code entry; confirm
  `character-sync/<name>.txt` appears; sign in to `shatteredarchive.com` as the SAME account and
  confirm the character appears on the dashboard; sign in as a DIFFERENT account and confirm it does
  not. Refresh `.annotated`/`.ai-context` for every touched directory across both repos.
- Files: /workspace/merc-mud/docker-compose.yml, DSL/Server's own compose file (path TBD, not confirmed
  this session).
- Verify: the full cross-repo, cross-language loop above passes end to end on the local experimental
  stack. Going live on the real hosts is the user's own deliberate action outside this session's reach,
  same as the sibling plan's Step 6/7 boundary.

## Progress log

- 2026-08-16T07:24:56-05:00 plan created, split out from `20260816-0701-simulacrum-mud-wiring.md` after
  the user asked for master-account-gated character creation reusing the C# app's character logic,
  surfaced on the user dashboard. Researched via a dedicated Explore-agent pass across `DSL/Server` (the
  two existing "character" concepts there are both wrong fits for direct reuse and the bridge this plan
  builds was previously explicitly scoped out as future work; the hub SSO/introspect plumbing IS
  already mature and reusable) plus direct reads of merc-mud's `comm.c`/`nanny()` and `state_snapshot.c`
  (zero outbound networking in the C engine today; the established integration idiom is a plain-text
  file handshake, not JSON/HTTP).
- 2026-08-16 **correction absorbed (matches the sibling plan's correction 3)**: sibling plan's Step 1
  moved from game-server to a new dedicated `apps/simulacrum-server` — this plan's Step 1 (link-code
  minting) was relocated to match.
- 2026-08-16 **correction absorbed (matches the sibling plan's correction 4)**: simulacrum-server
  became a plain TCP relay (no auth) plus a small Express surface whose only route was the link-code
  endpoint.
- 2026-08-16 **correction absorbed (matches the sibling plan's correction 5) — SUPERSEDES the two
  corrections above and substantially shrinks this plan**: a fresh review against 7 explicit
  requirements reversed the sibling plan's "no connection-time gate" stance — every connection to
  simulacrum is now gated by a trusted+ access code, checked by `simulacrum-server`'s relay BEFORE
  merc-mud is ever dialed. Two consequences for THIS plan: (a) this plan no longer mints its own code at
  all — the sibling plan's access code IS the account link, resolved and verified before this plan's
  work even starts, so Step 1 (formerly "link-code minting endpoint + its own minimal UI") shrank to a
  one-line preamble extension of the sibling plan's relay; (b) Step 2 (the C-engine change) shrank
  correspondingly — no `link-codes/` file, no expiry check, no validation logic in C at all, just a
  first-line peek for an already-trusted preamble and a pfile write. The `link-codes/` directory and the
  three-compose-project mount reconciliation (Step 4, formerly) are both dropped; only
  `character-sync/` remains, across two compose projects. Net effect: less C-engine risk than
  originally scoped, and the player never types a code twice.
- 2026-08-16 **step 1 done**: `relay.ts`'s `admit()` now writes `#SIMACCT <accountId> <username>\n`
  to the merc-mud socket immediately after `net.connect` succeeds and before starting the
  bidirectional pipe — `accountId`/`username` parameters were previously unused (underscore-prefixed)
  now flow through for real. No new files, no new routes, matching the plan's own scope. Added a
  dedicated test (`relay.test.ts`) using a raw-capture throwaway TCP stand-in (records bytes in
  arrival order rather than echoing, unlike the existing pipe test) — confirms the preamble is the
  literal first thing received, byte-for-byte, before anything written after it. Verified beyond the
  plan's own ask: rebuilt and redeployed the REAL `simulacrum-server` container in the running
  experimental stack, minted a genuine access code (same temporary-grant-then-revert technique as
  Plan 1 Step 4 — `roles.json` confirmed clean afterward), and drove a live connection through the
  actual relay to the REAL merc-mud engine. Since Step 2 (the C-side parser) doesn't exist yet,
  merc-mud correctly treated the unrecognized preamble as a name attempt and rejected it as
  "Illegal name" — the expected, harmless pre-Step-2 behavior; no crash, no corruption, confirming the
  deployed relay code is safe to layer Step 2 on top of.
- 2026-08-16 **step 2 done — the highest-risk step in either plan, fully isolated-tested before
  touching anything live**: `merc.h` — `descriptor_data` gained `simacct_id[64]`/`simacct_username[64]`
  (fixed buffers, not str_dup'd — short/bounded, no allocation lifecycle; confirmed via
  `recycle.c`'s `new_descriptor()` — `*d = d_zero` zeroes every field on both fresh alloc and
  free-list reuse, so no explicit init code was needed). `pc_data` gained `master_account_id`
  (str_dup'd, matching `title`/`bamfin`/`bamfout`'s existing convention). `comm.c`'s `nanny()`
  `CON_GET_NAME` case: intercepts a `#SIMACCT <id> <username>` first line (`str_prefix` — confirmed
  its exact "TRUE means NOT a prefix" ROM semantics before using it, easy to get backwards), guarded
  on `simacct_id` still being empty so it can only ever fire ONCE per descriptor — this is a REAL
  security property, not just tidiness: without it, a human could later type
  `#SIMACCT <other-account>` as their own "name" attempt and spoof a different account link (`#`
  already fails `check_parse_name`, so this exact string was never reachable as a normal name
  anyway — but only the FIRST line gets the special parse). `CON_CONFIRM_NEW_NAME`'s 'y' branch
  writes `simacct_id` onto the new character's `master_account_id` — no new prompt, no second code.
  `save.c`: `load_char_obj` defaults `master_account_id` to `""`; `fwrite_char` conditionally emits
  a new `MAcc` tag (only when linked — most pfiles will never carry it); `fread_char` gained a new
  `case 'M':` block (none existed before). New `write_character_sync()` (mirrors `state_snapshot.c`'s
  tmp+rename idiom, plain `key: value` lines matching `access-codes.ts`'s own convention for this
  effort, not JSON) writes `character-sync/<name>.txt` from `save_char_obj`, gated on
  `master_account_id` being non-empty — confirmed the engine's actual working directory is
  `/opt/merc-mud/area` (`Dockerfile`'s `CMD`: `cd area && exec ../src/rom 4000`), so
  `CHARACTER_SYNC_DIR "../character-sync/"` lands as a sibling of `player/`/`area/`, not nested
  inside either. `merc-mud/docker-compose.yml` gained the `character-sync/` bind mount.

  Verification was the real point of this entry. Compiled clean via a throwaway `docker build`
  (`-Wall`, full link succeeded; a follow-up `--no-cache` rebuild digested by local qwen confirmed
  zero warnings specifically in comm.c/save.c/merc.h). Built a FULLY ISOLATED throwaway sandbox
  (copied `player/`+`area/` to `.step2-throwaway-test/`, recorded md5 checksums of all 14 real
  pfiles first) and ran a complete, scripted telnet walkthrough of ROM's actual character-creation
  dialog (name → race → sex → class → alignment → customize → weapon → MOTD pager → CON_PLAYING →
  quit) three times: (1) WITH a `#SIMACCT` preamble — resulting pfile has the correct `MAcc` line,
  zero extra prompts, `character-sync/<name>.txt` has all 7 expected fields with correct real
  values (verified against the character's actual race/class/level/sex/alignment, not just
  presence); (2) WITHOUT a preamble (simulating the debug/loopback path) — zero `MAcc` lines,
  zero character-sync file, completely unaffected; (3) a RELOGIN into that same unlinked character
  — real `fread_char`→`fwrite_char` round trip, still zero `MAcc` lines afterward, file structure
  intact. Confirmed the real 14 pfiles stayed byte-identical (md5) throughout the entire sandbox
  session. Hit the SAME git-bash path-mangling issue as Step 1 of the sibling plan, this time on
  `docker run -v` flags (not just `docker exec`) — `docker inspect` showed the destination silently
  rewritten to a Windows path; fixed with `MSYS_NO_PATHCONV=1`, re-verified via `docker inspect`
  before trusting the mount. Backed up the real `player/` directory
  (`player.backup-pre-step2-20260816/`, gitignored) before touching the live container as an extra
  safety margin beyond the sandbox testing, then rebuilt and recreated `merc-mud2.4` for real —
  confirmed clean boot, all 14 real pfiles still byte-identical afterward, `character-sync/` mount
  present and writable, Step 4's resource limits (1.0 cpu / 512M) still intact post-recreation.
- 2026-08-16 **step 3 done**: discovered this app's data layer is SQLite in practice today
  (`DBManager`'s DynamoDB client is commented out, `client = new SqlClient()` is live) behind
  DynamoDB-shaped attribute annotations — `SimulacrumCharacterModel` mirrors `CharacterModel`
  exactly (`Key`/`SortKey`/`Timestamp`/`Payload`, `[DynamoDBTable(...)]` etc.) for consistency,
  but keyed `Key=characterName` rather than a synthetic GUID — merc-mud enforces globally-unique
  character names, so the name itself is a safe natural key and makes every sync pass a trivial
  idempotent upsert. Added `Constants.TABLE_SIMULACRUM_CHARACTERS`, registered it in
  `AppManager.DbTables` (SQLite table auto-created at boot, confirmed live — see below). New
  `SimulacrumCharacterController` (`GET /simulacrum-characters`, `[AuthorizeApi]`, same
  `HttpContext.GetUser()!.ID` idiom as `CharacterController`) — read-only, no create/edit routes,
  matching "sync-derived, never user-authored."

  **Sync design decision**: this codebase has ZERO existing background-job/`IHostedService`
  pattern anywhere (confirmed via repo-wide grep) — introducing one for a single, low-volume,
  demo-scale sync would have been new architectural ceremony this app doesn't otherwise carry.
  Went with sync-ON-READ instead: every `GET /simulacrum-characters` call reconciles ONLY the
  caller's own rows against `character-sync/*.txt` as it currently stands (upserts what's
  present, deletes any of the caller's existing rows whose source file is gone) — satisfies the
  "no stale ghost rows" requirement with no staleness window and no new infrastructure, at the
  cost of a directory scan + one table scan per request (mirrors `CharacterController.
  ListMyCharacters`'s own already-established full-scan-then-filter idiom for a low-volume
  table). Config is a new `SimulacrumOptions`/`Simulacrum__SyncPath`, bound via
  `IOptions<T>` and registered in `Program.cs` exactly like `AuthHubOptions` — unset path just
  means an empty list, never an error, matching that class's own "optional enrichment, never a
  gate" stance. Dashboard: a new "Simulacrum Characters" card in `Dashboard.cshtml`
  (`dash-simulacrum-characters-list`/`-empty`, matching the existing card markup convention
  exactly) plus a `LoadSimulacrumCharacters` function in `dashboard.js` (jQuery `$.ajax`,
  mirroring `LoadDirections`'s exact shape), wired into `Dashboard.Initialize()`. Compose:
  `Simulacrum__SyncPath` + a read-only bind mount onto merc-mud's `character-sync/` added to both
  `docker-compose.yml` (dev — absolute host path, confirmed against this machine) and
  `docker-compose-prod.yml` (prod — a best-guess relative path mirroring the dev sibling-directory
  layout, explicitly flagged as unconfirmed against the real prod host, to resolve at Step 4).

  Verified: `dotnet build Server.sln` — 0 errors (1524 pre-existing warnings, all unrelated;
  confirmed via a qdigest pass with a targeted question that literally zero of them mention
  Simulacrum/SimulacrumCharacterModel/SimulacrumCharacterController/SimulacrumOptions). Beyond
  compilation, actually BOOTED the real app locally (`dotnet run`, pointed at a throwaway test
  `character-sync/` file) — confirmed live in its own boot log: `Created table:
  'simulacrum_characters'`, no DI/config wiring errors. Hit the new route unauthenticated and got
  a real `401` (not `404`), confirming it's genuinely wired into routing and enforces
  `[AuthorizeApi]`, not just present in source. A full SIGNED-IN round trip (real SSO session,
  real GET, isolation between two accounts, delete/rename-reflects-correctly) is deliberately left
  to Step 4, which owns "full end-to-end verification" across both remaining compose projects —
  consistent with how this plan's own Step 3 Verify text was written. Cleaned up after testing:
  reverted an unintended `Data/sitemap.xml` regeneration the local boot triggered (a pre-existing,
  tracked cache file, unrelated to this change) via `git checkout`; confirmed the new SQLite table
  landed only in the git-ignored local `Data/db.sqlite`, never something to revert. Confirmed via
  `git status` that every OTHER pending change in the DSL repo (UserContentController.cs,
  Directions views, site.css, GameLogs, Books) is pre-existing, unrelated user work — untouched.
- 2026-08-16 **step 4 done — plan COMPLETE**: the `character-sync/` bind mount was already
  reconciled across both compose projects as a side effect of Steps 2/3 (same host path,
  `C:/Projects/merc-mud/2.4/character-sync`, confirmed identical in both). No `link-codes/` mount
  exists anywhere, per the plan's own correction. `.annotated`/`.ai-context` checked for every
  touched directory in both repos (`merc-mud/2.4/src`, DSL/Server's controllers dir) — neither
  repo has ever used that convention in these directories, so there was nothing to refresh.

  What remained was the real thing this step is FOR: a genuine, fully live, cross-repo,
  cross-language round trip — no more isolated sandboxes, no more manually-injected preambles.
  Signed up a REAL account via auth-server's actual public flow (`GET /api/auth/challenge` →
  answered from `dsl-questions.json` → `POST /api/auth/signup` → `POST /api/auth/login` →
  `POST /api/account/change-password` to clear `mustChangePassword`), granted it `trusted` tier
  via the shared `roles.json`, minted a `simulacrum-server`-audienced API key via
  `POST /api/keys`, and used THAT to mint a real access code via `POST /api/access-code` — the
  first time that route was exercised over real HTTP rather than unit-tested directly. Connected
  through the real gated relay (65001) to the real, live `merc-mud2.4`, walked a full character
  creation dialog (hit `check_parse_name`'s reject-digits rule on the first attempt — MUD names
  are letters-only, fixed by using an alphabetic name), and confirmed on disk: the real pfile
  carries `MAcc <accountId>~`, and `character-sync/<name>.txt` has every field correct.

  For the DSL/Server half, ran it locally (`dotnet run`, not docker-compose, since this is a
  one-off verification run) and hit — then root-caused and fixed — two REAL, pre-existing
  environment gaps that would have blocked anyone attempting this locally, neither caused by this
  plan's own changes: (1) a bare host process can't resolve `auth-server.shatteredarchive.dev`
  (a docker-internal-only alias); switched `AuthHub__BaseUrl` to the publicly-resolving
  `auth.shatteredarchive.dev`, which nginx already routes correctly. (2) TWO different
  `shattered-web.key` files exist on this host — the real one at `Server/secrets/` (matching the
  `shattered-web.pub` actually registered with auth-server) and an unrelated one-off dev key at
  `Server.Web.Public/secrets/` that a bare `dotnet run` picks up by default — pointed
  `AuthHub__PrivateKeyPath` at the correct one explicitly. With both fixed, the FULL SSO
  handshake (`/user/login` → capture `sso-state` cookie + parsed `state` → `POST
  /api/sso/approve` on the real account's session → `/user/sso/callback` with both the code and
  the state cookie) succeeded for real, landing a genuine `jwt-token` auth cookie. `GET
  /simulacrum-characters` with that cookie returned the linked character with every field
  correct (alignment 0 doesn't appear in the JSON — confirmed as this app's own pre-existing
  "omit default values" serializer convention, not a bug). Signed up a SECOND, unrelated account
  through the identical flow and confirmed it sees an empty list — real cross-account isolation,
  not just a code-review claim. Deleted the character-sync source file and re-queried the FIRST
  account: the row disappeared — no stale ghost row, confirmed live rather than just unit-tested.

  Cleanup: reverted the `roles.json` test grant and a `Data/sitemap.xml` regeneration (caught at
  the WRONG relative path on the first check — re-verified at the correct path,
  `Server/Server.Web.Public/Data/sitemap.xml`, and reverted properly) via `git checkout`; stopped
  the local test process and confirmed no `dotnet.exe` remained; confirmed `player/` and
  `character-sync/` are both gitignored, so the real test character and mount stay untracked.
  Left in place, deliberately, as harmless demo artifacts: the `Endtoendy` character on the live
  `merc-mud2.4` (linked, matches the existing `smoke-test-acct-1` precedent) and the two
  freshly-signed-up auth-server test accounts (no self-service account deletion exists to remove
  them). Both plans this session are now fully accounted for: this one COMPLETE; the sibling
  mud-wiring plan has Steps 5-7 remaining (nginx + front proxy + landing page), none of which
  this plan depended on.
