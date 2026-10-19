# PR #160 — Crafting Helper (copyover auto-recraft) — deep review

- **PR:** https://github.com/TournyMasterBot/Shattered-Archive/pull/160
- **Head:** `8561e03098444c22814d63f7f9ef6e6a4147c1ec` ("feat(crafting-helper): auto-recraft after a copyover interrupts crafting")
- **Base:** `release/dev` @ merge-base `ad565a6d4f2159b1d3d0a7cce61a04e1dc08a6d2`
- **Size:** 55 commits, 15 files, +8148 / −14 (≈1,930-line plugin, ≈245-line storage, ≈2,330 lines of tests, ≈3,430 lines of plan/spec docs)
- **Author:** community contributor (Alex Kleissner)
- **Reviewed:** 2026-10-17, requested emphasis: **safety, security, performance**
- **Method:** `/deep-review` — 9 independent parallel agents (A, B, C, D, E, Reuse, Simplification+Efficiency,
  Altitude+Conventions, plus a dedicated Security+Safety angle added for this request), each given the full
  PR code and read-only rules; every surviving finding was then re-read against the PR source by the
  orchestrator. Raw, unmerged agent output is in [findings.md](findings.md); the fix plan is in
  [bugfix-proposal.md](bugfix-proposal.md).
- **Status:** this document is the review as written at the time. The fixes were applied afterwards on branch `review/pr160-fixes` (uncommitted) — see [fix-log.md](fix-log.md) for per-finding proof, fix and tests. No PR comments were posted (`gh` is not installed on this machine).

Line numbers are in the PR head (`8561e03`) unless a path says otherwise. The new plugin files are **not** in
the working tree (it sits at the merge-base), so host-file links resolve locally and plugin-file links resolve
only on the PR branch.

**Verdict tags.** `CONFIRMED` = the orchestrator read the code and traced the failure path. `PLAUSIBLE` = the
mechanism is real but the trigger depends on conditions that were not reproduced.

---

## Verdict: request changes

The plugin is carefully built in places — prototype-pollution guard on recipe lookups
(`hasOwnProperty` at `:530`), an identity check before starting, a bounded craft timeout, `stopRequested`
checks on most timeouts, and an idle path that returns after five string compares. The blocking problems
are that it **trusts raw server text** (any player can steer it), has **no brakes** on its automation loops,
and the PR carries a **host-wide behavior change** that is not called out in its title or tests.

Blocking for merge: SEC-1, SEC-2, SEC-3, SAF-1, HOST-1. Strongly recommended before merge: SAF-2, TMR-1,
LIF-1/2, DAT-1, CFG-1. Everything else can be follow-up.

---

## Findings (consolidated, by bug type, most severe first)

IDs are stable and are the keys used by [bugfix-proposal.md](bugfix-proposal.md).

### SEC — Untrusted server text drives the state machine

#### SEC-1 · High · CONFIRMED — outcome / interrupt / vault-failure / Condition lines are spoofable by any player
[crafting-helper.plugin.ts:657-694](apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts#L657),
consumed at `:1252-1345`.
Every matcher is `line.includes(...)` or an unanchored regex over every line of the stream, including
`say` / `tell` / `gossip` / emote text. `Bob says 'You were successful.'` is treated as the game's own line.
- `You were successful.` while `crafting` → records a success, sets `storing_trinket`, sends `put`, then a new
  `get`/`craft` cycle **while the real craft is still running**.
- `You failed and destroyed some materials…` → `beginDestroyedRecovery` puts everything back and re-pulls
  mid-craft; inflates the order's `materialsUsed` tally.
- `You failed but did not lose any materials.` → one extra `craft` per spoofed line.
- `You stop crafting.` → clears all timers and idles the run (remote kill-switch).
- `I see nothing like that in the vault.` → `enterError` (stops the run).
- `Condition: x (100%)` during `checking_quality` → accepted as the lore reading; a low-quality item is
  routed as in-spec and credited to the order (`:1285`).
Test gap: `crafting-helper.plugin.test.ts` has **zero** speaker-prefixed negative cases (grep for
`says '` / `tells you` / `gossip` → 0 hits).

#### SEC-2 · High · CONFIRMED — skill-up spoof escalates the craft tier and is persisted
`SKILL_IMPROVED_RE` (`:663`, no `^`/`$`) is scanned in every mid-cycle state (`:1252-1260`). A line such as
`Bob tells you 'Your crafting skill has improved. (842)'` sets `trackedSkillLevel=842`, writes it to
localStorage (`:1256`), and the next `beginPullCycle` → `tierForSkill(…, 842)` (`:905`) pulls and crafts the
top-tier row for a character who cannot sustain it; a `failed_destroyed` outcome burns the materials. No
range or monotonic check, no re-verification with `score` after run start. Angle A reports that real server
logs contain players pasting this exact line to channels (e.g. `Drungal grats 'Your crafting skill has
improved. (700)'`) — not independently re-checked, but if true this fires organically, not only maliciously.

#### SEC-3 · High · CONFIRMED (trigger) / PLAUSIBLE (interrupt side-effect) — the new copyover recraft is spoofable and unbounded
[crafting-helper.plugin.ts:1307-1319](apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts#L1307)
(the PR's headline commit). `matchCopyoverRecovery` is `includes('Copyover recovery complete.')` (`:685-687`);
on a match the handler clears `craftTimer`, resends `craft …` via `sendCraft`, and re-arms the full 180 s
timer. No retry cap, no cooldown, no proof a copyover happened. One spoofed line per craft attempt sends an
extra `craft` mid-craft; a repeating spoofer sends one per line and keeps re-arming the watchdog so the
bounded-timeout fix (`f07a995`) never fires. The plugin's own comment (`:1321-1323`) says a command
interrupts the craft, so the extra `craft` typically yields `You stop crafting.` → idle (that sub-claim relies
on the comment, not on MUD source — PLAUSIBLE). The real broadcast is a whole line
(`\e[1;33mCopyover recovery complete.\e[0m` per Security angle's log reading), so exact-line equality is a
safe anchor. The branch also does not clear `pacingTimer` (see TMR-1).

### SAF — Runaway automation (no brakes)

#### SAF-1 · High · CONFIRMED — a mistyped quality spec burns the vault; `order add` auto-starts
`parseQualitySpec` ([:538-555](apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts#L538))
accepts any digit string (`970+`, `150`), and quantity is only `isFinite && > 0` (`:1601`; `1e20 - 1 === 1e20`
so a 20-digit quantity never completes). Quality is a percentage (no `Condition` line in the corpus exceeds
100%), so an unsatisfiable spec makes every craft off-spec; `resolveOrderQuality` routes it to the vault and
re-enters `beginPullCycle` (`:1020`) with no attempt cap. `handleOrderAdd` starts the engine immediately when
the queue was empty and state is idle (`:1669-1671`), so the first typo begins consuming materials with no
separate start command.

#### SAF-2 · Medium · CONFIRMED (paths read) — no circuit breaker, attempt cap, or command-rate limit
`failed_no_loss` re-sends `craft` indefinitely (`:1373`); `failed_destroyed` puts back, re-pulls and re-crafts
indefinitely (`:1189-1212`); a character at the skill cap that starts `improve` keeps crafting the same tier
until the vault empties. There is no consecutive-failure counter, no target level, and no global
commands-per-window limiter around `api.sendCommand`, so a logic bug or spoof flood (SEC-1) translates 1:1
into command flood (risking a server kick).

### TMR — Timers and re-entrancy

#### TMR-1 · Medium · CONFIRMED — overwritten timer handles and re-entrant outcome lines leave orphan timers
`sendCraft` assigns `craftTimer = setTimeout(…)` without clearing the previous handle
([:1169](apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts#L1169)); `pacingTimer`
is assigned without clearing at `:1004`, `:1011`, `:1020`, `:1204`, `:1207`, `:1373`. After an outcome is consumed
the state stays `crafting` (no-loss, destroyed put-back chain) or `checking_quality` (pacing wait), so a second
matching line is processed again as a fresh event. Result: two `craft`s / two concurrent pull cycles, and a lost
180 s handle that later fires `onCraftTimeout` (`:1172-1187`), which nulls the *live* `craftTimer`, calls
`enterError`, and sends `put` for held components — aborting a healthy later cycle. `onCraftTimeout` does not
check that it is the current timer or that `state === 'crafting'`. Also hit by a copyover line arriving mid
put-back chain (SEC-3).

### LIF — Lifecycle and identity

#### LIF-1 · Medium · CONFIRMED — disabling mid-run leaves a wedged, non-idle engine
The `onEnable` cleanup ([:1399-1406](apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts#L1399))
calls `off()` and `clearAllTimers()` but does not reset `state`/`mode`/`activeRecipe`/`materialsHeld` or return
pulled materials. [pluginHost.ts:264-273](apps/game-client/src/features/plugins/pluginHost.ts#L264) re-enables
from the same registered module closure (`s.modules.get(pluginId)`), so after off→on the engine is still
`crafting`/`pulling_components` with no timers: `start` answers "Already running"
(`:1541`), `stop` only sets `stopRequested` which nothing consumes. Recovery needs a page reload. Pulled
materials stay in inventory. Sibling plugins (enchant, gourd) reset volatile state in their cleanup.

#### LIF-2 · Medium · CONFIRMED (no listener) / PLAUSIBLE (consequence) — no socket-close / reconnect handling
The plugin subscribes only to `shatteredarchive:raw-data` (`:1392`, confirmed by grep for `api.onEvent(`);
Level Progress (`level-progress.plugin.ts:395`) subscribes to `game:remote-server:close` to disarm. After a drop,
`sendTelnetData` silently discards sends while the socket is closed
([useGameConnection.ts:146-160](apps/game-client/src/hooks/useGameConnection.ts#L146)); if the plugin instance
survives the reconnect, a stale `craftTimer` fires `enterError` → `releaseMaterials` and types
`put N 'material' vault` into whatever the new session is showing (e.g. a login prompt). Two agents disagreed
on whether the instance survives a reconnect (one cites `shutdown()` on connectionId change); unresolved.

#### LIF-3 · Medium · PLAUSIBLE — character key is late-bound and can go stale
`characterKey()` ([:816-820](apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts#L816))
re-reads `window.__SA_IDENTITY__` on every storage read/write; the `__unknown__` guard exists only at the three
start/add commands (`:1545`, `:1590`, `:1739`). If the identity changes mid-run (or stays stale after a
same-connection character switch with GMCP off — documented in `world-time-and-identity.plugin.ts:105-116`),
skill levels, `updateOrder`/`removeOrder`, and `addCompletedOrder` (`:985-1002`) write under a different key
than the one the run started with; an order is then never decremented, or a completion lands in the wrong
character's history.

### DAT — Persistence and data integrity

#### DAT-1 · Medium · CONFIRMED mechanism — loader trusts stored arrays; malformed entries wedge the engine
[crafting-helper-storage.ts:113-125](apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts#L113)
accepts any JSON array (`arr as T[]`). An order missing `qualitySpec` makes `qualityMatchesSpec` throw at
`:558` (`spec.kind`) from `resolveOrderQuality` (`:963`) **after** `qualityTimer` was cleared (`:1287-1290`), so
state stays `checking_quality` with no timers; `stop` is a no-op; the crafted item stays in inventory. `[null]` /
`[{}]` heads cannot be removed (`removeWhere` predicate throws on `null.id` or never matches `undefined`).
`quantityRemaining: 'abc'` → `NaN`, so `remaining <= 0` is never true and the order crafts forever. Requires
corrupt / hand-edited / legacy / poisoned localStorage. peopleDb.ts (`:43`) and this file's own skill store
(`:51`) validate elements; the new list store dropped that check when it was copied.

#### DAT-2 · Medium · CONFIRMED — order progress is lost if the tab closes within the 400 ms debounce
`persist()` (storage `:127-143`) is a 400 ms trailing debounce with no `pagehide`/`visibilitychange` flush, and
`setItem` failures (including `QuotaExceededError`) are swallowed. The last in-spec item of an order calls
`addCompletedOrder` + `removeOrder` (`:985-994`) or `updateOrder` (`:1002`); reload within 400 ms restores the old
`quantityRemaining`, so the next `order start` crafts an extra item and spends vault materials.

#### DAT-3 · Low · CONFIRMED — the order queue is unbounded; every read clones it
`orderQueueStore` is created with no `maxEntries` (storage `:201`; history is capped at 50). Each `getOrderQueue`
clones every element (`:148`), each mutation copies the array and each persist `JSON.stringify`s all of it. A
macro that repeats `order add … set` (6 orders per set) grows it until the quota error is silently swallowed.
Load does not cap either.

#### DAT-4 · Low · CONFIRMED (latent) — "deep enough" copy is one level deep; the tests don't pin it
`list()` returns `{ ...item }` (storage `:148`), so nested `materialsUsed` / `qualitySpec` still alias the live
store, and `append`/`updateWhere` keep the caller's object references. The plugin currently copies before
mutating (`recordMaterialsUsed`, `:931`), so no live bug. The aliasing tests
(`crafting-helper-storage.test.ts:174-183`, `:239-248`) mutate only top-level scalars, so they would pass
without any deepening (agent-reported; not re-read by the orchestrator).

### CFG — Config and command-argument hygiene

#### CFG-1 · Medium · CONFIRMED — `numOr` accepts 0, empty string, and values past the `setTimeout` limit
[crafting-helper.plugin.ts:763-766](apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts#L763):
`Number.isFinite(n) && n >= 0`. `Number('')` and `Number(null)` are `0`; there is no upper bound; the schema only
sets `min: 0`. `craftResponseTimeoutMs = 0` or `3000000000` fires on the next tick → `onCraftTimeout` →
`enterError` → `releaseMaterials` sends `put` for the just-pulled components while the server-side craft is
running (interrupting it). `commandPacingDelayMs = 0` removes all throttling. (`5c0d0c4` once removed the
timeout; a user who read the old "wait indefinitely" design may set `0` expecting "no timeout".) A private
`clampNumber` already exists in `text-to-speech.plugin.ts:287-291`.

#### CFG-2 · Medium · CONFIRMED — container names are unsanitized and unquoted; `sanitizeItemName` strips only `'`
`orderHoldingContainer` (`:804-807`, trim only) and the quality-map container
([:606-628](apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts#L606)) are interpolated raw
into `put 1 '<item>' ${container}` (`:972`). `Bob's pouch` / `my sack` makes the `put` fail, but the order is still
credited because put results are never verified (`:912`, `:944`, `:972`, `:1075`). `sanitizeItemName`
(`:221-223`) removes only apostrophes; CR/LF and other control characters survive in item/verb/material names,
and the client send path forwards the string unchanged
([useGameConnection.ts:166-172](apps/game-client/src/hooks/useGameConnection.ts#L166)), where the MUD input reader
treats `\r`/`\n` as command terminators. Reachability is config-only (textarea input splits on newlines), so
exploitability is low, but a cloud-synced or hand-edited config could inject extra commands. Server text is never
interpolated into commands (all send sites use config or hard-coded recipe data).

#### CFG-3 · Low · CONFIRMED mechanism — Save freezes the ~100-row default recipe tables into user config
`PluginConfigModal` seeds its draft with `{...defaults, ...initialUserConfig}` and `save()` persists every key
([PluginConfigModal.tsx:60-95](apps/game-client/src/components/PluginConfigModal.tsx#L60)); `syncInstalled` merges
`{...defaults, ...userConfig}` ([pluginHost.ts:383-386](apps/game-client/src/features/plugins/pluginHost.ts#L383)).
Any user who clicks Save once keeps today's `tierTable`/`craftTypes` forever, so later recipe corrections never
reach them — for data that drives irreversible `get`/`craft` commands. (The plugin's own "pre-multi-component
saved config" regression test records this failure mode having already happened once.) Host design, affects all
plugins, but this one ships the largest defaults.

### HOST — Shared plugin-host changes bundled into a feature PR

#### HOST-1 · High (scope) · CONFIRMED — `onAlias` passthrough revives alias handling in 8 other plugins
[normalizePluginModule.ts:50-54](apps/game-client/src/features/plugins/normalizePluginModule.ts#L50). History:
commit `b825d70` (2026-08-14, "Feature/mud builder (#135)") changed `tryExecuteAlias`
([pluginHost.ts:409](apps/game-client/src/features/plugins/pluginHost.ts#L409)) to read `cleanup.module` — the
*normalized* copy — which never carried `onAlias`, so every plugin's alias handler has been unreachable since
then (an accident, not a gate). After this PR, plugins with an `onAlias` — brew, enchant, gourd, people,
questbot, text-to-speech, warlock-alphabet, world-time-and-identity (verified by grep, 8 files) — start
receiving typed input for the first time in two months: `pq start` runs questbot, `gd x` becomes `drop x`,
`gq x` becomes `quaff x`, `set status` / `show info` are consumed by People, `brew <word>` is consumed
("No recipe found") instead of reaching the MUD, and `map` now triggers `stopSpeaking()` in text-to-speech.
Probably the correct fix, but it ships inside a crafting PR, its tests use a synthetic "ping" plugin, none of the
revived paths are tested through the host, and the field-by-field whitelist copy (root cause) is still there —
the next new `IPluginModule` hook will be dropped the same way. crafting-helper's own `onAlias` is safe: it
returns `undefined` for anything that is not `crh`/`crafthelper`.

#### HOST-2 · Low · CONFIRMED — `actions` passthrough has no consumer; shared-UI label change has no test
`normalizePluginModule.ts:36` passes `configSchema.actions`, but `PluginConfigModal` builds its schema from the raw
`create()` result ([PluginConfigModal.tsx:50-54](apps/game-client/src/components/PluginConfigModal.tsx#L50)) and
`pluginHost` reads only `defaults` from the normalized module — removing the line changes nothing observable,
yet 3 of the 4 new normalizer tests pin it. Separately, `invokePluginAction` now returns
`'ok'|'no-handler'|'error'` and **every** plugin's action button now flashes "No handler"/"Failed" instead of
always "✓ Synced"; there is no `PluginConfigModal` test anywhere for the new label branches.

### COR — Other correctness

#### COR-1 · Low · PLAUSIBLE — a late vault-failure line is attributed to the wrong component
`:1274-1276`: in `pulling_components`, a failure that arrives after `pullConfirmTimeoutMs` (the code's own comment
at `:1333` admits this happens) is blamed on `components[pullIndex]` and sets `materialsHeld =
components.slice(0, pullIndex)`, off by one when the failure belongs to the previous `get`. The error names the
wrong material and the put-back moves the wrong stock. Needs contrived timing; the earlier 2026-10-02 review
already flagged it as an awareness item.

### CON — Conventions, docs, hygiene

| ID | Sev | Verdict | Finding |
|----|-----|---------|---------|
| CON-1 | Nit | CONFIRMED | "Debug logging" config toggle (`:759`, `:809`, `:1839`, schema field) is parsed but never read (grep: only those 3 hits) — turning it on does nothing. |
| CON-2 | Low | agent-reported | Recipe data its own comments mark "inferred" (Platemail non-helmet slots, `:305-310`) or "extrapolated" (non-opal/moonstone gem essences, `:398-403`) ships live, un-dated, as `v1.0.0` (`:43`); house skeleton starts at `0.1.0`, siblings are 0.0.1–0.3.1. |
| CON-3 | Low | CONFIRMED | No docs for the new plugin: `docs/scripting/plugins.md` has Level Progress (`:479`) and Tick Warning (`:792`) sections but none for Crafting Helper, and `ScriptingHelpModal.tsx` nav (`:870`, `:874`) has no entry. The only docs are `crafthelper help`, which exists once the plugin is enabled. |
| CON-4 | Nit | agent-reported | `prettier --check` (repo `.prettierrc`) fails on the new files (≈59 changed lines in the plugin, ≈49 in its test) and introduces drift in `PluginConfigModal.tsx:46-48` and `pluginHost.test.ts:196`, which were clean at the base. CI does not enforce Prettier (Level Progress / Tick Warning also fail). |
| CON-5 | Low | CONFIRMED | 52 of 55 commits carry `Claude-Session: https://claude.ai/code/session_…` and 52 carry `Co-Authored-By:` trailers; a default GitHub squash message would copy all of them into `release/dev` history. Edit the squash message. |
| CON-6 | Nit | CONFIRMED (path) / agent-reported (citations) | `docs/superpowers/plans/2026-10-02-crafting-helper-v1.0.0-review-fixes.md:11` leaks a local path (`/Users/alexk/Downloads/20261002-0900-crafting-helper-v1.0.0-review.md`); ≈17 code/test comments cite "review N.N" / "Review Focus #N" findings from a document that is not resolvable from the plugin sources (the earlier review is in `.ai-code-review/` here, but nothing links it). |
| CON-7 | Nit | agent-reported | Duplication: the skill-level store is a line-for-line copy of `peopleDb.ts:33-80`, the "shared" list-store helper is shared only inside its own file (and `globalScriptsStore.ts:38-59` has the same debounce shape); `QualitySpec` (`:533`) duplicates `StoredQualitySpec`; the identity guard is copy-pasted 3× (`:1545`, `:1590`, `:1739`), the `SessionStats` literal 2×, the clear-timer idiom ≈12×; ≈550 lines of static recipe data + parsers could move to their own module. |
| CON-8 | Nit | CONFIRMED | ≈3,430 lines of agent plan/spec markdown under `docs/superpowers/` (vs ≈1,930 lines of plugin). The location has precedent (#154 hud-layout) so no index is required, but it is one-shot scaffolding with stale process text (e.g. "push to the already-open PR #160 on remote: fork"). |

---

## Performance

No hot-path problem. `handleRawData` returns after five string comparisons while idle
([:1217-1225](apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts#L1217)); the
split+trim is done once per event while active (`b268984` verified); config parsing is memoized by raw-string
identity (`memoizeLast`, `:776-791`) and `getConfig()` is still read fresh. The real costs are secondary:
leaked timers that fire later against dead state (TMR-1), and the unbounded queue that is cloned on every read
and fully re-serialized on every write (DAT-3). `storage.ts` writes are properly debounced (the trouble is the
opposite one — DAT-2).

## Gap sweep (what no angle was built to catch)

1. **Nothing was executed.** No test, `tsc`, or eslint run: the PR is not checked out and the review agents were
   read-only. CI status was not visible (no `gh`). Run `pnpm --filter game-client test -- crafting-helper` on the
   branch, or ask for an isolated worktree run.
2. **Real-log verification** of every matcher is still owed (the shattered-plugin skill requires patterns to be
   verified against real logs). The proposed anchors in bugfix-proposal.md must be checked against the
   interleaved `game-server/*.jsonl` corpus (prompt prefixes, ANSI, chunking) before landing — particularly
   whether outcome lines ever arrive with a prompt prefix on the same line.
3. **Server behavior assumed, not read:** "a second `craft` interrupts the first" and "`\r`/`\n` terminate
   commands" come from the plugin's comments and agent reading of `merc-mud` (`comm.c:1109-1118`), not from a
   test against the running MUD.
4. **Unsettled disagreement:** whether the plugin instance survives a reconnect (LIF-2).
5. **Not covered by any angle:** accessibility/UX of the HUD widget text, and the interaction between the
   auto-start in `order add` and other automation plugins (questbot, autoleveling) running simultaneously and
   sending commands on the same connection.

## What the orchestrator personally re-read

Matchers `:657-694`; `handleRawData` `:1214-1405`; `sendCraft`/`onCraftTimeout` `:1156-1187`;
`resolveOrderQuality` `:956-1023`; `handleOrderAdd` `:1589-1674`; `readConfig`/`numOr`/`memoizeLast` `:755-830`;
`parseQualitySpec`/`parseQualityContainerMap` `:538-628`; `sanitizeItemName` `:213-223`; storage `:95-245`;
`pluginHost.ts` `:255-420`; `PluginConfigModal.tsx` `:48-110`; `useGameConnection.ts` `:145-185`; git history of
`b825d70`; trailer count (`git log --format=%B ad565a6..8561e03 | grep -c Claude-Session` = 52); the local-path
leak; `grep onAlias` over `core-plugins/*.plugin.ts` (8 files); the plugin's only `api.onEvent(` subscription;
copyover/negative tests in the test file; docs and help-modal greps.
