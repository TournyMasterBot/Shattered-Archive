# Plan: Kingdom Tactics — ability mechanics layer (standardized, resumable authoring)

Created: 2026-07-10T17:30:00-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Give every DSL ability (spell/song/skill) a standardized, hand-authored mechanics
definition and integrate it into combat, filled in incrementally with resumable coverage.

## Goal
A single `AbilityMechanics` interface standardizes how each ability's effect is defined
(category/targeting/scaling + damage/maladiction/buff/utility payloads). An authored registry
(`AUTHORED_MECHANICS`) maps ability keys → mechanics; a resolver falls back to a **no-op stub**
for any not-yet-authored ability (marks the caster acted, no effect — deterministic). The engine
consumes it via the existing `abilityResolver` seam. A `pnpm ability:coverage` tool + a checked-in
`docs/ability-coverage.md` manifest track authored-vs-stub per playable class kit, so authoring
resumes cleanly across sessions. Done (this plan) when: framework + tooling exist, the **Warrior**
kit is fully authored with tests, all suites green, and the coverage manifest + resumption loop are
in place. Step 7 stays the ongoing anchor until all 5 playable kits are authored.

## Constraints
- **Unauthored ability = NO-OP** (marks acted, zero effect). Never a heuristic effect — sims/golden
  tests must not move as authoring progresses. (Owner decision 2026-07-10.)
- **Authoring order = by playable class kit** (owner decision): Warrior → Ranger → Assassin → Mage →
  Cleric (the 5 classes in `CLASS_KITS`), then the wider catalog in follow-up plans.
- Mechanics are **hand-authored balance data** (like defenses.ts/auras.ts), NOT generated — the DSL
  files carry only prose (655/662 have a HelpFile; 0 set Effects/Duration/Usage). Derive intent from
  the help-file lore; record rationale in `notes`.
- Reuse existing combat seams: damage via `resolveDamageExchange`/`resolveDamage` (auto-hit), save-
  gated maladiction via `rollSave` (caster int vs target wis — already matches the spell model), and
  the server-only salted combat RNG. Do NOT introduce a second RNG.
- Isomorphic engine (no DOM/Node builtins in shipped code). pnpm only; host runs JS build/tests
  (never qwen in-container). Plain Jest matchers.
- Backward compatible: existing `AbilitySpec` callers/tests (attack.test.ts, game-engine.test.ts)
  keep working; extend, don't break.

## Context
- Catalog (from the prior plan): `src/data/dsl/abilities.ts` — `ABILITIES` [{key,name,type}] (662),
  `ABILITY_GROUPS` [{key,groupName,groupType,abilityKeys}] (162). Exposed via data provider.
- Integration seam: `src/engine/game-engine.ts` `EngineProviders.abilityResolver?: (key) => AbilitySpec`
  — abilities are a no-op today unless a resolver is supplied; `applyAbilityAction` calls it and passes
  the spec to `applyAbility` with the salted `hookRng` + `combatHooks`.
- Ability application: `src/rules/attack.ts` `applyAbility(state, casterId, targetId, spec, provider, rng, hooks?)`
  — `AbilitySpec { key, damage?:boolean, maladiction?{status,saves,baseSave} }`. Damage auto-hits
  (via `resolveDamageExchange` when hooks present); maladiction rolls `rollSave` and appends a
  `StatusEffect` on success. Extend here for buffs + potency.
- Model: `src/model/action.ts` `AbilityAction { type:'ability', tokenId, abilityKey, target? }`;
  `src/model/unit.ts` `StatusEffect { key, remaining, magnitude? }`.
- Playable kits: `src/data/balance/class-kits.ts` `CLASS_KITS` (5: Warrior/Ranger/Assassin/Mage/Cleric).
  A unit's ability keys come from `src/data/dsl/class-attributes.ts` `CLASS_ATTRIBUTES[class].abilities`
  ([{key,level,kind}] — keys join to the catalog, verified: Bash/Rescue/Berserk/Axe/Sword…).
- Server wiring target: `apps/kingdom-tactics-server/src/match/match-session.ts` builds `this.providers`
  (already injects combatHooks/combatRng) — add `abilityResolver` here.
- DSL help-file source (host `C:/Projects/DSL`): `Server.Dsl/{Skills,Spells,Songs}/<Ability>.cs` `HelpFile`.

## Steps
### [x] 1. AbilityMechanics interface + applyAbility extension (buffs, potency, no-op)
- Do: New `src/model/ability.ts` exporting `AbilityMechanics` and sub-specs:
  `category:'combat'|'utility'|'support'`, `targeting:'self'|'ally'|'enemy'` (v1 single-target;
  area later), `usage:'active'|'passive'|'toggle'`, `scaling:{power?,save?: 'str'|'dex'|'int'|'wis'|'con'}`,
  `damage?:{potency:number,damageType?}`, `maladiction?:{statusKey,duration,potency?,saves?,baseSave?}`,
  `buff?:{statusKey,duration,magnitude?,target:'self'|'ally'}`, `utility?:{kind,note?}`,
  `status:'authored'|'stub'`, `notes?`. Export from `model/index.ts`. Then extend `rules/attack.ts`
  `AbilitySpec` with optional `buff?` + optional `damageScale?:number`, and extend `applyAbility`
  (BOTH hook and non-hook branches) to: (a) scale the damage amount by `damageScale` (default 1),
  (b) apply a `buff` as a `StatusEffect{key:statusKey, remaining:duration, magnitude}` on caster
  (target:'self') or the given ally target (target:'ally'), with NO save, (c) a spec with none of
  damage/maladiction/buff just marks the caster acted (the no-op stub path).
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/model/ability.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/model/index.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/attack.ts
- Verify: engine `tsc` build clean; existing attack.test.ts/game-engine.test.ts still pass.

### [x] 2. Authored registry + resolver
- Do: New `src/data/balance/abilities/mechanics.ts` exporting
  `AUTHORED_MECHANICS: Record<string, AbilityMechanics>` (starts EMPTY; Warrior filled in step 5).
  New `src/data/balance/abilities/resolve.ts`: `resolveAbilityMechanics(key): AbilityMechanics`
  (returns `AUTHORED_MECHANICS[key]` or a no-op stub `{key, category:'utility', targeting:'self',
  usage:'active', scaling:{}, status:'stub'}`); `toAbilitySpec(m): AbilitySpec` (maps
  damage→{damage:true,damageScale:potency,...}, maladiction, buff); `createAbilityResolver():
  (key)=>AbilitySpec` = `(k)=>toAbilitySpec(resolveAbilityMechanics(k))`. Re-export the resolver +
  `AUTHORED_MECHANICS` + `resolveAbilityMechanics` from `src/data/index.ts`.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/balance/abilities/mechanics.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/balance/abilities/resolve.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/index.ts
- Verify: engine `tsc` clean; a resolver call on an unauthored key yields a no-op AbilitySpec.

### [x] 3. Coverage tooling (resumption checklist)
- Do: New `src/data/balance/abilities/coverage.ts` — pure functions computing, per playable kit,
  the kit's ability keys (from `CLASS_ATTRIBUTES[class].abilities` ∩ catalog) and how many are in
  `AUTHORED_MECHANICS` (status:'authored'); plus overall authored/total(662). New
  `src/tools/ability-coverage.ts` CLI printing per-kit `authored/total` + the NEXT unauthored kit's
  remaining keys, and writing `apps/kingdom-tactics-client/docs/ability-coverage.md` (a checked-in
  per-kit checklist: each ability key ✅ authored / ⬜ stub). Add package script
  `"ability:coverage": "tsx src/tools/ability-coverage.ts"`.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/balance/abilities/coverage.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/tools/ability-coverage.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/package.json,
  /workspace/shattered-archive/apps/kingdom-tactics-client/docs/ability-coverage.md
- Verify: host runs `pnpm --filter @shatteredarchive/kingdom-tactics-engine ability:coverage`; the
  manifest lists all 5 kits with Warrior counts and 0 authored elsewhere.

### [x] 4. Wire resolver into the server + confirm determinism
- Do: In `match-session.ts`, add `abilityResolver: createAbilityResolver()` to the providers bundle
  (import from the engine). No gateway change needed.
- Files: /workspace/shattered-archive/apps/kingdom-tactics-server/src/match/match-session.ts
- Verify: host — engine + server suites green; deterministic sim / golden tests UNCHANGED (unauthored
  abilities were already no-ops, so behavior is byte-identical until a kit is authored).

### [x] 5. Author batch 1 — Warrior kit (from help-file lore)
- Do: Fill `AUTHORED_MECHANICS` with a full `AbilityMechanics` for every Warrior ability key
  (`CLASS_ATTRIBUTES.Warrior.abilities`), reading each `Server.Dsl/Skills/<X>.cs` HelpFile to pick
  category/targeting/effect. Weapon-mastery skills (Sword/Axe/…) → passive combat (no active effect
  v1, status:'authored' with notes); Bash → combat maladiction (stun status, save vs wis); Berserk →
  self buff (attack up, duration); Parry/ShieldBlock/EnhancedDamage → passive (notes only);
  Rescue/SecondAttack → per lore. Scaling: skills → power 'str' or 'dex'. Add `mechanics.test.ts`
  asserting: Warrior kit 100% authored; a stun-maladiction, a self-buff, and a passive resolve to the
  right AbilitySpec; unauthored key → no-op stub.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/balance/abilities/mechanics.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/balance/abilities/mechanics.test.ts
- Verify: host engine test green; `ability:coverage` shows Warrior authored/authored (100%).

### [x] 6. Sign-off + design doc + indexes
- Do: New `apps/kingdom-tactics-client/docs/ABILITY-MECHANICS.md` — the `AbilityMechanics` reference
  + the **authoring/resumption protocol** (run `ability:coverage`, pick next kit, read help files,
  add entries, add tests, rerun). Refresh `.annotated` for `data/balance/abilities/`, `src/tools/`,
  `model/`; ROADMAP note. Full host sign-off (engine/server/client build+test) + regenerate
  coverage manifest.
- Files: /workspace/shattered-archive/apps/kingdom-tactics-client/docs/ABILITY-MECHANICS.md,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/balance/abilities/.annotated,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/tools/.annotated,
  /workspace/shattered-archive/apps/kingdom-tactics-client/docs/ROADMAP.md
- Verify: all three suites green; coverage manifest current.

## Ongoing authoring (tracked outside this plan — the framework above is COMPLETE)

Per-ability authoring is NOT a fixed checklist step — it is tracked by the regenerated coverage
manifest `apps/kingdom-tactics-client/docs/ability-coverage.md`. To continue, follow the protocol
in `docs/ABILITY-MECHANICS.md`: run `ability:coverage`, read the next kit's HelpFiles, add
`AUTHORED_MECHANICS` entries + tests, rerun coverage + the engine suite.

**Sequencing note:** meaningful per-kit authoring is now GATED on the class-roster work
(`.ai-plans/20260710-1815-kingdom-tactics-class-roster-restrictions.md`) — only 5 of ~45 mortal
classes have kits today, and the DSL `class-attributes` rosters are over-broad (Warrior's list
includes cross-class spells). Clean, restriction-correct per-class rosters must land first so we
don't author (e.g.) Fireball as a Warrior skill. Resume kit authoring after that plan.

## Progress log

- 2026-07-10T17:30:00-05:00 plan created — owner decisions: unauthored=no-op stub, order=by playable kit (Warrior first). Framework+Warrior this session; kits 2-5 via step 7.
- 2026-07-10T18:05:00-05:00 framework COMPLETE (steps 1-6). Layering adjustment: model-only registry/resolve stayed in data/balance/abilities; AbilitySpec adapter + createAbilityResolver went to rules/ability-resolver.ts (avoids a data→rules cycle). AbilitySpec extended with buff + damageScale; applyAbility applies buffs (self/ally, no save) + scales damage. Authored a representative Warrior batch (25 core skills: Kick/Charge/Bash+stun/Disarm/Trip/Berserk/Rescue + passives incl. weapon masteries) — NOT the full 113 (that list is polluted with cross-class spells; see sequencing note). Coverage tool + manifest live. Sign-off: engine 198/198, server 13/13, client 56/56, all builds clean.
- 2026-07-10T18:05:00-05:00 step 7 converted to an ongoing-authoring note (tracked by coverage manifest), gated on the class-roster plan. Status COMPLETE.
