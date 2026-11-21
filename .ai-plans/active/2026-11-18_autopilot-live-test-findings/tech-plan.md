# Tech plan: Autopilot findings from live testing on 2026-11-14 (buffs, retries, pauses, thresholds, durations, wait step)

Item: item.md · Scope: scope.md · Planned against: performance/Allocation-hunt @ 9191edc (the working tree also holds the other autopilot plan's uncommitted edits, see Risks) · Date: 2026-11-18
Standards: docs/standards/typescript.md, docs/standards/csharp.md (Types and nullability decided 2026-11-18 for this plan), docs/standards/scss.md · Data classification: Personal (the log corpus read and the account-synced autopilot records changed; no personal value appears in this plan: counts and placeholders only)
Edge-case catalog: persisted-settings-and-defaults.md, cloud-synced-user-content.md, command-templates.md (new), automation-run-loops.md (new), game-data-privacy.md, log-tailing.md, local-only-features.md, served-fallback-data.md, shared-event-bus.md, ansi-color-handling.md, theming-dark-mode.md · Classifiers added (user-approved 2026-11-18): CMDTPL-01, RUNLOOP-01, RUNLOOP-02, RUNLOOP-03, SETTINGS-07

## How this plan joins the active plan

Owner decision D1 (scope.md): these findings are worked as new phases of `.ai-plans/active/2026-11-13_editable-autopilot-targets-synced`. This file is the plan of record for **Phases 12-22**. `/implement-plan` appends them to the active plan's `tech-plan.md` as an amendment (its next free `A<n>`, original text kept) and adds this item's edge-case rows (ids `L1`-`L41`, so they never collide with that plan's `E1`-`E24`), then runs the phases from there. Placement: after Phase 6b and **before the mobile engine port (its Phase 9)**, because the engine is a contract the mobile port copies; Phases 7-8 (mobile content API and user data) are not affected and may run before or after. The decisions recorded in scope.md bind this plan: D1 (this joining), D2 (fog and dispel fog excluded per list), D3 (the engine enforces the in/out-of-combat flag whatever the game answers). Decisions taken while planning (owner, 2026-11-18): rest, weight and lap wait are one set for the character in the existing global preference record, selected targets are remembered per area; **all** run-ending timeouts pause; a timeout pause raises Copilot's existing need-help signal; "strategy" means two thresholds on one row (own vitals and enemy condition, both must hold); nullable `int?` omitted from JSON in C#.

## Goal

An autopilot run (a) sends only real commands (no `{name}` or `<potion>` ever reaches the game, fog and dispel fog are never pre-filled), (b) re-arms a buff or heal that failed or dropped, one command at a time, with a capped, lag-spaced retry, (c) pauses instead of stopping when a movement, fight-end or wait timeout fires, with a backstop that no longer undercuts the movement tracker, (d) honours per-row in-combat / out-of-combat flags and own-vitals plus enemy-condition thresholds, (e) waits a configurable time (default 3 minutes) between laps and keeps its rest, weight, lap-wait and selected-target values between sessions, and (f) defaults its recast intervals and cooldowns from C# data (`DurationTicks`, and a new measured skill lag produced by an ad hoc C# job). Each is proven by tests, and the visible parts by screenshots and a live check on the local stack.

## Out of scope

The mobile port and every mobile edit (phases 7-11 of the active plan; this plan only records the new engine behaviour in the shared docs); Phase 6b; production deploys (the owner's); a client-to-server timing upload (ruled out for item 7); the older `AutoLevelingModal.tsx` (its settings stay as they are; U8 in scope.md: it is not kept in step); class-specific tuning beyond dark heal, haste, sanctuary, fog and dispel fog; the unexplained 120-second `imp` traffic; verifying DSL's enemy-condition bands (merc-mud is the stock base and not a DSL stand-in: the bands are shown as "about", see L12).

## Workflows (before and after)

The workflows these phases change are drawn once, as mermaid Before and After pairs, in the parent plan `.ai-plans/active/2026-11-13_editable-autopilot-targets-synced/tech-plan.md`, section "Workflows (before and after)", so the two plans cannot drift:

- **W4** a timeout during a run (Phase 16)
- **W5** casting a buff or heal and re-arming it (Phases 12, 13, 14, 15, 18)
- **W6** the lap loop and what the wizard remembers (Phase 17)
- **W7** where ability timing comes from (Phases 19, 20, 21)

Their After diagrams are in the developer doc `docs/game/autopilot.md` (section "Workflows").

## Standards applied

- **TypeScript** (`docs/standards/typescript.md`): new pure helpers are their own camelCase modules under `features/autoleveling/` (never more growth of the 2,576-line engine than the wiring needs); tests co-located; no new `any` in production code; storage fails safe with `try`/`catch` and one fixed `console.warn` with no values; subscriptions return their unsubscribe (the engine's existing `ListenEvent` keys are reused, none added); engine debug output stays behind `autoleveling.debug`. Tests assert concrete behaviour and every added branch.
- **C#** (`docs/standards/csharp.md`): logic in a static class under `Server.Dsl/Processors` and `Server.Dsl/Cache` (as `RoomProbeMiner` and `RoomHintStore`), the job a thin class in `Server.Jobs/Adhoc`; xunit `<Feature>Tests.cs` with `async Task` tests and `IAsyncLifetime` for scratch state; `dotnet build -c Release` with no new warnings; **new**: unknown numbers are `int?` omitted from JSON.
- **SCSS** (`docs/standards/scss.md`): extend `AutoLevelingWizard.module.scss`; palette variables; no hard-coded colours; dark scrollbars and form controls follow the theme (TH classifiers).
- **Data classification:** logs are Personal; only aggregates (numbers per ability name) leave them; test fixtures use invented names and hand-written lines.

## Evidence base used by this plan

The per-statement table in `scope.md` ("Per-statement findings", 12 rows, counts for 2026-11-14 and 2026-11-18) is the evidence record. Facts this plan adds, verified this session:

- `idleTimeoutMs` is 1000 in the default config (`autoleveling-defaults.ts:26`) and the wizard does not override it (`autoleveling-wizard-config.ts` has no `idleTimeoutMs`), so the fatal movement backstop is `Math.max(1000, 1000)` = 1000 ms (`autoleveling-engine.ts:1837`), shorter than the movement tracker's own head-of-queue timeout `HEAD_TIMEOUT_MS = 1200` (`movement/movementTracker.ts:36`). A movement reply held up by queued buff casts therefore ends the run (`:1405-1409`).
- Enemy condition is the same seven phrases in both logs and in the stock base, with the stock bands 100 / 90 / 75 / 50 / 30 / 15 / 0 (`merc-mud/2.4/src/act_info.c:417-436`; the combat line `comm.c:1225-1250`); GMCP `char_data` carries `is_fighting` but no enemy health.
- Lag is measurable from the wire: the response delay of the command that follows an ability, over a movement or `look` baseline of about 150 ms (median 148-181 ms), is median 898 ms after `kick` and 1,013 ms after `kill <keyword>` on 2026-11-18 (n = 111 and 563). It is blurred where combat text arrives in the same window, which is why Phase 19 takes its pairs from movement or `look` replies (identified by `room_data`).
- Precedents to copy: `--room-probes` (`Server.Jobs/Program.cs:54`, `DockerProbeProcessor`, `RoomProbeMiner`, `RoomHintStore`) for an ad hoc job that mines the Docker game-server logs and writes JSON; `ClassSiteData` (`Server.Dsl.csproj` codegen target, `FetchDslClassesFromWebAdhoc`) for "fetched data becomes C#"; `AutolevelUserRecords.Kinds` (`Server.Dsl/AgentApi/AutolevelUserRecords.cs:18-21`) accepts any `data` for `pref`, `buff` and `fight`, so no server change is needed for the new fields.

## Edit map

All lines as of 9191edc plus the working tree. New files are marked NEW. DSL = `C:/Projects/DSL/Server`.

| File | Line(s) | Anchor | Change | Phase |
|---|---|---|---|---|
| apps/game-client/src/features/autoleveling/autoleveling-command-text.ts | NEW | - | pure `expandCommand(cmd, keyword)`, `findUnresolvedPlaceholder(cmd)`, `isItemAction(cmd)` | 12, 15 |
| .../autoleveling-engine.ts | 236-244, 1714-1727, 2221-2251, 2318-2323 | `applyInitiationTemplate`, `sendCommand`, `initiation` | `sendCommand` expands every command with the engaged target's keyword, drops an unfilled `{name}`, refuses an unresolved placeholder with one notice per command per run; initiation uses the same helper | 12 |
| .../autoleveling-class-defaults.ts | 31, 68-92, 94-121 | `DEFAULT_BUFF_LABELS`, `defaultBuffRows`, `fightCommandFor`, `defaultFightRows` | `NEVER_DEFAULT_BUFFS` and `NEVER_DEFAULT_FIGHTS` (fog, dispel fog) applied separately; fight default `cast '<spell>'` keeps `{name}` (now expanded) | 12 |
| .../autoleveling-buff-catalog.ts | 14-26, 28-53 | `BuffCatalogEntry`, `BUFF_CATALOG`, Sanctuary `suggestInCombat` | drop the `quaff <potion>` seed (hint text instead); entry fields `successLine?`, `combatState?`, `suggestVitalsGate?`; new verified entry Dark Heal | 12, 14, 18 |
| .../autoleveling-types.ts | 27-32, 43-110, AutoLevelCriticalBuff | `AutoLevelVitalsGate`, `AutoLevelAction`, `AutoLevelCriticalBuff` | `combatState`, `enemyGate`, `retry` fields on the action kinds that carry `vitalsGate`; run-state `paused` gains `reason?` (`roundLoopTimeMs` stays the lap wait field) | 13, 14, 16 |
| apps/game-client/src/features/movement/movementTracker.ts | 36 | `const HEAD_TIMEOUT_MS = 1200;` | `export` it so the engine's backstop derives from it instead of copying the number | 16 |
| .../autoleveling-user-data.ts | 75-118, 119-123, 178-200, 511-520 | `BuffRow`, `FightRow`, `AutoLevelPrefs`, `normalizeRecord`, `getPrefs`, `setPrefs` | `BuffRow` and `FightRow` gain `combatState?`, `enemyGate?`, `retryUntilSet?`; `AutoLevelPrefs` gains `rest`, `weight`, `lapWaitMin`; per-area `pref` record for deselected targets; every new field passes `normalizeRecord` | 13, 17 |
| .../autoleveling-wizard-config.ts | 71-72, 92-121, 160-170 | `WIZARD_ROUND_LOOP_MS`, `buffToStartAction`, `fightRowToAction`, `roundLoopTimeMs: mode === 'sightsee' ? ... : WIZARD_ROUND_LOOP_MS` | map the new row fields onto actions and critical buffs; lap wait from the draft (default 3 min) instead of the fixed 3 s; `idleTimeoutMs` set explicitly | 13, 16, 17 |
| .../autoleveling-enemy-condition.ts | NEW | - | the seven phrases with their band floors; `parseEnemyCondition(line)`; `bandLabel(pct)` (phrase with "(%)") | 14 |
| .../autoleveling-cast-outcome.ts | NEW | - | failure line matchers (`You lost your concentration.`, `You can't concentrate enough.`, `You aren't fighting anyone.`, `You do not have that potion.`), `classifyOutcome(line)` | 15 |
| .../autoleveling-lag.ts | NEW | - | `effectiveLagMs(cmd, learned, serverLag)`, `lagAllowanceMs(recentSends, now)` | 16, 21 |
| .../autoleveling-engine.ts | 1560-1571, 1692-1706, 2075-2115, 462-499, 574-599, 2044 | `execAction`, `if_affect_missing`, `onCriticalBuffDropped`, `recheckBuffs`, `boundOnTerminalData`, `boundOnCreatureDeath`, `setIsFighting` | combat-state and enemy-condition gates; enemy condition tracking per encounter; serial buff queue with outcome detection and capped lag-spaced retry; item-action buffs re-armed on any drop | 14, 15 |
| .../autoleveling-engine.ts | 1405-1409, 1469-1475, 2430, 1822-1876, 1751, 1456-1465, 1486-1496 | movement `timeout` result, round-loop `catch`, fight-end `catch`, `waitForMovement`, `delayMs`, lap wait, `waitWhilePausedOrStopped` | timeouts pause with a reason; backstop `max(configured, 4 x tracker timeout) + lag allowance`; interruptible, pause-aware lap wait with a countdown notice | 16, 17 |
| .../autopilot-signals.ts | 14-24 | `createAutopilotSignals` | paused-by-timeout raises `autopilot-need-help` `{ reason: 'timeout' }` once per pause (the `error` path unchanged) | 16 |
| apps/game-client/src/components/wizard/useWizardDraft.ts | 59-110 | `WizardDraft`, `emptyDraft` | `lapWaitMin` (default 3); rest and weight fields seeded from prefs; `deselectedTargets` | 17 |
| apps/game-client/src/components/AutoLevelingWizard.tsx | 283-350, 643-660 | `onSelectArea`, `getPrefs`, Rest/Weight step props | seed rest, weight, lap wait and deselected targets on open; persist on patch (debounced, fail safe) | 17 |
| apps/game-client/src/components/wizard/RestStep.tsx, WeightStep.tsx | 19-41 / 18-30 | `Props`, `RestStep`, `WeightStep` | "Wait between laps (minutes)" control in the Rest step; values shown as saved | 17 |
| apps/game-client/src/components/wizard/CombatStep.tsx | 126-132, 181-230, 506-527, 716-870, 905-970 | `VITALS_STATS`, `VitalsGateControl`, `setBuffGate` (its `keep`), buff card, fight rows | combat-state control, enemy-condition gate control (phrase with (%)), "retry until it shows" checkbox on the affect gate; `setBuffGate` rebuilt by spreading (SETTINGS-07) | 13, 18 |
| apps/game-client/src/components/wizard/CombatHelp.tsx, RestStep help text | 71 lines | help content | end-user text for each new control | 18, 17 |
| apps/game-client/src/styles/AutoLevelingWizard.module.scss | existing | gate controls | styles for the new controls, themed | 18 |
| apps/game-client/src/features/autoleveling/autoleveling-content-types.ts, autoleveling-content.ts | 80-95 | `AutoPilotAbility` | `durationTicks?`, `lagMs?` and their normalization | 20 |
| apps/web-server/src/offline/autoleveling/classes.json | whole file | `{ "classes": [...] }` | regenerated from the running C# service (FALLBACK-01) | 20 |
| DSL: Server.Dsl/Processors/AbilityLagMiner.cs | NEW | - | rules: which pairs count, baseline, minimum samples, bounds | 19 |
| DSL: Server.Jobs/Adhoc/DockerAbilityLagProcessor.cs, Server.Jobs/Program.cs | NEW / 34-55, 69-76 | `--room-probes` flag, `DockerProbeProcessor.Run()` in the full run | new `--ability-lag` flag and a line in the full run; reads `*.jsonl` only, writes only when the Docker log folder exists | 19 |
| DSL: Server.Dsl/Cache/AbilityLagCache.cs, Server.Dsl/Models/AbilityLag.cs | NEW | - | the C# definition: per ability `LagMs` (`int?`), `Samples`, reads `wwwroot/data/ability-lag.json`, re-read on change | 19 |
| DSL: Server.Web.Public/wwwroot/data/ability-lag.json | NEW (generated) | - | aggregated lag per ability name; no names of people, no log lines | 19 |
| DSL: Server.Dsl/Models/Autopilot.cs | 114-130 | `AutoPilotAbility` | `DurationTicks` and `LagMs` as `int?` with `NullValueHandling.Ignore` | 20 |
| DSL: Server.Dsl/Cache/AutoPilotClassCache.cs | 86-135 | `BuildAbilities`, `Section` | fill from the ability (`IAbility.DurationTicks`, `Models/IAbility.cs:14`) and `AbilityLagCache` | 20 |
| DSL: Server.Dsl.Tests/AbilityLagMinerTests.cs, AbilityLagCacheTests.cs, AutoPilotClassCacheTests.cs | NEW | - | miner rules on synthetic jsonl; cache read/refresh/missing; feed fields present and omitted | 19, 20 |
| apps/game-client/src/features/autoleveling/autoleveling-class-defaults.ts | 94-121 | `defaultFightRows`, `rows.push({ cmd, cooldownSec: 0 })` | cooldown seeded from lag, recast interval from duration | 21 |
| docs/game/autopilot.md | whole | sections | new sections per behaviour (commands, retry, pause, gates, wait, remembered values, lag and duration data) | 12-22 |
| DSL: docs/autopilot/ability-lag.md, docs/autopilot/.ai-context | NEW | - | developer doc of the job, the file and the feed | 19, 20 |
| apps/game-client/src/features/autoleveling/.annotated, components/wizard/.annotated, components/.annotated | index entries | - | context the code does not show (SETTINGS-07 `keep` rule, backstop rule, queue rule) | 12-21 |

## Edge cases

| Id | Classifier | Condition | Required behaviour | Covered by |
|---|---|---|---|---|
| L1 | CMDTPL-01 | `cast 'x' {name}` sent with no engaged target (a heal or buff, out of combat) | `{name}` and its separating space are dropped; the command is sent as `cast 'x'` | P12 `autoleveling-command-text.test.ts` |
| L2 | CMDTPL-01 | the keyword contains `$&`, `$1` or a brace | replaced with a function replacer, never a pattern string; output equals the literal keyword | P12 unit test |
| L3 | CMDTPL-01 | any other unresolved `{...}` or `<...>` (a seeded `<potion>`, a typo) | refused: not sent, one notice per command per run naming the command with `<...>` text only; the run continues | P12 engine test; P15 item-action test |
| L4 | CMDTPL-01 | rows already saved with `quaff <potion>` or `{name}` (older saves, cloud-loaded) | `{name}` works through the expander; `<potion>` is refused (L3) and shown as needing a command in the Combat step | P12, P18 test |
| L5 | CMDTPL-01 | every send path | initiation, fight (`send`, `send_cooldown`), buff (`send`, `send_every_ticks`, `if_affect_missing`), in-combat command and rest/weight commands all reach `sendCommand` expanded | P12 table-driven engine test over each action kind |
| L6 | SETTINGS-07 | gate-mode switch rebuilds a buff row | every row field (including `vitalsGate`, `onceKey`, `combatState`, `enemyGate`, `retryUntilSet`) survives affect to ticks to always and back; the mode's own fields are the only ones reset | P13 test per field, P18 UI test |
| L7 | SETTINGS-01/02 | new row fields at their default | not stored (`combatState` absent = either, `retryUntilSet` absent = on for affect rows); strict structural compare | P13 `autoleveling-user-data.test.ts` |
| L8 | - | a row's state flips while it waits in the queue (a fight starts) | the combat-state gate is evaluated when the command is about to be sent, not when queued; an out-of-combat-only command is dropped from the queue, not sent | P14, P15 engine tests |
| L9 | - | enemy-condition gate with no condition line seen yet this fight | never blocks (same rule as `vitalsGate`); the condition is cleared at each new encounter and when the fight ends | P14 |
| L10 | - | a condition line about another creature (a pet, a group member) | ignored: only a line whose subject matches the tracked target's room line prefix updates the tracked band (as `boundOnCreatureDeath` matches the death line) | P14 |
| L11 | ANSI-01 | condition text with colour codes or ANSI inside the phrase | ANSI removed before matching; case-insensitive; a phrase split across chunks is not matched half | P14 |
| L12 | - | DSL's band floors are the stock base's (100/90/75/50/30/15/0) and unverified | the UI shows each phrase with its floor as "(about 50%)"; docs state the assumption; `enemyGate` compares against the floor of the band | P14 unit test of the table, P18 screenshot, P22 doc |
| L13 | RUNLOOP-03 | `You lost your concentration.` arrives after a command the player typed | only a failure inside the window of the engine's own last cast is attributed to it (FIFO per command); otherwise ignored | P15 |
| L14 | RUNLOOP-03 | the affect is already present when the cast would be sent (a true-up arrived) | nothing is sent; an in-flight retry for it is cancelled | P15 |
| L15 | RUNLOOP-03 | a cast that never takes effect | capped at 3 attempts per drop, each at least `max(known lag, 3 s)` after the previous; one terminal line when it gives up; the cap resets only when the affect is seen set or drops again | P15 |
| L16 | RUNLOOP-03 | 13 affects drop in one second (peak seen 13 and 18) | one command in flight; the rest wait in a queue in row order; spacing at least the lag between sends; no burst | P15 |
| L17 | RUNLOOP-03 | `You can't concentrate enough.` (no mana) or `You do not have that potion.` | not retried; the row waits for mana (vitals gate) or is marked out of items with one notice | P15 |
| L18 | RUNLOOP-03 | pause or stop with the queue holding commands | pause freezes the queue; resume re-checks each (affect present, state) before sending; stop clears it | P15, P16 |
| L19 | RUNLOOP-01 | a movement reply delayed past 1 s by queued casts | backstop is at least `4 x HEAD_TIMEOUT_MS + lag allowance`; the run continues | P16 |
| L20 | RUNLOOP-01 | a movement that truly never resolves | status `paused`, reason `timeout`, one terminal line; resume resyncs (`look`) and continues; not `error` | P16 |
| L21 | RUNLOOP-01 | fight-end backstop, `wait_text` and `wait_regex` timeouts, any thrown wait error in the round loop | the same pause with a reason; a deliberate stop (`stopped`), a missing route and a disabled mode still end the run | P16 |
| L22 | RUNLOOP-01 | already paused by the user when a timeout fires | no second pause line and no need-help signal | P16 |
| L23 | RUNLOOP-01 | Copilot needs-help | `autopilot-need-help` `{ reason: 'timeout', message }` once per timeout pause; none for a user pause; the `error` path unchanged | P16 `autopilot-signals.test.ts` |
| L24 | RUNLOOP-02 | Stop during a 3-minute lap wait | the run ends within 1 s of fake time | P17 fake-timer test |
| L25 | RUNLOOP-02 | pause during the lap wait | the remaining time freezes; resume continues it; paused time never counts | P17 |
| L26 | SETTINGS-01/02 | lap wait value | whole minutes 1-60; blank or invalid falls back to 3; stored only when it differs from 3 | P17 |
| L27 | SETTINGS-04 | rest and weight values written by the editor, a cloud load and an older client | all pass `normalizeRecord`; a non-string, an oversized text (over 500 characters) or a bad percent is dropped to the default | P17 |
| L28 | SETTINGS-06 | rest or weight deliberately emptied | an empty stored value stays empty (never re-seeded); an absent record seeds the defaults | P17 |
| L29 | CLOUDSYNC-03 | deselected target whose key is no longer served | kept, not applied, still exported; reapplies if the key returns; new server targets default to selected | P17 |
| L30 | CLOUDSYNC-01 | the new data | rides on kind `pref` (already in both lists): a test asserts the client kind list still equals the server `Kinds`, and a real Save/Load keeps the new fields | P17, P22 (owner step with Phase 6b) |
| L31 | CLOUDSYNC-02 | two devices edit `pref:global` (class on one, rest on the other) | newest `updatedAt` wins as a whole record; documented; a device never saves without loading and merging first (existing rule) | P17 doc, existing Phase 6 test |
| L32 | PRIVNAME-01 | the lag job reads logs full of names | output holds ability names and numbers only; fixtures use invented names; a test scans the produced JSON and the fixtures for name-shaped tokens outside the ability list | P19 |
| L33 | LOGTAIL-01 | the log folder holds `.jsonl` and `.log` twins, partial last lines, and a day's file in the previous day's folder | only `*.jsonl` read; a partial line skipped; folders listed recursively, not built from the date | P19 |
| L34 | LOGTAIL-02 | a day whose raw logging stopped (the SOH gate) | gives no samples, not zero lag; an ability with fewer than 15 samples is absent (null) | P19 |
| L35 | - | lag measurement noise | lag = median response delay of the following command minus the median baseline, bounded 0-10,000 ms, rounded to 100 ms; negative becomes 0 only when the samples agree it is below the baseline, otherwise absent | P19 |
| L36 | LOCAL-02 | the new JSON ships in `wwwroot/data` while the job and the logs exist only on the dev machine | production never runs the job; the committed file holds aggregates only; a test reads the Release output and asserts no log path or line is in it | P19 |
| L37 | - | feed field unknown | `int?` omitted from JSON (C# standard); a client built before this change ignores it; a new client against an old server reads it as unknown and uses the old defaults | P20 |
| L38 | FALLBACK-01 | the web-server's bundled snapshot predates the new fields | snapshot regenerated and a test asserts it carries the fields; the deployed container still reports `X-Maps-Source: upstream` | P20 |
| L39 | SETTINGS-01 | a saved row | existing saved rows are never rewritten to the new defaults; the duration and lag defaults apply only when a row is created (or its cooldown is 0 and no learned value exists) | P21 |
| L40 | - | learned cooldown, configured cooldown and C# lag disagree | effective = max of the three (lag is a floor, like the learned value) | P21 `autoleveling-lag.test.ts` |
| L41 | TH-01..TH-05 | new controls in the wizard | scrollbar, native selects and inputs, hover/focus/disabled/error states, placeholder and caret, live theme switch themed | P18 and P17 screenshots |

Classifiers not applicable: **SETTINGS-03** (the draft is replaced from storage on open, not merged); **SETTINGS-05** (no stored data is rewritten at startup); **EVENTBUS-01** (no new event subscription: the engine reuses its existing keyed listeners; a test in Phase 15 asserts the count of subscriptions is unchanged); **LOCAL-01, LOCAL-03, LOCAL-04, LOCAL-05** (no build flag, workspace project, second local-only feature or machine address is added; LOCAL-02 is L36); **LOGTAIL-03** (the job reads each file once from the start); **ANSI-01** (no colour conversion is added; the `{n` colour-code problem is the placeholder rule CMDTPL-01, L1-L5); **PRIVNAME-01** applies as L32; **CLOUDSYNC-02** is existing behaviour recorded as L31; **TH-05, TH-03** apply as L41 only to the controls added.

## Verification toolbox

- Game client tests: `bash -c 'cd /c/Projects/ShatteredArchive/apps/game-client && pnpm exec jest --config ../../jest.config.cjs --runInBand --testPathPatterns <pattern> 2>&1 | grep -E "Tests:|Test Suites:|FAIL|✕"'`; whole package: `pnpm --filter game-client test`.
- Coverage of changed files: `bash -c 'cd /c/Projects/ShatteredArchive/apps/game-client && pnpm exec jest --config ../../jest.config.cjs --coverage --collectCoverageFrom=<file> --testPathPatterns <pattern>'`.
- Typecheck `pnpm typecheck` (root); lint `pnpm exec eslint <changed files>`; build `pnpm --filter game-client build`; web-server `pnpm --filter web-server test` and `build`.
- C#: `dotnet test C:/Projects/DSL/Server/Server.Dsl.Tests` (baseline: the two pre-existing `PlayerBookTests` failures and an occasional unrelated flake are recorded before Phase 19, `dotnet build C:/Projects/DSL/Server -c Release` with `-p:CopilotLocal=true` for the local deploy). Job run (local only): `dotnet run --project C:/Projects/DSL/Server/Server.Jobs -- --ability-lag` and `-- --ability-lag --dry-run`.
- Snapshot regeneration (C# up): `AUTOLEVELING_CLASSES_URL=http://localhost:5000/maps/autoleveling/classes pnpm --filter game-client extract:autoleveling-classes`.
- Local deploy: `Server/deploy-local.ps1` (C#), `docker compose -f deploy/docker-compose.shattered-archive-experimental.yml build web-server` then `up -d --no-deps web-server`, game client rebuilt as in the active plan (the standing go to rebuild for live checks). Never start, stop or kill other processes.
- Live checks: `GET http://localhost:5000/maps/autoleveling/classes` (fields present), `curl -sk -D - https://game-client.shatteredarchive.dev/api/web/maps/autoleveling/classes` (`X-Maps-Source: upstream`).
- Screenshots: Shattered-AI `tools/browser-test` (`autoleveling.mjs`, `autopilot-combat-prefill.mjs`, `autopilot-pause-check.mjs` as shapes), against the running game client (`http://localhost:30080/`); progress shots `phase-NN_<name>.png`, finals via `saveShowcase` to `screenshots/showcase/showcase_NN_<name>.png`. Test account only; no real names in any shot.
- Real-session checks the owner runs (cannot be automated here): one live autopilot lap with debug on (`localStorage['autoleveling.debug']='1'`) to confirm no stop and the retry lines; recorded as Deferred in the final phase if not run.

## Phases

Status is read from the boxes (A1). A phase heading is ticked only when every Work box and its Sign-off box are ticked. Workflow ids W4 to W7 are the before and after diagrams in the parent plan (see "Workflows").

### [x] Phase 12 — Commands reach the game as real commands, and fog never pre-fills (items 5, 11, 6a)
Goal:        no `{name}` or `<...>` placeholder is sent to the game on any send path, a placeholder with no value is dropped or refused, and fog / dispel fog are never pre-filled.
Depends on:  nothing (Phase 6b is independent).
Workflow:    W5

Work
- [x] 12.1 `features/autoleveling/autoleveling-command-text.ts` NEW: `expandCommand(cmd, keyword | null)` (function replacer; with no keyword removes `{name}`, `{target}`, `{keyword}` and the space before it; collapses double spaces), `findUnresolvedPlaceholder(cmd)` (`{...}` or `<...>` left after expansion), `isItemAction(cmd)` (first word `quaff|brandish|zap|recite|eat|drink`).
- [x] 12.2 `autoleveling-engine.ts:1714-1727` (`sendCommand`): expand with the engaged target's keyword (`this.lastEncounterMatch`), refuse an unresolved placeholder with `writeAutoLevelLine` once per command per run (Set cleared in `start()`); `:236-244` and `:2251`, `:2323` use `expandCommand` (initiation unchanged in behaviour).
- [x] 12.3 `autoleveling-class-defaults.ts:31,68-121`: `NEVER_DEFAULT_BUFFS` and `NEVER_DEFAULT_FIGHTS` (`fog`, `dispel fog`, compared lowercase) filter `defaultBuffRows` and `defaultFightRows` separately (owner decision D2); the manual ability picker is unchanged.
- [x] 12.4 `autoleveling-buff-catalog.ts:29`: Sanctuary no longer seeds `quaff <potion>`; `autoleveling-class-defaults.ts:48` seeds nothing; `CombatStep.tsx:850` placeholder text already says what to type.
- [x] 12.5 Tests: `autoleveling-command-text.test.ts`: L1 (no keyword), L2 (`$&`, `$1`, braces in the keyword), L3 (`<potion>`, `{typo}`), `isItemAction` for each verb and for `cast`.
- [x] 12.6 Tests: `autoleveling-engine.test.ts` (new `describe('commands are real (live findings 2026-11-14)')`): L5 table-driven over `send`, `send_cooldown`, `send_every_ticks`, `if_affect_missing`, the in-combat command, rest and weight commands, and the initiation command: the string handed to `shatteredarchive:send-command` has no `{`...`}` or `<`...`>`; L3 refusal prints one line and the run continues; L4 a saved row with `<potion>` is refused.
- [x] 12.7 Tests: `autoleveling-class-defaults.test.ts`: a class whose offensive list holds fog and dispel fog gets neither in `defaultFightRows`, and a synthetic buff list holding fog gets none in `defaultBuffRows` (each list tested alone, D2); a class with only fog as offense gets no rows, not fog.
- [x] 12.8 Docs and indexes: `features/autoleveling/.annotated` (the expander and why: one path for every command, 2026-11-14 evidence); `docs/game/autopilot.md` new "Commands sent to the game" section; end-user: `CombatHelp.tsx` sentence that `{name}` is replaced by the target keyword and an item command must be filled in (placeholder text is never sent).

Sign-off
- [x] 12.S Exit gate verified and recorded in test-results.md "Phase 12" (2026-11-18): build OK · typecheck OK · lint OK · all game-client tests pass · coverage of the new module and the changed branches reviewed · documentation written.

State on exit: every command the engine sends is a real command; defaults exclude fog; nothing new is user-visible except notices.

### [x] Phase 13 — Row model for the new options, persisted and carried (no behaviour yet)
Goal:        buff and fight rows can hold a combat state, an enemy-condition gate and a retry flag; they survive save, load, cloud import and a gate-mode switch; the config carries them to the engine, which ignores them until Phase 14.
Depends on:  Phase 12.
Workflow:    W5

Work
- [x] 13.1 `autoleveling-types.ts:27-32,43-110`: `AutoLevelCombatState = 'in' | 'out'` (absent = either), `AutoLevelEnemyGate { op: 'above' | 'below'; band: 0|15|30|50|75|90|100 }` (the floor of a condition band), `retry?: boolean` on the action kinds that carry `vitalsGate`; `AutoLevelCriticalBuff` gains `retry?`.
- [x] 13.2 `autoleveling-user-data.ts:75-118`: `BuffRow` and `FightRow` gain `combatState?`, `enemyGate?`, (`BuffRow`) `retryUntilSet?`; `:178-200` `normalizeRecord` drops an unknown `combatState`, a band not in the list, a non-boolean flag, leaving the rest of the record.
- [x] 13.3 `autoleveling-wizard-config.ts:92-121` map the fields (`buffToStartAction`, `fightRowToAction`, `buffToCriticalBuff`).
- [x] 13.4 `CombatStep.tsx:506-527` `setBuffGate` rebuilt by spreading the row and deleting only the previous mode's own fields (SETTINGS-07); the existing `keep` list is replaced.
- [x] 13.5 Tests: `autoleveling-user-data.test.ts`: round trip of every new field through `setBuffOverlay`/`getBuffOverlay`, fight overlay, `exportAll` and `importRecords`; malformed values dropped without dropping the record (L7, L27 shape); defaults not stored (L7).
- [x] 13.6 Tests: `autoleveling-wizard-config.test.ts`: each new field appears on the action; absent fields leave the action unchanged (existing tests untouched).
- [x] 13.7 Tests: `CombatStep.test.tsx`: L6 for every row field across affect to ticks to always and back (a failing list when a field is added to `BuffRow` without a case: the test enumerates `keyof BuffRow` from a typed fixture).
- [x] 13.8 Docs and indexes: `features/autoleveling/.annotated` and `components/wizard/.annotated` (replace the "every new BuffRow field must be carried through its keep" warning with the spread rule); `docs/game/autopilot.md` "Row options" stub that Phases 14-18 complete.

Sign-off
- [x] 13.S Exit gate verified and recorded in test-results.md "Phase 13" (2026-11-18): the standard gate (build, typecheck, lint, all tests of the touched packages, coverage of new code reviewed, documentation written).

State on exit: rows can carry the options and keep them; behaviour unchanged.

### [x] Phase 14 — Engine gates: combat state and enemy condition, and condition-gated rows between fights (items 8, 9, 12)
Goal:        a row marked in-combat-only or out-of-combat-only is sent only in that state; a row with an enemy-condition gate fires only while the enemy is above or below the chosen band; a heal-type row with a gate runs between fights until its condition holds.
Depends on:  Phase 13.
Workflow:    W5

Work
- [x] 14.1 `autoleveling-enemy-condition.ts` NEW: `CONDITION_BANDS` (excellent 100, a few scratches 90, wounds and bruises 75, quite a few wounds 50, big nasty wounds and scratches 30, pretty hurt 15, awful condition 0, bleeding to death below 0), `parseEnemyCondition(line)` (ANSI stripped, case-insensitive, returns the subject prefix and the band floor), `bandLabel(floor)` phrase plus "(about N%)".
- [x] 14.2 `autoleveling-engine.ts:462-499` (`boundOnTerminalData`): new `trackEnemyCondition(text)` after `trackRoundBoundary`; keeps `enemyBand` for the tracked target only (subject matches the target's room line prefix, as `:591-593`), cleared in `setIsFighting` (`:2044`) on a new encounter and on fight end (L9, L10, L11).
- [x] 14.3 `:1560-1571` `execAction`: a `combatStateAllows(a)` and `enemyGateSatisfied(a.enemyGate)` check beside `vitalsGateSatisfied` (state evaluated at send time, L8); unknown enemy band never blocks (L9).
- [x] 14.4 `:2101-2115` `recheckBuffs`: also includes `send` actions that carry `vitalsGate`, `combatState` or `enemyGate` (condition-gated heals); ungated every-round buffs stay excluded as today.
- [x] 14.5 `autoleveling-buff-catalog.ts`: `BuffCatalogEntry` gains `combatState?`, `suggestVitalsGate?`, `successLine?`; new entry Dark Heal: `cast 'dark heal'`, no affect, `combatState: 'out'`, `suggestVitalsGate { hp below 70 }`, `successLine` the verified `A dark healing fills your body.` (seen after 10 of 52 and 12 of 18 casts on the two days); not in `DEFAULT_BUFF_LABELS` (catalog only).
- [x] 14.6 Tests: `autoleveling-enemy-condition.test.ts`: every phrase to its floor; a phrase inside a longer line; ANSI inside the phrase; subject of another creature; the table equals the stock bands (L12).
- [x] 14.7 Tests: `autoleveling-engine.test.ts`: out-only buff not sent while `is_fighting` and sent after (L8); in-only buff the reverse; a state flip between queue and send drops it; `enemyGate below 'big nasty wounds'` fires only after a matching line and not before any line (L9); a pet's condition line does not change the gate (L10); condition reset on the next encounter; a Dark Heal row with `hp below 70` runs in `recheckBuffs` after a fight and not at 90% hp; own vitals AND enemy gate both required (owner decision "two thresholds on one row").
- [x] 14.8 Docs and indexes: `.annotated` (condition tracking and the unknown-never-blocks rule); `docs/game/autopilot.md` "Gates" section incl. the unverified-bands note (L12).

Sign-off
- [x] 14.S Exit gate verified and recorded in test-results.md "Phase 14" (2026-11-18): the standard gate (build, typecheck, lint, all tests of the touched packages, coverage of new code reviewed, documentation written).

State on exit: the engine honours the new fields when a row carries them; no UI sets them yet except the catalog's Dark Heal.

### [x] Phase 15 — Buff queue: one command at a time, outcome detection, capped retry (items 1, 2, 3 tail, 6b)
Goal:        a buff or heal that fails or drops is re-armed without waiting for the next kill, one command in flight, spaced by lag, capped, with a visible give-up; item actions (quaff, brandish, zap) are re-armed on any drop.
Depends on:  Phase 14.
Workflow:    W5

Work
- [x] 15.1 Tests (`autoleveling-engine.test.ts`, new `describe('buff queue, outcomes and retry')`, fake timers):
- [x] 15.2 `autoleveling-cast-outcome.ts` NEW: `classifyOutcome(line)` returns `failed` (`You lost your concentration.`), `no-mana` (`You can't concentrate enough.`), `not-fighting` (`You aren't fighting anyone.`), `no-item` (`You do not have that potion.`), or null; matches after ANSI removal.
- [x] 15.3 `autoleveling-engine.ts`: new private `buffQueue` (rows in config order, one in flight): `enqueueRearm(affect | row)`; `drainBuffQueue()` sends one command through `sendCommand`, then waits for the first of: `game:affect-added` for the row's affect, the catalog's `successLine`, a failure line from `classifyOutcome` within the window of this cast (L13), or the window end (`max(effective lag, 3 s)`); on failure/no outcome retries up to 3 attempts per drop spaced `max(lag, 3 s)` (L15), then one terminal line "gave up on <ability>" and the queue moves on; `no-mana` waits for the mana gate (no retry), `no-item` marks the row out of items for the run with one notice (L17).
- [x] 15.4 `:2075-2099` `onCriticalBuffDropped` and the `game:affect-removed` listener at `:1071-1082`: every drop calls `enqueueRearm` instead of a direct `void sendCommand` (L16); item-action rows (`isItemAction(cmd)`) are re-armed on any drop in or out of combat, spell rows keep the post-fight recheck plus a retry only when the cast failed or the state allows it (combat state, L8); a true-up that shows the affect cancels the pending retry (L14).
- [x] 15.5 `:1692-1706` `if_affect_missing` enqueues through the same queue (single send path) and honours `retry` (default on for affect rows, off when `retryUntilSet === false`).
- [x] 15.6 Pause freezes the queue, resume re-checks each entry (affect present? state allows?), stop clears it (L18).
- [x] 15.7 13 affects removed in one tick: sends are serial and at least the lag apart (L16); order equals the row order.
- [x] 15.8 cast, failure line within the window: retried after the spacing, at most 3 times, then exactly one give-up line (L15); success (affect-added) on attempt 2 stops it and resets the counter; a failure line outside the window (the player's own cast) is ignored (L13); a true-up showing the affect cancels the retry (L14); `no-mana` is not retried (L17); `no-item` is not retried and notes once; a Dark Heal row retries until `hp` passes its gate.
- [x] 15.9 item-action buff (`quaff haste`): re-armed on a mid-fight drop and on an out-of-combat drop; a spell row is not recast mid-fight unless its state allows; subscription count unchanged (EVENTBUS-01 not applicable).
- [x] 15.10 pause during a retry wait and resume; stop clears the queue.
- [x] 15.11 `autoleveling-cast-outcome.test.ts`: each line, ANSI around it, near-miss text.
- [x] 15.12 Docs and indexes: `.annotated` (queue rule: only `enqueueRearm` sends re-arm commands); `docs/game/autopilot.md` "Re-arming buffs" (retry cap, spacing, give-up, no retry for no mana or no item); end-user text drafted for Phase 18.

Sign-off
- [x] 15.S Exit gate verified and recorded in test-results.md "Phase 15" (2026-11-18): the standard gate (build, typecheck, lint, all tests of the touched packages, coverage of new code reviewed, documentation written).

State on exit: re-arming is serial and bounded; the only user-visible change is the terminal lines; the retry checkbox lands in Phase 18.

### [ ] Phase 16 — A timeout pauses the run instead of stopping it, with a backstop that does not undercut the tracker (items 1, 3)
Goal:        movement, fight-end and wait timeouts pause the run with a visible reason, the movement backstop is longer than the tracker's own timeout plus queued lag, and Copilot is told.
Depends on:  Phase 15 (lag allowance counts the queue's sends).
Workflow:    W4

Work
- [x] 16.1 `autoleveling-lag.ts` NEW: `effectiveLagMs(cmd, learnedSec, serverLagMs)` (max of the three, L40 lands fully in Phase 21), `lagAllowanceMs(recentSends, now)` = sum of the lag of commands sent in the last 10 s, capped at 20 s.
- [x] 16.2 `autoleveling-engine.ts:1837` `waitForMovement`: `t = max(timeoutMs, 4 x 1200) + lagAllowanceMs(...)` (the 1200 constant is exported from `movementTracker.ts:36`, a one-word edit to that file, not copied); `autoleveling-wizard-config.ts` sets `idleTimeoutMs` explicitly (5000) so the value is visible in the config (L19).
- [x] 16.3 `:1405-1409`, `:2430`, `:1469-1475`: replace `status: 'error'` plus `stopping = true` by `pauseForTimeout(reason)`: `this.paused = true`, run state `paused` with `reason`, terminal line `paused: <what timed out>; press Resume`; thrown errors named `stopped` or the route/mode failures at `:1273` still end the run (L21). Resume uses the existing resync (`:1486-1509`) and re-sends nothing that was interrupted (L20).
- [x] 16.4 `autoleveling-types.ts:318-325` the `paused` variant gains `reason?: 'user' | 'flee' | 'timeout'`; `pause()` at `:1154` unchanged for the user (sets `reason: 'user'`).
- [x] 16.5 `autopilot-signals.ts:14-24`: when status becomes `paused` with `reason: 'timeout'`, dispatch `shatteredarchive:autopilot-need-help` `{ reason: 'timeout', message }` once per pause; none for user pauses (L22, L23). `features/copilot/autopilotLink.ts` already forwards the event.
- [x] 16.6 Tests: `autoleveling-engine.test.ts`: a reply 2.5 s late with queued casts does not end the run (L19); no reply at all pauses, status `paused` reason `timeout`, not `error`, then `resume()` resyncs and continues (L20); fight-end backstop, `wait_text` and `wait_regex` timeouts pause (L21); user already paused: no second line (L22); `stop()` and a disabled mode still end the run.
- [x] 16.7 Tests: `autopilot-signals.test.ts`: need-help once per timeout pause, none for a user pause or a flee pause, `error` unchanged (L23).
- [x] 16.8 Tests: `autoleveling-lag.test.ts`: allowance sums recent sends and caps.
- [x] 16.9 Tests: `features/copilot/autopilotLink.test.ts`: the forwarded event carries the reason.
- [ ] 16.10 UI check: a Playwright run of `autopilot-pause-check.mjs` shape: force a timeout (route to a room with no reply on the test stack) and photograph the wizard in `paused` with the reason line, `phase-16_timeout-paused.png`. If the stack cannot produce a stall without killing a process, the unit proof stands and the shot is replaced by the pause shot of a user pause (recorded in test-results.md). **deferred:** the screenshot of a real timeout pause (`phase-16_timeout-paused.png`) was not taken. A genuine stall needs a connected game session and a stopped reply, which the agent may not arrange without stopping a process. The header text and the whole pause flow are proven by tests (`AutoLevelingWizard.status.test.ts`, `autoleveling-engine.pause.test.ts`). Waits on the owner: one live lap, or a staged stall, while the wizard is open.
- [x] 16.11 Docs and indexes: `.annotated`; `docs/game/autopilot.md` "Pause and stop" (which events pause, which end the run, the backstop rule and why); `docs/copilot/client.md` need-help reasons.

Sign-off
- [ ] 16.S Exit gate: the standard gate (build, typecheck, lint, all tests of the touched packages, coverage of new code reviewed, documentation written). (everything but 16.10 was verified and recorded in test-results.md "Phase 16" on 2026-11-18; sign off when that step is done)

State on exit: no timeout ends a run; the owner's "stops completely" cases pause with a reason.

### [x] Phase 17 — Rest, weight, lap wait and selected targets are remembered; the lap waits (items 4, 10)
Goal:        the rest step, the weight step, the wait between laps and which targets are selected survive closing the wizard and a cloud round trip; the lap wait defaults to 3 minutes, is set in whole minutes, and Stop and Pause work during it.
Depends on:  Phase 13.
Workflow:    W6

Work
- [x] 17.1 `autoleveling-user-data.ts:119-123,511-520`: `AutoLevelPrefs` gains `rest { startOfRound, endOfRound, duringRound }`, `weight { atOrAbovePct, commands }`, `lapWaitMin`; `normalizeRecord` validates them (L27); per-area record kind `pref`, id `pref:targets:<areaSlug>`, data `{ deselected: string[] }`, new `getTargetSelection(slug)` / `setTargetSelection(slug, ids)`; only values that differ from the defaults are stored (L26, SETTINGS-01).
- [x] 17.2 `useWizardDraft.ts:59-110`: `lapWaitMin` (default 3) and the selection; `AutoLevelingWizard.tsx:283-350` seeds them in `onSelectArea` (`getPrefs` already runs there) and a debounced effect writes changes through `setPrefs` / `setTargetSelection`, failing safe (L27, L28).
- [x] 17.3 `RestStep.tsx`: "Wait between laps" minutes field (1-60) with help text ("creatures need time to return"); `autoleveling-wizard-config.ts:72,167`: `roundLoopTimeMs = lapWaitMin x 60000` for every mode, replacing `WIZARD_ROUND_LOOP_MS = 3_000` (sightsee keeps its engine default).
- [x] 17.4 `autoleveling-engine.ts:1456-1465,1751`: the lap wait becomes `waitInterruptible(ms)`: slices of at most 500 ms, ends on stop (throws `stopped` as `waitWhilePausedOrStopped` does), freezes while paused (paused time never counts, as `waitForRecovery` at `:697-716`), and writes one terminal line "waiting 3:00 for creatures to return" (L24, L25).
- [x] 17.5 Tests: `autoleveling-user-data.test.ts`: rest/weight/lap round trip, empty stays empty (L28), absent seeds defaults, invalid dropped to defaults (L27), selection store keeps an unmatched id and a new target defaults to selected (L29), the client kind list equals the server `Kinds` (L30).
- [x] 17.6 Tests: `useWizardDraft.test.ts` and `AutoLevelingWizard.targets.test.tsx`: close and reopen restores rest, weight, lap wait and the unchecked targets; a storage failure shows defaults and does not throw.
- [x] 17.7 Tests: `autoleveling-engine.test.ts` (fake timers): a 3-minute wait takes 180 s of fake time; `stop()` ends it within 1 s (L24); a pause freezes it and resume completes the remaining time (L25).
- [x] 17.8 Tests: `autoleveling-wizard-config.test.ts`: `roundLoopTimeMs` follows `lapWaitMin` and defaults to 180,000.
- [x] 17.9 UI check: `phase-17_rest-step.png` (the lap-wait field, saved values after reopening), light and dark theme (L41).
- [x] 17.10 Docs and indexes: `docs/game/autopilot.md` "Remembered values" (what is stored where, `pref:global` and `pref:targets:<area>`, last-writer-wins, L31); `.annotated`; end-user: help text beside the lap-wait field and a sentence in `CombatHelp.tsx`-style help for the Rest step.

Sign-off
- [x] 17.S Exit gate verified and recorded in test-results.md "Phase 17" (2026-11-18): the standard gate (build, typecheck, lint, all tests of the touched packages, coverage of new code reviewed, documentation written).

State on exit: the wizard remembers its step values; laps wait the chosen time.

### [x] Phase 18 — Wizard controls for the new row options, the retry marker and Dark Heal (items 2, 8, 9, 12)
Goal:        a player can mark a buff or fight row in-combat only or out-of-combat only, add an enemy-condition threshold shown as a phrase with its percent, switch retry on or off, and add Dark Heal from the catalog.
Depends on:  Phases 14, 15.
Workflow:    W5

Work
- [x] 18.1 `CombatStep.tsx:126-230,716-870,905-970`: `CombatStateControl` (either / in combat / out of combat), `EnemyGateControl` (above / below plus a select of the seven phrases, each shown with "(about N%)" from `bandLabel`), a "retry until it shows" checkbox on affect-gated buff rows (default on, phrase for the owner's review as it was asked to be reviewed: "Retry until the affect shows"); shown on buff cards and fight rows next to `VitalsGateControl`; rows with an unresolved `<...>` command show a "fill in the command" warning (L4).
- [x] 18.2 `CombatHelp.tsx`: end-user text for each control, including that the percents are approximate (L12) and that enemy conditions are only known during a fight.
- [x] 18.3 `AutoLevelingWizard.module.scss`: the new controls, themed (L41).
- [x] 18.4 `ReviewStep.tsx`: the review summary lists the new options on a row ("only out of combat", "enemy below ...").
- [x] 18.5 Tests: `CombatStep.test.tsx`: each control writes its field and clears it; mode switches keep the fields (L6); the phrase labels equal `bandLabel`; the retry checkbox writes `retryUntilSet: false` only when unchecked (L7); `ReviewStep.test.tsx` summary; a11y labels present.
- [x] 18.6 UI check: `phase-18_combat-options.png` (a buff row with all three controls open, dark and light), with a long list so the scrollbar is visible (TH-01), via a new `autopilot-combat-options.mjs` in the browser-test tools folder.
- [x] 18.7 Docs and indexes: `components/wizard/.annotated`; `docs/game/autopilot.md` "Row options" completed; end-user text as above.

Sign-off
- [x] 18.S Exit gate verified and recorded in test-results.md "Phase 18" (2026-11-19): the standard gate (build, typecheck, lint, all tests of the touched packages, coverage of new code reviewed, documentation written) · screenshots viewed.

State on exit: the new options are visible and persist; with Phases 14-15 they act.

### [x] Phase 19 — C#: measured skill lag, an ad hoc job and a definition (item 7, part 1)
Goal:        an ad hoc C# job mines the Docker game-server logs for the lag each ability puts on the next command and saves it as `wwwroot/data/ability-lag.json`, which a C# cache serves; it writes only when the logs exist (local development).
Depends on:  nothing in the client (can run first).
Workflow:    W7

Work
- [x] 19.1 Tests (`Server.Dsl.Tests`, `async Task`, `IAsyncLifetime` scratch folder): `AbilityLagMinerTests.cs`: a synthetic jsonl with invented ability names reproduces a known lag; fewer than 15 pairs gives no entry (L34); a baseline-only day gives no entry; combat text in the window is not used as B's response (L35); alias spellings map to one ability; a `.log` twin and a partial last line are ignored (L33); the written file holds no token outside the ability names and numbers (L32). `AbilityLagCacheTests.cs`: missing, damaged, refreshed file. A Release-output test reads the build without the dev property and asserts no log path is in the JSON (L36).
- [x] 19.2 **Proof step first:** a throw-away run of the rule on 2026-11-14 and 2026-11-18 prints the distribution for five abilities (a fight skill, two buffs, a heal, a movement); the owner confirms the numbers look right for abilities whose lag they know before the job is wired. If the rule cannot separate the lag from combat text, stop and ask (AskUserQuestion) for the alternative (the game's own help text, or a measured `look` after each cast only).
- [x] 19.3 `Server.Dsl/Processors/AbilityLagMiner.cs` NEW (rules, as `RoomProbeMiner`): a pair is an ability command A followed within 1.5 s by a movement or `look` command B; the response is the `room_data` GMCP of B; lag(A) = median(response delay of B) minus the median baseline (B after a movement), over at least 15 pairs, bounded 0-10,000 ms, rounded to 100 ms; commands are normalised to the ability name (`c sanc`, `cast 'sanctuary'` to `sanctuary`) through `AbilityCache`; inputs are only `game:client:input`, `game:remote-server:raw` and `gmcp` records.
- [x] 19.4 `Server.Jobs/Adhoc/DockerAbilityLagProcessor.cs` NEW and `Server.Jobs/Program.cs:34-55,69-76`: flag `--ability-lag` (with `--dry-run`) beside `--room-probes`, and a line next to `DockerProbeProcessor.Run()` in the full run; the log folder from `DOCKER_ROOM_DIR` or the default as in `DockerProbeProcessor`; missing folder returns with a message and writes nothing (L36); reads `*.jsonl` only, recursively (L33).
- [x] 19.5 `Server.Dsl/Models/AbilityLag.cs`, `Server.Dsl/Cache/AbilityLagCache.cs` NEW: `AbilityLag { Name, LagMs (int?), Samples }`; the cache reads `wwwroot/data/ability-lag.json`, re-reads on change, missing or damaged file means "no data", never an error (as `RoomHintStore`).
- [x] 19.6 `Server.Web.Public/wwwroot/data/ability-lag.json` NEW: `{ generated, abilities: { <name>: { lagMs, samples } } }`.
- [x] 19.7 Docs and indexes: the `Server.Web.Public/wwwroot/data` index entry for the new file; `Server.Dsl/Processors` and `Cache` indexes; DSL `docs/autopilot/ability-lag.md` NEW (how the rule works, how to run it, that it never runs in production) and `docs/autopilot/.ai-context`.

Sign-off
- [x] 19.S Exit gate verified and recorded in test-results.md "Phase 19" (2026-11-19): `dotnet build -c Release` no new warnings · `dotnet test Server.Dsl.Tests` equals the recorded baseline plus the new tests · coverage of the miner and cache.

State on exit: the data and the C# definition exist; nothing consumes them yet.

### [x] Phase 20 — The class feed carries duration and lag; the snapshot and client types follow (item 7, part 2)
Goal:        `GET /maps/autoleveling/classes` carries `durationTicks` and `lagMs` per ability when known; the web-server snapshot and the client types carry them.
Depends on:  Phase 19.
Workflow:    W7

Work
- [x] 20.1 DSL `Models/Autopilot.cs:114-130` (two `int?` with `NullValueHandling.Ignore`), `Cache/AutoPilotClassCache.cs:86-135` (fill from the ability's `DurationTicks` and `AbilityLagCache`); client `autoleveling-content-types.ts:80-95` and `autoleveling-content.ts` (normalise: a non-number becomes unknown); regenerate `apps/web-server/src/offline/autoleveling/classes.json` from the running C# service (the existing extract script).
- [x] 20.2 Tests: `AutoPilotClassCacheTests.cs` (new): an ability with a duration and lag carries both, one with neither omits both from the JSON (L37); `autoleveling-content.test.ts` normalisation; a web-server test that the snapshot carries the fields for at least one known ability (L38).
- [x] 20.3 API check: `GET http://localhost:5000/maps/autoleveling/classes` after `deploy-local.ps1`: status 200, a known ability (name placeholder in the record) has both fields, an unknown one has neither; `curl -sk -D - https://game-client.shatteredarchive.dev/api/web/maps/autoleveling/classes` shows `X-Maps-Source: upstream`.
- [x] 20.4 Docs and indexes: `docs/web-server.md` snapshot note, `docs/autopilot/ability-lag.md` feed section, indexes.

Sign-off
- [x] 20.S Exit gate verified and recorded in test-results.md "Phase 20" (2026-11-19): the standard gate (build, typecheck, lint, all tests of the touched packages, coverage of new code reviewed, documentation written) for DSL, web-server and game-client; local deploy done; live check recorded.

State on exit: the data reaches the client unused.

### [x] Phase 21 — The client defaults recast intervals and cooldowns from the C# data (item 7, part 3)
Goal:        a new tick-buff row recasts on a default derived from the ability's duration, and a fight row's cooldown and every retry spacing is never below the ability's known lag.
Depends on:  Phase 20, Phase 16 (the lag helper).
Workflow:    W7

Work
- [x] 21.1 `autoleveling-lag.ts` `effectiveLagMs` = max(configured, learned, serverLag) (L40); `autoleveling-engine.ts:1587-1620` `send_cooldown` uses it; `autoleveling-class-defaults.ts:36-52,94-121` new rows seed `refreshTicks = max(1, durationTicks - 1)` (a duration of 0 gives 1) and `cooldownSec = lagMs/1000` when no learned value exists; existing saved rows are not touched (L39); the lag floor also feeds Phase 15 spacing.
- [x] 21.2 Tests: `autoleveling-lag.test.ts` (max of three, unknowns ignored); `autoleveling-class-defaults.test.ts` (seed from duration and lag, absent data keeps today's 6 ticks and 0); `autoleveling-engine.test.ts` (`send_cooldown` waits the lag floor; a saved row's cooldown is unchanged).
- [x] 21.3 UI check: `phase-21_prefill-from-data.png` of a class pre-fill showing the derived intervals.
- [x] 21.4 Docs and indexes: `docs/game/autopilot.md` "Timing defaults"; `.annotated`; end-user: one sentence in `CombatHelp.tsx` that defaults come from measured game data and can be edited.

Sign-off
- [x] 21.S Exit gate verified and recorded in test-results.md "Phase 21" (2026-11-19): the standard gate (build, typecheck, lint, all tests of the touched packages, coverage of new code reviewed, documentation written).

State on exit: item 7 is complete end to end.

### [x] Phase 22 — Final verification, documentation sweep, showcase and the mobile contract note
Goal:        everything is green with coverage, every new behaviour is documented, the showcase shots exist and the mobile port knows the engine contract changed.
Depends on:  Phases 12-21.
Workflow:    none

Work
- [x] 22.1 documentation sweep (every feature this plan created or changed has an up-to-date `docs/game/autopilot.md` section and end-user text; DSL `docs/autopilot/`); `.annotated` and `.ai-context` sweep; a note in the active plan's Phase 9 (mobile engine port) listing the behaviours to port (command expansion, queue and retry, pause on timeout, gates, lap wait, remembered values, lag data) as an amendment; the showcase set.
- [x] 22.2 Tests: none new (doc-only plus verification) beyond closing coverage gaps found in the sweep.
- [x] 22.3 API check: the class feed and snapshot check repeated on the final build. (run again on 2026-11-19: `GET /maps/autoleveling/classes` on the running C# service answered 200 with 48 classes, 5,036 abilities, 1,284 with `durationTicks`, 468 with `lagMs`, 3,499 with neither; the web proxy served it with the long cache header, not the offline snapshot)
- [x] 22.4 UI check: `showcase_01_combat-options.png`, `showcase_02_rest-lap-wait.png`, `showcase_03_paused-timeout.png` (finals via `saveShowcase`, dark theme, test account, no real names). (amended: the planned `showcase_03_paused-timeout.png` was replaced by `showcase_03_review-options.png` for the same reason as the open box 16.10; a fourth shot `showcase_04_pause-help.png` was added with the end-user text; no light-theme shot was taken)
- [x] 22.5 Docs and indexes: as above (the documentation sweep).
- [x] 22.6 Documentation recheck on the owner's request (2026-11-19, amendment A1): the first sweep missed items; found and fixed a stale feature-doc intro, a stale folder-index entry, the sync-contract doc and the tooling indexes (listed in test-results.md "Documentation audit").
- [x] 22.7 End-user text for a run that pauses itself (owner choice, A1): the status line reads "Paused: <what>. Press Resume to continue." and the Combat help has a section "When autopilot pauses itself"; tests `AutoLevelingWizard.status.test.ts` and `CombatHelp.test.tsx`; screenshot `phase-22_pause-help.png`, final `showcase_04_pause-help.png`.
- [x] 22.8 Guards added after a bare jest run used about 112 GB of memory (A1): `maxWorkers: 4` in `jest.config.cjs`, the hook `.claude/hooks/jest-guard.js`, `scripts/check-jest-workers.mjs` and a CI step; and the documentation guard `scripts/check-doc-impact.mjs` with its rule in the workflow doc and the skills.

Sign-off
- [x] 22.S Exit gate verified and recorded in test-results.md "Phase 22" (2026-11-19): full game-client build, typecheck, lint, test with coverage of every changed file; web-server test and build; `dotnet build -c Release` and the whole `Server.Dsl.Tests` against the baseline; local deploy; a list of the deferred owner steps (a live lap with debug on, the Phase 6b Save/Load line for the new fields, reading the first lag file) in test-results.md.

State on exit: the twelve findings are addressed in code, tests and docs; owner sign-off is the last step.

## Risks and rollback

- **The working tree is shared.** `git status` shows uncommitted autopilot edits by the other plan (`AutoLevelingWizard.tsx`, `ReviewStep.tsx`, `useWizardDraft.ts`, `autoleveling-user-data.ts`, route-override work and their tests). Every phase re-confirms its anchors against the working tree first (`/implement-plan` step 1) and records the drift as amendments. Rollback is per phase: each phase's files are listed in the Edit map; nothing is committed by the work.
- **Lag measurement may not separate cleanly from combat text** (Phase 19 proof step): fall back to a decision with the owner rather than ship a number nobody checked.
- **Enemy bands are the stock base's, not verified for DSL** (L12); the UI says "about" and the docs say so.
- **The retry, queue and pause changes touch the engine's core loop**; every behaviour has a fake-timer test, and a live lap with debug on is the owner's final check (deferred if not run).
- **Copilot** now sees a need-help signal for a timeout pause; if that proves noisy it is one `dispatch` line in `autopilot-signals.ts`.
- **A new `int?` field on a public feed** is optional and omitted when unknown; old clients ignore it, so rollout order does not matter.
- Rollback of the C# job: delete the flag line and the JSON; the feed fields become unknown and the client returns to today's defaults.

## Plan amendments

(empty at creation; `/implement-plan` adds dated entries A1, A2, ... when the code has moved since this plan)

**A1 (2026-11-19, owner request, minor):** (a) the plan was restructured to the new tech-plan shape (`.claude/skills/tech-plan/SKILL.md`): each phase is a Goal, a numbered Work checklist and a Sign-off box, with the old Changes, Tests, API check, UI check, Index/docs and Exit gate text kept inside the boxes; the before and after diagrams live in the parent plan (W4-W7). (b) While restructuring, boxes were checked against `test-results.md`: Phase 16's screenshot of a real timeout pause was never taken (it was recorded as skipped verification) and now stays an open, deferred box, so Phase 16 reads as open; Phase 22's repeat of the class-feed API check was run on 2026-11-19 and ticked. (c) Work added to Phase 22 after its first close, on the owner's recheck: the documentation recheck and fixes, the end-user text for a paused run, the jest guards and the doc-impact check. Wider impact: none on behaviour; the parent plan mirrors Phase 16 as open.

## Progress log

- 2026-11-18: plan written against 9191edc. Owner decisions recorded: D1 (phases join the active plan), D2 (fog per list), D3 (engine enforces the combat flag), remembered values are one set for the character, all timeouts pause, Copilot is told, strategy = two thresholds on one row, C# unknowns are `int?`. Classifiers CMDTPL-01, RUNLOOP-01..03 and SETTINGS-07 approved and added to the catalog.
- 2026-11-18: implementation started; item moved to active/ (state: active). Baseline recorded in test-results.md: typecheck OK, lint 0 errors, game-client 3533/3533.
- 2026-11-18: Phase 12 done (one expander for every send path, unresolved placeholders refused with one notice, quaff seed removed, fog and dispel fog excluded per list; 30 new tests, 3563/3563 green, build OK). Deviation: identify sends also route through the expander (minor).
- 2026-11-18: Phase 13 done (row options types, validation on import, wizard-config mapping, buffRowForGate spread rule replacing setBuffGate; 24 new tests, 3587/3587 green). Deviation: tests in new files; helper in class-defaults (minor).
- 2026-11-18: Phase 14 done (combat-state and enemy-condition gates, condition tracking for the fought creature only, post-fight recheck of gated heals, Dark Heal in the catalog; 24 new tests, 3611/3611 green). Deviation: catalog field conditionGated; tests in a new file (minor).
- 2026-11-18: Phase 15 done (serial re-arm queue with outcome detection, capped lag-spaced retry, item buffs on any drop, gated heals; 33 new tests, 3644/3644 green, build OK). Deviations: retry-off and unconfirmable casts send once without waiting; existing gating tests use retry: false (minor).
- 2026-11-19: Phase 16 done (movement backstop derived from the tracker's timeout plus queued lag; movement, fight-end and wait timeouts pause with a reason, Copilot is told; 28 new tests, 3672/3672 green, build OK). Deviations: idleTimeoutMs left unchanged, fight-end wait loops after resume, UI screenshot of a real stall deferred to the showcase (minor).
- 2026-11-19: Phase 17 done (Rest, Weight, lap wait remembered in pref:global, unticked targets per area in pref:targets:<slug>, lap wait default 3 minutes and interruptible; 47 new tests, 3719/3719 green, build OK, live reload check on the rebuilt game client). Deviations: pure rules in a new module; slice sizes; new browser-test script (minor).
- 2026-11-19: Phase 18 done (combat state, enemy condition and retry controls on buff and fight rows, placeholder notes, Review wording, end-user help; 20 new tests, 3739/3739 green, build OK, live check on the rebuilt client with Dark Heal). Deviations: helper module, strip-undefined (minor).
- 2026-11-19: DSL baseline had 4 class tests failing on a 49th class page named Class facts (a new h1 page layout); owner chose to fix them first: ParseH1Layout added, tests and pinned counts updated, data rebuilt as the previous scrape plus the parsed Gravebinder. Phase 19 done (lag miner, reader, cache, --ability-lag job, committed ability-lag.json with 17 measured abilities; 48 new DSL tests; only the two known PlayerBookTests fail). Deviations: prompt marker, any next command, millisecond timestamps, parser fix first.
- 2026-11-19: Phase 20 done (the class feed carries durationTicks and lagMs, omitted when unknown; client normalizer, snapshot script and catalog cache key taught the fields; web-server snapshot regenerated; local C#, web-server and game client redeployed, live feed and X-Maps-Source upstream checked; 5 DSL, 17 client, 1 web-server tests). Deviations: normalizer and extract script needed the fields, cache key v3 (minor).
- 2026-11-19: Phase 21 done (new fight rows start at the ability's measured lag, tick buffs recast at duration minus one tick, the server lag is a floor in the engine's cooldown, retry gap and expected-lag allowance; 39 new tests, 3795/3795 green, build OK, live pre-fill check on the rebuilt client). Deviations: catalog loader in its own hook (import.meta), optional engine dep (minor).
- 2026-11-19: Phase 22 done (final gates green: game-client 3796/3796 in 221 suites, web-server 11/11, DSL 975/977 with only the two known PlayerBookTests failing, builds OK, typecheck OK, lint 0 errors; one anti-flap test added after the coverage check; three showcase shots; amendment A10 on the editable-targets plan for the mobile engine port; doc sweep recorded in test-results.md). The header shot of a paused run was replaced by the Review-options shot (a real stall needs a game connection; the paused header is proven by unit tests); no light-theme shot. Also recorded: a bare jest call used about 112 GB and froze the machine, so the config cap, a Claude hook, a repo check script and a CI step now guard it (outside this item Edit map). Awaiting the owner sign-off.

- 2026-11-19: Documentation recheck by the owner. The Phase 22 sweep was written from memory and missed items; found and fixed (feature doc intro and a stale constant, a stale folder-index entry, the sync-contract doc, the tooling indexes, the rule text) and the missing end-user text added (status line hint + Combat help section) on the owner's choice. New mechanical check scripts/check-doc-impact.mjs, the rule in docs/claude/work-item-workflow.md, and gates in the implement-plan and tech-plan skills. Recorded in test-results.md "Documentation audit". Still awaiting the owner sign-off.
- 2026-11-19: Plan restructured (A1). Outstanding: the deferred live-stall screenshot of Phase 16 (box 16.10) and the owner sign-off.

## Plan sign-off

- [ ] Every phase above is ticked (work, sign-off and heading boxes). Open: Phase 16 (the deferred real-stall screenshot).
- [ ] `node scripts/check-doc-impact.mjs .ai-plans/active/2026-11-18_autopilot-live-test-findings` reports 0 unresolved (last run 2026-11-19: 0; run again at close).
- [x] The After diagrams are in the developer doc: W4-W7 in `docs/game/autopilot.md`, section "Workflows" (2026-11-19).
- [ ] Owner sign-off: Signed off by the user on <yyyy-mm-dd>.
