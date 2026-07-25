# Plan: MUD Builder — Phase 14b (map exit editing: drag-to-connect rooms, edge editing, staged saves)

Created: 2026-07-23T18:00:00-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
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
### [x] 1. (CLAUDE) Pure exit-op module + tests
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

### [x] 2. (CLAUDE) MapPage edit-mode scaffolding + model adapter
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

### [x] 3. (CLAUDE) Drag-to-connect interaction + direction popover
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

### [x] 4. (CLAUDE) Edge popover + staged-changes tray
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

### [x] 5. (CLAUDE) Save pipeline + RoomEditor 10-door fix
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

### [x] 6. (CLAUDE) Live E2E on a scratch area + docs + close-out
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
- 2026-07-24T19:30 plan revived (Claude Sonnet 5) — 14a shipped and was reviewed/signed
  off; user asked to continue this plan next. Re-verified the Context section's file:line
  refs against current source before starting (mechanical pre-flight): all held, only minor
  line drift from 14a's unrelated additions to client.ts (getArea now :258, preview :260-261;
  REV_DIR/DOOR_NAMES/layoutArea/ConflictPanel/RoomEditor 6-door cap all exactly as recorded).
- 2026-07-24T19:55 step 1 done — `features/map/exit-edit.ts` + tests: ExitOp union,
  applyOps immutable replay (addExit two-way w/ REV_DIR mirroring + occupied-slot/non-local
  one-way downgrade warnings, updateExit, removeExit w/ alsoReverse), inferDirection (8
  compass sectors via atan2, never up/down), describeOp. 27/27 tests, tsc clean.
- 2026-07-24T20:20 step 2 done — MapPage.tsx edit-mode scaffolding: "Edit exits" toggle
  (area mode only), api.getArea fetch on toggle-on/area-switch-while-editing, ops staged in
  state and replayed via applyOps → editLayout (areaToMapRooms adapter added to exit-edit.ts,
  unit-tested separately), guardDiscard (window.confirm) wired into the mode buttons, area
  picker, and portal clicks so no area/mode switch can silently drop staged ops, Spawns
  checkbox force-disabled while editing. View-mode tests were NOT touched and still pass,
  proving behavior-identical default per the Constraints. New MapPage tests prove edit mode
  renders the full AreaFile (api.getArea), not the /api/map projection, via a fixture that
  deliberately differs between the two endpoints. Full client suite 139/139, tsc clean.
  .annotated refreshed for the two new files + MapPage.tsx/MapPage.test.tsx one-liners.
- 2026-07-24T20:50 step 3 done — drag-to-connect + direction popover, both inside
  AreaMapSvg (MapPage.tsx): room pointerdown starts a ghost drag line (stopPropagation so
  the existing pan handler never engages), pointerup on another room opens an HTML
  create-exit popover (direction prefilled via inferDirection off the two rooms' GRID
  cells — not raw pixels — two-way checkbox default on, lock-state select, key vnum,
  Create/Cancel) positioned over the SVG via a new .mb-map-canvas wrapper div; Escape
  cancels at any stage (drag, armed-keyboard, or open popover); an Enter-to-arm/Enter-to-
  connect keyboard path mirrors the same flow for a11y parity with the old click-to-open
  behavior it replaces in edit mode. Confirm calls a new onCreateExit prop → MapPage
  pushes an addExit ExitOp; a "N staged change(s)" toolbar badge now reflects `ops.length`
  (fulfills the step's "adds ... to the tray" verify language — the full per-item tray
  panel is step 4). 9 new MapPage tests (drag opens popover w/ correct inferred direction,
  self-drop cancels, confirm stages+renders the new edge, cancel stages nothing, Escape
  cancels, keyboard path, background pointerdown never opens a popover); full client
  suite 146/146, tsc clean. One incidental fix: a pre-existing act() warning surfaced by a
  new world-mode test was closed by mocking `/api/map` and awaiting WorldMap's own
  settle, not by touching WorldMap itself. .annotated refreshed for MapPage.tsx/.test.tsx.
- 2026-07-24T21:20 step 4 done — edge popover + staged-changes tray. Clicking an
  internal/external edge (never warp — script-derived, not a RoomExit) resolves the full
  RoomExit via a new `resolveExit` prop (reads editedArea directly; LayoutEdge doesn't
  carry key) and opens either a read-only cross-area note or an editable popover
  (lock-state, key vnum, Update → updateExit op; Delete → removeExit op, "also remove
  reverse" gated on `classification==='two-way'` — the exact condition under which
  applyRemoveExit's alsoReverse actually acts, chosen over the plan's looser "a REV_DIR
  reverse exit exists" wording to avoid a checkbox that silently no-ops on a
  non-returning edge). Deliberate scope addition beyond the plan's literal text: extended
  `areaToMapRooms` with an optional `resolveExternal` oracle wired to the area's
  already-fetched /api/map data (`data` state, never disabled while editing), so an
  EXISTING cross-area exit still renders as a portal stub + read-only popover in edit
  mode as the plan's step 4 spec assumed — a newly staged cross-area exit still stays
  dangling (creation remains out of scope). Tray docked under the legend: one line per
  op via describeOp (against baseArea, since room names are never touched by ExitOps),
  per-item ✕ undo (drop + re-replay), Discard all, and a disabled placeholder Save
  button badged with the op count (wired live in step 5 — the toolbar's now-redundant
  step-3 staged-count badge was removed since the tray header shows the same count).
  10 new MapPage tests (prefill from current lock/key, also-remove-reverse only offered
  on true two-way, Update stages + tray shows it, Delete+alsoReverse removes both edge
  directions from the render, per-item undo restores it, Discard all clears everything).
  Full client suite 152/152, tsc clean. .annotated refreshed (MapPage.tsx/.test.tsx,
  exit-edit.ts/.test.ts for the resolveExternal addition).
- 2026-07-24T21:50 step 5 done — save pipeline + RoomEditor 10-door fix. Save button
  now calls api.preview(file, editedArea), renders the existing PreviewPane (imported
  straight from features/areas — reused verbatim per the plan's preference) with
  Confirm/Cancel; Confirm calls api.save(file, editedArea, baseHash). Success clears
  ops, closes the preview, and calls a new refetchAfterSave() that re-pulls BOTH
  api.getArea and api.areaMap so edit mode's base model and view mode's projection are
  both current post-write, then toasts. 409 renders the reused ConflictPanel
  (features/areas/workbench.js) with the SAME semantics as AreasPage: Reload (a second
  window.confirm, then discard ops + refetch) vs Save-anyway (a second window.confirm,
  then an unconditional PUT with no baseHash of the STAGED model, not the stale base).
  401 needed no special handling — client.ts's request() already appends "— set your
  builder token in the Access tab" to any 401 message, and ops are already left intact
  on every non-success path since they're only cleared in the success branches; verified
  with a dedicated test rather than assumed. RoomEditor.tsx: addExit's door allocator and
  the +add-exit disabled cap were still hardcoded to the pre-12b 6-door set
  ([0,1,2,3,4,5], `length >= 6`) even though the direction SELECT already listed all 10
  DOOR_NAMES — swapped both to derive from DOOR_NAMES.length; grepped the whole client
  for other hardcoded door-count assumptions per the plan's instruction, found none
  else. 10 new MapPage tests (preview-then-save success + refetch proof via a GET
  call-count spy, cancel-leaves-ops-staged, 401 message + ops-intact, 409→reload
  discards ops, 409→save-anyway sends the edited model unconditionally) + 1 new
  RoomEditor test (7th exit addable, full 10-name direction list, cap now at 10). Full
  client suite 158/158, tsc clean. .annotated refreshed (MapPage.tsx/.test.tsx,
  RoomEditor.tsx/.test.tsx).
- 2026-07-24T22:20 step 6 done, plan COMPLETE. Deployed builder pair was still on
  pre-14b images (last rebuilt during the 14a review, ~1h before this step) — rebuilt +
  recreated (`docker compose -f deploy/docker-compose.shattered-archive-experimental.yml
  build/up -d mud-builder-server mud-builder-client`); edge confirmed healthy
  (`/api/capabilities` 200, writeEnabled=true). Live E2E driver (scratchpad
  `p14b-e2e.mjs`, `node --use-system-ca`, hit the vhost per the edge-vhost caveat) against
  a scratch area (p14bscratch.are, vnum range 200-299, an unused gap found via
  /api/world): created via POST, two bare rooms PUT in, then the UI save path replicated
  exactly (GET baseHash → apply one two-way addExit op by hand, mirroring exit-edit.ts's
  applyOps → PUT with hash) — ALL 10 assertions passed: GET showed the exit on both
  rooms with the correctly reversed door (1 east / 3 west via REV_DIR), /api/map drew it
  as a resolved internal edge (no `external` tag), and a second PUT reusing the now-stale
  hash 409'd. Cleanup done in the correct order (memory: reverse order kills the next
  boot) — area.lst entry removed first, then the .are file and both its .bak backups
  deleted; `git -C merc-mud status` confirms no residue (area.lst and the scratch file
  don't appear in the diff; the one pre-existing firefield.are diff predates this step).
  merc-mud2.4 StartedAt byte-identical before and after
  (2026-07-24T23:31:17.834496816Z) — the live game was never touched or restarted.
  Docs: added a "Map exit editor" README section (stage-not-live model, drag-to-connect
  + inferred direction + occupied-slot/non-local downgrade, edge popover incl. the
  cross-area-read-only case, the RoomEditor 10-door fix, the E2E summary) and extended
  the Scope paragraph, which had ALSO never been updated for Phase 14a — fixed both in
  the same edit. `.annotated` was kept current incrementally at every step rather than
  batched here; MapPage's `@ai-summary` header (not just `@ai-notes`) got one more
  sentence for Phase 14b to match the file's own convention.
  **UI verification caveat**: no browser-automation tool (Playwright/Puppeteer/screenshot)
  is available in this environment, so the interactive drag/popover/tray flow was NOT
  visually verified in a real browser — confirmed instead via jsdom tests that render the
  actual components and fire real pointer/keyboard/click events (158/158 green), a clean
  `tsc --noEmit`, a clean production `vite build`, and the live API-level E2E above. This
  matches the project's established verification method for this feature (no Playwright
  anywhere in the repo; prior phases 10-14a were all verified the same API-driver way) —
  noting the gap explicitly per instruction rather than claiming a browser check that
  didn't happen.
