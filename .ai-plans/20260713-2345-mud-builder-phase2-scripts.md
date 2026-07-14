# Plan: MUD Builder — Phase 2 (script engine: authoring, persistence, hot load)

Created: 2026-07-13T23:45:00Z · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Give merc-mud a mobprog-style script engine (vanilla Merc has none), a `#SCRIPTS` area-file section to persist scripts on disk, hot-load support through the Phase-1 reload transport, and a Scripts editor tab in the builder UI.

## Goal
A builder writes a script in the UI (e.g. "when a player says 'hello' near the acolyte, the acolyte bows and replies"), previews the generated `#SCRIPTS` section, saves it into the area file, hot-reloads, and sees the behavior fire in the running game over telnet — no reboot, no disconnects. Done when the E2E (step 6) passes and a corrupt script is rejected by validation with the world untouched.

## Constraints
- STABILITY IS KING (unchanged from Phase 1): script execution must never crash the MUD or leak — interpreter has an instruction budget per trigger (no infinite loops), unknown commands are logged no-ops, and all script memory is owned by prototypes (interned strings / free-listed structs, same rules as area_reload.c).
- The MUD must never go offline: scripts hot-load through the existing validate-then-commit staging in area_reload.c; copyover remains the recovery path.
- Persist format is a NEW `#SCRIPTS` section in the .are file (keyed by mob vnum), NOT the classic embedded-in-#MOBILES mobprog format — keeps db.c's existing loaders untouched and the merc-area TS mirror simple. Files without the section stay byte-identical.
- Write gate unchanged: `MUD_WRITE_ENABLED=true` only (compose later; deliberate for staging E2E).
- All code testable in isolation: TS parsing/emitting in merc-area with round-trip tests; C interpreter factored so trigger matching and command dispatch can be exercised by a harness without sockets.
- qwen (container) must NOT run pnpm install|build|test; JS verification is a host job.

## Context
- Phase 1 (COMPLETE, /workspace/shattered-archive/.ai-plans/20260713-1043-mud-builder-phase1.md) delivered: /workspace/shattered-archive/services/merc-area (parser/emitter, full-corpus round trip), apps/mud-builder-server (write-gated REST: preview/download/PUT/reload), apps/mud-builder-client (rooms vertical slice, preview-first UI), merc-mud/2.4/src/area_reload.c (zero-downtime in-place reload, staging pattern to EXTEND for scripts), copyover.c (fresh-slate fallback), and the live area bind mount in /workspace/merc-mud/docker-compose.yml.
- merc-mud is vanilla Merc 2.4/ROM: NO mobprog support anywhere (grep mprog = 0). MOB_INDEX_DATA is at /workspace/merc-mud/2.4/src/merc.h line ~1228 (add an mprogs pointer there). Interpreter entry points to hook: act()/say → act_comm.c, greet/entry → act_move.c char_to_room/move_char, fight/death → fight.c, give/bribe → act_obj.c do_give, random → update.c mobile_update.
- Reference trigger vocabulary (classic MOBprograms): act, speech, rand, fight, death, greet, entry, give, bribe. Command set for v1: mob echo/say/emote, mob goto/transfer, mob mload/oload, mob purge, mob force, plus `if`/`else`/`endif` checks (ispc, isnpc, rand, level, name).
- String/struct memory rules and the staging/commit pattern live in /workspace/merc-mud/2.4/src/area_reload.c (read its header comment first); intern_string/intern_string_exists/string_space_remaining are in db.c (declared in merc.h).
- The builder UI Scripts tab placeholder exists in /workspace/shattered-archive/apps/mud-builder-client/src/App.tsx; API wrappers in src/api/client.ts; the flagged Manual-edit pattern in src/features/areas/AreasPage.tsx is the model for the script editor's preview flow.
- Docker/nginx `build.` subdomain wiring remains DEFERRED to Phase 3 (compose sets MUD_WRITE_ENABLED=true there).

## Steps
### [x] 1. (CLAUDE) merc-area: #SCRIPTS section — model, parse, emit, round trip
- Do: Extend /workspace/shattered-archive/services/merc-area with a ScriptsSection: `#SCRIPTS` containing entries `M <mobVnum> <trigger> <phrase~>` followed by a tilde-terminated script body, terminated by `#0` (exact grammar defined here, mirrored later in C). Update parseAreaFile/emitAreaFile + types; round-trip tests incl. an area with and without the section (absent section emits nothing — corpus files stay byte-identical).
- Files: /workspace/shattered-archive/services/merc-area/src/types.ts, src/parse.ts, src/emit.ts, src/scripts.test.ts
- Verify: host runs `pnpm --filter @shatteredarchive/merc-area test` — new tests + existing full-corpus round trip all green.

### [x] 2. (CLAUDE) merc-mud: mob_prog.c interpreter core (isolated, budgeted)
- Do: New module /workspace/merc-mud/2.4/src/mob_prog.c|h: MPROG data on MOB_INDEX_DATA (trigger type, phrase, interned body); trigger match (speech substring, act, greet, entry, fight, death, give, bribe, rand %) and a line interpreter with if/else/endif checks and the v1 command set; hard instruction budget per invocation (e.g. 256 lines) and recursion depth 1 — exceeding logs and stops, never crashes. Factor `mp_match_trigger()` and `mp_run()` so a `--mp-test` harness target can drive them without sockets. Wire call sites (act_comm say/tell, act_move greet/entry, fight.c fight/death, do_give give/bribe, mobile_update rand).
- Files: /workspace/merc-mud/2.4/src/mob_prog.c (new), mob_prog.h (new), merc.h, act_comm.c, act_move.c, fight.c, act_obj.c, update.c, Makefile
- Verify: image builds clean (`docker compose build` in /workspace/merc-mud); harness run exercises trigger match + budget cutoff.

### [x] 3. (CLAUDE) merc-mud: boot-load + hot-reload of #SCRIPTS
- Do: Boot: add `load_scripts` to db.c's section dispatch (same grammar as step 1). Hot: extend area_reload.c staging (parse scripts into stage, validate mob vnums + trigger names + budgeted body size) and commit (replace the mob's mprog list wholesale via module free lists; strings interned). Copyover needs nothing (fresh boot loads the section).
- Files: /workspace/merc-mud/2.4/src/db.c, area_reload.c
- Verify: build clean; `areload` of a file with a #SCRIPTS section reports scripts in its summary; corrupt script section rejected with line-numbered error, world untouched.

### [x] 4. (CLAUDE) mud-builder-server: script awareness
- Do: No new endpoints needed (scripts ride inside the area model through preview/PUT/reload), but add validation reporting: preview response includes a `scripts` summary (count per mob, unknown-trigger errors surfaced as 400 with the validation report). Extend route tests with a scripts fixture.
- Files: /workspace/shattered-archive/apps/mud-builder-server/src/routes/areas.ts, src/routes/areas.test.ts
- Verify: host runs `pnpm --filter @shatteredarchive/mud-builder-server test` green.

### [x] 5. (CLAUDE) mud-builder-client: Scripts tab (author → preview → save → reload)
- Do: Replace the Scripts placeholder with a real editor: list scripts by mob (from the area model), form with mob picker (from #MOBILES), trigger dropdown, phrase input, body textarea with the command vocabulary documented beside it; preview-first flow identical to rooms (PreviewPane shows the generated #SCRIPTS text); Save/Hot reload gated as ever. Component tests for the editor round trip and validation-error display.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/scripts/*, src/App.tsx, src/features/scripts/ScriptEditor.test.tsx
- Verify: host runs `pnpm --filter @shatteredarchive/mud-builder-client test` and build — green.

### [x] 6. (CLAUDE) E2E: scripted behavior live in the running game
- Do: With MUD_WRITE_ENABLED=true (deliberate): author a speech script for the school acolyte (mob 3700) via the API (as the UI does): say-trigger 'hello' → acolyte replies; preview → save → hot reload; telnet in, say hello, observe the reply; then a corrupt script (unknown trigger) → 400 at preview AND rejected by areload if forced to disk; then 30x reload loop with the script — RSS + string space flat; restore original file.
- Files: (test driver in scratchpad; no repo files)
- Verify: scripted reply observed over telnet on a live connection; corruption rejected cleanly; memory flat across the loop.

## Progress log

- 2026-07-14T11:30:00Z step 6 done + plan COMPLETE. E2E (scratchpad e2e-scripts.js, MUD_WRITE_ENABLED=true, live container): ALL 13 CHECKS PASSED — preview emits #SCRIPTS + summary {count:1, perMob:[3700]}; corrupt trigger 400s at preview AND PUT; save+hot reload → areload summary "1 scripts"; telnet Zzreload walked to the acolyte, said hello, got "Hello yourself, Zzreload!" + "bows deeply" live; corrupt file forced straight to disk rejected by areload (line-numbered, world untouched — previous script still answering); 30x reload loop with the script: string space IDENTICAL all 30 (4164K) and VmRSS flat 6656K→6656K; original restored (0 scripts). Successor plan: 20260714-1200-mud-builder-phase3-deploy.md (docker/nginx build. + mob/object editors).

- 2026-07-13T23:45:00Z plan created (successor to Phase 1, which is COMPLETE)
- 2026-07-14T11:45:00Z step 5 done: ScriptsPage (area → script list by mob → ScriptEditor form; live validateScripts errors block Preview/Save; add/delete manages the #SCRIPTS section incl. removal when empty, placed last so mobs precede scripts at boot) + ScriptEditor (mob picker, trigger dropdown, per-trigger phrase hints, body textarea, command-vocabulary panel); App.tsx wires the Scripts tab; PreviewResult carries the scripts summary; styles in areas.css. Client tests 9/9 (editor round trip, vocabulary, page listing + gating + delete-section, add-script default); vite build green.
- 2026-07-14T11:20:00Z steps 2+3+4 done. Step 2: mob_prog.c/h (MPROG_DATA on MOB_INDEX_DATA — merc.h; interned strings; module free list; budget MP_MAX_LINES=256 in mob_prog.h; recursion depth 1 via mp_depth suppressing all triggers; per-command mob/$n re-validation against char_list; iteration-invalidation guards on room/char_list sweeps; commands say/emote/echo/goto/transfer/mload(cap 30)/oload(cap 50)/purge(never self/PC)/force(never immortals); if rand/ispc/isnpc/level/name, else, endif; unknown = logged no-op). Call sites: do_say + do_tell/do_reply (tells to NPCs), move_char greet/entry (+mp_char_exists guard), damage() death pre-raw_kill, do_give give+bribe, update_handler mp_pulse_random/violence. Harness: "rom --mp-test" (comm.c, boots world, no sockets) — MP-TEST PASS 7 checks incl. budget stops at exactly 256 and stray-endif abort. Step 3: db.c load_scripts (#SCRIPTS dispatch, strict boot) + mprogs=NULL init in BOTH mob loaders (alloc_perm doesn't zero — crash-critical) + area_reload.c SSCRIPT staging (link-before-fill, trigger validated at parse), stage_validate (mob must be staged in same file; body ≤256 lines; string capacity ADDs), commit_mobs wholesale-clears mprogs (created branch NULLs first), commit_scripts reattaches in file order, summary "+ N scripts". Docker image builds clean. Step 4: merc-area validate.ts (validateScripts/MAX_SCRIPT_LINES, isomorphic) + 2 tests (20/20); server preview returns scripts summary, preview+PUT 400 on invalid scripts (routes/areas.ts requireValidScripts); TINY_AREA fixture grew mob #101; server 15/15.
- 2026-07-14T00:20:00Z step 1 done: #SCRIPTS in merc-area — ScriptsSection/MobScript/SCRIPT_TRIGGERS in types.ts, parseScripts (M entries, #0 terminator, line-numbered errors), emitScripts; scripts.test.ts (6 tests: parse, round trip + byte stability, absent-section purity, bad letter, bad terminator, trigger vocab). Suite 18/18 incl. full corpus round trip.
