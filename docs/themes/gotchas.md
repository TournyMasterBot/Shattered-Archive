# Theme-engine gotchas

Real bugs hit while building the theme-registry engine and the `slate-amber`
theme (full history: `.ai-plans/20260920-0005-hud-theme-engine.md`). Each
entry is a symptom you might actually see, why it happens, the fix, and how
it was actually caught — several of these looked completely fine in a
screenshot or a passing test suite and were only caught by measuring the real
DOM or watching the real console.

## 1. The terminal portal container must never change identity

**Symptom:** switch themes live and the terminal's scrollback vanishes —
you're staring at a fresh, empty terminal, even though the connection never
dropped.

**Root cause:** `MainContainer.tsx` renders `<Terminal/>` exactly once via
`createPortal(<Terminal/>, container)`. The first implementation passed the
*current shell's own slot div* as `container` — reasonable-sounding, since
that's "where the terminal should go." But React's reconciler treats a
portal's container as part of the portal fiber's identity: pass a
**different** container on a later render (which a theme switch does, since
the new shell renders its own, different slot div) and React unmounts the
old portaled subtree and mounts a fresh one, instead of moving it. That's
exactly the remount — and the `useTerminal.ts`-created xterm.js instance
disposal — this hoist exists to avoid.

**Fix:** the portal's container must be a single, detached DOM node created
**once** (`const [terminalHost] = useState(() => document.createElement('div'))`)
and passed to `createPortal` unconditionally, for the app's entire lifetime.
Getting it to the *right visual spot* is a separate, plain DOM operation: a
`useEffect` imperatively `.appendChild()`s that same node into whichever
shell's slot (`terminalSlotRef`'s target) is currently attached.
`appendChild` on a node that already has a parent **moves** it (removes then
reinserts) — it doesn't recreate anything, so the live xterm canvas survives.

**How it was caught:** not by inspection, and not by a unit test (a mocked
shell in a test never exercises a real container-identity change) — by a
live Playwright script (`theme-live-switch-durability.mjs`) that seeded a
marker line into the terminal, switched themes, and checked the marker was
still there. It wasn't, on the first version.

## 2. A flex child that isn't itself `flex` breaks Terminal's own sizing

**Symptom:** the terminal renders, keeps its scrollback across a live switch
(gotcha #1's fix is in place), but doesn't fill its panel — a chunk of dead
black space between the visible terminal content and the rest of the panel's
background.

**Root cause:** `Terminal.tsx`'s own root divs
(`playAreaTerminalWrapper`/`playAreaTerminal`, `Terminal.module.scss`) size
themselves via `flex: 1; min-height: 0`. That only does anything when their
**direct parent** is `display: flex` — true of every shell's own terminal
slot (`.terminalBody`, `.playAreaTerminalShell`) by design. The
`terminalHost` portal container from gotcha #1 sat between the slot and
Terminal's wrapper, and it was only given `width: 100%; height: 100%` — not
`display: flex`. So `Terminal`'s own flex rules went inert one level deeper
than before: its rendered height collapsed to its content's auto size, while
the slot's own black background still correctly filled the full
flex-allocated space around it.

**Fix:** give `terminalHost` `display: flex; min-height: 0; min-width: 0;`
too — the same role every shell's own slot already plays.

**How it was caught:** a user screenshot from the real browser (not a
Playwright check — this slipped past the first live-verification pass
entirely, since that pass only checked that seeded *content* was present,
never that it filled the expected *space*). See #7.

## 3. The bordered-panel title needs less clearance than you'd guess

**Symptom:** the gap between the menu bar and the top of a themed panel
looks disproportionately large — bigger than seems necessary even accounting
for an embedded title.

**Root cause:** the embedded-title treatment
(`styles/_BorderedPanel.scss`'s `borderedPanelTitle` mixin — a classic
box-drawing look, title text poking up through the top border line) positions
the title at `top: -1.5em` relative to the panel. Its own comment says the
caller needs "at least ~1.5x this element's own font-size" of padding above
the panel to avoid clipping — i.e. `1.5rem` at the default `1rem` title
font-size. The first implementation reserved `2rem`, a round-number
guess that left about 8px of unnecessary dead space.

**Fix:** match the mixin's own stated minimum exactly (`1.5rem`), not a
rounder-looking number. Verify with the title actually **populated**
(dispatch a real `shatteredarchive:identity-updated` event) before shipping
a tighter value — the risk of clipping is invisible when disconnected, since
there's no title text to clip.

**How it was caught:** a user-annotated screenshot. Fixed by reading the
mixin's own documented contract rather than guessing at a new number.

## 4. A panel's background must match what fills it, or you get a visible seam

**Symptom:** the terminal looks like it doesn't quite "touch" its own
rounded corner at the bottom — a thin strip of slightly-lighter color between
the terminal's content and the panel's edge.

**Root cause:** two independent, both-correct-in-isolation facts combine
badly. First: xterm.js's row-fit essentially never consumes 100% of its
container's pixel height exactly — a fixed row height rarely divides a
container height evenly, so there's always a small leftover strip at the
bottom. Every terminal emulator has this; it's invisible as long as the
leftover strip's background matches the terminal's own fill. Second: the
theme skin gave every panel type (`sa-hud-terminal-panel` included) the same
shared `background: var(--sa-panel-bg)` — a dark slate gray, not pure black.
That's correct for panels with real visible chrome (vitals, chat, affects).
But the terminal's content is **always** pure black (xterm sets
`background-color: rgb(0,0,0)` on its own viewport, independent of any
theme) — so that ordinarily-invisible leftover strip showed the panel's
slate-gray chrome instead, as a visible seam.

**Fix:** give `.sa-hud-terminal-panel` its own `background: #000` in the
theme skin, separate from the other panels' shared `--sa-panel-bg`. Border
color/radius can still be shared — it's specifically the background that
needs to match the content.

**General rule:** if a panel's content has an inherent, non-theme-able fill
color, that panel's own chrome background needs to match it, not your
theme's generic panel-background token.

**How it was caught:** a user-annotated screenshot, after a dead-end
diagnostic — see #6 for why the first one (`elementFromPoint`) was
misleading.

## 5. A hook can look fine and still only work by accident

**Symptom:** a hook's remount-seeding test passes... until it doesn't, and
when it fails the failure looks like it shouldn't be possible — the hook
*looks like* it reads from the right cache.

**Root cause:** `useRoomHeader.ts` seeded its `roomName`/`sector` state from
`roomDataStore.ts`'s cache correctly — but it never wrote to that cache
itself. A completely different hook, `useCompassBlock.ts`, happened to be
the one listening to the same `game:room-data` event and writing to that
shared store, as a side effect of its own, unrelated concern (exit
availability). Seeding worked, but only by accident, contingent on
`useCompassBlock` happening to be mounted in the same shell alongside
`useRoomHeader` — which every existing shell did, until it wouldn't.

**Fix:** every hook that needs to survive a remount should read *and* write
its own cache directly, matching the pattern in
[creating-a-theme.md](./creating-a-theme.md#f-live-switching-your-hooks-must-not-go-blank-on-remount) —
don't rely on some other hook's side effect to keep your cache warm.

**How it was caught:** a plain Jest test for the remount-seeding behavior,
written specifically to prove this — not live Playwright, not inspection.
Worth calling out on its own because it's a good example of how a hook can
pass a shallow "does it read from a cache" check while still being broken,
if you don't also check what *writes* to that cache.

## 6. `elementFromPoint()` is not proof of what's actually painted

While chasing gotcha #4, the first hypothesis was "the corner-radius clipping
itself is broken" — plausible, since the symptom really did look like a
square corner. The check used `document.elementFromPoint()` at a coordinate
that's geometrically outside an 8px-radius rounded corner (but well inside a
square one), reasoning that if the terminal's own element is still the
topmost hit there, the rounding isn't actually clipping.

That test returned "square" on 3 of 4 corners — a false positive. Browser
hit-testing for an element's **own box** does not reliably follow that same
element's `border-radius`/`overflow: hidden` for *itself* (it does correctly
prevent a *child's* clipped-away content from being hit, which is a
different thing). A genuinely magnified screenshot (4x device scale, a tight
pixel crop) showed the corners were rounded correctly all along — the real
issue was the color seam in #4, not a shape one.

**Rule of thumb:** for "is X actually the shape/size I think it is" claims,
trust `getBoundingClientRect()` (geometry) and a real magnified screenshot
(what's actually painted). Don't trust `elementFromPoint`/hit-testing as a
proxy for either — it answers a related but different question.

## 7. A 0px box gap is not the same as a 0px visual gap

Two different verification passes checked "does the terminal fill its slot,"
using two different measurements, and got two different (both correct, for
what they measured) answers:

- `.terminalBody`'s `getBoundingClientRect()` vs. `#play-area-terminal-root`'s
  — these matched exactly (0px gap). This proves the **CSS/DOM layout
  chain** is correct: the container sizes are right.
- Whether the terminal's *rendered content* (`.xterm`/`.xterm-rows`, or
  simply looking at a real screenshot) actually fills that container — this
  is a **separate** question, and it was the one that was actually broken
  (gotcha #2 first, then the color-seam version of the same underlying
  "doesn't visually reach the edge" symptom in #4).

**Rule of thumb:** "the boxes match" and "it looks filled" are different
claims requiring different verification. Check both, don't assume one
implies the other — a script that only checks bounding-rect equality (like
`terminal-fill-check.mjs`) will pass cleanly while gotcha #4's seam is still
fully visible.

## 8. CSS-Module class names are not stable — theme CSS needs its own classes

**Symptom (if you get this wrong):** a theme's skin works right after you
write it, then silently stops matching anything after an unrelated rebuild.

**Root cause:** Vite/postcss-modules hashes every class name in a
`*.module.scss` file, and that hash is not guaranteed stable across builds.
A theme skin file selecting `.CompactVitalsRow_hp__a1b2c` will eventually
select nothing.

**Fix (the established convention, not a one-off patch):** every element a
theme might want to target renders a plain, hand-written literal class name
**alongside** its module class —
`className={\`${styles.vitalsRow} sa-hud-vitals-row\`}`. Theme skin files
select only these stable `sa-hud-*` classes and `data-*` state attributes,
never a module class. See [creating-a-theme.md](./creating-a-theme.md#d-styling-two-layers-never-mix-them).

## 9. Plugin auto-enable ordering: register before activate

If a theme's `onActivate` calls `pluginHost.enable('your-plugin')` and
nothing happens — no error, the plugin just never turns on — the most likely
cause is ordering: `pluginHost.enable()` on a plugin id that hasn't been
`registerModule()`-d yet is a **silent no-op**. In `MainContainer.tsx`, the
effect that calls `activeTheme.onActivate?.()` is deliberately declared
*after* the effect that registers every core plugin, specifically so this
can't happen — if you're wiring something similar elsewhere, preserve that
ordering (effects run in declaration order within one component).

## 10. A narrow shell isn't optional if your theme has real visual identity

If you don't provide a `NarrowShellComponent`, `resolveActiveTheme` silently
falls back to **`default`'s** shell (and styling) below your
`narrowBreakpoint` — not a scaled-down version of your own theme. For a
theme that's mostly a color palette on top of the existing layout, that's a
reasonable v1 tradeoff. For a theme with a genuinely different structure
(different panel arrangement, different sizing philosophy), skipping this
means your theme effectively disappears — reverts to looking like `default`
— the moment someone resizes below 900px or opens the client on a phone.
Decide this deliberately, not by omission; `CompactLayoutShellNarrow.tsx` is
the worked example if you do need one.
