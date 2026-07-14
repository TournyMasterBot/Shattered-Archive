# Kingdom Tactics — Class Roster & Restrictions

How every mortal class becomes playable in army building, and how race/class and
CSR restrictions are enforced. Companion to [`ROADMAP.md`](./ROADMAP.md) and
[`ABILITY-MECHANICS.md`](./ABILITY-MECHANICS.md). Landed 2026-07-11.

## The roster problem

The DSL defines **45 concrete mortal classes**, but only five (Warrior, Ranger,
Assassin, Mage, Cleric) have a hand-authored tactical `ClassKit`. The rest previously
made `unitTemplate` throw "no class kit". Now every class resolves.

### Default kits

`defaultClassKit(classKey)` (in `data/balance/class-kits.ts`) derives a reasonable kit
from the distilled `class-attributes.ts`:

- **`classGroup`** picks a combat archetype — one of `Warrior` / `Thief` / `Mage` /
  `Cleric` / `Bard` (base HP, attack profile, movement, magi flag, damage type).
- **`armorType`** nudges defense (`Plate +3 … Cloth −1`).

A hand-authored `CLASS_KITS` entry always **wins**; the default only fills the gap. This
mirrors the ability no-op/override pattern: sensible defaults now, hand-tuning later.
Reclass deltas (`RECLASS_KITS`) layer only on a hand base kit — a derived default already
reflects the class's own attributes, so deltas aren't double-counted there.

## Restriction semantics (from the DSL)

Distilled into `class-attributes.ts` per class:

| Field | Polarity | Meaning |
|---|---|---|
| `raceRestrictions` | **FORBID** | A race in this list can never be that class (e.g. Warrior forbids Pixie). |
| `csr.requiresRaces` | **ALLOW** | When non-empty, the race **must** be in it (Bladesinger → elf subraces, Runesmith → dwarves). |
| `csr.requiresClasses` | inherent | The reclass's own base class — implied by picking the reclass, not a context obligation. |
| `csr.requiresAllegiances` | **gate** | Clan/kingdom/faction the team must fight for (CSR only). The one gate the team's context supplies. |
| `csr.requiresGods` | rolled up | God/religion the class ties to — **folded into allegiance**, not gated separately (every god requirement co-occurs with an allegiance one). |

> **CSR** = a Class-Specific Reclass, gated by the DSL class's `Affiliation` block. The
> real `Affiliation` shape is `{ AffiliationType, Gods, Allegiances, Races, Classes,
> IsManatonic }`; the gate above captures the fields that constrain legality. A team
> **fights for a single allegiance** — individual religions may differ within a faction,
> so religion is rolled up into that one allegiance rather than selected separately. A CSR
> with **no** allegiance requirement (e.g. Monk, gated only by its manatonic order) imposes
> no allegiance gate.

## Legality API (`data/balance/legality.ts`)

Pure module (no provider/DOM/Node deps), also exposed on `GameDataProvider`:

```ts
isLegalRaceClass(raceKey, classKey, ctx?): boolean
legalClassesForRace(raceKey, ctx?): string[]
legalRacesForClass(classKey, ctx?): string[]

interface RaceClassContext {
  allegianceKey?: string; // the team's one allegiance — AffiliationKey (affiliations.ts)
}
```

`isLegalRaceClass` returns false when: the class is unknown; the race is in
`raceRestrictions`; the class declares `requiresRaces` and the race isn't in it; or the
class is CSR **and** it requires an allegiance the team's `allegianceKey` isn't one of. A
CSR with no allegiance requirement is ungated. With no `ctx` (unaffiliated), CSR classes
that require an allegiance are gated **out** (surfaced, not silently allowed).

## Army building — single-select per unit

- `ArmyRoster` carries an optional `context?: RaceClassContext` (the team's allegiance).
- `validateRoster` rejects any illegal pick **before** budget checks, for both budget kinds.
- The client army builder (`ArmyBuilder.tsx`) filters its unit palette through
  `legalClassesForRace(race, ctx)` and offers a per-team **Allegiance** selector
  (clan / kingdom / loner / renegade). A CSR class appears only once the team's allegiance
  allows it; a forbidden race hides the class entirely.
- Classes are presented as a **quick collapsible tree grouped by base class**: each top-level node
  is a **base class** (itself pickable) and the **reclasses derived from it** (same DSL `classGroup`)
  are its child items. Groups are sorted alphabetically by base-class name, and reclasses within each
  group are alphabetical too. Each row shows the class's tier point cost, plus badges for a damage
  boost/gimp and effective caster level where they apply.

## Point cost — base vs reclass tiers

A unit's army-building **point cost** is class-tier based (`classPointCost` in
`data/balance/unit-costs.ts`), not stat-derived — so it shows one clean number per class and a
**base class always costs `10`**:

| Class kind | Cost |
|---|---|
| Base class (`isReclass=false`) | flat **10** (`BASE_CLASS_POINTS`) |
| Reclass (`isReclass=true`) | **10 + surcharge**, where surcharge = `max(2, round(BaseCpModifier × 2))` |

`BaseCpModifier` is the DSL character-point tier now distilled into `class-attributes.ts`
(base = 0, standard reclass = 3, advanced/CSR higher). The floor (`RECLASS_MIN_SURCHARGE = 2`)
guarantees every reclass outprices a base class even when its CP tier is 0 (e.g. Ovate). Point
cost is per-class (not race-weighted) so the "base = 10" rule always holds; race CP modifiers feed
stat/casting derivation instead. (The older stat-derived `computeUnitCost` remains as a power metric.)

## Casting level, damage boosts, and racial traits

Several further DSL modifiers are now taken into account when resolving a unit
(`unitTemplate` → `UnitTemplate`):

- **Caster level** (`castingLevel`, `data/balance/casting.ts`) is an **absolute level**: a class that
  casts *at* level casts as the level cap (`LEVEL_CAP = 51`); one that casts *below* level (DSL
  `CastsAtLevel=false`) casts as `round(51 × CastingLevelModifier)` (Warrior `0.5` → 26). Additive
  bonuses stack: **elves +1**. (A **class affinity** also grants +1 in the DSL, but affinity is a
  *distinct* concept from the damage boosts below and isn't distilled yet, so it's off for now.
  In-match buffs like `imbue` add +3 at cast time, applied later — not baked in.) Surfaced as a `⚡`
  badge. Notional until ability scaling consumes it.
- **Damage boosts / gimps** (`damageBoostPct`) come from the race's `BoostedClasses` (distilled as
  `RaceAttributes.classBoosts`): **boost `10` / superboost `20` / SUPERBOOST `30`**, and **gimps** are
  negative. This is a **damage modifier**, folded into the unit's `attackPower` as `×(1 + pct/100)`
  (e.g. a Shalonesti Elf superboosts Warrior → +20% attack). Shown as a green/red `dmg` badge.
- **Racial traits** from the distilled `RaceAttributes.racialAbilities` map to authored effects.
  **Dwarven Toughness** → a KT `defense` bonus + a `toughness` trait. AC provenance + conversion: the
  DSL grants Toughness as **−25 AC**, and in the DSL *negative AC is better* with **~10 AC ≈ 1% damage
  reduction** (many items store a positive that really means negative). KT mitigates by
  `ac / AC_DIVISOR` (40), so a DSL AC delta `a` converts to `−a × (AC_DIVISOR/1000)` KT defense —
  Toughness's −25 AC ⇒ **+1 KT defense (≈2.5% reduction)** (`ktDefenseFromDslAc`, `racial-traits.ts`).

Each unit picks **one race + one class**; each **team** picks **one allegiance**. That is the
deliberate scope of this phase.

### Mode budgets — count vs points

Small skirmish-scale modes field an **equal number of units per side** (points ignored):
Duel (1), Duo (2), Skirmish (5), FFA (3 each). Point budgets — which price units by relative
power — are reserved for the larger battles: Squadron, Battle, Siege, Objective, Horde.

## Out of scope (future plans)

- **Squadron composition / blend tool** — selecting a *mix* of races/classes within one
  squadron (counts per race/class). Needs a per-squadron composition model + UI.
- **Per-side affiliation** in the client — today a single army context applies to all sides.
- **Hand-tuned per-class kits** — defaults are rough; individual tuning is later.
- **Ability authoring for the new kits** — resumes the ability-mechanics coverage now that
  restriction-correct rosters exist.
