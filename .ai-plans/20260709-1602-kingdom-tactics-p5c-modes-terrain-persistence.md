# Plan: Kingdom Tactics — Phase 5 · Part C — deferred expansions (modes, terrain, army/persistence, server reuse)

Created: 2026-07-09T16:02:00-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Handle the v1 simplifications deliberately deferred from Parts A/B so they are tracked and eventually built: multi-side/special game modes, authored terrain maps + arena selector, army-builder expansions + persistence, and having the server adopt the shared `buildMatch` factory.

> STATUS: **ACTIVE** (promoted 2026-07-09 after Parts A + B COMPLETE — user asked to complete C).
> These are the items flagged "fine, but don't lose them — slot in at the end" during the 2026-07-09 review.
> Each step is independently workable. OWNERSHIP: Claude (engine + client), per review.
> DEPENDS ON: Parts A + B (engine `setup/buildMatch`, client scaffold/arena/match/builder/scenario) — both DONE.

## Goal
Remove the Part-A/B v1 shortcuts one item at a time, each shipped green + smoke-verified: the client supports
all nine modes on real authored maps, the builder supports both armies + saved armies + persistence, and the
server no longer hand-builds its duel. No single "done" gate — this is a backlog; check items off as shipped.

## Constraints
- Same repo rules as Parts A/B (client renders / engine decides; isomorphic engine; local jest; refresh
  `.annotated`/`.ai-context`; host build/test verification; Claude-owned).
- Additive only — do not regress the Part-A/B playable core; extend `buildMatch`/mode configs/data rather than
  forking logic.

## Context — deferred surfaces
- `buildMatch` (Part A) asserts 2-side, non-squadron modes; `GameModeConfig` already models `sides`,
  `usesSquadrons`, `asymmetric`, `victory`, `terrainProfile` for the rest.
- `model/squadron.ts` `Squadron`/`BoardToken` exist for Battle; `data/balance/terrain.ts` holds per-terrain
  tactical properties; `ROADMAP.md` lists Beastiary units for Horde and the nine `GameModeId`s.
- Server `apps/kingdom-tactics-server/src/ws/kt-gateway.ts` currently hand-builds `createDuelMatch()`.
- Online multiplayer (wiring the client `net` slice to `/ws/kt`) is **Phase 7**, NOT this doc — kept separate.

## Steps (backlog — order/scope adjustable when activated)

### [x] 1. (CLAUDE) Multi-side & special modes in buildMatch + client — **FFA shipped; squadron/horde deferred**
- Done (2026-07-09): **FFA / multi-side.** `buildMatch` now deploys 2–4 sides, each on its own board edge
  (0 bottom, 1 top, 2 left, 3 right); dropped the 2-side assertion (engine turn-order + rout victory were
  already N-side). Client: `MatchScreen` gives Greedy AI every non-human side (1v1 and 3–4-side FFA alike);
  army-builder enables non-squadron rout modes incl. FFA and mirrors the built army to all `mode.sides`;
  arena/HUD already sides-aware (4 side colors + per-side counts). Engine test (4-side FFA on distinct edges,
  playable) + client test (builder → 4-side FFA, HUD shows all opponents). HOST: engine 138/138, client
  19/19, tsc + vite build clean.
- **Deferred (own future phases — need new engine subsystems, out of scope here):**
  - `battle`/`siege` (squadron combat): `buildMatch` throws on `usesSquadrons`. Needs a squadron
    deploy + combat subsystem in the reducer (Squadron model exists; resolution does not).
  - `siege` structures + `destroy-objective`, `objective` `control-point`: need authored wall/gate/
    objective/control-point tiles (overlaps Step 2 terrain) before those victory conditions can decide.
  - `horde` `survive-waves`: needs a wave-spawner (AI reinforcement waves from Beastiary units).
- Verify (HOST): engine + client build/test green (done for the FFA slice).

### [x] 2. (CLAUDE) Authored terrain maps + arena selector
- Done (2026-07-09): `buildMatch` takes `opts.terrain: 'flat' | 'authored'` (default `flat`, backward-compatible).
  `authored` seed-scatters terrain from `mode.terrainProfile` into the board interior (2-tile margin so
  deployment zones stay open): `arena` → Forest (cover + blocks LoS); `open-field` → Forest + a little
  impassable Water; else flat. Deploy tiles are always forced back to `Field` so a match is playable on any
  generated map; deterministic per (mode, seed). Terrain effects already flow through `rules/`. Client:
  threaded `terrain` through `MatchStartPayload` → `useMatch` → `buildMatch`; added a **Map** selector to the
  army-builder (Flat / Authored ({profile})); arena renders terrain colors (forest/water/mountain/hills).
  Engine test (authored adds Forest, deploy tiles stay Field, reproducible, playable) + client test
  (Authored → Forest tiles render in the match). HOST: engine 139/139, client 20/20, tsc + vite build clean.
- Deferred with Step 1: siege walls/gates + `objective` control-point tiles (need the objective/control-point
  victory subsystems, not just tiles). Structural `feature`s are modeled (`TileFeature`) but not yet placed.
- Verify (HOST): builds/tests green; terrain visibly affects a smoke match (Forest cover + Water impassable). ✓

### [x] 3. (CLAUDE) Army-builder expansions — both armies, opponent selection, saved armies
- Done (2026-07-09): Per-side editing for 2-side modes — an "Edit army: You / Opponent" toggle with
  `picksBySide` state; a side left empty is mirrored from side 0 (FFA still mirrors side 0 to all). Named
  saved armies via `state/saved-armies.ts` (localStorage-backed list/save/overwrite/remove, guarded) with a
  Save row + a Saved-armies list (Load into the edited side / Delete). Tests: `saved-armies.test.ts` (CRUD,
  blank-name reject, persistence) + builder tests (asymmetric both-sides deploy 1 vs 2; save→remove→load).
  HOST: client 24/24, tsc + vite build clean.
- Verify (HOST): builds/tests green; two asymmetric armies play; save/reload an army. ✓

### [x] 4. (CLAUDE) Persistence + hot-seat
- Done (2026-07-09): saved armies already persist (Step 3). Added `state/last-match.ts` (localStorage
  save/load/clear of the last `MatchStartPayload`) — `MatchScreen` saves on mount; MainMenu shows a **Play
  last** button (replays the persisted setup). Hot-seat: `MatchStartPayload.hotSeat`; `MatchScreen` runs no
  AI and lets the local player control whichever side is active (banner shows the winning side, not
  victory/defeat); a **Hot-seat Match** menu button + a builder **Hot-seat** checkbox (2-side). Tests:
  `last-match.test.ts` (round-trip/clear), `MatchScreen` hot-seat (End turn hands to the other human seat, no
  AI auto-play), App "Play last" integration.
- Verify (HOST): client `test` 28/28, tsc + vite build clean. ✓ (verification ran once the classifier
  recovered.)

### [x] 5. (CLAUDE) Server adopts the shared buildMatch factory
- Done (2026-07-09): removed the server's hand-built `createDuelMatch()` in `ws/kt-gateway.ts`; the
  `MatchRegistry` default now deploys via `buildMatch('duel', DEFAULT_DUEL_ROSTERS, this.providers, {seed})`
  — client and server build matches through the same engine factory. Token ids are now the factory's
  `s{side}-u{i}`; updated the gateway's wrong-seat test to move `s1-u0` (preserving its seat-ownership
  intent). Dropped the now-unused Board/Tile/Unit imports.
- Verify (HOST): server `build` clean + `test` 10/10 (join reply, legal-action AI drive, wrong-seat +
  unknown-match errors, full duel → `over` winner 0). ✓

## Progress log
- 2026-07-09T20:30 **PART C COMPLETE** (Claude, host-verified). Shipped Steps 1–5: multi-side/FFA deployment
  in `buildMatch` + sides-aware client; opt-in authored terrain maps + Map selector; per-side army building +
  localStorage saved armies; last-match persistence ("Play last") + hot-seat; and the server adopting the
  shared `buildMatch` factory. **Deferred to future phases (documented in Steps 1–2):** squadron combat
  (battle/siege), objective/control-point tiles + their victory subsystems, and horde wave-spawning — each a
  new engine subsystem beyond this client/setup-layer phase. FINAL HOST VERIFY (after a classifier outage
  cleared): engine `build` clean + `test` **139/139**; server `build` clean + `test` **10/10**; client `test`
  **28/28**, tsc + vite build clean. Doc **Status: COMPLETE** — Phase 5 (Parts A + B + C) done.
- 2026-07-09T16:20 plan created (Claude) as the PLANNED backlog capturing Phase-5 deferred items (multi-side/
  special modes, authored terrain + arena selector, army-builder expansions + persistence + hot-seat, server
  buildMatch adoption). Online multiplayer stays with Phase 7 (net). Not started.
