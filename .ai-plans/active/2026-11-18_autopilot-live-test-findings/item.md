---
type: proposal
title: Autopilot findings from live testing on 2026-11-14 (buffs, retries, pauses, thresholds, durations, wait step)
slug: 2026-11-18_autopilot-live-test-findings
created: 2026-11-18
state: active
data-classification: personal
---

# Autopilot findings from live testing on 2026-11-14 (buffs, retries, pauses, thresholds, durations, wait step)

## Problem or opportunity

The owner tested the autopilot live on 2026-11-14 and wants these observations added to the active autopilot plan. They asked that **every statement carry log evidence for examples** (the Docker game-server `*.jsonl` logs of that day are the corpus; nothing here has been checked against them yet). Their words, numbered as they gave them:

1. When the run starts it issues several buff commands if the spells are not actively up; often this causes autopilot to stop because the timeout is exceeded waiting for the lag from the abilities to clear.
2. Failures to set an ability do not attempt to re-arm it until after the next kill. Failed abilities should be taken into account (looking for affects to be set, or failure lines). For each ability with no clear marker of what its success / failure line looks like, the user should be able to mark it in the combat buff section with a "retry for affect" type of prompt (phrasing to be reviewed) meaning "this ability sets an affect in the affect summary window" (which equates to a GMCP message for affect up / down / true-up). It needs some mechanism to guard against excessive repeat issuance of the command through lag.
3. If the user does anything that can introduce lag there are various cases that lead to autopilot stopping completely. When it stops due to a timeout it should probably pause instead, so the user can resume. Improve the detection logic as well; timeouts during levelling are annoying. This is most often observed when multiple affects drop during the same tick. The current guard has improved the situation but there are still many gaps.
4. Several steps do not preserve their set values, for example the rest step, the weight step and the selected targets.
5. `{name}` on (buffs, target?) is incorrectly set when added as a default and gets rendered in game as an orange `ame}` because `{n` is a colour code. `{name}` is supposed to be a real value when sent to the game.
6. Review the quaffing logic, especially for things like haste: when the user uses potions to buff haste or similar skills, these can be executed whenever the affect drops.
7. Review the logic that measures ability-timing tuning, and default these durations to what the C# app defines when they are not otherwise known. (A duration is how long the affect lasts.) Create a new C# definition for the actual skill lag and define it where it has been tuned in game: the game client can help train the C# app's data. This should **not** be a client-to-server update; it should be an AI agent-to-C# behaviour, added as an ad hoc job in C# that runs automatically to fetch the most up-to-date information. When running in local development mode (the docker deployment on the dev machine) this information should be saved.
8. For buff abilities an explicit "only while out of combat" option is needed, for example the shadow knight's dark heal can only be executed out of combat. Similarly some combat buffs can only be applied while in combat.
9. Ability thresholds should be definable: for example heal only while HP is at or below some percent and/or only at or above some mana threshold; backstab only while the enemy is above a minimum threshold (the skill stops working at "big and nasty wounds", so percent of enemy life); apply a strategy when the player's percent HP is something versus the enemy's something. Percent of life should be shown as the phrase with a (%) after it.
10. The wait step between end-to-end cycles is not properly waiting. There should typically be at least a few minutes before going again, configurable, defaulting to about 3 minutes (after the last step completes and before the next round starts, creatures need to repop).
11. The abilities fog and dispel fog should never be offered as default buff-list abilities for any class.
12. Dark heal for the shadow knight can only be cast out of combat, so it works best as an in-between-combat heal when HP is below a threshold; it is also a verified spell.

## Proposed work

Add these observations to the active autopilot plan and work them from there (the nearest active plan today is `.ai-plans/active/2026-11-13_editable-autopilot-targets-synced`, which covers the target lists; the planner should say whether these belong in it or in a plan of their own). Each statement first gets its log evidence.

## Who benefits

Players levelling with autopilot (fewer stops, correct buffs, configurable waits); the owner, whose live test produced the list; the C# app's ability data (item 7).

## Constraints and known unknowns

- Evidence first: collect log examples from the 2026-11-14 Docker game-server `*.jsonl` (strip quotes, ANSI and JSON escapes before matching, or "absent" is a lie) for each item before planning it.
- Item 7: the data flow is agent-to-C# (an ad hoc C# job), never client-to-server; in local development mode the fetched values are saved. Where "skill lag" is defined in C# (next to `DurationTicks`) is a planning question.
- Item 5: `{name}` is a literal placeholder substituted at send time; `{n` also reads as a colour code in this MUD, so escaping and substitution order need checking.
- Known unknowns: which spells have no recognisable success / failure line today; which affects have GMCP up / down / true-up messages; the exact timeout that currently stops a run; how many cases lead to a stop and which could pause instead.

## Related

- `.ai-plans/active/2026-11-13_editable-autopilot-targets-synced`
- Memory/docs on ability durations (`DurationTicks` in every C# ability class; tick = 41 s)
- `.ai-plans/proposed/2026-11-18_world-map-extensions-round-2` and the other tickets from the same list
