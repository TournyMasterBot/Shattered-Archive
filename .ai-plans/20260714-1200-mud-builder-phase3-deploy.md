# Plan: MUD Builder — Phase 3 (docker `build.` deployment + mob/object editors)

Created: 2026-07-14T12:00:00Z · Workspace: /workspace/shattered-archive · Status: ACTIVE
Task: Ship the MUD Builder into the experimental docker stack behind the `build.` subdomain (the only environment where MUD_WRITE_ENABLED=true is set), and grow the UI with dedicated mob and object editor forms.

## Goal
`build.<domain>` serves the builder UI from the experimental compose stack; its server has the write gate ON and shares the live merc-mud area directory with a containerized game, so save → hot reload works in production exactly as it does locally. The UI gains Mobs and Objects tabs with the same preview-first flow rooms and scripts already have. Done when the compose stack builds + boots locally with all services healthy and an end-to-end save→reload works through the deployed containers, and mob/object edits round-trip through their forms with green tests.

## Constraints
- STABILITY IS KING: the game container must never go offline from builder actions; hot reload stays the routine path, copyover the recovery path.
- Dockerfiles follow repo rules (CLAUDE.md): digest-pinned base images with version comments, `ENV COREPACK_ENABLE_STRICT=1` before `corepack enable`, `apk --no-cache upgrade` first RUN in every Alpine stage, pnpm via corepack with `--frozen-lockfile`.
- MUD_WRITE_ENABLED=true is set ONLY in the experimental compose service definition — never in a Dockerfile, .env, or local script.
- The builder server and the game MUST see the same area directory (shared volume); backups land in that volume's `backups/`.
- Mob/object editors reuse the existing model-editing pattern (AreasPage): form is primary, preview mandatory before write, manual edits flagged, writes gated.
- qwen (container) must NOT run pnpm install|build|test; JS verification is a host job.

## Context
- Phase 1+2 are COMPLETE (/workspace/shattered-archive/.ai-plans/20260713-1043-mud-builder-phase1.md, 20260713-2345-mud-builder-phase2-scripts.md): merc-area lib, write-gated server (61000), client (60080) with Rooms + Scripts editors, merc-mud hot reload (area_reload.c) + copyover + mob_prog.c script engine, all E2E-verified locally.
- Existing deploy assets to mirror: /workspace/shattered-archive/deploy/web-client.Dockerfile + web-server.Dockerfile (multi-stage pnpm build patterns), deploy/docker-compose.shattered-archive-experimental.yml (experimental stack), deploy/nginx/edge-subdomains.conf (subdomain vhost pattern — add `build.`).
- The game currently runs from /workspace/merc-mud/docker-compose.yml with `./2.4/area` bind-mounted. For the experimental stack, either reference that compose's image or add a merc-mud service to the experimental compose with a shared named volume/bind for the area dir — decide in step 2 (the builder server container needs the SAME path mounted at its MERC_AREA_DIR).
- Server config knobs: /workspace/shattered-archive/apps/mud-builder-server/src/config.ts (MERC_MUD_PATH, MERC_AREA_DIR, MUD_WRITE_ENABLED); client dev proxy is vite-only — the deployed client is static files behind nginx, so nginx must proxy /api + /health to the server container (see how web/game client vhosts do it in edge-subdomains.conf).
- Mob model fields: /workspace/shattered-archive/services/merc-area/src/types.ts (Mobile interface ~line 59; race/damType/positions/sex/size are verbatim words — the editor should offer known values but preserve unknowns). Object model: MudObject + objValueKinds in the same file (value grammar varies by itemType — the editor must render value fields per kind).
- Flag tables for checkboxes: /workspace/shattered-archive/apps/mud-builder-client/src/data/flags.ts (extend from the 2.4-builder prototype's defs.js at /workspace/merc-mud/2.4-builder/src/data/defs.js — act/affect/off/imm flags, wear/extra flags, item types).
- Ports doc: /workspace/shattered-archive/docs/ports.md (60080/61000 registered). Human docs to extend: /workspace/shattered-archive/docs/mud-builder/.

## Steps
### [x] 1. (CLAUDE) Dockerfiles: mud-builder-server + mud-builder-client
- Do: deploy/mud-builder-server.Dockerfile (node runtime, builds workspace deps incl. merc-area, runs dist on 61000) and deploy/mud-builder-client.Dockerfile (pnpm build → nginx static stage), both digest-pinned mirroring web-*.Dockerfile; client nginx conf proxies nothing (edge handles /api).
- Files: /workspace/shattered-archive/deploy/mud-builder-server.Dockerfile, /workspace/shattered-archive/deploy/mud-builder-client.Dockerfile
- Verify: host `docker build -f deploy/mud-builder-server.Dockerfile .` and client equivalent both succeed; server image starts and /health responds with writes OFF by default.

### [x] 2. (CLAUDE) Experimental compose: services + shared area volume + write gate
- Do: add `mud-builder-server` (env MUD_WRITE_ENABLED=true, MERC_MUD_PATH pointing at the mounted area parent) and `mud-builder-client` services to docker-compose.shattered-archive-experimental.yml; add/wire the merc-mud game service (or an explicit bind to its area dir) so game + builder share one area directory; document the volume layout in deploy/docker notes.md.
- Files: /workspace/shattered-archive/deploy/docker-compose.shattered-archive-experimental.yml, /workspace/shattered-archive/deploy/docker notes.md
- Verify: `docker compose -f deploy/docker-compose.shattered-archive-experimental.yml config` clean; local `up` of the three services: capabilities shows writeEnabled:true, and a PUT+hot-reload through the containers lands in the shared volume and the game log shows the areload summary.

### [x] 3. (CLAUDE) nginx edge: `build.` subdomain
- Do: add a `build.` vhost to deploy/nginx/edge-subdomains.conf following the existing subdomain pattern: static client + /api and /health proxied to mud-builder-server:61000; include any cert/server_name conventions the other subdomains use.
- Files: /workspace/shattered-archive/deploy/nginx/edge-subdomains.conf
- Verify: nginx config test in the edge container (`nginx -t`) passes; curl through the edge with Host: build.<domain> reaches the client and /api/capabilities.

### [x] 4. (CLAUDE) Client: Mobs tab (form editor + tests)
- Do: features/mobs/ — area list → mob list → MobEditor form (name/short/long/description, level/alignment/hitroll, dice triples, act/affect/off/imm/res/vuln flag checkboxes from extended flags.ts, verbatim-word selects with free-text fallback for race/damType/positions/sex/size, wealth/group); same preview-first + gated toolbar; App.tsx wires the tab.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/mobs/*, src/data/flags.ts, src/App.tsx
- Verify: host `pnpm --filter @shatteredarchive/mud-builder-client test` green (editor round trip + gating) and build green.

### [x] 5. (CLAUDE) Client: Objects tab (form editor + tests, per-itemType values)
- Do: features/objects/ — ObjectEditor with itemType select driving the value[0..4] sub-forms via objValueKinds (weapon/container/drink/wand/potion grammars), wear/extra flag checkboxes, weight/cost/level/condition, extra descriptions editor; preview-first + gated toolbar; App.tsx wires the tab.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/objects/*, src/App.tsx
- Verify: host client tests + build green; editing a weapon's damage dice and a container's capacity both round-trip through preview.

### [ ] 6. (CLAUDE) E2E through the deployed stack + docs
- Do: with the experimental stack up locally: author a mob stat change, an object change, and a script through the UI flow (API-level driver ok) → preview → save → hot reload → verify in game via telnet; update docs/mud-builder (deployment section: how to run the stack, the build. URL, where the volume lives) and docs/ports.md if ports change.
- Files: (driver in scratchpad), /workspace/shattered-archive/docs/mud-builder/README.md, commands.md
- Verify: E2E checks pass; docs describe the deployed topology accurately.

## Progress log

- 2026-07-14T12:00:00Z plan created (successor to Phase 2, which is COMPLETE)
- 2026-07-14T11:50:00Z step 1 done: Dockerfiles — deploy/mud-builder-server.Dockerfile + mud-builder-client.Dockerfile (both digest-pinned, apk upgrade in every Alpine stage, COREPACK_ENABLE_STRICT) + deploy/nginx/mud-builder-client.conf; both images build clean; server image smoke-tested standalone: /health ok, capabilities writeEnabled:false by default.
- 2026-07-14T11:56:00Z step 2 done: compose — mud-builder-server (MUD_WRITE_ENABLED=true ONLY here; MERC_MUD_PATH=/mud; binds C:/Projects/merc-mud/2.4/area:/mud/area) + mud-builder-client services added; game DELIBERATELY stays in merc-mud's own compose (stack up/down can never interrupt the MUD; shared HOST dir is the bridge). `docker compose config` clean; both services up healthy; deployed-container verify: GET model 200 → PUT 200 (backup written under /mud/area/backups) → reload 202 → game log "area_reload: Reloaded school.are in place ... String space 4164K free". Volume layout documented in deploy/docker notes.md.
- 2026-07-14T12:20:00Z step 4 done: Mobs tab — src/data/flags.ts extended (ACT/AFFECT/OFF/RESIST mob vectors + RACES/ATTACK_TYPES/POSITIONS/SEXES/SIZES + object EXTRA/WEAR/WEAPON flags, conditions, liquids); shared workbench extracted (features/areas/workbench.tsx: useAreaWorkbench hook + AreaSidebar/WorkbenchToolbar/WorkbenchToast/FlagGrid/WordInput) so new tabs don't triplicate the ScriptsPage plumbing (ScriptsPage itself left untouched); features/mobs/ MobEditor+MobsPage wired in App.tsx. Word fields are datalist inputs (suggest known values, preserve unknowns verbatim); FlagGrid preserves unlisted bits. Tests 13/13 green, vite build green.
- 2026-07-14T12:35:00Z step 5 done: Objects tab — features/objects/ ObjectEditor+ObjectsPage; the five values re-labelled AND re-tokenized per item type via merc-area's objValueKinds (same table db2.c uses): weapon dice/class/damtype, container capacity/key, drink liquid, wand/staff charges, potion spells; wear/extra FlagGrids; extra-descriptions add/edit/remove; A/F affect lines preserved verbatim with a note. Test proves an edited weapon emits "sword 1 12 slash 0" (model→file round trip by construction). Suite 18/18, build green, new styles confirmed in the dist bundle.
- 2026-07-14T11:58:00Z step 3 done: edge — build.shatteredarchive.dev vhost added to edge-subdomains.conf (HTTP) and includes/tls-dev.conf (HTTPS), resolver+variable pattern so the edge boots without the builder containers; nginx alias added in compose. Applied via in-container template regen + nginx -t + graceful `nginx -s reload` (zero interruption); curl through the edge: /api/capabilities writeEnabled:true on HTTP and HTTPS, client index.html served.
