# Plan: MUD Builder — Phase 13 (reset simulator: preview spawn state)

Created: 2026-07-17T16:15:00Z · Workspace: /workspace/shattered-archive · Status: ACTIVE
Task: Simulate an area's #RESETS so builders can SEE what actually spawns where — mobs with their equipped/carried objects, container contents, door states — before any reload, straight from the model.

## Goal
A "Simulate" view (Resets tab pane + per-room panel in the Areas preview + counts on the Map) shows the post-reset world state computed from the parsed model by a pure simulator in merc-area that mirrors db.c/reset_area semantics (M/O/P/G/E/D/R commands, global limits, LastMob/LastObj dependency chain). Done when the simulator reproduces db.c behavior on the stock corpus (spot-verified against known areas), all suites stay green, everything is read-only, and the MUD never restarts.

## Constraints
- STABILITY IS KING; no C changes; strictly read-only — the simulator consumes the parsed model, nothing touches disk or the game.
- Simulator semantics MUST mirror stock Merc db.c reset_area (the same file the game boots): M creates LastMob (obeying its limit), G/E give/equip to LastMob only when it was just created, O places obj in room (skip when area not empty per db.c rules — model the simple boot-state case: fresh boot, no players), P puts into LastObj-matching container, D sets door lock state both sides, R randomizes exits (report as "randomized", don't pick an order). Boot-state simulation only — repop drift (players, kills) is out of scope and said so in the UI.
- Cross-area object/mob vnums resolve via the existing worldVnumIndex (Phase 11); unresolvable vnums surface as simulation warnings, never crashes.
- All code testable in isolation; never-crash server contract; qwen (container) must NOT run pnpm install|build|test.
- qwen may transcribe/read but never verify with pnpm; JS build/test verification is a HOST task.

## Context
- Reset model: /workspace/shattered-archive/services/merc-area/src/types.ts (ResetsSection, Reset commands M/O/P/G/E/D/R + ResetComment) — parsed verbatim from the .are files.
- C semantics reference: /workspace/merc-mud/2.4/src/db.c reset_area (LastMob/LastObj state machine, limit checks) — READ ONLY, for fidelity.
- World index for cross-area vnums: /workspace/shattered-archive/apps/mud-builder-server/src/area-store.ts worldVnumIndex/resolveRefs (Phase 11, mtime-cached).
- Map tab (Phase 12): /workspace/shattered-archive/apps/mud-builder-client/src/features/map/ (MapPage/layout/WorldMap) — spawn badges hang off AreaMapRoom data.
- Resets tab: /workspace/shattered-archive/apps/mud-builder-client/src/features/resets/ResetsPage.tsx; Areas preview pane: src/features/areas/PreviewPane.tsx.
- Read-only aggregate idiom to copy: /workspace/shattered-archive/apps/mud-builder-server/src/routes/map.ts (Phase 12).

## Steps
### [ ] 1. (CLAUDE) merc-area: pure reset simulator + tests
- Do: simulateResets(area, opts?: { resolveExternal }) → per-room spawn state: mobs [{vnum, name, count, equipped: [{slot, vnum, name}], carried: [...]}], objects [{vnum, name, contents: [...]}], doors [{room, door, state}], randomizedExits [rooms], warnings [] (unknown vnums, G/E with no live LastMob, P with no container — mirror db.c's silent skips as WARNINGS so builders see them). Follow db.c reset_area exactly for boot state (fresh, empty rooms). Unit tests: M+E+G chain, M limit honored, O placement, P into container, D lock states, R reported, orphan G/E warning, cross-area object via resolver.
- Files: /workspace/shattered-archive/services/merc-area/src/simulate.ts (new), src/simulate.test.ts (new), src/index.ts (exports)
- Verify: host merc-area suite green; tsc clean. REMEMBER: pnpm --filter @shatteredarchive/merc-area build before server work (server resolves the built dist).
### [ ] 2. (CLAUDE) Server: GET /api/areas/:file/spawn aggregate + tests
- Do: read-only route returning simulateResets output for the parsed on-disk model with the world-index resolver wired (map.ts idiom: never-crash, 404/400 guards, unparseable → 4xx with parse error). Tests: stock-like fixture with an M/G/E chain + cross-area P, broken file tolerated, 404/400.
- Files: /workspace/shattered-archive/apps/mud-builder-server/src/routes/spawn.ts (new), src/routes/spawn.test.ts (new), src/app.ts
- Verify: host mud-builder-server suite green; tsc clean.
### [ ] 3. (CLAUDE) Client: Simulate views + tests
- Do: Resets tab gains a "Simulate" pane (per-room accordion of spawned mobs w/ gear trees, objects w/ contents, door states, warnings up top); Areas preview pane links room → its spawn slice; boot-state disclaimer shown. Tests: mocked /spawn render (gear tree + warning), room filter.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/resets/ResetsPage.tsx, src/features/resets/SimulatePane.tsx (new, +test), src/api/client.ts
- Verify: host mud-builder-client suite green; tsc clean.
### [ ] 4. (CLAUDE) Map overlay: spawn badges
- Do: MapPage area mode optionally overlays per-room mob counts (badge on the room node) from /spawn; toggle in the map toolbar; world mode untouched. Tests: badge renders from mocked spawn data, toggle hides.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/map/MapPage.tsx (+test), src/api/client.ts
- Verify: host mud-builder-client suite green; tsc clean.
### [ ] 5. (CLAUDE) Deploy + live E2E + docs + sign-off
- Do: rebuild+up builder pair; E2E via edge: /spawn for midgaard matches known stock facts (e.g. the temple healer/guards spawn counts, a shopkeeper carries its wares), warnings empty on stock corpus or explained, game container untouched (StartedAt ordering). Update docs/mud-builder/README.md (+Scope) and .annotated; mark plan COMPLETE; draft Phase 14 (candidates: in-UI new-skill C codegen assist — needs the stability discussion; map room-drag exit editing; live repop-drift view via a game-side read-only socket).
- Files: (driver in scratchpad), /workspace/shattered-archive/docs/mud-builder/README.md
- Verify: all driver checks pass; suites green; the MUD never restarted this phase.

## Progress log

- 2026-07-17T16:15:00Z plan created (successor to Phase 12, which is COMPLETE); reset simulator chosen over the other candidates because it is pure-JS/read-only (stability-free), directly answers the most common builder question ("what does this area actually spawn?"), and compounds with the Phase 12 map (spawn badges); map exit-editing and the new-skill C codegen assist remain Phase 14 candidates (the latter still needs its stability discussion)
- 2026-07-17T18:00:00Z plan PARKED, not truly abandoned (qplan has no DEFERRED status): the user directed Phase 12b (mapping fidelity — expanded compass rose, teleports, one-ways, blocked paths + UX/auth corrections) to land FIRST. Re-set this doc to ACTIVE after 12b completes. Content stays valid; only step 4 (map spawn badges) may need rebasing on 12b's map render changes, and the simulator gains the 12b exit-limit facts (obj limits db.c:1380-1385) for free.
- 2026-07-18T01:40:00Z re-ACTIVATED: Phase 12b is COMPLETE and deployed. Notes for execution: doors now run 0-9 (D resets too) and #SCRIPTS has R room entries — the simulator's D handling must use the 10-door bounds; /api/world already computes limitPressure with the exact db.c limit decoding (>50→6, -1→999, routes/world.ts effectiveObjLimit) — reuse it; map spawn badges (step 4) land on the 12b MapPage which now draws classification markers + a legend, so badge placement should avoid the top-right self-loop ring corner.
