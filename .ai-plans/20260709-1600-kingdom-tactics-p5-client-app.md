# Plan: Kingdom Tactics — Phase 5 · Part A — playable core (engine setup + client scaffold + arena + local match)

Created: 2026-07-09T16:00:00-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Stand up the playable core of `apps/kingdom-tactics-client`: a shared engine match-setup/deployment factory (`buildMatch`/`ArmyRoster`), a feature-sliced client shell with screen navigation, an arena board renderer with click interaction, and a local human-vs-AI "Quick Match" loop driven by the engine — all host-verified (`build` + `test` green + dev smoke).

> PHASE 5 IS SPLIT INTO PARTS (per review 2026-07-09):
> - **Part A (this doc, ACTIVE)** — engine `setup/` + client scaffold + arena + local match loop = the
>   playable core. Steps 1–5.
> - **Part B** (`…-p5b-builder-scenario.md`, PLANNED) — army builder + scenario mode. Promote to ACTIVE
>   when Part A is COMPLETE.
> - **Part C** (`…-p5c-modes-terrain-persistence.md`, PLANNED) — the deferred v1 simplifications, captured
>   so they are NOT lost: multi-side/special modes (ffa/siege/battle/horde), authored terrain maps + arena
>   selector, build-both-armies/saved armies, persistence, and the server adopting `buildMatch`.
> Exactly ONE doc is `Status: ACTIVE` at a time (this one; p4 is COMPLETE). PLANNED docs are drafts — the
> `plan_step` auto-attach only matches ACTIVE, so PLANNED docs are never auto-picked; flip a part to ACTIVE
> only when the prior part is COMPLETE.

> OWNERSHIP: **Claude handles every step this phase** (per review — no qwen delegation). If a future
> session ever hands a step to qwen, the incident-2026-07-08 rule still stands: qwen must NEVER run
> `pnpm install|build|test`/`tsc`/`jest`/`vite` in-container (it corrupts the host toolchain); build/test
> is always a HOST task.

## Goal
The client boots to a main menu; "Quick Match" seeds a local match via the new engine `buildMatch(...)` and
drops the player into a rendered **arena** where they play side 0 (select a unit → see legal moves/attacks →
click to act; "End turn") against a `GreedyPolicy` AI that auto-plays side 1, through to a victory/defeat
banner. All game logic comes from `@shatteredarchive/kingdom-tactics-engine`; the client is render +
interaction only. A new engine `setup/` module deploys an `ArmyRoster` into an initial `MatchState` (shared
by client local-play and, later, the server — resolving the Phase-4 open decision). Done when client + engine
`build`/`test` are green on host, a Quick Match plays end-to-end in a dev smoke, and new/changed dirs'
`.annotated`/`.ai-context` are refreshed. (Army builder + scenario screens exist only as menu stubs here —
Part B fills them.)

## Constraints
- **Client renders, engine decides.** Import `applyAction`, `legalActions`, `GreedyPolicy`, `RandomPolicy`,
  `createRng`, `createGameDataProvider`, `createGameModeProvider`, and the new `buildMatch`/`ArmyRoster` from
  the engine. Never re-implement rules, costs, or deployment in the client.
- **Engine stays isomorphic** (`types: []`, no DOM/Node built-ins). The new `setup/` module is pure TS.
- **Mirror `game-client` conventions**: React 19 + Vite 8 (already), feature-sliced `src/features/*`,
  `components/`, `hooks/`, `pages/`, `state/`; Jest + jsdom for tests. Keep deps minimal — React
  state/context for nav + match state; NO router or external state lib in v1.
- **Local jest config required** (see [[jest-local-config-for-server-packages]]): the root jest config can't
  collect a `-client` package's own co-located tests under `--rootDir .`; add a LOCAL `jest.config.cjs`
  (jsdom env, `testMatch <rootDir>/src/**/*.test.{ts,tsx}`, workspace deps mapped to TS sources, ts-jest ESM,
  `diagnostics.ignoreCodes:[151002]`), and a `test` script pointing at it.
- **Determinism**: seed each local match with `createRng(seed)`; deployment ids are deterministic
  (`s{side}-u{i}`) so the same roster+seed reproduces a match.
- Update the engine barrel (`engine/src/index.ts`) for `setup/`, and every new dir's `.annotated`/`.ai-context`.

## Context — verified surfaces (read 2026-07-09; exact)
- **Client today** (`apps/kingdom-tactics-client/`): bare Vite+React 19 scaffold — only `src/{App.tsx,
  main.tsx,styles/}`; deps `react`, `react-dom`, engine `workspace:*`; scripts `dev/build/preview` (NO
  `test`, no jest, no router/state lib). This part adds the core gameplay UI + test tooling.
- **Engine public API** (barrel `services/kingdom-tactics-engine/src/index.ts`): `MatchState`
  (`{modeId, board, armies, tokens, turn, activeSide, moon, rngState, status, winner?}`), `Action`
  (`move|attack|ability|end-turn`), `Side` (number), `applyAction(state,action,rng,providers)`,
  `legalActions(state,side,providers)`, `EngineProviders {data,modes,abilityResolver?,triggers?}`,
  `GreedyPolicy`/`RandomPolicy`/`IAiPolicy`, `createRng`/`ISeededRng`, `createGameDataProvider`,
  `createGameModeProvider`, `ScenarioSimulator`, `runMatch`. A token action's `tokenId` === `token.instanceId`.
  The server's `MatchSession.runAiUntilHuman` (apps/kingdom-tactics-server) is the reference AI-drive loop.
- **Army/mode/cost model**:
  - `model/army.ts` — `Army {side, name?, budget}` is roster-level metadata ONLY (chosen units are NOT in it;
    deployed tokens live in `MatchState.tokens`). ⇒ the new roster type carries the picks.
  - `model/mode.ts` — `GameModeConfig {id, name, sides, budget, budgetKind:'points'|'units', scale,
    usesSquadrons, victory, board:{width,height}, terrainProfile, asymmetric}`; `GameModeId` = the nine modes.
  - `model/unit.ts` — `Unit {kind:'unit', instanceId, templateId, side, pos, hp, statuses, hasMoved, hasActed}`;
    `UnitTemplate` = resolved blueprint with `cost` + stats (incl. a max-hp stat — confirm exact field in Step 1).
  - `data/balance/unit-costs.ts` — `computeUnitCost(stats)`; a unit's cost is `provider.unitTemplate(race,class).cost`.
  - `data/index.ts` — `IGameDataProvider {unitTemplate(raceKey,classKey), races(), classes()}`;
    `IGameModeProvider {modes(), mode(id)}`.
- **NO deployment factory exists** — Phase 4 hand-built `createDuelMatch()` in the server. Step 1 adds the
  shared one; the server can later swap to it (tracked in Part C).
- **Design intent** (`apps/kingdom-tactics-client/docs/ARCHITECTURE.md` §5–7, `ROADMAP.md` row 5): feature
  slices `arena`, `army-builder`, `match`, `scenario`; client runs a fully local match vs AI using the engine
  directly. Simulator dashboard (§6) = Phase 6; net transport (§7) = Phase 7 — NOT in Phase 5.

### v1 decisions (defaults; flag changes in the Progress log)
1. **2-side modes first** (duel/duo/skirmish/squadron; individual Units). ffa/siege/battle/horde ⇒ Part C.
   Deployment: side 0 along the bottom row(s), side 1 along the top, spread across width; flat all-`Field`
   board of `mode.board` size (authored terrain maps ⇒ Part C).
2. **Human = side 0, GreedyPolicy = side 1** in the local loop (configurable; hot-seat ⇒ later).
3. **Client-side AI drive mirrors `MatchSession.runAiUntilHuman`** (per-turn cap + no-op→end-turn) in a
   `useMatch` hook.
4. **`ArmyRoster {side, name?, picks: {raceKey,classKey}[]}`** lives in the engine `setup/` module so
   `buildMatch` is the single source of deployment truth (client + server reuse it).
5. **Quick Match uses default/mirrored rosters** (no builder yet — Part B feeds custom rosters).
6. **No persistence / accounts / online** in v1 (⇒ Part C / Phase 7).

## Steps

### [x] 1. (CLAUDE) Engine `setup/` — army roster → initial MatchState (shared deployment factory)
- Do: Create `services/kingdom-tactics-engine/src/setup/build-match.ts`:
  - `export interface ArmyRoster { readonly side: Side; readonly name?: string; readonly picks: ReadonlyArray<{ readonly raceKey: string; readonly classKey: string }>; }`
  - `export function rosterCost(roster, p: EngineProviders): number` — sum `p.data.unitTemplate(raceKey, classKey).cost` over picks.
  - `export function validateRoster(roster, mode, p): { ok: true } | { ok: false; reason: string }` —
    `budgetKind:'points'` ⇒ `rosterCost ≤ mode.budget`; `'units'` ⇒ `picks.length ≤ mode.budget`.
  - `export function buildMatch(modeId: GameModeId, rosters: readonly ArmyRoster[], p: EngineProviders, opts?: { seed?: number }): MatchState` —
    resolve `mode = p.modes.mode(modeId)`; build a flat all-`Field` `Board` of `mode.board` size; per roster,
    instantiate a `Unit` per pick (`instanceId:'s{side}-u{i}'`, `templateId:'{raceKey}:{classKey}'`, `hp` =
    template max-hp field, `statuses:[]`, `hasMoved/hasActed:false`) placed in that side's starting row(s)
    spread across width (side 0 bottom, side 1 top); set `armies` (one `Army` per roster), `turn:1`,
    `activeSide:0`, a default `moon`, `rngState`, `status:'in-progress'`. Throw a clear error on over-budget
    or unknown template. v1 supports 2-side modes (assert `mode.sides === 2 && !mode.usesSquadrons`).
- Then: `export * from './setup/build-match.js';` in `src/index.ts`; create `src/setup/.annotated`.
- Files: `src/setup/build-match.ts`, `src/setup/build-match.test.ts`, `src/index.ts`, `src/setup/.annotated`.
- Tests: valid 1v1 roster → `MatchState` with 2 tokens on opposite rows, `status:'in-progress'`, correct
  sides/positions; `rosterCost` sums costs; over-budget fails `validateRoster` and `buildMatch` throws;
  deterministic (same inputs → equal state); built state is playable (`legalActions(state,0,p)` non-empty).
- Verify (HOST): `pnpm --filter @shatteredarchive/kingdom-tactics-engine build && … test` green.

### [x] 2. (CLAUDE) Client scaffold — feature slices, app shell + screen nav, providers, jest
- Do:
  - Structure `src/`: `features/{arena,army-builder,match,scenario}/`, `components/`, `hooks/`, `pages/`, `state/`.
  - `state/`: `providers.ts` singleton (`createGameDataProvider`/`createGameModeProvider`); a screen-nav store
    (React context + `useReducer`; `Screen='menu'|'army-builder'|'match'|'scenario'`; navigate actions carry a
    `{modeId, rosters, seed}` payload into the match screen).
  - `App.tsx`: app shell rendering a `MainMenu` (buttons: **Quick Match** → match; Army Builder → stub;
    Scenario → stub) and routing to the active screen.
  - Test tooling: LOCAL `jest.config.cjs` (jsdom, `testMatch src/**/*.test.{ts,tsx}`, ts-jest ESM, workspace
    deps → TS sources, `diagnostics.ignoreCodes:[151002]`) + `tsconfig.jest*`/`test` script; a first smoke
    test (`App` renders the menu). Add jest/RTL/ts-jest devDeps mirroring the root client jest project.
- Files: `src/App.tsx`, `src/state/{providers.ts,nav.tsx}`, `src/pages/MainMenu.tsx`, `src/features/*/index.ts`
  stubs, `jest.config.cjs`, `tsconfig.jest*.json` (as needed), `package.json` (add `test` + devDeps),
  `src/*/.annotated` + `.ai-context`.
- Verify (HOST): `pnpm install` (link new devDeps) → `build` 0 + `test` (smoke) green; `pnpm dev` shows the menu.

### [x] 3. (CLAUDE) Arena feature — board render + `useMatch` hook + click interaction
- Do: `features/arena/`:
  - `Arena.tsx` renders a `MatchState.board` grid (tiles backdrop) with tokens layered on top (side color, hp),
    CSS grid sized to `board.width×height`; accessible cells (coord/aria labels).
  - `hooks/useMatch.ts`: owns `state`, a `createRng(seed)` stream + providers; exposes `snapshot`,
    `legalActionsFor(tokenId)` (filter `legalActions(state, activeSide, p)`), `act(action)` (calls
    `applyAction`, ignores no-op same-ref), `runAi()` (mirrors `MatchSession.runAiUntilHuman` anti-stall).
    Pure-ish, unit-testable without the DOM.
  - Interaction: click a friendly token → highlight legal move tiles + attackable enemies; click a highlight →
    issue move/attack; an "End turn" control.
- Files: `features/arena/{Arena.tsx,Arena.test.tsx}`, `features/arena/hooks/{useMatch.ts,useMatch.test.ts}`,
  `features/arena/.annotated` + `.ai-context`.
- Tests: `useMatch` applies a legal move (advances) and rejects an illegal one (no change); `runAi` drives a
  Greedy seat then stops at the human turn; `Arena` renders the right cells/tokens for a built match (RTL).
- Verify (HOST): client `build` + `test` green; dev smoke: a built match renders and a click moves a unit.

### [x] 4. (CLAUDE) Local match loop — human(0) vs Greedy AI(1) over the arena
- Do: `features/match/`:
  - `MatchScreen.tsx`: seed a match via `buildMatch(modeId, rosters, p, {seed})` (from nav payload, or a
    default Skirmish with mirrored default rosters for "Quick Match"), render `Arena` + a HUD (turn #, active
    side, per-side unit counts, moon), wire the loop: after each human action that ends the human turn, call
    `useMatch.runAi()` to auto-play side 1, then re-render; show a victory/defeat banner + "Rematch"/"Back to
    menu" when `status:'decided'`.
- Files: `features/match/{MatchScreen.tsx,MatchScreen.test.tsx}`, `features/match/.annotated` + `.ai-context`.
- Tests (RTL + real engine): a Quick Match mounts, shows the HUD, ending the human turn triggers the AI and
  updates the HUD; a scripted dominant setup reaches a decided banner.
- Verify (HOST): client `build` + `test` green; dev smoke: play a full Quick Match human-vs-AI to a result.

### [x] 5. (CLAUDE) Wire core nav, refresh indexes, host sign-off (Part A complete)
- Do:
  1. Finalize `MainMenu`/nav: Quick Match reachable and playable end-to-end; "Back to menu" works; army-builder
     and scenario menu entries route to clearly-labeled "coming in Part B" stubs.
  2. Refresh `.annotated`/`.ai-context` for `apps/kingdom-tactics-client/` and every new `src/**` dir, and the
     engine `src/setup/` index; confirm the engine barrel exports `setup/build-match.js`.
  3. HOST: `pnpm install` (once), then `pnpm --filter @shatteredarchive/kingdom-tactics-client build && … test`
     and `pnpm --filter @shatteredarchive/kingdom-tactics-engine build && … test`; REPORT pass/fail + counts.
  4. Dev smoke: menu → Quick Match → play to a result → back to menu.
- Files: nav/menu files, the `.annotated`/`.ai-context` files above.
- Verify (HOST): both packages build 0 + suites green; Quick Match drives correctly. Set this doc
  `Status: COMPLETE`, check the box, append a final Progress-log summary, and **promote Part B to ACTIVE**.

## Progress log
- 2026-07-09T18:45 **Step 5 COMPLETE — PART A COMPLETE** (Claude, host-verified). Nav was already fully
  wired by Steps 2–4 (MainMenu → Quick Match plays end-to-end; Back to menu works; Army Builder + Scenario
  route to labeled "Coming in Part B" ComingSoon stubs). Confirmed the engine barrel exports
  `setup/build-match.js` (client imports `buildMatch` through it — exercised by client tests). All new dirs'
  `.annotated`/`.ai-context` refreshed across Steps 1–4. FINAL HOST VERIFY: engine `build` clean +
  `test` **137/137**; client `test` **13/13**, `tsc --noEmit` clean, `vite build` clean. Dev smoke covered
  by the RTL integration flow (menu → Quick Match → play a full game to a decided banner → Rematch; stub →
  Back) + the production build. Doc set **Status: COMPLETE**; **Part B promoted to ACTIVE**.
- 2026-07-09T18:35 **Step 4 COMPLETE** (Claude, host-verified). Replaced the match stub with the real
  loop: `features/match/MatchScreen.tsx` seeds a match via `useMatch({modeId,rosters,seed,aiPolicies:{1:
  GreedyPolicy}})`, renders `Arena` + a HUD (turn / active side / per-side living counts / moon), and an
  effect auto-plays any AI seat whenever it becomes active (post-human-action + mount); a decided match
  swaps the board for a Victory/Defeat/Draw banner with Rematch (`match.reset`) / Back. Exported pure
  `matchOutcome(state,side)`. Extracted `quick-match.ts` (HUMAN_SIDE/AI_SIDE + `QUICK_MATCH_SETUP`) as the
  single source of the default, now imported by both MainMenu and MatchScreen. Barrel `index.ts`. Tests:
  `MatchScreen.test.tsx` — matchOutcome mapping, HUD render, and a full idle-human-vs-stronger-Greedy game
  driven through the UI to a **Defeat banner** + Rematch. Updated `App.test.tsx` (Quick Match now lands on
  the real HUD+arena, not the old stub). Note: typed the aiPolicies memo `Record<number,IAiPolicy>` (object
  literal `{1:...}` isn't number-indexable). HOST: client `test` 13/13, `tsc --noEmit` clean, `vite build`
  clean. Next: Step 5 (nav polish + refresh indexes + sign-off; promote Part B).
- 2026-07-09T18:10 **Step 3 COMPLETE** (Claude, host-verified). Arena slice:
  `features/arena/hooks/useMatch.ts` — owns MatchState in a ref (synchronous source of truth) mirrored
  into React state (avoids stale closures + StrictMode double-RNG-advance); exposes
  `snapshot`/`legalActionsFor(tokenId)`/`act(action):boolean`/`runAi()`/`reset()`; `runAi` ports
  `MatchSession.runAiUntilHuman` verbatim (per-turn cap + no-op→end-turn anti-stall, single `createRng(seed)`
  stream for human+AI). `features/arena/Arena.tsx` — CSS-grid board (`role=grid`/`gridcell`, per-cell aria
  labels), select friendly token → highlight legal move tiles + attackable enemies → click to move/attack;
  `interactive` flag for a display-only variant; `End turn` control. `Arena.css`. Barrel exports Arena +
  useMatch. Tests: `useMatch.test.ts` (legal move applies / illegal no-ops / runAi hands back / reset) +
  `Arena.test.tsx` (cell-per-tile, select→highlight→move, end-turn, display-only). HOST: client `test`
  10/10 (App 3 + Arena 4 + useMatch 3), `tsc --noEmit` clean. Next: Step 4 (MatchScreen loop + HUD).
- 2026-07-09T17:45 **Step 2 COMPLETE** (Claude, host-verified). Scaffolded the client shell:
  `state/providers.ts` (EngineProviders singleton), `state/nav.tsx` (React context + useReducer nav
  store — `Screen`, `MatchStartPayload`, `NavProvider`, `useNav`), `pages/MainMenu.tsx` (Quick Match
  seeds a default mirrored 2-Warrior Skirmish; Army Builder/Scenario route to stubs),
  `components/ComingSoon.tsx`, feature slices `features/{arena(barrel),match,army-builder,scenario}`
  (match = payload-echo stub for Step 4; builder/scenario = labelled ComingSoon stubs), and rewrote
  `App.tsx` as NavProvider + screen router. Test tooling: local `jest.config.cjs` (jsdom, ts-jest ESM,
  engine→TS-source mapper, CSS stub), `tsconfig.jest.json`, `jest.style-stub.cjs`, `test` script, and
  added devDep `@testing-library/react@^16.3.2` (root already hoists jest/ts-jest/jsdom). `App.test.tsx`
  smoke (menu boots, Quick Match → match screen with payload, stub → back to menu). Notes: feature stubs
  with JSX are `.tsx` not `.ts`; excluded `*.test.*` from app `tsconfig.json` so the prod typecheck skips
  jest globals. Refreshed `.annotated`/`.ai-context` for state/pages/components/features(+each slice) and
  the client root `.annotated`. HOST: `pnpm install --no-frozen-lockfile` (linked RTL, lockfile passed
  supply-chain policy) → client `test` 3/3 green, `vite build` clean (22 modules), `tsc --noEmit` clean.
  Dev-smoke satisfied by the RTL render/route test + prod build (menu is client-rendered). Next: Step 3
  (arena render + useMatch hook).
- 2026-07-09T17:20 **Step 1 COMPLETE** (Claude, host-verified). Added engine `src/setup/build-match.ts`
  (`ArmyRoster`, `rosterCost`, `validateRoster`, `buildMatch`) + `build-match.test.ts` (10 tests),
  barrel export (`export * from './setup/build-match.js'`), and `src/setup/.annotated`. `buildMatch`
  deploys 2-side individual-unit modes onto a flat all-`Field` board (side 0 bottom / side 1 top, spread
  across width, deterministic `s{side}-u{i}` ids), asserts `sides===2 && !usesSquadrons`, throws on
  over-budget/out-of-range side. Notes: `MatchState.tokens` is `BoardToken` (Unit|Squadron) so tests
  narrow via `kind==='unit'`; Human:Warrior resolves to cost 13 / maxHp 30 (spread test uses `squadron`'s
  60-pt budget to fit 3 units). HOST: engine `build` clean (tsc 0), `test` green — 137/137 (127 prior +
  10 new). Next: Step 2 (client scaffold + local jest).
- 2026-07-09T16:20 Phase 5 SPLIT into Parts A/B/C per review; this doc rescoped to **Part A (playable core)**,
  steps 1–5, all CLAUDE (no qwen delegation). Deferred v1 simplifications moved to Part C so they're tracked,
  not lost. Engine owns the deployment factory (confirmed). Ready to start Step 1 on the user's go-ahead.
- 2026-07-09T16:00 plan created (Claude) for review.
