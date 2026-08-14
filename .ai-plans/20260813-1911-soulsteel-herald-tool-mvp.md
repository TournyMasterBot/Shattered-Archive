# Plan: Soulsteel — Herald tracking tool for "The Umbral Cloak and the Soulsteel Dagger" (MVP)

Created: 2026-08-13T19:11:00-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Stand up a new client/server app pair, `apps/soulsteel-client` + `apps/soulsteel-server`,
that helps a Herald run this social-deduction game live: track players, role assignments, nightly
hidden actions, day votes/executions, and win conditions, with a dark/mystical themed UI. Wire it
into both deploy composes and the nginx edge exactly like the existing additive apps
(mud-builder/kingdom-tactics/scrum-poker).

> **Relationship to the follow-on plan.** Central-auth sign-in + a server-side per-account archive
> + the C# dashboard "click to reload a torn-down room" integration is a separate, later plan:
> `20260813-1912-soulsteel-auth-archive-dashboard.md`. This plan deliberately ships without it —
> see Constraints for why the server stays a health-check skeleton here.

## Goal

A Herald can open `soulsteel.shatteredarchive.dev`, start a new game (a client-generated GUID
workspace, no server round-trip required), add players, assign roles (built-ins plus any
Disciple-added modifier roles), and run the game night-by-night and day-by-day: recording
Umbraseer checks, Darkshield protections, the Assassins' nightly target, day-vote outcomes and
executions, and every elimination with its cause. The UI surfaces a live win-condition read
(Dark Knights eliminated all Assassins / Assassins ≥ Dark Knights) the Herald can act on or
dismiss. Everything persists in the browser's IndexedDB, keyed by the room GUID, and survives a
page reload. Reached when: `apps/soulsteel-client` + `apps/soulsteel-server` exist, build and test
clean; both docker-compose files and the nginx edge (both `edge-subdomains.conf` and the DSL front
proxy) route `soulsteel.shatteredarchive.dev`; and a full game — create players, assign roles, run
a night, run a day vote/execution, reach a win condition — works end-to-end against the
experimental stack, surviving a browser reload.

## Constraints

- **No websocket, no server-side room registry in this phase.** Unlike scrum-poker, only the
  Herald operates this tool — players never connect to it. A room GUID is a client-generated
  workspace id (`crypto.randomUUID()`), not a server-brokered multiplayer session. Do not build a
  `ws-gateway`/`RoomStore` equivalent.
- **`soulsteel-server` ships as a health-check-only skeleton in this phase**, per the user's
  explicit instruction that this "does not need any persistent data storage beyond IndexedDB at
  this time." No data dir, no volume, no per-room or per-account store yet — that's entirely the
  follow-on plan's job, once account-scoping actually exists to hang it off of. Still stand the
  server up now (mirroring every other additive app's shape) so the follow-on plan only adds
  routes, not new deploy/nginx plumbing.
- **Skip a `services/soulsteel-core` shared-types package in this phase.** `scrum-poker-core`
  (`services/scrum-poker-core`) exists because client and server share a real wire contract; until
  the follow-on plan's archive payload, `soulsteel-server` has no domain endpoints to share types
  with. Don't create the package pre-emptively.
- **Automated win-condition detection covers the base two-faction game only** (Dark Knights vs.
  Cultist Assassins, by living head-count). The rules' own "Game Modifiers" section is explicitly
  open-ended ("Disciples may add or modify roles as they see fit" — e.g. a Cultist Minion who
  serves the Assassins without being counted as one). Track modifier roles on the roster with a
  Herald-chosen alignment/counting flag, but surface the win banner as a dismissible suggestion,
  never an automatic game-ending action.
- **Dark theme is fixed, not a toggle.** Skip scrum-poker's light/dark `theme-init.js`
  FOUC-prevention machinery (`apps/scrum-poker-client/public/theme-init.js`,
  `src/theme/useTheme.ts`) entirely — there is no toggle-driven flash to prevent here, so no inline
  `<script>` and no CSP `script-src` exception is needed. Use the strict `security-headers.conf`
  profile on the edge, same as `auth.`/`build.`/`kingdom-tactics.`.
- **No new npm dependency for the particle effect.** Hand-roll a `<canvas>`-based ambient effect
  (respect `prefers-reduced-motion`). The workspace lockfile has no particle library today
  (confirmed via grep) and CLAUDE.md's minimal-integrations + dependency-review posture favors not
  adding one for a cosmetic effect.
- **Port convention**: game 30080/31000, web 40080/41000, KT 50080/51000, mud-builder 60080/61000,
  auth 62080/62000, scrum-poker 63080/63000 (comment at
  `apps/scrum-poker-server/src/index.ts:45-46` and `apps/scrum-poker-client/vite.config.ts:10-11`)
  → **soulsteel gets 64080 (vite dev) / 64000 (server)**. `psd-viewer-server` (default port 62000)
  is a standalone local-only dev tool, not part of this compose ladder — confirmed it has no
  docker-compose entry.

## Context (verified 2026-08-13 — MCP/qwen stack was down, so this was read directly rather than
## via `pack`; trust these file:line refs, don't re-survey from scratch)

- **Reference app to mirror**: `apps/scrum-poker-client` + `apps/scrum-poker-server`. Client is
  Vite + React 19 + TS (`vite.config.ts`, `src/main.tsx`, `src/App.tsx`, feature folders under
  `src/features/`); server is Express via `@shatteredarchive/services-server`'s
  `createExpressService`, structured `src/index.ts` (boot/health/shutdown) +
  `src/http/*-routes.ts` (`apps/scrum-poker-server/src/index.ts:1-96` is the full skeleton to
  trim down — drop the `RoomStore`/`ws-gateway`/`registerScrumApiRoutes` lines, keep the
  logger/env-file/health-endpoint/graceful-shutdown shape).
- **Domain rules to encode** (from the user's game-rules text, not re-quoted in full here — see
  the original request): two phases per round, **Day** (discuss → vote → execute on ≥50%+1) and
  **Night** (hidden actions: Umbraseer checks one player's alignment once/night; Darkshield
  protects one player once/night; Assassins reach a consensus target once/night). Roles: Herald
  (moderator, not a player), Umbraseer (Dark-Knight-aligned), Darkshield (Dark-Knight-aligned),
  Dark Knight (no night power), Cultist Assassin. Win: Dark Knights win when zero Assassins
  remain; Assassins win when living Assassins ≥ living Dark Knights. Recommended role
  distribution scales with player count (4-5p / 6-8p / +1 assassin per 3-4 additional Dark
  Knights) — encode as a suggestion table, not an enforced rule. First-night murder-block
  exception and configurable phase timers (3m night / 5m discuss / 3m vote, scale with size) are
  both named in the rules' "Recommendations" section — worth surfacing as Herald-adjustable
  settings, not hardcoded.
- **`pnpm-workspace.yaml`** (`c:/Projects/ShatteredArchive/pnpm-workspace.yaml`): packages live
  under `apps/*`, `sdks/*`, `utils/*`, `types/*`, `services/*`. `services/scrum-poker-core` is
  where that app's shared package lives (confirmed via glob) — same root soulsteel would use if a
  shared package is ever added.
- **Dockerfiles to mirror**: `deploy/scrum-poker-server.Dockerfile` (multi-stage, pinned
  `node:26.3.1-alpine3.24@sha256:a2dc166a...`, `apk --no-cache upgrade`,
  `COREPACK_ENABLE_STRICT=1`, builds workspace deps then
  `pnpm --filter @shatteredarchive/scrum-poker-server... build`, runtime stage COPYs `deploy/.env`,
  `EXPOSE`+`CMD node .../dist/index.js`) and `deploy/scrum-poker-client.Dockerfile` (same build
  stage shape, runtime is `nginx:1.31.2-alpine@sha256:81595dd7...` serving
  `deploy/nginx/scrum-poker-client.conf` + the built `dist/`). Soulsteel's server Dockerfile skips
  the `scrum-poker-core` build line (Constraints: no core package yet); the client Dockerfile skips
  the `VITE_AD_CLIENT`/`VITE_AD_SLOT`/`VITE_GA_ID`/`VITE_SP_DEV` build args entirely (no ads/GA on
  this app).
- **Compose wiring to mirror**: `deploy/docker-compose.shattered-archive-experimental.yml:555-652`
  (scrum-poker block) and the equivalent in `deploy/docker-compose.yml:366-453` (prod). Both use
  `networks.shatteredarchive.aliases` for the internal DNS name, `expose` (not `ports`) for the
  server, and a `healthcheck` using a bare `node -e` TCP-connect probe (no curl in the alpine
  image). Note the scrum-poker block's explicit comment "Deliberately NOT wired to auth-server" —
  soulsteel's Phase-1 server should say the same for now (Phase 2 changes this).
- **Nginx edge (`deploy/nginx/edge-subdomains.conf`)**: the `build.`/`kingdom-tactics.` blocks
  (`:369-490`) are the pattern to copy — additive (not in nginx's `depends_on`), the
  `resolver 127.0.0.11 valid=30s; set $var host:port; proxy_pass http://$var;` idiom (a literal
  hostname in `proxy_pass` goes stale across a container recreate — documented at `:132-150`),
  `security-headers.conf` + `robots-disallow-all.conf` includes, path-split `/api/<name>/` to the
  server and `/` to the client SPA on **one subdomain** (no separate client/server subdomain pair
  — same reasoning noted in the kingdom-tactics block's own comment, `:427-434`). Soulsteel needs
  no `/ws/` location (no websocket, per Constraints) and no rate-limit zone yet (no POST endpoints
  exist until Phase 2).
- **DSL front proxy (`C:/Projects/DSL/nginx/shattered_archive.site`)**: real per-subdomain HTTPS
  blocks live around `:660-792` (scrum-poker, auth examples); a **stub section for not-yet-public
  services** starts at `:794` with an explicit instruction in its own comment (`:806-808`): "To go
  live, delete the stub block and copy the auth or scrum-poker block above, changing the hostname,
  cert paths and any websocket path." The `build.`/`kingdom-tactics.` stubs (`:808-871`) each
  `return 503` (not 404, so it's distinguishable from a real misconfiguration) with a small HTML
  body linking back to `shatteredarchive.dev`, reuse the shared multi-SAN cert
  (`shatteredarchive-dev-apps`), and are what soulsteel's own stub should mirror — it is not meant
  to go publicly live on this front proxy in this phase (dev access is via the hosts-file mapping
  to the docker edge directly, same as every other in-progress app).
- **Dev access convention** (user-stated, matches existing apps): host file maps
  `127.0.0.1 soulsteel.shatteredarchive.dev`, and the experimental compose stack serves it
  straight from the docker edge — the DSL front-proxy stub above is a separate, later step for
  when/if this goes publicly live through the front proxy.
- **No particle library in the workspace** (grepped `pnpm-lock.yaml` for `tsparticles`/
  `canvas-confetti`/`three`/`react-particles` — no matches).

## Steps

### [x] 1. Scaffold `apps/soulsteel-client` and `apps/soulsteel-server`
- Do: Create both packages mirroring scrum-poker's shape, trimmed per Constraints. Client:
  `package.json` (`@shatteredarchive/soulsteel-client`, same `dev`/`build`/`test`/`format` scripts
  and dep versions as scrum-poker-client's `react`/`react-dom`/`vite`/`@vitejs/plugin-react-swc`),
  `tsconfig.json`(+`.jest.json`), `jest.config.cjs`, `vite.config.ts` (port `64080`, proxy `/api`
  and `/health` to `http://localhost:64000` — no `/ws` proxy entry), `index.html`, `src/main.tsx`,
  `src/App.tsx`. Server: `package.json` (`@shatteredarchive/soulsteel-server`,
  `express`/`dotenv`/`@shatteredarchive/services-server`/`@shatteredarchive/types-server` deps, no
  `ws`), `tsconfig.json`, `jest.config.cjs`, `src/index.ts` — copy
  `apps/scrum-poker-server/src/index.ts:1-96`'s logger/env-file/graceful-shutdown skeleton, drop
  the `RoomStore`/`ws-gateway`/`registerScrumApiRoutes` lines, default `PORT` to `64000`, keep only
  `GET /` and `GET /health` (`ServerHealth` shape, matching scrum-poker's).
- Files: /workspace/shattered-archive/apps/soulsteel-client/package.json,
  /workspace/shattered-archive/apps/soulsteel-client/vite.config.ts,
  /workspace/shattered-archive/apps/soulsteel-client/tsconfig.json,
  /workspace/shattered-archive/apps/soulsteel-client/jest.config.cjs,
  /workspace/shattered-archive/apps/soulsteel-client/index.html,
  /workspace/shattered-archive/apps/soulsteel-client/src/main.tsx,
  /workspace/shattered-archive/apps/soulsteel-client/src/App.tsx,
  /workspace/shattered-archive/apps/soulsteel-server/package.json,
  /workspace/shattered-archive/apps/soulsteel-server/tsconfig.json,
  /workspace/shattered-archive/apps/soulsteel-server/jest.config.cjs,
  /workspace/shattered-archive/apps/soulsteel-server/src/index.ts
- Verify: `pnpm install --frozen-lockfile` picks up both new workspace packages;
  `pnpm --filter @shatteredarchive/soulsteel-server dev` boots and `GET /health` returns
  `{status:"ok",...}`; `pnpm --filter @shatteredarchive/soulsteel-client dev` serves on `:64080`.

### [x] 2. Domain model + IndexedDB persistence (pure TS, no UI yet)
- Do: `src/domain/types.ts` — `Player {id,name,roleId,alive,eliminatedAt?:{day,phase,cause:
  'executed'|'assassinated'|'other',note?}}`, `RoleDef {id,name,alignment:'darkKnight'|'assassin'|
  'neutral',builtin:boolean,oncePerNight?:boolean,description}`, `TimelineEntry` (a tagged union:
  night-check result, night-protect, night-assassin-target, day-vote-tally, execution), `RoomState
  {id,createdAt,updatedAt,dayNumber,phase:'day'|'night',players,roles,timeline,settings}`.
  `src/domain/roleCatalog.ts` — the four built-in roles (Herald excluded — it's the operator, not a
  roster entry) with their alignment. `src/domain/recommendedDistribution.ts` — the player-count →
  suggested-assassin-count table from the rules' Recommendations section, as a pure function.
  `src/domain/gameReducer.ts` — pure reducer: add/remove/rename player, assign role, record a night
  action, advance day↔night, record a vote/execution, compute win condition (living Dark-Knight-
  aligned count vs. living Assassin-aligned count; `neutral`/custom-flagged roles excluded from the
  automatic tally per Constraints). `src/storage/soulsteelDb.ts` — a small IndexedDB wrapper (no
  new dependency; hand-rolled `indexedDB.open`), database `soulsteel`, object store `rooms` keyed
  by room GUID, storing serialized `RoomState`; also a "list known rooms" query (for the Landing
  page's resume list) reading just `{id, updatedAt, dayNumber}` cheaply.
- Files: /workspace/shattered-archive/apps/soulsteel-client/src/domain/types.ts,
  /workspace/shattered-archive/apps/soulsteel-client/src/domain/roleCatalog.ts,
  /workspace/shattered-archive/apps/soulsteel-client/src/domain/recommendedDistribution.ts,
  /workspace/shattered-archive/apps/soulsteel-client/src/domain/gameReducer.ts,
  /workspace/shattered-archive/apps/soulsteel-client/src/storage/soulsteelDb.ts
- Verify: unit tests (jest, no browser needed for the reducer/catalog/distribution; `soulsteelDb`
  tested with `fake-indexeddb` or skipped to manual/browser verification in Step 7) covering: role
  assignment, a full night→day→execution cycle updates `alive`/`eliminatedAt` correctly, win
  condition flips true exactly when living Assassins ≥ living Dark Knights or hits zero Assassins.

### [x] 3. Landing page + core Room dashboard UI
- Do: `src/features/landing/LandingPage.tsx` — "New Game" (generates a GUID via
  `crypto.randomUUID()`, navigates to `/room/:id`) and a "Resume" list reading
  `soulsteelDb`'s known-rooms query, newest first. `src/routing/` — a small route parser for
  `/room/:id` (mirror `apps/scrum-poker-client/src/routing/room-id.ts`'s validation shape, GUID
  instead of scrum-poker's room-code format). `src/features/room/RoomPage.tsx` — the Herald
  dashboard shell, loading/saving `RoomState` from `soulsteelDb` on every reducer dispatch (debounce
  like scrum-poker's room-file write, per its own comment at
  `apps/scrum-poker-server/src/index.ts:81-82`, is optional here — IndexedDB writes are local and
  cheap, plain on-dispatch persistence is fine). `src/features/room/PlayerRoster.tsx` (add/rename/
  remove players, alive/dead badge). `src/features/room/RoleAssignmentPanel.tsx` (assign built-in
  roles, show the recommended distribution for the current player count as a hint, not an
  enforcement). `src/features/room/PhaseController.tsx` (day/night toggle, day counter).
- Files: /workspace/shattered-archive/apps/soulsteel-client/src/features/landing/LandingPage.tsx,
  /workspace/shattered-archive/apps/soulsteel-client/src/routing/room-id.ts,
  /workspace/shattered-archive/apps/soulsteel-client/src/features/room/RoomPage.tsx,
  /workspace/shattered-archive/apps/soulsteel-client/src/features/room/PlayerRoster.tsx,
  /workspace/shattered-archive/apps/soulsteel-client/src/features/room/RoleAssignmentPanel.tsx,
  /workspace/shattered-archive/apps/soulsteel-client/src/features/room/PhaseController.tsx
- Verify: component tests (mirror scrum-poker-client's `*.test.tsx` pattern, e.g.
  `ParticipantTable.test.tsx`) for roster add/remove and role assignment; manual check that
  navigating to a fresh `/room/<new-guid>` and reloading the page preserves state.

### [x] 4. Night/day action recording, timeline, and win-condition banner
- Do: `src/features/room/NightActionLog.tsx` — per-night entry form: Umbraseer's checked player +
  revealed alignment, Darkshield's protected player, Assassins' consensus target; enforces
  once-per-night per the rules (disable a role's input once already recorded for the current
  night). `src/features/room/DayVoteRecorder.tsx` — accusation tally input, computes ≥50%+1,
  records the executed player (or "no majority") on confirm; on confirming a night's assassin
  target, cross-check the Darkshield's protection from the same night and record the elimination
  as `'assassinated'` only if unprotected. `src/features/room/Timeline.tsx` — chronological render
  of `RoomState.timeline` (day N vote/execution, night N actions/elimination). `src/features/room/
  WinConditionBanner.tsx` — reads the reducer's computed win state, dismissible, never blocks
  further input (Constraints: modifier-role interactions are the Herald's call).
- Files: /workspace/shattered-archive/apps/soulsteel-client/src/features/room/NightActionLog.tsx,
  /workspace/shattered-archive/apps/soulsteel-client/src/features/room/DayVoteRecorder.tsx,
  /workspace/shattered-archive/apps/soulsteel-client/src/features/room/Timeline.tsx,
  /workspace/shattered-archive/apps/soulsteel-client/src/features/room/WinConditionBanner.tsx
- Verify: component/unit tests for the protection-cross-check (protected target survives an
  assassination attempt, recorded distinctly from an executed/unprotected death) and for the
  once-per-night input lock; manual run-through of one full day/night cycle in the dev server.

### [x] 5. Settings, dark/mystical theme, and particle background
- Do: `src/features/room/RoomSettingsDialog.tsx` — custom/modifier role editor (name, alignment,
  optional "counts toward win tally" flag per Constraints), configurable phase timer durations
  (default 3m night / 5m discuss / 3m vote per the rules) with a live countdown display during Day/
  Night. `src/index.css` / `src/App.css` — dark, mystical CSS token set (deep umbral background,
  soulsteel/silver accent, evil-magic accent glow) — fixed, no toggle (Constraints). `src/features/
  shared/ParticleField.tsx` — a `<canvas>` ambient particle effect (embers/motes drifting upward,
  low particle count, `requestAnimationFrame`, respects `prefers-reduced-motion` by rendering a
  static frame), mounted once behind the app shell.
- Files: /workspace/shattered-archive/apps/soulsteel-client/src/features/room/RoomSettingsDialog.tsx,
  /workspace/shattered-archive/apps/soulsteel-client/src/index.css,
  /workspace/shattered-archive/apps/soulsteel-client/src/App.css,
  /workspace/shattered-archive/apps/soulsteel-client/src/features/shared/ParticleField.tsx
- Verify: manual visual check in the dev server (dark theme renders, particles animate smoothly,
  `prefers-reduced-motion: reduce` in devtools stops the animation); settings dialog changes persist
  via the Step 2 reducer/IndexedDB path.

### [x] 6. Deploy wiring: Dockerfiles, both composes, nginx edge, DSL front-proxy stub
- Do: `deploy/soulsteel-server.Dockerfile` and `deploy/soulsteel-client.Dockerfile`, copied from
  the scrum-poker Dockerfiles per Context (same pinned base images, `apk --no-cache upgrade`,
  `COREPACK_ENABLE_STRICT=1`) minus the `scrum-poker-core` build line and minus the ad/GA build
  args. `deploy/nginx/soulsteel-client.conf`, copied from `deploy/nginx/scrum-poker-client.conf`'s
  SPA-fallback shape. Add a `soulsteel-server`/`soulsteel-client` block to **both**
  `deploy/docker-compose.shattered-archive-experimental.yml` and `deploy/docker-compose.yml`,
  mirroring the scrum-poker blocks (Context line ranges) but: `PORT: "64000"`, no `DATA_DIR`/no
  volume (Constraints — no persistence yet), the "Deliberately NOT wired to auth-server (yet)"
  comment, `expose: ["64000"]`, `networks.shatteredarchive.aliases` =
  `soulsteel-server.shatteredarchive.dev` / `soulsteel-client.shatteredarchive.dev`. Add a
  `soulsteel.shatteredarchive.dev` server block to `deploy/nginx/edge-subdomains.conf`, copied from
  the `build.`/`kingdom-tactics.` blocks' resolver+variable pattern — `location /api/soulsteel/`
  and `location = /health` to `soulsteel-server:64000`, `location /` to `soulsteel-client:80`,
  `security-headers.conf` + `robots-disallow-all.conf`, no rate-limit zone (Constraints). Add a
  stub block for `soulsteel.shatteredarchive.dev` to `C:/Projects/DSL/nginx/shattered_archive.site`
  in the "NOT-YET-PUBLIC SERVICES (stubs)" section, mirroring the existing `build.`/
  `kingdom-tactics.` stubs exactly (503, shared multi-SAN cert, link back to the root domain).
- Files: /workspace/shattered-archive/deploy/soulsteel-server.Dockerfile,
  /workspace/shattered-archive/deploy/soulsteel-client.Dockerfile,
  /workspace/shattered-archive/deploy/nginx/soulsteel-client.conf,
  /workspace/shattered-archive/deploy/docker-compose.shattered-archive-experimental.yml,
  /workspace/shattered-archive/deploy/docker-compose.yml,
  /workspace/shattered-archive/deploy/nginx/edge-subdomains.conf,
  /workspace/dsl/nginx/shattered_archive.site
- Verify: `docker compose -f deploy/docker-compose.shattered-archive-experimental.yml config` (or
  equivalent syntax check) validates cleanly for both new services; `nginx -t` (or a container
  restart without config errors) validates `edge-subdomains.conf`.

### [x] 7. Local verification against the experimental stack
- Do: `docker compose -f deploy/docker-compose.shattered-archive-experimental.yml build
  soulsteel-server soulsteel-client && ... up -d soulsteel-server soulsteel-client`, with
  `127.0.0.1 soulsteel.shatteredarchive.dev` mapped in the hosts file (per the user's stated dev
  workflow). Full smoke test in a real browser: create a new game, add ~6 players, assign roles
  (including the recommended-distribution hint), run a night (Umbraseer check, Darkshield protect,
  Assassin target), run a day (vote tally, execution), confirm the timeline and elimination causes
  are correct, reach a win condition, reload the page and confirm everything survived in
  IndexedDB. Confirm `curl http://soulsteel.shatteredarchive.dev/health` returns ok through the
  edge.
- Files: none (verification only — record results in the Progress log).
- Verify: all of the above pass; note any deviations from the plan discovered during the real run.

## Progress log

- 2026-08-13T19:11:00-05:00 plan created, at the user's request, following the client/server
  pattern of `apps/scrum-poker-client`/`apps/scrum-poker-server`. MCP/qwen stack (`shattered_mcp`)
  was down at plan-writing time (`qdigest.sh --status` → container exited) so orientation was done
  via direct Grep/Read of the reference app, both compose files, `edge-subdomains.conf`, and the
  DSL front proxy rather than the mandatory `pack` step — noted per CLAUDE.md's degrade-and-tell
  rule. Confirmed no existing `soulsteel*` app/route/compose entry anywhere in the repo (clean
  slate). Confirmed the port ladder's next free slot (64080/64000) and that `psd-viewer-server` is
  a standalone local tool, not part of the ladder. Deliberately scoped the server down to a
  health-check skeleton and deferred auth/archive/dashboard integration to a separate follow-on
  plan (`20260813-1912-soulsteel-auth-archive-dashboard.md`) per the user's own "no persistent
  storage beyond IndexedDB at this time" framing.
- 2026-08-13T19:40:00-05:00 step 1 done: scaffolded both packages exactly per plan (client:
  package.json/tsconfig(+jest)/jest.config.cjs/jest.style-stub.cjs/vite.config.ts/index.html/
  main.tsx/App.tsx+CSS placeholders; server: package.json/tsconfig/jest.config.cjs/index.ts
  trimmed from scrum-poker-server's boot skeleton per Constraints — no RoomStore/ws-gateway/
  domain routes). Registered both in root `jest.config.cjs` (LOCAL_CONFIG_PACKAGES +
  LOCAL_CONFIG_IGNORES) and added `dev:soulsteel*`/`start:soulsteel*` scripts to root
  `package.json`, mirroring scrum-poker's entries. `pnpm install` picked up both new workspace
  packages cleanly (+2, lockfile updated). Verified: `pnpm --filter
  @shatteredarchive/soulsteel-server dev` boots and `GET /health` → `{"status":"ok",...}`;
  `pnpm --filter @shatteredarchive/soulsteel-client dev` serves 200 on `:64080`.
- 2026-08-13T20:05:00-05:00 step 2 done: `src/domain/{types,roleCatalog,recommendedDistribution,
  gameReducer}.ts` + `src/storage/soulsteelDb.ts` (hand-rolled IndexedDB wrapper, db `soulsteel`,
  store `rooms` keyed by room GUID). Caught and fixed two literal-type widening TS errors in
  `gameReducer.ts` (eliminatedAt's `phase`/`cause` fields needed `as const`). Test run surfaced
  two real test-setup bugs, not reducer bugs: a 1-Assassin-vs-1-Dark-Knight roster already
  satisfies the rules' "Dark Knights <= Assassins" win condition at parity before anything
  happens, so both the elimination test and the modifier-role test needed a second Dark Knight
  to avoid asserting `null` against an already-won state — fixed by widening those rosters, not
  by changing the win-condition logic. `soulsteelDb.ts` itself is deferred to browser/manual
  verification (Step 3+) rather than unit-tested — jsdom has no real IndexedDB implementation
  and adding `fake-indexeddb` for one module isn't worth a new dependency. Final: 14/14 domain
  tests pass (`pnpm --filter @shatteredarchive/soulsteel-client test`).
- 2026-08-13T20:25:00-05:00 step 3 done: `routing/{room-id,useRoute}.ts` (mirrors scrum-poker's
  router exactly), rewrote `App.tsx` to route between `LandingPage` (new game / paste-a-link /
  resume list from `soulsteelDb`) and `RoomPage` (loads-or-creates a room, dispatches through
  `reduceRoom`, persists every dispatch to IndexedDB). `PlayerRoster.tsx` and
  `RoleAssignmentPanel.tsx` (with the recommended-distribution hint) plus component tests for
  both (21/21 total client tests pass). `PhaseController.tsx` added ahead of schedule (originally
  slated inline with Step 4) since `RoomPage`'s toolbar needed a day/night control to be useful
  at all — day/night advance and resolve-night wiring is now done, Step 4 only needs the actual
  night-action-entry/vote-recording forms and the timeline/win-banner. Added minimal functional
  CSS (grid/flex layout only, no palette yet — Step 5's job). `pnpm build` succeeds cleanly. The
  literal "reload preserves state" browser check was deferred to Step 7's full real-browser pass
  against the deployed stack rather than spinning up Playwright mid-implementation — noting this
  explicitly rather than silently skipping it, per the plan's own Verify line for this step.
- 2026-08-13T20:45:00-05:00 step 4 done: `NightActionLog.tsx` (once-per-night entry rows for
  Umbraseer/Darkshield/Assassins, each a select-then-lock pattern with a "Change" escape hatch —
  intentionally scoped to the three built-in night roles only, per Constraints custom roles get
  no bespoke automated night-action UI), `DayVoteRecorder.tsx` (strict->50% majority, dispatches
  `recordVoteTally` + `executePlayer` together, shows the resolved outcome instead of the form
  once a day is already executed), `Timeline.tsx` (chronological render, day-phase entries
  ordered before that round's night-phase entries since Day N precedes Night N despite sharing
  `dayNumber`), `WinConditionBanner.tsx` (dismissible, non-blocking). Wired all four into
  `RoomPage.tsx`. Added component tests for all four (protection-cross-check was already covered
  at the reducer level in Step 2; added the once-per-night lock/unlock test explicitly per this
  step's Verify line). 34/34 client tests pass; `pnpm build` clean.
- 2026-08-13T21:15:00-05:00 step 5 done: `RoomSettingsDialog.tsx` (timers, `firstNightNoKill`,
  custom-role editor w/ alignment + win-tally-opt-out), `PhaseTimer.tsx` (ephemeral
  start/pause/reset countdown, Discuss/Vote sub-toggle on Day since the phase model has no
  discuss/vote sub-state), `ParticleField.tsx` (hand-rolled canvas embers, no new dependency,
  `prefers-reduced-motion` guarded — also guarded `window.matchMedia` existing at all, for
  jsdom-test safety). Full dark/mystical palette across `index.css`/`App.css` (umbral violet +
  soulsteel grey + blood-red tokens, fixed — no toggle). Caught and fixed a real deploy hygiene
  bug while verifying: a Step-1 background dev server survived its own `TaskStop` (killed the
  shell wrapper, not the detached vite child on Windows) and silently held port 64080, so the
  Step-5 dev server failed to start on the first attempt — resolved by finding and
  force-killing the orphaned process via `Get-NetTCPConnection`; happened again after this
  step's own verification server, same fix. Ran a full live-browser smoke test (Playwright, via
  Shattered-AI's browser-test tool, script written to a temp location and deleted afterward —
  never committed anywhere): landing -> new game -> add 5 players -> assign all 4 built-in
  roles -> open/close Settings -> Night falls -> Assassin targets a player -> Resolve night ->
  correctly shows "Dead — assassinated (Day 1)", the timeline reads "The Assassins marked X" /
  "X was assassinated", the Day 2 vote pool correctly drops to living players only, and a full
  page reload preserves all of it (IndexedDB round-trip confirmed for real, not just unit-level)
  — this also closes out Step 3's deferred "reload preserves state" browser check. Screenshots
  confirm the theme/particles/dialog render correctly. 38/38 client tests pass; `pnpm build`
  clean.
- 2026-08-13T21:35:00-05:00 step 6 done: `deploy/soulsteel-server.Dockerfile` +
  `deploy/soulsteel-client.Dockerfile` (mirror scrum-poker's, minus the ad/GA build args and the
  scrum-poker-core build line — no core package yet), `deploy/nginx/soulsteel-client.conf`
  (SPA-fallback, identical shape to scrum-poker-client.conf). Added `soulsteel-server`/
  `soulsteel-client` blocks to both `deploy/docker-compose.shattered-archive-experimental.yml`
  and `deploy/docker-compose.yml` (port 64000, no volume/DATA_DIR per Constraints, explicit
  "not wired to auth-server yet" comment mirroring scrum-poker's). Added the
  `soulsteel.shatteredarchive.dev` block to `deploy/nginx/edge-subdomains.conf` (resolver+
  variable pattern, `/api/soulsteel/` + `/health` to the server, `/` to the client, no rate-limit
  zone yet — no POST routes exist). Added a 503 stub block to `C:/Projects/DSL/nginx/
  shattered_archive.site`'s "NOT-YET-PUBLIC SERVICES" section (updated its "two blocks" comment
  to "three"), mirroring the build./kingdom-tactics. stubs exactly. Added
  `soulsteel.shatteredarchive.dev` to both `deploy/scripts/add-hosts.ps1` and `add-hosts.sh`
  (found these list every subdomain individually — not called out in the plan's Files list, but
  needed for the user's stated hosts-file dev workflow to actually cover this app).
  Verified: `docker compose -f <either compose file> config` renders clean (services listed
  include soulsteel-server/soulsteel-client, zero stderr warnings); `edge-subdomains.conf`
  passes a real `nginx -t` after `envsubst` (via a throwaway `nginx:1.31.2-alpine` container,
  `MSYS_NO_PATHCONV=1` needed — bare git-bash path conversion on `-v` volume specs corrupts the
  colon-separated host:container path); the new DSL stub block's own directive/brace syntax
  verified in isolation (the full file needs every other block's real certbot-managed cert files
  to `nginx -t` end-to-end, which don't exist off the production host — confirmed the one
  failure from a full-file check was pre-existing and at an unrelated line, nowhere near this
  edit).
- 2026-08-13T22:10:00-05:00 step 7 done: found the running experimental stack already live
  (`shatteredarchive-*` containers, project name `shatteredarchive`, up 8h) rather than starting
  fresh — built and started `soulsteel-server`/`soulsteel-client` into that same project/network,
  restarted `shatteredarchive-nginx` to pick up the new `edge-subdomains.conf` block. Verified
  `/health`, `/`, and `/api/soulsteel/*` all route correctly through the edge via `curl -H Host:`
  (no system hosts-file edit — avoided touching the user's real Windows hosts file autonomously;
  used `--resolve`/Chromium `--host-resolver-rules` instead, both scoped to the single
  request/browser instance).
  **Caught a real deploy bug via the live-browser pass**: a real browser silently upgrades
  `*.shatteredarchive.dev` to HTTPS, and `deploy/nginx/includes/tls-dev.conf` (the dev-only HTTPS
  mirror of `edge-subdomains.conf`, loaded when `NGINX_TLS_INCLUDE_FILE=tls-dev.conf`, confirmed
  that's what this live stack actually runs) had no soulsteel block — exactly the same gap
  `tls-dev.conf`'s own comments say bit kingdom-tactics AND scrum-poker before, each time only
  caught by live-testing the real hostname, never by review. `curl` masked it (no auto-upgrade),
  so the plain HTTP check passed while the real page 404'd. Added the matching HTTPS block
  (mirrors the new HTTP one exactly, hardcoded `security-headers.conf` since `tls-dev.conf` is
  bind-mounted as-is and never sees `envsubst`) and restarted nginx again — confirmed fixed via
  both `curl --resolve :443` and a second live-browser pass.
  Full deployed-stack browser run (Playwright, Chromium w/ `--host-resolver-rules`, temp script
  deleted after, nothing committed): landing page served correctly over real HTTPS through the
  edge (title, particles, theme all correct), "Start a new game" → real room GUID URL, added 2
  players, then **cold-loaded that exact bookmarked room URL fresh** (proving nginx's SPA
  `try_files … /index.html` fallback actually works for a direct hit, not just in-app
  client-side routing) — both player names were present after the cold load, confirming
  IndexedDB persistence survives a genuine full navigation against the real deployed asset
  bundle, not just the dev server. This closes out the plan's Goal in full.
  Also fixed real deploy hygiene along the way: a background dev server survived its own
  `TaskStop` twice during Step 5/7 (Windows detaches vite's child process from the shell
  `TaskStop` kills), silently holding port 64080 — resolved both times via
  `Get-NetTCPConnection`/`Stop-Process`, worth remembering for any future local dev-server work
  on this host.
  **Left running / follow-ups for the user**: the `soulsteel-server`/`soulsteel-client`
  containers are left up as part of the live experimental stack (matches how every other app
  here is deployed and kept running). `deploy/scripts/add-hosts.ps1`/`.sh` were updated (Step 6)
  but deliberately NOT run — they need admin/root and touch the real system hosts file, which
  wasn't this session's call to make; run `pnpm setup:hosts:win` (or `:nix`) to get
  `soulsteel.shatteredarchive.dev` resolving for normal (non-Playwright-flag) browser use.

**Plan status: COMPLETE.** All 7 steps done and verified against the live deployed stack. Next
up, if wanted: the follow-on plan `20260813-1912-soulsteel-auth-archive-dashboard.md` (central-auth
sign-in + per-account archive + C# dashboard reload).

- 2026-08-13T22:45:00-05:00 post-completion addition (user request, not a new plan — small and
  single-sitting): a 📜 icon next to each assigned role in `RoleAssignmentPanel.tsx` opens
  `RoleParchmentModal.tsx`, showing the exact in-game command sequence to write a role-reveal
  parchment (`dip quill ink` / `write parch` / role text / `Share your role with the Herald.` /
  `write parch title Umbral Cloak & Soulsteel Dagger Role`), with a copy-to-clipboard button. New
  `src/domain/roleParchment.ts` (`roleRevealText`/`roleParchmentCommands`, pure functions, reuse
  `RoleDef.description` rather than a second copy of role text). Tests added for the domain
  functions, the modal, and the icon's conditional visibility (46/46 client tests pass). Rebuilt
  and redeployed `soulsteel-client` to the live stack; verified live via Playwright against the
  real deployed edge — exact command text confirmed, copy-to-clipboard confirmed working (one
  false-negative in the verification script itself, from Windows normalizing `\n` to `\r\n` on
  clipboard write — content matched byte-for-byte once normalized, not a real bug). Screenshot
  confirmed the modal renders correctly in the dark theme.
- 2026-08-13T23:05:00-05:00 minor correction (user request): the parchment command sequence now
  inserts `@` (closes the multi-line write editor) between "Share your role with the Herald." and
  the title command, and ends with a new `read soulsteel` line. Updated
  `roleParchment.ts`/`.test.ts` accordingly; rebuilt/redeployed and confirmed the new lines are
  present in both the unit tests and the live deployed bundle.
- 2026-08-13T23:20:00-05:00 restructuring (user request): decoupled the role CATALOG from role
  ASSIGNMENT, which had been conflated in one component. `RoleAssignmentPanel.tsx` deleted;
  replaced by `RolesPanel.tsx` (right side) — a pure catalog of built-in + custom roles, each
  with its own 📜 parchment icon that works independent of whether any player holds that role
  yet, plus the "add a custom role" form (moved out of `RoomSettingsDialog.tsx`, which is now
  timers-only). Actual role assignment (`<select>` per player, `assignRole` dispatch) and the
  recommended-distribution hint both moved into `PlayerRoster.tsx` (left side), so assigning a
  role now happens directly on the player's own row rather than in a separate panel.
  `RoleParchmentModal.tsx` simplified to take just a `role` prop (it never actually used the
  player's name in the generated commands, so the coupling was unnecessary). Added `×N`
  assigned-count badges to the Roles catalog for at-a-glance visibility without needing the
  player list. 48/48 tests pass (new `RolesPanel.test.tsx`, updated `PlayerRoster.test.tsx`/
  `RoomSettingsDialog.test.tsx`/`RoleParchmentModal.test.tsx`), clean build, rebuilt/redeployed
  and verified live: the Roles catalog shows all four built-ins with zero players present,
  parchment generation works for an unassigned role (Darkshield, screenshotted), assignment via
  the roster row dispatches correctly and the win-condition banner/×N badges react live.
- 2026-08-13T23:40:00-05:00 two more user requests, same sitting: (1) the "Add a custom role"
  form in `RolesPanel.tsx` now starts collapsed behind a `+ Add a custom role` toggle button
  (Cancel resets and re-collapses without dispatching; a successful Add also auto-collapses).
  (2) New house rule, off by default: `RoomSettings.darkshieldBlocksUmbraseer` — if the
  Darkshield's protection target for a night is Assassin-aligned, the Umbraseer is shown "Umbral
  forces block your sight" instead of the true result that night (Herald still sees the true
  result in parentheses alongside it, since they already know all roles — only the phrase meant
  for the player is obscured). New pure `src/domain/umbraseerBlock.ts`
  (`isUmbraseerBlocked`/`UMBRASEER_BLOCKED_MESSAGE`), live-derived from current settings +
  timeline rather than baked into the stored check entry, so a settings toggle or role
  reassignment stays consistent everywhere it's displayed (`NightActionLog.tsx`,
  `Timeline.tsx`). New checkbox in a "House rules" section of `RoomSettingsDialog.tsx`
  (`firstNightNoKill` moved there too, out of Timers, for a cleaner grouping). 59/59 tests pass
  (new `umbraseerBlock.test.ts` + coverage added to `NightActionLog`/`Timeline`/
  `RoomSettingsDialog`/`RolesPanel` tests), clean build, rebuilt/redeployed and confirmed live
  end-to-end via Playwright + screenshots: collapsed-by-default custom-role toggle, the new
  Settings copy, and a full Darkshield-protects-Cultist → Umbraseer-checks-Cultist sequence
  correctly showing the blocked message with the true result alongside it in both the Night
  Actions panel and the Timeline.
- 2026-08-14T00:00:00-05:00 user request, same sitting: `LandingPage.tsx`'s "Resume a game on
  this device" list now supports deletion. Per-row ✕ turns that row into an inline confirm
  ("Delete this Day N game (N players)?" + Delete/Cancel) rather than a native `confirm()`, to
  match the app's own dark-themed modal/confirm idiom instead of a jarring browser popup — same
  "confirm destructive, not trivially-undoable actions" convention used elsewhere in this
  workspace. New bulk control below the list: a day-threshold input + "Delete old games",
  disabled when nothing qualifies, confirming with the exact count before deleting
  (`updatedAt` compared against `now - N days`). Both call `soulsteelDb.ts`'s existing
  `deleteRoom` (already implemented since Step 2, just not wired to any UI until now) and
  refresh the list afterward. New `LandingPage.test.tsx` (didn't exist before) — mocks
  `soulsteelDb.js` entirely via `jest.mock` rather than touching real IndexedDB, covering
  confirm/cancel for both single and bulk delete, threshold changes, and that bulk delete only
  touches qualifying rooms. 67/67 tests pass, clean build. Rebuilt/redeployed and verified live
  against real IndexedDB (not mocked) via Playwright: created 2 real games through the UI,
  injected a third directly into IndexedDB with a 40-day-old `updatedAt` (to exercise the
  threshold without waiting 40 real days), confirmed cancel leaves all 3, single delete removes
  exactly one, and bulk delete at the default 30-day threshold correctly identifies and removes
  only the injected old room — screenshotted.
- 2026-08-14T01:00:00-05:00 user request, same sitting: a Rules modal, reachable via "📜 Read
  the rules" near "Start a new game" on the Landing page and a "Rules" button next to Settings
  in the Room toolbar. Content is the game's canonical source doc
  (`C:/Projects/DSL/Books/Melchaleve/Story Notes/.../Umbral-Cloak-and-Soulsteel-Dagger.txt`),
  researched its `{X` color-code scheme first (own dedicated Explore agent — found the
  translation tables in `game-client/renderDslColorPreviewHtml.ts`, the mobile port, the DSL C#
  `BookRenderColorModel.cs`, and merc-mud's own `comm.c` ANSI implementation) so the role/
  night/day/vote term colors in the UI are the colors that markup actually intends (Herald
  brown, Umbraseer violet, Dark Knights/Darkshield steel, Cultist Assassin blood red, etc. — new
  `--ss-rule-*` tokens in index.css), not an invented palette.
  Two corrections mid-build, both real: (1) my first pass had reworded the rules into my own
  prose — user caught this immediately ("you are not allowed to change the actual phrasings...
  written quite intentionally") and clarified they only wanted the COLOR MEANING understood, not
  the source's per-letter span mechanics literally reproduced. Rewrote `RulesModal.tsx` to the
  verbatim source text (typos included — "excercise", "aide", the trailing comma on Daytime step
  2), applying `Term`/`RoleEntry` color wrappers around the same words only — added a test
  (`matches the source text verbatim, typos and all`) specifically to guard against this
  regressing. (2) First visual pass read more "arcane neon" than gothic — user wanted more dark/
  spooky, edges "bleeding umbral", and pointed at the harrowing Sanctum-Stories for palette cues
  (read `The Harrowing.txt` + `mastery-of-blood.txt` — recurring umbral-violet/bone/blood/ash
  imagery, notably "the scar upon his neck pulsed a sharp violet color before fading back to
  inert black"). Dimmed the translated cyan/magenta header tokens from neon-bright to a
  muted "tarnished silver" / "faded grimoire-ink" register, replaced the bright teal modal
  border+glow with a layered box-shadow (inset black vignette + outward violet-black bleed
  dissolving into the backdrop), retitled in pale bone-ivory with a violet glow, swapped the
  diamond divider glyphs for a rotated dagger (🗡, echoing the brand mark and the "Soulsteel
  Dagger" itself). Inline term colors (Herald/Umbraseer/night/day/vote/etc.) were untouched —
  those were already correct per the first round of feedback. 74/74 tests pass, clean build,
  rebuilt/redeployed both revisions and verified live via Playwright screenshots at every stage
  (both trigger points, full scroll-through, before/after the gothic pass).
- 2026-08-14T01:30:00-05:00 user request, same sitting: manual alive/dead override. Rather than
  building bespoke mechanics for every hypothetical variant the user named (multi-kill in large
  games, resurrection), implemented one general primitive — a `setPlayerAlive` reducer action —
  since any such house-rule composes from just flipping a player's status, no special-casing
  needed. New `TimelineEntry` kind `admin-status-change` (carries its own explicit `phase` field,
  since — unlike every other entry kind — it can happen in either phase, so it can't reuse the
  existing `kind`-prefix phase inference; `Timeline.tsx`'s sort/label logic now goes through a
  shared `entryPhase()` helper instead of guessing from the string prefix). Killing via the
  toggle reuses the existing `EliminationRecord.cause: 'other'` sentinel (already meant for
  exactly this: elimination outside vote/assassination) rather than adding a new cause value;
  reviving clears `eliminatedAt` (the Timeline keeps the permanent historical record either way
  — only current-status fields on the player object change). No-ops (toggling to the state
  already held) intentionally add nothing to the timeline, so idle re-clicks don't create noise.
  `PlayerRoster.tsx`'s alive/dead `<span>` became a one-click `<button>` (color-only styling —
  green/red text, no fill — deliberately "subtle" per the request, no confirmation step since
  it's trivially reversible by clicking again). `Timeline.tsx` renders admin entries with a
  left accent border + an "ADMIN" tag (both in the Herald's own established brown/amber token,
  `--ss-rule-brown`, tying the indicator visually back to "this was a Herald action") so they
  read as clearly distinct from ordinary game-flow entries — directly satisfying the "indicator
  / administrative note in the timeline" ask. 81/81 tests pass, clean build. Rebuilt/redeployed
  and verified live: toggled two players dead in one sitting (multi-kill), revived one
  (resurrection), confirmed both the Day-vote pool and the Timeline reacted correctly, confirmed
  the ADMIN-tagged entries render as designed — screenshotted.
