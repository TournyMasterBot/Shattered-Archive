# Plan: Kingdom Tactics — Phase 8 (Docker experimental wiring: kingdom-tactics client + server images, compose services, nginx edge)

Created: 2026-07-11T17:00:00-05:00 · Workspace: /workspace/shattered-archive · Status: ACTIVE
Task: Add production Docker images for `apps/kingdom-tactics-server` and `apps/kingdom-tactics-client`, wire them as two services in the experimental compose file, and expose them through the edge nginx (SPA + `/ws/kt` WebSocket upgrade), mirroring the existing game-client/game-server deployment exactly. This is the last remaining numbered roadmap phase; everything else is deferred backlog.

> DELEGATION / OWNERSHIP — READ FIRST
> Steps are tagged **(CLAUDE)**. This phase is Docker + nginx wiring (base-image/CVE compliance,
> multi-stage pnpm build ordering, WebSocket proxy correctness) — judgment + host-only verification,
> so it is NOT a qwen handoff. qwen cannot verify a `docker build` and cannot run pnpm in-container
> (incident 2026-07-08), and Docker builds are the whole point here.
> - **Verification is a HOST (Claude/human) task:** `docker compose -f deploy/docker-compose.shattered-archive-experimental.yml build kingdom-tactics-server kingdom-tactics-client` and `… config`.
> - Exactly ONE ACTIVE plan doc per repo — this is it (all prior phases COMPLETE as of 2026-07-11).
> - **The user will REVIEW this plan before work begins** — leave all boxes unchecked until then.

## Goal
`deploy/` gains `kingdom-tactics-server.Dockerfile` (Node runtime, port 51000) and
`kingdom-tactics-client.Dockerfile` (Vite build → nginx SPA), both mirroring the game-* pair exactly
(same pinned base-image digests, corepack-strict, apk-upgrade, multi-stage workspace build). The
experimental compose file gains `kingdom-tactics-server` + `kingdom-tactics-client` services with the
same shape (build args, image names, TCP healthcheck, network aliases), and the edge nginx
(`edge-subdomains.conf`) gains `kingdom-tactics-client.shatteredarchive.dev` (SPA + `/ws/kt` upgrade
proxied to the server) and `kingdom-tactics-server.shatteredarchive.dev` (API + WS) server blocks.
Done when both images `docker build` cleanly on the host, `docker compose … config` validates, the
IDE Docker linter reports no NEW critical CVEs beyond the two already tracked in CLAUDE.md, and the
`deploy/` + `deploy/nginx/` `.annotated`/`.ai-context` indexes are refreshed.

## Constraints
- **Mirror, don't invent.** Copy the shape of `deploy/game-server.Dockerfile`, `deploy/game-client.Dockerfile`,
  `deploy/nginx/game-client.conf`, and the `game-server`/`game-client` compose blocks verbatim, changing
  only names, ports, the app path, the workspace build filter, and the Vite env args.
- **CLAUDE.md Docker rules (hard):** pin every `FROM` with `image:tag@sha256:<digest>` and use the SAME
  digest for build+runtime of the same image; `ENV COREPACK_ENABLE_STRICT=1` BEFORE `corepack enable`;
  `RUN apk --no-cache upgrade` as the FIRST `RUN` after each alpine `FROM`. **Reuse the digests already in
  the repo** (they are the ones in the CLAUDE.md "Known open CVEs" table): node
  `26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606`, nginx
  `1.31.2-alpine@sha256:81595dd77c2cc4ec66c6721daa3c13b6a1f7bb3a8a2cd3247a874e3bd5c39dd2`. Do NOT bump
  digests in this phase (no new CVE surface); if the linter flags one, log it and leave the table update
  to a follow-up.
- **pnpm only**, `--frozen-lockfile`; do not add exotic package sources. The engine is under
  `services/kingdom-tactics-engine`, so `COPY services` already vendors it — no separate copy needed.
- **Server-authoritative online path unchanged.** This phase only packages/serves the existing apps; it
  changes NO engine/server/client source. The `/ws/kt` gateway and the isomorphic engine are as shipped.
- Update `deploy/.annotated` + `deploy/nginx/.annotated` (+ `.ai-context` where a narrative exists).

## Context — verified surfaces (read 2026-07-11; exact)
- **kingdom-tactics-server** (`apps/kingdom-tactics-server`): `"type":"module"`, `main dist/index.js`,
  scripts build=`tsc -p tsconfig.json`, start=`node dist/index.js`; `.env` sets `PORT=51000`,
  `ENVIRONMENT=dev`, `LOG_FILE_PATH=./log/server.log`, `JSON_LOG_FILE_PATH=./log/server.log.jsonl`.
  Bootstrap mounts `/`, `/health` (→ `{status:'ok'}`) and `setupKtWebSocketGateway` on `/ws/kt`.
  Runtime deps (build these before the app, in order): `types-global`, `types-server`, `utils-global`,
  `utils-server`, `services-server`, then the engine + app via `--filter …kingdom-tactics-server...`.
  (The engine `@shatteredarchive/kingdom-tactics-engine` is pulled in by the `...` filter.)
- **kingdom-tactics-client** (`apps/kingdom-tactics-client`): Vite SPA. Env vars (from `vite.config.ts` +
  `src/env.d.ts` + `.env`): `VITE_PORT` (dev 50080), `VITE_KT_API` (e.g. `http://localhost:51000`),
  `VITE_KT_WS` (e.g. `ws://localhost:51000`), `VITE_KT_SECURE` (`'true'|'false'`), `VITE_ENV`. The online
  slice builds its socket URL from `VITE_KT_WS` (`src/features/net/kt-config.ts` — CONFIRM at build time
  whether it appends `/ws/kt` or expects the full path, and set `VITE_KT_WS` accordingly).
- **game-server.Dockerfile** (reference): node build stage (corepack-strict) → COPY lock/pkg/workspace +
  tsconfig + `apps/game-server`, `types`, `utils`, `services`, `sdks` → `pnpm install --frozen-lockfile`
  → build each workspace dep then `--filter …game-server... build`. Runtime stage: same digest, `apk
  upgrade`, `COPY deploy/.env`, corepack-strict, `ENV NODE_ENV=production PORT=31000`, COPY built pkgs
  from build, `pnpm install --frozen-lockfile --prod --filter …game-server...`, `EXPOSE 31000`, CMD
  `node apps/game-server/dist/index.js`. (kingdom-tactics-server has NO `sdks` dep — omit that COPY/build.)
- **game-client.Dockerfile** (reference): node build stage builds the Vite bundle with `ARG/ENV VITE_*`
  then `--filter …game-client... build`; nginx runtime stage (pinned digest, `apk upgrade`) removes
  `default.conf`, copies `deploy/nginx/game-client.conf` → `default.conf`, copies `dist` → nginx html,
  `EXPOSE 80`. `deploy/nginx/game-client.conf` = a plain SPA `try_files $uri $uri/ /index.html`.
- **Compose** `deploy/docker-compose.shattered-archive-experimental.yml`: `game-client`/`web-client`
  services (build context `..`, dockerfile, VITE_ args, `image:`, network alias) and `game-server`/
  `web-server` services (env_file `../apps/<svc>/.env`, `environment` incl. `PORT`, a node-net TCP
  `healthcheck` on the port, `expose`, network alias `<svc>.shatteredarchive.dev`). The `nginx` service
  `depends_on` each client (`service_started`) + server (`service_healthy`) and lists every subdomain
  alias on the `shatteredarchive` network.
- **edge nginx** `deploy/nginx/edge-subdomains.conf`: `map $http_upgrade $connection_upgrade`; per-app
  `server{}` blocks. game-client block proxies `/ws/game` (Upgrade/Connection + 3600s timeouts) to
  `game-server:31000` and `/` to `game-client:80`; game-server block proxies `/` (with Upgrade) to
  `game-server:31000`. Mirror these for `/ws/kt` → `kingdom-tactics-server:51000`.

## Steps

### [ ] 1. (CLAUDE) kingdom-tactics-server.Dockerfile (Node runtime, port 51000)
- Do: Create `deploy/kingdom-tactics-server.Dockerfile` mirroring `deploy/game-server.Dockerfile`:
  - Both stages `FROM node:26.3.1-alpine3.24@sha256:a2dc166a…f606` (same digest build+runtime).
  - Build stage: `ENV COREPACK_ENABLE_STRICT=1` then `corepack enable`; COPY `pnpm-lock.yaml package.json
    pnpm-workspace.yaml`, `tsconfig*.json`, then `apps/kingdom-tactics-server`, `types`, `utils`,
    `services` (NO `sdks`); `pnpm install --frozen-lockfile`; build deps in order
    (`types-global`,`types-server`,`utils-global`,`utils-server`,`services-server`) then
    `pnpm --filter @shatteredarchive/kingdom-tactics-server... build` (pulls the engine).
  - Runtime stage: `RUN apk --no-cache upgrade` FIRST; corepack-strict; `ENV NODE_ENV=production` +
    `ENV PORT=51000`; COPY lock/pkg/workspace + tsconfig + built `apps/kingdom-tactics-server`,`types`,
    `utils`,`services` from build; `pnpm install --frozen-lockfile --prod --filter
    @shatteredarchive/kingdom-tactics-server...`; `EXPOSE 51000`; `CMD ["node",
    "apps/kingdom-tactics-server/dist/index.js"]`. (Match game-server's `COPY deploy/.env /repo/.env`
    only if that file exists and the app reads it; otherwise rely on compose env — confirm which.)
- Files: `deploy/kingdom-tactics-server.Dockerfile`.
- Verify (HOST): `docker build -f deploy/kingdom-tactics-server.Dockerfile -t kt-server-test .` (from repo
  root) succeeds; the final image runs `node apps/kingdom-tactics-server/dist/index.js` (a `docker run`
  smoke with `PORT=51000` answering `/health` is step 5). Box + Progress log.

### [ ] 2. (CLAUDE) kingdom-tactics-client.Dockerfile + nginx SPA conf
- Do:
  1. Create `deploy/nginx/kingdom-tactics-client.conf` = a copy of `deploy/nginx/game-client.conf` (SPA:
     `root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; }`).
  2. Create `deploy/kingdom-tactics-client.Dockerfile` mirroring `deploy/game-client.Dockerfile`:
     node build stage (corepack-strict) COPY lock/pkg/workspace + tsconfig + `apps/kingdom-tactics-client`,
     `types`,`utils`,`services`; `pnpm install --frozen-lockfile`; declare `ARG/ENV` for the ACTUAL client
     vars — `VITE_PORT`,`VITE_KT_API`,`VITE_KT_WS`,`VITE_KT_SECURE`,`VITE_ENV`; `pnpm --filter
     @shatteredarchive/kingdom-tactics-client... build`. nginx runtime stage `FROM
     nginx:1.31.2-alpine@sha256:81595dd7…9dd2`, `apk --no-cache upgrade`, `rm -f
     /etc/nginx/conf.d/default.conf`, COPY `deploy/nginx/kingdom-tactics-client.conf` →
     `default.conf`, COPY `--from=build /repo/apps/kingdom-tactics-client/dist` → `/usr/share/nginx/html/`,
     `EXPOSE 80`.
- Files: `deploy/kingdom-tactics-client.Dockerfile`, `deploy/nginx/kingdom-tactics-client.conf`.
- Verify (HOST): `docker build -f deploy/kingdom-tactics-client.Dockerfile --build-arg
  VITE_KT_WS=wss://kingdom-tactics-server.shatteredarchive.dev --build-arg VITE_KT_SECURE=true
  -t kt-client-test .` succeeds and produces a non-empty `/usr/share/nginx/html/index.html`. Box + log.

### [ ] 3. (CLAUDE) Compose: kingdom-tactics-server + kingdom-tactics-client services
- Do: In `deploy/docker-compose.shattered-archive-experimental.yml` add two services mirroring the
  game-* blocks:
  - `kingdom-tactics-server`: build context `..` / dockerfile `deploy/kingdom-tactics-server.Dockerfile`;
    `image: shatteredarchive-kingdom-tactics-server`; `env_file: ../apps/kingdom-tactics-server/.env`;
    `environment` `NODE_ENV=production`,`PORT="51000"`, log paths, `CORS_ORIGIN` for the KT client
    subdomain; `expose: ["51000"]`; a node-net TCP `healthcheck` on 51000 (copy the game-server one,
    swap the port); network alias `kingdom-tactics-server.shatteredarchive.dev`; log volume mount under
    the same `C:/Projects/DSL/GameLogs/ShatteredArchive/Docker/…` root.
  - `kingdom-tactics-client`: build context `..` / dockerfile `deploy/kingdom-tactics-client.Dockerfile`
    with `args` `VITE_PORT`,`VITE_KT_API: https://kingdom-tactics-server.shatteredarchive.dev`,
    `VITE_KT_WS: wss://kingdom-tactics-server.shatteredarchive.dev`,`VITE_KT_SECURE: "true"`,
    `VITE_ENV: "development"`; `image: shatteredarchive-kingdom-tactics-client`; network alias
    `kingdom-tactics-client.shatteredarchive.dev`.
  - Extend the `nginx` service `depends_on` (client `service_started`, server `service_healthy`) and the
    nginx `shatteredarchive` network `aliases` list with both new subdomains.
- Files: `deploy/docker-compose.shattered-archive-experimental.yml`.
- Verify (HOST): `docker compose -f deploy/docker-compose.shattered-archive-experimental.yml config`
  validates (both services parse, healthcheck well-formed). Box + Progress log.

### [ ] 4. (CLAUDE) Edge nginx server blocks (SPA + /ws/kt upgrade)
- Do: In `deploy/nginx/edge-subdomains.conf` add two `server{}` blocks (mirror game-client/game-server):
  - `server_name kingdom-tactics-client.shatteredarchive.dev;` — a `location /ws/kt { proxy_pass
    http://kingdom-tactics-server:51000; proxy_http_version 1.1; Upgrade/Connection $connection_upgrade;
    Host/X-Forwarded-*; proxy_read_timeout 3600; proxy_send_timeout 3600; }` and a `location / { proxy_pass
    http://kingdom-tactics-client:80; … }`.
  - `server_name kingdom-tactics-server.shatteredarchive.dev;` — a `location / { proxy_pass
    http://kingdom-tactics-server:51000; proxy_http_version 1.1; Upgrade/Connection; Host/X-Forwarded-*; }`.
  Reuse the existing top-of-file `map $http_upgrade $connection_upgrade` (do not redefine it).
- Files: `deploy/nginx/edge-subdomains.conf`.
- Verify (HOST): after `docker compose … up -d nginx kingdom-tactics-server kingdom-tactics-client`,
  `docker exec shatteredarchive-nginx nginx -t` passes; `curl -H 'Host:
  kingdom-tactics-client.shatteredarchive.dev' http://localhost/` returns the SPA index. (If not bringing
  the stack up now, at minimum `nginx -t` inside a throwaway nginx build of the conf.) Box + log.

### [ ] 5. (CLAUDE) CVE/compliance check, indexes, host sign-off, complete
- Do:
  1. Re-read both new Dockerfiles against the CLAUDE.md Docker rules: digest-pinned, same digest
     build+runtime, `COREPACK_ENABLE_STRICT=1` before `corepack enable`, `apk --no-cache upgrade` first in
     each alpine stage. Confirm the IDE Docker linter reports NO new critical CVEs beyond the two already
     tracked (node `a2dc166a` 1 high, nginx `81595dd7` 2 high); if a new one appears, log it (do not bump).
  2. Refresh `deploy/.annotated` (add the two Dockerfiles) and `deploy/nginx/.annotated` (add the KT
     client conf); update `deploy/nginx/.ai-context` narrative if it enumerates subdomains.
  3. HOST build both images via the compose file:
     `docker compose -f deploy/docker-compose.shattered-archive-experimental.yml build
     kingdom-tactics-server kingdom-tactics-client` — REPORT pass/fail. Optional smoke: `up -d` the two KT
     services + nginx, `curl …/health` on the server subdomain → `{status:'ok'}`, then stop.
  4. Update `apps/kingdom-tactics-client/docs/ROADMAP.md` Phase 8 row → ✅ done and reference this doc.
- Files: the two `.annotated` files, `deploy/nginx/.ai-context` (if applicable), `ROADMAP.md`.
- Verify (HOST): both images build 0; `compose config` valid; no NEW critical CVE. Set this doc
  `Status: COMPLETE`, check the box, append a final Progress-log summary.

## Open decisions (resolve during implementation; note the choice in Progress log)
- **Server `.env` in the image vs compose:** game-server both `COPY deploy/.env` AND uses compose
  `env_file`. Confirm which the KT server actually needs at runtime (it reads `PORT`, log paths,
  `ENVIRONMENT`); prefer compose `env_file` + `environment` and only bake a file if the app requires it
  pre-compose.
- **VITE_KT_WS path:** confirm whether `kt-config.ts` appends `/ws/kt` to `VITE_KT_WS` or expects the full
  URL, and set the compose build-arg to match (`wss://kingdom-tactics-server.shatteredarchive.dev` vs
  `…/ws/kt`). Getting this wrong silently breaks online connect from the containerized client.
- **TLS/subdomain registration:** the edge uses `NGINX_TLS_INCLUDE_FILE` + `certs/`; the two new
  subdomains ride the existing dev cert flow. No cert changes in this phase (per the compose "DO NOT
  CHANGE CERTS" note) — HTTP/dev only unless the user asks for the KT subdomains in the TLS SAN list.
- **Docker not required to be running for authoring** steps 1–4 (file writes); steps' HOST verify + step 5
  need Docker up. If Docker is down at execution, author all files, run `compose config` where possible,
  and leave the build-verify boxes unchecked with a Progress-log note.

## Progress log
- 2026-07-11T17:00 plan created (Claude), Status ACTIVE, unstarted — awaiting user review before work
  begins. Phase 8 = the last numbered roadmap phase: package `kingdom-tactics-server` (Node, 51000) +
  `kingdom-tactics-client` (Vite→nginx SPA) as Docker images mirroring the game-* pair, add both as
  experimental-compose services, and expose them via the edge nginx with `/ws/kt` WebSocket upgrade.
  Claude-owned (Docker/nginx judgment + host-only verify; not a qwen handoff). Reuses the repo's existing
  pinned base-image digests (no CVE-surface change). NOTE for context: local/offline hotseat already has
  full engine parity as of 2026-07-11 (LocalMatch/MatchSession moved into the engine) — this phase is the
  ONLINE/deploy path, orthogonal to that. Deferred backlog (each its own future plan, NOT this one):
  squadron combat (battle/siege), objective/control-point victory, horde survive-waves, online transport
  hardening (reconnect/reconciliation/identity), AI stance use, squadron blend/composition tool.
