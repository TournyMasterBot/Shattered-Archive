# Plan: MUD Builder — Phase 12 (world map visualization + overlay conflict safety)

Created: 2026-07-17T02:00:00Z · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Give builders a visual map of the world — rooms as nodes, exits as edges, cross-area links surfaced via the Phase 11 world index — and extend hash-conditional saves to the skills/groups overlays.

## Goal
A Map tab renders any area's rooms/exits as an interactive graph (auto-laid-out, pan/zoom, click a room to open it in the Areas tab) with cross-area exits drawn to labeled portal stubs that navigate to the neighboring area. A world-level view shows areas as nodes connected by their actual cross-area exits (the Phase 11 resolver data). skills.dat/groups.dat saves gain the same baseHash 409 protection areas have. Done when the map renders every stock area without error, navigation round-trips Map → Areas → Map, overlay conflict 409s are proven by tests, all suites stay green, and the MUD never restarts.

## Constraints
- STABILITY IS KING; no C changes. Read-only feature server-side (the map consumes existing endpoints plus at most one new read-only aggregate).
- No new heavyweight graph dependency without discussion: prefer a small self-contained layout (BFS grid from the exits' door directions — N/E/S/W/U/D are literally compass directions, so most MUD areas lay out on a grid naturally; fall back to force-ish placement only for rooms with contradictory coordinates).
- Map is a VIEW: clicking never mutates; editing stays on the existing tabs (navigation hand-off like the World tab's onOpenArea).
- Overlay baseHash follows the Phase 11 pattern exactly (optional in the PUT body, absent = legacy, 409 carries currentHash); skills/groups are single global files so the hash is of the overlay file bytes (stock fallback = no hash → unconditional first save).
- All code testable in isolation; never-crash server contract; qwen (container) must NOT run pnpm install|build|test.

## Context
- Phase 11 COMPLETE (.ai-plans/20260716-2200-*): world vnum index + resolveRefs live in /workspace/shattered-archive/apps/mud-builder-server/src/area-store.ts (worldVnumIndex, mtime-cached); GET /api/world already returns per-area errors/warnings/external (routes/world.ts) — the world-level graph can be built from external[] alone.
- Room exits (door 0-5 = N E S W U D) live on the parsed model: GET /api/areas/:file → area.sections rooms[].exits[].{door,toVnum} (services/merc-area/src/types.ts RoomExit).
- Cross-page navigation lift exists: App.tsx areaTarget → AreasPage initialTarget (opens area + selects room) — the Map tab reuses it.
- Overlay stores: /workspace/shattered-archive/apps/mud-builder-server/src/skills-store.ts + groups-store.ts (preview/write, gated); routes in src/routes/skills.ts + groups.ts; client SkillsPage.tsx/GroupsView.tsx save via api.saveSkills/saveGroups.
- Phase 11's conditional-write reference implementation: area-store.ts writeArea + AreaConflictError, routes/areas.ts PUT handler, client workbench.tsx doSave 409 branch + ConflictPanel.

## Steps
### [x] 1. (CLAUDE) Server: map aggregate endpoint
- Do: GET /api/map/:file (read-only, open): rooms [{vnum, name, exits: [{door, toVnum, external?: {file, name}}]}] for one area, exits resolved via worldVnumIndex so cross-area targets carry their defining file+name; GET /api/map (world level): areas [{file, name, minVnum, maxVnum, counts.rooms}] + links [{from, to, count}] aggregated from each area's resolved external room refs. Never-crash safe() contract; unparseable files listed with parseError like /api/world. Tests: single-area shape incl. an external exit, world links aggregation, broken file tolerated.
- Files: /workspace/shattered-archive/apps/mud-builder-server/src/routes/map.ts (new), src/routes/map.test.ts (new), src/app.ts
- Verify: host mud-builder-server suite green; tsc clean.

### [x] 2. (CLAUDE) Client: area map view
- Do: Map tab (App.tsx section) with an area picker (shared sidebar idiom): render the area's rooms on a grid — BFS from the lowest-vnum room assigning coordinates by door direction (N/S = ±y, E/W = ±x, U/D = diagonal offset lanes), collision → shift column; SVG output (no new deps): room nodes (vnum + name, click → Areas tab via the areaTarget lift), exit edges, cross-area exits as labeled portal stubs (click → open THAT area in the map). Pan/zoom via viewBox drag/wheel. Tests: layout function unit tests (linear corridor, loop, collision), render + navigation callback.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/map/MapPage.tsx (new), src/features/map/layout.ts (new), src/features/map/layout.test.ts (new), src/features/map/MapPage.test.tsx (new), src/App.tsx, src/api/client.ts
- Verify: host mud-builder-client suite green; tsc clean.

### [x] 3. (CLAUDE) Client: world-level map view
- Do: Map tab's "World" mode: areas as nodes (size by room count), edges from /api/map links (thickness by link count, hover lists the connecting exits); click an area node → its area map. Layout: simple circle/force placement is fine at ~30 nodes. Tests: render from mocked /api/map, node click drills down.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/map/WorldMap.tsx (new, +test), src/features/map/MapPage.tsx
- Verify: host mud-builder-client suite green; tsc clean.

### [x] 4. (CLAUDE) Server+client: skills/groups baseHash conflict safety
- Do: skills-store/groups-store write() gains opts.baseHash checked against the overlay file bytes (Phase 11 pattern; stock fallback = no on-disk file → currentHash null); GET /api/skills + /api/groups return baseHash (null when stock); PUT accepts optional baseHash → 409 {error, currentHash}; client SkillsPage/GroupsView hold the hash, send it, and reuse ConflictPanel on 409. Tests: overlay 409 matrix mirroring areas.test.ts conditional-save test, stock-first-save path, client 409 panel.
- Files: /workspace/shattered-archive/apps/mud-builder-server/src/skills-store.ts, src/groups-store.ts, src/routes/skills.ts, src/routes/groups.ts (+tests), apps/mud-builder-client/src/features/skills/SkillsPage.tsx, src/features/skills/GroupsView.tsx (+tests), src/api/client.ts
- Verify: both host suites green; tsc clean.

### [x] 5. (CLAUDE) Deploy + live E2E + docs + sign-off
- Do: rebuild + up the builder pair; E2E via edge: /api/map/:file for a stock area matches its on-disk exits (spot-check a known cross-area exit resolves with file+name), /api/map world links non-empty and symmetric-ish for known neighbor pairs (midgaard↔school), skills PUT with stale hash → 409 + overlay untouched, game container untouched. Update docs/mud-builder/README.md (Phase 12 section + Scope); refresh .annotated; mark plan COMPLETE; draft Phase 13 (candidates: in-UI new-skill C codegen assist, reset simulator/preview of spawn state, map editing — drag rooms to renumber exits).
- Files: (driver in scratchpad), /workspace/shattered-archive/docs/mud-builder/README.md
- Verify: all driver checks pass; suites green; the MUD never restarted this phase.

## Progress log

- 2026-07-17T02:00:00Z plan created (successor to Phase 11, which is COMPLETE); world map chosen because the Phase 11 world index makes it nearly free server-side and it is the biggest builder-UX gap (orienting in an unfamiliar area today means reading room lists); overlay baseHash folded in as step 4 since it is a mechanical replay of the Phase 11 pattern; the new-skill C codegen assist stays a Phase 13 candidate (touches C, needs its own stability discussion)
- 2026-07-17T14:20:00Z step 1 done: map aggregate endpoint — routes/map.ts (GET /api/map/:file rooms+exits with internal/external/dangling told apart via worldVnumIndex; GET /api/map areas+directional links with per-exit detail for hover), registered in app.ts after world routes; 3 tests (single-area shape, 404/400, world aggregation w/ broken file); server 67/67, tsc clean
- 2026-07-17T14:55:00Z step 2 done: client area map — features/map/layout.ts (pure BFS grid, U/D diagonal lanes, collision probe + ring fallback, portal stubs, dangling exits drawn as nothing; 5 unit tests) + MapPage.tsx (SVG room nodes click→Areas via areaTarget lift, portal stubs click→neighbor map in place, drag-pan/wheel-zoom viewBox, area picker select; 3 tests) + map.css; App.tsx Map tab wired
- 2026-07-17T14:55:00Z step 3 done: world map mode — WorldMap.tsx (circle layout, node radius by room count, link thickness by exit count, hover title lists each connecting exit, broken areas dashed; 2 tests); MapPage World toggle drills node→area map; client 81/81, tsc clean
- 2026-07-17T15:25:00Z step 4 done: overlay baseHash — SkillsStore/GroupsStore hash() (sha256 of overlay bytes, null=stock) + write(opts.baseHash string|null, 409 via AreaConflictError BEFORE backup, success returns new hash); routes: GET +baseHash, PUT reads optional baseHash (readBaseHash shared from skills.ts, non-string/non-null=400), safe() 409 branch carries currentHash; client: SkillsPage/GroupsView hold hash, conditional save, reuse ConflictPanel (reload/save-anyway), revert resets hash null; tests: server matrix x2 (null-first-save, stale-null 409 disk untouched, fresh, wrong-hash, legacy, 400) server 69/69; client 3 conflict tests, 84/84; both tsc clean. Root package.json also gained dev:/start:mud-builder-client|server (user request, KT pattern)
- 2026-07-17T16:05:00Z step 5 done: deployed builder pair (compose build+up, game container untouched — proven by StartedAt ordering) and ran the live E2E driver via the edge: ALL 24 CHECKS PASS — world map lists 53 areas / 109 links / 3127 rooms, EVERY parseable area renders via /api/map/:file, midgaard→school stock link exists (x1), first link backed by a real resolved exit (immort.are #1203 → limbo.are #1 'The Void'), midgaard map exits byte-match the parsed model, skills/groups stale-hash PUTs 409 with host overlays untouched (both stock: baseHash null), anon PUT 401, presence healthy, audit clean of /api/map and token values. README Phase 12 section + Scope updated; .annotated refreshed (map feature new, routes/stores/skills/api/App/docs); root package.json dev:/start: commands added
- 2026-07-17T16:05:00Z plan COMPLETE — Phase 13 plan drafted (reset simulator; map editing + C codegen assist remain candidates)
