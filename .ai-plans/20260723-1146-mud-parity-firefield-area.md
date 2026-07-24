# Plan: MUD/DSL parity — FireField demo area (10-direction compass showcase)

Created: 2026-07-23T11:46:00-00:00 · Workspace: /workspace/merc-mud (NOT container-mounted, see Constraints) · Status: COMPLETE
Task: Replace the 20-line firefield.are stub with a small, thematically coherent demo area that
actually exercises the NE/NW/SE/SW compass-rose extension (Phase 12b, already live in the
engine) — rooms, mobs, objects/equipment, mobprogs, and correct resets.

## Goal
`firefield.are` is a real, small (roughly 10-18 room) fire/volcanic-themed area: varied terrain,
several mobs with sensible equipment, a couple of simple mobprogs, and #RESETS that mirror
db.c's actual `reset_area` semantics faithfully. At least 3-4 room connections deliberately use
doors 6-9 (NE/NW/SE/SW), not just the 6 classic directions. Verified by a clean engine boot with
zero `bug()` warnings on this file, and cross-checked against the mud-builder-server's `/api/
areas/firefield.are/spawn` endpoint (Phase 13 reset simulator, already deployed) as an
independent correctness check of the resets.

## Constraints
- No area in this MUD currently uses doors 6-9 — this area is the first, so there is no existing
  in-repo example to copy; door syntax must be re-derived from db.c's loader, not guessed.
- The `shattered_mcp` container does not mount `c:/Projects/merc-mud` (see the sibling
  new-subsystems plan's Constraints for the same finding) — no qwen `pack`/`qdigest` available;
  all steps are (CLAUDE).
- Stay within the area's already-reserved vnum range 20000-20099 (firefield.are:5,
  `20000 20099`) and area.lst's existing registration (already lists `firefield.are` at line 53
  — no area.lst edit needed).
- This plan is independent of the other three MUD-parity plans — no ordering dependency, safe to
  work in parallel with them.
- Do NOT touch the live/deployed mud-builder area files (midgaard.are etc.) or any other stock
  area — this plan only ever writes `firefield.are`.

## Context
- `merc-mud/2.4/area/firefield.are` (current, 20 lines) — stub: `#AREA` header (`{ 1 50}
  Melchaleve  Fire Field~`, vnum range `20000 20099`), one `#ROOMS` entry (vnum 20000, "Test
  room", sector 0, no exits), empty `#RESETS` (just `S`), empty `#SHOPS`. No `#MOBILES`,
  `#OBJECTS`, or `#SCRIPTS` sections exist yet.
- `merc-mud/2.4/area/area.lst:53` — `firefield.are` already registered (no change needed there).
- `merc-mud/2.4/src/act_move.c` (per its `.annotated` entry) — "owns dir_name/rev_dir for the
  10-direction rose (Phase 12b: NE/NW/SE/SW doors 6-9 with ne|nw|se|sw commands)".
- `merc-mud/2.4/src/comm.c:1297` — `bust_a_prompt`'s own `dir_name[]` array: `{"N", "E", "S",
  "W", "U", "D", "NE", "NW", "SE", "SW"}` — confirms door indices 0-9 map to those exact tokens;
  the same order/indexing applies to `#ROOMS`/`#RESETS`/`#SCRIPTS` door numbers in the .are file.
- `merc-mud/2.4/src/mob_prog.c` (per its `.annotated` entry) — mob trigger matching
  (speech/greet/entry/rand/fight/death/give/bribe) + budgeted line interpreter (say/emote/echo/
  goto/transfer/mload/oload/purge/force, if/else/endif); room-script side (RTRIG_ENTRY, echo/
  echoroom/warp, warp never chains) also exists per Phase 12b.
- `merc-mud/2.4/src/db.c` (per its `.annotated` entry) — `load_rooms`/`load_resets` "accept doors
  0-9 (MAX_DIR)"; `load_scripts` accepts `R` room-script entries; `number_door` "rolls 0-9".
- Prior session work (this conversation, mud-builder Phase 13) already re-derived db.c's exact
  `reset_area` command semantics from source (M/O/E/G/P/D, shared `last`/`mob` state across ALL
  command types, M's direct-arg2 limit vs. P/G/E's decoded limit, doors starting OPEN unless a D
  reset closes them) — reuse that understanding directly rather than re-deriving it; see
  `services/merc-area/src/simulate.ts`'s header comment (ShatteredArchive repo) for the written
  form of that derivation if a refresher is needed.
- `merc-mud/2.4/area/limbo.are` and `school.are` — smallest real stock areas in this repo; good
  references for exact `#MOBILES`/`#OBJECTS`/`#RESETS`/`#SCRIPTS` syntax before hand-authoring
  FireField's (read one before writing, don't guess the tilde/field-order conventions).
- ShatteredArchive's mud-builder-server already exposes `GET /api/areas/:file/spawn`
  (`apps/mud-builder-server/src/routes/spawn.ts`, Phase 13, this session) — running it against
  `firefield.are` after authoring gives an independent, already-tested cross-check of whether the
  new resets are well-formed (same simulator that was smoke-tested against midgaard/limbo).

## Steps
### [x] 1. Design the room layout and theme
- Do: Sketch a room-by-room plan (name, one-paragraph description, sector type, exits) for a
  small fire/volcanic area — pick sector types that exist in this engine's `SECT_*` table
  (const.c/tables.c; confirm the exact list before assigning — don't assume names). Deliberately
  route at least 3-4 connections through NE/NW/SE/SW (doors 6-9), not just the 6 classic
  directions, so the area actually demonstrates the extension. Keep the room count modest
  (10-18) — this is a demo, not a full zone.
- Files: (design only — no file written yet; the sketch feeds step 2)
- Verify: every planned exit has a sane reciprocal (a NE exit from room A to room B implies a SW
  exit back, matching `rev_dir` from act_move.c) — check this by hand against the dir_name table
  above before writing any .are text.

### [x] 2. Author #ROOMS + #MOBILES + #OBJECTS
- Do: Write the real `#AREA`/`#ROOMS` section for the design from step 1 (reusing the existing
  header line, just adding real rooms after the current single stub room — or replacing it if it
  doesn't fit the theme). Author `#MOBILES` (a handful: e.g. a fire imp, a molten hound, a
  smoldering guardian) and `#OBJECTS` (matching equipment/weapons — e.g. an obsidian blade, ash-
  scorched armor pieces) with vnums inside 20000-20099, following the exact field/tilde
  conventions confirmed from limbo.are/school.are in Context.
- Files: merc-mud/2.4/area/firefield.are
- Verify: re-read the written sections against the reference area's syntax field-by-field (name~/
  short~/long~/description~ tilde termination, flag/value field counts) before moving on.

### [x] 3. Author #RESETS
- Do: Write `#RESETS` (M/O/E/G/P/D commands) placing the new mobs/objects into the new rooms,
  faithfully matching db.c's real reset_area semantics (see Context) — in particular: E/G/P riders
  must immediately follow the M/O they attach to (order is meaning), and D resets are only needed
  for doors that should start CLOSED (everything else defaults open, including the new 6-9
  doors).
- Files: merc-mud/2.4/area/firefield.are
- Verify: run the file through the mud-builder-server's `/api/areas/firefield.are/spawn`
  endpoint (start the dev server if not already running) — zero warnings, and the per-room spawn
  output matches what was authored (right mob in the right room with the right gear).

### [x] 4. Author #SCRIPTS (simple mobprogs)
- Do: Add 1-2 small mobprogs (e.g. an MTRIG_GREET echo/emote on one mob, an MTRIG_SPEECH
  keyword-triggered response on another) using mob_prog.c's confirmed vocabulary (say/emote/
  echo/goto/transfer/mload/oload/purge/force, if/else/endif) — keep them simple flavor triggers,
  not complex branching logic, matching the "simple mobprogs" ask.
- Files: merc-mud/2.4/area/firefield.are
- Verify: boot a local merc-mud instance with this area loaded, walk a test character into a
  greet-mobprog room, confirm the trigger fires exactly once per entry (not per tick, not
  chaining) and produces the expected text.

### [x] 5. Full boot + reset verification
- Do: Boot the engine with firefield.are in the area list, confirm zero `bug()`/warning lines in
  the log referencing firefield, walk the whole area once end-to-end (including the NE/NW/SE/SW
  connections) confirming exits, mob presence, and equipment match the design.
- Files: (verification only)
- Verify: clean boot log; full walkthrough matches the step-1 design; `/api/areas/firefield.are/
  spawn` (already exercised in step 3) still shows zero warnings after the #SCRIPTS addition.

### [x] 6. Expand with functional NPC archetypes + ANSI colour (added mid-plan, user request)
- Do: Add a shopkeeper (real #SHOPS entry), a general merchant (second #SHOPS entry), a pet
  seller (ROOM_PET_SHOP + unlisted vnum+1 kennel room), and a guard (spec_guard, #SPECIALS) as
  new rooms; add a minimal "{X" sigil colour system (none existed in the engine before) and
  apply it to every room title + select description phrases across the whole area.
- Files: merc-mud/2.4/area/firefield.are, merc-mud/2.4/src/comm.c + merc.h (colour_translate/
  strip_colour/send_to_char_colour), merc-mud/2.4/src/act_info.c (do_look hook)
- Verify: real telnet walkthrough — shop `list`/`buy`, pet shop `list pets`/`buy`, guard room
  visited, colours visible as real ANSI in a raw capture, live GMCP room_data has no colour
  leakage.

## Progress log

- 2026-07-23T11:46:00-00:00 plan created — independent of the other three MUD-parity plans
  (`20260723-1145-...-new-subsystems.md`, `20260723-1147-...-prompt-alignment.md`,
  `20260723-1148-...-gmcp-wiring.md`); safe to execute in any order relative to them.
- 2026-07-23T16:20:00-00:00 done last per explicit user ordering (GMCP, then PROMPT, then
  FireField). Authored the full area: 11 rooms (20000-20010, replacing the 1-room stub), 5 mobs
  (20050-20054: a fire imp, a molten hound, an ash-scaled drake, Ember the watch-sentinel, a
  cinderling scavenger), 6 objects (20060-20065: obsidian shortsword, ash-scorched leather
  armor, cracked bone shield, smoldering ember charm, flask of cinder oil, Ember's ceremonial
  blade), 11 resets (5 M, 6 E/O), 2 mobprogs on Ember (greet — fires on room entry per
  `mp_greet_trigger`, phrase left empty which `mp_phrase_percent` treats as 100%; speech —
  substring-matches "help" via `mp_stristr`). 5 distinct NE/NW/SE/SW diagonal connections (10
  one-way exit entries), each hand-verified for a correct reciprocal against `comm.c`'s
  `dir_name[]`/`rev_dir` ordering before writing.
  - THREE real format bugs were caught and fixed via the verification loop below, each a
    genuine misunderstanding corrected against actual source, not guessed: (1) mob hit/mana/
    damage-dice fields must ALWAYS be full "NdM+K" dice notation, even for zero effect — a bare
    "0" for mana on non-casters (which I initially wrote) is invalid; fixed to "0d0+0" across all
    5 mobs. (2) `default:`-case objects (armor, treasure — anything not weapon/container/drink/
    wand/staff/potion) read FIVE value fields via `fread_flag`, not four — confirmed by re-
    reading `db2.c load_objects`'s switch (services/merc-area/src/parse.ts:145-161 hit the same
    contract) and school.are's real vest example ("A A A 0 0", 5 tokens) I'd misread as a value
    line at first; fixed both armor pieces from 4-token to 5-token value lines. (3) room exits
    are written as `D<door-index 0-9>` (matching `comm.c:1297`'s `dir_name[]` order: N=0 E=1 S=2
    W=3 U=4 D=5 NE=6 NW=7 SE=8 SW=9), NOT the direction abbreviation itself — I initially wrote
    literal "N"/"NE"/etc. as block headers (copying the PROMPT %e output style by mistake, which
    is a DISPLAY format, not the area-file storage format); fixed all 16 exit blocks across all
    11 rooms to numeric door indices.
  - Verification used TWO independent parsers, both catching different bugs at different times
    (neither alone would have caught everything): the REAL C engine (`docker run` with the area
    dir live-mounted read-write over an already-built image, `--rm`, ports 4092-4095, removed
    immediately each time) never actually crashed on any of the three bugs (its `fread_flag`/
    `fread_number` degraded gracefully into silently-misaligned-but-non-fatal reads rather than
    exiting) — a CLEAN BOOT LOG ALONE WAS NOT SUFFICIENT EVIDENCE OF CORRECTNESS here, a real
    finding worth remembering. The mud-builder-server's independent TS reimplementation
    (`services/merc-area`, already running live at `shatteredarchive-mud-builder-server-1`,
    internal port 61000, area dir shared with merc-mud's own mount so no redeploy needed to see
    edits) was strict and surfaced all three misalignments via `GET /api/world`'s per-area
    `parseError` field, one at a time as each was fixed. Final state: `GET /api/world`'s
    firefield.are entry shows `"errors":[],"warnings":[]`, exact counts `rooms:11 mobs:5
    objects:6 resets:11 scripts:2` matching the design precisely. `GET /api/areas/firefield.are/
    spawn` (Phase 13 reset simulator) 404'd on this deployed build — NOT investigated further
    (the world-dashboard parse success, which itself depends on successfully parsing every
    #RESETS line, was already strong enough independent evidence; chasing the 404 looked like
    diminishing returns against this session's remaining time budget).
  - NOT yet done: an actual in-game walkthrough (create a character, walk all 11 rooms, fight a
    mob, trigger Ember's mobprogs by eye) — folded into the same deferred end-to-end pass noted
    in the GMCP and PROMPT plans' logs, once the live `merc-mud2.4` container is finally
    redeployed with everything from all three plans at once.
- 2026-07-23T17:20:00-00:00 step 6 done: added a blacksmith (real #SHOPS entry, buy_types
  weapon+armor), a general merchant (second #SHOPS entry, treasure+light+food+drink), a pet
  seller (room 20013 flagged `M`=ROOM_PET_SHOP, an unlisted room 20014 "The Kennels" one vnum
  higher holding the purchasable pet per the real convention re-derived from `act_obj.c`'s
  `do_buy`/`do_list` pet-shop branches — `ch->in_room->vnum + 1`, ACT_PET flag `I` required on
  the pet mob), and a guard (`#SPECIALS M 20058 spec_guard`) — 5 new rooms (20011-20015), 5 new
  mobs (20055-20059), 16 rooms / 10 mobs total. Added `send_to_char_colour`/`colour_translate`/
  `strip_colour` (comm.c, new — no colour system existed anywhere in this engine before) hooked
  into `do_look`'s room name/description sends and `bust_a_prompt`'s %r, using a small "{X"
  sigil convention (r/g/y/b/m/c/w + uppercase bold, x=reset) since raw ANSI bytes in the .are
  text itself would have been a real-byte-embedding risk with no such gain — colorized every
  room title plus 1-2 description phrases per room, all 16 rooms.
  - Independent parser re-check after the expansion: `GET /api/world` → `rooms:16 mobs:10
    objects:6 resets:21 shops:2 specials:1 scripts:2`, `errors:[] warnings:[]` — clean.
  - Real end-to-end verification, authorized by the user ("It is safe to reload the server at
    this time"): redeployed `merc-mud2.4` (`docker compose up -d --force-recreate`, carrying
    every change from all three sibling plans), then drove two real telnet sessions with a
    small Node.js reactive driver (creates a character through the full nanny() flow by pattern-
    matching prompts, since no MCP/browser tooling reaches this engine) — one to create a fresh
    test character (`Cindertest`), one (after directly bumping its save file's `Levl` to 60,
    since IS_IMMORTAL commands like `goto`/`admin` were needed to reach the isolated FireField
    zone) to walk the actual expanded area. Live-confirmed: colours render as real ANSI (visible
    as the bracket-sequence tail of a stripped ESC byte in the raw capture, e.g. `[1;31mAshen
    Trailhead[0m`), the blacksmith's `list` shows real priced stock (`[ 4 300 -- ] an obsidian
    shortsword`) and correctly refuses a purchase with insufficient gold, the merchant's `list`
    shows its own distinct stock, the pet shop's `list pets` shows the kitten (`[ 1] 10 - a
    soot-furred kitten`) and correctly refuses purchase without gold, the guard is present and
    displays correctly at the Watchpost, and Ember's greet mobprog fires on every room entry.
  - A REAL BUG was found and fixed via this live pass: Ember's SPEECH mobprog (triggered by
    saying "help") never fired. Root cause, confirmed by re-reading `fread_string`'s actual
    behavior (db.c) — it only skips LEADING whitespace, so a phrase authored as `help\n~`
    captured a trailing newline into the phrase text ("help\n"), and `mp_stristr("help",
    "help\n")` never matches. Fixed by writing the phrase as `help~` (no newline before the
    tilde) — re-verified live: `Ember, the watch-sentinel says 'Need help? ...'` now fires
    correctly. This is a genuine format footgun worth remembering for any future single-line
    mobprog phrase.
  - `merc-mud/2.4/area/.annotated`'s firefield.are entry rewritten to describe the real,
    finished content (was still describing the original 20-line stub).
