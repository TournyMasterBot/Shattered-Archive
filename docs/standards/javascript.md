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

## DSL `Tools/forum-archive` (ES modules, Node scripts)
Decided 2026-11-19 for work item `2026-11-19_dsl-forum-historical-archive` (item folder is in `C:\Projects\DSL\.ai-plans\`). Applies to `C:\Projects\DSL\Tools\forum-archive`.
- **Formatting and lint:** none enforced; none added (same as `tools/archive-mcp` above and `Server/scripts/*.mjs` in the DSL repo).
- **Naming and layout:** ES modules, `.mjs`, one module per concern in `lib/`, command-line entry points at the tool root, tests in `tests/<module>.test.mjs`, synthetic fixtures in `tests/fixtures/`. Follows the shape of `DSL/Server/scripts/verify-prod-output.mjs` and its test.
- **Testing:** `node --test tests/*.test.mjs` with `node:test` and `node:assert/strict`, run through the package script. A module that touches the network takes the page source as an injected function so a test supplies fake pages; tests never contact the live forum and never use real posts or names.
- **Errors (user decision):** a lost login, an access-denied page or an off-host redirect stops the run and keeps its state so it can resume. A network error or a 5xx response retries three times with growing waits (about 5 s, 15 s, 45 s), then the page is recorded as failed and the run continues. Failed pages are printed at the end and kept in the state file. A page that looks empty is never recorded as empty content without a positive marker that the page really is empty.
- **Async and rate (user decision):** one page at a time, one browser tab, a random wait of 2 to 4 seconds between page loads, configurable but never below 1 second. Retry waits count toward the spacing. A `Retry-After` header is honoured.
- **Security-sensitive code:** follows `docs/standards/data-classification.md` and DSL rule SEC-1. No password, cookie or session id is written into code, config, logs, fixtures or the archive; the login session lives only in a git-ignored folder; the forum password is typed into the browser by the user, never passed through the tool.

## Shattered-AI `tools/mobile-test` (ES modules) and the `.claude/hooks` guards
Decided 2026-11-20 for work item `2026-11-20_mobile-emulator-test-harness`. Applies to `C:\Projects\Shattered-AI\tools\mobile-test` and the new guard in `C:\Projects\ShatteredArchive\.claude\hooks`.
- **Naming and layout (user decision):** follow what the tool already does: ES modules (`.mjs`) in `lib/`, one `<module>.test.mjs` beside each module, command-line entry points at the tool root (`verify-smoke.mjs` shape), flows in `flows/`. No linter or formatter is added. Hooks stay CommonJS in `.claude/hooks/`: one `<name>.js` that exports a pure `verdict(command)` and runs as a hook only when executed directly, plus a `<name>.selftest.js` (the `jest-guard` shape).
- **Testing (user decision):** `node --test lib/*.test.mjs` through the package script, `node:assert/strict`. Anything that touches `adb`, the network, the clock or the file system takes it as an injected function (as `installAndLaunch` takes `run`, `sleep`, `now`), so a test supplies fakes; a test never starts an emulator, never contacts a hub, and never reads the real registry.
- **Errors (user decision):** fail closed and say why. Any doubt about an origin, the target device or the hub stops the run before sign-in or install, naming the check that failed; nothing proceeds on a warning. A transient network error may be retried only before the preflight has passed.
- **Security-sensitive code (user decision):** passwords live in a git-ignored private JSON file inside the tool (`tools/mobile-test/private/`, the ignore rule proved by a test) and are read inside the script. They are typed through a channel that keeps them out of command lines, logs and flow files, and are never printed, committed, put in a fixture or photographed. A test captures everything a function writes, logs and passes to a child process with a known password and asserts it is absent.
- **Enforced by:** the tests above; the hook self-test for the guard.
