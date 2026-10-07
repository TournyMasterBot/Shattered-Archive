# Crafting Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "order mode" to the Crafting Helper plugin — a persisted FIFO queue of player-defined item orders, fulfilled by pulling multi-component recipes from the vault, crafting, checking quality via `lore`, and routing the result — alongside the existing, already-shipped improve/skill-up mode.

**Architecture:** Generalize the existing single-material trinket recipe into a `ResolvedRecipe` (an output name + a list of named components), so the same pull-loop/craft/outcome state machine drives both modes. Order mode plugs into the two extension seams (`resolveNextRecipe`, `handleCraftSuccess`) the original implementation deliberately isolated for this. A hardcoded `ORDER_ITEM_RECIPES` table supplies order-item recipes; a new persisted order queue (mirroring the existing skill-level tracker's storage pattern) holds orders per character.

**Tech Stack:** TypeScript, Jest (`jest.useFakeTimers()`), existing `PluginRuntimeApi`/`IPluginModule` plugin conventions in this repo.

**Spec:** `docs/superpowers/specs/2026-09-17-crafting-orders-design.md`

## Global Constraints

- All new alias commands use the `crafthelper` prefix (never bare `craft` or `order`) — confirmed necessary to avoid colliding with the game's own verbs.
- `api.getConfig()` must be read fresh in every handler, never cached (`plugin-authoring.md` §4).
- Line matching happens on `stripAnsi(rawText).split('\n')`, trimmed, matched per-line as a complete string — never a multiline/`$`-anchored regex against the raw payload (`plugin-authoring.md` §5B).
- `ORDER_ITEM_RECIPES` is a hardcoded source constant, **not** a config field — explicit decision, the user does not want to maintain/override it.
- The `Condition:` quality regex and its exact wording are unverified against a real log corpus (same caveat the original outcome-text patterns carried) — flag this in the plugin's manifest description, not just a comment.
- Never interrupt an in-flight command — `stopRequested`/order-removal checks only ever happen at a step boundary (start of a pull, after a no-loss/destroyed decision), matching the existing `crafthelper stop` discipline.

---

### Task 1: Order queue storage

**Files:**
- Modify: `apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts`
- Test: `apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.test.ts`

**Interfaces:**
- Consumes: nothing new (existing `PERSIST_DELAY_MS` constant, already defined at the top of the file, is reused).
- Produces: `StoredQualitySpec`, `StoredCraftOrder`, `getOrderQueue(characterKey): StoredCraftOrder[]`, `addOrder(characterKey, order: StoredCraftOrder): void`, `removeOrder(characterKey, orderId): boolean`, `updateOrder(characterKey, orderId, patch: Partial<StoredCraftOrder>): void` — all exported from `crafting-helper-storage.ts`, consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Append to `crafting-helper-storage.test.ts` (after the existing `describe('crafting-helper-storage persistence', ...)` block, same file, same `freshStorage()` helper already defined at the top):

```ts
describe('crafting-helper-storage order queue', () => {
  it('adds orders in FIFO order and lists them back', () => {
    const { addOrder, getOrderQueue } = freshStorage();
    addOrder('grondak', {
      id: 'order-1',
      itemName: 'diamond of pain',
      quantityRemaining: 6,
      quantityTotal: 6,
      qualitySpec: { kind: 'atLeast', min: 97 },
      createdAt: 1,
    });
    addOrder('grondak', {
      id: 'order-2',
      itemName: 'silksteel cloth helmet',
      quantityRemaining: 2,
      quantityTotal: 2,
      qualitySpec: { kind: 'exact', value: 99 },
      createdAt: 2,
    });

    const queue = getOrderQueue('grondak');
    expect(queue.map((o) => o.id)).toEqual(['order-1', 'order-2']);
  });

  it('removes an order by id and reports whether it found one', () => {
    const { addOrder, removeOrder, getOrderQueue } = freshStorage();
    addOrder('grondak', {
      id: 'order-1',
      itemName: 'diamond of pain',
      quantityRemaining: 6,
      quantityTotal: 6,
      qualitySpec: { kind: 'atLeast', min: 97 },
      createdAt: 1,
    });

    expect(removeOrder('grondak', 'not-there')).toBe(false);
    expect(removeOrder('grondak', 'order-1')).toBe(true);
    expect(getOrderQueue('grondak')).toEqual([]);
  });

  it('updates fields on an existing order in place', () => {
    const { addOrder, updateOrder, getOrderQueue } = freshStorage();
    addOrder('grondak', {
      id: 'order-1',
      itemName: 'diamond of pain',
      quantityRemaining: 6,
      quantityTotal: 6,
      qualitySpec: { kind: 'atLeast', min: 97 },
      createdAt: 1,
    });

    updateOrder('grondak', 'order-1', { quantityRemaining: 5 });
    expect(getOrderQueue('grondak')[0].quantityRemaining).toBe(5);
  });

  it('isolates order queues per character', () => {
    const { addOrder, getOrderQueue } = freshStorage();
    addOrder('grondak', {
      id: 'order-1',
      itemName: 'diamond of pain',
      quantityRemaining: 6,
      quantityTotal: 6,
      qualitySpec: { kind: 'atLeast', min: 97 },
      createdAt: 1,
    });
    expect(getOrderQueue('riaghan')).toEqual([]);
  });

  it('round-trips the queue through a fresh module instance, debounced', () => {
    const first = freshStorage();
    first.addOrder('grondak', {
      id: 'order-1',
      itemName: 'diamond of pain',
      quantityRemaining: 6,
      quantityTotal: 6,
      qualitySpec: { kind: 'atLeast', min: 97 },
      createdAt: 1,
    });
    jest.advanceTimersByTime(500);

    const second = freshStorage();
    expect(second.getOrderQueue('grondak')).toHaveLength(1);
    expect(second.getOrderQueue('grondak')[0].itemName).toBe('diamond of pain');
  });

  it('falls back to an empty queue on corrupt localStorage rather than throwing', () => {
    window.localStorage.setItem('shatteredarchive.plugins.crafting-helper.orders.grondak', '{not valid json');
    const { getOrderQueue } = freshStorage();
    expect(() => getOrderQueue('grondak')).not.toThrow();
    expect(getOrderQueue('grondak')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/game-client && npx jest --config ../../jest.config.cjs --runInBand --testPathPatterns "apps/game-client.*crafting-helper-storage"`
Expected: FAIL — `addOrder`/`getOrderQueue`/`removeOrder`/`updateOrder` are not exported yet.

- [ ] **Step 3: Implement the order queue store**

Append to `crafting-helper-storage.ts` (after the existing skill-level `setTrackedSkillLevel` export at the bottom of the file — leave everything above it untouched):

```ts
// ── Order queue store ────────────────────────────────────────────────────
// One localStorage entry per character (not a shared keyed map like skill
// levels above) since each entry is itself an ordered array — the FIFO
// order among a character's orders IS the array order, so there's nothing
// to key by beyond the character.

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
}

const orderQueues: Map<string, StoredCraftOrder[]> = new Map();
const ordersLoaded: Set<string> = new Set();
const orderPersistTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

function orderStorageKey(characterKey: string): string {
  return `shatteredarchive.plugins.crafting-helper.orders.${characterKey}`;
}

function ensureOrdersLoaded(characterKey: string) {
  if (ordersLoaded.has(characterKey)) return;
  ordersLoaded.add(characterKey);
  try {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(orderStorageKey(characterKey));
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) orderQueues.set(characterKey, arr as StoredCraftOrder[]);
  } catch {
    // ignore corrupt storage
  }
}

function persistOrders(characterKey: string) {
  const existing = orderPersistTimers.get(characterKey);
  if (existing) clearTimeout(existing);
  orderPersistTimers.set(
    characterKey,
    setTimeout(() => {
      orderPersistTimers.delete(characterKey);
      try {
        if (typeof window === 'undefined') return;
        const queue = orderQueues.get(characterKey) ?? [];
        window.localStorage.setItem(orderStorageKey(characterKey), JSON.stringify(queue));
      } catch {
        // ignore
      }
    }, PERSIST_DELAY_MS),
  );
}

export function getOrderQueue(characterKey: string): StoredCraftOrder[] {
  ensureOrdersLoaded(characterKey);
  return orderQueues.get(characterKey) ?? [];
}

export function addOrder(characterKey: string, order: StoredCraftOrder): void {
  ensureOrdersLoaded(characterKey);
  const queue = [...(orderQueues.get(characterKey) ?? []), order];
  orderQueues.set(characterKey, queue);
  persistOrders(characterKey);
}

export function removeOrder(characterKey: string, orderId: string): boolean {
  ensureOrdersLoaded(characterKey);
  const queue = orderQueues.get(characterKey) ?? [];
  const idx = queue.findIndex((o) => o.id === orderId);
  if (idx === -1) return false;
  const next = [...queue];
  next.splice(idx, 1);
  orderQueues.set(characterKey, next);
  persistOrders(characterKey);
  return true;
}

export function updateOrder(characterKey: string, orderId: string, patch: Partial<StoredCraftOrder>): void {
  ensureOrdersLoaded(characterKey);
  const queue = orderQueues.get(characterKey) ?? [];
  const idx = queue.findIndex((o) => o.id === orderId);
  if (idx === -1) return;
  const next = [...queue];
  next[idx] = { ...next[idx], ...patch };
  orderQueues.set(characterKey, next);
  persistOrders(characterKey);
}
```

Note `PERSIST_DELAY_MS` is the existing module-level constant (`400`) already declared near the top of this file for the skill-level store — reuse it, do not redeclare it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/game-client && npx jest --config ../../jest.config.cjs --runInBand --testPathPatterns "apps/game-client.*crafting-helper-storage"`
Expected: PASS, all tests in both `describe` blocks green.

- [ ] **Step 5: Commit**

```bash
git add apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper-storage.test.ts
git commit -m "feat(crafting-helper): add persisted per-character order queue storage"
```

---

### Task 2: Order-mode pure functions and data

**Files:**
- Modify: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts`
- Test: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (this task is pure functions and data only, no wiring into the state machine yet).
- Produces (all exported from `crafting-helper.plugin.ts`, consumed by Task 4):
  - `export interface RecipeComponent { material: string; qty: number }`
  - `export type QualitySpec = { kind: 'atLeast'; min: number } | { kind: 'exact'; value: number } | { kind: 'range'; min: number; max: number }`
  - `export function parseQualitySpec(raw: string): QualitySpec | null`
  - `export function qualityMatchesSpec(quality: number, spec: QualitySpec): boolean`
  - `export function matchItemCondition(line: string): number | null`
  - `export interface QualityContainerRow { min: number; max: number; container: string }`
  - `export function parseQualityContainerMap(raw: unknown): QualityContainerRow[]`
  - `export function containerForQuality(quality: number, rows: QualityContainerRow[]): string`
  - `export interface OrderItemRecipe { craftTypeId: string; components: RecipeComponent[] }`
  - `export const ORDER_ITEM_RECIPES: Record<string, OrderItemRecipe>`

- [ ] **Step 1: Write the failing tests**

Add to `crafting-helper.plugin.test.ts`, in the "Pure function tests" section (after the existing `describe('buildHudContent', ...)` block, before the `// ── State-machine integration tests ──` comment). First, add these names to the existing `import { ... } from './crafting-helper.plugin';` block at the top of the file:

```ts
  parseQualitySpec,
  qualityMatchesSpec,
  matchItemCondition,
  parseQualityContainerMap,
  containerForQuality,
  ORDER_ITEM_RECIPES,
```

Then add:

```ts
describe('parseQualitySpec', () => {
  it('parses an "at least" spec', () => {
    expect(parseQualitySpec('97+')).toEqual({ kind: 'atLeast', min: 97 });
  });

  it('parses an exact spec', () => {
    expect(parseQualitySpec('99')).toEqual({ kind: 'exact', value: 99 });
  });

  it('parses a range spec', () => {
    expect(parseQualitySpec('95-98')).toEqual({ kind: 'range', min: 95, max: 98 });
  });

  it('rejects an inverted range', () => {
    expect(parseQualitySpec('98-95')).toBeNull();
  });

  it('rejects garbage input', () => {
    expect(parseQualitySpec('high quality')).toBeNull();
    expect(parseQualitySpec('')).toBeNull();
  });
});

describe('qualityMatchesSpec', () => {
  it('matches "at least" at and above the minimum', () => {
    const spec = { kind: 'atLeast' as const, min: 97 };
    expect(qualityMatchesSpec(97, spec)).toBe(true);
    expect(qualityMatchesSpec(100, spec)).toBe(true);
    expect(qualityMatchesSpec(96, spec)).toBe(false);
  });

  it('matches "exact" only at the value', () => {
    const spec = { kind: 'exact' as const, value: 99 };
    expect(qualityMatchesSpec(99, spec)).toBe(true);
    expect(qualityMatchesSpec(98, spec)).toBe(false);
    expect(qualityMatchesSpec(100, spec)).toBe(false);
  });

  it('matches "range" inclusive at both ends', () => {
    const spec = { kind: 'range' as const, min: 95, max: 98 };
    expect(qualityMatchesSpec(95, spec)).toBe(true);
    expect(qualityMatchesSpec(98, spec)).toBe(true);
    expect(qualityMatchesSpec(94, spec)).toBe(false);
    expect(qualityMatchesSpec(99, spec)).toBe(false);
  });
});

describe('matchItemCondition', () => {
  it('extracts the quality percentage', () => {
    expect(matchItemCondition('Condition: flawless (97%)')).toBe(97);
  });

  it('returns null for unrelated text', () => {
    expect(matchItemCondition('You were successful.')).toBeNull();
  });
});

describe('parseQualityContainerMap / containerForQuality', () => {
  it('parses range rows and single-value rows', () => {
    const rows = parseQualityContainerMap('90-94 | common\n98 | rare');
    expect(rows).toEqual([
      { min: 90, max: 94, container: 'common' },
      { min: 98, max: 98, container: 'rare' },
    ]);
  });

  it('ignores blank lines and comments', () => {
    expect(parseQualityContainerMap('# comment\n\n90-94 | common')).toHaveLength(1);
  });

  it('returns [] for non-string input', () => {
    expect(parseQualityContainerMap(undefined)).toEqual([]);
  });

  it('routes a quality within a mapped range to its container', () => {
    const rows = parseQualityContainerMap('90-94 | common\n95-97 | uncommon');
    expect(containerForQuality(92, rows)).toBe('common');
    expect(containerForQuality(96, rows)).toBe('uncommon');
  });

  it('falls back to vault for an unmapped quality', () => {
    const rows = parseQualityContainerMap('90-94 | common');
    expect(containerForQuality(99, rows)).toBe('vault');
  });
});

describe('ORDER_ITEM_RECIPES', () => {
  it('includes the seeded spellcrafting and tailoring examples', () => {
    expect(ORDER_ITEM_RECIPES['diamond of pain']).toEqual({
      craftTypeId: 'spellcrafting',
      components: [
        { material: 'diamond gemstone', qty: 1 },
        { material: 'pain essence', qty: 1 },
      ],
    });
    expect(ORDER_ITEM_RECIPES['bull elephant leather tunic']).toEqual({
      craftTypeId: 'tailoring',
      components: [
        { material: 'silksteel thread', qty: 4 },
        { material: 'bull elephant leather square', qty: 4 },
      ],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/game-client && npx jest --config ../../jest.config.cjs --runInBand --testPathPatterns "apps/game-client.*crafting-helper\.plugin"`
Expected: FAIL — none of the new names are exported yet (TypeScript compile error / `undefined` import).

- [ ] **Step 3: Implement the pure functions and data**

Add to `crafting-helper.plugin.ts`, directly after the existing `tierForSkill` function (i.e. right after the "Highest tier a craft type's rows offer..." function, before the "Line matchers" section comment):

```ts
// ── Order mode: recipes, quality parsing/routing ─────────────────────────

export interface RecipeComponent {
  material: string;
  qty: number;
}

export interface OrderItemRecipe {
  craftTypeId: string;
  components: RecipeComponent[];
}

// Hardcoded, not config — this data rarely changes and the user does not
// want to maintain an override surface for it. Add new order items here.
export const ORDER_ITEM_RECIPES: Record<string, OrderItemRecipe> = {
  'diamond of pain': {
    craftTypeId: 'spellcrafting',
    components: [
      { material: 'diamond gemstone', qty: 1 },
      { material: 'pain essence', qty: 1 },
    ],
  },
  'silksteel cloth helmet': {
    craftTypeId: 'tailoring',
    components: [
      { material: 'silksteel thread', qty: 1 },
      { material: 'silksteel square', qty: 1 },
    ],
  },
  'bull elephant leather tunic': {
    craftTypeId: 'tailoring',
    components: [
      { material: 'silksteel thread', qty: 4 },
      { material: 'bull elephant leather square', qty: 4 },
    ],
  },
};

export type QualitySpec =
  | { kind: 'atLeast'; min: number }
  | { kind: 'exact'; value: number }
  | { kind: 'range'; min: number; max: number };

export function parseQualitySpec(raw: string): QualitySpec | null {
  const trimmed = raw.trim();

  const atLeast = trimmed.match(/^(\d+)\+$/);
  if (atLeast) return { kind: 'atLeast', min: parseInt(atLeast[1], 10) };

  const range = trimmed.match(/^(\d+)-(\d+)$/);
  if (range) {
    const min = parseInt(range[1], 10);
    const max = parseInt(range[2], 10);
    return min <= max ? { kind: 'range', min, max } : null;
  }

  const exact = trimmed.match(/^(\d+)$/);
  if (exact) return { kind: 'exact', value: parseInt(exact[1], 10) };

  return null;
}

export function qualityMatchesSpec(quality: number, spec: QualitySpec): boolean {
  if (spec.kind === 'atLeast') return quality >= spec.min;
  if (spec.kind === 'exact') return quality === spec.value;
  return quality >= spec.min && quality <= spec.max;
}

export interface QualityContainerRow {
  min: number;
  max: number;
  container: string;
}

export function parseQualityContainerMap(raw: unknown): QualityContainerRow[] {
  const rows: QualityContainerRow[] = [];
  for (const line of splitConfigLines(raw)) {
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 2) continue;
    const [rangeStr, container] = parts;
    if (!container) continue;

    const range = rangeStr.match(/^(\d+)-(\d+)$/);
    if (range) {
      rows.push({ min: parseInt(range[1], 10), max: parseInt(range[2], 10), container });
      continue;
    }
    const single = rangeStr.match(/^(\d+)$/);
    if (single) {
      const v = parseInt(single[1], 10);
      rows.push({ min: v, max: v, container });
    }
  }
  return rows;
}

export function containerForQuality(quality: number, rows: QualityContainerRow[]): string {
  for (const row of rows) {
    if (quality >= row.min && quality <= row.max) return row.container;
  }
  return 'vault';
}
```

Then add, directly after the existing `SKILL_IMPROVED_RE`/`matchSkillImproved`/`matchVaultFailure` block (end of the "Line matchers" section, before the "HUD content" section comment):

```ts
const CONDITION_RE = /Condition:\s*[\w\s]+\(\s*(\d+)%\s*\)/;

export function matchItemCondition(line: string): number | null {
  const m = line.match(CONDITION_RE);
  return m ? parseInt(m[1], 10) : null;
}
```

`splitConfigLines` is the existing private helper already defined above `parseCraftTypesConfig` — reuse it, do not redeclare it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/game-client && npx jest --config ../../jest.config.cjs --runInBand --testPathPatterns "apps/game-client.*crafting-helper\.plugin"`
Expected: PASS, all new `describe` blocks green, and every pre-existing test in this file still green (this task adds pure functions only — no existing code path changes).

- [ ] **Step 5: Commit**

```bash
git add apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git commit -m "feat(crafting-helper): add order-item recipes and quality parsing/routing"
```

---

### Task 3: Generalize the recipe/pull loop; fix the destroyed-outcome put-back

**This task refactors already-shipped, live-tested improve-mode code.** Read the whole of `crafting-helper.plugin.ts` before starting — every step below assumes the file as it stands after Task 2. The intent: change internal representation only. Every existing test's *assertions about command strings sent* stay the same **except** the two `'destroyed'`-outcome tests named in Step 4, which change because this task also fixes real behavior (see Global Constraints).

**Files:**
- Modify: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts`
- Test: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–2 directly, but must not break their exports.
- Produces: `export interface ResolvedRecipe { outputName: string; components: RecipeComponent[] }` (uses `RecipeComponent` from Task 2), and changes `EngineState` to include `'pulling_components'` in place of `'pulling_material'`. `handleCraftSuccess` becomes `handleCraftSuccess(api, cfg, recipe: ResolvedRecipe)` (now takes `cfg` and owns scheduling the next step itself — Task 4 depends on this signature to add the order-mode branch). `resolveNextRecipe(cfg): ResolvedRecipe | null` (was `CraftTierRow | null`) — Task 4 depends on this signature to add the order-mode branch.

- [ ] **Step 1: Update the existing tests that assert on the old shape**

In `crafting-helper.plugin.test.ts`, the `buildHudContent` tests currently pass `activeTrinket: 'diamond gemstone'` inside `base`. Change the `base` object in `describe('buildHudContent', ...)`:

```ts
  const base = { trackedSkillLevel: 948, activeItemName: 'diamond gemstone', stopReason: null };
```

(rename `activeTrinket` → `activeItemName` — this is the only rename in that describe block; the four `it(...)` bodies below it are unchanged, they just spread `base`.)

In the state-machine `describe('crafting-helper state machine', ...)` block, replace the `'"destroyed" triggers a fresh pull, not a re-craft'` test with:

```ts
  it('"destroyed" puts back the material before re-pulling, since the message is not reliable', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);
    plugin.onAlias!(mock.api, 'crafthelper start');
    mock.feedLine('Craftskill: 948     Craft Rank: Grand Master Spellcrafter');
    jest.advanceTimersByTime(200);
    const sentSoFar = mock.sent.length;

    mock.feedLine('You failed and destroyed some materials in the process.');
    jest.advanceTimersByTime(100); // commandPacingDelayMs — put-back
    expect(mock.sent.slice(sentSoFar)).toEqual(["put 1 'diamond gemstone' vault"]);

    jest.advanceTimersByTime(100); // commandPacingDelayMs — then a fresh pull
    expect(mock.sent.slice(sentSoFar)).toEqual([
      "put 1 'diamond gemstone' vault",
      "get 1 'uncut diamond stone' vault",
    ]);
  });
```

And the tier-switch-timing test's final assertion block (the `mock.feedLine('You failed and destroyed some materials in the process.')` at the end) needs an extra `jest.advanceTimersByTime(100)` before the final expectation, since destroyed now takes two pacing delays instead of one:

```ts
    // Only once that material cycle actually ends (a fresh pull) does the new tier apply.
    mock.feedLine('You failed and destroyed some materials in the process.');
    jest.advanceTimersByTime(100); // put-back
    jest.advanceTimersByTime(100); // then pull
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'uncut moonstone' vault");
```

- [ ] **Step 2: Run tests to verify the updated ones fail against current code**

Run: `cd apps/game-client && npx jest --config ../../jest.config.cjs --runInBand --testPathPatterns "apps/game-client.*crafting-helper\.plugin"`
Expected: FAIL on the renamed `buildHudContent` field (TS error, since `activeItemName` isn't a param yet) and the two updated destroyed-outcome assertions.

- [ ] **Step 3: Refactor the plugin implementation**

Make these changes to `crafting-helper.plugin.ts`, in order:

**3a. Add `ResolvedRecipe` and a converter**, directly above the `ORDER_ITEM_RECIPES` block added in Task 2 (i.e. right after `tierForSkill`, before the Task-2 "Order mode: recipes..." section comment):

```ts
export interface ResolvedRecipe {
  outputName: string;
  components: RecipeComponent[];
}

function tierRowToRecipe(row: CraftTierRow): ResolvedRecipe {
  return { outputName: row.trinket, components: [{ material: row.material, qty: row.materialQty }] };
}
```

(`RecipeComponent` is the Task 2 export — this file already has it in scope since it's the same file.)

**3b. Update `EngineState`:**

```ts
export type EngineState =
  | 'idle'
  | 'awaiting_score'
  | 'pulling_components'
  | 'crafting'
  | 'storing_trinket'
  | 'error_stopped';
```

**3c. Update `phaseLabel`:**

```ts
function phaseLabel(state: EngineState): string {
  switch (state) {
    case 'awaiting_score':
      return 'checking score';
    case 'pulling_components':
      return 'pulling components';
    case 'crafting':
      return 'crafting';
    case 'storing_trinket':
      return 'storing item';
    default:
      return state;
  }
}
```

**3d. Update `buildHudContent`'s param name and usage** (rename `activeTrinket` → `activeItemName` throughout the function):

```ts
export function buildHudContent(input: {
  state: EngineState;
  everRun: boolean;
  trackedSkillLevel: number | null;
  activeItemName: string | null;
  stopReason: string | null;
}): HudWidgetContent | null {
  const { state, everRun, trackedSkillLevel, activeItemName, stopReason } = input;

  if (!everRun && state === 'idle') return null;

  if (state === 'error_stopped') {
    return { label: 'Crafting Helper', value: `Stopped: ${stopReason ?? 'error'}`, variant: 'critical' };
  }

  if (state === 'idle') {
    return { label: 'Crafting Helper', value: 'Stopped', variant: 'default' };
  }

  return {
    label: 'Crafting Helper',
    value: `Lv ${trackedSkillLevel ?? '?'} · ${activeItemName ?? '?'} · ${phaseLabel(state)}`,
    variant: 'default',
  };
}
```

**3e. In `createCraftingHelperPlugin()`, replace the state variables and functions from `activeRecipe` through `sendCraft`** (i.e. everything from `let activeRecipe: CraftTierRow | null = null;` through the end of the existing `sendCraft` function) with:

```ts
  let activeRecipe: ResolvedRecipe | null = null;
  let pullIndex = 0;
```

(keep every other `let`/state variable above and below this exactly as-is — `state`, `everRun`, `stopRequested`, `stopReason`, `trackedSkillLevel`, `activeCraftTypeRow`, `session`, the three timers, `lastPublishedSlot` are all unchanged.)

Then, where `publishHud`'s `buildHudContent(...)` call currently passes `activeTrinket: activeRecipe?.trinket ?? null`, change it to:

```ts
      activeItemName: activeRecipe?.outputName ?? null,
```

Replace `resolveNextRecipe`:

```ts
  // ── resolveNextRecipe — improve-mode seam ───────────────────────────
  // Order mode (Task 4) adds a second branch here: pick the active order's
  // exact item instead of auto-escalating to the highest qualified tier.
  function resolveNextRecipe(cfg: EngineConfig): ResolvedRecipe | null {
    if (trackedSkillLevel == null) return null;
    const row = tierForSkill(cfg.activeCraftType, trackedSkillLevel, cfg.tierTable);
    return row ? tierRowToRecipe(row) : null;
  }
```

Replace `handleCraftSuccess` (note the new `cfg` parameter and that it now owns scheduling the next pull, previously done by the caller in `handleRawData`):

```ts
  // ── handleCraftSuccess — improve-mode seam ──────────────────────────
  // Order mode (Task 4) adds a second branch here: lore the item, parse its
  // quality %, and route it to an order or a quality→container map instead
  // of unconditionally storing to vault.
  function handleCraftSuccess(api: PluginRuntimeApi, cfg: EngineConfig, recipe: ResolvedRecipe) {
    api.sendCommand(`put 1 '${recipe.outputName}' vault`);
    pacingTimer = setTimeout(() => beginPullCycle(api), cfg.commandPacingDelayMs);
  }
```

Replace `beginPullCycle` and the old `onPullTimeout`/`sendCraft` with the generalized pull loop:

```ts
  function beginPullCycle(api: PluginRuntimeApi) {
    const cfg = readConfig(api);
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }

    const recipe = resolveNextRecipe(cfg);
    if (!recipe) {
      enterError(api, cfg, `Skill level ${trackedSkillLevel} has no matching tier in the tier table.`);
      return;
    }

    activeRecipe = recipe;
    pullIndex = 0;
    pullComponent(api, cfg);
  }

  function pullComponent(api: PluginRuntimeApi, cfg: EngineConfig) {
    if (!activeRecipe) {
      enterError(api, cfg, 'Internal error: no active recipe.');
      return;
    }
    if (pullIndex >= activeRecipe.components.length) {
      sendCraft(api, cfg);
      return;
    }
    state = 'pulling_components';
    publishHud(api, cfg);
    const component = activeRecipe.components[pullIndex];
    api.sendCommand(`get ${component.qty} '${component.material}' vault`);
    pullTimer = setTimeout(() => onPullTimeout(api), cfg.pullConfirmTimeoutMs);
  }

  function onPullTimeout(api: PluginRuntimeApi) {
    pullTimer = null;
    const cfg = readConfig(api);
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    pullIndex += 1;
    pullComponent(api, cfg);
  }

  function sendCraft(api: PluginRuntimeApi, cfg: EngineConfig) {
    if (!activeCraftTypeRow || !activeRecipe) {
      enterError(api, cfg, 'Internal error: no active craft type/recipe.');
      return;
    }
    state = 'crafting';
    publishHud(api, cfg);
    api.sendCommand(`craft ${activeCraftTypeRow.verb} '${activeRecipe.outputName}'`);
    // No timeout here on purpose: higher-tier crafts can take a while to
    // resolve, and one of the three known outcome lines always eventually
    // arrives — there's no "silence means success" ambiguity like the pull
    // step has, so waiting indefinitely is correct, not a stall risk.
  }

  function beginDestroyedRecovery(api: PluginRuntimeApi, cfg: EngineConfig, components: RecipeComponent[]) {
    // The "destroyed" message is not reliable — it doesn't always mean every
    // (or any) pulled component was actually lost. Rather than guess which
    // survived, put everything back (a `put` on something not held is
    // assumed to no-op harmlessly, same assumption already made for a
    // successful craft's `put`) and re-pull the full recipe fresh.
    putBackComponent(api, cfg, components, 0);
  }

  function putBackComponent(api: PluginRuntimeApi, cfg: EngineConfig, components: RecipeComponent[], index: number) {
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    if (index >= components.length) {
      pacingTimer = setTimeout(() => beginPullCycle(api), cfg.commandPacingDelayMs);
      return;
    }
    pacingTimer = setTimeout(() => {
      const component = components[index];
      api.sendCommand(`put ${component.qty} '${component.material}' vault`);
      putBackComponent(api, cfg, components, index + 1);
    }, cfg.commandPacingDelayMs);
  }
```

**3f. In `handleRawData`, update the `pulling_material` guard and branch to `pulling_components`:**

The early-return guard near the top of `handleRawData`:

```ts
    if (state !== 'awaiting_score' && state !== 'pulling_components' && state !== 'crafting') return;
```

The pull branch (rename the `if (state === 'pulling_material')` block condition and its error message, which referenced `activeRecipe?.material` — now `activeRecipe?.components[pullIndex]?.material`):

```ts
    if (state === 'pulling_components') {
      for (const rawLine of plain.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        if (matchVaultFailure(line)) {
          if (pullTimer) {
            clearTimeout(pullTimer);
            pullTimer = null;
          }
          const missing = activeRecipe?.components[pullIndex]?.material;
          enterError(api, cfg, `Vault is out of "${missing}" — restock needed.`);
          return;
        }
      }
      return;
    }
```

**3g. In `handleRawData`'s `crafting`-state outcome branch, update the three outcome handlers** (this is the tail of the function, from `if (outcome === 'success')` through the end):

```ts
    if (outcome === 'success') {
      if (session) session.successes += 1;
      state = 'storing_trinket';
      publishHud(api, cfg);
      handleCraftSuccess(api, cfg, activeRecipe!);
    } else if (outcome === 'failed_destroyed') {
      if (session) session.failedDestroyed += 1;
      beginDestroyedRecovery(api, cfg, activeRecipe!.components);
    } else {
      if (session) session.failedNoLoss += 1;
      if (stopRequested) {
        goIdle(api, cfg);
        return;
      }
      pacingTimer = setTimeout(() => sendCraft(api, cfg), cfg.commandPacingDelayMs);
    }
```

(`handleCraftSuccess` now schedules its own next step, so the old trailing `pacingTimer = setTimeout(() => beginPullCycle(api), cfg.commandPacingDelayMs);` line that used to follow the `handleCraftSuccess(api, activeRecipe!)` call is deleted — it's inside `handleCraftSuccess` now.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/game-client && npx jest --config ../../jest.config.cjs --runInBand --testPathPatterns "apps/game-client.*crafting-helper\.plugin"`
Expected: PASS — every test in the file, including the two updated in Step 1 and every unmodified pre-existing test (happy path, no-loss, vault-failure, craft-timeout-free wait, tier-switch timing, stop-lets-in-flight-finish, start/stop no-ops, unknown-craft-type, HUD publish/clear, unmatched alias).

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `cd apps/game-client && npx tsc --noEmit -p tsconfig.json`
Expected: clean, no errors.

Run: `npx jest --config jest.config.cjs --runInBand --testPathPatterns "apps/game-client"` (from the worktree root)
Expected: PASS, full game-client suite green (confirms this refactor didn't regress anything elsewhere in the plugin host/registry tests).

- [ ] **Step 6: Commit**

```bash
git add apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git commit -m "refactor(crafting-helper): generalize recipes to multi-component lists; fix destroyed put-back"
```

---

### Task 4: Order mode state machine, commands, and config

**Files:**
- Modify: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts`
- Test: `apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts`

**Interfaces:**
- Consumes: `getOrderQueue`, `addOrder`, `removeOrder`, `updateOrder`, `StoredCraftOrder` from Task 1's `crafting-helper-storage.ts`; `ORDER_ITEM_RECIPES`, `parseQualitySpec`, `qualityMatchesSpec`, `matchItemCondition`, `parseQualityContainerMap`, `containerForQuality`, `QualityContainerRow` from Task 2; `ResolvedRecipe`, the `resolveNextRecipe(cfg)`/`handleCraftSuccess(api, cfg, recipe)` seam signatures, and `EngineState` from Task 3.
- Produces: nothing consumed by a later task — this is the last task.

- [ ] **Step 1: Write the failing tests**

Add to the top-level import block in `crafting-helper.plugin.test.ts` (add `getTrackedSkillLevel` is not needed; add these two storage imports as a new top-of-file import statement):

```ts
import { getOrderQueue } from './crafting-helper-storage';
```

`defaultConfig()` (existing helper, already in this file) only seeds a `spellcrafting` row in `craftTypes` — any test below that queues a tailoring order item needs a `craftTypes` override adding a tailoring row, or `advanceOrderQueue` will correctly fail with "Unknown craft type". Add this constant near the top of the file, directly after the existing `defaultConfig` function:

```ts
const TAILORING_CRAFT_TYPES_CONFIG = `${DEFAULT_CRAFT_TYPES_CONFIG}\ntailoring | Tailoring | tailor | Tailor`;
```

Add to the `describe('crafting-helper state machine', ...)` block, after the existing `'ignores unmatched command input via onAlias'` test (last test in the file):

```ts
  it('order add validates the item and quality spec before queueing', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 6 'diamond of pain' 97+");
    expect(mock.terminalWrites.some((w) => w.includes('Queued order'))).toBe(true);
    expect(getOrderQueue('__unknown__')).toHaveLength(1);
    expect(getOrderQueue('__unknown__')[0]).toMatchObject({
      itemName: 'diamond of pain',
      quantityRemaining: 6,
      quantityTotal: 6,
      qualitySpec: { kind: 'atLeast', min: 97 },
    });

    plugin.onAlias!(mock.api, "crafthelper order add 3 'not a real item' 99");
    expect(mock.terminalWrites.some((w) => w.includes('Unknown order item'))).toBe(true);
    expect(getOrderQueue('__unknown__')).toHaveLength(1); // second add rejected, not queued

    plugin.onAlias!(mock.api, "crafthelper order add 3 'diamond of pain' not-a-spec");
    expect(mock.terminalWrites.some((w) => w.includes('Invalid quality spec'))).toBe(true);
    expect(getOrderQueue('__unknown__')).toHaveLength(1);
  });

  it('order start with an empty queue is a no-op', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, 'crafthelper order start');
    expect(mock.sent).toEqual([]);
    expect(mock.terminalWrites.some((w) => w.includes('No orders queued'))).toBe(true);
  });

  it('order mode pulls every named component, in order, before crafting', () => {
    const mock = createMockApi(defaultConfig({ craftTypes: TAILORING_CRAFT_TYPES_CONFIG }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    plugin.onAlias!(mock.api, 'crafthelper order start');

    expect(mock.sent).toEqual(["get 1 'silksteel thread' vault"]);
    jest.advanceTimersByTime(200); // pullConfirmTimeoutMs
    expect(mock.sent).toEqual(["get 1 'silksteel thread' vault", "get 1 'silksteel square' vault"]);
    jest.advanceTimersByTime(200);
    expect(mock.sent).toEqual([
      "get 1 'silksteel thread' vault",
      "get 1 'silksteel square' vault",
      "craft tailor 'silksteel cloth helmet'",
    ]);
  });

  it('an in-spec item is stored in the holding container, decrements the order, and refills it', () => {
    const mock = createMockApi(defaultConfig({ orderHoldingContainer: 'orders' }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 2 'diamond of pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200); // pull diamond gemstone
    jest.advanceTimersByTime(200); // pull pain essence
    // now crafting
    mock.feedLine('You were successful.');
    expect(mock.sent).toContain("lore 'diamond of pain'");

    mock.feedLine('Condition: flawless (98%)');
    expect(mock.sent).toContain("put 1 'diamond of pain' 'orders'");
    expect(getOrderQueue('__unknown__')[0].quantityRemaining).toBe(1);

    jest.advanceTimersByTime(100); // commandPacingDelayMs — refill, same order
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'diamond gemstone' vault");
  });

  it('an off-spec item is routed via the quality-container map and does not count toward the order', () => {
    const mock = createMockApi(
      defaultConfig({ orderHoldingContainer: 'orders', qualityContainerMap: '90-94 | common' }),
    );
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond of pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.');

    mock.feedLine('Condition: scuffed (92%)');
    expect(mock.sent).toContain("put 1 'diamond of pain' 'common'");
    expect(getOrderQueue('__unknown__')[0].quantityRemaining).toBe(1); // unchanged — didn't count

    jest.advanceTimersByTime(100);
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'diamond gemstone' vault"); // tries again
  });

  it('completing an order dequeues it and auto-advances to the next queued order', () => {
    const mock = createMockApi(defaultConfig({ craftTypes: TAILORING_CRAFT_TYPES_CONFIG }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond of pain' 97+");
    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.');
    mock.feedLine('Condition: flawless (98%)');

    expect(getOrderQueue('__unknown__')).toHaveLength(1); // completed order removed
    jest.advanceTimersByTime(100);
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'silksteel thread' vault"); // next order started
  });

  it('a quality line that never arrives stops the plugin rather than guessing where to route the item', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond of pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    mock.feedLine('You were successful.');
    const sentSoFar = [...mock.sent];

    jest.advanceTimersByTime(2000); // loreResponseTimeoutMs default
    expect(mock.sent).toEqual(sentSoFar); // no further `put`/`get` sent
    expect(mock.terminalWrites.some((w) => w.includes("verify quality"))).toBe(true);
  });

  it('order remove drops a queued order; removing the active order lets the in-flight attempt finish, then advances', () => {
    const mock = createMockApi(defaultConfig({ craftTypes: TAILORING_CRAFT_TYPES_CONFIG }));
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond of pain' 97+");
    plugin.onAlias!(mock.api, "crafthelper order add 1 'silksteel cloth helmet' 90+");
    const firstOrderId = getOrderQueue('__unknown__')[0].id;

    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);
    // now crafting the active (first) order

    plugin.onAlias!(mock.api, `crafthelper order remove ${firstOrderId}`);
    expect(getOrderQueue('__unknown__')).toHaveLength(1);

    mock.feedLine('You were successful.');
    mock.feedLine('Condition: flawless (98%)'); // would have matched the removed order's spec, but it's gone
    expect(mock.sent).toContain("put 1 'diamond of pain' 'vault'"); // no active order to route to -> default container

    jest.advanceTimersByTime(100);
    expect(mock.sent[mock.sent.length - 1]).toBe("get 1 'silksteel thread' vault"); // advanced to the remaining order
  });

  it('order status reports the active order and queue', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 6 'diamond of pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    mock.terminalWrites.length = 0;

    plugin.onAlias!(mock.api, 'crafthelper order status');
    expect(mock.terminalWrites.some((w) => w.includes('diamond of pain'))).toBe(true);
  });

  it('order stop lets the in-flight step finish, then goes idle', () => {
    const mock = createMockApi(defaultConfig());
    const plugin = createCraftingHelperPlugin();
    plugin.onEnable!(mock.api);

    plugin.onAlias!(mock.api, "crafthelper order add 1 'diamond of pain' 97+");
    plugin.onAlias!(mock.api, 'crafthelper order start');
    jest.advanceTimersByTime(200);
    jest.advanceTimersByTime(200);

    plugin.onAlias!(mock.api, 'crafthelper order stop');
    mock.feedLine('You were successful.');
    mock.feedLine('Condition: flawless (98%)');
    const sentSoFar = [...mock.sent];

    jest.advanceTimersByTime(200);
    expect(mock.sent).toEqual(sentSoFar); // no further get/craft issued
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/game-client && npx jest --config ../../jest.config.cjs --runInBand --testPathPatterns "apps/game-client.*crafting-helper\.plugin"`
Expected: FAIL — `crafthelper order ...` isn't recognized by `onAlias` yet (all new tests fail; every Task 1–3 test still passes).

- [ ] **Step 3: Implement order mode**

Make these changes to `crafting-helper.plugin.ts`:

**3a. Add the import** for the Task 1 storage functions, extending the existing import line at the top of the file:

```ts
import { getTrackedSkillLevel, setTrackedSkillLevel, getOrderQueue, addOrder, removeOrder, updateOrder, type StoredCraftOrder } from './crafting-helper-storage';
```

**3b. Update `EngineState`** to add `'checking_quality'`:

```ts
export type EngineState =
  | 'idle'
  | 'awaiting_score'
  | 'pulling_components'
  | 'crafting'
  | 'storing_trinket'
  | 'checking_quality'
  | 'error_stopped';
```

**3c. Update `phaseLabel`** to add the new case:

```ts
    case 'checking_quality':
      return 'checking quality';
```

(insert as a new `case` alongside the existing ones, before `default`)

**3d. Update `EngineConfig`** (the `interface EngineConfig { ... }` block) to add the three new config fields:

```ts
interface EngineConfig {
  craftTypes: CraftTypeRow[];
  tierTable: CraftTierRow[];
  activeCraftType: string;
  commandPacingDelayMs: number;
  pullConfirmTimeoutMs: number;
  scoreResponseTimeoutMs: number;
  loreResponseTimeoutMs: number;
  orderHoldingContainer: string;
  qualityContainerMap: QualityContainerRow[];
  debug: boolean;
  hudSlot: HudSlotId | 'none';
}
```

**3e. Update `readConfig`** to populate them:

```ts
function readConfig(api: PluginRuntimeApi): EngineConfig {
  const cfg = api.getConfig();
  const hudSlot = cfg.hudSlot;
  return {
    craftTypes: parseCraftTypesConfig(cfg.craftTypes),
    tierTable: parseTierTableConfig(cfg.tierTable),
    activeCraftType:
      typeof cfg.activeCraftType === 'string' && cfg.activeCraftType.trim()
        ? cfg.activeCraftType.trim().toLowerCase()
        : 'spellcrafting',
    commandPacingDelayMs: numOr(cfg.commandPacingDelayMs, 150),
    pullConfirmTimeoutMs: numOr(cfg.pullConfirmTimeoutMs, 200),
    scoreResponseTimeoutMs: numOr(cfg.scoreResponseTimeoutMs, 1000),
    loreResponseTimeoutMs: numOr(cfg.loreResponseTimeoutMs, 2000),
    orderHoldingContainer:
      typeof cfg.orderHoldingContainer === 'string' && cfg.orderHoldingContainer.trim()
        ? cfg.orderHoldingContainer.trim()
        : 'orders',
    qualityContainerMap: parseQualityContainerMap(cfg.qualityContainerMap),
    debug: cfg.debug === true,
    hudSlot: hudSlot === 'hud.bottomStrip' || hudSlot === 'hud.rightColumn' || hudSlot === 'none'
      ? hudSlot
      : 'hud.bottomStrip',
  };
}
```

**3f. Add mode/order state variables**, in `createCraftingHelperPlugin()`, directly after the `let pullIndex = 0;` line added in Task 3:

```ts
  type EngineMode = 'improve' | 'order';
  let mode: EngineMode = 'improve';
  let activeOrder: StoredCraftOrder | null = null;
  let activeOrderRemoved = false;
  let orderSession: { inSpecRouted: number; offSpecRouted: number } | null = null;
  let qualityTimer: ReturnType<typeof setTimeout> | null = null;
```

**3g. Add `qualityTimer` to `clearAllTimers`:**

```ts
  function clearAllTimers() {
    if (scoreTimer) clearTimeout(scoreTimer);
    if (pullTimer) clearTimeout(pullTimer);
    if (pacingTimer) clearTimeout(pacingTimer);
    if (qualityTimer) clearTimeout(qualityTimer);
    scoreTimer = pullTimer = pacingTimer = qualityTimer = null;
  }
```

**3h. Replace `resolveNextRecipe`** (from Task 3) with the mode-aware version:

```ts
  // ── resolveNextRecipe — improve-mode / order-mode seam ──────────────
  function resolveNextRecipe(cfg: EngineConfig): ResolvedRecipe | null {
    if (mode === 'order') {
      if (!activeOrder) return null;
      const orderRecipe = ORDER_ITEM_RECIPES[activeOrder.itemName];
      return orderRecipe ? { outputName: activeOrder.itemName, components: orderRecipe.components } : null;
    }
    if (trackedSkillLevel == null) return null;
    const row = tierForSkill(cfg.activeCraftType, trackedSkillLevel, cfg.tierTable);
    return row ? tierRowToRecipe(row) : null;
  }
```

**3i. Replace `handleCraftSuccess`** (from Task 3) with the mode-aware version:

```ts
  // ── handleCraftSuccess — improve-mode / order-mode seam ──────────────
  function handleCraftSuccess(api: PluginRuntimeApi, cfg: EngineConfig, recipe: ResolvedRecipe) {
    if (mode === 'improve') {
      api.sendCommand(`put 1 '${recipe.outputName}' vault`);
      pacingTimer = setTimeout(() => beginPullCycle(api), cfg.commandPacingDelayMs);
      return;
    }
    state = 'checking_quality';
    publishHud(api, cfg);
    api.sendCommand(`lore '${recipe.outputName}'`);
    qualityTimer = setTimeout(() => onQualityTimeout(api), cfg.loreResponseTimeoutMs);
  }

  function onQualityTimeout(api: PluginRuntimeApi) {
    qualityTimer = null;
    const cfg = readConfig(api);
    enterError(
      api,
      cfg,
      `Couldn't verify quality of "${activeRecipe?.outputName}" within ${cfg.loreResponseTimeoutMs}ms — stopped rather than guess where to route it.`,
    );
  }

  function resolveOrderQuality(api: PluginRuntimeApi, cfg: EngineConfig, quality: number) {
    if (!activeRecipe) {
      enterError(api, cfg, 'Internal error: no active recipe.');
      return;
    }
    const outputName = activeRecipe.outputName;
    const order = activeOrderRemoved ? null : activeOrder;
    const inSpec = order != null && qualityMatchesSpec(quality, order.qualitySpec);

    if (inSpec && order) {
      if (orderSession) orderSession.inSpecRouted += 1;
      api.sendCommand(`put 1 '${outputName}' '${cfg.orderHoldingContainer}'`);
      const remaining = order.quantityRemaining - 1;
      if (remaining <= 0) {
        removeOrder(characterKey(), order.id);
        activeOrder = null;
        pacingTimer = setTimeout(() => advanceOrderQueue(api), cfg.commandPacingDelayMs);
      } else {
        updateOrder(characterKey(), order.id, { quantityRemaining: remaining });
        activeOrder = { ...order, quantityRemaining: remaining };
        pacingTimer = setTimeout(() => beginPullCycle(api), cfg.commandPacingDelayMs);
      }
    } else {
      if (orderSession) orderSession.offSpecRouted += 1;
      const container = containerForQuality(quality, cfg.qualityContainerMap);
      api.sendCommand(`put 1 '${outputName}' '${container}'`);
      if (activeOrderRemoved) {
        activeOrderRemoved = false;
        pacingTimer = setTimeout(() => advanceOrderQueue(api), cfg.commandPacingDelayMs);
      } else {
        pacingTimer = setTimeout(() => beginPullCycle(api), cfg.commandPacingDelayMs);
      }
    }
  }

  function advanceOrderQueue(api: PluginRuntimeApi) {
    const cfg = readConfig(api);
    if (stopRequested) {
      goIdle(api, cfg);
      return;
    }
    const queue = getOrderQueue(characterKey());
    if (queue.length === 0) {
      mode = 'improve';
      goIdle(api, cfg);
      return;
    }
    const next = queue[0];
    const orderRecipe = ORDER_ITEM_RECIPES[next.itemName];
    if (!orderRecipe) {
      enterError(api, cfg, `Order item "${next.itemName}" has no known recipe.`);
      return;
    }
    const typeRow = cfg.craftTypes.find((t) => t.id === orderRecipe.craftTypeId);
    if (!typeRow) {
      enterError(api, cfg, `Unknown craft type "${orderRecipe.craftTypeId}" for order item "${next.itemName}".`);
      return;
    }
    activeOrder = next;
    activeOrderRemoved = false;
    activeCraftTypeRow = typeRow;
    beginPullCycle(api);
  }
```

**3j. In `handleRawData`, extend the state guard** to include `'checking_quality'`:

```ts
    if (state !== 'awaiting_score' && state !== 'pulling_components' && state !== 'crafting' && state !== 'checking_quality') return;
```

And add a `checking_quality` branch, directly after the `pulling_components` block (before the `// state === 'crafting'` comment):

```ts
    if (state === 'checking_quality') {
      for (const rawLine of plain.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        const quality = matchItemCondition(line);
        if (quality != null) {
          if (qualityTimer) {
            clearTimeout(qualityTimer);
            qualityTimer = null;
          }
          resolveOrderQuality(api, cfg, quality);
          return;
        }
      }
      return;
    }
```

**3k. Add order alias handlers.** Replace the existing `onAlias` function entirely with:

```ts
  function onAlias(api: PluginRuntimeApi, input: string): boolean | undefined {
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();

    if (lower === 'crafthelper start') return handleImproveStart(api);
    if (lower === 'crafthelper stop') return handleStop(api);
    if (lower === 'crafthelper status') return handleStatus(api);

    const addMatch = trimmed.match(/^crafthelper order add\s+(\d+)\s+'([^']+)'\s+(\S+)$/i);
    if (addMatch) return handleOrderAdd(api, addMatch);
    if (lower === 'crafthelper order list') return handleOrderList(api);
    const removeMatch = trimmed.match(/^crafthelper order remove\s+(\S+)$/i);
    if (removeMatch) return handleOrderRemove(api, removeMatch[1]);
    if (lower === 'crafthelper order start') return handleOrderStart(api);
    if (lower === 'crafthelper order stop') return handleStop(api);
    if (lower === 'crafthelper order status') return handleStatus(api);

    return undefined;
  }

  function handleImproveStart(api: PluginRuntimeApi): boolean {
    const cfg = readConfig(api);
    if (state !== 'idle') {
      writeInfo(api, `Already running (state: ${state}).`);
      return true;
    }

    const typeRow = cfg.craftTypes.find((t) => t.id === cfg.activeCraftType);
    if (!typeRow) {
      writeError(api, `Unknown active craft type "${cfg.activeCraftType}" — check the Craft types config.`);
      return true;
    }

    mode = 'improve';
    activeCraftTypeRow = typeRow;
    stopRequested = false;
    stopReason = null;
    everRun = true;
    session = {
      startedAt: Date.now(),
      craftAttempts: 0,
      successes: 0,
      failedDestroyed: 0,
      failedNoLoss: 0,
      skillGains: 0,
    };
    orderSession = null;

    trackedSkillLevel = getTrackedSkillLevel(characterKey(), cfg.activeCraftType);

    state = 'awaiting_score';
    publishHud(api, cfg);
    writeInfo(
      api,
      `Starting ${typeRow.label} training — make sure your character is parked wherever your vault and crafting station both are.`,
    );
    api.sendCommand('score');
    scoreTimer = setTimeout(() => onScoreTimeout(api), cfg.scoreResponseTimeoutMs);
    return true;
  }

  function handleOrderAdd(api: PluginRuntimeApi, match: RegExpMatchArray): boolean {
    const qty = parseInt(match[1], 10);
    const itemName = match[2];
    const qualitySpec = parseQualitySpec(match[3]);

    if (!Number.isFinite(qty) || qty <= 0) {
      writeError(api, `Invalid quantity "${match[1]}".`);
      return true;
    }
    if (!ORDER_ITEM_RECIPES[itemName]) {
      writeError(api, `Unknown order item "${itemName}" — no recipe for it.`);
      return true;
    }
    if (!qualitySpec) {
      writeError(api, `Invalid quality spec "${match[3]}" — use "97+", "99", or "95-98".`);
      return true;
    }

    const order: StoredCraftOrder = {
      id: `order-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      itemName,
      quantityRemaining: qty,
      quantityTotal: qty,
      qualitySpec,
      createdAt: Date.now(),
    };
    addOrder(characterKey(), order);
    writeInfo(api, `Queued order ${order.id}: ${qty}x "${itemName}" @ ${match[3]}.`);
    return true;
  }

  function handleOrderList(api: PluginRuntimeApi): boolean {
    const queue = getOrderQueue(characterKey());
    if (queue.length === 0) {
      writeInfo(api, 'No orders queued.');
      return true;
    }
    queue.forEach((o, i) => {
      const activeTag = i === 0 && mode === 'order' && state !== 'idle' ? ' [active]' : '';
      writeInfo(api, `${o.id}: ${o.quantityRemaining}/${o.quantityTotal}x "${o.itemName}"${activeTag}`);
    });
    return true;
  }

  function handleOrderRemove(api: PluginRuntimeApi, orderId: string): boolean {
    const removed = removeOrder(characterKey(), orderId);
    if (!removed) {
      writeError(api, `No queued order with id "${orderId}".`);
      return true;
    }
    if (activeOrder?.id === orderId) {
      activeOrderRemoved = true;
    }
    writeInfo(api, `Removed order ${orderId}.`);
    return true;
  }

  function handleOrderStart(api: PluginRuntimeApi): boolean {
    if (state !== 'idle') {
      writeInfo(api, `Already running (state: ${state}).`);
      return true;
    }
    const queue = getOrderQueue(characterKey());
    if (queue.length === 0) {
      writeInfo(api, 'No orders queued.');
      return true;
    }

    mode = 'order';
    stopRequested = false;
    stopReason = null;
    everRun = true;
    session = {
      startedAt: Date.now(),
      craftAttempts: 0,
      successes: 0,
      failedDestroyed: 0,
      failedNoLoss: 0,
      skillGains: 0,
    };
    orderSession = { inSpecRouted: 0, offSpecRouted: 0 };

    writeInfo(
      api,
      'Starting order fulfillment — make sure your character is parked wherever your vault and crafting station both are.',
    );
    advanceOrderQueue(api);
    return true;
  }

  function handleStop(api: PluginRuntimeApi): boolean {
    if (state === 'idle') {
      writeInfo(api, 'Not running.');
      return true;
    }
    stopRequested = true;
    writeInfo(api, 'Stop requested — finishing current step, then going idle.');
    return true;
  }

  function handleStatus(api: PluginRuntimeApi): boolean {
    const cfg = readConfig(api);
    const parts = [`state=${state}`, `mode=${mode}`];

    if (mode === 'order') {
      parts.push(
        `activeOrder=${activeOrder ? `${activeOrder.quantityRemaining}/${activeOrder.quantityTotal}x "${activeOrder.itemName}"` : 'none'}`,
        `queueDepth=${getOrderQueue(characterKey()).length}`,
      );
    } else {
      parts.push(`craftType=${activeCraftTypeRow?.label ?? cfg.activeCraftType}`, `skill=${trackedSkillLevel ?? '?'}`);
    }
    parts.push(`item=${activeRecipe?.outputName ?? '?'}`);

    if (session) {
      parts.push(
        `attempts=${session.craftAttempts}`,
        `success=${session.successes}`,
        `destroyed=${session.failedDestroyed}`,
        `noLoss=${session.failedNoLoss}`,
        `skillGains=${session.skillGains}`,
      );
    }
    if (orderSession) {
      parts.push(`inSpec=${orderSession.inSpecRouted}`, `offSpec=${orderSession.offSpecRouted}`);
    }
    if (state === 'error_stopped' && stopReason) parts.push(`reason=${stopReason}`);
    writeInfo(api, parts.join('  '));
    return true;
  }
```

Delete the old inline `crafthelper start`/`crafthelper stop`/`crafthelper status` bodies that previously lived directly in `onAlias` — they're now `handleImproveStart`/`handleStop`/`handleStatus` above.

**3l. Update the manifest description and config schema**, in the object returned at the end of `createCraftingHelperPlugin()`:

```ts
    manifest: {
      id: 'crafting-helper',
      name: 'Crafting Helper',
      version: '0.3.0',
      description:
        "Automates tier-3 crafting: skill-up training (pulls raw materials, crafts the highest tier your skill qualifies for, stores finished trinkets) and order fulfillment (crafts multi-component items toward queued orders, checking quality via `lore` and routing by spec). Ships seeded with Spellcrafting and example Tailoring order recipes. The `lore` quality-line pattern is unverified against a real log capture — watch for a stall on first live use. Run this while standing wherever your vault and crafting station both are. Commands: crafthelper start/stop/status, crafthelper order add/list/remove/start/stop/status.",
    },
```

(bump `version` from `'0.2.0'` to `'0.3.0'` — new config fields added, per `plugin-authoring.md` §8)

Add to `configSchema.defaults`:

```ts
        loreResponseTimeoutMs: 2000,
        orderHoldingContainer: 'orders',
        qualityContainerMap: '',
```

Add to `configSchema.fields` (as new entries, alongside the existing ones):

```ts
        {
          key: 'loreResponseTimeoutMs',
          type: 'number',
          label: 'Lore response timeout (ms)',
          min: 0,
          description: 'How long to wait after `lore` for the item\'s Condition line before aborting (order mode only).',
        },
        {
          key: 'orderHoldingContainer',
          type: 'string',
          label: 'Order holding container',
          description: 'Where finished, in-spec order items are stored, ready for manual hand-off.',
          placeholder: 'orders',
        },
        {
          key: 'qualityContainerMap',
          type: 'textarea',
          label: 'Quality → container map',
          description:
            'One row per quality range for items that don\'t match the active order\'s spec: "<range or single value> | <container>". Unmapped qualities default to vault.',
          placeholder: '90-94 | common',
        },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/game-client && npx jest --config ../../jest.config.cjs --runInBand --testPathPatterns "apps/game-client.*crafting-helper"`
Expected: PASS — every test across both `crafting-helper.plugin.test.ts` and `crafting-helper-storage.test.ts`, from all four tasks.

- [ ] **Step 5: Full verification**

Run: `cd apps/game-client && npx tsc --noEmit -p tsconfig.json`
Expected: clean.

Run: `pnpm --filter @shatteredarchive/game-client build`
Expected: succeeds.

Run: `npx jest --config jest.config.cjs --runInBand --testPathPatterns "apps/game-client"` (from the worktree root)
Expected: PASS, full game-client suite green.

- [ ] **Step 6: Commit**

```bash
git add apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.test.ts
git commit -m "feat(crafting-helper): add order mode — queue, multi-component fulfillment, quality routing"
```

---

## Post-implementation notes for the final review

- The registry (`apps/game-client/src/features/plugins/registry.ts`) needs **no change** — `crafting-helper` is already registered there; this plan only extends the existing plugin's exports and internal behavior.
- The `Condition:` regex and the destroyed-message-unreliability behavior are both unverified against a real log corpus. Flag this explicitly when handing back to the user, and treat the first live `crafthelper order start` run as the verification step, same discipline as the original improve-mode patterns.
- `crafthelper order remove` of the currently-active order is the trickiest edge case in this plan (Task 4, Step 1's last-but-two test) — give it extra scrutiny in review.
