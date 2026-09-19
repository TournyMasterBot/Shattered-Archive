# Plan: Movement success/failure tracking — diff-based, failure-text-aware, queued

Created: 2026-08-13T13:25:29-05:00 · Workspace: /workspace/shattered-archive · Status: ACTIVE
Task: Replace game-client's two independently-buggy "did the move succeed" implementations
(`useCompassBlock.ts`, `autoleveling-engine.ts`) with one shared, correct primitive, and extend
movement tracking to typed/queued/stacked commands, which today aren't tracked at all.

> **Relationship to the cartography plan.** This is a prerequisite/enabler for
> `20260813-0933-game-client-world-mapping.md` (Phase 1's capture engine was written assuming this
> gets fixed), but it's independently useful — `useCompassBlock`'s compass UI and
> `autoleveling-engine`'s scripted pathing are shipped, live features today, broken independently of
> whether the mapping feature ever ships. Keep this as its own plan; don't fold it into that one.

## Goal

Exactly one place in the client decides whether a sent movement command succeeded or failed, for
**every** source that can send one (compass-block clicks, autoleveling's scripted pathing, typed
commands, plugins/user scripts) — not just the two sources that currently have partial, separately-
broken tracking. A success is only declared when the room actually changed (name/sector diffed
against the last-known value, treating the literal `"darkness"` sentinel as inconclusive); a failure
is declared immediately on seeing `"Alas, you cannot go that way."`, not just after a timeout. A
burst of several commands sent in quick succession (e.g. a typed `n;n;n;e;e;e` compound line) resolve
independently, in the order they were sent, each correctly matched to its own outcome. Reached when a
real play session against the live merc-mud instance demonstrates all of: a clean success, an
immediate (non-timeout) failure, a mixed-outcome stacked burst resolving each sub-command correctly,
and a full autoleveling scripted-path run with no regression.

## Constraints

- **Backward-compatible event contract.** Keep dispatching `shatteredarchive:movement-attempt` /
  `-succeeded` / `-failed` with the existing payload shape (`{cmd?, dir?}` on attempt; `{cmd, dir,
  ts, room}`-ish on succeeded — match what `autoleveling-engine.ts`'s `extractEventMoveKey`
  currently expects, Context). `routed-gmcp-events.ts`'s `ROUTED_WINDOW_EVENTS` bridges these to
  `window`, and the scripting-help docs (`ScriptingHelpModal.tsx`, `AutoLevelingModal.tsx`) document
  them — user-authored scripts may already listen. Fix *when* they fire and add proper queuing;
  don't rename or reshape them without checking those two doc references first.
- **The `"darkness"` sentinel must never resolve a pending move, either way.** While blinded, `room`
  becomes the literal string `"darkness"` (verified server behavior, see the cartography plan's
  Context) — the tracker must treat that as "can't tell yet," not as a room change.
- **Centralize the "a line was actually sent" signal in `useGameConnection.ts`'s `sendTelnetData`**
  (`:146-156`) — confirmed to be the one physical websocket-send function both the typed-command
  path and the `shatteredarchive:send-command` programmatic path funnel through (Context). This is
  what makes typed/stacked/programmatic moves observable uniformly; don't duplicate a second
  "command was sent" signal elsewhere.
- **Consolidate, don't re-diverge.** `useCompassBlock.ts`'s `normalizeExit` and
  `autoleveling-engine.ts`'s `isMovementCommand`/`MOVE_DIRS` do near-identical jobs with slightly
  different token sets — merge into one shared classifier matching the corpus-verified real usage
  (`n s e w ne nw se sw u d` — see the cartography plan's movement-corpus research, 2026-08-13). If
  you drop `isMovementCommand`'s currently-dead `up`/`down` full-word entries (the live 30-day+
  historical corpus never sent them), say so explicitly in the Progress log — don't silently change
  accepted input.
- **Don't redesign the scripting/alias runtime.** `RuntimeSingleton.Runtime.executeAlias(line)`
  (`useGameCommand.ts:63`) may transform or multiply a typed line before it truly sends, and it's
  unclear whether that path still funnels through `sendTelnetData` for every resulting line. Flag
  this as a verify-empirically-during-testing edge case (Step 5), not something to redesign here.
- **Step 5 (live verification) is not qwen-farmable** — it requires driving the real game client in
  a browser against the live merc-mud instance. Steps 1-4 are mechanical/structural enough that they
  could be qwen-drafted if the user wants to hand them off, but the cross-file coordination (two
  existing consumers, one new shared module) benefits from one contiguous sitting.

## Context (verified 2026-08-13, file:line — trust this, don't re-survey)

- **Bug 1 — `useCompassBlock.ts:70-119`**: a single `pendingMoveRef` (not a queue). On `move()`
  (`:145-162`, compass-button click) it sets the ref and starts a 1200ms timer. On **any**
  `game:room-data` arrival while the ref is set (`:83-107`), it dispatches
  `shatteredarchive:movement-succeeded` unconditionally — no diff against the previous room, no
  check that anything actually changed.
- **Bug 2 — `autoleveling-engine.ts`, independently duplicated, NOT actually wired to Bug 1's
  dispatched event despite the module's own docstring (`:23`) implying it consumes
  `movement-succeeded`/`-failed`.** It listens directly on `game:room-data` itself (`:470-478`) and
  manually invokes its own `boundOnMovementSucceeded` (`:338-381`) with `{cmd: this.moveWait?.cmd,
  dir: this.moveWait?.dir, room: payload}` — same "any room_data arrival = success" flaw, a separate
  copy of the bug, not a shared dependency on `useCompassBlock`. Its own `moveWait` state
  (`waitForMovement`, `:940-988`) has exactly one failure path: a timeout (`:963-973`, default
  5000ms) — **zero explicit failure-text detection**, even though it already runs every incoming raw
  line through `onTerminalLine` (`:1090-1110`, fed via `shatteredarchive:raw-data` at `:450-456`) for
  other purposes (`waitText`/`waitRegex`, engagement heuristics) — the natural place to add an
  "Alas, you cannot go that way" check.
- **Typed/queued commands are invisible to both trackers today.** `shatteredarchive:movement-attempt`
  is dispatched only by `useCompassBlock.move()` (`:150`) and `autoleveling-engine.ts` (`:929`) — the
  general command-input path never dispatches it. Two parallel outbound routes, confirmed by reading
  both: **typed** — `useGameCommand.ts:48-68`'s `sendLineRef.current` (invoked by `OutboundQueue`'s
  `pump()`, `outbound-queue.ts:33-47`, up to 100 lines/tick) dispatches
  `shatteredarchive:command-sent` (`:55`) then either `RuntimeSingleton.Runtime.executeAlias(line)`
  or `sendRaw(line)`. **Programmatic** — any `DispatchEvent('shatteredarchive:send-command', {cmd})`
  (compass block, autoleveling `:931`, plugins via `pluginHost.ts:148`, user scripts via
  `userScriptRuntime.ts:334`, several `Contribute*Modal.tsx`) is caught by
  `useGameConnection.ts:161-178`'s single listener, which calls `sendTelnetData` (`:146-156`) — the
  one place that actually does `ws.send(...)`. `sendRaw` passed into `useGameCommand`/`CommandInput`
  is presumed to be this same `sendTelnetData` (confirm the wiring during Step 1 — trace the prop
  from `MainContainer.tsx` down, it wasn't traced this session). **This confirms `sendTelnetData` is
  the true single unification point for "a line was actually sent," regardless of source.**
- **Compound `;`-separated commands are a real, established client convention** — not a merc-mud
  server feature (grepped the merc-mud C source for any `';'`/semicolon handling: none found).
  `autoleveling-mudlet-import.ts:29,142,190-193,258-269` already splits Mudlet-imported paths on
  `;` into individual move/command steps, with an explicit comment (`:258-259`) that this "match[es]
  how the autoleveling engine processes the flat semicolon-delimited path." `preprocessOutgoingCommand`
  (`accessibility-command.ts`, consumed by `useGameCommand.ts:76`) is very likely where a
  typed `n;n;n;e;e;e` line becomes `action.lines: string[]` fed one-by-one into `OutboundQueue` —
  confirm the exact split logic during Step 1, it wasn't read this session.
- **Movement vocabulary + failure text, corpus-verified in the cartography plan's research
  (2026-08-13, 30-day sweep + historical spot-check to 2026-01, no format drift found)**: real tokens
  are exactly `n s e w ne nw se sw u d`; the failure string is exactly `"Alas, you cannot go that
  way.\n"`; `room_data` fires after nearly every server response (not just movement), so success
  detection must diff room state, never react to the event's mere arrival; a literal
  `room:"darkness"` payload appears while blinded (sector/exits stay accurate) and must resolve
  nothing.
- `routed-gmcp-events.ts:2-26` (`ROUTED_WINDOW_EVENTS`) bridges `game:room-data` and
  `shatteredarchive:movement-succeeded` to `window` — this is the user-scripting-facing surface the
  backward-compatibility constraint above protects.
- **Combat engagement already has its own outcome-tracking (added since this plan was first
  written) — a separate mechanism from movement, but with the SAME timing flaw.**
  `autoleveling-engine.ts`'s `engageTarget` (`:1827-1890`) sends a `kill <keyword>` and calls
  `waitForEngageOutcome(attemptTimeout, gmcpGraceMs)` (`:1851-1871`), which resolves on either the
  real DSL MUD failure text `"They aren't here."` (corpus-confirmed: 2,755 occurrences across 123
  game-log files) or `isFighting` flipping true — so it is NOT missing negative-finding/combat-start
  detection. What it IS missing: `attemptTimeout` (`:1851`, `Math.min(Math.max(3000,
  cfg.idleTimeoutMs || 30000), 10000)`) is a flat 3-10s window with no notion of how many other
  commands are still in flight ahead of the kill command — exactly the absolute-from-send-time
  design Step 2's corpus research proved costs a 44.7% false-timeout rate for movement before the
  head-of-queue-relative fix. A kill command sent right after a lag-inducing burst can time out and
  get abandoned while still honestly pending server-side, matching the user's "engine tends to skip
  over the room when lagged" complaint for the combat case. No corpus research has measured
  kill-command server latency the way movement was measured (Step 6 below is UNVERIFIED-LIVE
  because of this, same caveat pattern as movement's own Step 5).

### Empirical re-verification, 2026-08-14 (18-file corpus sweep, Jan–Aug 2026, quote-verified)

Done at the user's explicit request to stress-test the design above against real docker game-server
logs (`C:\Projects\DSL\GameLogs\ShatteredArchive\Docker\game-server\...\*.jsonl`, 229 files for 2026)
before Step 1 starts, sensitive to lag/chaining/stacking/dangling edge cases. Methodology: targeted
`Grep` across the whole corpus for exact quotes (re-verified in content mode after an earlier
`files_with_matches` pass proved unreliable — see below), plus two throwaway node scripts reading 18
files spread Jan→Aug in true wire order (script + raw output not checked in; re-derivable from this
log). This corrects/extends the 2026-08-13 movement-corpus research cited above.

**Server identity correction (the user caught this):** this corpus is real play against **DSL MUD**
(`dsl-mud.org:4000` — the connect host logged in every session, and the *default* entry in
`apps/game-server/.env`'s `GAME_PROXY_ALLOWLIST`; `docs/game-server.md` confirms it's the primary
outbound Telnet target). DSL MUD's own server source is external/unavailable to us — it is **not**
`C:\Projects\merc-mud` (the ROM/Merc-derived C source in this repo), which is a *different* codebase
that only backs `simulacrum.shatteredarchive.dev` (the separate in-house dev/test instance Step 5
live-verifies against). An earlier pass here cited `act_move.c` as if it were explaining this corpus's
behavior — wrong attribution, now corrected below. Every finding in this section stands on the DSL MUD
jsonl quotes alone; `merc-mud`'s source was at most a same-genre hypothesis aid for what *else* to grep
for (many MUDs share ROM/Diku lineage and this vocabulary reads as one), never treated as DSL MUD's
ground truth. Because DSL MUD's real source isn't available, this list can't be claimed exhaustive the
way it could be for `simulacrum` (where reading `act_move.c` directly would be authoritative) — only
"confirmed present" or "grepped for, not found" claims below are load-bearing.

### Full-corpus re-verification, 2026-08-14 later pass (all 229 files, not a sample — the user
### explicitly pushed back on the 18-file sample as insufficient for "critical functionality")

The 18-file pass above got the *shape* of the problems right but materially understated one of them,
and completely missed the single biggest one, because it never simulated the actual proposed FIFO
queue + timeout mechanism end-to-end — it only checked resolution *conditions* in isolation. Reran
against **all 229 files** (a `fs.readdirSync` walk, not a hand-picked list) with a script that
faithfully simulates the exact algorithm Step 2 below now specifies: enqueue on a classified movement
send, resolve oldest-pending on a differing `{room,sector,exits}` / known failure text / per-entry
timeout. 35,362 real movement inputs corpus-wide (not 7,559).

- **CRITICAL #1 (confirmed at full scale, upgraded) — `{room,sector}`-only diff misses `exits`.**
  4,725/35,362 real moves (**13.4%**, not 11.2% — the fuller sample raised the rate) land in a
  same-name/same-sector room with different exits (`Sandy path outside the city wall`, `Along the
  Eastern Road`, `Deeper in the Thick Forest`, `Esquire Parkway`, `Zoo Pens`, `The Gardens`, etc. — all
  recur corpus-wide). Step 2 must diff `{room, sector, exits}`. Unchanged from the first pass.
- **CRITICAL #2 (NEW — the 18-file pass's "never observed" residual risk is real and non-rare).**
  Two adjacent rooms can share `room` **AND** `sector` **AND** the exact same `exits` set and still be
  different rooms — empirically confirmed, not hypothetical. Example: `server.log-2026-01-01.jsonl`,
  `n` sent at `21:08:12.977` from "Thieves Row" `[N,E,S,W]` lands in a *different* "Thieves Row"
  `[N,E,S,W]` — the room's own description text says so directly: *"This is the **northern end** of
  Thieves Row... To the south is **more Thieves Row**..."* — a multi-segment street where every segment
  shares name, sector, and exit letters. No client-visible signal in DSL MUD's `room_data` can
  distinguish this case (no vnum); it is a genuine, unfixable-client-side protocol ceiling, not a bug
  to chase further. **Design response**: Step 2 needs a THIRD resolution path — a `room_data` arrival
  that exactly repeats `{room,sector,exits}` while an entry is pending should resolve the oldest
  pending entry immediately as `'ambiguous-repeat'` (a distinct outcome, not silently ignored and not
  a hard failure) rather than leaving it to block the queue for 1200ms. This isn't just about this
  same-everything case — see CRITICAL #3, where clearing the head of the queue promptly turns out to
  matter far more than which exact label the ambiguous case gets.
- **CRITICAL #3 (NEW, the dominant finding — the 18-file pass never tested this because it never
  simulated the real FIFO+timeout mechanism, only isolated resolution conditions).** A full-corpus
  simulation of Step 2's ORIGINAL design (per-entry timeout counted from each entry's own send time,
  the literal reading of "a per-entry timeout (default 1200ms)") produces a **44.7% timeout rate**
  (15,801 of 35,364 resolutions) — i.e. the design as first written would misclassify nearly *half* of
  all real movement as failed-by-timeout. Root-caused via `server.log-2026-01-01.jsonl:~21:14:07`: a
  real Mudlet-style scripted path fires **14 movement commands in the same millisecond**
  (`se,e,s,s,se,e,e,e,e,sw,sw,nw,"enter portal",u,n`) — completely ordinary for autoleveling/macro
  bursts (corroborated by the 20,655 back-to-back-move-pairs finding below). The *server*, however,
  paces real movement at roughly **500ms+ per hop** regardless of how fast the client sends (consistent
  with a ROM/Diku-style per-move recovery/lag mechanic) — so entries past roughly the 2nd-3rd slot in
  any deep burst are structurally guaranteed to still be honestly pending when their *own* 1200ms
  absolute deadline expires, even though the server is correctly, un-stuck, working through them one at
  a time. **The bug is that the plan's timeout was modeled on `useCompassBlock`'s single-in-flight-move
  1200ms value, which has no notion of queue depth — it silently assumed one pending entry at a time.**
  **Fix, empirically validated at full-corpus scale**: make the timeout **head-of-queue-relative**
  (1200ms of no resolution activity *since an entry became the front of the queue*, not since it was
  originally sent) instead of absolute-from-send-time. Combined with CRITICAL #2's immediate-resolve
  mitigation, re-running the identical full corpus through this corrected algorithm drops the false-
  timeout rate from 44.7% to **5.4%** (1,909/35,364) — an 8× reduction, and the residual 5.4% is
  consistent with genuine multi-second stalls (combat interrupting movement, real disconnects) rather
  than an artifact of the measurement. **Step 2's Do section must specify head-of-queue-relative
  timing, not per-entry-absolute** — this is not a tuning nicety, it's the difference between the
  design working and silently failing on every autoleveling/macro session.
- **Consequence for UX, not just correctness:** under the corrected (head-of-queue-relative) timing,
  genuine successes deep in a big burst can take a long time to resolve **from the original send
  time** — p50 stays fast (297ms) but p95 is **24.2 seconds** and the max observed was **70.6 seconds**
  (a very deep burst working through real server-side pacing, hop by hop). This is realistic, not a
  bug: the move genuinely doesn't resolve until the server gets to it. Any UI/consumer of
  `movement-succeeded` (compass-block flash, autoleveling's own state) needs to tolerate this rather
  than assume near-instant feedback once queue depth exceeds 2-3 — flag as a Step 3/4/5 consideration,
  not something to "fix" by shrinking the timeout (that's what caused CRITICAL #3 in the first place).
- **Movement-failure vocabulary beyond "Alas...", corpus-confirmed directly in DSL MUD's own jsonl
  logs** (grep hits + quote reads only — no source code assumed for this server):
  - `"Alas, you cannot go that way.\n"` — 128/229 files, ~1,286 hits sampled. Already handled.
  - `"The <keyword> is closed.\n"` (templated, keyword genuinely varies) — 62/229 files. Directly
    confirmed real, and with MORE variety than first thought: `door` (`server.log-2026-08-13.jsonl:
    1829`, `n` → door-closed 171ms later), plus `gate`, `bridgegate`, `secret`, `boulder`, `travelers`
    all independently observed as the `<keyword>` across other sessions/months. **Not a fixed string**
    — needs a pattern (e.g. `/^The .+ is closed\.$/`), not a literal match, or every closed-door
    failure falls through to the timeout instead of resolving immediately. **False-positive trap**:
    the same "is closed" substring also turns up inside ordinary player chat — `"Cedarmold says 'The
    stairway is closed....'"` and a clan-tell mentioning `"The mirror is closed to..."` were both real
    hits for a naive substring search; the door-closed pattern must anchor on `^The ` (line start, no
    speaker prefix) to exclude says/tells/clan-chat, not just contain the phrase anywhere.
  - `"You are too exhausted.\n"` — confirmed real (`server.log-2026-01-23.jsonl:4068`; player retried
    the same blocked direction 3x in one session, ~0.6s and ~38s apart).
  - `"You aren't allowed in there.\n"` (guild-restricted room) — 6/229 files, confirmed real
    (`server.log-2026-05-03.jsonl:27227`); a repeat 3s later in the same session had an unrelated PK
    line ("Someone glares at you.") interleaved *before* the failure text — confirms raw-line failure
    scanning must not assume the failure line is immediately adjacent to the send.
  - `"You can't fly.\n"` (air sector, not flying) — 1/229 files, confirmed real
    (`server.log-2026-02-05.jsonl:970`).
  - `"You need a boat to go there."` and `"What?  And leave your beloved master?"` — worth watching
    for (both plausible in a ROM/Diku-lineage MUD, which DSL MUD's dialect resembles) but **grepped
    corpus-wide and never once found** — unconfirmed for DSL MUD specifically, not a source-verified
    fact the way it would be for `simulacrum`. Treat as low-priority/best-effort, not load-bearing.
  - `"That room is private right now."` — an initial `files_with_matches` pass reported 7 files, but
    none reproduced under direct content-mode re-grep on any of them; treat as a search-tool artifact,
    not a confirmed corpus occurrence either way (see reliability note below).
  Design takeaway: Step 2 needs an array of fixed failure substrings (Alas / exhausted / allowed /
  fly) plus one line-anchored regex for the templated door-closed message. The boat/master/private
  strings can be included defensively (they're free to check for) but shouldn't be treated as
  verified DSL MUD behavior.
- **Grep tool reliability note:** on this corpus, `files_with_matches` mode occasionally reported
  files that did not reproduce the same match under `content` mode on the identical pattern + file
  (happened for "room is private"). `content` mode was reliable every time it was cross-checked. Any
  future corpus claim built from a bare `files_with_matches` count should get one content-mode
  spot-check before being trusted.
- **The "stack-clearing tilde" (`accessibility-command.ts`'s `clearStackKey`/`flushQueue`) has ZERO
  real usage anywhere in the DSL MUD corpus** — grepped all 229 files for a literal `~` inside any
  `game:client:input` line, none found. (Whether DSL MUD's own server does anything with a bare `~` is
  unknown — not tested live, not source-available. Separately, `C:\Projects\merc-mud`'s C source, i.e.
  `simulacrum`'s codebase, has no server-side handling of one either — `comm.c:1833` only rejects `~`
  in new passwords — but that only speaks for `simulacrum`, not for DSL MUD.) The client-side feature
  is real and shipped (`accessibility-command.ts:45-56`, added 2025-12-19, commit `3cfd5a2`) but has
  never been exercised by a logged session against either server, so its interaction with an in-flight
  `movementTracker` queue can't be corpus-validated. Read `useGameCommand.ts:90-93`: `flushQueue` calls
  `queue.flushPending()` (drops only not-yet-sent `OutboundQueue` jobs) and `cancelDoAfterTimers()` —
  it does **not** touch anything already sent, so already-in-flight tracker entries should resolve
  normally after a mid-burst clear; this is reasoned from the game-client's own code (which is
  authoritative regardless of which MUD is on the other end), not observed, and belongs in Step 5's
  live-test checklist, not assumed safe.
- **Compound `;`-separated commands never appear literally on the wire** — zero `game:client:input`
  lines contain a literal `;` anywhere in the corpus, confirming `preprocessOutgoingCommand`'s
  client-side split (default `commandSplitChar: ';'`) always fires before send. The tracker will only
  ever see pre-split individual commands. No design change needed; confirms the existing assumption.
- **Real command bursts are routine, and frequently mix movement with non-movement commands — not
  just direction chains.** Full-corpus (229 files): **20,655** instances of two movement-token sends
  within 800ms of each other (the FIFO-queue scenario this plan targets is not a hypothetical edge
  case — it's constant in real play; this is also the direct cause of CRITICAL #3 above), plus **140**
  instances of a movement token immediately adjacent (within 800ms) to a bare `l` (look) send,
  overwhelmingly `l` *then* a direction (look, then pick an exit). Since `l`/`look` classifies as
  non-movement, the tracker must let it pass through unqueued/unaffected rather than assume every
  burst is direction-only — worth stating explicitly since the Goal's own example (`n;n;n;e;e;e`) is
  direction-only and doesn't surface this.
- **Timing-precision note, superseded:** the original 18-file pass's naive latency/dangling
  measurement (independent per-move search, not a real FIFO simulation) was explicitly retracted as
  unreliable. The full-corpus FIFO simulation above (CRITICAL #3) replaces it with a measurement that
  actually runs Step 2's proposed algorithm — that's the trustworthy number set now; nothing further
  to re-measure here until Step 2 is implemented and Step 5's live test can compare against it.

## Steps

### [x] 1. Shared movement classifier + centralize the "command sent" signal
- Do: New `apps/game-client/src/features/movement/classifyMovement.ts` — one function replacing
  both `useCompassBlock.ts`'s `normalizeExit` and `autoleveling-engine.ts`'s
  `isMovementCommand`/`MOVE_DIRS`, matching the corpus-verified token set. Trace and confirm the
  `sendRaw` prop chain (`MainContainer.tsx` → `CommandInput`/`useGameCommand`) actually terminates at
  `useGameConnection.ts`'s `sendTelnetData`; then move the `shatteredarchive:command-sent` dispatch
  from `useGameCommand.ts:55` into `sendTelnetData` itself (`useGameConnection.ts:146-156`) so it
  fires exactly once per physical send regardless of path (typed or programmatic), and remove the
  now-redundant dispatch from `useGameCommand.ts`. Also confirm (read `accessibility-command.ts`'s
  `preprocessOutgoingCommand`) exactly how a typed `n;n;n;e;e;e` line becomes multiple queued
  `sendLine` jobs — this is load-bearing for Step 2's queue to see each sub-command as its own send.
- Files: /workspace/shattered-archive/apps/game-client/src/features/movement/classifyMovement.ts
  (new), /workspace/shattered-archive/apps/game-client/src/hooks/useGameConnection.ts,
  /workspace/shattered-archive/apps/game-client/src/hooks/useGameCommand.ts,
  /workspace/shattered-archive/apps/game-client/src/features/accessibility/accessibility-command.ts
  (read only, to confirm the split — don't edit unless the split is actually wrong).
- Verify: a temporary debug log (or existing `dbg()`-style hook already used in
  `autoleveling-engine.ts`) confirms exactly one `command-sent` per physical send for both a typed
  single command and a compass-block click; typing `n;n;n` produces three separate `command-sent`
  events, not one.

### [x] 2. Shared movement tracker primitive
- Do: New `apps/game-client/src/features/movement/movementTracker.ts` — a FIFO queue of pending
  moves. Enqueues an entry when a `command-sent` line classifies as movement (Step 1's classifier).
  Resolves the **oldest** pending entry, in order, on whichever comes first: (a) `game:room-data`
  whose **`{room, sector, exits}`** differs from the last-known value (fetch/track last-known via the
  same mechanism `roomDataStore.ts` already uses) AND `room !== "darkness"` → success, carrying the
  new room — **`exits` must be part of the diff, not just `room`/`sector`**: the full-corpus
  re-verification (229 files) found 13.4% of real moves land in a differently-exited room that shares
  its *name* with the room just left (common in road/trail zone naming), which a `{room, sector}`-only
  diff would silently miss; (b) a `shatteredarchive:raw-data` line matching any of the corpus-confirmed
  failure vocabulary above — the fixed substrings (`"Alas, you cannot go that way."`, `"You are too
  exhausted."`, `"You aren't allowed in there."`, `"You can't fly."`, plus the two zero-corpus-hit but
  still server-real `"You need a boat to go there."` / `"What?  And leave your beloved master?"`) OR
  the templated, line-anchored door-closed pattern (`/^The .+ is closed\.$/`, matched against a
  trimmed line — must NOT match mid-line, or ordinary chat containing "is closed" false-positives —
  corpus-confirmed real: door/gate/bridgegate/secret/boulder/travelers keywords, all seen); (c) a
  `room_data` arrival whose `{room,sector,exits}` EXACTLY REPEATS the last-known value while an entry
  is pending → resolve the oldest pending entry immediately as `'ambiguous-repeat'` (own outcome kind,
  not silently ignored) rather than leaving it queued — covers both the same-name/same-exits case
  (two structurally distinct rooms that are client-indistinguishable, corpus-confirmed real, e.g. two
  "Thieves Row" segments) and a same-tick server-side drop; (d) a per-entry timeout, default 1200ms —
  **CRITICAL, corpus-validated: this timeout MUST be head-of-queue-relative (1200ms of no resolution
  activity since an entry became the FRONT of the queue), not absolute-from-send-time.** An
  absolute-from-send-time timeout (the original literal reading of "per-entry timeout") produces a
  44.7% false-timeout rate on the real corpus, because real autoleveling/macro bursts routinely enqueue
  10+ moves in the same millisecond while the server itself paces real movement at ~500ms+/hop — later
  entries in a deep burst are then structurally guaranteed to blow a same-tick 1200ms deadline even
  though the server is correctly still working through them. Switching to head-of-queue-relative timing
  (re-verified against the same full corpus) drops the false-timeout rate to 5.4%. Practical effect:
  a deeply-queued entry can take many seconds (p95 24s, observed max 71s in-corpus) to resolve from its
  original send time — expected and correct, not a bug; consumers of `movement-succeeded` must tolerate
  this once queue depth exceeds 2-3, not assume near-instant feedback (flag for Steps 3-5). A
  `room:"darkness"` arrival resolves nothing and does not update "last-known room" (so the eventual
  real room, once sight returns, is still correctly diffed against whatever it was before blindness).
  Re-dispatches `shatteredarchive:movement-attempt` (on enqueue) / `-succeeded` / `-failed` (on resolve)
  with the existing payload shape for backward compatibility (Constraints) — decide how `'ambiguous-
  repeat'` maps onto the existing succeeded/failed contract (leaning success, since the move usually
  did happen) and record the choice here once made.
- Files: /workspace/shattered-archive/apps/game-client/src/features/movement/movementTracker.ts
  (new), /workspace/shattered-archive/apps/game-client/src/features/room/roomDataStore.ts (read, and
  extend if last-known-room tracking belongs there rather than being duplicated).
- Verify: written against a small in-file test harness or manual trace (this module has no live
  server dependency, so a plain unit test is appropriate here even without a browser) confirming:
  three enqueued moves resolve in FIFO order against three room_data updates; a `darkness` room_data
  in between resolves nothing and doesn't break ordering; an "Alas" raw line resolves the oldest
  pending entry as failed without waiting for the timeout; a room_data update with the SAME `room`/
  `sector` as last-known but DIFFERENT `exits` still resolves as success (the corpus-confirmed
  same-name-different-room case above); an EXACT repeat of `{room,sector,exits}` while an entry is
  pending resolves it immediately as `'ambiguous-repeat'`, not left hanging (the "Thieves Row" case);
  a templated `"The gate is closed."` raw line resolves as an immediate failure via the door-closed
  regex, not just the literal "Alas" string; **critically, a simulated deep burst — e.g. 10 moves
  enqueued in the same tick, each resolving ~500ms apart — must NOT produce any timeouts for entries
  past the 2nd/3rd slot** (this is the head-of-queue-relative timing requirement; a naive
  absolute-from-send-time implementation will fail this specific case even though it passes the
  single-move cases above — this is exactly the gap the corpus-wide FIFO simulation caught, so this
  test case is load-bearing, not decorative).

### [x] 3. Migrate `useCompassBlock.ts` onto the tracker
- Do: Replace `pendingMoveRef`/the manual `game:room-data` listener/the manual `movement-succeeded`
  dispatch with a call into `movementTracker` from `move()`. Preserve the hook's external
  `hasExit`/`move` API exactly — `CompassBlock.tsx`/`CompassBlockMobile.tsx` should need zero
  changes.
- Files: /workspace/shattered-archive/apps/game-client/src/hooks/useCompassBlock.ts.
- Verify: `pnpm --filter game-client build` clean; existing compass-block consumers untouched (grep
  confirms no import changes needed in `CompassBlock.tsx`/`CompassBlockMobile.tsx`).

### [x] 4. Migrate `autoleveling-engine.ts` onto the tracker
- Do: Remove the independently-duplicated `boundOnMovementSucceeded`/direct `game:room-data`
  listener/timeout-only `waitForMovement` internals; have the engine's movement steps go through the
  same `movementTracker` (either by calling it directly, or by listening to its re-dispatched
  `movement-succeeded`/`-failed` events the way the module's own docstring already claimed it did).
  Re-examine whether `extractEventMoveKey`'s timestamp-staleness guard (`:344-354`) is still needed
  once the tracker itself guarantees strict FIFO ordering — simplify if it's now redundant, but don't
  remove safety margin without a clear reason recorded in the Progress log.
- Files: /workspace/shattered-archive/apps/game-client/src/features/autoleveling/autoleveling-engine.ts.
- Verify: `pnpm --filter game-client build` clean; re-read the full `bind()` listener list
  (`:440-540+`) to confirm nothing else was silently relying on the old direct `game:room-data`
  wiring.

### [x] 5. Queue-depth-aware `engageTarget` attempt timeout
- Do: Apply Step 2's head-of-queue-relative timeout finding to combat engagement, not just movement
  — same root cause (an absolute-from-send-time deadline blind to real server-side pacing), same
  fix shape, deliberately not a new timing scheme. Expose from `movementTracker` (or a small sibling
  primitive, if movement's resolution semantics — room diffing — don't generalize cleanly to a
  non-movement send) a general "how many sends are currently unresolved" count that
  `engageTarget` (`:1827-1890`) can read at the moment it sends the kill command (`:1866`). When
  that count is > 0, extend `attemptTimeout`'s effective deadline so it's measured from whenever the
  pipeline actually catches up to this command rather than from the original send instant — so a
  kill command queued behind a lag-inducing burst isn't abandoned (tries the next keyword, or gives
  up on the encounter) while still honestly pending. Don't change behavior for the common case (queue
  empty at send time): today's fixed 3-10s window stays exactly as-is then.
- Files: apps/game-client/src/features/autoleveling/autoleveling-engine.ts (`engageTarget`,
  `waitForEngageOutcome`), apps/game-client/src/features/movement/movementTracker.ts (expose the
  queue-depth read, if that's where it ends up living).
- Verify: unit test simulating a kill command sent immediately after N queued movement sends —
  `attemptTimeout` does not fire while the pipeline is still honestly working through the backlog;
  a kill sent with an empty queue keeps today's existing timeout behavior unchanged (regression
  guard). Flag as UNVERIFIED LIVE like Step 6 below — no corpus research measures kill-command
  server latency the way movement was measured, so the increment/threshold here is a reasoned
  extension of Step 2's finding, not itself corpus-proven; Step 6's live pass must include a
  deliberately-lagged attack and report back what's observed before this is trusted further.

### [ ] 6. Real-play verification against the live merc-mud instance
- Do: Deploy game-client to the dev/test stack (same recipe as the cartography plan's Constraints:
  `docker compose -f deploy/docker-compose.shattered-archive-experimental.yml build --no-cache
  game-client && ... up -d`, reachable at `game-client.shatteredarchive.dev`, backed by the
  `simulacrum` merc-mud instance). Log in with a real character and, using the browser-test tooling
  (`C:\Projects\Shattered-AI\tools\browser-test`) where screenshots help, exercise: (a) a single
  compass-click move that succeeds — confirm the compass UI updates correctly and promptly; (b) a
  single compass-click move aimed at a direction with no exit — confirm `movement-failed` fires via
  the "Alas" text almost immediately, not after the ~1200ms timeout (time it); (c) type a stacked
  compound command in the real command box mixing at least one guaranteed failure among several
  directions (adapt the user's `n;n;n;e;e;e` example to whatever the test room's actual layout
  allows, so at least one sub-command is guaranteed blocked) and confirm each sub-command resolves
  independently and correctly, in the order sent — this is the crux "stacked directions" case; (d)
  run one of autoleveling's existing scripted paths end-to-end (a short real training path) and
  confirm no regression — it still walks/fights/identifies normally; (e) deliberately get blinded (or
  find a genuinely dark room) and confirm the `"darkness"` sentinel doesn't falsely resolve whatever
  move was pending at the time; (f) deliberately induce lag right before an attack (send a burst of
  several movement commands, then immediately let autoleveling attack, or manually trigger `kill`)
  and confirm the encounter isn't abandoned/keyword-skipped while the attempt is still honestly
  pending — Step 5's actual target case.
- Files: none (verification only — record the actual steps + observed results in the Progress log).
- Verify: all six checks above pass against the real, live instance; timing evidence recorded for
  (b) showing the fix (not the timeout) is what resolved the failure; (f)'s observed behavior
  (does the lagged attack get abandoned or does it wait correctly) reported back either way, since
  Step 5's design is unverified until this runs.

## Progress log

- 2026-08-13T13:25:29-05:00 plan created, at the user's explicit request after they asked to fix the
  bug flagged (but deliberately not fixed) during the cartography plan's research, and specified the
  scope needed to include correctly resolving stacked/independent directions
  (e.g. `n;n;n;e;e;e`). Investigated before writing (no code changed yet): confirmed the bug exists
  TWICE, independently (`useCompassBlock.ts` and `autoleveling-engine.ts`, the latter NOT actually
  wired to the former's dispatched events despite its own docstring implying otherwise); confirmed
  typed/stacked commands are currently invisible to BOTH trackers (movement-attempt is only
  dispatched by compass-clicks and autoleveling's own segments); confirmed `;`-compound commands are
  a real, already-supported client convention (via `autoleveling-mudlet-import.ts`'s Mudlet-path
  splitting) rather than a merc-mud server feature (grepped the C source, no `;` handling exists
  there); traced both outbound routing paths (typed via `useGameCommand`/`OutboundQueue`, and
  programmatic via `shatteredarchive:send-command`) to their shared unification point,
  `useGameConnection.ts`'s `sendTelnetData`. This is why the plan is 5 steps, not a few lines — a
  shared primitive touching 3+ existing files, not a local patch.
- 2026-08-14T00:00:00-05:00 pre-Step-1 empirical hardening, at the user's explicit request to prove
  the design against real docker game logs (many sessions, many months) before writing code, sensitive
  to lag/chaining/stacking/dangling-queue-item edge cases. No step executed/checked — this deepened
  Context and amended Step 2's Do/Verify text. Swept 18 `server.log-*.jsonl` files spread Jan→Aug 2026
  (two throwaway node scripts, all headline claims re-verified with direct content-mode `Grep` quotes,
  not just file-count searches — one `files_with_matches` false-positive caught and flagged). Found one
  correctness-critical bug in the plan's own design before it was built: Step 2's `{room, sector}`-only
  success diff would silently miss ~11% of real successful moves (848/7,559 sampled) because this
  world's road/trail zones routinely reuse a room *name* across distinct, differently-exited rooms —
  fixed by adding `exits` to the diff, now reflected in Step 2. Also expanded the failure-text
  vocabulary from a single "Alas" string to the full corpus-confirmed `move_char()` failure set
  (exhausted / not-allowed / can't-fly / templated door-closed, plus two real-but-zero-corpus-hits
  strings) — also folded into Step 2. Confirmed by negative evidence: the accessibility "clear stack"
  tilde has never once been used in any logged session (code exists, real usage doesn't — flagged for
  Step 5, not corpus-provable) and typed `;`-compound commands never appear literally on the wire
  (client-side split confirmed to always fire pre-send). Confirmed by positive evidence that stacked/
  overlapping pending moves are routine in real play (4,483 back-to-back move sends within 800ms
  across the sample) and that movement bursts really do mix in non-movement commands like `l` (35
  instances) — both already anticipated by the plan's Goal/Step 2 design, now with real numbers behind
  them instead of just the one worked example. One earlier timing/dangling-count analysis pass was
  run and explicitly retracted as unreliable (confounded by the same-name-room blind spot above) rather
  than reported as fact — see the caveat in Context.
- 2026-08-14T00:15:00-05:00 correction: the user flagged that the pass above wrongly cross-referenced
  `C:\Projects\merc-mud`'s C source (`simulacrum`'s codebase — this repo's own separate in-house
  dev/test MUD) as if it explained the corpus, when the corpus is actually real play against **DSL
  MUD** (`dsl-mud.org:4000`, the default `GAME_PROXY_ALLOWLIST` entry per `apps/game-server/.env` /
  `docs/game-server.md`) — a different, external server whose own source isn't available to us. The
  underlying empirical findings (quotes read directly from the jsonl corpus) were confirmed still
  correct; only the attribution/framing was wrong. Reworked the Context bullets above so every claim
  stands on the DSL MUD corpus alone, downgraded the boat/beloved-master/private-room strings from
  "corpus-confirmed real negative" to "unconfirmed for DSL MUD, worth including defensively," and
  independently re-verified the door-closed message directly from the corpus (no source-code
  inference): it's templated across at least 6 real keywords (door/gate/bridgegate/secret/boulder/
  travelers) and also caught a false-positive trap — the literal substring "is closed" also appears
  inside ordinary player chat/tells, so the eventual regex must anchor on line-start (`^The `) to
  exclude speaker-prefixed lines like says/tells/clan-chat.
- 2026-08-14T00:30:00-05:00 the user pushed back on the 18-file sample as insufficient for "critical
  functionality" and asked for a wide net over all logs — correct call, it surfaced the single biggest
  finding of this whole research effort. Reran against all 229 files (directory walk, not a curated
  list) with a script that simulates the ACTUAL proposed FIFO+timeout algorithm end-to-end, not just
  isolated resolution conditions. Result: the plan's original per-entry absolute-timeout design would
  misclassify 44.7% of all real movement as failed-by-timeout, because real autoleveling/macro bursts
  routinely enqueue 10+ moves in the same millisecond while the server paces real movement at ~500ms+
  per hop — root-caused to a specific corpus example (`server.log-2026-01-01.jsonl`, a 14-command
  same-tick burst) before proposing a fix, not just inferred from the aggregate number. Fix (switching
  the timeout to head-of-queue-relative instead of absolute-from-send-time) was itself re-validated
  against the same full corpus, dropping the false-timeout rate to 5.4% — an 8x improvement, and now
  written into Step 2's Do/Verify text as a hard requirement, not a tuning suggestion. Also upgraded
  the same-name-room finding from 11.2%→13.4% at full scale, and discovered a SECOND, previously-
  dismissed-as-hypothetical case is real: two rooms can share room name, sector, AND exit set (two
  "Thieves Row" segments, confirmed via the room's own description text) and be genuinely
  indistinguishable client-side — added an `'ambiguous-repeat'` resolution path to Step 2 to stop this
  (and same-tick drops generally) from blocking the FIFO queue. Net effect: Step 2's Do section grew
  substantially and now specifies mechanism-level requirements (head-of-queue timing, a third
  resolution outcome) that the earlier passes' language didn't capture, because they never actually
  ran the algorithm against real burst depths — a good reminder that resolution-condition-only checks
  are not a substitute for simulating the real queue.

- 2026-09-12T20:05:00Z plan extended (user ask) — while investigating a separate "auto-leveling
  attacks the wrong mob" report, confirmed `engageTarget` (autoleveling-engine.ts, added since this
  plan was first written) already does negative-finding/combat-start detection for attacks — so the
  user's "engine should notice attack results" framing was already true for that part. What's
  actually missing is the SAME flaw this plan already proved and fixed for movement: `engageTarget`'s
  `attemptTimeout` is a flat, absolute-from-send-time window with no queue-depth awareness, so a kill
  command sent right after a lag-inducing burst can time out and get abandoned while still honestly
  pending — the combat-side analog of this plan's own CRITICAL #3 finding. Added Context bullet
  documenting the current `engageTarget`/`waitForEngageOutcome` line numbers and the specific gap.
  Inserted **new Step 5** (queue-depth-aware `engageTarget` timeout, reusing Step 2's head-of-queue-
  relative principle rather than inventing new timing logic) ahead of the live-verification step,
  which is renumbered **Step 6** and gained a 6th checklist item (a deliberately-lagged attack).
  Explicitly flagged Step 5 as UNVERIFIED LIVE, same caveat class as this plan's own Step 5-now-6 —
  no corpus research measures kill-command server latency the way movement was measured, so this is
  a reasoned extension of a proven finding, not itself corpus-proven. Not yet implemented.

- 2026-09-12T20:45:00Z step 1 done — checked `[x]`. New
  `apps/game-client/src/features/movement/classifyMovement.ts`: `MOVE_DIRS` is now exactly the
  10 corpus-verified tokens (dropped the dead `up`/`down` full-word entries from
  autoleveling-engine's old copy, exactly as flagged — real corpus never sent them as a bare
  command); `classifyMovement()` replaces `isMovementCommand` (autoleveling-engine.ts, 3 call
  sites migrated); `normalizeExit`/`exitsToSet`/`DIR_TO_COMMAND` replace useCompassBlock.ts's own
  copies (kept the long-form ("north") tolerance there — that's a distinct concern from
  classifying an outbound SEND, which never uses long form). `useCompassBlock.ts` re-exports
  `CompassDirection` from the new module so its 4 existing consumers (CompassBlock.tsx,
  CompassBlockMobile.tsx, useRightPaneHud.ts, useLayoutShell.ts) needed zero changes. Traced the
  `sendRaw` chain: confirmed `useGameConnection.ts`'s exported `sendRaw` is a thin wrapper over
  `sendTelnetData` (:315-320), so it IS the same physical send point regardless of caller.
  Centralized `shatteredarchive:command-sent`: moved the dispatch from
  `useGameCommand.ts`'s `sendLineRef.current` into `sendTelnetData` itself
  (`useGameConnection.ts`), right after a successful `ws.send()` — the one place every path
  (typed pre-alias, typed-then-`executeAlias`-resent, programmatic `shatteredarchive:send-command`)
  actually funnels through. Confirmed by reading `userScriptRuntime.ts`'s `executeAlias` (:815-934)
  and `runtimeSingleton.ts`'s constructor (no custom `sendCommand` override passed, so it's the
  default `DispatchEvent('shatteredarchive:send-command', {cmd})`) — EVERY real send, alias-
  rewritten or not, ends up at `sendTelnetData`, so the new single-dispatch-point claim is
  verified, not assumed. Also confirmed the `;`-split mechanics precisely (was previously
  unconfirmed): typed input splits via `accessibility-command.ts`'s `splitKeepEmpty` (blank
  segments preserved, matching the Constraints' `n;;s` requirement) into `OutboundQueue` jobs;
  each drained job is independently alias-checked via `executeAlias`, which does its OWN
  `aliasSplitChar` split (a no-op here since each job is already a single segment) before
  falling through to `this.sendCommand(rawPart)` when nothing matches. 11 new tests
  (`classifyMovement.test.ts` — every real token classified, case-insensitivity, the dropped
  up/down forms rejected, non-movement/blank rejected, `normalizeExit`/`exitsToSet` short/long/
  invalid forms); 347/347 total tests + tsc clean. No test added for the `command-sent`
  relocation itself — neither hook has existing test coverage (no WebSocket/hook test harness
  precedent in this repo) and the change is a pure relocation, not new logic; Step 5's live
  verification is the right place to confirm it end-to-end (a debug listener showing exactly one
  `command-sent` per physical send, both typed and programmatic).

- 2026-09-12T21:10:00Z step 2 done — checked `[x]`. New
  `apps/game-client/src/features/movement/movementTracker.ts` — a class-backed singleton
  (`movementTracker`) with an idempotent `bind()`/unbind lifecycle. Listens to
  `shatteredarchive:command-sent` (enqueue on a `classifyMovement` hit), `game:room-data`
  (`{room,sector,exits}` diff via a dedicated `sameRoom()` comparing exits as a joined ordered
  list — darkness resolves nothing and never updates `lastRoom`), and `shatteredarchive:raw-data`
  (fixed failure substrings + the line-anchored `/^The .+ is closed\.$/` door regex). Timeout is
  HEAD-OF-QUEUE-RELATIVE exactly as specified: a single `headSince` timestamp (not per-entry) is
  armed whenever the queue transitions from empty to non-empty or a resolve leaves a new front
  entry, checked by a 100ms `setInterval` poll against the 1200ms window — this is the actual
  mechanism CRITICAL #3 needed, not per-entry absolute deadlines.
  **Decisions recorded, as the plan asked:** (1) `'ambiguous-repeat'` maps onto
  `movement-succeeded` (the plan's own leaning — the move usually did happen, and a real failure
  would separately be caught by `onRawLine`'s failure-text check). (2) A timeout ALSO maps onto
  `movement-failed` (not explicitly pre-decided by the plan, but the same class of decision) —
  `reasonLine: '(timeout)'` distinguishes it from an explicit server failure line for any
  consumer that wants to tell the two apart; treating "nothing confirmed within the window" as a
  failure is the conservative default so a caller doesn't hang forever waiting for a resolution
  that may never come. **Deliberately NOT wired into the live app yet** (no `bind()` call from
  any app entry point) — Steps 3/4 migrate `useCompassBlock.ts`/`autoleveling-engine.ts` onto
  this tracker; binding it now, before their own independent `movement-attempt` dispatches are
  removed, would double-fire that event for every real move until then. 10 new tests
  (`movementTracker.test.ts`, `jest.useFakeTimers()` — this module's 1200ms timeout and the
  deep-burst pacing case both need precise fast-forwardable time, unlike autoleveling-engine's
  own real-timer test style): FIFO resolution order, darkness resolves nothing without breaking
  order, same-room-different-exits still resolves success, an exact repeat resolves immediately
  as succeeded, an "Alas" line resolves without waiting for the timeout, the templated
  door-closed regex fires, the "is closed inside chat" false-positive trap does NOT fire, a
  non-movement send is never enqueued, a genuine 1200ms-with-no-signal case times out, and the
  corpus's own load-bearing case — 10 moves enqueued in the same tick, each resolved ~500ms apart
  by simulated server pacing — produces ZERO timeouts (this is the exact scenario that broke the
  original absolute-timeout design in the corpus research). 357/357 total tests + tsc clean.

- 2026-09-12T21:35:00Z steps 3+4 done — checked `[x]` both. **`useCompassBlock.ts`**: removed
  `pendingMoveRef`/`pendingTimerRef` and the 1200ms absolute-timeout `move()` logic entirely, and
  the separate `shatteredarchive:movement-attempt` listener it used to keep `pendingMoveRef` in
  sync — `move(dir)` now just dispatches `shatteredarchive:send-command`; the shared
  `movementTracker` (bound once at app scope, see below) picks it up automatically off the
  resulting `command-sent` signal and dispatches `movement-succeeded`/`-failed` itself. The
  `game:room-data` effect is now display-only (updates `exitSet`/`roomDataStore`, no pending-move
  bookkeeping). External API (`hasExit`, `move`) unchanged — confirmed zero changes needed in
  `CompassBlock.tsx`/`CompassBlockMobile.tsx`. **Bind point**: added
  `React.useEffect(() => movementTracker.bind(), [])` to `MainContainer.tsx` (alongside the
  existing app-lifetime `useGameConnection()`/plugin-registration calls) — deliberately NOT tied
  to `useCompassBlock`'s own mount lifecycle, since the compass panel isn't guaranteed to stay
  mounted for the whole session and autoleveling's own movement gating must keep working
  regardless. **`autoleveling-engine.ts`**: removed the direct `game:room-data` listener that
  synthesized `{cmd: this.moveWait?.cmd, dir: this.moveWait?.dir, ts: now()+100, room: payload}`
  on every arrival (Bug 2 itself — this is what made ANY room_data "succeed" the current wait,
  never diffing anything) and replaced it with two listeners on the tracker's own
  `shatteredarchive:movement-succeeded`/`-failed`, both feeding a new
  `boundOnMovementResolved(outcome, ev)` (generalizes the old `boundOnMovementSucceeded`, same
  cmd/dir/ts matching against `moveWait` via `extractEventMoveKey`). `sendCommand` no longer
  dispatches `movement-attempt` itself (the tracker does, off `command-sent`) — was a straight
  removal, `classifyMovement` stayed needed there for nothing once that line was gone, confirmed
  via grep it's still used elsewhere (`waitForMovement`'s `expectedDir` computation, the round
  loop's own move classification). **Deliberate behavior change, flagged prominently per the
  plan's "record it" standard**: a `movement-failed` whose `reasonLine` is exactly the tracker's
  own `'(timeout)'` marker now resolves as an ordinary **non-fatal** `'failed'` (logged, round
  continues) — previously ANY movement timeout was fatal (`this.stopping = true`, aborts the
  entire run). This is intentional: under the OLD absolute-timeout design a timeout was mostly a
  false positive (44.7% per the corpus), so treating it as catastrophic sort-of made sense as an
  escape hatch; under the NEW head-of-queue-relative tracker, its own fast ~1200ms timeout firing
  is a corpus-confirmed **normal, non-bug occurrence** (~5.4% of moves — "genuine multi-second
  stalls, combat interrupting movement, real disconnects"), so aborting the whole run over one
  slow hop would now be overly aggressive. `waitForMovement`'s own `idleTimeoutMs`-based timer
  stays as a much-larger BACKSTOP, still fatal, but now reserved for "the tracker itself never
  resolved at all" (not bound, a dropped listener) rather than being the primary detection path.
  **`extractEventMoveKey`'s stale-ts guard: kept as-is, NOT simplified** — considered removing it
  now that the tracker guarantees strict FIFO + the cmd/dir exact-match already guards against
  cross-move confusion, but found no strong evidence it's provably redundant (a manually-typed
  move interleaving with the engine's own moves in the shared queue is now genuinely possible,
  and the guard costs nothing) — matches the plan's own "don't remove safety margin without a
  clear reason" instruction. Also widened `MovementResult`'s `succeeded.room` type from a stale
  `string` to the real `RoomSnapshot` shape (`{room,sector,exits}`) it was always actually
  receiving. Updated the two pre-existing "engine round order" tests to emit
  `shatteredarchive:movement-succeeded` instead of the old bare `game:room-data` (which no longer
  resolves anything by itself, by design). 3 new tests covering the migration's real behavior
  changes: an explicit `movement-failed` is non-fatal and the round still completes through
  move.post/reset; a `(timeout)`-flagged one is ALSO non-fatal (the deliberate change above); the
  backstop timer still fires (fatal) when nothing resolves at all. 360/360 total tests + tsc
  clean.

- 2026-09-12T21:50:00Z step 5 done — checked `[x]`. `waitForEngageOutcome` reused
  `movementTracker.pendingCount()` (already existed as a test/debug seam from Step 2 — no sibling
  primitive needed, movement's own resolution semantics don't need to generalize since this is
  purely a queue-DEPTH read, not a room diff) rather than building anything new. Implementation:
  the original single `setTimeout(t)` stays exactly as the entry point (zero behavior change for
  the common queue-empty case — verified by a regression test), but when it fires it now checks
  `pendingCount() > 0` first; if backed up, it accumulates `backedUpMs` and reschedules a 250ms
  recheck instead of resolving, so that time is excluded from the attempt's own elapsed budget.
  Once the queue drains, the attempt gets the REMAINDER of its own window (not an immediate
  fire) — matching "measured from whenever the pipeline actually catches up" literally, via a
  time-exclusion rather than a second timer scheme. Success/not_here resolution (GMCP `isFighting`
  / "They aren't here", both handled elsewhere) is completely untouched and still resolves
  instantly regardless of queue depth — only the give-up path is deferred. 3 new tests: a
  regression guard (queue empty throughout → identical timing to before); the deferred-then-fires
  behavior (spied `pendingCount()` returning 2, confirmed NOT resolved well past the original
  deadline, then set to 0 and confirmed it fires after exactly the remaining window); and a
  same-tick success signal resolving immediately even with `pendingCount()` spied at 5 (proving
  the two paths are independent). Used `jest.spyOn(movementTracker, 'pendingCount')` rather than
  driving the real tracker's own event/timer lifecycle — decouples this unit test from
  `movementTracker`'s own internal timing (already covered by its own 10-test suite), avoiding a
  real risk this session caught while designing the test: the tracker's OWN 1200ms head-timeout
  would otherwise race with and confound the attemptTimeout's much longer window inside the same
  fake-timer advance. 363/363 total tests + tsc clean. Flagged (per the plan's own instruction)
  as UNVERIFIED LIVE — the 250ms recheck interval and the decision to exclude 100% of backed-up
  time (rather than some partial credit) are reasoned choices, not corpus-proven; Step 6's live
  pass must include a deliberately-lagged attack and report back before this is trusted further.
  All of Steps 1-5 (everything not requiring a live DSL session) are now done; Step 6 is the only
  remaining step and needs the user driving a real session — it should also confirm Step 4's
  behavior change (a single slow movement hop no longer aborts the whole run) feels right in
  practice, not just in tests.
