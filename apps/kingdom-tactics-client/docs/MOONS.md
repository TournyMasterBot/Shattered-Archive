# Kingdom Tactics — The Three Moons & Alignment

How the DSL's three-moon system is modeled in KT, and how a unit's deity gives it the
alignment the moons key off. Companion to [`CLASS-ROSTER.md`](./CLASS-ROSTER.md) and
[`ARCHITECTURE.md`](./ARCHITECTURE.md). Landed 2026-07-11.

## Three moons, three alignments

Faithful to the DSL (`Server.Dsl/Models/CalendarModels/Moon.cs`): **three moons hang in the
sky at once**, each governing one alignment and each running on **its own clock**, so their
phases drift independently and never stay in lockstep.

| Moon | Governs | Hours per phase (own cadence) |
|---|---|---|
| **White** | Good | 54 |
| **Red** | Neutral | 45 |
| **Black** | Evil | 33 |

A caster is empowered by the **single moon matching its own alignment** — a Good unit rides
the White moon, a Neutral unit the Red, an Evil unit the Black. An unaligned unit (Mixed — a
Chaos worshipper, or a unit with no deity) has no lunar patron.

Model + pure helpers live in [`data/balance/moons.ts`](../../../services/kingdom-tactics-engine/src/data/balance/moons.ts):
`moonSkyAt(gameHour)` gives the whole sky (each moon derived on its own clock),
`moonBonusForAlignment(sky, alignment)` returns the empowering moon's current bonus.

## Phase bonuses (per the empowering moon's phase)

From `Moon.SetMoonPhase`. `savesBonus` follows the DSL negative-is-better convention (a
caster's spells are harder to save against). These are the same axes the caster/merit model
already uses — cast level and saves (see [`CLASS-ROSTER.md`](./CLASS-ROSTER.md)).

| Phase | Mana % | Saves | Cast level |
|---|---|---|---|
| Empty | 0 | 0 | 0 |
| Crescent | +5 | −1 | +1 |
| 1/2 Moon | +10 | −2 | +2 |
| 3/4 Moon | +10 | −2 | +2 |
| Full Moon | +15 | −3 | +3 |

Each moon walks a symmetric waxing→waning cycle (Empty…Full…Empty, 8 slots, one slot per its
own `hoursPerPhase`). Moon **position** (Rising/HighSanction/Setting/NotVisible) grants only a
mana-**regen** bonus (`MOON_POSITION_REGEN`); it is independent of phase.

> `Moon.cs` carries a Waxing/Waning direction but ships no phase driver in `Server.Dsl`, so the
> symmetric cycle ordering is KT's documented assumption.

## Alignment comes from the deity

In the DSL a character's alignment flows from the **god** they worship, not their race. KT
mirrors this: the army builder has a **Deity** selector (gods grouped by alignment); the chosen
god sets each unit's alignment via `alignmentForGod` ([`data/balance/religion.ts`](../../../services/kingdom-tactics-engine/src/data/balance/religion.ts)) —
Good/Neutral/Evil map straight through, and **Chaos (Malachive)** / no-deity resolve to *Mixed*
(no moon). The alignment rides on the deployed `Unit` (`god` + `alignment`), and the match
carries a three-moon **sky** (`MatchState.moon` = `{ gameHour, sky }`, set by `buildMatch`).

## What consumes it today

- **Magi spell power** ([`rules/damage.ts`](../../../services/kingdom-tactics-engine/src/rules/damage.ts))
  now scales off the phase of the moon matching the **caster's own alignment** (was a single
  global moon). An unaligned magi draws on no moon, so its spell power is unscaled.
- **Cast level / saves** phase bonuses are modeled and exposed (`moonBonusForAlignment`) but,
  like `castingLevel`, remain notional until ability scaling consumes them.

## Out of scope (future)

- **Faction composition** (which races/alignments/religions each kingdom/clan permits) — the
  per-faction rules aren't in the DSL source tree; deferred to a dedicated pass. Only the hard
  race-locks are known (Shalonesti = elves, Wargar/Thaxanos = dwarves).
- **In-match lunar shifts** — a match is fought under a fixed sky (one `gameHour`); moons don't
  advance mid-battle yet.
- **Position-driven mana regen** and the mana economy generally.
