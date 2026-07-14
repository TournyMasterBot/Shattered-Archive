# Plan: Kingdom Tactics — ability-casting gaps (AI casting + offensive/enemy-targeted spells)

Created: 2026-07-11T19:05:00-04:00 · Workspace: /workspace/shattered-archive · Status: ACTIVE
Task: Close the two gaps left by the cleric-heal slice — the AI can't cast abilities, and only self/ally (support) casting is wired; enemy-targeted spells aren't castable.

## Goal
An AI-controlled unit heals wounded allies and casts offensive spells, and a human can cast an
enemy-targeted ability from the Arena (range-gated). Done when: a Cleric AI with a wounded ally and
no lethal attack casts a Cure on it; a Mage (human or AI) casts an offensive ability on an in-range
enemy and not an out-of-range one; engine + client suites green; docs/indexes/memory updated.

## Constraints
- Do NOT add abilities to `legalActions` (the AI/sim action space) — it would shift every seeded
  sim outcome. AI policies call `legalAbilityActions` themselves; the UI already does. (This is the
  established convention, mirroring `set-stance`.)
- Engine stays isomorphic: no DOM / Node built-ins in shipped engine code (tsconfig `types: []`).
- The HOST runs every JS build/test. qwen must NEVER run `pnpm install|build|test` in-container
  (it corrupts the host Windows node_modules). All steps here are judgment-heavy → CLAUDE-run.
- pnpm only, via corepack; single-package `pnpm --filter … test` output may be read directly.

## Context
- `legalAbilityActions(state, tokenId, p)` — /workspace/shattered-archive/services/kingdom-tactics-engine/src/engine/game-engine.ts
  currently emits only authored active `self`/`ally` abilities; `enemy` targeting is a `// deferred (v1)` branch.
- Ability model has no range field — /workspace/shattered-archive/services/kingdom-tactics-engine/src/model/ability.ts
  (`AbilityMechanics`, `AbilityTargeting = 'self'|'ally'|'enemy'`). Caster attack range lives on
  `UnitTemplate.attack` (AttackPattern.range) in .../src/model/unit.ts.
- Authored mechanics — /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/balance/abilities/mechanics.ts
  (Warrior combat skills like Kick/Charge/Bash are `enemy`-targeted `damage` entries; Cleric cures are `ally` `heal`).
- GreedyPolicy (lethal-attack → advance → end-turn) — .../src/ai/greedy-policy.ts; scoring helpers in .../src/ai/eval.ts.
  It never consults `legalAbilityActions`, so the AI can't cast anything today.
- Arena cast panel (select unit → pick ability → ally cells highlight green `.kt-cell--ability` → click to cast)
  — /workspace/shattered-archive/apps/kingdom-tactics-client/src/features/arena/Arena.tsx (+ .css, + .test.tsx).
  It maps ability targets from `legalAbilitiesFor`; extending to enemies is highlight + a target class.
- `applyAbility` already resolves a `damage` component auto-hit against any target id — .../src/rules/attack.ts —
  so enemy casting needs enumeration + UI + AI only, not new resolution.

## Steps
### [x] 1. (CLAUDE) Range-gate + enumerate enemy-targeted abilities
- Do: add optional `range?: number` to `AbilityMechanics` (absent ⇒ fall back to the caster template's
  `attack.range`). In `legalAbilityActions`, replace the deferred `enemy` branch: for an authored active
  `enemy`-targeting ability, emit one `AbilityAction` per LIVING ENEMY within Chebyshev distance ≤ the
  ability's effective range. Leave self/ally unchanged. Set sensible `range` on offensive mechanics entries.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/model/ability.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/balance/abilities/mechanics.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/engine/game-engine.ts
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine test -- src/engine/game-engine.test.ts` —
  a Mage offers an offensive ability on an in-range enemy but NOT an out-of-range one, and a Cleric's cure
  still lists no enemy target.

### [x] 2. (CLAUDE) Arena: cast an enemy-targeted ability
- Do: when the pending ability targets enemies, highlight the in-range enemy cells with a distinct class
  (e.g. `.kt-cell--ability-enemy`, red) and dispatch the `AbilityAction` on click, exactly like the ally path.
  Keep green for heals/buffs. Update the hint text ("Select a highlighted enemy…").
- Files: /workspace/shattered-archive/apps/kingdom-tactics-client/src/features/arena/Arena.tsx,
  .../arena/Arena.css, .../arena/Arena.test.tsx
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-client test -- src/features/arena/Arena.test.tsx` —
  select a Mage, choose its offensive ability, click an in-range enemy → `onAct` receives an `ability` action
  targeting that enemy.

### [ ] 3. (CLAUDE) GreedyPolicy heals a wounded ally
- Do: in `GreedyPolicy.chooseAction`, after the lethal-attack tier, query `legalAbilityActions(state, id, p)`
  for each own unit; if a `heal` ability exists and an ally (incl. self) is below a hp-fraction threshold,
  return the strongest heal on the MOST-wounded ally (deterministic tie-breaks by tokenId/target).
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/ai/greedy-policy.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/ai/eval.ts
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine test -- src/ai/greedy-policy.test.ts` —
  a Cleric with a wounded ally and no lethal attack returns an `ability` Cure* action on the wounded ally.

### [ ] 4. (CLAUDE) GreedyPolicy weighs offensive abilities against attacks
- Do: fold in-range offensive ability casts into the attack-scoring tier (score = would-be resolved damage
  × potency, lethal-first like weapons), so the AI opens with a spell when it out-damages a swing.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/ai/greedy-policy.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/ai/eval.ts
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine test -- src/ai/greedy-policy.test.ts` —
  a Mage whose in-range offensive ability out-damages its melee prefers the ability.

### [ ] 5. (CLAUDE) Refresh docs, indexes, memory
- Do: update the `ai/` + `arena/` `.annotated` entries and any KT abilities doc to note AI casting +
  offensive casting; flip the [[kt-abilities-heal-and-board-labels]] memory's "AI doesn't cast / offensive
  deferred" caveats to DONE.
- Files: /workspace/shattered-archive/**/.annotated, apps/kingdom-tactics-client/docs/, the memory file
- Verify: the updated `.annotated`/memory lines mention AI heal + offensive-ability casting.

## Progress log

- 2026-07-11T19:05:00-04:00 plan created
- 2026-07-13 Step 1 DONE (Claude). Added optional `range?: number` to `AbilityMechanics`
  (model/ability.ts; absent ⇒ caster template `attack.range`). Rewrote the deferred `enemy` branch in
  `legalAbilityActions` (game-engine.ts): emits one `AbilityAction` per living enemy within
  `chebyshev(caster.pos, enemy.pos) ≤ effective reach`; imported `chebyshev` from rules. Set `range: 2`
  on Charge (mechanics.ts) to exercise the override vs weapon reach. New test in game-engine.test.ts:
  a Human:Warrior offers Kick (weapon reach 1) only vs the adjacent foe but Charge (range 2) vs foes at
  dist 1–2, never dist 3 / allies / self. Full engine suite green (266/266).
- 2026-07-13 RANGE CONVENTION (user-confirmed design). MUD "room" scope → KT Chebyshev tiles:
  most spells & skills are "in room" ⇒ OMIT `range`, inherit caster `attack.range` (melee 1, Mage cast 3,
  Ranger bow 4). Exceptions set explicit `range`: an "adjacent-room" skill ⇒ weapon reach + 1 (=2 for
  melee, e.g. Charge); a ranged artillery spell (fireball, blizzard, lightning bolt, the fire/cold/lightning
  cones) ⇒ 5. Cones are a directional AoE SHAPE — `range` only gates reach; cone geometry is future
  targeting-shape work. Bows are NOT per-item (items.json has no range field, verified) — bow reach is the
  Ranger kit `attack.range` (4). Documented in model/ability.ts + balance/abilities/mechanics.ts headers.
  No offensive Mage spells are authored yet, so the "5" tier is forward-looking guidance for that authoring.
  Next: Step 2 (Arena UI).
- 2026-07-13 Step 2 DONE (Claude). Arena now casts enemy-targeted abilities. The click-to-cast
  plumbing (`abilityTargets` map → `handleCell`) was already target-agnostic, so no dispatch change
  was needed; added only the visual/affordance split: a new `pendingTargetsEnemy` memo (derived from
  the highlighted recipients' `side`), a per-cell `.kt-cell--ability-enemy` class (dashed warm-orange,
  distinct from green support-cast and solid-red plain attack), and enemy-worded hint text
  ("Select a highlighted enemy to cast …"). Files: Arena.tsx, Arena.css. New test in Arena.test.tsx:
  a warrior with a stubbed enemy-targeted Kick highlights the foe with `.kt-cell--ability-enemy` (0
  green cells), shows the "enemy" hint, and emits the `ability` action on click. Client arena suite
  green (9/9). Test stubs `legalAbilitiesFor` on purpose — range-gating is engine-tested (step 1), and
  the Arena is pure presentation over whatever the enumerator returns. Next: Step 3 (GreedyPolicy heal).
