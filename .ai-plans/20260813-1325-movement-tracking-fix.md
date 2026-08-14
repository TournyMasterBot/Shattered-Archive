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

## Steps

### [ ] 1. Shared movement classifier + centralize the "command sent" signal
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

### [ ] 2. Shared movement tracker primitive
- Do: New `apps/game-client/src/features/movement/movementTracker.ts` — a FIFO queue of pending
  moves. Enqueues an entry when a `command-sent` line classifies as movement (Step 1's classifier).
  Resolves the **oldest** pending entry, in order, on whichever comes first: (a) `game:room-data`
  whose `{room, sector}` differs from the last-known value (fetch/track last-known via the same
  mechanism `roomDataStore.ts` already uses) AND `room !== "darkness"` → success, carrying the new
  room; (b) a `shatteredarchive:raw-data` line containing `"Alas, you cannot go that way."` →
  immediate failure; (c) a per-entry timeout (default 1200ms, matching today's
  `useCompassBlock` value) → failure with `reasonLine: 'timeout'`. A `room:"darkness"` arrival
  resolves nothing and does not update "last-known room" (so the eventual real room, once sight
  returns, is still correctly diffed against whatever it was before blindness). Re-dispatches
  `shatteredarchive:movement-attempt` (on enqueue) / `-succeeded` / `-failed` (on resolve) with the
  existing payload shape for backward compatibility (Constraints).
- Files: /workspace/shattered-archive/apps/game-client/src/features/movement/movementTracker.ts
  (new), /workspace/shattered-archive/apps/game-client/src/features/room/roomDataStore.ts (read, and
  extend if last-known-room tracking belongs there rather than being duplicated).
- Verify: written against a small in-file test harness or manual trace (this module has no live
  server dependency, so a plain unit test is appropriate here even without a browser) confirming:
  three enqueued moves resolve in FIFO order against three room_data updates; a `darkness` room_data
  in between resolves nothing and doesn't break ordering; an "Alas" raw line resolves the oldest
  pending entry as failed without waiting for the timeout.

### [ ] 3. Migrate `useCompassBlock.ts` onto the tracker
- Do: Replace `pendingMoveRef`/the manual `game:room-data` listener/the manual `movement-succeeded`
  dispatch with a call into `movementTracker` from `move()`. Preserve the hook's external
  `hasExit`/`move` API exactly — `CompassBlock.tsx`/`CompassBlockMobile.tsx` should need zero
  changes.
- Files: /workspace/shattered-archive/apps/game-client/src/hooks/useCompassBlock.ts.
- Verify: `pnpm --filter game-client build` clean; existing compass-block consumers untouched (grep
  confirms no import changes needed in `CompassBlock.tsx`/`CompassBlockMobile.tsx`).

### [ ] 4. Migrate `autoleveling-engine.ts` onto the tracker
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

### [ ] 5. Real-play verification against the live merc-mud instance
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
  move was pending at the time.
- Files: none (verification only — record the actual steps + observed results in the Progress log).
- Verify: all five checks above pass against the real, live instance; timing evidence recorded for
  (b) showing the fix (not the timeout) is what resolved the failure.

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
