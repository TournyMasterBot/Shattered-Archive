# Kingdom Tactics — Ability Mechanics

How every spell/song/skill's *effect* is defined and integrated. The DSL ability files carry
only prose (655/662 have a help file; **none** set structured effects), so mechanics are
**hand-authored balance data**, keyed to the generated ability catalog
([`abilities.ts`](../../../services/kingdom-tactics-engine/src/data/dsl/abilities.ts)).

## The interface

`AbilityMechanics` ([`model/ability.ts`](../../../services/kingdom-tactics-engine/src/model/ability.ts))
standardizes one ability:

| Field | Meaning |
|---|---|
| `key` | catalog ability key (`ABILITIES[].key`) |
| `category` | `combat` \| `utility` \| `support` (the owner's three buckets) |
| `targeting` | `self` \| `ally` \| `enemy` (v1 single-target; area later) |
| `usage` | `active` \| `passive` \| `toggle` |
| `scaling` | `{ power?, save? }` attribute (skills→str/dex, spell dmg→int, saves→wis, songs→blend) |
| `damage?` | `{ potency, damageType? }` — auto-hit; `potency` multiplies the caster's resolved damage |
| `maladiction?` | `{ statusKey, duration, potency?, saves?, baseSave? }` — save-gated debuff (int vs wis) |
| `buff?` | `{ statusKey, duration, magnitude?, target:'self'\|'ally' }` — no save |
| `utility?` | `{ kind, note? }` — non-combat marker (effect TBD) |
| `status` | `authored` \| `stub` |
| `notes?` | help-file-derived rationale |

**Saves protect only against maladictions, not the damage portion** — damage auto-hits; the
maladiction rolls `rollSave` (caster int vs target wis) and lands only on failure. This matches
the DSL rule.

## Integration path

`AbilityAction { abilityKey }` → reducer `applyAbilityAction` → `EngineProviders.abilityResolver(key)`
→ `createAbilityResolver()` = `toAbilitySpec(resolveAbilityMechanics(key))` → `applyAbility(...)`
runs damage (via the salted `CombatHooks` exchange) + save-gated maladiction + buff. The server
(`MatchSession`) installs the resolver by default.

- **Registry:** [`data/balance/abilities/mechanics.ts`](../../../services/kingdom-tactics-engine/src/data/balance/abilities/mechanics.ts) — `AUTHORED_MECHANICS`.
- **Resolution:** `resolve.ts` — `resolveAbilityMechanics` (stub fallback), `isAuthored`.
- **Adapter:** `rules/ability-resolver.ts` — `toAbilitySpec`, `createAbilityResolver`.

**Unauthored = no-op** (owner decision): any key not in `AUTHORED_MECHANICS` resolves to a stub
with no payload — casting it consumes the action with no effect. Deterministic, so simulations
and golden tests do not move as authoring progresses.

> v1 gap (tracked): applied status keys (`stunned`, `berserk`, `disarmed`…) land on the token's
> `statuses[]`, but their *downstream* gameplay effects (a `stunned` unit skipping activation,
> `berserk` raising attack) are read by turn-order/resolve in a FOLLOW-UP layer. Passives
> (weapon masteries, Parry/Dodge) are authored with no active payload — coverage + future wiring.

## Authoring / resumption protocol

Coverage is tracked per **playable class kit** and grinds kit-by-kit. To continue:

1. `pnpm --filter @shatteredarchive/kingdom-tactics-engine ability:coverage` — prints per-kit
   `authored/total`, the next incomplete kit, and its remaining keys; regenerates the checklist
   [`docs/ability-coverage.md`](./ability-coverage.md).
2. Read each remaining ability's `HelpFile` in `DSL/Server/Server.Dsl/{Skills,Spells,Songs}/<Key>.cs`.
3. Add an `AbilityMechanics` entry to `AUTHORED_MECHANICS` (`status:'authored'`, `notes` from lore).
4. Add/extend `mechanics.test.ts` for any new mechanic shape.
5. Rerun `ability:coverage` + the engine suite; commit.

> Note: the DSL `class-attributes` ability lists are currently **over-broad** — e.g. Warrior's
> list (113) includes cross-class spells (Fireball, Gate). Author only genuinely class-appropriate
> abilities; cleaning the per-class rosters is part of the class-roster work (race/class + CSR
> restrictions).
