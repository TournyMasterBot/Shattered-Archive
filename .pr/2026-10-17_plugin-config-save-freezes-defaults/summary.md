# Summary: Plugin Configure → Save freezes every default into the saved config

Written for: reviewers of the pull request. Item: `2026-10-17_plugin-config-save-freezes-defaults` (a bug, found by the PR #160 deep review as CFG-3). Packaged 2026-10-31 against `performance/Allocation-hunt` @ 0ca5960 plus the uncommitted working tree.

The mobile half lives in the separate repo `shatteredarchive-mobile` and needs its own pull request; this summary covers both so the two PRs can cite one record.

## What was built
Saving a plugin's settings used to store a copy of every setting, which froze each default for that user: a later change to a plugin's default never reached anyone who had ever pressed Save. Now:
- **Overrides only.** The saved config holds only the values that differ from the plugin's defaults; the host re-applies `{...defaults, ...saved}` on read. Equality is strict and structural (`"5"` is not `5`, object key order is ignored, array order is not).
- **One write funnel per client.** Web: `persistRecords` in `hooks/usePlugins.ts` (the hook, cloud load, file import and plugin self-patches all end there). Mobile: the host's `updateConfig`, the engine's `savePluginConfig` and `applyPluginRecords`/`previewPluginRecords`.
- **One-time prune** of configs already frozen by earlier saves, on first load of each client, guarded by a marker (web `shatteredArchive.plugins.configOverrides.v1`, mobile `plugin-config:overrides-migrated-v1`), idempotent and fail-safe (any failure leaves the data alone and retries next start; one fixed-message warning, no setting echoed).
- **Live state is replaced, not patched,** after a Save (`pluginHost.replaceEnabledPluginConfig`), so a key dropped from storage stops affecting the running plugin without a reload.
- **Reset to defaults** on each client. It only resets the editor; nothing is stored until Save, and Cancel (web) or collapsing the card (mobile) throws it away.
- **Documentation:** developer `docs/game/plugin-config.md` (new); end-user `docs/scripting/plugins.md` and the in-app Scripting Help; mobile `docs/features/scripts-plugins.md` and the callout in the Scripts screen.

Also in this change (Phase 0, approved separately because the baseline was red): lint/type cleanup so every later phase could end green. Web lint went from 798 problems (43 errors) to 0 errors / 281 warnings (cap 300); mobile `tsc` from 7 errors to 0; the unused stock-template entry `dsl-client/index.js` was deleted; test files are exempted from `no-explicit-any` in `eslint.config.mjs`; 235 `any` usages in 11 files became `unknown` plus narrowing. A few React-rule fixes changed no behaviour and are covered by 41 new tests.

## Phases and exit gates
| Phase | Result |
|---|---|
| 0 Clear the baseline | web lint 0 errors / 281 warnings, mobile `tsc` 0 / lint 0 errors, all suites unchanged |
| 1 Override helper (web) | `pluginConfigOverrides.ts` + 42 tests, coverage 100% |
| 2 Web write funnel and first-load prune | `persistRecords`, `migratePluginConfigOverrides`, +15 tests (mutation-checked) |
| 3 Web modal, Reset to defaults, live state, end-user docs | +15 tests, Playwright on the live stack 15/15, showcase 01 |
| 4 Mobile write funnels and first-launch prune | +36 tests (6 mutations caught), mobile 50 suites / 689 tests |
| 5 Mobile card Reset to defaults, end-user help | +9 card tests (3 mutations caught), mobile 51 suites / 698 tests |
| 6 Final verification, doc sweep, showcase | both repos green; Scripting Help showcase; on-device run on an Android emulator |

## Test results (this review run, 2026-10-31)
| Package | Commands | Result |
|---|---|---|
| game-client (web) | `pnpm run typecheck` · `pnpm --filter @shatteredarchive/game-client run build` · `... run test` · `pnpm run lint` | typecheck exit 0 · build exit 0 · **84 suites / 1578 tests pass** (baseline 79 / 1465) · repo lint exit 0, **0 errors, 281 warnings** (cap 300; baseline 798 problems / 43 errors) |
| utils-client | `... run build` | exit 0 (no tests) |
| shatteredarchive-mobile `dsl-client` | `tsc --noEmit` · `run lint` · `run test` | exit 0 · 0 errors, 107 warnings (baseline 1 error) · **51 suites / 698 tests pass** (baseline 46 / 653); there is no JS build script |
Other apps Phase 0 touched (web-client, web-server, psd-viewer-server, mud-builder-client, soulsteel-client): built and tested in Phase 0 (`test-results.md`), not re-run in the review.

Tests added: web `pluginConfigOverrides.test.ts` (42), `usePlugins.test.ts` (+15), `PluginConfigModal.test.tsx` (+9), `pluginHost.test.ts` (+6), and 41 for the Phase 0 React-rule fixes (`useBeforeUnloadGuard`, `UserStyleOverrideModal`, `FilterableSelect`, `CombatStep`); mobile `plugin-config-overrides-test.ts` (15), `plugin-config-storage-test.ts` (7), `plugin-records-test.ts` (8), `script-engine-overrides-test.ts` (3), `plugin-host-test.ts` (+4), `PluginCard-test.tsx` (9).

**On-device check (Android emulator, dev client on the current tree):** Save stored only `{"totalTarget":"250"}` (the unchanged zeros were not stored); Reset to defaults then Save stored `{}`; a seeded frozen config (all defaults plus one real override) was pruned to that one override at app start and the marker was set. A physical phone was not tested.

## Coverage
Run on this item's own test files against the changed sources. **No line or branch added by this work is uncovered**; the figures below are whole-file, and the uncovered lines are existing code.
| File | Statements | Branches | Lines | Uncovered lines (all pre-existing) |
|---|---|---|---|---|
| web `pluginConfigOverrides.ts` | 100 | 100 | 100 | none |
| web `useBeforeUnloadGuard.ts`, `UserStyleOverrideModal.tsx`, `FilterableSelect.tsx` | 100 | 100 | 100 | none |
| web `usePlugins.ts` | 62.1 | 36.8 | 73.1 | 58-132, 314-382 (added code is at 143-215, 399) |
| web `pluginHost.ts` | 75.0 | 61.9 | 78.7 | 62-197, 439-441 (added code is at 450-456) |
| web `PluginConfigModal.tsx` | 66.4 | 46.1 | 67.4 | 111-143, 196-286 (added code is at 86-88, 99-100, 340-342) |
| web `CombatStep.tsx` | 45.2 | 35.4 | 49.7 | existing handlers outside the Phase 0 change |
| mobile `plugin-config-overrides.ts` | 100 | 100 | 100 | none |
| mobile `plugin-config-storage.ts` | 96.2 | 91.7 | 95.5 | 16, 79 |
| mobile `plugin-host.ts` | 92.4 | 86.3 | 95.9 | 129, 131, 197, 242, 258 |
| mobile `plugin-records.ts` | 70.4 | 65.5 | 69.4 | 47-62, 89-93 |
| mobile `script-engine.ts` | 38.7 | 34.1 | 43.7 | outside the added hunks |
| mobile `PluginCard.tsx` | 83.3 | 62.2 | 82.8 | 73, 99-105, 148-151 |

## Final showcase screenshots
- `showcase_01_configure-modal-reset.png`: the web Configure panel with the new Reset to defaults button next to Cancel and Save.
- `showcase_02_scripting-help-plugins.png`: the in-app Scripting Help, Plugins section, with the new text on Save, settings that keep following the defaults, and Reset to defaults.
- `showcase_03_mobile-plugin-card-reset.png`: the mobile plugin card (Roller) on the Android emulator with Reset to defaults and Save in the footer row.
Progress shots (`phase-*`) are git-ignored and stay local.

## Verification skipped
Phase 0's pure lint and type edits (unused imports, `any` to `unknown` with narrowing, empty-catch comments, `eslint --fix`) have no tests of their own: they change no behaviour, and the existing suites, typecheck and lint are the proof. The five React-rule fixes that could change runtime behaviour do have tests (41, above). Nothing else was skipped.

## Open items (from `pr-review.md`)
- **F2** There is no coding standard for JavaScript/MJS (`docs/standards/` has only `typescript.md`); this diff touches `eslint.config.mjs` and adds two Playwright `.mjs` scripts. The owner defines it.
- **F3** Mobile `pruneStoredConfigsOnce` re-logs its fixed warning on every call after a persistent AsyncStorage failure (data stays safe). Not changed.
- **F4** The branch also carries unrelated work (the Allocation-hunt commit and uncommitted edits) and the work-item workflow tooling (skills, `docs/claude/work-item-workflow.md`, `docs/standards/`, `CLAUDE.md`, `.gitignore`); the commit split is the owner's.
- **F5** Repo lint has 19 warnings of headroom under the cap of 300.
- Finding left unchanged for the owner: `autoleveling-engine.ts` `pause()` sends `{ status: 'paused' }` although the type requires `round`, `step` and `actionIndex` (now an explicit commented cast).
- A physical phone was not tested.
