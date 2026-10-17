# PR #160 — raw agent findings (unmerged, unverified)

Verbatim JSON reports returned by the nine parallel `/deep-review` agents, in the order they were spawned.
**These are raw model output.** They were not de-duplicated, not severity-normalized, and some claims were
later confirmed, narrowed or left as PLAUSIBLE by the orchestrator — the verified, merged result is
[review.md](review.md); the fix plan is [bugfix-proposal.md](bugfix-proposal.md). Treat nothing here as
established until it appears in review.md with a `CONFIRMED` tag.

- **PR head:** `8561e03098444c22814d63f7f9ef6e6a4147c1ec` · **merge-base:** `ad565a6d4f2159b1d3d0a7cce61a04e1dc08a6d2`
- **Line numbers** refer to the PR head versions of the files (exported copies of
  `crafting-helper.plugin.ts`, `crafting-helper-storage.ts`, and the diff were handed to the agents).
- **Why this file exists:** the agents' transcript files were 0 bytes when collected, so the hand-back message
  was the only copy of each report; these blocks were transcribed from those messages.
- **`severity`** is the agent's own label (`security|safety|correctness|performance|convention|nit`), not the
  orchestrator's.

| # | Angle | Agent id | Findings |
|---|-------|----------|----------|
| 1 | A — Line-by-line diff scan | `aae47ad99ed61f464` | 12 |
| 2 | B — Removed-behavior auditor | `a12d7a66340b288a3` | 9 |
| 3 | C — Cross-file tracer | `ad53eca515716819f` | 8 |
| 4 | D — Language-pitfall specialist (TS/JS/React) | `a3faf3adeefc15ae2` | 8 |
| 5 | E — Wrapper/proxy/defensive-copy | `a8529234bbcacd411` | 6 |
| 6 | Reuse — Duplicated helpers | `a4849ccec00a0f178` | 5 |
| 7 | Simplification + Efficiency (performance) | `a5bedca9fa94502dd` | 7 |
| 8 | Altitude + Conventions | `a9e467f0def4a0855` | 10 |
| 9 | Security + Safety (added for this request) | `a5f127a5bc538f560` | 10 |
|   | **Total raw findings** | | **75** |

Cross-reference to the consolidated IDs is at the end of this file.

---

## 1. Angle A — Line-by-line diff scan

```json
[
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 663,
    "summary": "SKILL_IMPROVED_RE / matchSkillImproved are unanchored substring matches on raw server text, so any player-typed 'Your crafting skill has improved. (N)' overwrites and persists the tracked skill level, which drives which tier's materials get pulled and crafted (consumed at lines 1252-1260).",
    "failure_scenario": "Improve run is active (state crafting/pulling_components/storing_trinket). Another player sends a channel line such as: Talar OOC: 'yay Your crafting skill has improved. (722)'. Real logs contain exactly these lines, e.g. Drungal grats 'Your crafting skill has improved. (700)'. The loop at 1252-1260 sets trackedSkillLevel=722 and setTrackedSkillLevel persists it. The next beginPullCycle calls tierForSkill(...,722), so the plugin pulls the 721-tier materials from the vault and crafts that tier far above the character's real skill, risking destroyed expensive materials. This repeats on every later spoof or paste, and the injected value is saved to localStorage.",
    "severity": "security"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 665,
    "summary": "matchCraftOutcome, matchVaultFailure, matchCraftInterrupted and matchCopyoverRecovery use line.includes() on any line of raw server text, with no anchoring and no check that the line is system output. Other players' say/tell/channel text can therefore drive the state machine (consumed at 1307-1345).",
    "failure_scenario": "State is 'crafting' with a real craft in flight. A player says \"You failed and destroyed some materials in the process.\". The plugin treats it as failed_destroyed, inflates the order's materialsUsed tally, sends `put` for every component and then a full re-pull and `craft`. Per the plugin's own comment at 1321-1322, those commands interrupt the real craft. Saying \"Copyover recovery complete.\" re-sends `craft` mid-craft and resets the 180s timer. Saying \"You were successful.\" sends `put 1 '<trinket>' vault` and starts another pull cycle. Saying \"You stop crafting.\" halts the run. Each message from any player in earshot produces a burst of live MUD commands.",
    "severity": "security"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 538,
    "summary": "parseQualitySpec accepts any digit string, with no 0-100 bound, even though quality comes from a '(NN%)' Condition value, so an unsatisfiable spec makes the Order loop craft off-spec items forever.",
    "failure_scenario": "The user mistypes `crafthelper order add 5 'diamond gem pain' 997+`, or uses `101+` or `150`. handleOrderAdd (1599-1608) accepts it. Every crafted gem measures at most 100%, so qualityMatchesSpec is always false and resolveOrderQuality takes the off-spec branch, which ends in `pacingTimer = setTimeout(() => beginPullCycle(api), ...)` at line 1020. The loop pulls, crafts and stores one item after another, consuming expensive materials until the vault runs dry. Nothing caps the off-spec count and the order never completes.",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts",
    "line": 121,
    "summary": "The per-character list store trusts localStorage after only an Array.isArray check, so malformed or old-schema order elements reach the state machine unvalidated and can throw mid-cycle or loop forever.",
    "failure_scenario": "The stored orders array holds an element like {\"id\":\"x\",\"itemName\":\"diamond gem pain\",\"quantityRemaining\":1,\"quantityTotal\":1} with no qualitySpec (from tampering, a version change, or other-origin script). `order start` accepts it because itemName is valid. After the craft and lore, handleRawData clears qualityTimer (lines 1287-1290) and calls resolveOrderQuality. That calls qualityMatchesSpec(quality, undefined) (plugin line 963 -> 557), which throws a TypeError inside the event handler. State stays 'checking_quality' with no timers armed, the crafted item stays in inventory, and the plugin answers 'Already running' forever. A non-numeric quantityRemaining gives NaN, so `remaining <= 0` is never true and the order crafts endlessly. The storage tests only cover syntactically invalid JSON.",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1196,
    "summary": "While the destroyed put-back chain (and the no-loss 150ms pacing wait at 1373) is pending, state stays 'crafting' with craftTimer cleared. A second outcome line is then processed as a fresh event, overwriting pacingTimer/craftTimer. The orphaned timers cannot be cleared by clearAllTimers and later fire duplicate commands.",
    "failure_scenario": "A failed_destroyed outcome starts putBackComponent, which sets pacingTimer=T1 while state is still 'crafting'. Within the ~150ms step a second outcome line arrives, e.g. a pasted 'You were successful.'. The crafting branch runs again: state becomes storing_trinket, `put 1 '<trinket>' vault` is sent and pacingTimer=T2 (beginPullCycle) overwrites T1. T1 is now untrackable and still fires, finishing the put-back chain with another beginPullCycle. Two pull cycles run concurrently and send duplicate `get` and `craft` commands. The same overwrite on the no-loss path leaves an orphaned craftTimer, which fires 180s later as a bogus 'No recognized outcome' error_stopped plus put-backs in the middle of a healthy run.",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1373,
    "summary": "No circuit breaker: failed_no_loss re-sends `craft` indefinitely, and failed_destroyed re-pulls the full recipe and re-crafts indefinitely. There is no consecutive-failure cap, no target level, and no stop at the skill cap.",
    "failure_scenario": "A tier row is above what the character can actually craft (user-edited tier table, or the spoofed level from finding 1). Every attempt returns 'You failed and destroyed some materials in the process.'. The plugin puts all components back, re-pulls them and crafts again, burning real materials on each loop until the vault is empty. A recipe that always returns 'You failed but did not lose any materials.' loops forever. A character already at the 1001 cap that starts `improve tailor start` also keeps crafting the 943 tier until the vault empties.",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1274,
    "summary": "A late vault-failure line arriving during the next component's pull is attributed to components[pullIndex] and materialsHeld is set to slice(0, pullIndex), which is off by one when the failure belongs to the previous `get`. The comment at 1333-1336 admits failures can arrive after the 200ms assume-success timeout, but this branch does not account for it.",
    "failure_scenario": "A 3-component recipe. `get 2 'X' vault` fails, but the server line arrives 250ms later, after onPullTimeout has moved to component 1. The failure is read in 'pulling_components' with pullIndex=1. The error blames component 1 ('Vault is out of Y') and sets materialsHeld=[X]. X was never pulled, so the put-back is a no-op or moves the user's own stock of X into the vault. Y, which was pulled successfully, is omitted and stays in inventory.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 972,
    "summary": "The destination container for `put` comes from unsanitized, unquoted user config (qualityContainerMap and orderHoldingContainer), and put results are never verified at 912, 944, 972 or 1075. A failed store is still counted as a successful route and order credit.",
    "failure_scenario": "The user sets Order holding container to 'my sack' or misspells it. `put 1 'diamond gem pain' my sack` fails in-game, but resolveOrderQuality still increments inSpecRouted, decrements quantityRemaining and eventually reports the order complete. Items sit in inventory, so a later `lore '<name>'` returns the first same-named item's old Condition and mis-routes new crafts. Unlike item names, this value gets no sanitizeItemName and no quoting.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1399,
    "summary": "The onEnable cleanup only clears timers and does not reset state, activeRecipe or materialsHeld. The host reuses the same closure on re-enable, so disabling mid-run leaves a non-idle state with no timers that nothing will ever advance.",
    "failure_scenario": "The craft is in flight (state 'crafting', materialsHeld set). The user toggles the plugin off and on in the Plugins UI (PluginHost.disable/enable reuse the module registered once at MainContainer.tsx:229). If the real outcome line arrived while disabled, state stays 'crafting' with craftTimer null. `crh improve spellcraft start` replies 'Already running (state: crafting)', and `improve stop` only sets stopRequested, which nothing consumes. Pulled materials are never returned. Only a page reload recovers. The plugin also has no socket-close handling, so its timers keep issuing commands after a disconnect/reconnect.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 765,
    "summary": "numOr accepts 0 for every timeout, and the schema declares min:0 on craftResponseTimeoutMs and the other timeouts. A 0 craft timeout fires immediately after `craft` is sent and stops the run, and the put-backs it triggers interrupt the craft.",
    "failure_scenario": "The user sets Craft response timeout to 0. sendCraft (line 1169) arms setTimeout(onCraftTimeout, 0). The timer fires immediately, enterError runs, and releaseMaterials sends `put` for the just-pulled components while the craft is still in flight. Per the plugin's own comment, that interrupts the craft. Every run aborts with 'No recognized outcome ... within 0ms'.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/normalizePluginModule.ts",
    "line": 54,
    "summary": "A bundled host change passes through onAlias for ALL plugins, activating the alias handlers of seven other core plugins (brew, enchant, gourd, people, text-to-speech, warlock-alphabet, world-time-and-identity) that were dead on the base. This is outside the Crafting Helper's scope and has only a generic test.",
    "failure_scenario": "On base, normalizePluginModule returns no onAlias, so tryExecuteAlias skips every plugin. After this PR, typed input such as `scan gourds`, `remove gourd 3` or `set status <name>` starts being consumed or acted on by plugins whose alias code has never run in production. This changes the behaviour of existing users' sessions as a side effect of a crafting plugin PR.",
    "severity": "convention"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 809,
    "summary": "The 'debug' config option is exposed in the settings UI (lines 1911-1914) and parsed into EngineConfig, but nothing reads cfg.debug, so the 'Debug logging' toggle does nothing.",
    "failure_scenario": "The user enables 'Debug logging' while troubleshooting a stuck run. No extra output is produced anywhere in the plugin, which implies tracing is on when it is not.",
    "severity": "nit"
  }
]
```

---

## 2. Angle B — Removed-behavior auditor

```json
[
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1307,
    "summary": "The new copyover branch fires on an unanchored substring match of 'Copyover recovery complete.' (lines 662, 685-687, any line in any payload). It resends the craft and re-arms the full 180s timer with no retry cap, so the bounded-timeout guarantee from f07a995 no longer holds on this path.",
    "failure_scenario": "The helper is in state 'crafting' for a high-tier craft. Another player says or tells: Bob says 'Copyover recovery complete.' The line passes matchCopyoverRecovery, craftTimer is cleared, and sendCraft sends a second `craft spellcraft 'ruby gemstone'` while the first craft is still running. The plugin's own comment at lines 1321-1323 says a command interrupts a craft, so the server prints 'You stop crafting.' and the helper goes idle with the second craft running untracked. Repeating the line every <180s while the helper is crafting keeps re-arming the timer, and nothing counts or limits recrafts. A crash-looping server that prints the line each time does the same.",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1317,
    "summary": "The copyover branch runs whenever state==='crafting', but state stays 'crafting' during the 150ms pacing gap after failed_no_loss (1367-1373) and during the whole destroyed put-back chain (1189-1212). The branch does not cancel pacingTimer, and sendCraft (1169) overwrites craftTimer without clearing it. This yields a duplicate craft and an orphaned 180s timer that no later code can cancel.",
    "failure_scenario": "A 'You failed and destroyed...' outcome is handled and putBackComponent starts its chain; state is still 'crafting'. A copyover line arrives mid-chain, so sendCraft sends `craft` and sets craftTimer T1 while materials are only partly put back. The chain finishes, beginPullCycle then sendCraft runs again, and craftTimer T2 overwrites T1's handle. clearAllTimers and the outcome-path clearTimeout can only reach T2. About 180s later T1 fires, onCraftTimeout sets craftTimer=null (losing T2's handle too), calls enterError('No recognized outcome...') and releaseMaterials, and sends `put` commands. This aborts a healthy run, or one the user already stopped or disabled. The window is narrow (about 150ms after a no-loss failure, or the put-back chain after a destroyed craft), but a forged line (previous finding) can hit it deliberately.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 538,
    "summary": "parseQualitySpec accepts any digit string, including values above 100. Quality is a percentage, and no 'Condition' line in the DSL game logs exceeds 100%. An unattainable spec makes every craft off-spec, and the order loop (1020, beginPullCycle) has no attempt cap, so it keeps crafting until the vault runs dry.",
    "failure_scenario": "The user types `crh order add 5 'arcanium chainmail helmet' 997+`, a typo for 97+. The spec is accepted as atLeast 997 and the order auto-starts. Every crafted item reads at most 100%, so qualityMatchesSpec is false and the item is routed to the vault. The branch at line 1020 then re-pulls and re-crafts forever, consuming real materials each pass, until a vault-failure line stops the run.",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts",
    "line": 121,
    "summary": "Persisted order queues are loaded with `arr as T[]` and no per-item validation. The 5bbd62e inverted-range rejection and the quantity checks exist only on the add path, so a corrupted or poisoned localStorage entry bypasses them at run time.",
    "failure_scenario": "localStorage 'shatteredarchive.plugins.crafting-helper.orders.<char>' holds [{id:'x',itemName:'arcanium chainmail helmet',quantityRemaining:null,quantityTotal:3,qualitySpec:{kind:'range',min:99,max:1},createdAt:0}]. advanceOrderQueue accepts it, since the recipe lookup only checks itemName. qualityMatchesSpec is never true for the inverted range, and `null - 1` is -1, so the remaining<=0 check at line 978 would end the run if a spec ever matched. With quantityRemaining:'abc' it becomes NaN and never completes. The helper crafts and burns materials indefinitely.",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/normalizePluginModule.ts",
    "line": 54,
    "summary": "The PR's claim that onAlias was 'previously dropped' is true, but it was an accidental regression, not a deliberate gate. The fix re-enables alias dispatch for eight shipped plugins (brew, enchant, gourd, people, questbot, text-to-speech, warlock-alphabet, world-time-and-identity) inside a feature PR. The only new test uses a synthetic plugin.",
    "failure_scenario": "Pre-image history: until b825d70 (2026-08-14), pluginHost.tryExecuteAlias read the raw `modules.get(pluginId)`. That commit changed it to `cleanup.module ?? ...`, the normalized copy, which never carried onAlias, so these plugins' aliases have been dead since that date. After this PR, for a user with these plugins enabled: typing `map` with text-to-speech enabled (commandGateEnabled defaults true, pattern 'map') calls stopSpeaking()+discardQueued() for the first time in two months. `brew <word>` with no matching recipe is consumed with 'No recipe found' (brew.plugin.ts onAlias) and never reaches the MUD. `gq`/`gd`/`scan gourds`, `set status`/`set team`, and `enchant ...` are consumed again. No existing-plugin alias test covers this, and the behaviour change is not in the PR title or description. I found no double-handling: user-script aliases still take priority, observer plugins return undefined, and consumers match disjoint commands.",
    "severity": "convention"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1545,
    "summary": "The cee2be5 identity guard runs only at start. characterKey() is re-read on every storage write (936, 985, 1002, 1031, 1239, 1256), and onEnable (1391-1407) listens only to raw-data, with no socket-closed or identity-updated reset. The 'wrong character's storage key' risk the commit cites is therefore still possible mid-run.",
    "failure_scenario": "`crh improve spellcraft start` runs as 'alpha' and the helper is in 'crafting' with a 180s timer. The user logs the same tab into 'beta'; GMCP login_data sets the identity to 'beta' (userScriptRuntime.ts:767-769). If beta crafts manually, any 'Your crafting skill has improved. (N)' line reaches matchSkillImproved (no craft-type check) and writes setTrackedSkillLevel('beta', 'spellcrafting', N), putting alpha's craft type under beta's key. When the stale craftTimer fires, enterError and releaseMaterials send `put 2 'uncut ruby stone' vault` into beta's session.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 804,
    "summary": "The 91ec3ff sanitization covers only tier-table, craft-type and component names. orderHoldingContainer (trim only) and the qualityContainerMap container (raw, line 611) are also config-sourced. They are interpolated unquoted into `put 1 '<item>' ${container}` (972) with no sanitizing or quoting.",
    "failure_scenario": "The user sets the Quality map row `90-100 | my chest`. Every finished item sends `put 1 'ruby gemstone' my chest`. The MUD parses 'my' as the container with a stray extra token, so the put fails or targets the wrong thing. The engine ignores the unrecognized reply and continues, leaving finished items in inventory while it counts them as routed and in-spec.",
    "severity": "convention"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1169,
    "summary": "After 5c0d0c4 removed the craft timeout and f07a995 re-added it, the config field still allows min 0 (schema line 1891) and numOr accepts 0. A value of 0 arms setTimeout(...,0), so the engine aborts the instant a craft is sent instead of meaning 'no timeout'.",
    "failure_scenario": "A user who read the old design ('waiting indefinitely is correct') sets Craft response timeout to 0. sendCraft sends `craft ...` and the timer fires on the next tick. onCraftTimeout calls enterError, whose releaseMaterials sends `put <qty> '<material>' vault` about 150ms later. This interrupts the craft that is running server-side and returns the pulled materials.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/normalizePluginModule.ts",
    "line": 36,
    "summary": "The new `actions` passthrough has no consumer. PluginConfigModal reads `created?.configSchema` from the raw create() result (PluginConfigModal.tsx:54), and pluginHost never reads `.actions` off the normalized module. The code and its tests change nothing observable.",
    "failure_scenario": "Revert the `actions:` line: every existing plugin's Configure panel still renders its action buttons, because the modal uses the un-normalized schema. The added unit tests assert only on the normalizer's own output.",
    "severity": "nit"
  }
]
```

---

## 3. Angle C — Cross-file tracer

```json
[
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1343,
    "summary": "Craft outcome, interruption, vault-failure, copyover and Condition lines are matched with unanchored String.includes() on every line of the raw server stream, so any other player's say/tell/emote can drive the state machine.",
    "failure_scenario": "State is 'crafting' (a craft can run up to ~150s). A bystander types `say You were successful.` The crafter receives `Bob says 'You were successful.'`. matchCraftOutcome (line 666) matches it as 'success'. The engine records materials used, sets state to storing_trinket, sends `put 1 '<trinket>' vault`, then beginPullCycle sends `get 2 '<material>' vault` while the real craft is still in flight, which interrupts it. Other spoofs work the same way. `Bob tells you 'I see nothing like that in the vault.'` forces error_stopped. `...'You stop crafting.'` forces idle. `...'Copyover recovery complete.'` re-sends `craft`. In order mode a spoofed `Condition: Mint (100%)` while checking_quality routes a low-quality item to the hand-off container and credits the order.",
    "severity": "security"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1253,
    "summary": "The 'Your crafting skill has improved. (N)' line is scanned in every mid-cycle state with an unanchored regex. It overwrites trackedSkillLevel and persists it, and it picks the tier for the next cycle in improve mode, so a spoofed line makes the bot pull and craft far above the real skill.",
    "failure_scenario": "Improve run is active and the real spellcrafting skill is 300. Another player sends `tell <name> Your crafting skill has improved. (1001)`. Line 1255 sets trackedSkillLevel=1001 and setTrackedSkillLevel() stores it. The next beginPullCycle uses tierForSkill(..., 1001), which returns the top tier (`diamond gemstone`, or netherium for weapons). The plugin pulls those rare materials from the vault and crafts at a tier the character cannot sustain. `failed_destroyed` outcomes then burn the materials irreversibly. The only re-check against `score` happens at improve start.",
    "severity": "security"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1399,
    "summary": "The cleanup returned by onEnable only unsubscribes and clears timers. It does not reset the engine (state, mode, activeRecipe, materialsHeld, stopRequested), and it does not return pulled materials. The host keeps the same closure for the whole connection and re-enables it with that stale state.",
    "failure_scenario": "Improve run is in 'pulling_components' with `get 2 'netherium bar' vault` already sent (materialsHeld set at line 1139). The user toggles the plugin off in PluginsModal (PluginsModal.tsx:80 calls pluginHost.disable, which runs this cleanup). Timers are cleared, state stays 'pulling_components', and the bars stay in the inventory, never put back. The module is registered once per connection (MainContainer.tsx:229), so re-enabling reuses the same instance. If the run was in 'crafting', the first 'You were successful.' that appears after re-enable (for example from the user's own manual craft) hits handleCraftSuccess and beginPullCycle. The unattended loop restarts with no `crafthelper ... start`. Sibling plugins reset volatile state in this cleanup (enchant.plugin.ts:206-210, gourd.plugin.ts:205-210).",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 816,
    "summary": "characterKey() trusts window.__SA_IDENTITY__.characterName, which the repo documents as going stale after a same-connection character switch when GMCP login_data does not re-fire. It is also re-read on every storage call rather than captured at run start. The only guard rejects the '__unknown__' value.",
    "failure_scenario": "The user quits character A and logs into character B on the same connection with GMCP off. This is the case documented at world-time-and-identity.plugin.ts:105-116. __SA_IDENTITY__.characterName stays 'A', and world-time-and-identity is off by default so nothing corrects it. `crh order start` on B passes the guard at line 1739 and runs A's persisted queue (getOrderQueue('a')), pulling and crafting from B's vault. Skill levels and completed orders are written under A's key. If the name changes mid-run, removeOrder/updateOrder/addCompletedOrder at lines 994-1002 use a different key than the one the order was loaded under, so the order is never decremented or removed.",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1391,
    "summary": "The engine subscribes only to shatteredarchive:raw-data. It ignores game:remote-server:close and game:character-login. Its timers keep firing after a socket drop or reconnect, because pluginHost is not reset when the same connection reconnects. Plugin sendCommand is silently dropped while the socket is closed, and typed stop commands are also dropped.",
    "failure_scenario": "A craft starts at T, so craftTimer (line 1169) is armed for 180s. The socket drops at T+120s. sendTelnetData returns silently when ws is not OPEN (useGameConnection.ts:148), and `crh improve stop` typed while disconnected is discarded (useGameCommand.ts, `if (!isConnected) return`). The user reconnects with the same connectionId, so the plugin instance survives, and is at the 'Password:' prompt at T+180s. onCraftTimeout runs enterError, which runs releaseMaterials (lines 1064-1080). It types `put 2 '<material>' vault` at 150ms intervals into the login prompt. level-progress.plugin.ts:395 and tick-warning.plugin.ts:134 both subscribe to game:remote-server:close to disarm, and this plugin does not.",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts",
    "line": 121,
    "summary": "Persisted order arrays are accepted with only Array.isArray. Elements are never validated, but the plugin assumes every StoredCraftOrder has id, itemName and qualitySpec. A malformed or legacy entry throws inside the raw-data handler, or becomes impossible to remove.",
    "failure_scenario": "localStorage 'shatteredarchive.plugins.crafting-helper.orders.grondak' holds `[{\"id\":\"a\",\"itemName\":\"diamond gem pain\",\"quantityRemaining\":1,\"quantityTotal\":1,\"createdAt\":1}]`, with qualitySpec missing from an older or hand-edited record. `crh order start` pulls and crafts. On the Condition line, qualityTimer is cleared (line 1288) and then resolveOrderQuality (line 963) throws on `spec.kind`. The throw is uncaught inside the event listener. State stays 'checking_quality' with no timer, so `crh order stop` only sets stopRequested and nothing consumes it, and `order start` reports 'Already running'. Disabling the plugin does not reset state either. Only a page reload recovers. With `[null]` or `[{}]`, list() returns objects with no id. advanceOrderQueue errors with `remove ... undefined`, and removeOrder can never match, so order mode is blocked permanently.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1829,
    "summary": "The full default tier table and craft-type table are shipped as config defaults. The host's Save writes the entire draft, defaults included, into userConfig, so the defaults are frozen per user and later fixes to DEFAULT_TIER_TABLE_CONFIG never reach anyone who has saved the config once.",
    "failure_scenario": "A user opens Configure and clicks Save. PluginConfigModal builds the draft as {...defaults, ...initialUserConfig} and save() (PluginConfigModal.tsx:89-95) persists every key through usePlugins.updatePluginConfig, which replaces userConfig wholesale. The ~100-row tierTable string is now stored. A later release corrects a wrong material row, but syncInstalled merges {...defaults, ...userConfig}, so the stale stored rows still drive which vault items get pulled and crafted. The plugin's own regression test ('pre-multi-component saved config') records this failure mode already happening once. Recipes that drive irreversible actions should not be frozen into user config.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/normalizePluginModule.ts",
    "line": 54,
    "summary": "Passing onAlias through normalizePluginModule revives alias interception for 8 other plugins that have been dead since commit b825d70 (tryExecuteAlias started reading cleanup.module, the normalized copy). Some of them consume input unconditionally, and the PR neither lists nor tests them.",
    "failure_scenario": "On the base, the normalized module has no onAlias, so brew, enchant, gourd, people, questbot, warlock-alphabet, text-to-speech and world-time-and-identity never see typed input. After this PR, with those plugins enabled: gourd unconditionally rewrites `gq <x>` to `quaff ...` and `gd <x>` to `drop ...` (gourd.plugin.ts:234-261). people swallows `set status ...`, `set team ...` and `show info|kinfo|cinfo|craft ...` (people.plugin.ts:332-364). brew swallows `brew <name>`, `showbrews`, `showletters` and `showsymbols`. questbot swallows `pq ...`. warlock-alphabet swallows `wa ...`. enchant swallows `enchant ...`. text-to-speech, world-time and the people `who` arming only observe and return undefined. The patterns are disjoint from each other and from `crh`/`crafthelper`, so no collision, but all of these behaviours go live at once. The new tests cover only a toy plugin.",
    "severity": "convention"
  }
]
```

---

## 4. Angle D — Language-pitfall specialist (TypeScript / JavaScript / React)

```json
[
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1253,
    "summary": "SKILL_IMPROVED_RE is unanchored and is scanned in every mid-cycle state, so any player's text containing 'Your crafting skill has improved. (N)' overwrites trackedSkillLevel, is persisted via setTrackedSkillLevel, and drives tier selection.",
    "failure_scenario": "Improve run at real skill 130 (any state except idle/awaiting_score, e.g. 'crafting'). Another player sends `tell <you> Your crafting skill has improved. (842)`. The raw-data line `Bob tells you 'Your crafting skill has improved. (842)'` matches SKILL_IMPROVED_RE (line 663; no anchor, no channel-text exclusion). trackedSkillLevel becomes 842 and is written to localStorage (line 1256). The next beginPullCycle calls tierForSkill(842) and picks the 841 'diamond gemstone' row. It sends `get 1 'uncut diamond stone' vault` and `craft ... 'diamond gemstone'` at skill 130, which can destroy the expensive materials. The level is never range-checked (not monotonic, not capped at 1001) and is not re-verified with `score` mid-run.",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 666,
    "summary": "The outcome, interrupt, vault-failure, copyover and Condition matchers use `includes` or unanchored regexes on whole lines, and handleRawData sees all server text including other players' say/tell/shout. Anyone can drive or stop the state machine by sending those phrases.",
    "failure_scenario": "State 'crafting' (a window of up to ~150 s per craft). A player sends `tell <you> You were successful.`. The line `X tells you 'You were successful.'` satisfies matchCraftOutcome (line 666). The engine records a success, sets state 'storing_trinket', and `put 1 '<trinket>' vault` fails because nothing exists. It then pulls more materials and sends a second `craft` while the real one is still running. `tell ... You stop crafting.` makes matchCraftInterrupted (line 681) call clearAllTimers and goIdle, which aborts the run. `tell ... I see nothing like that in the vault.` during pulling or crafting calls enterError (lines 1269 and 1337) and stops the run. `tell ... Condition: x (100%)` during order-mode 'checking_quality' (line 1285) is accepted as the lore reading. The item is then routed to the best-quality container and credited to the order. Lines should be matched as a whole line, after stripping an optional prompt, and lines that carry channel text should be rejected.",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 972,
    "summary": "State is not advanced after an outcome or quality line is consumed. 'checking_quality' and 'crafting' stay live during the pacing delay, so a second matching line is processed again and pacingTimer/qualityTimer handles are overwritten, leaving orphaned timers that clearAllTimers cannot cancel.",
    "failure_scenario": "Order mode, order of 3 at 95+. The true lore reply `Condition: flawless (97%)` reaches resolveOrderQuality. It sends `put`, sets activeOrder.quantityRemaining to 2 (line 1003), and arms pacingTimer A (1004). State is still 'checking_quality' and qualityTimer is already cleared (1287-1290). Within the 150 ms pacing delay a second line matching CONDITION_RE arrives (a duplicate chunk, or a spoofed tell). handleRawData re-enters resolveOrderQuality. It sends a second `put 1 '<item>' <container>` and decrements again (the order is credited 2 for 1 crafted item). It overwrites pacingTimer with B, so A is orphaned and still fires. Two beginPullCycle runs then execute concurrently, sending duplicate `get` commands and a second `craft`. The same pattern exists for outcomes. At line 1373 failed_no_loss leaves state 'crafting' while the retry timer is pending. In beginDestroyedRecovery (1189-1212) state stays 'crafting' while the put-back chain runs. A 'You stop crafting.' line there calls clearAllTimers (1325), which kills the put-back chain after materialsHeld was already nulled, so the remaining components are stranded in inventory.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 541,
    "summary": "parseQualitySpec and the order-add quantity check accept unsatisfiable or unbounded values (quality above 100, huge digit strings), so an order can loop forever consuming vault materials.",
    "failure_scenario": "User mistypes `crafthelper order add 3 'diamond gem pain' 197+` (meant 97+). The regex `^(\\d+)\\+$` accepts it, with no `<= 100` check. Every crafted gem reads at most 100%, so qualityMatchesSpec is always false. resolveOrderQuality routes each item off-spec to the vault and re-enters beginPullCycle (line 1020) with no attempt cap or consecutive-off-spec limit. It keeps pulling diamond stones and essences until the vault is empty. A quantity of 99999999999999999999 parses to 1e20, and `1e20 - 1 === 1e20`, so the order never completes either (qty check at line 1601 is only isFinite and > 0).",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 972,
    "summary": "The sanitizeItemName fix (finding 1.3) does not cover the container names. orderHoldingContainer (804-807) and the qualityContainerMap containers (606-628) are interpolated unsanitized and unquoted into `put`. sanitizeItemName also only strips `'`, not CR/LF/control characters.",
    "failure_scenario": "Container name `Bob's pouch`, or `bag\\rquit` arriving through a hand-edited or synced config (a textarea normalises line breaks, JSON/localStorage does not). The tier-table sites are sanitized, but this one sends `put 1 'diamond gem pain' Bob's pouch`, which the MUD argument parser splits or mis-quotes so the put fails. The plugin still credits the order and moves on without checking that the put succeeded. With an embedded `\\r` or `\\n`, merc-mud's read_from_buffer (comm.c:1109-1118) treats both as line terminators, so `put 1 'x' bag` and then `quit` are two commands. api.sendCommand forwards the string raw (useGameConnection.ts:166-172 and game-server index.ts:316-319). Strip or reject all control characters and quote or validate every config-sourced name, including containers and verb.",
    "severity": "security"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts",
    "line": 121,
    "summary": "Persisted order and history arrays are accepted with only an Array.isArray check, with no per-item shape validation. A malformed entry makes the engine throw after its timers were cleared, or leaves it wedged.",
    "failure_scenario": "localStorage 'shatteredarchive.plugins.crafting-helper.orders.<char>' holds an entry from an older schema or a hand edit: `{\"id\":\"x\",\"itemName\":\"diamond gem pain\",\"quantityRemaining\":1,\"quantityTotal\":1,\"createdAt\":1}` with no qualitySpec. The entry is first in the queue and passes getOrderItemRecipe. In 'checking_quality' the lore reply clears qualityTimer (plugin lines 1287-1290), then resolveOrderQuality calls qualityMatchesSpec(q, undefined). `spec.kind` throws a TypeError (line 558) out of handleRawData. State stays 'checking_quality' with no timers, so `order stop` and `order start` report 'already running' until reload. An entry whose id is not a string cannot be removed with `order remove`, so the queue head stays poisoned.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 763,
    "summary": "numOr accepts 0 and arbitrarily large finite numbers for every delay and timeout, and the schema only sets min: 0. setTimeout delays above 2^31-1 fire immediately, and a 0 timeout expires at once.",
    "failure_scenario": "User sets 'Craft response timeout' to 3000000000, or 0, thinking 'wait forever' or 'disable'. numOr returns it (finite and >= 0). `craftTimer = setTimeout(..., 3e9)` (line 1169) fires on the next tick because browsers clamp delays above 2147483647 ms to ~0. onCraftTimeout calls enterError, whose releaseMaterials sends `put` for all pulled components while the craft is still in progress, interrupting it. Likewise commandPacingDelayMs = 0 makes the get, put and craft sequence fire back-to-back with no throttling. numOr should clamp to a sane [min, 2^31-1] range and keep the default for out-of-range values.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1399,
    "summary": "The onEnable cleanup only clears timers. It does not return materialsHeld to the vault or reset the engine state, so disabling the plugin or a connection reset mid-run strands pulled materials.",
    "failure_scenario": "Mid-improve, after `get 2 'netherium bar' vault` and the other pulls, the user toggles Crafting Helper off in the Plugins modal. A disconnect has the same effect: connectionId becomes 'default', so pluginHost.shutdown() calls disable() (MainContainer.tsx:225-235). onDisable runs this cleanup, which calls off() and clearAllTimers() (1399-1401) but never calls releaseMaterials. The pulled bars stay in the character's inventory. The help text promises 'if the run stops, these go back into the vault', and the next fresh instance starts idle with no record of them.",
    "severity": "nit"
  }
]
```

---

## 5. Angle E — Wrapper / proxy / defensive-copy correctness

```json
[
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 963,
    "summary": "resolveOrderQuality can throw (qualityMatchesSpec reads spec.kind on an order whose qualitySpec is missing) after the quality timer was already cleared and before any state change, which wedges the engine with no timers and a dead stop command.",
    "failure_scenario": "The persisted order record lacks `qualitySpec`. This can happen through hand-edited, truncated or poisoned localStorage, and the list store does no per-element validation (see storage line 121). Run `crh order start`. The craft succeeds, state becomes checking_quality, and `lore` sends. On the 'Condition: ... (97%)' line, handleRawData clears qualityTimer (lines 1287-1291) and calls resolveOrderQuality. That calls qualityMatchesSpec(97, undefined), which throws TypeError, so the `put 1 '<item>' <container>` is never sent. state stays 'checking_quality' forever with every timer null. `crh order stop` only sets stopRequested, which nothing consumes. `order start` and `improve start` answer 'Already running'. Each later 'Condition:' line throws again. The crafted item stays in inventory and only a page reload recovers.",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts",
    "line": 121,
    "summary": "The list store accepts any JSON array from localStorage without validating its elements, so a poisoned or corrupt head entry can never be removed through the plugin's own commands and it blocks every valid order queued behind it.",
    "failure_scenario": "localStorage key `shatteredarchive.plugins.crafting-helper.orders.<char>` holds '[null]', '[{}]' or '[7]'. This is the corrupted/poisoned-storage case (d) in the threat model. list() returns `{}` for that element. `crh order start` takes queue[0], so next.itemName is undefined. getOrderItemRecipe(undefined) is falsy and the engine goes to error_stopped with the advice 'remove it with `crafthelper order remove undefined`'. Running that command calls removeWhere with the predicate `o.id === 'undefined'`. For a null element the predicate throws TypeError on `null.id`, and for `{}` it never matches. The entry therefore cannot be removed. Every later `order start` fails on queue[0], and valid orders appended behind it never run until the user manually clears localStorage. A numeric field stored as a non-number, such as quantityRemaining:'abc', gives NaN - 1, so `remaining <= 0` is never true. That order then never completes and keeps pulling vault materials until the vault runs dry.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1256,
    "summary": "The storage character key is re-resolved from the mutable global `__SA_IDENTITY__` at every read and write instead of being captured when the run starts, and the engine state survives a character change, so one character's run can write into another character's data.",
    "failure_scenario": "As 'alice', run `crh improve spellcraft start`, and let it reach state 'crafting' with the 180s craftTimer pending. The connection drops and the user logs in as 'bob' on the same connection. GMCP login_data then sets `__SA_IDENTITY__.characterName='Bob'`, and nothing resets the engine. Bob manually crafts tailoring and receives 'Your crafting skill has improved. (512)'. The skill-up scan (lines 1253-1259) runs in every non-idle state, so it calls setTrackedSkillLevel(characterKey()='bob', 'spellcrafting', 512). Bob's key now holds alice's craft type with bob's tailoring level, and the HUD shows trackedSkillLevel=512. The same late binding applies to order runs: updateOrder/removeOrder at lines 994 and 1002 silently no-op under bob's key, while addCompletedOrder at line 985 writes alice's completion record into bob's history. The `__unknown__` guard exists only at the start commands (lines 1545, 1590, 1739), not at the write sites.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts",
    "line": 127,
    "summary": "Order progress (quantityRemaining, completion removal and the history append) reaches localStorage only after a 400ms trailing debounce, with no flush on pagehide or disable, and write failures are swallowed, so progress can silently revert and cause extra crafts.",
    "failure_scenario": "The last in-spec craft of an order resolves. resolveOrderQuality calls addCompletedOrder and removeOrder (plugin lines 985 and 994), or updateOrder for quantityRemaining (line 1002). The user sees 'Order ... complete' and presses F5 or closes the tab within 400ms. The queued persist timer never fires. After reload the order is back in the queue with quantityRemaining=1 and no history record, so the next `order start` crafts one more item and consumes vault materials. A QuotaExceededError in setItem (line 137) is swallowed by `catch {}`, which loses progress the same way on any later reload, with no message to the user.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts",
    "line": 148,
    "summary": "list() claims to return a copy that a caller can never use to corrupt persisted data, but `{ ...item }` is a one-level copy, so the nested `materialsUsed` and `qualitySpec` objects are still the live store references. The write paths append() (line 152) and updateWhere() (line 174) also keep the caller's object references.",
    "failure_scenario": "Call `const q = getOrderQueue('a'); q[0].materialsUsed!['x'] = 5;`. A later getOrderQueue('a')[0].materialsUsed is {x:5}, and the debounced persist writes it to localStorage, so the 'review 3.8 fixed' guarantee is false for nested fields. Likewise `const t = {...}; updateOrder(k, id, {materialsUsed: t}); t.x++` mutates stored state, and the same applies to the object passed to addOrder or addCompletedOrder. The plugin currently copies before mutating (recordMaterialsUsed, line 931), so no live caller trips this today. The latent hazard sits in exactly the field the plugin tallies.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.test.ts",
    "line": 174,
    "summary": "The two 'deep-enough copy' aliasing tests only mutate a top-level scalar (quantityRemaining, quantityTotal), so they pass with the one-level copy and never pin the nested `materialsUsed` or `qualitySpec` copy depth. The plan doc (Task 9) says the copy depth must be pinned, not assumed.",
    "failure_scenario": "The tests at lines 174-183 and 239-248 set `first[0].quantityRemaining = 999` and `first[0].quantityTotal = 999`. They stay green with the current `{ ...item }` and would also stay green if `list()` were never deepened for nested objects. Mutating `first[0].qualitySpec.min` or `first[0].materialsUsed['x']` (or a record's materialsUsed in the history test) and re-reading would fail, but no test does it. No test covers write-side aliasing, where the caller's object is mutated after addOrder or updateOrder.",
    "severity": "nit"
  }
]
```

---

## 6. Angle Reuse — Duplicated helpers

```json
[
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts",
    "line": 120,
    "summary": "The lazy-load block was copied from peopleDb.ts but dropped its per-element validation: createPerCharacterListStore accepts any JSON array and casts it to T[] with no element checks, whereas peopleDb.ts:43 checks `p?.name` and this file's own skill store (line 51) checks `typeof entry.level`. A malformed stored order then throws inside the raw-data handler and wedges the engine.",
    "failure_scenario": "localStorage 'shatteredarchive.plugins.crafting-helper.orders.<char>' holds `[{\"id\":\"a\",\"itemName\":\"diamond gem pain\",\"quantityRemaining\":1,\"quantityTotal\":1}]`, with no qualitySpec (hand-edited, poisoned, or schema drift). `order start` loads queue[0] (plugin.ts:1031-1037) and passes the getOrderItemRecipe check. After the craft succeeds, the lore reply reaches handleRawData, which clears qualityTimer (plugin.ts:1287-1290) and calls resolveOrderQuality. Line 963 calls qualityMatchesSpec(quality, undefined), which throws `Cannot read properties of undefined (reading 'kind')` (plugin.ts:558) before the `put` at line 972. State stays 'checking_quality' with no timer armed. `order stop` only sets stopRequested (plugin.ts:1784), which nothing checks. `order start` answers 'Already running'. The item stays in inventory, and the run stays stuck until a page reload.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 763,
    "summary": "numOr() is a weaker private re-implementation of the config-number coercion in text-to-speech.plugin.ts:287-291 (clampNumber, module-private, so it would need exporting). It has no upper bound, and Number(null) and Number('') become 0 instead of the fallback. Huge timeout values therefore reach setTimeout unclamped.",
    "failure_scenario": "A user who wants 'never time out' sets Craft response timeout to 3000000000 in the config modal. The modal's `max` is advisory, and the schema declares only `min: 0`. numOr returns it unchanged, so sendCraft's setTimeout(..., 3e9) (plugin.ts:1169) exceeds the 2^31-1 ms limit and fires after about 1 ms. onCraftTimeout (plugin.ts:1172) then calls enterError, and releaseMaterials (plugin.ts:1064-1080) sends `put <qty> '<material>' vault` for every pulled component while the server is still mid-craft. The craft is interrupted and the run aborts with the misleading error 'No recognized outcome ... within 3000000000ms'.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts",
    "line": 127,
    "summary": "The debounced persist (400 ms trailing edge, no flush on pagehide/unload) was copied from peopleDb.ts, where it caches who-list data and a lost write is harmless. Here it guards order progress (quantityRemaining, queue removal, completed history), so a lost write means real crafting materials get spent again.",
    "failure_scenario": "The last in-spec item of an order is routed. resolveOrderQuality calls addCompletedOrder and removeOrder (plugin.ts:985-994), or updateOrder with the decremented quantity (plugin.ts:1002). The player reloads or closes the tab within 400 ms. The persist timer never runs, so the reloaded client still has the order in the queue at the old quantityRemaining and no history record. `crafthelper order start` then pulls vault materials and crafts an extra item. This applies equally to the skill-level and materialsUsed tally writes.",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts",
    "line": 41,
    "summary": "The 'shared per-character list-store helper' is shared only inside this file. The skill-level store (lines 41-80) is a line-for-line copy of peopleDb.ts:33-80 (same ensureLoaded/writePersist/persist and the same PERSIST_DELAY_MS = 400) and does not use the in-file factory (lines 104-143). peopleDb.ts and globalScriptsStore.ts:38-59 (a keyed map of 400 ms debounce timers, the same shape as the factory) were not changed to call it. The result is four independent copies of one debounce-persist pattern, and they have already diverged.",
    "failure_scenario": "(1) The eviction at line 36 sorts `a[1].updatedAt - b[1].updatedAt` with no guard, while peopleDb.ts:53 uses `(lastSeen ?? 0)`. Load (line 51) does not validate updatedAt, so a stored map of more than 500 entries without updatedAt gives a NaN comparator and arbitrary eviction, which can drop the current character's skill level. (2) The element validation differs between the copies, as in the first finding. (3) Any later fix, such as a pagehide flush or a quota-error handler, has to be applied in four places.",
    "severity": "convention"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 533,
    "summary": "QualitySpec is declared a second time. It is structurally identical to StoredQualitySpec in crafting-helper-storage.ts:183-186, even though this file already imports `type StoredCraftOrder` from that module (line 13). It could import or alias StoredQualitySpec instead.",
    "failure_scenario": "A contributor adds a new spec kind, such as 'atMost', to one union but not the other. Orders persisted with that kind then pass type-checking at the storage boundary but are treated as invalid by qualityMatchesSpec (plugin.ts:557-561). That function falls through to the range branch, reading `spec.min` and `spec.max` as undefined, so every comparison is false and the order never counts as in-spec.",
    "severity": "nit"
  }
]
```

---

## 7. Angle Simplification + Efficiency (performance)

```json
[
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1307,
    "summary": "The new copyover auto-recraft fires on any line that merely contains 'Copyover recovery complete.', with no attempt cap, pacing, or proof that a copyover happened. Each match resends the craft command and re-arms the full 180s watchdog.",
    "failure_scenario": "State is 'crafting' (a craft was sent at t0 and craftTimer is armed for 180s). Another player in the room types `say Copyover recovery complete.`, so the client receives `Bob says 'Copyover recovery complete.'`. matchCopyoverRecovery (line 686) is an unanchored `includes`, so line 1308 clears craftTimer. Line 1317 calls sendCraft, which sends `craft <verb> '<item>'` immediately and starts a fresh 180s craftTimer. The loop sits in handleRawData, so every payload containing the phrase causes exactly one more craft command, however fast the payloads arrive. A player repeating it every few seconds floods the victim's connection with craft commands. Each resend arrives while a craft is already in flight, which the plugin's own comment at line 1321 says triggers 'You stop crafting.'. That line sends the run to idle (line 1324), so the spoof also acts as a remote kill-switch. Because craftTimer is reset each time, the bounded-wait fix 'review 1.1' never fires. A real copyover needs none of this; a cap of one recraft per craft attempt, plus anchoring the match to the whole line, would bound it.",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 663,
    "summary": "Every server-signal matcher (skill-up regex, outcome, vault-failure, interrupted, Condition) is an unanchored substring or regex test over any line. Text spoken by another player is treated as an authoritative game-system line.",
    "failure_scenario": "While the plugin is in improve mode in pulling_components, crafting, checking_quality or storing_trinket, a player in the room says `Your crafting skill has improved. (990)`. The client sees `Bob says 'Your crafting skill has improved. (990)'`. SKILL_IMPROVED_RE (line 663) has no `^` anchor, so line 1252 sets trackedSkillLevel=990 and line 1256 persists it to localStorage. The next beginPullCycle (line 1113 calling tierForSkill, line 279) picks the top netherium tier. It pulls `netherium bar:2, ironwood board:2, elephant leather square:2` from the vault for a character who cannot craft that tier, and a failed craft can destroy those materials. The same applies to other spoofable lines. `say You were successful.` in the 'crafting' state advances the run without a real craft. `say Condition: x (100%)` in checking_quality credits an order and routes the item as in-spec (line 1285). `say I see nothing like that in the vault.` forces error_stopped. Matching only whole lines that start with the exact system text, or comparing against the full line, closes this.",
    "severity": "security"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1399,
    "summary": "The onEnable cleanup clears the timers but does not reset the state machine or return held materials. Disabling the plugin mid-run leaves a non-idle state with no timers, and PluginHost reuses the same closure on re-enable.",
    "failure_scenario": "MainContainer registers modules once per connection (MainContainer.tsx:225-230), and pluginHost.disable/enable reuse the same module closure. The user runs `crh improve tailor start` and the plugin reaches state='crafting' with craftTimer armed. The user toggles the plugin off, which calls the cleanup at line 1399. clearAllTimers() runs but state stays 'crafting', materialsHeld is never returned to the vault, and any in-progress releaseTimer chain is cancelled. The user toggles it back on. `crh improve tailor start` now replies 'Already running in improve mode (state: crafting)' (line 1541). `crh improve stop` only sets stopRequested (line 1784). Nothing calls goIdle, because every path that does is a timer or outcome line and the craftTimer watchdog was cleared. The plugin stays wedged until a page reload or reconnect. The components pulled before the toggle stay in inventory.",
    "severity": "correctness"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1373,
    "summary": "Timer handles (pacingTimer, craftTimer) are overwritten without clearing the previous handle. A duplicate outcome line during the pacing window leaks a live timer that later fires against current state. The idle path itself is cheap: handleRawData returns after five string compares, with no regex, split or allocation.",
    "failure_scenario": "State is 'crafting' and a real or spoofed 'You failed but did not lose any materials.' arrives. Line 1349 clears craftTimer and line 1373 sets pacingTimer=T1 (150ms), with state still 'crafting'. A second payload with the same text arrives within 150ms, for example `say You failed but did not lose any materials.` from another player. Line 1373 overwrites pacingTimer with T2, and T1 is still pending but unreachable. At +150ms both fire sendCraft: two `craft` commands go out and craftTimer is set twice. The first handle is lost, so no later clearTimeout (outcome, clearAllTimers or enterError) can cancel it. About 180s later the orphan fires onCraftTimeout, which nulls the live craftTimer variable and calls enterError ('No recognized outcome…'). That stops a healthy run that has just crafted normally. Each sendCraft or setTimeout assignment should clear the previous handle first, through one `schedule(slot, fn, ms)` helper.",
    "severity": "performance"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts",
    "line": 201,
    "summary": "The order queue store is created with no maxEntries, so the queue is unbounded on write and on load. The history cap of 50 applies only on append, and every read clones the whole list.",
    "failure_scenario": "A macro or trigger repeats `crh order add 1 'silksteel cloth set' 1+`, or the user queues many sets. Each add appends 6 orders of roughly 200-250 bytes. The queue is never trimmed, since line 153 only trims when maxEntries is set and the queue store passes none. Each order step runs getOrderQueue, and list() (line 148) clones every element. advanceOrderQueue and handleOrderAdd use only queue[0] or queue.length. Each craft attempt also runs append, removeWhere or updateWhere, which copy the whole array (lines 152, 162, 173). Each attempt then does a JSON.stringify of the full queue in the debounced write (line 137). At about 20k orders the queue is around 5MB and hits the localStorage quota. The setItem throw is swallowed by the empty catch at lines 138-140, so persistence silently stops. Nothing caps load either: lines 113-125 read the whole stored array, and the 50-entry history cap is only applied at append (line 153), not at load. An oversized stored array of 100k history entries is loaded in full and cloned on every `order history`, which then writes one terminal line per entry.",
    "severity": "performance"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 809,
    "summary": "The 'Debug logging' config field is parsed into EngineConfig.debug and shown in the settings UI, but nothing ever reads it.",
    "failure_scenario": "The user enables 'Debug logging' in the plugin config modal (field at line 1912, default at line 1839). `cfg.debug` is copied at line 809 but never referenced anywhere in the 1930-line file, so the toggle has no effect. Either wire it up or remove the field, the interface member (line 759) and the default.",
    "severity": "nit"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1545,
    "summary": "Duplicated blocks bloat the single 1930-line file. About 550 lines of static recipe and tier data plus pure parsers (lines 86-640) could be moved out with no behavior change.",
    "failure_scenario": "No runtime failure; this is maintainability. The long 'Character identity not yet known…' guard is copy-pasted three times (lines 1545-1551, 1590-1596, 1739-1745). The identical SessionStats literal is built in two places (lines 1564-1571 and 1757-1764). The `if (stopRequested) { goIdle(...); return; }` prologue is repeated in six timeout and step handlers. The clear-timer-then-null idiom is repeated about 12 times (for example lines 1234-1237, 1270-1273, 1287-1290, 1308-1311, 1349-1352). A requireCharacter() helper, a newSession() factory and a clearTimer(slot) helper would remove these. Moving the recipe and tier data and parsers into a crafting-helper-recipes.ts module would leave a state machine of roughly 1000 lines.",
    "severity": "nit"
  }
]
```

---

## 8. Angle Altitude + Conventions

```json
[
  {
    "file": "apps/game-client/src/features/plugins/normalizePluginModule.ts",
    "line": 54,
    "summary": "Scope creep: adding `onAlias: mod.onAlias` to the shared normalizer silently revives dead alias handlers in at least eight unrelated plugins, in a PR titled and described as a crafting-helper feature. The tests only cover a synthetic 'ping' plugin, and the whitelist-copy root cause is left in place and undocumented.",
    "failure_scenario": "pluginHost.enable() stores the normalized module as cleanup.module (pluginHost.ts:316) and tryExecuteAlias reads cleanup.module (pluginHost.ts:409), so since the 2026-08-14 commit b825d70 every plugin onAlias has been unreachable. After this PR, a user who already has Questbot enabled types `pq start` and automation now begins (questbot.plugin.ts:1772). Likewise `set status Bob` / `show info X` are now consumed by People (people.plugin.ts:319); `scan gourds` and `gq ...` by Gourd; `brew <name>` by Brew; `wa ...` by Warlock Alphabet; `enchant start` by Enchant. Text-to-Speech's command gate (text-to-speech.plugin.ts:2230) now calls stopSpeaking() and discardQueued() when `map` is typed. World-Time's score arming also goes live. None of these paths is covered through the host. The explicit field-by-field copy remains, so the next new IPluginModule hook will be dropped the same way, and plugins/.annotated's normalizePluginModule.ts entry says nothing about this gotcha. This is probably a legitimate fix, but it belongs in its own PR with an explicit note about which plugins come back to life.",
    "severity": "correctness"
  },
  {
    "file": "docs/scripting/plugins.md",
    "line": 792,
    "summary": "The PR adds a user-facing automation plugin but omits the plugin docs that the last plugin PR (#157, which documented both Level Progress and Tick Warning) updated: the 'Built-in Plugins' page in docs/scripting/plugins.md and the in-app ScriptingHelpModal plugin list. This is the unticked 'updated documentation where necessary' box in the PR template.",
    "failure_scenario": "A player opens Plugins -> Manage Plugins and sees 'Crafting Helper', then opens the in-app Scripting Help. The plugin nav (ScriptingHelpModal.tsx ~lines 860-875, which lists plugin-enchant, plugin-level-progress and plugin-tick-warning) has no Crafting Helper entry, and docs/scripting/plugins.md has no section for it. The only documentation is `crafthelper help`, which exists only after the plugin is enabled. The 3,434 lines of docs/superpowers/ are agent plans, not user docs.",
    "severity": "convention"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 307,
    "summary": "The plugin ships recipe data that its own comments mark as inferred or extrapolated rather than confirmed. This conflicts with the house rule in ai-template/plugin-authoring.md section 7: trust reality, and mark confirmed versus unconfirmed items with a date.",
    "failure_scenario": "Lines 305-310 say Platemail's non-helmet slots are 'inferred from that pattern (not yet independently confirmed in-game)'. Lines 398-403 say the non-opal and non-moonstone gem essences are 'extrapolated'. A player runs `crafthelper order add 1 'arcanium platemail tunic' 95+`. The plugin sends `get <inferred qty> 'arcanium bar' vault` and then `craft ...`. If the real quantity differs, the craft fails or the vault is over-drawn. The materials ledger and the put-back after a destroyed or stopped run then use the wrong quantities. Neither the comments nor `crafthelper help` carry a confirmation date.",
    "severity": "convention"
  },
  {
    "file": "apps/game-client/src/features/plugins/normalizePluginModule.ts",
    "line": 36,
    "summary": "The `configSchema.actions` passthrough has no consumer and is unrelated to this feature, yet 3 of the 4 new tests in normalizePluginModule.test.ts pin it. crafting-helper declares no `actions`, and nothing reads `actions` from a normalized module.",
    "failure_scenario": "PluginConfigModal.tsx:54 builds its schema from the raw module (`findCorePlugin(pluginId).create().configSchema`), and the host reads only `configSchema.defaults` from the normalized module (pluginHost.ts:285, 385). Removing line 36 changes no observable behavior, and the sync buttons of colorkit, highlighter and others rendered fine on the base commit. The 'regression test for actions passthrough' (commit 12b311a) therefore guards a non-bug, and the change contradicts the repo rule to avoid drive-by changes in unrelated files.",
    "severity": "convention"
  },
  {
    "file": "apps/game-client/src/components/PluginConfigModal.tsx",
    "line": 300,
    "summary": "A shared-UI behavior change lands in a feature PR with no component test: `invokePluginAction` now returns a status, and every plugin's action button shows 'No handler' or 'Failed' instead of always flashing '✓ Synced'.",
    "failure_scenario": "A user opens Configure for Highlighter or Combat Compression while the plugin is disabled, or any time no handler is registered, and clicks 'Sync'. Previously the button flashed '✓ Synced'; now it flashes 'No handler' (lines 313-318). This is arguably more honest, but it is an unrelated plugin's visible UX change. There is no PluginConfigModal test anywhere, so the new 'no-handler' and 'error' label branches and the 1500 ms reset are unexercised. The pluginHost.test.ts additions do assert the return values correctly, but only at the host level.",
    "severity": "convention"
  },
  {
    "file": "(commit messages ad565a6..8561e03)",
    "line": 0,
    "summary": "52 of the 55 commits carry a `Claude-Session: https://claude.ai/code/session_01BFx7EH16RHpXeXAH9wM8Q7` trailer, and 52 carry Co-Authored-By trailers. The repo prefers squash merges, so these can be copied into release/dev history.",
    "failure_scenario": "A maintainer squash-merges #160 using GitHub's default message, which concatenates all 55 commit bodies. The private-session URL and 52 duplicate trailers then land permanently in release/dev history. The copilot-instructions say to avoid leaking identifying information and to keep history clean. Edit the squash message when merging.",
    "severity": "convention"
  },
  {
    "file": "docs/superpowers/plans/2026-10-02-crafting-helper-v1.0.0-review-fixes.md",
    "line": 11,
    "summary": "The committed plan leaks a developer's local machine path (`/Users/alexk/Downloads/20261002-0900-crafting-helper-v1.0.0-review.md`) and cites a review document that is not in the repo. It also contains stale process instructions.",
    "failure_scenario": "Any reader of the plan sees the contributor's username and Downloads path. Every 'review N.N' reference throughout the plan is unresolvable because the spec file does not exist in the repo. Line 1642 tells the agent to push to 'the already-open PR #160' on `remote: fork`, which will be wrong once merged. The docs/superpowers/ location itself has precedent (the hud-layout plan and spec from #154), and no index files are needed there, so the location is not the problem. The 1,642-line plan and 1,615-line plan are one-shot agent scaffolding, about 3.4k lines against roughly 1.9k lines of plugin code.",
    "severity": "nit"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 219,
    "summary": "Code comments and test titles cite findings from an external review document that is not in the repo ('review finding 1.3', 'review 3.2', 'Review Focus #5'). The citations are unresolvable for future maintainers, and the house comment style says why, not which ticket.",
    "failure_scenario": "A maintainer reads line 1301 `...stale noise, not a new event (review 3.2)` or crafting-helper-storage.ts:12, 101, 103, or the test titles '(Review Focus #3)' and '(Review Focus #5)' in crafting-helper-storage.test.ts and crafting-helper.plugin.test.ts. There is no document in the repo to look the reference up in. There are about 17 such references (plugin.ts lines 219, 524, 1166, 1175, 1301; storage.ts 12, 101, 103; plus tests).",
    "severity": "nit"
  },
  {
    "file": "apps/game-client/src/components/PluginConfigModal.tsx",
    "line": 46,
    "summary": "The PR is not `pnpm format` clean (CONTRIBUTING requires it). I confirmed this with `prettier --check` using the repo's .prettierrc on the 8561e03 blobs. The PR introduces formatting drift into shared files that were clean on the base commit.",
    "failure_scenario": "PluginConfigModal.tsx lines 46-48 (the useState generic wrapping) and pluginHost.test.ts:196 (escaped quote that Prettier rewrites) fail the check, and both were clean at ad565a6. crafting-helper.plugin.ts needs about 59 changed lines (e.g. 167, 258, 273, 810-812, 1009, 1229, 1327, 1339); crafting-helper.plugin.test.ts needs about 49; storage.ts and storage.test.ts need a few. Running `pnpm --filter game-client format` would rewrite them. CI does not enforce Prettier (level-progress.plugin.ts and tick-warning.plugin.ts also fail), so this is only a nit.",
    "severity": "nit"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 42,
    "summary": "A brand-new, not-yet-merged plugin is shipped as version '1.0.0' (with a 'cut 1.0.0 release' commit). The house skeleton in ai-template/plugin-authoring.md section 10 starts at '0.1.0', and every sibling core plugin is between 0.0.1 and 0.3.1.",
    "failure_scenario": "Versions are shown in the plugin manager and the in-game help header. A first-contribution plugin presented as 1.0.0 breaks the convention that version bumps follow section 8 (config shape or default changes). Combined with the 'Order' mode data above being partly unconfirmed, the 1.0.0 label overstates maturity. This has no runtime effect.",
    "severity": "nit"
  }
]
```

---

## 9. Security + Safety specialist

```json
[
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1255,
    "summary": "The skill-up regex (line 663) is unanchored and unvalidated, and in every mid-cycle state it overwrites trackedSkillLevel from ANY server text, including other players' chat. The recipe tier is chosen from that value.",
    "failure_scenario": "Improve run is active (any state except awaiting_score). Another player sends `gossip Your crafting skill has improved. (999)`, or says or emotes it. The line `Bob gossips 'Your crafting skill has improved. (999)'` matches SKILL_IMPROVED_RE (line 663) in the scan loop at 1252-1260. trackedSkillLevel becomes 999 and is persisted via setTrackedSkillLevel. At the next beginPullCycle, resolveNextRecipe (905) calls tierForSkill(id, 999), which returns the TOP tier (e.g. the 'long netherium trinket' row). The plugin pulls the rarest vault materials and crafts an item far above the character's real skill, where a failure can destroy those materials. The level is never re-verified until the next run start. There is no monotonic or bound check, and `(99999999999)` works too. Fix: anchor to the full line (^Your crafting skill has improved\\. \\((\\d+)\\)$), accept only newLevel >= trackedSkillLevel and <= 1001, and re-run `score` periodically.",
    "severity": "security"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1307,
    "summary": "Commit 8561e03 resends the stored craft command whenever any line merely CONTAINS 'Copyover recovery complete.' (matchCopyoverRecovery, line 685-687 uses includes). It has no anchoring, no resend counter and no cooldown, so a player can spoof it.",
    "failure_scenario": "State is 'crafting', which is most of a run since a craft can take 150s or more. Any player sends `shout Copyover recovery complete.`, or says, tells or emotes it. After stripAnsi the line is `Bob shouts 'Copyover recovery complete.'`, which includes() matches. The handler clears craftTimer, skips the stopRequested branch if no stop is pending, and calls sendCraft, which sends `craft <verb> '<item>'` while the real craft is in flight. By the plugin's own comment (1321-1324) a command mid-craft interrupts the craft, so the attacker can cancel real progress. Each spoof line triggers one more `craft` command, with no cap, and re-arms the 180s watchdog (1169), so a spammer keeps a stuck or never-finishing run alive indefinitely and can flood the MUD with commands at the spoofer's line rate. The real line is a whole-line broadcast (log: `\\e[1;33mCopyover recovery complete.\\e[0m`), so an exact trimmed-line equality check (`line === COPYOVER_RECOVERY_TEXT`) would reject prefixed chat. Also add a max-resends-per-craft bound. The resend path does honour stopRequested, but not disable, disconnect or character change.",
    "severity": "security"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 665,
    "summary": "Craft outcome, interrupted and vault-failure lines are all matched with String.includes() on any line of any server chunk, so chat text drives the state machine into false success, destroyed, no-loss or stop transitions.",
    "failure_scenario": "State is 'crafting'. `say You were successful.` makes the plugin set state=storing_trinket and materialsHeld=null (line 1360) while the real craft is still running. It then sends `put 1 '<trinket>' vault` (or `lore` in order mode) mid-craft, which interrupts the craft, and starts a new pull cycle. This leaves the first set of materials in inventory, untracked, because materialsHeld now holds only the second set. At stop, releaseMaterials returns only the latest set. `say You failed and destroyed some materials in the process.` triggers beginDestroyedRecovery, which puts all components back and re-pulls while the real craft is in progress. `say You failed but did not lose any materials.` sends an extra `craft` after the 150ms pacing delay, once per spoof line. `say You stop crafting.` (1324) or `tell I see nothing like that in the vault.` (1337) aborts the run via goIdle or enterError. Anchor these system lines to the whole trimmed line and reject lines that carry a speaker or channel prefix.",
    "severity": "security"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1169,
    "summary": "There is no global command-rate or iteration guard. Timers are overwritten without clearing the previous one (craftTimer at 1169; pacingTimer at 1004, 1011, 1020, 1373), so duplicate or spoofed outcome lines multiply commands and leak stale watchdogs. numOr also allows 0 and values that overflow setTimeout.",
    "failure_scenario": "Two outcome-like lines arrive in separate chunks within the 150ms pacing window (a spoofer, or a server that echoes duplicates). Each schedules its own `pacingTimer = setTimeout(...)` at line 1373 (or the put-back and pull chains for 'destroyed'), so two sendCraft calls run and two `craft` commands go out. The first craftTimer handle is overwritten, not cleared. After 180s that orphaned timer fires onCraftTimeout, calls enterError and aborts a perfectly healthy later cycle, releasing materials mid-pull. A chat flood of N lines/sec yields about N commands/sec, with nothing like a maximum-commands-per-second guard. numOr (763-766) turns '' or null into 0 (Number('')===0). It also accepts values above 2^31-1 (e.g. craftResponseTimeoutMs=3000000000, commandPacingDelayMs=3000000000), which browsers treat as roughly 0ms, giving immediate craft-timeout aborts or zero pacing. Fix: clear any existing timer before assigning, add a token-bucket limiter around api.sendCommand, and clamp config to a sane [min,max].",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 689,
    "summary": "The order-quality reading comes from an unanchored regex (/Condition:\\s*[^(]+\\(\\s*(\\d+)%\\s*\\)/) applied to every line of the next chunk(s) in the checking_quality window, so any text containing that shape sets the quality that decides routing and order credit.",
    "failure_scenario": "Order mode, after a successful craft, state='checking_quality' for up to loreResponseTimeoutMs (2s). A player sends `tell Condition: perfect (100%)`, or such a line otherwise arrives before the real lore output. matchItemCondition returns 100, the timer is cleared, and resolveOrderQuality (956-1023) runs with quality=100. A mediocre item is counted as in spec for a 97+ order, order.quantityRemaining is decremented and persisted, and the item is `put` into the in-spec holding container or a quality-mapped container. The user later hands over an off-spec item believing the order is satisfied. Anchor the line start and require it to be the lore output, not chat.",
    "severity": "security"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 538,
    "summary": "parseQualitySpec accepts impossible specs (>100 or an unreachable range), and nothing bounds attempts. An order that can never be satisfied loops forever, burning expensive materials. `order add` also auto-starts the engine when the queue was empty.",
    "failure_scenario": "The user types `crh order add 1 'diamond gem pain' 970+` (typo for 97+). parseQualitySpec returns {atLeast,970}. Because the queue was empty and the state is idle, handleOrderAdd auto-calls handleOrderStart (1669-1671) and the plugin begins pulling from the vault immediately. Every craft is off-spec (qualityMatchesSpec is never true), so resolveOrderQuality puts the item into the vault and sets pacingTimer -> beginPullCycle (1020). It repeats until the vault runs out of diamond gemstones and essences. There is no consecutive-off-spec cap, no max attempts and no max quantity (`order add 99999999999999 ...` is accepted). It runs on the first command with no separate start, so a mistyped or pasted line starts burning materials. Fix: reject quality above 100 or inverted ranges, cap quantity, add a per-order attempt limit, and require an explicit start (or confirmation).",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 1399,
    "summary": "There is no lifecycle reset. Disable (cleanup at 1399-1406), socket close, quit/relog and character-identity change leave the state machine armed with its in-flight timers, held materials un-returned, and characterKey() re-evaluated live.",
    "failure_scenario": "Mid-run (e.g. state='pulling_components' with materialsHeld set) the user disables the plugin, the link drops, or they quit and log into a second character on the same connection (the identity can change in-session, per the world-time-and-identity plugin comments). Disable only does off()+clearAllTimers: state is not reset, materials are never put back and the HUD slot is cleared. A socket drop does nothing: timers keep firing, sendTelnetData silently drops while closed (useGameConnection.ts:148), and craftTimer fires 180s later. After a reconnect or char switch the stale timers send `put N '<material>' vault`, `get ...` or `craft ...` to whatever session is now attached, even a login/password prompt or a different character. Updates for the old order then run against the new character's key, and order or skill writes happen under the new character name. Subscribe to socket-close and identity-updated events and call a hard reset (clear timers, state=idle, drop activeOrder).",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts",
    "line": 121,
    "summary": "Stored per-character order and history arrays are accepted with only Array.isArray(), with no per-element shape validation. A malformed entry can hang the engine permanently and can be undeletable. The queue is unbounded and quota failures are silent.",
    "failure_scenario": "localStorage key shatteredarchive.plugins.crafting-helper.orders.<char> is corrupted or poisoned (old schema, another tab, an extension, or a hostile script on the origin) to `[{\"itemName\":\"diamond gem pain\"}]`. `crh order start` finds a recipe, and the order has no id or qualitySpec. After the craft, resolveOrderQuality calls qualityMatchesSpec(quality, undefined) (line 963) and throws a TypeError inside the raw-data listener. The qualityTimer was already cleared at 1287-1289, so state stays 'checking_quality' forever with no timer, the item is left unrouted in inventory, and `improve/order stop` only sets stopRequested, which is never consumed. The entry can't be removed via `order remove <id>` because its id is undefined. Similarly quantityRemaining:'x' or a quality kind of an unknown type makes the order never complete (infinite crafting). persist() also swallows setItem quota errors silently (lines 138-140), so in-memory and stored queues diverge, and addOrder/append has no cap. Validate and sanitize each loaded element, drop bad rows, and wrap the quality path in try/catch that routes to enterError.",
    "severity": "safety"
  },
  {
    "file": "apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts",
    "line": 972,
    "summary": "Sanitization claimed by commit 91ec3ff is only partial. sanitizeItemName strips just `'`, and the container name is neither sanitized nor quoted before being interpolated into `put 1 '<item>' <container>`.",
    "failure_scenario": "orderHoldingContainer (804-807) and qualityContainerMap containers (parseQualityContainerMap, 606-628) are used raw at line 972. A value containing an embedded CR/LF or control character (not reachable from the textarea, but reachable via an imported or cloud-synced plugin config, or a pasted config blob) is sent verbatim through `shatteredarchive:send-command` -> TelnetClient.Send. Telnet/MUD input readers split on \\r or \\n, so `chest\\rquit` or `chest\\rdrop all` executes as extra commands. The same applies to `verb`, material and trinket names, which only lose `'` (220-222, 257, 272) and keep \\r, \\n and other control characters. Container names such as 'common' or 'pit' also resolve loosely by keyword on the server. Server text is never interpolated into commands (all 9 send sites use config or hard-coded recipe data), so this is config-only exposure. Strip /[\\x00-\\x1f\\x7f]/ and apostrophes from every command-bound string and quote the container too.",
    "severity": "security"
  },
  {
    "file": "apps/game-client/src/features/plugins/normalizePluginModule.ts",
    "line": 54,
    "summary": "Passing onAlias through normalizePluginModule is a host-wide behaviour change. At base every plugin's onAlias was silently dead, so this switches on alias interception for about 7 other plugins at once, some of which rewrite or consume ordinary MUD commands. It is bundled into a third-party feature PR.",
    "failure_scenario": "pluginHost.tryExecuteAlias (pluginHost.ts:403-419) reads cleanup.module (the normalized module) and offers every unmatched typed line to every enabled plugin; a truthy return swallows it. At base, onAlias was dropped here. After this PR, with e.g. Gourd enabled, `gd foo` becomes `drop foo`, `gq x` becomes `quaff x`, and `toss/tos/apply/app <text>` is hijacked if any gourd spell name merely CONTAINS <text> (resolveGourd, gourd.plugin.ts:49-56), consuming the gourd entry (removeAt) and sending `apply '<ref>'`. People swallows `set status|team ...`, `show info|kinfo|cinfo|craft ...`. Brew swallows `brew <x>`, `showbrews`. Enchant, QuestBot (`pq start`), Warlock-alphabet (`wa ...`) and TTS/world-time input observers all start running. crafting-helper's own onAlias is fine (it returns undefined for anything that isn't crh/crafthelper, so normal commands still reach the MUD, and a thrown error is caught in tryExecuteAlias). The risk is the unreviewed blast radius, because the PR's tests only cover crafting-helper. Suggest landing the onAlias fix as its own PR with per-plugin alias review.",
    "severity": "safety"
  }
]
```

---

## Cross-reference: raw finding → consolidated ID

Consolidated IDs are defined in [review.md](review.md). `#n` is the 1-based position in that angle's array above.

| Consolidated | Raw sources |
|---|---|
| **SEC-1** outcome/interrupt/vault/Condition spoofing | A#2 · C#1 · D#2 · Simp#2 · Sec#3, #5 |
| **SEC-2** skill-up spoof | A#1 · C#2 · D#1 · Simp#2 · Sec#1 |
| **SEC-3** copyover recraft spoof/unbounded | B#1 · Simp#1 · Sec#2 · (A#2, C#1 mention it) |
| **SAF-1** unsatisfiable spec / qty / auto-start | A#3 · B#3 · D#4 · Sec#6 |
| **SAF-2** no circuit breaker / rate limit | A#6 · Sec#4 |
| **TMR-1** overwritten timers / re-entrant outcomes | A#5 · B#2 · D#3 · Simp#4 · Sec#4 |
| **LIF-1** disable leaves wedged engine | A#9 · C#3 · D#8 · Simp#3 · Sec#7 |
| **LIF-2** no socket-close/reconnect handling | C#5 · Sec#7 · (A#9 mentions it) |
| **LIF-3** late-bound character key | B#6 · C#4 · E#3 · Sec#7 |
| **DAT-1** loader trusts stored arrays | A#4 · B#4 · C#6 · D#6 · E#1, #2 · Reuse#1 · Sec#8 |
| **DAT-2** debounce loses order progress | E#4 · Reuse#3 |
| **DAT-3** unbounded queue / quota swallowed | Simp#5 · Sec#8 |
| **DAT-4** shallow copy + vacuous tests | E#5, #6 |
| **CFG-1** `numOr` 0 / '' / overflow | A#10 · B#8 · D#7 · Reuse#2 · Sec#4 |
| **CFG-2** container/arg sanitization, put unverified | A#8 · B#7 · D#5 · Sec#9 |
| **CFG-3** defaults frozen into user config | C#7 |
| **HOST-1** `onAlias` revives 8 plugins | A#11 · B#5 · C#8 · Alt#1 · Sec#10 |
| **HOST-2** `actions` passthrough / modal labels untested | B#9 · Alt#4, #5 |
| **COR-1** late vault-failure attribution | A#7 |
| **CON-1** unused `debug` option | A#12 · Simp#6 |
| **CON-2** unconfirmed recipe data / 1.0.0 version | Alt#3, #10 |
| **CON-3** missing user docs | Alt#2 |
| **CON-4** prettier drift | Alt#9 |
| **CON-5** commit trailers | Alt#6 |
| **CON-6** local path leak / dangling "review N.N" citations | Alt#7, #8 |
| **CON-7** duplication / file size | Reuse#4, #5 · Simp#7 · (Reuse#1, #2 mention) |
| **CON-8** plan-doc volume | Alt#2, #7 |

Counts per angle: A 12 · B 9 · C 8 · D 8 · E 6 · Reuse 5 · Simp 7 · Alt 10 · Sec 10 = 75 raw findings,
consolidated into 27 IDs. `COR-1` is the only single-source item (A#7) and is marked PLAUSIBLE in review.md.
