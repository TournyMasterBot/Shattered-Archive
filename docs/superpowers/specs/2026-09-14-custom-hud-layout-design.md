# Custom HUD Layout — Design

Status: draft, awaiting review
Owner: hex337
Scope: `apps/game-client`

## 1. Goal

Give the player a compact, alternate arrangement of the main play view —
terminal + a boxed sub-window (HP/Mana/Move gauge, room name + exits,
command input) on the left, chat + affects stacked on the right — with a
"Slate & Amber, Soft Glow" visual treatment, as a real opt-in feature rather
than a CSS override fighting the build.

## 2. Background — why not the paths already tried

Three approaches were explored in conversation before this one, each with a
real limitation:

- **Pure CSS via the built-in Custom Styles override.** Works, but every
  selector has to hash-substring-match Vite's CSS-Module class names
  (`[class*="roomHeader_"]`), which is brittle across rebuilds, and several
  things (relocating a component to a different part of the DOM, showing the
  character name) required progressively hackier tricks (`position: fixed`
  teleporting, `font-size: 0` + `::before` text swaps).
- **The `core-plugins/` plugin system.** Confirmed to have no DOM-mutation or
  React-state API by design ("NO React" in its own docs) — its only visual
  output is CSS injected the same brittle way as the Custom Styles box.
  Making it drive real component state would require a deliberate
  `PluginRuntimeApi` extension plus per-component hook edits anyway.
- **UserScripts (the Script Sandbox).** Confirmed to have real, unsandboxed
  `window`/`document` access today (undocumented byproduct of `new
  Function`-based execution, not a designed feature) — technically capable,
  fully personal/local, zero repo changes. Rejected as the long-term answer
  because it's unadvertised, per-browser only, and not something we'd want
  to build a "shareable" feature on top of.

**The actual precedent that works**: `feature/AutoLevel-Redesign`'s
`useAutoLeveling` hook + `AutoLevelingEngine` + `AutoLevelingWizard.tsx`.
A plain engine module holds computed state; a hook exposes it via
`useState`, updated through callbacks the engine calls; the component
renders that state directly, including setting attributes straight from
state (`<span data-status={runState.status}>`,
`AutoLevelingWizard.tsx:301`). Ordinary, reviewable React — no event bus,
no DOM hacks, no plugin registry.

## 3. Data sources

All of the following already flow through the app; no new event plumbing
needed except the character name hook.

| Data | Current source | New plumbing needed? |
|---|---|---|
| Room name / flags / exits | `useRoomHeader.ts`, `useCompassBlock.ts` (consumed by `RoomHeader`/`CompassBlock` today) | No — reuse directly |
| HP / MP / Stamina, tick | `useStatusBlockViewModel` (`useLayoutShell.ts`, consumed by `StatusBlock` in `RightSidebar.tsx` today) — this is the version with real `"402 / 402"` value text; `FocusBarVitals`'s hook does not carry values, only percentages | No — reuse directly |
| Affects list | `useAffectsBlock.ts` (consumed by `AffectsBlock` today) | No — reuse component as-is |
| Chat messages | `useChatPane.ts` / chat-settings-store (consumed by `ChatPane` today) | No — reuse component as-is |
| Character name | `game:character-login` / `shatteredarchive:identity-updated` (dispatched from `userScriptRuntime.ts`'s `processGmcpEvent()` on GMCP `login_data`; also a `window.__SA_IDENTITY__` snapshot) — confirmed dispatched, **nothing currently consumes it** | **Yes** — one new small hook |

## 4. Architecture

### 4.1 New hook: `useCharacterIdentity.ts`

The only genuinely missing piece. Small hook, same shape as the existing
`use*` hooks in `apps/game-client/src/hooks/`:

```ts
export function useCharacterIdentity(): { characterName: string | null } {
  // ListenEvent('shatteredarchive:identity-updated', ...) -> useState
  // seed initial value from window.__SA_IDENTITY__ if present at mount
}
```

### 4.2 New components (additive, nothing existing is edited)

A parallel layout shell, chosen instead of the existing `LayoutShell` when
the setting is on — existing `LayoutShell`/`RightSidebar` are untouched:

- `components/hud/CompactLayoutShell.tsx` — the 2-column structure itself
  (left: terminal + sub-window; right: chat + affects), replacing
  `LayoutShell` at the call site in `MainContainer.tsx`.
- `components/hud/CompactVitalsRow.tsx` — HP/Mana/Move **and the
  opponent/enemy HP tracker** side by side with legible `X / Y` text, built
  from `useStatusBlockViewModel` plus a new `useOpponentStatus.ts` hook (see
  below).
- `hooks/useOpponentStatus.ts` — the enemy-tracking logic (`enemyUi` state,
  damage-chunk pulse, staleness timeout) currently lives as inline
  component state inside `StatusBlock` (`RightSidebar.tsx`), not exposed
  through `useStatusBlockViewModel`. Extracting it into its own hook is a
  small, behavior-preserving refactor — `StatusBlock` switches to calling
  the extracted hook instead of its inline `useState`/`ListenEvent`, with no
  change in what it renders — a pure extraction, not a behavior change (see
  §5 for the full list of existing files this design touches).
- `components/hud/CompactRoomRow.tsx` — character name (new) + room name +
  exits as `[N E]`, built from `useCharacterIdentity` + `useRoomHeader` +
  `useCompassBlock`'s exit-availability data.
- `Terminal`, `CommandInput`, `ChatPane`, `AffectsBlock` — reused
  unmodified, just placed in `CompactLayoutShell`'s real JSX instead of
  `LayoutShell`/`RightSidebar`'s.

### 4.2b Bordered panel treatment — terminal title

Inspired by classic box-drawing TUI panels (bordered box, title text
embedded directly in the border line, e.g. `┌─ Text Box ──────┐`) — applied
to the terminal panel specifically for now, with the character's name
(from `useCharacterIdentity`, already built for §4.2's room row — reused,
not duplicated) as the title text. Not applied to the other panels yet, per
the reference discussion, but worth keeping cheap to extend.

Implementation is a standard hand-rolled pattern (not `<fieldset>`/
`<legend>`, which carry form semantics that don't fit a game panel): a
bordered container, plus a small label positioned to straddle the top
border line, its background matched to "cut into" the line — written as a
reusable SCSS mixin (e.g. `borderedPanelTitle`) so applying this treatment
to another panel later is cheap, even though only the terminal uses it now.

This is a **baseline structural element**, not theme-specific — border +
embedded label is part of compact layout's own default look (§4.3), with
corner radius/color/glow left for each theme to decide like every other
panel. Slate & Amber uses its usual rounded corners here too, for
consistency with the rest of its panels (confirmed in review) rather than
breaking from it for TUI-style sharp corners.

### 4.3 Styling: baseline vs. theme are two independent layers

Layout and look are separate choices (confirmed in review), each with its
own setting — so there are two styling layers, handled differently:

- **Baseline (compact layout's own default look)**: ordinary
  `*.module.scss` CSS Modules, same convention as every other component in
  this codebase. `CompactLayoutShell`/`CompactVitalsRow`/`CompactRoomRow`
  get normal-looking, functional default styling — this is what you see
  with compact layout on and the theme off.
- **Theme (Slate & Amber / Soft Glow, and any future theme)**: a separate
  CSS asset that must target these components **from outside** their own
  module, so it uses **plain, hand-written class name strings in addition
  to** the module classes (e.g. `className={\`${styles.vitalsRow}
  sa-hud-vitals-row\`}`) — not instead of them. Vite/postcss-modules only
  hashes classes it processes as `*.module.scss`; the extra literal class
  is stable in the DOM forever, so a theme can target it directly and never
  needs hash-substring selectors. State that affects styling
  (available/unavailable exit, low-HP warning, run status, etc.) is exposed
  the way `AutoLevelingWizard` already does it: a `data-*` attribute set
  directly from React state (e.g. `data-available={hasExit}` on an exit
  token, `data-hp-warning={hpPct < 25}` on the HP row) — themes style off
  those too.

### 4.3b Sizing & resizers

`CompactLayoutShell` reuses the classic layout's sizing pattern
(`useLayoutSizing`-style CSS custom properties + drag handles +
localStorage persistence) rather than a new mechanism, extended with one
additional variable. Two resizable boundaries, both `clamp()`-based
(responsive by default across laptop vs. external-monitor sizes, with a
per-user drag override persisted on top — exactly how `--right-pane-width`
already works):

- **Left/right column split** — same `--right-pane-width` variable and
  drag handle the classic layout already uses.
- **Right column: chat height vs. affects+widget-slot height** — a new
  variable (e.g. `--sa-chat-pane-height`), new drag handle. This is the
  pane that benefits from more/less vertical room, same role
  `--bottom-pane-height` plays in the classic layout, just relocated since
  chat moved to the right column.

The left column's terminal-vs-sub-window boundary is **not** independently
resizable — the sub-window's rows (vitals, room+exits, command input) are
single-line content that doesn't benefit from extra height, the same reason
`CommandInput` isn't separately resizable from `Terminal` today. The
sub-window's height is the natural sum of its rows' intrinsic heights, not
a hardcoded constant; the terminal gets the rest.

**General principle (revised in review)**: fluid/intrinsic sizing by
default everywhere in this layout — a row is as tall as its content needs,
via ordinary flexbox, the way any normal React component would be sized.
This is actually easier here than it was in the earlier CSS-only iteration,
where `position: fixed` teleporting removed elements from document flow
entirely and forced hardcoded pixel guesses for every offset (`--sa-vitals-h`,
`--sa-roomrow-h`, etc.) — real components in real JSX don't have that
problem. Fixed pixel dimensions are reserved for the two cases above, where
a concrete number is genuinely needed to divide space between two
flex-growing regions, not used as a default. If a specific element turns
out not to work fluidly during implementation, fall back to a fixed size
for that element specifically rather than redesigning the whole approach.

### 4.4 Settings / toggles — layout and theme are independent

Two small stores, same pattern as `userStyleOverrideStore.ts`, and two
separate controls (not one combined toggle — confirmed in review):

- `features/hudLayout/hudLayoutStore.ts` — `getHudLayout()` /
  `setHudLayout('classic' | 'compact')`, localStorage-backed, defaults to
  `'classic'` (today's behavior, unchanged for everyone who doesn't opt in).
  `MainContainer.tsx` reads it once (a `useState` seeded from the store) and
  picks `CompactLayoutShell` vs `LayoutShell`.
- `features/hudLayout/hudThemeStore.ts` — `getHudTheme()` /
  `setHudTheme('default' | 'slate-amber')`, independent of the layout
  choice, defaults to `'default'` (baseline CSS-Modules styling, no theme
  CSS loaded).
- Both get their own row in a new "Layout" section in
  `GraphicsSettingsModal.tsx` (already the home for visual-presentation
  settings) — the theme selector is only meaningful (and only shown) when
  compact layout is on, since it's the only layout a theme targets today.

### 4.5 Theme CSS

The Slate & Amber / Soft Glow visual skin ships as a **bundled, selectable
theme** — a real CSS asset targeting the stable extra class names from
§4.3 (no more `position: fixed` relocation — everything is already in the
right place in real JSX). Matches the "shareable" goal directly: any player
can turn on compact layout + this theme without pasting anything. Not
structurally tied to compact layout — a future layout or a future theme
could mix independently, though only one pairing ships now.

### 4.6 Widget slots — plugin-extensible regions

Two named regions other features can fill without touching this layout's
code — **fluid, not fixed-size** (revised in review: try fluid everywhere
first, only fall back to a fixed footprint for a specific slot if it
genuinely can't work fluidly). Each slot takes its natural content height —
near-zero when empty, growing to fit a `{label, value}` line or two when
occupied — the same as every other row in this layout (§4.3b: fixed pixel
dimensions are the exception here, reserved only for the two resizer-driven
space divisions, not for content that can just size itself). Toggling a
plugin's widget on/off will reflow its neighbors; that's an accepted
tradeoff for genuine fluidity rather than something solved by reserving
dead space.

- `hud.bottomStrip` — a thin extra row in the left column's sub-window,
  between the room/exits row and the command input.
- `hud.rightColumn` — a region in the right column, below `AffectsBlock`,
  sized for something like a condensed status line or two, not a full
  custom panel. This is the one your AutoLeveling-run-monitor example would
  use — an "Enemy: &lt;name&gt;" or short run-status line, not the whole
  wizard UI.

**Why this needs a small, deliberate API addition rather than reusing
anything that exists**: confirmed in the earlier plugin-system research,
`PluginRuntimeApi` currently has no way to push *any* display data out —
not text, not markup, nothing. The fix keeps the same "structured data in,
host renders it" shape the API already uses for
`registerOmitRules`/`registerAction`, so a plugin still can't inject markup
or break layout:

```ts
// features/hudLayout/hudWidgetRegistry.ts
export type HudSlotId = 'hud.bottomStrip' | 'hud.rightColumn';
export type HudWidgetContent = { label?: string; value: string; variant?: 'default' | 'warning' | 'critical' };

// In-memory snapshot, same reason window.__SA_IDENTITY__ exists (§3): a
// CompactWidgetSlot that mounts AFTER the last publish (layout switched
// mid-session, or a page reload with compact already on) needs to read
// current state immediately, not just wait for the next change to fire.
const current = new Map<HudSlotId, { ownerId: string; content: HudWidgetContent }>();

export function getHudWidget(slotId: HudSlotId) {
  return current.get(slotId) ?? null;
}

// Single first-party mechanism everything publishes through — plugins via the
// PluginRuntimeApi wrapper below, trusted first-party code (e.g. the
// AutoLeveling hook) by calling this directly, same as e.g. AutoLeveling
// already calls DispatchEvent directly today rather than through a plugin API.
export function publishHudWidget(slotId: HudSlotId, ownerId: string, content: HudWidgetContent | null): void;
// updates `current`, then dispatches 'shatteredarchive:hud-widget-updated'
// {slotId, ownerId, content}; last publisher wins; publishing null only
// clears if ownerId matches the current occupant, so a disabled/stale
// owner can't clobber someone else's. CompactWidgetSlot reads
// getHudWidget(slotId) once at mount, then ListenEvent for updates after
// that — same two-part pattern useCharacterIdentity uses for identity.
```

```ts
// PluginRuntimeApi addition (types/types-client/src/plugins/plugin-base.ts + apps/game-client's features/plugins/pluginHost.ts)
setHudWidget(slotId: HudSlotId, content: HudWidgetContent | null): void
// thin wrapper: publishHudWidget(slotId, this plugin's manifest id, content)
// pluginHost should clear any slot a plugin owns on that plugin's onDisable,
// mirroring how its other per-plugin registrations already get torn down
```

A shared `components/hud/CompactWidgetSlot.tsx` (used for both slots)
subscribes to `shatteredarchive:hud-widget-updated` for its `slotId` and
renders the current occupant's `{label, value, variant}`, or collapses to
nothing when the slot is empty. v1 is **one occupant per slot** (last
publish wins) — a small stack of multiple simultaneous widgets in one slot
is a reasonable v2 if one slot turns out not to be enough, not built now.

**AutoLeveling example, concretely** (non-plugin producer, calls the
registry function directly rather than through `PluginRuntimeApi`):

```ts
// inside useAutoLeveling.ts, wherever it already tracks the current target
publishHudWidget('hud.rightColumn', 'autoleveling', { label: 'Enemy', value: enemyName });
```

## 5. File layout summary

```
apps/game-client/src/
  hooks/
    useCharacterIdentity.ts          (new)
    useOpponentStatus.ts             (new — extracted from StatusBlock, see §4.2)
  components/hud/
    CompactLayoutShell.tsx           (new)
    CompactVitalsRow.tsx             (new)
    CompactRoomRow.tsx               (new)
    CompactWidgetSlot.tsx            (new)
  features/hudLayout/
    hudLayoutStore.ts                (new)
    hudWidgetRegistry.ts             (new)
  features/plugins/
    pluginHost.ts                    (edited — wire setHudWidget, clear owned slots on disable)
  components/GraphicsSettingsModal.tsx   (edited — add Layout + theme selector)
  pages/MainContainer.tsx                (edited — pick shell component)
  components/RightSidebar.tsx            (edited — StatusBlock switches to useOpponentStatus, pure extraction)
  hooks/useAutoLeveling.ts               (edited, optional — publish the enemy-name example)

types/types-client/src/plugins/
  plugin-base.ts                     (edited — add HudSlotId/HudWidgetContent
                                       types + setHudWidget to PluginRuntimeApi;
                                       this is the shared @shatteredarchive/
                                       types-client package, not a game-client
                                       file — verified during plan-writing)
```

No edits to `LayoutShell.tsx`, `RoomHeader.tsx`, `CompassBlock.tsx`, or
`FocusBarVitals.tsx` — the classic layout is fully preserved as-is. Two
edits touch shared/existing code rather than being purely additive: the
`plugin-base.ts`/`pluginHost.ts` addition (small, mirrors the existing
`registerOmitRules` shape) and the `RightSidebar.tsx` extraction (behavior
-preserving — `StatusBlock` renders identically before and after).

## 6. Rollout / compatibility

- Default-off (`'classic'`) — zero behavior change for anyone who doesn't
  open the setting.
- Mobile (`≤900px`) is untouched; `CompactLayoutShell` is desktop-only,
  matching every other layout rule in this codebase (`min-width: 901px`).
- Fully reversible: flipping the toggle off returns to today's `LayoutShell`
  exactly, since nothing existing was modified.

## 7. Testing

- Unit test for `useCharacterIdentity` (mirrors existing hook tests —
  `ListenEvent` fires, state updates; seeds from `window.__SA_IDENTITY__`).
- Unit test for `useOpponentStatus` covering the staleness transition
  (`isEnemyActive` flipping after `ENEMY_STALE_MS`) and the damage-chunk
  timeout/cleanup — this extraction carries real stateful behavior (a
  `setInterval` staleness ticker, a pulse-animation timeout ref), not just
  state reshuffling, and a silent regression here would degrade a
  combat-facing feature for *every* player, not just compact-layout
  opt-ins, since `StatusBlock` (classic layout) uses the same hook after
  the extraction.
- Explicit manual before/after check of `StatusBlock` in the **classic**
  layout after the `RightSidebar.tsx` extraction — not assumed
  behavior-preserving from the refactor being "small," actually verified.
- Manual verification in a real browser (dev server), both layout modes, at
  desktop and the 900px boundary.
- No engine/business-logic changes beyond the extraction above, so no
  equivalent of the `autoleveling-engine.test.ts` scale of test surface is
  needed here.

## 8. Resolved decisions

From initial review:

- Settings home: `GraphicsSettingsModal.tsx`.
- Compact vitals row includes the opponent/enemy HP tracker (via extracted
  `useOpponentStatus.ts`).
- `hud.bottomStrip`: between the room/exits row and the command input.
- `hud.rightColumn`: below `AffectsBlock`.
- Slot occupancy: one occupant per slot for v1.

From the grill-me pass:

- Resizers: yes, two of them — left/right column split (reuses
  `--right-pane-width`) and right-column chat-vs-affects+widget-slot split
  (new) — both `clamp()`-based/responsive by default, drag-adjustable on
  top (§4.3b).
- Sizing philosophy: fluid/intrinsic by default everywhere; fixed pixel
  dimensions only for the two resizer-driven space divisions above, not
  used as a general default (§4.3b).
- Layout and theme are **independent** settings, not one combined toggle —
  compact layout gets its own plain-CSS-Modules baseline; the theme is a
  from-outside skin on top (§4.3, §4.4).
- `HudWidgetContent` stays narrow for v1 (`label?`, `value`, `variant?`,
  plain text only) — widen later from a real second use case, not
  speculatively now (§4.6).
- Widget slots are fluid, not fixed-size — near-zero when empty, grows to
  fit content when occupied; toggling a widget on/off reflows neighbors,
  accepted as a tradeoff for genuine fluidity (§4.6).
- `hudWidgetRegistry` keeps an in-memory current-value snapshot (not
  dispatch-only), so a slot that mounts after the last publish still shows
  the right thing immediately — same reason `window.__SA_IDENTITY__` exists
  (§4.6).
- Testing scope expanded to cover the `useOpponentStatus` extraction
  explicitly (staleness + damage-chunk timeout/cleanup), plus a manual
  before/after check of classic-layout `StatusBlock`, since that extraction
  carries real stateful behavior and a regression would hit every player
  (§7).
- Added a bordered-panel-with-embedded-title treatment (classic TUI style)
  for the terminal panel, titled with the character name — a baseline
  structural element (not theme-specific), written as a reusable mixin.
  Slate & Amber keeps its usual rounded corners here rather than breaking
  from it for a sharper TUI look (§4.2b).

## 9. Deferred to implementation

- Exact `data-*` attribute names/values.
