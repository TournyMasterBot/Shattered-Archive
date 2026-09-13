# Plan: Auto-leveling Combat step — vitals gates, round-aware toggles, Rest step, queue hygiene

Created: 2026-09-12T16:29:00Z · Workspace: /workspace/shattered-archive · Status: ACTIVE
Task: Extend the auto-leveling wizard's Combat step (and add a new Rest step) with
vitals-percentage gating on buffs/fight commands, once-per-fight/once-per-round toggles,
a Rest step for in/out-of-combat recovery, a command-queue clear on exiting combat, and
self-tuning per-ability cooldowns when the engine detects a command is queueing.

**Companion plans — read together:** `.ai-plans/20260909-0739-autoleveling-redesign.md` is the
original wizard plan (12/13 steps done; its own step 13, a live DSL play-test, is what this
plan's work was spec'd DURING). This plan builds directly on top of that one's output (same
wizard, same engine) rather than replacing any of it. `.ai-plans/20260913-0100-autoleveling-
ability-picker-fix.md` is a separate, concurrent plan ALSO editing `CombatStep.tsx` (buff/fight
picker correctness — cross-class spell leakage, missing songs, searchable/alphabetized
dropdowns) — unrelated in substance to this plan's weight/hot-swap work but the same file.
Before making further changes under ANY of these, check the others' Progress logs for anything
dated after your own plan's last entry — they're being developed concurrently against the same
files.

## Goal
A player can: gate any buff or fight command on HP/MP/MV being above or below a percentage
threshold (read from GMCP char_data, already tracked in `AutoLevelingEngine.charVitals`);
mark a buff/fight command "once per fight" or "once per round" (round = a burst of damage
lines with no ~1s gap, mirroring DslLogViewer's proven `ROUND_GAP_MS` heuristic); configure
a new Rest wizard step (end-of-round rest/sleep/camp, start-of-round wake/stand, and
during-round HP/MP/MV-threshold-triggered rest-to-recovery, all gated to run only when NOT
fighting); have the engine send `~` to clear the input queue right after combat ends and
before the next look/move; and have the engine notice when a fight command is being sent
faster than its real in-game lag allows, bump its cooldown automatically, and remember that
per-ability so it's pre-filled next time. Done when all five behaviors work in a live DSL
session and the existing wizard test suite + tsc stay green.

**2026-09-13 scope addition (2 more behaviors, added after the original 8 implementation
steps + docs refresh were already done):** a new Weight wizard step (before Review) that
gates a configurable drop-silver/gold-style command sequence on a carry-weight percentage
(the same %-of-max pattern as the HP/MP/MV vitals gate, just off `carry_weight`/
`can_carry_weight` instead); and live-editing of the running engine without a full
stop/restart — fight-commands, rest during-round rules, and the new weight rule apply
instantly (those code paths already re-fetch config per-call), while targets, buffs, and
the route/rest-start-end-of-round commands apply via the existing pause→edit→resume cycle
(step 8's infra), refreshed on resume rather than left stale for the rest of the run.

## Constraints
- pnpm via Corepack only; `--frozen-lockfile`; never mutate node_modules from the qwen container.
- No C# involved in this plan — everything lives in `apps/game-client`.
- User says "skill, spell, song, ability" interchangeably here — all map to one `ability`
  concept in code; don't introduce separate types per ability class.
- Round detection must reuse the DslLogViewer-proven gap heuristic
  (`ROUND_GAP_MS = 1000`, `FIVE_MIN_MS` = fight boundary) rather than inventing a new one —
  see `C:/Projects/DslLogViewer/dsl-log-viewer/src/components/LogPlayback.tsx:47-49`.
- Reuse `combat-compression.plugin.ts`'s exported `DAMAGE_LINE_PATTERN` to detect damage
  lines for round-boundary timing — don't re-derive the regex.
- Vitals gates and once-per-X toggles are ADDITIVE to `BuffRow`/`FightRow` — don't break the
  existing affect/refreshTicks/cooldownSec fields or current persisted user-data records
  (new fields must be optional so old saved rows still parse).
- Rest actions must never fire while `this.isFighting` — evaluate/enqueue them only in the
  out-of-combat path of the round loop.
- The `~` queue-clear must be conditional, not unconditional — only send it when step 3's
  queue-buildup detector actually fired during that encounter. Steps 4 and 5 share ONE detector
  (built in step 3): commands sent vs. rounds observed during the fight, both overall (step 4)
  and per fight-command (step 5) — don't build two separate heuristics.
- Both the queue detector and the auto-tuned-cooldown learning are judgment-heavy — no existing
  precedent for either in this codebase, so plan for iteration once live-tested.
- Screenshot/interactive review at each UI-facing step (Combat step changes, new Rest step),
  same pattern as the original wizard plan.
- Weight gate is intentionally ONE rule (enabled + threshold% + one command sequence), not an
  array like Rest's `duringRound` — the user's ask was singular ("a weight percentage", "a
  command sequence"). Don't generalize to multiple thresholds unless asked.
- `AutoLevelingEngine.start()` deliberately snapshots config ONCE per run (`// single
  consistent cfg`, autoleveling-engine.ts:1081) — do NOT refactor the round loop to re-fetch
  config every round. Only the fight loop and `checkDuringRoundRest`/`checkWeightGate` (which
  already do their own per-call `this.deps.getConfig()`) get live edits with no pause. Targets/
  buffs/route/rest-start-end-of-round stay on the frozen snapshot for the run except at an
  explicit resume-from-pause refresh point (new work, not a blanket re-fetch).
- Refresh `.ai-context`/`.annotated`/`@ai-` headers in touched dirs after edits (host edits
  don't auto-refresh).

## Context
- `apps/game-client/src/features/autoleveling/autoleveling-user-data.ts:36-67` — `BuffRow`
  (label, cmd, affect?, refreshTicks?, inCombatCmd?, holdNearLevel?) and `FightRow` (cmd,
  cooldownSec) — the two row types this plan extends.
- `apps/game-client/src/features/autoleveling/autoleveling-engine.ts`:
  - `:496-507` `onCharDataVitals` — already tracks `this.charVitals = {hp,hpMax,mp,mpMax,mv,mvMax}`
    from GMCP char_data on every update. Vitals gates read this directly, no new plumbing needed.
  - `:1523-1586` `engageTarget`, `:1674-1770` the fight loop (fight.pre/exec/post, postFight) —
    where vitals-gated + once-per-X action filtering plugs in (extend `runActions`/`execAction`).
  - `:866-1020` `runLoop` — main round loop (start → movement loop → reset.endRound → wait →
    loop). The `~` queue-clear goes right after a fight ends / before the next non-move step
    that isn't itself a fight action; the Rest step's during-round check and end/start-of-round
    actions plug into this loop too.
  - `:100-111` — `dbg`/`warn` (already fixed this session, no longer dead code — use them
    liberally when building the round tracker and auto-tune heuristic, both hard to get right
    on the first pass).
- `apps/game-client/src/components/wizard/CombatStep.tsx` — current buff/fight-command UI
  (catalog pickers, gate radio buttons for buffs). Add vitals-gate + once-per-X controls here.
- `apps/game-client/src/components/AutoLevelingWizard.tsx:68-74` `STEPS` array — the 5-step
  stepper (area/targets/combat/review/start). Rest step is inserted as step 4, after combat,
  before review (`id: 'rest'`).
- `apps/game-client/src/features/plugins/core-plugins/combat-compression.plugin.ts:667`
  `DAMAGE_LINE_PATTERN` — exported verified regex for a damage line (any hit/miss/kill-tier
  verb). Reuse via `new RegExp(DAMAGE_LINE_PATTERN, 'm')` for round-boundary timing instead of
  re-deriving from scratch.
- `C:/Projects/DslLogViewer/dsl-log-viewer/src/components/LogPlayback.tsx:47-49,341-361` —
  proven round/fight boundary constants and flush logic
  (`ROUND_GAP_MS=1000`, `FIVE_MIN_MS`, gap-since-last-damage-event flush). Port the CONCEPT
  (gap-based boundary), not the xterm-rendering code around it.
- `apps/game-client/src/features/autoleveling/autoleveling-user-data.ts` — `getBuffOverlay`/
  `getFightOverlay` (per area+class IndexedDB overlay) is the precedent for where a NEW
  per-ability-name auto-tuned-cooldown store should live (keyed by ability name, not area —
  lag is a property of the spell/skill itself, not where you're standing).
- `apps/game-client/src/hooks/useRightPaneHud.ts:61-84` `applyVitalsPatch` — the other place
  hp/mp/stamina percentages are already computed from GMCP char_data, for reference on field
  names (`hp`/`max_hp`/`mana`/`max_mana`/`move`/`max_move`).
- `apps/game-client/src/features/autoleveling/autoleveling-engine.ts`:
  - `:477-483` `boundOnFlee` — already calls `this.pause()` unconditionally on
    `event:flee:success`/`event:flee:failed`. Pre-dates this plan's rest-cycle work; not yet
    verified against it.
  - `:1279-1296` `runActions()` — the ONE place any action is actually sent; already calls
    `waitWhilePausedOrStopped()` before EVERY action (:1285). `rest.startOfRound`/`rest.endOfRound`
    (both routed through `runActions`, e.g. from `checkDuringRoundRest` and the round-loop top at
    `:1111`) already correctly refuse to fire while paused — no gap there.
  - `:590-601` `waitForRecovery` (added by step 6) — the ONE exception: a passive vitals-poll loop
    (no commands sent) that checks only `this.stopping`, never `this.paused`. Today a pause mid-wait
    doesn't stop it from silently ticking toward its own timeout in the background and reporting
    "gave up" once it expires — the rest cycle should instead fully suspend and resume waiting for
    the real recovery condition once unpaused, per the user's "don't fight my control" ask.
  - `:982-995` `pause()`/`resume()` — `resume()` is a bare flag flip; nothing re-syncs state before
    the loop continues.
  - `:1001-1021` `rescanRoom()` — existing public "send identify/look" helper (UI-triggered
    sightsee rescan); its send logic is the natural thing to reuse for a resume resync rather than
    inventing a second one.
  - `:1255-1260` `waitWhilePausedOrStopped()` — the ONE shared choke point all 5 pause-wait call
    sites (`:1122`, `:1285`, `:1857`, `:1964`, `:2008`) go through; the right place to hook a
    resume resync so every call site gets it for free.
- `apps/game-client/src/hooks/useAutoLeveling.ts:240-260` — existing manual pause/resume UI hook
  (`eng.pause()`/`eng.resume()`), separate from the flee-triggered pause but sharing the same
  engine methods — a resume resync built into `waitWhilePausedOrStopped()` covers both for free.

- **Weight/GMCP:** confirmed live in a real session log —
  `C:/Projects/DSL/Books/Melchaleve/Story Notes/Seeking the Sanctum/Sanctum-Stories/Mastery of
  Blood/2026-09-07_Telthian-Melchaleve-Duel.jsonl:83` — `char_data` already carries
  `carry_weight`/`can_carry_weight` (also `gold`/`silver`) alongside hp/mana/move. NOT yet
  extracted anywhere: `autoleveling-engine.ts:340` `charVitals` only has hp/mp/mv;
  `useRightPaneHud.ts`'s `applyVitalsPatch` doesn't track weight either. Add
  `carryWeight`/`carryWeightMax` to `charVitals` in `onCharDataVitals` (:545-556), same pattern
  as the existing three fields.
- `apps/game-client/src/features/autoleveling/autoleveling-engine.ts:631-645`
  `checkDuringRoundRest` — out-of-combat-only check called from the round loop at `:1169`
  (`await this.checkDuringRoundRest(round);`, right before each movement step). The new
  `checkWeightGate(round)` belongs right alongside this call. Unlike rest, dropping items is
  instant — no `waitForRecovery`-style poll loop needed, just an edge-triggered "already fired
  since last time weight was below threshold" flag so it doesn't resend the drop sequence on
  every check while still overweight.
- `apps/game-client/src/features/autoleveling/autoleveling-types.ts:226-243`
  `AutoLevelRestDuringRoundRule`/`AutoLevelRestConfig` — the shape to mirror (loosely) for a new
  `AutoLevelWeightConfig` on `AutoLevelConfig` (`:245`), and `autoleveling-wizard-config.ts`'s
  `parseRestCommands` (semicolon-separated command text, same convention as
  `restStartOfRound`/`restEndOfRound`) — reuse for the weight rule's command sequence field.
- **Config hot-swap plumbing (already exists, no engine change needed for the parts that use
  it):** `useAutoLeveling.ts:166-167` wires `getConfig: () => configRef.current`, and a
  `useEffect` keeps `configRef.current = config` in sync with the hook's `config` state/prop —
  so ANY method that calls `this.deps.getConfig()` itself (fresh per invocation) already sees a
  live edit. Confirmed fresh-per-call sites: the fight loop (`steps.fight.pre/exec`,
  `autoleveling-engine.ts:2078` area) and `checkDuringRoundRest` (`:633`) — Combat fight-commands
  and Rest during-round rules (and the new weight gate, same call-site pattern) are ALREADY
  hot-swappable once the wizard-side gate below is relaxed for them specifically.
- **The gate to relax, narrowly:** `AutoLevelingWizard.tsx:171-175` — a `useEffect` that calls
  `setConfig(draftToConfig(draft))` but ONLY when `step.id === 'start' && !isRunning`, which is
  why no live edit reaches the engine today. Add an explicit "Apply changes" action (not a
  continuous auto-sync — avoid pushing a config update mid-keystroke) reachable from the
  Combat/Rest/Weight steps while `isRunning`, calling the same `setConfig(draftToConfig(draft))`.
- **What does NOT hot-swap this way, and why:** `autoleveling-engine.ts:1081-1082`
  (`const cfg = this.deps.getConfig(); // single consistent cfg`) is fetched ONCE in `start()`
  and reused as-is by the round loop for `steps.start`, `steps.move.pre/post`, `steps.reset.*`,
  `rest.startOfRound/endOfRound` (as called from the loop top, distinct from
  `checkDuringRoundRest`'s own internal fresh fetch of the same two lists), and — the one with
  no read-through at all — `this.targets` (`:1130`, normalized ONCE from `cfg.init.targets` and
  never re-derived; contrast `this.trainingPathSteps`, which DOES get re-split from
  `cfg.init.trainingPath` each time the route loops back to the start, `:1104` and `:1276`).
  These stay on the frozen snapshot for the whole run — deliberately not refactored into a
  per-round re-fetch (see Constraints) — and instead get refreshed at an explicit resume-from-
  pause point (new step), extending step 8's `resyncAfterResume()`/`waitWhilePausedOrStopped()`
  machinery rather than building a second pause mechanism.

## Steps

### [x] 1. Vitals-gate data model + engine evaluation
- Do: Add an optional `vitalsGate?: { stat: 'hp' | 'mp' | 'mv'; op: 'above' | 'below'; pct: number }`
  to both `BuffRow` and `FightRow` in autoleveling-user-data.ts. In autoleveling-engine.ts, add a
  `private vitalsGateSatisfied(g?: VitalsGate): boolean` using `this.charVitals` (pct = current/max
  * 100; missing/zero max → treat gate as satisfied, never block on absent data). Wire it into
  wherever buff (`steps.start.pre`, critical-buff in-combat cmd) and fight-command actions are
  about to fire — skip silently (like the existing `if_affect_missing`/tick gates) when unsatisfied.
- Files: apps/game-client/src/features/autoleveling/autoleveling-user-data.ts
  apps/game-client/src/features/autoleveling/autoleveling-engine.ts
  apps/game-client/src/features/autoleveling/autoleveling-wizard-config.ts (draftToConfig mapping)
- Verify: new unit tests in autoleveling-engine.test.ts (or a focused new test file) — gate
  satisfied/unsatisfied for each stat × op combo, and the "no max data yet → don't block" case;
  `pnpm --filter game-client test` + `tsc` green.

### [x] 2. Combat step UI for vitals gates
- Do: Add a small gate control to each buff card and fight-command row in CombatStep.tsx — a
  stat dropdown (HP/MP/Stamina), above/below toggle, percentage number input, all optional
  (default: no gate). Reflect current char vitals nearby (e.g. "you: 62% hp") if easily available
  from the existing hook, purely as a hint.
- Files: apps/game-client/src/components/wizard/CombatStep.tsx
  apps/game-client/src/styles/AutoLevelingWizard.module.scss
- Verify: screenshot review (Playwright, autoleveling.mjs or a new script) showing the gate
  controls on a buff and a fight command; `tsc` green.

### [x] 3. Round-boundary tracking + once-per-fight / once-per-round toggles
- Do: Port the DslLogViewer gap heuristic into the engine as a small private tracker: listen for
  damage lines (reuse `DAMAGE_LINE_PATTERN`), stamp `lastDamageTs`; a "round" ends when
  ROUND_GAP_MS (1000ms) elapses with no new damage line while still fighting; a "fight" ends when
  `isFighting` goes false (already tracked) — reset per-fight firing memory then. Add
  `onceKey?: 'fight' | 'round'` to BuffRow/FightRow; before firing such an action, check + record
  a Set of "already fired this fight/round" keys (ability cmd string), clearing the round-set on
  each new round boundary and the fight-set on encounter end.
  Also build the queue-buildup detector steps 4 and 5 both need here, since it rides on the same
  round tracker: per encounter, count `roundsObserved` (round-boundary events, from the gap
  tracker above) and `commandsSent` (every buff/fight-command send while fighting — pre-round
  buffs, fight.exec, critical-buff in-combat casts, all of it). If `commandsSent > roundsObserved`
  at any point, more commands have been sent than the server can plausibly have finished
  processing (merc-derived combat only executes ~1 lag-consuming action per real round/pulse) —
  expose this as `private hasQueueBuildup(): boolean` on the engine. Also track it per-command
  (same cmd string sent again before a new round boundary was observed since its last send) for
  step 5's per-ability granularity.
- Files: apps/game-client/src/features/autoleveling/autoleveling-engine.ts
  apps/game-client/src/features/autoleveling/autoleveling-user-data.ts
  apps/game-client/src/components/wizard/CombatStep.tsx (toggle UI: off / once per round / once per fight)
- Verify: unit tests simulating a burst of damage-line events with/without >1s gaps, asserting
  round vs. fight boundaries fire at the right points, the once-per-X gate respects them, and
  `hasQueueBuildup()` flips true once sends outpace observed rounds and resets per encounter;
  `pnpm --filter game-client test` + `tsc` green.

### [x] 4. Command-queue clear (`~`) leaving combat — only when a queue actually built up
- Do: In the main round loop, right after a fight fully ends (fight.post / postFight.buffs /
  postFight triplet all run) and before the loop returns to sending movement/look commands, send
  a bare `~` (DSL's clear-input-queue command) — but ONLY if step 3's `hasQueueBuildup()` was true
  at any point during that encounter (checked once, right before this point, then reset for the
  next encounter). A clean fight where sends never outpaced rounds sends nothing extra.
- Files: apps/game-client/src/features/autoleveling/autoleveling-engine.ts
- Verify: unit tests — `sendCommand('~')` fires when the encounter's simulated sends outpaced
  observed rounds, and is skipped (not called at all) for a clean 1-send-per-round encounter;
  live smoke-test alongside step 5 or 6.

### [x] 5. Auto-tuned fight-command cooldown (queue-buildup detection + persisted learning)
- Do: Using step 3's per-command queue-buildup signal (the same cmd string sent again before a
  new round boundary was observed since its last send), bump that fight-command's `cooldownSec`
  by a fixed increment (e.g. +0.5s) each time it re-triggers the signal; persist the learned value
  in a NEW per-ability store in autoleveling-user-data.ts (keyed by ability/command name, not
  per-area — lag is a property of the spell/skill, not where you're standing), and have the Combat
  step's fight-ability picker pre-fill `cooldownSec` from it when the same ability is added again
  (any area, any character).
- Files: apps/game-client/src/features/autoleveling/autoleveling-engine.ts
  apps/game-client/src/features/autoleveling/autoleveling-user-data.ts
  apps/game-client/src/components/wizard/CombatStep.tsx
- Verify: unit tests for the per-command bump + persistence round-trip; live smoke-test with a
  deliberately-too-fast cooldown on a real ability, confirm it climbs and is remembered next time
  the wizard is reopened. This step is the least certain of the five — expect to iterate on the
  increment size/thresholds after a live test, and update this doc's Progress log with what
  changed and why.

### [x] 6. Rest wizard step — data model + engine wiring
- Do: Add a `rest` section to `AutoLevelConfig`: `endOfRound: AutoLevelAction[]` (e.g. rest/sleep/
  camp, runs at the same point as today's `steps.reset.endRound`), `startOfRound: AutoLevelAction[]`
  (wake/stand, runs at the top of `steps.start`, before pre-round buffs), and
  `duringRound: { hp?: number; mp?: number; mv?: number; recoverTo: { hp?: number; mp?: number; mv?: number } }[]`
  — thresholds checked ONLY when `!this.isFighting` (e.g. once per movement step or on a light
  poll), triggering a rest/sleep sequence and a wait-until-recovered-to-X% loop, out of combat only.
- Files: apps/game-client/src/features/autoleveling/autoleveling-types.ts
  apps/game-client/src/features/autoleveling/autoleveling-engine.ts
  apps/game-client/src/features/autoleveling/autoleveling-defaults.ts
  apps/game-client/src/features/autoleveling/autoleveling-wizard-config.ts
- Verify: unit tests — during-round threshold fires only out of combat, waits for the configured
  recovery percentages, start/end-of-round actions land in the right spots in a dry-run config
  trace; `pnpm --filter game-client test` + `tsc` green.

### [x] 7. Rest wizard step — UI
- Do: New `RestStep.tsx` (area/targets/combat/**rest**/review/start — 6 steps now) with three
  sections mirroring step 6's data model: end-of-round command, start-of-round command, and a
  repeatable during-round threshold row (HP/MP/MV % triggers + recover-to targets). Wire into
  `useWizardDraft`, `draftToConfig`, the `STEPS` array, and add a Rest summary row to ReviewStep.
- Files: apps/game-client/src/components/wizard/RestStep.tsx (new)
  apps/game-client/src/components/AutoLevelingWizard.tsx
  apps/game-client/src/components/wizard/useWizardDraft.ts
  apps/game-client/src/components/wizard/ReviewStep.tsx
  apps/game-client/src/features/autoleveling/autoleveling-wizard-config.ts
  apps/game-client/src/styles/AutoLevelingWizard.module.scss
- Verify: screenshot review of the new step; Review step shows the rest plan; `tsc` green,
  `pnpm --filter game-client test` green.

### [x] 8. Flee-pause hardening + look-first resume resync
- Do: `boundOnFlee` (:477-483) already pauses unconditionally on flee success/failure, and every
  actual command send already refuses to fire while paused via `runActions()`'s per-action
  `waitWhilePausedOrStopped()` gate (:1279-1296) — confirm that holds (it does, by inspection: fight
  commands, `rest.startOfRound`/`rest.endOfRound`, `steps.start`, all route through `runActions`).
  **Don't add any new action-taking to the rest loop while paused — the fix here is the opposite:
  stop it from taking its OWN action (silently expiring) while the player has manual control.**
  `waitForRecovery` (:590-601) is the one place that isn't already safe: its poll loop only checks
  `this.stopping`, so a pause mid-recovery-wait doesn't suspend it — it keeps silently polling
  toward its own timeout and can report "gave up" while the player is mid-flee and not even
  watching it. Fix: when the poll loop sees `this.paused`, take no action and don't advance the
  timeout clock — `await this.waitWhilePausedOrStopped()` right there, track the paused duration and
  subtract it from elapsed time, then go back to polling the ACTUAL recovery condition once
  unpaused. The rest loop must never treat a pause as "finished" or "abandoned" — it resumes exactly
  where it left off, only when the player unpauses (or the whole run is stopped/restarted, which
  already correctly tears everything down via `this.stopping`). Then build the resume resync:
  extract `rescanRoom()`'s send-identify-or-bare-look logic (:1001-1021) into a shared private
  helper, and call it from `waitWhilePausedOrStopped()` (:1255-1260) whenever it detects the loop
  was actually blocked on a pause (capture `wasPaused = this.paused` before the wait's while-loop,
  check it after) — send the look/identify commands, then `await this.delayMs(cfg.lookSettleMs)`
  (reuse the existing settle constant, don't invent a new one) before returning control. Because
  `waitWhilePausedOrStopped()` is the single choke point behind all 5 existing call sites AND (after
  this step) `waitForRecovery`'s own wait, this makes EVERY resume — flee-triggered, the existing
  manual pause/resume button (`useAutoLeveling.ts:240-260`), or a paused rest-recovery wait —
  re-establish state with a fresh look and then continue EXACTLY the subsystem that was paused
  (movement loop, fight loop, or the rest wait), never a restart from scratch and never an
  autonomous action taken on the player's behalf while paused.
- Files: apps/game-client/src/features/autoleveling/autoleveling-engine.ts
- Verify: new unit tests — `waitForRecovery` takes no action and its timeout does not advance while
  `this.paused` is true, then resumes polling the real recovery condition (not an immediate
  give-up) once unpaused; `waitWhilePausedOrStopped()` fires the identify/look commands and waits
  `lookSettleMs` only when actually transitioning out of a pause (not a same-tick call while never
  paused); `boundOnFlee` still pauses on both flee success and failure events;
  `pnpm --filter game-client test` + `tsc` green.

### [x] 9. Weight-gate data model + engine evaluation
- Do: Add `carryWeight`/`carryWeightMax` to `AutoLevelingEngine.charVitals` and populate them in
  `onCharDataVitals` from `d.carry_weight`/`d.can_carry_weight` (same pattern as hp/mp/mv,
  `:545-556`). Add `AutoLevelWeightConfig = { enabled: boolean; atOrAbovePct: number; commands:
  string }` (ONE rule, per Constraints) to autoleveling-types.ts and a required `weight` field on
  `AutoLevelConfig` (default `{enabled:false, atOrAbovePct:90, commands:''}` in
  createDefaultAutoLevelConfig, mirroring how `rest` was defaulted in step 6 — confirm tsc stays
  clean at every other `AutoLevelConfig` construction site the same way that step did). Engine:
  a `weightPct()` helper (mirrors `vitalsPct`), and `private async checkWeightGate(round):
  Promise<void>` — out-of-combat only (`if (this.stopping || this.isFighting) return`, matching
  `checkDuringRoundRest`), fetches config fresh via `this.deps.getConfig()` (own per-call fetch,
  not the frozen `cfg` — this is what makes it hot-swappable later), fires
  `runActions(parseRestCommands(cfg.weight.commands), 'weight.drop', round)` once when
  `weightPct() >= cfg.weight.atOrAbovePct` and a `weightGateFired` flag isn't already set; clears
  the flag once `weightPct()` drops back below the threshold so it can fire again next time. Call
  it from the round loop right alongside `checkDuringRoundRest(round)` at `:1169`. `coerceConfig`
  in autoleveling-storage.ts should backfill `weight` for pre-existing saved configs the same way
  it already does for `rest` — verify, don't assume.
- Files: apps/game-client/src/features/autoleveling/autoleveling-types.ts
  apps/game-client/src/features/autoleveling/autoleveling-engine.ts
  apps/game-client/src/features/autoleveling/autoleveling-defaults.ts
  apps/game-client/src/features/autoleveling/autoleveling-wizard-config.ts
- Verify: unit tests — weight% computed correctly from carry_weight/can_carry_weight (incl. the
  missing-data-never-blocks convention other gates use... actually weight should default to NOT
  firing when data is absent, i.e. treat as under threshold, not "always fires"); fires once at
  threshold crossing, not on every subsequent check while still over; never fires while
  `isFighting`; resets and can re-fire after dropping back under threshold; `pnpm --filter
  game-client test` + `tsc` green.

### [x] 10. Weight wizard step — UI
- Do: New `WeightStep.tsx` (area/targets/combat/rest/**weight**/review/start — 7 steps now):
  an enabled toggle, a threshold percentage input, and a command-sequence text field
  (semicolon-separated, same convention/placeholder style as Rest's start/end-of-round fields —
  reuse the same input component if RestStep.tsx factored one out). Wire into `useWizardDraft`
  (`weightEnabled`/`weightAtOrAbovePct`/`weightCommands`), `draftToConfig` (parse via the same
  `parseRestCommands` splitter), the `STEPS` array in AutoLevelingWizard.tsx, and a Weight summary
  row on ReviewStep ("drop gold/silver at 90% carry weight: `drop gold;drop silver`", or "off").
- Files: apps/game-client/src/components/wizard/WeightStep.tsx (new)
  apps/game-client/src/components/AutoLevelingWizard.tsx
  apps/game-client/src/components/wizard/useWizardDraft.ts
  apps/game-client/src/components/wizard/ReviewStep.tsx
  apps/game-client/src/features/autoleveling/autoleveling-wizard-config.ts
- Verify: screenshot review of the new step and its Review summary; `tsc` green,
  `pnpm --filter game-client test` green.

### [x] 11. Live-apply for Combat fight-commands / Rest during-round / Weight (no pause needed)
- Do: These three already read config fresh per-call (step 9 built weight the same way), so no
  engine change here — purely wiring the wizard-side gate open for them specifically. Add an
  explicit "Apply live changes" button (not a continuous auto-sync — avoid pushing config
  mid-keystroke) visible on the Combat, Rest, and Weight step panels only when `isRunning`
  (AutoLevelingWizard.tsx), calling the same `setConfig(draftToConfig(draft))` the existing
  Start-step effect (`:171-175`) already uses when idle. Since `draftToConfig` rebuilds the WHOLE
  config from the WHOLE draft, hitting Apply from any of these three pushes everything currently
  in the draft — including any not-yet-committed target/buff/route edits sitting on other steps;
  accept that (documented in Constraints' spirit — this is a single shared draft, not per-field
  staging) rather than building field-level staging.
- Files: apps/game-client/src/components/AutoLevelingWizard.tsx
  apps/game-client/src/components/wizard/CombatStep.tsx
  apps/game-client/src/components/wizard/RestStep.tsx
  apps/game-client/src/components/wizard/WeightStep.tsx
- Verify: a live-run test harness (or manual/screenshot check) confirming `setConfig` while
  `isRunning` actually reaches a running engine's next fight-loop tick / `checkDuringRoundRest` /
  `checkWeightGate` call — these are the three paths step 9's Context confirmed already fetch
  config fresh; `tsc` green, `pnpm --filter game-client test` green. Live-verify alongside step 13
  — confirming an edit actually changes behavior mid-run without a stop/restart is hard to fully
  fake in a unit test.

### [x] 12. Pause-to-edit resync for Targets / Buffs / Route / Rest start-end-of-round
- Do: These sit on the `cfg` snapshot frozen once in `start()` (`:1081-1082`) and are NOT
  refactored into a per-round re-fetch (Constraints). Instead, extend step 8's resume machinery:
  turn the local `cfg` in `runLoop`/`start()` into an instance field (`this.cfg`, set once in
  `start()`, referenced everywhere `cfg.` currently is inside the round loop) so it CAN be
  reassigned later without threading a new parameter through every method. Add a
  `private refreshRunSnapshot()` that does `this.cfg = this.deps.getConfig();` and re-runs the
  targets normalization block (`:1130-1135`, extract into a `private refreshTargets(cfg)` helper
  called from both `start()`'s initial setup and here). Call `refreshRunSnapshot()` from
  `waitWhilePausedOrStopped()` (`:1255-1260`) at the SAME point step 8 added `resyncAfterResume()`
  — i.e. only on an actual pause→resume transition, right alongside the existing look/identify
  resync, so editing targets/buffs/route while paused and hitting Resume both re-syncs room state
  AND picks up the new config in one action. `this.trainingPathSteps` is untouched (already
  re-derives from `cfg.init.trainingPath` on its own each lap, per Context).
- Files: apps/game-client/src/features/autoleveling/autoleveling-engine.ts
  apps/game-client/src/components/AutoLevelingWizard.tsx (surface a "Pause to edit" hint on
  Targets/Combat-buffs-section/Rest-start-end-section while running, if not already obvious from
  the existing Pause button)
- Verify: unit tests — `refreshRunSnapshot()` updates `this.targets` and subsequent
  `steps.start`/`steps.move.*`/`rest.startOfRound`/`rest.endOfRound` reads to a NEW config value
  after a pause→resume cycle, but NOT while still running unpaused (no mid-round surprise
  change); a target added mid-run only becomes engageable after pause+resume, not immediately;
  `pnpm --filter game-client test` + `tsc` green.

### [ ] 13. Live play-test + docs refresh
- Do: With the flag on and a real DSL connection, exercise: a vitals-gated buff/fight command
  actually skipping when the threshold isn't met; a once-per-round/once-per-fight ability firing
  only as configured across a multi-round fight; the `~` queue-clear landing right after a fight;
  a deliberately-fast cooldown climbing and being remembered; the Rest step's start/end/during-
  round actions firing only out of combat; a flee triggered mid-fight pausing the run, and resuming
  it triggers a fresh look/identify scan before the round loop picks back up in the right place;
  the weight gate firing its drop sequence once at threshold and not spamming it while still
  overweight; editing a fight-command/rest-rule/weight-rule while RUNNING and confirming it takes
  effect without stopping; editing a target/buff/route entry, pausing, resuming, and confirming
  THAT takes effect (and does NOT take effect before the pause/resume). Fix whatever breaks.
  Refresh `.annotated`/`.ai-context`/`@ai-` headers for touched dirs; regenerate `.flows` for
  `components/wizard/` and `features/autoleveling/`.
- Files: (whatever step 1-12 touched, plus index files)
- Verify: a recorded clean run exercising all eight behaviors; full `pnpm --filter game-client
  test` + `tsc` green; committed showcase screenshots if this plan's UI steps warrant them.

## Progress log

- 2026-09-12T16:29:00Z plan created — user spec'd all five behaviors in one message (vitals
  gates, once-per-fight/round, Rest step, queue-clear, auto-tuned cooldown learning) after the
  original autoleveling-redesign plan's step 13 was mid-play-test. Given the size (5 largely
  independent subsystems), broke it into its own plan rather than folding into the near-complete
  original one. Round-boundary approach grounded in DslLogViewer's existing, proven
  `ROUND_GAP_MS`/`FIVE_MIN_MS` gap heuristic per the user's own pointer to that project. Steps 1-4
  and 6-7 are well-scoped; step 5 (auto-tuned cooldown) is flagged as the least certain — the
  detection heuristic will likely need iteration after a live test.

- 2026-09-12T16:45:00Z plan revised — user clarified step 4's `~` should only fire when a real
  queue built up ("combat commands that may stack up if they are sent too quickly"), not
  unconditionally every fight. Rather than building a separate detector for that, merged it into
  step 3: the round tracker now also counts commands-sent vs. rounds-observed per encounter
  (`hasQueueBuildup()`) and per fight-command, so steps 4 and 5 both consume ONE shared signal
  instead of inventing their own. Steps 3-5 rewritten accordingly.

- 2026-09-12T17:00:00Z step 1 done — checked `[x]`. Added `AutoLevelVitalsGate`
  ({stat: hp|mp|mv, op: above|below, pct}) as an optional field on the `send`/`send_cooldown`/
  `send_every_ticks`/`if_affect_missing` AutoLevelAction variants (autoleveling-types.ts), added
  the matching optional `vitalsGate` field to `BuffRow`/`FightRow` (autoleveling-user-data.ts),
  wired `buffToStartAction`/`fightRowToAction` to copy it through (autoleveling-wizard-config.ts),
  and added `AutoLevelingEngine.vitalsGateSatisfied()` + a single check at the top of `execAction`
  (before the kind switch) so it composes with any action kind rather than needing per-kind
  duplication — missing/zero max-vitals data never blocks, same 100-fallback convention the
  pre-existing if_hp_pct_below-style kinds already used. Left those older single-purpose kinds
  and `AutoLevelCriticalBuff.inCombatCmd` untouched (out of scope — the user's ask was BuffRow/
  FightRow specifically). 4 new tests (below/above/missing-data/composes-with-cooldown);
  316/316 total tests + tsc green.

- 2026-09-12T17:15:00Z step 2 done — checked `[x]`. Added a shared `VitalsGateControl`
  (checkbox + stat dropdown + below/above segmented toggle + percentage input) to
  CombatStep.tsx, reusing the existing `.gateBar` styling rather than adding new CSS. Wired
  into each buff card (after the affect-gate extras) via `updateBuff(i, {vitalsGate})`.
  Restructured each fight-command row from a bare `.editorRow` into a `.buffCard` wrapper so
  the gate control has room on its own line below the command/cooldown row, wired via
  `updateFight(i, {vitalsGate})`. Screenshot-verified live against the running dev server
  (Cleric class, "Cure Critical" buff gated HP below 80%, "gore" fight command gated Stamina
  above 80% — both examples from the user's own spec) — both render and toggle correctly;
  screenshots not committed (ad hoc scratch script, deleted after use, not the permanent
  autoleveling.mjs harness). tsc + 316/316 tests green (no new tests needed — this step is
  pure UI wiring onto the already-tested engine behavior from step 1).

- 2026-09-12T17:35:00Z step 3 done — checked `[x]`. Added `AutoLevelOnceKey` ('fight'|'round')
  to the same 4 AutoLevelAction variants as vitalsGate, plus matching `onceKey` fields on
  BuffRow/FightRow, wired through draftToConfig. Engine: `trackRoundBoundary()` feeds every raw
  terminal line through the shared `DAMAGE_LINE_PATTERN` (imported from
  combat-compression.plugin.ts) and debounces a `setTimeout(ROUND_GAP_MS=1000)` per damage line
  — the round boundary fires when 1s passes with no new one, verified the real exported pattern
  against actual game lines via tsx first (my hand-derived samples initially failed only because
  of a regex-extraction bug in my OWN throwaway verification script, not the real pattern).
  `onceGateAllows()` is called at the point of actual sending in all 4 relevant execAction cases
  (send/send_cooldown/send_every_ticks/if_affect_missing) — deliberately AFTER each action's own
  gate decides to fire, so a skipped send never consumes the once-per-X slot. `sendCommand()`
  increments `commandsSentThisEncounter` whenever `isFighting` is true (the single choke point
  all sends go through, so this needed no extra call sites). `send_cooldown` also tracks
  per-command re-fires within the same round into `commandsWithQueueBuildup` (step 5 will
  consume this). All counters reset together in `resetEncounterTracking()`, called from
  `setIsFighting` on the false->true transition (a new encounter starting). Added
  `OnceGateControl` (no limit / once per round / once per fight) to CombatStep.tsx next to the
  vitals gate control, for both buffs and fight commands. 8 new tests (round-boundary timing +
  debounce, onceKey round/fight semantics including the "skipped gate doesn't consume the slot"
  case, hasQueueBuildup fight-wide + per-command, reset-on-new-encounter) using
  `jest.useFakeTimers()` scoped to that describe block; 324/324 total tests + tsc green.
  Attempted a screenshot of the once-per-fight toggle but the Playwright script timed out
  navigating to the Combat step twice in a row (env flakiness, not traced further — the
  control reuses the exact `.gateBar`/`.gateSeg`/`.gateOpt` classes already visually confirmed
  working for vitals gates, the mode toggle, and the buff recast-gate earlier this session);
  abandoned the screenshot rather than sink more time into it, relying on the unit tests.

- 2026-09-12T17:45:00Z step 4 done — checked `[x]`. Extracted the queue-clear decision into
  its own `clearQueueIfBuiltUp()` (checks `hasQueueBuildup()`, sends `~` only if true) so it's
  unit-testable without driving a full engage/fight/postFight encounter through
  `flushInjected` (no existing test harness covers that whole flow, and building one was out
  of scope for this step). Called from the exact spot the plan specified: right after the
  postFight triplet, before the post-fight settle delay and the identify re-scan (the first
  place a look/move-ish command could go out again). 2 new tests (fires with a trailing `~`
  when buildup was detected, sends nothing extra for a clean 1-send-per-round encounter);
  326/326 total tests + tsc green.

- 2026-09-12T18:00:00Z step 5 done — checked `[x]`, but flagged as UNVERIFIED LIVE (per the
  plan's own note that this step is the least certain). Added `EngineDeps.onAbilityCooldownLearned`
  and fired it from the same `send_cooldown` per-command-buildup branch step 3 built — each
  re-trigger notifies with `currentCooldownSec + 0.5` (COOLDOWN_LEARN_BUMP_SEC), computed off
  the static config value each time (doesn't compound on its own previous bump within one run).
  Deliberately does NOT hot-patch the running encounter's behavior — only persists for future
  runs, per the plan's actual ask ("pre-fill... when the same ability is added again"). New
  `abilityTiming` UserRecordKind + `getLearnedCooldown`/`bumpLearnedCooldown` in
  autoleveling-user-data.ts, keyed globally by normalized command string (not per-area/class).
  `useAutoLeveling.ts` wires the callback to `bumpLearnedCooldown`. CombatStep.tsx's
  `addClassFight` now pre-fills `cooldownSec` from `getLearnedCooldown` instead of always 0.
  3 new tests (persistence round-trip incl. case/whitespace normalization + last-write-wins;
  callback fires with the correctly-bumped value); 328/328 total tests + tsc green.
  **Not live-tested** — the bump increment (0.5s) and the "re-fire within the same
  ~1s-gap-defined round = too fast" heuristic are both guesses; a real ability with unusual
  timing could need a different increment or a few bumps before it stabilizes. Please live-test
  with a deliberately-too-low cooldown on a real ability and report back what you see (does it
  climb to a sensible value, does it climb too slowly/fast, does it fire when it shouldn't) —
  I'll adjust the constant/heuristic based on that rather than guessing further.

- 2026-09-12T18:20:00Z step 6 done — checked `[x]`. Added `AutoLevelRestConfig`
  (startOfRound/endOfRound action lists + duringRound threshold rules) and
  `AutoLevelRestDuringRoundRule` ({hp?,mp?,mv?,recoverTo}) to autoleveling-types.ts, and a
  required `rest` field on `AutoLevelConfig` (defaulted to empty arrays in
  createDefaultAutoLevelConfig — tsc stayed clean everywhere else, confirming every other
  AutoLevelConfig construction site already spreads the default rather than building one from
  scratch). Discovered `AutoLevelRunState`'s `'resting'` status variant was already defined but
  never actually set by the engine anywhere — a pre-existing placeholder this step now uses for
  real. Engine wiring: `rest.startOfRound` runs at the very top of each round (before
  `steps.start`); `rest.endOfRound` runs right after `steps.reset.endRound`; `duringRound` rules
  are checked once per movement-loop iteration via `checkDuringRoundRest()` — out of combat only,
  ALL thresholds present on a rule must be at/below their percentage to trigger (matching the
  user's own "hp below 50% AND mana below 50%" example precisely), first matching rule wins. On
  trigger: runs `rest.endOfRound` (deliberately reusing it rather than a separate per-rule
  command list — it's the same underlying "go rest" action either way), polls `charVitals` every
  1s until every present `recoverTo` percentage is reached (5-minute floor backstop, same
  "backstop not a duration cap" reasoning as FIGHT_END_BACKSTOP_MS from an earlier step), then
  runs `rest.startOfRound` to get back up. Factored the vitals-percentage math shared with
  `vitalsGateSatisfied` (step 1) into a `vitalsPct()` helper rather than duplicating it a third
  time. `draftToConfig`/`useWizardDraft` untouched — the wizard draft has no rest fields yet, so
  `draftToConfig` still returns the default (empty) rest config until step 7 wires real UI to
  it. 4 new tests (round-order placement via a full `engine.start()` trace, AND-across-thresholds
  rule semantics, never-fires-while-fighting, and the full sleep→wait-for-recovery→wake cycle
  using a synchronous-emit-before-await technique to avoid real timer waits); 332/332 total
  tests + tsc green.

- 2026-09-12T18:40:00Z step 7 done — checked `[x]`. Wizard is now 6 steps (area/targets/
  combat/**rest**/review/start). New `RestStep.tsx`: start/end-of-round as single semicolon-
  separated text fields (matching the `fullRoute` join convention, e.g. "wake;stand"), and a
  repeatable during-round rule card (HP/MP/Stamina ≤ threshold, all optional/AND'd, plus a
  recover-to ≥ target per stat) reusing the buff-card/gateBar styling already established for
  vitals gates. Wired: `useWizardDraft` (restStartOfRound/restEndOfRound/restDuringRound, the
  last one typed directly as `AutoLevelRestDuringRoundRule[]` — no duplicate shape),
  `draftToConfig` (new `parseRestCommands` splits the text fields the same way `fullRoute`
  does), `ConfigDraft` (fields added as optional so `WizardDraft` stays structurally
  assignable, matching the existing `playerAlignment?` precedent), and a new Rest row on
  ReviewStep summarizing both command lists and every rule's thresholds/recovery targets in
  plain language. Also fixed `toRunStateText`'s `'resting'` case — it mapped to "Idle" (a
  leftover from when the status was defined but never actually set by anything); now that
  step 6 actually emits it during a during-round rest cycle, changed the label to "Resting" so
  it's not misleading. Screenshot-verified live: the Rest step form (HP≤50% AND MP≤50% →
  recover to HP≥90%, matching the user's own example) and the Review step's rendered summary
  both look correct. tsc + 332/332 tests green (no new automated tests this step — pure UI
  wiring onto the already-tested step 6 engine behavior, matching the precedent set by step 2).

- 2026-09-12T18:55:00Z step 9 PARTIAL (numbered step 8 at the time this entry was written; step 8
  was inserted later — see the 19:25 entry below) — docs refresh done, live play-test NOT done (needs the
  user, same as the original plan's own step 13). Refreshed `.annotated` for
  features/autoleveling/ (user-data, wizard-config, engine, types — the four files with real
  new behavior) and components/wizard/ (CombatStep, new RestStep entry, ReviewStep's
  renumbering) and components/ (AutoLevelingWizard's now-6-step description). Checked
  `features/autoleveling/.ai-context`'s folder narrative — still accurate at its level of
  abstraction, no change needed. Verified `autoleveling-storage.ts`'s `coerceConfig` (`{
  ...fallback, ...src }`) already safely backfills the new required `rest` field for
  pre-existing saved v3 configs that predate this plan, without needing any change. Skipped
  adding a `useAutoLeveling.ts` entry to hooks/.annotated — that file is narrowly scoped to 2
  auth hooks with unusual nuance, not a general hooks index, and the real behavior is already
  documented where it actually lives (autoleveling-engine.ts's EngineDeps). Final state: all
  7 implementation steps done, tsc clean, 332/332 tests green. Remaining: live-verify all
  five behaviors on a real DSL connection (vitals gate skip, once-per-fight/round firing,
  conditional `~` queue-clear, auto-tuned cooldown climbing + persisting, Rest step firing
  only out of combat) and report back — step 5's bump heuristic and step 6's rest-cycle timing
  in particular are unverified guesses per their own progress-log entries above.

- 2026-09-12T19:10:00Z addendum (user feedback while wiring the companion-plan cross-links
  above): added `emitCooldownLearnedNotice()` — a bright `[auto-level] heads up: "<cmd>" was
  queueing — bumped its cooldown Xs → Ys (remembered for next time)` terminal line, fired
  alongside `onAbilityCooldownLearned` in the same send_cooldown per-command-buildup branch —
  so a silently-changed cooldown never surprises the player mid-session. Also cross-linked this
  plan with `.ai-plans/20260909-0739-autoleveling-redesign.md` (the original wizard plan, still
  finishing its own step 13 live play-test) — both docs now point at each other's Progress log
  right up top, since they're being developed concurrently against the same files and a
  step-13 tester needs to know this plan's changes (6-step wizard, new `rest` config field,
  etc.) exist. 1 new test (terminal write asserted on the bump, absent on the first/non-bumped
  send); 333/333 total tests + tsc green.

- 2026-09-12T19:25:00Z plan revised — user asked (after confirming the prior "pause on flee, full
  stop on flee" recollection didn't actually exist anywhere in the engine's history — `fleePk` has
  always been a dead, unwired checkbox on the OLD modal) to bring the existing flee-triggered pause
  forward properly and add a resume mechanism that re-syncs state with a look before continuing.
  Inserted as a new step 8 (renumbered the live play-test from step 8 to step 9, extended its scope
  to cover the new behavior) rather than a separate plan doc, since it touches the exact round-loop/
  rest-cycle machinery steps 1-7 already built and can share the same live play-test session. Scope:
  harden the two rest-cycle poll loops (added by step 6) to respect `this.paused`, and hook a
  look-first resync into the single `waitWhilePausedOrStopped()` choke point so it covers
  flee-triggered AND the existing manual pause/resume button for free. Deliberately did NOT revive
  the dead `fleePk` field — the user's ask was about the pause/resume mechanism itself, not that
  checkbox, and it isn't exposed in the new wizard at all.

- 2026-09-12T20:35:00Z step 8 done — checked `[x]`. Extracted `rescanRoom()`'s send-identify-or-
  look logic into a shared private `sendIdentifyOrLook()`, called from both `rescanRoom()`
  (unchanged behavior) and a new `resyncAfterResume()`. `waitWhilePausedOrStopped()` now captures
  `wasPaused` before its poll loop and, only when it actually blocked on a real pause, calls
  `resyncAfterResume()` (send look/identify, `await delayMs(cfg.lookSettleMs)`) before returning —
  since it's the single choke point behind all 5 existing call sites, this covers flee-triggered
  AND the manual pause/resume button for free, with zero fast-path cost when never paused.
  `waitForRecovery()` now checks `this.paused` at the top of its poll loop: when paused, it awaits
  `waitWhilePausedOrStopped()` (zero action, gets the same resync-on-resume for free), tracks the
  paused duration, and subtracts it from elapsed time against the timeout budget — so a pause
  mid-recovery-wait fully suspends the rest cycle (never silently "gives up" in the background)
  and resumes polling the real condition once unpaused, per the user's explicit correction to
  this step's original framing (see the 19:35 entry above). 3 new tests (`boundOnFlee` pauses on
  both flee success/failure; `waitWhilePausedOrStopped` resyncs only on an actual pause→resume
  transition, not a same-tick no-op call; `waitForRecovery` takes no action and doesn't lose its
  timeout budget while paused, then resolves via the real recovery condition post-resume);
  336/336 total tests + tsc clean.

- 2026-09-13T00:00:00Z plan revised — user asked (after all 8 original steps + the docs-refresh
  portion of step 9 were done, with only the live play-test itself outstanding) to expand the
  plan with two more behaviors: a Weight wizard step (before Review) that runs a configurable
  drop-gold/silver command sequence at a carry-weight percentage threshold, and the ability to
  live-edit the running engine (combat abilities, rest rules, targets, and the new weight rule)
  instead of only at wizard-setup time. Two things were checked/clarified before writing new
  steps rather than assuming: (1) the claim that weight was "already calculated as part of
  vitals" was only half right — the raw GMCP fields (`carry_weight`/`can_carry_weight`) are
  confirmed present in `char_data` (real session log,
  `DSL/Books/.../2026-09-07_Telthian-Melchaleve-Duel.jsonl:83`) and already flow through
  `onCharDataVitals`, but nothing extracts them into `charVitals` yet — small addition, not
  already done. (2) The user's first choice for live-editing was "true hot-swap, no pause
  needed" for everything; on inspection `autoleveling-engine.ts:1081-1082` deliberately snapshots
  config ONCE per run (`// single consistent cfg`) and most of the round loop reads that frozen
  snapshot — only the fight loop and `checkDuringRoundRest` already re-fetch config per-call.
  Surfaced this back to the user (a full round-loop refactor to re-fetch every round vs. a
  smaller scope) rather than silently picking one; user chose the smaller scope: true hot-swap
  only where the code already fetches fresh (fight-commands, rest during-round rules, and the
  new weight rule, which is built the same way), and a pause→edit→resume refresh (extending step
  8's resync machinery) for targets/buffs/route/rest-start-end-of-round, which stay on the frozen
  snapshot otherwise. Inserted as new steps 9-12 (weight data model+engine, weight UI, the
  no-pause live-apply wiring, and the pause-to-edit resync extension), renumbering the live
  play-test from step 9 to step 13 and extending its exercise list to cover both new behaviors.

- 2026-09-13T00:20:00Z addendum — user asked for a terminal write on autopilot
  starting/stopping/pausing/etc, same pattern as the existing `emitCooldownLearnedNotice`
  addendum. Factored the duplicated ANSI/bright-yellow setup out of `emitXpProgress` and
  `emitCooldownLearnedNotice` into a shared `writeAutoLevelLine(body)` (cosmetic no-op refactor,
  same output), then hooked it at every meaningful `AutoLevelRunState` transition EXCEPT the
  noisy per-round ones already visible in the wizard's monitor panel (running/waiting/resting):
  `start()` writes "started (<mode> mode)" once validation passes, or "error: <reason>" via a
  new `fail()` closure that also consolidates the 3 previously-duplicated
  `setRunState({status:'error',...})` validation-guard blocks; `stop()` writes "stopping...";
  `pause()`/`resume()` write "paused"/"resumed", guarded by the SAME early-returns that already
  no-op a redundant call (no double-messaging); the round loop's fatal-error catch writes
  "error: <message>"; and the final `idle` transition (reached by every exit path — manual stop,
  a natural single-pass completion when `loopRounds` is false, or after a fatal error) writes
  "stopped". 5 new tests (paused/resumed pair, no-op calls stay silent, stop()'s immediate
  message, a full start→stopped run via the existing natural-completion test pattern, and a
  rejected start writing "error:" + never "started"); 368/368 total tests + tsc clean. Refreshed
  `features/autoleveling/.annotated`'s engine entry.

- 2026-09-12T19:35:00Z step 8 clarified (before implementation) — user pushed back on the framing:
  don't have the rest loop take ANY action while paused, full stop, so a player fleeing keeps full
  manual control; resume the rest loop (don't abandon it) once unpaused or restarted. On inspection
  this was already mostly true: every actual command send funnels through `runActions()`, which
  already gates per-action on `waitWhilePausedOrStopped()` — `rest.startOfRound`/`rest.endOfRound`
  already refuse to fire while paused. The real gap was the OPPOSITE of what step 8 originally said:
  `waitForRecovery`'s passive poll doesn't check `this.paused` at all, so a pause mid-recovery-wait
  lets it silently keep ticking toward its own timeout and report "gave up" — i.e. the rest cycle
  could abandon itself in the background while the player wasn't looking, rather than staying
  frozen and resuming properly. Rewrote step 8's Do/Verify to fix that directly: suspend (zero
  action) and freeze the timeout clock while paused, resume polling the real condition once
  unpaused. Not yet implemented.

- 2026-09-13T04:00:00Z step 9 done — checked `[x]`. Added `AutoLevelWeightConfig` ({enabled,
  atOrAbovePct, commands: AutoLevelAction[]} — ONE rule, per Constraints) to autoleveling-types.ts
  and a required `weight` field on `AutoLevelConfig`; corrected a type slip from the plan doc
  itself along the way — `commands` had to be `AutoLevelAction[]` in the FINAL config, not a raw
  string, matching how `rest.startOfRound`/`endOfRound` work (the raw semicolon-string only lives
  in the wizard DRAFT, parsed via `parseRestCommands` — that parsing is deferred to step 10 same
  as step 6 deferred it for Rest, so `draftToConfig` is untouched this step and still returns the
  default `weight` via its top-level `...def` spread). Defaulted `weight` in
  createDefaultAutoLevelConfig (disabled, 90%, empty commands). Engine: extended `charVitals` with
  `carryWeight`/`carryWeightMax` (GMCP `carry_weight`/`can_carry_weight`, confirmed present in a
  real session log during the earlier picker-fix work), a `weightPct()` helper — deliberately a
  **0-fallback**, not vitalsPct's 100-fallback, since absent data must never read as "overweight";
  and `checkWeightGate(round)` — out-of-combat only, fetches config fresh via its own
  `deps.getConfig()` call (same pattern as `checkDuringRoundRest`, which is what makes it
  hot-swappable in step 11), edge-triggered via a new `weightGateFired` flag (reset on new-run
  start alongside the other per-run resets) so the drop sequence fires once per threshold
  crossing, not on every subsequent check. Wired into the round loop immediately after
  `checkDuringRoundRest(round)`. `coerceConfig` needed no change — confirmed its top-level
  `{...fallback, ...src}` spread already backfills a wholly-absent `weight` key on old saved
  configs, same as it already does for `rest`. 4 new tests (never fires while fighting, disabled
  no-op, absent-data no-op, fires-once-then-resets-then-refires); 373/373 total tests + tsc green.

- 2026-09-13T04:15:00Z step 10 done — checked `[x]`. New `WeightStep.tsx` (7 steps now: area/
  targets/combat/rest/**weight**/review/start) — an enable checkbox, a threshold-percentage
  number input, and a commands text field (semicolon-separated, same convention as Rest's
  start/end-of-round fields), the latter two only shown when enabled. Added
  `weightEnabled`/`weightAtOrAbovePct`/`weightCommands` to `WizardDraft`/`emptyDraft` and the
  matching optional trio to `ConfigDraft`; wired `draftToConfig` to build `config.weight` from
  them via the existing `parseRestCommands` splitter (reused, not duplicated). Added a Weight row
  to ReviewStep between Rest and Mode. Screenshot-verified live against the running dev server
  (already up this session) with a throwaway Playwright script, deleted after use per this
  project's own convention: stepper correctly reads "Area / Targets / Combat / Rest / Weight /
  Review / Start", the Weight panel renders and accepts input, and the Review page's Weight row
  correctly showed "drop at 85% carry weight: drop gold;drop silver" after filling it in. tsc +
  373/373 tests green (no new automated tests — pure UI wiring onto already-tested step 9 engine
  behavior, matching the precedent set by steps 2 and 7).

- 2026-09-13T04:30:00Z step 11 done — checked `[x]`. No engine change — fight-commands
  (`checkFightExec`/the fight loop), Rest during-round (`checkDuringRoundRest`), and Weight
  (`checkWeightGate`) already re-fetch config fresh per-call (confirmed in step 9's own Context).
  Added a shared "Apply live changes" bar to `AutoLevelingWizard.tsx`'s step header, shown only
  when `isRunning` AND the current step is Combat/Rest/Weight, calling the exact same
  `setConfig(draftToConfig(draft))` the idle Start-step effect already uses — not a continuous
  auto-sync, an explicit button, to avoid pushing a half-typed edit mid-keystroke. Went a step
  further than the plan's literal wording once actually building it: Combat and Rest each mix a
  hot-swappable part (fight-commands, during-round rules) with a frozen one (buffs,
  start/end-of-round) on the SAME page, so a single generic "changes apply live" message would
  have been actively misleading for the frozen half — gave each step its own precise hint text
  instead (e.g. Combat: "Fight commands apply live below. Buffs need Pause → edit → Resume
  instead."). tsc + 373/373 tests green. Full live-run verification (confirming a click actually
  changes a running engine's behavior, not just that the code path exists) is deferred to step
  13 per this step's own Verify wording — hard to fake convincingly without a real DSL
  connection, and step 9/step-11's underlying per-call config-fetch behavior is already what the
  existing engine tests cover.

- 2026-09-13T04:45:00Z step 12 done — checked `[x]`. Turned the `const cfg` local in `start()`
  into an instance field `this.cfg` (mechanical rename across the round-loop's ~20 references,
  verified via a scoped `sed` pass + a full re-grep confirming every OTHER method's own
  independent `const cfg = this.deps.getConfig()` fetch — checkDuringRoundRest, checkWeightGate,
  the fight loop, resyncAfterResume, etc. — was left untouched). Extracted the targets-
  normalization block into `refreshTargets(cfg)` (called from both `start()`'s initial setup and
  the new resync path). Added `refreshRunSnapshot()` (`this.cfg = this.deps.getConfig();
  this.refreshTargets(this.cfg);`), called from `waitWhilePausedOrStopped()` at the exact point
  step 8 added `resyncAfterResume()` — i.e. only on a real pause→resume transition, alongside
  (not instead of) the existing look/identify resync. Also refined the wizard's live-apply
  messaging (step 11's bar) and added a distinct "Pause to edit" hint on the Targets step, since
  it has zero hot-swap path — this is the ONLY way an edit there ever reaches a running engine.
  1 new test: seeds `this.cfg`/`this.targets` directly (mirroring the existing flee-pause test
  style rather than driving a full timed round loop), live-edits the config to a brand-NEW object
  (mirroring `setConfig(draftToConfig(draft))`, not an in-place mutation — mutating in place would
  have made the test pass without proving anything, since `this.cfg` holds the same reference),
  confirms a no-op `waitWhilePausedOrStopped()` call does NOT pick up the edit, then confirms an
  actual pause→resume DOES. 374/374 total tests + tsc green.

- 2026-09-13T14:20:00Z step 13 in progress (not checked) — user's live play-test surfaced two
  issues directly, one of which is step 5's own flagged-as-least-certain auto-tuned cooldown:
  (1) repeatedly saw the "heads up: kick was queueing… remembered 1.5s" notice and correctly
  read it as never actually sticking. Root cause confirmed in `autoleveling-engine.ts`'s
  `send_cooldown` branch: the bump was computed as `a.cooldownSec + 0.5` off the STATIC config
  value every time, and never fed back into the live `cdMs` gate — so the same too-short
  cooldown kept firing, kept re-triggering the buildup detector, and kept re-reporting the exact
  same target forever, both within one run and across runs (only a brand-new `addClassFight` add
  in CombatStep ever consumed the persisted value). Fixed: added `learnedCooldownSec` (per-cmd,
  in-memory this run), seeded at `start()` from the persisted store via a new
  `EngineDeps.getLearnedCooldown` (hook wires it to the existing `autoleveling-user-data`
  `getLearnedCooldown`, symmetric with the existing write-side `onAbilityCooldownLearned` ->
  `bumpLearnedCooldown`), and now used as a floor under the configured `cooldownSec` for BOTH the
  live gate and the next bump's base — so repeated buildups escalate cumulatively (0→0.5→1.0→…)
  and a value learned in a past run applies from round 1 of the next one instead of re-earning it
  from scratch. 2 new tests (cumulative escalation across repeated buildups; `seedLearnedCooldowns()`
  pulling a persisted value). 376/376 tests + tsc green.
  (2) "the weight management screen isn't actually visible in the wizard" — traced
  `WeightStep.tsx`'s wiring in `AutoLevelingWizard.tsx` end to end (imported, in the `STEPS`
  array, rendered with the right props on `step.id === 'weight'`, `useWizardDraft`/
  `autoleveling-wizard-config.ts` carry the three weight fields) — all correct, matching step
  10's own progress-log claim, and `tsc` is clean. Did NOT find a code bug. Strong alternate
  explanation: `MainContainer.tsx`'s `autoleveling.wizard` localStorage flag flipped from opt-IN
  to opt-OUT only on 2026-09-12 (this plan's own start date) — anyone whose browser already had
  that key set to `'0'` from earlier testing (when the DEFAULT was the old modal) is silently
  still on `AutoLevelingModal.tsx`, confirmed via grep to have zero "weight" references at all —
  no UI toggle exists for this flag, it's a devtools-only escape hatch. Flagged to the user to
  check/clear it rather than assumed fixed; step 13 left UNCHECKED — the other six play-test
  behaviors, the `.annotated`/`.ai-context`/`.flows` refresh, and screenshots are still
  outstanding.

- 2026-09-13T14:40:00Z step 13 continued (not checked) — two more live-playtest follow-ups.
  (1) User corrected the weight-visibility theory mid-turn: "shouldn't be gated behind a flag,
  it's just part of the new autolevel modal." Rather than asking them to check devtools, removed
  the `autoleveling.wizard` opt-out flag and the `AutoLevelingWizard`/`AutoLevelingModal` ternary
  from `MainContainer.tsx` outright — the wizard is now the ONLY auto-leveling UI, no fallback
  path exists to silently land on. `AutoLevelingModal.tsx`/`.module.scss` (2500+ lines) are now
  genuinely dead code but NOT deleted — left for the user to confirm before a bigger deletion.
  tsc + 376/376 tests green.
  (2) Added reorder controls: buff cast order and fight-command order both matter (top-to-bottom
  = apply order, per `draftToConfig`'s `steps.start.pre`/`steps.fight.exec` mapping) and there was
  no way to change it short of delete+re-add. Added `moveItem()` + a shared `ReorderButtons`
  (↑/↓ `.iconButton` pair, disabled at each list's ends) to `CombatStep.tsx`, wired into both the
  buff-card row and the fight-command row; reordering commits through the existing
  `commitBuffs`/`commitFight` debounced-save path, so it persists exactly like any other edit.
  New `.reorderGroup` style. tsc + 376/376 tests green (no new tests — pure array-reorder UI, no
  new engine behavior to cover).
  (3) User asked "why did my auto-level stop" — reviewed `apps/game-server/log/2026/09/12/
  server.log-2026-09-12.jsonl` (today's 09-13 file was only server-boot boilerplate, no session
  yet). Extracted a clean IN/OUT transcript (stripped ANSI, unescaped the double-JSON-encoded
  `game:client:input` payload — see [[dsl-log-search-false-negatives]]) rather than trusting a raw
  grep. FIRST theory (WS reconnects correlating with `.env.dev` reloads at 14:34/14:43/14:52) was
  presented to the user and they corrected it: "this did not occur during a socket reconnect...
  this just stopped mid session" — those reconnects were from our own redeploys, a red herring.
  Went back and found the real gap: a full 11-MINUTE stretch (14:14:51-14:27:09) with the socket
  never dropping, GMCP/char_data flowing normally the whole time, and the user's own tick-gated
  buff ("imp", firing on schedule every ~2min) still firing — but ZERO movement or kill commands
  sent, i.e. the round loop itself froze while independent tick-driven stuff kept working. Root
  trigger: an admin ("Xenophon") ran an in-game `auto-copyover` (DSL hot-reboot-in-place) at
  14:14:50, landing the character back in the same room a second later ("Copyover recovery
  complete") — and the round loop never issued another command after that. Confirmed this isn't
  "copyover always breaks it": two OTHER copyovers that same session (13:57:44, 14:36:52)
  resolved in 1-2s with no stall, so it's timing/state-dependent, not universal. `grep -ri
  copyover` across the whole game-client `src/` returns NOTHING — no code anywhere recognizes
  copyover text or defends the round loop against a mid-cycle MUD reboot; `movementTracker.ts`'s
  own file-header comment ("NOT yet wired into the live app... Step 3/4") also looks stale against
  this file's `.annotated` claim that it already drives movement success/failure — worth
  reconciling. Did NOT pin down the exact stuck `await` (would need deeper round-loop tracing) —
  reported the well-evidenced correlation to the user rather than guessing further, and offered a
  defensive fix (treat "auto-copyover engaged"/"Copyover recovery complete" as a signal to
  force-clear movementTracker's pending queue / abandon whatever the round loop is waiting on)
  contingent on the user wanting it. Separately (still valid, orthogonal): `useAutoLeveling.ts`'s
  `game:remote-server:close` listener only flips `socketReady` — never calls `engine.stop()` — so
  a genuine hard socket drop mid-run would ALSO hang the engine rather than surfacing a clean
  stopped state; not the cause of THIS particular stop, but a related gap worth remembering.

- 2026-09-13T15:10:00Z step 13 continued (not checked) — two more user-reported issues.
  (1) User: "when I have several buffs at the start, auto pilot times out... it's not properly
  accounting for buffs, it's just timing out" and tied it to the earlier mid-session stop. Traced
  it to a real gap: `steps.start.pre` (buffs) is the one bare `send`/`if_affect_missing` phase
  with ZERO pacing between actions — unlike movement (`moveSettleMs` after each hop) and
  fight-commands (the auto-tuned-cooldown work from earlier today), several buffs fire back to
  back with no regard for real MUD-side cast/violence lag, and the round loop moves straight into
  the first movement immediately after the last one. `waitForMovement`'s backstop timer (a
  "should only fire if the tracker itself never resolves" safety net per movementTracker.ts's own
  comment) starts ticking the instant it's called — so if the connection/GMCP stream is still
  working through a backlog of buff-response processing at that moment, a real MUD-side delay can
  eat into that budget and trip the backstop, which is FATAL (`status: 'error'; stopping = true`
  — see `autoleveling-engine.ts:1344-1348`). Fixed by giving `runActions()` a `lookSettleMs` delay
  after each `start.pre` action specifically (not a new config field — reused the existing
  look-settle knob, semantically the same "let the server's response land before moving on"
  concern). Deliberately scoped to `start.pre` only via a `stepLabel` check, not applied to every
  `runActions` call site, so move.pre/post, rest, and reset steps are untouched. 2 new tests
  (settle delay applied between buffs in `start.pre`; NOT applied for `move.pre`) — needed real
  timers + `waitFor`, not `jest.useFakeTimers()`, since the poll helper's `setTimeout(tick, 10)`
  won't advance under fake timers without explicit `advanceTimersByTime` calls interleaved with
  microtask flushes, which got fragile fast; small real `lookSettleMs` (60ms) instead. Did NOT
  fully prove this is 100% of what caused the earlier copyover-adjacent stall (that trace stopped
  short of the exact stuck `await`) — presented as the best-supported, low-risk fix rather than a
  certainty. 378/378 tests + tsc green.
  (2) User: "Weight is supposed to be a plain text command list of actions... not a simple
  checkbox." Asked which shape they wanted (one free-form list / multiple weight tiers / drop
  only the checkbox) — answer: "An input box for the command, and a weight percentage input" —
  i.e. keep the two fields already there, just drop the enable checkbox entirely. Removed
  `AutoLevelWeightConfig.enabled` from `autoleveling-types.ts`, `weightEnabled` from
  `WizardDraft`/`ConfigDraft`/`emptyDraft`, the checkbox + conditional wrapper from
  `WeightStep.tsx` (both fields now always rendered), the prop pass-through in
  `AutoLevelingWizard.tsx`, and the `enabled: ...` line in `draftToConfig`. `checkWeightGate` now
  gates on `cfg.weight?.commands?.length` instead of `cfg.weight?.enabled` — a blank commands
  field IS off, same convention Rest's start/end-of-round fields already used (no flag needed).
  `ReviewStep.tsx`'s Weight row now reads "off" straight off blank `weightCommands`. Updated the 4
  existing "weight gate" engine tests (`enabled: true/false` → just vary `commands`). 378/378
  tests + tsc green.

- 2026-09-13T15:45:00Z step 13 continued (not checked) — third live-playtest observation, same
  session: "when rest step is triggered [clarified: the during-round HP/MP/stamina trigger], it
  does not actually perform the rest action, e.g. sleep... make this a freeform text box... I
  want this to go to the command processor, so that I can utilize my command stacking." The Rest
  step's `restStartOfRound`/`restEndOfRound` fields were ALREADY plain freeform text boxes
  (semicolon-separated, same as Weight) — no UI gap there. The real gap: both fields (and the
  during-round trigger, which reuses these exact two — see this step's own `.annotated` note)
  sent through `sendCommand()` → a raw literal `DispatchEvent('shatteredarchive:send-command')`,
  the SAME event dispatched by movement/fight/buffs/weight — bypassing the alias/script runtime
  entirely. If the player's "rest action" is actually one of their OWN aliases/macros (their
  "command stacking"), it never expands — the alias NAME gets sent to the MUD verbatim instead,
  which does nothing (or errors), matching "does not actually perform the rest action" exactly.
  Confirmed by reading `useGameCommand.ts`: manually-typed terminal input already goes through
  `RuntimeSingleton.Runtime.executeAlias(line)` (falling back to a raw send only if no Runtime is
  bound) — every OTHER programmatic `send-command` dispatcher (compass, plugins, scripts calling
  it directly, and the autolevel engine) skips that entirely, seemingly by original design (so a
  script's own generated command doesn't get UNEXPECTEDLY re-processed through the user's typed
  aliases). Given that, did NOT change the engine's core `sendCommand()` for everything (movement/
  fight-commands/buffs/weight) — `RuntimeSingleton` is a real, stateful singleton (window
  listeners, a 250ms setInterval, localStorage hydration) and touching it from every engine
  action would risk instantiating it inside the ENTIRE engine test suite, not just rest tests.
  Instead added a new optional `EngineDeps.sendThroughCommandProcessor` (same DI pattern as
  `getLearnedCooldown`/`onAbilityCooldownLearned`) + a `sendViaCommandProcessor()` sibling to
  `sendCommand()`, and threaded `stepLabel` into `execAction` (mirroring the buff-settle fix) so
  the shared `send` case can branch: `REST_STEP_LABELS` ('rest.startOfRound'/'rest.endOfRound')
  route through the processor, everything else stays on the raw path untouched. Hook
  (`useAutoLeveling.ts`) wires the dep to `RuntimeSingleton.Runtime.executeAlias`, same
  if-available/else-raw-fallback `useGameCommand.ts` itself uses. 2 new tests (rest routes
  through the processor and NOT the raw event when wired; a buff explicitly does NOT). Updated
  RestStep.tsx's field hints to say so. 380/380 tests + tsc green.
