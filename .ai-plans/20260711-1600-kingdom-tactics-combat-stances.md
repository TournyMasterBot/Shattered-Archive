# Plan: Kingdom Tactics — combat stances (offensive/defensive/normal + Brewmaster)

Created: 2026-07-11T16:00:00-05:00 · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Add per-unit combat stances settable as a FREE minor action (no move/action cost, not
subject to the one-unit-per-turn lock): Normal/Offensive/Defensive for all units, plus the three
Brewmaster-only stances. Stances shift hit/avoidance and damage.

## Goal
Every unit holds a stance (default Normal) that a player can change any number of their own units'
stances on their turn without spending the move/action economy, then move+attack as normal. Offensive
= more likely to hit + more exposed; Defensive = less likely to hit + better defended; Normal = blend.
Brewmasters additionally have Drunken Monkey / Sloshing / Cripple. Done when: a `set-stance` action
applies for the active side's own units (free, lock-exempt, economy-free), stances shift both the
avoidance roll (online/hooked path) AND the shared deterministic damage (so local play feels it too),
Brewmaster stances are gated to Brewmasters, the client offers stance controls on the play field, and
all engine/server/client suites are green with `normal` byte-identical to today.

## Constraints
- **Free minor action** (owner clarified): `set-stance` does NOT consume `hasMoved`/`hasActed`, does
  NOT set `activatedTokenId`, and is NOT gated by the one-unit-per-turn lock. A player may re-stance
  all their units, then activate one to move/attack. Only the ACTIVE side's own LIVING units.
- **`normal` is a no-op** — all four modifiers 0, so every existing test/sim (units default to normal)
  stays byte-identical. Keep `Unit.stance` OPTIONAL (`stance?`) so the dozens of existing Unit literals
  in tests still compile; read as `token.stance ?? 'normal'`.
- **Works in BOTH local and online play.** Only the SERVER installs `combatHooks` (avoidance); local
  client play runs the deterministic auto-hit path. So stances carry avoidance mods (hooked) AND
  damage mods (applied in the shared `resolveDamage`, both paths) — the latter is what makes stances
  bite locally.
- **Preserve the salted-RNG draw pattern** in `rollAvoidance`: fold the stance shift into the dodge
  chance so the number of `rng.next()` draws is unchanged (3), keeping replays deterministic; mod 0 ⇒
  identical behavior.
- Brewmaster stances gated to `classKey === 'Brewmaster'`; general stances for any unit.
- `set-stance` is OMITTED from `legalActions` (like abilities) — the AI/sims ignore stances; the UI
  dispatches the action directly. Keeps AI/sim branching + golden tests unchanged.
- Isomorphic engine; pnpm only; host runs JS build/tests (never qwen in-container). Plain Jest.

## Context
- Stances (DSL, Brewmaster.cs Notes): Drunken Monkey (+5% opp miss, weak dmg), Sloshing (+5% extra
  roundhouse ≈ +dmg), Cripple (+2.5% opp miss, +2.5% dmg). Source of truth for the 3 special stances.
- Model: /workspace/shattered-archive/services/kingdom-tactics-engine/src/model/unit.ts (Unit — add
  optional `stance`); /workspace/shattered-archive/services/kingdom-tactics-engine/src/model/action.ts
  (Action union — add `SetStanceAction`).
- Combat math: /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/damage.ts
  (`resolveDamage` — the shared choke point; add optional dealt/taken mods);
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/balance/defenses.ts
  (`rollAvoidance` — add avoidMod folded into dodge);
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/combat-hooks.ts
  (`CombatContext` — add attacker/defender stance);
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/default-combat-hooks.ts
  (`onAvoid` — net avoid mod = defenderStance.evasionMod − attackerStance.toHitMod);
  /workspace/shattered-archive/services/kingdom-tactics-engine/src/rules/attack.ts
  (`resolveDamageExchange` + no-hooks `applyAttack` + `applyAbility` — thread stance into resolveDamage).
- Reducer: /workspace/shattered-archive/services/kingdom-tactics-engine/src/engine/game-engine.ts
  (`applyAction` switch, `EngineProviders`, `resetFlags`, `legalActions`, one-unit lock `isLockedOut`).
- Setup: /workspace/shattered-archive/services/kingdom-tactics-engine/src/setup/build-match.ts (Unit
  construction — set `stance: 'normal'`).
- Data provider: /workspace/shattered-archive/services/kingdom-tactics-engine/src/data/index.ts
  (expose `stances()` / `stancesForClass()` / legality). New: data/balance/stances.ts.
- Net: /workspace/shattered-archive/services/kingdom-tactics-engine/src/net/protocol.ts
  (`ACTION_TYPES` set — add 'set-stance'). Server gateway relays Actions;
  /workspace/shattered-archive/apps/kingdom-tactics-server/src/match/match-session.ts already installs
  combatHooks + salted combatRng.
- Client: /workspace/shattered-archive/apps/kingdom-tactics-client/src/features/arena/ (play-field UI +
  useMatch dispatch) — add stance controls for the selected own unit.

## Steps
### [x] 1. Stance data + model + action
- Do: New `data/balance/stances.ts`: `StanceKey` ('normal'|'offensive'|'defensive'|'drunken-monkey'|
  'sloshing'|'cripple'), `StanceModifier` {key,name,toHitMod,evasionMod,damageDealtMod,damageTakenMod,
  classKey?}, `STANCES` record (values per the plan table), `stanceMod(key)` (default normal),
  `stancesForClass(classKey)` (general + class-gated), `isStanceLegalFor(key, classKey)`. Add optional
  `stance?: StanceKey` to `Unit` (model/unit.ts). Add `SetStanceAction {type:'set-stance',tokenId,
  stance}` to model/action.ts + the `Action` union. Re-export stance API from data/index.ts + model.
- Files: services/kingdom-tactics-engine/src/data/balance/stances.ts (+.test.ts),
  services/kingdom-tactics-engine/src/model/unit.ts, services/kingdom-tactics-engine/src/model/action.ts,
  services/kingdom-tactics-engine/src/data/index.ts, services/kingdom-tactics-engine/src/model/index.ts
- Verify: host engine `tsc` clean; stances.test.ts (general vs Brewmaster gating; normal is all-zero).

### [x] 2. Wire stances into the combat math
- Do: `rollAvoidance(template, rng, avoidMod=0)` — `dodge = clamp(dodgeChance+avoidMod,0,MAX_AVOID)`
  (draw count unchanged). `resolveDamage` — add optional `damageDealtMod?`/`damageTakenMod?` (default 0),
  applied multiplicatively before the floor. `CombatContext` — add `attackerStance`/`defenderStance`
  (StanceModifier); populate in `resolveDamageExchange` from the tokens (`stanceMod(token.stance)`).
  `default-combat-hooks.onAvoid` — pass `defenderStance.evasionMod − attackerStance.toHitMod`. Thread
  the attacker/defender damage mods through resolveDamage in resolveDamageExchange, the no-hooks
  applyAttack branch, and applyAbility (both branches). Squadron tokens → normal.
- Files: services/kingdom-tactics-engine/src/data/balance/defenses.ts (+ defenses.test.ts),
  services/kingdom-tactics-engine/src/rules/damage.ts (+ damage.test.ts),
  services/kingdom-tactics-engine/src/rules/combat-hooks.ts,
  services/kingdom-tactics-engine/src/rules/default-combat-hooks.ts (+ .test.ts),
  services/kingdom-tactics-engine/src/rules/attack.ts (+ attack.test.ts)
- Verify: host engine tests — offensive attacker lands more / deals more; defensive defender avoids
  more / takes less; normal identical to pre-change; Brewmaster Drunken Monkey lowers dealt dmg. Green.

### [x] 3. Reducer: set-stance as a free minor action
- Do: `applySetStance` — legal iff token exists, `side===activeSide`, living, and stance legal for the
  unit's class; sets `token.stance`; does NOT touch hasMoved/hasActed/activatedTokenId and IGNORES the
  lock. Wire into `applyAction` switch. Do NOT add to `legalActions`. `build-match.ts` sets
  `stance:'normal'` on deployed units. (resetFlags unchanged — stance persists across turns.)
- Files: services/kingdom-tactics-engine/src/engine/game-engine.ts (+ game-engine.test.ts),
  services/kingdom-tactics-engine/src/setup/build-match.ts
- Verify: host — set-stance changes stance without consuming move/action or locking the side; can
  stance a second unit then still move/attack the first; enemy/other-side stance rejected; Brewmaster
  stance on a non-Brewmaster rejected. Engine suite green.

### [x] 4. Server: accept set-stance over the wire
- Do: Add 'set-stance' to `ACTION_TYPES` in net/protocol.ts. Confirm the gateway relays it to the
  reducer (it forwards validated Actions) and that combatHooks/combatRng already flow (they do).
- Files: services/kingdom-tactics-engine/src/net/protocol.ts (+ protocol test if present),
  apps/kingdom-tactics-server/src/ws/kt-gateway.ts (only if it filters action types)
- Verify: host — protocol guard accepts a set-stance action message; server suite green.

### [x] 5. Client: stance controls on the play field
- Do: In the arena UI, when the player selects one of their own living units on their turn, show its
  current stance + buttons for each legal stance (general + Brewmaster if applicable), dispatching a
  `set-stance` action through the existing useMatch/local + online paths. Reflect the stance on the
  unit (badge/label). Keep it minimal.
- Files: apps/kingdom-tactics-client/src/features/arena/ (component + hook; .annotated)
- Verify: client build + tests — selecting a unit shows stance controls; clicking Offensive dispatches
  set-stance and the unit shows Offensive; a Brewmaster shows its extra stances. Green.

### [x] 6. Docs + indexes + sign-off
- Do: A short `docs/STANCES.md` (the model, the table, free-minor-action economy, local-vs-online
  behavior, Brewmaster stances); ROADMAP note; refresh `.annotated` for touched dirs. Full host
  sign-off (engine/server/client).
- Files: apps/kingdom-tactics-client/docs/STANCES.md, apps/kingdom-tactics-client/docs/ROADMAP.md,
  (touched `.annotated` files)
- Verify: all three suites green; docs accurate.

## Out of scope (future)
- **AI stance use** — stances are omitted from `legalActions`, so policies ignore them; teaching the
  greedy/AI to posture is a later pass.
- **Sloshing true multi-attack** — modeled as a damage bonus in v1; a real extra-attack roll is future.
- **Drunken Monkey taunt/aggro** — the taunt (forcing target selection) isn't modeled; only its miss +
  damage effects are.
- **Squadron stances** — v1 stances are on individual Unit tokens; squadron aggregates stay normal.

## Progress log

- 2026-07-11 plan COMPLETE (all 6 steps). Stances landed end-to-end: `data/balance/stances.ts`
  (Normal/Offensive/Defensive + Brewmaster Drunken Monkey/Sloshing/Cripple; to-hit/evasion + dmg
  dealt/taken; normal all-zero no-op); optional `Unit.stance` + `SetStanceAction`; combat wiring
  (rollAvoidance avoidMod folded into dodge preserving 3 draws; resolveDamage dealt/taken mods;
  CombatContext attacker/defender stance; onAvoid net shift; both hooked + no-hooks damage paths);
  reducer `applySetStance` (free minor action — no economy, lock-exempt, own-side-only, class-gated,
  omitted from legalActions); build-match sets stance:'normal'; protocol allowlist + gateway relay
  (actingSideOf already resolves tokenId → side, no session change); client Arena stance panel
  (select own unit → legal stance buttons, dispatch). Docs STANCES.md + ROADMAP + .annotated. Sign-off
  engine 233/233, server 13/13, client 59/59. Owner clarifications folded in: free minor action, all
  own units re-stanceable, own-turn-only. Deferred: AI stance use, Sloshing true multi-attack, taunt
  aggro, squadron stances.
- 2026-07-11T16:00:00-05:00 plan created. Verified: combat hit = defender avoidance via CombatHooks
  (server-only; local play is deterministic auto-hit), so stances need damage mods (shared
  resolveDamage) to work locally + avoidance mods online; one-unit-per-turn lock (activatedTokenId)
  exists but set-stance is exempt (free minor action per owner); Brewmaster stances from Brewmaster.cs
  Notes; protocol ACTION_TYPES allowlist must gain 'set-stance'.
