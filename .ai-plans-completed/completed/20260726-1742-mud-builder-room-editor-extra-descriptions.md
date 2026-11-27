# Plan: MUD Builder — RoomEditor gains extra descriptions + exit look-text

Created: 2026-07-26T17:42:00Z · Workspace: /workspace/shattered-archive · Status: COMPLETE

## Goal
RoomEditor is the only entity form in the builder missing UI for fields its own type
already carries: `Room.extraDescrs` (the `E` blocks — "look sign", "look fountain", etc.)
and `RoomExit.description` (the "You see an open door leading south." look-text shown by
the engine's `look <dir>` and autoexits). Both are already fully read/written by
merc-area's parser and emitter — this is a UI-only gap, not a data-model gap. Done when a
builder can add/edit/remove room extra descriptions and set an exit's look-text through
the form, the existing round-trip/emit guarantees stay intact (no test regressions), and
the README's Scope section's "everything a .are file holds is now authorable" claim is
actually true for rooms.

## Why (context)
User asked (2026-07-26) to write a plan for "the room editor" after establishing no
active/abandoned plan already covered it. Investigated before drafting (see Context)
rather than guessing: `RoomEditor.tsx` has no TODO/FIXME anywhere and no plan across
phases 1/4/12b/13/14a/14b ever flagged this as deferred — it's an unflagged gap, not a
tracked one. The sibling `ObjectEditor.tsx` already has the equivalent extra-descriptions
UI (add/edit/remove keyword+text pairs), making RoomEditor the visibly inconsistent one.
`docs/mud-builder/README.md`'s Scope section currently overclaims ("Everything a `.are`
file holds is now authorable in the UI") — closing this gap makes that sentence accurate
instead of needing a caveat.

## Constraints
- **Data-model layer needs NO changes.** `parse.ts`/`emit.ts` already round-trip both
  fields (`Room.extraDescrs` via `E` blocks, `RoomExit.description` via `D` blocks' first
  string) — confirmed by reading both directly, not assumed. `roundtrip.test.ts`'s
  full-corpus sweep already exercises any stock room that uses either field; it must stay
  green untouched.
- **Reuse `ObjectEditor.tsx`'s extra-descriptions pattern exactly** (add/keyword+text
  textarea/remove, `mb-fieldset`/`mb-extra-descr`/`mb-row--stretch`/`mb-row-actions`
  classes) rather than inventing new markup or CSS — those classes already live in
  `areas.css` (the same stylesheet RoomEditor's feature directory uses), so this needs
  zero new CSS.
- **Exit look-text needs its own UI decision, not a copy-paste.** The exit row today is a
  single dense line (door select, target vnum, lock-state select, keyword input, key
  vnum input, remove button) — a full textarea can't just be appended inline without
  breaking that layout. Pick a layout that keeps the dense row scannable for exits that
  don't need a custom look-text (the common case: most exits have generic/no look-text)
  — e.g. a second line under each exit row, or a collapsed `<details>` per exit. Aria
  labels must follow the existing per-exit numbering convention (`Exit ${i} ...`) so
  `RoomEditor.test.tsx`'s existing queries (`screen.getByLabelText('Exit 0 target vnum')`
  style) stay valid.
- **Empty `extraDescrs`/blank exit `description` must stay silently absent from emitted
  text** — `emit.ts` already only emits an `E` block per array entry and always writes
  `ex.description` as a (possibly empty) tilde string on `D` blocks (matching stock file
  shape); don't add any new "omit if empty" branching that would diverge from what's
  already proven byte-identical against the stock corpus.
- pnpm quirk: no `--` before positional args when filtering jest by file name.

## Context
(file:line refs verified 2026-07-26 against current source)
- `apps/mud-builder-client/src/features/areas/RoomEditor.tsx` (166 lines) — the whole
  form: name/description (41-54), sector/heal/mana (56-89), room-flags fieldset (91-105),
  exits fieldset (107-163) with `setExit`/`addExit`/`removeExit` helpers (16-28).
  `addExit` (21-26) already defaults new exits to `description: ''` — the field exists on
  every exit object today, just never rendered or editable.
- `services/merc-area/src/types.ts:19-22` `ExtraDescr {keyword, description}`;
  `types.ts:220-229` `RoomExit` (`description` at line 223); `types.ts:231-...` `Room`
  (`extraDescrs` field, confirmed present).
- Parser: `services/merc-area/src/parse.ts:281-291` (`D` exit block — `description` read
  at line 286, right after `door`) and `parse.ts:292-293` (`E` block →
  `room.extraDescrs.push({keyword, description})`).
- Emitter: `services/merc-area/src/emit.ts:229-252` `emitRoom` — exit `D` blocks emit
  `ex.description` at line 237 (right after the `D${ex.door}` line); `extraDescrs` loop at
  241-245 emits one `E\n` + keyword + text per entry.
- UI pattern to mirror exactly: `apps/mud-builder-client/src/features/objects/ObjectEditor.tsx:65-69`
  (`setExtraDescr` helper) and `:131-170` (the fieldset: legend with a live count, one
  `mb-extra-descr` block per entry with a keyword input + Remove button on one row and a
  description textarea below, an "+ Add extra description" button at the end). CSS
  classes (`mb-fieldset`, `mb-extra-descr`, `mb-row--stretch`, `mb-row-actions`) are
  defined in `apps/mud-builder-client/src/features/areas/areas.css` — already RoomEditor's
  own feature stylesheet, so no new CSS file/import needed.
- Existing test fixture/conventions: `apps/mud-builder-client/src/features/areas/RoomEditor.test.tsx:7-16`
  (`ROOM` fixture, already has `extraDescrs: []` and one exit with `description: ''`) and
  `:36-55` (the `onChange` round-trip assertion style — `fireEvent.change` +
  `expect(onChange).toHaveBeenCalledWith(expect.objectContaining({...}))`).
- Doc claim to correct/confirm: `docs/mud-builder/README.md:981-984` ("Everything a `.are`
  file holds is now authorable in the UI: the #AREA header, rooms, mobs, objects,
  resets, shops, specials, socials, and mob scripts...") — currently overclaims for
  rooms; becomes true once this ships.
- `.annotated` entry to refresh: `apps/mud-builder-client/src/features/areas/.annotated`
  (RoomEditor.tsx's purpose line currently omits extra descriptions and exit look-text).

## Steps

### [x] 1. (CLAUDE) RoomEditor: extra descriptions fieldset + exit look-text field
- Do: add a `setExtraDescr`/add/remove trio mirroring `ObjectEditor.tsx:65-69,131-170`
  exactly (same classes, same interaction shape) as a new fieldset in `RoomEditor.tsx`,
  placed after the room-flags fieldset and before the exits fieldset (extra descriptions
  are a room-level concept, same conceptual tier as flags; exits stay last since they're
  the most complex block). Add exit look-text: extend each exit row with a description
  input, using whichever layout keeps the dense single-line exit row scannable (per
  Constraints — a second line under the row is the simplest option, matching how
  `ObjectEditor`'s own extra-descr block already places its textarea on its own line
  below the keyword row). aria-label the new exit field `Exit ${i} description` to match
  the existing `Exit ${i} ...` numbering convention.
- Files: `apps/mud-builder-client/src/features/areas/RoomEditor.tsx`,
  `RoomEditor.test.tsx` (+cases: add/edit/remove an extra description round-trips through
  onChange; editing an exit's description round-trips through onChange; an empty
  extraDescrs/blank exit description renders with no crash — mirror the existing
  `ROOM`/`sixDoorRoom` fixtures rather than inventing new ones where they still fit)
- Verify (HOST): `pnpm --filter @shatteredarchive/mud-builder-client test RoomEditor`
  green; `npx tsc --noEmit` clean in the client package.

### [x] 2. (CLAUDE) Full-suite regression check + docs + close-out
- Do: confirm `services/merc-area`'s `roundtrip.test.ts` and `emit`/`parse` test suites
  are untouched and still green (this step should need zero merc-area changes — if it
  doesn't, stop and reconsider, since Constraints says the data layer is already
  complete). Run the full client suite (not just RoomEditor's) to catch any incidental
  regression. Update `docs/mud-builder/README.md`'s Scope section (line ~981) if its
  wording needs adjusting now that the claim is actually true (it may need no change at
  all — check the exact sentence before editing). Refresh
  `apps/mud-builder-client/src/features/areas/.annotated`'s RoomEditor.tsx entry to
  mention extra descriptions + exit look-text. Mark this plan COMPLETE.
- Files: `docs/mud-builder/README.md`, `apps/mud-builder-client/src/features/areas/.annotated`
- Verify (HOST): `pnpm --filter @shatteredarchive/merc-area test` and
  `pnpm --filter @shatteredarchive/mud-builder-client test` both fully green (exact
  counts logged here); `pnpm --filter @shatteredarchive/mud-builder-client build` clean.

## Progress log
- 2026-07-26T17:42 plan drafted (Claude Sonnet 5). User asked for a room-editor plan
  after confirming no active/abandoned plan already covered it; an Explore agent
  investigated RoomEditor.tsx, ObjectEditor.tsx, types.ts, parse.ts/emit.ts, the README's
  Scope section, and every prior mud-builder plan for an existing but un-actioned
  RoomEditor TODO before drafting anything — found none, and found the concrete
  extraDescrs/exit-description gap instead. Presented that finding to the user via
  AskUserQuestion rather than assuming it was the intended scope; confirmed. All
  file:line citations above independently re-verified via direct Grep/Read (not trusted
  from the investigation agent's report alone) before being written into this plan.
- 2026-07-26 (same session) both steps executed immediately after the user said
  "Implement the plan." Step 1: added `setExtraDescr`/`addExtraDescr`/`removeExtraDescr`
  to `RoomEditor.tsx` and a new "Extra descriptions" fieldset mirroring
  `ObjectEditor.tsx`'s pattern exactly, placed between the room-flags and exits
  fieldsets; each exit row gained a second-line `<textarea rows={2}>` for
  `RoomExit.description` (a sample of midgaard.are's real `D` blocks confirmed exit
  look-text is short but the tilde-string format allows multi-line, so a textarea was
  chosen over a single-line input, consistent with how the codebase already treats every
  other "description"-shaped field). New `.mb-exit-block`/`.mb-exit-description` CSS
  added to `areas.css`; `.mb-fieldset`/`.mb-extra-descr` reused as-is, zero new classes
  needed there. Two new tests added to `RoomEditor.test.tsx` (add/edit/remove round trip;
  exit look-text edits independently of other exit fields) — client suite 170/170 (was
  168), `tsc --noEmit` clean. Step 2: confirmed as predicted — `merc-area`'s suite needed
  zero changes and stayed 135/135, proving the data layer really was already complete;
  full client suite 170/170; client build clean. Checked the README's Scope section
  (line 981) and the whole file for any prior "extra descriptions not yet supported"
  caveat — found none (it was genuinely an unflagged gap, not a documented one), so no
  README wording change was needed; the existing "everything is authorable" claim is now
  simply true instead of slightly aspirational. Refreshed `.annotated` for both
  `RoomEditor.tsx` and `RoomEditor.test.tsx`. Plan COMPLETE.
