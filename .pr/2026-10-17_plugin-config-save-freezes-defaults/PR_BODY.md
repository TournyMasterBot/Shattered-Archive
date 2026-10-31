# Pull Request

## Summary

Saving a plugin's settings (the Configure panel) used to store a copy of every setting, which froze each default for that user: a later change to a plugin's default never reached anyone who had pressed Save once. The saved config now holds only the values that differ from the plugin's defaults, configs already frozen are pruned once on first load, and the Configure panel has a **Reset to defaults** button. The mobile client gets the same change in its own repository (separate PR).

The PR also contains a lint/type cleanup (Phase 0, 56 files across 7 apps) that was needed to get a green baseline; it changes no behaviour. See `.pr/2026-10-17_plugin-config-save-freezes-defaults/summary.md` for the phases, results and coverage.

---

## Type of Change

Please check all that apply:

- [x] Bug fix
- [ ] New feature
- [x] Documentation update
- [x] Refactor / cleanup
- [ ] Performance improvement
- [ ] Other (please describe)

---

## Motivation and Context

Found by the PR #160 deep review (finding CFG-3). Because every Save wrote the full config, a plugin author could not improve a default for existing users: the old value stayed pinned in their saved config. After this change:

- Save stores only what the user changed (`{}` when nothing was changed), and every writer ends in one funnel (`persistRecords` in `hooks/usePlugins.ts`: the hook, cloud load, file import and plugin self-patches), so no route re-introduces a full copy.
- "Same as default" is strict and structural on purpose (`"5"` is not `5`, object key order is ignored, array order is not), so a value is never silently treated as a default.
- The running plugin's config is replaced, not patched, after a Save (`pluginHost.replaceEnabledPluginConfig`), so a dropped key stops applying without a reload.
- The one-time prune is marker-guarded, idempotent and fail-safe; a failure leaves the stored data alone and retries on the next start.

Why Phase 0 is in this PR: the baseline was red (web lint 798 problems / 43 errors, mobile `tsc` 7 errors), and every phase has to end green. Web lint is now 0 errors / 281 warnings (cap 300).

---

## How Has This Been Tested?

Describe the tests you ran to verify your changes.

- [x] Unit tests
- [ ] Integration tests
- [x] Manual testing
- [ ] Not tested (please explain)

Provide details if applicable:

- **Web (game-client):** 84 suites / 1578 tests pass (was 79 / 1465). New: `pluginConfigOverrides.test.ts` (42), plus cases in `usePlugins.test.ts` (+15), `PluginConfigModal.test.tsx` (+9), `pluginHost.test.ts` (+6), and 41 for the Phase 0 React-rule fixes. Several tests were mutation-checked (the mutation was applied, the test failed, the code was restored).
- **Mobile (separate repo):** 51 suites / 698 tests pass (was 46 / 653); the plugin card is tested with `react-test-renderer` against the real engine and storage.
- "Integration tests" is left unticked: there is no API in this change, and the component tests run against real in-memory storage rather than a deployed service.
- **Manual:** Playwright against the running web stack (Configure panel 15/15 checks including `localStorage` assertions, Scripting Help 4/4), and an Android emulator run of the mobile card reading the app's storage back: Save stored only `{"totalTarget":"250"}`; Reset to defaults then Save stored `{}`; a seeded frozen config was pruned to its one real override at start. A physical phone was not tested.
- Coverage: none of the lines or branches this work added is uncovered (per-file figures in `summary.md`).

---

## Checklist

Please confirm the following before requesting review:

- [x] My code follows the project’s coding standards
- [x] I ran `pnpm lint`
- [x] I ran `pnpm test` (including coverage)
- [x] I ran `pnpm build`
- [x] I ran `pnpm typecheck`
- [x] I have added or updated tests where appropriate
- [x] I have updated documentation where necessary
- [ ] This change targets `release/dev` (unless otherwise discussed)

`pnpm lint` is the repo script (exit 0, 0 errors, 281 warnings). `pnpm test` and `pnpm build` were run scoped to the touched package (`@shatteredarchive/game-client`, plus `utils-client` build); the other Phase 0 apps were built and tested in Phase 0, not re-run for this PR. `pnpm typecheck` is the root script (game-client only).

---

## Breaking Changes

- [ ] This change introduces breaking changes
- [x] This change does not introduce breaking changes

If yes, please describe the impact and any required migration steps:

No exported API, route, port or schema is removed (`updateEnabledPluginConfig` stays; `replaceEnabledPluginConfig` and the helper module are additions). One behaviour to know about: stored plugin `userConfig` is now overrides-only, and a one-time migration drops stored values that equal the current defaults. Older clients still read it correctly because they re-apply `{...defaults, ...userConfig}`. The prune cannot be undone (a pruned value follows future default changes, which is the point). New storage keys: `shatteredArchive.plugins.configOverrides.v1` (web), `plugin-config:overrides-migrated-v1` (mobile).

---

## Additional Notes

### Review notes

- **Completion gate:** this item's session was blocked four times (tests and index, then coverage and index), each fixed with new tests and index entries, then passed. No override, no open question and no release for this item. The gate log also holds entries from other sessions on this branch (4 overrides and 3 releases-after-3-blocks in other files, for example `UserScriptSandboxModal`, `AccountModal`, `useOpponentStatus`, `features/library`); they belong to the Allocation-hunt work, not to this change.
- **Branch scope:** the working tree also contains unrelated Allocation-hunt work and the work-item workflow tooling (skills, `docs/claude/work-item-workflow.md`, `docs/standards/`, `CLAUDE.md`, `.gitignore`). Whoever commits decides how to split them.
- **Open standards question:** `docs/standards/` has no JavaScript/MJS standard; this PR touches `eslint.config.mjs`.
- **Finding left unchanged:** `autoleveling-engine.ts` `pause()` sends `{ status: 'paused' }` although the type requires `round`, `step` and `actionIndex`. It was hidden by `as any`; it is now an explicit, commented cast. Fixing it changes what the UI is given while paused, so it is the owner's call.
- **Mobile:** the mobile half is in `shatteredarchive-mobile` (branch `optimization/Performance-and-Diagnostics`), with its own tests and `docs/features/scripts-plugins.md`; it also deletes the unused stock-template `dsl-client/index.js`.
- Docs: `docs/game/plugin-config.md` (new, developer), `docs/scripting/plugins.md` and the in-app Scripting Help (end user).

### Screenshots

**Configure panel with the new "Reset to defaults" button (web)**
<!-- drag .pr/2026-10-17_plugin-config-save-freezes-defaults/screenshots/showcase/showcase_01_configure-modal-reset.png here -->

**In-app Scripting Help, Plugins section, explaining Save and Reset to defaults (web)**
<!-- drag .pr/2026-10-17_plugin-config-save-freezes-defaults/screenshots/showcase/showcase_02_scripting-help-plugins.png here -->

**Mobile plugin card on the Android emulator: Reset to defaults and Save in the footer row (belongs to the mobile PR)**
<!-- drag .pr/2026-10-17_plugin-config-save-freezes-defaults/screenshots/showcase/showcase_03_mobile-plugin-card-reset.png here -->
