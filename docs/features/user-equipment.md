# Equipment Capture & Delta System
*(Human-friendly guide + AI-maintainer addendum)*

> **Status (Updated Expectations):** Deltas are allowed to patch the Full Gear snapshot **optimistically** between `eq` captures. `eq` is still the most authoritative, but deltas keep the UI current during normal play (including swaps like **gem pouch ↔ belt**).

---

## Summary

The Equipment system tracks what your character is wearing/wielding and shows it in the UI in two places:

- **Current Gear (Hotbar):** a small set of “important” slots (wielded, secondary, shield, sheathed)
- **Full Gear (Snapshot):** the larger “everything we know” list shown in the Equipment modal

It learns equipment from **two sources**:

1. **Full capture (`eq`)** — a full snapshot of many slots at once (best source of truth)
2. **Live deltas** — small changes inferred from regular game messages like “You wear …” or “You stop using …”

The key idea:  
**`eq` corrects reality; deltas keep things responsive in-between.**

---

## What’s stored

### Current Gear (Hotbar)
Hotbar includes only:

- `wielded`
- `secondary`
- `shield`
- `sheathed`

Hotbar entries can be marked **dirty** when they come from deltas (meaning “best effort, not fully confirmed yet”).

### Full Gear (Snapshot)
Snapshot is the latest “full gear” record. It is updated by:

- `eq` captures (authoritative overwrite)
- delta patches (optimistic / best-effort updates)

**Important:** Deltas must never “invent” state. They only patch snapshot slots when the game output clearly indicates which slot is involved.

---

## How the system learns equipment

### 1) Full Equipment Capture (`eq`)
When the player uses the in-game `eq` command, the game prints a list like:

```
You are using:
<worn on finger> a ring of power
<wielded> the Magius Staff
...
```

The client:

- Detects the `You are using:` header
- Captures the following `<slot>` lines until the block ends
- Parses each line into a canonical slot key
- Stores the result as the latest **snapshot**

**Expectations**
- `eq` overwrites the snapshot with the newest truth.
- If anything drifts or goes stale, `eq` is the best way to re-sync.

---

### 2) Equipment Deltas (Live Updates)
Deltas come from normal gameplay text such as:

- **Wield**
  - `You wield {item}.`
  - `You wield {item} as a secondary weapon.`

- **Wear**
  - `You wear {item} {slot phrase}.`

- **Stop using / remove**
  - `You stop using {item}.`

- **Disarm**
  - `DISARMS you and sends your weapon flying!`

**Expectations**
- Deltas may update:
  - Hotbar (Current Gear)
  - Snapshot (Full Gear)
- Deltas should be conservative:
  - Patch only slots the message clearly identifies
  - Avoid overwriting unrelated slots

---

## Game-specific rules the delta system must enforce

### Dual-wield removal rule
If the player manually removes their **primary weapon** while dual wielding, **both weapons are removed**.

What this means in practice:
- A single `You stop using ...` might require clearing:
  - `wielded`
  - `secondary weapon`

### Disarm rule
Disarm messages do not specify which weapon was lost.

So the system clears:
- `wielded`
- `secondary weapon`

…and waits for either:
- another wield message, or
- a fresh `eq` capture

### Wear slot variability
The game describes wear locations in many ways:

```
You wear an amulet around your neck.
You wear a shield as a shield.
You wear boots on your feet.
You wear an engraved leather belt about your waist.
```

So:
- Slot detection must be pattern-based
- Not every wear phrase may be recognized immediately
- `eq` remains the strongest correction tool

---

## Slot swaps (pouch ↔ belt) — the critical behavior

Observed sequence:

```
You stop using a gem pouch.
You wear an engraved leather belt about your waist.
```

…and later:

```
You stop using an engraved leather belt.
You wear a gem pouch about your waist.
```

**Expectation**
- The delta pipeline must clear the **correct snapshot slot** for the removed item
- Then apply the new item to that same slot (here: the waist slot)

If the “stop using” step fails to match the snapshot slot (due to ANSI, articles, suffix differences), the snapshot will incorrectly keep the old item and appear stale.

---

## Matching & normalization (required for correctness)

Game output and snapshot output rarely match *exactly*:

- Live output may contain ANSI color codes
- Snapshot lines often include wear-location suffixes (e.g., `about your waist`)
- Articles and formatting can differ (e.g., `a belt` vs `an engraved leather belt`)
- The game may omit or include extra words

**Therefore, stop-using must match tolerantly:**
- Strip ANSI codes
- Trim whitespace
- Normalize article differences (`a` / `an` / `the`)
- Allow suffix differences (e.g., snapshot includes `about your waist` but stop-using does not)

This tolerance is essential for correct swap handling.

---

## What deltas should and should not do

### Deltas SHOULD
- Patch snapshot slot when the message clearly indicates the slot (wear/wield)
- Clear a snapshot slot when “stop using” can be matched to a specific slot
- Clear weapon slots on disarm
- Patch hotbar for relevant events (wield, secondary wield, shield wear, sheathed changes if supported)

### Deltas SHOULD NOT
- Guess which slot an ambiguous “stop using” refers to
- Overwrite unrelated snapshot slots
- Assume a delta implies complete state
- Rely on exact string equality when ANSI / formatting differs

---

## Relevant files (maintainer map)

### Hooks
- `apps/game-client/src/hooks/useEquipmentCapture.ts`
  - Listens to `game:terminal-data`
  - Detects `eq` output blocks and produces full snapshots

- `apps/game-client/src/hooks/useEquipmentDeltas.ts`
  - Listens to `game:terminal-data`
  - Parses and applies delta events
  - Responsible for hotbar updates **and** snapshot patching (best-effort)

- `apps/game-client/src/hooks/useEquipmentState.ts`
  - React bridge to read equipment state/profile/prefs from the store

### Parsing
- `apps/game-client/src/features/equipment/eq-parse.ts`
  - Parses the `eq` snapshot block

- `apps/game-client/src/features/equipment/eq-delta-parse.ts`
  - Parses individual gameplay lines into a consistent delta “event” shape

### Store / state
- `apps/game-client/src/features/equipment/equipment-store.ts`
  - Stores hotbar state, snapshot, and preferences
  - Exposes setters for authoritative (`eq`) and advisory (`delta`) updates

### UI
- `apps/game-client/src/components/EquipmentModal.tsx`
  - Displays hotbar + snapshot
  - Reads state only (no parsing)

- `apps/game-client/src/styles/EquipmentModal.module.scss`
  - Layout + scroll behavior for large gear lists

---

## Common pitfalls

- “Stop using” doesn’t clear the correct snapshot slot (swap appears broken)
- Exact string equality breaks due to ANSI or suffix differences
- Clearing multiple slots because matching logic is too broad
- Forgetting dual-wield or disarm rules
- Patching snapshot for ambiguous events (inventing state)

---

## Maintenance philosophy

- Prefer correctness over cleverness
- Let `eq` correct drift
- Let deltas keep the UI responsive between captures
- Be conservative with ambiguous text
- If game output changes, validate against `eq` output first, then extend delta patterns

---

# AI Maintainer Addendum (Implementation Guidance)

This section is written for an AI assistant helping maintain the system.

## Non-negotiable constraints
- Do **not** guess missing file contents. Ask for the file or sample logs first.
- `game:terminal-data` is the correct browser event name for terminal output.
- Deltas may patch snapshot, but must remain conservative and slot-specific.

## Event-shape contract (recommended)
Ensure `eq-delta-parse.ts` returns a **discriminated union** or another consistent shape that downstream code can handle safely.

Example approach:
- `kind: 'wield' | 'wear' | 'stop_using' | 'disarm' | ...`
- Include `slot` only when known
- Include `item` where relevant

If you change the shape, update all consumers in one pass (especially `useEquipmentDeltas.ts`).

## Snapshot patching checklist
When processing a delta line:

1. Strip ANSI and normalize text
2. If the line indicates a **known slot** (wear/wield):
   - Patch snapshot slot directly
3. If the line is **stop using**:
   - Match the removed item to an existing snapshot slot using tolerant matching
   - Clear only that slot if confidently matched
4. Apply game-specific weapon rules:
   - Disarm clears both weapon slots
   - Dual-wield primary removal clears both if applicable

## Tolerant matching strategy (suggested)
Maintain multiple representations for comparison:
- raw (as printed)
- ansi-stripped
- normalized “comparison” form

Normalize by:
- lowercasing
- removing ANSI
- trimming extra whitespace
- stripping leading articles (`a`, `an`, `the`)
- optionally stripping known wear-location suffixes during comparison

Then:
- Prefer exact normalized match
- If needed, allow “contains” match in one direction only (to avoid false positives)
- Never clear multiple unrelated slots from one ambiguous line

## Minimum test scenarios (manual or automated)
Use real log lines whenever possible.

1. **Swap (waist)**
   - stop using gem pouch
   - wear engraved leather belt about your waist
   - then reverse the swap
   - Expect snapshot waist slot to reflect the new item each time

2. **ANSI noise**
   - stop using line contains ANSI colors
   - snapshot contains plain text
   - Expect matching to succeed

3. **Dual wield**
   - wield primary + wield secondary
   - stop using primary
   - Expect both cleared

4. **Disarm**
   - disarm line occurs
   - Expect both weapon slots cleared

## Debugging tips
- Log: parsed event kind, normalized item text, matched slot (if any), and the applied snapshot/hotbar patch.
- If swap appears broken, inspect:
  - whether stop-using matched the snapshot slot
  - whether wear applied to the same slot
  - whether normalization removed ANSI/articles/suffixes correctly

---

## Slot Phrase Mapping Reference (Game Output → Snapshot Slot)

This section documents **observed / intended text mappings** between gameplay output and the canonical `<slot>` names used in the `eq` snapshot.

These mappings exist to help maintainers extend delta parsing safely and to keep **snapshot patching** accurate during swaps.

### Mapping list

- `<used as light>`
  - **WEAR:** `You light {item} and hold it.`
  - **REMOVE:** `You stop using {item}.`

- `<worn on finger>`
  - **WEAR:** `You wear {item} on your {left|right} finger.`
  - **REMOVE:** `You stop using {item}.`

- `<worn around neck>`
  - **WEAR:** `You wear {item} around your neck.`
  - **REMOVE:** `You stop using {item}.`

- `<worn on torso>`
  - **WEAR:** `You wear {item} on your torso.`
  - **REMOVE:** `You stop using {item}.`

- `<worn on head>`
  - **WEAR:** `You wear {item} on your head.`
  - **REMOVE:** `You stop using {item}.`

- `<worn on legs>`
  - **WEAR:** `You wear {item} on your legs.`
  - **REMOVE:** `You stop using {item}.`

- `<worn on feet>`
  - **WEAR:** `You wear {item} on your feet.`
  - **REMOVE:** `You stop using {item}.`

- `<worn on hands>`
  - **WEAR:** `You wear {item} as a shield.`
  - **REMOVE:** `You stop using {item}.`

- `<worn as shield>`
  - **WEAR:** `You wear {item} on your hands.`
  - **REMOVE:** `You stop using {item}.`

- `<worn about body>`
  - **WEAR:** `You wear {item} about your torso.`
  - **REMOVE:** `You stop using {item}.`

- `<worn about wrist>`
  - **WEAR:** `You wear {item} around your {left|right} wrist.`
  - **REMOVE:** `You stop using {item}.`

- `<wielded>`
  - **WEAR:** `You wield {item}.`
  - **REMOVE:** `You stop using {item}.`

- `<held>`
  - **WEAR:** `You hold {item} in your hand.`
  - **REMOVE:** `You stop using {item}.`

- `<floating nearby>`
  - **WEAR:** `You release {item} and it floats next to you.`
  - **REMOVE:** `You stop using {item}.`

- `<secondary weapon>`
  - **WEAR:** `You wield {item} as a secondary weapon.`
  - **REMOVE:** `You stop using {item}.`

- `<sheathed>` (two wear phrasings observed/intended)
  - **WEAR:** `You slip {item} over your shoulder.`
  - **WEAR:** `You sheath {item}.`
  - **REMOVE:** `You stop using {item}.`

- `<worn as quiver>`
  - **WEAR:** `You put {item} on your shoulder.`
  - **REMOVE:** `You stop using {item}.`

