# Crafting Helper v1.0.0 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every actionable finding from the v1.0.0 code review of the Crafting Helper plugin (PR #160) before it merges, without regressing any of the 695 existing passing tests.

**Architecture:** Each task is a surgical, independently-testable patch to one of three files: `crafting-helper.plugin.ts` (the state machine), `crafting-helper-storage.ts` (persisted storage), or `PluginConfigModal.tsx`/`pluginHost.ts` (the one unrelated-but-bundled change the review flagged). No new files are created except one test file (`normalizePluginModule.test.ts`, which did not previously exist) and the plan's own ledger. Tasks are ordered so later tasks that touch the same code region (e.g. the `handleRawData` line loop) land after the refactor that reshapes it, avoiding merge friction between tasks.

**Tech Stack:** TypeScript, Jest (`jest.useFakeTimers()` for timer-driven tests), the existing `createMockApi`/`defaultConfig`/`feedLine`/`feedRaw` test harness already in `crafting-helper.plugin.test.ts`.

**Spec:** `/Users/alexk/Downloads/20261002-0900-crafting-helper-v1.0.0-review.md` (the code review document this plan implements — all finding numbers below, e.g. "1.1", "3.2", refer to its section numbering). Every claim in that review was independently re-verified against the current source in this worktree (file:line, not stale context) before this plan was written — see the per-task "Verified" notes.

## Global Constraints

- Every task must leave `crafting-helper.plugin.test.ts` (695+ tests) and `crafting-helper-storage.test.ts` fully green — run the scoped test command after every task, never the whole-workspace `pnpm test` (it OOMs in this environment, a pre-existing unrelated issue, not something to re-diagnose here):
  `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts crafting-helper-storage.test.ts`
- Typecheck after every task: `npx tsc --noEmit -p apps/game-client/tsconfig.json`.
- Lint the touched files directly after every task (avoids the same OOM): `npx eslint <touched files>`.
- Never use `pnpm --filter game-client test -- crafting-helper` (no `.test.ts` suffix) — it OOMs; always name the exact test file(s).
- `crafting-helper.plugin.test.ts`'s `beforeEach` drains the order queue for the file's default test character (`'__unknown__'` until Task 5 lands, `'testchar'` from Task 5 onward — see Task 5 Step 1) but **not** the completed-order history (it's a module-level singleton shared across every test in the file). Any new history-related test, in any task, must look up its own record by id (`history.find(r => r.id === orderId)`), never assert on the whole list's absolute length or an "empty" precondition — this exact trap already bit an earlier session (see plan's conversation history) and is cheap to re-trip.
- Manifest `description` must stay terse (existing test asserts `description.length < 400` and that it contains `'crafthelper help'` and not `'crafthelper order add'`) — do not add the restored stall caveat there; it belongs in `crafthelper help` output instead (Task 1).
- Commit after each task with a message naming the review finding number(s) it fixes (e.g. `fix(crafting-helper): bounded timeout on crafting state (review 1.1)`).
- **Explicitly out of scope, with reasoning (do not "fix" these even if a reviewer suggests it):**
  - The `splitConfigLines` duplication (review 3.7, 4th bullet) — fixing it means touching 10+ unrelated core-plugins files outside this review's scope; the review itself ranks it lowest priority.
  - The late-vault-failure-names-wrong-material race noted under "Angle A" in the review — the review explicitly says the code's own comments show this tradeoff was already made knowingly, and flags it as an awareness item, not a finding to fix.
  - Clearing `window.__SA_IDENTITY__` on disconnect in `userScriptRuntime.ts` (one of review 1.5's two suggested fix shapes) — that file is shared infrastructure well outside `crafting-helper`'s files; Task 5 takes the review's other suggested fix shape (defer activity until identity is known) instead, scoped entirely to `crafting-helper.plugin.ts`.

## Review Focus

Five failure modes the review's fix shapes imply but don't spell out as their own test — each gets its test added to the task whose code owns it, named below:

1. **A fresh timeout this plan itself introduces must not repeat 3.3's bug.** Task 1 adds a brand-new `onCraftTimeout` handler; if it skips the `stopRequested` check that 3.3 is busy adding to its two siblings, this plan ships a sixth occurrence of the exact class of bug it's fixing elsewhere. Task 1's own test covers a stop requested while the new craft timer is pending.
2. **The prototype-pollution guard (1.2) must reject the whole poison-name family, not just `constructor`.** The review lists `__proto__`, `toString`, `hasOwnProperty`, `valueOf` by name too. Task 2's tests exercise all five, not just the one in the review's live repro.
3. **Command-string injection (1.3) isn't only `component.material`/`recipe.outputName`.** `activeCraftTypeRow.verb` is *also* user-edited free text (the Craft types config) interpolated into the craft command (`craft ${verb} '...'`) as a bare, unquoted token — a space or quote in a configured verb breaks the command the same way, and the review didn't name this call site. Task 3 extends the same sanitize-at-parse-time fix to `parseCraftTypesConfig`'s verb/label/keyword fields.
4. **The line-splitting refactor (2.1) must not disturb the already-tested cross-payload skill-up case.** The code comment at the top of the unconditional skill-up scan loop documents a real bug it fixed: a skill-up notice arriving in a *later* payload than the success line that triggered it. Task 6 keeps (and Task 8 doesn't touch) a regression test driving exactly that two-payload sequence.
5. **The storage refactor (Task 9) changes copy depth, which must be pinned, not assumed.** Today's shallow copy means a caller mutating an object inside the returned array *would* silently corrupt what's persisted (review 3.8: "no live bug today... but a future direct-mutation caller would"). After Task 9's deeper copy, that must be false — a test mutates a returned order's field and asserts the next `getOrderQueue()` call is unaffected.

---

### Task 1: Bounded timeout on the `crafting` state (review 1.1)

**Files:**
- Modify: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts` (EngineConfig interface ~720-731, `readConfig` ~763-783, timer declarations ~807-825, `sendCraft` ~1118-1130, new `onCraftTimeout` function, `handleRawData`'s crafting-state branch ~1246-1282, configSchema defaults ~1728 and fields ~1760, `handleHelp` ~1368-1430)
- Test: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts`

**Verified:** `crafting-helper.plugin.ts:1280` reads `if (outcome === null) return; // keep waiting — no timeout on the craft step, see sendCraft()`, and `sendCraft` (line ~1126-1129) carries a comment explicitly claiming "there's no stall risk" in sending a craft command with no timeout. Confirmed no `craftTimer` variable or `craftResponseTimeoutMs` config field currently exists.

**Interfaces:**
- Consumes: existing `EngineConfig`, `clearAllTimers()`, `enterError()`, `readConfig()`, `stopRequested`, `goIdle()`.
- Produces: new `EngineConfig.craftResponseTimeoutMs: number` field (default `60000`), a new closure-scoped `craftTimer: ReturnType<typeof setTimeout> | null` variable, a new `onCraftTimeout(api: PluginRuntimeApi)` function. Later tasks that touch `clearAllTimers()` or the crafting-state branch (Task 8) must keep clearing/respecting `craftTimer` the same way they do the other timers.

- [ ] **Step 1: Add the config field**

In `EngineConfig` (around line 726, right after `loreResponseTimeoutMs: number;`):

```ts
  loreResponseTimeoutMs: number;
  craftResponseTimeoutMs: number;
```

In `readConfig` (around line 772, right after the `loreResponseTimeoutMs` line):

```ts
    loreResponseTimeoutMs: numOr(cfg.loreResponseTimeoutMs, 2000),
    craftResponseTimeoutMs: numOr(cfg.craftResponseTimeoutMs, 60000),
```

In `configSchema.defaults` (around line 1734-1736, alongside the other `*TimeoutMs` defaults):

```ts
        loreResponseTimeoutMs: 2000,
        craftResponseTimeoutMs: 60000,
```

In `configSchema.fields`, right after the `loreResponseTimeoutMs` field block (around line 1785):

```ts
        {
          key: 'craftResponseTimeoutMs',
          type: 'number',
          label: 'Craft response timeout (ms)',
          min: 0,
          description:
            'How long to wait after `craft` for a recognized outcome line before stopping — a safety net in case the server ever sends unrecognized text (default 60s; higher tiers can take a while, so keep this generous).',
        },
```

- [ ] **Step 2: Write the failing tests**

Add near the other timeout tests in `crafting-helper.plugin.test.ts` (same `describe('crafting-helper state machine', ...)` block, after an existing pull/score-timeout test so the file's test-grouping convention is followed):

```ts
  it('stops cleanly with an error if no recognized outcome arrives within craftResponseTimeoutMs', () => {
    const mock = createMockApi(defaultConfig({ craftResponseTimeoutMs: 500 }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 1     Craft Rank: Apprentice Spellcrafter');
    jest.advanceTimersByTime(200); // pull-confirm timeout — assume the `get` succeeded
    mock.sent.length = 0;
    mock.terminalWrites.length = 0;

    jest.advanceTimersByTime(500);

    expect(mock.terminalWrites.join('\n')).toMatch(/craft/i);
    expect(mock.terminalWrites.join('\n')).toContain('500ms');
    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).toContain('state=error_stopped');
  });

  it('does not fire the craft-response timeout once a recognized outcome line arrives first', () => {
    const mock = createMockApi(defaultConfig({ craftResponseTimeoutMs: 500 }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 1     Craft Rank: Apprentice Spellcrafter');
    jest.advanceTimersByTime(200);

    mock.feedLine('You were successful.');
    jest.advanceTimersByTime(500); // if the craft timer weren't cleared, this would also fire it

    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).not.toContain('error_stopped');
  });

  it('goes cleanly idle, not error_stopped, if stop was requested while waiting on the craft-response timeout', () => {
    const mock = createMockApi(defaultConfig({ craftResponseTimeoutMs: 500 }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 1     Craft Rank: Apprentice Spellcrafter');
    jest.advanceTimersByTime(200);

    plugin.onAlias!(mock.api, 'crafthelper improve stop');
    jest.advanceTimersByTime(500);

    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).toContain('state=idle');
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: the three new tests FAIL (no timeout exists yet, so the engine hangs in `state=crafting` and the status check never shows `error_stopped` or `idle`).

- [ ] **Step 4: Add the timer variable and clear it in `clearAllTimers`**

Add alongside the other timer declarations (around line 813, after `let releaseTimer`):

```ts
  let releaseTimer: ReturnType<typeof setTimeout> | null = null;
  let craftTimer: ReturnType<typeof setTimeout> | null = null;
```

Update `clearAllTimers` (lines 819-825):

```ts
  function clearAllTimers() {
    if (scoreTimer) clearTimeout(scoreTimer);
    if (pullTimer) clearTimeout(pullTimer);
    if (pacingTimer) clearTimeout(pacingTimer);
    if (qualityTimer) clearTimeout(qualityTimer);
    if (releaseTimer) clearTimeout(releaseTimer);
    if (craftTimer) clearTimeout(craftTimer);
    scoreTimer = pullTimer = pacingTimer = qualityTimer = releaseTimer = craftTimer = null;
```

(Leave the rest of the function body below that line untouched.)

- [ ] **Step 5: Arm the timer in `sendCraft` and write `onCraftTimeout`**

Replace `sendCraft`'s body (lines 1118-1130):

```ts
  function sendCraft(api: PluginRuntimeApi, cfg: EngineConfig) {
    if (!activeCraftTypeRow || !activeRecipe) {
      enterError(api, cfg, 'Internal error: no active craft type/recipe.');
      return;
    }
    state = 'crafting';
    publishHud(api, cfg);
    api.sendCommand(`craft ${activeCraftTypeRow.verb} '${activeRecipe.outputName}'`);
    // Bounded safety net: one of the three known outcome lines almost always
    // arrives quickly, but an unrecognized server message must not hang the
    // engine forever (review finding 1.1) — craftResponseTimeoutMs is long
    // (default 60s) precisely because higher-tier crafts can take a while.
    craftTimer = setTimeout(() => onCraftTimeout(api), cfg.craftResponseTimeoutMs);
  }

  function onCraftTimeout(api: PluginRuntimeApi) {
    craftTimer = null;
    const cfg = readConfig(api);
    // Same stopRequested check sibling timeouts need (review 3.3) — a stop
    // that races this timeout must land in a clean idle, not an alarming
    // error_stopped.
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    enterError(
      api,
      cfg,
      `No recognized outcome for "${activeRecipe?.outputName}" within ${cfg.craftResponseTimeoutMs}ms — stopped rather than wait forever on unmatched text.`,
    );
  }
```

- [ ] **Step 6: Clear `craftTimer` once an outcome is resolved**

In `handleRawData`'s crafting-state branch, right after the line loop and before the `if (outcome === null) return;` check (around line 1278-1280), clear the timer as soon as a line is actually processed into an outcome. The minimal, correct edit is inside the `if (outcome === null) return;` guard's *else* path — i.e. right where the function continues past it:

```ts
    if (outcome === null) return; // keep waiting for the craft-response timeout, or a recognized line

    if (craftTimer) {
      clearTimeout(craftTimer);
      craftTimer = null;
    }

    if (session) session.craftAttempts += 1;
```

(This replaces the old line-1280 comment, which is now wrong — the timeout *is* the answer to "what happens on unmatched text" — and the `if (session) session.craftAttempts += 1;` line immediately below it is unchanged, just now preceded by the clear.)

- [ ] **Step 7: Add the user-facing caveat to `crafthelper help`**

In `handleHelp` (around line 1380, right after the `'Stand wherever your vault and crafting station both are before starting either.'` line), add:

```ts
        'Stand wherever your vault and crafting station both are before starting either.',
        'If a craft never gets a recognized response within the Craft response',
        'timeout (default 60s, configurable), the run stops with a clear error',
        'instead of hanging indefinitely.',
        'Every command below also works with "crh" in place of "crafthelper".',
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: PASS, including all three new tests and every pre-existing test.

- [ ] **Step 9: Typecheck, lint, commit**

```bash
npx tsc --noEmit -p apps/game-client/tsconfig.json
npx eslint apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git add apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git commit -m "fix(crafting-helper): bounded timeout on crafting state (review 1.1)"
```

---

### Task 2: Prototype-pollution-style validation bypass in order recipe lookups (review 1.2)

**Files:**
- Modify: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts` (after `ORDER_SET_RECIPES` declaration ~line 506; call sites at ~868, ~1001, ~1520, ~1522, ~1535)
- Test: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts`

**Verified:** `ORDER_ITEM_RECIPES`/`ORDER_SET_RECIPES` (lines 468, 503) are plain `{}` object literals looked up by bracket notation with a raw, lowercased, player-typed key at exactly 5 call sites (868, 1001, 1520, 1522, 1535) — confirmed via grep, no `hasOwnProperty` guard anywhere.

**Interfaces:**
- Consumes: `ORDER_ITEM_RECIPES`, `ORDER_SET_RECIPES` (unchanged shape).
- Produces: `getOrderItemRecipe(name: string): OrderItemRecipe | undefined` and `getOrderSetRecipe(name: string): string[] | undefined`, both exported for direct unit testing (matching this file's existing convention of exporting pure helpers).

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block in `crafting-helper.plugin.test.ts` (near the other pure-function `describe` blocks, before the state-machine `describe`):

```ts
describe('getOrderItemRecipe / getOrderSetRecipe (prototype-pollution guard)', () => {
  it('returns undefined for every inherited Object.prototype property name, not just "constructor"', () => {
    for (const poison of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(getOrderItemRecipe(poison)).toBeUndefined();
      expect(getOrderSetRecipe(poison)).toBeUndefined();
    }
  });

  it('still returns real recipes for real names', () => {
    expect(getOrderItemRecipe('diamond gem pain')).toBeDefined();
    expect(getOrderSetRecipe('silksteel cloth set')).toBeDefined();
  });
});
```

Add the two new names to the existing import block at the top of the file (alongside `ORDER_ITEM_RECIPES, ORDER_SET_RECIPES`):

```ts
  ORDER_ITEM_RECIPES,
  ORDER_SET_RECIPES,
  getOrderItemRecipe,
  getOrderSetRecipe,
} from './crafting-helper.plugin';
```

Also add a live-repro-shaped integration test in the state-machine `describe` block (this is the exact scenario the review manually reproduced):

```ts
  it('rejects "order add 1 \'constructor\' 99+" as an unknown item instead of crashing on recipe.components', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    expect(plugin.onAlias!(mock.api, "crafthelper order add 1 'constructor' 99+")).toBe(true);

    expect(mock.terminalWrites.join('\n')).toContain('Unknown order item');
  });
```

(Deliberately no `getOrderQueue(...)` assertion here: Task 5 later changes which character key this file's tests default to, and an identity-keyed storage assertion in this test would either need updating in lockstep with that unrelated change or quietly stop testing anything — the terminal-message assertion above is identity-independent and already fully captures "the order was rejected, not queued.")

- [ ] **Step 2: Run tests to verify they fail**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: FAIL — `getOrderItemRecipe`/`getOrderSetRecipe` don't exist yet (import error), and (once stubbed in to isolate the behavior) the `'constructor'` repro test fails because today's code resolves `ORDER_SET_RECIPES['constructor']` to `Object`'s constructor function and throws inside `memberNames.forEach(...)`, which `onAlias`'s caller catches — so `mock.terminalWrites` never gets the "Unknown order item" message.

- [ ] **Step 3: Add the two safe-lookup helpers**

Right after the `ORDER_SET_RECIPES` declaration (line 506), before `export type QualitySpec`:

```ts
export const ORDER_SET_RECIPES: Record<string, string[]> = {
  ...tailoringSetGroups(),
  ...armorSetGroups(),
};

// Plain-object bracket lookups on a player-typed key are exploitable: e.g.
// `order add 1 'constructor' 99+` resolves ORDER_SET_RECIPES['constructor']
// to Object's constructor function (truthy), bypassing the "unknown item"
// check downstream. hasOwnProperty.call rejects every inherited property
// name (constructor, __proto__, toString, hasOwnProperty, valueOf, ...),
// not just the one in the live repro (review finding 1.2).
function getOrderItemRecipe(name: string): OrderItemRecipe | undefined {
  return Object.prototype.hasOwnProperty.call(ORDER_ITEM_RECIPES, name) ? ORDER_ITEM_RECIPES[name] : undefined;
}

function getOrderSetRecipe(name: string): string[] | undefined {
  return Object.prototype.hasOwnProperty.call(ORDER_SET_RECIPES, name) ? ORDER_SET_RECIPES[name] : undefined;
}
```

Then change the two function declarations to be exported (for the direct unit test above) by adding `export` — final signatures:

```ts
export function getOrderItemRecipe(name: string): OrderItemRecipe | undefined {
```
```ts
export function getOrderSetRecipe(name: string): string[] | undefined {
```

- [ ] **Step 4: Replace the 5 unsafe call sites**

`resolveNextRecipe` (line 868):
```ts
      const orderRecipe = getOrderItemRecipe(activeOrder.itemName);
```

`advanceOrderQueue` (line 1001):
```ts
    const orderRecipe = getOrderItemRecipe(next.itemName);
```

`handleOrderAdd` (lines 1520-1522):
```ts
    const setItems = getOrderSetRecipe(itemName);
    const memberNames = setItems ?? [itemName];
    if (!setItems && !getOrderItemRecipe(itemName)) {
```

`handleOrderAdd`'s `memberNames.forEach` body (line 1535):
```ts
      const orderRecipe = getOrderItemRecipe(name);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: PASS, all new and existing tests.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit -p apps/game-client/tsconfig.json
npx eslint apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git add apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git commit -m "fix(crafting-helper): guard order-recipe lookups against prototype-pollution names (review 1.2)"
```

---

### Task 3: Sanitize config-sourced names before command interpolation (review 1.3 + Review Focus #3)

**Files:**
- Modify: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts` (`parseComponentList` ~222-238, `parseTierTableConfig` ~252-265, `parseCraftTypesConfig` ~240-250)
- Test: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts`

**Verified:** 8 call sites interpolate `component.material` or `recipe.outputName` unescaped into single-quoted command strings (confirmed by the review, matches source at lines 879/885/911/935/1038/1103/1125/1152 — the exact line numbers shift slightly after Task 1/2's edits, but the call sites themselves are unaffected by those tasks). Both names originate from `parseComponentList` (line 222) and `parseTierTableConfig` (line 252), which read directly from the user-editable Tier table config textarea with no sanitization. Additionally (Review Focus #3), `parseCraftTypesConfig` (line 240) reads `verb`/`label`/`keyword` from the equally user-editable Craft types config, and `verb` is interpolated as a bare unquoted token in `` `craft ${activeCraftTypeRow.verb} '...'` `` (line 1125 pre-Task-1) — a space or quote in a configured verb breaks that command the same way.

**Interfaces:**
- Consumes: nothing new.
- Produces: `sanitizeItemName(name: string): string`, exported for direct unit testing.

- [ ] **Step 1: Write the failing tests**

Add to the import block:

```ts
  sanitizeItemName,
} from './crafting-helper.plugin';
```

Add a new `describe` block near the other pure-function tests:

```ts
describe('sanitizeItemName', () => {
  it('strips single quotes so a config-sourced name cannot break the single-quoted command syntax', () => {
    expect(sanitizeItemName("ogre's tooth")).toBe('ogres tooth');
    expect(sanitizeItemName('plain name')).toBe('plain name');
  });
});

describe('parseComponentList / parseTierTableConfig sanitize names at parse time', () => {
  it('strips single quotes from a component material name', () => {
    const rows = parseTierTableConfig("spellcrafting | 1 | obsidian gemstone | ogre's tooth stone:1");
    expect(rows[0].components[0].material).toBe('ogres tooth stone');
  });

  it('strips single quotes from a trinket name', () => {
    const rows = parseTierTableConfig("spellcrafting | 1 | ogre's tooth gem | uncut obsidian stone:1");
    expect(rows[0].trinket).toBe('ogres tooth gem');
  });
});

describe('parseCraftTypesConfig sanitizes the craft verb (Review Focus #3)', () => {
  it('strips single quotes from the verb so it cannot break an unquoted command token', () => {
    const rows = parseCraftTypesConfig("spellcrafting | Spellcrafting | spell's craft | Spellcrafter");
    expect(rows[0].verb).toBe("spells craft");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: FAIL — `sanitizeItemName` doesn't exist (import error); once stubbed to isolate, the three new parse tests fail because today's parsers pass the raw apostrophe through unchanged.

- [ ] **Step 3: Add `sanitizeItemName` and wire it into the three parsers**

Add right before `parseComponentList` (line 222):

```ts
/**
 * Strips characters that would break the single-quoted MUD command syntax
 * these names get interpolated into (`get 1 'name' vault`, `craft verb
 * 'name'`, etc.). Tier-table and craft-types rows are user-edited free
 * text, so an embedded apostrophe is plausible ("ogre's tooth") and must
 * not reach a command string unescaped (review finding 1.3).
 */
export function sanitizeItemName(name: string): string {
  return name.replace(/'/g, '');
}

function parseComponentList(raw: string): RecipeComponent[] {
```

In `parseComponentList`, both places a material name is pushed (lines ~229 and ~235):

```ts
    const idx = trimmed.lastIndexOf(':');
    if (idx === -1) {
      components.push({ material: sanitizeItemName(trimmed), qty: 1 });
      continue;
    }
    const material = sanitizeItemName(trimmed.slice(0, idx).trim());
    const qty = parseInt(trimmed.slice(idx + 1).trim(), 10);
    if (!material || !Number.isFinite(qty) || qty <= 0) continue;
    components.push({ material, qty });
```

In `parseCraftTypesConfig` (lines ~240-250), sanitize `verb` (the one interpolated as a bare token) and, for the same "user-edited free text" reasoning, `label`/`keyword` too since they're also shown/matched elsewhere and cost nothing extra to sanitize consistently:

```ts
export function parseCraftTypesConfig(raw: unknown): CraftTypeRow[] {
  const rows: CraftTypeRow[] = [];
  for (const line of splitConfigLines(raw)) {
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 4) continue;
    const [id, label, verb, keyword] = parts;
    if (!id || !label || !verb || !keyword) continue;
    rows.push({ id: id.toLowerCase(), label: sanitizeItemName(label), verb: sanitizeItemName(verb), keyword: sanitizeItemName(keyword) });
  }
  return rows;
}
```

In `parseTierTableConfig` (lines ~252-265), sanitize `trinket`:

```ts
export function parseTierTableConfig(raw: unknown): CraftTierRow[] {
  const rows: CraftTierRow[] = [];
  for (const line of splitConfigLines(raw)) {
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 4) continue;
    const [craftTypeId, thresholdStr, trinket, componentsStr] = parts;
    const skillThreshold = parseInt(thresholdStr, 10);
    if (!craftTypeId || !trinket || !componentsStr || !Number.isFinite(skillThreshold)) continue;
    const components = parseComponentList(componentsStr);
    if (components.length === 0) continue;
    rows.push({ craftTypeId: craftTypeId.toLowerCase(), skillThreshold, trinket: sanitizeItemName(trinket), components });
  }
  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: PASS, all new and existing tests. (Check specifically that no existing test's fixture tier-table/craft-types rows contained an apostrophe that this change would now strip and break an existing assertion — `DEFAULT_TIER_TABLE_CONFIG`/`DEFAULT_CRAFT_TYPES_CONFIG` do not, per their declarations at lines 88 and 101.)

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit -p apps/game-client/tsconfig.json
npx eslint apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git add apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git commit -m "fix(crafting-helper): sanitize config-sourced names before command interpolation (review 1.3)"
```

---

### Task 4: Regression test + honest action-button feedback for the `actions` passthrough (review 1.4)

**Files:**
- Create: `apps/game-client/src/features/plugins/normalizePluginModule.test.ts`
- Modify: `apps/game-client/src/features/plugins/pluginHost.ts` (`invokePluginAction`, ~line 436-447)
- Modify: `apps/game-client/src/components/PluginConfigModal.tsx` (action button state/click handler, ~lines 46, 287-312)
- Test: `apps/game-client/src/features/plugins/pluginHost.test.ts` (add to existing file)

**Verified:** `normalizePluginModule.ts:36` (`actions: Array.isArray(mod.configSchema.actions) ? ... : undefined`) has no dedicated test anywhere in the repo (confirmed: no `normalizePluginModule.test.ts` exists, and `pluginHost.test.ts` has no `actions`-related test). `pluginHost.ts:436-447`'s `invokePluginAction` returns `void` and silently no-ops when no handler is registered for the action key — confirmed by reading its full body, and confirmed it has exactly one other caller (`PluginConfigModal.tsx:298`), which unconditionally flashes "✓ Synced" regardless of whether `invokePluginAction` found a handler.

**Decision (review's own "needs a decision, not just a patch"):** this plan keeps the `actions` passthrough in this PR rather than splitting it out — reverting it would re-break every already-shipped plugin's action buttons (`highlighter`, `text-to-speech`, `combat-compression`, `voice-dictation`, `weapon-flag-squelch`, `stun-highlight`, `colorkit`), which is a worse regression than the one line the review flagged. Instead: add the regression test the line was missing, and fix the misleading "✓ Synced" feedback so it only appears when a handler actually ran.

**Interfaces:**
- Consumes: `normalizePluginModule`, `IPluginModule`.
- Produces: `invokePluginAction(pluginId, actionKey): boolean` (changed from `void` — `true` when a handler was found and invoked, `false` otherwise). `PluginConfigModal.tsx` is the only other caller and is updated in the same task.

- [ ] **Step 1: Write the failing tests**

Create `apps/game-client/src/features/plugins/normalizePluginModule.test.ts`:

```ts
import { normalizePluginModule } from './normalizePluginModule';
import type { IPluginModule } from '@shatteredarchive/types-client';

function baseModule(overrides: Partial<IPluginModule> = {}): IPluginModule {
  return {
    manifest: { id: 'test', name: 'Test', version: '1.0.0' },
    configSchema: { defaults: {}, fields: [] },
    onEnable: () => () => {},
    ...overrides,
  } as IPluginModule;
}

describe('normalizePluginModule', () => {
  it('passes through a valid actions array unchanged', () => {
    const actions = [{ key: 'sync', label: 'Sync' }];
    const mod = baseModule({ configSchema: { defaults: {}, fields: [], actions } as any });
    expect(normalizePluginModule(mod).configSchema.actions).toEqual(actions);
  });

  it('drops a non-array actions value to undefined', () => {
    const mod = baseModule({ configSchema: { defaults: {}, fields: [], actions: 'not-an-array' } as any });
    expect(normalizePluginModule(mod).configSchema.actions).toBeUndefined();
  });

  it('leaves actions undefined when the field is absent', () => {
    const mod = baseModule();
    expect(normalizePluginModule(mod).configSchema.actions).toBeUndefined();
  });

  it('still passes through onAlias (the fix this file originally shipped for)', () => {
    const onAlias = () => true;
    const mod = baseModule({ onAlias });
    expect(normalizePluginModule(mod).onAlias).toBe(onAlias);
  });
});
```

Add to `pluginHost.test.ts`, as a new top-level `describe` block (this file's existing `makeProbe`/`PluginHost` constructor pattern, from the top of the file, is reused directly — no new helper needed):

```ts
describe('PluginHost.invokePluginAction', () => {
  it('returns true and calls the handler when one is registered', () => {
    const host = new PluginHost();
    const handler = jest.fn();
    const module: IPluginModule = {
      manifest: { id: 'action-probe', name: 'Action Probe', version: '1.0.0' },
      configSchema: { defaults: {}, fields: [] },
      onEnable(api: PluginRuntimeApi) {
        api.registerAction('sync', handler);
        return () => {};
      },
    } as IPluginModule;

    host.setConnection('dsl-mud');
    host.registerModule(module);
    host.syncInstalled([{ id: 'action-probe', enabled: true }]);

    const result = host.invokePluginAction('action-probe', 'sync');

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns false and does not throw when no handler is registered for the key', () => {
    const host = new PluginHost();
    const module: IPluginModule = {
      manifest: { id: 'action-probe-2', name: 'Action Probe 2', version: '1.0.0' },
      configSchema: { defaults: {}, fields: [] },
      onEnable() {
        return () => {};
      },
    } as IPluginModule;

    host.setConnection('dsl-mud');
    host.registerModule(module);
    host.syncInstalled([{ id: 'action-probe-2', enabled: true }]);

    const result = host.invokePluginAction('action-probe-2', 'nonexistent-key');

    expect(result).toBe(false);
  });

  it('returns false when the plugin was never enabled', () => {
    const host = new PluginHost();
    expect(host.invokePluginAction('never-enabled', 'sync')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- normalizePluginModule.test.ts pluginHost.test.ts`
Expected: the new `normalizePluginModule.test.ts` tests PASS already (the behavior they test already exists and is correct — this step is adding missing coverage, not fixing a bug there). The `invokePluginAction` "returns true"/"returns false" tests FAIL because the function currently returns `void`.

- [ ] **Step 3: Change `invokePluginAction` to report whether a handler ran**

In `pluginHost.ts` (lines 436-447):

```ts
  invokePluginAction(pluginId: PluginId, actionKey: string): boolean {
    if (!this.state) return false;
    const c = this.state.cleanups.get(pluginId);
    const handler = c?.actionHandlers?.get(actionKey);
    if (!handler) return false;
    try {
      handler();
      return true;
    } catch (err) {
      c?.api?.error('Action error', err);
      return false;
    }
  }
```

- [ ] **Step 4: Fix the misleading "✓ Synced" feedback in `PluginConfigModal.tsx`**

Change the state type (line 46):

```ts
  const [actionFeedback, setActionFeedback] = React.useState<Record<string, 'idle' | 'done' | 'error'>>({});
```

Change the click handler and label (lines 293-307):

```ts
                    onClick={() => {
                      const cleaned = Object.fromEntries(
                        Object.entries(draft).filter(([, v]) => v !== undefined),
                      ) as Record<string, unknown>;
                      pluginHost.updateEnabledPluginConfig(pluginId, cleaned);
                      const ran = pluginHost.invokePluginAction(pluginId, action.key);

                      setActionFeedback((prev) => ({ ...prev, [action.key]: ran ? 'done' : 'error' }));
                      clearTimeout(actionTimers.current[action.key]);
                      actionTimers.current[action.key] = setTimeout(() => {
                        setActionFeedback((prev) => ({ ...prev, [action.key]: 'idle' }));
                      }, 1500);
                    }}
                  >
                    {state === 'done' ? '✓ Synced' : state === 'error' ? 'No handler' : action.label}
```

(No new CSS class is needed — the `error` state reuses the existing `styles.secondaryButton` class via the unchanged `className={state === 'done' ? styles.actionButtonDone : styles.secondaryButton}` line, since only the label needs to change to stop misleading the user.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- normalizePluginModule.test.ts pluginHost.test.ts`
Expected: PASS, all tests.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit -p apps/game-client/tsconfig.json
npx eslint apps/game-client/src/features/plugins/normalizePluginModule.ts apps/game-client/src/features/plugins/normalizePluginModule.test.ts apps/game-client/src/features/plugins/pluginHost.ts apps/game-client/src/features/plugins/pluginHost.test.ts apps/game-client/src/components/PluginConfigModal.tsx
git add apps/game-client/src/features/plugins/normalizePluginModule.test.ts apps/game-client/src/features/plugins/pluginHost.ts apps/game-client/src/features/plugins/pluginHost.test.ts apps/game-client/src/components/PluginConfigModal.tsx
git commit -m "fix(plugins): regression test for actions passthrough + honest sync-button feedback (review 1.4)"
```

---

### Task 5: Block crafting-helper activity when character identity is unknown (review 1.5)

**Files:**
- Modify: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts` (`characterKey()` ~785-789, `handleImproveStart` ~1456, `handleOrderStart` ~1637, `handleOrderAdd` ~1500)
- Test: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts`

**Verified:** `characterKey()` (line 785-789) falls back to the sentinel `'__unknown__'` when `window.__SA_IDENTITY__.characterName` isn't set. Traced `__SA_IDENTITY__`'s only writer: `userScriptRuntime.ts`'s `setIdentitySnapshot` is called exactly once (line 769), only from GMCP `login_data`, with no disconnect/clear path anywhere in that file — confirmed via grep across the whole file. `characterKey()` has 16 call sites in `crafting-helper.plugin.ts`, three of which are the activity-starting/durable-write entry points this task guards (`handleImproveStart`, `handleOrderStart`, `handleOrderAdd`); the other 13 are read-only status/list/history commands, which already display whatever character is currently resolved and carry no corruption risk by themselves. **Also verified (critical for this task's test setup):** `crafting-helper.plugin.test.ts`'s `beforeEach` never sets `window.__SA_IDENTITY__`, no repo-wide jest setup file sets it either (confirmed: no `jest.setup.ts` exists for `game-client`, and grepping the whole repo for `__SA_IDENTITY__` inside any jest config/setup file returns nothing), and none of the ~60+ existing tests that already call `handleImproveStart`/`handleOrderStart`/`handleOrderAdd` set it themselves. This means every existing test exercising those three functions is *currently* running under the `'__unknown__'` sentinel today, and **will break the moment this task's guard lands** unless the shared `beforeEach` is updated in this same task — this is not a maybe, it is certain, so Step 1 below fixes it up front rather than deferring to "see what breaks."

**Interfaces:**
- Consumes: `characterKey()` (unchanged).
- Produces: nothing new exported; the three entry-point functions gain an early return.

- [ ] **Step 1: Give the test file a known identity by default, then write the failing tests for the unknown-identity case**

First, update the shared `beforeEach` (line 640-651) so every test in the file runs with a resolved character identity by default — this must happen in the same step as the guard itself, since (per Verified above) every existing start/order-add test currently runs under `'__unknown__'` and would otherwise break:

```ts
  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.clear();
    (window as unknown as { __SA_IDENTITY__?: { characterName?: string } }).__SA_IDENTITY__ = {
      characterName: 'testchar',
    };
    // The order queue is a module-level singleton keyed by character (see
    // crafting-helper-storage.ts) — localStorage.clear() alone doesn't reset
    // its in-memory state between tests in this file (unlike
    // crafting-helper-storage.test.ts, this file uses a static top-level
    // import of the plugin factory, so it can't use jest.resetModules() per
    // test without also losing that binding). Drain leftovers explicitly so
    // each order-mode test starts from an empty queue for 'testchar'.
    for (const o of getOrderQueue('testchar')) removeOrder('testchar', o.id);
  });
```

This changes the character key every other existing test implicitly reads/writes under from `'__unknown__'` to `'testchar'` — every existing test in the file that calls `getOrderQueue('__unknown__')`/`removeOrder('__unknown__', ...)`/`getCompletedOrders('__unknown__')` directly (not just through the plugin's own aliases) must have that literal changed to `'testchar'` too, since those are now two different storage buckets. Search the file for every occurrence of the literal `'__unknown__'` and replace it with `'testchar'` — this is a file-wide mechanical rename, not a judgment call: the two strings must always refer to the same character key `characterKey()` currently resolves to once this `beforeEach` sets an identity.

Then add the three new tests, each of which explicitly un-sets the identity for just that one test (so it doesn't rely on mutating shared `beforeEach` state in a way that leaks into the next test — each test's own `beforeEach` run resets `__SA_IDENTITY__` back to `'testchar'` before the *next* test body runs, so no manual restore is needed here):

```ts
  it('refuses to start improve mode when character identity is not yet known', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    delete (window as unknown as { __SA_IDENTITY__?: unknown }).__SA_IDENTITY__;

    expect(plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start')).toBe(true);

    expect(mock.terminalWrites.join('\n')).toContain('identity');
    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).toContain('state=idle');
  });

  it('refuses to start order mode when character identity is not yet known', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    delete (window as unknown as { __SA_IDENTITY__?: unknown }).__SA_IDENTITY__;

    expect(plugin.onAlias!(mock.api, 'crafthelper order start')).toBe(true);

    expect(mock.terminalWrites.join('\n')).toContain('identity');
  });

  it('refuses to queue an order when character identity is not yet known', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    delete (window as unknown as { __SA_IDENTITY__?: unknown }).__SA_IDENTITY__;

    expect(plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+")).toBe(true);

    expect(mock.terminalWrites.join('\n')).toContain('identity');
    expect(getOrderQueue('__unknown__')).toHaveLength(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: the three new tests FAIL — today's code proceeds to start/queue even under `'__unknown__'`, with no error message containing "identity". Every *other*, pre-existing test in the file should still PASS at this point (the `beforeEach`/`'__unknown__'`→`'testchar'` rename from the step above is a pure relabeling with no behavior guard yet attached).

- [ ] **Step 3: Add the guard to the three entry points**

In `handleImproveStart` (right after the `if (state !== 'idle') { ... }` block, before `const typeRow = resolveCraftType(...)`):

```ts
    if (state !== 'idle') {
      writeInfo(api, alreadyRunningMessage());
      return true;
    }
    if (characterKey() === '__unknown__') {
      writeError(
        api,
        'Character identity not yet known (no login data seen this session) — wait for the game to finish connecting, then retry. Storage is keyed by character, so starting now risks writing under the wrong name.',
      );
      return true;
    }
```

In `handleOrderStart` (same spot, right after its `if (state !== 'idle') { ... }` block, before `const queue = getOrderQueue(characterKey());`):

```ts
    if (state !== 'idle') {
      writeInfo(api, alreadyRunningMessage());
      return true;
    }
    if (characterKey() === '__unknown__') {
      writeError(
        api,
        'Character identity not yet known (no login data seen this session) — wait for the game to finish connecting, then retry. Storage is keyed by character, so starting now risks writing under the wrong name.',
      );
      return true;
    }
```

In `handleOrderAdd` (confirmed signature at line 1503: `function handleOrderAdd(api: PluginRuntimeApi, match: RegExpMatchArray): boolean {`), add the same guard immediately after that signature line, before quantity/quality parsing:

```ts
  function handleOrderAdd(api: PluginRuntimeApi, match: RegExpMatchArray): boolean {
    if (characterKey() === '__unknown__') {
      writeError(
        api,
        'Character identity not yet known (no login data seen this session) — wait for the game to finish connecting, then retry. Storage is keyed by character, so queuing now risks writing under the wrong name.',
      );
      return true;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: PASS, all new and existing tests. If any pre-existing test still fails, it's one Step 1's file-wide `'__unknown__'`→`'testchar'` rename missed (e.g. a literal inside a test-local helper or a string built via template literal rather than a plain string match) — find and fix that occurrence; do not weaken the guard to make it pass.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit -p apps/game-client/tsconfig.json
npx eslint apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git add apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git commit -m "fix(crafting-helper): refuse to start or queue orders when character identity is unknown (review 1.5)"
```

---

### Task 6: Split and trim the raw payload once per event (review 2.1, enables Task 8)

**Files:**
- Modify: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts` (`findCraftSkillLevel` ~620-629, `handleRawData` ~1170-1248)
- Test: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts`

**Verified:** `plain.split('\n')` appears 4 times inside `handleRawData` (confirmed via grep at the then-current lines 1194/1212/1230/1248) plus a 5th independent split inside `findCraftSkillLevel` (line 623) on a separately-passed string — all operating on data derived from the exact same `rawText` for a single incoming event.

**Interfaces:**
- Consumes: nothing new.
- Produces: `findCraftSkillLevel(input: string | string[], keyword: string): number | null` (signature widened, backward compatible — every existing call site and test passes a string, which still works unchanged). `handleRawData` gains a single `const lines: string[]` used by all four of its loops; Task 8 depends on this `lines` variable existing and reuses it in the crafting-state loop it rewrites.

- [ ] **Step 1: Write the failing test (the behavior-preservation regression from Review Focus #4)**

Add to the state-machine `describe` block — this pins the cross-payload skill-up case the surrounding code comment documents, so the refactor below cannot silently break it:

```ts
  it('still picks up a skill-up notice that arrives in a later payload than the success line (Review Focus #4)', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 1     Craft Rank: Apprentice Spellcrafter');
    jest.advanceTimersByTime(200);

    mock.feedLine('You were successful.'); // moves state to storing_trinket
    mock.feedLine('Your crafting skill has improved. (56)'); // arrives in a later payload

    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).toContain('skill=56');
  });
```

(If this exact scenario is already covered by an existing test elsewhere in the file, skip adding a duplicate — search for "skill has improved" and "storing_trinket" first and only add this if no equivalent test exists.)

- [ ] **Step 2: Run the test to confirm current behavior (should already PASS — this step proves the baseline, not a new failure)**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: PASS already (this is a regression pin, not a bug fix — the refactor in the next steps must keep it passing).

- [ ] **Step 3: Widen `findCraftSkillLevel` to accept a pre-split array**

Replace lines 620-629ish:

```ts
export function findCraftSkillLevel(input: string | string[], keyword: string): number | null {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return null;
  const lines = Array.isArray(input) ? input : input.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const m = line.match(SCORE_LINE_RE);
    if (m && m[2].trim().toLowerCase().includes(kw)) {
      return parseInt(m[1], 10);
    }
  }
  return null;
}
```

- [ ] **Step 4: Split and trim once in `handleRawData`, reuse everywhere**

Replace the opening of `handleRawData` (around line 1170-1174):

```ts
    const cfg = readConfig(api);
    const plain = stripAnsi(rawText).replace(/\r/g, '');
    const lines = plain.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    if (state === 'awaiting_score') {
      const level = findCraftSkillLevel(lines, activeCraftTypeRow?.keyword ?? '');
```

Replace the unconditional skill-up scan loop (around line 1194):

```ts
    for (const line of lines) {
      const improved = matchSkillImproved(line);
```

(Drop the now-redundant `const line = rawLine.trim(); if (!line) continue;` lines inside this loop and the next two — `lines` is already trimmed and non-empty.)

Replace the `pulling_components` loop (around line 1212):

```ts
    if (state === 'pulling_components') {
      for (const line of lines) {
        if (matchVaultFailure(line)) {
```

Replace the `checking_quality` loop (around line 1230):

```ts
    if (state === 'checking_quality') {
      for (const line of lines) {
        const quality = matchItemCondition(line);
```

Leave the final crafting-state loop (`// state === 'crafting'`, around line 1248) as a plain `for (const rawLine of plain.split('\n'))` **for this task only** — Task 8 is the one that rewrites it (it needs `lines` too, but also needs the outcome-ordering logic fix, so both changes land together there to avoid two tasks touching the exact same six lines independently).

- [ ] **Step 5: Run tests to verify they pass**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: PASS, all new and existing tests, including every `findCraftSkillLevel`-specific test (they still pass a plain string, which the widened signature still accepts).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit -p apps/game-client/tsconfig.json
npx eslint apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git add apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git commit -m "perf(crafting-helper): split and trim the raw payload once per event instead of 3-5 times (review 2.1)"
```

---

### Task 7: Three small mechanical correctness fixes (review 3.1, 3.4, 3.5)

**Files:**
- Modify: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts` (`parseQualityContainerMap` ~589-593, `goIdle` ~1045-1052, `handleOrderList` ~1589-1591)
- Test: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts`

**Verified:** all three independently confirmed against current source:
- `parseQualityContainerMap` (line 589-593) has no `min <= max` guard, unlike sibling `parseQualitySpec` (line ~523) which does.
- `goIdle` (line 1045-1052) sets `activeRecipe = null` but never `activeOrder = null`.
- `handleOrderList` (line 1589-1591) tags `queue[0]` as `[active]` using `i === 0 && mode === 'order' && state !== 'idle'`, with no check that `queue[0]` is actually the in-flight order — confirmed exploitable via `order remove <activeId>`, which splices the active order out of storage immediately while the engine keeps finishing its in-flight craft, leaving `queue[0]` as the *next* order during that window.

**Interfaces:**
- Consumes: `activeOrder` (closure variable, already in scope in both `goIdle` and `handleOrderList`).
- Produces: nothing new exported.

- [ ] **Step 1: Write the three failing tests**

```ts
describe('parseQualityContainerMap rejects an inverted range (review 3.1)', () => {
  it('drops a row where min > max instead of accepting a dead range', () => {
    const rows = parseQualityContainerMap('98-95|rare-vault');
    expect(rows).toHaveLength(0);
  });
});
```

Add to the state-machine `describe` block:

```ts
  it('clears activeOrder on stop so order status reports none instead of a stale order (review 3.4)', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');

    plugin.onAlias!(mock.api, 'crafthelper order stop');
    // Let the in-flight step finish so stopRequested is actually honored.
    jest.advanceTimersByTime(5000);

    expect(plugin.onAlias!(mock.api, 'crafthelper order status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).toContain('activeOrder=none');
  });

  it('only tags the truly in-flight order as [active], not whatever is now at queue[0] (review 3.5)', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    plugin.onAlias!(mock.api, "crafthelper order add 1 'opal gemstone' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start'); // starts fulfilling the first order

    // Task 5 (sequenced before this task) changes this file's default test
    // identity from '__unknown__' to 'testchar' — read from that bucket.
    const queueBeforeRemove = getOrderQueue('testchar');
    const activeId = queueBeforeRemove[0].id;
    plugin.onAlias!(mock.api, `crafthelper order remove ${activeId}`); // splices it out while still in-flight

    mock.terminalWrites.length = 0;
    plugin.onAlias!(mock.api, 'crafthelper order list');
    expect(mock.terminalWrites.join('\n')).not.toContain('[active]'); // the real active order is gone from storage; nothing left in queue is it
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: FAIL on all three.

- [ ] **Step 3: Fix `parseQualityContainerMap`**

Lines 589-593:

```ts
    const range = rangeStr.match(/^(\d+)-(\d+)$/);
    if (range) {
      const min = parseInt(range[1], 10);
      const max = parseInt(range[2], 10);
      if (min <= max) rows.push({ min, max, container });
      continue;
    }
```

- [ ] **Step 4: Fix `goIdle`**

Lines 1045-1052:

```ts
  function goIdle(api: PluginRuntimeApi, cfg: EngineConfig) {
    stopRequested = false;
    state = 'idle';
    activeRecipe = null;
    activeOrder = null;
    publishHud(api, cfg);
    writeInfo(api, 'Stopped.');
    releaseMaterials(api, cfg);
  }
```

- [ ] **Step 5: Fix `handleOrderList`**

Line 1589-1591:

```ts
    queue.forEach((o) => {
      const activeTag = o.id === activeOrder?.id && mode === 'order' && state !== 'idle' ? ' [active]' : '';
      writeInfo(api, `${o.id}: ${o.quantityRemaining}/${o.quantityTotal}x "${o.itemName}"${activeTag}`);
    });
```

(Drop the unused `i` parameter from the `forEach` callback since it's no longer referenced.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: PASS, all new and existing tests.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
npx tsc --noEmit -p apps/game-client/tsconfig.json
npx eslint apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git add apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git commit -m "fix(crafting-helper): reject inverted quality ranges, clear activeOrder on stop, fix [active] order tagging (review 3.1/3.4/3.5)"
```

---

### Task 8: Outcome-detection ordering bug + missing stopRequested checks (review 3.2, 3.3)

**Files:**
- Modify: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts` (crafting-state loop ~1246-1280, `onQualityTimeout` ~906-917, `onScoreTimeout` ~1305-1313)
- Test: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts`

**Verified:** in the crafting-state line loop, `matchCraftInterrupted`/`matchVaultFailure` run unconditionally on every line while `matchCraftOutcome` is gated behind `if (outcome === null)` — confirmed at source: a success detected on an earlier line in the same multi-line payload is silently discarded if a later line in that same payload matches `matchCraftInterrupted` or `matchVaultFailure`. `onScoreTimeout` (lines 1305-1313) and `onQualityTimeout` (lines 906-917) both call `enterError` unconditionally with no `stopRequested` check, confirmed by reading both functions in full; `onPullTimeout` (line 1107-1116) already has the check they're missing.

**Interfaces:**
- Consumes: `lines` array from Task 6 (this task is the one that finally rewrites the crafting-state loop to use it, per Task 6 Step 4's note).
- Produces: nothing new exported.

- [ ] **Step 1: Write the failing tests**

```ts
  it('does not let a late interrupted/vault-failure line in the same payload discard an already-detected success (review 3.2)', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');
    mock.feedLine('Craftskill: 1     Craft Rank: Apprentice Spellcrafter');
    jest.advanceTimersByTime(200);

    mock.sent.length = 0;
    mock.feedRaw('You were successful.\r\nYou stop crafting.\r\n');

    // A real success must still result in a `put`, not an error_stopped.
    expect(mock.sent.some((c) => c.startsWith('put'))).toBe(true);
    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).not.toContain('error_stopped');
  });

  it('goes cleanly idle, not error_stopped, if stop was requested while awaiting a score-rank line (review 3.3)', () => {
    const mock = createMockApi(defaultConfig({ scoreResponseTimeoutMs: 500 }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper improve spellcraft start');

    plugin.onAlias!(mock.api, 'crafthelper improve stop');
    jest.advanceTimersByTime(500);

    expect(plugin.onAlias!(mock.api, 'crafthelper improve status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).toContain('state=idle');
  });

  it('goes cleanly idle, not error_stopped, if stop was requested while awaiting a quality (lore) line (review 3.3)', () => {
    const mock = createMockApi(defaultConfig({ loreResponseTimeoutMs: 500 }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond gem pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200); // pull-confirm, both components
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.'); // -> checking_quality

    plugin.onAlias!(mock.api, 'crafthelper order stop');
    jest.advanceTimersByTime(500);

    expect(plugin.onAlias!(mock.api, 'crafthelper order status')).toBe(true);
    expect(mock.terminalWrites.at(-1)).toContain('state=idle');
  });
```

(The third test's timing is already correct for `diamond gem pain`'s real recipe — confirmed at `crafting-helper.plugin.ts:423`, `DIAMOND_SPECIAL_GEMS`'s `pain` entry has `extras: ['essence of pain']`, so the full recipe is `[diamond gemstone, essence of pain]`, exactly 2 components, matching the two `jest.advanceTimersByTime(200)` calls above.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: FAIL on all three.

- [ ] **Step 3: Fix the crafting-state loop (also finishes Task 6's deferred rewrite of this exact loop)**

Replace the `// state === 'crafting'` block (around line 1246-1280):

```ts
    // state === 'crafting'
    let outcome: CraftOutcome = null;
    for (const line of lines) {
      if (outcome !== null) continue; // success/failure already seen this payload — a later interrupted/vault-failure line here is stale noise, not a new event (review 3.2)

      // Something (a command, movement, being attacked) interrupted the
      // craft in progress — no outcome line will ever arrive, so stop
      // cleanly rather than wait forever or blindly re-craft.
      if (matchCraftInterrupted(line)) {
        clearAllTimers();
        const resumeCmd =
          mode === 'order' ? 'crafthelper order start' : `crafthelper improve ${activeCraftTypeRow?.verb ?? activeCraftTypeRow?.id ?? '<craftType>'} start`;
        writeInfo(api, `Crafting was interrupted ("You stop crafting.") — stopping. Run \`${resumeCmd}\` to resume.`);
        goIdle(api, cfg);
        return;
      }

      // A `get` that failed can be reported after pullConfirmTimeoutMs has
      // already elapsed (the pull step assumes silence means success), by
      // which point the craft command is out and we're in 'crafting'. That
      // late failure must still stop the script, not be ignored.
      if (matchVaultFailure(line)) {
        const needs = activeRecipe?.components.map((c) => `${c.material}:${c.qty}`).join(', ');
        enterError(api, cfg, `Vault ran out of components for "${activeRecipe?.outputName}" (needs ${needs}) — restock needed.`);
        return;
      }

      const m = matchCraftOutcome(line);
      if (m) outcome = m;
    }

    if (outcome === null) return; // keep waiting for the craft-response timeout, or a recognized line

    if (craftTimer) {
      clearTimeout(craftTimer);
      craftTimer = null;
    }

    if (session) session.craftAttempts += 1;
```

(This supersedes both the Task 1 Step 6 edit and the old `plain.split('\n')` loop Task 6 deliberately left untouched — they're the same code region, and this is the task that finishes it. The `if (craftTimer) {...}` block carried over from Task 1 Step 6 stays exactly as Task 1 left it; only the loop above it changes.)

- [ ] **Step 4: Fix `onScoreTimeout`**

Lines 1305-1313:

```ts
  function onScoreTimeout(api: PluginRuntimeApi) {
    scoreTimer = null;
    const cfg = readConfig(api);
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    enterError(
      api,
      cfg,
      `Could not find a "${activeCraftTypeRow?.keyword}" line in score output within ${cfg.scoreResponseTimeoutMs}ms — is that craft trained on this character?`,
    );
  }
```

- [ ] **Step 5: Fix `onQualityTimeout`**

Lines 906-917:

```ts
  function onQualityTimeout(api: PluginRuntimeApi) {
    qualityTimer = null;
    const cfg = readConfig(api);
    // The craft succeeded, so don't leave the item in inventory: with no
    // quality reading there's no better home than the default (vault).
    if (activeRecipe) api.sendCommand(`put 1 '${activeRecipe.outputName}' vault`);
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    enterError(
      api,
      cfg,
      `Couldn't verify quality of "${activeRecipe?.outputName}" within ${cfg.loreResponseTimeoutMs}ms — stopped rather than guess where to route it; put it in the vault.`,
    );
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: PASS, all new and existing tests.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
npx tsc --noEmit -p apps/game-client/tsconfig.json
npx eslint apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git add apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git commit -m "fix(crafting-helper): fix outcome-detection ordering bug, add stopRequested checks to score/quality timeouts (review 3.2/3.3)"
```

---

### Task 9: Extract a shared per-character list-store helper (review 3.7 part, review 3.8)

**Files:**
- Modify: `apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts` (order-queue section ~82-180, completed-order-history section ~181-252)
- Test: `apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.test.ts`

**Verified:** the order-queue (lines 106-179) and completed-order-history (lines 199-252) sections of `crafting-helper-storage.ts` are structurally identical — each independently reimplements "one localStorage array per character, lazy-loaded on first access, 400ms debounce-persisted" with its own `Map`, loaded-`Set`, and timer-`Map` — differing only in storage-key prefix and the optional max-entries cap. `getOrderQueue`/`getCompletedOrders` (lines 146, 241) each do `[...(store.get(characterKey) ?? [])]` — a shallow copy of the outer array only; the `StoredCraftOrder`/`CompletedCraftOrder` objects inside are the same references held in the internal `Map` (review 3.8).

**Interfaces:**
- Consumes: nothing external.
- Produces: `getOrderQueue`, `addOrder`, `removeOrder`, `updateOrder`, `getCompletedOrders`, `addCompletedOrder` — **unchanged signatures and unchanged localStorage key formats** (`shatteredarchive.plugins.crafting-helper.orders.${characterKey}` and `shatteredarchive.plugins.crafting-helper.orderHistory.${characterKey}`), so existing persisted data from the already-shipped v1.0.0 release round-trips correctly. This is purely an internal refactor — no caller in `crafting-helper.plugin.ts` changes.

- [ ] **Step 1: Write the failing test for the copy-depth fix (Review Focus #5)**

Add to `crafting-helper-storage.test.ts`'s existing order-queue `describe` block:

```ts
  it('returns a deep-enough copy that mutating a returned order does not corrupt what is persisted (Review Focus #5)', () => {
    addOrder('alice', { id: 'o1', itemName: 'diamond gem pain', quantityRemaining: 1, quantityTotal: 1, qualitySpec: { kind: 'atLeast', min: 97 }, createdAt: Date.now() });

    const first = getOrderQueue('alice');
    first[0].quantityRemaining = 999; // mutate the returned object directly

    const second = getOrderQueue('alice');
    expect(second[0].quantityRemaining).toBe(1); // unaffected by the mutation above
  });
```

(Add the equivalent test to the completed-order-history `describe` block too, using `addCompletedOrder`/`getCompletedOrders`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper-storage.test.ts`
Expected: FAIL — today's shallow copy means the mutation in `first[0]` is visible in `second[0]` too (same object reference).

- [ ] **Step 3: Add the shared factory and rewrite both sections to use it**

Replace the entire order-queue section (`StoredQualitySpec` interface and `StoredCraftOrder` interface stay exactly as-is; everything from `const orderQueues: Map<...>` through `updateOrder`'s closing brace, lines ~106-179) and the entire completed-order-history section (`CompletedCraftOrder` interface stays exactly as-is; everything from `const completedOrders: Map<...>` through `addCompletedOrder`'s closing brace, lines ~199-252) with:

```ts
// ── Shared per-character list-store helper ────────────────────────────────
// Order queue and completed-order history are both "one localStorage array
// per character, lazy-loaded on first access, debounce-persisted" — this
// factory shares that load/persist logic while giving each caller its own
// isolated Map/Set/timer state (review 3.7). `list()` returns a copy of
// each item, not just of the outer array, so a caller mutating a returned
// object can never corrupt what's persisted (review 3.8).
function createPerCharacterListStore<T extends object>(storageKeyPrefix: string, maxEntries?: number) {
  const store: Map<string, T[]> = new Map();
  const loadedKeys: Set<string> = new Set();
  const persistTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  function storageKey(characterKey: string): string {
    return `${storageKeyPrefix}.${characterKey}`;
  }

  function ensureLoaded(characterKey: string) {
    if (loadedKeys.has(characterKey)) return;
    loadedKeys.add(characterKey);
    try {
      if (typeof window === 'undefined') return;
      const raw = window.localStorage.getItem(storageKey(characterKey));
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) store.set(characterKey, arr as T[]);
    } catch {
      // ignore corrupt storage
    }
  }

  function persist(characterKey: string) {
    const existing = persistTimers.get(characterKey);
    if (existing) clearTimeout(existing);
    persistTimers.set(
      characterKey,
      setTimeout(() => {
        persistTimers.delete(characterKey);
        try {
          if (typeof window === 'undefined') return;
          const list = store.get(characterKey) ?? [];
          window.localStorage.setItem(storageKey(characterKey), JSON.stringify(list));
        } catch {
          // ignore
        }
      }, PERSIST_DELAY_MS),
    );
  }

  return {
    list(characterKey: string): T[] {
      ensureLoaded(characterKey);
      return (store.get(characterKey) ?? []).map((item) => ({ ...item }));
    },
    append(characterKey: string, item: T): void {
      ensureLoaded(characterKey);
      const next = [...(store.get(characterKey) ?? []), item];
      const trimmed = maxEntries && next.length > maxEntries ? next.slice(next.length - maxEntries) : next;
      store.set(characterKey, trimmed);
      persist(characterKey);
    },
    removeWhere(characterKey: string, predicate: (item: T) => boolean): boolean {
      ensureLoaded(characterKey);
      const queue = store.get(characterKey) ?? [];
      const idx = queue.findIndex(predicate);
      if (idx === -1) return false;
      const next = [...queue];
      next.splice(idx, 1);
      store.set(characterKey, next);
      persist(characterKey);
      return true;
    },
    updateWhere(characterKey: string, predicate: (item: T) => boolean, patch: Partial<T>): void {
      ensureLoaded(characterKey);
      const queue = store.get(characterKey) ?? [];
      const idx = queue.findIndex(predicate);
      if (idx === -1) return;
      const next = [...queue];
      next[idx] = { ...next[idx], ...patch };
      store.set(characterKey, next);
      persist(characterKey);
    },
  };
}

// ── Order queue store ────────────────────────────────────────────────────

export type StoredQualitySpec =
  | { kind: 'atLeast'; min: number }
  | { kind: 'exact'; value: number }
  | { kind: 'range'; min: number; max: number };

export interface StoredCraftOrder {
  id: string;
  itemName: string;
  quantityRemaining: number;
  quantityTotal: number;
  qualitySpec: StoredQualitySpec;
  createdAt: number; // ms epoch
  materialsUsed?: Record<string, number>;
}

const orderQueueStore = createPerCharacterListStore<StoredCraftOrder>('shatteredarchive.plugins.crafting-helper.orders');

export function getOrderQueue(characterKey: string): StoredCraftOrder[] {
  return orderQueueStore.list(characterKey);
}

export function addOrder(characterKey: string, order: StoredCraftOrder): void {
  orderQueueStore.append(characterKey, order);
}

export function removeOrder(characterKey: string, orderId: string): boolean {
  return orderQueueStore.removeWhere(characterKey, (o) => o.id === orderId);
}

export function updateOrder(characterKey: string, orderId: string, patch: Partial<StoredCraftOrder>): void {
  orderQueueStore.updateWhere(characterKey, (o) => o.id === orderId, patch);
}

// ── Completed order history ───────────────────────────────────────────────
// A lookup convenience, not a full audit log — unbounded growth isn't worth
// it, so only the most recent entries are kept.
const MAX_COMPLETED_ORDERS = 50;

export interface CompletedCraftOrder {
  id: string;
  itemName: string;
  quantityTotal: number;
  qualitySpec: StoredQualitySpec;
  materialsUsed: Record<string, number>;
  createdAt: number; // ms epoch — when the order was originally queued
  completedAt: number; // ms epoch
}

const completedOrdersStore = createPerCharacterListStore<CompletedCraftOrder>(
  'shatteredarchive.plugins.crafting-helper.orderHistory',
  MAX_COMPLETED_ORDERS,
);

export function getCompletedOrders(characterKey: string): CompletedCraftOrder[] {
  return completedOrdersStore.list(characterKey);
}

export function addCompletedOrder(characterKey: string, record: CompletedCraftOrder): void {
  completedOrdersStore.append(characterKey, record);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper-storage.test.ts`
Expected: PASS, every pre-existing test in the file (round-trip, debounce-coalescing, per-character isolation, 50-entry cap, corrupt-storage fallback) plus the two new copy-depth tests — the pre-existing tests must pass unchanged, since this task preserves storage key formats and every function's external behavior exactly.

Also re-run the plugin test file, since it calls these functions extensively:

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: PASS, unchanged.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit -p apps/game-client/tsconfig.json
npx eslint apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.test.ts
git add apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.test.ts
git commit -m "refactor(crafting-helper): extract shared per-character list-store helper, fix shallow-copy aliasing (review 3.7/3.8)"
```

---

### Task 10: Remove dead `containerForQuality` helper, cap the skill-levels store (review 3.7 part)

**Files:**
- Modify: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts` (remove `containerForQuality`, ~611-613)
- Modify: `apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts` (skill-levels section ~8-80)
- Test: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts`, `apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.test.ts`

**Verified:** `containerForQuality` (line 611-613, `matchQualityContainer(quality, rows) ?? 'vault'`) has exactly one caller in the whole repo — its own test block — confirmed via grep; production code (`resolveOrderQuality`, line 933-934) calls `matchQualityContainer` directly and combines it with additional `inSpec` logic `containerForQuality` doesn't have, so the two were never actually interchangeable in production despite looking like duplicates — the review's "two implementations can drift apart" risk is resolved by deleting the one nothing calls, not by trying to unify them (there's nothing to unify: production never needed the simpler version). Separately: `crafting-helper-storage.ts`'s skill-levels `db` (line 20, already `const` after the v1.0.0 lint fix) has no size cap, unlike `peopleDb.ts` in the same directory (`MAX_PEOPLE = 3000` / `TRIM_TO = 2500`, trimmed by `lastSeen` descending, confirmed at `peopleDb.ts:11-12,51-55`).

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new exported; `containerForQuality` export is removed (breaking change only for a direct importer — confirmed none exist outside its own test file).

- [ ] **Step 1: Remove `containerForQuality` and its test**

Delete lines 611-613 in `crafting-helper.plugin.ts`:

```ts
export function containerForQuality(quality: number, rows: QualityContainerRow[]): string {
  return matchQualityContainer(quality, rows) ?? 'vault';
}
```

Remove `containerForQuality` from the test file's import list, and delete every `it(...)` block inside `describe('parseQualityContainerMap / containerForQuality', ...)` that calls `containerForQuality` directly (keep the `describe` block's `parseQualityContainerMap`-only tests, including the Task 7-added inverted-range test — only remove the `containerForQuality`-specific assertions).

- [ ] **Step 2: Run tests to verify the removal is clean**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts`
Expected: PASS — no test references `containerForQuality` anymore, and `tsc --noEmit` (next step) confirms no stray import.

- [ ] **Step 3: Write the failing test for the skill-levels cap**

Add to `crafting-helper-storage.test.ts`'s skill-levels `describe` block:

```ts
  it('trims the oldest entries once the skill-levels store exceeds its cap', () => {
    for (let i = 0; i < 510; i++) {
      setTrackedSkillLevel(`char${i}`, 'spellcrafting', i);
    }
    // The earliest-written entries (oldest updatedAt) should have been evicted.
    expect(getTrackedSkillLevel('char0', 'spellcrafting')).toBeNull();
    // Recently-written entries survive.
    expect(getTrackedSkillLevel('char509', 'spellcrafting')).toBe(509);
  });
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper-storage.test.ts`
Expected: FAIL — `char0`'s entry is still present (no cap exists yet).

- [ ] **Step 5: Add the cap**

In `crafting-helper-storage.ts`, right after `const DB_STORAGE_KEY = ...;` (line 8):

```ts
const DB_STORAGE_KEY = 'shatteredarchive.plugins.crafting-helper.skillLevels';
// Cap on retained skill-level entries. Cardinality here is naturally small
// (characters × craft types), but mirrors peopleDb.ts's cap in this same
// directory for the same reason: bound the per-persist JSON cost rather
// than assume growth never happens (review 3.7). Evicts by oldest
// updatedAt first.
const MAX_SKILL_ENTRIES = 500;
const TRIM_SKILL_ENTRIES_TO = 400;
```

Add a trim function right after `compositeKey` (around line 25):

```ts
function trimSkillEntriesIfNeeded(): void {
  if (db.size <= MAX_SKILL_ENTRIES) return;
  const byUpdatedAsc = [...db.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  const toRemove = byUpdatedAsc.slice(0, db.size - TRIM_SKILL_ENTRIES_TO);
  for (const [key] of toRemove) db.delete(key);
}
```

Call it from `setTrackedSkillLevel` (around line 76-80):

```ts
export function setTrackedSkillLevel(characterKey: string, craftTypeId: string, level: number): void {
  ensureLoaded();
  db.set(compositeKey(characterKey, craftTypeId), { level, updatedAt: Date.now() });
  trimSkillEntriesIfNeeded();
  persist();
}
```

(This mutates `db` in place via `.delete()` rather than reassigning it, so `db` stays declared `const` — reassigning it would reintroduce the exact `prefer-const` lint violation the v1.0.0 pass already fixed.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper-storage.test.ts crafting-helper.plugin.test.ts`
Expected: PASS, all tests.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
npx tsc --noEmit -p apps/game-client/tsconfig.json
npx eslint apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.test.ts
git add apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.test.ts
git commit -m "chore(crafting-helper): remove dead containerForQuality helper, cap the skill-levels store (review 3.7)"
```

---

### Task 11: Refresh `.annotated` for the core-plugins directory (review 3.6)

**Files:**
- Modify: `apps/game-client/src/features/plugins/core-plugins/.annotated`

**Verified:** `.annotated` in this directory has zero entries for any of the 4 crafting-helper files (confirmed via grep — no match for "crafting-helper" anywhere in the file), a direct violation of this repo's `CLAUDE.md` AI-context-index rule, which the review calls out by name.

**Interfaces:**
- Consumes: nothing.
- Produces: nothing — documentation-only change.

- [ ] **Step 1: Insert the four new entries alphabetically**

In `apps/game-client/src/features/plugins/core-plugins/.annotated`, insert the following block between the existing `/combat-compression.plugin.ts` entry and the existing `/disarm.plugin.ts` entry (matching this file's established convention of listing a plugin's main file immediately before its own test file, confirmed from the existing `/world-time-and-identity.plugin.ts` → `/world-time-and-identity.plugin.test.ts` pair at the file's tail):

```
/crafting-helper.plugin.ts
Purpose: Automates tier-3 crafting via two modes behind one config-driven state machine — Improve (auto-escalating skill-up training across all 5 craft skills) and Order (fulfills queued multi-component item/armor-set requests at a target quality, checked via `lore` and tracked to completion with per-order material-spend history). Commands via `crafthelper`/`crh` aliases; full syntax lives in `crafthelper help`, not the (deliberately terse) plugin manifest description.

/crafting-helper.plugin.test.ts
Purpose: State-machine integration tests (score → pull → craft → outcome branches, tier escalation, order-mode recipe/set resolution, quality routing, materials tracking, every in-game command) plus pure-function unit tests for the tier/recipe/quality-spec parsers and the order-id/materials-summary formatters.

/crafting-helper-storage.ts
Purpose: Per-character persisted storage for tracked craft-skill levels, the queued-order list, and completed-order history — lazy-loaded from and debounce-persisted to localStorage, mirroring peopleDb.ts's pattern in this same directory via a shared per-character list-store helper.

/crafting-helper-storage.test.ts
Purpose: Round-trip get/set, debounce-coalescing, per-character isolation, size-cap trimming, and corrupt-storage fallback for the skill-level store, order queue, and completed-order history.

```

(Keep the existing blank-line-separated format exactly; do not alter any other entry in the file.)

- [ ] **Step 2: Commit**

```bash
git add apps/game-client/src/features/plugins/core-plugins/.annotated
git commit -m "docs(crafting-helper): add .annotated entries for the 4 crafting-helper files (review 3.6)"
```

---

## Final Verification (run once, after all 11 tasks)

```bash
npx tsc --noEmit -p apps/game-client/tsconfig.json
npx eslint apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.test.ts apps/game-client/src/features/plugins/normalizePluginModule.ts apps/game-client/src/features/plugins/normalizePluginModule.test.ts apps/game-client/src/features/plugins/pluginHost.ts apps/game-client/src/features/plugins/pluginHost.test.ts apps/game-client/src/components/PluginConfigModal.tsx
NODE_OPTIONS="--max-old-space-size=6144" pnpm --filter @shatteredarchive/game-client test -- crafting-helper.plugin.test.ts crafting-helper-storage.test.ts normalizePluginModule.test.ts pluginHost.test.ts
pnpm --filter @shatteredarchive/game-client build
```

All four must be clean/green before pushing. Then follow `superpowers:finishing-a-development-branch` against the existing `worktree-crafting-helper` branch (base: `release/dev`, remote: `fork`) — since PR #160 already exists for this branch, "push" here means pushing these new commits to the already-open PR, not opening a second one.
