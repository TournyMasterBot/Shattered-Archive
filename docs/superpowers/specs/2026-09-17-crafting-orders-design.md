# Crafting Orders — Order Mode for the Crafting Helper Plugin

## Context

`crafting-helper` (`apps/game-client/src/features/plugins/core-plugins/crafting-helper.plugin.ts`) already ships and is confirmed working live for **improve mode**: pull one raw material from the vault, `craft <verb> '<trinket>'`, branch on one of three outcome lines, repeat, auto-escalating to a harder trinket tier as the tracked skill level crosses configured thresholds.

That implementation deliberately isolated two extension seams — `resolveNextRecipe(...)` and `handleCraftSuccess(...)` — specifically so a second, order-fulfillment mode could plug in later without restructuring the state machine. This spec is that second mode.

**Order mode**, in one sentence: the player queues custom requests ("6 diamond of pain, 97%+"), and the plugin repeatedly crafts toward the *active* order — pulling however many named components that item's recipe needs, crafting it, checking the result's quality via `lore`, and routing it either into a holding container (in spec) or a quality-mapped container (off spec) — advancing to the next queued order once the active one's quantity is filled.

Delivery/turn-in to the requester stays manual and out of scope, as before.

## Data model

### Recipe generalization

The existing `CraftTierRow` models one trinket as needing exactly one material at one quantity. Order items need a *list* of named components, each with its own quantity (e.g. a "silksteel cloth helmet" needs 1 silksteel thread + 1 silksteel square). Rather than give order mode a parallel, divergent recipe shape, the pull cycle is generalized to work off a component list:

```ts
export interface RecipeComponent {
  material: string;
  qty: number;
}

/** What one pull/craft cycle needs and produces — trinkets and order items both resolve to this. */
export interface ResolvedRecipe {
  /** The name passed to `craft <verb> '<outputName>'`. */
  outputName: string;
  components: RecipeComponent[];
}
```

`CraftTierRow` (unchanged, still config-driven) maps to a `ResolvedRecipe` with a single-element `components` array — improve mode's behavior is identical, just re-expressed. `resolveNextRecipe` returns `ResolvedRecipe | null` in both modes now, not `CraftTierRow | null`; improve mode's implementation just wraps its existing `tierForSkill` lookup.

### Order-item recipes (hardcoded, not config)

```ts
export interface OrderItemRecipe {
  craftTypeId: string;
  components: RecipeComponent[];
}

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
```

Per explicit decision, this table is a plain source-code constant, not a config textarea — the user does not want to maintain/override it, since it rarely changes. New order items get added by editing this constant (a future addition can seed the other 4 craft skills' recipes the same way the tier table's other 4 skills are deferred).

All components here are assumed vault-sourced (`get <qty> '<material>' vault`) — including components that happen to also be improve-mode trinkets (e.g. spellcrafting's `diamond gemstone`), since improve mode already `put`s successful trinkets into the vault as a side effect. No special-casing needed: a component is a component.

### Orders

```ts
export type QualitySpec =
  | { kind: 'atLeast'; min: number }   // "97+"
  | { kind: 'exact'; value: number }   // "99"
  | { kind: 'range'; min: number; max: number }; // "95-98"

export interface CraftOrder {
  id: string;
  itemName: string;
  quantityRemaining: number;
  quantityTotal: number;
  qualitySpec: QualitySpec;
  createdAt: number;
}
```

Orders are a **FIFO queue** — one order active at a time, in the order added. Persisted per-character in localStorage (same module pattern as `crafting-helper-storage.ts`'s skill-level tracker: lazy load, debounced write), so the queue survives a page reload. Storage key: `shatteredarchive.plugins.crafting-helper.orders.<characterKey>`.

## State machine

Order mode is a second top-level mode alongside improve mode, sharing the same underlying pull→craft→branch loop shape but with its own entry point, its own "what's next" resolution, and its own post-success handling. The two modes are mutually exclusive at runtime (starting one while the other runs is rejected, same as improve mode already rejects `start` while not idle) — they share the plugin's single state machine instance since a character only crafts one thing at a time regardless of mode.

### Generalized pull loop

Today's `pulling_material` state pulls exactly one material. It becomes `pulling_components`, tracking a component index into `resolvedRecipe.components`:

1. Send `get <components[i].qty> '<components[i].material>' vault`.
2. Start `pullConfirmTimeoutMs`. No vault-failure line within the timeout → assume success, advance `i`.
3. Vault-failure line → `error_stopped`, naming the specific missing component. The order stays queued untouched (not mutated, not dequeued) so `crafthelper order start` can resume later once restocked. (Improve mode: same behavior it has today, just expressed as a 1-element loop.)
4. All components pulled → send `craft <verb> '<resolvedRecipe.outputName>'`, enter `crafting`. No timeout on the craft step itself (unchanged rationale: higher-tier/multi-component crafts can take a while, and one of the three outcome lines always eventually arrives).

### Outcome handling (both modes, revised)

- **`failed_no_loss`** — unchanged: resend the same craft command, no vault trip.
- **`failed_destroyed`** — **behavior fix, applies to both modes:** the destroyed-outcome message is unreliable — it doesn't always mean every (or even any) pulled component was actually lost. Rather than trust it and blindly re-pull, the plugin now sends a best-effort `put <qty> '<material>' vault` for **every** component in the recipe (regardless of whether it actually survived — `put` on something not held is assumed to no-op harmlessly, same assumption already made for successful-craft `put`s), paced by `commandPacingDelayMs` between each, and only then restarts the pull loop from component 0. This normalizes inventory to a known-empty state before re-pulling, without needing to detect which specific component(s) survived.
- **`success`** — this is where the two modes diverge (`handleCraftSuccess`):
  - **Improve mode** (unchanged): `put 1 '<trinket>' vault`, then a fresh pull cycle.
  - **Order mode** (new): send `lore '<outputName>'`, enter a new `checking_quality` state with `loreResponseTimeoutMs`.
    - Matching `Condition: <word> (<N>%)` line arrives → parse `N`, compare against the active order's `qualitySpec`:
      - **In spec** → `put 1 '<outputName>' <orderHoldingContainer>`, decrement `quantityRemaining`.
        - Reaches 0 → mark order complete, dequeue it (persist), and if the queue has another order, immediately resolve and start it (peek → resolve recipe → pull loop from component 0). Empty queue → `idle`.
        - Still > 0 → pacing delay → pull loop again for the same order.
      - **Off spec** → look up `N` in `qualityContainerMap` (falls back to `vault` if uncovered) → `put 1 '<outputName>' <container>` → pacing delay → pull loop again for the *same* order (this attempt doesn't count toward `quantityRemaining`).
    - No `Condition:` line within `loreResponseTimeoutMs` → `error_stopped` ("couldn't verify quality of '<outputName>' — stopped rather than guess where to route it"). The crafted item is deliberately left wherever it landed (player's inventory) rather than auto-putting it anywhere, since its quality — and therefore correct destination — is unknown.

### Order lifecycle commands

All under the existing `crafthelper` alias prefix (confirmed necessary to avoid colliding with the game's own `craft`/`order` verbs, same reasoning as the original `crafthelper start/stop/status` rename):

- **`crafthelper order add <qty> '<item name>' <quality-spec>`** — validates `item name` exists in `ORDER_ITEM_RECIPES` (unknown → terminal error, nothing queued) and `quality-spec` parses (`97+` / `99` / `95-98`; malformed → terminal error, nothing queued). Appends to the persisted queue, prints the assigned order id.
- **`crafthelper order list`** — prints each queued order: id, item, remaining/total qty, quality spec, and which is active.
- **`crafthelper order remove <id>`** — removes a queued order by id. Removing the currently-active order while mid-cycle: finish the in-flight pull/craft step (never interrupt mid-command, same discipline as `stop`), then treat it like the queue advancing normally (move to next order or idle) rather than continuing to craft toward a removed order.
- **`crafthelper order start`** — only when idle. Empty queue → terminal message, no-op. Otherwise peeks the oldest order, resolves its recipe from `ORDER_ITEM_RECIPES` (missing/unknown → terminal error, order left queued), begins the pull loop.
- **`crafthelper order stop`** — same semantics as `crafthelper stop`: sets a flag checked only at the next natural checkpoint (start of a pull loop, or after a no-loss recraft decision), never mid-command.
- **`crafthelper order status`** — active order (item, remaining/total qty, quality spec), queue depth, session counters (attempts, in-spec routed, off-spec routed, destroyed, no-loss, skill gains — skill gains still apply since crafting order items presumably also trains the skill).

### Quality spec parsing

```ts
export function parseQualitySpec(raw: string): QualitySpec | null {
  // "97+"    -> atLeast 97
  // "99"     -> exact 99
  // "95-98"  -> range 95-98
}

export function qualityMatchesSpec(quality: number, spec: QualitySpec): boolean;
```

### Quality line parsing

```ts
const CONDITION_RE = /Condition:\s*[\w\s]+\(\s*(\d+)%\s*\)/;
export function matchItemCondition(line: string): number | null;
```

**Unverified against a real log corpus** — same caveat the original outcome-text patterns carried (this session's worktree can't reach the Windows log path referenced in `plugin-authoring.md`). Treat the first live `crafthelper order start` run as the verification step for this pattern specifically, same discipline as before.

## Config schema additions

| Field | Type | Default | Purpose |
|---|---|---|---|
| `orderHoldingContainer` | string | `orders` | Where in-spec completed order items go. |
| `qualityContainerMap` | textarea | (empty, with placeholder example) | Pipe-delimited `<range> \| <container>` rows, e.g. `90-94 \| common`. Quality not covered by any row → `vault`. |
| `loreResponseTimeoutMs` | number | `2000` | How long to wait after `lore` for the `Condition:` line before erroring out. |

`ORDER_ITEM_RECIPES` is **not** a config field (explicit decision — hardcoded source data, not user-overridden).

## Files

| File | Change |
|---|---|
| `crafting-helper.plugin.ts` | Generalize `Recipe`/pull loop as above; add order state, `ORDER_ITEM_RECIPES`, quality-spec parsing/matching, `matchItemCondition`, order-mode `resolveNextRecipe`/`handleCraftSuccess` implementations, `checking_quality` state, order alias commands; fix destroyed-outcome put-back for both modes. |
| `crafting-helper-storage.ts` | Add persisted order-queue get/set/mutate functions alongside the existing skill-level tracker, same lazy-load/debounced-write pattern. |
| `crafting-helper.plugin.test.ts` / new `crafting-helper-storage.test.ts` additions | Cover: quality-spec parsing (all three kinds, boundary values), `matchItemCondition`, order queue FIFO behavior, in-spec vs off-spec routing, order completion → auto-advance, destroyed → put-back-then-repull for both single- and multi-component recipes, unknown item name on `order add`/`order start`, vault failure mid-multi-component-pull leaves the order queued untouched, `order remove` of the active order mid-cycle. |

## Testing / verification

Same verification bar as the original plan: `tsc --noEmit`, full build, full Jest suite (pure functions + state-machine integration against a mock `PluginRuntimeApi`), and a live-server smoke test once merged — particularly for the two unverified-against-real-logs patterns (`Condition:` regex, and confirming the destroyed-message unreliability behaves as expected with the put-back fix in practice).

## Out of scope (unchanged from original plan)

- Delivery/turn-in of completed orders to the requester — manual.
- The other 4 craft skills' `ORDER_ITEM_RECIPES` entries and tier tables — added later, config/data-only additions.
- Any UI beyond the existing HUD widget and terminal command responses.
