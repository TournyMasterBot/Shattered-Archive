# SCSS standards

Created 2026-11-06 by `/tech-plan` for work item `2026-11-05_copilot-ai-training-sibling-to-autopilot`. Only the categories that plan needed are
decided here (formatting and lint, naming and layout); the rest are undecided and get asked when a plan needs them. Repo-wide rules stay in
`.github/copilot-instructions.md`. Applies to `apps/*/src/styles/` in `ShatteredArchive` (31 files in `game-client`).

## Formatting and lint
Formatted by `prettier` (`pnpm --filter <package> run format` writes files: review with `git diff`, never run it over files you did not change).
No stylelint is configured and none is added.

## Naming and layout
- One CSS module per component: `styles/<ComponentName>.module.scss`, imported as `styles` in the component.
- Each module declares its own palette variables at the top (copy the set from `AutoLevelingWizard.module.scss`: `$bg`, `$bg-raised`, `$border`,
  `$text`, `$accent`, ...) and sets `color-scheme: dark` on the root surface. Colors are not hard-coded outside that variable block.
- A floating panel uses `position: fixed` with an explicit `z-index` comment saying what it must sit above or below.
- The edge-case catalog (`edge-cases/theming-dark-mode.md`) applies to every new surface.
