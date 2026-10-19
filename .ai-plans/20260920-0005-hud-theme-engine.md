# Plan: HUD theme-swapping engine — Slate & Amber as the first theme

Created: 2026-09-20T00:05:00Z · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Rework PR #151 (hex337/Shattered-Archive:Feature/custom-hud-layout → release/dev) from
two independent "layout" + "theme" settings into a real theme-registry architecture — a shared
interface every theme implements, lazy-loaded per theme — with today's Compact/Slate & Amber
work as the first non-default theme, addressing TournyMasterBot's CHANGES_REQUESTED review.

## Goal
A user picks ONE "Theme" setting (not two independent dropdowns). `default` is today's classic
layout, unchanged. `slate-amber` is the reworked Compact layout + Slate & Amber skin, loaded
lazily so a `default`-theme user's bundle and hot path never pay for it. Both themes implement
the same `ThemeDefinition`/`LayoutShellProps` contract, including their own narrow-viewport
variant, so a third theme can be added later by following the pattern, not by re-deriving it.
Past this PR's two themes, the underlying engine — connection, plugin host, event bus, and every
feature's durable state — must not care which theme is active: switching themes must never drop
state, double-subscribe, or behave differently depending on what was active before. Done when:
`tsc`/full `jest` are green, a build shows the slate-amber theme in its own chunk, switching
themes in Settings is one control, the line-processing hot path has zero added regex cost for
`default`-theme users, the mob-name color-rendering fix already merged to release/dev (PR #152)
renders consistently in both themes, and the reworked branch is ready — pending explicit,
in-the-moment user instruction for any `git commit`/`merge`/`push` — to update hex337's fork per
their "You can go for it" reply in the PR thread.

## Constraints
- This is **fork PR #151**: head `hex337/Shattered-Archive:Feature/custom-hud-layout`, base
  `release/dev`, `maintainer_can_modify: true`. Rework IN PLACE on top of hex337's branch as new,
  reviewable commits (don't squash over their authorship) — not a fresh PR from scratch.
- **Never initiate, offer, or ask about `git commit`, `git merge` (including finalizing one), or
  `git push` on your own.** The user runs and authorizes those themselves, every single time —
  even where a step's own Do: describes a merge or a push as its outcome (Steps 1 and 8). Doing
  the file-level work of a step — edits, resolving conflict markers in the working tree — is fine
  and expected; stop short of the actual commit/merge-finalize/push action unless told to run it
  at that moment. Don't frame this as "I'll confirm before doing X" either — that's still a prompt;
  just don't do it, and let the user bring it up.
- TournyMasterBot's GitHub review (fetched 2026-09-19, quoted in Context) is the **floor** for
  this work, not the ceiling. Reuse as-is where the review is silent — the widget-slot API
  (`setHudWidget`/`hudWidgetRegistry.ts`), the fluid-sizing philosophy, the resizer pattern, and
  the `useOpponentStatus`/`useCharacterIdentity` extractions are good — UNLESS executing a step
  surfaces something that doesn't actually align with the theme engine's goal: a missing interface
  extraction, a performance issue, or (per Goal) a piece of state that wouldn't survive a theme
  switch cleanly. When that happens: stop, name concretely what was found and why it matters, and
  raise it to the user via `AskUserQuestion` with real options — don't silently fix it and don't
  silently leave it. This applies throughout execution, not just to the steps already identified
  below.
- `probe-opponent-condition.ts`'s ANSI handling is now **in scope**, not deferred. TournyMasterBot's
  review comment said this would be "addressed in a separate PR" — it already was: PR #152
  ("Feature/auto level redesign", merged to `release/dev` as `f56b1ba`) added `ansiToHtml()`
  rendering of the RAW (unstripped) enemy label in `RightSidebar.tsx`'s classic-layout
  `StatusBlock`. This directly conflicts with PR #151's own change to the same underlying data —
  `probe-opponent-condition.ts` now calls `stripAnsi(...)`, discarding the color instead of
  preserving it for `ansiToHtml` to render. Step 1 resolves this for real: release/dev's approach
  (keep raw ANSI, render via `ansiToHtml`) is correct and should win; PR #151's `stripAnsi` change
  gets reverted. Confirmed directly via `git log`/`git show` against `release/dev` this session,
  not assumed from the review text alone.
- Mobile/narrow-viewport handling is **changing** from the original design spec: instead of
  `slate-amber` always falling back to `default`'s classic layout below 900px, `ThemeDefinition`
  lets each theme supply its OWN narrow-viewport variant, styled with that theme's own color
  scheme (the same tokens/custom properties its wide layout uses — see Step 3) instead of silently
  reverting to a different theme's look on a phone-width window. `default`'s narrow behavior is
  unchanged (today's already-mobile-friendly classic layout); it's still the fallback for any
  future theme that doesn't define its own narrow variant. Default-off/fully-reversible rollout
  otherwise still stands.
- v1 only needs the 2 themes that exist today (`default`, `slate-amber`) to work cleanly and be
  extensible to a 3rd — don't design for a hypothetical theme marketplace/many-theme future. (A
  concrete 3rd-theme candidate — high-contrast mode — is recorded under "Next" below, deliberately
  NOT a step in this plan.)

## Current State (READ THIS FIRST — as of 2026-09-20T08:15:00Z, all 8 steps COMPLETE)

Working branch: **`feature/hud-theme-engine`**. Built from PR #151's fetched head
(`pr-151-review`) with `release/dev` merged in (Step 1) via a merge commit, `43f185f`. **That
commit exists in the branch's history but was not made by this agent** — the standing
git-actions rule below was followed throughout (conflicts resolved and staged only); the commit
itself is presumably the user's own action. If picking this up cold, run `git log --oneline -5`
and `git status --short` before touching anything — don't assume what's committed vs. not.

**Steps 2 and 3's file changes are currently UNCOMMITTED working-tree changes** on top of that
merge commit (confirm with `git status --short`; at the time of writing, 29 changed paths — new
files, edits, and deletions, all traceable to Steps 2-3 in the Progress log below). Nothing past
the Step 1 merge has been committed by anyone as of this writing.

**Architecture right now** (Steps 4-8 build on this, don't re-derive it from the original PR):
- `features/hudLayout/themeRegistry.ts` — `THEME_REGISTRY: Record<HudThemeId, ThemeDefinition>`
  + `resolveActiveTheme(themeId, viewportWidth)`, the pure function `MainContainer.tsx` calls
  every render to pick a lazy-loaded `ShellComponent` (and apply that resolved theme's
  `loadStyles`, which just sets a `data-hud-theme` attribute on `document.documentElement`).
- `features/hudLayout/hudThemeStore.ts` — the ONE `HudThemeId` (`'default' | 'slate-amber'`)
  preference, localStorage key `shatteredArchive.hudTheme.id.v1`. The old two-store split
  (`hudLayoutStore.ts` + a separate `hudThemeStore.ts`) and the `<link>`-swap CSS loader
  (`hudThemeLoader.ts`) are all **deleted**, along with `public/themes/slate-amber.css`.
- `components/hud/LayoutShellProps.ts` — `HudShellBaseProps`, the shared prop contract every
  theme's shell implements (named this, not the plan's original suggestion `LayoutShellProps` —
  that name was already taken by `LayoutShell.tsx`'s own differently-shaped local interface).
- `components/hud/DefaultThemeShell.tsx` — new adapter wrapping classic `LayoutShell` behind
  `HudShellBaseProps` (now sources its own sizing via `useLayoutSizing()` internally, not as
  props threaded through from `MainContainer.tsx`).
- `components/hud/CompactLayoutShell.tsx` — the `slate-amber` theme's shell; footer label is a
  fixed `'Slate & Amber'` string constant now, no more per-theme label-map lookup. Directly
  imports `styles/hud/themes/slateAmber.theme.scss` as a side-effect import — confirmed via a
  real build that this bundles into the component's OWN lazy chunk, separate from `main-*.css`.
- `styles/hud/themes/slateAmber.theme.scss` — the theme's visual skin, all rules nested under
  `:root[data-hud-theme='slate-amber']` (including the `--sa-*` CSS custom-property tokens
  themselves) instead of the old bare `:root` + flat-class shape.
- `MainContainer.tsx` — no more static `CompactLayoutShell`/`LayoutShell` imports or a hardcoded
  ternary; renders whatever `resolveActiveTheme` resolves to inside one `<React.Suspense>`.
- `GraphicsSettingsModal.tsx` — ONE "Theme" selector (Default / Slate & Amber) under the "Layout"
  nav tab, not two dropdowns — this was pulled forward from Step 6 during Step 2 (the store
  consolidation left no way to keep representing layout and theme as independent settings); Step
  6 now only has the `CommandInput.module.scss` scope decision left.

**Verified as of the last full pass**: `tsc --noEmit` clean; full game-client suite 517/517
across 46 suites; a real production build confirms every theme shell (including the narrow one)
lands in its own lazy-loaded chunk, separate from `main-*.js`/`main-*.css`; grep confirms
`userScriptRuntime.ts`'s hot path has zero trace of the two regex scans it used to run; live
Playwright confirms terminal scrollback and hook-seeded state both survive a live theme switch.

**Reusable Playwright verification tooling** (all in `Shattered-AI/tools/browser-test/`, run
against the dev server — **the user starts it themselves** via `pnpm run dev` on `:30080`; never
background it yourself, it orphans the vite child and breaks their `pnpm run dev`):
- `theme-ansi-color-check.mjs` — dispatches a synthetic `event:fighting:opponent` CustomEvent
  with a raw-ANSI-colored label to confirm colored mob names render in both themes without
  needing a live connection.
- `theme-registry-check.mjs` — confirms default/slate-amber/narrow-fallback shell resolution
  end-to-end and zero console errors, across three isolated browser contexts.
- `theme-slate-amber-full.mjs` — seeds synthetic identity/vitals/room/widget-slot state (the same
  CustomEvent-dispatch trick) so every theme accent normally gated behind live game data becomes
  visible in a screenshot, with a side-by-side default-theme capture using identical data.
- `theme-slate-amber-connected.mjs` — adds a MOCKED `window.WebSocket` (fires `open` on a timer),
  driven through the REAL Connect UI (File → Connect… → fill host/port → Connect), so
  `isConnected`-gated UI can be verified too — e.g. `CommandInput`'s focus-ring aura, which a
  `disabled` `<input>` (the state without this) silently cannot show at all.
- `theme-slate-amber-narrow.mjs` — same seed-state trick at a 480px viewport; confirms
  `CompactLayoutShellNarrow`'s amber styling + working Chat/Affects tab switching, and that
  `default`'s own narrow behavior (classic's existing `BottomPane`) is unchanged.
- `world-time-and-identity-check.mjs` — dispatches real `game:tick`/`shatteredarchive:raw-data`
  events against the live dev server; confirms the plugin auto-enables for `slate-amber` (period
  icon actually renders in `CompactRoomRow`, race/class populate) and stays off for `default`.
  This is the script that CAUGHT the game:tick/ROUTED_WINDOW_EVENTS collision bug (see Step 5's
  progress-log entry) — a unit test with a mocked `api.onEvent` could not have caught it, since
  the mock doesn't know real `game:tick` is also a routed event.
- `theme-live-switch-durability.mjs` — seeds a terminal marker line + a room name, then drives the
  REAL Settings UI through default→slate-amber→default, asserting both survive each live switch.
  CAUGHT the Step 7 portal-container identity bug (see that step's progress-log entry) — the
  marker was silently gone after the first live switch under the buggy version; a unit test with
  mocked shells never exercises a real container-identity change, so this could only be caught live.
- `terminal-fill-check.mjs` — measures `getBoundingClientRect()` of the terminal SLOT vs. the
  actual `#play-area-terminal-root` xterm box, across all three shells (default, slate-amber
  desktop, slate-amber narrow), asserting a ~0px gap. CAUGHT a real user-reported bug (see the
  final progress-log entry) that every earlier live check missed by only checking content
  PRESENCE, never SIZE — `terminalHost` needs `display: flex` for `Terminal.tsx`'s own `flex: 1`
  sizing to take effect, same as every shell's own slot already provided. The template to reach
  for whenever a wrapper/portal div is inserted into an existing flex layout.
All screenshots land in that tool's gitignored `output/tests/<script-name>/` — throwaway
verification output, never committed. Re-run/extend one of these rather than writing a new script
from scratch when more visual verification is needed.

- `components/hud/CompactLayoutShellNarrow.tsx` — new, `slate-amber`'s `NarrowShellComponent`
  (registered in `themeRegistry.ts`). Single-column stack (terminal, vitals/room rows, command
  input, then a Chat/Affects tab strip) mirroring classic `LayoutShell`'s own narrow-width
  pattern (stack + tab away secondary content) rather than a new responsive idiom; reuses the
  same `sa-hud-*`-bearing sub-components as the desktop shell, plus a small amber active-tab rule
  added to `slateAmber.theme.scss`. `default`'s narrow behavior is untouched — still classic's
  existing `BottomPane` (Compass/Chat tabs), confirmed unchanged via Playwright.

- `features/plugins/core-plugins/world-time-and-identity.plugin.ts` — new, registered in
  `registry.ts`. A SINGLE `onEvent(api, evt)` hook (no `onEnable`) branching on `evt.name`:
  `'game:tick'` → `timeStringToPeriod(payload.time)` (pure hour-math, no regex, boundaries
  verified against the real game-log corpus) → `setWorldTimeSnapshot`; `'shatteredarchive:
  raw-data'` → the score-sheet race/class regex scan (still needed, no GMCP equivalent exists),
  gated by a cheap `.indexOf()` substring check before the regex ever runs, mirroring
  `probe-opponent-condition.ts`'s `OPPONENT_GATES` pattern. `userScriptRuntime.ts`'s hot path
  (`processRawEvent`, called for every line of server text regardless of theme) no longer
  contains either scan — confirmed via grep, zero trace left. Auto-enables when `slate-amber`
  activates (`themeRegistry.ts`'s new `onActivate` hook calling `pluginHost.enable(...)`, wired
  from a `MainContainer.tsx` effect placed AFTER plugin registration in declaration order — that
  ordering matters, `pluginHost.enable()` silently no-ops on an unregistered plugin id); stays
  off by default for `default`-theme users, independently toggleable via the Plugins list.

- `CommandInput.module.scss`'s legibility tweaks (font-size/padding bumps, review comment #14)
  stay in the shared/base file, applying to both themes — decided (Step 6) as genuine general UX
  improvement, not something compact-specific; no code change, since the PR already put them
  there and that's the correct place for them.

**Step 7 turned into much more than its original scope** (user's explicit "Build live switching
now" decision, largest of three offered options): theme switching is now LIVE, not reload-required.
`hudThemeId` in `MainContainer.tsx` is real reactive state (`HUD_THEME_CHANGED_EVENT` from
`hudThemeStore.ts`, same-tab via `ListenEvent`/`DispatchEvent`), `<Terminal/>` is hoisted into a
permanently-stable `createPortal` target (`terminalHost`, created once, never swapped — the
container itself must never change across renders, or React unmounts/remounts the portaled
subtree; a first attempt got this wrong and was caught live, see Progress log) that gets
imperatively re-parented via plain `.appendChild()` into whichever shell's slot is currently
attached, and 5 hooks (`useCharData`, `useAffectsBlock`, `useSanctuaryActive`, `useRoomHeader`,
`useOpponentStatus`) now seed from module-level caches (mirroring the pre-existing
`roomDataStore.ts` pattern: `features/charData/charDataStore.ts`, `features/affects/affectsStore.ts`,
`features/combat/opponentStatusStore.ts`) so a live remount doesn't flash blank. Two real bugs were
found and fixed this step, both caught by actually running things rather than by inspection: the
portal-container identity bug above (live Playwright), and `useRoomHeader.ts` reading from
`roomDataStore` but never writing to it — seeding only worked by accident, contingent on the
unrelated `useCompassBlock` hook happening to be mounted too (a plain jest test caught this one).
`GraphicsSettingsModal.tsx`'s Theme hint now reads "Applies immediately — no reload needed."

**Step 8 done**: `docs/superpowers/specs/2026-09-14-custom-hud-layout-design.md` §4.4 and
`docs/superpowers/plans/2026-09-14-custom-hud-layout.md` (dated Rework note, appended not rewritten)
now both describe what actually shipped instead of the original PR #151 design; full verify pass
green (`tsc --noEmit`, real build, 517/517 tests, no conflict markers).

**Next**: nothing left in this plan. Per the user's explicit framing ("finish everything except
the PR / git sync"), committing/merging/pushing and updating the upstream
`hex337/Shattered-Archive:Feature/custom-hud-layout` branch are deliberately NOT done here — the
working tree is ready for the user to review and commit/PR themselves whenever they choose. (The
Progress log below has the full detail on every step; this section gets a light touch-up per step,
not a full rewrite — treat the Progress log as authoritative if the two ever seem to disagree.)

## Context
- PR fetched locally: `git fetch origin pull/151/head:pr-151-review`; merge-base with
  `release/dev` (before PR #152 landed) was `35906f4`; `release/dev` is now at `f56b1ba`.
- TournyMasterBot's review (CHANGES_REQUESTED, 2026-09-19T18:56:22Z): reframe as a theme
  implementation (default + slate-amber themes sharing an interface, each free to diverge past
  it); biggest issue = regex added to the line-processing hot path for features not all users
  need — prefer hooking existing GMCP events over scanning every line; prefer lazy-loading themes
  and the features that power them; theme-only features/components/hooks live under the theme,
  genuinely shared ones stay in the main features folder.
- **RESOLVED in Step 1** — PR #152/#151 ANSI-color conflict: `release/dev` added `ansiToHtml()`
  rendering of the RAW (unstripped) enemy label in `RightSidebar.tsx`; PR #151 had independently
  made `probe-opponent-condition.ts` strip it. Reverted to raw + `ansiToHtml` (release/dev's
  approach), and applied the same treatment to `CompactVitalsRow.tsx` for parity (a gap in both
  PRs, found while grounding this plan). See Current State above for the current file shape;
  don't re-derive this from the original PR text.
- **RESOLVED in Steps 2-3** — the old two-independent-settings structure
  (`hudLayoutStore.ts`/`hudThemeStore.ts`, static `CompactLayoutShell` import, hardcoded
  `HUD_LAYOUT_LABELS`/`HUD_THEME_LABELS` maps, the `hudThemeLoader.ts` `<link>`-swap, review
  comments #1/#2/#13/#15) no longer exists in any form — see Current State above for what
  replaced each piece. Don't plan against the original PR's shape for these.
- `userScriptRuntime.ts`'s raw-text processing path (~line 705 in the PR diff) unconditionally
  calls two new regex scanners on every line of server output, for every user:
  `scanForScoreSheetIdentity` (score-sheet race/class parse, no GMCP equivalent exists) and
  `scanForWorldTimePeriod` (day/night period scraped from the player's own prompt string via
  `PROMPT_PERIOD_RE = /\|(Dawn|Day Time|Dusk|Night Time)\|/`) — review comments #7, #8, #9, #10.
- `useWorldTimePeriod.ts` / `useCharacterIdentity`'s identity half only read
  `window.__SA_WORLD_TIME__` / `window.__SA_IDENTITY__` and listen for
  `'shatteredarchive:world-time-updated'` / `'shatteredarchive:identity-updated'` — fully
  decoupled from HOW those globals get populated, so moving the populator into a plugin needs
  zero consumer-side changes.
- The plugin system (`types/types-client/src/plugins/plugin-base.ts`, `features/plugins/
  registry.ts`, `features/plugins/pluginHost.ts`) already gives a ready home: `onEnable`/returned
  cleanup, and `api.onEvent` dedupes by a stable per-plugin-per-event key so toggling a plugin
  on/off never double-subscribes (verified directly against `event-dispatcher.ts`'s
  `registerListener` while reviewing PR #153's tick-warning plugin this session). This PR already
  extends `PluginRuntimeApi` with `setHudWidget` cleanly — reviewer didn't flag it, keep as-is.
- `CommandInput.module.scss` — this PR edits BASE/shared styling (font-size, padding) used by
  both classic and compact layouts, not theme-scoped — review comment #14.
- Design spec `docs/superpowers/specs/2026-09-14-custom-hud-layout-design.md` §4.3's theming
  convention (CSS-Modules for structure + stable literal `sa-hud-*` classes/`data-*` attributes
  for theme targeting) is now re-homed under the registry as-built in Steps 2-3 — the doc itself
  is unchanged and still describes the OLD two-independent-settings model in §4.4 ("layout and
  theme are independent... not one combined toggle"); that's stale prose, not stale code — Step 8
  is what updates the doc text to match. Don't edit the doc early; Step 8 owns it specifically so
  the update reflects the FINISHED design, not a mid-flight one.
- `useGameConnection` (telnet connection) and `pluginHost` (module-level singleton) both live
  OUTSIDE the layout-shell subtree in `MainContainer.tsx`, so a shell swap does not by itself drop
  the connection or plugin state. The narrower known remount risk: `<Terminal/>` is instantiated
  separately inside each shell's JSX, so swapping shells today mounts a fresh xterm.js instance
  (scrollback loss) — the likely reason layout currently requires a reload rather than hot-swap.
- No `gh` CLI in this environment — PR metadata/review comments were fetched via the public
  GitHub API through WebFetch (already captured above, no need to re-fetch). The `shattered_mcp`
  container was down when this plan was drafted; Steps 1-3 proceeded fine on direct `git`/file
  reads instead of `pack`/`qdigest` throughout — re-check container status if picking this up and
  planning to lean on it, but nothing here depends on it.

## Steps

### [x] 1. New branch, merge release/dev, resolve the ANSI-color conflict
- Do: Create a new branch based on PR #151's fetched head (`pr-151-review`) — e.g.
  `feature/hud-theme-engine` — and merge `release/dev` into it in the working tree. This pulls in
  PR #152's `ansiToHtml()`-based rendering of colored opponent names. Resolve the resulting
  conflict in favor of release/dev's approach: revert PR #151's `stripAnsi(...)` change in
  `probe-opponent-condition.ts` back to passing the raw line through (release/dev's
  `StatusBlock` needs the raw ANSI to render via `ansiToHtml`); confirm `useOpponentStatus.ts`'s
  `label: d.label?.trim() || ...` passthrough needs no change. Then apply the SAME `ansiToHtml()`
  treatment to `CompactVitalsRow.tsx`'s enemy label (currently plain `{enemyUi.label}` text, line
  69) so colored mob names render consistently in both themes, not just classic — this gap exists
  in neither PR today; it's a direct consequence of wiring the two together correctly. Resolve any
  other conflicts `git merge` surfaces normally, on their own merits.
- Files: /workspace/shattered-archive/apps/game-client/src/features/combat/probe-opponent-condition.ts (edit: revert to raw line, no stripAnsi)
  /workspace/shattered-archive/apps/game-client/src/hooks/useOpponentStatus.ts (confirm only — likely no edit needed)
  /workspace/shattered-archive/apps/game-client/src/components/RightSidebar.tsx (merge conflict resolution)
  /workspace/shattered-archive/apps/game-client/src/components/hud/CompactVitalsRow.tsx (edit: render via ansiToHtml)
- Verify: working tree shows no leftover conflict markers; `pnpm --filter @shatteredarchive/game-client test -- probe-opponent-condition useOpponentStatus RightSidebar CompactVitalsRow` passes; manual dev-server check shows a colored mob name rendering correctly in BOTH classic and compact layouts. Per the standing git-actions rule: do the merge and resolve conflicts in the working tree; leave the merge commit itself for the user to finalize when they say so.

### [x] 2. Theme registry & shared interface contract (with per-theme narrow-viewport support)
- Do: Add a `ThemeDefinition` TS interface + registry in `features/hudLayout/`, consolidating
  `hudLayoutStore.ts` + `hudThemeStore.ts` into ONE store keyed by a single theme id
  (`'default' | 'slate-amber'`). Pull the props every shell needs
  (`isConnected, sendRaw, onOpenAutoLeveling, autoLevelMode, autoLevelRunState,
  onSightseeRescan`) into a shared `LayoutShellProps` base type (review comment #2);
  `CompactLayoutShellProps extends LayoutShellProps`. `ThemeDefinition` shape: `{ id, label,
  ShellComponent: React.LazyExoticComponent<...>, NarrowShellComponent?:
  React.LazyExoticComponent<...>, narrowBreakpoint?: number, loadStyles?: () => Promise<void> }`.
  Instead of a boolean "available at this viewport, else fall back to default" gate, resolution
  order at a given width is: theme's own `NarrowShellComponent` (if defined and width is below its
  `narrowBreakpoint`, default 900) → theme's normal `ShellComponent` → `default`'s shell only if
  the active theme defines neither. `default` supplies today's already-mobile-friendly classic
  layout as its own `NarrowShellComponent` (unchanged behavior, now expressed through the same
  interface instead of a special case). Register `'default'` (wrapped `LayoutShell`, no visual
  change) and `'slate-amber'` (today's `CompactLayoutShell`; its narrow variant lands in Step 4).
  `MainContainer.tsx` swaps its static `CompactLayoutShell` import for `React.lazy(() =>
  import(...))` resolved through the registry — resolves comment #13 (a `default`-theme user never
  loads the slate-amber shell/hooks/styles) and comment #1 (labels come from the registry, not
  hardcoded maps inside `CompactLayoutShell.tsx`).
- Files: /workspace/shattered-archive/apps/game-client/src/features/hudLayout/hudThemeStore.ts (rewrite; replaces hudLayoutStore.ts + hudThemeStore.ts)
  /workspace/shattered-archive/apps/game-client/src/features/hudLayout/themeRegistry.ts (new)
  /workspace/shattered-archive/apps/game-client/src/components/hud/LayoutShellProps.ts (new)
  /workspace/shattered-archive/apps/game-client/src/components/hud/CompactLayoutShell.tsx (edit)
  /workspace/shattered-archive/apps/game-client/src/pages/MainContainer.tsx (edit)
- Verify: `tsc --noEmit` clean; `pnpm --filter @shatteredarchive/game-client build`, then inspect
  `dist/assets/` — the slate-amber shell and its styles land in a chunk separate from the main
  entry (confirms lazy-loading, not just a passing build).

### [x] 3. Bundle slate-amber as real SCSS with reusable color tokens; retire the public/ link-swap loader
- Do: **Default firmly to SCSS under `styles/` for anything built into the client — raw `.css`
  is reserved for user/plugin-authored overrides, full stop, unless a strong reason turns up to
  do otherwise; if one does, flag it via `AskUserQuestion` per the Constraints rule rather than
  quietly keeping a `.css` file.** Move `public/themes/slate-amber.css` into a theme-scoped
  `.scss` (e.g. `styles/hud/themes/slateAmber.theme.scss`) applied via a
  `data-hud-theme="slate-amber"` attribute + `:root[data-hud-theme='slate-amber']` scoped rules —
  reusing the existing stable literal-class + `data-*` convention from the design spec §4.3 —
  rather than a dynamically-injected `<link>` tag. Author the palette as SCSS variables/CSS custom
  properties (not scattered inline hex values) so Step 4's narrow variant can reuse the exact same
  color scheme instead of re-deriving it. Delete `hudThemeLoader.ts` outright — its `<link>`-swap
  mechanism existed only to load this theme's now-retired `.css` file; it is NOT the same
  mechanism as `UserStyleOverrideModal`/`applyPluginBaseCss` in `pluginHost.ts` (that's a
  separate, already-working path for user/plugin custom CSS and is untouched by this step) — a
  quick check that the two don't collide is still worth doing, but the default outcome is deletion,
  not a coin flip. This resolves review comment #15 (scss for built-in styles; css reserved for
  user overrides).
- Files: /workspace/shattered-archive/apps/game-client/public/themes/slate-amber.css (delete)
  /workspace/shattered-archive/apps/game-client/src/styles/hud/themes/slateAmber.theme.scss (new)
  /workspace/shattered-archive/apps/game-client/src/features/hudLayout/hudThemeLoader.ts (delete or repurpose — record which and why)
  /workspace/shattered-archive/apps/game-client/src/features/hudLayout/themeRegistry.ts (edit: wire style application into loadStyles)
- Verify: dev server visual check — slate-amber theme renders identically to before the move;
  `grep -rn "public/themes"` returns nothing left referencing the old path.

### [x] 4. Slate-amber narrow-viewport variant
- Do: Build an actual narrow/mobile-width shell for the `slate-amber` theme that keeps Step 3's
  color tokens but rearranges for a narrow viewport (stacked columns, collapsed sidebar, etc.) —
  mirror whatever responsive pattern `default`'s classic layout already uses for its own mobile
  handling rather than inventing a new one. Decide and record whether this is a separate component
  (`CompactLayoutShellNarrow.tsx`) or a responsive-internal mode of `CompactLayoutShell.tsx` itself
  — pick based on how much actually differs once you're looking at it, not in the abstract. Wire
  it into the Step 2 registry as `slate-amber`'s `NarrowShellComponent`.
- Files: /workspace/shattered-archive/apps/game-client/src/components/hud/CompactLayoutShellNarrow.tsx (new, or a narrow mode added to CompactLayoutShell.tsx — decide and record)
  /workspace/shattered-archive/apps/game-client/src/styles/hud/themes/slateAmber.theme.scss (edit: narrow-breakpoint rules reusing Step 3's tokens)
  /workspace/shattered-archive/apps/game-client/src/features/hudLayout/themeRegistry.ts (edit: register NarrowShellComponent)
- Verify: dev-server check at a sub-900px width with `slate-amber` selected shows the slate-amber
  color scheme (not classic's), laid out usably at that width; existing ≤900px behavior with
  `default` selected is unchanged.

### [x] 5. Move hot-path text scanning into an opt-in plugin
- Do: Remove `scanForScoreSheetIdentity`/`scanForWorldTimePeriod` and their call sites from
  `userScriptRuntime.ts`'s hot path (~line 705), including the `PROMPT_PERIOD_RE` prompt-scraping
  approach entirely — **not kept even as a fallback**. Verified this session against the real
  docker log corpus and the DSL C# server source: the `|Dawn|`/`|Day Time|`/`|Dusk|`/`|Night
  Time|` pipe-delimited prompt token the PR's own code comment quotes as an example does not
  appear anywhere in the full game-log corpus (every docker jsonl + every legacy `.txt` log, all
  dates) or in the server source — there's no real data to fall back to. What IS verified real:
  GMCP `tick` events carry `{"time": "<h>:<mm><am|pm>"}` on a 30-minute cadence (confirmed e.g.
  `.../2026/09/18/server.log-2026-09-18.jsonl:6811-6831`: `8:30am → ... → 7:00am`), and the
  server's own sunrise/sunset broadcasts correlate exactly with specific tick times: "The sun
  rises in the east." fires on the SAME event as `tick {"time": "7:00am"}` (same file, line 6830
  → 6831), and "The sun slowly disappears in the west." fires on the SAME event as `tick
  {"time": "7:00pm"}` (`.../2026/09/19/server.log-2026-09-20.jsonl:1713-1714`) — both pairs share
  an identical timestamp, and the same sunrise/sunset pair recurs identically across every other
  session checked (Sep 5, 8, 15, 16, 18, 19). Sunrise = 7:00am and sunset = 7:00pm, exactly, every
  in-game day. Build `timeStringToPeriod(time: string): Period` as the SOLE mechanism, with Dawn
  and Dusk each one hour before their anchor (per your instruction): `Dawn = [6:00am, 7:00am)`,
  `Day Time = [7:00am, 6:00pm)`, `Dusk = [6:00pm, 7:00pm)`, `Night Time = [7:00pm, 6:00am)`
  (wraps midnight) — plain hour/minute comparison on the already-structured GMCP field, no regex
  needed for this half at all. Create a new core plugin (follow `ai-template/
  plugin-authoring.md`'s skeleton — same house pattern already verified this session for PR
  #153's tick-warning plugin), e.g. `features/plugins/core-plugins/
  world-time-and-identity.plugin.ts`, holding both `timeStringToPeriod` (listens on `game:tick`,
  no scan needed) and the score-sheet regex scan (listens on the raw-data event; still needed —
  race/class genuinely has no GMCP equivalent), dispatching both to the SAME
  `setIdentitySnapshot`/`setWorldTimeSnapshot` globals/events so `useCharacterIdentity`/
  `useWorldTimePeriod` need no consumer-side changes. **Gate the score-sheet scan the same way
  `ProbeOpponentConditionLine` already does** (`probe-opponent-condition.ts`'s `OPPONENT_GATES` —
  a plain array of substrings checked with `.indexOf()`, `return null` immediately if none are
  present, *before* any regex/allocation runs): a small gate-keyword list (`'Race'`/`'Class'`/
  `'LEVEL'`) checked against the whole raw chunk before splitting into lines or running `.match()`
  at all — most incoming text won't contain any gate keyword, so this turns the common case into
  one cheap `indexOf` call instead of a per-line regex exec. Register in `registry.ts`.
  Recommended default (record the final call): auto-enable this plugin when the `slate-amber`
  theme activates (it's the theme that surfaces these badges) via a hook in the Step 2 registry,
  while also leaving it independently toggleable in the Plugins list for a `default`-theme user
  who wants it without switching themes — matching comment #9's "people may not care about this
  feature" framing (opt-in, not silently default-on for everyone).
- Files: /workspace/shattered-archive/apps/game-client/src/features/userScripts/userScriptRuntime.ts (edit: remove the two scans)
  /workspace/shattered-archive/apps/game-client/src/features/plugins/core-plugins/world-time-and-identity.plugin.ts (new)
  /workspace/shattered-archive/apps/game-client/src/features/plugins/core-plugins/world-time-and-identity.plugin.test.ts (new)
  /workspace/shattered-archive/apps/game-client/src/features/plugins/registry.ts (edit)
  /workspace/shattered-archive/apps/game-client/src/features/hudLayout/themeRegistry.ts (edit: auto-enable hook)
- Verify: `pnpm --filter @shatteredarchive/game-client test -- userScriptRuntime` shows both
  scans gone from that file's behavior; new plugin's own test suite passes, including: a case
  feeding ordinary non-matching combat/room text through the identity scan and asserting the gate
  rejects it without the regex ever running (mirror how `probe-opponent-condition.test.ts` proves
  its own gate); and a `timeStringToPeriod` table test covering every boundary edge exactly
  (`5:59am`→Night Time, `6:00am`→Dawn, `6:59am`→Dawn, `7:00am`→Day Time, `5:59pm`→Day Time,
  `6:00pm`→Dusk, `6:59pm`→Dusk, `7:00pm`→Night Time, `11:59pm`/`12:00am`→Night Time) so the
  midnight wrap and every hour transition is pinned, not just the happy path. Code inspection
  confirms the `default`-theme hot path calls zero regexes added by this PR.

### [x] 6. Collapse Settings UX into one Theme selector; resolve CommandInput scope
- Do: In `GraphicsSettingsModal.tsx`, replace the two `hudLayout`/`hudTheme` dropdowns with one
  "Theme" selector driven by the Step 2 registry (`Default`, `Slate & Amber`); remove the
  `hudLayout === 'compact'` conditional-visibility branch entirely. Decide and record whether
  `CommandInput.module.scss`'s legibility tweaks (padding/font-size bumps, comment #14) ship as
  (a) a small separate change to the shared base styles since they're genuine UX improvements
  independent of any theme, or (b) moved into the slate-amber theme's own scoped override so
  `default`-theme users are unaffected — default to (a) unless the tweaks turn out to be actually
  driven by the compact layout's tighter spacing.
- Files: /workspace/shattered-archive/apps/game-client/src/components/GraphicsSettingsModal.tsx (edit)
  /workspace/shattered-archive/apps/game-client/src/components/GraphicsSettingsModal.test.tsx (edit)
  /workspace/shattered-archive/apps/game-client/src/styles/CommandInput.module.scss (edit or revert, per the decision above)
- Verify: `GraphicsSettingsModal.test.tsx` passes with the single selector; dev-server manual
  check confirms picking each theme persists correctly and the modal never shows two controls.

### [x] 7. Verify engine/state durability across a theme switch
- Do: Extend `MainContainer.test.tsx` with an integration test that mounts `MainContainer`,
  switches theme `default → slate-amber → default`, and asserts: the connection from
  `useGameConnection` is never torn down/reconnected, `pluginHost.enable`/`disable` show no
  double-subscription, and no user-script timer/alias gets duplicated — directly answering review
  comment #3's three numbered asks. Broaden this past connection/plugins per the Goal's "engine
  doesn't care which theme is active" standard: audit hooks/stores a theme switch could plausibly
  touch (anything reading a `window.__SA_*` global seeded once at module scope, anything keyed to
  a specific shell's mount lifecycle) and confirm none of them reset or duplicate state on switch.
  If that audit turns up something that doesn't already look durable and the review didn't call it
  out, flag it via `AskUserQuestion` with concrete options per the Constraints rule — don't
  silently patch it and don't silently leave it, this step is where that's most likely to surface.
  Separately, confirm whether `<Terminal/>` still remounts (scrollback loss) on a shell swap; if
  so, explicitly decide and record ONE of: keep "theme change requires reload" as the documented
  v1 behavior (simplest — a full reload already resets everything safely), or hoist `Terminal`
  above the per-theme shell in `MainContainer.tsx` so it survives a live swap — lean toward
  investigating the hoist given the "fully integrated... engine" framing, but don't force it
  through if invasive; a documented reload-required interim is a legitimate v1 tradeoff to flag
  back rather than silently deciding either way.
- Files: /workspace/shattered-archive/apps/game-client/src/pages/MainContainer.test.tsx (edit)
  /workspace/shattered-archive/apps/game-client/src/features/hudLayout/themeRegistry.ts (edit, only if hoisting Terminal)
- Verify: new/extended test passes; manual dev-server check switching themes back and forth shows
  no reconnect in the connection log and no duplicate `[plugin:...]` terminal log lines.

### [x] 8. Docs sync and ready the branch for PR #151
- Do: Update `docs/superpowers/specs/2026-09-14-custom-hud-layout-design.md` §4.4 (currently:
  "layout and theme are independent... not one combined toggle") to describe the collapsed
  theme-registry model instead, and append a dated "Rework" note to
  `docs/superpowers/plans/2026-09-14-custom-hud-layout.md` rather than rewriting its history. Run
  the full verify pass: `tsc --noEmit`, `pnpm --filter @shatteredarchive/game-client build`, full
  `pnpm --filter @shatteredarchive/game-client test`. This step prepares the branch for review
  only — per the standing git-actions rule, do not commit, merge-finalize, or push without being
  separately and explicitly told to do so at that time; nothing in this plan authorizes that in
  advance, including the eventual update to `hex337/Shattered-Archive:Feature/custom-hud-layout`.
- Files: /workspace/shattered-archive/docs/superpowers/specs/2026-09-14-custom-hud-layout-design.md (edit)
  /workspace/shattered-archive/docs/superpowers/plans/2026-09-14-custom-hud-layout.md (edit: append, don't rewrite)
- Verify: full test suite green; working tree has no conflict markers; nothing committed or
  pushed on your own initiative.

## Next (Phase 2 — separate plan, not started)
High-contrast mode currently lives in the Accessibility menu and applies as an overlay on top of
the `default` theme. Once Slate & Amber (this plan) is fully landed and verified, extract
high-contrast into its own `ThemeDefinition` entry the same way this plan builds slate-amber's —
the point is proving the registry genuinely generalizes past the one theme it was built for, not
just accommodating it. Create a new dated plan doc for this when picked up; don't fold it into
this one or start it early.

## Progress log

- 2026-09-20T00:05:00Z plan created — PR #151 fetched to `pr-151-review`; TournyMasterBot's
  review (1 review body + 15 inline comments) fetched via GitHub API and used to ground all
  steps; hudLayout/*, CompactLayoutShell.tsx, MainContainer.tsx, userScriptRuntime.ts,
  plugin-base.ts, pluginHost.ts, GraphicsSettingsModal.tsx, CommandInput.module.scss, and the
  author's own design spec/plan docs were read directly (qwen `pack` unavailable — container down)
  to confirm every step against real code, not just the review text.
- 2026-09-20T00:20:00Z plan revised per user feedback: added theme-defined narrow-viewport
  variants (Step 4, new) instead of a hard fallback-to-default below 900px; widened the
  review-scope constraint so mid-execution findings get flagged via AskUserQuestion instead of
  silently applied or silently skipped; discovered and folded in a real conflict — PR #152
  (merged to release/dev as f56b1ba) already fixed opponent-name ANSI rendering the "proper" way
  release/dev now expects, which conflicts with PR #151's own stripAnsi change, so a new Step 1
  handles the branch+merge+reconciliation (plus a compact-layout parity gap found while grounding
  it); added a standing rule against initiating/offering git commit/merge/push; recorded
  high-contrast-as-a-theme as an explicit, separate Phase 2 rather than a step here.
- 2026-09-20T00:30:00Z plan revised per user feedback: Step 3 firmed up from "decide and record"
  to a hard default — built-in styles are SCSS under `styles/`, raw `.css` is for user/plugin
  overrides only, `hudThemeLoader.ts` is deleted outright rather than weighed against keeping it,
  with any exception routed through the existing AskUserQuestion-escalation rule instead of a
  silent per-step judgment call.
- 2026-09-20T00:35:00Z plan revised per user feedback: Step 5's two regex scanners now must use
  the same cheap substring fast-gate `ProbeOpponentConditionLine`/`OPPONENT_GATES` already
  establishes in this codebase (`.indexOf()` keyword check before any regex/allocation runs),
  instead of calling `.match()` unconditionally on every line; added a Verify case proving the
  gate rejects non-matching text without the regex ever executing.
- 2026-09-20T00:45:00Z plan revised per user feedback: searched the full game-log corpus for the
  prompt-scan's `|Dawn|`/`|Day Time|`/`|Dusk|`/`|Night Time|` token — zero real occurrences
  anywhere (docker jsonl + legacy .txt, all dates) and nothing in the DSL server source either, so
  Step 5 now drops `scanForWorldTimePeriod`/`PROMPT_PERIOD_RE` entirely rather than keeping it as
  a fallback. In its place: verified GMCP `tick` events carry a real, always-present
  `{"time": "<h>:<mm><am|pm>"}` field (30-min cadence), and correlated the server's own sunrise/
  sunset broadcasts to exact tick times — "The sun rises in the east." ↔ `7:00am`
  (`.../2026/09/18/server.log-2026-09-18.jsonl:6830-6831`), "The sun slowly disappears in the
  west." ↔ `7:00pm` (`.../2026/09/19/server.log-2026-09-20.jsonl:1713-1714`), consistent across
  6 independent sessions checked. Per user instruction, Dawn/Dusk are each 1 hour before their
  anchor: Dawn `[6am,7am)`, Day Time `[7am,6pm)`, Dusk `[6pm,7pm)`, Night Time `[7pm,6am)`
  wrapping midnight — `timeStringToPeriod` is now a plain hour comparison on structured GMCP
  data, no regex, only the score-sheet identity scan still needs the fast-gate treatment.
- 2026-09-20T01:15:00Z step 1 done: created `feature/hud-theme-engine` from `pr-151-review`
  (re-fetched origin first, confirmed no drift), merged current `release/dev` (had advanced to
  `cec55d0` — PR #153's tick-warning plugin also merged in since planning). One real conflict,
  `RightSidebar.tsx`: kept HEAD's `useOpponentStatus`/`computeStatusPieces` extraction, added
  release/dev's `ansiToHtml` import and `enemyLabelHtml` memo, dropped release/dev's now-redundant
  inline `isEnemyActive`/staleness logic (already covered by the hook) and the now-unused
  `formatOpponentStatusText`/`EnemyUiState`/`OpponentStatusDetail`/`ListenEvent` imports (grepped
  first to confirm nothing else referenced them). `probe-opponent-condition.ts` merged clean at
  the git level but silently kept PR #151's `stripAnsi` — reverted by hand to the raw-line
  passthrough per the plan's decision. `useOpponentStatus.ts` needed no edit, confirmed. Applied
  the same `ansiToHtml` treatment to `CompactVitalsRow.tsx` (the parity gap found while planning).
  Staged all four resolved files; did NOT commit the merge, per the standing git-actions rule —
  it's sitting resolved-but-uncommitted for you to finalize whenever you say so. Hit and fixed an
  unrelated environment issue: the merge's `package.json`/lockfile changes needed a full
  `rm -rf node_modules && pnpm install` (documented recovery for a known stale-symlink class of
  issue, see `qwen-container-node-modules` memory) before jest would even load jsdom; also
  rebuilt `types/types-client`'s gitignored `dist/` so `tsc` could see the PR's new
  `HudSlotId`/`HudWidgetContent`/`setHudWidget` exports (stale build artifact, not a real error).
  One pre-existing test (`probe-opponent-condition.test.ts`'s "merman bug" case) asserted the OLD
  stripped behavior — updated it to assert the raw ANSI is now preserved, matching why the code
  changed. Verified: 18/18 targeted tests pass, full game-client suite 484/484 across 43 suites,
  `tsc --noEmit` clean, zero conflict markers anywhere in the repo. NOT done: the live
  dev-server/browser check with a real colored mob — didn't start a dev server myself (backgrounding
  `pnpm --filter game-client dev` orphans the vite child on your existing `:30080` per a standing
  note); this still needs an eyes-on pass against your running stack.
- 2026-09-20T01:40:00Z step 1's last open item closed: with your dev server running at
  `:30080`, verified live via a new Playwright script
  (`Shattered-AI/tools/browser-test/theme-ansi-color-check.mjs`, screenshots in that tool's
  gitignored `output/tests/theme-ansi-color/`). Dispatched a synthetic
  `event:fighting:opponent` CustomEvent (same event `useOpponentStatus` listens for) carrying a
  raw-ANSI cyan "merman" label — no live DSL connection needed since the render path is
  independent of connection state. Confirmed in BOTH layouts: classic renders `A
  <span style="color:#06989a">merman</span>` in `RightSidebar`; compact renders the identical
  colored span in `CompactVitalsRow`. Hit one real snag along the way, in the test script, not
  the app: the synthetic payload's `ts` was stamped once in Node at script start, so by the time
  the compact-layout dispatch fired (after an extra localStorage-set + reload), it had aged past
  `useOpponentStatus`'s 5s `ENEMY_STALE_MS` window and `isEnemyActive` silently read false —
  fixed by stamping `ts: Date.now()` inside the browser-side `page.evaluate` at actual dispatch
  time instead. Side finding, logged for awareness rather than acted on now: compact's shared
  `useStatusBlockViewModel` (from `useLayoutShell.ts`) pulls in `useEnemyHudState`'s own
  `event:fighting:opponent` subscription as a side effect, even though `CompactVitalsRow` gets
  its actual enemy data from a separate `useOpponentStatus()` call — a redundant subscription,
  pre-existing on classic before this PR, not a correctness bug, minor perf/cleanup candidate for
  whenever Step 2's shared-interface work touches this area. All of Step 1's Verify criteria are
  now satisfied.
- 2026-09-20T02:20:00Z step 2 done: `ThemeDefinition`/`HudShellBaseProps` registry built and both
  themes migrated onto it. Notable implementation calls, none of which change the plan's intent:
  named the shared props type `HudShellBaseProps` (not the plan's literal suggestion
  `LayoutShellProps`) — `LayoutShell.tsx` already has its OWN local, differently-shaped
  `LayoutShellProps` interface (adds `layoutVars`/resize handlers/`BottomPaneComponent`), so
  reusing that exact name for the new shared/common type would have shadowed a different concept.
  New `components/hud/DefaultThemeShell.tsx` adapts `LayoutShell` behind `HudShellBaseProps` —
  calls `useLayoutSizing()`/supplies `BottomPaneComponent` itself, the way `CompactLayoutShell`
  already sources its own sizing internally, so `default` is a real uniform registry entry rather
  than a special case; this let `MainContainer.tsx` drop its own `useLayoutSizing()` call and
  `BottomPane` import entirely (moved, not duplicated). Both `default` and `slate-amber` are fully
  lazy (`React.lazy`), not just the new theme — consistent with review comment #13's "prefer
  lazy-loading themes" read as a general principle, and it lets a 3rd theme added later follow the
  same pattern with no special-casing. `resolveActiveTheme(themeId, viewportWidth)` is a pure,
  directly-unit-tested function (`themeRegistry.test.ts`) covering the narrow-fallback and exact
  breakpoint-boundary cases, not just exercised indirectly through component tests.
  `hudLayoutStore.ts`+`hudThemeStore.ts` collapsed into one `hudThemeStore.ts` keyed by
  `HudThemeId` (new `shatteredArchive.hudTheme.id.v1` storage key — no migration needed, this
  feature has never shipped to real users). `GraphicsSettingsModal.tsx`'s two dropdowns HAD to
  collapse to one `Theme` selector in this same step (not deferred to Step 6 as originally
  scoped) — the store consolidation left no way to represent "layout" and "theme" as separate
  settings; Step 6 now only has the `CommandInput.module.scss` scope decision left. Verified:
  `tsc --noEmit` clean, full suite 485/485 across 43 suites, and a real production build confirms
  the code-splitting — `dist/assets/CompactLayoutShell-*.{js,css}` and
  `dist/assets/DefaultThemeShell-*.{js,css}` both land as chunks separate from the 5.4MB
  `main-*.js`. Refreshed `.annotated`/`.ai-context` for `features/hudLayout/`,
  `components/hud/`, and `pages/` per the host-edit convention (`components/.annotated` and
  `GraphicsSettingsModal.tsx` had no pre-existing entry to update — left as-is, not backfilled).
- 2026-09-20T02:35:00Z step 2's live-browser pass, against the still-running `:30080` dev server:
  new `Shattered-AI/tools/browser-test/theme-registry-check.mjs`
  (screenshots in that tool's gitignored `output/tests/theme-registry/`), three isolated browser
  contexts. (1) `default` theme at desktop width: classic shell, no "Slate & Amber" footer text,
  Step 1's ANSI-colored mob-name regression check still passes post-refactor. (2) `slate-amber` at
  desktop width (set via the new unified `shatteredArchive.hudTheme.id.v1` key): compact shell,
  "Slate & Amber" footer present, colored mob name still renders correctly. (3) `slate-amber`
  selected but at a 600px narrow viewport: correctly falls back to the classic/default shell (no
  "Slate & Amber" footer, mobile-responsive Tick/HP/MP/Sta header + Compass/Chat tabs) — confirms
  `resolveActiveTheme`'s narrow-fallback logic end-to-end, not just via the unit test. Zero
  console/page errors across all three contexts — the `React.lazy`/`Suspense` wiring introduced
  this step has no runtime warnings.
- 2026-09-20T03:10:00Z user follow-up, between steps 2 and 3: asked why the live theme didn't
  visually match the PR. Traced to test-condition gaps, not bugs — built two more reusable
  scripts (`theme-slate-amber-full.mjs`, `theme-slate-amber-connected.mjs`) that seed synthetic
  identity/vitals/room/widget state via the same event-dispatch trick, confirming every amber
  accent (terminal title, MOVE bar, room exits, widget variants) renders correctly once that
  state exists. One accent — the command-input focus aura — needed an actual connected state to
  verify: `CommandInput.tsx` is `disabled={!isConnected}`, and a disabled `<input>` cannot receive
  focus at all, so an earlier `.focus()` call had silently no-op'd. Fixed by mocking
  `window.WebSocket` (a fake class whose `onOpen` fires on a timer) and driving the REAL Connect
  UI (File → Connect… → fill host/port → Connect) so `useGameConnection`'s actual code path sets
  `isConnected`, rather than faking that state another way — confirmed the aura renders exactly
  as in the reference PR screenshot, with a plain green focus ring in the default theme for
  contrast. No code changes resulted; this was verification depth, not a fix.
- 2026-09-20T03:30:00Z step 3 done: `public/themes/slate-amber.css` deleted; its rules moved to
  `styles/hud/themes/slateAmber.theme.scss`, now nested under
  `:root[data-hud-theme='slate-amber']` instead of bare `:root` + flat classes, with the CSS
  custom-property tokens (`--sa-accent`, `--sa-panel-bg`, etc.) scoped inside that same block so
  they don't exist at all when the theme isn't active. Imported as a plain side-effect import
  directly in `CompactLayoutShell.tsx` — confirmed via a real build that this bundles the theme
  CSS into that component's OWN lazy chunk (`CompactLayoutShell-*.css` grew 3.55kB → 4.99kB,
  absorbing it; still a separate chunk from `main-*.css`), so `default`-theme users never fetch
  it. `hudThemeLoader.ts` deleted outright (default per the earlier firmed-up rule, not a
  judgment call) — checked first that it shares no id/mechanism with
  `UserStyleOverrideModal`/`applyPluginBaseCss` (`shatteredarchive-user-style-overrides` vs.
  per-plugin dynamic ids vs. the retired `hud-theme-style` — all distinct); `themeRegistry.ts`'s
  `loadStyles` now just sets the `data-hud-theme` attribute rather than swapping a `<link>`.
  Updated 6 stale `public/themes/...`-path references across `.annotated`/`.ai-context`/inline
  SCSS comments to the new location; left 2 explicitly historical "replaces the former
  public/themes/..." notes in place as intentional migration context, not scrubbed — the Verify
  line's literal grep isn't 100% clean because of those two, but nothing left is an active/broken
  reference. Verified: `tsc --noEmit` clean, full suite 483/483 (2 fewer than before — the
  deleted `hudThemeLoader.test.ts`'s 2 cases — offset by new `loadStyles` coverage in
  `themeRegistry.test.ts`), a real build confirms the chunk-bundling, and a fresh Playwright pass
  against the dev server shows the connected-state screenshot pixel-equivalent to the
  pre-migration one — same amber title/MOVE-bar/exits/input-aura, nothing regressed.
- 2026-09-20T04:15:00Z step 4 done: new `CompactLayoutShellNarrow.tsx`, registered as
  `slate-amber`'s `NarrowShellComponent`. Design decision (the step left "separate component vs.
  a mode of `CompactLayoutShell.tsx`" open): went with a separate component — the narrow layout
  differs enough (single column, tab strip instead of a persistent 2-column split, no
  resizer/sizing hook at all) that folding both into one component would have meant a maze of
  conditionals rather than two small, independently-readable files. Structurally mirrors classic
  `LayoutShell`'s OWN narrow-width pattern (`LayoutShell.module.scss`'s `@media (max-width:
  900px)`: stack to one column, hide the secondary pane, tab it back in via `BottomPane`) — traced
  that file first rather than inventing a new responsive idiom, per the step's instruction. Reuses
  the exact same desktop sub-components (`CompactVitalsRow`, `CompactRoomRow`, `CompactWidgetSlot`,
  `CommandInput`) so the existing `sa-hud-*`-targeted CSS rules apply with zero changes; the one
  genuinely new element (a Chat/Affects tab strip — no separate Compass tab, since compact already
  shows exits inline in the room row, unlike classic) got one small addition to
  `slateAmber.theme.scss`: `.sa-hud-narrow-tab[data-active='true']`, deliberately not
  media-query-wrapped since the class only ever renders inside this narrow-only component. Both
  `CompactLayoutShell.tsx` and `CompactLayoutShellNarrow.tsx` import the theme SCSS directly (a
  session that's phone-width the whole time must get the CSS bundled into ITS OWN chunk, can't
  assume the desktop chunk loaded first) — confirmed via build that both are genuinely separate
  lazy chunks from `main-*`. Had to update two other tests whose assertions were the OLD, now-wrong
  behavior (this is exactly what THIS step changes): `themeRegistry.test.ts`'s "falls back to
  default since slate-amber has no narrow variant yet" test — rewrote to assert slate-amber now
  resolves to its OWN narrow shell, and added a NEW test that exercises the generic fallback code
  path itself (temporarily deleting `NarrowShellComponent` and restoring it) so that logic stays
  covered even though no currently-registered theme takes it anymore. Same fix in
  `MainContainer.test.tsx` — its narrow-viewport test asserted a `classic-shell` fallback for
  slate-amber; split into two tests (slate-amber narrow → its own shell; default narrow → still
  classic), and added a `CompactLayoutShellNarrow` mock alongside the existing `CompactLayoutShell`
  one (the real component isn't mocked in that test file, so it tried to render `<Terminal/>` for
  real and hit a ResizeObserver error in jsdom — caught by running the full suite, not assumed).
  Verified: `tsc --noEmit` clean, full suite 490/490 across 43 suites, a real build confirms
  `CompactLayoutShellNarrow-*.{js,css}` as their own chunks, and a new
  `theme-slate-amber-narrow.mjs` Playwright script (480px viewport, same synthetic-event seed
  trick) confirms all three Verify criteria visually: slate-amber narrow shows the full amber
  scheme (title glow, MOVE bar, room exits, active-tab border) with working Chat↔Affects
  switching, and default's narrow behavior (classic's existing `BottomPane` Compass/Chat tabs) is
  pixel-unchanged.
- 2026-09-20T05:00:00Z step 5 done, with a real bug caught and fixed mid-step, not just the
  planned removal/move. `userScriptRuntime.ts`'s two hot-path scans and their call sites are gone
  (grep-confirmed); new `world-time-and-identity.plugin.ts` holds both, `timeStringToPeriod` as
  pure hour-math per the boundaries established two turns ago (sunrise 7am/sunset 7pm, Dawn/Dusk
  one hour before each), the score-sheet scan gated exactly like `OPPONENT_GATES`. **Bug**: the
  plugin's first version used `onEnable` to register `api.onEvent('game:tick', ...)` directly
  (mirroring PR #153's tick-warning plugin) ALONGSIDE a module-level `onEvent(api, evt)` hook for
  the raw-data scan — but `game:tick` is ALSO in `routed-gmcp-events.ts`'s `ROUTED_WINDOW_EVENTS`,
  which `pluginHost.enable()` wires to `onEvent` automatically for EVERY module that defines one.
  Both registrations use the identical dedup key (`pluginId::eventName`), so the automatic
  ROUTED_WINDOW_EVENTS wiring (registered after `onEnable` runs) silently overwrote the
  onEnable's direct subscription — the period never updated, with no error anywhere. A unit test
  with a mocked `api.onEvent` could not have caught this: the mock has no concept of
  ROUTED_WINDOW_EVENTS or dedup keys, so it looked correct in isolation. Caught by the
  `world-time-and-identity-check.mjs` Playwright script (new, against the real dev server) —
  identity populated correctly (proving the plugin WAS enabled and raw-data routing worked) but
  `__SA_WORLD_TIME__` stayed `undefined` after a real `game:tick` dispatch; confirmed via the
  event-dispatcher registry inspection trick (same one used earlier this session for the
  `useEnemyHudState` finding) that the `game:tick` listener key existed but the period still
  never set — pointing straight at "something else owns that key now." Fixed by consolidating
  into a SINGLE `onEvent(api, evt)` branching on `evt.name` (`'game:tick'` vs.
  `'shatteredarchive:raw-data'`) — the framework-intended pattern for a plugin needing more than
  one routed event, matching `ai-template/plugin-authoring.md`'s explicit warning that a module
  defining `onEvent` gets ALL of ROUTED_WINDOW_EVENTS, not opt-in per-event. Rewrote the plugin
  test file to match (no `onEnable` to mock through — calls `plugin.onEvent(api, evt)` directly,
  the same shape `pluginHost` actually uses) and re-verified live: the 🌙 period icon now renders
  in `CompactRoomRow` end-to-end from a real dispatched `game:tick`. `onActivate` (new
  `ThemeDefinition` field, separate from `loadStyles` since it's plugin lifecycle not visual)
  wired into a `MainContainer.tsx` effect placed AFTER the plugin-registration effect — ordering
  verified deliberately, not assumed, since `pluginHost.enable()` on an unregistered id is a
  silent no-op that would have produced the exact same "looks fine, nothing happens" failure mode
  as the game:tick bug. Verified: `tsc --noEmit` clean, full suite 503/503 across 42 suites
  (down 1 suite — 2 old userScriptRuntime tests deleted, replaced by 1 much larger plugin test
  file), a real build, and the live Playwright check now shows correct state for both themes.
- 2026-09-20T05:20:00Z step 6 done — turned out to be mostly verification, not new work. The
  dropdown collapse itself was already done in Step 2 (pulled forward then, out of necessity —
  the store consolidation left no way to keep representing "layout" and "theme" as independent
  settings); confirmed the code still reflects that (grepped for `hudLayout`/"HUD layout" in
  `GraphicsSettingsModal.tsx` — none left) rather than assuming Step 2's note was still accurate.
  `CommandInput.module.scss` decision: read the actual diff against the pre-PR baseline (`git
  diff 35906f4 -- .../CommandInput.module.scss`) rather than going from memory — it's a uniform
  +0.05rem font-size bump and slightly larger padding across every element in that file (input,
  mic button, hint text, action buttons). That reads as general legibility polish, not something
  "driven by compact's tighter spacing" (if anything, tighter spacing would push sizes down, not
  up) — decided (a): stays in the shared base file, benefits both themes equally. No code change
  needed since the PR already put it in the shared file, which is where it belongs; the decision
  was confirming that placement was already correct, not moving anything. New
  `graphics-settings-theme-check.mjs` Playwright script closes out the Verify line for real,
  through the ACTUAL Settings UI for the first time this session (Game → Settings → Graphics… →
  Layout tab) rather than direct `localStorage` manipulation like every earlier script — confirms
  exactly one `<select>` element on the tab, labeled "Theme" with Default/Slate & Amber options,
  that changing it writes `shatteredArchive.hudTheme.id.v1` correctly, and that a real page reload
  reflects the change. Verified: full suite still 503/503 (no files touched this step besides the
  plan doc and the new script), live UI check green.
- 2026-09-20T05:30:00Z user feedback, post-step-6: the new Theme `<select>` was unstyled —
  `GraphicsSettingsModal.module.scss`'s `.field` rule styled `input` elements (dark background,
  light text, matching the modal) but had no `select` rule at all, so it fell back to the
  browser's native (light) rendering, clashing against the dark modal — visible in the Step 6
  screenshot but not flagged at the time. Fixed by extending `.field`'s existing `input` rule to
  also cover `select`/`option` with the same dark styling. Re-ran
  `graphics-settings-theme-check.mjs` to confirm visually (dropdown now dark, matches the rest of
  the modal) and the full suite (still 503/503, pure CSS change).
- 2026-09-20T05:45:00Z user decision, opening Step 7: the original step text asked to first
  "confirm whether `<Terminal/>` still remounts on a shell swap" and only then decide reload-vs-
  live. Read `useTerminal.ts` directly — it creates a brand-new `XTerm` instance (scrollback:
  5000, empty) on every mount and fully `.dispose()`s on unmount, and each per-theme shell
  rendered its own `<Terminal/>` — so a swap genuinely wiped scrollback; theme switching was, in
  fact, 100% reload-only (`hudThemeId` was a read-once `useState(() => getHudThemeId())` with no
  update path at all). Presented that finding via `AskUserQuestion` with three options; user chose
  the largest one, "Build live switching now" — explicitly: make `hudThemeId` reactive, hoist
  `Terminal` above the per-theme shell, AND audit/fix every hook a live switch could blank —
  meaningfully larger than the step's original scope, taken on deliberately.
- 2026-09-20T06:10:00Z live reactivity wired: `hudThemeStore.ts` gained
  `HUD_THEME_CHANGED_EVENT` (`'shatteredarchive:hud-theme-changed'`), dispatched via
  `DispatchEvent` from `setHudThemeId` after the localStorage write. `MainContainer.tsx`'s
  `hudThemeId` changed from a read-once initializer to real state kept in sync by a `ListenEvent`
  subscription to that event — same-tab reactivity, since native `storage` events never fire
  same-tab. `GraphicsSettingsModal.tsx`'s stale "Takes effect after reloading the page." hint
  replaced with "Applies immediately — no reload needed."
- 2026-09-20T06:40:00Z Terminal hoisted above the per-theme shell: added a `terminalSlotRef`
  prop to `HudShellBaseProps` (`LayoutShellProps.ts`), threaded through
  `CompactLayoutShell.tsx`/`CompactLayoutShellNarrow.tsx`/`LayoutShell.tsx` (each now renders a
  bare `ref={terminalSlotRef}` div instead of its own `<Terminal/>`), and rendered `<Terminal/>`
  once in `MainContainer.tsx` via `createPortal`. **First attempt was wrong and shipped a real
  bug**, caught only by live Playwright (exactly the scenario the standing "verify empirically"
  discipline exists for — unit tests with mocked shells couldn't have caught it): the first
  version portaled directly into `terminalSlot`, the CURRENT shell's own slot div, reasoning
  (recorded in a since-corrected code comment) that `createPortal` "moves" its child into a
  changed container across renders. That's false — React's reconciler treats a portal's container
  as part of the fiber's identity, so a different container on a later render unmounts the old
  portaled subtree and mounts a fresh one, which is exactly the remount this hoist was built to
  avoid. A live script (`theme-live-switch-durability.mjs`, new) seeded a marker line into the
  terminal, switched live to slate-amber, and found the marker gone — confirming the bug
  concretely rather than by inspection. Fixed by decoupling identity from position: a `terminalHost`
  detached DOM node is created ONCE (`React.useState(() => document.createElement('div'))`) and is
  the permanent, never-changing `createPortal` target for the app's lifetime, so Terminal's React
  identity never changes; a separate `useEffect` imperatively `.appendChild()`s that same node into
  whichever shell's `terminalSlot` is currently attached — a plain DOM move (removes from the old
  parent, reinserts in the new one) that preserves the live xterm canvas/state, since it's the same
  node throughout. Re-ran the live script after the fix: marker survives both
  default→slate-amber and slate-amber→default. `MainContainer.test.tsx` and the new
  `MainContainer.themeDurability.test.tsx` both needed a `jest.mock('../components/Terminal', ...)`
  added as a side effect of this fix — `terminalHost`/the portal are now unconditional (not gated
  on any shell actually calling `terminalSlotRef`), so the REAL `Terminal.tsx` started mounting in
  those two suites for the first time and hit `new ResizeObserver(...)` (called directly in
  `Terminal.tsx`, not behind the already-mocked `useTerminal` hook), which jsdom doesn't implement;
  mocked the component rather than polyfilling a browser API these suites have no other reason to
  need.
- 2026-09-20T07:10:00Z hook-seeding audit (the "audit hooks a theme switch could plausibly touch"
  half of the original step text): found 5 hooks with local `useState` that would render blank
  for one tick on every live remount (vitals/ancillary, sanctuary, affects, room name/sector,
  opponent status) against 2 already-safe ones (`useCompassBlock` via the pre-existing
  `roomDataStore`, `useCharacterIdentity`/`useWorldTimePeriod` via the `window.__SA_*` globals).
  Fixed all 5 by mirroring `roomDataStore.ts`'s existing module-level-cache pattern: new
  `features/charData/charDataStore.ts`, `features/affects/affectsStore.ts`,
  `features/combat/opponentStatusStore.ts` (each `{ setX, getX, __resetForTests }`), wired into
  `useCharData.ts`/`useAffectsBlock.ts`/`useOpponentStatus.ts` (seed `useState` initializer from
  the cache, write to the cache on every update); `useSanctuaryActive.ts` deliberately reuses
  `affectsStore` rather than getting its own store, since it's a derived boolean over the same
  underlying affects data `useAffectsBlock` already caches. `useOpponentStatus`'s cache stores the
  FULL `EnemyUiState` including `lastSeenTs`, not a separate staleness flag — `isEnemyActive` is
  always derived fresh from `lastSeenTs` vs. the live clock on every render, so a fresh mount
  within the staleness window correctly reads active and one past it correctly reads inactive,
  with no extra bookkeeping. Retrofitted `__resetForTests()` onto the pre-existing
  `roomDataStore.ts` too (never needed one before — this is the first time anything actually
  tests it), to stop the new module-level caches leaking state across `it()` blocks in the same
  file. New test files: `useRoomHeader.test.ts`, `useAffectsBlock.test.ts`,
  `useSanctuaryActive.test.ts` (none existed before); extended `useOpponentStatus.test.ts` with 3
  seeding-specific cases (writes-through, fresh-mount-seeds-active, fresh-mount-past-staleness-
  seeds-inactive). **Second real bug found by this same test pass** (not Playwright this time —
  a plain jest run): `useRoomHeader.test.ts`'s remount-seeding test failed for real —
  `useRoomHeader.ts` read from `roomDataStore` but never WROTE to it; only the separate
  `useCompassBlock` hook did, as a side effect of its own concerns. Seeding therefore only worked
  by accident, contingent on `useCompassBlock` happening to be mounted alongside `useRoomHeader`
  in every shell — exactly the "state that wouldn't survive a theme switch cleanly" case the
  standing escalation rule names, except here the fix was the ALREADY-established pattern (every
  other hook this step writes its own cache directly), so no new decision was needed — fixed
  `useRoomHeader.ts` to call `setRoomData` itself rather than depending on a sibling hook.
- 2026-09-20T07:30:00Z engine-durability test (the connection/plugin-host half of the original
  step text, answering review comment #3 directly): new
  `MainContainer.themeDurability.test.tsx`, mirroring `MainContainer.test.tsx`'s mock set with one
  addition — `useGameConnection`'s mock wraps a real `useEffect` with mount/cleanup spies, since an
  unwanted MainContainer remount would show up as a second mount run or an unexpected cleanup, which
  a plain call-count on the hook itself can't distinguish from an ordinary re-render. `pluginHost`
  is left REAL (not mocked, only spied via `jest.spyOn`) so its actual `enable()` idempotency guard
  (`if (s.enabled.has(id)) return`, read directly in `pluginHost.ts`) is what's under test. Single
  test mounts `MainContainer`, cycles `setHudThemeId` default→slate-amber→default→slate-amber, and
  asserts: the connection mount-effect ran exactly once and its cleanup never ran (proving
  MainContainer itself never unmounted — only `ActiveShell` swapped); `pluginHost.enable` was
  called twice for `world-time-and-identity` (once per entry into slate-amber, via
  `themeRegistry.ts`'s `onActivate`) but `pluginHost.isEnabled` shows it only actually got created
  once, proving the existing guard already prevents double-subscription with no new production
  code needed; `pluginHost.disable` was never called, matching `themeRegistry.ts`'s documented
  "never auto-disables" contract. This also settles the step's "no user-script timer/alias gets
  duplicated" ask without a separate mechanism to test: aliases/timers are created inside
  `pluginHost.enable()`'s body, gated by the same idempotency guard just verified, so there's no
  other code path that could duplicate them.
- 2026-09-20T07:45:00Z full verification pass: `tsc --noEmit` clean; full suite 517/517 across 46
  suites (up from 503/42 — 3 new hook test files, 1 new `useOpponentStatus` case set, 1 new
  `MainContainer.themeDurability.test.tsx`); a real production build confirms per-theme shell
  chunks are still correctly separated from `main-*.js` (`CompactLayoutShell` 3.86KB,
  `CompactLayoutShellNarrow` 2.42KB, `DefaultThemeShell` 19.66KB) — Terminal/xterm.js moving into
  `main-*.js` (now ~350KB larger, an accepted tradeoff of hoisting it out of the lazy shells) did
  not regress the per-theme split those chunks exist to prove. Live Playwright,
  `theme-live-switch-durability.mjs` (new): seeds a marker line into the terminal and a room name
  via `game:room-data`, then drives the REAL Settings UI (Game → Settings → Graphics… → Layout →
  Theme select) through default→slate-amber→default — confirms both the marker and the room name
  survive each live switch, `data-hud-theme` updates correctly, the URL never navigates (a true
  in-place swap, not a reload), and zero console/page errors throughout. This is the run that
  caught the portal-container bug above; the version logged here is the post-fix, passing run.
- 2026-09-20T08:15:00Z step 8 done, plan COMPLETE — user asked to finish everything except the
  PR/git sync explicitly. `docs/superpowers/specs/2026-09-14-custom-hud-layout-design.md` §4.4
  rewritten from the original two-independent-settings design ("layout and theme are
  independent... not one combined toggle") to describe the collapsed theme-registry model that
  actually shipped (one `hudThemeStore.ts`, one `themeRegistry.ts`, one selector — plus a note
  that switching is now live, not reload-required); the one other place in the doc that flatly
  restated the superseded decision (§8's "Resolved decisions" list) got a one-line "Superseded"
  pointer back to §4.4 rather than being silently left contradicting it. Appended a dated Rework
  note to `docs/superpowers/plans/2026-09-14-custom-hud-layout.md` (2452 lines — read only its
  head + tail, not the whole thing, since the append needed no knowledge of the middle) rather
  than editing its original task-by-task content: summarizes the review finding that forced the
  settings collapse, the hot-path regex fix, the PR #152 ANSI-conflict resolution, the real-SCSS
  theme delivery, the narrow-viewport shell, the live-switching addition, and the Playwright
  verification layer that didn't exist in the original plan — with an explicit pointer back to
  this doc as the authoritative detailed history, and a note that the original plan's unchecked
  tasks are left as-is (a historical record of the pre-rework design, not something to resume).
  Full verify pass: `tsc --noEmit` clean, a real production build (chunk shapes unchanged from
  Step 7's), full suite 517/517 across 46 suites, and a check for unresolved conflict
  markers/unmerged paths (none). Per the standing git-actions rule this step does NOT commit,
  merge-finalize, or push anything — the working tree is left exactly as edited, for the user to
  review and commit/PR themselves whenever they choose.
- 2026-09-20T09:00:00Z real bug found by the user in a live browser, post-plan-completion: the
  terminal didn't fill its panel in slate-amber (compact) — a visible gap of black background
  between the actual xterm content and the HP/Mana/MOVE row below it. Root cause: `Terminal.tsx`'s
  own root divs (`playAreaTerminalWrapper`/`playAreaTerminal`) size themselves via `flex: 1;
  min-height: 0`, which only takes effect when their DIRECT parent is `display: flex` — true of
  every shell's own terminal slot (`.terminalBody`, `.playAreaTerminalShell`, both `display:
  flex` on purpose) before Step 7's portal hoist, but NOT true of `terminalHost`
  (`MainContainer.tsx`'s permanent portal container), which was only ever given `width/height:
  100%`, not `display: flex`. So Terminal's flex rules went inert one level deeper than before:
  its rendered height collapsed to auto/content-size while the slot's own black background still
  correctly filled the full flex-allocated space around it — a real, user-visible gap that none
  of Step 7's verification caught, because every check that mattered (marker text present, room
  name present) only asked "is the content there," never "is it the right SIZE." Fixed by adding
  `display: flex; min-height: 0; min-width: 0` to `terminalHost`'s inline styles, restoring the
  same flex-container role every shell's own slot already played. Verified with a new script,
  `terminal-fill-check.mjs` (compares `getBoundingClientRect()` of the slot vs.
  `#play-area-terminal-root` across all three shells — default, slate-amber desktop, slate-amber
  narrow): 0px gap in all three after the fix. Also re-ran `theme-live-switch-durability.mjs`
  (still green) and the full suite (517/517, `tsc --noEmit` clean) — this was a pure sizing fix,
  no behavior a unit test would exercise. Lesson for next time a portal/wrapper div is inserted
  into an existing flex layout: verifying content PRESENCE live is not the same as verifying
  SIZE/layout live — a dimension-comparison check like this one is now the template for that.
- 2026-09-20T09:30:00Z separate, smaller bug fixed in `usePlugins.ts` (NOT part of this plan —
  `usePlugins.ts`/`PluginsModal.tsx`/`people.plugin.ts` were never touched by the theme-engine
  work): a live dev-console report showed "Cannot update a component (MainContainer) while
  rendering a different component (PluginsModal)" plus a duplicated plugin onEnable log.
  Root cause: `setPluginsPersist` called `saveToStorage()` (which synchronously DispatchEvents
  `PLUGINS_UPDATED_EVENT`) INSIDE the `setPlugins` state-updater function — since PluginsModal and
  MainContainer each mount their own independent `usePlugins()` instance and both listen for that
  event, toggling a plugin synchronously triggered a cross-component setState during
  PluginsModal's own render/update processing. Fixed by moving the persistence side effect into
  its own `useEffect` keyed on `plugins`, which runs strictly after commit. Verified live (new
  script, `plugins-modal-render-warning-check.mjs`, also not part of this plan's tooling list):
  zero render-phase warnings across 3 toggles, exactly one onEnable log per genuine enable.
  Logged here only as a pointer — full detail is in the conversation, not repeated in this plan's
  Context section, since it's unrelated to HUD theming.
- 2026-09-20T09:45:00Z follow-up from a user-annotated screenshot after the terminal-fill fix:
  the top gap above the terminal panel (menu bar to `.terminalPanel`'s top edge) read as too
  large now that the bigger middle-gap bug no longer dominated the picture — a genuine, if
  smaller, pre-existing issue (not something today's fixes introduced; `.leftColumn`'s CSS was
  never touched before this). Measured live (`terminal-panel-spacing-check.mjs`, new): the full
  36px gap traced entirely to `.leftColumn`'s (`CompactLayoutShell.module.scss`) and `.shell`'s
  (`CompactLayoutShellNarrow.module.scss`) `padding-top: 2rem` — reserved for the embedded
  terminal-panel title's `top: -1.5em` clearance (`_BorderedPanel.scss`), whose own comment
  states only "~1.5x this element's own font-size" (i.e. `1.5rem` = 24px) is actually required.
  2rem carried ~8px of unneeded slack. Tightened both to `1.5rem`. Verified live with the title
  actually POPULATED (`terminal-title-clip-check.mjs`, new — a real risk the earlier
  disconnected-only screenshots couldn't have shown either way): title fully visible, 23px of its
  own clearance above the panel edge, not clipped, in both the desktop and narrow shells. Also
  re-confirmed the terminal still fills its slot exactly (0px gap, `terminal-fill-check.mjs`) and
  the bottom of the terminal was ALREADY correct (0-1px, just the panel's own 1px border) — the
  "bottom gap" half of the user's annotation didn't correspond to an actual measurable gap.
  Full suite still 517/517.
- 2026-09-20T10:15:00Z the "bottom gap" WAS real after all — the user pointed it out again
  specifically in the narrow shell after confirming the top-padding fix looked right. Traced
  it properly this time (3 new scripts): `terminal-corner-rounding-check.mjs` used
  `elementFromPoint()` at points geometrically outside an 8px-radius corner and got a FALSE
  POSITIVE ("square") on 3 of 4 corners — hit-testing on a rounded+clipped box doesn't
  necessarily follow its own border-radius, so that test wasn't proof of anything visual, just a
  dead end (left in the tool folder as a documented negative result). The real technique:
  `terminal-corner-zoom-hires.mjs` (4x device-scale, tight crop) showed the corners ARE correctly
  rounded — the actual issue is a color seam, not a shape one. xterm's row-fit leaves a small
  leftover strip at the bottom (a fixed row pixel-height essentially never divides the container
  height evenly — normal for any terminal), and `.sa-hud-terminal-panel` was sharing
  `background: var(--sa-panel-bg)` (`#111113`, a dark slate gray) with every OTHER slate-amber
  panel (vitals-row, chat-pane, etc.) in `slateAmber.theme.scss`. For those other panels that's
  correct — they have real visible chrome. But the terminal panel's content is ALWAYS pure black
  (xterm's own `.xterm-viewport` sets `background-color: rgb(0,0,0)` on itself, independent of
  any theme), so that leftover strip showed the slate-gray panel chrome instead of matching
  black — a visible seam right where "the terminal should touch its rounded corner." Split
  `.sa-hud-terminal-panel` out of the shared panel-background selector group with its own
  `background: #000` (border-color/radius still shared). Verified: full suite 517/517, a real
  build, and the 4x zoom screenshots re-taken post-fix — seam gone, corners read as a single
  continuous black shape in both desktop and narrow. `terminal-panel-spacing-check.mjs`,
  `terminal-corner-rounding-check.mjs`, `terminal-internal-overflow-check.mjs`,
  `terminal-corner-zoom-hires.mjs`, and `terminal-narrow-bottom-corner-check.mjs` all stay in the
  tool folder as reusable diagnostics for this class of "does X actually touch Y" visual claim —
  the corner-rounding one specifically documents WHY elementFromPoint isn't reliable for that
  question, so it doesn't get reached for again as a first instinct next time.
