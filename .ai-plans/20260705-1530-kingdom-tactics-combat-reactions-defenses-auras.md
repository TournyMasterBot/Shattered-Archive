# Plan (DRAFT): Kingdom Tactics — Combat reactions, defenses & auras

Created: 2026-07-05T15:30:00-05:00 · Workspace: /workspace/shattered-archive · Status: DRAFT
Task: Extend the Phase-2b combat resolution (attack/damage) with automatic defenses (dodge/
parry/shield-block), shielding auras that negate/reduce by damage type, and reactive auras
(thorns etc.) that fire back at the attacker after a landed hit. NONE of this touches the
move/action economy — it all resolves automatically inside a single attack.

> STATUS: DRAFT — NOT the active work item. Phase 3 (engine/AI/sim) is the ACTIVE plan. This
> doc exists so the design + hooks are captured and ready; do NOT start it until (a) Phase 3
> lands and (b) the DSL defense/aura data is distilled (see §Data needs). It has no step
> checkboxes yet by design — it is a design spec + seam definition, promoted to a numbered
> plan when scheduled. Requires: Phase-2b (`resolveDamage`, `applyAttack`, `applyAbility`,
> `damage-types`) — all COMPLETE.

## Why this is its own doc
The action economy (Phase 3) and the combat-resolution pipeline are orthogonal. Defenses and
auras never generate an `Action` and never cost a budget, so they are invisible to the reducer
and the AI action space. They live entirely in the `rules/` damage/attack layer. Bundling them
into Phase 3 would muddy the reducer; keeping them here keeps each concern testable in isolation.

## Combat resolution order (per single attack or damaging spell hit) — AUTHORITATIVE
A weapon attack or a damage spell resolves in this fixed order. Each attack against ONE target
runs the whole pipeline; AoE runs it per splashed target.

1. **Declare.** The attacker's action is already spent (Phase-3 economy). Resolve attacker +
   defender `UnitTemplate`s, damage type, defender terrain, moon phase (Phase-2b inputs).
2. **Avoidance step (automatic, no cost).** Roll dodge → parry → shield-block from the
   defender's stats/equipment via `ISeededRng`. On success the attack is AVOIDED: **0 damage,
   NO hit** — SHORT-CIRCUIT to step 6 (skip damage AND reactions). USER RULE: a missed melee
   attack means the defender "wasn't hit", so no thorns.
   - Note: damage SPELLS auto-hit (Phase-2b, SavesCalculator) and by default SKIP avoidance
     unless a specific magic-dodge/evasion aura says otherwise (data-driven flag).
3. **Shielding / defensive auras (automatic, no cost).** Auras that act as DEFENSES adjust the
   incoming hit BEFORE mitigation, keyed by the incoming damage TYPE via
   `data/dsl/damage-types.ts` groupings. Examples: anti-magic shield → NEGATE (set to 0) any
   `damageCategory === 'magic'` (or an elemental subset) hit; elemental ward → reduce fire/cold/
   lightning. Modeled as typed protection modifiers — a natural extension of `resolveDamage`'s
   existing protection step (which already handles `sanctuary` ×0.5 and would gain typed-negate
   entries). A full negate here also counts as **NO hit** for step 5 (reactions).
4. **Core mitigation + apply damage (Phase-2b `resolveDamage`).** Constitution → AC/armor/cover
   → resist/vuln → remaining protections → floor at 1. Reduce defender hp/hpPool. "Hit landed"
   ⇔ damage actually applied to a non-avoided, non-fully-negated target (amount ≥ 1).
5. **Reaction step (automatic, no cost) — ONLY IF THE HIT LANDED.** Reactive auras on the
   DEFENDER fire back at the ATTACKER: thorns (deal damage to attacker — itself routed through
   `resolveDamage` so it respects the attacker's own armor/resists/con), lifesteal-reflect,
   on-hit debuffs, etc. Also on-hit procs from the attacker's own weapon flags (e.g. "on hit:
   chance to chill") resolve here. If step 2 avoided or step 3 fully negated the hit, this step
   is SKIPPED entirely.
6. **Done.** Return the new `MatchState`. Nothing in steps 2–5 spent a move/action budget.

## Hook design (the seams to add)
Extend the Phase-2b combat entry points with an OPTIONAL, defaulted `CombatHooks` so the aura/
defense system plugs in without changing call sites that don't use it. Default (absent) = today's
deterministic Phase-2b behavior exactly.

```ts
// rules/combat-hooks.ts (new)
export interface CombatContext {
  readonly state: MatchState;
  readonly attacker: UnitTemplate;
  readonly defender: UnitTemplate;
  readonly attackerId: string;
  readonly defenderId: string;
  readonly damageType: string;        // attacker.damageType
  readonly provider: IGameDataProvider;
  readonly rng: ISeededRng;
}

export interface CombatHooks {
  /** Step 2: return true if the attack is avoided entirely (dodge/parry/block). */
  onAvoid?(ctx: CombatContext): boolean;
  /** Step 3: adjust incoming damage for shielding/defensive auras (typed negate/reduce).
   *  Return the possibly-reduced amount; 0 = fully negated (counts as no hit). */
  onDefend?(incoming: number, ctx: CombatContext): number;
  /** Step 5: fires only when a hit landed; return a NEW MatchState with reactions applied
   *  (e.g. thorn damage to the attacker). Receives the damage actually dealt. */
  onHit?(dealt: number, ctx: CombatContext): MatchState;
}
```

Plug into `applyAttack`/`applyAbility` (rules/attack.ts) as an added optional last param
`hooks?: CombatHooks`. Sketch of the revised `applyAttack` core:

```
if (hooks?.onAvoid?.(ctx)) → mark attacker hasActed, no damage, return (no reactions)
let amount = resolveDamage(...).amount
if (hooks?.onDefend) amount = hooks.onDefend(amount, ctx)   // typed shields; may become 0
apply amount to defender (if amount>0)
let next = <state with damage + attacker hasActed>
if (amount > 0 && hooks?.onHit) next = hooks.onHit(amount, ctx)   // thorns etc.
return next
```

Keep it PURE + deterministic (all randomness via `ctx.rng`). Reactions that deal damage MUST
route through `resolveDamage` (single source of truth), not ad-hoc math.

### Relationship to the Phase-3 reducer `triggers` hook
Two hooks at two granularities — do not conflate:
- **`CombatHooks`** (this doc): FINE, per-HIT, inside one attack; knows attacker/defender/
  damage type; handles avoidance, typed shields, thorns.
- **`EngineProviders.triggers`** (Phase 3): COARSE, per-ACTION, in the reducer; for turn-tick
  auras, banter, weapon-flag passives that aren't tied to a specific defender being hit.

## Data needs (distill BEFORE implementing — currently missing)
- **Avoidance stats**: dodge/parry/shield-block chances. Check `Server.Dsl/Calculators/` for a
  defense/avoidance calculator (SavesCalculator is spells-only) and class/race/equipment data.
  If upstream is incomplete (likely), author grid-scaled values in `data/balance/` keyed by
  class/armor, same pattern as `DAMAGE_CONSTANTS` — one tuning surface.
- **Aura catalog**: which auras exist, their kind (shielding vs reactive), trigger, damage-type
  filter, and magnitude. Distill from `Server.Dsl/Skills|Spells|Songs` + weapon flags. This is
  a sizeable, qwen-friendly codegen task (its own step/plan) — do NOT hand-write the whole set.
- **Weapon flags**: on-hit procs / passive damage flags from the DSL weapon/item data.

## Rough step outline (promote to numbered steps when scheduled)
1. (CLAUDE) `rules/combat-hooks.ts` interfaces + thread optional `hooks?` through
   `applyAttack`/`applyAbility` with the ordered pipeline above; default-absent keeps all 87+
   current tests green. Add tests with stub hooks (avoid → 0 dmg + no onHit; onDefend negates a
   magic hit; onHit applies thorn damage only on a landed hit).
2. (CLAUDE) Extend `resolveDamage` protection step with typed-negate entries so shielding auras
   can be expressed as data (anti-magic shield, elemental wards) rather than bespoke `onDefend`
   code where possible.
3. (QWEN-SAFE, after data exists) Distill the avoidance stats + aura catalog into
   `data/balance/*` / `data/dsl/*` via codegen; transcribe a provided `CombatHooks`
   implementation that reads the catalog. Verify via server build+test, report.
4. (CLAUDE) Wire the default combat hooks into `applyAttack` call sites in the engine/sim so
   simulators account for reaction/shield damage; balance pass.

## Open questions (resolve when scheduled)
- Do spells participate in avoidance at all, or only via a dedicated magic-evasion aura? (v-draft
  assumes spells auto-hit and skip step 2 unless an aura opts in.)
- Are shielding auras a limited resource (charges/turns) or passive-while-active? (Likely a
  `StatusEffect` with `remaining`, decremented per block — model already supports `remaining`.)
- Thorns vs armor: does thorn damage use the attacker's armor/resists (v-draft: YES, via
  `resolveDamage`) or ignore them (true reflect)? Per-aura flag, probably.

## Progress log
- 2026-07-05T15:30 DRAFT created from USER combat-reaction refinement. Captures the authoritative
  per-hit order (avoidance → shielding auras/typed-negate → core mitigation/apply → reactions
  only-if-hit), the `CombatHooks` seam (onAvoid/onDefend/onHit) on `applyAttack`/`applyAbility`,
  its distinction from the Phase-3 per-action `triggers` hook, the DSL data still to distill, and
  a rough Claude/qwen step split. Not scheduled; blocked on Phase 3 + data distillation.
