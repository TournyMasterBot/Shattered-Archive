# PoC run against the UNFIXED PR head (8561e03): red = defect reproduced

107 tests: **17 passed**, **90 failed** (2026-10-17T19:18:58.462Z)

## SEC-1: player chat cannot drive the crafting state machine

1 passed, 40 failed

| result | test | first failure line |
|---|---|---|
| **FAIL** | chat form: say "success" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: say "destroyed" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: say "noLoss" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: say "interrupted" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: say "vaultFailure" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: say "copyover" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: grats "success" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: grats "destroyed" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: grats "noLoss" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: grats "interrupted" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: grats "vaultFailure" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: grats "copyover" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: ooc "success" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: ooc "destroyed" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: ooc "noLoss" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: ooc "interrupted" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: ooc "vaultFailure" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: ooc "copyover" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: oocKingdom "success" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: oocKingdom "destroyed" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: oocKingdom "noLoss" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: oocKingdom "interrupted" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: oocKingdom "vaultFailure" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: oocKingdom "copyover" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: auctions "success" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: auctions "destroyed" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: auctions "noLoss" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: auctions "interrupted" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: auctions "vaultFailure" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: auctions "copyover" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: ownEcho "success" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: ownEcho "destroyed" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: ownEcho "noLoss" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: ownEcho "interrupted" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: ownEcho "vaultFailure" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | chat form: ownEcho "copyover" text inside chat is ignored while crafting | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | a vault-failure line inside chat does not stop a pull that is in flight | Expected: "craft spellcraft 'diamond gemstone'" \| Received: "get 1 'uncut diamond stone' vault" |
| **FAIL** | a Condition line inside chat (real corpus shape) does not decide an order item's quality | Error: expect(received).toEqual(expected) // deep equality |
| pass | still accepts the real whole-line lore shapes seen in the corpus |  |
| **FAIL** | rejects an impossible Condition percentage (the corpus never exceeds 100) | Received: 250 |
| **FAIL** | exact whole system lines still match; the same text inside speech does not | Received: "success" |

## SEC-2: skill-up lines are not trusted from chat, and cannot jump the tier

1 passed, 8 failed

| result | test | first failure line |
|---|---|---|
| **FAIL** | Xaltar grats 'Your crafting skill has improved. (700)' does not change the tracked level | Expected substring: "skill=948" \| Received string:    "{G[Crafting Helper] state=crafting  mode=improve  |
| **FAIL** | Xaltar OOC Kingdom: 'finally Your crafting skill has improved. (815)' does not change the tracked level | Expected substring: "skill=948" \| Received string:    "{G[Crafting Helper] state=crafting  mode=improve  |
| **FAIL** | Xaltar grats 'Your crafting skill has improved. (666) Uh oh' does not change the tracked level | Expected substring: "skill=948" \| Received string:    "{G[Crafting Helper] state=crafting  mode=improve  |
| **FAIL** | Xaltar OOC: 'yay Your crafting skill has improved. (722)' does not change the tracked level | Expected substring: "skill=948" \| Received string:    "{G[Crafting Helper] state=crafting  mode=improve  |
| **FAIL** | matchSkillImproved only accepts the whole system line | Received: 700 |
| pass | accepts the genuine +1 skill-up |  |
| **FAIL** | ignores an exact-form line carrying a jump far beyond one skill-up | Expected substring: "skill=948" \| Received string:    "{G[Crafting Helper] state=crafting  mode=improve  |
| **FAIL** | ignores an exact-form line carrying a value above the 1001 cap | Expected substring: "skill=948" \| Received string:    "{G[Crafting Helper] state=crafting  mode=improve  |
| **FAIL** | ignores an exact-form line carrying a regression | Expected substring: "skill=948" \| Received string:    "{G[Crafting Helper] state=crafting  mode=improve  |

## SEC-3: copyover recraft is whole-line only and bounded

3 passed, 2 failed

| result | test | first failure line |
|---|---|---|
| pass | a real copyover line resends the craft exactly once |  |
| **FAIL** | a repeated copyover line within the same craft attempt does not resend again | Expected: 4 \| Received: 6 |
| pass | a new craft attempt gets its own recraft allowance |  |
| **FAIL** | a copyover line arriving during the pacing gap does not double-send | Error: expect(received).toEqual(expected) // deep equality |
| pass | goes idle instead of re-crafting if a stop was already requested |  |

## SAF-1: order input is bounded and auto-start is configurable

8 passed, 8 failed

| result | test | first failure line |
|---|---|---|
| **FAIL** | parseQualitySpec rejects the unsatisfiable spec 970+ | Received: {"kind": "atLeast", "min": 970} |
| **FAIL** | parseQualitySpec rejects the unsatisfiable spec 101 | Received: {"kind": "exact", "value": 101} |
| **FAIL** | parseQualitySpec rejects the unsatisfiable spec 150 | Received: {"kind": "exact", "value": 150} |
| **FAIL** | parseQualitySpec rejects the unsatisfiable spec 95-101 | Received: {"kind": "range", "max": 101, "min": 95} |
| **FAIL** | parseQualitySpec rejects the unsatisfiable spec 101-120 | Received: {"kind": "range", "max": 120, "min": 101} |
| pass | parseQualitySpec still accepts 100 |  |
| pass | parseQualitySpec still accepts 100+ |  |
| pass | parseQualitySpec still accepts 97+ |  |
| pass | parseQualitySpec still accepts 95-100 |  |
| pass | parseQualitySpec still accepts 0 |  |
| pass | rejects order quantity 0 |  |
| **FAIL** | rejects order quantity 501 | Expected length: 0 \| Received length: 1 |
| **FAIL** | rejects order quantity 99999999999999999999 | Expected length: 0 \| Received length: 1 |
| pass | accepts the maximum quantity of 500 |  |
| pass | auto-starts an add on an empty queue by default (author-intended behavior preserved) |  |
| **FAIL** | autoStartOnOrderAdd=false queues the order without sending a single command | Error: expect(received).toEqual(expected) // deep equality |

## SAF-2: the engine stops itself instead of looping forever

1 passed, 3 failed

| result | test | first failure line |
|---|---|---|
| **FAIL** | stops after maxConsecutiveFailures failed crafts in a row | Expected substring: "state=error_stopped" \| Received string:    "{G[Crafting Helper] state=crafting  mode=improve  |
| pass | a success resets the consecutive-failure counter |  |
| **FAIL** | stops an order that keeps coming out off-spec once it exceeds maxAttemptsPerItem x quantity | Expected substring: "state=error_stopped" \| Received string:    "{G[Crafting Helper] state=crafting  mode=order  a |
| **FAIL** | trips a command-rate limit instead of flooding the MUD | Expected substring: "state=error_stopped" \| Received string:    "{G[Crafting Helper] state=crafting  mode=improve  |

## TMR-1: duplicate outcome lines cannot multiply commands or leak watchdogs

0 passed, 4 failed

| result | test | first failure line |
|---|---|---|
| **FAIL** | two no-loss lines inside one pacing window resend the craft once | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | a leaked craft watchdog cannot abort a healthy later cycle | Expected substring: "state=crafting" \| Received string:    "{G[Crafting Helper] state=error_stopped  mode=imp |
| **FAIL** | an outcome line arriving during the destroyed put-back chain is ignored | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | a second Condition line inside the pacing window does not credit the order twice | Expected: 2 \| Received: 1 |

## LIF-1: disabling mid-run resets the engine

0 passed, 1 failed

| result | test | first failure line |
|---|---|---|
| **FAIL** | after disable → enable the engine is idle and can start again, and held materials are reported | Expected pattern: /still in your inventory/i \| Received string:  "{G[Crafting Helper] Starting Spellcrafting training |

## LIF-2: a closed connection abandons the run

0 passed, 1 failed

| result | test | first failure line |
|---|---|---|
| **FAIL** | no command is sent after remote-server:close, even when the craft watchdog would have fired | Error: expect(received).toEqual(expected) // deep equality |

## LIF-3: a run is bound to the character that started it

0 passed, 2 failed

| result | test | first failure line |
|---|---|---|
| **FAIL** | stops and writes nothing under another character name when the identity changes mid-run | Received: 949 |
| **FAIL** | a character-login event resets an armed run | Error: expect(received).toEqual(expected) // deep equality |

## DAT-1: malformed stored entries are dropped on load instead of wedging order mode

0 passed, 8 failed

| result | test | first failure line |
|---|---|---|
| **FAIL** | drops null and keeps the valid orders around it | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | drops an empty object and keeps the valid orders around it | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | drops a number and keeps the valid orders around it | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | drops an order with no qualitySpec and keeps the valid orders around it | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | drops a non-numeric quantityRemaining and keeps the valid orders around it | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | drops an unknown spec kind and keeps the valid orders around it | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | drops an inverted range and keeps the valid orders around it | Error: expect(received).toEqual(expected) // deep equality |
| **FAIL** | a poisoned queue head no longer blocks removal of, or progress on, the valid orders | Error: expect(received).not.toThrow() |

## DAT-2: order progress is persisted immediately, and everything is flushed when the page hides

0 passed, 2 failed

| result | test | first failure line |
|---|---|---|
| **FAIL** | addOrder / removeOrder / updateOrder are visible in localStorage without waiting for a timer | Received has value: null |
| **FAIL** | a pending skill-level write is flushed on pagehide | Received has value: null |

## DAT-4: copies returned by the store are deep

0 passed, 2 failed

| result | test | first failure line |
|---|---|---|
| **FAIL** | mutating nested qualitySpec / materialsUsed on a returned order never reaches the store | Expected: 90 \| Received: 1 |
| **FAIL** | mutating the object that was passed to addOrder afterwards does not change the store | Error: expect(received).toEqual(expected) // deep equality |

## CFG-1: timing config is bounded

2 passed, 5 failed

| result | test | first failure line |
|---|---|---|
| **FAIL** | craftResponseTimeoutMs = 0 falls back to the 180 s default instead of firing immediately | Expected substring: "state=crafting" \| Received string:    "{G[Crafting Helper] state=error_stopped  mode=imp |
| **FAIL** | craftResponseTimeoutMs = an empty string falls back to the 180 s default instead of firing immediately | Expected substring: "state=crafting" \| Received string:    "{G[Crafting Helper] state=error_stopped  mode=imp |
| **FAIL** | craftResponseTimeoutMs = null falls back to the 180 s default instead of firing immediately | Expected substring: "state=crafting" \| Received string:    "{G[Crafting Helper] state=error_stopped  mode=imp |
| **FAIL** | craftResponseTimeoutMs = a value past the setTimeout limit falls back to the 180 s default instead of firing immediately | Expected substring: "state=crafting" \| Received string:    "{G[Crafting Helper] state=error_stopped  mode=imp |
| pass | craftResponseTimeoutMs = NaN text falls back to the 180 s default instead of firing immediately |  |
| pass | craftResponseTimeoutMs = a negative value falls back to the 180 s default instead of firing immediately |  |
| **FAIL** | commandPacingDelayMs = 0 falls back to the 150 ms default instead of removing all throttling | Expected: 3 \| Received: 4 |

## CFG-2: config strings reaching a command are sanitized and quoted

0 passed, 3 failed

| result | test | first failure line |
|---|---|---|
| **FAIL** | a multi-word, apostrophe-bearing order holding container is quoted and stripped | Expected: "put 1 'diamond gem pain' 'Bobs big pouch'" \| Received: "put 1 'diamond gem pain' Bob's  big pouch" |
| **FAIL** | a quality-map container with a space is quoted; a single word stays bare (existing format) | Expected: "put 1 'diamond gem pain' 'my chest'" \| Received: "put 1 'diamond gem pain' my chest" |
| **FAIL** | control characters in config never reach a command | Expected pattern: not /[\x00-\x1f\x7f]/ \| Received string:      "put 1 'diamond gem pain' vaultquit" |

## COR-1: a late vault-failure line is not pinned on the wrong component

1 passed, 1 failed

| result | test | first failure line |
|---|---|---|
| **FAIL** | names every candidate and puts back everything sent when no success line was seen | Expected substring: "netherium bar" \| Received string:    "{G[Crafting Helper] Starting Sharp Weapons traini |
| pass | blames exactly the second component when the first pull was confirmed by its success line |  |
