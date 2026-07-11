# Kingdom Tactics — Architecture

Status: **IMPLEMENTED through Phase 7** (engine + server `/ws/kt` gateway + client
app/dashboard + online `net` slice all built and host-green; Phase 8 Docker wiring and
the deferred backlog remain — see [`ROADMAP.md`](./ROADMAP.md)). This doc is the design
of record; where a section describes a future/deferred surface it is noted inline.
Companion to [`000-original-prompt.md`](./000-original-prompt.md) and [`ROADMAP.md`](./ROADMAP.md).

Kingdom Tactics is a turn-based tactical arena game (Tactics-Arena-Online-style,
chess-variant movement/attack on a grid) reskinned entirely with **DSL** lore:
races, base classes and reclasses, kingdoms, clans, gods/religions, and the
three-moon magic system. The player acts as a **general** deploying and commanding
a squad that represents one battle in a larger war.

## 1. Guiding principles (from the brief)

1. **One source of truth for game data.** Every stat, ability, moon effect, race
   modifier, and class definition lives in exactly one place — the engine's data
   layer. The live game, the AI, and the *simulators* all read the same data, so a
   balance change flows everywhere automatically. No stat is ever hard-coded in the
   client or server.
2. **Interfaces first, implementations behind them.** Every subsystem (RNG, board,
   rules resolver, AI policy, data provider, transport) is defined as a TypeScript
   `interface`. Concrete classes implement them; consumers depend on the interface.
   This is what makes Jest mocking and isolated unit testing trivial.
3. **DRY carve-outs.** Shared logic is factored into small, independently testable
   modules with a single responsibility. Client and server never re-implement rules.
4. **Deterministic core.** The rules engine is a pure function of
   `(state, action, seededRng) → newState`. No wall-clock, no `Math.random`, no I/O
   inside the engine. Determinism is what makes replays, netcode reconciliation,
   AI lookahead, and the simulators possible.

## 2. Package composition

Follows the existing monorepo convention (`apps/<name>-client`, `apps/<name>-server`,
shared workspace packages under `types/ utils/ services/ sdks/`). Three new packages:

| Package | Location | Kind | Role |
|---|---|---|---|
| `@shatteredarchive/kingdom-tactics-engine` | `services/kingdom-tactics-engine` | **isomorphic** (no DOM, no node built-ins) | The heart: centralized DSL data, rules resolver, deterministic RNG, AI policies, and the simulators. Imported by BOTH client and server. |
| `@shatteredarchive/kingdom-tactics-client` | `apps/kingdom-tactics-client` | Vite + React 19 | Arena UI, board renderer, unit/army selection, local play & scenario mode, simulator dashboard. |
| `@shatteredarchive/kingdom-tactics-server` | `apps/kingdom-tactics-server` | Express 5 + `ws` | Authoritative multiplayer match host, matchmaking lobby, AI-opponent runner, health endpoint. |

Why the engine lives in `services/` and not `apps/`: the workspace glob already
includes `services/*`, and an isomorphic domain package there can be imported by
both apps with `workspace:*` — no workspace/glob changes required. It is the DRY
carve-out that guarantees client, server, AI, and simulators share one rule set.

**Future consumer — mobile.** The React Native app at
`C:\Projects\shatteredarchive-mobile` (Android first, iOS later) is intended to embed
this same engine long term (out of initial scope). Because the engine is pure
isomorphic TS (no DOM, no Node built-ins — RN has neither) depending only on
`types-global`/`utils-global`, the mobile app can add it as a `workspace:*` dep later
with no engine changes. This is a constraint to preserve, not work to do now.

### Dependency direction (must stay acyclic)

```
kingdom-tactics-engine  (depends only on types-global, utils-global)
        ▲                         ▲
        │                         │
kingdom-tactics-client     kingdom-tactics-server
```

The engine never imports from an app. Apps never re-declare rules.

## 3. Engine internal layout (`services/kingdom-tactics-engine/src`)

```
data/            ← SINGLE SOURCE OF TRUTH (the "centralized information")
  dsl/           ← generated/distilled from the C# sources (§4); // @generated
    races.ts             MortalRaces + RemortRaces → id, name, category
    race-attributes.ts   distilled from Server.Dsl/Races: base stats, resist/vuln,
                         affinities, size, cp modifier, limited flag
    classes.ts           MortalClass (base + reclass) → id, name, group, reclass flag
    class-attributes.ts  distilled from Server.Dsl/Classes: primary/secondary attr,
                         armor type, race restrictions, casting modifiers
    moons.ts             MoonType/Phase/Position/Direction
    gods.ts              AffiliationGods (grouped good/neutral/evil/chaos)
    affiliations.ts      Kingdoms, Clans, Allegiances
    alignment.ts         Alignment, StatAttributes
    terrain.ts           TerrainTypes (id, name)
  balance/         ← TACTICAL stats authored for THIS game, keyed by DSL ids
    race-modifiers.ts    per-race grid stat/movement deltas
    class-kits.ts        per-class grid stats + move/attack patterns
    reclass-kits.ts      reclass overrides/upgrades
    moon-effects.ts      how each moon phase buffs/nerfs magi abilities
    terrain.ts           per-terrain move cost, passability, cover, LoS blocking
    unit-costs.ts        deployment point costs for army-building
    modes.ts             GameModeConfig for Duel/Duo/Skirmish/Squadron/Battle/Siege(+)
  index.ts         GameDataProvider + GameModeProvider behind their interfaces
model/           ← immutable domain types: Terrain/Tile/Board, UnitTemplate, Unit,
                   Squadron, Army, MatchState, Action, GameModeConfig
rng/             ← ISeededRng interface + Mulberry32/xoshiro impl (deterministic)
rules/           ← pure resolvers: movement, line-of-sight, attack, damage (distilled
                   from Calculators), terrain, status, turn order, victory. Each a
                   standalone, unit-tested module.
engine/          ← GameEngine: applies an Action to MatchState via rules/. Pure.
ai/              ← IAiPolicy: RandomPolicy, GreedyPolicy, MinimaxPolicy (pluggable)
sim/             ← simulators (see §6) — consume data/ + engine/ + ai/ only
codegen/         ← generate-dsl-data.ts: distills Constants.cs + Server.Dsl → data/dsl/*
```

### The centralized-data contract

```ts
export interface IGameDataProvider {
  races(): readonly RaceDef[];
  classes(): readonly ClassDef[];        // base + reclass, tier-tagged
  moons(): readonly MoonDef[];
  gods(): readonly GodDef[];
  affiliations(): readonly AffiliationDef[]; // kingdoms + clans
  terrains(): readonly TerrainDef[];
  unitTemplate(race: RaceId, cls: ClassId): UnitTemplate; // fully-resolved stats
  moonEffect(moon: MoonType, phase: MoonPhase): MoonModifier;
  terrainEffect(t: TerrainType): TerrainModifier; // move cost, cover, LoS, passability
}

export interface IGameModeProvider {
  modes(): readonly GameModeConfig[];
  mode(id: GameModeId): GameModeConfig;  // sides, budget, scale, squadrons?, victory, terrain profile
}
```

`unitTemplate()` is the choke point: it composes `class-kits` + `race-modifiers`
(+ reclass overrides) into a final stat block. The live match, the AI's evaluation
function, and every simulator all obtain units through this one method — so
rebalancing `race-modifiers.ts` or `class-kits.ts` propagates to all of them with
zero other edits. That is the "changes flow through to the simulators" requirement,
satisfied structurally.

## 4. DSL data distillation (C# source of truth → TypeScript)

**The C# DSL projects are the core source of truth. The game distills that data into
its own generated TS at dev time and NEVER references the `.cs` files at runtime.**
Distillation is a one-way, dev-time extraction; the shipped engine imports only the
generated TS. This keeps the game decoupled from the C# server while staying faithful
to canonical DSL numbers.

Two upstream sources:

1. **`Server.Core/Constants.cs`** — identity + enumerations: which
   races/classes/moons/gods/kingdoms/clans/**terrains** exist, their display names,
   and their numeric ids (`MortalRaces`, `MortalClass`, `RemortRaces`,
   `MoonType/Phase/Position/Direction`, `Alignment`, `AffiliationGods`,
   `AffilitionAllegiance`, `StatAttributes`, `TerrainTypes`, `Continents`).
2. **`Server.Dsl/`** (`C:\Projects\DSL\Server\Server.Dsl\Server.Dsl.csproj`) — the
   *substance* behind each identity, defined interface-first:
   - `Races/IMortalRace.cs` + per-race classes → base `Stats(str,int,wis,dex,con)`,
     `Resistances`/`Vulnerabilities` (`DslDamageType`), `BoostedClasses` (per-class
     affinity), primary/secondary attribute modifiers, `AvailableClasses`,
     `IsLargeRace`, `BaseCpModifier`, `IsLimitedRace`.
   - `Classes/IClass.cs` + per-class classes → `PrimaryAttribute`/`SecondaryAttribute`,
     `ArmorType`, `ClassGroup`, `IsReclass`, `IsCSR`, `Affiliation`, `CastsAtLevel`,
     `CastingLevelModifier`, `RaceRestrictions`.
   - **Class kits & racials** are assembled from `ClassAbilityGroups/`, `Skills/`,
     `Songs/`, `Spells/` (the per-class/per-race ability catalog: which abilities a
     class/race gets and at what level). These are **primary** sources for the kit
     layer (Phases 2–3), not deferred extras.
   - `Calculators/` (`DamageCalculator.cs`, `ArmorCalculators.cs`, `SavesCalculator.cs`,
     `DamageTypeGroupings.cs`) → the combat math to **distill into `rules/`** as
     tactical formulas (approximated/scaled for a grid game — not imported verbatim).
     These calculators are **incomplete upstream** but are the correct starting point;
     fill gaps with authored tactical values, not by inventing DSL formulas.
   - Remort dragon families set alignment + innate resist (canonical): **metallic =
     Good** (Gold/Silver/Brass/Bronze/Copper/Steel), **chromatic = Evil**
     (Red/Black/Blue/Green/White/Brown), **gem = Neutral** (Crystal/Topaz), each with
     the dragonskin damage resist listed in `ROADMAP.md`. Also: angels = Good,
     demons = Evil, **Balanx = Neutral**, and **giants split by type** (Frost = Good,
     Cloud = Neutral, Fire = Evil; giants carry an "unlimited mana + permadeath" trait).

### How the distillation runs

- `codegen/generate-dsl-data.ts` (dev-time node script) reads the C# sources and emits
  `data/dsl/*.ts` as **generated, checked-in** files (`// @generated from <source> —
  do not edit by hand`). Enum → id mapping preserves the C# numeric values.
- **Identity/canonical stats are generated; game-balance is separate.** Values in
  `data/balance/*` (grid move/attack patterns, tactical costs, moon effects) are
  hand-authored and keyed by the generated ids, so re-running codegen never clobbers
  tuning. Canonical DSL numbers (e.g. a race's base stat block, resistances) come
  from generation; how those translate into grid tactics is the authored layer.
- Parsing strategy: start with regex/line extraction of the enums and the simple
  property getters (stat tuples, modifiers, flags, resistance arrays). Rich ability
  maps are distilled incrementally as later phases need them.

Reference values already extracted (see `ROADMAP.md` §DSL data reference): Moons =
Black/Red/White × phases(Empty→Full); 45 base+reclass `MortalClass` entries; mortal
races (Human…Lepori) + remort races; gods grouped Good/Neutral/Evil/Chaos; kingdoms
and clans; and terrains (City, Field, Forest, Mountain, Water, Air, Desert,
Underground, Underwater, Tundra, Ice, Ocean, Hills, Indoors).

## 5. Tactics mechanics (initial scope)

- **Grid arena** with an arena selector (hand-authored maps of varying size).
- **Army building** under a deployment-point budget; units = (race × class) with a
  cost from `unit-costs.ts`.
- **Chess-variant movement/attack**: each class has a movement pattern and an attack
  pattern (range, shape, multi-tile) defined in `class-kits.ts`; resolved by `rules/`.
- **Moon magic**: magi classes' spell power keys off the active moon phase via
  `moon-effect.ts` — a first-class, data-driven modifier layer.
- **Turn-based** with initiative/turn order in `rules/turn-order.ts`.
- **Victory** conditions in `rules/victory.ts` (rout / objective / control-point).
- Cumulative war/campaign tracking is **out of scope for v1** (brief), but match
  results are emitted as a typed event so a future campaign layer can subscribe.

### 5.1 Game modes (data-driven)

Modes are **not code branches** — each is a `GameModeConfig` in the data layer
(`data/modes.ts`), read through `IGameModeProvider`. A config declares: side count,
per-side deployment budget (points or fixed unit count), board/arena size class,
whether units are individual or **squadron** tokens (§5.3), victory condition, and
terrain profile. Adding/rebalancing a mode = editing data, so it flows to the
simulators automatically (same principle as unit stats).

| Mode | Sides | Scale | Notes |
|---|---|---|---|
| **Duel** | 2 | 1 v 1 | Single unit each; pure match-up test. |
| **Duo** | 2 | 2 v 2 | Two units per side. |
| **Skirmish** | 2 | 5 v 5 (or equal cost) | Small squad; the default "arena". |
| **Squadron** | 2 | mixed small | Several *unit types* per side under a budget. |
| **Battle** | 2 | hundreds via squadrons | Large open-field across terrains; board tokens are aggregated squadrons. |
| **Siege** | 2 (asym.) | attacker vs defender | Assault on a location: walls/gates/objective tiles; asymmetric budgets. |
| **Free-for-all** | 3–4 | every general for self | Last standing wins. |
| **Objective / King-of-the-Hill** | 2+ | control points | Hold control-point tile(s) for N turns; control-point victory. |
| **Horde / Survival** | 1 + AI | vs AI waves | Co-op/solo vs escalating waves (uses Beastiary units). |

### 5.2 Terrain (2D battlefield layer)

Terrain is distilled from `Constants.TerrainTypes` (City, Field, Forest, Mountain,
Water, Air, Desert, Underground, Underwater, Tundra, Ice, Ocean, Hills, Indoors) into
`data/dsl/terrain.ts`, then given tactical properties in `data/balance/terrain.ts`:
per-terrain **movement cost**, **passability** (by movement class — ground/flying/
aquatic), **cover/defense modifier**, and **line-of-sight blocking**. Each `Tile`
carries a `TerrainType`; the client renders terrain as the **2D backdrop under the
battle** (largely flat sprites/tiles beneath the unit layer). Maps/arenas are
authored as tile grids composed of these terrains; large **Battle** maps span several
terrains ("open field across various terrains"), and **Siege** maps add structure
tiles (wall/gate/objective) as tile features. Terrain effects are data — a forest's
defense bonus is one number in one file, read by movement, LoS, and damage rules
alike.

### 5.3 Squadron / formation model

To support **Battle** (hundreds of troops) without hundreds of tokens, a board token
is either a single **Unit** or a **Squadron** — an aggregate of like/mixed units that
moves and fights as one. A Squadron's stats (aggregate HP pool, attack strength,
size) are **derived from its member `UnitTemplate`s** via the same centralized data,
so rebalancing a unit propagates into squadron strength automatically. Duel/Duo/
Skirmish/Squadron modes use individual units; Battle uses squadron tokens; both share
one model so rules operate uniformly (a Unit is treated as a squadron of one).

## 6. Simulators (`engine/src/sim`)

Simulators are headless drivers over the same engine + data. Because they only ever
read units through `IGameDataProvider`, rebalancing flows in automatically.

- **MatchSimulator** — runs a full match between two `IAiPolicy` instances with a
  seeded RNG; returns a typed result (winner, turns, per-unit stats).
- **BatchSimulator** — N seeded matches for a match-up; aggregates win-rate / balance
  metrics. This is the balance-tuning workhorse.
- **ScenarioSimulator** — supports the brief's "single player controls both sides":
  step through a scripted or interactive scenario, inspect state between actions.

All three are exercised by the client's simulator dashboard and are usable from a
CLI / test harness for offline balance sweeps.

## 7. Client & server

**Client** mirrors `game-client` conventions (React 19, Vite 8, Jest, feature-sliced
`src/features/*`, `components/`, `hooks/`, `pages/`). Feature slices: `arena` (board
render + interaction), `army-builder`, `match` (local play loop), `scenario`,
`simulator` (dashboard over `sim/`), `net` (multiplayer transport). The client can
run a **fully local match** (vs AI or hot-seat) using the engine directly — the
server is only needed for online multiplayer.

**Server** mirrors `game-server` (Express 5 + `ws`, `services-server` bootstrap,
Winston logging, `/health`). Adds a `/ws/kt` gateway hosting **authoritative**
matches: it owns the `GameEngine` instance per match, validates each client action,
broadcasts state deltas, and can seat an `IAiPolicy` as an opponent. Transport
messages are a typed discriminated union shared via the engine (or a `types-*`
addition) so client and server can't drift.

### Testability (interfaces + Jest mocks)

- `ISeededRng`, `IGameDataProvider`, `IAiPolicy`, `IMatchTransport`, `IClock` are
  all injectable. Tests pass fakes/mocks; nothing reaches for a global.
- Pure `rules/*` modules get exhaustive table-driven unit tests.
- `MatchSimulator` with a fixed seed gives deterministic golden-match snapshots.
- Root Jest config (`jest.config.cjs`) + per-app pattern already in the repo; the
  engine adds its own `jest` project.

## 8. Docker / deploy (experimental ONLY)

Per the brief, wire into
`deploy/docker-compose.shattered-archive-experimental.yml` **only** — never the
production `docker-compose.yml`.

- New `deploy/kingdom-tactics-client.Dockerfile` and
  `deploy/kingdom-tactics-server.Dockerfile`, modeled on the game-* Dockerfiles
  (same pinned node/nginx digests per repo CVE policy; `apk --no-cache upgrade`;
  `COREPACK_ENABLE_STRICT=1`; build the engine package before the app, mirroring how
  the game-server Dockerfile builds `types/utils/services/sdks` first).
- Two new compose services (`kingdom-tactics-client`, `kingdom-tactics-server`) with
  nginx aliases `kingdom-tactics-client.shatteredarchive.dev` /
  `kingdom-tactics-server.shatteredarchive.dev`.
- nginx `edge-subdomains.conf`: add two server blocks + a `/ws/kt` upgrade route,
  copying the game-client pattern.
- **Proposed ports** (avoid 3xxxx game / 4xxxx web): server `51000`, client vite
  build `50080`. (Confirm before wiring.)

## 9. Key decisions taken as defaults (flag if you disagree)

1. Shared logic is a `services/kingdom-tactics-engine` isomorphic package (not
   duplicated in each app).
2. The C# projects (`Constants.cs` + `Server.Dsl/`) are the source of truth; the game
   **distills** them into generated TS at dev time and never references `.cs` at
   runtime. Canonical DSL numbers are generated; grid-tactics balance is hand-authored
   and separate so codegen never overwrites tuning.
3. Game modes and terrain are **data-driven** (`data/modes.ts`, `data/*/terrain.ts`),
   read via providers — adding/rebalancing a mode or terrain flows to the simulators.
4. Nine modes, all in scope: Duel, Duo, Skirmish, Squadron, Battle, Siege,
   Free-for-all, Objective/King-of-the-Hill, Horde/Survival.
5. v1 targets **local play (vs AI + hot-seat) + scenario mode** first; authoritative
   online multiplayer is scaffolded but hardened in a later phase.
6. Ports 51000 (server) / 50080 (client). Experimental compose only.
7. Engine stays React-Native-compatible so the mobile app can embed it later
   (no DOM / no Node built-ins in shipped engine code).
