# Plan: Kingdom Tactics — Combat reactions, defenses & auras

Created: 2026-07-05T15:30:00-05:00 · Promoted: 2026-07-10T13:00:00-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Extend the Phase-2b combat resolution with automatic defenses (dodge/parry/shield-block), typed shielding auras (negate/reduce by damage type), and reactive auras (thorns) that fire back after a landed hit — all resolving inside a single attack, none touching the move/action economy, and all OPT-IN so existing deterministic sims/tests stay green until a match enables them.

## Goal
`services/kingdom-tactics-engine/src/rules/` gains a `CombatHooks` seam (onAvoid/onDefend/onHit)
threaded through `applyAttack`/`applyAbility`, an authored defense + aura data layer
(`data/balance/defenses.ts` + `data/balance/auras.ts`, one tuning surface each), and a default
hooks implementation wired into the reducer via a new **opt-in** `EngineProviders.combatHooks?`
seam (mirroring the existing `triggers?` seam). Done when: the seam defaults to today's exact
Phase-2b behavior (all current engine/server/client suites stay green); with the default hooks
enabled a match shows dodge avoidance, a typed shield negating a magic hit, and thorns damaging
the attacker on a landed hit; and `pnpm --filter @shatteredarchive/kingdom-tactics-engine build`
+ `… test` are green with table-driven coverage. No new runtime deps.

## Constraints
- Pure + deterministic: no mutation of inputs, no wall-clock, no `Math.random`. All variance goes
  through `ctx.rng` (an `ISeededRng`) so results are replayable.
- **Server-only, unguessable defense RNG (USER REQUIREMENT 2026-07-10).** The defense/avoidance
  stream must NOT be the public `MatchState.rngState` (that value ships in every broadcast snapshot,
  so a client could predict dodge/parry/block). Instead it is a SERVER-ONLY stream seeded from a
  per-match **secret salt** + a **step counter** — replayable server-side (same salt + same action
  order → same rolls) but hard for the client to guess (the salt never enters `MatchState`, never
  crosses the wire). The engine exposes this as an OPT-IN `EngineProviders.combatRng?` factory + a
  pure `createCombatRng(salt, step)` helper; ONLY the server supplies it. The client is snapshot-only
  and never runs the hooks, so it needs no seed. (Mulberry32 is not cryptographic — "difficult to
  guess" rests on the secret salt never leaving the server, which is sufficient here.)
- **Opt-in, non-breaking.** The hooks param defaults absent; `applyAttack`/`applyAbility` with no
  hooks behave EXACTLY as today. Wiring the default hooks into the reducer is via a new optional
  `EngineProviders.combatHooks?` — absent (the default everywhere today) ⇒ zero behavior change, so
  the deterministic match/batch/greedy golden tests keep passing untouched. Only tests/consumers
  that explicitly opt in see reactions.
- DISTILL where the DSL has data, AUTHOR where it doesn't. `SavesCalculator` is spells-only; the
  DSL has no clean dodge/parry/block calculator, so avoidance is grid-scaled AUTHORED data in
  `data/balance/defenses.ts` (a `DEFENSE_CONSTANTS`-style tuning surface, same pattern as
  `DAMAGE_CONSTANTS`). Aura magnitudes/filters are authored in `data/balance/auras.ts`.
- Reactions that deal damage (thorns) MUST route through `resolveDamage` (single source of truth),
  not ad-hoc math — so thorn damage respects the attacker's own armor/resist/con.
- Reuse existing surfaces: `resolveDamage` (rules/damage.ts), `templateForMember` (rules/squadron.ts),
  `tileAt` (rules/board.ts), `StatusEffect`/`UnitTemplate.traits` (model/unit.ts). Get all numbers
  from `IGameDataProvider` — never hard-code stats.
- Update `src/rules/index.ts` barrel, `src/data/balance` + `src/rules` `.annotated`, and refresh the
  `@ai-method` annotation blocks on any method whose body changes (they carry a stale-detecting hash).

## Combat resolution order (per single attack or damaging spell hit) — AUTHORITATIVE
Each attack against ONE target runs the whole pipeline; AoE runs it per splashed target.

1. **Declare.** Attacker's action already spent (reducer economy). Resolve attacker + defender
   `UnitTemplate`s, damage type, defender terrain, moon phase (the Phase-2b `resolveDamage` inputs).
2. **Avoidance step (automatic, no cost).** `hooks.onAvoid(ctx)` rolls dodge → parry → shield-block
   via `ctx.rng`. On success the attack is AVOIDED: **0 damage, NO hit** — SHORT-CIRCUIT to step 6
   (skip damage AND reactions). USER RULE: a missed melee attack means the defender "wasn't hit", so
   no thorns. Damage SPELLS auto-hit and by default SKIP avoidance unless a magic-evasion aura opts in.
3. **Shielding / defensive auras (automatic, no cost).** `hooks.onDefend(incoming, ctx)` adjusts the
   incoming hit AFTER `resolveDamage` computes it, keyed by the incoming damage TYPE via
   `data/dsl/damage-types.ts` groupings: anti-magic shield → NEGATE (→0) any `magic` hit; elemental
   ward → reduce fire/cold/lightning. Returns the possibly-reduced amount; 0 = fully negated = **NO
   hit** for step 5.
4. **Apply damage.** Reduce defender hp/hpPool by the (post-onDefend) amount. "Hit landed" ⇔ amount ≥ 1.
5. **Reaction step (automatic, no cost) — ONLY IF THE HIT LANDED.** `hooks.onHit(dealt, ctx)` returns
   a new `MatchState`: reactive auras on the DEFENDER fire back at the ATTACKER (thorns → damage routed
   through `resolveDamage`). If step 2 avoided or step 3 fully negated, this step is SKIPPED.
6. **Done.** Return the new `MatchState`. Nothing in steps 2–5 spent a move/action budget.

## Hook design (the seam) — verified against current code 2026-07-10
```ts
// rules/combat-hooks.ts (new)
export interface CombatContext {
  readonly state: MatchState;
  readonly attacker: UnitTemplate;
  readonly defender: UnitTemplate;
  readonly attackerId: string;
  readonly defenderId: string;
  readonly damageType: string;              // attacker.damageType
  readonly isSpell: boolean;                // true for applyAbility damage, false for weapon
  readonly defenderStatusKeys: readonly string[];
  readonly provider: IGameDataProvider;
  readonly rng: ISeededRng;
}
export interface CombatHooks {
  onAvoid?(ctx: CombatContext): boolean;                 // step 2: true = attack avoided entirely
  onDefend?(incoming: number, ctx: CombatContext): number; // step 3: return reduced amount (0 = negated)
  onHit?(dealt: number, ctx: CombatContext): MatchState;   // step 5: fires only on a landed hit
}
```
Thread as an added optional last param `hooks?: CombatHooks` on `applyAttack`/`applyAbility`
(rules/attack.ts). Reducer passes `p.combatHooks` (new optional `EngineProviders.combatHooks?:
CombatHooks`) at the two call sites (game-engine.ts:157 applyAttack, :182 applyAbility). Absent ⇒
unchanged. The hooks object is stateless — all context (rng/provider/state) arrives via `ctx`.

### Relationship to the reducer `triggers` hook (do not conflate)
- **`CombatHooks`** (this doc): FINE, per-HIT, inside one attack; knows attacker/defender/damage type.
- **`EngineProviders.triggers`** (Phase 3): COARSE, per-ACTION, in the reducer; turn-tick auras/banter.

## Context — verified current surfaces (read 2026-07-10; exact)
- `applyAttack(state, attackerId, targetId, provider, rng?): MatchState` and
  `applyAbility(state, casterId, targetId, ability, provider, rng): MatchState` — rules/attack.ts.
  Both resolve templates via `resolveTemplate` (squadron → first member), call `resolveDamage`, map
  tokens to reduce hp/hpPool, mark attacker `hasActed`. No hooks param today.
- `resolveDamage(input): DamageResult` — rules/damage.ts; `DamageResult { amount, preMitigation,
  wasResisted, wasVulnerable, category }`. Has a `defenderStatusKeys` protection step (only
  'sanctuary' today). `DAMAGE_CONSTANTS` is the tuning object.
- `damageCategory(type): 'physical'|'magic'`, `elementalGroup(type): 'fire'|'cold'|'lightning'|null`,
  `resistMatches(resist, type)` — data/dsl/damage-types.ts.
- `UnitTemplate.traits: readonly string[]` (free-form keys e.g. 'magi','large') and
  `StatusEffect { key, remaining, magnitude? }` — model/unit.ts. Auras ride on trait keys (innate) or
  status keys (granted/charged).
- `EngineProviders { data, modes, abilityResolver?, triggers? }` — engine/game-engine.ts:35; the
  reducer calls `applyAttack(..., p.data, rng)` at line 157 and `applyAbility(..., p.data, rng)` at 182.
- Barrel `rules/index.ts` re-exports the rules surface; `src/index.ts` re-exports `rules/index.js`.

## Steps

### [x] 1. (CLAUDE) CombatHooks seam threaded through applyAttack/applyAbility (opt-in, default-absent)
- Do: Create `src/rules/combat-hooks.ts` with `CombatContext` + `CombatHooks` (above). Thread an
  optional `hooks?: CombatHooks` as the LAST param of `applyAttack` and `applyAbility` (rules/attack.ts),
  implementing the authoritative order for the WEAPON path and the spell DAMAGE path:
  build `ctx`; if `hooks?.onAvoid?.(ctx)` → mark attacker hasActed, NO damage, return (no reactions);
  else `amount = resolveDamage(...).amount`, then `if (hooks?.onDefend) amount = hooks.onDefend(amount, ctx)`;
  apply `amount` (if >0); `if (amount>0 && hooks?.onHit) next = hooks.onHit(amount, ctx)`; return.
  For `applyAbility`: avoidance is skipped by default (spells auto-hit) — pass `isSpell:true` in ctx and
  let `onAvoid` decide; onDefend/onHit still apply to the damage component. Maladiction path unchanged.
  Export `CombatHooks`/`CombatContext` from `rules/index.ts` (+ `src/index.ts` via the barrel).
- Files: `src/rules/combat-hooks.ts`, `src/rules/attack.ts`, `src/rules/attack.test.ts`, `src/rules/index.ts`.
- Verify (HOST): `pnpm --filter @shatteredarchive/kingdom-tactics-engine build && … test` green — ALL
  existing tests unchanged (hooks absent), PLUS new stub-hook cases: onAvoid ⇒ 0 damage + onHit NOT
  called; onDefend negates a magic hit (amount 0, no onHit); onHit applies thorn damage only on a
  landed hit; a fully-avoided/negated attack still marks the attacker hasActed.

### [x] 2. (CLAUDE) Authored defense + aura data + resolver helpers
- Do: `src/data/balance/defenses.ts` — `DEFENSE_CONSTANTS` (dodge/parry/block base chances + a dex
  scaling term + a per-armorType block table, all grid-scaled, one tuning surface) and
  `avoidChance(template, ctx): number` / a small `rollAvoidance(template, rng): boolean` helper
  (dodge→parry→block, melee only). `src/data/balance/auras.ts` — an authored aura catalog:
  `AURA_CATALOG: Record<string, AuraSpec>` where `AuraSpec = { kind:'shield'|'reactive';
  filter:'magic'|'fire'|'cold'|'lightning'|'physical'|'all'; mode:'negate'|'reduce'|'thorns';
  magnitude:number }`, plus `shieldFor(keys)` / `reactiveFor(keys)` lookups that map a token's
  trait+status keys to the auras present. Pure data + pure helpers; no rng in the catalog itself.
- Files: `src/data/balance/defenses.ts`, `src/data/balance/defenses.test.ts`,
  `src/data/balance/auras.ts`, `src/data/balance/auras.test.ts`.
- Verify (HOST): `… test` green — avoidChance rises with dex + heavier armor block; a known aura key
  resolves to its spec; unknown keys resolve to none.

### [x] 3. (CLAUDE) Default CombatHooks impl + opt-in engine seams (combatHooks + server-only combatRng)
- Do: `src/rules/default-combat-hooks.ts` — `export const defaultCombatHooks: CombatHooks` reading
  the Step-2 data + ctx: `onAvoid` = melee-only `rollAvoidance(defender, ctx.rng)` (spells skip unless
  a 'magic-evasion' aura key is present); `onDefend` = apply the strongest matching SHIELD aura on the
  defender (negate → 0 for a matching filter, reduce → `incoming*(1-magnitude)`); `onHit` = for each
  REACTIVE 'thorns' aura on the defender, deal `resolveDamage`-routed damage to the ATTACKER (thorns
  template = defender's, floored ≥1), returning the new state. Add a pure
  `createCombatRng(salt: number, step: number): ISeededRng` helper (mixes salt+step into a Mulberry32
  seed) in `src/rng/` (or rules) so a salted, step-counted, replayable stream can be built.
  Engine seams on `EngineProviders` (engine/game-engine.ts): optional `combatHooks?: CombatHooks` AND
  optional `combatRng?: (state, action) => ISeededRng` (the SERVER-ONLY salted stream source). The
  reducer builds `CombatContext.rng` from `p.combatRng?.(state, action)` when present, else falls back
  to the threaded public `rng`; and passes `p.combatHooks` at the applyAttack (:157) / applyAbility
  (:182) call sites. Both absent ⇒ every existing sim/match/greedy golden test stays byte-identical.
  Export `defaultCombatHooks` + `createCombatRng` from the barrels.
- Files: `src/rules/default-combat-hooks.ts`, `src/rules/default-combat-hooks.test.ts`,
  `src/rng/combat-rng.ts` (+ export), `src/engine/game-engine.ts`, `src/engine/game-engine.test.ts`,
  `src/rules/index.ts`, `src/index.ts`.
- Verify (HOST): `build && test` green — reducer test with `combatHooks: defaultCombatHooks` +
  a fixed-salt `combatRng` and a scripted setup shows (a) a high-dodge defender avoiding a melee attack
  (no hp loss, attacker hasActed), (b) an anti-magic-shield defender taking 0 from a magic hit, (c) a
  thorns defender damaging the attacker on a landed hit; `createCombatRng(salt,step)` is deterministic
  (same args → same sequence, different salt → divergence); and a control reducer test WITHOUT the seams
  is byte-identical to before.

### [x] 4. (CLAUDE) Server adopts the salted, step-counted, server-only defense RNG
- Do: In `apps/kingdom-tactics-server/src/match/match-session.ts` generate a per-match SECRET salt at
  construction (Node `crypto.randomInt`/`randomBytes` → a number; server-only, NOT stored in
  `MatchState`, NOT in any `KtServerMessage`), hold a monotonic `combatStep` counter, and supply the
  engine seams to every `applyAction` it drives (human `applyClientAction` + AI `runAiUntilHuman`):
  `combatHooks: defaultCombatHooks` and `combatRng: () => createCombatRng(this.salt, this.combatStep++)`.
  Confirm the broadcast path (`ws/kt-gateway.ts` → `snapshot`/`joined`/`over`) still serializes only
  `MatchState` (no salt leaks). Replay determinism: same salt + same action order → identical rolls.
- Files: `apps/kingdom-tactics-server/src/match/match-session.ts`, `…/match/match-session.test.ts`.
- Verify (HOST): server `build` + `test` green — a test proving (a) two `MatchSession`s built with the
  SAME injected salt replay identical outcomes for the same action sequence, (b) different salts diverge,
  (c) no `KtServerMessage`/snapshot contains the salt. Engine + client suites unaffected.

### [x] 5. (CLAUDE) Barrel/exports, refresh indexes + annotations, full-suite sign-off, complete
- Do: Confirm `src/index.ts` surfaces the new exports (via `rules/index.js`). Refresh
  `src/rules/.annotated` (combat-hooks, default-combat-hooks) + `src/data/balance/.annotated`
  (defenses, auras); refresh `@ai-method` annotation blocks on `applyAttack`/`applyAbility`/the reducer
  call sites whose bodies changed (stale `@ai-hash`); note the new `combatHooks`/`combatRng` seams in
  the engine `src/engine`/`src/rules` `.ai-context` if present, and refresh the server `src/match`
  `.annotated` for the salted-RNG adoption. HOST full sign-off: engine `build` 0 + `test` green (report
  count vs the 149 baseline), server `build` + `test` green (grew by the Step-4 salt tests, was 10),
  client `test` unaffected. Set this doc `Status: COMPLETE`, check the box, append a final Progress-log
  summary.
- Files: `src/index.ts` (confirm), the `.annotated`/`.ai-context` files, the `@ai-method` blocks.
- Verify (HOST): all three packages green; `Status: COMPLETE`.

## Open questions (resolved for v1)
- Spells + avoidance: spells auto-hit and skip step 2 unless a 'magic-evasion' aura opts in (v1).
- Shielding auras as resource vs passive: v1 treats them as passive-while-present (trait or status
  key); charge-decrement (`StatusEffect.remaining`) is a later enhancement.
- Thorns vs armor: thorn damage routes through `resolveDamage` (respects attacker armor/resist/con) — v1.
- Real class-kit aura assignment: v1 ships the mechanism + catalog; assigning auras to specific race/
  class kits (which would shift balance + sim golden numbers) is a deliberate FOLLOW-UP, not this doc.

## Progress log
- 2026-07-05T15:30 DRAFT created from USER combat-reaction refinement (authoritative per-hit order +
  CombatHooks seam + distinction from the per-action reducer `triggers` hook + DSL data needs).
- 2026-07-10T13:00 PROMOTED to numbered ACTIVE plan (user picked this as the next phase after Phase 7
  sign-off). Verified current surfaces (applyAttack/applyAbility signatures, resolveDamage protection
  step, EngineProviders seams, UnitTemplate.traits/StatusEffect). Reframed to OPT-IN via
  `EngineProviders.combatHooks?` so existing deterministic sims/tests stay green until enabled. Four
  CLAUDE steps: (1) hooks seam threaded through attack.ts, (2) authored defense+aura data, (3) default
  hooks impl + reducer wiring, (4) indexes/annotations + sign-off.
- 2026-07-10T13:20 USER requirement added: the defense RNG must be SERVER-ONLY (not the broadcast
  `MatchState.rngState`), seeded from a per-match secret salt + a step counter — replayable server-side,
  unguessable by the client (which never runs the hooks). Reworked to 5 steps: added the opt-in
  `EngineProviders.combatRng?` seam + `createCombatRng(salt, step)` helper to Step 3, and a new Step 4
  where the server `MatchSession` generates the secret salt, holds the step counter, and injects
  `combatHooks` + `combatRng` into every `applyAction` (salt never serialized). Sign-off is now Step 5.
- 2026-07-10T13:40 step 1 done: added `rules/combat-hooks.ts` (CombatContext + CombatHooks:
  onAvoid/onDefend/onHit; ctx.rng documented as the server-only salted stream). Threaded optional
  `hooks?: CombatHooks` through `applyAttack`/`applyAbility` (rules/attack.ts) via a shared
  `resolveDamageExchange` implementing the authoritative order (avoid → resolveDamage → onDefend →
  apply+markActed → onHit only-if-landed); default (no hooks / no rng) path left byte-identical.
  Exported the hook types from the rules barrel. 4 stub-hook tests (onAvoid short-circuit + no onHit;
  onDefend→0 = no hit; onHit thorns only on a landed hit; no-hooks == default). HOST: engine build 0,
  test 153/153 (was 149).
- 2026-07-10T13:55 step 2 done: authored `data/balance/defenses.ts` (DEFENSE_CONSTANTS tuning surface;
  dodgeChance dex-scaled, parry flat, blockChance by armorType, combined avoidChance capped at
  MAX_AVOID, seeded rollAvoidance dodge→parry→block) and `data/balance/auras.ts` (AuraSpec catalog:
  shield-magic/ward-fire/ward-cold/ward-lightning/thorns + MAGIC_EVASION_KEY; aurasFor/shieldsFor/
  reactivesFor lookups + auraFilterMatches over damage-type groupings). 10 tests (defenses 5 + auras 5).
  HOST: engine test 163/163 (was 153).
- 2026-07-10T14:20 step 3 done: `rng/combat-rng.ts` (createCombatRng/combatSeed — salt+step→uint32
  mix, replayable) + `rules/default-combat-hooks.ts` (defaultCombatHooks: onAvoid dodge/parry/block,
  spell-gated by magic-evasion; onDefend typed shields negate/reduce; onHit thorns routed through
  resolveDamage vs the attacker). Added opt-in `EngineProviders.combatHooks?` + server-only
  `combatRng?` seams; reducer sources the hooks' rng from combatRng-per-action (else public rng) at
  both call sites; default (seams absent) path byte-identical. Exported via rng/rules barrels. Tests:
  combat-rng 4 (determinism/divergence), default-combat-hooks 8 (shields/thorns/spell-gating), reducer
  3 (dodge avoids, thorns reflects, no-aura==default). HOST: engine build 0, test 178/178 (was 163).
- 2026-07-10T14:45 step 4 done: `MatchSession` now generates a per-match SECRET salt
  (`opts.combatSalt ?? crypto.randomInt(2^32)`; server-only, never in MatchState) + a monotonic
  `combatStep`, and injects `combatHooks: defaultCombatHooks` + `combatRng: () =>
  createCombatRng(salt, step++)` into the providers it feeds every applyAction (human + AI). Registry
  threads an optional `combatSalt` (production: omitted → each session self-generates distinct;
  tests: fixed). Existing outcome tests pinned to `combatSalt: 42` (winner still 0 with reactions on).
  +3 tests: same salt → identical replay, different salt → divergent full-match outcome, salt never in
  a broadcast snapshot. HOST: server build 0, test 13/13 (was 10). The client (snapshot-only, never
  runs hooks, never sees the salt) cannot predict avoidance — the user's requirement.
- 2026-07-10T15:05 step 5 done + PLAN COMPLETE. Barrels: new symbols surface transitively via
  `export * from './rng/index.js'` + `'./rules/index.js'` (createCombatRng/combatSeed, CombatContext/
  CombatHooks, defaultCombatHooks). Refreshed `.annotated`: engine rules (combat-hooks +
  default-combat-hooks + attack note), data/balance (auras + defenses), rng (was empty → seeded +
  combat-rng), server src/match (salted server-only RNG). NOTE: the reducer's `applyAttackAction`/
  `applyAbilityAction` @ai-method hash blocks are now stale (bodies changed) — left for annotate_methods
  to regenerate (must not be hand-edited). FULL SIGN-OFF (host): engine build 0 + test 178/178 (was 149
  at phase start); server build 0 + test 13/13 (was 10); client build clean + test 56/56 (unaffected).
  Combat reactions shipped: opt-in CombatHooks seam (avoidance → typed shields → apply → thorns), an
  authored defense+aura data layer, a default hooks impl, and server adoption over a SERVER-ONLY salted,
  step-counted, replayable-but-unguessable defense RNG. Deferred (documented in Open questions): aura
  charge/decrement, assigning auras to real class kits, migrating maladiction saves onto the salted stream.
