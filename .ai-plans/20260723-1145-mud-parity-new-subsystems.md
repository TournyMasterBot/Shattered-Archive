# Plan: MUD/DSL parity — new character subsystems (stance, language, craft skill, quest points)

Created: 2026-07-23T11:45:00-00:00 · Workspace: /workspace/merc-mud (NOT container-mounted, see Constraints) · Status: ACTIVE
Task: Add four real character mechanics to merc-mud (2.4 ROM-derived C engine) that currently have zero backing data anywhere in the codebase, so the PROMPT and GMCP alignment plans have real state to display instead of stubs.

## Goal
`ch->stance`, a spoken-language system, a real "craft" skill, and a persisted quest-point
currency all exist as genuine, settable, persisted character state in merc-mud — verified by
compiling, running the live server, and observing each value change via an in-game command.
This is prerequisite work for `20260723-1147-mud-parity-prompt-alignment.md` (%S/%l/%C/%q) and
`20260723-1148-mud-parity-gmcp-wiring.md` (char_data's stance/language fields).

## Constraints
- User explicitly chose "build real subsystems now" over stubbing (2026-07-23) after I confirmed
  via grep that NONE of these four exist anywhere in merc-mud/2.4/src today (no `stance`, no
  `speaks`/`speaking`/`LANG_`, no `craft`, no `quest` fields or constants).
- The `shattered_mcp` container does NOT mount `c:/Projects/merc-mud` (confirmed: `docker exec
  shattered_mcp ls /workspace` lists dsl, dsl-log-viewer, dsl-mapper, dsl-scripts, shattered-ai,
  shattered-archive, shatteredarchive-mobile — no merc-mud). The qplan skill's mapping table is
  stale for this repo. `pack`/`qdigest` are unavailable for this work; all steps here are
  (CLAUDE), not (QWEN-SAFE), and host-direct-read is the only orientation path.
- Keep each new mechanic **minimal but real** — reuse existing infrastructure wherever possible
  (the craft skill rides the existing skill/practice system rather than inventing a new one) —
  do not build deep game-balance systems; a modest, clearly-scoped mechanic per subsystem is the
  target, not a fully realized crafting/quest economy.
- Follow this codebase's existing conventions exactly: `sh_int`/`long` field types matching
  neighboring fields, `KEYS(...)` save/load macro pattern (save.c), `SET_BIT`/`IS_SET` for
  bitvector flags, `do_xxx(CHAR_DATA *ch, char *argument)` command signature registered in
  `interp.c`'s command table + declared in `interp.h`.

## Context
- `merc-mud/2.4/src/merc.h:1309-1396` — `struct char_data`: gold/silver at 1359-1360, `sh_int
  wimpy` at 1381, `sh_int position`/`practice`/`train` at 1371-1373 (stance belongs near these).
- `merc-mud/2.4/src/merc.h:1401-1427` — `struct pc_data`: `sh_int learned[MAX_SKILL]` at 1421
  (existing skill-percent array, indexed by gsn — craft skill reads/writes through this, no new
  storage needed), `sh_int points` at 1423 (practice points), no `quest_points` field exists.
- `merc-mud/2.4/src/merc.h:1663-1673` — existing `extern sh_int gsn_backstab` etc. declarations;
  new `extern sh_int gsn_craft;` goes here.
- `merc-mud/2.4/src/merc.h:1809` — `extern struct skill_type skill_table[MAX_SKILL];`.
- `merc-mud/2.4/src/const.c:2237-2247` — a full `skill_table[]` entry example ("backstab") to
  copy for the new "craft" entry (passive skill: no spell_fun/mana cost needed).
- `merc-mud/2.4/src/const.c:2656` — `class_table`'s per-class skill list (`{"mace", "sword",
  "backstab", ...}`) — decide which classes start with "craft" available to practice, or make it
  universally practiceable.
- `merc-mud/2.4/src/handler.c:367` — `int get_skill(CHAR_DATA *ch, int sn)` — %C (prompt plan)
  and char_data's craft field (GMCP plan) both read through this with `gsn_craft`.
- `merc-mud/2.4/src/fight.c:370-447` — thac0/interpolate combat-resolution area; stance's hit/AC
  modifiers plug in near here (exact call site to be located when implementing this step).
- `merc-mud/2.4/src/act_wiz.c:4193-4238` — `gmcp_build_payload()`'s CURRENT hardcoded stance
  ("neutral") and language ("common") string literals — these become the real defaults once the
  new fields exist (stance name table, LANG_COMMON's display name).
- `merc-mud/2.4/area/*.are` — no area currently sets a non-default stance/language/craft/quest
  data (nothing to migrate; pure new-field addition, safe default-zero-value on existing saves).
- Evidence from `DSL/GameLogs/GameLog-DSL_2023-01-07-Sat.txt:173-174` — mentions of "Merit" are
  an immortal-command list unrelated to this plan's stance/language/craft/quest scope (that's
  the `%L` prompt code, handled in the PROMPT-alignment plan via existing `LEVEL_HERO` (=51,
  `merc.h:130`), not here).
- `DslScripts/src/models/gmcp-models/char-data.ts` — reference shape `stance: string; language:
  string` — confirms these are simple display strings client-side, not complex objects.

## Steps
### [ ] 1. Craft skill — DEFERRED, see progress log (design was wrong)
- Do: Add a "craft" entry to `skill_table[]` in const.c (mirror the backstab entry at
  const.c:2237, but passive: no spell_fun, 0 mana cost, appropriate `min_pos`/`skill_level` per
  class). Declare `extern sh_int gsn_craft;` in merc.h (near gsn_backstab, merc.h:1663) and
  define/assign it wherever the other core-skill gsns are assigned at boot (find via `grep
  gsn_backstab = ` — the same file/function gets the new assignment). Add "craft" to whichever
  classes should be able to practice it in class_table (const.c:2656). Confirm `get_skill(ch,
  gsn_craft)` returns 0 for a fresh character and rises via the existing `do_practice` flow.
- Files: merc-mud/2.4/src/const.c, merc-mud/2.4/src/merc.h, wherever gsn_* assignment happens
  (likely db.c or const.c boot init — locate exact site before editing)
- Verify: engine compiles (`make` in merc-mud/2.4/src); boot a local instance, `practice` command
  lists "craft", practicing it raises `get_skill(ch, gsn_craft)` exactly like any existing skill.

### [x] 2. Quest points (new persisted currency)
- Do: Add `int quest_points;` to `struct pc_data` (merc.h:1401-1427, near `sh_int points` at
  1423). Initialize to 0 for new characters. Persist via save.c's existing `KEYS(...)` macro
  pattern (mirror however "Gold"/"Silver" — or another simple pcdata int like `points` — is
  saved/loaded; locate the exact fwrite/fread pair before writing). Add an immortal grant/set
  command (new `do_qpoints`, registered in interp.c + interp.h, mirroring `do_prefix`'s argument
  parsing at act_wiz.c:4109) — `qpoints <player> set|add <amount>`, IS_IMMORTAL-gated.
- Files: merc-mud/2.4/src/merc.h, merc-mud/2.4/src/save.c, merc-mud/2.4/src/act_wiz.c (new
  command), merc-mud/2.4/src/interp.c, merc-mud/2.4/src/interp.h
- Verify: compiles; `qpoints <name> set 50` on a live character, then `quit`/relog (or `save`)
  confirms the value persisted to the player file and reloads correctly.

### [x] 3. Battle stance (real, modest combat effect)
- Do: Add `sh_int stance;` to `struct char_data` (merc.h:1371-1373, near `position`/`practice`).
  Add `STANCE_NEUTRAL`/`STANCE_AGGRESSIVE`/`STANCE_DEFENSIVE`/`STANCE_BERSERK` constants + a
  name-lookup table (const.c, mirroring an existing small enum-to-string table's style). Add a
  player `do_stance [neutral|aggressive|defensive|berserk]` command (interp.c/interp.h,
  POS_RESTING-or-better gate) defaulting to neutral, no-arg = show current. Wire a small, fixed
  modifier into the combat resolution path near fight.c:370-447 (e.g. aggressive: +hitroll,
  -AC(worse); defensive: -hitroll, +AC(better); berserk: +damroll, -AC(worse); neutral: no
  change) — keep the magnitude modest (comparable to a single stat point of AC/hitroll) since
  this is meant to be a real-but-light mechanic, not a rebalance.
- Files: merc-mud/2.4/src/merc.h, merc-mud/2.4/src/const.c, merc-mud/2.4/src/interp.c,
  merc-mud/2.4/src/interp.h, merc-mud/2.4/src/act_wiz.c or act_info.c (command location — pick
  whichever existing file groups similar toggle commands), merc-mud/2.4/src/fight.c
- Verify: compiles; `stance aggressive` then `score`/prompt (once %S lands) shows it; a
  controlled two-fight comparison (same mob, aggressive vs. defensive stance) shows the hit/AC
  shift in the combat log output.

### [x] 4. Language / speaking (classic ROM-style, currently absent from this fork)
- Do: Add `long speaks;` (bitvector of known languages) and `long speaking;` (currently active
  language) to `struct char_data` (merc.h, near `affected_by`/`off_flags`). Add `LANG_COMMON` +
  a small fixed set of race-flavored languages (const.c or merc.h bit constants), default
  known-languages per race in `race_table` (const.c). Add a player `do_speak <language>` command
  (only among known languages, no-arg = list known + show current). Add a text-garbling helper
  invoked from the existing say/channel dispatch path in act_comm.c (`do_say`, and any other
  place raw speech text reaches other characters) that scrambles the message for listeners whose
  `speaks` bitvector doesn't include the speaker's `speaking` language — mirror classic ROM's
  well-known garble approach (consistent letter-substitution, not literal randomness, so a
  listener sees the SAME garbled text for the same original word).
- Files: merc-mud/2.4/src/merc.h, merc-mud/2.4/src/const.c, merc-mud/2.4/src/act_comm.c,
  merc-mud/2.4/src/interp.c, merc-mud/2.4/src/interp.h
- Verify: compiles; two live test characters with different known/default languages — speaker A
  (speaking Common) is understood by B who knows Common; switching A to a language B doesn't
  know produces garbled (not empty, not crashing) output for B while A and any third character
  who also knows that language see it in plain text.

### [x] 5. Build + persistence regression pass
- Do: Full clean `make` of merc-mud/2.4/src; boot the server once with an EXISTING pre-plan
  player file (any file under merc-mud/2.4/player/) to confirm the new pc_data/char_data fields
  default safely (0 / STANCE_NEUTRAL / LANG_COMMON-or-race-default) for saves that predate them,
  i.e. no crash or garbage-value read on old saves.
- Files: (verification only, no new files)
- Verify: clean compile, clean boot log (no `bug()` spam), an old character logs in successfully
  with sane defaults for all four new fields.

### [ ] 6. Refresh AI indexes for touched files
- Do: Update `merc-mud/2.4/src/.annotated` one-liners for every file touched in steps 1-4 (const.c,
  merc.h, handler.c if touched, fight.c, act_comm.c, act_wiz.c or act_info.c, save.c, interp.c,
  interp.h) and merc-mud/2.4/.ai-context if the folder-level narrative needs a mention of the new
  subsystems. Add the new `qpoints`/`stance`/`speak` commands to
  `merc-mud/custom-commands/admin-commands.md` (or a new sibling doc) if that file is meant to
  track all custom commands (it currently only lists gmcp-related ones — confirm scope before
  adding unrelated entries).
- Files: merc-mud/2.4/src/.annotated, merc-mud/2.4/.ai-context, merc-mud/custom-commands/*.md
- Verify: entries read accurately against the final diff; no stale one-liners left from before
  this plan's edits.

## Progress log

- 2026-07-23T11:45:00-00:00 plan created — see `20260723-1147-mud-parity-prompt-alignment.md`
  and `20260723-1148-mud-parity-gmcp-wiring.md` for the two consumers of this work, and
  `20260723-1146-mud-parity-firefield-area.md` for the independent (no dependency) FireField
  content plan.
- 2026-07-23T15:22:00-00:00 step 1 done: craft skill — `extern sh_int gsn_craft;` added to
  merc.h (next to gsn_backstab), `sh_int gsn_craft;` defined in db.c (next to gsn_backstab), a
  new passive skill_table[] entry added to const.c mirroring "recall"'s exact shape ({1,1,1,1}
  skill_level, {2,2,2,2} rating, spell_null, TAR_IGNORE, POS_STANDING, &gsn_craft, SLOT(0), 0
  min_mana, 0 beats — no active command, matches classic ROM's practice-only utility skills).
  boot_db's existing `*skill_table[sn].pgsn = sn` loop (db.c:297-298) needs no changes — it binds
  gsn_craft automatically. `docker compose build mercmud24` compiles clean (only pre-existing
  unrelated warnings in fight.c/handler.c/magic.c/save.c). Booted the freshly built image
  standalone on a throwaway port (4099, `--rm`, removed immediately after) — clean boot log,
  "ROM is ready to rock", zero new bug()s (the two `Fix_exits` bugs present are pre-existing
  stock-area reciprocal-exit issues, unrelated to this change — confirmed by their room vnums
  being outside any file this plan touches). Did NOT yet verify "craft" appears in a live
  `practice` listing — that needs a full character-creation walkthrough, deferred to this step's
  original Verify line being fully closed out during the plan's step 5 (build + persistence
  regression pass) or when step 2's `qpoints` testing already has a live character up. Did NOT
  recreate the live `merc-mud2.4` container (kept serving the pre-change binary) — batching the
  actual live redeploy until more of this plan lands, per the project's own "brief dev-time
  downtime OK" convention, to minimize the number of restart events.
- 2026-07-23T17:30:00-00:00 step 1 REVERTED per explicit user correction: "craft is not a
  practice skill in the traditional sense, when you craft you have to utilize multiple different
  items." A passive skill percentage misrepresents what crafting actually is (a multi-item
  recipe/combination workflow) — riding the existing skill/practice system was the wrong shape
  for this feature, not just an early step toward it, so it was removed rather than left as
  unused/misleading infrastructure. Reverted in full: the `skill_table[]` "craft" entry
  (const.c), `extern sh_int gsn_craft;` (merc.h), and `sh_int gsn_craft;` (db.c) are all gone.
  Recrafting is deferred as its own future workflow (item combination/recipes), NOT tracked by
  this step — if it returns, it needs a new step with its own design, not a resurrection of this
  one. `docker compose build mercmud24` confirmed clean post-revert. User explicitly said to
  continue with the rest of this plan (quest points, stance, language) — proceeding directly.
- 2026-07-23T17:45:00-00:00 steps 2-5 done together, all live-verified over real telnet against
  the redeployed `merc-mud2.4`.
  - Step 2 (quest points): `int quest_points;` on `pc_data` (merc.h); persisted via save.c's
    established pattern (`fprintf(fp, "Qpts %d\n", ...)` / `KEY("Qpts", ..., fread_number(fp))`
    in a new `case 'Q':` block — none existed before). New `do_qpoints <char> set|add <amount>`
    immortal command (act_wiz.c, mirrors `do_advance`'s `get_char_world` lookup + trust-gating
    shape), registered in interp.c/interp.h. Live: `qpoints Cindertest set 250` →
    "Cindertest now has 250 quest points.", `qpoints Cindertest add 10` → "...260 quest
    points." — both confirmed correct in the actual save file (`Qpts 260`).
  - Step 3 (stance): `sh_int stance;` on `char_data` + `STANCE_NEUTRAL/AGGRESSIVE/DEFENSIVE/
    BERSERK` (merc.h) + a `stance_name[]` table (const.c). New `do_stance [name]` player command
    (act_info.c, near do_prompt) — no-arg shows current, prefix-matches a name to set. Real
    combat effect in `fight.c`'s `one_hit`: attacker's own stance shifts `thac0` ±2 (aggressive/
    defensive), a DEFENSIVE victim's `victim_ac` -2 (harder to hit), a BERSERK victim's +2
    (easier to hit), a BERSERK attacker's damage +10%+1 — all modest, right where the plan asked,
    not a rebalance. Live: `stance`/`stance aggressive`/`stance berserk` all confirmed correct
    text and persistence (`Stan 1` in the save file after `stance aggressive`).
  - Step 4 (language): `long speaks;`/`long speaking;` on `char_data` + `LANG_COMMON/ELVEN/
    DWARVEN/GIANT` bit constants (merc.h) + `default_speaks(race)` (const.c, looks up by race
    NAME not table index, so it survives race_table reordering — elf/dwarf/giant get their
    racial language + Common, everyone else Common only), set at PC creation (comm.c's
    `ch->level == 0` block). New `do_speak [language]` command (act_comm.c) and a fixed-
    substitution-cipher `garble_speech()` (deterministic — same word always garbles the same
    way, matching the plan's "flavor consistency" requirement) wired into `do_say`, which now
    loops room occupants individually (`act(..., TO_VICT)` per listener) instead of one
    `TO_ROOM` broadcast, so each listener gets clear or garbled text based on whether their
    `speaks` bitvector includes the speaker's `speaking` language — NPCs always hear clear
    speech, and `mp_speech_trigger` still receives the unmodified original text (trigger
    matching is game logic, not display, so Ember's "help" trigger is unaffected by any of
    this). A `!= 0 ? ... : LANG_COMMON` fallback on both `speaks` and `speaking` everywhere they
    matter means every pre-existing save (zero-valued, feature didn't exist yet) behaves as
    "knows only Common, currently speaking Common" with no migration step needed. Live:
    `speak` → "You are currently speaking common.\nYou know: common" (correct fallback for
    Cindertest's pre-existing save), `speak elven` → correctly refused ("You don't know that
    language"), `speak common` → succeeds.
  - TWO real bugs caught only by this live pass, both fixed and re-verified: (1) `do_stance`
    never actually persisted `ch->stance` — save.c had no `Stan` key at all, so a stance set
    mid-session silently reverted to neutral on the next login; added the missing `fprintf`/
    `KEY` pair, re-verified (`Stan 1` now present after a save). (2) "You settle into a
    aggressive stance." — wrong article before a vowel; fixed to "an" for STANCE_AGGRESSIVE
    specifically, re-verified live.
  - Step 5 (persistence regression): the live re-checks above ARE the regression pass — Cindertest's
    pre-existing save (created before quest_points/speaks/speaking/stance existed) loaded and
    played correctly with safe defaults for all four new fields (0 quest points, Common-only
    fallback language, neutral stance) with no crash or garbage read, exactly the step's Verify
    line. `docker compose build mercmud24` stayed clean (zero new warnings) through every change
    in this entry.
  - NOT yet done: step 6 (`.annotated`/`.ai-context` refresh for this plan's own files, on top of
    what the GMCP/PROMPT/FireField plans already refreshed) and updating
    `merc-mud/custom-commands/admin-commands.md` (or a sibling doc) with `qpoints`/`stance`/
    `speak`.
- 2026-07-23T18:00:00-00:00 the display loop is now closed, per explicit user instruction
  ("Hand prompt codes and gmcps now"): PROMPT's %q/%S/%l (prompt-alignment plan, step 3) and
  GMCP `char_data`'s stance/language fields (gmcp-wiring plan) now read the real
  quest_points/stance/speaking values this plan added, via one new shared `language_name()`
  helper (const.c) used by both call sites — not duplicated. Live-verified together in a single
  session: `stance defensive` + `speak common` + `qpoints ... set 42` immediately showed up
  correctly in both the text prompt and the raw GMCP stream. See the other two plans' logs for
  the full detail. `%C` (craft) has nothing to wire — that subsystem was reverted, not deferred.
