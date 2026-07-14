# Plan: Kingdom Tactics — Phase 2 (rules resolvers)

Created: 2026-07-04T23:56:30-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Implement the pure, deterministic rules resolvers over the Phase-1 model + data — movement (done), line-of-sight, turn order, and victory — each a standalone unit-tested module in the engine.

> HANDOFF (qwen): steps 2–4 (line-of-sight, turn order, victory) are yours — they are
> routine, table-driven, and self-contained. When all are checked, set this doc
> COMPLETE. **Targeting + damage distillation from Server.Dsl/Calculators is
> deliberately NOT in this doc — Claude handles that separately, so do NOT create
> targeting.ts / damage.ts.** Do only steps 2, 3, 4.

## Goal
`services/kingdom-tactics-engine/src/rules/` exposes pure functions that, given a
`MatchState` (+ `IGameDataProvider` and, where randomness is needed, an `ISeededRng`),
answer: legal moves for a token, line-of-sight between tiles, legal attack targets +
resolved damage, initiative/turn order, and whether/how a match is decided. No
mutation of inputs, no wall-clock, no Math.random. Done when `pnpm --filter
@shatteredarchive/kingdom-tactics-engine build` and `… test` are green with
table-driven tests covering each resolver.

## Constraints
- Pure + deterministic: resolvers take state and return values/new data; they never
  mutate arguments, read the clock, or call Math.random (RNG only via ISeededRng).
- Isomorphic: no DOM / no Node built-ins in shipped code (tsconfig `types: []`).
- Reuse Phase-1 types/data only — import model from `../model/index.js`, data via the
  `IGameDataProvider` interface (`../data/index.js`). Do NOT hard-code stats; get them
  from `provider.unitTemplate()` / `provider.terrainEffect()` / `provider.moonEffect()`.
- Combat math is DISTILLED from the C# Calculators (source of truth), not invented:
  approximate/scale for a grid game and fill gaps with authored constants, but keep the
  structure (attack vs defense, damage-type resistances/vulnerabilities, saves) faithful.
  The Calculators are incomplete upstream — that's expected.
- Every resolver is interface-light and independently testable; add `*.test.ts` beside it.
- Update `.annotated` for `src/rules/` after adding files.
- REPORT WHAT YOU MODIFY: in each step's Progress-log entry, list the exact files you
  created or changed (one line each) plus a one-line summary of the behavior, so a
  reviewer (Claude) can audit your work afterward without diffing blind.

## Context
- Phase-1 model (all types): `/workspace/shattered-archive/services/kingdom-tactics-engine/src/model/index.js` — Coord, Side, Board, Tile (terrain key + feature), UnitTemplate (maxHp, stats, move: MovePattern{kind orthogonal|diagonal|omni|knight, range, jumps}, attack: AttackPattern{kind, range, minRange, areaRadius}, attackPower, defense, movementClass ground|flying|aquatic, resistances[], vulnerabilities[], traits[]), Unit, Squadron, BoardToken = Unit|Squadron, MatchState (board, tokens[], activeSide, turn, moon{type,phase}, rngState), Action, GameModeConfig.
- Data provider: `/workspace/shattered-archive/services/kingdom-tactics-engine/src/data/index.js` — `IGameDataProvider.unitTemplate(raceKey,classKey)`, `.terrainEffect(key)` -> {moveCost, passable{ground,flying,aquatic}, cover, blocksLoS}, `.moonEffect(phaseKey)` -> {magiSpellPowerMultiplier}. Tokens store `templateId` "Race:Class"; resolve via `rules/squadron.ts` `templateForMember` pattern (split ':').
- Existing rules seed: `/workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/squadron.ts` (+ index.ts barrel) — follow its import style and add new resolvers alongside.
- RNG: `/workspace/shattered-archive/services/kingdom-tactics-engine/src/rng/index.js` — `createRng(seed)` / `ISeededRng` (next/int/pick/state/clone).
- Combat-math source of truth (distill, do NOT reference at runtime), under `/workspace/dsl/Server/Server.Dsl/Calculators/`: `DamageCalculator.cs` (429 lines — core damage pipeline), `ArmorCalculators.cs` (68), `SavesCalculator.cs` (23), `DamageTypeGroupings.cs` (108 — how damage types cluster; informs resistance matching). Damage-type ids come from `Constants.cs` enum `DslDamageType`.
- Build/test: `pnpm --filter @shatteredarchive/kingdom-tactics-engine build` / `… test` (package-local jest, node env). Wrap long output with `bash /c/Projects/Shattered-AI/scripts/qdigest.sh`.

## Steps
### [x] 1. Board geometry + movement resolver
- Do: Add `src/rules/board.ts` (pure helpers: inBounds, tileAt, tokenAt(state,coord), occupied set, coord equality/neighbors, distance metrics for orthogonal/diagonal/omni/knight). Add `src/rules/movement.ts` exposing `legalMoves(state, tokenId, provider): Coord[]` — expand the token's MovePattern up to `range`, honoring terrain passability for the unit's movementClass and accumulated terrain moveCost (unless `move.jumps`), and blocking on occupied tiles. Add table-driven tests for each pattern kind + a jumps case + terrain-cost stopping.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/board.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/movement.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/movement.test.ts
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine test` passes the movement suite (qdigest-wrap).
### [x] 2. Line-of-sight resolver
- Do: Add `src/rules/line-of-sight.ts` with `hasLineOfSight(state, from, to, provider): boolean` (supercover/Bresenham tile walk; a tile whose terrainEffect.blocksLoS is true — excluding the endpoints — breaks LoS) and `tilesOnLine(from,to): Coord[]`. Table-driven tests: clear line, blocked by forest/mountain, adjacent always visible, endpoint terrain ignored.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/line-of-sight.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/line-of-sight.test.ts
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine test` passes the LoS suite.
### [x] 3. Turn order / initiative resolver
- Do: Add `src/rules/turn-order.ts`: `turnOrder(state, provider): string[]` returning living token instanceIds ordered by initiative — higher unit dexterity first (resolve a token's dex via its UnitTemplate.stats.dex; for a squadron use its fastest member's dex), stable tiebreak by instanceId ascending. Also `nextActiveSide(state): Side` (cycle 0..sides-1 by count of distinct token sides, wrapping). Pure, no mutation. Add table-driven tests: ordering by dex, stable tiebreak, dead tokens excluded, side cycling wraps. Export both from `src/rules/index.ts`.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/turn-order.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/turn-order.test.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/index.ts
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine test` passes the turn-order suite (qdigest-wrap). Log the files you changed.
### [x] 4. Victory resolver + barrel/annotate + complete
- Do: Add `src/rules/victory.ts`: `evaluateVictory(state, mode, provider): { decided: boolean; winner?: Side | 'draw' }` covering VictoryCondition = `rout` (only one side has living tokens → that side wins; none → draw), `control-point` (a side occupies/owns all `control-point` tile features → that side), `destroy-objective` (all `objective` features have hp <= 0 → the attacking side, i.e. the non-owner), `survive-waves` (placeholder: decided when no `side !== 0` tokens remain → side 0). A token is "living" when hp > 0 (unit) or hpPool > 0 (squadron). Export from `src/rules/index.ts`, update `src/rules/.annotated` to describe turn-order.ts + victory.ts, then set this doc `Status: COMPLETE`. Table-driven tests for each condition.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/victory.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/victory.test.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/index.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/.annotated
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine build` exits 0 and `… test` passes the full suite (qdigest-wrap). Log the files you changed.

## Claude follow-up (NOT part of this doc — do not execute as qwen)
Targeting (`legalTargets`) + damage (`resolveDamage`, distilled from
`/workspace/dsl/Server/Server.Dsl/Calculators/{DamageCalculator,ArmorCalculators,SavesCalculator,DamageTypeGroupings}.cs`)
are judgment-heavy and reserved for Claude. They will be added after this doc
completes, in a separate plan, using the LoS resolver produced by step 2.

## Progress log

- 2026-07-04T23:56:30-05:00 plan created
- 2026-07-05T00:05:00-05:00 step 1 done: src/rules/board.ts (grid helpers + step-offset sets) + src/rules/movement.ts (movementProfile + legalMoves: terrain-aware Dijkstra over MovePattern, honors passability/move-cost/blockers, jumps ignores intermediates) + movement.test.ts (7 tests, IGameDataProvider stub isolates geometry). Exported from rules barrel. Build exits 0; full suite 24 tests pass. (Also: renamed enum MortalClass.ShadowKnight→Shadowknight in DSL source + regenerated data — trivial 2-ref fix per user.)
- 2026-07-05T01:21:05-05:00 steps 2–4 done: qwen drafted line-of-sight.ts, turn-order.ts, victory.ts (+ tests, barrel, .annotated) but hit a struggle point and left them non-compiling; Claude reviewed and finished. Files: src/rules/line-of-sight.ts (fixed self-shadowing `const tilesOnLine`; tidied imports), src/rules/turn-order.ts (fixed unitTemplate arity — was called with 1 arg; now resolves via templateForMember), src/rules/victory.ts (fixed `status==='draw'` no-overlap type error; implemented real control-point + destroy-objective, previously stubbed), and rewrote all three test files (line-of-sight/turn-order/victory) to match the model (Squadron.members not memberTemplateIds; valid GameModeConfig; correct terrain wiring) and added control-point + destroy-objective coverage + decided-passthrough. Build exits 0; full suite 6 suites / 49 tests pass.
- 2026-07-05T01:21:05-05:00 PLAN COMPLETE — Phase 2 rules resolvers: movement, line-of-sight, turn order, victory. Claude follow-up remains (targeting + damage distilled from Server.Dsl/Calculators) — separate plan.
