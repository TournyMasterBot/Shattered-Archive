# HUD Themes

This folder documents `apps/game-client`'s HUD theme-registry engine — the system
that lets the game client render entirely different HUD shells (layout *and*
visual skin, as one unit) behind a single "Theme" selector, switchable live
with no page reload.

It exists because of a real rework: community PR #151 originally shipped a
"compact layout" toggle and a "Slate & Amber" skin toggle as two independent
settings. Review found that didn't hold up — a theme's *shape* can diverge,
not just its colors — so it was collapsed into one registry where each theme
owns its shell component(s), its skin, and (optionally) which plugins it
depends on. `slate-amber` is the first theme built on this engine, alongside
the original `default` (classic) theme. Full build history:
`.ai-plans/20260920-0005-hud-theme-engine.md`.

## Start here

- **[creating-a-theme.md](./creating-a-theme.md)** — the contract, a
  step-by-step walkthrough, styling conventions, live-switching requirements,
  a testing checklist, and (at the end) an example prompt for asking Claude
  to build a theme for you.
- **[gotchas.md](./gotchas.md)** — real bugs hit while building `slate-amber`
  and wiring live switching, each with the symptom, root cause, fix, and how
  it was actually caught. Read this before you build anything non-trivial —
  several of these are easy to reintroduce if you don't know they're there.

## The shape of the system, in one picture

```
features/hudLayout/hudThemeStore.ts       one HudThemeId ('default' | 'slate-amber' | ...),
                                           localStorage-backed, dispatches
                                           HUD_THEME_CHANGED_EVENT on change

features/hudLayout/themeRegistry.ts       THEME_REGISTRY: Record<HudThemeId, ThemeDefinition>
                                           + resolveActiveTheme(themeId, viewportWidth)

pages/MainContainer.tsx                   calls resolveActiveTheme() every render,
                                           renders whichever ShellComponent it resolves
                                           to inside <Suspense>; owns the connection,
                                           plugin host, and the single hoisted <Terminal/>
                                           — none of that is theme's concern

components/hud/LayoutShellProps.ts        HudShellBaseProps — the contract every
                                           theme's shell component receives

components/hud/<YourTheme>Shell.tsx       your theme's shell(s) — what actually renders

styles/hud/themes/<yourTheme>.theme.scss  your theme's visual skin, gated behind
                                           :root[data-hud-theme='<your-id>']
```

A theme is, concretely: one or two React components (a desktop shell, and
optionally a narrow-viewport shell) implementing `HudShellBaseProps`, one SCSS
file for the skin, and one entry in `THEME_REGISTRY`. Nothing else in the app
needs to know your theme exists — `MainContainer.tsx`, the connection, the
plugin host, and the Settings UI all read the registry, not a hardcoded list.
