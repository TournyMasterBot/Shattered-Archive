# TypeScript / TSX standards

Created 2026-10-31 by `/tech-plan` for work item `2026-10-17_plugin-config-save-freezes-defaults`. Only the categories that plan needed are
decided here; the rest (async and state, security-sensitive code, ...) are undecided and get asked when a plan needs them. Repo-wide rules
stay in `.github/copilot-instructions.md`. Applies to `ShatteredArchive` (`apps/`, `services/`, `sdks/`, `utils/`, `types/`);
`shatteredarchive-mobile` has its own conventions, noted at the end.

## Formatting and lint
Enforced by `eslint.config.mjs` (`pnpm lint`, `--max-warnings=300`) and `prettier` (`pnpm --filter <package> run format`, which WRITES files:
review it with `git diff`, do not run it over files you did not change). Do not restate or override rules the tools enforce.

## Naming and layout
- Modules under `features/<area>/` are camelCase files (`pluginHost.ts`, `pluginConfigPersist.ts`); a new pure helper gets its own module
  there rather than growing a large existing file or a component.
- Core plugins are `<kebab-name>.plugin.ts`. Tests are co-located next to the code.

## Types and nullability
- Dynamic config and storage payloads are `Record<string, unknown>`, narrowed from `unknown`. No new `any` (lint warns on it and the warning
  budget is capped); an `any` that already exists in a file is left alone unless the work is about it.
- Test files (`*.test.ts(x)`, `__tests__/`) may use `any` for mocks and fixtures: `eslint.config.mjs` turns `no-explicit-any` off for
  them (decided 2026-10-31 while clearing the lint baseline). Production code keeps the warning.

## Errors
- Storage reads and writes fail safe: `try`/`catch`, fall back to the previous value, never throw into the UI.
- A swallowed failure in new code logs a single `console.warn` with a fixed message and **no config values, keys' contents or user text**
  (`docs/standards/data-classification.md`).

## Async and state
Decided 2026-11-06 (`2026-11-05_copilot-ai-training-sibling-to-autopilot`).
- A hook that subscribes (`ListenEvent`, timers, sockets) returns the unsubscribe from its effect. Every `fetch` takes an `AbortSignal` and the
  effect aborts it on cleanup; a polling or tail loop takes a stop signal and ends on unmount or server shutdown.
- A test proves it: after unmount or shutdown no further request, timer tick or file read happens.
- Enforced by review and tests; no lint rule covers it.

## Security-sensitive code
Decided 2026-11-06 (`2026-11-05_copilot-ai-training-sibling-to-autopilot`).
- A new HTTP server validates every request with hand-written validators (no new validation dependency): body-size cap, unknown fields
  rejected, types and ranges checked, and string ids matched against a strict pattern before they touch a path or a store.
- A local-only server (Copilot) refuses to start unless its enable flag is set, listens only on its configured address, rejects a non-local
  `Origin`, and never logs game text, character names or request bodies (`docs/standards/data-classification.md`).
- Local-only client code is behind a build-time constant so the production bundle does not contain it; a script asserts that on the built output.

## Testing
- Tests are co-located `*.test.ts` / `*.test.tsx` (79 of 79 in `game-client`). Pure helpers get unit tests; components are rendered with
  Testing Library and asserted on observable output or the `onSave`-style callback payload (as `PluginConfigModal.test.tsx` does).
- Tests assert concrete behaviour and cover every added branch and error path (`.github/copilot-instructions.md`, "Tests and coverage").

## shatteredarchive-mobile
Kebab-case modules in `dsl-client/features/<area>/` (`plugin-config-storage.ts`); tests live in `__tests__/*-test.ts(x)` (46 of 46);
storage helpers in `plugin-config-storage.ts` also `try`/`catch` and fall back. The Types, Errors and Testing decisions above apply there too.

Formatting and lint: the app's own `lint` script and ESLint config are the rule.

Async and state (decided 2026-11-26, `2026-11-26_mobile-crafting-helper-port-and-hud-docks`): the "Async and state" decision above applies, plus one
requirement in the user's words: timers and loops of autopilot, crafting, user scripts and other plugins "need to continue running for the play
terminal while [it] isn't the active window. While the game is loaded and connected, once initiated, we want to maintain the running state regardless
of which screen the user is looking at."
- Run state and its timers belong to app-lifetime objects (the script engine, plugin host, autopilot controller), never to a screen or component. A
  component's unmount or loss of focus stops only what that component itself started for display.
- "Stop on cleanup" therefore means: on disable, disconnect, character change or an explicit stop. Not on navigation.
- Settings and data stores keep the load / get / save / subscribe shape (`features/autoleveling/autopilot-display-settings.ts`).
- A test proves both halves: the run continues after the screen unmounts, and nothing fires after disable or disconnect.
