# Kingdom Tactics — Combat Stances

A unit's **stance** is a posture it holds until changed, shifting how likely it is to hit,
be hit, and how hard it hits. Set as a **free minor action** on your turn. Companion to
[`ROADMAP.md`](./ROADMAP.md). Landed 2026-07-11.

## The stances

| Stance | to-hit | evasion | dmg dealt | dmg taken | For |
|---|---|---|---|---|---|
| **Normal** | 0 | 0 | 0 | 0 | any unit (default) |
| **Offensive** | +10% | −10% | +10% | +10% | any unit |
| **Defensive** | −10% | +10% | −10% | −10% | any unit |
| **Drunken Monkey** | 0 | +5% | −20% | 0 | Brewmaster |
| **Sloshing Style** | +5% | 0 | +5% | 0 | Brewmaster |
| **Cripple Style** | 0 | +2.5% | +2.5% | 0 | Brewmaster |

- **to-hit** lowers the *defender's* avoidance when this unit attacks.
- **evasion** raises *this* unit's avoidance when it is attacked.
- **dmg dealt / taken** scale outgoing / incoming damage.

`Normal` is a true no-op (all zeros), so a match of all-`normal` units plays exactly as before
stances existed. The three Brewmaster stances are distilled from the DSL (`Brewmaster.cs` Notes);
they are gated to Brewmasters. Values live in `data/balance/stances.ts` — the single tuning surface.

## Why two dimensions (avoidance *and* damage)

Combat has two channels, and stances touch both so they matter everywhere:

- **Avoidance** (to-hit / evasion) rides the per-hit `CombatHooks` dodge/parry/block roll, which
  **only the server installs**. So these modifiers shape *online* play.
- **Damage** (dealt / taken) is applied in the shared, deterministic `resolveDamage`, which runs in
  **both** local and online play. So stances still bite in a local match, which has no avoidance rolls.

## The economy — a free minor action

Setting a stance (`{ type: 'set-stance', tokenId, stance }`):

- does **not** consume the unit's move or action,
- is **exempt** from the one-unit-per-turn activation lock,
- so you may re-stance **any/all of your own units**, then activate one to move + attack as usual.

Constraints: only the **active side's own living units**, only on **your** turn, and only stances
**legal for the unit's class** (Brewmaster stances → Brewmasters). `set-stance` is deliberately
**omitted from `legalActions`** — the UI/players dispatch it directly; the AI ignores it for now.

In the play field, select one of your units before activating anyone and its stance buttons appear;
pick a stance, repeat for other units, then move/attack. (After you activate a unit, selection locks
to it — so stance your line *first*.)

## Out of scope (future)

- **AI stance use** — policies don't posture yet (stances aren't enumerated in `legalActions`).
- **Sloshing true multi-attack** — modeled as a damage bonus in v1; a real extra-attack roll is later.
- **Drunken Monkey taunt/aggro** — only its miss + weak-damage effects are modeled, not forced targeting.
- **Squadron stances** — v1 stances are per-unit; squadron aggregates stay normal.
