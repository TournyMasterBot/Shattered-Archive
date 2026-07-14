# Plan: Kingdom Tactics — full mortal-class roster + race/class & CSR restrictions

Created: 2026-07-10T18:15:00-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Make all mortal classes playable in army building, with race×class legality and CSR
reclass gating enforced from the DSL, using a single class-select per unit/battalion (squadron
blending deferred).

## Goal
Every mortal class (46 in `MortalClass`) is selectable when building an army, not just the 5 that
have hand-authored kits. A legality layer enforces the DSL rules: a class's **`RaceRestrictions`
are FORBIDDEN races** (verified: Warrior restricts only Pixie), and a **CSR reclass** is gated to
the affiliations it requires (`Affiliation { Classes, Allegiances, Gods }` — e.g. Battlemage needs
a Mage base + Conclave clan). Army units pick ONE race + ONE class each (single-select per unit
battalion); blended squadron composition is explicitly out of scope. Done when: `unitTemplate`
resolves any mortal class (authored kit OR a derived default kit), `isLegalRaceClass`/`legalClasses`
enforce restrictions + CSR gating with tests, and the army-build path offers only legal single-select
combos. All engine/server/client suites green.

## Constraints
- **RaceRestrictions = forbidden list** (a race in the list CANNOT be that class). Confirm this
  interpretation against 2-3 more classes before relying on it; if any class uses it as an ALLOW
  list, handle per-class — but default reading is forbidden.
- **CSR gating** requires data that is NOT yet distilled — extend the attributes codegen to capture
  each class's `Affiliation` requirement. Checked-in generated data (follow the existing `pnpm codegen`
  pattern; never read .cs at runtime).
- **All classes playable via a DEFAULT kit** derived from distilled attributes (primary/secondary
  attribute, armorType, classGroup) — the 5 existing hand-authored `CLASS_KITS` stay as OVERRIDES.
  Do NOT hand-author 46 kits; defaults now, hand-tuning later (mirrors the ability no-op/override
  pattern). `unitTemplate` must stop throwing "no class kit".
- Single class-select per unit this phase. **Squadron blend/composition tool is OUT OF SCOPE** —
  note it as a future plan (it needs a per-squadron race/class mix model + UI).
- CSR legality needs a context (the army/general's allegiance/kingdom/god/clan). Where that context
  is unknown at build time, CSR classes are gated OUT by default (surfaced, not silently allowed).
- Isomorphic engine; pnpm only; host runs JS build/tests (never qwen in-container). Plain Jest.

## Context
- DSL source (host `C:/Projects/DSL`): `/workspace/dsl/Server/Server.Dsl/Classes/*.cs` (46 classes +
  `IClass.cs`/`DslClass.cs`/`ClassHelper.cs`). Each sets `MortalClass`, `PrimaryAttribute`,
  `SecondaryAttribute`, `ArmorType`, `ClassGroup`, `RaceRestrictions` (MortalRaces[]), `IsReclass`
  (note DSL typo `IsRecass`), `IsCSR`, and — for CSR/reclasses — `Affiliation { Classes: MortalClass[],
  Allegiances: AffilitionAllegiance[], Gods: ... }`. Enum `MortalClass` @Constants.cs (46 values).
- Attributes codegen: `/workspace/shattered-archive/services/kingdom-tactics-engine/src/codegen/generate-dsl-attributes.ts`
  — already emits `raceRestrictions`, `isCSR`, `isReclass`, `classGroup`, primary/secondary/armor into
  `src/data/dsl/class-attributes.ts` (`ClassAttributes`). Does NOT yet capture `Affiliation` gating.
- Kits + resolution: `src/data/balance/class-kits.ts` (`CLASS_KITS` — only Warrior/Ranger/Assassin/
  Mage/Cleric); `src/data/index.ts` `unitTemplate(raceKey, classKey)` THROWS when no kit
  (`RECLASS_KITS` maps a reclass to its base first). This is where the default-kit fallback + legality
  API belong.
- Army/build: `src/model/army.ts` (roster metadata: side/name/budget — units live in MatchState.tokens);
  `src/setup/build-match.ts` (army → deployed tokens); client army builder in
  `/workspace/shattered-archive/apps/kingdom-tactics-client/` (single-select wiring).
- Identity: `src/data/dsl/races.ts` (MortalRaceKey), `src/data/dsl/classes.ts` (ClassKey),
  `src/data/dsl/affiliations.ts` (kingdoms/clans + kind), `src/data/dsl/gods.ts`.

## Steps
### [x] 1. Confirm restriction semantics + distill CSR gating
- Do: Read `RaceRestrictions` on ~3 more classes (a base + two CSR/reclasses) to confirm forbidden-list
  semantics; note findings. Extend `generate-dsl-attributes.ts` to parse each class's `Affiliation`
  block into a `csr` field: `{ requiresClasses: string[], requiresAllegiances: string[], requiresGods: string[] }`
  (omit/empty when absent). Add it to the `ClassAttributes` interface + emitted rows.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/codegen/generate-dsl-attributes.ts
- Verify: host `pnpm --filter @shatteredarchive/kingdom-tactics-engine codegen:attrs`; inspect
  `class-attributes.ts` — Battlemage shows `csr.requiresClasses:['Mage']`, `requiresAllegiances:['Conclave']`,
  `isCSR:true`; a base class (Warrior) has empty csr. Engine `tsc` clean.

### [x] 2. Default class kit for every mortal class
- Do: In `class-kits.ts` (or a new `default-kits.ts`), add `defaultClassKit(classKey)` deriving a
  reasonable `ClassKit` from `CLASS_ATTRIBUTES` (base stats/hp from a template scaled by primary attr;
  armorType → defense; classGroup/attackType → attack profile; movementClass default). Keep hand
  `CLASS_KITS` as overrides.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/balance/class-kits.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/index.ts
- Verify: `unitTemplate` no longer throws for a class without a hand kit (e.g. Bard, Necromancer);
  the 5 hand-authored kits are byte-identical to before (override path unchanged). Engine tests green.

### [x] 3. Race/class + CSR legality layer
- Do: New `src/data/balance/legality.ts` (or `rules/legality.ts`): `RaceClassContext` (optional
  allegianceKey/kingdomKey/godKey/clanKey); `isLegalRaceClass(raceKey, classKey, ctx?)` — false if
  race ∈ class.raceRestrictions (FORBID list); if `csr.requiresRaces` is non-empty, race MUST be in
  it (ALLOW list — Bladesinger=elves, Runesmith=dwarves); if `isCSR`, require the ctx to satisfy the
  affiliation gate (`csr.requiresClasses` base class AND at least one of the required
  allegiances/gods present in ctx); `legalClassesForRace(raceKey, ctx?)`
  and `legalRacesForClass(classKey, ctx?)` helpers. Expose via the data provider.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/balance/legality.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/index.ts,
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/balance/legality.test.ts
- Verify: tests — Pixie+Warrior illegal; Human+Warrior legal; Battlemage illegal without Conclave ctx,
  legal with it; a base race+class with no restriction legal. Engine suite green.

### [x] 4. Wire legality into army building (single-select per unit)
- Do: Surface legal combos where armies are assembled (`build-match.ts` validation + provider API),
  so a unit's class is chosen from `legalClassesForRace(race, armyCtx)` — one race + one class per
  unit. Reject illegal combos in build-match with a clear error (like the existing squadron guard).
  Server/gateway: pass the army's affiliation context through if available.
- Files: /workspace/shattered-archive/services/kingdom-tactics-engine/src/setup/build-match.ts,
  /workspace/shattered-archive/apps/kingdom-tactics-server/src/... (context pass-through if needed)
- Verify: build-match rejects an illegal race/class; accepts legal ones; server suite green.

### [x] 5. Client army-builder single-select
- Do: Update the client army builder to present all mortal classes filtered to legal single-select
  per unit (race → legal classes), using the provider legality API. No blend UI. (Scope to the
  minimum that makes all classes selectable + legality-enforced.)
- Files: /workspace/shattered-archive/apps/kingdom-tactics-client/src/... (army builder components)
- Verify: client build + tests green; picking Pixie hides/blocks Warrior; CSR classes appear only
  when the army context allows.

### [x] 6. Docs + indexes + sign-off
- Do: ROADMAP note (all classes playable; race/class + CSR restrictions; squadron blend deferred);
  a short `docs/CLASS-ROSTER.md` (restriction + CSR rules, the legality API, single-select decision,
  blend-tool future); refresh `.annotated` for touched dirs. Full host sign-off (engine/server/client).
- Files: /workspace/shattered-archive/apps/kingdom-tactics-client/docs/ROADMAP.md,
  /workspace/shattered-archive/apps/kingdom-tactics-client/docs/CLASS-ROSTER.md,
  (touched `.annotated` files)
- Verify: all three suites green; docs accurate.

## Out of scope (future plan)
- **Squadron composition / blend tool** — selecting a mix of races/classes within one squadron
  (counts per race/class). Needs a per-squadron composition model + UI; this phase is single-select
  per unit only.
- **Hand-tuned per-class balance kits** — defaults derived here; individual class tuning is later.
- **Ability authoring for the new kits** — unblocks the ability-mechanics coverage (see
  `.ai-plans/20260710-1730-kingdom-tactics-ability-mechanics.md`); resume that after clean per-class
  rosters exist.

## Progress log

- 2026-07-10T18:15:00-05:00 plan created. Verified: 46 mortal classes, only 5 have kits; RaceRestrictions=forbidden (Warrior→Pixie only); CSR gating via Affiliation{Classes,Allegiances,Gods} (Battlemage→Mage+Conclave) exists in DSL but is NOT yet distilled. Owner scope: all classes playable, single-select per unit, squadron blend deferred.
- 2026-07-11 step 6 done + plan COMPLETE: docs — ROADMAP "Class roster & restrictions" section + new CLASS-ROSTER.md (default kits, restriction table, legality API, single-select decision, blend-tool future); refreshed `.annotated` for data/balance, setup, codegen, dsl, and client army-builder dirs. Final host sign-off all green: engine 214/214 (26 suites), server 13/13, client 58/58, all three builds clean. All 45 mortal classes now playable with race/class + CSR legality enforced end-to-end (codegen → engine legality → build-match → client palette). Squadron blend tool remains the deferred future plan.
- 2026-07-11 step 5 done: client army-builder single-select — replaced the obsolete try/catch resolve-guard palette (unitTemplate no longer throws) with `legalClassesForRace(raceKey, ctx)`; added Allegiance (clan/kingdom) + God selectors that build a shared `RaceClassContext`, threaded into palette + validateRoster + start() rosters. Per-side affiliation deferred (single army context for now). 2 client tests (Pixie hides Warrior; Battlemage appears only after choosing Conclave). Client 58/58, build clean.
- 2026-07-11 step 4 done: wired legality into build-match — `ArmyRoster` gains optional `context?: RaceClassContext` (army's clan/kingdom/god); `validateRoster` now rejects any illegal pick (legality checked FIRST, before budget, for both budget kinds) with a clear reason. Gateway still uses hardcoded legal default rosters (Human Warrior) so no context pass-through needed yet — field is ready for client roster ingestion. Added 2 build-match tests (Pixie/Warrior rejected; Battlemage gated w/o Conclave, allowed with). Engine 214/214, server 13/13 green.
- 2026-07-11 step 3 done: legality layer — new `data/balance/legality.ts` (pure module): `isLegalRaceClass(race,class,ctx?)` = raceRestrictions FORBID + csr.requiresRaces ALLOW + CSR affiliation gate (AND across allegiance/god categories, OR within; no ctx → CSR gated out); `legalClassesForRace`/`legalRacesForClass`; `RaceClassContext {allegianceKeys,godKeys}` (keys match affiliations.ts/gods.ts namespaces exactly — no mapping). `csr.requiresClasses` treated as inherent to the reclass, not a ctx obligation. Exposed on GameDataProvider + re-exported from data/index. 13 tests (Pixie≠Warrior, Battlemage needs Conclave, Bladesinger elves-only + Shalonesti, Runesmith clan+Cliath+dwarf). Fixed const-tuple `.includes` never-type by typing lookups via the exported `ClassAttributes` interface. Engine 212/212 green.
- 2026-07-11 step 2 done: default kits for all classes — added `defaultClassKit(classKey)` to class-kits.ts (5 archetypes keyed by DSL classGroup: Warrior/Thief/Mage/Cleric/Bard, + armor-tier defense nudge Plate+3…Cloth-1); `unitTemplate` now falls back to it instead of throwing (hand CLASS_KITS still win; reclass deltas gated to hand-base path to avoid double-count). Updated the old "throws when no kit" test → "every mortal class resolves" (loops all 45). Verified: Warrior(Human) byte-identical (hp30/atk10/def8); Bard/Necromancer/Battlemage/etc resolve sensibly; engine 199/199 green.
- 2026-07-11 step 1 done: distilled CSR gating — extended generate-dsl-attributes.ts with a `csr` field `{requiresClasses,requiresAllegiances,requiresGods,requiresRaces}` parsed from each class's `Affiliation{}` block; regen'd class-attributes.ts, engine tsc clean. Findings: (a) RaceRestrictions=FORBIDDEN confirmed via Battlemage helpfile ("ANY EXCEPT …"). (b) `Affiliation` is richer than assumed — real shape `{AffiliationType,Gods,Allegiances,Races,Classes,IsManatonic}`; **`Races` is an ALLOW-list** (Bladesinger→elf subraces, Runesmith→dwarves), opposite polarity to raceRestrictions → captured as `csr.requiresRaces`, and step 3 amended to enforce it. (c) Fixed two latent regex bugs in the codegen: RaceRestrictions marker only matched `new Constants.MortalRaces[]` so classes written `new MortalRaces[]`/`new[]` (Barbarian, Battlemage, Invoker, most) silently had EMPTY forbidden races — now broadened; and attr/armor/group regexes missed `Core.Constants.`-qualified refs (Battlemage/Bladesinger showed null primaryAttribute/armorType/classGroup) — now accept any prefix. Note: codegen reports 45 concrete classes (not 46 — one MortalClass enum value has no concrete class file); revisit if a class turns up missing.
