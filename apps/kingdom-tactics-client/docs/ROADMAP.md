# Kingdom Tactics — Roadmap & Phasing

Companion to [`ARCHITECTURE.md`](./ARCHITECTURE.md). Each phase is a self-contained
chunk sized so it can be handed to **qwen** (via `/plan resume`) or resumed by Claude
if a session runs out. One `.ai-plans/*.md` document drives each phase.

## Phase table

| Phase | Deliverable | Owner (suggested) | Plan doc |
|---|---|---|---|
| 0 | Docs + design (this folder) | Claude | — (done in-session) |
| 1 | Engine scaffold + distilled DSL data (identity + race/class attributes + terrain) + core model (incl. terrain/squadron) + game-mode configs + rng + interfaces + first tests | Claude starts, qwen fills routine data | `…-kingdom-tactics-p1-engine-foundation.md` |
| 2 | Rules resolvers (movement/LoS/attack/damage/turn-order/victory) + exhaustive tests | qwen (table-driven, routine) | p2 |
| 3 | GameEngine reducer + AI policies (Random/Greedy) + MatchSimulator/BatchSimulator/ScenarioSimulator | Claude (judgment) | p3 |
| 4 | Server app scaffold + `/ws/kt` authoritative match gateway + AI seat | Claude | p4 |
| 5 | Client app scaffold: arena render, army builder, local match loop, scenario mode | Claude + qwen | p5 |
| 6 | Client simulator dashboard over `sim/` | qwen | p6 |
| 7 | Online multiplayer transport hardening (reconnect, reconciliation) | Claude | p7 |
| 8 | Docker experimental wiring: 2 Dockerfiles, 2 compose services, nginx blocks | Claude | p8 |

> Ordering rule: the **engine** (Phases 1–3) must exist before client/server, because
> both apps import it. Docker (Phase 8) comes last so it builds real packages.

### Future consumer: mobile client (out of initial scope)

Long term, the engine will also be embedded in the React Native mobile app at
`C:\Projects\shatteredarchive-mobile` (Android first, iOS later). This does **not**
change Phase 1–8 scope, but it hardens one existing constraint: the engine must be
pure isomorphic TS with **no DOM and no Node built-ins** in shipped code — React
Native has neither. Keeping the engine app-agnostic (it already depends only on
`types-global`/`utils-global`) means the mobile app can add it as a `workspace:*`
dep later with zero engine changes. A future phase (post-8) wires the RN screens.

## Distillation sources (C# = source of truth; never referenced at runtime)

Host paths (the `.ai-plans/*` hand-off docs use the `/workspace/...` container form
for qwen; design docs use host paths for humans). Under `C:\Projects\DSL\Server\`:

- Identity/enums: `Server.Core\Constants.cs`.
- Substance (interface-first), under `Server.Dsl\`:
  - `Races\` — base stats, resist/vuln, class affinities, size, cp modifier.
  - `Classes\` — primary/secondary attribute, armor type, race restrictions,
    reclass/CSR flags, casting modifiers.
  - **Class kits & racials** are assembled from `ClassAbilityGroups\`, `Skills\`,
    `Songs\`, `Spells\` (the ability catalog per class/race) — these are primary
    Phase-2/3 sources, not "later".
  - `Calculators\` (Damage/Armor/Saves) — **incomplete but the starting point** for
    the combat math distilled into `rules/`.
  - `Beastiary\` — monster units for Horde/Siege garrisons.

## DSL data reference (extracted 2026-07-04)

Identities Phase 1 codegen must emit. Numeric values = the C# enum values (preserve).

**Moons** (`MoonType`): Black=1, Red=2, White=3.
**Moon phases** (`MoonPhase`): Empty=1, Crescent=2, HalfMoon=3, ThreeQuartersMoon=4,
FullMoon=5. **Positions**: NotVisible, Rising, HighSanction, Setting.
**Direction**: Waxing, Waning.

**Alignment** (flags): Good, Neutral, Evil, Mixed.
**StatAttributes**: str, int, wis, dex, con.

**Mortal races** (`MortalRaces`): Human(1); Elves: ShalonestiElf(2), DarkElf(3),
WildElf(4), SeaElf(5), HalfElf(6); Dwarves: MountainDwarf(10), HillDwarf(11),
DarkDwarf(12), Mul(13); Minotaur(15); Ogres: Ogre(16), GiantOgre(17), HalfOgre(18);
Yinn(20); Goblins: Goblin(21), HobGoblin(22), Bugbear(23); Gnomes: TinkerGnome(25),
DeepGnome(26); Kender(30); Leonine: Wemic(31), Felar(32); Limited: Troll(35),
GullyDwarf(36), Ariel(37), Pixie(38), Centaur(39), Orc(40), Bakali(41);
Newer: Arboren(50), Lagoda(61), Lepori(62).

**Remort races** (`RemortRaces`) — classified by dragon family (which sets alignment)
with canonical dragonskin damage resists (innate resist of the remort dragon unit):

- **Metallic dragons — Good:** Gold(1: Fire, Poison), Silver(2: Cold),
  Brass(3: Charm, Fire), Bronze(4: Lightning), Copper(5: Acid), Steel(6: Physical).
- **Chromatic dragons — Evil:** Red(10: Fire), Black(11: Acid), Blue(12: Lightning),
  Green(13: Poison), White(14: Cold), Brown(15: Fire).
- **Gem dragons — Neutral:** Crystal(16: Light/Harm), Topaz(17: Drain).
- **Angels — Good:** Archangel(20), LesserAngel(21).
- **Balanx — Neutral:** HeadBalanx(30), LesserBalanx(31).
- **Demons — Evil:** DemonLord(40), LesserDemon(41).
- **Giants — split by alignment:** FrostGiant(50) = **Good**, CloudGiant(51) =
  **Neutral**, FireGiant(52) = **Evil**. Lore: giants are demigod-blooded, born to
  mortals, ~14ft at maturity; they have **unlimited mana** but suffer **permadeath**
  (soul lost if killed in the mortal world) — flag as a candidate unit trait.

**Classes** (`MortalClass`, base + reclass, value×10): Armsman, Assassin, Bandit,
Barbarian, Bard, Battlemage, Battlerager, Bladesinger, Brewmaster, Charlatan,
Cleric, Crusader, Druid, Enchantor, Illusionist, Invoker, Jongleur, Mage,
Necromancer, Nightshade, Ninja, Paladin, Pirate, Priest, Ranger, Samurai, Shaman,
Shukenja, Skald, Swashbuckler, Thief, Transmuter, Warlock, Warrior, Witch, WuJen,
Mentalist, Dragonslayer, ShadowKnight, ShadowMage, Eldritch, Confessor, Monk,
Runesmith, Ovate. (Base vs reclass tiering to be curated in `class-kits`/`reclass-kits`.)

**Gods** (`AffiliationGods`): Good — Austinian, Kantilles, Nadrik, Taliena, Kadiya,
Siccara. Neutral — Kwainin, Cliath, Sebatis, Zandreya, Raije, Turpa. Evil —
Drakkara, Fatale, Dragoth, Devion, Mencius, Necrucifer. Chaos — Malachive.

**Kingdoms** (`AffilitionAllegiance`): GrayChurch, Verminasia, Nordmaar, Abaddon,
Althainia, ShalonestiKingdom, Ganth, NewThalos, Marauders, Thaxanos, Arkane,
Balifore, Darkonin.
**Clans**: Knighthood, Bloodlust, Shadow, Justice, Wargar, Conclave, BlackRobe,
RedRobe, WhiteRobe, ShalonestiClan, Chaos, Slayers.
**Remort allegiances**: Angel, Demon, Dragon, Giant. Also Loner, Renegade.

**Terrain** (`TerrainTypes`, flags): City(1<<0), Field, Forest, Mountain, Water, Air,
Desert, Underground, Underwater, Tundra, Ice, Ocean, Hills, Indoors. (`Continents`
enum — Althainia, Arkania, Icewall, Tropica, Shokono, Dojia, Limbo, Underworld, … —
is available for theming/naming battle maps.)

**Game modes** (NOT in Constants.cs — authored `GameModeConfig` data). All nine are
in scope: Duel(1v1), Duo(2v2), Skirmish(5v5 or equal cost), Squadron(mixed small),
Battle(hundreds via squadron tokens, open field), Siege(attacker vs defender on a
location), Free-for-all(3–4 sides), Objective/King-of-the-Hill(hold control points),
Horde/Survival(solo/co-op vs AI waves).

> Note: base-vs-reclass tactical tiering, grid stat/movement modifiers, class kits,
> moon effects, terrain tactical properties, unit costs, and mode configs are **not**
> in the C# sources — they are new balance data authored in `data/balance/*` and are
> the primary tuning surface. Canonical DSL numbers (race base stats, resistances,
> class attributes) ARE distilled from `Server.Dsl/`.

## Hand-off protocol

- Exactly ONE `.ai-plans/*.md` is `Status: ACTIVE` at a time.
- To hand a phase to qwen: ensure its plan doc is ACTIVE, tell the user to run
  `/plan resume` in Continue. qwen works step-by-step, checking boxes.
- To resume as Claude: pick the ACTIVE doc, do the first unchecked step, verify,
  check it off, append to the Progress log.
- Routine/mechanical phases (2, 6) and bulk data entry are ideal qwen work; phases
  needing real reasoning (3, 4, 7) stay with Claude.
