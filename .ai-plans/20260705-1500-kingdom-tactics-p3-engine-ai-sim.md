# Plan: Kingdom Tactics — Phase 3 (GameEngine reducer + AI policies + simulators)

Created: 2026-07-05T15:00:00-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Build the deterministic `engine/` reducer that applies an `Action` to `MatchState` via the Phase-2 rules, two pluggable `ai/` policies (Random, Greedy), and the three `sim/` simulators (Match, Batch, Scenario). This makes the engine self-driving and gives the balance-tuning harness the brief requires.

> RESUMABILITY / OWNERSHIP — READ FIRST
> This doc is written to be picked up in a LATER session (Claude) or handed to qwen. Steps
> are tagged **(CLAUDE)** or **(QWEN-SAFE)**. Rules:
> - **qwen**: do ONLY steps tagged (QWEN-SAFE). If `/plan resume` lands you on a (CLAUDE)
>   step, STOP and report "next step is CLAUDE-ONLY" — do not attempt it. QWEN-SAFE steps
>   embed the full code/skeleton to transcribe; you should not need to design anything.
> - **Claude**: do the next unchecked step regardless of tag; (CLAUDE) steps are judgment-
>   heavy (turn semantics, AI heuristic, sim loop) and are described as specs, not code.
> - Dependency order is strict: Steps 1→2→3 are (CLAUDE) and must exist before the
>   (QWEN-SAFE) steps 4→5 (they import MatchSimulator/engine). Step 6 is the final wiring.
> - Exactly one ACTIVE plan doc at a time — this is it (p2b is COMPLETE).

## Goal
`services/kingdom-tactics-engine/src/` gains `engine/`, `ai/`, `sim/` such that:
- `engine/`: `applyAction(state, action, rng, providers) → MatchState` (pure) correctly
  handles move / attack / ability / end-turn, turn advancement + `hasActed` reset + turn
  counter, victory check after each action, and `rngState` persistence; plus
  `legalActions(state, side, providers)` producing the AI/UI action space.
- `ai/`: `IAiPolicy` interface + `RandomPolicy` + `GreedyPolicy` (documented eval fn).
- `sim/`: `MatchSimulator` (one seeded match, typed `MatchResult`), `BatchSimulator`
  (N matches → aggregate win-rate/turns), `ScenarioSimulator` (single controller drives
  both sides, inspect state between actions — the brief's "one player controls both sides").
Done when `pnpm --filter @shatteredarchive/kingdom-tactics-engine build` and `… test` are
green (target ≈ +25 tests over the current 87 → ~112), all three subsystems are exported
from `src/index.ts`, and the `.annotated` indexes are refreshed.

## Constraints (same discipline as Phases 1–2)
- **Pure + deterministic.** `applyAction`, policies, and simulators take `ISeededRng`; no
  `Math.random`, no wall-clock, no I/O. A match is fully reproducible from (initial state,
  seed). Never mutate inputs — always return new `MatchState`.
- **Isomorphic** (RN-safe): no DOM, no Node built-ins (`tsconfig` `types: []` enforces it).
- **Reuse Phase-2, don't re-derive.** The reducer is glue over existing rules — do NOT
  re-implement movement/targeting/damage/victory. Get every number from `IGameDataProvider`.
- **Interface-light + isolated tests** with `IGameDataProvider`/`IGameModeProvider` stubs or
  the real providers (integration tests may use `createGameDataProvider()`).
- Update `src/index.ts` barrel and each new dir's `.annotated` after adding files.

## Context — engine surfaces to build on (verified 2026-07-05; no C# or big-file reads needed)
All exported from `services/kingdom-tactics-engine/src/` (barrels: `rules/index.ts`,
`data/index.ts`, `model/index.ts`, `rng/index.ts`). Signatures are exact:

- **rules/movement.ts** — `legalMoves(state, tokenId, provider): Coord[]` (terrain-aware).
- **rules/targeting.ts** — `legalTargets(state, tokenId, provider): string[]` (LoS-gated),
  `splashTargets(state, center, areaRadius, provider): string[]`.
- **rules/attack.ts** — `applyAttack(state, attackerId, targetId, provider, rng?): MatchState`
  (validates target, reduces hp/hpPool, marks attacker `hasActed`; no-op on illegal target),
  and `applyAbility(state, casterId, targetId, ability: AbilitySpec, provider, rng): MatchState`
  (auto-hit damage + save-rolled maladiction). `AbilitySpec = { key; damage?: boolean;
  maladiction?: { status: StatusEffect; saves?: number; baseSave?: number } }`.
- **rules/damage.ts** — `resolveDamage(input): DamageResult` where `DamageResult =
  { amount; preMitigation; wasResisted; wasVulnerable; category }`. Use for AI scoring.
- **rules/turn-order.ts** — `turnOrder(state, provider): string[]` (dex initiative desc),
  `nextActiveSide(state): Side` (cycles the sides that still have living tokens, ascending;
  returns 0 if none).
- **rules/victory.ts** — `evaluateVictory(state, mode: GameModeConfig, provider): VictoryResult`
  where `VictoryResult = { decided: boolean; winner?: Side | 'draw' }`. Reads `mode.victory`
  ('rout' | 'control-point' | 'destroy-objective' | 'survive-waves').
- **rules/board.ts** — `tokenAt`, `tileAt`, `chebyshev(a,b)`, `coordEquals`, `inBounds`.
- **data/index.ts** — `createGameDataProvider(): IGameDataProvider`,
  `createGameModeProvider(): IGameModeProvider` (`.mode(id): GameModeConfig`,
  `.modes()`). `unitTemplate(raceKey, classKey)` is the single stat choke point.
- **rng/index.ts** — `ISeededRng { next(): number; int(maxExclusive): number;
  pick<T>(arr): T; state(): number; clone(): ISeededRng }`, `createRng(seedOrState)`,
  `Mulberry32`.
- **model** — `MatchState { modeId; board; armies; tokens: BoardToken[]; turn; activeSide;
  moon{type,phase}; rngState; status: 'in-progress'|'decided'; winner? }`.
  `BoardToken = Unit | Squadron`; `Unit { kind:'unit'; instanceId; templateId; side; pos;
  hp; statuses; hasActed }`; `Squadron { kind:'squadron'; …; hpPool; maxHpPool; hasActed }`.
  (Step 1 adds `hasMoved` to both — see v1 decision 1; it does not exist yet.)
  `Action = MoveAction{type:'move',tokenId,to} | AttackAction{type:'attack',tokenId,targetId}
  | AbilityAction{type:'ability',tokenId,abilityKey,target?} | EndTurnAction{type:'end-turn',side}`.
- **squadron helper** — `templateForMember(templateId, provider): UnitTemplate` (splits
  "Race:Class"). A living token = unit `hp>0` / squadron `hpPool>0`.

### v1 semantics DECIDED here (defaults; flag in Progress log if you change one)
1. **Two budgets per token per turn: one MOVE and one ACTION (USER-CONFIRMED 2026-07-05).**
   A token may both move AND take an action (attack/ability) in the same turn. The model
   ALREADY has a `hasMoved` flag alongside `hasActed` (added to `Unit`+`Squadron` on 2026-07-05,
   ahead of Phase 3): `'move'` consumes `hasMoved`, `'attack'`/`'ability'` consume `hasActed`.
   The two are independent and may be spent in EITHER order (move-then-act or act-then-move) —
   v1 imposes no ordering lock (tightening it later is a one-line guard). `legalActions` must
   offer move actions to any `!hasMoved` token and attack actions to any `!hasActed` token (a
   moved-but-not-yet-acted token still has attacks available).
2. **`end-turn`** advances to `nextActiveSide(state)`, resets BOTH `hasMoved=false` and
   `hasActed=false` for the INCOMING side's living tokens, and increments `state.turn` when the
   active side wraps back to the lowest living side (a full round). Victory is re-checked after
   every action.
3. **`ability` actions are a stub in v1**: there is no `abilityKey → AbilitySpec` catalog
   yet (the Skills/Spells/Songs distillation is a later phase). The reducer resolves abilities
   through an optional `abilityResolver?: (key) => AbilitySpec | undefined`; unknown → no-op.
   `applyAbility` itself already works — only the catalog is missing. AI/sim ignore abilities.
4. **RandomPolicy** picks uniformly among NON-end-turn actions when any exist, else end-turn
   (livelier matches, still stochastic). **GreedyPolicy** prefers the highest-`resolveDamage`
   attack (lethal first), else the move that most reduces Chebyshev distance to the nearest
   enemy, else end-turn; deterministic stable tie-break. (With two budgets, a Greedy token that
   cannot yet reach an enemy will `move` toward it AND, if now in range, `attack` the same turn
   — the sim loop keeps asking the side's policy for actions until it returns end-turn.)
5. **Automatic defenses + combat reactions are OUTSIDE the action economy (USER-CONFIRMED
   2026-07-05).** Dodge, parry, shield-block, shielding auras (e.g. anti-magic shield), and
   reactive auras (e.g. thorns) all resolve automatically inside a single attack's resolution —
   they cost the defender/attacker nothing from the move/action budget and never generate an
   `Action`, so `legalActions`/the reducer economy is already correct for them. They belong in
   the DAMAGE/attack resolution layer, NOT the reducer. The precise per-hit ordering (defense
   step → apply damage → reaction step, with reactions firing ONLY if the hit landed) and the
   hook design are captured in a dedicated DRAFT plan:
   **`.ai-plans/20260705-1530-kingdom-tactics-combat-reactions-defenses-auras.md`**. v1 Phase 3
   does NOT implement any of it (damage stays Phase-2b deterministic); it needs DSL dodge/parry/
   block stats + an aura catalog distilled first.
6. **Passive / minor effects are OUTSIDE the action economy (USER-CONFIRMED 2026-07-05).**
   Things that "just happen" as the turn plays out — banter (cosmetic), aura ticks, weapon-flag
   passive damage, active-skill passive procs — are triggered/passive, not `Action`s, and do
   not touch the move/action budget. To leave room without over-building, the reducer supports
   an OPTIONAL post-action trigger hook: `EngineProviders.triggers?: (state, ev) => MatchState`
   is called after each applied action (default: absent = no-op). v1 ships the seam only; the
   passive/aura/weapon-flag catalog is a later distillation (Open decisions). Because passives
   run through this hook and never as actions, they can't distort win-rate accounting in the
   simulators beyond the state changes they apply.
   > Granularity note: the reducer's `triggers` hook is COARSE (fires once per ACTION, for
   > turn-tick auras/banter). It is DISTINCT from the FINE per-HIT combat reactions (thorns/
   > shields) that resolve inside a single attack — those live in the combat-resolution layer
   > (the combat-reactions DRAFT plan), not here. Two hooks at two granularities.

## Qwen operating rules (small context — follow exactly on QWEN-SAFE steps)
- **You are mainly a reporter.** Offload the heavy lifting to the server: run the build/test
  through the qdigest wrapper and report the digest — do NOT read raw multi-hundred-line
  output, and do NOT read large generated files (`data/dsl/class-attributes.ts` etc.). If you
  need to understand a file, use `docker exec shattered_mcp node build/cli.js pack "<task>"
  <container-path>` (set `MSYS_NO_PATHCONV=1`), never a full Read.
- **Transcribe, don't design.** QWEN-SAFE steps embed the exact code. Type it in as written,
  adjusting only import paths if a barrel differs. If something doesn't match reality or a
  test fails for a reason not covered here, STOP and leave a `Progress log` note for Claude
  rather than improvising.
- **NEVER run `pnpm install` / `pnpm build` / `pnpm test` (or any command that mutates
  `node_modules`) from inside the container.** You (qwen) execute in the `shattered_mcp`
  container, which bind-mounts the HOST repo — including `node_modules` — read-write. A
  container-side `pnpm install` rewrites that shared `node_modules` with LINUX bin shims and
  a container store path, which BREAKS the host's Windows toolchain (`'tsc' is not
  recognized`) and forces a full host reinstall. This already happened once (2026-07-08).
- **You cannot run the JS build/test suite; that verification is Claude's job on the host.**
  For a QWEN-SAFE step: transcribe the code + test file, then STOP and report
  "transcribed, ready for host verify" in the Progress log — do NOT try to run jest/tsc,
  do NOT `pnpm install`, do NOT hunt for a runner. A host `bash …/qdigest.sh … pnpm … build
  && … test` uses a `/c/...` host path you can't reach anyway. Leave the box UNCHECKED; the
  human/Claude runs the suite and checks it off. (You may read a `.ts` file to confirm you
  transcribed it faithfully — reading is safe; installing/building is not.)
- **COMPACT-SAFE checkpoints** are marked `⟦COMPACT OK⟧` in each QWEN-SAFE step. At those
  points all needed state is either written to disk or captured in this doc, so it is safe to
  compact/forget conversation history and resume from the doc alone. Check the box, append a
  one-line Progress log entry, then compact before the next step.

## Steps

### [x] 1. (CLAUDE) GameEngine reducer + legalActions
- Do: `hasMoved` is ALREADY on `Unit`+`Squadron` (added 2026-07-05, build green) — no model
  work needed. Create `src/engine/game-engine.ts`. Design + implement (judgment: dual-budget +
  round semantics per v1 decisions 1–2, 6):
  - `export interface EngineProviders { data: IGameDataProvider; modes: IGameModeProvider;
    abilityResolver?: (key: string) => AbilitySpec | undefined;
    triggers?: (state: MatchState, ev: { type: 'post-action'; action: Action }) => MatchState }`.
  - `export function applyAction(state, action: Action, rng: ISeededRng, p: EngineProviders):
    MatchState` — dispatch on `action.type`:
    - `'move'`: reject (return state unchanged) unless the token exists, is on `activeSide`,
      is living, **`!hasMoved`**, and `action.to` ∈ `legalMoves`. On success: new tokens array
      with that token's `pos = to` and **`hasMoved = true`** (leave `hasActed` alone — the
      token can still attack this turn).
    - `'attack'`: guard active-side + **`!hasActed`**, then delegate to `applyAttack` (it does
      the legalTargets validation + damage + sets `hasActed`). Note: `applyAttack` currently
      spreads the token, so it preserves `hasMoved` — verify that after adding the field.
    - `'ability'`: guard `!hasActed`; if `p.abilityResolver` resolves `abilityKey` and
      `action.target` is a token id, delegate to `applyAbility` (sets `hasActed`); else no-op.
    - `'end-turn'`: only from `activeSide`. Compute `next = nextActiveSide(state)`; reset BOTH
      `hasMoved=false` and `hasActed=false` on the incoming side's living tokens; if `next <=`
      current lowest living side (wrap), `turn+1`. Set `activeSide = next`.
    - After every NON-end-turn branch that changed state: call `p.triggers?.(state, {type:
      'post-action', action})` (v1: usually absent → no-op; this is the passive/aura seam,
      decision 6). Then persist `rngState = rng.state()`, run `evaluateVictory(state,
      p.modes.mode(state.modeId), p.data)`; if decided set `status='decided'` + `winner`.
      Return the new state. Never mutate the input.
  - `export function legalActions(state, side: Side, p: EngineProviders): Action[]` — for each
    living token on `side`: if `!hasMoved` push `{type:'move',tokenId,to}` for each `legalMoves`
    coord; if `!hasActed` push `{type:'attack',tokenId,targetId}` for each `legalTargets` id.
    Always append `{type:'end-turn',side}`. (Abilities omitted in v1.)
  - Optional thin `export class GameEngine implements IGameEngine` wrapper if it reads cleanly;
    otherwise export the functions and an `IGameEngine` interface `{ apply; legalActions }`.
  - Small pure helpers may go in `src/engine/turn.ts` (dual-flag reset / round increment) if it
    keeps game-engine.ts readable.
- Files: `src/engine/game-engine.ts` (+ maybe `src/engine/turn.ts`), `src/engine/game-engine.test.ts`.
- Tests (table-driven, stub or real provider): illegal move rejected; legal move sets pos +
  `hasMoved` but NOT `hasActed`; **a token can move THEN attack in one turn (both flags set,
  two applyAction calls)**; a token that already `hasActed` still gets move actions from
  `legalActions` if `!hasMoved`, and vice-versa; attack reduces target hp via reducer; end-turn
  switches activeSide + resets BOTH flags on the incoming side; turn counter increments on a
  full round; a killing blow flips status→decided with the right winner; a stub `triggers` hook
  is invoked once per non-end-turn action; input state object is unchanged after apply (purity).
- Verify: build 0 + engine test suite green. Then check the box + Progress log.

### [x] 2. (CLAUDE) AI policies (Random + Greedy)
- Do: Create `src/ai/policy.ts` with `export interface IAiPolicy { readonly name: string;
  chooseAction(state: MatchState, side: Side, p: EngineProviders, rng: ISeededRng): Action }`.
  Then `src/ai/random-policy.ts` and `src/ai/greedy-policy.ts`:
  - `RandomPolicy` (v1 decision 4): `const acts = legalActions(state, side, p); const nonEnd =
    acts.filter(a => a.type !== 'end-turn'); return nonEnd.length ? rng.pick(nonEnd) :
    {type:'end-turn', side};`.
  - `GreedyPolicy`: from `legalActions`, score attacks by `resolveDamage(...).amount`
    (resolve attacker/defender templates via `templateForMember`, defender terrain via
    `tileAt`, moon via `state.moon.phase`); pick the max (prefer one that would drop the
    target to ≤0 hp — lethal bonus). If no attack, pick the move minimizing Chebyshev distance
    to the nearest living enemy AFTER the move (compute nearest-enemy distance from `to`). If
    neither, end-turn. Deterministic: stable sort, break ties by tokenId then target/coord
    string; rng unused (or only for exact ties — keep it deterministic).
  - Factor the "nearest enemy distance" + "score an attack" helpers into `src/ai/eval.ts` so
    GreedyPolicy and future MinimaxPolicy share them (DRY).
- Files: `src/ai/policy.ts`, `src/ai/random-policy.ts`, `src/ai/greedy-policy.ts`,
  `src/ai/eval.ts`, `src/ai/greedy-policy.test.ts` (+ optional random-policy.test.ts).
- Tests: GreedyPolicy attacks when an enemy is in range (returns the attack, not a move);
  chooses the higher-damage target when two are reachable; advances toward the enemy when none
  in range; RandomPolicy is deterministic under a fixed seed and never returns end-turn while a
  real action exists. Use the real provider with concrete ids (e.g. 'Human:Warrior').
- Verify: build + test green. Box + Progress log.

### [x] 3. (CLAUDE) MatchSimulator + result types
- Do: Create `src/sim/types.ts` and `src/sim/match-simulator.ts`.
  - `src/sim/types.ts`:
    ```ts
    import type { Side } from '../model/index.js';
    export interface MatchResult {
      readonly winner: Side | 'draw';
      readonly decided: boolean;            // false = hit the turn limit undecided
      readonly turns: number;
      readonly actions: number;
      readonly reason: 'victory' | 'turn-limit';
      readonly survivors: Readonly<Record<number, number>>; // living tokens per side
      readonly seed: number;
    }
    ```
  - `src/sim/match-simulator.ts`: `export interface MatchConfig { initial: MatchState;
    policies: Readonly<Record<number, IAiPolicy>>; providers: EngineProviders; seed: number;
    maxTurns?: number }` and `export function runMatch(cfg: MatchConfig): MatchResult`.
    Loop (JUDGMENT — get the termination + safety guards right):
    - `let state = cfg.initial; const rng = createRng(cfg.seed); let actions = 0; const
      maxTurns = cfg.maxTurns ?? 200; const MAX_ACTIONS_PER_TURN = 500` (anti-infinite-loop).
    - While `state.status === 'in-progress' && state.turn <= maxTurns`: let the `activeSide`'s
      policy choose+apply actions; guard: force `{type:'end-turn'}` if the same side has taken
      `MAX_ACTIONS_PER_TURN` actions this turn without ending, or if `legalActions` yields only
      end-turn. Count every applied action. Break as soon as `status==='decided'`.
    - Result: if decided → `{winner, decided:true, reason:'victory'}`; else
      `{winner:'draw', decided:false, reason:'turn-limit'}`. Compute `survivors` from living
      tokens per side; `turns = state.turn`; `seed = cfg.seed`.
  - Emit-as-event note: `MatchResult` IS the typed match-result event the ARCHITECTURE §5
    mentions; a future campaign layer subscribes to these.
- Files: `src/sim/types.ts`, `src/sim/match-simulator.ts`, `src/sim/match-simulator.test.ts`.
- Tests: a Duel between two RandomPolicies with a fixed seed is deterministic (same
  MatchResult twice) — GOLDEN snapshot of winner+turns; a lopsided setup (strong vs weak) that
  GreedyPolicy wins as the stronger side; a mutual-empty board is a draw; the turn limit
  produces `reason:'turn-limit'`. Keep boards tiny (e.g. 6×6, 1–2 units/side) so matches are
  fast + deterministic.
- Verify: build + test green. Box + Progress log. ⟦This is the last CLAUDE step; 4–6 are
  QWEN-SAFE and depend only on what now exists on disk.⟧

### [x] 4. (QWEN-SAFE) BatchSimulator
> Transcribe the code below verbatim. It only wraps `runMatch` (Step 3). Adjust import paths
> only if a barrel path differs. Do not redesign.
- Do: Create `src/sim/batch-simulator.ts`:
  ```ts
  import type { Side } from '../model/index.js';
  import type { MatchConfig } from './match-simulator.js';
  import { runMatch } from './match-simulator.js';
  import type { MatchResult } from './types.js';

  /** N seeded matches of one match-up, aggregated — the balance-tuning workhorse. */
  export interface BatchConfig extends Omit<MatchConfig, 'seed'> {
    /** First seed; match i uses seed + i (deterministic, reproducible). */
    readonly baseSeed: number;
    readonly matches: number;
  }

  export interface BatchResult {
    readonly matches: number;
    readonly winsBySide: Readonly<Record<number, number>>;
    readonly draws: number;
    readonly turnLimitHits: number;
    readonly avgTurns: number;
    readonly results: readonly MatchResult[];
  }

  export function runBatch(cfg: BatchConfig): BatchResult {
    const results: MatchResult[] = [];
    const winsBySide: Record<number, number> = {};
    let draws = 0;
    let turnLimitHits = 0;
    let turnSum = 0;

    for (let i = 0; i < cfg.matches; i++) {
      const r = runMatch({ ...cfg, seed: cfg.baseSeed + i });
      results.push(r);
      turnSum += r.turns;
      if (r.reason === 'turn-limit') turnLimitHits++;
      if (r.winner === 'draw') draws++;
      else winsBySide[r.winner as Side] = (winsBySide[r.winner as Side] ?? 0) + 1;
    }

    return {
      matches: cfg.matches,
      winsBySide,
      draws,
      turnLimitHits,
      avgTurns: cfg.matches > 0 ? turnSum / cfg.matches : 0,
      results,
    };
  }
  ```
- Test `src/sim/batch-simulator.test.ts`: run `runBatch` with `matches: 10` over the SAME
  tiny Duel setup Step 3's test uses (copy that setup helper). Assert: `result.matches === 10`,
  `results.length === 10`, and that `sum(winsBySide) + draws === 10`. Assert determinism: two
  `runBatch` calls with the same `baseSeed` give identical `winsBySide`.
- Verify (run the one wrapped command from Qwen operating rules). Expect the suite green with
  the new batch tests added. Then: check the box, add a Progress log line. `⟦COMPACT OK⟧`
- If the build/test fails for any reason not obviously a typo you made, STOP and write a
  Progress log note "Step 4 blocked: <digest summary>" for Claude.

### [x] 5. (QWEN-SAFE) ScenarioSimulator
> Transcribe verbatim. This is the brief's "one player controls both sides" — a manual driver,
> no AI. It just wraps `applyAction` and records history.
- Do: Create `src/sim/scenario-simulator.ts`:
  ```ts
  import type { Action, MatchState } from '../model/index.js';
  import type { ISeededRng } from '../rng/index.js';
  import type { EngineProviders } from '../engine/game-engine.js';
  import { applyAction } from '../engine/game-engine.js';

  /**
   * Drives a match under full manual control of BOTH sides (scenario / hot-seat / tutorial).
   * No policy: the caller supplies every Action and can inspect state between them. Immutable
   * snapshots; history is the ordered list of applied actions + resulting states.
   */
  export class ScenarioSimulator {
    private current: MatchState;
    private readonly log: { action: Action; state: MatchState }[] = [];

    constructor(
      initial: MatchState,
      private readonly providers: EngineProviders,
      private readonly rng: ISeededRng,
    ) {
      this.current = initial;
    }

    /** Apply one action from the caller; returns the new state. */
    step(action: Action): MatchState {
      this.current = applyAction(this.current, action, this.rng, this.providers);
      this.log.push({ action, state: this.current });
      return this.current;
    }

    /** Current match snapshot. */
    getState(): MatchState {
      return this.current;
    }

    /** Ordered (action, resulting-state) history. */
    history(): readonly { action: Action; state: MatchState }[] {
      return this.log;
    }

    /** True once the match is decided. */
    isOver(): boolean {
      return this.current.status === 'decided';
    }
  }
  ```
- Test `src/sim/scenario-simulator.test.ts`: build the tiny two-unit state (reuse the helper),
  `step` a legal move for side 0 then an `{type:'end-turn',side:0}`, assert `getState()`
  reflects the move and `activeSide` flipped, and `history().length === 2`. Assert an illegal
  move leaves state unchanged (same reference or equal) — no throw.
- Verify: this is HOST/Claude's job — do NOT run jest/tsc or `pnpm install` in-container
  (see Qwen operating rules). Transcribe the files, add a Progress-log line "Step 5
  transcribed, ready for host verify", and leave the box UNCHECKED for the host to confirm.
- STOP-and-report on anything that doesn't match reality; never improvise a test runner.

### [x] 6. (QWEN-SAFE) Barrel exports, annotate, full-suite report, complete
> Pure wiring + reporting. No design.
- Do:
  1. Add to `src/index.ts` (after the existing `export * from './rules/index.js';`):
     ```ts
     // Deterministic reducer over MatchState.
     export * from './engine/game-engine.js';
     // Pluggable AI policies.
     export * from './ai/policy.js';
     export * from './ai/random-policy.js';
     export * from './ai/greedy-policy.js';
     // Headless simulators (match / batch / scenario).
     export * from './sim/types.js';
     export * from './sim/match-simulator.js';
     export * from './sim/batch-simulator.js';
     export * from './sim/scenario-simulator.js';
     ```
     (If Step 2 named the eval helper file `ai/eval.ts` and it exports nothing public, skip it.)
  2. Create/refresh `.annotated` in `src/engine/`, `src/ai/`, `src/sim/` — one line per file
     in the existing "File Index" style (see `src/rules/.annotated`). Keep it terse. The host
     linter may regenerate these; if so, leave its version.
  3. Do the barrel + `.annotated` edits, then STOP — the build+test verification is HOST/
     Claude's job (do NOT run jest/tsc or `pnpm install` in-container). Log "Step 6 wiring
     transcribed, ready for host verify" and leave the box for the host to check.
- Files: `src/index.ts`, `src/engine/.annotated`, `src/ai/.annotated`, `src/sim/.annotated`.
- Verify: build 0 + full suite green (~112 tests). Then set this doc `Status: COMPLETE`,
  check the box, and append a final Progress log line summarizing the phase. `⟦COMPACT OK⟧`

## Open decisions (resolve during implementation; note the choice in Progress log)
- **Move/action ordering lock**: v1 allows move and action in EITHER order (independent
  `hasMoved`/`hasActed`). If a "can't move after attacking" rule is wanted, guard `'move'` with
  `!hasActed` too (one-line change). Left permissive for now.
- **Automatic defenses + combat reactions (dodge / parry / shield-block, shielding auras,
  thorns)**: reactive, no action cost (v1 decision 5). NOT in Phase 3. Fully specified in its
  own DRAFT plan `.ai-plans/20260705-1530-kingdom-tactics-combat-reactions-defenses-auras.md`
  (per-hit resolution order + hook interfaces + DSL data needs). Extends the Phase-2b damage
  layer, not the reducer.
- **Passive / minor effects (auras, weapon-flag procs, active-skill passives, banter)**: no
  action cost (v1 decision 6). The reducer ships the `triggers` hook seam in Phase 3; the actual
  catalog (which passives exist, their per-turn/per-action triggers and magnitudes) is a later
  distillation from `Server.Dsl/Skills|Spells|Songs` + weapon flags, with its own plan. Cosmetic
  banter can be a client-only concern; passive DAMAGE must flow through the engine (via the hook)
  so simulators account for it.
- **Ability catalog**: v1 stubs abilities (no `abilityKey → AbilitySpec` map). Building it means
  distilling `Server.Dsl/Skills|Spells|Songs` — a sizeable qwen-friendly codegen task; give it
  its own future plan doc, not Phase 3.
- **GreedyPolicy depth**: v1 is 1-ply (immediate best action). `MinimaxPolicy` (2–3 ply over
  `applyAction`) is a natural Phase-7/AI-hardening add; `ai/eval.ts` is factored so it can reuse
  the scoring. Out of Phase-3 scope.
- **maxTurns default (200)** and **MAX_ACTIONS_PER_TURN (500)** are safety limits, not balance;
  tune if large Battle-mode matches legitimately exceed them.

## Progress log
- 2026-07-05T15:00 plan created. Phase 3 = engine reducer (CLAUDE 1) + AI Random/Greedy
  (CLAUDE 2) + MatchSimulator (CLAUDE 3) + BatchSimulator (QWEN 4) + ScenarioSimulator (QWEN 5)
  + wiring/report (QWEN 6). v1 semantics fixed: one action/token/turn, ability stub, Random =
  non-end-turn-biased, Greedy = 1-ply lethal-first. Steps 4–6 embed verbatim code + COMPACT-OK
  checkpoints so qwen can transcribe-and-report in small context; 1–3 are Claude judgment.
- 2026-07-05 USER refinement to the action economy — plan revised (still 0/6, not started):
  (1) a token now gets BOTH a move AND an action per turn → added `hasMoved` alongside
  `hasActed` (either-order; no ordering lock in v1). (2) Automatic defenses (dodge/parry/shield-
  block) are reactive, cost nothing, live in the damage layer, out of Phase 3 (decision 5). (3)
  Passive/minor effects cost nothing and run through a new optional `EngineProviders.triggers`
  post-action hook (seam shipped in Phase 3, catalog deferred; decision 6).
- 2026-07-05 `hasMoved` IMPLEMENTED NOW (ahead of Phase 3, as a foundational model field):
  added to `Unit`+`Squadron`, all Phase-1/2 token literals updated, build green + 87 tests pass.
  Step 1 no longer touches the model.
- 2026-07-05 USER refinement to COMBAT REACTIONS — per-hit ordering clarified: defense step
  (dodge/parry/block + shielding auras that negate by damage type, e.g. anti-magic shield vs
  elemental magic) → apply damage → reaction step (thorns etc.) that fires ONLY if the hit
  landed (a missed/negated attack triggers no thorns). Captured in a new DRAFT plan
  `20260705-1530-kingdom-tactics-combat-reactions-defenses-auras.md`; reducer `triggers` hook
  (per-action) noted as distinct from these per-hit combat hooks.
- 2026-07-08 STEP 1 DONE (CLAUDE). Created `src/engine/game-engine.ts` (`EngineProviders`,
  `applyAction`, `legalActions`, `IGameEngine`/`GameEngine` facade) + `game-engine.test.ts`
  (13 tests) + `src/engine/.annotated`. Dual budgets implemented (move sets `hasMoved`,
  attack/ability set `hasActed`, either order; `legalActions` offers each independently).
  End-turn resets BOTH flags on the INCOMING side and bumps `turn` only when play wraps to the
  lowest living side. `triggers` fires once per non-end-turn action, NOT on end-turn; victory
  re-checked every action; `rngState` persisted via `rng.state()`; decided matches reject
  further actions. Abilities remain a resolver-gated no-op (v1 decision 3). Open decision left at
  default: NO move-after-act ordering lock (move guarded only by `!hasMoved`). Verify: build 0,
  jest 100 passed / 0 failed (was 87). Next: Step 2 (AI Random/Greedy policies).
- 2026-07-08 STEP 2 DONE (CLAUDE). Created `src/ai/{policy.ts,eval.ts,random-policy.ts,
  greedy-policy.ts}` + `greedy-policy.test.ts` + `random-policy.test.ts` + `src/ai/.annotated`.
  `IAiPolicy.chooseAction` returns ONE action per call (sim loop re-invokes until end-turn).
  `eval.ts` holds the shared, RNG-FREE scoring (so ranking never perturbs the reducer's stream):
  `scoreAttack` = deterministic `resolveDamage` amount w/ terrain+moon+statuses; plus
  `nearestEnemyDistance`, `livingEnemies`, `tokenHp`, `templateFor`. RandomPolicy = uniform over
  non-end-turn acts (decision 4). GreedyPolicy = 1-ply lethal-first (lethal bonus 1e6), else
  distance-reducing move, else end-turn; ties break tokenId → targetId/coordKey. Verify: build 0,
  jest 108 passed / 0 failed (was 100). Next: Step 3 (MatchSimulator + result types) — last CLAUDE step.
- 2026-07-08 STEP 3 DONE (CLAUDE). Created `src/sim/types.ts` (`MatchResult`) +
  `src/sim/match-simulator.ts` (`MatchConfig`, `runMatch`) + `match-simulator.test.ts` +
  `src/sim/.annotated`. `runMatch` loops: active side's policy picks ONE action → reducer applies
  it, repeating until `decided` or `turn > maxTurns` (default 200). Two anti-stall guards:
  `MAX_ACTIONS_PER_TURN=500` forces end-turn; a no-op (reducer returns same ref) is converted to
  end-turn, and a no-op end-turn breaks the loop. Result: decided → winner/reason:'victory';
  else winner:'draw'/reason:'turn-limit'; survivors = living tokens per side. Tests: two-run
  determinism golden, 2-Greedy-vs-1-weak → winner 0, empty board → draw, maxTurns cap →
  'turn-limit'. `match-simulator.test.ts` exports `duelState()` for Step 4 to copy. Verify: build 0,
  jest 112 passed / 0 failed (was 108). **All 3 CLAUDE steps done.** Steps 4-6 are QWEN-SAFE
  (BatchSimulator, ScenarioSimulator, barrel+annotate+report) with verbatim code — hand to qwen
  via `/plan resume`, or Claude can transcribe them.
- 2026-07-08 STEP 4 DONE (qwen transcribed, Claude verified). qwen created
  `src/sim/batch-simulator.ts` (verbatim `runBatch`/`BatchConfig`/`BatchResult`) +
  `batch-simulator.test.ts` (5 tests, own inlined helpers after it correctly abandoned an
  import-from-test-file attempt). Code is CORRECT. Claude cleanup: removed an unnecessary
  `as unknown as Action` cast; restored `src/sim/.annotated` (qwen/hook had blanked it) with
  the batch entry. Host verify: build 0, **jest 117 passed / 0 failed** (was 112).
- 2026-07-08 INCIDENT + GUARDRAIL: qwen (running INSIDE the shattered_mcp container, which
  bind-mounts the host repo incl. `node_modules` rw) couldn't run the suite, improvised
  `pnpm install`/jest in-container, and clobbered the host's Windows `node_modules` (Linux
  bin shims + container store path → `'tsc' is not recognized`, and pnpm wanting to purge on
  every host command). Fixed on host by a reinstall. Qwen operating rules + Steps 5/6 Verify
  updated: qwen must NEVER run pnpm install/build/test in-container; build/test verification
  is HOST/Claude's job — qwen transcribes and leaves the box for the host.
- 2026-07-08 STEPS 5 + 6 DONE (Claude transcribed + host-verified). Step 5: `src/sim/
  scenario-simulator.ts` (manual both-sides driver: `step`/`getState`/`history`/`isOver`) +
  `scenario-simulator.test.ts` (2 tests: manual move+end-turn history; illegal move = same ref).
  Step 6: barrel `src/index.ts` now re-exports engine + ai (policy/random/greedy) + sim
  (types/match/batch/scenario); `src/sim/.annotated` gained the scenario entry (engine/ai
  already annotated in Steps 1-2). Followed the plan and did NOT export `ai/eval.ts` (internal
  helpers). **PHASE 3 COMPLETE** — build 0, jest 119 passed / 0 failed across 17 suites (was 87
  at phase start; +32). Engine is now self-driving: applyAction reducer + Random/Greedy policies
  + Match/Batch/Scenario simulators, all exported. Status → COMPLETE.
- 2026-07-09T14:22:47.666Z plan complete
