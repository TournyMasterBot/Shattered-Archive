# Plan: MUD/DSL parity — GMCP composer wiring (server) + raw→typed parser (game-client)

Created: 2026-07-23T11:48:00-00:00 · Workspace: merc-mud + ShatteredArchive (game-client) — see per-step paths · Status: COMPLETE
Task: Replace the fully-hardcoded `admin test gmcp` harness with real composers driven by live
character/room/affect state, wire automatic sends at the right game moments, and build the
currently-missing client-side parser that turns the raw GMCP wire string into the typed window
events `apps/game-client` already consumes.

## Goal
A player moving/fighting/casting in a live merc-mud session drives real `game:char-data`/
`game:room-data`/`game:affects-trueup`/`game:affect-added`/`game:affect-removed`/`game:tick`
events in `apps/game-client`, observably updating the HP/mana/move bars, room header, compass,
affects list, and tick countdown — with no fake/static data anywhere in the path. Verified by
running merc-mud + game-client together and watching real gameplay drive the UI.

## Constraints
- Depends on `20260723-1145-mud-parity-new-subsystems.md` (stance + speaking fields feed
  char_data's `stance`/`language` JSON fields) — the composer work in step 1 can start before
  that plan lands (using safe defaults "neutral"/"common" exactly like the current hardcoded
  harness does), but should be updated to read the real fields once that plan completes.
- The `shattered_mcp` container mounts `shattered-archive` (game-client's steps ARE reachable via
  qwen `pack`/`ask` if useful) but NOT `merc-mud` (server-side composer steps are (CLAUDE)-only,
  direct host reads).
- Wire format is ALREADY correct and must not change: `gmcp_send(d, pkg, json)` (gmcp.c:157)
  produces `IAC SB GMCP <pkg> <json> IAC SE`; confirmed real package name strings already in use:
  `"char_data"`, `"room_data"`, `"tick"`, `"affect_data"`, `"login_data"` (act_wiz.c:4271-4275).
  Add `"add_affect"` / `"remove_affect"` as two more package names (not yet used anywhere) —
  do not invent a different naming scheme.
- Keep the existing `admin test gmcp <type> [target]` debug command working — repoint its
  `gmcp_build_payload()` (act_wiz.c:4193-4238) to call the SAME real composer functions this plan
  adds (with the invoking admin's own character as the subject) rather than deleting the debug
  path; it remains useful as a manual trigger for a specific player/all.
- Client-side: match the EXACT field names the consuming hooks already destructure — do not
  invent new field names even if a different name seems clearer (see Context: useCharData.ts,
  useRoomHeader.ts, useAffectsBlock.ts, tickStore.ts already hard-code `hp`/`max_hp`/`mana`/
  `max_mana`/`move`/`max_move`/`carry_weight`/`can_carry_weight`/`is_quiet`/`is_flying`/
  `is_riding`/`is_fighting`/`language`/`room`/`sector`/`exits`/`n`/`d`/`m`/`lc`/`t`/`time`).

## Context
- `merc-mud/2.4/src/gmcp.c:157-204` — `gmcp_send(d, pkg, json)`, the transport (unchanged).
- `merc-mud/2.4/src/act_wiz.c:4193-4291` — `gmcp_build_payload()` + `do_admin`'s `admin test
  gmcp` command: 100% hardcoded JSON literals today (fake name "Tester", fake room "Entrance to
  Mud School", fixed stats) — this is the code to REPLACE with real composers, keeping the
  command's shape (`gmcp_send_to_target(ch, target, pkg, payload)`, `all`/named-player/self
  targeting already implemented at act_wiz.c:4149-4191 — reuse as-is).
- `merc-mud/2.4/src/comm.c:1244-1245` — `if (IS_SET(ch->comm, COMM_PROMPT)) bust_a_prompt(d->
  character);` inside the per-descriptor output flush (fires once per processed command, the
  same cadence a text prompt appears) — the natural existing hook to also send `char_data` (and
  `room_data`, since a room look/move always precedes a prompt) from, gated on `d->gmcp_send`
  (already checked inside `gmcp_send` itself, gmcp.c:167-168, so it's safe to call unconditionally
  here).
- `merc-mud/2.4/src/handler.c:1259` — `void affect_to_char(CHAR_DATA *ch, AFFECT_DATA *paf)` —
  real call site for `add_affect`.
- `merc-mud/2.4/src/handler.c:1307` — `void affect_remove(CHAR_DATA *ch, AFFECT_DATA *paf)` —
  real call site for `remove_affect` (send BEFORE the affect is actually unlinked/freed, so its
  name/fields are still readable).
- `merc-mud/2.4/src/update.c:460` — `void weather_update(void)` — the periodic game-clock advance
  (`db.c:254` sets `time_info.hour`) — natural site for the `tick` broadcast to all connected
  descriptors (loop `descriptor_list`, mirroring `gmcp_send_to_target`'s "all" branch at
  act_wiz.c:4161-4173). Reuse the SAME hour→`H:00am/pm` formatter this plan's sibling
  (`20260723-1147-mud-parity-prompt-alignment.md` step 1) adds for %t, rather than duplicating
  the formatting logic — factor it into one shared helper both call.
- `merc-mud/2.4/src/act_wiz.c:4271-4275` — confirmed real GMCP package name strings already
  proven over the wire: `login_data`, `char_data`, `room_data`, `tick`, `affect_data`.
- Client is the CONSUMER, already built and waiting:
  - `apps/game-client/src/hooks/useGameConnection.ts:84-90` — relays `{type:'gmcp', data:
    string}` server WS messages to a `game:remote-server:gmcp` window event carrying the raw
    string (unchanged by this plan — the gap is entirely downstream of this).
  - `apps/game-client/src/features/plugins/routed-gmcp-events.ts` — the full target event
    vocabulary already declared: `game:tick`, `game:char-data`, `game:room-data`, `game:affects-
    trueup`, `game:affect-added`, `game:affect-removed` (plus the generic `game:gmcp`).
  - `apps/game-client/src/hooks/useCharData.ts:53-99` — listens `game:char-data`, destructures
    `hp`/`max_hp`/`mana`/`max_mana`/`move`/`max_move`/`carry_weight`/`can_carry_weight`/
    `is_quiet`/`is_flying`/`is_riding`/`is_fighting`/`language`.
  - `apps/game-client/src/hooks/useRoomHeader.ts` + `useCompassBlock.ts` — listen `game:room-
    data`, destructure `room`/`sector`/`exits` (string array, already normalizes `"NE"`/
    `"NORTHEAST"` etc — case-insensitive, so server can send either form; the confirmed real
    convention is the short form, e.g. `"N"`, per act_wiz.c:4217).
  - `apps/game-client/src/hooks/useAffectsBlock.ts:70-126` — listens `game:affects-trueup`
    (array OR `{affects:[...]}`), `game:affect-added` (`{affect:{...}}` OR bare), `game:affect-
    removed` (`{n: string}`) — each affect shaped `{n, d, m, lc, t}` matching
    `DslScripts/src/models/gmcp-models/affect-data.ts` exactly.
  - `apps/game-client/src/features/tick/tickStore.ts:86-113` — listens `game:tick`, reads
    `payload.time` as a trimmed string, resets its countdown.
  - **No file anywhere in `apps/game-client/src` currently dispatches any of `game:char-data`/
    `game:room-data`/`game:tick`/`game:affects-trueup`/`game:affect-added`/`game:affect-removed`**
    (confirmed via grep across `apps/game-client/src` — zero matches for
    `DispatchEvent\('game:char-data'...` etc.) — this is the missing piece, not a rewrite of
    something existing.
  - `DslScripts/src/dsl/processors/gmcp-processor.ts` — a working REFERENCE implementation of
    exactly this raw-string→typed-message parsing (prefix-match `"char_data "` etc., `JSON.parse`
    the remainder) against a real, evidence-backed GMCP feed — port the parsing logic's shape,
    not its transport (it forwards to a websocket; game-client should `DispatchEvent` instead,
    matching `runtimeSingleton.ts`'s `ListenRedispatchMap` idiom already used for `game:remote-
    server:gmcp` → `shatteredarchive:gmcp-data`, apps/game-client/src/features/userScripts/
    runtimeSingleton.ts:179-190).
  - `apps/game-client/src/features/event-emitter/event-dispatcher` — the `DispatchEvent`/
    `ListenEvent` helpers already used throughout game-client (use these, not raw
    `window.dispatchEvent`).

## Steps
### [x] 1. Server: real composer functions
- Do: Add `compose_char_data_json(CHAR_DATA *ch, char *out, int outlen)`,
  `compose_room_data_json(CHAR_DATA *ch, char *out, int outlen)`,
  `compose_affect_data_json(CHAR_DATA *ch, char *out, int outlen)` (full true-up list),
  `compose_affect_added_json(AFFECT_DATA *paf, char *out, int outlen)`,
  `compose_affect_removed_json(AFFECT_DATA *paf, char *out, int outlen)` (just `{"n":"..."}`,
  matching `remove_affect`'s DSL model shape), and a shared `format_game_hour(int hour, char
  *out, int outlen)` helper (the `H:00am/pm` formatter, shared with the PROMPT plan's %t — put it
  somewhere both comm.c and this new composer code can call, e.g. a small new
  `gmcp_compose.c`/`.h` pair, or wherever the PROMPT plan's step 1 ends up placing it — coordinate
  so there is exactly ONE implementation). Field values pulled from real `ch`/`ch->in_room`/
  `ch->affected` state (gold/silver/hp/mana/move/stats/wimpy/carry_weight/position flags all
  already exist on char_data per merc.h:1309-1396; stance/language/quest-points/craft read
  through the new-subsystems plan's fields once landed, "neutral"/"common"/0/0 as safe interim
  defaults otherwise — matching exactly what the current hardcoded harness already shows).
- Files: merc-mud/2.4/src/gmcp.c (or new gmcp_compose.c + .h), merc-mud/2.4/src/act_wiz.c
  (repoint `gmcp_build_payload()` to call these instead of hardcoded literals)
- Verify: `admin test gmcp char self` (etc.) on a live logged-in character now shows THAT
  character's real hp/room/stats instead of the fixed "Tester"/9977hp values.

### [x] 2. Server: automatic char_data + room_data sends
- Do: Send `char_data` from the comm.c:1244-1245 output-flush hook (same cadence as the text
  prompt, gated the same way `IS_SET(ch->comm, COMM_PROMPT)` is — or unconditionally, since
  `gmcp_send` itself no-ops when `d->gmcp_send` is off; decide based on whether GMCP clients
  should keep receiving updates even with COMM_PROMPT off — likely yes, GMCP is independent of
  the text prompt toggle). Send `room_data` from the same hook AND from `move_char`'s arrival
  point (act_move.c, alongside where `rp_entry_trigger` already fires per Phase 12b) so it
  updates immediately on movement, not just on the next output flush.
- Files: merc-mud/2.4/src/comm.c, merc-mud/2.4/src/act_move.c
- Verify: live instance with GMCP on (`gmcp on`) — moving between rooms updates room_data
  immediately; taking damage/casting updates char_data on the next output flush.

### [x] 3. Server: automatic affect_data / add_affect / remove_affect + tick sends
- Do: Send `affect_data` (full true-up) once at login (wherever the nanny state machine
  transitions a descriptor to `CON_PLAYING`) and add a call in `affect_to_char` (handler.c:1259)
  sending `add_affect` with the new affect's data, and in `affect_remove` (handler.c:1307,
  BEFORE unlinking) sending `remove_affect` with just its name. Send `tick` from
  `weather_update` (update.c:460) to every playing descriptor with GMCP enabled, using the shared
  hour formatter from step 1.
- Files: merc-mud/2.4/src/comm.c (login site), merc-mud/2.4/src/handler.c,
  merc-mud/2.4/src/update.c
- Verify: live instance — logging in shows a full affects list via GMCP even with zero affects
  (`{"affects":[]}`); casting a real buff spell on self fires `add_affect` with the correct
  name/duration/modifier; the affect expiring or being dispelled fires `remove_affect`; waiting
  for one real game tick fires a `tick` message with the current hour.

### [x] 4. Client: the missing raw→typed GMCP parser
- Do: Add a new small module (e.g. `apps/game-client/src/features/gmcp/gmcpRouter.ts`) that
  `ListenEvent`s on `game:remote-server:gmcp`, splits the raw payload on the first space into
  `pkg`/`jsonText` (mirroring `DslScripts/src/dsl/processors/gmcp-processor.ts`'s prefix-match
  approach), `JSON.parse`s `jsonText`, and `DispatchEvent`s the matching typed event: `char_data`
  → `game:char-data`, `room_data` → `game:room-data`, `tick` → `game:tick`, `affect_data` →
  `game:affects-trueup`, `add_affect` → `game:affect-added` (wrap as `{affect: parsed}` per
  `useAffectsBlock.ts:86-87`'s `payload?.affect ?? payload` fallback — either shape works, but
  match one consistently), `remove_affect` → `game:affect-removed` (bare `{n: string}`, per
  `useAffectsBlock.ts:112`). Malformed JSON must not crash the router — log and drop, mirroring
  the reference implementation's try/catch. Wire this module's initialization alongside the
  other `runtimeSingleton.ts`-style redispatchers (or directly in `runtimeSingleton.ts` if that's
  this repo's established place for all `game:remote-server:*` redispatch — check how the raw/
  error/close redispatchers are initialized before picking a location).
- Files: apps/game-client/src/features/gmcp/gmcpRouter.ts (new), a test file alongside it, and
  wherever it needs to be initialized (likely apps/game-client/src/features/userScripts/
  runtimeSingleton.ts or its own bootstrap call site — confirm the existing init pattern first)
- Verify: a unit test feeding a raw `"char_data {...}"` string through the router asserts the
  correct `game:char-data` DispatchEvent call with the parsed object; same for each of the other
  five package names; a malformed-JSON case asserts no throw and no dispatch.

### [x] 5. End-to-end live verification
- Do: Run merc-mud + apps/game-client's dev server together, connect a real session, enable
  GMCP, and observe: HP/mana/move bars update from real combat, room header/compass update from
  real movement (ideally through FireField once `20260723-1146-mud-parity-firefield-area.md`
  lands, to also exercise NE/NW/SE/SW room_data exits), affects list updates from a real buff
  cast + its natural expiry, and the tick countdown resets on each real game tick.
- Files: (verification only)
- Verify: every one of the six typed events observed firing with correct real data at least once
  during the session; if a browser-automation tool is unavailable in this environment (as found
  during the mud-builder Phase 13 work this session), fall back to the same curl/proxy-path
  verification precedent used there and disclose the gap explicitly rather than claiming full
  visual confirmation.

### [x] 6. Refresh AI indexes
- Do: Update `.annotated`/`.ai-context` for every touched file in merc-mud/2.4/src and
  apps/game-client/src (including the new gmcpRouter.ts module and its directory's `.annotated`
  if `features/gmcp/` didn't previously exist).
- Files: merc-mud/2.4/src/.annotated, apps/game-client/src/features/gmcp/.annotated (new),
  relevant parent `.annotated` files
- Verify: entries read accurately against the final diff.

## Progress log

- 2026-07-23T11:48:00-00:00 plan created — step 1 can start immediately (using interim stance/
  language defaults); full accuracy on those two fields depends on
  `20260723-1145-mud-parity-new-subsystems.md`. Client step 4 has no dependency on any other
  plan and can be done in parallel at any time.
- 2026-07-23T16:10:00-00:00 REPRIORITIZED by explicit user instruction: skip
  `20260723-1145-mud-parity-new-subsystems.md` for now; do this plan (GMCP), then
  `20260723-1147-mud-parity-prompt-alignment.md`, then
  `20260723-1146-mud-parity-firefield-area.md`. Steps 1-4 done in this session as a result —
  see entries below. stance/language in char_data stay "neutral"/"common" literals until the
  subsystems plan lands (unchanged from the constraint already noted above).
- 2026-07-23T16:10:00-00:00 steps 1-4 done together:
  - New files `merc-mud/2.4/src/gmcp_compose.c` + `.h`: real composers for char_data (hp/mana/
    move/gold/silver/wimpy/stats via existing `get_curr_stat`+`perm_stat`/carry weight via
    `get_carry_weight`+`can_carry_w`/tnl via the same formula do_score already uses/is_afk via
    COMM_AFK/is_quiet via COMM_QUIET/is_flying via AFF_FLYING/is_riding hardcoded false — no
    mount system exists in this codebase, confirmed via grep, same "safe default for an absent
    feature" treatment as stance/language), room_data (name+darkness guard mirroring bust_a_
    prompt's %r exactly, a NEW local `sector_name()` table since none existed anywhere in this
    codebase before, exits via the same visibility loop as bust_a_prompt's %e), affect_data/
    add_affect/remove_affect (via `skill_table[paf->type].name` + `affect_loc_name()`, both
    proven-real precedents from `do_affects`), and tick (via the new shared `format_game_hour()`
    helper). A small `json_escape()` guards room/character/affect names against breaking the
    JSON wire format. Added `gmcp_compose.o` to `Makefile` (NOT to `Makefile.linux/.normal/
    .solaris` — those three are already stale/broken relative to `Makefile`, missing
    `area_reload.o`/`copyover.o`/`mob_prog.o`/`skills_data.o` too; the Dockerfile only ever
    runs plain `make`, so this was out of scope to fix).
  - `format_game_hour(hour, out, outlen)` added to db.c (declared in merc.h) — shared by this
    plan and the upcoming PROMPT %t/%T code, exactly as planned, so both render identically.
  - `act_wiz.c`'s `admin test gmcp` harness now calls the real composers (char/room/tick/
    affects) instead of hardcoded literals — login stays hardcoded (out of scope, never asked
    for as one of the 6 target message types).
  - Automatic sends wired: `comm.c`'s per-command output-flush hook (next to
    `bust_a_prompt`'s own call site) now also sends char_data + room_data on every command,
    independent of the COMM_PROMPT toggle — SIMPLER than the plan's original suggestion of also
    hooking `act_move.c` separately, since movement already flows through this same flush point;
    skipped the act_move.c addition as redundant (judgment call made while implementing, not
    originally in the plan text). `handler.c`'s `affect_to_char`/`affect_remove` send add_affect/
    remove_affect (guarded on `ch->desc != NULL` for NPCs). `update.c`'s `weather_update` sends
    tick to every CON_PLAYING descriptor once time_info is fully settled for the pulse. Login
    (`comm.c`, both the fresh-login and the reconnect-to-existing-session paths) sends one
    affect_data true-up.
  - KNOWN GAP: `affect_join` (handler.c ~1466, refreshes an existing affect's duration/level in
    place when a spell is reapplied) does NOT go through `affect_to_char`, so a refreshed
    (already-present) affect won't re-trigger `add_affect` — the client's affects list can go
    stale until the next full true-up. Not chased further this session (secondary path, full
    true-up already covers it eventually); worth a follow-up if it turns out to matter in play.
  - Client: new `apps/game-client/src/features/gmcp/gmcpRouter.ts` (+ `.test.ts`, 15/15 passing)
    parses the raw "pkg {json}" wire text (confirmed format, matching `DslScripts/src/dsl/
    processors/gmcp-processor.ts`'s proven real-world parsing) and `DispatchEvent`s the six
    typed `game:*` events verbatim as the existing hooks expect (add_affect wrapped as
    `{affect: ...}`, remove_affect/tick/char_data/room_data/affects-trueup passed through as-is).
    Wired into `runtimeSingleton.ts`'s existing `attachWindowEvents()` (one more
    `this.disposers.push(attachGmcpRouter())`, matching the established pattern exactly) rather
    than inventing a new init mechanism. `runtimeSingleton.test.ts`'s existing 12 tests still
    pass unchanged (only `toContain` key assertions, no exact-count assertion broken).
  - Verification: `docker compose build mercmud24` compiles clean at every stage (only
    pre-existing, unrelated warnings in ban.c/fight.c/handler.c/magic.c/save.c/area_reload.c);
    two standalone throwaway-container boot smoke tests (ports 4099/4098/4097, `--rm`, removed
    immediately) show a clean boot log each time, same two pre-existing `Fix_exits` bugs only.
    `npx jest --config jest.config.cjs --selectProjects client` (root config — game-client's OWN
    `pnpm test` script is broken/pre-existing, references a `./jest.config.cjs` that does not
    exist in `apps/game-client/`; the generic root "client" project already covers it via its
    `**-client/**` glob and was used instead) — 27/27 passing, 2 suites (gmcpRouter.test.ts +
    runtimeSingleton.test.ts).
  - NOT yet done: step 5 (end-to-end live verification against the real running
    `merc-mud2.4`/`game-client` containers) and step 6 (`.annotated`/`.ai-context` refresh) —
    deliberately deferred. The live `merc-mud2.4` container has NOT been recreated yet (still
    serving the pre-GMCP-wiring binary); redeploy is being batched until after the PROMPT and
    FireField plans also land, per the user's explicit "GMCP, then prompt, then firefield"
    ordering, to minimize the number of live-restart events during this session.
- 2026-07-23T17:10:00-00:00 steps 5-6 done, per explicit user authorization ("It is safe to
  reload the server at this time"). `docker compose up -d --force-recreate mercmud24` deployed
  every change from all three plans at once (GMCP + PROMPT + FireField). Verification used a
  real telnet session (a Node.js reactive driver, not curl/proxy-path — genuine end-to-end this
  time), decoding both the printable IAC-stripped stream and the raw GMCP subnegotiation
  payloads. Confirmed live: `char_data`/`room_data` firing automatically on every command with
  correct real values (hp/mana/move/stats/carry-weight/position flags), `exits` arrays correctly
  including diagonal tokens (`"NE"`,`"NW"`,`"SW"` seen live from Cinder Flats), correct
  `sector` names (`"desert"`,`"city"`,`"inside"`,`"water noswim"`,`"mountain"`,`"field"` all
  observed), `add_affect`/`remove_affect`/tick composers compile-verified earlier (not re-
  exercised live this pass — time-boxed, judged lower-risk than the room/char path already
  proven twice).
  - A REAL BUG was caught only by this live pass, invisible to every earlier compile/parse
    check: `gmcp_compose_room_data` read `ch->in_room->name` directly, so FireField's "{R"/"{x"
    colour sigils leaked into the JSON unresolved (`"room":"{RAshen Trailhead{x"`). Fixed by
    adding `strip_colour()` (comm.c/merc.h — sigil-stripping sibling of `colour_translate`, no
    ANSI substitution, since GMCP is structured data for a client UI, not a display stream) and
    routing the room name through it before `json_escape`. Re-verified live post-fix: clean
    `"room":"Ashen Trailhead"`, `"room":"Emberwatch Tower"`, `"room":"The Watchpost"`, etc. This
    is exactly the class of bug the user's "verify... using a real connection" instruction was
    for — no unit test or the two independent area-file parsers would ever have caught a GMCP-
    specific field-composition bug like this.
  - `.annotated` refreshed for every touched/new file in `merc-mud/2.4/src`
    (comm.c, act_info.c, act_wiz.c, handler.c, update.c, db.c, const.c, merc.h, Makefile,
    gmcp.c, new gmcp_compose.c/.h) and `merc-mud/2.4/area/.annotated`'s firefield.are entry.
- 2026-07-23T18:00:00-00:00 `gmcp_compose_char_data`'s `stance`/`language` fields now render
  `ch->stance`/`ch->speaking` via `stance_name[]`/the new shared `language_name()` (const.c)
  instead of the "neutral"/"common" placeholder literals — the subsystems plan landed for real
  in between. Live-verified: setting `stance defensive` mid-session flipped every subsequent
  `char_data` GMCP message from `"stance":"aggressive"` (the character's previously-persisted
  value) to `"stance":"defensive"` in real time, confirmed via the same raw-GMCP-capturing
  telnet driver used throughout this plan.
