---
topic: "Themed UI (dark/light and custom themes): surfaces, native controls, states"
prefix: TH
applies-when: theme, dark mode, light mode, color scheme, SCSS themes, forms, modals, panels, lists, scrollbars, inputs
---

### TH-01 Native scrollbar stays in the default (light) style on a themed surface
- Applies when: a themed container can overflow: a form, modal, panel, list, table, dropdown or log view.
- Edge case: the surface is themed dark but its scrollbar track and thumb render light.
- Required behaviour: scrollbars follow the surface's theme (set `color-scheme` on the themed root, or `scrollbar-color` and the
  `::-webkit-scrollbar` rules where custom scrollbars are used) in every supported browser.
- Verify: screenshot of the themed surface with enough content to overflow and the scrollbar visible, in each theme.
- Origin: general; raised by the owner as the motivating example, 2026-10-31.

### TH-02 Native form controls render in the OS style instead of the theme
- Applies when: the work contains `input`, `select`, `textarea`, checkbox, radio, date/time or number inputs, `progress`, `details`.
- Edge case: checkboxes, date pickers, number spinners and the open `select` popup stay light on a dark surface (or the reverse).
- Required behaviour: native controls follow the theme (`color-scheme`), and custom-styled controls cover the same variants.
- Verify: screenshot with one of each control type present, including an open select popup.
- Origin: general.

### TH-03 Only the default state is themed
- Applies when: any interactive element is added or restyled.
- Edge case: hover, focus-visible, active, disabled, invalid/error and loading states keep the previous theme's colors or lose
  contrast.
- Required behaviour: every state is styled for every theme and text keeps WCAG AA contrast against its background.
- Verify: screenshot or computed-style test per state (a story/showcase page that forces each state is acceptable).
- Origin: general.

### TH-04 Placeholder, selection, caret and autofill colors ignore the theme
- Applies when: text inputs or selectable text are themed.
- Edge case: placeholder text, `::selection`, `caret-color` or the browser's autofill background are unreadable against the themed
  surface.
- Required behaviour: each is legible in every theme.
- Verify: screenshot with a focused empty input, selected text and a filled input; autofill is checked in a real browser or noted as
  unverified.
- Origin: general.

### TH-05 A live theme switch does not reach already-mounted UI
- Applies when: the app lets the theme change without a reload, or the work caches theme values (JS constants, canvas, inline styles,
  third-party widgets).
- Edge case: after switching theme, existing components keep the old colors until remounted or reloaded.
- Required behaviour: mounted surfaces update on switch, with no reload.
- Verify: test or Playwright script that switches the theme with the surface mounted and asserts a computed style or takes a
  before/after screenshot.
- Origin: general.
