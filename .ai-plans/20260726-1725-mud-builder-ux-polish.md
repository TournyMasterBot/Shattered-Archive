# Plan: MUD Builder — UX polish pass (confirmations, banners, error clarity)

Created: 2026-07-26T17:25:00Z · Workspace: c:\Projects\ShatteredArchive · Status: COMPLETE

## Goal
Sweep every tab built across this project's prior phases for the three things the user
explicitly asked for: confirmation before destructive/irreversible actions, consistent
success/failure/warning feedback, and clearer errors. Concretely: a shared 4-state toast
(today only `ok`/`err` exist) adopted everywhere instead of 8 hand-rolled duplicates;
every remaining unconfirmed destructive action gets a confirm or a *documented* reason it
doesn't need one; every silent create/delete gets a success toast; the dirty-state guard
built in Part 1 (`useAreaWorkbench.isDirty`/`confirmDiscard`, currently wired into Areas
only) rolls out to every other tab's own area-switcher plus a `beforeunload` guard.

## Why (context)
Part 2 of the user's original two-part request (Part 1: the Areas dashboard redesign,
`.ai-plans/20260726-1404-mud-builder-areas-dashboard.md`, COMPLETE). Explicit ask: "adding
human focused UX improvements that make things easier to access, errors easier to
understand, prompts confirmations before destructive actions or non reversible steps and
ensures that all actions have appropriate success banners, failure banners, warning
banners, etc." Deliberately sequenced after Part 1 so it audits the *current* Areas
dashboard rather than the version it replaced.

## Constraints
- This is a sweep over existing, already-correct behavior — no new features, no
  redesigns. Every change should be small and mechanical per call site.
- Not every unconfirmed action needs a confirm added. Fine-grained, high-frequency,
  low-risk, trivially-undoable edits (a single reset row's ✕, a rider row's ✕) stay
  unconfirmed — confirming every keystroke-adjacent action would make the editor
  actively worse to use. Document the "no confirm, on purpose" calls the same way as
  the ones that do get one, rather than silently deciding.
- `useDeleteWithBlockers`/`DeleteBlockersPanel` (`features/areas/DeleteBlockersPanel.tsx`)
  only applies where a `RefKind` exists (`'mob' | 'object' | 'room'`,
  `services/merc-area/src/validate.ts:91`) — **Socials cannot adopt it**, nothing in
  `collectRefs` ever tracks a social as referenceable. Socials' delete stays a plain
  confirm, unblocked, and that's correct, not a gap.
- The `beforeunload` guard only covers tabs backed by `useAreaWorkbench` (where
  `isDirty` is tracked). Map's and Scripts' pages hand-roll their own area/model state
  (not `useAreaWorkbench`) — Map already has its own "discard unsaved exit changes?"
  confirm on navigate-away; Scripts has none. Bringing both onto `isDirty` proper is a
  bigger lift (real state-management change, not a mechanical sweep) — out of scope
  here. Give Scripts the same manual navigate-away confirm Map already has instead of
  restructuring its state, and say so plainly in the close-out rather than silently
  leaving it uncovered with no note.

## Context
(file:line refs verified 2026-07-26 against current source, post Part 1)
- Toast today: `AreaWorkbench.toast: {kind:'ok'|'err'; text} | null` (`workbench.tsx:14`),
  rendered by `WorkbenchToast` (`workbench.tsx:383-390`, `mb-toast mb-toast--{kind}`).
  Only `err`/`setToast` are exposed on the hook's return value — `ok` is a private
  closure, so pages can't toast a success without reaching into `setToast` directly.
- 8 hand-rolled duplicate toast implementations confirmed still present (identical
  `{kind:'ok'|'err'} | null` state + inline `<p>`/`<div className="mb-toast ...">`):
  `ScriptsPage.tsx:33`+render, `MapPage.tsx:49,727,1172`, `EnginePage.tsx:38,105`,
  `AccessPage.tsx:43,158`, `SkillsPage.tsx:60,184`, `GroupsView.tsx:38,165`,
  `CodegenView.tsx:92,210`. `WorldPage.tsx:40` is simpler still — a bare
  `error: string | null`, no success case at all (World is read-only, matches).
- Unconfirmed destructive actions confirmed still present: `ScriptsPage.tsx:125-129`
  `deleteScript` (no confirm, no blocker check — scripts aren't referenced by anything
  either, matching Socials). Reset-row `✕` (`ResetsPage.tsx`'s row list,
  `MobPlacementAccordion.tsx`'s Equipment rows, `ObjectPlacementAccordion.tsx`'s
  Contents rows) has no confirm — deliberately staying that way (see Constraints).
  `MobPlacementAccordion.tsx`/`ObjectPlacementAccordion.tsx`'s **"Remove this
  placement"** button (removes a whole M/O block, the closest equivalent to "delete
  this mob/object from this room") has no confirm — this one SHOULD get one, unlike
  the fine-grained rows inside it.
- Blocked-delete still flat-toast (not yet on `DeleteBlockersPanel`): `MobsPage.tsx:49-56`,
  `ObjectsPage.tsx:48-55` — both call `deleteBlockers` + `wb.err(...slice(0,3)...)`
  directly, the exact pattern `useDeleteWithBlockers` (Part 1,
  `DeleteBlockersPanel.tsx`) already replaced for Rooms. Straight drop-in reuse.
- Silent create/delete confirmed: zero `wb.ok(...)`/success-toast calls found in any
  entity create/delete handler across Rooms/Mobs/Objects/Resets/Scripts/Socials —
  success is invisible until the next explicit Save.
- Dirty-guard today: only `AreasPage.tsx` passes `AreaSidebar`'s `onBeforeOpen` (Part 1).
  `RoomsPage.tsx`/`MobsPage.tsx`/`ObjectsPage.tsx`/`ResetsPage.tsx`/`SocialsPage.tsx`
  all render `<AreaSidebar wb={wb} />` with no guard — switching areas there still
  silently discards in-memory edits. `MapPage.tsx` has its own `guardDiscard` already
  (confirms when `ops.length > 0`, i.e. staged exit edits) but nothing for its
  edit-mode's *unstaged* form fields (none exist — edits are ops-only, so this is
  already complete for Map). `ScriptsPage.tsx` has no guard of any kind on area switch.

## Steps

### [x] 1. (CLAUDE) Shared 4-state Toast component
- Do: new `features/shared/Toast.tsx` exporting `ToastKind = 'ok'|'err'|'warn'|'info'`,
  `ToastState = {kind: ToastKind; text: string} | null`, and `Toast({toast, onDismiss})`
  (the exact `mb-toast mb-toast--{kind}` markup `WorkbenchToast` already renders).
  `workbench.tsx`: `Toast` type becomes `ToastState` (re-exported for back-compat
  imports), `WorkbenchToast` becomes a thin wrapper over the shared component, and the
  hook exposes `ok`/`warn`/`info` alongside the existing `err`/`setToast` (currently
  private closures — promote them, zero behavior change for existing callers).
  `areas.css`: add `.mb-toast--warn`/`.mb-toast--info` matching the existing
  `--ok`/`--err` palette.
- Files: `features/shared/Toast.tsx` (new + test), `features/areas/workbench.tsx`,
  `features/areas/areas.css`.
- Verify (HOST): `Toast` component test (renders null when empty, correct class per
  kind, onDismiss fires on click); `workbench.test.tsx` still passes unmodified (proves
  the `WorkbenchToast` wrapping is behavior-preserving).

### [x] 2. (CLAUDE) Migrate every hand-rolled local toast onto the shared component
- Do: `ScriptsPage.tsx`, `MapPage.tsx`, `EnginePage.tsx`, `AccessPage.tsx`,
  `SkillsPage.tsx`, `GroupsView.tsx`, `CodegenView.tsx` keep their own toast STATE
  (`useState<ToastState>`) but render via `<Toast toast={toast} onDismiss={...} />`
  instead of hand-rolled JSX. `WorldPage.tsx`'s bare `error` string stays as-is (no
  success case exists there — genuinely nothing to migrate).
- Files: the 7 files above.
- Verify (HOST): each page's existing test suite passes unmodified (rendering swap
  only, no behavior change) — the strongest evidence the migration didn't regress
  anything.

### [x] 3. (CLAUDE) Missing confirms + adopt DeleteBlockersPanel for Mobs/Objects
- Do: `ScriptsPage.tsx`'s `deleteScript` gets a `window.confirm` (mirrors
  Rooms/Mobs/Objects/Socials' existing "Delete X? ... persists until next copyover"
  wording — scripts have no live/copyover distinction, so word it plainly instead:
  "Delete this script?"). `MobPlacementAccordion.tsx`/`ObjectPlacementAccordion.tsx`'s
  "Remove this placement" gets a `window.confirm` ("Remove mob #N from this room? Its
  equipment/scripts placement-scoped data goes with it."/object equivalent).
  `MobsPage.tsx`/`ObjectsPage.tsx` refactored onto `useDeleteWithBlockers` +
  `DeleteBlockersPanel`, same as `RoomsPage.tsx`/`RoomDashboardEntry.tsx` — wire
  `onGoToResets`/`onGoToMap`/`onGoToMobs`/`onGoToScripts` through `App.tsx` for both
  (same prop shape, same lifts already exist).
- Files: `ScriptsPage.tsx`, `MobPlacementAccordion.tsx`, `ObjectPlacementAccordion.tsx`,
  `MobsPage.tsx`, `ObjectsPage.tsx`, `App.tsx`, and each file's `.test.tsx`.
- Verify (HOST): confirm-then-delete and cancel-leaves-it-present tests for the two new
  confirms; Mobs/Objects blocked-delete tests updated to assert the categorized panel
  (mirroring `RoomsPage.test.tsx`'s equivalent).

### [x] 4. (CLAUDE) Success toasts for every silent create/delete handler
- Do: add a `wb.ok(...)` call to every entity create/delete success path that doesn't
  already have one — Rooms/Mobs/Objects/Resets(add/remove reset row is too fine-grained,
  skip per Constraints — but "+ Place a mob/object here" and reset-block removal
  ARE entity-level, include those)/Scripts/Socials. Word each consistently: "added
  {kind} #{vnum}" / "removed {kind} #{vnum}".
- Files: `RoomsPage.tsx`, `RoomDashboardEntry.tsx`, `MobsPage.tsx`, `ObjectsPage.tsx`,
  `ScriptsPage.tsx`, `SocialsPage.tsx`, `MobPlacementAccordion.tsx`,
  `ObjectPlacementAccordion.tsx`, and their tests.
- Verify (HOST): one test per page asserting the success toast text after add/delete.

### [x] 5. (CLAUDE) Dirty-guard rollout + toolbar indicator
- Do: `RoomsPage.tsx`/`MobsPage.tsx`/`ObjectsPage.tsx`/`ResetsPage.tsx`/
  `SocialsPage.tsx` pass `onBeforeOpen={() => wb.confirmDiscard('switch areas')}` to
  their `<AreaSidebar>` (mirrors `AreasPage.tsx`, Part 1 — the prop already exists, this
  is pure adoption). `ScriptsPage.tsx` gets its own manual guard before its area-switch
  handler (it doesn't use `useAreaWorkbench`, so this is a plain `window.confirm` with
  its own dirty tracking — a simple `manualEdited`-style boolean is enough, not a full
  `isDirty` port). `useAreaWorkbench` gains a `beforeunload` effect: registers when
  `isDirty`, cleans up when not/on unmount (covers every hook consumer automatically).
  `WorkbenchToolbar` gets a small "● unsaved changes" indicator next to the filename,
  visible only when `wb.isDirty`.
- Files: `RoomsPage.tsx`, `MobsPage.tsx`, `ObjectsPage.tsx`, `ResetsPage.tsx`,
  `SocialsPage.tsx`, `ScriptsPage.tsx`, `features/areas/workbench.tsx`, and tests.
- Verify (HOST): `workbench.test.tsx` gains a `beforeunload` test (dirty → event
  preventable, clean → not registered); one adoption test per migrated page (dirty +
  attempted area-switch prompts, cancel keeps the edit).
- 2026-07-26 Step 5 done. `AreaSidebar`'s `onBeforeOpen={() => wb.confirmDiscard('switch
  areas')}` wired into every remaining consumer (Rooms/Mobs/Objects/Resets/Socials — all
  used the identical one-line snippet). `ScriptsPage.tsx` (the one page with no
  `useAreaWorkbench`) got its own small local `dirty` boolean (set by `setScripts`,
  cleared on successful `openArea`/`doSave`) plus a `switchArea()` wrapper using the same
  confirm wording as everywhere else — deliberately NOT a full port onto `isDirty`,
  since that would mean restructuring this page's whole hand-rolled state model for one
  guard, out of proportion with the rest of this sweep. `useAreaWorkbench` gained a
  `beforeunload` effect (registers only while `isDirty`, cleaned up on save/reload/
  unmount) — automatic for every hook consumer, no per-page wiring. `WorkbenchToolbar`
  gained a small "● unsaved changes" indicator next to the filename. Verified with new
  tests: `workbench.test.tsx` spies on `window.addEventListener`/`removeEventListener`
  to prove the guard is dirty-gated and actually calls `preventDefault`; `RoomsPage.test.tsx`
  and `ScriptsPage.test.tsx` each gained a 2-area fixture to exercise the real
  switch-while-dirty → confirm → cancel-keeps-you-here / accept-switches flow end to end.
  236/236 client tests green (was 232 at the start of this plan), `tsc --noEmit` clean.
  One process note: caught and fixed a genuine `.annotated` authoring mistake of my own
  mid-step — created a second `/ScriptsPage.test.tsx` heading instead of appending to
  the existing one (the file-index format requires exact, unique `/Filename.ext`
  headings) — swept every touched `.annotated` file for duplicate headings afterward
  and found no others.
- 2026-07-26 Step 6 done. Grepped every `err(`/`.err(`/`setToast({kind:'err', ...})` call
  site across the client. The `useAreaWorkbench`-backed tabs (Areas/Rooms/Mobs/Objects/
  Resets/Socials) and Scripts/Map were already consistently prefixed ("save failed: ",
  "preview failed: ", etc. — confirms the plan's own prediction that most messages were
  already written with care). The genuine gaps were concentrated in the non-workbench
  pages (Engine/Access/Skills family): several catch blocks surfaced the raw exception
  `.message` with ZERO action context, most notably a real inconsistency in
  `AccessPage.tsx`'s shared `run(what, action)` helper — its success toast already said
  `${what} — done` but its failure branch just dumped the bare error with no mention of
  `what` at all. Fixed every bare one found (11 call sites across AccessPage/EnginePage/
  SkillsPage/GroupsView/CodegenView) with an action-context prefix matching the
  established "X failed: <message>" convention; left `WorldPage.tsx`'s one bare catch
  alone (its page has exactly one possible failure — loading the dashboard — so the
  context is already obvious from where the message renders; adding a prefix there would
  be padding, not clarity, per the plan's own "fix only genuinely bad ones" scoping).
  236/236 client tests green throughout, `tsc --noEmit` clean — no test asserted the old
  bare text, confirming these were genuinely uncovered gaps rather than a risky change.
- 2026-07-26 Step 7 done — plan COMPLETE. `merc-area` suite unchanged (135/135, confirms
  this whole plan was pure client-composition work, same as Part 1 — no data-layer
  touched). `vite build` clean. Added a new `docs/mud-builder/README.md` section ("UX
  conventions: toasts, confirmations, and unsaved changes") summarizing the 4-state
  toast, the confirm-vs-don't-confirm line, the categorized blocked-delete panel, and
  the unsaved-changes indicator/guards — written for a builder reading the doc, not a
  developer, matching the doc's existing voice. `.annotated` refreshed incrementally
  throughout all 7 steps (not batched at the end) across every touched directory:
  `features/shared` (new), `features/areas`, `features/rooms`, `features/mobs`,
  `features/objects`, `features/resets`, `features/socials`, `features/scripts`,
  `features/map`, `features/engine`, `features/auth`, `features/skills`, and the
  top-level `src/.annotated`. Redeployed the same way as Part 1 — confirmed via
  `docker ps` that this session's host IS the deploy host, rebuilt+recreated only
  `mud-builder-server`/`mud-builder-client` (`docker compose build` +
  `up -d --no-deps`, `merc-mud2.4` never touched), verified healthy container status,
  clean startup logs, and end-to-end routing through the edge nginx
  (`build.shatteredarchive.dev` → `/api/capabilities` responding correctly with
  `rebuildEnabled: true`). Final state across both Part 1 and Part 2 of this two-part
  request: mud-builder-client 236/236 (was 185 before either part started), merc-area
  135/135 unchanged throughout, clean typecheck and build, live and deployed.

### [x] 6. (CLAUDE) Light error-message audit
- Do: read every `wb.err(...)`/local `err(...)`/catch-block message across all tabs;
  fix ones that are raw/technical rather than actionable (e.g. a bare stack-trace
  fragment, a server error code with no explanation). This is a judgment pass, not a
  mechanical one — most messages were already written with care (the 401 guard message
  from `client.ts`'s `request()` is a good example of the existing bar). Fix only
  genuinely bad ones; don't rewrite working prose for its own sake.
- Files: wherever a genuine issue is found (expect a handful, not a rewrite of
  everything).
- Verify (HOST): spot-check the fixed messages read clearly in context; no test churn
  expected beyond whatever assertions reference the old text.

### [x] 7. (CLAUDE) Full regression + docs + `.annotated` + close-out
- Do: `pnpm --filter @shatteredarchive/mud-builder-client test`, `tsc --noEmit`,
  `vite build`; update `docs/mud-builder/README.md` with a short note on the shared
  toast/confirm/dirty-guard conventions; refresh `.annotated` for every touched
  directory; mark this plan COMPLETE with a full progress-log entry; update
  `mud-builder-project.md`/`MEMORY.md`; redeploy `mud-builder-server`+
  `mud-builder-client` the same way Part 1 was deployed (`docker compose build` +
  `up -d --no-deps`, without touching the live game engine).
- Verify (HOST): all green; manual smoke — trigger a blocked Mobs delete and confirm
  the categorized panel + Map "go fix it" works identically to Rooms'; edit a field,
  try to switch areas on a tab that previously had no guard, confirm the prompt fires.

## Progress log
- 2026-07-26 plan drafted immediately after Part 1 reached COMPLETE and was deployed
  live (verified via `docker ps`/container health/edge-nginx routing check — the host
  running this session IS the deploy host, `build.shatteredarchive.dev`'s containers
  run locally via `deploy/docker-compose.shattered-archive-experimental.yml`, project
  name `shatteredarchive`). Re-verified every fact from the original plan-mode audit
  against current (post Part 1) source before writing steps — one correction found:
  Socials cannot adopt `DeleteBlockersPanel` at all (no `RefKind` for socials), so
  that item was dropped from scope with the reason documented in Constraints rather
  than silently carried over from the original sketch.
- 2026-07-26 Steps 1-3 done. Step 1: new `features/shared/Toast.tsx` (4 kinds now,
  `ok`/`err`/`warn`/`info`), `workbench.tsx`'s `WorkbenchToast` reduced to a thin
  wrapper, `ok`/`warn`/`info` promoted onto the returned `AreaWorkbench` (previously
  private closures — only `err`/`setToast` were reachable from outside). Step 2: all 7
  remaining hand-rolled local toasts (Scripts/Map/Engine/Access/SkillsPage/GroupsView/
  CodegenView) migrated onto the shared component; every migrated page's existing test
  suite passed UNMODIFIED, the strongest evidence the swap was behavior-preserving.
  Found and incidentally fixed a real small bug along the way: the three Skills-family
  files' hand-rolled toast never applied the `--ok` class at all (only `--err`), so a
  success toast rendered with no color styling — now correctly green like everywhere
  else. Step 3: added the two identified missing confirms (`ScriptsPage.deleteScript` —
  scripts have no reference-checking so an unblocked confirm is the whole gate;
  `MobPlacementAccordion`/`ObjectPlacementAccordion`'s "Remove this placement," which
  deliberately does NOT extend to the fine-grained rider/content-row ✕ buttons inside
  it, per the plan's own stated reasoning) and refactored `MobsPage.tsx`/
  `ObjectsPage.tsx` onto `useDeleteWithBlockers`/`DeleteBlockersPanel`. A real design
  question came up doing this: unlike Rooms (where `onGoToResets(vnum)`/
  `onGoToMap(vnum,file)` carry a room vnum that directly matches an existing filter
  target), a blocked MOB or OBJECT delete has no equivalent vnum-scoped hand-off
  anywhere to reuse — so `MobsPage`/`ObjectsPage`'s new nav props are plain parameterless
  tab switches, and each page only accepts the subset of categories that's
  *structurally reachable* for its own entity kind (traced through `collectRefs`,
  `services/merc-area/src/validate.ts`, rather than guessed): Mobs gets
  `onGoToResets`/`onGoToScripts` only (a mob can never be `map`-referenced, and
  `onGoToMobs` linking Mobs to itself is meaningless — the blocker text already names
  the other mob); Objects gets `onGoToResets`/`onGoToMap` only (an object CAN be
  `map`-referenced — via a room exit's key field, not the exit itself — but never
  `mobs`/`scripts`, since nothing in `collectRefs` produces those categories for an
  object). Discovered both `MobsPage`/`ObjectsPage` had ZERO page-level tests before
  this step (only their sub-editor components — `MobEditor`/`ObjectEditor` — had
  tests, plus a partial `describe('MobsPage', ...)` block inside `MobEditor.test.tsx`
  covering the unblocked-delete path only); added dedicated `MobsPage.test.tsx`/
  `ObjectsPage.test.tsx` covering the new blocked-delete panel + Go-fix-it wiring
  specifically. One raw `.are` test-fixture bug hit and fixed fast: an object typed
  `key` with an invalid value-line shape threw a parse error — sidestepped by reusing
  the already-proven `weapon` value shape for the test object instead of chasing the
  real `key` format (the test only needs a valid vnum referenced as a door key, not a
  semantically accurate key item). 232/232 client tests green (was 213 at Part 1's
  close), `tsc --noEmit` clean throughout.
