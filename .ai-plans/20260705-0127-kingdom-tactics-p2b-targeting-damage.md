# Plan: Kingdom Tactics — Phase 2b (targeting + damage, distilled from Calculators)

Created: 2026-07-05T01:27:26-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Add the targeting and damage resolvers to the engine's rules layer, with the damage pipeline distilled faithfully (but grid-scaled) from Server.Dsl/Calculators, building on the Phase-2 line-of-sight resolver.

> CLAUDE-LED (judgment-heavy distillation). This is NOT a qwen auto-resume doc —
> qwen struggled on the simpler Phase-2 steps; the damage pipeline needs real
> reasoning about the C# source. Do not `/plan resume` this into qwen.

## Goal
`services/kingdom-tactics-engine/src/rules/` gains `targeting.ts` (`legalTargets`,
AoE splash) and `damage.ts` (`resolveDamage`) — pure, deterministic functions that
answer "who can this token attack?" and "how much damage lands?", the latter mirroring
the DSL DamageCalculator's ordered pipeline scaled for a grid game. Done when `pnpm
--filter @shatteredarchive/kingdom-tactics-engine build` and `… test` are green with
table-driven tests (resistance, vulnerability, cover, armor type, magi moon boost,
AoE, LoS-gated ranged targeting, min-damage floor) and the resolvers are exported +
annotated.

## Constraints
- Pure + deterministic: no mutation of inputs, no wall-clock, no Math.random. Any
  variance goes through `ISeededRng` (from `../rng/index.js`) so results are replayable.
- DISTILL, don't invent: keep the DSL pipeline's ORDER and structure (con-reduction →
  AC mitigation → multiplicative protections → floor at 1). Grid-scale the magnitudes
  with authored constants in one place; do not import the .cs at runtime.
- Reuse Phase-2: ranged targeting must use `hasLineOfSight` from
  `src/rules/line-of-sight.ts`; get all unit numbers from `IGameDataProvider`
  (`unitTemplate`, `terrainEffect`, `moonEffect`) — never hard-code stats.
- Interface-light + isolated tests (IGameDataProvider stubs, like movement.test.ts).
- Update `src/rules/index.ts` barrel and `src/rules/.annotated` after adding files.

## Context — distilled DSL combat math (source of truth; do NOT reference at runtime)
Source: /workspace/dsl/Server/Server.Dsl/Calculators/ (already read; facts captured here so implementation needs no re-read).

- **DamageCalculator.cs pipeline (order matters):**
  1. `rawDamage` = source raw damage (weapon/spell base).
  2. Constitution pre-reduction: `conMod = GetConModifier(targetCon); rawDamage -= rawDamage * conMod` (applied BEFORE armor).
  3. AC mitigation per physical category P/B/S and energy E: `damageX = rawDamage * (1 - armorMod.ModX)`, where the armor modifier derives from `damage * (1 - AC/1000)` (AC scaled by 1000 in DSL — grid game will use a smaller divisor constant).
  4. Protection modifiers (MULTIPLICATIVE, after AC): Sanctuary ×0.5; alignment protection (ProtectionGood/Neutral/Evil vs matching target alignment) ×0.25; elemental protection (ProtectionFire/Cold when the incoming damage type is in that group) ×0.25.
  5. `CalculateFinalDamage` floors the result at 1 (never 0).
  6. NO randomness/dice in the calculator — deterministic. (Raw damage/dice originate elsewhere.)
- **ArmorCalculators.cs:** armor-class multiplier by armor type — Cloth 0.00, Leather 0.25, Studded 0.50, Chain 0.75, Plate 1.00. Slot multiplier — Body 3; Head/Shield/Legs/AboutBody 2; Hands/Arms/Feet 1.
- **DamageTypeGroupings.cs:** physical clusters — Piercing {Bite,Charge,Grep,Peck,Pierce,Stab,Sting,Thrust}, Blunt {Beating,Blast,Crush,Pound,Punch,Slap,Slime,Smash,Suction,Thwack}, Slashing {Claw,Cleave,Scratch,Slash,Slice,Whip}; Magic {AcidicBite,Divine,Drain,Flame,FlamingBite,Chill,FreezingBite,Magic,Shock,ShockingBite,Wrath}; elemental subsets — Fire {Flame,FlamingBite}, Cold {Chill,FreezingBite}, Lightning {Shock,ShockingBite}. Damage-type ids are the `Constants.DslDamageType` enum.
- **SavesCalculator.cs (comment-only):** spell landing rate `LR = 100 - (WIS-INT)/2 - WIS/2 + saves*2 + BS*2` (INT=caster, WIS=target, BS=hidden base-save boost). IN SCOPE for v1 (user decision 2026-07-05): damage spells AUTO-HIT (no save); maladictions/debuffs roll this LR to land; a damage spell with a maladiction component is TWO-PART — damage auto-hits, the maladiction rolls the save separately.

## Context — engine surfaces to build on
- Model: /workspace/shattered-archive/services/kingdom-tactics-engine/src/model/index.js — UnitTemplate (attackPower, defense, attack: AttackPattern{kind melee|orthogonal|diagonal|omni, range, minRange, areaRadius}, resistances[], vulnerabilities[], traits[], stats{...,con}), Unit/Squadron, MatchState (tokens, moon{type,phase}), Coord/Side.
- Data provider: src/data/index.js — `unitTemplate(raceKey,classKey)`, `terrainEffect(key)`→{cover,...}, `moonEffect(phaseKey)`→{magiSpellPowerMultiplier}. Resolve a token's template via `templateForMember(token.templateId, provider)` (src/rules/squadron.ts).
- Rules seed: src/rules/{board.ts (tokenAt, chebyshev, inBounds, stepOffsets), line-of-sight.ts (hasLineOfSight), movement.ts}. Barrel: src/rules/index.ts.
- NOTE: UnitTemplate currently has NO damage-type field. Step 1 adds one (authored in class-kits), since resistance/vulnerability matching needs the attacker's damage category.

## Steps
### [x] 1. Damage-type taxonomy + attacker damage type + armorType on units
- Do: Add `src/data/dsl/damage-types.ts` distilled from DamageTypeGroupings.cs: exported category sets (PIERCING/BLUNT/SLASHING/MAGIC/FIRE/COLD/LIGHTNING as readonly string[] of DslDamageType keys) plus `damageCategory(type: string): 'physical'|'magic'` and `elementalGroup(type): 'fire'|'cold'|'lightning'|null` and `resistMatches(resist: string, type: string): boolean` (a defender resist string like 'Fire'/'Cold'/'Physical'/'Acid' matches an incoming damage type via these groupings, so dragonskin resists line up). Add `src/data/balance/armor.ts` distilling ArmorCalculators (Cloth 0 → Plate 1.0) with `armorClassMultiplier(armorType: string): number`. Extend the model: add `damageType: string` and `armorType: string` to `UnitTemplate` (src/model/unit.ts) and `damageType` to `ClassKit` (src/data/balance/class-kits.ts); author a sensible damageType per existing kit (Warrior 'Slash', Ranger 'Pierce', Assassin 'Stab', Mage 'Flame', Cleric 'Divine'); resolve both through `GameDataProvider.unitTemplate()` — armorType comes from the distilled `CLASS_ATTRIBUTES[classKey].armorType` (fallback 'Cloth'). USER DECISION: armor type is the sole defensive-bonus factor; size does NOT affect defense. Keep generated dsl files intact.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/dsl/damage-types.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/balance/armor.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/model/unit.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/balance/class-kits.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/index.ts, plus a damage-types.test.ts
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine build` exits 0; test asserts resistMatches('Fire','Flame')===true, damageCategory('Magic')==='magic', armorClassMultiplier('Plate')===1. (qdigest-wrap.)
### [x] 2. Targeting resolver
- Do: Add `src/rules/targeting.ts`: `legalTargets(state, tokenId, provider): string[]` — enemy tokens (different side, living) whose distance from the attacker satisfies the attacker's AttackPattern (melee = adjacent per pattern kind; ranged uses range/minRange and pattern kind via board.ts distance/offset helpers); ranged attacks (attack.range>1 or kind!=='melee') additionally require `hasLineOfSight(state, attackerPos, targetPos, provider)`. Add `splashTargets(state, center, areaRadius, provider): string[]` returning tokens within Chebyshev areaRadius of a center tile (for AoE). Table-driven tests (melee adjacency, ranged range+minRange, LoS blocks a ranged target, AoE radius, allies excluded, dead excluded) with an IGameDataProvider stub.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/targeting.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/targeting.test.ts
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine test` passes the targeting suite.
### [x] 3. Damage resolver (distilled pipeline)
- Do: Add `src/rules/damage.ts`: `resolveDamage(input): DamageResult` where input = { attacker: UnitTemplate, defender: UnitTemplate, defenderTerrainKey: string, moonPhase: string, provider, rng?: ISeededRng }. Pipeline mirroring DSL order: (1) base = attacker.attackPower; (2) if attacker is magi (traits includes 'magi'), base *= provider.moonEffect(moonPhase).magiSpellPowerMultiplier; (3) constitution pre-reduction: base -= base * conModifier(defender.stats.con) where conModifier is a small authored curve (e.g. clamp((con-10)*0.01, 0, 0.25)); (4) AC mitigation: AC = defender.defense + terrainEffect(defenderTerrainKey).cover + ARMOR_AC_WEIGHT * armorClassMultiplier(defender.armorType) (armor type is the primary defensive factor per user decision); damage *= (1 - AC/AC_DIVISOR) with authored AC_DIVISOR + ARMOR_AC_WEIGHT constants (AC_DIVISOR start ~40, clamp factor to [0,0.9]); (5) resistance/vulnerability: if any defender.resistances match attacker.damageType (via resistMatches) → *0.5; if any defender.vulnerabilities match → *1.5; (6) protection placeholder: if defender has a 'sanctuary' status trait → *0.5 (wire to StatusEffect later); (7) floor at 1, round. Return { amount, preMitigation, wasResisted, wasVulnerable, category }. Keep all magic constants (AC_DIVISOR, resist/vuln multipliers, con curve) in a small local `DAMAGE_CONSTANTS` object for one-place tuning. Deterministic; only use rng if adding ± variance (optional, off by default). Table-driven tests: resist halves, vuln increases, cover reduces, FullMoon boosts a magi vs Empty, min-damage floor never < 1.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/damage.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/damage.test.ts
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine test` passes the damage suite.
### [x] 4. Saves resolver + maladiction landing (SavesCalculator)
- Do: Add `src/rules/saves.ts` distilling SavesCalculator: `landingRate(input): number` where input = { casterInt, targetWis, saves, baseSave } → `LR = 100 - (targetWis - casterInt)/2 - targetWis/2 + saves*2 + baseSave*2`, clamped to [SAVE_MIN, SAVE_MAX] (authored, e.g. [5, 95]). `rollSave(input, rng): { landed, roll, landingRate }` — draws `rng.int(1, 100)`; landed = roll <= LR (so higher LR = more likely to land the maladiction). Keep the [5,95] clamp + any tuning in a local `SAVE_CONSTANTS`. USER DECISION: damage spells auto-hit (no save); maladictions/debuffs use rollSave; a damage-spell-with-maladiction is two-part (damage auto-applies, maladiction rolls). Table-driven tests: LR formula matches the DSL comment for sample stats, clamp bounds hold, high LR lands on a low roll, low LR misses on a high roll (deterministic rng).
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/saves.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/saves.test.ts
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine test` passes the saves suite.
### [x] 5. Integrate, export, annotate, complete
- Do: Add `src/rules/attack.ts` with (a) `applyAttack(state, attackerId, targetId, provider, rng?): MatchState` — weapon/auto-hit attack: ties legalTargets validation + resolveDamage, returns a new MatchState with the defender's hp/hpPool reduced (pure; marks attacker hasActed); and (b) `applyAbility(state, casterId, targetId, ability, provider, rng): MatchState` — spell path: if the ability has a damage component, apply it auto-hit via resolveDamage; if it has a maladiction component, rollSave (saves.ts) and, only when it lands, append the StatusEffect to the defender (two-part combined spell). Export targeting + damage + saves + attack from `src/rules/index.ts`; update `src/rules/.annotated`. Integration tests: (1) place attacker + enemy, assert legalTargets includes the enemy and applyAttack reduces hp by resolveDamage's amount; (2) applyAbility with a damage+maladiction spell reduces hp AND (with a rng seeded to land) appends the status. Set this doc `Status: COMPLETE`.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/attack.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/attack.test.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/index.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/.annotated
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine build` exits 0 and `… test` passes the full suite (qdigest-wrap).

## Notes / decisions (RESOLVED 2026-07-05 by user)
- Defender armor type (Q1): RESOLVED — armor type is the SOLE defensive-bonus factor; size does NOT affect defense (size only gates equipment eligibility, out of scope). Thread `armorType` from CLASS_ATTRIBUTES into unitTemplate (Step 1), map via ArmorCalculators multipliers (Cloth 0 → Plate 1.0) in `data/balance/armor.ts`.
- Magic hit/saves (Q2): RESOLVED — implement SavesCalculator now (Step 4). Damage spells auto-hit; maladictions/debuffs roll the LR save; a damage spell with a maladiction component is two-part (damage auto-hits, maladiction rolls). NOT deferred.
- AC_DIVISOR, ARMOR_AC_WEIGHT, con curve, resist/vuln multipliers (DAMAGE_CONSTANTS) and SAVE_CONSTANTS ([5,95] clamp) are the tuning surface — keep them in one place so balancing is one edit and flows to simulators (Phase 3).

## Progress log

- 2026-07-05T01:27:26-05:00 plan created (targeting + damage; DSL Calculator pipeline distilled into Context so implementation needs no C# re-read)
- 2026-07-05 user resolved both open questions: armorType is sole defensive factor (size irrelevant to defense); SavesCalculator now in scope (damage auto-hits, maladictions roll saves, combined spells are two-part). Plan expanded to 5 steps (added Step 4 saves; armorType threading folded into Step 1).
- 2026-07-05 Step 5 DONE + PHASE COMPLETE: added rules/attack.ts — applyAttack (legalTargets-validated auto-hit weapon damage, no-op on illegal target) + applyAbility (AbilitySpec: auto-hit damage component + save-rolled maladiction that only appends its StatusEffect on a landed save — the two-part combined spell). Pure state transitions returning new MatchState; input untouched. Integration tests use the real GameDataProvider. Barrel + annotated updated. 87 tests pass (+4). Status → COMPLETE.
- 2026-07-05 Step 4 DONE: added rules/saves.ts — landingRate (LR = 100 - (WIS-INT)/2 - WIS/2 + saves*2 + BS*2, clamped [5,95]) + rollSave (d100 via rng.int(100)+1, lands when roll<=LR). Damage auto-hits; maladictions roll. Barrel + annotated updated. 83 tests pass (+5).
- 2026-07-05 Step 3 DONE: added rules/damage.ts — resolveDamage mirroring DSL order (magi moon → con pre-reduction → AC=defense+cover+ARMOR_AC_WEIGHT*armorClassMultiplier → resist ×0.5 / vuln ×1.5 → sanctuary ×0.5 → floor 1). All tuning in DAMAGE_CONSTANTS (VARIANCE=0 deterministic). Barrel + annotated updated. 78 tests pass (+8).
- 2026-07-05 Step 2 DONE: added rules/targeting.ts — inAttackPattern (chess-variant orthogonal/diagonal/omni/melee geometry with minRange), attackProfile (squadron=longest-range member), legalTargets (living enemies in pattern, LoS-gated when ranged), splashTargets (Chebyshev radius, both sides). Barrel + annotated updated. 70 tests pass (+9).
- 2026-07-05 Step 1 DONE: added data/dsl/damage-types.ts (P/B/S/Magic + Fire/Cold/Lightning/Acid, damageCategory/elementalGroup/resistMatches) and data/balance/armor.ts (armorClassMultiplier); UnitTemplate gained damageType+armorType, ClassKit gained damageType (Warrior Slash/Ranger Pierce/Assassin Stab/Mage Flame/Cleric Divine), threaded through unitTemplate() (armorType from CLASS_ATTRIBUTES, fallback Cloth). Updated turn-order/movement test templates. build green, 61 tests pass (+12). Annotated refreshed.
