# PR #160 — bugfix proposal (Crafting Helper)

Fix plan for the verified findings in [review.md](review.md), grouped **by bug type** and ordered **most
severe first** (sections by their worst item; items inside a section by severity, `CONFIRMED` before
`PLAUSIBLE`). Raw agent output is in [findings.md](findings.md).

**Audience:** the maintainer deciding what to request on #160, and the PR author (or a follow-up
contributor) implementing it. This is the proposal as first written (snippets were never compiled). **It has since
been implemented** on branch `review/pr160-fixes`, with some design changes the real log corpus forced — see
[fix-log.md](fix-log.md), section "Deviations", before reusing any snippet below.

**Severity scale:** *High* = remotely triggerable or burns real in-game materials / changes other plugins;
*Medium* = wedges or mis-drives the engine under realistic conditions; *Low* = narrow trigger or latent;
*Nit* = hygiene. **Effort:** S ≤ 1 h, M ≈ half a day, L ≥ 1 day.

---

## Suggested slicing

| Slice | Contents | Why |
|-------|----------|-----|
| **0 — host PR (first)** | HOST-1 (root-cause fix + test + release note), HOST-2 | Crafting Helper's `crh`/`crafthelper` commands need `onAlias` to be reachable, so #160 depends on this. Landing it alone lets the 8 revived plugins be checked on their own. #160 then rebases and drops the `normalizePluginModule.ts` hunks. |
| **A — blocking on #160** | SEC-1, SEC-2, SEC-3, SAF-1, TMR-1 | Remote spoofing and the "typo burns the vault" path. |
| **B — before merge (strongly recommended)** | SAF-2, LIF-1, LIF-2, LIF-3, DAT-1, CFG-1 | Wedge states and missing brakes; small once TMR-1's helpers exist. |
| **C — follow-up** | DAT-2, DAT-3, DAT-4, CFG-2, CFG-3, COR-1, CON-* | Real but narrower or design-level. |

**Suggested order inside A/B** (each step builds on the previous): ① pure `system-lines` helpers (SEC-*) →
② timer/epoch helper + transitional state (TMR-1) → ③ `resetEngine` + lifecycle hooks (LIF-*) →
④ limits and input clamps (SAF-*, CFG-1) → ⑤ storage validation (DAT-1).

**Before any matcher change lands:** replay the new patterns against the interleaved
`game-server/*.jsonl` corpus (raw text + GMCP + input with timestamps — the only way to settle ordering and
prefix questions, text-only `.txt` logs can't). The shattered-plugin skill requires patterns to be verified
against real logs; the anchors below assume outcome lines are whole lines (with at most a prompt prefix) and
must be confirmed.

---

## 1. SEC — Untrusted server text drives the state machine · High

### SEC-1 · outcome / interrupt / vault-failure / Condition lines are spoofable · CONFIRMED
**Where:** `crafting-helper.plugin.ts:657-694` (matchers), consumed `:1252-1345`.
**Fix:** match **whole system lines only**, never substrings, and reject anything that carries a speaker or
channel. Put the logic in a new pure module so it is unit-testable without the engine.

```ts
// system-lines.ts (new)
// Optional MUD prompt such as "<123hp 99m 340mv> " — CONFIRM against the jsonl corpus before landing.
const PROMPT_PREFIX = /^(?:<[^<>\r\n]*>\s*)+/;
// Defence in depth only: the equality check in isSystemLine() is the actual gate.
const SPEECH = /(?:\b(?:says?|tells? you|gossips?|shouts?|yells?|asks?|exclaims?|OOC)\b[^'"]*['"]|^\[[^\]]+\])/i;

/** Returns the line as the game itself would print it, or null if it looks like player speech. */
export function systemLine(raw: string): string | null {
  const t = raw.replace(PROMPT_PREFIX, '').trim();
  return t && !SPEECH.test(t) ? t : null;
}
export const isSystemLine = (raw: string, text: string): boolean => systemLine(raw) === text;
```

```ts
export function matchCraftOutcome(line: string): CraftOutcome {
  const t = systemLine(line);
  if (t === OUTCOME_SUCCESS) return 'success';
  if (t === OUTCOME_DESTROYED) return 'failed_destroyed';
  if (t === OUTCOME_NO_LOSS) return 'failed_no_loss';
  return null;
}
export const matchVaultFailure = (l: string) => isSystemLine(l, VAULT_FAILURE_TEXT);
export const matchCraftInterrupted = (l: string) => isSystemLine(l, CRAFT_INTERRUPTED_TEXT);
// CONDITION_RE gets ^…$ and runs on systemLine(line) — see below
```
`Condition:` is the one matcher that is a *pattern*, not a fixed string: anchor it
(`/^Condition:\s*[^(]+\(\s*(\d+)%\s*\)$/`), run it on `systemLine(line)`, additionally require a plausible range
(`0 ≤ n ≤ 100`), and only accept it while in `checking_quality` **within `loreResponseTimeoutMs` of the `lore`
send** (it already is — keep it).
**Tests (add to `crafting-helper.plugin.test.ts`):** for each matcher — exact line ✔, ANSI-wrapped ✔, prompt-prefixed
✔ (if the corpus confirms), and ✘ for `Bob says '<text>'`, `Bob tells you '<text>'`, `Bob shouts '<text>'`,
`[Gossip] Bob: <text>`, `Bob gossips '<text>'`, and `<text> trailing words`. Plus a corpus-replay test using a
trimmed real jsonl fixture. **Effort:** M. **Risk:** low if the corpus check passes; a wrong anchor makes real
outcomes unrecognized, which falls back to the (180 s) craft timeout rather than a wrong action.

### SEC-2 · skill-up spoof escalates the tier and is persisted · CONFIRMED
**Where:** `SKILL_IMPROVED_RE` `:663`; applied `:1252-1260`; consumed by `tierForSkill` `:905`.
**Fix (three layers):**
1. Anchor and use `systemLine`: `/^Your crafting skill has improved\.\s*\((\d+)\)$/`.
2. Bound and sequence-check before accepting:
   ```ts
   const SKILL_CAP = 1001;          // confirm the real cap
   const MAX_SKILL_STEP = 5;        // tolerate a missed skill-up line, not a jump
   function acceptSkillUp(n: number): boolean {
     return trackedSkillLevel != null && n > trackedSkillLevel && n - trackedSkillLevel <= MAX_SKILL_STEP && n <= SKILL_CAP;
   }
   ```
   Reject (and `writeInfo` once) otherwise; never write a rejected value to storage.
3. **Never escalate a tier on an unverified level.** When `tierForSkill(trackedSkillLevel)` would pick a row
   different from the row currently in use, go through `awaiting_score` again and take the level from `score`
   (the authoritative source) before pulling the new tier's materials. This single rule also neutralizes any
   future skill-up spoof variant.
**Tests:** spoof formats (`say`/`tell`/`gossip`), out-of-range (`(99999)`), jump (`+300`), regression (`< tracked`);
and an engine test asserting a tier boundary triggers a `score` before `get`. **Effort:** M.

### SEC-3 · copyover recraft is spoofable and unbounded · CONFIRMED (trigger)
**Where:** `:685-687`, `:1307-1319` (the PR's headline commit).
**Fix:**
```ts
const MAX_COPYOVER_RECRAFTS_PER_ATTEMPT = 1;
let craftAttempt = 0;           // ++ in the normal (pull-cycle) path of sendCraft only
let recraftsThisAttempt = 0;    // reset when craftAttempt changes

if (isSystemLine(line, COPYOVER_RECOVERY_TEXT)) {          // whole line, not includes()
  clearSlot('craft');
  clearSlot('pacing');                                      // see TMR-1: the branch must not leave a pending pacing step
  if (stopRequested) { goIdle(api, cfg); return; }
  if (recraftsThisAttempt >= MAX_COPYOVER_RECRAFTS_PER_ATTEMPT) { return; }   // ignore repeats
  recraftsThisAttempt++;
  writeInfo(api, `Copyover detected — recrafting "${activeRecipe?.outputName}".`);
  sendCraft(api, cfg, { recraft: true });                   // re-arms the timer but does not start a new attempt
  return;
}
```
Also: `COPYOVER_RECOVERY_TEXT` equality alone defeats `say`/`shout` spoofing (the real broadcast is a whole line,
`\e[1;33mCopyover recovery complete.\e[0m` per the logs — ANSI is already stripped before matching), and the
one-per-attempt cap bounds a crash-looping server or a perfectly-forged line.
**Tests:** exact line → one `craft`; second identical line in the same attempt → no extra command; `Bob says '…'`
→ ignored; copyover while `stopRequested` → idle without `craft`; copyover during pacing/put-back → no duplicate.
**Effort:** S (after SEC-1 and TMR-1).

---

## 2. SAF — Runaway automation · High

### SAF-1 · unsatisfiable quality spec / unbounded quantity / auto-start · CONFIRMED
**Where:** `parseQualitySpec` `:538-555`, `handleOrderAdd` `:1597-1608`, auto-start `:1669-1671`.
**Fix:**
- Bound the spec: `atLeast.min ≤ 100`, `exact.value ≤ 100`, `range.max ≤ 100` (already rejects `min > max`).
- Bound the quantity: `Number.isSafeInteger(qty) && 1 ≤ qty ≤ MAX_ORDER_QTY` (propose 500) — also removes the
  `1e20 - 1 === 1e20` never-completes case.
- **Decision (recommend: remove or default-off):** `order add` auto-starting the engine means the first typo or
  pasted line begins spending vault materials with no explicit start. Either drop the auto-start, or gate it on
  a config flag `autoStartOnOrderAdd` (default `false`). The author added it deliberately (`d5cc245`), so this is
  the maintainer's call.
**Tests:** `97+`✔, `100`✔, `101+`✘, `150`✘, `95-101`✘, qty `0`/`-1`/`1e20`/`501`✘; `order add` with empty queue does
not send any command when auto-start is off. **Effort:** S.

### SAF-2 · no circuit breaker, attempt cap, or command-rate limit · CONFIRMED (paths read)
**Where:** `:1373` (no-loss retry), `:1189-1212` (destroyed recovery), `:1020` (off-spec loop).
**Fix:** three small, independent brakes, each a config field with a clamped default (see CFG-1):
```ts
// 1. consecutive-failure breaker (reset on any success)
if (++consecutiveFailures >= cfg.maxConsecutiveFailures) {          // default 15
  enterError(api, cfg, `${consecutiveFailures} failed crafts in a row — stopped to protect vault materials.`);
  return;
}
// 2. per-order attempt cap
if (++attemptsForOrder > order.quantityTotal * cfg.maxAttemptsPerItem) {   // default 20
  enterError(api, cfg, `Order ${order.id}: too many attempts for the requested quantity/quality — check the spec.`);
  return;
}
// 3. one choke point for sends with a sliding-window limiter + control-char guard (also fixes CFG-2's belt-and-braces)
function send(api: PluginRuntimeApi, cfg: EngineConfig, cmd: string) {
  if (/[\x00-\x1f\x7f]/.test(cmd)) { enterError(api, cfg, 'Refusing to send a command containing control characters.'); return; }
  const now = Date.now();
  sent = sent.filter((t) => now - t < cfg.commandWindowMs);        // default 10_000
  if (sent.length >= cfg.maxCommandsPerWindow) {                   // default 30
    enterError(api, cfg, 'Command rate limit hit — stopped to avoid flooding the MUD.');
    return;
  }
  sent.push(now);
  api.sendCommand(cmd);
}
```
Replace the nine `api.sendCommand(...)` call sites with `send(api, cfg, ...)`.
Optional enhancement (not required): `crh improve <type> start [targetLevel]` so a run stops at a requested level.
**Tests:** N consecutive `failed_destroyed` → stops at the cap with a single clear message; spoof flood of 100 outcome
lines → limiter trips, not 100 commands; control character in a command → refused. **Effort:** M.

---

## 3. HOST — Shared plugin-host changes bundled into the feature PR · High (scope)

### HOST-1 · `onAlias` passthrough revives 8 plugins · CONFIRMED
**Where:** `normalizePluginModule.ts:50-54`; cause is `b825d70` (2026-08-14).
**Fix (own PR, merged before #160):**
1. Fix the **root cause**, not one field — the field-by-field whitelist is why this happened and will happen to
   the next hook:
   ```ts
   export function normalizePluginModule(mod: IPluginModule): IPluginModule {
     return {
       ...mod,                                   // new IPluginModule hooks pass through by default
       manifest: { /* existing normalization */ },
       configSchema: mod.configSchema ? { /* existing defaults/fields normalization */ } : { defaults: {}, fields: [] },
     };
   }
   ```
2. Host-level test that iterates `CORE_PLUGINS`: for every plugin that defines `onAlias`, `enable()` it and assert
   `tryExecuteAlias` reaches it (guards the class of bug, not just crafting-helper).
3. In the PR description and release note, list what comes back to life: `pq …` (questbot), `gd`/`gq`/`scan
   gourds`/`toss`/`apply` (gourd), `set status|team`/`show info|kinfo|cinfo|craft` (people), `brew <name>`/
   `showbrews`/`showletters`/`showsymbols` (brew), `wa …` (warlock-alphabet), `enchant …` (enchant), the
   command gate in text-to-speech (`map` → `stopSpeaking()`), and world-time's score arming.
4. A short owner check of each revived plugin (the aliases have not run in production for two months —
   `brew <word>` with no recipe is *consumed* instead of reaching the MUD, `gd x` rewrites to `drop x`).
5. Add one line to `plugins/.annotated` for `normalizePluginModule.ts` about the passthrough rule.
**Effort:** M. **Risk:** behavior change for existing users is the point; that is why it deserves its own PR.

### HOST-2 · `actions` passthrough has no consumer; shared-UI labels untested · CONFIRMED
**Fix:** drop `normalizePluginModule.ts:36` and the three tests that pin it (the modal reads the raw
`create()` result, `PluginConfigModal.tsx:54`), **or** keep it and add the consumer that needs it — with the
`{...mod}` spread from HOST-1 it becomes moot. Keep the `invokePluginAction` union return (it is correct and
tested at host level), add a small `PluginConfigModal` component test for the `done` / `no-handler` / `error`
labels and the 1.5 s reset, and call out in the description that every plugin's sync button now says
"No handler"/"Failed" instead of "✓ Synced" when nothing ran. **Effort:** S.

---

## 4. TMR — Timers and re-entrancy · Medium

### TMR-1 · overwritten handles, re-entrant outcome lines, orphan watchdog · CONFIRMED
**Where:** `sendCraft` `:1169`; `pacingTimer` `:1004/1011/1020/1204/1207/1373`; `onCraftTimeout` `:1172-1187`.
**Fix — make orphans impossible rather than hunting each assignment:**
```ts
type Slot = 'score' | 'pull' | 'pacing' | 'quality' | 'release' | 'craft';
const timers: Partial<Record<Slot, ReturnType<typeof setTimeout>>> = {};
let epoch = 0;                                     // bumped by clearAllTimers()/resetEngine()

function clearSlot(slot: Slot) { const h = timers[slot]; if (h) { clearTimeout(h); delete timers[slot]; } }
function schedule(slot: Slot, ms: number, fn: () => void) {
  clearSlot(slot);                                 // never overwrite a live handle
  const mine = epoch;
  timers[slot] = setTimeout(() => { delete timers[slot]; if (mine === epoch) fn(); }, ms);   // stale epoch → no-op
}
function clearAllTimers() { epoch++; (Object.keys(timers) as Slot[]).forEach(clearSlot); }
```
- Replace every `xTimer = setTimeout(...)` / `clearTimeout(xTimer); xTimer = null` pair (≈12 sites) with
  `schedule` / `clearSlot`.
- Add a transitional state (e.g. `'between_steps'`) that is **entered when an outcome / quality line is
  consumed** and left only by the next `sendCraft` / `beginPullCycle` / `lore`. It is not in the set of states
  `handleRawData` parses for outcome / Condition lines, so a duplicate or spoofed line during the 150 ms pacing
  window and during the destroyed put-back chain is ignored. Keep the skill-up scan enabled in it.
- `onCraftTimeout` (and the other timeout handlers) start with `if (state !== 'crafting') return;`.
**Tests (fake timers):** two outcome lines within the pacing delay → exactly one `craft`; destroyed outcome + second
outcome mid put-back → one pull cycle; `clearAllTimers()` followed by a stale callback firing → no command;
`onCraftTimeout` firing in a later state → no `enterError`. **Effort:** M.

---

## 5. LIF — Lifecycle and identity · Medium

### LIF-1 · disabling mid-run leaves a wedged engine · CONFIRMED
**Where:** cleanup `:1399-1406`; host re-enable reuses the closure (`pluginHost.ts:270-273`).
**Fix:** one `resetEngine` that the cleanup calls (siblings enchant/gourd do the equivalent):
```ts
function resetEngine(api: PluginRuntimeApi, reason: string) {
  clearAllTimers();                                 // bumps epoch (TMR-1)
  const held = materialsHeld;
  state = 'idle'; mode = 'improve'; stopRequested = false;
  activeRecipe = null; activeOrder = null; activeOrderRemoved = false;
  materialsHeld = null; session = null; orderSession = null; runKey = null;
  if (held?.length) writeInfo(api, `${reason} — still in your inventory: ${formatComponents(held)}. Use \`put\` to return them.`);
  publishHud(api, readConfig(api));
}
// cleanup: off(); resetEngine(api, 'Crafting Helper disabled'); clear HUD slot
```
**Decision:** on *disable*, do **not** auto-send put-backs (the connection state is unknown and the host is
tearing the plugin down) — report what is still held, as above. Explicit `stop` keeps its return-to-vault
behavior. The help text ("if the run stops, these go back into the vault") should say "stops via `stop`/error".
**Tests:** start → off → on → `start` succeeds and reports no "Already running"; materials message lists the held
components. **Effort:** S.

### LIF-2 · no socket-close / reconnect handling · CONFIRMED (no listener) / PLAUSIBLE (consequence)
**Fix:** subscribe in `onEnable` like Level Progress does (`level-progress.plugin.ts:395`):
```ts
const offClose = api.onEvent('game:remote-server:close', () => resetEngine(api, 'Connection closed — run abandoned'));
// cleanup: off(); offClose();
```
No sends on close (the socket is gone). Also reset on the character-login event (confirm the exact event name;
Angle C cites `game:character-login`) so a different character never inherits an armed run.
**Tests:** close mid-`crafting` → no timer fires afterwards, state idle. **Effort:** S. Settle the open question
(does the instance survive a reconnect?) by reading `MainContainer.tsx:225-235` before relying on `shutdown()`.

### LIF-3 · character key is late-bound · PLAUSIBLE
**Fix:** capture the key once, at the start commands, and use only that for the whole run; abort if it drifts.
```ts
let runKey: string | null = null;                   // set in handleImproveStart / handleOrderStart after the __unknown__ guard
const key = () => runKey ?? characterKey();         // idle-time commands (list/status/history) still use the live key
function guardIdentity(api: PluginRuntimeApi): boolean {
  if (runKey && characterKey() !== runKey) { resetEngine(api, 'Character changed mid-run'); writeError(api, 'Stopped: the active character changed.'); return false; }
  return true;
}
```
Call `guardIdentity` at the top of `handleRawData` and before each storage write; replace `characterKey()` at the six
write sites (`:936`, `:985`, `:994`, `:1002`, `:1239`, `:1256`) with `key()`. Separately, the earlier review's
suggestion still stands: clear `__SA_IDENTITY__` on disconnect (`userScriptRuntime.ts:57-69`) — a host change,
tracked outside this PR. **Tests:** identity flips mid-run → run stops, no write under the new key. **Effort:** S.

---

## 6. DAT — Persistence and data integrity · Medium

### DAT-1 · loader trusts stored arrays · CONFIRMED mechanism
**Where:** `crafting-helper-storage.ts:113-125`; crash site `qualityMatchesSpec` `:558`.
**Fix:**
```ts
function createPerCharacterListStore<T extends object>(prefix: string, opts: { maxEntries?: number; validate: (x: unknown) => x is T }) {
  /* ensureLoaded: */ const arr = JSON.parse(raw);
  if (Array.isArray(arr)) {
    const valid = arr.filter(opts.validate);
    if (opts.maxEntries) valid.splice(0, Math.max(0, valid.length - opts.maxEntries));   // cap on load too
    store.set(characterKey, valid);
    if (valid.length !== arr.length) { console.warn(`[crafting-helper] dropped ${arr.length - valid.length} invalid stored entries`); persist(characterKey); }
  }
}
const isStoredOrder = (o: unknown): o is StoredCraftOrder => {
  const x = o as StoredCraftOrder;
  return !!x && typeof x === 'object' && typeof x.id === 'string' && typeof x.itemName === 'string'
    && Number.isSafeInteger(x.quantityRemaining) && x.quantityRemaining >= 0
    && Number.isSafeInteger(x.quantityTotal) && x.quantityTotal >= 1 && isStoredQualitySpec(x.qualitySpec)
    && Number.isFinite(x.createdAt);
};
```
Also make the engine survive a throw: wrap the body of `handleRawData` (or at least `resolveOrderQuality`) in
`try { … } catch (e) { enterError(api, cfg, 'Internal error — run stopped.'); api.error(e); }` so any future throw ends
in a defined, stoppable state instead of `checking_quality` with no timers, and guard `removeWhere`'s predicate
against non-objects. `isStoredQualitySpec` should be the single validator shared with `parseQualitySpec`
(this also resolves the `QualitySpec` / `StoredQualitySpec` duplication, CON-7).
**Tests:** `[null]`, `[{}]`, `[7]`, order without `qualitySpec`, `quantityRemaining:'abc'`, inverted range → all dropped
on load, valid siblings kept, queue head removable. **Effort:** M.

### DAT-2 · order progress lost within the 400 ms debounce · CONFIRMED
**Fix:** write order/history mutations **immediately** (small payloads) and keep the debounce only for the
skill-level store; flush everything on page hide:
```ts
function persistNow(k: string) { /* the body of the debounced callback, called synchronously */ }
// append/removeWhere/updateWhere → persistNow(k) for order + history stores
window.addEventListener('pagehide', flushAll);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
```
Report a failed `setItem` once (callback into the plugin → `writeError`) instead of `catch {}`.
**Tests:** `removeOrder` then immediately read `localStorage` → already updated; quota error → one visible message.
**Effort:** S.

### DAT-3 · unbounded queue; every read clones it · CONFIRMED
**Fix:** `MAX_QUEUED_ORDERS = 200` (`order add` refuses beyond it with a message; also enforced on load via DAT-1's
`maxEntries`). Add `peekFirst(k)` / `count(k)` so `advanceOrderQueue` and `handleOrderAdd` stop cloning the whole
queue for `queue[0]` / `queue.length`. **Effort:** S.

### DAT-4 · "deep enough" copy is shallow; tests are vacuous · CONFIRMED (latent)
**Fix:** `structuredClone` in `list()` and on the inputs to `append` / `updateWhere`; extend the two aliasing tests
to mutate `qualitySpec.min` and `materialsUsed[x]` (and the write side: mutate the object after `addOrder`).
**Effort:** S.

---

## 7. CFG — Config and command-argument hygiene · Medium

### CFG-1 · `numOr` accepts 0, empty string, and overflow · CONFIRMED
**Where:** `:763-766` and schema `min: 0` (`:1891` and siblings).
**Fix:** bounded coercion; reuse/extract the existing `clampNumber` from `text-to-speech.plugin.ts:287-291` into a
shared `pluginConfigNumbers.ts` instead of keeping two copies.
```ts
function numIn(v: unknown, fallback: number, min: number, max: number): number {
  if (v === null || v === undefined || typeof v === 'boolean' || (typeof v === 'string' && v.trim() === '')) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.trunc(n) : fallback;
}
// proposed bounds (ms): pacing 50–5_000 · pullConfirm 50–10_000 · score 200–10_000 · lore 500–10_000 · craft 10_000–600_000
```
Set the schema fields' `min`/`max` to the same bounds (the modal's `max` is advisory, so the code clamp is the real
gate). **Tests:** `''`, `null`, `0`, `-1`, `3e9`, `NaN`, `'abc'` → fallback; in-range kept. **Effort:** S.

### CFG-2 · container names unsanitized / unquoted; puts unverified · CONFIRMED
**Where:** `:804-807`, `:606-628`, `:972`; `sanitizeItemName` `:221-223`.
**Fix:**
```ts
export function sanitizeCommandArg(s: string): string {
  return s.replace(/[\x00-\x1f\x7f']/g, '').replace(/\s+/g, ' ').trim();
}
```
Apply it to **every** config-sourced string that reaches a command — craft-type `verb`/`keyword`/`label`, tier-table
trinket + components, `orderHoldingContainer`, and the `qualityContainerMap` container — at parse time, and
**quote the container** (`put 1 'item' 'container'`) after confirming merc-mud's `one_argument` accepts a
single-quoted container argument. The central `send()` guard from SAF-2 is the backstop for anything missed.
Put verification: mine the real corpus for the failure wording of a bad `put`, then treat it as a stop condition in
`storing_trinket` / routing so a failed store is no longer credited to the order; until then, validate container
names at config-save time. **Tests:** apostrophe, space, `\r`, `\n`, `\x00` in each field. **Effort:** M.

### CFG-3 · Save freezes the default recipe tables into user config · CONFIRMED mechanism
**Options (maintainer decision):**
a. **Plugin-level (recommended):** ship the tier/craft-type tables as code constants and keep the config fields as
   *overrides/additions only* (default `''`), so recipe fixes always reach everyone.
b. Version the defaults (`tierTableVersion`) and replace a stored table when it still equals a known older default.
c. **Host-level:** `PluginConfigModal.save()` persists only keys that differ from `defaults` (benefits every
   plugin; separate PR with its own tests).
**Effort:** M (a/b) · M (c).

---

## 8. COR — Other correctness · Low

### COR-1 · late vault-failure line blamed on the wrong component · PLAUSIBLE
**Where:** `:1274-1276`. **Fix:** record the index of the most recent `get` actually sent (`lastGetIndex`) and
attribute a late failure to it; compute `materialsHeld` as the components pulled *excluding* that index, not
`slice(0, pullIndex)`. **Tests:** 3-component recipe, failure for component 0 arriving after `pullTimer` advanced to 1
→ message names component 0, held = components 1…. **Effort:** S. (Awareness item in the earlier 2026-10-02 review.)

---

## 9. CON — Conventions and hygiene · Low / Nit

| ID | Action | Effort |
|----|--------|--------|
| CON-1 | Wire `cfg.debug` into `send()` and state transitions (`api.log`), or delete the field, interface member (`:759`), default (`:1839`) and schema entry. | S |
| CON-2 | Mark unconfirmed recipes (`confirmed: false` + date) — Platemail non-helmet slots (`:305-310`), non-opal/moonstone gem essences (`:398-403`) — surface them in `crh help`, and consider refusing them unless a config flag is set. Start at `0.x` (house skeleton `0.1.0`) until confirmed in-game. | S |
| CON-3 | Add a "Crafting Helper" section to `docs/scripting/plugins.md` (follow the Level Progress / Tick Warning sections) and a nav entry + block in `ScriptingHelpModal.tsx` (`plugin-crafting-helper`, next to `:870-874`). | S |
| CON-4 | `pnpm --filter game-client format` (touches the four new files plus `PluginConfigModal.tsx:46-48`, `pluginHost.test.ts:196`). | S |
| CON-5 | When squash-merging, replace the default message (it would paste 52 `Claude-Session:` URLs and 52 trailers into `release/dev`). Suggested message: `feat(crafting-helper): add Crafting Helper plugin (improve + order modes, copyover recovery)` with a short body. | S |
| CON-6 | Delete the `/Users/alexk/Downloads/…` path (`docs/superpowers/plans/2026-10-02-…review-fixes.md:11`); replace the ≈17 "review N.N" / "Review Focus #N" comment and test-title references with intent-only wording (why, not which ticket) — or link the earlier review in `.ai-code-review/` if it is to be kept. | S |
| CON-7 | Import `StoredQualitySpec` instead of redeclaring `QualitySpec` (`:533`); extract `requireCharacter()` (3 copies), `newSession()` (2), and the `clearSlot` idiom (done by TMR-1); move ≈550 lines of static recipe data + parsers to `crafting-helper-recipes.ts`; follow-up PR: extract the debounce-persist store shared with `peopleDb.ts` / `globalScriptsStore.ts` so a fix is made once. | M |
| CON-8 | Drop the two plan docs (or move them out of the product tree); keep at most the design spec. `docs/superpowers/` has precedent (#154) so the folder itself is fine. | S |

---

## Verification checklist for whoever implements this

- [ ] `pnpm --filter game-client test -- crafting-helper` green, plus the new negative/replay tests above (run bounded,
      e.g. `… 2>&1 | grep -E "Tests:|Test Suites:|FAIL|✕"`).
- [ ] Corpus replay: every new anchor tested against real `game-server/*.jsonl` output (prefixes, ANSI, chunking).
- [ ] Host PR: `pluginHost.test.ts` + new CORE_PLUGINS alias-reachability test green; revived commands listed in the PR body.
- [ ] Manual smoke on the user's running dev stack (do not start or stop their servers): enable → start → toggle
      off/on → start again; disconnect mid-craft; `order add … 970+` is rejected; a `say`/`tell` of each system line
      does nothing.
- [ ] `.annotated` entries refreshed for any new/renamed file in `core-plugins/` (and `plugins/` if
      `normalizePluginModule.ts` changes) per `CLAUDE.md`.
