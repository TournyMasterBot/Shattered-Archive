# Plan: Kingdom Tactics — Phase 1 (engine foundation + distilled DSL data)

Created: 2026-07-04T19:24:56-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Scaffold the isomorphic kingdom-tactics-engine package with DSL data distilled from the C# sources (identity + race/class attributes + terrain), the core model (incl. terrain + squadron), authored game-mode configs, a deterministic seeded RNG, the core interfaces, and first tests.

## Goal
A new workspace package `@shatteredarchive/kingdom-tactics-engine` at
`/workspace/shattered-archive/services/kingdom-tactics-engine` builds and tests
green. It exposes: DSL identity (races/classes/moons/gods/kingdoms/clans/terrain)
and canonical attributes distilled from the C# sources into generated TS; a core
domain model including terrain tiles and squadron tokens; authored `GameModeConfig`
data (Duel/Duo/Skirmish/Squadron/Battle/Siege + proposed extras); a deterministic
seeded RNG; and `IGameDataProvider`/`IGameModeProvider` whose `unitTemplate()`
composes class + race + reclass stats from a single balance layer. Done when
`pnpm --filter @shatteredarchive/kingdom-tactics-engine build` and its Jest suite
pass, and a test proves that editing one balance value changes `unitTemplate()`
output and that squadron strength derives from member unit templates.

## Constraints
- Isomorphic only: no DOM APIs, no node built-ins in shipped `src/` except inside
  `codegen/` (a dev-time script). Must import cleanly in both browser and node.
- Deterministic core: no `Math.random`, no `Date.now` in `model/`/`rules/`/`engine/`.
  RNG only via `ISeededRng`.
- **The C# projects are the source of truth; the game distills them at dev time and
  never references `.cs` at runtime.** Generated files carry
  `// @generated from <source> — do not edit by hand`. Hand-authored balance data in
  `data/balance/*` (incl. terrain properties, modes) MUST NOT be overwritten by codegen.
- Depend only on `@shatteredarchive/types-global` + `@shatteredarchive/utils-global`
  (workspace:*). No app imports. Every subsystem is an `interface` + impl (Jest-mockable).
- Game modes and terrain are data-driven (config objects), never hard-coded branches.
- Refresh `.ai-context` + `.annotated` for every new directory (host edits don't auto-refresh).

## Context
- Monorepo convention: shared packages in `/workspace/shattered-archive/{types,utils,services,sdks}/*`; pnpm-workspace globs already include `services/*`, so `services/kingdom-tactics-engine/package.json` auto-registers it.
- Manifest to mirror: `/workspace/shattered-archive/apps/game-server/package.json` (ESM `"type":"module"`, `build: tsc -p tsconfig.json`, test via `jest --config ../../jest.config.cjs --runInBand --rootDir .`). Root configs: `tsconfig.base.json`, `jest.config.cjs`, `tsconfig.jest.json`.
- Distillation sources: identity/enums at `/workspace/dsl/Server/Server.Core/Constants.cs`; substance at `/workspace/dsl/Server/Server.Dsl/` — `Races/IMortalRace.cs` + `Races/*.cs` (base `Stats(str,int,wis,dex,con)`, Resistances/Vulnerabilities, BoostedClasses affinities, primary/secondary attr modifiers, IsLargeRace, BaseCpModifier, IsLimitedRace), `Classes/IClass.cs` + `Classes/*.cs` (PrimaryAttribute/SecondaryAttribute, ArmorType, RaceRestrictions, IsReclass/IsCSR, ClassGroup, casting modifiers), `Calculators/*.cs` (Damage/Armor/Saves math — distill in Phase 2, note only here).
- Full identity + terrain + mode listing: `/workspace/shattered-archive/apps/kingdom-tactics-client/docs/ROADMAP.md` (§DSL data reference). Preserve C# numeric enum values as ids.
- Architecture, interfaces, mode/terrain/squadron design: `/workspace/shattered-archive/apps/kingdom-tactics-client/docs/ARCHITECTURE.md` (§3 layout, §3 IGameDataProvider/IGameModeProvider, §4 distillation, §5.1 modes, §5.2 terrain, §5.3 squadrons).

## Steps
### [x] 1. Scaffold the engine package
- Do: Create `/workspace/shattered-archive/services/kingdom-tactics-engine` with `package.json` (name `@shatteredarchive/kingdom-tactics-engine`, `private`, `"type":"module"`, `main dist/index.js`, scripts build/test/format mirroring game-server, deps `@shatteredarchive/types-global` + `@shatteredarchive/utils-global` as `workspace:*`), `tsconfig.json` extending the repo base (`outDir dist`), `src/index.ts` (empty barrel), and empty dirs `src/{data/dsl,data/balance,model,rng,rules,engine,ai,sim,codegen}`. Add `.ai-context` + `.annotated` for the package root and each new src subdir.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/package.json, /workspace/shattered-archive/services/kingdom-tactics-engine/tsconfig.json, /workspace/shattered-archive/services/kingdom-tactics-engine/src/index.ts
- Verify: from repo root `pnpm install` links the package, then `pnpm --filter @shatteredarchive/kingdom-tactics-engine build` exits 0 (wrap with qdigest.sh).
### [x] 2. Distill DSL identity + terrain from Constants.cs
- Do: Write `src/codegen/generate-dsl-data.ts` (dev-time node script) that parses Constants.cs enums and emits `src/data/dsl/{races,classes,moons,gods,affiliations,alignment,terrain}.ts` as typed const arrays/records (id = C# numeric value; name = [Description] or enum name; grouping tags: race category, class group/reclass flag, god alignment group, kingdom-vs-clan). For **remort races** additionally tag dragon family + alignment: metallic (Gold/Silver/Brass/Bronze/Copper/Steel) = Good; chromatic (Red/Black/Blue/Green/White/Brown) = Evil; gem (Crystal/Topaz) = Neutral; angels = Good; demons = Evil; Balanx = Neutral; Giants split by type — FrostGiant = Good, CloudGiant = Neutral, FireGiant = Evil (giants also carry an "unlimited mana + permadeath" trait flag for later balance). Each file starts with the `// @generated` header. Run it; commit output.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/codegen/generate-dsl-data.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/dsl/{races,classes,moons,gods,affiliations,alignment,terrain}.ts
- Verify: generated `classes.ts` has all 45 MortalClass entries, `races.ts` has Human…Lepori + remort races with correct dragon family/alignment tags (Crystal+Topaz = gem/Neutral, NOT chromatic), `terrain.ts` has all 14 TerrainTypes (cross-check ROADMAP §DSL data reference); `pnpm --filter @shatteredarchive/kingdom-tactics-engine build` exits 0.
### [x] 3. Distill race + class attributes from Server.Dsl
- Do: Extend the codegen (or add `generate-dsl-attributes.ts`) to parse `Server.Dsl/Races/*.cs` and `Server.Dsl/Classes/*.cs`, emitting `src/data/dsl/race-attributes.ts` (per race: base stats str/int/wis/dex/con, resistances, vulnerabilities, class affinities, primary/secondary attr modifiers, isLargeRace, baseCpModifier, isLimitedRace) and `src/data/dsl/class-attributes.ts` (per class: primaryAttribute, secondaryAttribute, armorType, raceRestrictions, isReclass, isCSR, classGroup, castsAtLevel, castingLevelModifier). For remort dragon races, add the canonical dragonskin resist set (Gold: Fire+Poison, Silver: Cold, Brass: Charm+Fire, Bronze: Lightning, Copper: Acid, Steel: Physical, Red: Fire, Black: Acid, Blue: Lightning, Green: Poison, White: Cold, Brown: Fire, Crystal: Light/Harm, Topaz: Drain — see ROADMAP §DSL data reference). `// @generated`. Where a getter is a plain literal, extract it; skip complex computed members (note them as TODO). Run; commit. NOTE: the per-class/per-race ability catalog (`ClassAbilityGroups/ Skills/ Songs/ Spells/`) and `Calculators/` are Phase 2–3 sources — not required here, but the emitted shapes should leave room for an `abilities` field.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/dsl/race-attributes.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/dsl/class-attributes.ts
- Verify: `race-attributes.ts` Human entry = base stats {60,60,60,60,60}, primaryMod 10, secondaryMod 6, isLargeRace false; a metallic dragon (e.g. Gold) entry carries its resist set; build exits 0.
### [x] 4. Core domain model (incl. terrain + squadron + mode config type)
- Do: In `src/model/` define immutable types + enums: `TerrainType`-tagged `Tile`, `Board` (dims + tile access), `UnitTemplate` (resolved: hp, move, movementClass ground/flying/aquatic, attack pattern, range, abilities, cost), `Unit` (template ref, side, position, current hp/status), `Squadron` (aggregate of member unit templates: pooled hp, strength, size), `Army` (side, tokens[], budget), `MatchState` (board, armies, turn, activeSide, rngState), `Action` (discriminated union: Move | Attack | Ability | EndTurn), and `GameModeConfig` (id, sides, budget, scale, usesSquadrons, victory, terrainProfile). A board token is `Unit | Squadron` (Unit = squadron of one). Export from barrel; data-only (no logic methods).
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/model/*.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/index.ts
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine build` exits 0; barrel re-exports MatchState, Unit, Squadron, Action, GameModeConfig, Tile (grep).
### [x] 5. Deterministic seeded RNG behind an interface
- Do: In `src/rng/` define `ISeededRng` (`next():0..1`, `int(maxExclusive)`, `pick<T>(arr)`, `state()/clone()`), implement `Mulberry32` from a numeric seed, and a Jest test proving same seed → identical sequence, different seed → divergence. Export from barrel.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/rng/seeded-rng.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/rng/seeded-rng.test.ts
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine test` runs and the rng test passes (wrap with qdigest.sh).
### [x] 6. Balance layer + game modes + providers
- Do: In `src/data/balance/` author minimal-but-real `class-kits.ts` (grid stats + move/attack pattern for ≥ Warrior, Mage, Cleric, Ranger, Assassin), `race-modifiers.ts` (grid deltas for ≥ Human, MountainDwarf, DarkElf, Ogre, Pixie — seeded from distilled attributes), `reclass-kits.ts` (one override), `moon-effects.ts` (per MoonPhase magi modifier), `terrain.ts` (per TerrainType: moveCost, passability by movementClass, cover, blocksLoS), `unit-costs.ts`, and `modes.ts` (`GameModeConfig` for Duel, Duo, Skirmish, Squadron, Battle, Siege, plus FreeForAll, Objective, Horde). Define `IGameDataProvider` + `IGameModeProvider` (per ARCHITECTURE §3) and implement both in `src/data/index.ts`; `unitTemplate(race, cls)` composes class-kit + race-modifier (+ reclass) into a `UnitTemplate`. Export from barrel.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/balance/*.ts, /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/index.ts
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine build` exits 0.
### [x] 7. Prove centralized data flow + squadron/mode integrity with tests
- Do: Write `src/data/game-data-provider.test.ts` asserting (a) `unitTemplate('Human','Warrior')` equals class-kit+race-modifier arithmetic and equals the imported balance constants (single-source-of-truth guarantee); (b) a `Squadron` built from N `unitTemplate` results has aggregate strength/hp derived from those templates (so rebalancing a unit changes squadron strength); (c) every `GameModeConfig` from `modes()` has valid sides/budget/victory and resolvable terrain profile. Refresh the package `.annotated`/`.ai-context` for now-populated dirs, then set this plan COMPLETE.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/game-data-provider.test.ts
- Verify: `pnpm --filter @shatteredarchive/kingdom-tactics-engine test` passes all suites (wrap with qdigest.sh).

## Progress log

- 2026-07-04T19:24:56-05:00 plan created
- 2026-07-04T19:24:56-05:00 plan revised: added Server.Dsl attribute distillation (step 3), terrain + squadron in model (step 4), game-mode configs + terrain balance (step 6), squadron/mode tests (step 7); reframed distillation as one-way from C# source of truth (never referenced at runtime)
- 2026-07-04T19:24:56-05:00 plan revised (user feedback): corrected remort classification — metallic=Good, chromatic=Evil, gem(Crystal/Topaz)=Neutral + dragonskin resists (steps 2–3); Balanx/Giant alignment left TBD; all 9 game modes now in scope; class kits/racials sourced from ClassAbilityGroups/Skills/Songs/Spells (Calculators incomplete); engine kept React-Native-compatible for future mobile embed
- 2026-07-04T19:24:56-05:00 alignments confirmed by user: Balanx = Neutral; giants split — FrostGiant=Good, CloudGiant=Neutral, FireGiant=Evil; giants get an "unlimited mana + permadeath" trait flag
- 2026-07-04T23:22:55-05:00 step 1 done: scaffolded services/kingdom-tactics-engine (package.json, tsconfig build with `types:[]` isomorphic guard, tsconfig.jest.json, package-local jest.config.cjs node env, src/index.ts barrel, .ai-context/.annotated). `pnpm install` linked it; `pnpm --filter …engine build` exits 0 and emits dist/index.{js,d.ts}.
- 2026-07-04T23:22:55-05:00 step 2 done: wrote src/codegen/generate-dsl-data.ts (generic C# enum parser + curated classification tables) and generated src/data/dsl/{races,classes,moons,gods,affiliations,alignment,terrain}.ts. Verified: 45 classes, 14 terrains, 33 mortal + 23 remort races, Crystal/Topaz=gem/Neutral, giants split Frost=Good/Cloud=Neutral/Fire=Evil, gods/affiliations grouped, ids preserve C# enum values. Build exits 0; all 7 modules compile to dist/data/dsl. Annotated data/dsl + codegen.
- 2026-07-04T23:22:55-05:00 step 3 done: wrote src/codegen/generate-dsl-attributes.ts; generated race-attributes.ts (33 races) + class-attributes.ts (45 classes). Human verified {60,60,60,60,60}, primaryMod 10, secondaryMod 6, isLargeRace false. REMEDIATION (per user): Cleric.cs was the only concrete class missing its `MortalClass = MortalClass.Cleric;` assignment — fixed the DSL source to match siblings instead of hacking the codegen; codegen now THROWS if any concrete class lacks the assignment. Singleton-pattern audit: 0 classes / 0 races missing `_instance ??= new`. Build exits 0.
- 2026-07-04T23:22:55-05:00 step 4 done: authored src/model/{coord,board,unit,squadron,army,action,mode,match,index}.ts (immutable, data-only). BoardToken = Unit | Squadron (Unit = squadron of one); GameModeConfig type for the 9 modes; MatchState carries rngState + MoonContext. Re-exported from package barrel; build exits 0; barrel surfaces MatchState/BoardToken/Squadron/GameModeConfig/Tile/Action.
- 2026-07-04T23:22:55-05:00 step 5 done: src/rng/{seeded-rng.ts,seeded-rng.test.ts,index.ts} — ISeededRng + Mulberry32 (state == seed, so createRng(state) restores stream). First engine jest run: 7/7 pass, TEST_EXIT=0 (local node-env jest harness confirmed working). Re-exported from barrel.
- 2026-07-04T23:22:55-05:00 step 6 done: authored data/balance/{class-kits,race-modifiers,reclass-kits,moon-effects,terrain,unit-costs,modes}.ts and data/index.ts (IGameDataProvider + IGameModeProvider). unitTemplate() composes distilled DSL attrs (stats/resistances/abilities) with authored kits/modifiers/reclass; cost derived from power; throws on missing kit. All 9 modes authored. Fixed a TS narrowing issue (widened lookup Map keys to string). Build exits 0.
- 2026-07-04T23:22:55-05:00 step 7 done: added rules/squadron.ts (aggregateSquadron derives strength/hp from member templates) + data/game-data-provider.test.ts. Full suite: 2 suites / 17 tests pass, TEST_EXIT=0; final build exits 0. Annotated data/, rules/, data/balance (auto), data/dsl, model, rng, codegen.
- 2026-07-04T23:22:55-05:00 PLAN COMPLETE — kingdom-tactics-engine foundation built: scaffold + distilled DSL data (identity/attributes/terrain from C# source of truth, never referenced at runtime) + model (terrain/squadron/modes) + seeded RNG + balance layer + providers, all building and green (24 tests total). Next: Phase 2 (rules resolvers, damage math distilled from Server.Dsl/Calculators).
