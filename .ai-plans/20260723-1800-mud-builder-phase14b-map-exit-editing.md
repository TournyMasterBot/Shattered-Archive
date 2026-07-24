# Plan: MUD Builder — Phase 14b (map exit editing: drag-to-connect rooms, edge editing, staged saves)

Created: 2026-07-23T18:00:00-05:00 · Workspace: /workspace/shattered-archive · Status: IN PROGRESS
Task: Make the area map an exit EDITOR: drag from room A to room B to create an exit
(direction inferred from grid position, two-way by default), click an edge to edit its
door/lock/key or delete it, with a staged-changes tray and preview-first saves through the
existing conditional-save pipeline.

> One of three Phase 14 candidate plans (14a/14b/14c) drafted 2026-07-23. When one is chosen
> for execution, set the other two to ABANDONED (revivable). All steps are (CLAUDE) — sized
> for Claude Opus execution.

## Goal
In edit mode a builder can connect two rooms with a dragged exit (10-direction picker
prefilled from relative grid position), edit or delete existing exits from an edge popover,
see every staged change listed with per-item undo, preview the exact emitted file diff, and
save with baseHash (409 → the existing ConflictPanel). View mode and world mode stay
byte-identical in behavior. Done when jsdom tests cover drag/popover/undo/save/conflict, all
suites are green, and a live E2E on a SCRATCH area at the edge proves a created exit
round-trips (save → GET shows both sides → /api/map draws the edge) with stock areas and the
game container untouched.

## Constraints
- **View mode stays the default and is behavior-identical to today**; edit mode is an
  explicit toggle, area mode only. World mode untouched.
- **Zero new server write surface.** All mutations flow through the EXISTING pipeline:
  `api.save(file, area, baseHash)` (client.ts:250-252, PUT /api/areas/:file) with
  preview-first and ConflictPanel on 409. Expected server diff for this phase: NONE.
- **Edits operate on the full parsed `AreaFile`** (via existing `api.getArea`, which returns
  `{file, area, baseHash}`) — NEVER on the `/api/map` projection, which lacks non-exit room
  fields and would destroy data if saved.
- **Staged changes are OPS, not mutated state**: keep the fetched AreaFile immutable and
  REPLAY an ordered op list (`{op:'addExit'|'updateExit'|'removeExit', ...}`) to derive the
  current model. Per-item undo = drop the op and re-replay. This is the load-bearing design
  decision — do not shortcut it with in-place mutation.
- **Two-way default** creates the reverse exit in the target room via REV_DIR
  (layout.ts:70 — `[2,3,0,1,5,4,9,8,7,6]`). If the target's reverse slot is already
  occupied: fall back to one-way and surface a tray warning. Cross-area exit CREATION is out
  of scope (can't edit a neighbor's file in this save) — edge popovers on external edges are
  read-only with a note.
- **Map-created exits carry the FULL exit shape** RoomEditor uses —
  `{door, description, keyword, locks, key, toVnum}` (RoomEditor.tsx:25) — so they are
  indistinguishable from form-created ones and the emitter/round-trip suite stays happy.
- **Fix known stale code in passing:** RoomEditor's addExit still offers only doors 0-5 and
  caps at 6 exits (`RoomEditor.tsx:22-25` find over `[0,1,2,3,4,5]`, `:110`
  `disabled={room.exits.length >= 6}`) — a pre-12b leftover; the engine speaks 10 doors
  (6=NE 7=NW 8=SE 9=SW). Extend to the full rose (grep for any other hardcoded 6-door
  assumptions in the client before calling this done).
- **Drag must not fight pan**: AreaMapSvg's background pointer handlers implement drag-pan
  (MapPage.tsx onPointerDown/Move/Up). Exit-drag starts on ROOM nodes only and must
  stopPropagation so the canvas doesn't pan underneath; background drag still pans in edit
  mode.
- Unsaved ops guard: switching area/mode/tab with staged ops → `window.confirm` (the
  workbench's existing confirm idiom), discard on OK.
- Presence heartbeats + conflict flows already exist — reuse, never reimplement.
- qwen (container) must NOT run pnpm install|build|test; JS verification is a HOST task.
- pnpm quirk: no `--` before positional args.

## Context
(all file:line refs verified 2026-07-23 against current source)
- Map view: `/workspace/shattered-archive/apps/mud-builder-client/src/features/map/MapPage.tsx`
  — AreaMapSvg (SVG, drag-pan/wheel-zoom, room `<g role="button">` nodes with aria-labels,
  Phase 13 spawn-badge overlay top-left, self-loop ring top-right), toolbar (mode toggle,
  picker, Spawns checkbox), legend. Rooms render from `layoutArea(res.rooms)` over the
  `/api/map/:file` response.
- Layout: `features/map/layout.ts` — `DOOR_NAMES` (:17), `REV_DIR` (:70), `layoutArea`
  (:125) with reverse-exit classification at :174. Cell math constants live in MapPage
  (CELL_W 170, CELL_H 100, NODE_W 140, NODE_H 56, PAD 40); `centerOf` maps grid→px.
- Full-model API: `src/api/client.ts` — `getArea` (:242-243, returns baseHash), `save`
  (:250-252, PUT w/ baseHash), `preview` (:244+, POST returns emitted text/diff),
  `AreaMapRoom/AreaMapExit` types (:181-204). `AreaFile` type comes from
  `@shatteredarchive/merc-area` (isomorphic — the client emits/parses locally already;
  PreviewPane is the local-emit precedent).
- Conflict UI: `features/areas/workbench.tsx:320` `ConflictPanel` (used by AreasPage :313,
  SkillsPage :212, GroupsView :180 — copy the GroupsView usage shape).
- Exit form reference: `features/areas/RoomEditor.tsx:17-28` (setExit/addExit/removeExit
  over `room.exits`), `:107+` the exits fieldset. LOCK_STATES from `src/data/flags.ts`
  (imported by MapPage already for door titles).
- Room sub-block ordering caveat (Phase 10): the emitter canonicalizes door order within a
  room — creating exits via ops then emitting is safe, but tests asserting emitted text
  must expect canonical order, not insertion order.
- The map response marks cross-area exits `external:{file,name}` — those become portal
  stubs, not room-to-room edges (edit popover: read-only).
- Live E2E facts: POST /api/areas creates a SKELETON area with NO rooms (Phase 11) — the
  driver must PUT rooms in before exit tests; area.lst de-registration must happen BEFORE
  file deletion on cleanup (reverse order kills the next boot — Phase 5); edge E2E drivers
  need `node --use-system-ca` (mkcert CA) and must hit the vhost, never 127.0.0.1+Host
  header (undici drops manual Host — Phase 12b).

## Steps
### [ ] 1. (CLAUDE) Pure exit-op module + tests
- Do: new `features/map/exit-edit.ts` (client-local, pure, zero React): op types
  `ExitOp = {op:'addExit', from, door, to, twoWay, locks, key} | {op:'updateExit', from,
  door, locks, key} | {op:'removeExit', from, door, alsoReverse}`; `applyOps(area: AreaFile,
  ops: ExitOp[]) → {area: AreaFile, warnings: string[]}` (immutable rebuild; addExit fills
  the full RoomEditor exit shape with description/keyword '', key 0 unless given; twoWay
  uses REV_DIR and downgrades to one-way + warning when the reverse slot is taken or the
  target room isn't local); `inferDirection(fromCell, toCell) → door` (nearest of the 8
  compass dirs by angle; NEVER infers up/down — those are picker-only); `describeOp(op,
  area) → string` for the tray. Tests: two-way add creates both sides, occupied-reverse
  downgrade warning, remove w/ alsoReverse, update locks/key, replay determinism (same ops
  twice = same result), inferDirection all 8 sectors + tie behavior.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/map/exit-edit.ts
  (new), exit-edit.test.ts (new)
- Verify (HOST): `pnpm --filter @shatteredarchive/mud-builder-client test` green.

### [ ] 2. (CLAUDE) MapPage edit-mode scaffolding + model adapter
- Do: "Edit exits" toggle in the map toolbar (area mode only). On enter: fetch
  `api.getArea(file)` (model + baseHash) alongside the map fetch; hold `{baseArea, baseHash,
  ops}` state. Derive the rendered map from the OPS-APPLIED model via a small local adapter
  `areaToMapRooms(area) → AreaMapRoom[]` (rooms + exits + external classification SKIPPED —
  in edit mode a target vnum outside the area's own rooms renders as a portal-less dangling
  marker; keep the adapter minimal and unit-tested so layoutArea consumes it unchanged),
  re-running `layoutArea` after every op. Exiting edit mode (or switching area/mode) with
  `ops.length > 0` → window.confirm discard guard. Spawn overlay: force-disabled during
  edit (staged exits would make its counts misleading) — note in the toolbar title.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/map/MapPage.tsx,
  exit-edit.ts (adapter), MapPage.test.tsx
- Verify (HOST): client suite green; existing view-mode tests untouched and passing
  (behavior-identical default is a Constraint, prove it by NOT editing those tests).

### [ ] 3. (CLAUDE) Drag-to-connect interaction + direction popover
- Do: in edit mode, pointerdown on a room node starts an exit-drag (stopPropagation so the
  canvas doesn't pan): render a ghost dashed line from the source room center to the cursor
  (track in SVG coords via the existing viewBox math). Pointerup on ANOTHER room opens a
  small HTML popover (absolutely positioned over the SVG, not inside it — reuse app popover
  styling if one exists, else minimal `mb-` classed div): direction select (all 10
  DOOR_NAMES, prefilled from inferDirection), "two-way" checkbox (default on), lock-state
  select (LOCK_STATES), key vnum input, Create/Cancel. Confirm → push addExit op. Pointerup
  on empty canvas or Escape cancels the drag. Keyboard path for a11y: in edit mode
  Enter on a room arms "connect from #vnum" (status line in toolbar), Enter on a second
  room opens the same popover.
- Files: MapPage.tsx (+ its css in features/map/map.css), MapPage.test.tsx
- Verify (HOST): client suite green — jsdom tests: pointerDown on room A + pointerUp on
  room B opens the popover with the inferred direction; confirm adds the edge to the
  rendered layout AND the tray; Escape cancels; canvas pan still works from background
  (fireEvent.pointerDown on the svg itself does not open a popover).

### [ ] 4. (CLAUDE) Edge popover + staged-changes tray
- Do: in edit mode, clicking a room-to-room edge opens the edge popover: direction + rooms
  (read-only header), lock-state select, key vnum, Delete button with "also remove reverse"
  checkbox shown ONLY when a REV_DIR reverse exit exists; external/portal edges get a
  read-only "cross-area — edit from that area's file" note. Changes push updateExit/
  removeExit ops. Tray panel (docked under the legend): one line per op via describeOp,
  per-item ✕ undo (drop op, re-replay — step 1 guarantees correctness), "discard all",
  and the op count badged on the Save button.
- Files: MapPage.tsx, map.css, MapPage.test.tsx
- Verify (HOST): client suite green — tests: edge click opens popover with current lock
  state, delete removes both sides when checked, tray lists ops, per-item undo restores
  the removed edge in the rendered layout.

### [ ] 5. (CLAUDE) Save pipeline + RoomEditor 10-door fix
- Do: Save button → compute final model via applyOps → call `api.preview(file, model)` and
  show the returned diff in a confirm panel (the preview-first tenet; reuse the Areas
  preview presentation if extractable, else a minimal mono pane w/ Confirm/Cancel) →
  `api.save(file, model, baseHash)`. Success: clear ops, store the returned new hash,
  refetch the map + area, brief "saved" note. 409: render ConflictPanel (workbench.tsx:320)
  with the exact existing semantics — Reload-from-disk (refetch, DISCARD ops after confirm)
  vs Save-anyway (PUT without hash). 401 (no/expired token): surface the guard error with a
  pointer at the Access tab, ops intact. ALSO: fix RoomEditor's stale 6-door cap
  (Constraints) — find over all 10 doors, cap at 10, and grep the client for other
  hardcoded `>= 6`/`[0-5]` door assumptions while there.
- Files: MapPage.tsx, features/areas/RoomEditor.tsx (+RoomEditor.test.tsx case: 7th exit
  addable, NE-SW doors offered), MapPage.test.tsx
- Verify (HOST): client suite green; `npx tsc --noEmit` in the client package clean (vite
  build alone does not typecheck).

### [ ] 6. (CLAUDE) Live E2E on a scratch area + docs + close-out
- Do: driver (scratchpad, `node --use-system-ca`, edge vhost): record game StartedAt; POST
  a scratch area (unused vnum range from /api/world); PUT two rooms into it; replicate the
  UI save path — GET the area (baseHash), applyOps one two-way addExit, PUT with hash;
  assert: GET shows BOTH rooms' exits, `/api/map/<scratch>` draws the room-to-room edge
  (classification two-way), a second stale-hash PUT 409s; cleanup: restore area.lst FIRST,
  then delete the file + backups; game StartedAt unchanged end-to-end (hot reload of a
  scratch area is fine but do NOT trigger it — this phase's writes never need the game to
  react). Update `docs/mud-builder/README.md` (Phase 14b section + Scope), refresh
  `.annotated` for `features/map/` + `features/areas/` and MapPage's `@ai-` header. Mark
  plan COMPLETE.
- Files: (driver in scratchpad), /workspace/shattered-archive/docs/mud-builder/README.md
- Verify (HOST): all driver checks pass with exact results logged; suites green; docs read
  back accurate; stock areas byte-untouched (`git -C /c/Projects/merc-mud status` clean for
  area/ apart from expected builder artifacts).

## Progress log

- 2026-07-23T18:00 plan created (Claude) — one of three Phase 14 candidates the user asked
  to be drafted in executable detail. Load-bearing design decisions recorded: ops-replay
  (not mutation) for staged edits; full-AreaFile editing (never the map projection); zero
  new server surface (existing conditional-save pipeline only); two-way-by-default with
  occupied-reverse downgrade; cross-area creation out of scope. Verified before writing:
  REV_DIR + layout exports (layout.ts:17,70,125,174), api.save/getArea/preview shapes
  (client.ts:239-252), ConflictPanel (workbench.tsx:320) and its three consumers, RoomEditor
  exit shape + STALE 6-door cap (RoomEditor.tsx:22-25,110 — fixing it is folded into
  step 5), AreaMapSvg pan-handler collision risk (MapPage.tsx onPointerDown/Move/Up).
- 2026-07-24T00:00 plan abandoned (Claude) — user chose 14a (spell codegen assist) to
  execute first. Revivable: design decisions above still hold if picked up later.
