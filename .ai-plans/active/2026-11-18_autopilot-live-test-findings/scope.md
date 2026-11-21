# Scope: Autopilot findings from live testing on 2026-11-14 (buffs, retries, pauses, thresholds, durations, wait step)

Item: item.md · Type: proposal · Scoped against: performance/Allocation-hunt @ 9191edc (the working tree also holds uncommitted autopilot edits, see Risks) · Date: 2026-11-18
Data classification of this work: personal (the log corpus it reads and the account-synced autopilot records it changes; rules: docs/standards/data-classification.md, DRAFT — the document is still marked "owner to confirm")

## What the work is

The owner tested the autopilot (the auto-leveling engine and its wizard) live on 2026-11-14 and listed twelve findings: buff start-up that hits timeouts, abilities that are not retried after a failed cast, run-ending timeouts that should pause, wizard steps that lose their values, a `{name}` placeholder sent literally, quaff logic, ability timing and durations (including a new C# "skill lag" definition fed by an agent-to-C# job), in-combat / out-of-combat flags for buffs, percent thresholds for abilities, a lap wait that does not wait, and two abilities (fog, dispel fog) that must never be default. At the owner's request every statement needs log evidence; on 2026-11-18 the owner added that the logs of that day (today) contain a lot of autopilot activity too, so both days are used here. This scope only maps what the work touches and what the logs already show; it plans nothing.

## Evidence base

Corpus: the Docker game-server logs `C:/Projects/DSL/GameLogs/ShatteredArchive/Docker/game-server/2026/11/<dd>/server.log-*.jsonl` (wire-order records: client input, raw game text, GMCP). Text was read with ANSI removed and lines re-assembled from the raw chunks; no raw log line is copied into this document.

| Day | Records | Client data inputs | Game connections |
|---|---|---|---|
| 2026-11-14 (+ the file that rolled over into 2026-11-15, 4,955 records, 264 inputs) | 160,785 | 8,002 | 4 completed connects over the day |
| 2026-11-18 (up to 23:43 UTC) | 180,710 | 8,824 | 2 sessions (about 13:19-22:00 and 22:00-23:43 UTC) |

- The game-server logs record what crosses the wire. They do **not** hold the client's own autopilot run state (running / paused / error), its stop reason or its debug output: the engine writes debug to the browser console only when `localStorage['autoleveling.debug']` is set (`apps/game-client/src/features/autoleveling/autoleveling-engine.ts:120-142`). Why a run stopped therefore cannot be read from these files (Unknown U1).
- Autopilot-driven traffic is recognised by command shape, not by a marker: full-form `cast '<spell>'` buff and fight commands, `kick`, `kill <keyword>` and movement steps. On both days the same twenty-command block of abbreviated casts (`c sanc`, `c frenz self`, ...) is sent within about 2 ms, 23 times on 2026-11-18; the wizard never generates that abbreviated form (`autoleveling-buff-catalog.ts:28-53` uses `cast '...'`), so it is treated as the owner's own macro, not autopilot (inference, not confirmed: U2).
- Top commands on 2026-11-18: `kick` 2,314, `kill <keyword>` for one town mob type 656, movement steps about 3,200 in total, `cast 'sanctuary'` 66, `cast 'frenzy'` 50. On 2026-11-14: `kick` 1,253, `kill <keyword>` for four mob types about 500 in total, `cast 'sanctuary'` 55, `cast 'frenzy'` 38. A bare `imp` is sent every 120 s on both days; what sends it is not determined and it is left out of the evidence.

## Per-statement findings: log evidence and code evidence

"Both days" = 2026-11-14 and 2026-11-18. Counts come from the scripts described under *Inputs for sizing*; success rates of casts are **not** claimed because the windows overlap in burst casts.

| # | Owner statement | Log evidence | Code evidence | Status |
|---|---|---|---|---|
| 1 | Start-up buffs, lag, timeout stop | The game's failure line for a cast is `You lost your concentration.`: 68 times on 11-14, 32 on 11-18 (all casts, not only autopilot). Casts sent 6 s apart or less in clusters of at least 4: 24 clusters on 11-14, of which several are the 2 ms macro block (see above). The autopilot's own burst timing is not separable from these (U2). | `start.pre` buffs are paced by one fixed settle, `lookSettleMs` (default 500 ms), after each action (`autoleveling-engine.ts:1543-1554`); a movement that times out ends the run with status `error` and `stopping = true` (`:1405-1409`). | Mechanism found; the owner's "timeout waiting for lag" is not visible in the wire logs (U1) |
| 2 | Failed ability is not re-armed until after the next kill; "retry for affect" marker; guard against over-issuing | Failure line present (item 1). The time from a failed buff cast to the next cast of the same spell: median 11.9 s (11-14) and 125.6 s (11-18), minimum about 1.2 s and 4.1 s, longest 9,168 s and 1,838 s; this includes the owner's manual casts. GMCP `add_affect` / `remove_affect` exist (510 removals and 507 additions on 11-14, 718 removals on 11-18); `tick`, `char_data`, `room_data`, `affect_data`, `login_data` are the other packages. | `if_affect_missing` sends the cast once and never checks the outcome or retries (`:1692-1706`); affect-gated buffs are re-checked only at the top of a round and after each fight (`recheckBuffs`, `:2101-2115`). No cast-outcome, retry or issue-throttle exists for buffs; the in-combat reaction has a per-affect cooldown (`:2089-2094`). | Mechanism found. Which abilities have no recognisable success/failure line: Unknown (U3) |
| 3 | Timeouts should pause, better detection; many affects drop in one tick | Seconds in which three or more affects dropped at once: 81 on 11-14 (peak 13 in one second), 102 on 11-18 (peak 18). These include affects removed in bulk by events other than expiry (not separated). | Fatal paths: movement backstop timeout (`:1405-1409`), any thrown error in the round loop (`:1469-1475`, including `wait_text` / `wait_regex` timeouts thrown at `:1908`, `:1954`). Pause exists (`pause()` `:1154`, `waitWhilePausedOrStopped` `:1486-1496`) and is user-driven. Run status `error` also raises the Copilot "need help" signal (`autopilot-signals.ts:21`). | Mechanism found; the stop reasons the owner saw are not in these logs (U1) |
| 4 | Rest step, weight step and selected targets do not keep their values | None possible: client-only state. | `restStartOfRound`, `restEndOfRound`, `restDuringRound`, `weightAtOrAbovePct`, `weightCommands` live in the in-memory wizard draft only (`components/wizard/useWizardDraft.ts`, `components/AutoLevelingWizard.tsx:643-660`); the stored/synced kinds are `target`, `targetOverride`, `buff`, `fight`, `path`, `pref`, `abilityTiming` (`autoleveling-user-data.ts:50-56`) and `pref` holds only class and alignment (`:119-123`). The target checkbox is documented as not stored (`docs/game/autopilot.md`, Targets step). | Cause found in code |
| 5 | `{name}` sent literally, `{n` is a colour code | 30 literal `{name}` sends on 11-14 (`cast 'fog' {name}` 15, `cast 'dispel fog' {name}` 15); none on 11-18. | `applyInitiationTemplate` substitutes only the initiation command (`:236-244`, used at `:2251`, `:2323`); `sendCommand` forwards every other command untouched (`:1714-1727`), and fight rows are built with `{name}` by default (`autoleveling-class-defaults.ts:87-90`, `CombatStep.tsx:585`). | Verified. Whether buff commands are ever seeded with `{name}`: Unknown (U4) |
| 6 | Review quaff logic (haste etc.) | `quaff <potion>` (the literal placeholder) sent 23 times on 11-14, 0 on 11-18; the game answered `You do not have that potion.` after it. Haste casts: 11 on 11-14, 37 on 11-18. | The Sanctuary catalog entry seeds the in-combat command with the placeholder (`autoleveling-buff-catalog.ts:29`, copied to the row at `autoleveling-class-defaults.ts:48`); the engine sends it as-is when the affect drops in a fight (`autoleveling-engine.ts:2075-2099`). Haste has no in-combat seed and `suggestHoldNearLevel` (`:30`). | Verified for the placeholder |
| 7 | Ability timing: default durations from C#; new C# skill-lag definition; agent-to-C# ad hoc job; save in local development | No log field gives a duration directly; `add_affect` carries a name `n`, a duration `d`, a type `lc` and a tick `t` (one sample read). Ticks are `tick` packages (923 on 11-14). | The client learns per-command cooldowns only (`abilityTiming` records, `autoleveling-user-data.ts:486-505`; bumped in `autoleveling-engine.ts:1587-1620`). `DurationTicks` is in 161 C# files in the DSL repo; the class feed's `AutoPilotAbility` carries only name, type, level, groups (`Server.Dsl/Models/Autopilot.cs:114-130`) and the client type says the duration is not projected (`autoleveling-content-types.ts:80-86`). No skill-lag / wait-state field exists in C#. Ad hoc jobs live in `Server.Jobs/Adhoc` with flags in `Server.Jobs/Program.cs:34-55`. | New definition, new feed field and new job are all absent today |
| 8 | "Only while out of combat" for buffs; some only in combat | 52 dark heal casts on 11-14 and 18 on 11-18; the success line `A dark healing fills your body.` follows at least 10 and 12 of them (the probe read at most 5 lines after each cast). No combat-specific refusal line was found after any dark heal (only the concentration line, `You can't concentrate enough.` and `You aren't fighting anyone.`); combat lines appear within 3 s of 3 of the casts. | Only tick buffs are out-of-combat-only, by rule (`send_every_ticks` skips while fighting, `:1628-1633`). `BuffRow` has no combat-state field (`autoleveling-user-data.ts:80-110`). GMCP `char_data` carries `is_fighting` (sample read). | Cannot confirm the game refuses the cast in combat (U5) |
| 9 | Ability thresholds: own HP/mana percent, enemy percent, own-vs-enemy | The game prints the enemy's condition as seven text tiers; counts of the phrases: `has some big nasty wounds and scratches` 1,163 / 1,528, `has quite a few wounds` 1,049 / 2,019, `looks pretty hurt` 860 / 1,138, `is in awful condition` 859 / 1,148 (11-14 / 11-18), plus three lighter tiers. GMCP `char_data` has own `hp/max_hp/mana/max_mana/move` but no enemy health in the sample read. No `backstab` was sent on either day (U6). | `vitalsGate` already exists: own `hp` / `mp` / `mv`, `above` / `below`, 0-100 percent, on buff and fight rows (`autoleveling-types.ts:27-32`, `autoleveling-user-data.ts:105,115`, checked in `execAction` `:1567-1571`). The engine has no notion of enemy health. | Own-vitals gate exists; enemy/relative thresholds are new |
| 10 | Wait between laps does not wait; default about 3 minutes, configurable | Not directly separable in the wire logs (U7). | The wizard config forces `roundLoopTimeMs` to `WIZARD_ROUND_LOOP_MS = 3_000` (3 seconds) for every mode except sightsee (`autoleveling-wizard-config.ts:71-72,167`); the engine waits that value, or runs `reset.wait` actions if any (`autoleveling-engine.ts:1456-1465`). The engine default is 300,000 ms (`autoleveling-defaults.ts:27`) and the old modal exposes minutes (`AutoLevelingModal.tsx:1892`); the wizard has no control for it. | Cause found: 3 s versus the owner's ~3 min |
| 11 | Fog and dispel fog never default for any class | The two were sent 15 times each on 11-14 as fight commands (see 5), none on 11-18. | The pre-fill picks "the strongest spells and songs" up to 3 fight rows (`autoleveling-class-defaults.ts:94-121`) and buffs from `DEFAULT_BUFF_LABELS` (`:31`); the owner says "buff-list" but the logs show them as fight commands (Decision D2). | Verified they were sent; list they come from needs the owner's word |
| 12 | Dark heal is out-of-combat only, an in-between heal below a threshold; verified spell | See 8. | Not in `BUFF_CATALOG` (`autoleveling-buff-catalog.ts:28-53`); depends on items 8 and 9. | Depends on 8, 9 and U5 |

## Affected areas

| Area | Role in the work | Kind | Evidence |
|---|---|---|---|
| `apps/game-client/src/features/autoleveling/autoleveling-engine.ts` (2,576 lines) | Buff pacing and retry, stop-versus-pause, lap wait, in/out-of-combat and threshold gating, outcome detection (items 1, 2, 3, 6, 8, 9, 10, 12) | change | lines cited above |
| `features/autoleveling/autoleveling-types.ts`, `autoleveling-user-data.ts`, `autoleveling-wizard-config.ts` | New row fields (combat state, thresholds, retry marker), stored values for rest/weight/targets, lap wait, `{name}` substitution point | change | `autoleveling-user-data.ts:50-56,80-123`, `autoleveling-wizard-config.ts:71-72,114-121` |
| `features/autoleveling/autoleveling-class-defaults.ts`, `autoleveling-buff-catalog.ts` | Default exclusions (fog, dispel fog), quaff seed, verified dark heal entry, duration defaults | change | `class-defaults.ts:87-121`, `buff-catalog.ts:28-53` |
| `components/wizard/` (`CombatStep.tsx` 982 lines, `RestStep.tsx`, `WeightStep.tsx`, `ReviewStep.tsx`, `useWizardDraft.ts`, `CombatHelp.tsx`) and `components/AutoLevelingWizard.tsx` (773 lines) | The marker, flags and thresholds UI, persisted step values, lap-wait control, end-user help text | change | `CombatStep.tsx:585,843-850`, `AutoLevelingWizard.tsx:643-660` |
| `components/AutoLevelingModal.tsx` (2,554 lines, the older modal) | Same settings in the older UI (lap wait exists there); whether it is kept in step is a question | change or none | `AutoLevelingModal.tsx:1892` (U8) |
| `features/autoleveling/autopilot-signals.ts`, `features/copilot/autopilotLink.ts`, `features/copilot/gate.ts` | Consumers of run status and the `error` / need-help signal; a stop that becomes a pause changes what Copilot sees | change (if pause replaces error) | `autopilot-signals.ts:5-23` |
| DSL repo: `Server.Dsl/Models/Autopilot.cs`, `Server.Dsl/Cache/AutoPilotClassCache.cs`, `Server.Web.Public/Controllers/MapsController.cs` | Where a duration / skill-lag value would be projected to the client (item 7) | new / change | `Autopilot.cs:114-130` |
| DSL repo: `Server.Jobs/Adhoc`, `Server.Jobs/Program.cs`, ability classes (161 files with `DurationTicks`) | The new ad hoc job and the new skill-lag definition (item 7) | new | `Program.cs:34-55` |
| `apps/web-server/src` (offline snapshot `classes.json`, proxy) | The class feed is proxied and falls back to a bundled snapshot, so a new field must exist in both | change | `apps/web-server/src/index.ts:268-272` |
| DSL repo: `Server.Dsl/AgentApi/AutolevelUserRecords.cs` | Server validator of record kinds; a new stored kind (item 4) is a contract change on both sides | change (if new kinds) | `autoleveling-user-data.ts:50-56` + `docs/game/autopilot.md` |
| `shatteredarchive-mobile` | Has no autopilot code today (a search found only two doc files); the mobile port is planned elsewhere | none now, consumer later | `2026-11-13_editable-autopilot-targets-synced` phases 7-11, `2026-09-12_autoleveling-mobile-port` |
| `docs/game/autopilot.md`, `apps/game-client/src/features/autoleveling/.annotated`, `components/wizard/.annotated`, in-app help (`CombatHelp.tsx`, `TargetsHelp.tsx`) | Developer doc, indexes, end-user text | change | listed |

## Stakeholders

- **The owner**: author of the findings; answers the decisions below; commits and deploys.
- **Players using autopilot** (end-user audience): fewer stops, correct buffs, a wait between laps; the wizard's help text must be updated for new options.
- **Copilot** (the AI companion that listens to the autopilot status and need-help signals): reads `shatteredarchive:autopilot-status` and `-need-help`; a stop that becomes a pause changes those signals.
- **Whoever owns the other autopilot work item** (`2026-11-13_editable-autopilot-targets-synced`, 6 of 12 phases done): same files are being edited right now (see Risks).
- **The mobile port** (`2026-09-12_autoleveling-mobile-port` and phases 7-11 of the active plan): every new row field, stored kind and engine rule is something the port must copy later; the engine is a shared contract.
- **DSL (C#) repo and ops**: item 7 adds a job, a definition and possibly a feed field; production deploy is the owner's.

## Data touched

| Data | Class | Read/Write/Store/Send/Log | Change in handling |
|---|---|---|---|
| Docker game-server `*.jsonl` logs (character names, accounts and gameplay in every record) | Personal | Read | Read by a research script and, for item 7, by a C# agent job; only counts and aggregate numbers may leave them. The 2026-11-14 and 2026-11-18 evidence in this item is counts only |
| Autopilot user records (`buff`, `fight`, `pref`, possibly new kinds for rest, weight and selected targets) | Personal (account content synced to the cloud, 1,000-record cap) | Read/Write/Store/Send | New fields on rows and possibly new stored values; wider synced content, but the same owner-only access |
| Learned ability cooldowns (`abilityTiming`) | Internal (derived from play, no names) | Read/Write/Store | Possibly replaced or seeded by C# defaults |
| New "skill lag" and duration data for abilities | Public (game data, like `DurationTicks`) | Store/Send | New definition in C# and in the class feed; mined from Personal logs, so only aggregates are stored (the same split the 2026-10 duration mining used) |
| Engine debug output | Internal | Log (browser console, off by default) | Unchanged unless new diagnostics are added for stop reasons (U1) |
| Commands sent to the game (`{name}`, quaff placeholder) | Internal | Send | Correct values instead of literal placeholders |

Flags: no Restricted data. The job in item 7 turns Personal log data into stored output, so the plan must say where the job reads from, what it keeps and that local development mode is the only place it writes (edge-case catalog `local-only-features.md`). New synced content falls under `cloud-synced-user-content.md` (the server validator rejects an unknown kind, so a new kind breaks Save to cloud until both sides ship).

## Inputs for sizing

Not sized: that is for a human. Counts and the commands behind them:

- Findings: 12. With a code cause found: 5, 10, 4, 6 (placeholder), 2, 3 (fatal paths), 11 (sent, source list undecided). Logs support the mechanism but not the owner's stop reasons: 1, 3.
- Repos touched: 3 (ShatteredArchive, DSL, and later shatteredarchive-mobile); apps/packages in ShatteredArchive: 2 (game-client, web-server).
- Engine: 1 file of 2,576 lines (`wc -l`), 1 engine test file (`autoleveling-engine.test.ts`); 20 test files match the autopilot globs in `features/autoleveling`, `components/wizard`, the AutoLeveling components and the autopilot hooks (`ls` of those globs).
- Wizard source files for rest, weight, combat, review, draft and help: 6 under `components/wizard/` plus the 773-line wizard.
- C#: 161 files contain `DurationTicks` (`grep -rln DurationTicks --include=*.cs`); 0 files define a skill lag (`grep` for `LagTicks|SkillLag|WaitState|LagSeconds|BeatsOfLag`); 1 model (`AutoPilotAbility`) feeds the client; ad hoc job entry points in `Server.Jobs/Program.cs`: 4 flags found at `:34-55`.
- Stored record kinds: 7 synced today; the server validator and the client list must agree.
- Log probes run for this scope: 4 scripts (record types, input commands, failure lines / buffs / quaff / fog, input gaps and affect drops); results above.
- Related active/proposed items: 2 (`2026-11-13_editable-autopilot-targets-synced`, `2026-09-12_autoleveling-mobile-port`).
- Unknowns: 8 (U1-U8).
- Edge-case catalog files likely to apply at planning: `persisted-settings-and-defaults.md`, `cloud-synced-user-content.md`, `local-only-features.md`, `ansi-color-handling.md` (the `{n` colour-code collision), `game-data-privacy.md`, `served-fallback-data.md`.

## Dependencies and order

- Item 7 (C#) must exist before the client can default durations from it; the feed field and the web-server offline snapshot move together.
- Items 8, 9 and 12 share one mechanism (combat-state flag plus thresholds); 12 is a use of them.
- Item 4's new stored values and any new row fields change the synced contract with the DSL validator.
- Item 3's pause-instead-of-stop interacts with Copilot's need-help signal.
- Evidence the logs cannot give (stop reasons, lap boundaries) needs the engine's debug output from a real run, which only the owner can start (no process is started by this work).
- The other autopilot plan edits the same files today, so ordering relative to its Phase 6b and mobile phases needs the owner's word (D1).

## Risks and unknowns

- **U1** The logs hold no autopilot run state or stop reason; "timeout waiting for lag" (items 1, 3) is the owner's reading and cannot be matched to a record. A wrong assumption here means a fix for the wrong timeout. A run with `autoleveling.debug` set would answer it.
- **U2** Autopilot-sent casts cannot be told apart from the owner's own with certainty; the 2 ms twenty-command block is judged to be a macro because of its abbreviated form, which is an inference.
- **U3** Which abilities have no recognisable success/failure line: only `You lost your concentration.` and `You can't concentrate enough.` were found as failure lines; success lines per ability were not catalogued. GMCP `add_affect` covers affect-setting abilities only.
- **U4** Whether any seeded buff command carries `{name}`; the logs show it only on fight commands.
- **U5** Whether the game refuses dark heal in combat: no refusal line appears in either day, and combat text follows some casts. If the game does not refuse, "only while out of combat" is an autopilot rule, not a game rule.
- **U6** `backstab` and its "big and nasty wounds" cutoff do not appear on either day (the casts on these days, such as dark heal and dark essence, point to a different class); evidence for item 9's example would come from older logs.
- **U7** The lap boundary is not marked in the wire logs, so the real gap between laps is not measured; the code value (3 s) is the evidence.
- **U8** Whether the older `AutoLevelingModal.tsx` stays in step with the wizard.
- The working tree already holds uncommitted autopilot edits by the other plan (`git status` shows changes in `AutoLevelingWizard.tsx`, `ReviewStep.tsx`, `useWizardDraft.ts`, `autoleveling-user-data.ts` and the `.annotated` files): anything planned against 9191edc must be re-confirmed against the working tree.
- Counts of multi-affect drops include bulk removals not caused by expiry; failure-line counts include casts by the owner by hand.
- Personal data: the logs contain character names and account text in every record; the scope and any later artifact keep counts and placeholders only.

## Out of scope

- The mobile port itself (phases 7-11 of the active plan, `2026-09-12_autoleveling-mobile-port`); only its dependence on these rules is noted.
- The rest of the active editable-targets plan (Phase 6b and the mobile phases).
- Any change to the game server's behaviour or to how the C# app talks to the client other than the new ability data.
- A client-to-server timing upload (the owner ruled it out for item 7).
- Class-specific tuning beyond the abilities named (dark heal, haste, sanctuary, fog, dispel fog).
- The unexplained 120-second `imp` traffic.

## Decisions for the human

- **D1 Where the work lives.** (a) A plan of its own (the active plan keeps its 6 of 12 phases; this item's files overlap with it); (b) append these findings as phases of `2026-11-13_editable-autopilot-targets-synced` (one place for autopilot, but that plan then also carries a C# job and engine changes unrelated to its title); (c) a plan of its own for the client findings and a separate item for the C# job of item 7.
- **D2 Fog and dispel fog (item 11).** The owner wrote "buff-list abilities"; the logs show them sent as fight commands. Options: exclude from both default lists; exclude from the buff list only; one class-independent exclusion list used by every default.
- **D3 "Only while out of combat" (items 8, 12).** The logs show no refusal from the game. Options: the engine enforces the flag itself whatever the game says; first collect the game's refusal text from a log day the owner points to.

### Decisions recorded (owner, 2026-11-18)

- **D1: add these findings as phases of the active plan `2026-11-13_editable-autopilot-targets-synced`**, not a plan of their own. Consequence for planning: the new phases are appended to that plan's `tech-plan.md` (as amendments, original text kept), they run against the same working tree, and that plan then also carries the engine changes and the C# job of item 7; the mobile phases 7-11 of that plan come after or around them (order to be set in the plan). This item folder stays in `proposed/` as the record of the findings and evidence; `/implement-plan` continues the active plan.
- **D2: exclude fog and dispel fog per list** — from the buff pre-fill and from the fight pre-fill separately (each list gets its own rule and its own test).
- **D3: the engine enforces the in-combat / out-of-combat flag itself**, whatever text the game answers; no refusal line from the game is needed. U5 stays recorded as a fact about the game, not a blocker.
