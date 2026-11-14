# JavaScript / MJS standards

Created 2026-11-01 by `/tech-plan` for work item `2026-11-01_mobile-expo-sdk-upgrade`. Only the categories that plan needed are decided here
(formatting and lint, naming and layout, testing); errors, async and security-sensitive code are undecided and get asked when a plan needs
them. Repo-wide rules stay in `.github/copilot-instructions.md`. Applies first to `shatteredarchive-mobile` (Expo config plugins in
`dsl-client/plugins/`, `metro.config.js`, `jest.config.js`, the `scripts/*.js` build helpers). The web repo's `eslint.config.mjs` and its two
Playwright `.mjs` scripts are covered by the ESLint line below; its module style was not part of this decision.

## Formatting and lint
Enforced by `expo lint` with `dsl-client/.eslintrc.js` (`extends: 'expo'`). Do not restate or override rules the tool enforces. The mobile
repo has no prettier config; do not add one inside an unrelated change.

## Naming and layout
- **CommonJS** (`require` / `module.exports`) for Expo config plugins, `metro.config.js`, `jest.config.js` and `scripts/*.js`. All 20 existing
  JS files in `shatteredarchive-mobile` do this and Expo, Metro and Jest load these files as CommonJS.
- A config plugin is `dsl-client/plugins/with<Name>.js` (`withFmtConstevalFix.js`, `withDevelopmentTeam.js`), exports one function, and is
  registered in `app.json` `plugins` as `./plugins/with<Name>`. It is idempotent (a marker or a presence check) because it runs on every
  `expo prebuild`.

## Testing
- Each config plugin gets a Jest unit test in `dsl-client/plugins/__tests__/with<Name>-test.js` that runs the plugin's modifier on a
  fixture (manifest, Podfile, gradle text) and asserts the resulting text, including that a second run changes nothing.
- The phase that changes a plugin also runs `expo prebuild --clean` (in a scratch copy) and asserts the expected lines exist in the generated
  native files; a unit test alone does not prove the plugin is wired into `app.json`.
- Scripts and build config files are verified by running them; they are not unit-tested.

## Shattered-AI `tools/archive-mcp` (ES modules)
Decided 2026-11-06 for work item `2026-11-05_copilot-ai-training-sibling-to-autopilot`. Applies to `C:\Projects\Shattered-AI\tools\archive-mcp`.
- **Naming and layout:** ES modules, `.mjs`, logic in `src/` (feature folders such as `src/rooms/`), expert definitions as JSON in `experts/`.
  No formatter or linter is added.
- **Testing:** `node --test test/*.test.mjs` with `node:test`; one `<feature>.test.mjs` per feature asserting behaviour. Expert and sphere JSON
  must pass `pnpm lint:experts`. The `.ai-experts/` index page is updated with the expert (the `create-expert` skill does this).
