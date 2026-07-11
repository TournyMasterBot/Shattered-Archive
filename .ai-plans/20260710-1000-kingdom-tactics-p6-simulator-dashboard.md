# Plan: Kingdom Tactics — Phase 6 · Client simulator dashboard over engine `sim/`

Created: 2026-07-10T10:00:00-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Add a client Simulator Dashboard that runs headless AI-vs-AI batches over the engine `sim/` and reports balance metrics (win-rate per side, draws, turn-limit hits, avg turns).

> PHASE 6 of the roadmap (`apps/kingdom-tactics-client/docs/ROADMAP.md` row 6; ARCHITECTURE §6).
> Phase 5 (client app: arena / match / builder / scenario) is COMPLETE; this adds the fourth
> design surface — the simulator dashboard — as a new `features/simulator/` slice.
> OWNERSHIP: **Claude** (per the standing "Claude handles the work for now" directive). The roadmap
> marks Phase 6 qwen-eligible; if ever delegated, the incident-2026-07-08 rule stands — qwen must
> NEVER run `pnpm install|build|test`/`tsc`/`jest`/`vite` in-container (it corrupts the host
> toolchain); JS build/test verification is always a HOST task.
> Exactly ONE `.ai-plans/*.md` is `Status: ACTIVE` (this one; all four KT p1–p5 docs are COMPLETE).

## Goal
From the client main menu the player opens a **Simulator Dashboard**: choose a game mode, an AI
policy per side (Greedy or Random), a match count, and a base seed, then Run — the client plays that
many seeded headless matches over the engine simulators and shows aggregate balance metrics
(win-rate per side, draws, turn-limit hits, average turns) plus a per-match results table. All match
logic and aggregation come from `@shatteredarchive/kingdom-tactics-engine` (`runMatch`/`runBatch`);
the client only configures, chunks for responsiveness, and renders. Done when the client `build` +
`test` are green on host, a batch runs end-to-end in a dev smoke, and new/changed dirs'
`.annotated`/`.ai-context` are refreshed.

## Constraints
- **Client renders, engine computes.** Import `runMatch`, `buildMatch`, `GreedyPolicy`,
  `RandomPolicy`, `createGameDataProvider`/`createGameModeProvider` (via the `providers` singleton).
  Do NOT re-implement match stepping or the win/draw/turn aggregation in the client beyond thin
  progress bookkeeping — mirror `runBatch`'s aggregation exactly (it is the reference).
- **Keep the UI responsive.** `runBatch` is one synchronous call with no progress; for the dashboard
  run matches in **chunks** (a few per macrotask via `await`/`setTimeout(0)`) so a large batch does
  not freeze the tab, and surface progress. Cap the match count in v1 (e.g. ≤ 500).
- **Deterministic:** match `i` uses `baseSeed + i` (identical to `runBatch`), so a config reproduces
  its summary exactly.
- **Default/mirrored rosters** per mode via `buildMatch` (same army for every side) — custom rosters
  from the army builder are a later enhancement, NOT this phase.
- Mirror Phase-5 client conventions: feature slice under `src/features/simulator/`; React state/context
  (no router/state lib); local `jest.config.cjs` (jsdom); refresh `.annotated`/`.ai-context`. **No new
  deps** — render win-rate as simple **accessible CSS bars** (percent + counts shown as text too), not
  a charting library.
- The one-unit-per-turn reducer rule is already in effect; simulated matches just take more turns
  (the `maxTurns` guard, default 200, still bounds them) — nothing to special-case.

## Context
- **Engine sim API** (barrel `/workspace/shattered-archive/services/kingdom-tactics-engine/src/index.ts`):
  - `runMatch(cfg: MatchConfig): MatchResult` — one seeded headless match (`sim/match-simulator.ts`).
    `MatchConfig { initial: MatchState; policies: Record<number, IAiPolicy>; providers: EngineProviders;
    seed: number; maxTurns?: number }`.
  - `runBatch(cfg: BatchConfig): BatchResult` — N matches aggregated (`sim/batch-simulator.ts`).
    `BatchConfig = Omit<MatchConfig,'seed'> & { baseSeed: number; matches: number }`;
    `BatchResult { matches; winsBySide: Record<number,number>; draws; turnLimitHits; avgTurns;
    results: readonly MatchResult[] }`. (This is the aggregation the client mirrors for chunked progress.)
  - `MatchResult { winner: Side|'draw'; decided: boolean; turns: number; actions: number;
    reason: 'victory'|'turn-limit'; survivors: Record<number,number>; seed: number }` (`sim/types.ts`).
- **Match setup:** `buildMatch(modeId, rosters, providers, { seed, terrain? }): MatchState`
  (`services/kingdom-tactics-engine/src/setup/build-match.ts`) — deploys 2–4-side non-squadron modes.
  `GreedyPolicy` / `RandomPolicy` (`ai/greedy-policy.ts`, `ai/random-policy.ts`) implement `IAiPolicy`.
- **AI policies enumerate via `legalActions`**, so they respect the one-unit-per-turn lock automatically.
- **Client scaffold (Phase 5)** under `/workspace/shattered-archive/apps/kingdom-tactics-client/src`:
  - `state/providers.ts` — the shared `EngineProviders` singleton (feed it to `runMatch`).
  - `state/nav.tsx` — `Screen = 'menu'|'army-builder'|'match'|'scenario'` union + `NavProvider`/`useNav`
    (add `'simulator'`); `App.tsx` is the screen router.
  - `pages/MainMenu.tsx` — menu buttons (add a **Simulator** entry).
  - `features/army-builder/ArmyBuilder.tsx` — reference for mode enumeration (`isEnabledMode`:
    non-squadron rout modes, 2–4 sides) and mirrored-roster construction to reuse.
  - Local `jest.config.cjs` (jsdom + ts-jest ESM, engine mapped to TS source); test convention is
    `src/**/*.test.{ts,tsx}` with `@testing-library/react`.

## Steps

### [x] 1. (CLAUDE) Simulator slice — chunked batch runner + config model + hook
- Do: create `src/features/simulator/`:
  - `sim-runner.ts`: `export interface SimConfig { modeId: GameModeId; policyBySide: Record<number, 'greedy'|'random'>; matches: number; baseSeed: number; terrain?: TerrainChoice }` and
    `export type SimSummary = { matches; winsBySide: Record<number,number>; draws; turnLimitHits; avgTurns; results: MatchResult[] }`.
    `export async function runSimBatch(config, providers, onProgress?: (done: number) => void, shouldCancel?: () => boolean): Promise<SimSummary>` —
    build mirrored default rosters (one `{ raceKey:'Human', classKey:'Warrior' }` × the mode's budget-appropriate count, same for every `mode.sides`) via `buildMatch(modeId, rosters, providers, { seed: baseSeed, terrain })`; instantiate a policy per side from `policyBySide` (`new GreedyPolicy()` / `new RandomPolicy()`); loop `matches` times calling `runMatch({ initial, policies, providers, seed: baseSeed + i })`, aggregating exactly like `runBatch` (winsBySide/draws/turnLimitHits/avgTurns/results); `await` a macrotask every ~16 matches and call `onProgress`; bail if `shouldCancel()`.
  - `hooks/useSimBatch.ts`: `useSimBatch()` → `{ run(config): void; running: boolean; progress: number; result: SimSummary | null }`; owns state, runs `runSimBatch`, cancels on unmount (ref flag).
- Files: `/workspace/shattered-archive/apps/kingdom-tactics-client/src/features/simulator/{sim-runner.ts,sim-runner.test.ts,hooks/useSimBatch.ts,hooks/useSimBatch.test.ts,.annotated,.ai-context}`.
- Verify (HOST): `pnpm --filter @shatteredarchive/kingdom-tactics-client test` green — `runSimBatch` on a Greedy-vs-Greedy skirmish (small N, fixed seed) returns `matches === N`, `sum(winsBySide)+draws === N`, `avgTurns > 0`, and is deterministic (same config → deep-equal summary); `useSimBatch` resolves to a result and `progress` reaches N. Then `pnpm --filter @shatteredarchive/kingdom-tactics-client build`.

### [x] 2. (CLAUDE) Dashboard screen — config UI + metrics + results table
- Do: `src/features/simulator/SimulatorScreen.tsx` (+ `SimulatorScreen.css`): controls — a **Mode**
  select (enabled = non-squadron rout modes, mirroring the builder's `isEnabledMode`); a **policy**
  select per side (Greedy/Random) for `0..mode.sides-1`; numeric **Matches** and **Base seed** inputs
  (matches clamped to ≤ 500); a **Run** button that calls `useSimBatch().run(config)` and shows a
  progress readout while `running`. Results panel: per-side **win-rate** as accessible CSS bars
  (`role="img"`/`aria-label` with the % and win count; percent + `wins/matches` shown as text),
  **draws**, **turn-limit hits**, **avg turns**; and a **results table** of the first ~20 matches
  (seed, winner, turns, survivors). A **Back to menu** control.
- Files: `.../features/simulator/{SimulatorScreen.tsx,SimulatorScreen.css,SimulatorScreen.test.tsx,index.ts,.annotated}`.
- Verify (HOST): `pnpm --filter @shatteredarchive/kingdom-tactics-client test` green — RTL test:
  render within `NavProvider`, set a tiny batch (2–3 matches), click Run, and assert the summary
  renders (a win-rate row per side, avg-turns value, and totals reconciling to the match count);
  then `pnpm --filter @shatteredarchive/kingdom-tactics-client build`. Dev smoke: run a batch and read
  the metrics.

### [x] 3. (CLAUDE) Wire nav, refresh indexes, host sign-off (Phase 6 complete)
- Do: add `'simulator'` to the nav `Screen` union in `state/nav.tsx`; route it in `App.tsx`; add a
  **Simulator** button to `pages/MainMenu.tsx`; export the screen from `features/simulator/index.ts`.
  Refresh `.annotated`/`.ai-context` for `features/simulator/` (+ its `hooks/`) and update the touched
  `state`/`pages` indexes.
- Files: `.../src/state/nav.tsx`, `.../src/App.tsx`, `.../src/pages/MainMenu.tsx`,
  `.../src/features/simulator/index.ts`, the `.annotated`/`.ai-context` files above.
- Verify (HOST): `pnpm --filter @shatteredarchive/kingdom-tactics-client build` (0 errors) and
  `… test` (all suites green); dev smoke: menu → Simulator → configure → Run → read metrics → Back.
  Set this doc `Status: COMPLETE`, check the box, append a final Progress-log summary. (Next: Phase 7 —
  online multiplayer transport, `net` slice → `/ws/kt`.)

## Progress log

- 2026-07-10T10:00 plan created (Claude) after Phase 5 sign-off (engine 142 / client 29 / server 10 tests
  green; all p1–p5 docs COMPLETE). Scoped Phase 6 to the client simulator dashboard over the existing
  engine `sim/` (`runMatch`/`runBatch`) — three CLAUDE steps: chunked batch runner + hook, dashboard
  screen, nav wiring + sign-off. Ready to start Step 1 on the user's go-ahead.
- 2026-07-10 step 1 done: simulator slice — added `features/simulator/sim-runner.ts` (`runSimBatch`,
  `SimConfig`, `SimSummary`, `PolicyKind`; mirrored default rosters, 16-match chunks with progress +
  cancel, aggregation mirroring engine `runBatch`) and `hooks/useSimBatch.ts` (running/progress/result,
  generation-ref cancel-on-unmount + re-entry guard) with tests; refreshed `.annotated`/`.ai-context`.
  HOST verify: simulator suites 7/7; full client 36/36 (was 29); `vite build` clean.
- 2026-07-10 step 2 done: dashboard screen — `SimulatorScreen.tsx` (+ `.css`, barrel `index.ts`): mode
  select (enabled = non-squadron rout, 2–4 sides), per-side Greedy/Random policy selects, Matches/Base-seed
  inputs, Run via `useSimBatch`; results = accessible per-side win-rate CSS bars (`role="img"` + %/count
  text), draws/turn-limit/avg-turns stats, and a first-20 results table. Exported `clampMatches`/`MAX_MATCHES`
  (v1 [1,500] cap). RTL test asserts metrics render + reconcile; refreshed `.annotated`. Fixed a jest-dom
  `toBeInTheDocument` slip (project uses plain matchers). HOST verify: simulator suites 9/9; full client
  38/38; `vite build` clean.
- 2026-07-10 step 3 done: wired nav — added `'simulator'` to the `Screen` union (`state/nav.tsx`),
  routed it in `App.tsx`, added a **Simulator** button to `pages/MainMenu.tsx`, exported the screen from
  the slice barrel. Added an App nav test (menu → Simulator dashboard → Back). Refreshed
  `features/.ai-context` (five slices). HOST verify: full client 39/39 + `vite build` clean (bundle now
  includes the slice — 84 modules); cross-check engine 142/142 and server 10/10 unaffected.
- 2026-07-10 PHASE 6 COMPLETE. Simulator Dashboard shipped: menu → configure (mode / per-side Greedy·Random
  / matches / base seed) → Run a chunked, cancelable, deterministic AI-vs-AI batch over the engine `sim/`
  → read per-side win-rate (accessible CSS bars), draws, turn-limit hits, avg turns, and a sample table.
  Client renders + chunks; the engine computes/aggregates (mirrors `runBatch`). Totals: engine 142 /
  client 39 / server 10 tests green; all builds clean. Next: Phase 7 — online multiplayer transport
  (`net` slice → `/ws/kt`).
