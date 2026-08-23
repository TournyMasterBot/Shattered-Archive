# Plan: Wire merc-mud into the ecosystem as "Simulacrum" — gated relay service, resource caps, public rollout

Created: 2026-08-16T07:01:48-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Expose the merc-mud engine (`C:/Projects/merc-mud`) at `simulacrum.shatteredarchive.dev`,
reachable ONLY by trusted+ auth.shatteredarchive.dev accounts, through a NEW, dedicated
`apps/simulacrum-server` that gates every connection (web via game-client's existing generic connect
flow, and the standalone mobile app — both untouched) before any bytes reach the engine — cap the
container's resources as a long-lived throwaway demo, and update the public landing page + privacy
notice once it's live.

> **Follow-on plan**: `20260816-0724-simulacrum-master-account-characters.md` builds on this plan's
> Step 1 — specifically the access-code gate's already-resolved `accountId` — to auto-link brand-new
> characters to their hub account and sync them to the DSL/Server dashboard. It does NOT mint a
> second code; the SAME access code that gates the connection (this plan) is reused, in-band, for
> account-linking too. Do that plan's Step 1 only after this plan's Step 1 is done and verified.

## Goal

A visitor CANNOT reach simulacrum unless signed in to auth.shatteredarchive.dev at `trusted` tier or
above — an anonymous or under-tier connection attempt, from EITHER game-client's ordinary Connect
flow or the standalone mobile app, is rejected before merc-mud is ever dialed. A trusted+ user reaches
`simulacrum.shatteredarchive.dev` through game-client's ordinary, generic Connect flow — no
simulacrum-specific UI in game-client itself — types the access code minted from simulacrum-server's
own small sign-in page as the first line of the session, and is relayed to the actual merc-mud engine
over a private docker network; merc-mud's raw port is never reached directly by anything outside that
network. Anonymous, read-only insight into what simulacrum's world CONTAINS still exists — but through
mud-builder-client's existing open GET routes, never through connecting and playing. MUD Builder's own
write surface is split three ways: anyone can view (unchanged), `trusted`+ can draft private content
via the existing snippets mechanism but cannot touch the real area files, and a NEW `builder` tier
(plus manager/admin/owner above it) can persist, hot-reload, and trigger engine rebuilds/copyovers.
`trusted`+ tier is shared, via one role store, between mud-builder-server and simulacrum-server — a
grant in one governs both. The merc-mud container has a hard cpu/memory ceiling. `deploy/index.html`
and `deploy/privacy.html` accurately describe both newly-live demos, including the access-gated nature
of simulacrum. Reached when: an anonymous or `user`-tier connection to simulacrum is refused end to
end (web AND mobile), a trusted+ connection with a valid code succeeds, mud-builder's three-way split
enforces correctly, the shared role grant is provably the same data in both services, the container's
resource limits are visible in `docker inspect`, and both landing pages are live and correct.

## Constraints

- **game-server and game-client stay generic and DSL-primary — still true even with the new
  connection-time gate.** The gate lives entirely inside `simulacrum-server`'s relay, expressed as
  ordinary bytes over the wire (a text prompt, one line of typed input) — game-client's EXISTING
  generic Connect flow (typed host:port) and game-server's EXISTING generic allowlist+relay mechanism
  need ZERO source changes for this plan. This was true before correction 5 (below) and remains true
  after it.
- **REVERSED by explicit new requirement (correction 5): the connection itself IS the access-control
  point after all.** Correction 4 concluded "the real access-control mechanism is NOT a
  connection-time gate" — a direct follow-up review against fresh requirements contradicts that:
  "Only trusted users or higher may connect... Simulacrum will reject connections from anonymous
  users... this is not a public mud, it is a demo tool." This is now the plan's primary
  access-control mechanism, not the follow-on plan's in-MUD character link (which remains, narrowed
  to account-LINKING a new character rather than gating the connection, in the follow-on plan).
- **Mobile bypasses game-server entirely — confirmed, and it's why the gate can't live client-side at
  all.** `shatteredarchive-mobile`'s `ConnectModal`/`TelnetSocket`
  (`dsl-client/components/ConnectModal.tsx:37-38,78-79`,
  `dsl-client/features/connection/game-socket.ts`) dials a raw TCP/TELNET connection DIRECTLY to
  whatever host:port the user types, via `react-native-tcp-socket`, with NO allowlist and NO identity
  check of any kind, completely independent of its own SSO login (`game-sso.ts:47-77` only fetches a
  bearer token, unused for connection gating). game-server's `/ws/game` gateway (the web path) ALSO
  carries zero per-user identity today. The only place that can gate BOTH clients uniformly, without
  adding MUD-specific weight to either generic client, is the protocol byte stream itself —
  `simulacrum-server`'s relay, which both clients' raw TCP connections pass through either way.
- **The access code is the ONE mechanism serving both purposes — connection gating (this plan) and,
  per the follow-on plan, new-character account-linking.** A trusted+ user mints a single-use,
  short-lived code from simulacrum-server's own small sign-in page; the relay reads it as the
  session's first line, validates it (file + a LIVE re-check against the shared role-store — a
  revoked grant takes effect on the very next connection attempt), and REJECTS — closing the socket
  before ever calling `net.connect` to merc-mud — on failure, timeout, or missing code. merc-mud never
  sees a rejected attempt at all. On success the relay becomes a plain byte-pipe for the rest of the
  session (still no per-byte protocol awareness beyond that one line) — this plan's own scope stops
  there; passing the resolved accountId onward to merc-mud so a NEW character can be linked to it is
  the follow-on plan's addition, layered on top of this same relay.
- **`trusted`+ tier must be SHARED between mud-builder-server and simulacrum-server, not two
  independently-administered lists (new requirement).** `SERVICE_TIERS` is architecturally
  "deliberately duplicated... rather than imported across the app boundary" PER SERVICE
  (`services/services-server/src/auth-tiers.ts` header) — a real, intentional pattern elsewhere in
  this codebase. This plan carves out a deliberate EXCEPTION for these two specific services: both
  point their `RoleStore` at the SAME `roles.json` file (a shared bind mount), so a grant made once in
  mud-builder-client's existing Roles tab governs both. Nothing else about either service's local data
  (master key, local API keys, audit log) is shared — only the tier grants.
- **A new `builder` tier is added to `SERVICE_TIERS`, between `manager` and `trusted`** (explicit
  choice: a genuinely new tier, not a rename of `manager` or an informal reuse of it). New ladder:
  `owner > admin > manager > builder > trusted > user`. This is additive — existing stored
  `roles.json` grants (`manager`/`trusted`/etc.) remain valid values, no migration needed — but it's a
  change to a SHARED constant; `mud-builder-server` is confirmed (repo-wide grep) to be the ONLY
  consumer of `SERVICE_TIERS`/`tierRank` from the shared package today (soulsteel-server,
  scrum-poker-server, kingdom-tactics-server, web-server, game-server import OTHER things from
  `@shatteredarchive/services-server`, never this), so the blast radius is real but narrow.
  `apps/mud-builder-client/src/api/client.ts:446` has its OWN un-imported literal copy of the same
  list for the Roles-tab dropdown — MUST be updated too or the UI can't grant the new tier.
- **mud-builder-server's write surface gets a real three-way split (new requirement), not the blanket
  trusted+ floor originally planned.** Verified via direct route reads: `/api/snippets`
  (`routes/snippets.ts`) is ALREADY exactly "create content, never touches the real .are files" —
  private per-account Room/Mob/Object/Script drafts (`snippet-store.ts`), gated today only by
  `requireAnyActor` (any centrally-authenticated account, NO tier check — `user` tier can already use
  it). The REAL persist path — `PUT /api/areas/:file` (`routes/areas.ts:171-186`, `fs.writeFileSync`
  straight to the real `.are` file, same call path for the rooms/mobs/objects/scripts nested in the
  area body) and `POST /api/reload` (`routes/reload.ts`, hot-reload/copyover trigger) — is gated only
  by the identity-only `authGuard` today, no tier check either. Fix: floor `/api/snippets` at
  `trusted`+ (excludes `user`); floor the persist path (`authGuard`'s general mutation gate) AND
  `POST /api/reload` at `builder`+ (excludes `trusted` and `user`). `checkRebuildEligibility`
  (`routes/auth.ts:219-239`, the C-binary rebuild trigger) currently caps at admin/owner
  (`tierRank > tierRank('admin')` fails) — loosen its threshold tier from `'admin'` to `'builder'` so
  builder/manager/admin/owner can ALL trigger a rebuild, matching "builders... trigger builds."
- **Anonymous view via mud-builder-client is ALREADY true today — verified, not a new work item.**
  `App.tsx` renders every section unconditionally with no login gate; `authGuard`'s GET/HEAD/OPTIONS
  short-circuit (`routes/auth.ts:130-133`) happens BEFORE any actor/tier resolution, so none of the
  tier changes above touch it. `GET /api/areas`, `/api/areas/:file`, `/api/areas/:file/download`
  require no header at all. Confirm this stays true after Step 3 (it structurally must — the
  short-circuit is unconditional and untouched).
- **User accounts are already centrally located at auth.shatteredarchive.dev — verified, not a new
  work item.** Every accountId referenced anywhere in either plan (mud-builder-server's RoleStore,
  simulacrum-server's access codes, Server.Web.Public in the follow-on plan) resolves through
  auth-server's SSO/introspect — no service invents its own local end-user account system. (Local
  "master key"/API keys in mud-builder-server's `AuthStore` are operator/CI bootstrap credentials, not
  end-user accounts, and are unaffected.)
- **Reach merc-mud over a real private docker network, not a host-port/loopback trick.** `sa-shared`
  (Context) is the established mechanism for two SEPARATE compose projects to share a private
  network — merc-mud's compose joins it the same way the C# site's compose already does for
  auth-server.
- **"Insight for non-privileged users" is satisfied by mud-builder-server's existing open-GET
  access — not by simulacrum's connection, which is now gated.** This is a real reversal from the
  original framing ("anyone can connect and look around") — don't reintroduce that.
- **User decision (asked during planning): go live on the public front proxy now**, not stage as a
  503 stub. Unaffected by any correction.
- **merc-mud/simulacrum is NOT dsl-mud.org, and must never be described or branded as if it were.**
  `dsl-mud.org:4000` is real, live, external (Dark and Shattered Lands, Allen Games/Scorn), heavily
  modified over decades. `C:/Projects/merc-mud` ("simulacrum") is a separate, ShatteredArchive-owned
  instance — "a loose baseline tool... [it] will never be that and does not intend to be." Confirmed
  via grep — no DSL branding found in merc-mud. Describe simulacrum plainly, never framed as or
  compared to "the game" by name. Now also describe it plainly as access-gated, not public.
- **Performance of the relay hop, including its one-line gate, still needs a real assessment.** A
  short prompt + one line read at connection time is a small amount of protocol awareness, well short
  of a full WS gateway — Step 1's Verify measures latency under normal typing load post-gate, not
  just "it connects."
- **Reconnect-for-mobile is explicitly deferred, unchanged from before** — and now has a concrete new
  wrinkle: since access codes are single-use and short-lived, a dropped mobile connection needs a
  FRESH code to reconnect. Accepted friction for a demo tool; not solved here. If a reconnect
  mechanism is ever built, it more plausibly belongs as a generic game-server/game-client capability
  (benefits DSL too) than something simulacrum-specific.
- **Nothing here stands up a second engine.** `merc-mud/2.4` is simulacrum's one and only instance.
  Don't treat `merc-mud/2.4-builder` as relevant — legacy, unrelated prototype. "The builder tool" is
  `apps/mud-builder-client`/`apps/mud-builder-server`, already bind-mounting `merc-mud/2.4/area`.

## Context (verified 2026-08-16, file:line)

- **game-server today: a generic telnet↔WebSocket bridge for the BROWSER-facing side, with a static
  host:port allowlist and zero per-user auth.** `apps/game-server/src/index.ts:182-345`
  (`setupGameWebSocketGateway`) accepts `{type:'connect', host, port}` from the browser client over
  `/ws/game`, checks `isTargetAllowed(host,port)` (`GAME_PROXY_ALLOWLIST` env, lines 57-60), then opens
  `new MudClientApp({host,port})` — a raw OUTBOUND TCP/telnet connection from the game-server
  CONTAINER itself, translated to WebSocket for the browser. Confirmed still current
  (`apps/game-server/.env:5` today reads `simulacrum.shatteredarchive.dev:4000` — the wrong, pre-plan
  port; Step 2 fixes it). This machinery is UNCHANGED by this plan — game-server keeps doing exactly
  this for `dsl-mud.org` and, after Step 2, for `simulacrum.shatteredarchive.dev` too, via the SAME
  code path, no special-casing.
- **How `simulacrum.shatteredarchive.dev` resolves for game-server TODAY (pre-dating this plan)**:
  `deploy/docker-compose.shattered-archive-experimental.yml:196-197` — `extra_hosts:
  "simulacrum.shatteredarchive.dev:host-gateway"` on the `game-server` service. The `extra_hosts`
  mechanism itself is already right and doesn't need to change; Step 2 corrects only the PORT half of
  the allowlist pair.
- **`MudClientApp` is a shared class, but NOT needed by `simulacrum-server`.** Exported from
  `@shatteredarchive/services-server`; used by game-server specifically to bridge telnet↔WebSocket
  for a browser. `simulacrum-server` relays TCP↔TCP — a plain byte-pipe (`net.createServer`,
  `net.connect`, `.pipe()`) is the right tool, with one small addition (Constraints): a text
  prompt/one-line-read gate before the pipe starts.
- **`sa-shared` cross-compose-project network, the mechanism Step 4 needs**: declared in both
  ShatteredArchive compose files as a fixed-name bridge network ShatteredArchive's stack CREATES;
  auth-server joins it with an explicit alias so the C# site's SEPARATE compose project can reach it
  service-to-service — documented inline as "the proven form of this wiring." merc-mud's compose needs
  the mirror-image join.
- **merc-mud's `init_descriptor` is the single choke point for every connection, new or existing
  character — but this plan does NOT need to touch it.** `comm.c:858-891` — `new_descriptor()`
  immediately sets `d->connected = CON_GET_NAME` (`:891`) as the first state for literally every
  accepted TCP connection, before any name/login. Because this plan's gate lives entirely upstream, in
  `simulacrum-server`'s relay, a rejected connection never reaches `net.connect` to merc-mud at all —
  merc-mud's own state machine stays completely unaware the gate exists. (The follow-on plan's
  account-linking DOES touch this choke point, to receive an in-band accountId preamble.)
- **mud-builder-server's actual write surface, in full** (supersedes the single-gate framing this
  step originally used): `authGuard` (`routes/auth.ts:125-142`) — identity-only, no tier check today,
  mounted globally at `app.ts:74`, gates every non-GET/HEAD/OPTIONS request including
  `PUT /api/areas/:file` (`routes/areas.ts:171-186` → `area-store.ts:287` `fs.writeFileSync` straight
  to the real file) and `POST /api/reload` (`routes/reload.ts:11-27`, writes
  `reload.signal`/`copyover.signal`). `requireAnyActor` (`routes/auth.ts:150-163`) — same, any actor —
  used for `GET /api/rebuild/status`, `GET /api/user-content/summary`, and (today) `/api/snippets`
  GET+PUT (`routes/snippets.ts:53-83`, `snippet-store.ts` — per-account JSON file,
  `<dataDir>/snippets/<accountId>.json`, whole-collection read/replace, never touches the real area
  files). `checkRebuildEligibility` (`routes/auth.ts:219-239`) is the ONLY tier-checked route today,
  capped at admin/owner.
- **auth-server already carries a hub-global role on every introspect/exchange response**
  (`globalRole`, `apps/auth-server/src/account-store.ts:41`, ladder
  `GLOBAL_TIERS = ['owner','admin','moderator','user']` in `global-tiers.ts:11`) — consumed today only
  by mud-builder-server's `canGrant` (`routes/roles.ts:50`) to auto-bootstrap admin-tier grants for hub
  owner/admin accounts. This is a SEPARATE ladder from `SERVICE_TIERS` (the one this plan adds
  `builder` to) — don't conflate the two; this plan touches only `SERVICE_TIERS`.
- **`SERVICE_TIERS`/`tierRank` consumers, confirmed via repo-wide grep**: only `mud-builder-server`
  (`role-store.ts`, `routes/auth.ts`, `routes/roles.ts`) imports them from
  `@shatteredarchive/services-server` today. `mud-builder-client/src/api/client.ts:446` keeps its own
  literal, un-imported copy for the Roles-tab dropdown.
- **shatteredarchive-mobile's connection path, confirmed independent of game-server**:
  `ConnectModal.tsx` (`dsl-client/components/ConnectModal.tsx:37-38,78-79`) — free-text host/port,
  default `dsl-mud.org:4000`, persisted via AsyncStorage (`connection-storage.ts:29-46`), NO
  allowlist. `TelnetSocket`/`IGameSocket` (`dsl-client/features/connection/game-socket.ts`) — raw TCP
  TELNET via `react-native-tcp-socket`. SSO login (`game-sso.ts:47-77`) fetches a bearer token used
  elsewhere in the app, but nothing gates which server can be dialed with it.
- **The actual engine + area files**: `C:/Projects/merc-mud/2.4` (Dockerfile — `debian:bookworm`,
  compiles `rom`, `CMD` runs `../src/rom 4000`). `merc-mud/docker-compose.yml:1-13` — service
  `mercmud24`, `ports:"4000:4000"` (binds ALL interfaces today — Step 4 narrows this to loopback for
  local debugging, with `sa-shared` as the real service-to-service path). No resource limits exist
  ANYWHERE in either ShatteredArchive compose file today — Step 4 establishes a new convention.
- **`services/merc-area` is unrelated** — a pure TS `.are`-file parser/emitter, performs no I/O, runs
  no MUD.
- **Port-numbering convention**: `31000` game-server, `41000` web-server, `51000`
  kingdom-tactics-server, `61000` mud-builder-server, `62000` auth-server, `63000` scrum-poker-server,
  `64000` soulsteel-server — `65000` is next free for simulacrum-server's HTTP surface, `65001` for
  the TCP relay (separate listener/protocol on the same process).
- **nginx routing layers, three total**: (1) `deploy/nginx/edge-subdomains.conf` (HTTP,
  resolver+variable upstream pattern); (2) `deploy/nginx/includes/tls-dev.conf` (HTTPS mirror, must
  stay route-for-route identical — a gap here bit kingdom-tactics and soulsteel already); (3)
  `C:/Projects/DSL/nginx/shattered_archive.site` (the FRONT proxy, terminates real TLS, forwards plain
  HTTP to `51.222.137.28`). `build.shatteredarchive.dev` is currently a 503 stub there; going live
  means "delete the stub block and copy the auth or scrum-poker block above" (stated inline).
  **Cert SAN gap**: a name only gets TLS coverage once added to the shared cert's `-d` list via
  `certbot --expand` — confirmed as a separate step from route wiring by soulsteel's own comment.
- **Landing/privacy pages**: `deploy/index.html:652-679` — MUD Builder and Kingdom Tactics are
  unlinked `demo-soon` cards because their front-proxy blocks are still stubs.
  `deploy/privacy.html:339-342` has one combined row for `build.`+`kingdom-tactics.` — extend/add a
  row for `simulacrum.`. Privacy lives in `deploy/privacy.html`, a SEPARATE file from `index.html`.

## Steps

### [x] 1. (CLAUDE) NEW apps/simulacrum-server — gated TCP relay + access-code auth + shared role-store
- Do: Scaffold `apps/simulacrum-server` (mirror an existing small `apps/*-server`'s shape — check
  soulsteel-server's package.json/tsconfig/Dockerfile). Two listeners: (1) a small Express app on
  `PORT=65000` — `GET /health`; `POST /api/access-code`, gated trusted+ via the shared role-store
  (below) + introspect, mints a short random single-use code, writes `access-codes/<code>.txt` (plain
  `key: value` lines — accountId, username, expiresAt — mirroring `state_snapshot.c`'s convention) to
  a shared bind-mounted path, returns it to the caller; a minimal standalone static page (sign in via
  the SSO redirect, click a button, see the code plainly) — this is simulacrum's ONE UI surface, never
  a game-client addition. (2) A TCP relay on `SIMULACRUM_RELAY_PORT` (`65001`) — on each new
  connection: write a short prompt ("Simulacrum access code: "), read ONE line with a ~30s timeout;
  validate against `access-codes/<code>.txt` (exists, unexpired, and the resolved accountId's tier —
  read from the SAME role-store used for minting, i.e. a LIVE re-check, not a cached one — is still
  `trusted` or above); on success, delete the code file (single-use), THEN `net.connect` to merc-mud
  over `sa-shared` (host/port from `SIMULACRUM_HOST`/`SIMULACRUM_PORT` config) and `.pipe()` both
  directions for the rest of the session, closing one side when the other closes; on
  failure/timeout/missing code, print a short rejection line and close the socket — merc-mud is NEVER
  dialed for a rejected attempt. Structure the success path as a small internal function (e.g.
  `relay.admit(accountId, username, socket)`) that today just pipes bytes — the follow-on plan extends
  exactly this function to also send an in-band preamble to merc-mud, so don't inline the pipe logic
  directly in the connection handler. Add `role-store.ts` — the EXACT same class as
  `mud-builder-server/src/role-store.ts` (Constraints: shared tier data) — but point its `dataDir` at
  mud-builder-server's OWN existing `auth/` data directory (bind-mounted into this service too,
  read-write, so both processes' atomic tmp+rename writes to the SAME `roles.json` are safe) rather
  than a new, separate one — do NOT create a second, independent `roles.json`. Register the service
  (`register-service simulacrum-server`), wire
  `AUTH_SERVER_URL`/`AUTH_SERVER_PUBLIC_URL`/`SERVICE_PRIVATE_KEY_PATH`.
- Files: /workspace/shattered-archive/apps/simulacrum-server/ (new — package.json, tsconfig,
  src/index.ts, src/relay.ts, src/access-codes.ts, src/role-store.ts, src/config.ts, src/public/,
  Dockerfile at /workspace/shattered-archive/deploy/simulacrum-server.Dockerfile),
  /workspace/shattered-archive/deploy/docker-compose.yml,
  /workspace/shattered-archive/deploy/docker-compose.shattered-archive-experimental.yml (new service
  block, `sa-shared` join, the SHARED `auth/` volume mount pointed at mud-builder-server's existing
  volume, and a new `access-codes/` bind mount).
- Verify: `GET /health` responds. A `user`-tier (or signed-out) request to `POST /api/access-code`
  401/403s with no file written. A trusted+ request mints a code and the file appears at the shared
  path. Connecting to the relay with NO code (or a bogus/expired one, or a stale code for an account
  since demoted below trusted via the Roles tab) is rejected and the socket closes WITHOUT merc-mud
  ever seeing a connection attempt (confirm via merc-mud's own connection log). Connecting with a valid
  code (once Step 4 has merc-mud reachable on `sa-shared`) completes a normal telnet login round-trip
  correctly. Granting/revoking `trusted` tier via mud-builder-client's EXISTING Roles tab takes effect
  on simulacrum's very next connection attempt with no simulacrum-server restart — proves the shared
  role-store is really shared, not two copies. **Performance check**: measure round-trip latency for a
  normal sequence of commands after the one-line gate and confirm it's not perceptibly worse than a
  direct connection — note actual numbers in the progress log.

> **Step 1 close-out note (2026-08-16, UPDATED same day — register-service gap closed)**: the
> `register-service` ceremony is now DONE against the live experimental stack's auth-server (see the
> progress-log entry below for the full account of a real bug this surfaced and fixed:
> `SERVICE_REGISTRY` auto-deregistration on a stale container). `simulacrum-server` is live in the
> running experimental stack with a working introspect key. One thing remains, unchanged: the full
> merc-mud round-trip and the performance-under-real-load check in this step's own Verify text are, by
> that text's own design, deferred to once Step 4 makes merc-mud reachable on `sa-shared` — re-run
> them then.

### [x] 2. (CLAUDE) game-server allowlist correction + confirm zero new game-client/mobile surface
- Do: In `apps/game-server/.env` and `deploy/docker-compose.shattered-archive-experimental.yml`,
  change the existing `simulacrum.shatteredarchive.dev` allowlist entry's port from `4000` to `65001`
  (Step 1's relay port) — `extra_hosts` stays as-is. No other change to `apps/game-server/src` or ANY
  `apps/game-client/src`/`shatteredarchive-mobile` source — confirm via `git diff` across all three
  trees that this whole plan touches none of them. The access-code prompt (Step 1) is just bytes
  flowing through the existing generic pipe both clients already have; neither needs to know it
  exists.
- Files: /workspace/shattered-archive/apps/game-server/.env,
  /workspace/shattered-archive/deploy/docker-compose.shattered-archive-experimental.yml.
- Verify: with Step 1's relay running, game-client's ORDINARY Connect modal, typed at
  `simulacrum.shatteredarchive.dev`/`65001`, reaches the access-code prompt then (with a valid code)
  merc-mud's login prompt. Separately, the mobile app's own ordinary Connect screen, pointed at the
  same host:port, reaches the SAME prompt the same way (it never goes through game-server at all —
  this just confirms the relay's gate works identically for a client that dials it directly).
  `dsl-mud.org` connect is unaffected. `git diff` is empty for `apps/game-server/src`,
  `apps/game-client/src`, and `shatteredarchive-mobile/*` for this entire plan.

> **Step 2 correction (2026-08-16), discovered mid-implementation**: `extra_hosts` did NOT "stay as-is"
> as this step originally assumed — that assumption predates Step 1's actual implementation shape.
> `simulacrum-server` is now a real container on the `shatteredarchive` network with its own internal
> alias, `simulacrum-server.shatteredarchive.dev` (same `-server`-suffixed convention already used by
> `auth-server.shatteredarchive.dev`/`mud-builder-server.shatteredarchive.dev` for backend-to-backend
> dials — confirmed by reading those services' own env blocks). The dial target is therefore
> `simulacrum-server.shatteredarchive.dev:65001`, NOT the public `simulacrum.shatteredarchive.dev`
> (which Step 5 will instead give to nginx, matching every other public subdomain's pattern — game
> aliases on a shared docker network are NAME→IP, not name+port→target, so the same public hostname
> can't correctly resolve to two different containers for two different ports). The old
> `extra_hosts: host-gateway` entry is REMOVED, not kept — it dates from when merc-mud published its
> raw port straight to the Windows host; Docker's own embedded DNS now resolves the internal alias
> directly, no override needed. Practical effect: a user connects by typing
> `simulacrum-server.shatteredarchive.dev` / `65001` into the ordinary Connect modal, not the shorter
> public name — still zero new client code, just a different string a person types, same as typing any
> other allowlisted host:port.

### [x] 3. (CLAUDE) mud-builder-server + shared ladder: add `builder` tier, three-way write split
- Do: In `services/services-server/src/auth-tiers.ts`, change `SERVICE_TIERS` to
  `['owner', 'admin', 'manager', 'builder', 'trusted', 'user']`. In
  `apps/mud-builder-client/src/api/client.ts:446`, update the literal copy the same way (Roles-tab
  dropdown). In `routes/snippets.ts`, add a tier check after resolving an account actor: 403 unless
  `tierRank(SERVICE_TIERS, roleStore.tierFor(actor.accountId)) <= tierRank(SERVICE_TIERS, 'trusted')`
  (blocks bare `user` tier from both `GET` and `PUT /api/snippets`). Change `authGuard`'s signature to
  `authGuard(store, introspectConfig, roleStore)` and, inside, after resolving an actor for a mutating
  request: if `actor.kind === 'account'`, require
  `tierRank(SERVICE_TIERS, roleStore.tierFor(actor.accountId)) <= tierRank(SERVICE_TIERS, 'builder')` —
  403 otherwise; `master`/`key` actors skip this (same exemption `checkRebuildEligibility` already
  grants them) — this is the floor for the REAL persist path (`PUT /api/areas/:file` and everything
  else `authGuard` gates, including `POST /api/reload`). In `checkRebuildEligibility`
  (`routes/auth.ts:225`), change the threshold tier from `'admin'` to `'builder'` so
  builder/manager/admin/owner can all trigger a rebuild. In `app.ts`, move the `roleStore` construction
  (currently line 84) to before the `authGuard` mount (currently line 74) and thread it through.
- Files: /workspace/shattered-archive/services/services-server/src/auth-tiers.ts,
  /workspace/shattered-archive/apps/mud-builder-client/src/api/client.ts,
  /workspace/shattered-archive/apps/mud-builder-server/src/routes/auth.ts,
  /workspace/shattered-archive/apps/mud-builder-server/src/routes/snippets.ts,
  /workspace/shattered-archive/apps/mud-builder-server/src/app.ts,
  /workspace/shattered-archive/apps/mud-builder-server/src/routes/auth.test.ts,
  /workspace/shattered-archive/apps/mud-builder-server/src/routes/snippets.test.ts,
  /workspace/shattered-archive/apps/mud-builder-server/src/routes/rebuild.test.ts.
- Verify: `pnpm --filter mud-builder-server test` and `pnpm --filter mud-builder-client test`/typecheck.
  An anonymous (no header) `GET` to any area/room/mob/object/script route still succeeds unchanged
  (Constraints — this must structurally still be true). A `user`-tier account 403s on `/api/snippets`
  (both methods) and on any real-area mutation. A `trusted`-tier account succeeds on `/api/snippets`
  but 403s on `PUT /api/areas/:file` and `POST /api/reload`. A `builder`-tier account succeeds on both.
  `manager`/`admin`/`owner` are unaffected (still succeed everywhere they did before). The rebuild
  trigger now accepts `builder`+ (previously admin+ only) subject to the existing short-lived-token
  rule, unchanged. Grep the repo for any hardcoded NUMERIC tier-rank comparison (as opposed to a
  by-name `tierRank(...)` call) that the ladder insertion could silently break — none expected
  (repo-wide grep already confirmed `mud-builder-server` is the only `SERVICE_TIERS` consumer), but
  confirm.

> **Step 3 correction (2026-08-16), discovered mid-implementation — presence heartbeats exempted
> from the tier floor**: `authGuard`'s tier check, as literally specified ("authGuard's general
> mutation gate"), also caught `POST /api/presence` — a pre-existing, ALREADY-authenticated but
> deliberately non-persisting route (its own doc comment: "never audited... independent of the write
> gate"; it just broadcasts "this credential is editing this file," writes nothing to disk). Blocking
> `user`/`trusted` tier from presence would have been an unintended, undiscussed regression, not a
> deliberate part of the three-way split. Fixed with a narrow, fail-CLOSED exact-path allowlist
> (`TIER_CHECK_EXEMPT_PATHS`, `routes/auth.ts`) scoped to the TIER check only — the identity check
> above it stays universal, exactly as `authGuard`'s original "no path filter" comment intends (that
> comment is about a bypass filter, which fails OPEN on a case trick; an allowlist that fails closed
> on a mismatch carries the opposite, safe risk profile — a mis-cased `/API/presence` just stays
> tier-gated, never the reverse). `POST /api/areas` (new area) and `POST /api/areas/:file/preview`
> (never writes, but wasn't flagged as exempt anywhere in this plan) were deliberately left AT the
> builder+ floor rather than extending the exemption further — preview's "never writes" character is
> genuinely similar to presence's, and could reasonably become a trusted-tier draft/preview surface
> later, but that's a real scope expansion beyond what this plan specified, not implemented here.

### [x] 4. (CLAUDE) merc-mud: resource caps + private-network reachability
- Do: In `merc-mud/docker-compose.yml`'s `mercmud24` service, add `deploy.resources.limits: {cpus:
  "1.0", memory: 512M}` (no existing convention to match — sized generously for a lightweight
  ROM/Merc C engine, so normal play never OOM-kills, while still capping a runaway leak/loop). Declare
  the top-level `networks: sa-shared: external: true` and attach `mercmud24` to it with an internal
  alias (e.g. `simulacrum-engine`) — this is `simulacrum-server`'s real path in. Change
  `ports: - "4000:4000"` to `ports: - "127.0.0.1:4000:4000"` (loopback-only) — kept ONLY as a local
  human-debugging convenience, not the service-to-service path.
- Files: /workspace/merc-mud/docker-compose.yml.
- Verify: `docker compose config` validates; `docker inspect merc-mud2.4` shows the resource limits;
  `docker port merc-mud2.4` shows `127.0.0.1:4000` only; from `simulacrum-server`'s container on
  `sa-shared`, `nc -zv simulacrum-engine 4000` succeeds; from outside any docker network on this host,
  the port is unreachable.

### [x] 5. (CLAUDE) ShatteredArchive edge nginx + prod compose: simulacrum block
- Do: Add an HTTP `server{ server_name simulacrum.shatteredarchive.dev; }` block to
  `edge-subdomains.conf` mirroring `game-client.shatteredarchive.dev`'s block shape EXACTLY —
  `/ws/game` → `game-server:31000` (the SAME existing route, no new WS path — Step 2 means simulacrum
  traffic already flows through it), `/api/web/` → `web-server:41000` (kept for parity, probably
  unused by simulacrum but harmless), `/` → `game-client:80`. Add the HTTPS mirror to
  `includes/tls-dev.conf`, route-for-route identical. Add `simulacrum.shatteredarchive.dev`'s
  `extra_hosts`/allowlist entry (Step 2's corrected port) to `deploy/docker-compose.yml` (prod) — it
  doesn't exist there yet. Add `simulacrum-server` to prod's compose too (Step 1 only added it to the
  experimental one).
- Files: /workspace/shattered-archive/deploy/nginx/edge-subdomains.conf,
  /workspace/shattered-archive/deploy/nginx/includes/tls-dev.conf,
  /workspace/shattered-archive/deploy/docker-compose.yml,
  /workspace/shattered-archive/apps/game-server/.env (prod-relevant env, if separate from the
  experimental one already touched in Step 2).
- Verify: with the user's existing hosts-file mapping, `https://simulacrum.shatteredarchive.dev` loads
  game-client's SPA against the local experimental stack, its ordinary Connect modal reaches the
  access-code prompt, and a valid code reaches merc-mud through the relay; `dsl-mud.org` connect still
  works unchanged; `docker compose config` validates both files.

### [x] 6. (CLAUDE) Front proxy: real simulacrum + build blocks, flag the manual cert step
- Do: Add a real `simulacrum.shatteredarchive.dev` HTTPS block to `DSL/nginx/shattered_archive.site`
  (mirror the existing `auth.`/`soulsteel.` blocks' shape — `proxy_pass http://51.222.137.28;` with
  `Host $host` preserved, shared multi-SAN cert paths) plus an HTTP→HTTPS redirect entry. Delete the
  `build.shatteredarchive.dev` 503 stub and replace it with a real block, same shape. Leave
  `kingdom-tactics.shatteredarchive.dev`'s stub untouched. Add a prominent comment on both new blocks
  stating the cert SAN gap explicitly.
- Files: /workspace/dsl/nginx/shattered_archive.site.
- Verify: `nginx -t` syntax-checks cleanly. Explicitly tell the user (cannot self-verify end-to-end):
  the shared `shatteredarchive-dev-apps` cert must be expanded with `certbot --expand -d
  simulacrum.shatteredarchive.dev -d build.shatteredarchive.dev` (plus every existing `-d` name) on
  the real front-proxy host before either hostname serves valid TLS publicly.

### [x] 7. (CLAUDE) Landing page, privacy notice, full regression, live verification
- Do: `deploy/index.html` — flip the MUD Builder `demo-soon` card to a live `<a class="demo">`
  (mention it's free to browse, trusted+ to edit); add a NEW live demo card for Simulacrum, clearly
  framed as trusted+-only ("sign in and request access" rather than "play now") and as a
  stock/near-stock ROM 2.4 baseline, never framed as or compared to a specific real MUD by name. Leave
  Kingdom Tactics as-is. `deploy/privacy.html` — extend/split the existing `build.`+`kingdom-tactics.`
  row to add `simulacrum.shatteredarchive.dev`; add a short note under "What each service stores on
  the server" covering `simulacrum-server`'s access-code/auth-token handling (game-server's own row is
  unaffected — it gained nothing). Run full regression: `pnpm --filter simulacrum-server test`,
  `pnpm --filter mud-builder-server test`, `pnpm --filter mud-builder-client test`, `tsc --noEmit` +
  `vite build`, plus the `git diff`-empty confirmation for `apps/game-server/src`,
  `apps/game-client/src`, and `shatteredarchive-mobile/*` from Step 2. Rebuild/redeploy the
  experimental stack locally and smoke-test end to end: an anonymous/under-tier connection attempt is
  refused (web AND mobile), a trusted+ connection with a valid code reaches simulacrum through the
  relay, granting/revoking trusted tier via the Roles tab changes simulacrum access immediately,
  mud-builder's three-way split enforces correctly, resource limits visible on the running merc-mud
  container, dsl-mud.org play still works, completely unchanged throughout. Refresh
  `.annotated`/`.ai-context` for every touched directory. Update memory.
- Files: /workspace/shattered-archive/deploy/index.html,
  /workspace/shattered-archive/deploy/privacy.html, plus regression across every package touched in
  Steps 1-3, `.annotated`/`.ai-context` refreshes, memory files.
- Verify: all suites green; clean typecheck/build; the full local end-to-end loop above passes.
  Actually going live on the public front proxy (Step 6) and the remote cert expansion are the user's
  own deliberate actions outside this session's reach.

## Progress log

- 2026-08-16T [post-completion 5] **design change, requested directly by the user after
  verifying post-completion-4's fix worked**: "Grants generally should be by username, which
  then do an account id lookup for assignment. Usernames are memorable, account ids really
  aren't." Implemented as a genuinely new feature spanning three packages, not a patch:
  - `apps/auth-server`: new `POST /api/service/resolve-username` (routes/resolve-username.ts +
    test), server-to-server only, same signed-assertion/rate-limit shape as `/api/introspect`
    (reuses `serviceRateLimit`/`chargeService`). Any registered service may resolve any
    username — the privilege decision belongs entirely to the CALLING service, not this
    endpoint; returns only `{found, id, username}`, never other account fields. Wired into
    `app.ts` alongside the other route registrations.
  - `services/services-server`: new `resolveUsername()` in `auth-introspect-client.ts`,
    mirroring `introspect()`'s exact shape (reuses `signAssertion`), exported via the existing
    barrels. **Had to `pnpm --filter services-server build` before mud-builder-server's
    typecheck could see the new export** — its jest moduleNameMapper points at source for
    runtime, but TS type resolution goes through `package.json`'s `"types": "dist/index.d.ts"`,
    which was stale.
  - `apps/mud-builder-server`: `routes/roles.ts`'s grant route moved from
    `POST /api/roles/:accountId` to `POST /api/roles` with `{username, tier}` in the body —
    resolves the username server-side (same authServerUrl/servicePrivateKeyPath config as the
    introspect fallback) before ever touching the role store; unresolvable username 404s,
    resolution-unconfigured is 501. `GET /api/roles/me` now also returns `username` (alongside
    the `accountId` from post-completion-4, kept as secondary reference info). `authGuard`'s
    `TIER_CHECK_EXEMPT_PATHS` simplified back to a pure exact-match set (`/api/roles`) now that
    the route has no path-segment identifier — the prefix-matching variant from
    post-completion-3 was short-lived, folded back the same day.
  - `apps/mud-builder-client`: `api.setRole()` signature changed to `(username, tier)`;
    `RolesPage.tsx`'s "Account ID" input removed entirely, replaced by a single "Username"
    field; the self-fill button now fills username (from `me.username`) instead of accountId.
  - Regression: auth-server 291/291, services-server 31/31, mud-builder-server 187/187 (rewrote
    roles.test.ts's fake-introspect helper to also serve resolve-username responses via an
    injectable `{username: accountId}` map), mud-builder-client 265/265 (tsc clean). Rebuilt +
    recreated auth-server, mud-builder-server, mud-builder-client; live-verified end to end
    against the real running stack — a fresh signup, granted `trusted` by USERNAME as master,
    confirmed the stored grant's `accountId` is the real opaque id (never the literal username
    string), and confirmed an unresolvable username 404s with a clear message. Cleaned up the
    throwaway test grant afterward.
  - Aside, unprompted but noticed live: while re-checking `roles.json` post-deploy, found
    melchaleve had ALREADY successfully self-granted `admin` tier using post-completion-4's
    accountId self-fill button (real accountId, correctly keyed) — but left the grant's
    `username` LABEL as the raw accountId (the old form's username field was optional and left
    blank). Purely cosmetic (tier and accountId are both correct), not touched — flagged to the
    user rather than silently edited, since it's their own legitimate grant, not a test
    artifact.
- 2026-08-16T [post-completion 4] **UX gap, found via the same user immediately after
  verifying post-completion-3's fix.** melchaleve granted a role but Simulacrum still showed
  `user` tier. Root cause: nothing anywhere in mud-builder-client's UI shows a user their own
  real `accountId` (an opaque hub-issued id) — the grant form's only visible example is the
  hand-seeded `smoke-test-acct-1` test row, whose accountId happens to look like a readable
  username, so a real user reasonably typed THEIR username into the "Account ID" field instead.
  The grant silently succeeded against `"accountId": "melchaleve"` — a string matching no real
  session — so `roleStore.tierFor()` never found it. Not a code bug in the tier-check machinery
  (unlike post-completion-1/3); a genuine missing affordance. Fixed: `GET /api/roles/me` (server)
  now also returns the caller's own `accountId`; the Roles tab's "Your access" card shows it and
  adds a "Use for a grant below" button that fills the form field directly, closing the typo
  class entirely rather than just describing where to look. Removed the incorrectly-keyed
  `"melchaleve"` grant row. Regression tests added on both sides (server: `roles.ts` already
  covered via existing suites reading the new field; client: RolesPage.test.tsx's new "shows
  your own accountId and lets you fill the grant form with it" case) — full client suite still
  264/264 (263 + 1 new), server 183/183 unchanged (no server logic changed, only an additive
  response field). Rebuilt + redeployed both mud-builder-server and mud-builder-client.
- 2026-08-16T [post-completion 3] **second live bug in the new builder-tier floor, found via a
  user report while testing the previous fix.** melchaleve (hub owner, no pre-existing local
  mud-builder grant — the exact bootstrap scenario Decision 4's role system exists to handle)
  tried granting themselves `trusted`+ tier via the Roles tab and got "grant failed: this action
  requires builder tier or above" — the BLANKET floor this plan's Step 3 added to `authGuard`,
  which runs on every non-GET /api/* mutation BEFORE any specific route's own logic, including
  `POST /api/roles/:accountId` — the one endpoint whose entire job is granting that tier in the
  first place. A chicken-and-egg lockout: roles.ts's own `canGrant()` already has the correct
  hub-owner/admin bootstrap exception, but it never got a chance to run. Fixed with a new
  `TIER_CHECK_EXEMPT_PREFIXES` (`/api/roles/`, prefix-matched since the account id is a path
  segment, unlike the exact-match `TIER_CHECK_EXEMPT_PATHS` from Step 3) — `canGrant()` is now
  the sole authority for that route. Live-verified: a low-privilege throwaway account now gets
  `canGrant()`'s own "you are not permitted to grant this tier" instead of the blanket message,
  proving the request reaches the intended logic (didn't verify the full positive hub-owner path
  directly — that needs a real owner-tier test account this session doesn't have one of — but
  the routing fix is the same mechanism either way and melchaleve's exact globalRole='owner'
  case is the one canGrant() already explicitly handles).
- 2026-08-16T [post-completion 2] user asked to double-check `deploy/index.html` was fully
  updated for MUD Builder/Simulacrum. The demo cards themselves (Step 7) were already correct.
  Found a real, deeper gap while checking the self-hosting section: `deploy/scripts/add-hosts.ps1`
  and `.sh` — the actual scripts `pnpm setup:hosts:win/nix` run — were missing
  `simulacrum.shatteredarchive.dev` entirely (not a doc issue; self-hosters would have had no way
  to resolve the hostname at all). Fixed both scripts, then corrected `deploy/index.html`'s
  "Map the development domains" list to match — which was ALSO stale on several PRE-EXISTING
  names (missing the apex, `build.`, `kingdom-tactics.`, `soulsteel.`, none of them this plan's
  doing) — and updated the "Bring the stack up" paragraph to mention Simulacrum needs the
  experimental stack specifically (its container ships in the default `docker-compose.yml` too,
  confirmed via grep, but fails closed there without MUD Builder's shared role store).
- 2026-08-16T [post-completion] **live bug, found and fixed after Status: COMPLETE.** The user
  tried the real flow and reported: visiting `simulacrum.shatteredarchive.dev` opened game-client
  (not simulacrum-server's sign-in page), and clicking its "Sign in" redirected to
  `http://localhost:5000/user/game-sso/start?...` — game-client's own unrelated Phase D
  account-linking feature, not simulacrum's SSO at all. Root cause: Step 5/6's nginx block for
  `simulacrum.shatteredarchive.dev` copied game-client's shape verbatim (`/` → game-client:80),
  but `SIMULACRUM_PUBLIC_URL` has NO path prefix, so simulacrum-server's own sign-in page and SSO
  routes (`/`, `/sso/start`, `/api/sso/callback`) also need `/` on that hostname — two backends
  can't share it, and the copy-paste picked the wrong one. There was never a route to
  simulacrum-server:65000 at all. Fixed in `deploy/nginx/edge-subdomains.conf` +
  `deploy/nginx/includes/tls-dev.conf`: `/` now → simulacrum-server.shatteredarchive.dev:65000,
  `/ws/game` unchanged (→ game-server:31000 — that's the real play connection, dialed by an
  actual game-client instance at ITS OWN hostname pointed at this one), `/api/web/` dropped
  (no longer relevant). Corrected the now-wrong explanatory comments in both files plus
  `DSL/nginx/shattered_archive.site`'s (which needed no functional change — it just forwards by
  Host header to the docker edge). While fixing this, found and fixed a SECOND bug the first one
  had been masking: simulacrum-server's sign-in page has its own inline `<script>`, and once `/`
  actually reached it, TWO Content-Security-Policy headers stacked (nginx's page-facing one +
  helmet's JSON-API-oriented `default-src 'none'` default from `createExpressService`) — the
  browser intersects multiple CSP headers, and helmet's default has no `connect-src` override, so
  it silently blocked even the page's own same-origin `fetch()` calls. Fixed by externalizing the
  inline script to `public/app.js` (same reasoning as `deploy/site.js`) and passing
  `helmetOptions: { contentSecurityPolicy: false }` in `index.ts` so nginx is the sole CSP source,
  matching the repo-wide convention. Rebuilt+recreated simulacrum-server, restarted the edge nginx
  container, and live-verified the ENTIRE real browser-equivalent flow end to end via a scripted
  fresh signup: challenge→signup→login→change-password, granted trusted tier, `POST
  /api/sso/approve` (proves the redirect_uri registered in `SERVICE_REGISTRY` back in Step 1 was
  already correct), `GET /api/sso/callback` through the fixed route → 302 + `simulacrum_token`
  cookie set, `GET /api/whoami` → `signedIn:true`, `POST /api/access-code` → 201 with a real code
  — the first time this session the sso.ts browser-cookie path (as opposed to Plan 2 Step 4's
  API-key path) was actually exercised end to end. Also regression-checked
  `game-client.shatteredarchive.dev` and `game-server`'s health after the shared nginx restart —
  both unaffected. (Aside, not a bug: Node's `fetch()`/undici silently drops a manually-set `Host`
  header per the Fetch spec's forbidden-header list, which cost one detour through a false-alarm
  404 during this verification — `node:http` has no such restriction and was used instead.)
  Cleaned up the throwaway test account's tier grant and access-code file afterward.
- 2026-08-16T [step 7 done] step 7 done: landing page, privacy notice, full regression, live
  verification. `deploy/index.html`: MUD Builder flipped from `demo-soon` to a live `<a>` card; a
  NEW Simulacrum live card added right after it, framed as "sign in and request access" (trusted+
  only) and as a near-stock ROM 2.4 baseline, never compared to a specific real MUD by name.
  `deploy/privacy.html`: `simulacrum.shatteredarchive.dev` added to the build.+kingdom-tactics.
  ads/analytics table row (No/No, unchanged) plus a new "Simulacrum" subsection under "What each
  service stores on the server" covering the short-lived single-use access code and the
  account-to-character link that surfaces on the Auth Hub dashboard. Full regression: `pnpm
  --filter simulacrum-server test` (2 suites/11 tests), `--filter mud-builder-server test` (18
  suites/181 tests), `--filter mud-builder-client test` (38 suites/263 tests) all green;
  `mud-builder-client`'s `tsc --noEmit` clean and `vite build` clean; `simulacrum-server` and
  `mud-builder-server` both `tsc` build clean. `git status --porcelain` confirmed empty for
  `apps/game-server/src`, `apps/game-client/src`, and (scoped to the connection-gating files
  specifically, per Step 2's actual file list — the mobile repo's `dsl-client/features/scripts/`
  had unrelated pre-existing uncommitted work not touched this session)
  `dsl-client/components/ConnectModal.tsx` + `dsl-client/features/connection/`. Rebuilt and
  recreated the `mud-builder-server`/`simulacrum-server`/`game-server` images+containers from
  current source (all three came up healthy); live-verified post-rebuild: an access-code-less
  relay connection is still rejected with the connection closed before merc-mud is ever dialed; a
  live role-store grant to `trusted` (direct host-file edit, the same `EBUSY`-workaround used
  throughout this plan) let a freshly minted access code reach all the way through the relay to
  merc-mud's real ROM 2.4 login banner, live-verifying the grant takes effect immediately with no
  restart; reverted the grant and cleaned up the test code file afterward. mud-builder-server's
  three-way split spot-checked live over the internal docker network: anonymous `GET /api/world`
  still 200s (open, unaffected), anonymous `POST /api/presence` still 401s (the new
  `TIER_CHECK_EXEMPT_PATHS` exemption is tier-only, identity stays universal — confirmed it did
  NOT accidentally become fully open). `docker inspect merc-mud2.4` confirmed the Step 1 resource
  ceiling is intact (1.0 cpu / 512MiB) and the port is still bound to `127.0.0.1` only.
  `dsl-mud.org` was not touched by anything in this plan (zero game-server/game-client source
  diff). Refreshed `.annotated`/`.ai-context` across every touched directory in all three repos
  (ShatteredArchive, DSL, merc-mud) — a new `apps/simulacrum-server/.ai-context` +
  `.annotated`/`src/.annotated` for the brand-new package, addenda to the existing entries
  everywhere else edited. Also updated `DSL/nginx/ssl-cert.md` per the user's explicit request
  ahead of this step, documenting the `shatteredarchive-dev-apps` cert's SAN gap for `build.` and
  `simulacrum.` and the required `certbot --expand` remediation. All 7 steps of this plan are now
  done — see Status above.
- 2026-08-16T07:01:48-05:00 plan created. `shattered_mcp` was unreachable for the whole research pass
  — verified everything by direct Grep/Read plus one Explore-agent pass. Two design decisions were put
  to the user via AskUserQuestion: (1) extend mud-builder-server's general write gate to trusted+ —
  chosen; (2) go live on the public front proxy now — chosen.
- 2026-08-16 **correction 1 (absorbed)**: initial draft wrongly framed merc-mud/simulacrum as "already
  ShatteredArchive's production MUD." Corrected — `dsl-mud.org` is the real, actively played MUD;
  simulacrum is a separate baseline demo, never to be branded like DSL.
- 2026-08-16 **correction 2 (absorbed, later partially superseded by correction 3)**: simulacrum must
  be invisible in game-client's UI unless signed in AND trusted+. Built a client-side
  `GET /api/access`-gated visibility hook on a new dedicated service.
- 2026-08-16 **correction 3 (absorbed)**: user rejected putting ANY simulacrum-specific logic in
  game-server. Moved auth/role-store/bridge logic to a NEW `apps/simulacrum-server`, reusing
  `MudClientApp` and a WS gateway design, plus the `sa-shared` private-network mechanism.
- 2026-08-16 **correction 4 (absorbed), supersedes correction 2's client-visibility feature and
  simplifies correction 3's service design**: simulacrum-server redesigned as a plain protocol-
  transparent TCP relay (no `MudClientApp`, no WebSocket gateway, no bearer-token-per-connection) —
  game-server dials it exactly like any other allowlisted MUD via its already-generic connect flow.
  The real "who can play" restriction was placed entirely in the follow-on plan's in-MUD
  master-account link.
- 2026-08-16 **correction 5 (absorbed, PARTIALLY REVERSES correction 4) — full review against 7 fresh,
  explicit requirements** (anonymous view via mud-builder UI; trusted = create-not-persist; builder+ =
  persist/build/copyover; accounts centralized at auth-server; simulacrum shares role info with
  mud-builder; only trusted+ may CONNECT to simulacrum via game-client OR mobile; anonymous/
  under-tier CONNECTIONS must be rejected). Findings and changes:
  (a) requirements 6/7 directly contradict correction 4's "no connection-time gate" conclusion —
  restored a connection-time gate, but implemented entirely inside `simulacrum-server`'s relay (one
  text prompt + one line read before piping), not as a WS/bearer-token gateway — avoids reintroducing
  correction 3's rejected complexity while satisfying the new requirement;
  (b) confirmed via a dedicated Explore-agent pass that `shatteredarchive-mobile` bypasses game-server
  entirely (its own raw TCP/TELNET client, no allowlist) — this is WHY the gate has to live in
  simulacrum-server's own byte stream rather than any client or game-server, since that's the only
  point both game-client and mobile necessarily pass through;
  (c) requirement 1 (anonymous mud-builder view) and requirement 4 (centralized accounts) were both
  ALREADY true — verified directly, called out as non-work in Constraints, not built;
  (d) requirement 2/3 (trusted=create-not-persist, builder+=persist/build/copyover) replaced this
  plan's original single trusted+ floor (Step 3) with a real three-way split, discovering along the way
  that `/api/snippets` already IS the "create but don't persist" mechanism — just needed a tier floor;
  (e) requirement 5 (shared role info) is met by pointing simulacrum-server's RoleStore at
  mud-builder-server's existing `roles.json` via a shared bind mount rather than a second independent
  store, which Step 1 originally called for;
  (f) two decisions were put to the user via AskUserQuestion before finalizing: `builder` tier identity
  (existing `manager` tier reused vs. a genuinely new tier vs. a rename) — user chose a genuinely NEW
  tier, inserted between `manager` and `trusted`; and the connection-gate mechanism (unified single
  access code vs. two separate codes) — user chose to unify, which also simplifies the follow-on
  plan's C-engine work substantially (no code-file lookup needed in C at all — the account arrives
  in-band, pre-verified, from simulacrum-server).
- 2026-08-16 **step 1 done**: scaffolded `apps/simulacrum-server` (package.json/tsconfig/jest.config
  mirroring soulsteel-server) with `config.ts`, `role-store.ts` (exact mirror of mud-builder-server's,
  pointed at a shared single-file `roles.json` bind mount), `access-codes.ts` (mint/consume single-use
  16-byte codes, plain-text `key: value` files, tmp+rename atomic writes), `relay.ts` (gated TCP relay
  — `createRelay()` returns `{server, admit}`, `admit()` isolated per Constraints for the follow-on
  plan to extend), `sso.ts` (SSO redirect via auth-client's `/sso/authorize` + `exchangeAuthorizationCode`
  callback, hand-rolled cookie — no new dependency), `app.ts` (`/health`, `/api/whoami`,
  `POST /api/access-code` trusted+-gated via introspect-only `resolveAccount`, static page), `index.ts`
  (boots both listeners), and `src/public/index.html` (the one UI surface — sign-in link, code
  request/display). Added `deploy/simulacrum-server.Dockerfile` (mirrors soulsteel-server.Dockerfile)
  and wired `deploy/docker-compose.shattered-archive-experimental.yml`: new `simulacrum-server` service
  block (ports 65000/65001, `sa-shared` join, the single-file `roles.json` mount, an `access-codes/`
  bind mount) plus a `simulacrum-server` entry in auth-server's `SERVICE_REGISTRY` (redirect URI
  `https://simulacrum.shatteredarchive.dev/api/sso/callback`) — the SSO-redirect pattern already used
  by kingdom-tactics-server, not the device-credential pattern mud-builder-client/kingdom-tactics-client
  use (both exist in this repo; redirect matches what this plan's Step 1 text specified). Updated the
  root `jest.config.cjs` (added to `LOCAL_CONFIG_PACKAGES`/`LOCAL_CONFIG_IGNORES`) and ran `pnpm
  install` to register the new workspace member (lockfile updated, no new external deps). Verified:
  `pnpm --filter @shatteredarchive/simulacrum-server build` (clean tsc + public/ asset copy) and `test`
  (10/10 passing — `access-codes.test.ts` covers mint/consume/single-use/expiry/path-traversal-rejection;
  `relay.test.ts` covers the live tier re-check and a real bidirectional pipe through a throwaway
  in-process TCP stand-in for merc-mud, matching the plan's own "throwaway listener" Verify technique);
  `docker compose config` validates the whole experimental file; built the REAL Docker image standalone
  and ran it — `GET /health` and `GET /api/whoami` (signed-out) responded correctly, `POST
  /api/access-code` correctly 401'd with no token, and a live raw-socket connection to the relay port
  got exactly the expected rejection message ("Access denied: a valid trusted-tier access code is
  required...") without ever attempting to dial merc-mud. See the close-out note above Step 2 for the
  two things intentionally left for later (the manual `register-service` key ceremony; full E2E once
  Step 4 lands).
- 2026-08-16 **register-service ceremony done, against the live experimental stack — found and fixed
  a real bug along the way**: user clarified we're working the DEV stack (not prod) and asked me to
  handle the registration directly. Confirmed the experimental compose stack was ALREADY running via
  Docker (`shatteredarchive-auth-server-1` up ~5h). Extracted the live `DATA_ENCRYPTION_KEY` from the
  running container (read-only, `docker exec ... cat .../encryption.key`) since `register-service.ts`
  runs as a plain host process and needs that key to open auth-server's real (bind-mounted) data
  directory — temporarily set it in `apps/auth-server/.env` (git-tracked; edited then reverted
  immediately after each run, confirmed clean via `git status`/`git diff` both times) rather than
  leaving it in a tracked file even momentarily long-term. First attempt at the live introspect key
  (via a throwaway `node -e` bogus-token probe run inside the container, since real SSO needs a
  browser) failed: `401 service assertion is invalid, unknown, or expired`. Root-caused via
  auth-server's own logs (`docker logs`): `"Service registry: service-deregistered for
  \"simulacrum-server\" (1 key(s) revoked — not declared in SERVICE_REGISTRY)"` — the RUNNING
  auth-server container predated this session's earlier compose-file edit adding `simulacrum-server`
  to `SERVICE_REGISTRY` (env vars are baked in at container start, never hot-reloaded), so its
  boot-time reconciler pass (`service-registry-reconciler.ts`) saw a key for a service NOT in its own
  (stale) registry and revoked it — a real, config-drift-triggered bug this session's own earlier edit
  caused, not a pre-existing one. Fixed by recreating auth-server (`docker compose up -d
  --force-recreate auth-server`) so it booted with the CURRENT `SERVICE_REGISTRY` (confirmed via its
  boot log: `"service \"simulacrum-server\" is declared but has published no public key yet... its
  keys are left untouched"` — the documented SAFE path), then re-ran `register-service` for a second,
  now-durable key. Verified end to end: brought `simulacrum-server` up for real in the running stack
  (`docker compose up -d --build simulacrum-server`, then `restart` after the second key landed);
  `GET /health` responds inside the real container; a direct `introspect()` call from INSIDE
  simulacrum-server's own container, using the compiled `services-server` dist module and the real
  saved key, against the real running auth-server, returned `{"valid":false}` for a bogus token — the
  correct outcome (assertion/key verified successfully; the garbage TOKEN, not the key, is what's
  invalid) — proving the whole registration chain works, not just that the CLI printed success. Both
  containers left running (`auth-server`, `simulacrum-server`), healthy, as part of the ongoing dev
  stack. `apps/simulacrum-server/secrets/shattered-service.key` now holds the second (durable) key;
  the first, revoked key's file content was overwritten before being used for anything, so nothing
  built against it. `docker exec` note for next time: git-bash mangles `/repo/...`-style paths passed
  as arguments into native `docker`/`node` invocations (converts them to a Windows path) —
  `MSYS_NO_PATHCONV=1` is required, same caveat CLAUDE.md already documents for other native exes.
- 2026-08-16 **step 2 done**: fixed `GAME_PROXY_ALLOWLIST`'s simulacrum entry in both
  `apps/game-server/.env` and the experimental compose file's `game-server` environment block —
  found mid-implementation that the port fix alone wasn't enough (see the correction note above Step
  3): the entry now reads `simulacrum-server.shatteredarchive.dev:65001`, not the public
  `simulacrum.shatteredarchive.dev:65001` the step originally assumed, and the stale
  `extra_hosts: host-gateway` block (dating from when merc-mud published straight to the Windows
  host) is removed, replaced with a comment explaining why it's gone. Confirmed zero diff in
  `apps/game-server/src` and `apps/game-client/src`; `shatteredarchive-mobile` has pre-existing
  unrelated uncommitted changes (lua/python script-runtime work) not touched by this plan. Recreated
  `game-server` (`docker compose up -d --force-recreate game-server`) to pick up the new allowlist.
  Verified for real, twice: (1) from inside game-server's own container, a raw `net.connect` to
  `simulacrum-server.shatteredarchive.dev:65001` succeeded and returned the relay's access-code
  prompt, confirming the DNS/reachability fix; (2) a full protocol-level test through game-server's
  ACTUAL `/ws/game` gateway (using its own bundled `ws` package from inside the container) — opened a
  real WebSocket, sent the exact `{"type":"connect","host":"simulacrum-server.shatteredarchive.dev",
  "port":65001}` message game-client's Connect modal sends, and received back
  `{"type":"raw","data":"Simulacrum access code: \n"}` — proving `isTargetAllowed` and `MudClientApp`
  correctly carry the prompt all the way to what a browser client would see, with zero client-side
  code involved. `dsl-mud.org` unaffected by construction (entry untouched in the allowlist string,
  zero diff in the connect-handling code) — not re-tested live against the real external MUD, since
  that would be an unnecessary real-world call to a third party for something already provably true.
- 2026-08-16 **step 3 done**: added `builder` to `SERVICE_TIERS` (`services/services-server/src/
  auth-tiers.ts`) and its literal client-side mirror (`mud-builder-client/src/api/client.ts:445-446`).
  `authGuard` (`routes/auth.ts`) now takes `roleStore` and 403s an `account` actor below `builder`
  tier on any mutation it gates — this is the real persist-path floor (`PUT`/`POST /api/areas*`,
  `POST /api/reload`, and everything else the blanket guard covers). `/api/snippets` got its own,
  lower floor (`trusted`+) via a new `requireTrustedAccount` helper in `snippets.ts`.
  `checkRebuildEligibility`'s threshold moved from `'admin'` to `'builder'`, both error messages
  updated to match. `app.ts`: `roleStore` construction moved above the `authGuard` mount and threaded
  into both `authGuard` and `registerSnippetRoutes`. Found and fixed one real design gap along the
  way — see the correction note above (presence heartbeats needed an explicit, fail-closed exemption
  from the new tier check, since they're deliberately non-persisting and the blanket gate would have
  caught them as an unintended side effect). Test fallout was substantial and expected: every existing
  test that relied on "any authenticated account can mutate" (several introspect-flow tests in
  `auth.test.ts`, EVERY existing test in `snippets.test.ts`) needed an explicit tier grant added so
  they keep testing what they're actually about, not incidentally get blocked by the new floor; the
  `manager`-tier rebuild test flipped from expecting 403 to 200 (manager now sits above the new
  `builder` floor); added new boundary tests throughout (`user` 403s, `trusted` 403s on the persist
  path but succeeds on snippets, `builder` succeeds on both, `manager`/`admin`/`owner` unaffected) —
  `auth.test.ts` gained a whole new describe block for the general-gate boundary, `rebuild.test.ts`
  gained a route-level `builder`-tier-passes test alongside the existing unit-level matrix. The repo-
  wide grep for hardcoded numeric tier-rank comparisons (Verify's own request) caught a REAL one:
  `services-server/src/auth-tiers.test.ts` had a snapshot of the old 5-element ladder plus a hardcoded
  `.toBe(3)` index check for `'trusted'` — both fixed (now 6 elements, index 4), and added explicit
  `canManage` boundary cases for the new tier. Verified: `pnpm --filter mud-builder-server test`
  (181/181), `pnpm --filter mud-builder-client test` (263/263) + `vite build` (clean), `pnpm --filter
  services-server test` (28/28, after the snapshot fix), `pnpm --filter simulacrum-server test`
  (10/10, unaffected as expected). Rebuilt and recreated the REAL `mud-builder-server` container in
  the running experimental stack and confirmed live: anonymous `GET /api/areas` still 200s, an
  unauthenticated `PUT /api/groups` still 401s (both via direct HTTP calls from inside the container,
  not just the test suite).
- 2026-08-16 **step 4 done**: `merc-mud/docker-compose.yml` — `deploy.resources.limits` (cpus 1.0,
  memory 512M), `ports` narrowed to `127.0.0.1:4000:4000`, joined `sa-shared` (declared `external:
  true` at the top level, matching DSL/Server's own `docker-compose.yml`/`docker-compose-prod.yml`
  precedent exactly) with alias `simulacrum-engine` — the same value simulacrum-server's
  `SIMULACRUM_HOST` config (Step 1) already expected, so no simulacrum-server change was needed here.
  `merc-mud2.4` was already running as the user's live dev instance (up 5h) — recreated it in place to
  pick up the new config, a brief, expected restart on the dev stack. Verified for real against the
  actual containers, not just `docker compose config`: `docker inspect` confirms
  `NanoCpus:1000000000, Memory:536870912` (exactly 1.0 cpu / 512M); `docker port` shows
  `127.0.0.1:4000` only; from `simulacrum-server`'s own container, `net.connect('simulacrum-engine',
  4000)` succeeds over `sa-shared`. Went further than the step's own Verify text and closed out Step
  1's deferred item too: minted a REAL access code (via a temporary `trusted`-tier grant added
  directly to the host's `roles.json`, restored to its exact original content afterward) and drove a
  full connection through the actual gated relay — got the real ROM 2.4 welcome banner and "By what
  name do you wish to be known?" prompt back from the real merc-mud engine, proving the complete chain
  (access code → relay gate → sa-shared → merc-mud) works end to end, not just each piece in
  isolation. One methodology-only finding, not a real bug: `RoleStore.setTier()`'s tmp+rename write
  fails with `EBUSY` when attempted from a process that only holds the single-file `roles.json` bind
  mount (Windows/Docker Desktop can't atomically rename over that specific mount point) — harmless in
  production since simulacrum-server's real code path only ever calls the read side (`tierFor`); hit
  only because my own test script tried to grant a tier from the wrong container for convenience.
  Worked around by writing the host file directly for the test, which doesn't go through the
  container's bind-mount rename semantics at all.
- 2026-08-16 **step 5 done**: added the simulacrum HTTP block to `edge-subdomains.conf` and its
  HTTPS mirror to `includes/tls-dev.conf`, route-for-route identical to game-client's own block
  (both files now carry a "keep these in step" comment cross-reference). Found and fixed a gap
  the plan's own "Do" text didn't call out: nginx's OWN alias list needed
  `simulacrum.shatteredarchive.dev` added too — in BOTH the experimental compose (missing
  entirely) and prod compose — since that's what lets the hostname resolve to nginx at all for
  any container (or, per Plan 2 Step 4's own discovery, the host itself) trying to reach it,
  matching every other live public hostname's existing entry there. Prod compose: added
  `simulacrum-server` to `GAME_PROXY_ALLOWLIST` (the internal `-server`-suffixed alias, per
  correction 5 — never the public hostname) and a full `simulacrum-server` service block
  mirroring `soulsteel-server`'s shape (prod has no `mud-builder-server` OR `kingdom-tactics-
  server` block to mirror instead — both are still experimental-only).

  **Flagged a real operational gap rather than silently working around it**: `mud-builder-server`
  isn't deployed to this prod compose at all, so the shared-role-store mount (Constraints:
  trusted+ tier shared between mud-builder-server and simulacrum-server) has nothing real to
  share with in PROD yet. Used a best-guess relative path matching this host's dev
  sibling-directory layout (same treatment as the DSL/Server prod compose's own character-sync
  mount from the sibling plan), with an explicit in-file comment: until mud-builder-server also
  goes live here or an operator manually seeds a `roles.json` row at that path, simulacrum is
  publicly reachable but no account can actually obtain an access code — a safe fail-closed
  state, not a broken one, but worth knowing in advance rather than discovering it as a
  mysterious 403 later.

  Verified well beyond `docker compose config` (which passed for both files): recreated the REAL
  experimental nginx container with the new blocks — it started clean and stayed up (a syntax
  error would have crash-looped it, not just failed a YAML lint). `curl -k
  https://simulacrum.shatteredarchive.dev/` returns a real `200` serving game-client's actual SPA
  HTML. Then the more important check: a full WSS connection from INSIDE game-server's own
  container to `wss://simulacrum.shatteredarchive.dev/ws/game` (the exact public path a real
  browser would use, self-signed dev cert and all) correctly reached the relay's access-code
  prompt — proving the ENTIRE chain (public hostname → nginx → game-server → simulacrum-server)
  works, not just nginx's own routing table in isolation. Confirmed `game-client.shatteredarchive
  .dev` still returns `200` unaffected.
- 2026-08-16 **step 6 done**: two things this step's original text didn't anticipate, both
  discovered by reading the actual file rather than assuming. (1) No new `:80` HTTP→HTTPS
  redirect entry was needed at all — a wildcard `*.shatteredarchive.dev` in the file's ONE
  generic `:80` block already covers every subdomain, which is WHY `auth.`/`soulsteel.` never
  needed their own redirect block either when THEY went live; simulacrum/build just ride the
  same wildcard for free. (2) `auth.`/`soulsteel.` (the blocks the step's text named as the
  shape to mirror) both have NO websocket — but simulacrum reuses game-client's `/ws/game` path,
  so mirroring them would have silently dropped the WS upgrade headers. Used
  `game-client.shatteredarchive.dev`'s own block instead (same SPA, same `/ws/game` path,
  already proven live) — genuinely the closer precedent once the actual traffic shape is
  considered, not just the two names the step happened to mention. `build.shatteredarchive.dev`
  (mud-builder, no websocket) DOES match the auth/soulsteel shape correctly, so that one used
  the originally-suggested pattern as-is. Replaced the `build.`+`kingdom-tactics.` shared "stubs"
  banner comment (which explained both together) with build's own live-block comment plus a
  smaller kingdom-tactics-only stub banner, so kingdom-tactics' still-untouched block keeps its
  own explanatory context rather than losing it as a side effect of build's block going live.

  Verified `nginx -t` for real, not just visually: generated throwaway self-signed certs for
  ALL NINE distinct cert names this file references (not just simulacrum/build's shared one),
  plus a real 2048-bit dhparam (a 512-bit one — fast to generate — was flatly rejected by modern
  OpenSSL as "key too small," so this needed the real size to test at all) and a standard
  certbot `options-ssl-nginx.conf`, then ran an actual `nginx:alpine` container against the
  WHOLE file. Passed clean: "syntax is ok" / "test is successful" — a genuine validation of
  every block in the file, not just the two new ones, and a real assurance beyond what a
  visual copy-paste review could give. Hit the git-bash path-mangling issue a third time this
  session, this time on an `openssl req -subj "/CN=test"` argument (MSYS interpreted the leading
  `/` as a path) — `MSYS_NO_PATHCONV=1` fixed it, same as every prior occurrence.

  Explicitly telling the user, per this step's own Verify text (cannot self-verify beyond this):
  the shared `shatteredarchive-dev-apps` cert on the REAL front-proxy host must be expanded —
  `certbot --expand -d simulacrum.shatteredarchive.dev -d build.shatteredarchive.dev` plus every
  existing `-d` name on that cert — before either hostname serves valid TLS publicly. Route
  wiring (this step) and cert coverage (that command) are deliberately separate; going live on
  the real host is the user's own action, outside this session's reach.
