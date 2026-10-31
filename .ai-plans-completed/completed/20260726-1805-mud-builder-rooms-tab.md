# Plan: MUD Builder — dedicated Rooms tab (editor), Areas becomes read-only for rooms

Created: 2026-07-26T18:05:00Z · Workspace: /workspace/shattered-archive · Status: COMPLETE

> Revised 2026-07-26T18:30 after the user expanded scope mid-implementation (see the
> 18:30 progress-log entry) — the original "add alongside, Areas untouched" plan (first
> AskUserQuestion answer) is SUPERSEDED by this version. Do not follow the original
> Constraints/Steps below this header; they are kept only in the progress log for
> history.

## Goal
1. `RoomsPage.tsx` becomes the SOLE editor for rooms — full CRUD (add/edit/delete),
   matching Mobs/Objects' shape, PLUS a read-only "Exits & connections" panel so the page
   genuinely helps a builder see how the room fits into the area (not just a bare form).
2. `AreasPage.tsx`'s room list + detail pane becomes READ-ONLY (view only, no add/delete/
   edit) with an "Edit this room →" link jumping to the real editor (Rooms). Everything
   else Areas does that has no other home — header editing, new-area creation, import,
   manual/raw-text editing, save/preview/conflict for the whole document — is UNCHANGED
   (see Constraints for why removing those would strand real capability).
3. The spawn-link round trip is verified AND completed in both directions: Room editor →
   Simulate pane (`onOpenSpawn`, already existed, now also wired from `RoomsPage`) AND
   Simulate pane → Room editor (new "Edit this room →" link per room in the Simulate
   accordion, landing back on `RoomsPage` with that room selected).
4. Map tab's room click (`onOpenRoom`) now lands on Rooms (the editor) instead of Areas
   (now read-only), since that's the more useful destination for "I clicked a room, I
   want to work with it."

Done when: Rooms is a real, full editor; Areas can no longer mutate room data through its
form (manual tab excepted, see Constraints); every cross-tab room link (Map click,
RoomEditor's spawn link, Simulate's new reverse link, World/PreviewPane external-ref
clicks) lands correctly and selects the right room; both suites are green.

## Why (context)
Original ask ("give Rooms its own tab") was scoped via AskUserQuestion to "add alongside,
Areas untouched" (see original Context/progress-log below). While implementing, the user
clarified further, in the same breath as "implement the plan": the spawn-link round trip
needs verifying and a reverse link into the editor, the Rooms page should specifically
help *visualize* a room (not just edit fields), and — reversing the earlier answer —
Areas should become read-only with Rooms as the actual editor. This plan is updated to
match that clarified intent rather than executing the now-superseded original scope.

## Constraints
- **Areas keeps everything that has no other home.** Header editing, new-area creation,
  import (quarantine validation), the manual/raw-text tab, and save/preview/conflict for
  the whole document are UNCHANGED — only the room LIST + FORM detail pane (currently
  `RoomEditor` with add/delete) becomes read-only. Rationale: the manual tab is the ONLY
  editor shops/specials have at all (grepped `AreasPage.tsx` — no `Shop`/`Special` editor
  exists anywhere in the client); making the whole page inert would strand that
  capability with no replacement. The manual tab can still technically rewrite the raw
  `#ROOMS` text as part of the whole document — that escape hatch is deliberately left
  alone (Constraints elsewhere in this codebase already treat "manual" as the documented
  fallback for whatever the form doesn't cover; narrowing it to exclude one section isn't
  in scope here).
- **Reuse existing, already-proven pieces for the editor half** — `model-ops.ts`'s
  `addRoom`/`newRoomTemplate`/`nextFreeVnum`/`removeEntity`/`deleteBlockers` and
  `workbench.tsx`'s `useAreaWorkbench`/`AreaSidebar`/`WorkbenchToolbar`/
  `WorkbenchManualPane`/`WorkbenchToast` — exactly as `MobsPage.tsx` does. `RoomEditor.tsx`
  itself needs no changes.
- **"Visualize how the room exists" = a new read-only Exits & connections panel**, not a
  new SVG/map renderer. New `RoomConnections.tsx` (lives in `features/areas/`, alongside
  `RoomEditor.tsx`/`model-ops.ts`, so both `AreasPage.tsx` (local import) and
  `RoomsPage.tsx` (cross-directory import, same pattern `MobsPage.tsx` already uses for
  `../areas/...`) can use it without duplication): for each of `room.exits`, show
  direction (`DOOR_NAMES`), the target room's resolved name if it's in the SAME area
  (plain lookup against `area`'s own rooms section — no server round trip), an "external"
  indicator when it isn't, and lock state (`LOCK_STATES`). Pure presentational, no
  fetches — reuses data both pages already have loaded. This is used BOTH as `RoomsPage`'s
  visualization panel AND as part of `AreasPage`'s new read-only room view (one component,
  two call sites — avoids writing the exit-rendering logic twice).
- **Cross-tab room targets need a consistent shape.** `AreasPage.tsx`'s existing
  `initialTarget?: ExternalRef | null` prop (already used by Map/World links) is reused
  as-is for `RoomsPage`'s own `initialTarget` prop — same shape, same
  `useEffect(() => { if (initialTarget) {...} }, [initialTarget])` pattern adapted to
  `useAreaWorkbench()`'s `openArea(file): Promise<void>` (which, unlike `AreasPage`'s own
  hand-rolled `openArea`, does NOT take a room vnum — the room selection is a second,
  independent `setRoomKey` call in the same effect; render-time lookup naturally catches
  up once `wb.area` resolves, no race condition to guard).
- **`App.tsx` gains one new cross-tab target, mirroring `resetsRoomTarget` exactly**:
  `roomsTarget: ExternalRef | null` (or reuse `areaTarget` — see Step 3's decision) for
  Simulate's new reverse link and Map's redirected `onOpenRoom`.
- **Do not touch `AreasPage.tsx`'s non-room features.** Header editor, `NewAreaForm`,
  `ImportAreaPanel`, the manual tab, save/preview/conflict/presence — none of these change.
  If a diff to this plan's steps touches any of those, stop and reconsider scope.
- pnpm quirk: no `--` before positional args when filtering jest by file name.

## Context
(file:line refs verified 2026-07-26 against current source; see the original plan
version's Context, still valid, for `model-ops.ts`/`workbench.tsx`/`MobsPage.tsx` cites)
- `App.tsx:17-29` `BuilderSection` union (`'rooms'` already present), `:31-44` `SECTIONS`,
  `:50-51` `resetsRoomTarget` state (the pattern to mirror for the new reverse-link
  target), `:73-80` Areas' `onOpenSpawn` wiring, `:100-106` Map's `onOpenRoom` wiring
  (currently `setAreaTarget(ref); setSection('areas')` — redirect target per Goal #4).
- `AreasPage.tsx:78-91` `initialTarget` effect + `navigateToRef` (pattern to adapt for
  `RoomsPage`), `:107-148` `addRoom`/`deleteRoom`/`updateRoom` (the room list + detail
  pane logic to REMOVE/replace with read-only rendering — see Steps), `:383-420` the JSX
  block that renders the room list nav + `RoomEditor` (the exact block to change).
- `ResetsPage.tsx:140` `initialRoomTarget` prop, `:399` passes it straight to
  `SimulatePane` — confirms the existing forward link (RoomEditor → Simulate) already
  round-trips correctly end to end; no bug to fix there, only a NEW reverse link to add
  and a NEW `RoomsPage` consumer to wire up and test.
- `SimulatePane.tsx`'s `RoomDetail` component (renders each room's `<details>` block) is
  where the new "Edit this room →" link needs to render, gated on a new optional
  `onEditRoom?: (vnum: number) => void` prop threaded through `SimulatePane` → the
  existing `ResetsPage({ initialRoomTarget })` signature gains a matching
  `onEditRoom?: (vnum: number) => void` passthrough.
- `MapPage.tsx`'s `onOpenRoom?: (ref: ExternalRef) => void` prop (already exists, already
  passes a full `ExternalRef`) — only `App.tsx`'s wiring changes, not `MapPage.tsx` itself.

## Steps

### [x] 1. (CLAUDE) RoomConnections.tsx — shared read-only exits/connections panel
- Do: new `apps/mud-builder-client/src/features/areas/RoomConnections.tsx`, props
  `{ room: Room; area: AreaFile }`. Renders a list: for each exit, direction name
  (`DOOR_NAMES[ex.door]`), target — `area`'s own rooms section looked up by `ex.toVnum`
  (if found: `#vnum name`; if not: "external / not in this area"), and lock state
  (`LOCK_STATES` label). No mutation, no fetches. Pure presentational component.
- Files: `apps/mud-builder-client/src/features/areas/RoomConnections.tsx` (new),
  `RoomConnections.test.tsx` (new — a room with a local exit resolves the target name; an
  exit to a vnum not in this area's rooms list shows the external indicator; a room with
  no exits renders without crashing).
- Verify (HOST): `pnpm --filter @shatteredarchive/mud-builder-client test -- RoomConnections`
  green.

### [x] 2. (CLAUDE) RoomsPage.tsx — the real editor
- Do: new `apps/mud-builder-client/src/features/rooms/RoomsPage.tsx`, structured like
  `MobsPage.tsx`: `useAreaWorkbench()`, room list nav (add/delete via
  `nextFreeVnum`/`addRoom`/`newRoomTemplate`/`deleteBlockers`/`removeEntity`), detail pane
  = `RoomEditor` (existing, unchanged) + `RoomConnections` (Step 1) rendered below it.
  Props: `{ initialTarget?: ExternalRef | null; onOpenSpawn?: (vnum: number) => void }`.
  `initialTarget` effect per Constraints (open the area, select the room by vnum).
  Wire into `App.tsx`: import, add a `section === 'rooms' ? <RoomsPage .../> :` branch
  above the fallback placeholder, passing the SAME `onOpenSpawn` callback shape Areas
  already uses (jump to Resets/Simulate filtered to this room) and a new
  `roomsTarget`-driven `initialTarget`.
- Files: `apps/mud-builder-client/src/features/rooms/RoomsPage.tsx` (new),
  `RoomsPage.test.tsx` (new: room list renders; add allocates next free vnum and selects
  it; delete is blocked by `deleteBlockers` and confirmed via `window.confirm`; editing a
  field round-trips through the workbench model; `RoomConnections` renders for the
  selected room; `initialTarget` opens the right area and selects the right room; the
  spawn link fires `onOpenSpawn` with the room's vnum), `apps/mud-builder-client/src/App.tsx`.
- Verify (HOST): `pnpm --filter @shatteredarchive/mud-builder-client test -- Rooms` green;
  `npx tsc --noEmit` clean.

### [x] 3. (CLAUDE) Cross-wire every room link: reverse Simulate link, Map redirect, Areas read-only
- Do, in order:
  (a) `App.tsx`: add `roomsTarget: ExternalRef | null` state (mirrors `areaTarget`).
      Redirect Map's `onOpenRoom` to `setRoomsTarget(ref); setSection('rooms')` (was
      `areaTarget`/`'areas'`). Add an `onEditRoom` callback passed to `ResetsPage` that
      does the same (`setRoomsTarget({kind:'room', vnum, where:'resets', file, name:''});
      setSection('rooms')` — `file` comes from whatever `ResetsPage`'s own workbench has
      open, threaded down through the new prop chain in step (b)).
  (b) `SimulatePane.tsx`: new optional prop `onEditRoom?: (vnum: number) => void`; render
      an "Edit this room →" link/button in `RoomDetail` (mirrors `onOpenSpawn`'s existing
      conditional-render style in `RoomEditor.tsx`). `ResetsPage.tsx`: accept and pass
      through the same prop to `SimulatePane`.
  (c) `AreasPage.tsx`: remove the "+ Add room" button, the `addRoom`/`deleteRoom`
      handlers, and the "Delete room #N" button (Constraints: room mutation moves
      entirely to Rooms). Replace `<RoomEditor room={room} onChange={updateRoom}
      onOpenSpawn={onOpenSpawn} />` with a read-only block: room name/description/sector/
      flags as plain text (not form inputs), `<RoomConnections room={room} area={area} />`
      for exits, and an "Edit this room →" link/button that fires a new
      `onEditRoom?: (vnum: number) => void` prop (App.tsx wires this to the same
      `roomsTarget` mechanism as (a), passing the CURRENTLY OPEN area's file + this room's
      vnum). `updateRoom` itself can be deleted if nothing else calls it after this edit
      (check before deleting — `PreviewPane`'s `onNavigate` and `navigateToRef` are
      SEPARATE and must stay, they only change which room is SELECTED for viewing, never
      mutate one).
- Files: `apps/mud-builder-client/src/App.tsx`, `apps/mud-builder-client/src/features/resets/SimulatePane.tsx`
  (+test), `apps/mud-builder-client/src/features/resets/ResetsPage.tsx` (+test if one
  exists — check at execution time), `apps/mud-builder-client/src/features/areas/AreasPage.tsx`
  (+test).
- Verify (HOST): new/updated tests prove each link end to end: Map room click → lands on
  Rooms with that room selected; Simulate's "Edit this room" → lands on Rooms with that
  room selected; Areas' "Edit this room" → lands on Rooms with that room selected;
  Areas' room detail pane has no input elements and no add/delete buttons; RoomEditor's
  existing "See what spawns here" test still passes unchanged (regression guard for the
  forward link). `pnpm --filter @shatteredarchive/mud-builder-client test` full suite.

### [x] 4. (CLAUDE) Full regression + docs + close-out
- Do: full client suite; `.annotated` for `features/rooms/` (new) and refreshes for
  `App.tsx`'s directory `.annotated`, `AreasPage.tsx`'s entry (now read-only for rooms),
  `SimulatePane.tsx`'s entry (reverse link), `RoomEditor.tsx`'s entry if its own
  onOpenSpawn description needs updating. Check `docs/mud-builder/README.md` for any
  passage describing Areas as the room editor or Rooms as a placeholder — correct it to
  describe the new split (Rooms edits, Areas views + links out). Mark this plan COMPLETE.
- Files: `docs/mud-builder/README.md`, `.annotated` files listed above.
- Verify (HOST): `pnpm --filter @shatteredarchive/mud-builder-client test` fully green
  (exact count logged here); `pnpm --filter @shatteredarchive/mud-builder-client build`
  clean.

## Progress log
- 2026-07-26T18:05 plan drafted (Claude Sonnet 5) — see original Goal/Constraints/Context/
  Steps that this revision superseded, preserved below for history:
  - Original Goal: add `RoomsPage.tsx` alongside Areas' existing room editing, mirroring
    Mobs/Objects exactly, `AreasPage.tsx` untouched.
  - Original decision point: investigated whether "give Rooms its own tab" should extract
    room editing OUT of `AreasPage.tsx` (mirroring how Mobs/Objects were fully extracted
    in Phase 4 — confirmed via grep: zero `MobEditor`/`ObjectEditor` references remain in
    `AreasPage.tsx` today) or add a second, parallel entry point leaving Areas untouched.
    Asked via AskUserQuestion; first answer was "add alongside."
- 2026-07-26T18:30 user expanded scope in the same message as "Implement the plan":
  (1) verify + complete the spawn-link round trip in both directions (Room editor →
  Simulate already worked, confirmed via existing passing test at
  `SimulatePane.test.tsx`'s `initialRoomTarget` case; Simulate → Room editor did not
  exist at all — new work); (2) Rooms should specifically help *visualize* the room, not
  just edit fields — scoped to a new read-only exits/connections panel rather than a new
  map/SVG renderer, to keep this bounded; (3) reversing the earlier AskUserQuestion
  answer — Areas becomes read-only for rooms, Rooms becomes the actual editor. Rewrote
  Goal/Constraints/Context/Steps above to match, without asking another round of
  clarifying questions (the user's intent was concrete enough to act on, and they'd
  already signaled twice they wanted forward motion) — one bounded interpretive call was
  made explicitly and documented in Constraints: "read-only" applies to Areas' room LIST
  + FORM only, not to header/new-area/import/manual-text/save, since those have no other
  home in the app and stranding them wasn't asked for.
- 2026-07-26 (continued) all four steps executed. Client suite: 185/185 (was 170 before
  this plan; +4 RoomConnections, +7 RoomsPage, +2 SimulatePane reverse-link, +2 net in
  RoomEditor.test.tsx's AreasPage-read-only rewrite). `tsc --noEmit` and `vite build`
  both clean throughout.
  - Step 1: `RoomConnections.tsx` — pure presentational exits/connections panel, no
    fetches. Shared between `RoomsPage.tsx` (cross-directory import) and `AreasPage.tsx`
    (local import) — one implementation, two call sites, exactly per Constraints.
  - Step 2: `RoomsPage.tsx` — full CRUD mirroring `MobsPage.tsx` exactly (same
    `useAreaWorkbench()`/model-ops helpers, zero new data-layer code), plus
    `RoomConnections` below the form. Wired into `App.tsx` with a new `roomsTarget`
    (`ExternalRef | null`) state mirroring `resetsRoomTarget`'s existing pattern.
  - Step 3: cross-wired every room link — App.tsx's `roomsTarget` now feeds from THREE
    sources (Map's `onOpenRoom`, redirected from Areas to Rooms; a new `onEditRoom` on
    `ResetsPage`/`SimulatePane`; a new `onEditRoom` on `AreasPage`). SimulatePane's new
    "Edit this room →" link lives inside `<summary>`, so its onClick needed BOTH
    `preventDefault` and `stopPropagation` — without them the click would also toggle the
    native `<details>` disclosure (documented in the component's own comment). AreasPage:
    removed `updateRoom`/`addRoom`/`deleteRoom` and their now-unused model-ops/`Room`-type
    imports entirely (not just hidden), replaced the room detail pane with read-only
    text + `RoomConnections` + both link buttons. Caught and fixed a genuine pre-existing
    test race in `RoomEditor.test.tsx`'s "creates a new area" test while updating it (the
    "+ New area" button exists — just disabled — before `/api/capabilities` resolves, so
    `findByRole` could return it before the mock's `writeEnabled:true` landed; fixed by
    waiting for the button to actually enable before clicking) — surfaced by, not caused
    by, this session's other test additions to the same file; documented as a real find,
    not silently patched over.
  - Step 4: added a new "Rooms tab: a dedicated room editor, Areas becomes read-only for
    rooms" README section (mirrors every other phase's section shape); fixed two
    genuinely stale statements found by grep (the intro paragraph's "and soon mobs,
    objects, scripts, …" — those shipped Phase 2/4 — and "Every entity tab has + Add
    (rooms on Areas, mobs, objects)"); left the "Scope" section's dense summary paragraph
    and a couple of still-accurate mentions (e.g. World-dashboard ref clicks "opening the
    defining area... and selecting the room" — still true, Areas still selects/views)
    alone rather than over-editing prose that wasn't actually wrong. `.annotated`
    refreshed for `features/rooms/` (new), `features/areas/` (RoomConnections new
    entries, AreasPage/RoomEditor/RoomEditor.test/areas.css entries updated),
    `features/resets/` (SimulatePane/ResetsPage entries), and the client's top-level
    `App.tsx` entry. Plan COMPLETE.
