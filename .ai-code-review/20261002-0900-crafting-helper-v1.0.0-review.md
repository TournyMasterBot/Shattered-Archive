# Crafting Helper v1.0.0 — code review findings

- **Branch:** `pr/160` vs `release/dev`
- **Scope:** `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts`,
  `crafting-helper-storage.ts` (+ tests), plus the small `normalizePluginModule.ts` /
  `registry.ts` wiring changes that shipped alongside them.
- **Review method:** 8-angle parallel-agent deep review (Angle A–E, Reuse,
  Simplification+Efficiency, Altitude+Conventions) via `/deep-review`-style
  orchestration — all 8 angles now complete. Findings were individually
  re-verified against the current source below (file:line confirmed, not stale
  context). Angle A (line-by-line diff scan) needed two retries before a usable
  result came back; the third attempt also ran the actual test suite
  (`pnpm --filter game-client test -- crafting-helper`: 695/695 passing) and
  returned **no new findings** — see §4 below.
- **Status:** not yet acted on. Nothing below has been fixed.

---

## 1. Code issues (security, antipatterns)

### 1.1 Unrecoverable stall in the `crafting` state — highest severity
`crafting-helper.plugin.ts:1280`
```ts
if (outcome === null) return; // keep waiting — no timeout on the craft step, see sendCraft()
```
An earlier commit deliberately removed the only guard (`craftResponseTimeoutMs` /
`onCraftTimeout`) on this state, reasoning one of three known outcome lines always
arrives. Nothing replaced it. If the MUD ever emits unrecognized success/failure/
destroyed wording, the engine hangs forever — `crafthelper stop` / `order stop`
can't force an exit (`handleStop` only sets `stopRequested` and waits for a
recognized line that will never come).

Compounding: the manifest's user-facing caveat that used to warn about exactly this
risk ("the lore quality-line pattern is unverified — watch for a stall on first
live use") was silently dropped during the v1.0.0 manifest-text terse-ification
pass (commit `1ae6cd3`). It survives only as an internal code comment near line
1129 — never shown to the user. A user hitting this today gets zero warning that a
hang is possible.

**Fix shape:** reinstate a bounded timeout on the `crafting` state (even a long
one, e.g. 60s) that transitions to `error_stopped` with a clear message, and
restore (or rewrite) the manifest-level stall caveat.

### 1.2 Prototype-pollution-style validation bypass
`crafting-helper.plugin.ts:1520-1534`
```ts
const setItems = ORDER_SET_RECIPES[itemName];
const memberNames = setItems ?? [itemName];
if (!setItems && !ORDER_ITEM_RECIPES[itemName]) { ... "Unknown order item" ... }
...
memberNames.forEach((name) => { ... });
```
`ORDER_SET_RECIPES`/`ORDER_ITEM_RECIPES` are plain objects looked up by bracket
notation with a raw player-typed key. Confirmed live:
`crafthelper order add 1 'constructor' 99+` resolves
`ORDER_SET_RECIPES['constructor']` to `Object`'s constructor function (truthy),
bypasses the "Unknown order item" check (since `!setItems` is false), and
`memberNames.forEach(...)` then throws (functions have no `.forEach`). Caught by
`pluginHost.ts`'s `tryExecuteAlias` try/catch, so no app crash — but the user gets
an opaque "onAlias error" instead of the intended validation message. Same for
`__proto__`, `toString`, `hasOwnProperty`, `valueOf`.

**Fix shape:** `Object.prototype.hasOwnProperty.call(ORDER_SET_RECIPES, itemName)`
guard (or `Object.create(null)` / a `Map` for both recipe tables).

### 1.3 Unescaped command interpolation (8 call sites)
Material/trinket names parsed from the user-editable Tier-table config are
interpolated unescaped into single-quoted MUD command strings:

- `crafting-helper.plugin.ts:879` — `put 1 '${recipe.outputName}' vault`
- `crafting-helper.plugin.ts:885` — `lore '${recipe.outputName}'`
- `crafting-helper.plugin.ts:911` — `put 1 '${activeRecipe.outputName}' vault`
- `crafting-helper.plugin.ts:935` — `put 1 '${outputName}' ${container}`
- `crafting-helper.plugin.ts:1038` — `put ${held[i].qty} '${held[i].material}' vault`
- `crafting-helper.plugin.ts:1103` — `get ${component.qty} '${component.material}' vault`
- `crafting-helper.plugin.ts:1125` — `craft ${activeCraftTypeRow.verb} '${activeRecipe.outputName}'`
- `crafting-helper.plugin.ts:1152` — `put ${component.qty} '${component.material}' vault`

A config-sourced name containing an apostrophe (plausible: "ogre's tooth") breaks
the quoting and gets mis-parsed by the MUD's own command tokenizer.

**Fix shape:** strip or escape single quotes from `component.material` /
`recipe.outputName` at parse time (`parseComponentList` / tier-table parsing), not
at each of the 8 call sites.

### 1.4 Out-of-scope side effect via `normalizePluginModule.ts`
`normalizePluginModule.ts:36` (confirmed new in this diff via
`git diff release/dev...HEAD`):
```ts
actions: Array.isArray(mod.configSchema.actions) ? mod.configSchema.actions : undefined,
```
Bundled into the same commit as the legitimate, tested `onAlias` fix — but this
line has no comment and no test. It silently re-enables previously-dead "Sync" /
"Stop speaking" / "List voices" / etc. action buttons on **7 unrelated, already-
shipped plugins**: `highlighter`, `text-to-speech`, `combat-compression`,
`voice-dictation`, `weapon-flag-squelch`, `stun-highlight`, `colorkit` — zero new
test coverage or QA on any of those buttons.

Compounding: `PluginConfigModal.tsx`'s action-button `onClick` unconditionally
flashes "✓ Synced" even when `pluginHost.invokePluginAction` silently no-ops (plugin
disabled, no handler registered) — misleads users into thinking a sync happened.

**Fix shape:** either split this into its own reviewed/tested change, or add a
regression test for the `actions` passthrough the same way `onAlias` got one, and
fix the action-button feedback to reflect whether a handler actually ran.

### 1.5 Cross-character data leak risk
`characterKey()` (`crafting-helper.plugin.ts:~785-789`) falls back to the literal
sentinel `'__unknown__'` when `window.__SA_IDENTITY__.characterName` isn't set yet.
The backing identity global (`userScriptRuntime.ts:57-69`) is set once from GMCP
`login_data` and **never cleared on disconnect**. Reconnecting as a different
character in the same browser session (no full page reload) leaves
`characterKey()` returning the *previous* character's name until the new
`login_data` arrives — any crafting-helper activity in that window writes under the
wrong character's storage key.

**Fix shape:** clear `__SA_IDENTITY__` on disconnect, or have crafting-helper defer
storage writes until a real identity is known instead of falling back silently.

---

## 2. Performance

### 2.1 Double/triple line-splitting per raw-data event
`handleRawData` does `plain.split('\n')` unconditionally at
`crafting-helper.plugin.ts:1194`, then **again** inside the state-specific branch
at `:1212` / `:1230` / `:1248`, each independently re-running `.trim()` per line
both times. `findCraftSkillLevel` (`:623`) does a 3rd independent split on
`strippedText` instead of taking a shared pre-split array.

This runs on essentially every incoming game-text chunk while a craft cycle is
active — `pulling_components` / `checking_quality` / `crafting` cover most of the
plugin's runtime, so this isn't a one-off cost, it scales with how chatty the
session is (combat spam/room text bundled into the same payload multiplies it).

**Fix shape:** split + trim once right after the ANSI-strip/`\r`-strip step
(`crafting-helper.plugin.ts:1171`), pass that single `lines` array into both the
unconditional skill-up loop and the state-specific loop, and have
`findCraftSkillLevel` accept the same array as a parameter instead of re-deriving
it.

---

## 3. Coding mistakes

### 3.1 Missing range-validity guard
`parseQualityContainerMap` (`crafting-helper.plugin.ts:589-592`) omits the
`min <= max` check its sibling `parseQualitySpec` has (`:523`:
`return min <= max ? {...} : null;`). A misconfigured `"98-95|rare-vault"` row is
silently accepted as `{min:98, max:95, container}` — a dead range
`matchQualityContainer` can never satisfy — so items in that intended band
silently fall through to the vault default instead of the configured container,
with no error surfaced.

### 3.2 Outcome-detection ordering bug
In the `crafting` state's line loop, `matchCraftInterrupted`/`matchVaultFailure`
(`:1255`, `:1268`) run unconditionally on every line, while `matchCraftOutcome`
(`:1274-1277`) is gated behind `if (outcome === null)`. A late vault-failure/
interrupted line arriving **after** a success line in the same multi-line payload
(a real, exercised code path per the test harness's `feedRaw` helper) discards an
already-detected success and forces `enterError()` — a completed craft gets
reported as failed and the trinket is never recorded.

### 3.3 Two timeout handlers skip the stop check
`onScoreTimeout` (`~:1308`) and `onQualityTimeout` (`~:912`) don't check
`stopRequested` before calling `enterError`, unlike sibling `onPullTimeout`
(`:1110`) which does. A user-requested stop that races a pending score/quality
timeout lands in an alarming `error_stopped` state instead of a clean idle.

### 3.4 Stale `activeOrder` after `goIdle()`
`goIdle()` (`~:1048`) clears `activeRecipe` but never `activeOrder`, and none of
its callers clear it either. After a stop or a natural queue drain,
`order status` can report a finished/removed order's `quantityRemaining` even
though `state=idle` and nothing is running.

### 3.5 Mislabeled `[active]` order tag
`handleOrderList` (`~:1590`) tags `queue[0]` as `[active]` whenever
`mode==='order' && state!=='idle'`, without checking it's actually the in-flight
order. Since `order remove <activeId>` splices the active order out of storage
immediately while the engine keeps finishing its in-flight craft, `queue[0]` during
that window is actually the *next* queued order — `order list` mislabels it
`[active]` while the real in-flight order is invisible.

### 3.6 `.annotated` / `.ai-context` not updated
Confirmed via `git diff --stat release/dev...HEAD`: 4 new files landed in
`core-plugins/` (`crafting-helper.plugin.ts`, `crafting-helper-storage.ts` + 2 test
files) with **zero** changes to that folder's `.annotated` or `.ai-context` — a
direct violation of this repo's `CLAUDE.md` "AI context indexes" rule ("after
creating or removing files in a directory, refresh that folder's `.annotated` and
`.ai-context`").

### 3.7 Reuse / duplication
- `crafting-helper-storage.ts` independently reimplements the lazy-load +
  debounced-persist state machine **3 times in the same file** (skill levels
  `:27-66`, order queue `:114-144`, completed-order history `:209-239`), each with
  its own loaded-flag, timer map, and 400ms debounce constant — mirrors but
  doesn't share `peopleDb.ts`'s pattern.
- The skill-levels `db` Map (`:20`) has no size cap, unlike `peopleDb.ts` in the
  same directory, which started with an identical unbounded Map and later added
  `MAX_PEOPLE`/`TRIM_TO` specifically to bound localStorage growth. Low risk here
  (craft-type cardinality is small) but the fix next door wasn't carried over.
- `containerForQuality` (`:611`) is exported production code with its own test
  `describe` block, but nothing in the plugin's runtime calls it anymore —
  `resolveOrderQuality` (`:933-934`) reimplements the equivalent fallback inline.
  Two implementations of "fall back to a container" can silently drift apart since
  only one is exercised by the real engine.
- `splitConfigLines` (`:206-212`) is a ~12th inline copy of the same
  split/trim/filter-comments pattern already duplicated across 10+ other
  core-plugins files, with no shared helper. Pure maintenance burden, not a bug —
  lowest priority on this list.

### 3.8 Shallow defensive copy
`getOrderQueue`/`getCompletedOrders` (`crafting-helper-storage.ts:146`, `:241`)
only clone the outer array; the `StoredCraftOrder` objects inside are the same
references held in the internal Map. `crafting-helper.plugin.ts:994-1019` stores
the result directly into the long-lived `activeOrder` variable, so it's a direct
alias into storage. No live bug today — every current write path goes through
`updateOrder`/`removeOrder` — but a future direct-mutation caller would silently
desync the UI from what's persisted.

---

## 4. Angle A (line-by-line diff scan) — clean pass, no new findings

Took three attempts (first returned suspiciously fast with nothing; second
completed normally but its content never reached this session; third succeeded).
The third run read both new files in full line by line against the requested
defect categories (off-by-one, swapped/wrong operators, swapped arguments,
inverted conditions, wrong-variable/copy-paste, `==`/`??` mistakes, unreachable
code, misplaced return/break) — specifically re-checked boundary logic in
`tierForSkill`, the inclusive range bounds in `qualityMatchesSpec`/
`matchQualityContainer`, the `remaining`/`done` arithmetic in
`resolveOrderQuality`, `materialsHeld` bookkeeping across pull/timeout/vault-
failure paths, the `MAX_COMPLETED_ORDERS` trim slice math, and `onAlias` dispatch
ordering. All checked out correct. It also ran the suite:
`pnpm --filter game-client test -- crafting-helper` → **695/695 passing**.

**Result: `[]`** — no new findings, which corroborates rather than undercuts
§§1–3 above (those came from angles doing cross-file tracing, git-history
archaeology, and reuse-hunting — a different kind of defect than this angle
checks for).

One thing it explicitly declined to report as a formal finding, worth being aware
of rather than fixing: in `handleRawData`'s `pulling_components` branch
(~`crafting-helper.plugin.ts:1220`), if a vault-failure message for pull *N*
arrives late — after `pullConfirmTimeoutMs` has already elapsed and `pullIndex`
has advanced to *N+1* — the resulting error text names the *current* pull's
material, not the one that actually failed. This needs contrived timing to
trigger, and the code's own comments show the authors already knowingly traded
off this exact race for the final-pull case, so it's noted here as an awareness
item rather than folded into §3.

---

## Next steps (when picked back up)

1. Fix 1.1–1.3 first (stall, validation bypass, command injection) — these are the
   only findings with a real user-facing or security angle.
2. 1.4/1.5 need a decision, not just a patch: should the `actions` passthrough ship
   in this PR at all, or get split out and tested on its own?
3. 2.1 is a quick, low-risk perf win — worth doing in the same pass as 1.1–1.3.
4. Section 3 items are cheap, mostly mechanical fixes; batch them together.
5. All 8 angles are now in — this review can be treated as complete. No need to
   re-run anything before acting on it.
