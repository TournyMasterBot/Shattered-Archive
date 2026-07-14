# Plan: Kingdom Tactics — Phase 5 · Part B — army builder + scenario mode

Created: 2026-07-09T16:01:00-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Add the army-builder screen (pick race×class units under a mode's deployment budget, produce an `ArmyRoster`, start a match with it) and the scenario mode screen (drive both sides through `ScenarioSimulator`) onto the Part-A client core.

> STATUS: **ACTIVE** (promoted 2026-07-09 now that Part A is COMPLETE). Exactly one ACTIVE doc at a time —
> Part A is COMPLETE, Part C stays PLANNED until Part B completes.
> OWNERSHIP: Claude handles every step (per review 2026-07-09). Depends on Part A: the client scaffold,
> nav store, `providers` singleton, `Arena`/`useMatch`, `MatchScreen`, and the engine `buildMatch`/
> `ArmyRoster`/`validateRoster`/`rosterCost` from `setup/`.

## Goal
From the main menu the player can open the **Army Builder**: choose a 2-side mode, add/remove race×class units
with live per-unit costs and a running "remaining budget", and (when valid) "Start Match" — which builds a
mirrored/default opponent roster and hands `{modeId, rosters, seed}` to the Part-A `MatchScreen`. Separately,
**Scenario Mode** instantiates `ScenarioSimulator` over a built match and lets a single player step both sides
and inspect state/history. Done when client + engine `build`/`test` are green on host and both screens drive
in a dev smoke (build an army → play it; step a scenario).

## Constraints
- Same as Part A: client renders / engine decides; mirror `game-client`; React state/context (no router);
  local jest (jsdom); update `.annotated`/`.ai-context`. Reuse Part-A code — do not duplicate `useMatch`/`Arena`.
- Budget + validation come from the engine (`rosterCost`, `validateRoster`) — the client only renders and
  gates the "add" button; never re-derive costs.

## Context — verified surfaces (see Part A's Context for full detail)
- Engine `setup/`: `ArmyRoster {side, name?, picks:{raceKey,classKey}[]}`, `rosterCost(roster,p)`,
  `validateRoster(roster,mode,p)`, `buildMatch(modeId,rosters,p,{seed})` (added in Part A Step 1).
- Data providers: `IGameDataProvider.races()/classes()/unitTemplate(raceKey,classKey)` (has `.cost`);
  `IGameModeProvider.modes()/mode(id)` (`budget`, `budgetKind`, `board`, `sides`).
- `ScenarioSimulator` (engine `sim/`): `step`/`getState`/`history`/`isOver` (manual both-sides driver).
- Client (from Part A): `state/nav` screen store + payload, `state/providers`, `features/match/MatchScreen`,
  `features/arena/{Arena,useMatch}`, local jest config.

## Steps

### [x] 1. (CLAUDE) Army builder — pick units under the deployment budget
- Do: `features/army-builder/ArmyBuilder.tsx`:
  - Choose a mode (2-side modes enabled; others listed disabled — Part C enables them). List race×class options
    with each unit's `cost` (via `providers.data.unitTemplate`). Add/remove picks into an `ArmyRoster` for side
    0; show remaining budget = `mode.budget − rosterCost` (for `budgetKind:'units'`, remaining = `budget −
    picks.length`); block adds that would exceed the budget.
  - "Start Match" → build a mirrored/default opponent roster for side 1, assert `validateRoster` for both, then
    navigate to `MatchScreen` with `{modeId, rosters:[side0,side1], seed}`.
- Files: `features/army-builder/{ArmyBuilder.tsx,ArmyBuilder.test.tsx}`, `features/army-builder/.annotated` +
  `.ai-context`; nav/menu wiring to replace the Part-A stub.
- Tests (RTL): list shows costs from the provider; adding past budget is blocked; "Start Match" produces a
  roster that passes `validateRoster` and navigates with the right payload.
- Verify (HOST): client `build` + `test` green; dev smoke: build an army and start a match with it.

### [x] 2. (CLAUDE) Scenario mode — drive both sides via ScenarioSimulator
- Do: `features/scenario/ScenarioScreen.tsx`: instantiate `ScenarioSimulator` over a built match (default
  setup), render the arena with controls to `step`/advance, switch the controlled side (single player controls
  both sides per the brief), and inspect `history`/current state; an over indicator via `isOver`. Reuse
  `Arena` for rendering (read-only-ish variant).
- Files: `features/scenario/{ScenarioScreen.tsx,ScenarioScreen.test.tsx}`, `features/scenario/.annotated` +
  `.ai-context`; nav/menu wiring to replace the Part-A stub.
- Tests (RTL): stepping advances the scenario state; `history` grows; `isOver` reflected.
- Verify (HOST): client `build` + `test` green; dev smoke: step a scenario through several actions.

### [x] 3. (CLAUDE) Wire nav, refresh indexes, host sign-off (Part B complete)
- Do: finalize menu so army-builder + scenario are fully reachable (no stubs left); refresh `.annotated`/
  `.ai-context` for the new dirs; HOST `pnpm --filter @shatteredarchive/kingdom-tactics-client build && … test`
  (+ engine sanity); dev smoke of the full flow (menu → army builder → match → scenario). Set this doc
  `Status: COMPLETE`, check the box, append a final Progress-log summary, and **promote Part C to ACTIVE if
  you intend to work it** (otherwise leave Part C PLANNED as backlog).
- Files: nav/menu + index files.
- Verify (HOST): both packages build 0 + suites green; all four screens drive correctly.

## Progress log
- 2026-07-09T19:20 **Steps 2 & 3 COMPLETE — PART B COMPLETE** (Claude, host-verified).
  `features/scenario/ScenarioScreen.tsx` drives both sides over a `ScenarioSimulator` (no AI): the arena
  always controls the ACTIVE side (`controllableSide = activeSide`), so End turn hands control to the other
  side; HUD shows turn / controlled side / step count; a decided match shows a completion banner + Reset.
  `ScenarioScreen.test.tsx` (side-0 start, a move advances state + history, End turn switches control).
  Nav was already fully wired: the Army Builder + Scenario menu entries route to the real screens (both
  replaced their Part-A stubs via the same `ArmyBuilderScreen`/`ScenarioScreen` export names) — no stubs
  remain; refreshed `features/.ai-context` accordingly. FINAL HOST VERIFY: client `test` **18/18**, engine
  `test` **137/137**, `tsc --noEmit` clean, `vite build` clean. All four surfaces (menu → Quick Match,
  Army Builder → match, Scenario) drive in the RTL integration flow. Doc set **Status: COMPLETE**;
  **Part C promoted to ACTIVE**.
- 2026-07-09T19:00 **Step 1 COMPLETE** (Claude, host-verified). `features/army-builder/ArmyBuilder.tsx`
  (replaces the Part-A stub via same `ArmyBuilderScreen` export): mode selector (2-side rout modes enabled;
  others `disabled` "(Part C)"), race selector (mortal races), a resolve-guarded unit palette (only race×class
  combos `unitTemplate` can build — 5 base kits + reclasses — with provider costs), Add gated by the engine
  budget (`rosterCost`/`validateRoster`, points or units), a roster panel with Remove, live "Remaining", and
  Start Match → mirrored side-1 opponent → `startMatch({modeId,rosters,seed})`. `ArmyBuilder.css`, barrel
  `index.ts`, `ArmyBuilder.test.tsx` (provider cost display, budget-gated Add, Start→playable match with the
  built side-0 army). Notes: cost varies by race so palette is memoized per race; Human Warrior = 13 pts.
  HOST: client `test` 16/16, `tsc --noEmit` clean, `vite build` clean. Next: Step 2 (scenario mode).
- 2026-07-09T16:20 plan created (Claude) as PLANNED backlog for Part B (army builder + scenario mode). Activate
  after Part A is COMPLETE.
