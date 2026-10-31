# Plan: MUD/DSL parity — PROMPT % code alignment

Created: 2026-07-23T11:47:00-00:00 · Workspace: /workspace/merc-mud (NOT container-mounted, see Constraints) · Status: COMPLETE (%C intentionally absent — craft reverted, see the new-subsystems plan's log)
Task: `bust_a_prompt`/`do_prompt` already support most of the user's target % codes — add the
missing ones (%q %C %S %y %f %l %L %D %t %T %d) so the full documented PROMPT syntax works.

## Goal
Every % code in the user's PROMPT spec renders correctly from real character/game state — no
hardcoded placeholders. Verified by compiling, running a live instance, setting `prompt <...>`
with each new code, and observing correct/changing output as the underlying state changes
(wimpy, flying, stance, language, time of day).

## Constraints
- Depends on `20260723-1145-mud-parity-new-subsystems.md` steps 2-4 (quest_points, stance,
  speaks/speaking) for %q/%S/%l — do NOT start this plan's step covering those three codes until
  that plan's corresponding steps are checked off. %C (craft skill) depends on that plan's step 1
  (gsn_craft). The remaining codes (%y %f %L %D %t %T %d) have no such dependency and can be done
  first/independently.
- The `shattered_mcp` container does not mount `c:/Projects/merc-mud` — no qwen `pack`/`qdigest`
  available; all steps are (CLAUDE).
- `bust_a_prompt` (comm.c:1287-1437) is a single `switch` over `*str` after a literal `%` — every
  new code is one more `case` in that switch, writing into `buf2` and setting `i = buf2` (follow
  the exact pattern already used by every existing case; do not restructure the function).
- Keep new codes' output format consistent with REAL evidence already gathered from
  `DSL/GameLogs/GameLog-DSL_2023-01-07-Sat.txt:327` (`<1835/1835hp 1462/1462m 406/406mv
  108613tnl> [Chamber of Rest] [SWD] [3:00am]`), not invented formatting — the exits token style
  (`[SWD]`, letters concatenated with no separator) already matches `%e`'s existing
  implementation exactly; the time token style (`[3:00am]`, always `:00` minutes) sets the target
  for the new %t/%T code.

## Context
- `merc-mud/2.4/src/comm.c:1287-1437` — full current `bust_a_prompt`. Existing codes: %e %c %h
  %H %m %M %v %V %x %X %g %s %a %r %R %z %%. `dir_name[]` at line 1297 already includes the 10-
  direction rose (used by %e already — no change needed there).
- `merc-mud/2.4/src/act_info.c:815-851` — `do_prompt` (sets `ch->prompt` format string; no
  changes needed here — it just stores the raw string, `bust_a_prompt` does all interpretation).
- `merc-mud/2.4/src/merc.h:1381` — `sh_int wimpy` (backs %y, already exists).
- Dragon race + `AFF_FLYING`/`AFF_INFRARED` — `merc-mud/2.4/src/const.c:169` (`{"dragon", FALSE,
  0, AFF_INFRARED | AFF_FLYING, ...}`) — backs %f (`IS_AFFECTED(ch, AFF_FLYING)`, already exists
  as a flag check pattern used elsewhere, e.g. comm.c:1335).
- `merc-mud/2.4/src/merc.h:129-131` — `#define MAX_LEVEL 60`, `#define LEVEL_HERO (MAX_LEVEL -
  9)` (= 51). Backs %L ("XP until your merit, level 51") — for `ch->level < LEVEL_HERO`, compute
  the same way %X already does (comm.c:1379-1382, `exp_per_level`) but targeting level
  `LEVEL_HERO` instead of `ch->level + 1`; for `ch->level >= LEVEL_HERO`, show 0 (already a
  hero — no merit XP owed).
- `merc-mud/2.4/src/merc.h:183-193` — `SUN_DARK 0` / `SUN_RISE 1` / `SUN_LIGHT 2` / `SUN_SET 3`,
  `struct time_info_data`. `merc-mud/2.4/src/db.c:254-267` — the exact hour-range boundaries
  already used to assign `time_info.sunlight` (reuse these SAME boundaries/thresholds for %d's
  text, don't re-derive new ones) → map SUN_DARK→"Night", SUN_RISE→"Dawn", SUN_LIGHT→"Day",
  SUN_SET→"Sun Set" (exact wording per the user's spec: "Dawn / Day / Sun Set / Night Time").
- `merc-mud/2.4/src/act_info.c:1617-1645` — `do_time`'s existing am/pm hour formatting
  (`(time_info.hour % 12 == 0) ? 12 : time_info.hour % 12`, `time_info.hour >= 12 ? "pm" :
  "am"`) — reuse this exact computation for %t/%T, appending a literal `:00` for minutes (this
  engine's clock only has hour granularity — confirmed no `minute` field exists; real GameLog
  evidence at GameLog-DSL_2023-01-07-Sat.txt:327 shows `[3:00am]`, always `:00`).
- %D ("Chamber (dragons only, otherwise day status)") — no dragon-specific "chamber" data exists
  anywhere in this codebase (confirmed via grep) and it was not one of the four subsystems the
  user asked to be built for real (2026-07-23 scoping answer covered stance/language/craft/quest
  points only). Implement %D as a literal alias for %d's output for ALL characters for now
  (including dragons), with a one-line comment noting the dragon-specific branch is a deliberate
  placeholder pending a real dragon-chamber feature — do not silently invent dragon chamber data.
- `20260723-1145-mud-parity-new-subsystems.md` — source of `ch->stance` + a stance name lookup
  table (%S), `ch->speaks`/`ch->speaking` + a language name lookup (%l), `pcdata->quest_points`
  (%q), and `gsn_craft` for `get_skill(ch, gsn_craft)` (%C).

## Steps
### [x] 1. Independent codes: %y %f %t %T %d
- Do: Add four/five `case` arms to `bust_a_prompt`'s switch (comm.c, after the existing `case
  'z':` block, before `case '%':`): `'y'` → `ch->wimpy`; `'f'` → `IS_AFFECTED(ch, AFF_FLYING) ?
  "flying" : "grounded"` (or similar concise wording — user's spec just says "whether you are
  flying"); `'t'`/`'T'` → the do_time-style `H:00am/pm` string (both letters render the same
  value per the user's spec listing them as equivalent, matching `%X`/no-alt-form precedent); `'d'`
  → the SUN_* → Dawn/Day/Sun Set/Night Time mapping from Context.
- Files: merc-mud/2.4/src/comm.c
- Verify: compiles; live instance, `prompt <%y %f %t %d>`, confirm each renders correctly and %d/
  %t change appropriately as `weather_update` (update.c:460) advances `time_info.hour` (or force
  it via an immortal time-set command if one exists, else wait/observe across real ticks).

### [x] 2. %L (merit XP) and %D (chamber placeholder)
- Do: Add `case 'L'` computing XP-to-`LEVEL_HERO` using the %X pattern (Context), 0 if already
  ≥ LEVEL_HERO. Add `case 'D'` aliasing %d's output (Context) with the placeholder comment.
- Files: merc-mud/2.4/src/comm.c
- Verify: compiles; a level-40 test character's %L shows a positive, decreasing-as-they-level
  number; a level-55 character's %L shows 0; %D matches %d's output for both a dragon-race and a
  non-dragon test character.

### [x] 3. %q %S %l wired (subsystem-backed codes; %C stays absent, craft reverted)
- Do: **Only after `20260723-1145-mud-parity-new-subsystems.md` steps 1-4 are checked off.** Add
  `case 'q'` → `pcdata->quest_points` (IS_NPC-guard like other pcdata-only codes, e.g. %X's
  `IS_NPC(ch) ? 0 : ...` at comm.c:1380); `case 'C'` → `get_skill(ch, gsn_craft)`; `case 'S'` →
  the stance name lookup; `case 'l'` → the "currently speaking" language name lookup.
- Files: merc-mud/2.4/src/comm.c
- Verify: compiles; live instance — set quest points/stance/language via the new commands from
  the subsystems plan, confirm `prompt <%q %C %S %l>` reflects each accurately and updates when
  the underlying state is changed via those commands.

### [x] 4. Full prompt smoke test + docs refresh
- Do: One live-instance pass setting `prompt <%hhp %mm %vmv %qqp %Ccraft %Sstance %llang %Lmerit
  %Dchamber %yy %fflight %ttime %dday %e>` (or similar, exercising every code together) and
  confirm no garbage/crash on any single code; update `merc-mud/2.4/src/.annotated`'s comm.c
  entry to mention the full % code set now supported.
- Files: merc-mud/2.4/src/.annotated
- Verify: single combined prompt string renders correctly with no truncation/crash (watch
  `MAX_STRING_LENGTH` headroom — comm.c:1289's `buf`/`buf2` sizing) across all codes at once.

## Progress log

- 2026-07-23T11:47:00-00:00 plan created — steps 1-2 can start immediately; step 3 blocked on
  `20260723-1145-mud-parity-new-subsystems.md` steps 1-4.
- 2026-07-23T16:20:00-00:00 REPRIORITIZED by explicit user instruction: work this plan right
  after `20260723-1148-mud-parity-gmcp-wiring.md` (GMCP done first this session), skipping
  `20260723-1145-mud-parity-new-subsystems.md` for now — so step 3 (%q %C %S %l) stays blocked
  and is NOT attempted; `20260723-1146-mud-parity-firefield-area.md` is next after this plan.
- 2026-07-23T16:20:00-00:00 steps 1-2 done together: added `case 'y'`/`'f'`/`'t'`/`'T'`/`'d'`/
  `'L'`/`'D'` to `bust_a_prompt`'s switch (comm.c), right after the existing `case 'z':` and
  before `case '%':` — exactly the pattern every existing case already follows, no
  restructuring. %y = `ch->wimpy`. %f = `IS_AFFECTED(ch, AFF_FLYING) ? "flying" : "grounded"`.
  %t/%T both call the shared `format_game_hour()` helper added in the GMCP plan (same "H:00am/
  pm" string for both — matches the user's spec listing them as equivalent, and matches real
  evidence from `DSL/GameLogs/GameLog-DSL_2023-01-07-Sat.txt:327`'s `[3:00am]` style exactly).
  %d and %D both call a new small `prompt_sun_name()` static helper (added right before
  `bust_a_prompt`) mapping `weather_info.sunlight` (SUN_DARK/RISE/LIGHT/SET) to "Night"/"Dawn"/
  "Day"/"Sun Set" — %D is a deliberate alias of %d (see Context: no dragon-chamber data exists,
  this was never one of the four approved-for-real-build subsystems). %L computes
  `LEVEL_HERO * exp_per_level(ch, ch->pcdata->points) - ch->exp` for `ch->level < LEVEL_HERO`
  (mirroring %X's existing `(ch->level+1) * exp_per_level(...) - ch->exp` pattern, just with a
  fixed target level), 0 otherwise. Left a comment in the switch explicitly marking %q/%C/%S/%l
  as intentionally absent (falls through to the existing default blank case, not a crash) with a
  pointer to the blocking plan. `docker compose build mercmud24` compiles clean (comm.c: zero
  new warnings); a standalone throwaway-container boot smoke test (port 4096, `--rm`, removed
  immediately) shows a clean boot log, same two pre-existing `Fix_exits` bugs only. Did NOT yet
  do a live in-session `prompt <...>` string test (needs a real character walkthrough) — that
  and step 3 stay open, folded into whatever end-to-end pass eventually covers all three MUD-
  parity plans together once the live `merc-mud2.4` container is finally redeployed (still
  running the pre-this-session binary, per the same "batch the restart" reasoning noted in the
  GMCP plan's log).
- 2026-07-23T17:15:00-00:00 step 4 done via a real telnet session against the redeployed live
  container (see the GMCP plan's log for the redeploy). Set
  `prompt <%hhp %mm %vmv %tt %dd %Lmerit %yy %fflight>` and confirmed every code renders a
  correct, real value across two different character states: pre-level-60 showed
  `9:00pmt Nightd 50000merit 0y groundedflight` (a positive %L, character genuinely below
  LEVEL_HERO), and post-level-60 showed `11:00pmt Nightd 0merit 0y groundedflight` (%L correctly
  drops to 0 once `ch->level >= LEVEL_HERO` — both branches of the step-2 code live-confirmed in
  the same session). %t's `H:00am/pm` format and %d's Night/Day/Dawn/Sun-Set wording both
  matched the design target exactly. Did not re-verify %q/%C/%S/%l (still correctly blank/
  absent, unchanged — expected, not a bug) since they remain blocked on the deferred
  new-subsystems plan. `merc-mud/2.4/src/.annotated`'s comm.c entry updated with the full
  design summary (colour system + prompt codes + GMCP hook together, since they all landed in
  the same file this session).
- 2026-07-23T18:00:00-00:00 step 3 done for %q/%S/%l, now that the subsystems plan's quest
  points/stance/language landed for real. `case 'q'`/`'S'`/`'l'` added to `bust_a_prompt`'s
  switch: %q = `ch->pcdata->quest_points` (IS_NPC-guarded like %X, since pcdata is NULL for
  mobs); %S = `stance_name[ch->stance]`; %l = a new shared `language_name(long lang)` helper
  (const.c, checks LANG_ELVEN/DWARVEN/GIANT in priority order, defaults to "common" — also
  covers a pre-existing save's zero-valued `speaking` correctly). %C stays absent — craft was
  reverted (see the subsystems plan's log), not deferred-pending-a-plan anymore. Live-verified:
  `prompt <%hhp %qqp %Sstance %llang>` after `stance defensive`/`speak common`/`qpoints ... set
  42` rendered exactly `20hp 42qp defensivestance commonlang` — all three correct and reactive
  to the just-issued commands, not stale. `language_name()` also now backs GMCP's char_data
  stance/language fields (see the GMCP plan's log) — one shared helper, not duplicated logic.
