# Same PoC suite against the FIXED code: green = defect no longer reproduces

160 tests: **160 passed**, **0 failed** (2026-10-17T23:22:29.222Z)

## SEC-1/2: matcher units

13 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | matchPullSuccess accepts the real corpus line and nothing that is not a vault pull |  |
| pass | isPlausibleSkillUp(949, tracked 948) = true |  |
| pass | isPlausibleSkillUp(953, tracked 948) = true |  |
| pass | isPlausibleSkillUp(954, tracked 948) = false |  |
| pass | isPlausibleSkillUp(948, tracked 948) = false |  |
| pass | isPlausibleSkillUp(900, tracked 948) = false |  |
| pass | isPlausibleSkillUp(1001, tracked 1000) = true |  |
| pass | isPlausibleSkillUp(1002, tracked 1001) = false |  |
| pass | isPlausibleSkillUp(0, tracked null) = false |  |
| pass | isPlausibleSkillUp(5, tracked null) = true |  |
| pass | isPlausibleSkillUp(1.5, tracked 1) = false |  |
| pass | isPlausibleSkillUp(NaN, tracked 10) = false |  |
| pass | matchItemCondition rejects speech around the Condition text even when it ends the line |  |

## CFG-2: command-argument sanitizing

4 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | sanitizeCommandArg strips apostrophes and every control character and collapses whitespace |  |
| pass | containerArg leaves a one-word container bare (existing wire format) and quotes a multi-word one |  |
| pass | config parsers never emit a control character, whatever the saved text contains |  |
| pass | a container that sanitizes to nothing is dropped from the quality map |  |

## CFG-1: numIn

16 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | numIn(150, fallback 150, [50..5000]) = 150 |  |
| pass | numIn(100, fallback 150, [50..5000]) = 100 |  |
| pass | numIn(50, fallback 150, [50..5000]) = 50 |  |
| pass | numIn(5000, fallback 150, [50..5000]) = 5000 |  |
| pass | numIn(49, fallback 150, [50..5000]) = 150 |  |
| pass | numIn(5001, fallback 150, [50..5000]) = 150 |  |
| pass | numIn("300", fallback 150, [50..5000]) = 300 |  |
| pass | numIn(123.9, fallback 150, [50..5000]) = 123 |  |
| pass | numIn("", fallback 150, [50..5000]) = 150 |  |
| pass | numIn("   ", fallback 150, [50..5000]) = 150 |  |
| pass | numIn(null, fallback 150, [50..5000]) = 150 |  |
| pass | numIn(undefined, fallback 150, [50..5000]) = 150 |  |
| pass | numIn(true, fallback 150, [50..5000]) = 150 |  |
| pass | numIn(Infinity, fallback 150, [50..5000]) = 150 |  |
| pass | numIn(-1, fallback 150, [50..5000]) = 150 |  |
| pass | numIn("abc", fallback 150, [50..5000]) = 150 |  |

## CFG-3: a saved copy of a shipped default recipe table does not freeze it

6 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | tableFingerprint ignores comments, blank lines and whitespace but sees real edits |  |
| pass | a saved table equal to the current default resolves to the code default |  |
| pass | a saved table equal to a known older default is upgraded to the current default |  |
| pass | a table the player really edited is kept, and so is anything that is not a string |  |
| pass | ships no legacy fingerprints yet (so today a saved default behaves exactly like the default) |  |
| pass | the engine reads a whitespace-reformatted saved default the same as the default |  |

## DAT-3: the order queue is capped

3 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | addOrder refuses the order after MAX_QUEUED_ORDERS instead of dropping an older one |  |
| pass | an oversized stored queue loads capped, keeping the head (the order that runs next) |  |
| pass | order add reports a full queue and queues nothing, including nothing of a set |  |

## DAT-1/2: storage failure and data-loss reporting

4 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | the player is told when saved orders were unreadable and dropped |  |
| pass | a failed localStorage write is reported to the player once, not swallowed |  |
| pass | a skill entry saved without updatedAt loads with a numeric one (no NaN eviction order) |  |
| pass | the pending skill-level write is also flushed when the tab becomes hidden |  |

## SAF-2: rate-limit recovery and the no-loss attempt budget

3 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | a tripped rate limit stays tripped: nothing is re-armed, and a stop + restart works again |  |
| pass | the attempt budget also stops an order that keeps failing with no material loss |  |
| pass | debug logging traces each command the plugin sends; off by default |  |

## TMR-1/LIF: interrupts and disable around the put-back chain

4 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | "You stop crafting." arriving during the destroyed put-back chain does not strand the components |  |
| pass | disabling an idle plugin is silent and leaves it ready to run |  |
| pass | remote-server:close while idle changes nothing |  |
| pass | enable subscribes to exactly the events it needs and unsubscribes on disable |  |

## SEC-1: player chat cannot drive the crafting state machine

41 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | chat form: say "success" text inside chat is ignored while crafting |  |
| pass | chat form: say "destroyed" text inside chat is ignored while crafting |  |
| pass | chat form: say "noLoss" text inside chat is ignored while crafting |  |
| pass | chat form: say "interrupted" text inside chat is ignored while crafting |  |
| pass | chat form: say "vaultFailure" text inside chat is ignored while crafting |  |
| pass | chat form: say "copyover" text inside chat is ignored while crafting |  |
| pass | chat form: grats "success" text inside chat is ignored while crafting |  |
| pass | chat form: grats "destroyed" text inside chat is ignored while crafting |  |
| pass | chat form: grats "noLoss" text inside chat is ignored while crafting |  |
| pass | chat form: grats "interrupted" text inside chat is ignored while crafting |  |
| pass | chat form: grats "vaultFailure" text inside chat is ignored while crafting |  |
| pass | chat form: grats "copyover" text inside chat is ignored while crafting |  |
| pass | chat form: ooc "success" text inside chat is ignored while crafting |  |
| pass | chat form: ooc "destroyed" text inside chat is ignored while crafting |  |
| pass | chat form: ooc "noLoss" text inside chat is ignored while crafting |  |
| pass | chat form: ooc "interrupted" text inside chat is ignored while crafting |  |
| pass | chat form: ooc "vaultFailure" text inside chat is ignored while crafting |  |
| pass | chat form: ooc "copyover" text inside chat is ignored while crafting |  |
| pass | chat form: oocKingdom "success" text inside chat is ignored while crafting |  |
| pass | chat form: oocKingdom "destroyed" text inside chat is ignored while crafting |  |
| pass | chat form: oocKingdom "noLoss" text inside chat is ignored while crafting |  |
| pass | chat form: oocKingdom "interrupted" text inside chat is ignored while crafting |  |
| pass | chat form: oocKingdom "vaultFailure" text inside chat is ignored while crafting |  |
| pass | chat form: oocKingdom "copyover" text inside chat is ignored while crafting |  |
| pass | chat form: auctions "success" text inside chat is ignored while crafting |  |
| pass | chat form: auctions "destroyed" text inside chat is ignored while crafting |  |
| pass | chat form: auctions "noLoss" text inside chat is ignored while crafting |  |
| pass | chat form: auctions "interrupted" text inside chat is ignored while crafting |  |
| pass | chat form: auctions "vaultFailure" text inside chat is ignored while crafting |  |
| pass | chat form: auctions "copyover" text inside chat is ignored while crafting |  |
| pass | chat form: ownEcho "success" text inside chat is ignored while crafting |  |
| pass | chat form: ownEcho "destroyed" text inside chat is ignored while crafting |  |
| pass | chat form: ownEcho "noLoss" text inside chat is ignored while crafting |  |
| pass | chat form: ownEcho "interrupted" text inside chat is ignored while crafting |  |
| pass | chat form: ownEcho "vaultFailure" text inside chat is ignored while crafting |  |
| pass | chat form: ownEcho "copyover" text inside chat is ignored while crafting |  |
| pass | a vault-failure line inside chat does not stop a pull that is in flight |  |
| pass | a Condition line inside chat (real corpus shape) does not decide an order item's quality |  |
| pass | still accepts the real whole-line lore shapes seen in the corpus |  |
| pass | rejects an impossible Condition percentage (the corpus never exceeds 100) |  |
| pass | exact whole system lines still match; the same text inside speech does not |  |

## SEC-2: skill-up lines are not trusted from chat, and cannot jump the tier

9 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | Xaltar grats 'Your crafting skill has improved. (700)' does not change the tracked level |  |
| pass | Xaltar OOC Kingdom: 'finally Your crafting skill has improved. (815)' does not change the tracked level |  |
| pass | Xaltar grats 'Your crafting skill has improved. (666) Uh oh' does not change the tracked level |  |
| pass | Xaltar OOC: 'yay Your crafting skill has improved. (722)' does not change the tracked level |  |
| pass | matchSkillImproved only accepts the whole system line |  |
| pass | accepts the genuine +1 skill-up |  |
| pass | ignores an exact-form line carrying a jump far beyond one skill-up |  |
| pass | ignores an exact-form line carrying a value above the 1001 cap |  |
| pass | ignores an exact-form line carrying a regression |  |

## SEC-3: copyover recraft is whole-line only and bounded

5 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | a real copyover line resends the craft exactly once |  |
| pass | a repeated copyover line within the same craft attempt does not resend again |  |
| pass | a new craft attempt gets its own recraft allowance |  |
| pass | a copyover line arriving during the pacing gap does not double-send |  |
| pass | goes idle instead of re-crafting if a stop was already requested |  |

## SAF-1: order input is bounded and auto-start is configurable

16 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | parseQualitySpec rejects the unsatisfiable spec 970+ |  |
| pass | parseQualitySpec rejects the unsatisfiable spec 101 |  |
| pass | parseQualitySpec rejects the unsatisfiable spec 150 |  |
| pass | parseQualitySpec rejects the unsatisfiable spec 95-101 |  |
| pass | parseQualitySpec rejects the unsatisfiable spec 101-120 |  |
| pass | parseQualitySpec still accepts 100 |  |
| pass | parseQualitySpec still accepts 100+ |  |
| pass | parseQualitySpec still accepts 97+ |  |
| pass | parseQualitySpec still accepts 95-100 |  |
| pass | parseQualitySpec still accepts 0 |  |
| pass | rejects order quantity 0 |  |
| pass | rejects order quantity 501 |  |
| pass | rejects order quantity 99999999999999999999 |  |
| pass | accepts the maximum quantity of 500 |  |
| pass | auto-starts an add on an empty queue by default (author-intended behavior preserved) |  |
| pass | autoStartOnOrderAdd=false queues the order without sending a single command |  |

## SAF-2: the engine stops itself instead of looping forever

4 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | stops after maxConsecutiveFailures failed crafts in a row |  |
| pass | a success resets the consecutive-failure counter |  |
| pass | stops an order that keeps coming out off-spec once it exceeds maxAttemptsPerItem x quantity |  |
| pass | trips a command-rate limit instead of flooding the MUD |  |

## TMR-1: duplicate outcome lines cannot multiply commands or leak watchdogs

4 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | two no-loss lines inside one pacing window resend the craft once |  |
| pass | a leaked craft watchdog cannot abort a healthy later cycle |  |
| pass | an outcome line arriving during the destroyed put-back chain is ignored |  |
| pass | a second Condition line inside the pacing window does not credit the order twice |  |

## LIF-1: disabling mid-run resets the engine

1 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | after disable → enable the engine is idle and can start again, and held materials are reported |  |

## LIF-2: a closed connection abandons the run

1 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | no command is sent after remote-server:close, even when the craft watchdog would have fired |  |

## LIF-3: a run is bound to the character that started it

2 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | stops and writes nothing under another character name when the identity changes mid-run |  |
| pass | a character-login event resets an armed run |  |

## DAT-1: malformed stored entries are dropped on load instead of wedging order mode

8 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | drops null and keeps the valid orders around it |  |
| pass | drops an empty object and keeps the valid orders around it |  |
| pass | drops a number and keeps the valid orders around it |  |
| pass | drops an order with no qualitySpec and keeps the valid orders around it |  |
| pass | drops a non-numeric quantityRemaining and keeps the valid orders around it |  |
| pass | drops an unknown spec kind and keeps the valid orders around it |  |
| pass | drops an inverted range and keeps the valid orders around it |  |
| pass | a poisoned queue head no longer blocks removal of, or progress on, the valid orders |  |

## DAT-2: order progress is persisted immediately, and everything is flushed when the page hides

2 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | addOrder / removeOrder / updateOrder are visible in localStorage without waiting for a timer |  |
| pass | a pending skill-level write is flushed on pagehide |  |

## DAT-4: copies returned by the store are deep

2 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | mutating nested qualitySpec / materialsUsed on a returned order never reaches the store |  |
| pass | mutating the object that was passed to addOrder afterwards does not change the store |  |

## CFG-1: timing config is bounded

7 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | craftResponseTimeoutMs = 0 falls back to the 180 s default instead of firing immediately |  |
| pass | craftResponseTimeoutMs = an empty string falls back to the 180 s default instead of firing immediately |  |
| pass | craftResponseTimeoutMs = null falls back to the 180 s default instead of firing immediately |  |
| pass | craftResponseTimeoutMs = a value past the setTimeout limit falls back to the 180 s default instead of firing immediately |  |
| pass | craftResponseTimeoutMs = NaN text falls back to the 180 s default instead of firing immediately |  |
| pass | craftResponseTimeoutMs = a negative value falls back to the 180 s default instead of firing immediately |  |
| pass | commandPacingDelayMs = 0 falls back to the 150 ms default instead of removing all throttling |  |

## CFG-2: config strings reaching a command are sanitized and quoted

3 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | a multi-word, apostrophe-bearing order holding container is quoted and stripped |  |
| pass | a quality-map container with a space is quoted; a single word stays bare (existing format) |  |
| pass | control characters in config never reach a command |  |

## COR-1: a late vault-failure line is not pinned on the wrong component

2 passed, 0 failed

| result | test | first failure line |
|---|---|---|
| pass | names every candidate and puts back everything sent when no success line was seen |  |
| pass | blames exactly the second component when the first pull was confirmed by its success line |  |
