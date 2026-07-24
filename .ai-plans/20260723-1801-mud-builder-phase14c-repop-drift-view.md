# Plan: MUD Builder — Phase 14c (live repop drift: game-side state snapshot + boot-vs-live diff)

Created: 2026-07-23T18:01:00-05:00 · Workspace: /workspace/shattered-archive · Status: ABANDONED
Task: Show builders what the world looks like NOW vs the boot-state simulation — which
spawns are dead/looted, what players dropped, current door states — via a crash-safe
FILE-BASED snapshot handshake with the running game (the second sanctioned engine C change,
after 12b).

> One of three Phase 14 candidate plans (14a/14b/14c) drafted 2026-07-23. When one is chosen
> for execution, set the other two to ABANDONED (revivable). All steps are (CLAUDE) — sized
> for Claude Opus execution. This is the only candidate that touches C and requires a game
> container recreate to deploy (user-approved dev-time downtime posture).

## Design decision (recorded)
Phase 13's close-out said "read-only socket", but the chosen transport is the SIGNAL-FILE
pattern already proven by reload.signal/copyover.signal: zero new network surface, reuses
the existing update_handler pulse hook, atomic tmp+rename writes, and the shared area bind
mount. A socket adds attack surface and descriptor-lifecycle risk for no builder-visible
gain — snapshot freshness of a pulse or two is plenty for a drift view. If the user wants
push-streaming later, that is a separate phase.

## Goal
A "Compare live" action in the Simulate pane requests a snapshot (POST → request file), the
game writes `state.snapshot.json` within a pulse or two, and the pane annotates each room
with drift (missing mobs, extra objects, player counts, door-state changes); the Map tab's
spawn overlay gains a Boot/Live sub-toggle. Done when the C side passes `rom --state-test`
plus a soak (repeated request/consume cycles, RSS flat), all suites are green, a live E2E at
the edge shows REAL drift (kill a mob via telnet, the next snapshot reflects it), and hot
reload/copyover behavior is unaffected.

## Constraints
- **STABILITY IS KING.** The snapshot writer is a strictly READ-ONLY traversal of world
  state: no game-structure allocation, no string interning, no free-text strings emitted,
  bounded output, fprintf to `state.snapshot.tmp` then rename. Any failure (fopen fails,
  disk full) = `bug()`/log + skip, never a crash, never a stall. Measure the write cost on
  the full stock world FIRST (step 1's soak) — if it can't run comfortably inside a pulse,
  cap output further (rooms with contents only is already the design); incremental
  multi-pulse writing is OUT of scope.
- **Vnums and counts only — never names.** Room/mob/object names resolve CLIENT-side from
  the parsed model (the builder already knows every vnum). This kills JSON-escaping-in-C
  risk entirely (no game string ever enters the file) and keeps the snapshot small. Player
  presence = count per room, never character names (privacy).
- **Handshake:** builder writes `<area>/state.request`; the game, on its pulse, sees it,
  writes the snapshot, then unlinks the request. No request file = the game does nothing
  beyond one `stat()` per pulse (the same accepted cost model as reload.signal). The game
  NEVER reads request/snapshot contents into game state — one-way telemetry out.
- **Server routes:** `POST /api/state/refresh` is GUARDED (it writes into the shared dir)
  but NOT audited — extend audit.ts:52's exclusion (`/api/presence` idiom) to
  `/api/state`: it is a read trigger, not authoring, and would spam the audit log.
  `GET /api/state/live` is open (GETs stay open — Phase 9) and NEVER writes.
- **C changes are additive**: stock boot without the builder present must be
  behavior-identical (the pulse hook's no-request fast path). Self-test flag
  `rom --state-test` follows the `--mp-test`/`--skills-test` harness pattern.
- Deploy = game compose recreate from `/workspace/merc-mud/docker-compose.yml` (in-place
  binary swap + copyover is denied by policy — Phase 7 finding). Record StartedAt before
  and after: exactly ONE deliberate game restart in this phase, at step 5, and no other.
- qwen (container) must NOT run pnpm install|build|test; JS verification is a HOST task.
  qwen must also never build the C — compile verification is HOST docker work.
- pnpm quirk: no `--` before positional args.

## Context
(all file:line refs verified 2026-07-23 against current source)
- Pulse hook point: `/workspace/merc-mud/2.4/src/update.c:1043-1057` — `update_handler()`
  opens with the MUD Builder bridge block calling `area_reload_pulse()` and
  `copyover_pulse()` via extern decls; add `state_snapshot_pulse()` beside them, same shape.
- Signal-file conventions to copy: `/workspace/merc-mud/2.4/src/area_reload.c:50`
  (`#define RELOAD_SIGNAL_FILE "reload.signal"` — cwd-relative; the game container's cwd is
  `/opt/merc-mud/area`, the builder sees the same dir as `/mud/area`);
  `copyover.c:28` (`COPYOVER_SIGNAL_FILE`). Read area_reload_pulse's stat/consume flow
  before writing the new one — copy its discipline (tolerant, logged, never fatal).
- Live world state (verify exact iteration idioms in db.c/merc.h at execution time — do NOT
  trust this line blindly): rooms via the room_index hash (`room_index_hash[MAX_KEY_HASH]`
  chains), room contents via `room->people` (CHAR_DATA, `IS_NPC()` split for players vs
  mobs, `ch->pIndexData->vnum` for the mob vnum) and `room->contents` (OBJ_DATA,
  `obj->pIndexData->vnum`); door state via `room->exit[door]->exit_info` EX_CLOSED /
  EX_LOCKED bits. Map to the simulator's DoorState strings client-side, not in C.
- Simulator result shape to diff against:
  `/workspace/shattered-archive/services/merc-area/src/simulate.ts:71-125` — SimObjectNode,
  SimMobGroup (count-grouped!), SimRoomState, SimDoorState ('open'|'closed'|'locked'),
  SimulateResetsResult. NOTE: SimMobGroup groups identical loadouts with `count`; the live
  snapshot is flat per-vnum counts — the diff must SUM sim groups per vnum before comparing.
- Client Simulate pane: `apps/mud-builder-client/src/features/resets/SimulatePane.tsx` —
  merges rooms/doors/randomizedExits into per-room RoomView client-side; the drift column
  extends that merge. Map overlay: `features/map/MapPage.tsx` Phase 13 spawn badges
  (spawnCounts Map, "Spawns" toolbar checkbox) — the Live sub-toggle swaps the counts
  source, same badge rendering.
- Server route idioms: `routes/spawn.ts` (Phase 13, safe() taxonomy) for GET;
  `audit.ts:52` for the exclusion list; guard = standard bearer flow (Phase 9), config/area
  dir threading as in `routes/auth.ts`.
- Container↔host bind-mount latency (Phase 9 finding): host-side file appearance can lag —
  E2E drivers must POLL briefly, never assert immediately.
- Edge E2E: `node --use-system-ca` (mkcert CA), vhost not 127.0.0.1+Host (undici drops
  manual Host). Immortal/telnet access for the kill-a-mob check: see
  `docs/mud-builder/commands.md` + prior phase E2E logs for the connect pattern; the game
  port is in merc-mud's compose.
- Engine feature doc to update at close-out: `/workspace/merc-mud/2.4/doc/README.md`
  (started in 12b).

## Steps
### [ ] 1. (CLAUDE) C: state_snapshot.c/h + pulse hook + self-test + soak
- Do: new `state_snapshot.c/h` following area_reload.c's discipline. `state_snapshot_pulse()`:
  `stat("state.request")`; absent → return (the only cost when unused). Present → write
  `state.snapshot.tmp`: JSON `{"ts":<time(NULL)>,"rooms":[{"vnum":N,"mobs":[[vnum,count]...],
  "objs":[[vnum,count]...],"players":N,"doors":[[door,doorState 0|1|2]...]},...]}` — emit a
  room ONLY if it has any mob/obj/player or a closed/locked door; counts aggregated per
  vnum; players = non-NPC count; doorState 0 open / 1 closed / 2 locked from exit_info
  bits. All numeric — no game string is ever written (Constraints). Then `rename()` to
  `state.snapshot.json`, `unlink("state.request")`, one log_string line. Failure anywhere:
  bug() + leave request consumed (unlink even on failure, so a broken disk can't wedge a
  request loop). Wire the extern call into update.c:1051-1057's bridge block. Add
  `--state-test` to the harness pattern: sockets-free boot, plant a request, call the pulse,
  assert snapshot exists + starts with `{"ts":` + non-empty rooms, exit 0/1.
- Files: /workspace/merc-mud/2.4/src/state_snapshot.c (new), state_snapshot.h (new),
  update.c, Makefile (add the .o), plus the --state-test arm where --skills-test lives
  (find it in comm.c/main — grep at execution).
- Verify (HOST): build a THROWAWAY game image; `rom --state-test` passes; soak: script 100
  request→snapshot cycles in the throwaway container against the full stock world, assert
  every cycle completes <2s wall and container RSS is flat (docker stats sample first/last);
  live game untouched (StartedAt).

### [ ] 2. (CLAUDE) merc-area: snapshot types + drift diff (pure)
- Do: new `live-state.ts`: `LiveSnapshot` types + `parseLiveSnapshot(text)` (tolerant:
  malformed → null, never throw); `diffSpawnState(sim: SimulateResetsResult, live:
  LiveSnapshot) → { rooms: [{room, missingMobs: [{vnum, expected, actual}], extraObjects:
  [{vnum, count}], missingObjects: [...], players: number, doorChanges: [{door, boot,
  live}]}], summary: {roomsWithDrift, mobsMissing, objectsExtra, snapshotTs} }`. CRITICAL:
  sum SimMobGroup.count per vnum per room before comparing (groups are loadout-grouped —
  Context); objects compare room-level objects only (container contents drift is out of
  scope, note it in the doc comment); doors compare against SimDoorState with the 0/1/2 ↔
  'open'/'closed'/'locked' mapping. Export from index.ts.
- Files: /workspace/shattered-archive/services/merc-area/src/live-state.ts (new),
  live-state.test.ts (new), src/index.ts
- Verify (HOST): merc-area suite green (cases: clean world = zero drift, killed mob,
  player-dropped object, door opened, malformed snapshot → null); build clean (server
  resolves dist).

### [ ] 3. (CLAUDE) Server: routes/state.ts
- Do: `POST /api/state/refresh` — guarded (standard bearer flow), writes `state.request`
  into the area dir (content: ISO timestamp), 202 `{requested: true}`; if a request file
  already exists, 202 `{requested: false, note}` (dedup — the game will serve the pending
  one). NOT audited: extend the audit.ts:52 exclusion with `path.startsWith('/api/state')`
  and assert that in a test. `GET /api/state/live` — open, reads `state.snapshot.json`,
  returns `{snapshot, ageMs}` (mtime-based) or 404 `{error:'no snapshot yet'}`; never
  writes, tolerant of a torn/absent file (the C side renames atomically, so torn should be
  impossible — still guard). Register in app.ts after audit like every route. Tests (temp
  dir fixtures): guard 401, refresh writes the file, dedup path, GET 404-then-200, audit
  log does NOT grow on refresh, GET never creates files.
- Files: /workspace/shattered-archive/apps/mud-builder-server/src/routes/state.ts (new),
  routes/state.test.ts (new), src/audit.ts, src/app.ts
- Verify (HOST): `pnpm --filter @shatteredarchive/mud-builder-server test` green; build
  clean.

### [ ] 4. (CLAUDE) Client: drift UI in SimulatePane + Map live toggle
- Do: `api.stateRefresh()` + `api.stateLive()` in client.ts (typed via merc-area's
  LiveSnapshot). SimulatePane: "Compare live" button → POST refresh → poll GET (1s
  interval, ~10s bound) until `snapshot.ts` changes (or first snapshot appears) → run
  `diffSpawnState` → per-room drift annotations in the existing accordion (▼ missing mob
  w/ expected/actual, ▲ extra objects, 👤 player count, door drift line) + a "live as of
  Xs ago · Refresh" header; timeout → visible "game did not respond — is it running with
  the new engine? are writes enabled?" note (never a crash, never a spinner forever);
  drift state clears on area change. MapPage: when a live snapshot exists, the Spawns
  overlay gains a Boot/Live radio sub-toggle — Live swaps spawnCounts to live per-room mob
  totals (same badge rendering, amber badge variant class so the mode is visually
  distinct + legend entry). Boot-state disclaimer text updates to name both modes.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/api/client.ts,
  src/features/resets/SimulatePane.tsx (+test), src/features/map/MapPage.tsx (+test),
  features/map/map.css
- Verify (HOST): client suite green (mocked endpoints: drift renders, timeout path, map
  live-toggle swaps counts, boot mode unchanged); `npx tsc --noEmit` clean in the client
  package (vite build alone does not typecheck).

### [ ] 5. (CLAUDE) Deploy + live E2E + docs + close-out
- Do: deploy the new ENGINE: rebuild the game image from merc-mud's compose and recreate
  the game container (the ONE sanctioned restart — record StartedAt before/after and log
  both); rebuild+up the builder pair (experimental compose, `-p shatteredarchive`). E2E
  driver at the edge (`node --use-system-ca`): (1) POST refresh with a real key → 202;
  snapshot appears within poll bound; (2) GET /api/state/live parses, midgaard rooms
  present with sane counts vs /spawn; (3) drift proof: telnet as immortal, `slay` (or
  equivalent — commands.md) a known midgaard mob, refresh again → that room's diff shows
  the missing mob; (4) door drift: open a stock closed door in-game, refresh → doorChange
  reported; (5) hot reload STILL works (touch a trivial area change via the builder,
  reload.signal path applies — proves the new pulse code didn't disturb the bridge);
  (6) unauthenticated POST /api/state/refresh 401s; (7) audit.log did not grow from any
  refresh. Update `docs/mud-builder/README.md` (Phase 14c section + Scope: Simulate pane
  is now boot-AND-live) and `/workspace/merc-mud/2.4/doc/README.md` (engine feature:
  state snapshot handshake); refresh `.annotated`/`@ai-` headers for every touched dir
  (both repos). Mark plan COMPLETE.
- Files: (driver in scratchpad), /workspace/shattered-archive/docs/mud-builder/README.md,
  /workspace/merc-mud/2.4/doc/README.md
- Verify (HOST): all seven live checks logged with exact results; suites green across
  merc-area/server/client; exactly one game restart in the StartedAt log; kill processes
  via netstat+taskkill where local ones are involved (TaskStop alone not trusted).

## Progress log

- 2026-07-23T18:01 plan created (Claude) — one of three Phase 14 candidates the user asked
  to be drafted in executable detail. Transport decision recorded up top: signal-file
  handshake over a socket (stability: zero new network surface, proven pulse hook, atomic
  rename; freshness of ~a pulse is sufficient for a drift view). Verified before writing:
  update_handler bridge block (update.c:1043-1057), RELOAD_SIGNAL_FILE cwd convention
  (area_reload.c:50, copyover.c:28), audit exclusion idiom (audit.ts:52), simulator result
  shapes incl. the SimMobGroup count-grouping trap (simulate.ts:71-125). The db.c/merc.h
  iteration idioms in Context are flagged for re-verification at execution — the executor
  must read the actual hash-walk code, not trust the plan.
- 2026-07-24T00:00 plan abandoned (Claude) — user chose 14a (spell codegen assist) to
  execute first. Revivable: design decisions above still hold if picked up later.
