# Plan: Auth rollout Phase F — Kingdom Tactics (WS auth + persistence + dashboard)

Created: 2026-07-27T19:30:00-05:00 · Workspace: apps/kingdom-tactics-client, apps/kingdom-tactics-server, services/kingdom-tactics-engine · Status: COMPLETE
Task: Give Kingdom Tactics an optional hub login that (1) attaches an accountId
to a match seat over the existing WS `join` frame, (2) persists match history +
deterministically-replayable action logs + army layouts keyed by accountId, and
(3) adds a kt-client login + dashboard (history list, replay viewer, army-layout
cloud save/load). Anonymous play is unaffected end to end — auth adds identity
and persistence, it never gates the game.

## Goal

A logged-in player can play a match, see it appear in a match-history list,
replay it and get the exact recorded outcome back (engine determinism), and
save/load army layouts to the cloud. A logged-out player's experience — connect,
join, play — is byte-for-byte unchanged from today. `auth-server` down degrades
kt-server to fully anonymous, never a hard failure.

## Constraints

- **Auth is additive on the WS transport, never a gate.** The `join` frame's
  optional `token` field is the ONLY new input; a missing/invalid/expired token
  must resolve exactly like no token at all (anonymous seat, no accountId) —
  never reject the join.
- **Kingdom Tactics is its own real backend service**, unlike game-client (which
  has no backend at all — game-server is a raw telnet WS proxy with zero HTTP).
  So KT's login follows the **standard** Phase A consumer pattern (its own
  service key, its own registered redirect URI, its own callback route that
  performs the code exchange) — NOT game-client's Phase D pattern of borrowing
  another service's key. Do not copy Phase D's `AuthHubClient`-adjacent shape;
  copy Phase A's own reference consumer instead.
- **The hidden-outcome combat salt is never persisted or served to any client**,
  full stop (matches the existing `kt-combat-reactions-salted-rng` design — see
  Context). A replay must reproduce the exact recorded outcome by re-running the
  SAME recorded action log through a freshly-built `MatchSession` seeded with
  the ORIGINAL salt **server-side only**; the client-facing replay viewer
  consumes the resulting state stream, never the salt itself.
- **No new heavyweight storage dependency.** kingdom-tactics-server has zero
  persistence infrastructure today (confirmed: no DB client, no file store,
  in-memory `Map` only). Use a plain per-account JSON file store (one file per
  accountId, matching the "small validated JSON blob" shape Phase C already
  used successfully for game-client's scripts/plugin-configs), not sqlite/a new
  ORM/a new dependency, for a first cut.
- **Match history + action logs are retention-capped**, matching Phase C's
  25-log-per-account precedent — this is player telemetry, not permanent
  archival, and an unbounded per-account file will eventually misbehave.
- **Anonymous matches produce no history entry.** Only seats that carried a
  successfully-introspected accountId get recorded; a fully-anonymous match
  (both seats anonymous, or vs. AI with no accountId) writes nothing.

## Context (grounded 2026-07-27 via a dedicated research pass + direct verification)

- **WS transport**: raw `ws` (not socket.io) mounted on the plain Express app at
  `/ws/kt` — `apps/kingdom-tactics-server/src/ws/kt-gateway.ts:216`. Express itself
  has exactly TWO routes today, `GET /` and `GET /health`
  (`apps/kingdom-tactics-server/src/index.ts:43-51`) — there is no HTTP auth
  surface to extend; Step 2 adds the first one.
- **Identity today is fully anonymous and ephemeral**: each connection gets an
  in-memory `clientId: \`c${nextClientId++}\`` (`kt-gateway.ts:220-226`), gone on
  disconnect, never tied to any account.
- **`join` is the hello/claim frame**: `KtJoinMessage` in
  `services/kingdom-tactics-engine/src/net/protocol.ts:16-21` —
  `{ type: 'join', matchId: string, side?: Side }`. Handled in
  `kt-gateway.ts:142-164` (`case 'join':`), which calls
  `session.claimSeat(side, conn.clientId)`
  (`services/kingdom-tactics-engine/src/match/match-session.ts:111-117`); every
  later action re-checks `this.seats.get(side) !== clientId`
  (`match-session.ts:130-142`, specifically line 135). This is where an optional
  `token` field gets added and where introspection hooks in.
- **Phase 3 residue, not a real guard**: `apps/kingdom-tactics-server/scripts/
  introspect-check.ts` is a host-only CLI proving `@shatteredarchive/
  services-server`'s `introspect()` works against a live auth-server — never
  wired into the running server. `apps/kingdom-tactics-server/.env:7-11` has
  `AUTH_SERVER_URL`/`SERVICE_PRIVATE_KEY_PATH` commented out, with a comment
  claiming the service is "already registered" via `register-service
  kingdom-tactics-server`.
  **That comment is STALE/WRONG — verified mechanically, not assumed**: a live
  `listServices()` call against the real auth-server's `ServiceKeyStore` (metadata
  only, no key material) returns exactly `mud-builder-server`, `phase-a-smoke`,
  and `shattered-web` — `kingdom-tactics-server` is NOT in the list at all (not
  even with 0 active keys, which is how a fully-revoked-but-once-existed entry
  would show — compare `phase-a-smoke`, which has `activeKeys: 0` but a real
  entry). No `secrets/` dir or `*.key` file exists under
  `apps/kingdom-tactics-server/` either. **Step 1 must perform a genuine FIRST
  registration**, not "reuse an existing key," and must fix this stale comment.
- **`MatchSession` — memory confirmed accurate**: lives in
  `services/kingdom-tactics-engine/src/match/match-session.ts`, isomorphic (no
  I/O, no Node/DOM built-ins — doc comment at lines 12-27), shared byte-for-byte
  between online (`kt-gateway.ts`) and local/hotseat
  (`services/kingdom-tactics-engine/src/match/local-match.ts:44-67`). Salt:
  online uses `node:crypto`'s `randomInt` (`kt-gateway.ts:83-91`), local uses
  `deriveCombatSalt(seed)` — a pure function
  (`services/kingdom-tactics-engine/src/rng/combat-rng.ts:35`,
  `local-match.ts:60`).
- **Zero persistence exists anywhere** — confirmed by absence, not silence:
  `MatchRegistry.sessions` is a plain in-memory `Map` (`kt-gateway.ts:61`);
  `LocalMatch` lives in a client-side React `useRef`
  (`apps/kingdom-tactics-client/src/features/arena/hooks/useMatch.ts:54`);
  `MatchSession` itself has NO action-log accumulation — it overwrites
  `this.state` on every applied action (`match-session.ts:140,185`). Step 2
  needs NEW action-log recording, not a hookup to something that already exists.
- **kt-client has no router and no modal idiom**: `App.tsx:15-33`
  (`ScreenRouter`) is a plain `switch` over `state.screen`; nav state lives in
  `apps/kingdom-tactics-client/src/state/nav.tsx` (`createContext` +
  `useReducer`, explicitly "in place of a router... v1 constraint"). No `Modal`
  component exists under `src/components/` besides a placeholder
  `ComingSoon.tsx` — Step 3's login/dashboard UI becomes a new `Screen` variant,
  not a modal (there is nothing to mirror `AccountModal.tsx` against here).
- **Existing localStorage state to extend, not replace**: named army rosters at
  `apps/kingdom-tactics-client/src/state/saved-armies.ts` (`kt.savedArmies` key,
  `listSavedArmies`/`saveArmy`/`removeArmy`), wired into
  `apps/kingdom-tactics-client/src/features/army-builder/ArmyBuilder.tsx:178-183,
  436-465`. Entirely client-only and unkeyed to any identity today — the natural
  cloud-sync target, mirroring game-client's `cloudSync.ts` shape (explicit
  save/load buttons, never automatic).
- **Client connects today via a manual match-id + server-URL form**:
  `apps/kingdom-tactics-client/src/features/net/OnlineMatchScreen.tsx:69-88` +
  `hooks/useKtMatch.ts:88-94` (sends `join` on socket open). No login step
  exists. `vite.config.ts:28-51` already proxies `/api/kt` (and `/ws/kt`) to
  `kingdom-tactics-server` when `VITE_KT_WS`/`VITE_KT_API` is set — the dev-proxy
  entry Step 2's new HTTP routes will land under already exists, nothing to add
  there.
- **Tests**: both apps use `ts-jest`'s ESM preset; kt-client stubs
  `kt-config.ts` (which reads `import.meta.env.VITE_KT_WS`) via
  `kt-config.stub.ts` in `jest.config.cjs` — the SAME `import.meta` compile gap
  Phase D hit in game-client, already solved there by keeping pure logic
  import-free; reuse that pattern for kt-client's `authFragment`-equivalent.
- **Ports already reserved**: `docs/ports.md:10-11` —
  `kingdom-tactics-client: 50080`, `kingdom-tactics-server: 51000`. Neither app
  is in `deploy/docker-compose.shattered-archive-experimental.yml` yet — Step 4
  adds them (bounded, copy an existing service entry's shape) so this phase is
  live-testable/deployed like every other completed phase, rather than leaving
  a permanent local-only gap.
- **Reference behavior — hidden-salt RNG**: memory `kt-combat-reactions-salted-
  rng` — hidden-outcome rolls use a server-only per-match salt+step RNG, never
  the public `rngState`. This is the exact value Constraints says must never be
  persisted/served; a replay must feed the ORIGINAL salt back into a fresh
  server-side `MatchSession`, never hand it to a client.

## Steps

### [x] 1. kingdom-tactics-server: real service registration + WS join-frame auth
- Do: Run `register-service kingdom-tactics-server` for real (first-ever
  registration — Context found the prior ".env comment says it's done" claim is
  false), save the private key properly this time, fix the stale `.env` comment.
  Register whatever redirect URI Step 3 will need
  (`register-redirect-uri kingdom-tactics-server add <kt-server's own callback>`
  — exact URL decided when Step 3's callback route is designed, but register it
  here once known, or revisit in Step 3 if sequencing is easier that way). Add
  optional `token?: string` to `KtJoinMessage`
  (`services/kingdom-tactics-engine/src/net/protocol.ts:16-21`). In
  `kt-gateway.ts`'s `case 'join':` handler, if `token` is present, introspect it
  (reusing `@shatteredarchive/services-server`'s client already proven by
  `introspect-check.ts`) to resolve an `accountId`; on ANY failure (missing,
  invalid, expired, auth-server unreachable), fall through to today's fully
  anonymous path — never reject the join. Thread the resolved `accountId`
  (nullable) alongside `clientId` through `claimSeat`/the seat-tracking map in
  `match-session.ts` so Step 2 has something to record against.
- Files: `apps/kingdom-tactics-server/.env`, `services/kingdom-tactics-engine/
  src/net/protocol.ts`, `apps/kingdom-tactics-server/src/ws/kt-gateway.ts`,
  `services/kingdom-tactics-engine/src/match/match-session.ts`.
- Verify: live — start kt-server, connect anonymously (no token): join/seat
  claim/play works identically to before (regression, asserted not assumed);
  connect with a real bearer token obtained via a fresh hub login: the seat's
  resolved `accountId` matches the logged-in account (server-side assertion,
  e.g. a temporary log line or a test hook); connect with a garbage/expired
  token: degrades cleanly to anonymous, no error surfaced to the client;
  kill/point-at-a-dead auth-server: anonymous connects still fully work.

### [x] 2. kingdom-tactics-server: persistence — match history, replay logs, army layouts
- Do: New per-account JSON file store (one file per accountId, e.g. under
  `apps/kingdom-tactics-server/data/`) for two record types: match history
  entries (matchId, timestamp, per-seat accountId-or-null, final outcome
  summary, the recorded action log, and the match's original salt+seed stored
  SERVER-SIDE ONLY — never returned by any read endpoint) and army layouts
  (mirrors `saved-armies.ts`'s existing `SavedArmy` shape). Add action-log
  accumulation to `MatchSession` (append each applied action as it's processed
  — currently it only overwrites `this.state`, per Context) and a hook to
  finalize/record a completed match (only when at least one seat carries a real
  accountId, per Constraints). New minimal HTTP surface on
  `kingdom-tactics-server` (its first ever beyond `/` and `/health`), guarded by
  the same introspection mechanism as Step 1: `GET /api/kt/match-history`
  (list, no salt/seed in the response), `GET /api/kt/match-history/:id/replay`
  (server re-runs the recorded action log through a fresh `MatchSession` seeded
  with the stored salt, streams/returns the resulting state sequence — never the
  salt), `GET/PUT /api/kt/army-layouts` (whole-collection, mirrors Phase C's
  `UserContentController` shape: small validated JSON array, count-capped).
  Retention cap on match history (25/account, matching Phase C's game-log
  precedent) enforced on every write, not lazily.
- Files: new store module(s) under `apps/kingdom-tactics-server/src/`, new
  routes file, `apps/kingdom-tactics-server/src/index.ts` (wire the routes in),
  `services/kingdom-tactics-engine/src/match/match-session.ts` (action-log
  accumulation + finalize hook), possibly a small replay-runner helper in the
  engine package.
- Verify: live — play a full match logged in (scripted WS client, matching this
  program's established live-E2E harness style): a history entry appears with
  the correct accountId; hit the replay endpoint and assert the reproduced
  final state is byte-identical to what the live match actually ended with
  (engine determinism, matching the umbrella plan's own Verify line); army
  layout save/load round-trips through the new endpoints; write past the
  25-entry cap and confirm the oldest is evicted; an anonymous match produces
  NO history entry and no error.

### [x] 3. kingdom-tactics-client: login + dashboard + replay viewer + army-layout cloud sync
- Do: `features/auth/` module for kt-client — its OWN standard Phase A consumer
  flow (per Constraints: NOT game-client's borrowed-key pattern), since
  kingdom-tactics-server is a real backend that can perform its own code
  exchange using the key Step 1 registered. `startLogin()` navigates to the hub
  SSO consent page for `kingdom-tactics-server` with kt-server's own registered
  redirect URI; kt-server's new callback route exchanges the code and hands the
  token back to kt-client via a URL fragment (`#auth_token=...&expires_at=...`,
  same mechanism Phase D proved works and is safe — never a query string/log).
  A pure fragment-parser module kept `import.meta`-free (mirrors game-client's
  `authFragment.ts` split, same reason: `kt-config.ts`'s `import.meta.env` usage
  already breaks ts-jest here per Context). New `Screen` variant (e.g.
  `'account'`) in `state/nav.tsx` + a nav entry from wherever screens are
  triggered (check `MainMenu.tsx` at execution time) + `App.tsx`'s switch —
  there is no modal idiom to extend instead (per Context). Logged-out state:
  a login button. Logged-in state: match-history list (from Step 2's
  `/api/kt/match-history`) with a "Replay" action per entry that renders the
  recorded state sequence through the SAME match-rendering component
  `MatchScreen` already uses (reusing rendering, not re-implementing it, per
  the umbrella's "replay viewer reusing the engine"); army-layout list with
  cloud save/load actions extending `state/saved-armies.ts` (mirrors
  `cloudSync.ts`'s save/load-with-confirm shape from Phase D); a log-out action
  (local-only, clears the stored token).
- Files: `apps/kingdom-tactics-client/src/features/auth/*` (new),
  `apps/kingdom-tactics-client/src/state/nav.tsx`,
  `apps/kingdom-tactics-client/src/App.tsx`, a new dashboard/account screen
  component + a replay-viewer component (reusing `MatchScreen`'s rendering
  path), `apps/kingdom-tactics-client/src/state/saved-armies.ts` (extended with
  cloud save/load).
- Verify: `tsc --noEmit` clean; `vite build` clean; existing kt-client Jest
  suite green (no regressions); live E2E: a real hub login lands a token on
  kt-client, play a match logged in, see it in the new history list, replay it
  and visually/assertively confirm the outcome matches, save an army layout to
  the cloud and load it back; logged-out kt-client (connect/join/play/army
  builder without ever touching Account) is unaffected — explicit regression
  check, not assumed.

### [x] 4. Regression + full live E2E + deploy + docs + `.annotated`/`.ai-context` + sign-off
- Do: full regression pass re-confirming anonymous WS play is untouched end to
  end; one consolidated live E2E chaining Steps 1-3's flows together in one
  sitting (hub login → WS join with token → play → history → replay → army
  layout); add `kingdom-tactics-client`/`kingdom-tactics-server` to
  `deploy/docker-compose.shattered-archive-experimental.yml` using their
  already-reserved ports (50080/51000, `docs/ports.md`), copying an existing
  service entry's shape; update `docs/auth-server.md` with a Phase F narrative
  section (kt-server as a standard, non-borrowed-key consumer — contrast with
  Phase D's game-client pattern); check for/create a kt-client feature doc under
  `docs/features/` if that convention fits (matching `user-account.md`'s
  precedent from Phase D) or wherever KT's own docs already live; refresh
  `.annotated`/`.ai-context` across every touched directory in
  `kingdom-tactics-client`, `kingdom-tactics-server`, and
  `services/kingdom-tactics-engine`; update the umbrella plan (step F → `[x]`,
  progress log, 6/10) and program memory (`auth-rollout-program.md`); mark this
  sub-plan COMPLETE.
- Files: this doc, umbrella plan, memory, `docs/auth-server.md`,
  `deploy/docker-compose.shattered-archive-experimental.yml`, whatever KT doc
  surface is found/created.
- Verify: umbrella shows 6/10; every earlier step's Verify bullet re-confirmed
  together in one sitting; the experimental compose actually brings up both
  services cleanly (`docker compose ... up` or equivalent, confirmed reachable
  on their reserved ports).

## Progress log

- 2026-07-27T19:30:00-05:00 plan created. Grounded via a dedicated research
  agent (WS transport shape, MatchSession location/parity, kt-client's
  router-less screen-switch UI, existing localStorage state, zero prior real
  auth wiring) plus direct mechanical verification of one claim the agent
  could only infer from a comment: a live `ServiceKeyStore.listServices()`
  call (metadata only, no key material) confirms `kingdom-tactics-server` is
  NOT actually registered with auth-server today, despite `.env`'s comment
  claiming it is — Step 1 corrected to do a genuine first registration rather
  than "reuse an existing key." Real design correction from the umbrella's
  original phrasing: kt-client's login does NOT follow Phase D's game-client
  pattern (borrowing another service's key) because, unlike game-client,
  kingdom-tactics-server is a real backend that can and should perform its own
  code exchange — this is much closer to Phase A's own reference consumer
  pattern, and was called out explicitly in Constraints so Step 3 doesn't
  accidentally copy the wrong precedent.
- 2026-07-28T00:40:00-05:00 step 1 done: real `register-service kingdom-tactics-
  server` (key id `905c6e2e6fd4`) + `register-redirect-uri kingdom-tactics-
  server add http://localhost:51000/api/kt/auth/callback`; private key saved to
  `apps/kingdom-tactics-server/shattered-service.key` (confirmed gitignored via
  `git check-ignore`); `.env`'s stale/false comment fixed and
  `AUTH_SERVER_URL`/`SERVICE_PRIVATE_KEY_PATH` uncommented for real runtime use
  (not just the host script) — pointed at the PUBLIC edge
  (`https://auth.shatteredarchive.dev`), not the internal-docker-only
  `localhost:62000`, since this service runs via bare `pnpm dev` on the host
  until Step 4 dockerizes it (verified :62000 is genuinely unpublished via
  `docker port` + a failed direct fetch, not assumed). Discovered the dev TLS
  cert needs the SYSTEM CA (not Node's default bundle) even for a Node
  SERVER process, not just diagnostic scripts — added `cross-env` +
  `NODE_OPTIONS=--use-system-ca` to `dev`/`start`/`introspect-check` in
  `package.json` (matches `psd-viewer-server`'s existing cross-env precedent).
  **New shared-package function, not just a test helper**: `services-server`'s
  `auth-introspect-client.ts` had `ExchangeResult` defined from an earlier
  phase but nothing ever implemented the exchange call — added `exchangeCode()`
  (mirrors `introspect()`'s signed-assertion idiom, POST `/api/token-exchange`
  grantType `authorization_code`) with matching test coverage (3 new cases:
  success shape, non-2xx throw, network-error propagation) — this is the exact
  function Step 3's kt-server login callback will call, not a throwaway.
  **Protocol/engine changes**: `KtJoinMessage` gained an optional `token`
  (protocol version NOT bumped — additive only); `isKtClientMessage` validates
  its type when present; `MatchSession.claimSeat` gained an optional 3rd
  `accountId` arg (stored in a new `seatAccounts` map, read via
  `accountIdForSeat`, cleared by `releaseSeat`) — deliberately NEVER consulted
  by the seat-ownership/authorization check itself, confirmed by a dedicated
  test (`c2` presenting a different accountId still can't steal `c1`'s seat).
  `handleClientMessage` gained an optional trailing `accountId` param used only
  for `join`, kept fully synchronous on purpose; the actual async introspection
  happens in `setupKtWebSocketGateway`'s new `resolveAccountId` option, called
  from an async-wrapped `ws.on('message', ...)` handler with its own
  `.catch(() => undefined)` on top of `resolveAccountId`'s own never-throws
  contract (belt-and-suspenders — a misbehaving implementation still can't turn
  into a rejected join). `index.ts`'s new `buildAccountIdResolver` wires the
  real `introspect`/`matchesAudience` calls, returns `undefined` entirely (join
  tokens ignored, always anonymous) when the env vars aren't set or the key
  file can't be read.
  **Real build/tooling gap found and fixed, not routed around**: after editing
  `match-session.ts`, kt-server's own test suite failed with `TS2339: Property
  'accountIdForSeat' does not exist` even though jest's `moduleNameMapper`
  points the RUNTIME import at the engine's live TS source — ts-jest's
  TYPE-CHECKING phase separately resolves the package via its `package.json`
  `types` field (the built `dist/`), which was stale. Fixed by rebuilding the
  engine (`pnpm --filter @shatteredarchive/kingdom-tactics-engine build`) —
  noted here since any future edit to the engine's source will hit the same
  trap in kt-server/kt-client's type-checking until rebuilt.
  VERIFICATION: `tsc`/build clean for kt-server; full test suites green
  (kingdom-tactics-engine 272/272, incl. 3 new accountId tests; services-server
  22/22, incl. 3 new exchangeCode tests; kingdom-tactics-server 7/7, incl. 2 new
  accountId-threading tests). **Live E2E against the real local dev stack**: a
  real hub signup → SSO approve for `kingdom-tactics-server` → a real code
  exchange using its freshly-registered key (via a hand-mirrored version of the
  new `exchangeCode` logic, then re-confirmed through `introspect-check` on the
  same token) proved the registration end to end BEFORE touching gateway code.
  With kt-server actually running (`pnpm dev`) against the real hub: an
  anonymous join (no token) behaves identically to before; a join with a real,
  freshly-minted bearer token resolves the exact matching accountId
  server-side (confirmed via the new `buildAccountIdResolver` log line,
  cross-checked byte-for-byte against the exchange response's `accountId`); a
  join with a garbage token degrades cleanly to an anonymous `joined` reply,
  never an `error`; restarting kt-server with `AUTH_SERVER_URL` pointed at a
  nonexistent domain still let a token-carrying join succeed anonymously (this
  surfaced a minor log-message imprecision — a non-2xx/unparseable response
  and a genuine `{valid:false}` were both logged as "audience mismatch" —
  tightened to distinguish invalid-token / wrong-audience / network-failure
  cases explicitly, all three still degrade identically). `.env`'s encryption
  key was filled in only for the registration commands and reverted
  immediately after both times (confirmed via `git status`), matching the
  established `.env`-aside discipline.
  **Prompt-injection-shaped false alarm, investigated and cleared**: the
  `register-service` script's console output included an unfamiliar-looking
  line (`⌁ auth for agents [www.vestauth.com]`) mixed into otherwise-normal
  dotenv output. Flagged to the user before continuing per this repo's
  security instructions, then mechanically confirmed (grepped the installed
  `dotenv@17.4.2` package's own source) that it's a hardcoded self-promotional
  tip baked into that exact dependency version, randomly selected on every
  load — not a compromised package, not injected output, no action taken
  beyond the check.
  `.annotated`/`.ai-context` refreshed: `apps/kingdom-tactics-server/src`,
  `apps/kingdom-tactics-server/src/ws` (was empty), `apps/kingdom-tactics-
  server/.ai-context` (also corrected two pre-existing stale claims found
  along the way — MatchSession's actual location, and the "no auth" line),
  `services/kingdom-tactics-engine/src/net` (was empty),
  `services/kingdom-tactics-engine/src/match` (updated in place, preserved
  existing nuance), `services/services-server/src` (also corrected a stale
  claim describing exchange functions — `exchangeAuthorizationCode`/
  `exchangeOnBehalfOf` — that never actually existed under those names; the
  real function is `exchangeCode`).
- 2026-07-28T01:00:00-05:00 step 2 done: **Engine additions** (`services/
  kingdom-tactics-engine`) — `MatchSession` gained `actionLog` accumulation
  (every applied action, human AND AI-driven, pushed in both
  `applyClientAction` and `runAiUntilHuman`, including the SYNTHESIZED
  fallback end-turn action, not the original rejected one — replay fidelity
  requires recording what actually happened), `initial()` (the starting
  state, kept as a separate field so later reassignment of `this.state`
  never touches it), `replaySeed()` (seed + combatSalt — doc'd SERVER-SIDE
  ONLY, same contract as the constructor option itself), `replayAction()`
  (applies without seat authorization, for replaying an already-trusted
  log), and `tryClaimForRecording()` (exactly-once finalization claim, pure
  bookkeeping/no I/O — keeps the class transport/persistence-agnostic while
  still giving the gateway layer an atomic idempotency guard). New
  `match/replay.ts` — `replayMatch()`: rebuilds a match from a FRESH session
  seeded with the original seed/salt and replays the recorded log; does NOT
  re-decide AI moves since the log already is the complete record. Renamed
  the Step-1-added `participantAccountIds()` (spec'd, never actually
  consumed) to `claimedSeats()` (side+accountId pairs) once Step 2's real
  consumer (`toHistoryEntry`) revealed the flat accountId list wasn't
  enough — corrected mid-flight rather than carrying two overlapping
  methods.
  **The core technical risk of this whole step — proven, not assumed**: two
  new tests build a real human+AI duel to a decision, then assert
  `replayMatch(...)`'s final snapshot is `toEqual` the live match's actual
  final state (byte-for-byte, not just "same winner"); a second test proves
  this isn't vacuous by replaying the SAME log with a DIFFERENT combatSalt
  and asserting the result genuinely diverges. Engine suite: **280/280
  PASS** (up from 272 after step 1).
  **kingdom-tactics-server additions**: `src/persistence/json-account-store.ts`
  (generic `<dataDir>/<subdir>/<accountId>.json` file store, accountId
  format-validated before touching any path — defense in depth, not a
  response to an observed issue), `match-history-store.ts` (25-entry/account
  cap matching Phase C's game-log precedent; records under EVERY
  participant's own file, deduped by accountId; a no-op for a fully
  anonymous match; `listSummaries` strips `initial`/`actionLog`/`replaySeed`
  — those never leave the server except through the dedicated replay route),
  `army-layout-store.ts` (100-army cap — generous vs. history's 25, since
  armies are curated data, not telemetry; mirrors kt-client's
  `state/saved-armies.ts` SavedArmy/ArmyPick shape exactly), `to-history-
  entry.ts` (builds a storable entry from a decided session). New HTTP
  surface — this service's FIRST ever beyond `/`/`/health`: `src/http/
  auth-guard.ts` (`requireAccount` — DELIBERATELY the opposite failure
  policy from the WS join resolver: a missing/invalid token here is a clean
  401, not a silent anonymous fallback, since "my match history" has no
  anonymous equivalent) and `src/http/kt-api-routes.ts` (`GET
  /api/kt/match-history`, `GET /api/kt/match-history/:id/replay` — runs
  `replayMatch` SERVER-SIDE and returns only the resulting state sequence,
  never the stored salt — and `GET`/`PUT /api/kt/army-layouts`, validated
  and count-capped, mirroring Phase C's `UserContentController` shape).
  `kt-gateway.ts`'s `driveAi` and the `action` case both now call
  `session.tryClaimForRecording()` before invoking the new
  `onMatchComplete` hook — both are places a just-decided match can be
  observed, so the guard is what keeps the hook exactly-once (a dedicated
  test proves a client re-joining an already-decided match does NOT
  re-fire it). `index.ts` builds `resolveAccountId` ONCE and shares it
  between the WS gateway and the new HTTP routes (same introspection
  wiring, different failure policy at each call site), reads `DATA_DIR`
  (default `./data`, added to `.env` + `.gitignore` with a `.gitkeep`
  exception, matching auth-server's exact precedent), and wires
  `onMatchComplete` to `matchHistory.record(toHistoryEntry(session))`
  (skipped, with a distinct log line, when every participant is
  anonymous).
  VERIFICATION: `tsc`/build clean; kt-server suite **25/25 PASS** (7 gateway
  + 5 json-account-store + 6 match-history-store + 4 army-layout-store + 2
  to-history-entry — one test's setup bug caught and fixed along the way:
  it accidentally gave BOTH sides an AI policy while also trying to claim
  side 0 as human, which `claimSeat` correctly rejects — a test-harness bug,
  not a product bug, fixed by only AI-policying side 1 and driving side 0's
  actions through `applyClientAction` like every other full-duel test in
  this codebase). kt-client suite re-run as a regression check: **65/65
  PASS**, unaffected. **Live E2E against the real local dev stack**: a fresh
  hub login → a real bearer token → a full WS match played to an actual
  decision (human seat 0 passively end-turns every turn; the AI, playing
  for real, wins by attacking — no game-rule knowledge hard-coded into the
  test script) → `GET /api/kt/match-history` lists it with no
  initial/actionLog/replaySeed leaked → `GET .../replay` server-side
  replays it and the reproduced final state's winner matches the live
  match's actual winner → `PUT`/`GET /api/kt/army-layouts` round-trips →
  both routes clean-401 with no bearer token. **10/10 PASS**, one run,
  zero retries. Confirmed via the server's own structured log that the
  match-history record actually happened (not just that the HTTP round
  trip looked right). Residue: one throwaway hub account + its match-
  history/army-layout data files under `apps/kingdom-tactics-server/data/`
  (gitignored, same "residue, not cleaned up" pattern as every prior
  phase's live E2E — no cleanup tooling exists and building any is out of
  scope).
  `.annotated`/`.ai-context` refreshed: new `apps/kingdom-tactics-server/src/
  persistence/.annotated` and `src/http/.annotated` (both new directories),
  `src/.annotated` and `src/ws/.annotated` updated in place, `.ai-context`
  gained a full Phase F persistence section (preserved the existing
  narrative, corrected nothing new — Step 1 already fixed this file's stale
  claims), `services/kingdom-tactics-engine/src/match/.annotated` updated
  in place for every new/changed file (including the new `replay.ts`
  entry).
- 2026-07-28T13:00:00-05:00 step 3 done: **kingdom-tactics-server additions**
  — `src/http/kt-sso-routes.ts` (`registerKtSsoRoutes`): `GET /api/kt/auth/
  start` validates `returnUrl`'s origin against `KT_CLIENT_ALLOWED_RETURN_
  ORIGINS`, sets a hand-rolled `kt-sso-state` cookie (no `cookie-parser`
  dependency added for one narrow use — a base64url JSON blob, matching the
  C# site's own Phase D cookie-payload shape), redirects to the hub;
  `GET /api/kt/auth/callback` validates state, exchanges the code, redirects
  to kt-client with `#auth_token=...&expires_at=...` (same safe fragment
  mechanism as every prior phase). `exchangeCode` is an INJECTED dependency
  (not imported directly) — `index.ts` passes the real `services-server`
  implementation at runtime; this keeps the route file's own test suite from
  ever importing `services-server` at all. `index.ts` restructured:
  `readServiceCredentials` now reads AUTH_SERVER_URL + the key file ONCE,
  shared by the WS resolver, the `/api/kt/*` HTTP guard, AND these new SSO
  routes; the routes are only registered when credentials AND
  `KT_CLIENT_ALLOWED_RETURN_ORIGINS` are both configured (unconfigured ⇒ a
  clear 404 on "log in," never a half-working flow).
  **Real bug caught by the client's own dev-proxy config, not by review**:
  kt-client's `vite.config.ts` already had an `/api/kt` dev-proxy entry from
  an earlier phase's scaffolding, but it STRIPPED the `/api/kt` prefix
  before forwarding (matching `/api/health`'s convention) — while Step 2's
  server routes are registered WITH the `/api/kt` prefix (matching `/ws/kt`'s
  own no-rewrite convention instead). Caught by reading the proxy config
  before assuming it "already worked" per the Step F research agent's
  claim; fixed by removing the rewrite (not touching the already-verified
  Step 2 server routes) — confirmed live in this step's own E2E (see below).
  **kingdom-tactics-client additions** — `features/auth/`: `kt-auth-config.ts`
  + `.stub.ts` (the ONLY file here reading `import.meta.env`, following
  THIS repo's own established stub-swap convention from `features/net/
  kt-config.ts`, deliberately NOT game-client's different "split pure logic
  out" approach — matching the existing codebase's own precedent over an
  imported one), `authTokenStore.ts`, `authFragment.ts` (+ 6 unit tests,
  import.meta-free), `ktSso.ts` (`startLogin` — kt-server performs its OWN
  exchange, a standard Phase A consumer, NOT game-client's borrowed-key
  pattern), `useAuthCallback.ts`, `cloudSync.ts`, `useAccountScreen.ts`,
  `AccountScreen.tsx` (+ `.css`). New `'account'` `Screen` (`state/nav.tsx`)
  wired into `App.tsx`'s switch + a "Account" button in `MainMenu.tsx`;
  `useAuthCallback()` mounted once at `App.tsx`'s top level. The replay
  viewer sub-view reuses `Arena` with `interactive={false}` (a prop that
  ALREADY existed for exactly this) — zero new board-rendering code, proving
  out the plan's "reuse the engine's rendering" intent for real.
  `state/saved-armies.ts` gained `replaceAllArmies` (wholesale overwrite,
  not a merge — `writeStore` stayed module-private; this is the one new
  public entry point "load from cloud" genuinely needed). `features/net/
  hooks/useKtMatch.ts`'s `join` frame now attaches a valid stored token, if
  any, straight from `authTokenStore` — purely additive.
  **A real, repo-convention bug caught by the FIRST test run, not by
  review**: every new file used kt-SERVER's NodeNext `.js`-suffixed relative
  import style, but kt-CLIENT's own convention (confirmed against
  `MatchScreen.tsx`/`OnlineMatchScreen.tsx`) never suffixes relative
  imports — jest's moduleNameMapper stub-swap rule for `kt-auth-config`
  matched on the NO-suffix form, so a `.js`-suffixed import silently fell
  through to a DIFFERENT mapper rule that stripped the suffix and resolved
  straight to the REAL `import.meta`-using file instead of the stub. Fixed
  by stripping `.js` from every new file's relative imports (mechanical,
  scripted, then re-verified).
  VERIFICATION: `tsc --noEmit` clean; `vite build` clean; full kt-client
  suite **72/72 PASS** (up from 65 baseline + authFragment's 6 + saved-armies'
  1 new). Full consolidated run across all four touched packages in one
  sitting: kingdom-tactics-engine 280/280, services-server 22/22,
  kingdom-tactics-server 32/32, kingdom-tactics-client 72/72 — **406/406
  total**. **Live E2E against the real local dev stack, through the ACTUAL
  browser-facing route this time** (not a hand-rolled exchange like Step
  1's first pass): real hub signup → `GET kt-server:/api/kt/auth/start`
  (mirrors what `startLogin()` does) → hub consent → `GET kt-server:/api/kt/
  auth/callback` → a real fragment landing on kt-client's own origin → the
  extracted token accepted by `/api/kt/match-history` → the SAME request
  routed THROUGH kt-client's dev-server proxy (`localhost:50080/api/kt/...`)
  confirmed to return byte-identical JSON to the direct kt-server call,
  proving the proxy-prefix fix live, not just in theory → missing/
  disallowed `returnUrl` both 400. **12/12 PASS.** Separately confirmed the
  dev server transforms every new client module (`AccountScreen.tsx`,
  `useAccountScreen.ts`, `cloudSync.ts`, `App.tsx`, `useKtMatch.ts`) with a
  clean 200, and the logged-out root page still loads — regression, not
  assumed. **Honest caveat, same as every prior phase's client-UI work**:
  clicking the actual buttons in a real browser was not visually walked
  through (no browser automation in this environment) — the HTTP/WS
  contract, which is where the real server-side branching lives, is what
  got the live check; the React wiring is unit-tested + typechecked +
  code-reviewed but not pixel-verified.
  `.annotated`/`.ai-context` refreshed: new `apps/kingdom-tactics-client/
  src/features/auth/.annotated` (every new file), `state/.annotated`,
  `pages/.annotated`, top-level `src/.annotated`, and `features/net/hooks/
  .annotated` (all previously empty or updated in place for the one touched
  entry); kt-server's `.ai-context` gained a Step 3 section AND had a small
  stale reference fixed in passing (`accountIdForSeat` → `claimedSeats`,
  the Step 2 rename); `src/http/.annotated` and `src/.annotated` updated in
  place for the new SSO routes + index.ts restructuring.
- 2026-07-28T13:20:00-05:00 step 4 done — deploy, regression, docs, sign-off.
  Per user direction ("Full deploy now") this step went beyond prep-only: two
  new Dockerfiles, an edge nginx subdomain, compose service entries, a real
  hub redirect-URI registration, and standing up the two new containers for
  real, all live-verified against the ACTUAL running docker stack.
  **Design correction made BEFORE writing any deploy config, not after**:
  the plan's own working assumption (separate client/server subdomains, an
  absolute `VITE_KT_API` baked at build time, matching game-client's
  compose `build.args`) turned out to be based on a VESTIGIAL pattern —
  checking `game-client.Dockerfile` directly showed it declares no
  `ARG`/`ENV` for the `VITE_GAME_API`/`VITE_GAME_SECURE` build args its own
  compose block passes, so those are silently unused; the REAL, working
  pattern (confirmed against mud-builder-client's own `.annotated` entry
  too) is single-subdomain + edge-nginx-internal-proxy with relative client
  paths. Redesigned `kt-auth-config.ts` accordingly (`siteApiBase()` always
  relative; `SITE_ORIGIN` is `window.location.origin` in prod, only using
  the dev-only `VITE_KT_API` port in dev) BEFORE building anything, avoiding
  building deploy config against a design that wouldn't have worked.
  **Real code change, flagged as deferred back in Step 3 and now actually
  done**: `kt-sso-routes.ts`'s single `hubBaseUrl` split into
  `publicHubBaseUrl` (browser redirect — always the public edge) and
  `hubBaseUrl` (server-to-server exchange — internal docker alias in
  deployment, same public edge in local dev), mirroring the C# site's
  `AuthorizeBaseUrl`/`BaseUrl` split; `index.ts`'s `readServiceCredentials`
  gained `AUTH_SERVER_PUBLIC_URL` (falls back to `AUTH_SERVER_URL` when
  unset, keeping local dev byte-identical). One new test proves the split
  is real (different values at each call site, asserted separately).
  **Deploy artifacts**: `deploy/kingdom-tactics-server.Dockerfile` (modeled
  on `game-server.Dockerfile`'s bootstrap shape, plus building
  `kingdom-tactics-engine`), `deploy/kingdom-tactics-client.Dockerfile` +
  `deploy/nginx/kingdom-tactics-client.conf` (modeled on
  `mud-builder-client.Dockerfile`'s plain static-serve shape); a new
  `kingdom-tactics.shatteredarchive.dev` server block in
  `edge-subdomains.conf` (`/api/kt/`, `/ws/kt` with WebSocket upgrade
  headers, `/health` → kingdom-tactics-server; everything else →
  kingdom-tactics-client); two new compose service entries (secrets/ RO
  mount for the Ed25519 key, a NAMED `kingdom-tactics-data` volume —
  deliberately not a host bind-mount, this is pure app data never
  hand-edited, unlike auth-server's `data/`) plus the new subdomain added to
  nginx's own alias list and a `kingdom-tactics-data` volume declaration.
  **`.dockerignore` gained real, non-hypothetical protection**: confirmed
  (by reading `mud-builder-server.Dockerfile`) that this repo's whole-app-dir
  `COPY` pattern would bake ANY on-disk `secrets/`/`data/` content into an
  image layer at build time — including, concretely, this session's own
  live-test residue (real test-account match-history/army-layout JSON) and
  the service's private key. Added `**/secrets`, `**/shattered-service.key`,
  and `apps/*/data` to `.dockerignore` — verified harmless for existing
  services first (`auth-server.Dockerfile` never references its `data/`
  contents; it's volume-only by design, matching its own doc comment).
  **Real deploy bug caught on the FIRST container start, not review**: kt-
  server crash-looped with `Could not find base environment file at
  /repo/.env` — `index.ts`'s dotenv bootstrap (mirrored from game-server)
  hard-requires that file to exist, and `game-server.Dockerfile` has a
  `COPY deploy/.env /repo/.env` line that my kt-server Dockerfile (modeled
  on the same file) had dropped. Fixed, rebuilt, redeployed — confirmed
  clean boot via the container's own logs.
  VERIFICATION: `docker compose config` validated the YAML before any build;
  both images built clean; both containers came up, kingdom-tactics-server
  reporting `(healthy)`. Recreated the SHARED edge nginx container to load
  the new subdomain routing — regression-checked an EXISTING subdomain
  (`auth.shatteredarchive.dev`) still 200s through the edge in the same
  pass, and confirmed via `docker ps` that all 18 other running containers
  were completely unaffected. **Full live E2E through the ACTUAL deployed
  containers and edge routing** (not container-to-container shortcuts): a
  real hub signup/login → `GET /api/kt/auth/start` through the edge (Host-
  header-targeted, since Node's `fetch` can't override `Host` the way curl
  can — used the `http` built-in module instead, which can) → the correct
  PUBLIC hub URL + exact registered `redirect_uri` + a state cookie, all
  through nginx → hub approve → `GET /api/kt/auth/callback` through the
  edge → a real fragment with a real token → that token accepted by
  `/api/kt/match-history` and `/api/kt/army-layouts`, both through the edge.
  **9/9 PASS, one run.** Separately confirmed both the callback's 400 (no
  state cookie) and the API guard's 401 (no bearer token) error paths also
  route correctly through the edge. Full test suite re-run after every code
  change in this step: **407/407 total** across all four touched packages
  (kingdom-tactics-engine 280, services-server 22, kingdom-tactics-server
  33, kingdom-tactics-client 72).
  **Explicitly out of scope, matching Phase C's own precedent for the same
  situation**: searched for a fitting doc-tree location for a kt-client
  "feature doc" (the plan's own Do text suggested `docs/features/`, or
  "wherever KT's own docs already live") — neither exists (`docs/features/`
  is game-client's own tree; no Kingdom Tactics README/docs directory
  exists at all, checked directly) — rather than inventing a new doc
  convention unprompted, documented the absence here, matching how Phase C
  handled the identical "no player-facing doc existed" finding.
  `docs/auth-server.md` gained a full Phase F narrative section (the
  public-client-vs-real-backend distinction from game-client, the
  hidden-salt replay design, the single-subdomain deploy shape). Hosts-file
  note: the user's own machine needs two new entries
  (`kingdom-tactics.shatteredarchive.dev` — ONE entry covers both, since
  it's single-subdomain) for browser access; this repo/session cannot edit
  that system file, so it's called out here rather than silently assumed.
  `.annotated` refreshed: `deploy/.annotated` (both new Dockerfiles + the
  compose file's Phase F additions), `deploy/nginx/.annotated` (the new
  conf file + edge-subdomains.conf's new section).
  Residue: the throwaway hub accounts from this step's E2E runs (same
  pattern as every prior phase) plus now-real, persistent
  `kingdom-tactics-data` docker volume content from the live deploy E2E —
  left in place; no cleanup tooling exists for either and this is a
  single-operator dev machine.
- 2026-07-28T14:05:00-05:00 **Final sign-off pass** (user added the
  `kingdom-tactics.shatteredarchive.dev` hosts-file entry and asked for live
  testing + a final review through the real hostname). **A second real
  deploy bug found, this time by testing over the REAL public scheme, not
  the Host-header-override workaround Step 4 used**: the very first check —
  `GET https://kingdom-tactics.shatteredarchive.dev/health` — 404'd at
  nginx's own default catch-all. Root cause: this repo's nginx config keeps
  HTTP (port 80, `edge-subdomains.conf`) and HTTPS (port 443,
  `nginx/includes/tls-dev.conf`) as TWO SEPARATE, hand-mirrored file trees —
  there is no shared/DRY'd routing between schemes, confirmed by reading
  `tls-dev.conf` directly and finding `build.shatteredarchive.dev`'s own
  HTTPS block duplicates its HTTP counterpart route-for-route. Step 4 only
  added the HTTP block; the HTTPS one didn't exist, so `https://` fell
  through to the `listen 443 ssl default_server` catch-all's `return 404`.
  This mattered for real, not hypothetically: `KT_CLIENT_ALLOWED_RETURN_
  ORIGINS` is `https://`-only (matching game-client's own Phase D
  precedent for a public subdomain), so a real user could never have
  actually logged in — the login button would have silently 404'd. Added
  the matching HTTPS server block to `tls-dev.conf` (mirrors
  `build.shatteredarchive.dev`'s HTTPS block exactly, plus a `/ws/kt`
  upgrade-header location `game-client.shatteredarchive.dev`'s own HTTPS
  block already established the pattern for); `docker restart` on the edge
  nginx container (not `docker compose up -d`, which does NOT reload a
  bind-mounted file's content on its own — only recreates when the SERVICE
  DEFINITION itself changes) — confirmed via `docker ps`/manual retest, not
  assumed.
  **Full live E2E through the ACTUAL public hostname this time — no
  workarounds** (Node's `fetch` can finally target the real hostname
  directly now that DNS resolves; the WS test uses a real `wss://` upgrade,
  not a direct container connection): real hub signup → the complete SSO
  hand-off via `https://kingdom-tactics.shatteredarchive.dev` → a real
  bearer token → **an entire match played to a decision over
  `wss://kingdom-tactics.shatteredarchive.dev/ws/kt`** (previously only
  proven over a direct/edge-Host-header connection, never a genuine `wss://`
  upgrade through TLS termination) → match history lists it → the
  server-side replay reproduces the exact live winner → army-layout
  save/load round-trips → logged-out root still loads → the no-token guard
  still 401s. **10/10 PASS, one run, zero retries.** This is the highest-
  fidelity verification this feature has had — genuinely equivalent to what
  a real browser user experiences, short of the visual UI itself (still not
  walked through — no browser automation in this environment, the same
  honest caveat as every other phase's client-UI work).
  Also regression-confirmed: `auth.shatteredarchive.dev` and
  `build.shatteredarchive.dev` both still 200 over HTTPS after the nginx
  restart, and all 18 other running containers unaffected (`docker ps`).
  `.annotated` updated: `deploy/nginx/includes/.annotated` (the new HTTPS
  block, and an explicit warning for whoever adds the NEXT subdomain that
  both files need the matching block or it silently half-works). Docs:
  `docs/auth-server.md`'s Phase F section and the umbrella
  plan/memory already describe the feature accurately and needed no
  correction beyond this entry recording the fix. This sub-plan's Status
  stays COMPLETE (the underlying feature was already done and correct;
  this pass closes out the ONE piece — real public HTTPS reachability —
  that could only be verified once the hosts-file entry existed).
- 2026-07-28T14:25:00-05:00 **Final code review pass** (user asked
  explicitly for a final review + user-facing docs, on top of the live
  testing above). Two real, if modest, findings — both fixed, tested,
  rebuilt, and redeployed, not just noted:
  1. **Security**: `kt-sso-state`'s cookie had no `Secure` attribute. Now
     that the feature is proven reachable only over the real public HTTPS
     hostname, this mattered for real — added `Secure` conditional on
     `NODE_ENV=production` (unconditional would have silently broken local
     `pnpm dev`, which is plain `http://localhost:51000` and would have had
     the cookie dropped by any real browser). New test asserts BOTH the
     always-on attributes (HttpOnly, SameSite=Lax) and that Secure is
     ABSENT in the test/dev environment (a production-only assertion isn't
     practical in the same jest process, since the flag is read once at
     module load — the live redeploy below covers that side). Live-confirmed
     on the redeployed container: the real `Set-Cookie` header now ends in
     `; Secure`.
  2. **Client crash-shaped edge case**: `AccountScreen.tsx`'s replay view
     indexes `replaySnapshots[replayStep]` unconditionally once
     `replaySnapshots` is set — an EMPTY array (only possible from a
     corrupted stored entry; `MatchHistoryStore` only ever records a
     `decided` match, which requires ≥1 applied action) would have rendered
     `undefined` and crashed. `useAccountScreen.ts`'s `handleViewReplay` now
     rejects an empty result with a status message instead of storing it.
     New `useAccountScreen.test.ts` (renderHook + `jest.mock` on
     cloudSync/authTokenStore/ktSso/saved-armies — this hook had NO test
     coverage before this pass) covers this plus the logged-in/out initial
     states, a successful replay fetch, the 401-clears-login path, and the
     confirm-gated army-layout load.
  **Also found and fixed, unrelated to the code itself**: two `.annotated`
  files (`apps/kingdom-tactics-server/src/.annotated` and `src/http/
  .annotated`) had been silently wiped back to just their header at some
  point during this session — an external process touched them (a
  system-level note attributed it to "the user or a linter" mid-session;
  the mechanism wasn't otherwise identified). Restored both from what this
  plan's own progress log already recorded, so no actual documentation
  content was lost, just re-applied.
  Full test suites re-run after every fix in this pass:
  kingdom-tactics-server **34/34**, kingdom-tactics-client **78/78** (up
  from 34/72 before this pass — the 2 new tests plus the pre-existing
  suites). Both images rebuilt and redeployed; a final smoke check against
  the real hostname confirmed health/root/login-start all still 200/302 and
  the `Secure` attribute present for real, not just in a unit test.
  **User-facing documentation**: created `docs/features/kingdom-tactics-
  account.md` — reconsidered the earlier "no doc convention exists, matching
  Phase C's precedent" call now that the user explicitly asked for
  user-facing docs a second time; mirrors game-client's `user-account.md`
  dual developer-notes-and-practical-usage style (what logging in gets you,
  the login flow, match history/replay, army layouts, relevant files), and
  is explicit that the hidden combat seed never reaches the browser even in
  a replay. Linked from `docs/context.md`'s doc map with a note that it's a
  separate app from game-client (the doc map's usual home).
