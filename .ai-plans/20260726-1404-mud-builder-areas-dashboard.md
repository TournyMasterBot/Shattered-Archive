# Plan: MUD Builder — Areas dashboard redesign + delete reconciliation

Created: 2026-07-26T14:04:00Z · Workspace: c:\Projects\ShatteredArchive · Status: COMPLETE

## Goal
Turn `AreasPage.tsx` from a read-only room picker back into a fully editable,
**organizational dashboard** for the whole area: left nav (area list) + area header stay
as today, but the main content becomes a scrollable list of every room in the area, each
a top-level accordion that nests mobs/objects/progs placed in it — mobs further nest
their equipment (this room's `G/E/P` reset rows) and their scripts (area-wide
`MobScript` rows). Editing anywhere in this tree is real editing (same underlying
records the focused tabs edit), not a preview. The dedicated tabs (Rooms/Mobs/Objects/
Resets/Scripts) are untouched — Areas is "see everything, edit anything," they remain
"edit exactly this one thing."

Also: deleting a room that's still referenced gets a categorized, actionable panel
instead of a flat error toast, with "go fix it" buttons that land on and focus the right
tab (Map for exits, Resets for reset refs, Mobs for shop/special refs, Scripts for
script refs).

Done when: a room's mobs/objects/scripts/equipment are all visible and editable from
inside Areas; editing a mob there also reflects on the Mobs tab (same prototype); a
blocked room delete shows categorized reasons with working navigation; dirty-state
tracking exists in `useAreaWorkbench` and guards the Areas area-switcher; full
regression green.

## Why (context)
Areas was made read-only for rooms on 2026-07-26 (see
`.ai-plans/20260726-1805-mud-builder-rooms-tab.md`) on the premise that room editing
should live only in a dedicated Rooms tab. The user has now reversed that explicitly:
"I would actually like the area page to be a read only version, and the room specific to
be the editor" (their words when scoping the Rooms tab) has become "I don't think that
actually needs to be the case" — Areas should go back to allowing full editing, but
organized as a nested dashboard (room → mobs/objects/progs → equipment/scripts) rather
than the old single-selected-room form, so a builder can understand an entire area at a
glance. This is Part 1 of a two-part request; Part 2 (a separate UX polish pass over
confirmations/banners across every tab) is deliberately sequenced after this lands, so
it audits the new dashboard rather than the version being replaced.

## Constraints
- Focused tabs (Rooms/Mobs/Objects/Resets/Scripts) are **unchanged in behavior** — this
  plan only adds a new way to reach the same edits from Areas, plus extracts logic those
  tabs already had privately (extraction must not change their own tests' outcomes).
- Editing a mob/object from inside a room's accordion edits the **shared prototype**
  record (same vnum as editing from the Mobs/Objects tab) — correct, not a bug, and
  should be labeled in the UI so it isn't surprising ("editing mob #N — affects every
  room it's placed in").
- Equipment (`G`/`E`/`P` reset rows immediately following an `M` row) is scoped to
  **this specific room placement**; scripts (`MobScript` rows) are scoped to **the
  mob/room vnum, area-wide**. The UI must not blur these two different scoping
  semantics — label them distinctly.
- Dirty-state tracking is a `JSON.stringify(area)` snapshot comparison against the last
  successful open/save/reload, cheap at this file size, consistent with the manual-edit
  path's existing parse/emit round-trips. It lives in `useAreaWorkbench` so every tab
  benefits, but this plan only *wires* the confirm prompt at the point the user named
  (switching the selected area in Areas). Wiring it into every other tab's own
  entity-switcher, plus a `beforeunload` guard, is explicitly Part 2's job — not
  duplicated here.
- Reconciliation navigation reuses existing hand-off plumbing (`resetsRoomTarget`)
  where it already exists, and adds the smallest precedented equivalent (`MapPage`
  initial-focus prop) where it doesn't — no new generic "deep link" framework.
- No data-layer (`services/merc-area`) changes expected — this is client-composition
  work over an already-round-tripping model (parse/emit already handle every field
  touched here).

## Context
(file:line refs verified 2026-07-26 against current source)
- `AreasPage.tsx` (417 lines) does **not** use the shared `useAreaWorkbench()` hook — it
  hand-rolls a duplicate copy of the same state/logic (`workbench.tsx:37-213` mirrored
  locally, including its own copies of `openArea/doPreview/doDownload/doSave/doReload/
  conflictReload/conflictSaveAnyway/openManual/applyManual`). Retiring this duplication
  is part of this plan (Step 6), not incidental.
- `useAreaWorkbench()` (`features/areas/workbench.tsx:22-60,284-313`) full return shape:
  `caps, areas, file, area, preview, toast, writesOff, gateTip, setToast, err, openArea,
  setAreaModel, doPreview, doDownload, doSave, doReload, conflict, conflictReload,
  conflictSaveAnyway, presence, presenceName, manualOpen, manualText, manualEdited,
  setManualText, toggleManual, applyManual, createArea`. Toast is two-state only
  (`{kind:'ok'|'err'}`, `:14,383-389`). **No dirty-state tracking exists anywhere in the
  client** (grep confirmed zero matches for `dirty`/`isDirty`/`beforeunload`) — every tab
  already silently discards in-memory edits on area/entity switch today; this predates
  this session and isn't new breakage.
- `RoomEditor.tsx`, `features/mobs/MobEditor.tsx`, `features/objects/ObjectEditor.tsx`,
  `features/scripts/ScriptEditor.tsx` are each already standalone, independently-tested
  form components (own `.test.tsx` files) mutating their entity via a plain
  `onChange(updated)` prop — embeddable directly inside new accordion rows with zero
  duplication.
- Equipment/scripts data-model (confirmed via `services/merc-area/src/types.ts` and
  `ResetsPage.tsx`): `Mobile`/`MudObject` have **no** equipment or scripts fields.
  Equipment = `Reset` rows (`command:'G'|'E'`) immediately following an `M` row in
  `#RESETS` — `ResetsPage.tsx:88-109` `computeBlocks` already groups an `M` with its
  trailing `G/E/P` riders as one movable unit, exactly the grouping the new "equipment on
  the mob" accordion needs. Scripts = `MobScript` rows in `#SCRIPTS`
  (`attach:'mob'|'room'`; `mobVnum` field holds the **room's** vnum when
  `attach==='room'`) — area-wide, not tied to a room placement.
  `ResetsPage.tsx`'s per-command row JSX (`fieldsFor`, `:212+`) and mutation closures
  (`setResets`/`update`/`remove`/`addReset`, `:155-210`) are private to that file today
  and need extracting to be reusable (Step 2).
- `deleteBlockers` (`features/areas/model-ops.ts:113-115` → `referencesTo`/
  `collectRefs`, `services/merc-area/src/validate.ts:169-254`) already returns
  categorizable `where` strings by construction: `"reset #N (…): …"` (fix in Resets),
  `"room V exit D: leads to room …"` (fix on the Map), `"shop: keeper mob …"` /
  `"special: … on mob …"` (fix on Mobs), `"…script… attached to …"` (fix in Scripts) —
  the string prefix alone is enough to route a "go fix it" button.
- `MapPage.tsx:673` (`export default function MapPage({ onOpenRoom })`) has a full
  drag-to-connect exit editor (Phase 14b) but takes no initial-focus prop — always opens
  the first area, no way to land pre-focused on one room. Needs a small, precedented
  addition (Step 4).
- Cross-tab hand-off precedent to reuse: `resetsRoomTarget` (`App.tsx`) already carries
  a room vnum into the Resets tab, feeding `SimulatePane`'s `initialRoomTarget` filter
  (`ResetsPage.tsx:141`, `SimulatePane.tsx:132`) — the exact mechanism a "go fix the
  resets referencing this room" button needs; no new plumbing required for that one.

## Steps

### [x] 1. (CLAUDE) Dirty-state infra in `useAreaWorkbench`
- Do: snapshot ref set on `openArea`/successful `doSave`/`doReload`/`conflictReload`/
  `conflictSaveAnyway`; derive `isDirty` from comparing current `area` against the
  snapshot; export `isDirty` and `confirmDiscard(actionLabel: string): boolean` (returns
  true immediately when clean; `window.confirm`s with a message naming `actionLabel`
  when dirty).
- Files: `features/areas/workbench.tsx`, `workbench.test.tsx` (new).
- Verify (HOST): unit tests — dirty flips true on any `setAreaModel`, false after
  save/reload/open, `confirmDiscard` short-circuits when clean and prompts when dirty.

### [x] 2. (CLAUDE) Extract reusable resets-editing logic
- Do: pull `computeBlocks`, the row-mutation closures, and `fieldsFor`'s per-command
  field JSX out of `ResetsPage.tsx` into `features/resets/reset-editing.tsx`
  (`useResetsEditor(wb)` hook + `<ResetRowFields>` component). `ResetsPage.tsx` imports
  and uses them with zero behavior change.
- Files: `features/resets/reset-editing.tsx` (new), `ResetsPage.tsx`.
- Verify (HOST): existing `ResetsPage.test.tsx` suite passes unmodified — proves the
  extraction is behavior-preserving.

### [x] 3. (CLAUDE) `DeleteBlockersPanel` — categorized, actionable blocked-delete UI
- Do: new shared component: given `deleteBlockers(...)` output, group by `where`-string
  prefix (`reset #` → Resets, `exit` → Map, `shop:`/`special:` → Mobs, `script` →
  Scripts), render each group with its items and a "Go fix it →" button. Replace the
  flat error-toast on a blocked room delete in `RoomsPage.tsx` with this panel. "Go fix
  it" wires: `resetsRoomTarget` for Resets (existing); a new `mapFocus` App-level lift
  for Map; plain `setSection` for Mobs/Scripts (no deep-filter needed for those two).
- Files: `features/areas/DeleteBlockersPanel.tsx` (new + test), `RoomsPage.tsx`,
  `App.tsx` (new `mapFocus` state + prop threading).
- Verify (HOST): unit tests per blocker category resolve to the right button/label;
  `RoomsPage`'s existing delete-blocked test updated to assert the panel renders instead
  of a toast.

### [x] 4. (CLAUDE) `MapPage` initial-focus prop
- Do: add `initialFocus?: { file: string; vnum: number } | null` — on mount/change,
  opens that area and centers/highlights the room (mirrors `RoomsPage`'s existing
  `initialTarget` effect shape).
- Files: `features/map/MapPage.tsx`, `MapPage.test.tsx`.
- Verify (HOST): test asserts the named room is open/highlighted after mount with a set
  focus.

### [x] 5. (CLAUDE) Room dashboard accordion components
- Do: new files under `features/areas/`:
  - `RoomDashboardEntry.tsx` — one room as a top-level `<details>` (closed by default,
    children mounted only when open): embeds `RoomEditor` directly (full edit) +
    `RoomConnections` + the three accordions below.
  - `MobPlacementAccordion.tsx` — one `M`-block: header (mob name/vnum + placement
    count), nested `<details>` embedding `MobEditor` (labeled as editing the shared
    prototype), nested `<details>` "Equipment" using `ResetRowFields` scoped to that
    block's `G/E/P` rows, nested `<details>` "Scripts" listing `MobScript` rows where
    `attach==='mob' && mobVnum===thisVnum`, each embedding `ScriptEditor`.
  - `ObjectPlacementAccordion.tsx` — one `O`-block: embedded `ObjectEditor` + nested
    "Contents" accordion for `P`-rider rows (reusing `ResetRowFields`).
  - `RoomScriptsAccordion.tsx` — `MobScript` rows where `attach==='room' &&
    mobVnum===room.vnum`, each embedding `ScriptEditor` ("progs").
- Files: the four components above (+ one `.test.tsx` each).
- Verify (HOST): each component's own tests (renders correct scoped subset; edits
  round-trip into `wb.area` via `setAreaModel`); empty-state text (not an error) when a
  room has no mobs/objects/scripts.

### [x] 6. (CLAUDE) Rewire `AreasPage.tsx`
- Do: migrate off the hand-rolled duplicate state onto `useAreaWorkbench()`. Left nav
  (area list) + `AreaHeaderEditor` stay as-is. Replace the room-list-nav +
  single-room-detail split with: an optional name/vnum filter input (mirrors
  `SimulatePane`'s existing filter pattern) above a scrollable list of
  `RoomDashboardEntry` for every room. Room "+ Add"/"Delete" moves back here too
  (removed to Rooms-only on 2026-07-26; both tabs can add/delete now). Wire
  `wb.confirmDiscard('switch areas')` before `openArea` on sidebar area-switch.
- Files: `AreasPage.tsx` (rewrite), `AreasPage.test.tsx` (rewrite to match); remove the
  now-dead `mb-room-readonly*` CSS in `areas.css` in favor of new dashboard classes.
- Verify (HOST): full add/edit/delete of a room, its mobs, its objects, and its scripts
  from within Areas round-trips through preview/save; existing cross-tab hand-offs
  (World→Areas `areaTarget`, "Edit this room"/"see what spawns here" links) still work
  or are updated to the new dashboard shape.

### [x] 7. (CLAUDE) Full regression + docs + `.annotated` + close-out
- Do: `pnpm --filter @shatteredarchive/mud-builder-client test`, `tsc --noEmit`,
  `vite build`; update `docs/mud-builder/README.md`'s Areas description; refresh
  `.annotated` for every touched directory; mark this plan COMPLETE with a full
  progress-log entry; update `mud-builder-project.md`/`MEMORY.md` memory.
- Verify (HOST): all green; manual-smoke checklist from the plan-mode session — edit a
  mob's stat inline in Areas and confirm it also changed on the Mobs tab; delete a room
  referenced by an exit and confirm the Map "go fix it" button lands on and highlights
  the right room.

## Progress log
- 2026-07-26 plan drafted via EnterPlanMode/ExitPlanMode after three parallel Explore
  agents (Areas/Rooms architecture, mobs/objects/resets/scripts data-model and
  ownership, confirm/toast/banner inventory) plus direct grep/read verification of
  `deleteBlockers`/`collectRefs` categorization and `ResetsPage.tsx`'s extractable
  internals. User approved on first pass, no revisions requested. This is Part 1 of a
  two-part request; Part 2 (UX polish pass) is tracked separately and starts only after
  this plan reaches COMPLETE.
- 2026-07-26 Steps 1-4 done. Step 1: `isDirty`/`confirmDiscard` added to
  `useAreaWorkbench` — snapshot had to be `useState` not `useRef` (a ref mutation alone
  doesn't retrigger the `isDirty` `useMemo`, caught by a failing test before it shipped).
  Step 2: extracted `useResetsEditor`/`ResetRowFields` to `reset-editing.tsx`;
  `ResetsPage.test.tsx`'s 6 tests passed unmodified, confirming behavior-preservation;
  `addReset` now takes the command as a param instead of closing over local UI state, so
  the future mob/object accordions can add a specific G/E/P/P row directly. Step 3:
  `DeleteBlockersPanel` (categorizes by `where`-string prefix) replaces `RoomsPage`'s
  flat blocked-delete toast; wired `onGoToResets` (reuses the existing `resetsRoomTarget`
  lift)/`onGoToMap` (new `mapFocus` lift)/`onGoToMobs`/`onGoToScripts` (plain tab
  switches) through `App.tsx`. Step 4: `MapPage` gained `initialFocus` — a same-mount
  effect wins the race against the default-first-area fetch; the viewport-centering
  effect had to be declared AFTER the pre-existing reset-view-on-file-change effect
  (React runs a component's effects in declaration order — declaring it before meant the
  existing effect clobbered the centering on the very same mount; caught by a failing
  test, fixed by reordering, not by touching the pre-existing effect's own logic).
  193/193 client tests green throughout (was 188 at the end of the prior Rooms-tab
  session), `tsc --noEmit` clean after every step.
- 2026-07-26 Step 5 done: `RoomDashboardEntry`/`MobPlacementAccordion`/
  `ObjectPlacementAccordion`/`RoomScriptsAccordion` (all `features/areas/`) +
  `scripts-model.ts` (`useAreaScripts`, mirrors `useResetsEditor`'s shape). Also
  refactored `RoomsPage.tsx`'s delete flow onto a new shared
  `useDeleteWithBlockers(wb, kind)` hook (co-located in `DeleteBlockersPanel.tsx`) so the
  check/confirm/remove logic can't drift between RoomsPage and the new dashboard entry —
  RoomsPage's own tests passed unmodified, confirming the refactor was behavior-
  preserving. Two real bugs caught and fixed before any test ran green: (1) a raw `.are`
  fixture used `O 0 3100 100` / `P 0 3200 3100` — wrong token counts (parse.ts's actual
  grammar: `O` reads `ifFlag arg1 arg2 arg3` = 4 numbers, `P` reads all 5 — the O line
  was missing its arg2 placeholder, P its arg2); traced by reading `parse.ts`'s reset
  grammar directly rather than guessing further from the model-ops template. (2) jsdom
  does not hide a closed `<details>`'s children (no native `details:not([open])` UA
  styling in jsdom) — a test assumed clicking a nested summary was required before its
  content became queryable; fixed by just querying it directly, which also confirms the
  real behavior (content already interactive without opening — harmless, but worth
  knowing for anyone reading these tests later expecting them to model real hidden
  content). `computeBlocks` only groups an `M` with contiguous trailing `G`/`E`/`P` —
  it does NOT group an `O` with trailing `P` (those are matched by vnum, "closest O
  above" per ResetsPage's own help text), so a new `contentsOf(resets, oIndex)` helper
  was added to `reset-editing.tsx` for `ObjectPlacementAccordion`'s "Contents" panel.
  213/213 client tests green (was 193), `tsc --noEmit` clean. Remaining: Step 6 (the
  actual `AreasPage.tsx` rewrite — everything built in Step 5 is new, unmounted files
  until this step wires them in), Step 7 (close-out).
- 2026-07-26 Steps 6-7 done — plan COMPLETE. `AreasPage.tsx` migrated fully onto
  `useAreaWorkbench()` (retiring its hand-rolled duplicate state, per Research); the
  room-list-nav/single-detail split was replaced by a name/vnum filter above a
  scrollable list of `RoomDashboardEntry` (one per room, fully editable, closed by
  default). Reused `AreaSidebar` instead of AreasPage's own hand-rolled sidebar markup
  by adding two opt-in props (`onBeforeOpen`, `extraToolbar`) — every other tab's
  `AreaSidebar` usage is unaffected (both default to today's exact behavior when
  omitted), and only AreasPage passes `onBeforeOpen={() => wb.confirmDiscard(...)}`, so
  the dirty-guard stays scoped to Areas as the Constraints required rather than silently
  spreading to every tab. `+ Add room` moved back to Areas alongside Rooms (both now
  functionally equal); the old `onEditRoom` hand-off prop was removed entirely (Areas
  edits directly now, nothing to hand off) — `App.tsx` and its one caller updated to
  match. `AreasPage.test.tsx` and the `RoomEditor.test.tsx` file's `AreasPage`-describe
  blocks were rewritten for the new shape: "shows rooms read only" became "rooms are
  directly editable" (click the room's `<summary>` — jsdom fires a native `<details>`
  toggle on click, confirmed empirically, no manual event hackery needed), the
  "onEditRoom fires" test was replaced with a plain onOpenSpawn test, and "no
  room-mutation UI is offered" was INVERTED to assert `+ Add room`/`Delete room` now
  exist. Dead `mb-room-readonly-actions`/`-descr` CSS removed (confirmed zero remaining
  references first). Docs: `docs/mud-builder/README.md`'s dedicated Rooms/Areas section
  rewritten end to end (title, body, the mob/object/prog accordion structure, the
  reconciliation panel, the dirty-guard) plus two smaller stale-fact fixes elsewhere in
  the same doc (a Map-tab room click was still documented as landing on "the Areas tab"
  — it lands on Rooms and has since the earlier Rooms-tab session; the "+ Add" summary
  line). `.annotated` refreshed across every touched directory throughout all 7 steps
  (incrementally, not batched at the end) — `features/areas`, `features/resets`,
  `features/rooms`, `features/map`, and the top-level `src/.annotated`.
  Final state: mud-builder-client 213/213 (was 185 at this plan's start), merc-area
  135/135 unchanged (confirms no data-layer regressions across the whole plan — expected,
  since this was pure client-composition work over an already-round-tripping model),
  `tsc --noEmit` clean, `vite build` clean. Two real bugs were caught and fixed along the
  way (both documented in the Step 5 entry above): a raw `.are` test fixture with wrong
  reset-line token counts (found by reading `parse.ts`'s actual grammar rather than
  guessing further), and a test assuming jsdom hides collapsed `<details>` content (it
  doesn't — fixed the test, not the component). Part 2 (the separately-scoped UX polish
  pass — consistent confirmations/banners across every tab) starts next, as its own
  `.ai-plans` document, per this plan's original framing.
