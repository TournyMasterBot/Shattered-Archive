# PR #160 — fix log

What was done for each finding in [review.md](review.md) / [bugfix-proposal.md](bugfix-proposal.md): confirm → correct → check side effects → guard with tests.

- **Where the fixes live:** branch `review/pr160-fixes` (created from the PR head `8561e03` in `C:\Projects\ShatteredArchive`; the previous checkout was local branch `pr/160` — return with `git switch pr/160`). Nothing is committed. [fixes.patch](fixes.patch) is the same change as one patch (tracked diff + the new files).
- **Proof folder:** [poc/](poc/) — corpus scripts + their JSON results, the red-phase PoC suite and its results, the green-phase results.
- **Final state:** game-client suite **57 suites / 1071 tests green** (baseline on the PR head: 54 / 874); `eslint` 0 errors on every touched file; `tsc --noEmit -p apps/game-client` clean; `prettier --check` clean. Verified from the PowerShell tool.
- **Not run:** the UI was not opened in a browser (see "Not done" below).

## How each finding was confirmed

1. **Real corpus** (`poc/corpus-scan.cjs`, `poc/corpus-vault-latency.cjs`) over `C:\Projects\DSL\GameLogs` — 979 text logs / 23.2 M lines and 331 Docker `game-server` jsonl files / 2.5 M reconstructed lines:

| Fact | Result | Used for |
|---|---|---|
| `Copyover recovery complete.` | 103 occurrences (46 jsonl + 57 txt): **100 % whole line**, 0 prompt-prefixed, 0 in speech | SEC-3 – whole-line equality is safe |
| `I see nothing like that in the vault.` | 59: 100 % whole line | SEC-1 |
| `Your crafting skill has improved. (N)` | **4 occurrences, all inside player chat** (`grats '…'`, `OOC Kingdom: '…'`, `OOC: '…'`), values 666–815 | SEC-2 – the spoof is organic, not hypothetical |
| `Condition: x (N%)` | 5315 lines: 2114 whole, **3200 prefixed `Size: tiny   `**, 1 inside clan chat; N in 25–100, never > 100 | SEC-1 (anchor **must** allow the Size prefix – the proposal's `^Condition` would have rejected 60 % of real lore lines), SAF-1 (quality > 100 is unsatisfiable) |
| Craft outcome lines / `You stop crafting.` | 0 occurrences — no crafting sessions exist in this corpus | tests use the plugin's own fixtures; no corpus proof possible, said plainly |
| Vault reply latency | `put` replies 86–379 ms (median 192, n = 21), `get` 308 ms (n = 1) vs the 200 ms default confirm window; a successful pull prints `You get a … from the mystic vault.`; a failed put prints `You do not have that item.` | COR-1 – the late-reply race is realistic, and success lines make exact attribution possible |
| Real chat shapes | `Name says, "…"`, `Name grats '…'`, `Name OOC: '…'`, `Name OOC Kingdom: '…'`, `Name auctions: '…'`, `You OOC: '…'` | spoof lines in the tests |

2. **Proof-of-concept suite** (`poc/pr160-poc.hardening.test.ts.txt` + `pr160-poc.test-harness.ts.txt`, the red-phase copies): run against the unfixed PR head it gave **90 failed / 17 passed of 107** ([poc/results-before-fix.md](poc/results-before-fix.md)); the 17 passes are positive guards (real lines still accepted, defaults preserved). The same suite against the fixed code: **160 / 160 green** across the two hardening files ([poc/results-after-fix.md](poc/results-after-fix.md)). Host findings: [results-host-before-fix.md](poc/results-host-before-fix.md) (PR-head normalizer: the "unknown hook" guard fails) and [results-host-base.md](poc/results-host-base.md) (base normalizer `ad565a6`: 10 alias-reachability tests fail — the dead-alias regression).

## Per finding

| ID | Proof | Fix | Tests (all in `crafting-helper.hardening*.test.ts` unless noted) |
|---|---|---|---|
| **SEC-1** | corpus + PoC: 40 red | Every matcher is whole-line only (`matchCraftOutcome/VaultFailure/CraftInterrupted/CopyoverRecovery`); `Condition` regex anchored with an optional `Size: <word>` prefix and capped at 100 | 36-case chat matrix (6 chat forms × 6 system texts), vault/Condition-in-chat, real lore shapes still accepted, impossible `%` rejected |
| **SEC-2** | corpus (4 real chat lines) + PoC: 8 red | Anchored regex + `isPlausibleSkillUp` (+1…+5 above tracked, ≤ 1001 cap) before the level is trusted or persisted | the 4 real chat lines, jump/over-cap/regression, genuine +1, unit table |
| **SEC-3** | corpus (103 whole-line) + PoC: 2 red | Whole-line match, one recraft per craft attempt (`recraftsThisAttempt`), `sendCraft(…, recraft)` keeps the allowance | single recraft, repeat ignored, new attempt re-armed, pacing-gap no double send, stop respected |
| **SAF-1** | PoC: 8 red | `parseQualitySpec` ≤ 100; quantity 1–500 (`MAX_ORDER_QTY`, safe integer); `autoStartOnOrderAdd` setting, **default on** (your decision) | spec/qty tables, flag on/off |
| **SAF-2** | PoC: 3 red | `maxConsecutiveFailures` (15), per-order attempt budget `quantity × maxAttemptsPerItem` (100), `send()` choke point with a sliding 10 s command limit (`maxCommandsPerWindow` 120); a tripped limit blocks re-arming; stop → restart recovers | consecutive cap + reset on success, order budget (off-spec and no-loss paths), rate limit trip + recovery, debug trace |
| **TMR-1** | PoC: 4 red | Named timer slots (`schedule`/`clearSlot`) + `epoch` so a stale callback is a no-op; `outcomePending` / `qualityPending` make the first outcome/lore reply the only one that counts | duplicate no-loss, leaked watchdog, outcome during put-back chain, duplicate Condition, interrupt during put-back chain |
| **LIF-1** | PoC: 1 red | cleanup calls `resetEngine` (idle, flags cleared, nothing sent) and lists still-held materials — **report only** (your decision) | disable→enable→start, silent when idle, listener bookkeeping |
| **LIF-2** | PoC: 1 red | subscribes to `game:remote-server:close` → reset | no send after close even past the old watchdog |
| **LIF-3** | PoC: 2 red | `runKey` bound at start; engine storage writes use it; identity drift or `game:character-login` abandons the run | identity flip mid-run, login event |
| **DAT-1** | PoC: 8 red | `parse*` rebuilds every stored element (spec 0–100, safe ints, plain records) and drops bad ones; dropped count is reported once to the player | 7 malformed shapes, poisoned head removable, notice test |
| **DAT-2** | PoC: 2 red | orders/history write through; skill store flushes on `pagehide`/hidden; write failures reported once via `onStorageWriteError` | immediate persistence, pagehide, visibilitychange, quota error |
| **DAT-3** | review | `MAX_QUEUED_ORDERS = 200`, reject (never evict) on add and cap-on-load; `countOrders` avoids cloning for the count | cap, oversized load, set refused whole |
| **DAT-4** | PoC: 2 red | deep (JSON) copies on read and on write | nested-mutation and write-side aliasing |
| **CFG-1** | PoC: 5 red | `numIn(v, fallback, min, max)`; 0 / `''` / null / negative / > bound → default | table of 16 values + engine tests |
| **CFG-2** | PoC: 3 red | `sanitizeCommandArg` (apostrophes + all control chars) on every config string; `containerArg` quotes multi-word containers | parser output free of control chars, three engine `put` cases |
| **CFG-3** | mechanism read in code | **Plugin-only guard** (your decision): a saved table equal to the shipped default is read as the current default; `LEGACY_DEFAULT_TABLE_FINGERPRINTS` upgrades known old defaults. Root cause filed: [`.ai-bug/20261017-1500-plugin-config-save-freezes-defaults.md`](../../.ai-bug/20261017-1500-plugin-config-save-freezes-defaults.md) | fingerprint/resolve units, engine reads a reformatted default |
| **HOST-1** | base run: 10 red | `normalizePluginModule` spreads `...mod` first (a new hook can no longer be dropped) | every hook + unknown future hook + normalization intact; **every core plugin with `onAlias` is reachable through the real host** (`pluginHost.test.ts`, 9 plugins) |
| **HOST-2** | read | kept the `actions` passthrough (harmless, pinned); added the missing component test | `PluginConfigModal.test.tsx`: ok / no-handler / error labels, 1.5 s reset, draft pushed + key invoked |
| **COR-1** | corpus latency + PoC: 1 red | success lines (`You get … from … vault.`) confirm pulls; a failure is pinned on the first unconfirmed pull, and when ambiguous the message names every candidate and everything sent is put back | ambiguous and exact cases; one existing test now feeds the success line a real server prints |
| **CFG-2b** | corpus: put replies `You put … in the mystic vault.` (9 samples) / `You do not have that item.` (9 of 24 first replies) | Order mode sends the `put`, then waits (`pendingPut`, timer slot `put`, the Lore timeout) for the reply. `You put … in …` credits the order and moves on; `You do not have that item.` or silence stops the run with nothing credited. Added in a second pass at your request. | `CFG-2b` block in `crafting-helper.hardening.test.ts` (6 behaviour tests), matcher units in `…hardening-units.test.ts`; the 19 existing order tests now feed the put reply |
| **CON-1** | grep | `debug` now logs each sent command | debug on/off |
| **CON-3** | grep | Crafting Helper sections in `docs/scripting/plugins.md` and `ScriptingHelpModal.tsx` (nav + block); `crafthelper help` documents the limits | n/a (docs) |
| **CON-4** | `prettier --check` | formatted | `prettier --check` clean |
| **CON-6** | grep | local path removed from the plan doc; the 9 "review N.N" / "Review Focus" references removed from code and test titles | n/a |
| **CON-7** | read | `QualitySpec` is now an alias of `StoredQualitySpec`; shared mock extracted to `crafting-helper.test-harness.ts` | n/a |

## Deviations from bugfix-proposal.md (the corpus changed the design)

- No prompt-prefix or speech-heuristic layer: 0 prompt-prefixed matches in 5 k+ corpus hits, so plain whole-line equality is simpler and exact. The proposed `^Condition…$` would have broken real lore output; the shipped regex allows `Size: <word>`.
- No control-character check inside `send()` (all inputs are sanitized at parse; a backstop nothing can reach would be dead code), and no catch-all `try/catch` around `handleRawData` (the throw it guarded — an order with no `qualitySpec` — is now removed at load).
- Skill-up: step/cap check implemented; the optional "re-run `score` at every tier boundary" layer is **not** (it would need an exact-line forgery, which the corpus does not show).
- COR-1 became "confirm pulls by their success line" instead of tracking the last get index, because the corpus shows the MUD prints one.

## Existing behavior that changed (side-effect review)

- Plugin tests: one existing test (`a vault failure partway through a multi-component order pull…`) now feeds the pull's success line, as the real server sends; everything else in the 874 original tests passed unchanged. Test titles lost their "(review N.N)" suffixes.
- Out-of-range timeout settings now mean "default" (e.g. craft timeout 0), they no longer fire immediately; limits also apply to `order add` (quality ≤ 100, quantity ≤ 500, queue ≤ 200).
- Other plugins: `normalizePluginModule` now passes everything through. Its only effect over the PR head is for hooks the PR head did not list (none exist today); relative to the base it is the revival of 8 plugins' aliases the PR already contained — now guarded by a real-registry test. The `PluginConfigModal.tsx` change is formatting only.
- Order mode now waits for the server's reply to the item `put` before crediting (the Lore timeout, default 2 s, also bounds this wait; corpus put replies took 86–379 ms). A server that never prints a put reply would stop every order after the first item.
- Disabling mid-run no longer leaves a wedged engine, and it sends nothing (reports instead).

## Not done / needs you

- **Put-result verification (CFG-2b): now done** (see the table). Limits: the success shape is only seen for `the mystic vault` in the corpus; other containers are assumed to print `You put X in Y.`. A container that prints something else would stop each order after its first item with "No confirmation", which is the safe direction. Improve mode's put is unchanged (it credits nothing). Open decisions answered: keep `1.0.0` (CON-2), host-wide CFG-3 stays in `.ai-bug/`, no UI screenshot.
- **CON-2** (unconfirmed recipe data, `1.0.0` label), **CON-5** (52 `Claude-Session:` trailers — a squash-message job), **CON-8** (plan docs), and the larger CON-7 refactors (extract recipes module, share the store with `peopleDb.ts`) are process / maintainer calls with no code fix here.
- **UI:** the `ScriptingHelpModal` change is a nav link plus a text block; no screenshot was taken.
- **Host-wide CFG-3** is in `.ai-bug/` for its own PR.

## Final re-check (after CFG-2b)

- All five Critical/High findings (SEC-1, SEC-2, SEC-3, SAF-1, HOST-1) are fixed and guarded; no finding above Medium is open.
- Re-run: full game-client suite 57 suites / 1071 tests, `tsc` 0, prettier and eslint clean on the plugin.
- Prompt-prefix risk for the whole-line matchers: 0 lines in the 2024 Jan–Mar text logs have text glued after the `<…tnl>` prompt (earlier scan: 0 prompt-prefixed in 5 k+ hits). Craft outcome lines themselves have no corpus sample, so that part rests on the shared server format, not on observed crafting output.
- Wording fix: the two put-failure errors now say to run `order stop` before `order start` (the engine sits in `error_stopped` and `start` answers "Already running").
