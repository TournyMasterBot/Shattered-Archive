# PR review: Plugin Configure → Save freezes every default into the saved config

Item: 2026-10-17_plugin-config-save-freezes-defaults · Base: origin/release/dev · Reviewed: 2026-10-31 @ 0ca5960 (plus the uncommitted working tree) · Verdict: **READY** after F1 was fixed on 2026-10-31 (see "Re-check after fixes"); open non-blocking items F2-F5 and the branch-scope gap in the template section remain for the user

Scope of this review: the web repo `ShatteredArchive` (branch `performance/Allocation-hunt`) and the mobile repo `shatteredarchive-mobile` (branch `optimization/Performance-and-Diagnostics`), which is a **separate repository and needs its own pull request**. Nothing in either repo is committed. Both working trees also carry the user's own uncommitted edits (web: 98 files already committed on the branch vs base and about 209 changed paths in the tree; mobile: 107 changed paths), and some of this item's files share hunks with them (for example the mobile `NO_CONFIG`/merged-config cache in `plugin-host.ts` and `previewIncomingLine` in `script-engine.ts` are not part of this item). This review could not separate them by git alone; the item's own file lists are in `test-results.md` (Phase 0 and per phase).

## Check results
| Check | Command | Result |
|---|---|---|
| Lint, changed web files (75) | `eslint` on every changed `.ts/.tsx/.mjs/.js` file in apps/utils/deploy + root config | 0 errors, 94 warnings; **none in lines this item changed** (the 8 warnings in the item's own files are at `PluginConfigModal.tsx` 54/73/174/293, `PluginsPage.tsx` 62, `pluginHost.ts` 59, none inside the changed hunks) |
| Lint, repo | `pnpm run lint` | exit 0, 0 errors, **281 warnings (cap 300)**; baseline was 798 problems / 43 errors |
| Format (web) | prettier, line endings ignored (working copies are CRLF via `core.autocrlf`), HEAD vs now, per changed file | **FAIL on first run, fixed: 9 files were prettier-clean at HEAD and were not** (finding F1, now clean); 20 more were already not clean at HEAD; 50 clean; all 6 new files clean |
| Type-check, web | `pnpm run typecheck` | exit 0 |
| Build, web | `pnpm --filter game-client run build` | exit 0 (chunk-size notice only) |
| Tests, web | `pnpm --filter @shatteredarchive/game-client run test` | 84 suites / 1578 tests pass (baseline 79 / 1465) |
| Coverage, web | jest `--coverage` on this item's 8 test files, `collectCoverageFrom` the changed sources | 8 suites / 146 tests pass. `pluginConfigOverrides.ts`, `useBeforeUnloadGuard.ts`, `UserStyleOverrideModal.tsx`, `FilterableSelect.tsx` 100%. `usePlugins.ts`, `pluginHost.ts`, `PluginConfigModal.tsx`, `CombatStep.tsx` are partial, and **no uncovered line falls inside a hunk this item added** (uncovered: `usePlugins.ts` 58-132, 314-382; `pluginHost.ts` 62-197, 439-441; `PluginConfigModal.tsx` 111-143, 196-286; added hunks are 143-215, 399 / 450-456 / 86-88, 99-100, 340-342) |
| Type-check, mobile | `tsc --noEmit` | exit 0 |
| Lint, mobile | `expo lint` | 0 errors, 107 warnings (baseline 1 error / 107 warnings) |
| Tests + coverage, mobile | `jest --coverage` on the 6 changed sources | 51 suites / 698 tests pass (baseline 46 / 653). `plugin-config-overrides.ts` 100%; the other changed sources are partial and every added line is executed (uncovered lines such as `plugin-host.ts` 129/131, `PluginCard.tsx` 73/99-105/148-151 are pre-existing code) |
| Build, mobile | none exists (no JS build script) | not applicable |
| On-device | Android emulator, dev-client + Metro on the current tree | Save stores only changed keys; Reset then Save stores `{}`; a seeded frozen config is pruned at start (see `test-results.md`) |

All results match `test-results.md`.

## Findings
**Blocking**
- **F1 — formatting-only diffs left in 9 web files** (rule: Format check, "no formatting-only diffs left"). Clean at HEAD, not clean now: `components/AutoLevelingModal.tsx`, `features/audio/audio-beep.ts`, `features/autoleveling/autoleveling-maps-client.ts`, `autoleveling-normalize.ts`, `autoleveling-storage.ts`, `features/userScripts/exportFormat.ts`, `luaRuntime.ts`, `hooks/useMainContainer.ts`, `utils/utils-client/src/strip-ansi.ts`. They are Phase 0 byproducts: `eslint --fix` left a blank line or a split call (`strip-ansi.ts` 12-16, `audio-beep.ts` 5, `useMainContainer.ts` 446) and retyped signatures run past the 120-column print width (`luaRuntime.ts` 138, 559). Fix: `prettier --write --end-of-line auto` on those nine files only, then re-run their tests and lint.

**Non-blocking**
- **F2 — no coding standard for JavaScript/MJS.** `docs/standards/` has `typescript.md` only. This diff touches `eslint.config.mjs` and adds two Playwright `.mjs` capture scripts in the item folder (and Phase 0 gave `apps/*/scripts/**` Node globals). Per the review rules the standard is the user's to define; define one or accept that `.mjs` follows `typescript.md` formatting/lint rules.
- **F3 — repeated warning after a persistent failure** (`shatteredarchive-mobile/dsl-client/features/scripts/plugin-config-storage.ts`, `pruneStoredConfigsOnce`): the session flag is set only on success, so if AsyncStorage keeps failing, every `ensurePluginsReady()` / `initialize()` call retries and logs the fixed warning again. The data stays safe and the message never echoes a setting; it is noise, not harm. The web twin runs once per page load, so it cannot repeat.
- **F4 — PR size and mixed scope.** The branch carries (a) this fix, (b) Phase 0 lint/type cleanup across 56 web files in 7 apps plus 7 mobile files and the deletion of `dsl-client/index.js`, (c) the work-item workflow tooling (`.claude/skills/*`, `docs/claude/work-item-workflow.md`, `docs/standards/`, `CLAUDE.md`, `.gitignore`, `eslint.config.mjs`), and (d) the user's unrelated Allocation-hunt work. Reviewers need the PR description to say which is which, or the commits split along those lines (the user handles commits).
- **F5 — `pnpm lint` headroom is small:** 281 warnings against the cap of 300.
- **Observation (pre-existing, outside this item):** the repo's working copies are CRLF (`core.autocrlf=true`), so `prettier --check` on disk fails for every file unless line endings are ignored; 20 changed files were not prettier-clean at HEAD either.

## Re-check after fixes (2026-10-31, the user agreed to fix the blocking finding)
- **F1 fixed:** `prettier --write --end-of-line auto` on exactly the 9 listed files (line endings stay CRLF). Re-run, line endings ignored: 0 of the 9 not clean; eslint on the 9: 0 errors, 22 warnings (all pre-existing, none introduced by formatting); `pnpm run typecheck` exit 0; `pnpm --filter @shatteredarchive/game-client run test` 84 suites / 1578 tests pass; `utils-client` build exit 0 (it has no tests); `pnpm run lint` exit 0, 0 errors, 281 warnings (unchanged).
- Format is no longer a failing check for this work. 20 other changed files remain not prettier-clean, but they were already not clean at HEAD, so this work did not cause that.
- The template Gap "follows coding standards" is closed. The "targets `release/dev`" Gap (F4) is the user's decision.
- F2 to F5 were not changed: F2 needs the user's decision on a JS/MJS standard, F3 is a behaviour change to the mobile prune (offered, not made), F4 and F5 are information for the PR description.

## Standards coverage
| Language | Standards file | Status |
|---|---|---|
| TypeScript / TSX (web and mobile) | `docs/standards/typescript.md` | Covers formatting/lint, naming and layout, types, errors, testing. Followed: new module `pluginConfigOverrides.ts` is camelCase in `features/plugins`, `Record<string, unknown>` and `unknown` with narrowing (no new `any`), fail-safe plus a single fixed-message `console.warn`, real components rendered in tests. Tests may use `any` (rule added in Phase 0, user-approved). |
| JavaScript / MJS | none | **MISSING** (F2) |
| SCSS | `typescript.md` does not apply | no SCSS file changed (the Reset button reuses `styles.secondaryButton`) |

Repo-wide rules checked: no new dependency; pnpm only; no Dockerfile change; no workspace project added or removed; no telemetry or network call added; no setting values in logs; `.ai-context`/`.annotated` updated for every meaningfully changed indexed folder (web: `features/plugins`, `hooks`, `components`, `components/wizard`, `docs/game`; mobile: `features/scripts`, `components/scripts`). A few `any` remain as warnings in untouched lines.

## Edge-case coverage
Catalog files selected: `docs/standards/edge-cases/persisted-settings-and-defaults.md` (this work stores user settings and changes what is stored) and `theming-dark-mode.md` (a button was added to a themed modal). Classifiers were added by this item: SETTINGS-01 to SETTINGS-05 (user-approved, prefix and ids unique, README format, no personal values).
| Classifier | Triggered by the diff? | Proof |
|---|---|---|
| SETTINGS-01 persisting a defaults-merged object | yes (modal Save, card Save) | `pluginConfigOverrides.test.ts`; `PluginConfigModal.test.tsx`; mobile `PluginCard-test.tsx`; Playwright localStorage assertions (15/15); emulator storage read-back |
| SETTINGS-02 strict structural equality | yes | `pluginConfigOverrides.test.ts` (42 cases), mobile `plugin-config-overrides-test.ts` (15) |
| SETTINGS-03 stale live value after a dropped key | yes (running plugin) | `pluginHost.test.ts` (incl. "forgets a setting with no default", mutation-checked), mobile `plugin-host-test.ts` |
| SETTINGS-04 a write route bypasses normalization | yes (hook, cloud load, file import, self-patch; mobile engine, host, records) | `usePlugins.test.ts` per route; mobile `plugin-records-test.ts`, `script-engine-overrides-test.ts` |
| SETTINGS-05 one-shot, non-destructive migration | yes | `usePlugins.test.ts` (twice, frozen input, throwing storage); mobile `plugin-config-storage-test.ts`; emulator seeded-config run |
| TH-03 button states in each theme | yes (new Reset button) | Phase 3 Playwright shots in the default and slate-amber themes (`phase-03_*`), `showcase_01` |
| TH-01, TH-02, TH-04, TH-05 | no (reasons recorded in the plan: no new overflow, native control, text input or JS-cached colour) | the diff confirms: `PluginConfigModal.tsx` adds one `<button>` and no styles |
| Plan-specific E1-E10 | yes | each row maps to a named test in the plan; spot-checked E5 (card and modal), E7 (card keeps "3" as text), E9 (records), E10 (marker) |
No missing proof. No new classifier proposed by this review.

## PR template readiness
This repo's template: `.github/PULL_REQUEST_TEMPLATE.md` (web). The mobile repo has no PR template (`.github/` holds only `FUNDING.yml`).
| Section / box | Status |
|---|---|
| Summary | Answerable: saving a plugin's settings stored a copy of every default, freezing it; now only overrides are stored (web and mobile), frozen configs are pruned once, a Reset to defaults control exists on both. |
| Type of change: Bug fix | Answerable. "Refactor / cleanup" also applies to Phase 0 (F4); "Documentation update" applies. |
| Motivation and Context | Answerable from `item.md` / `scope.md`. |
| How tested: Unit tests | Answerable: web 84 suites / 1578 tests, mobile 51 / 698. |
| How tested: Integration tests | Answerable only as: real components against real storage (jest + Testing Library; `react-test-renderer`). There is no API; say so. |
| How tested: Manual testing | Answerable: live web stack (Playwright, 15/15 + 4/4) and the Android emulator run. A physical phone was not tested. |
| Checklist: follows coding standards | Answerable: F1 fixed (see "Re-check after fixes"); F2 (no JS/MJS standard) is open. |
| Checklist: ran `pnpm lint` | Answerable: exit 0, 0 errors, 281 warnings (this review). |
| Checklist: ran `pnpm test` (incl. coverage) | Answerable: pass, coverage on the changed sources as above (this review). |
| Checklist: ran `pnpm build` | Answerable for `game-client` (exit 0). Phase 0 also built web-client, web-server, psd-viewer-server, utils-client, mud-builder-client, soulsteel-client (see `test-results.md`); not re-run in this review. |
| Checklist: ran `pnpm typecheck` | Answerable: exit 0 (game-client; mobile `tsc` also 0). |
| Checklist: added or updated tests | Answerable. |
| Checklist: updated documentation | Answerable: developer `docs/game/plugin-config.md` (every symbol, key and path it names exists), end-user `docs/scripting/plugins.md` and the in-app Scripting Help (`ScriptingHelpModal.tsx`, shot in `showcase_02`); mobile developer doc `docs/features/scripts-plugins.md` and the in-app callout in `app/(tabs)/explore.tsx`. |
| Checklist: targets `release/dev` | **Gap:** the work sits on `performance/Allocation-hunt`, which also carries unrelated work (F4). The user decides the branch and commit split. |
| Breaking changes | Answerable as **not breaking**: no exported API, route, port or schema is removed (`updateEnabledPluginConfig` still exists; `replaceEnabledPluginConfig` and the helper module are additions). One behaviour to state in the PR: stored `userConfig` is now overrides-only and a one-time migration drops values equal to the current defaults; older clients still read it correctly because they re-apply `{...defaults, ...userConfig}`; the prune cannot be undone (a pruned value follows future default changes by design). New storage keys: web `shatteredArchive.plugins.configOverrides.v1`, mobile `plugin-config:overrides-migrated-v1`. |
| Additional notes | Answerable: showcase shots `showcase_01..03` in `screenshots/showcase/`; mobile PR is separate; the `autoleveling-engine.ts` `pause()` payload gap (it omits `round`/`step`/`actionIndex` the type requires, now an explicit commented cast) is a finding for the owner. |

## Work-item completeness
All 7 phases `[x]` (0-6); `test-results.md` has a block per phase, a Final state block and the on-device run; showcase shots `showcase_01..03` in `showcase/`, no `phase-*` there and no `showcase_*` in `incremental/`; documentation sweep done; indexes present. Data classification: scan of the item folder, the docs and the diff found no Personal or Restricted value (no emails, no IPs apart from an existing documented address range in the mobile doc, no tokens); the screenshots show plugin settings only.

## Not run
- `pnpm build` for the other six apps Phase 0 touched (web-client, web-server, psd-viewer-server, utils-client, mud-builder-client, soulsteel-client): not re-run here; the Phase 0 results in `test-results.md` stand, and a repo-wide lint pass confirms they still lint clean.
- A physical Android phone and any iOS device: not available to this work.
- `/code-review` (a deeper correctness hunt) was not run; this is a standards and readiness review.
