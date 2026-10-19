# Creating a HUD theme

This walks through building a new theme end to end. It assumes you've read
this folder's [README.md](./README.md) for the overall shape of the system.
Read [gotchas.md](./gotchas.md) too, or at minimum skim its headings — most of
it is "we tried the obvious thing and it broke in a way that isn't obvious
until it does."

## 1. The contract

Every theme is an entry in `THEME_REGISTRY`
(`apps/game-client/src/features/hudLayout/themeRegistry.ts`):

```ts
export interface ThemeDefinition {
  id: HudThemeId;
  label: string;
  ShellComponent: React.LazyExoticComponent<React.ComponentType<HudShellBaseProps>>;
  /** A theme's own narrow-viewport variant. If omitted, resolveActiveTheme
   *  falls back to 'default's shell at narrow widths. */
  NarrowShellComponent?: React.LazyExoticComponent<React.ComponentType<HudShellBaseProps>>;
  /** Width at/below which NarrowShellComponent (or the fallback) applies. Defaults to 900. */
  narrowBreakpoint?: number;
  /** Applies this theme's visual skin. Called whenever it becomes active. */
  loadStyles?: () => void;
  /** Called once whenever this theme becomes the resolved active theme,
   *  AFTER core plugins are registered. For auto-enabling a plugin this
   *  theme depends on. Never auto-disables anything. */
  onActivate?: () => void;
}
```

`HudThemeId` is a plain string union in `hudThemeStore.ts`
(`export type HudThemeId = 'default' | 'slate-amber';`) — adding a theme means
widening this union too.

Every shell component (`ShellComponent` and `NarrowShellComponent`, if you
have one) implements `HudShellBaseProps`
(`apps/game-client/src/components/hud/LayoutShellProps.ts`):

```ts
export interface HudShellBaseProps {
  isConnected: boolean;
  sendRaw: (data: string) => void;
  onOpenAutoLeveling?: () => void;
  autoLevelMode?: AutoLevelMode;
  autoLevelRunState?: AutoLevelRunState;
  onSightseeRescan?: () => void;
  terminalSlotRef: (el: HTMLDivElement | null) => void;
}
```

That's the *entire* surface `MainContainer.tsx` threads through to a shell.
Everything else your shell needs — sizing, resize handles, sub-components,
game state — it sources itself via its own hooks, the way `CompactLayoutShell`
does. This is deliberate: it's what lets a theme's shell diverge arbitrarily
in shape without `MainContainer.tsx` ever needing to know about it.

`terminalSlotRef` is **required, not optional**. See §3 below and
[gotchas.md](./gotchas.md#1-the-terminal-portal-container-must-never-change-identity)
— skip it and your theme silently renders no terminal at all.

## 2. Step by step

### a. Pick an id and label

Add your id to `HudThemeId` in `hudThemeStore.ts`, and pick a display
`label` for the Settings UI (`GraphicsSettingsModal.tsx`'s Theme `<select>`
already iterates whatever's in `THEME_REGISTRY` — you don't add a second
place for this).

### b. Build the shell component(s)

Your desktop shell is a normal React component: `React.FC<HudShellBaseProps>`.
Look at `components/hud/CompactLayoutShell.tsx` for a full worked example —
resizable columns, a bordered terminal panel, widget slots, the works — or
`components/hud/DefaultThemeShell.tsx` for the minimal adapter case (it's
just a thin wrapper around the pre-existing classic `LayoutShell`).

Decide whether you need a separate `NarrowShellComponent`. If your desktop
layout degrades reasonably at narrow widths, you can skip it and
`resolveActiveTheme` will fall back to `default`'s shell below your
`narrowBreakpoint` (900px unless you override it). If your theme has real
visual identity, build a narrow variant with the same styling — see
`CompactLayoutShellNarrow.tsx` — or your theme will visually disappear the
moment someone resizes the window or opens it on a phone.

Both `ShellComponent` and `NarrowShellComponent` should be lazy-loaded
(`React.lazy(() => import(...))`) so a theme nobody has selected never ships
its JS/CSS to a user who's on a different one. Verify this held after you're
done — see §8.

### c. The terminal slot

Your shell does **not** render `<Terminal/>` directly. Instead, render a bare
element and attach the ref callback:

```tsx
<div className={styles.terminalBody} ref={terminalSlotRef} />
```

`MainContainer.tsx` owns the single, real `<Terminal/>` instance and portals
it into whichever slot is currently attached. This is what lets switching
themes live preserve the xterm.js scrollback instead of destroying and
recreating the terminal. The container your slot div sits in **must** be
`display: flex` (or otherwise give its child a definite size) — `Terminal`'s
own root divs size themselves via `flex: 1; min-height: 0`, which only works
if their direct parent is a flex container. See
[gotchas.md](./gotchas.md#2-a-flex-child-that-isnt-itself-flex-breaks-terminals-own-sizing)
for what it looks like when this goes wrong (it's subtle — the terminal
doesn't disappear, it just doesn't fill its panel).

### d. Styling: two layers, never mix them

There are exactly two places styling lives, and they have different rules:

1. **Baseline layout** — ordinary `*.module.scss` CSS Modules, same
   convention as every other component in this codebase. This is what your
   shell looks like with no theme skin applied — plain, functional, using
   normal hashed CSS-Module class names.
2. **Theme skin** — a *separate* plain (non-module) `.scss` file under
   `styles/hud/themes/<yourTheme>.theme.scss`, gated entirely behind
   `:root[data-hud-theme='<your-id>']`. This is the only place a theme's
   distinct visual identity (colors, glows, accents) lives.

The skin file can't target your CSS-Module classes — Vite/postcss-modules
hashes those, and the hash isn't stable across builds. Instead, your shell
components render **stable, hand-written literal class names** *in addition
to* their module classes, specifically for the theme layer to hook into:

```tsx
<div className={`${styles.vitalsRow} sa-hud-vitals-row`}>
```

Convention for this codebase: prefix these `sa-hud-*` (short for "Shattered
Archive HUD"). Grep `slateAmber.theme.scss` for the full current list
(`sa-hud-shell`, `sa-hud-terminal-panel`, `sa-hud-vitals-row`,
`sa-hud-room-row`, `sa-hud-chat-pane`, `sa-hud-affects-panel`,
`sa-hud-widget-slot`, `sa-hud-terminal-title`, `sa-hud-vitals-fill-*`,
`sa-hud-room-exit`, `sa-hud-narrow-tab`, ...) — reuse an existing name where
your shell has the same kind of element, add a new one where it doesn't.

State that affects styling (available/unavailable exit, low-HP warning, an
active tab) is exposed as a `data-*` attribute set directly from React state
— `data-available={hasExit}`, `data-hp-warning={hpPct < 25}` — and the theme
CSS selects off that (`.sa-hud-room-exit[data-available='true']`), not off
component internals.

Define your palette as CSS custom properties at the top of your `:root[...]`
block (`--sa-accent`, `--sa-panel-bg`, `--sa-panel-border`, ...) and reference
them everywhere inside it, rather than repeating literal color values. Two
reasons: it keeps the palette adjustable from one place, and some shared
elements (the bordered-panel title, for instance) fall back to reading these
vars directly (`var(--sa-panel-bg, $bg-color)`) so they repaint correctly for
your theme without you having to duplicate anything in a shared mixin.

**Don't let a panel's chrome background diverge from what's actually inside
it.** If a panel's content has an inherent, non-theme-able fill color (the
terminal is always black — xterm sets that itself, independent of any
theme), don't paint that panel's own background with your palette's generic
panel color. See
[gotchas.md](./gotchas.md#4-a-panels-background-must-match-what-fills-it-or-you-get-a-visible-seam)
— this produces a genuinely confusing, hard-to-diagnose visual seam.

`loadStyles` in your registry entry just needs to flip the attribute that
makes your already-loaded CSS take effect:

```ts
function setActiveThemeAttribute(id: HudThemeId): void {
  document.documentElement.setAttribute('data-hud-theme', id);
}
```

Your theme's own `.theme.scss` file should be imported as a side-effect
import directly in your `ShellComponent` (and `NarrowShellComponent`, if you
have one) — `import '../../styles/hud/themes/yourTheme.theme.scss';` — so it
bundles into that component's own lazy chunk, not the main bundle. Verify
this with a real build (§8), not by assuming.

### e. If your theme needs a plugin

A theme can auto-enable a core plugin it depends on via `onActivate`:

```ts
onActivate: () => pluginHost.enable('your-plugin-id'),
```

`pluginHost.enable()` is idempotent (a no-op if already enabled) and silently
does nothing if the plugin isn't registered yet — which is why `onActivate`
firing is safe to happen on *every* entry into your theme, not just the
first. It never auto-*disables* anything, so a user's own explicit choice via
the Plugins list always wins. See
`features/plugins/core-plugins/world-time-and-identity.plugin.ts` for a real
example (`slate-amber` auto-enables it for the time-of-day icon).

### f. Live-switching: your hooks must not go blank on remount

This is the single most important section if your theme does anything beyond
static chrome. Read it even if you think your theme doesn't need it — it's
easy to be wrong about that.

Switching themes live **remounts your shell's entire component tree** (the
old shell unmounts, the new one mounts) while `MainContainer.tsx` itself
stays mounted throughout — the connection, plugin host, and event bus never
notice a theme switch happened. But any hook that seeds its `useState` purely
from the *first* event it happens to see will render blank/default for a
moment (or forever, until the next event) on that remount, because a fresh
mount has missed every event that already fired.

The fix, and the established pattern in this codebase: a small module-level
cache next to the hook, written on every update, read as the `useState`
initializer.

```ts
// features/yourFeature/yourFeatureStore.ts
let last: YourDataShape | null = null;
export function setYourData(next: YourDataShape): void { last = next; }
export function getYourData(): YourDataShape | null { return last; }
export function __resetForTests(): void { last = null; } // test-only escape hatch
```

```ts
// hooks/useYourHook.ts
const [state, setState] = useState(() => getYourData() ?? DEFAULT);
useEffect(() => {
  return ListenEvent('some:event', (payload) => {
    const next = /* derive from payload */;
    setState(next);
    setYourData(next); // <-- keep the cache in sync too
  });
}, []);
```

`features/room/roomDataStore.ts` is the original precedent this pattern comes
from; `features/charData/charDataStore.ts`, `features/affects/affectsStore.ts`,
and `features/combat/opponentStatusStore.ts` are three more, added
specifically to make live switching not flash blank. If your theme's shell
uses a hook that doesn't already do this and reads anything beyond static
per-render props, either confirm someone else already seeds it (check for a
`getX()`-style read in the hook's `useState` initializer) or add the cache
yourself before shipping. See
[gotchas.md](./gotchas.md#5-a-hook-can-look-fine-and-still-only-work-by-accident)
for a real example of this going wrong in a genuinely surprising way — a hook
that read from the right cache, but never wrote to it, because a *different*
hook happened to be the one doing the writing.

If a hook reads a plain `window.__SA_*` global instead (an older but
equivalent pattern, used by `useCharacterIdentity`/`useWorldTimePeriod`),
that already survives a remount for free — the global doesn't reset — no
extra work needed there.

## 3. Verify it, live, not just with tests

The unit test suite (`pnpm --filter @shatteredarchive/game-client test`)
should stay green, but it cannot catch several classes of bug this system is
genuinely prone to — every entry in [gotchas.md](./gotchas.md) that involves
CSS sizing, DOM portal identity, or visual color was caught by looking at the
real running app, not by a passing test suite. Before calling a theme done:

1. `pnpm --filter @shatteredarchive/game-client test` — full suite green.
2. `pnpm --filter @shatteredarchive/game-client exec tsc --noEmit` — clean.
3. `pnpm --filter @shatteredarchive/game-client build` — inspect the chunk
   list in the output. Your `ShellComponent`/`NarrowShellComponent` should
   each show up as their own small `dist/assets/<Name>-*.js`/`.css` files,
   separate from `main-*.js`. If your theme's code shows up inside
   `main-*.js` instead, something isn't actually lazy-loaded.
4. **Live, against the real dev server** (`Shattered-AI/tools/browser-test/`
   — Playwright scripts, allowlisted to `localhost`/`*.shatteredarchive.{com,dev}`;
   never background the dev server yourself, drive whatever the user already
   has running on `:30080`):
   - Load your theme fresh (cold), and via a live switch from another theme
     and back — screenshot both, at desktop and at your narrow breakpoint.
   - Seed some fake state (dispatch `game:char-data`, `game:room-data`,
     `event:fighting:opponent`, `shatteredarchive:identity-updated`,
     `shatteredarchive:write-terminal`, etc. as real synthetic
     `CustomEvent`s — see any `theme-*.mjs` script in that folder for the
     exact payload shapes) and confirm it survives a live switch away and
     back without flashing blank.
   - Check `page.on('console')`/`page.on('pageerror')` for anything, not
     just a clean screenshot — a genuinely serious bug (see
     [gotchas.md](./gotchas.md#1-the-terminal-portal-container-must-never-change-identity))
     produced a perfectly normal-looking screenshot at first glance.
   - Measure, don't eyeball, anything you're claiming "fills" or "touches"
     something else — `getBoundingClientRect()` on both boxes and diff them.
     A CSS box matching exactly is not proof the *visible content* inside it
     does too (see
     [gotchas.md](./gotchas.md#7-a-0px-box-gap-is-not-the-same-as-a-0px-visual-gap)).

## Addendum: an example prompt for Claude

If you want Claude to build (or help you build) a custom theme in this repo,
a prompt that front-loads the constraints above gets a far better first
result than "make me a theme." Something like this works well — swap in your
own visual direction where marked:

> I want to add a new HUD theme to the game client, following the pattern
> documented in `docs/themes/creating-a-theme.md` and `docs/themes/gotchas.md`
> — please read both before starting.
>
> **Theme id/label:** `<your-id>` / "`<Your Display Name>`"
>
> **Visual direction:** `<describe the aesthetic you want — e.g. "a
> high-contrast terminal-green CRT look, sharp corners not rounded, a subtle
> scanline texture on panels, amber replaced with a phosphor-green accent">`
>
> **Layout:** `<"reuse CompactLayoutShell's layout as-is, just reskinned" OR
> describe a different arrangement — which panels, where, a narrow-viewport
> variant or fall back to default's>`
>
> Requirements:
> - Implement it as a new entry in `THEME_REGISTRY`
>   (`features/hudLayout/themeRegistry.ts`), not a variant of an existing one.
> - Shell component(s) implement `HudShellBaseProps` exactly, including
>   `terminalSlotRef` wired to a `display: flex` container.
> - All theme-specific styling lives in one gated
>   `styles/hud/themes/<id>.theme.scss` file under
>   `:root[data-hud-theme='<id>']`, targeting only stable `sa-hud-*` literal
>   classes and `data-*` attributes — never a CSS-Module hashed class name.
>   Define the palette as `--sa-*`-style custom properties at the top of that
>   block.
> - Any panel whose content has its own fixed, non-theme-able fill color
>   (the terminal is always black) must have its own background matching
>   that fill, not the shared panel background.
> - If any hook your shell uses doesn't already seed itself from a
>   module-level cache (or a `window.__SA_*` global), add one — a theme
>   switch must never flash blank/stale state.
> - Verify with a real build (confirm the new shell lands in its own lazy
>   chunk, not `main-*.js`) and live against the running dev server (not
>   just the unit test suite) — screenshot the theme at desktop width and at
>   its narrow breakpoint, both on a cold load and after a live switch away
>   and back, and check the browser console for errors during the switch.
> - Don't touch the `default` theme, `MainContainer.tsx`'s shell-selection
>   logic, or any other theme's files — this should be purely additive.
