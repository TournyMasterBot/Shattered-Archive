# Plan: MUD Builder — Phase 4 (create/delete entities + resets editor)

Created: 2026-07-14T13:30:00Z · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Let builders GROW the world from the UI — add/delete rooms, mobs, and objects with vnum-reference integrity checking, and edit #RESETS (what spawns where) — completing the core authoring loop.

## Goal
A builder can create a new room/mob/object in an area (vnum picked from the area's free range), place mobs/objects via a Resets tab, and delete entities only when nothing references them — all with the existing preview-first, write-gated, hot-reload flow. Done when a new mob authored in the UI spawns in a new room via a new reset on the live deployed game, deletion of a referenced vnum is blocked with a clear message, and all suites stay green.

## Constraints
- STABILITY IS KING. Deletions are the risky path: the C hot reload deliberately UPSERTS only — a vnum removed from the file stays live until copyover (documented drift). The UI must say so when a delete is saved ("takes effect on copyover").
- Reference integrity is a VALIDATION layer (like validateScripts): deleting a room/mob/object that resets, exits, shops, specials, or scripts reference must block Preview/Save client-side AND 400 server-side with the referencing lines named.
- New vnums must come from the area's declared min/max range and not collide with any vnum in the file.
- Same preservation rules as Phase 3 editors: verbatim words, unlisted bits, unknown reset commands preserved untouched.
- qwen (container) must NOT run pnpm install|build|test; JS verification is a host job.

## Context
- Phases 1-3 COMPLETE (.ai-plans/20260713-1043-*, 20260713-2345-*, 20260714-1200-*): rooms/mobs/objects/scripts editable end to end; deployed at build.shatteredarchive.dev (experimental compose, the ONLY writes-enabled env); shared workbench hook at /workspace/shattered-archive/apps/mud-builder-client/src/features/areas/workbench.tsx.
- Reset model: /workspace/shattered-archive/services/merc-area/src/types.ts (ResetsSection; reset commands M/O/P/G/E/D/R with args as written). Emitter/parser already round-trip resets byte-identically.
- Validation pattern to copy: /workspace/shattered-archive/services/merc-area/src/validate.ts (validateScripts + ScriptsSummary shape) and its wiring in apps/mud-builder-server/src/routes/areas.ts (requireValidScripts) + client pages (invalid blocks Preview/Save).
- The C hot reload (merc-mud/2.4/src/area_reload.c) upserts prototypes and RE-RUNS resets on commit; deleted prototypes persist until copyover (do_copyover / copyover.signal) — the recovery tier is the delete path.
- Reset semantics (merc-mud/2.4/src/db.c load_resets / reset_area): M = mob into room (limit, room), O = obj to room, P = obj into obj, G/E = obj to mob inventory/equipped (wear loc), D = door state, R = randomize exits.
- Editor UI conventions: features/mobs/MobsPage.tsx + MobEditor.tsx are the newest pattern (list → form, WorkbenchToolbar, FlagGrid/WordInput helpers).

## Steps
### [x] 1. (CLAUDE) merc-area: reference-integrity validation (validateRefs)
- Do: add validateRefs(area) to services/merc-area/src/validate.ts — collects every vnum reference (reset args by command letter, room exit toVnum, shop keeper, special mob, script mobVnum) and reports (a) references to vnums not defined in this file mapped to their source line kind, (b) a reverse index usable for delete-blocking ("who references vnum N"). Export types + wire into index.ts.
- Files: /workspace/shattered-archive/services/merc-area/src/validate.ts, src/index.ts, src/refs.test.ts (new)
- Verify: host `pnpm --filter @shatteredarchive/merc-area test` green incl. new refs tests (cross-file refs like shared-zone room exits must be warnings, not errors — school.are links outward).

### [x] 2. (CLAUDE) Client: add/delete rooms, mobs, objects (vnum allocation + delete blocking)
- Do: extend MobsPage/ObjectsPage and the rooms slice with "+ Add" (template entity, next free vnum in the area's min/max range) and "Delete" (blocked with the referencing lines listed when validateRefs reverse index is non-empty; allowed deletes warn "live prototype persists until copyover"). Server: PUT keeps requireValidScripts and adds requireValidRefs (400 on dangling STRICT refs).
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/mobs/*, objects/*, areas/*, apps/mud-builder-server/src/routes/areas.ts (+tests both sides)
- Verify: host client+server suites green — add allocates a non-colliding vnum; delete of a reset-referenced mob is blocked naming the reset; delete of an unreferenced mob passes preview.

### [x] 3. (CLAUDE) Client: Resets tab
- Do: features/resets/ — ResetsPage on the workbench hook: resets listed in file order (they execute in order; P/G/E depend on the preceding M/O), per-command forms with vnum pickers populated from the area's own mobs/objects/rooms (free-text fallback for cross-area vnums), add/remove/reorder; App.tsx wires the tab.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/resets/*, src/App.tsx
- Verify: host client tests green — M+G pair round-trips through the form; reordering changes emit order; unknown command letters render read-only and survive save.

### [x] 4. (CLAUDE) E2E on the deployed stack + docs + sign-off
- Do: driver via build. edge: create room+mob+reset in school.are → preview → save → hot reload → telnet: walk to the new room, new mob is standing there → blocked-delete check 400s naming the reference → restore. Update docs/mud-builder README (creating things, delete semantics/copyover caveat, Resets tab) + commands.md; refresh .annotated/.ai-context; mark plan COMPLETE and draft Phase 5 (candidates: shops/specials forms, area-file creation + area.lst, skills/spells codegen).
- Files: (driver in scratchpad), /workspace/shattered-archive/docs/mud-builder/README.md, commands.md
- Verify: all driver checks pass; suites green; docs accurate.

## Progress log

- 2026-07-14T13:30:00Z plan created (successor to Phase 3, which is COMPLETE)
- 2026-07-15T00:00:00Z step 1 done: validateRefs/collectRefs/referencesTo in validate.ts + refs.test.ts — corpus sweep clean after demoting exit-KEY refs to soft/warnings (stock draconia/hitower ship dangling keys); merc-area 28/28
- 2026-07-15T00:40:00Z step 2 done: model-ops.ts (nextFreeVnum single-namespace, templates round-trip-proven, deleteBlockers on the post-delete model so self-refs never block) + add/delete wired into Areas/Mobs/Objects pages + server requireValidRefs on preview/PUT (warnings surfaced in PreviewPane); server 16/16, client 26/26
- 2026-07-15T01:30:00Z step 3 done: features/resets/ResetsPage (file-order rows, per-command forms, local vnum pickers w/ resolved captions, reorder/remove/add, comments read-only) + App tab; ALSO (user mid-turn request) Manual edit generalized into the shared workbench — Mobs/Objects/Resets get the raw generated code, editable, parse-validated and BACK-APPLIED to the forms on success; client 31/31
- 2026-07-15 (this session, earlier): user-requested layout overhaul — Mob/Object/Script editors rebuilt on the RoomEditor mb-field idiom (grouped fieldsets, compact grids, 64rem cap); the sprawl came from reusing .mb-script-editor label CSS. New screens must follow this standard.
- 2026-07-15T02:20:00Z step 4 done + plan COMPLETE: deployed pair rebuilt; E2E driver ALL PASS on the live stack — created room 3747 + mob 3761 + M reset via the edge API, dangling-delete PUT 400ed naming the mob, save + hot reload, fresh telnet character walked east from the school entrance and saw the mob standing there, original restored (hot reload), copyover purged the prototypes, game accepting connections after ("copyover_recover", "ready to rock on port 4000"), school.are on disk clean. Suites: merc-area 28/28, server 16/16, client 31/31. Docs updated (README: create/delete, Resets tab, manual-edit-everywhere).
