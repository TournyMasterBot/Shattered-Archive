# Tech plan: Plugin Configure → Save freezes every default into the saved config

Item: item.md · Scope: scope.md · Planned against: performance/Allocation-hunt @ 0ca5960 · Date: 2026-10-31
Standards: docs/standards/typescript.md (created for this plan)  ·  Data classification: internal
Edge-case catalog: docs/standards/edge-cases/persisted-settings-and-defaults.md, docs/standards/edge-cases/theming-dark-mode.md  ·  Classifiers added (user-approved): SETTINGS-01, SETTINGS-02, SETTINGS-03, SETTINGS-04, SETTINGS-05

Paths: `W` = `C:/Projects/ShatteredArchive` (web), `M` = `C:/Projects/shatteredarchive-mobile/dsl-client` (mobile). Line numbers are as of 0ca5960
and each has an anchor; the working tree already carries uncommitted comment-only edits in `apps/game-client/src/features/movement/` and
`crafting-helper.plugin.ts`, which this plan does not touch.

## Goal
After this work, saving a plugin's settings on the web client or the mobile client stores only the values that differ from the plugin's
current defaults, so a changed default reaches every user who has not overridden that setting; settings already frozen by earlier saves are
pruned once on first load, and each client has a "Reset to defaults" control. Provable by: a Save with no edits stores `{}`; changing a
plugin's default and reloading changes what an un-overridden user gets; a frozen record written by an older client, a cloud load or a file
import is stored pruned.

Design notes (decided here, within the scope's three decisions):
- **One normalizer per client, applied at the write funnel.** Web: `saveToStorage` / `updatePluginConfig` in `usePlugins.ts` (every writer goes through them: the hook, cloud load `useAccountModal.ts:288`, file import `UserScriptSandboxModal.tsx:334`). Mobile: the three `savePluginConfig` call sites that have access to a plugin's defaults. The modal/card also prune before handing the payload on, so the `onSave` contract is "overrides only".
- **"Same as default"** = strict structural equality (SETTINGS-02); decision 3: it means "unset".
- **Reset to defaults resets the editor's draft; the change is persisted by the existing Save** (Save then stores `{}`), and Cancel discards it. No confirm dialog is needed because nothing is lost until Save. This is how the scope's "reset control" is read; say so at sign-off if an immediate-persist reset is wanted instead.
- **Live runtime** is set from `{...defaults, ...stored}` on Save (SETTINGS-03), not patched.
- **First-load prune** runs once per client, guarded by a marker, and leaves data untouched if it fails (SETTINGS-05).

## Out of scope
Everything in scope.md's Out of scope, plus: `PluginConfigEditor.tsx` (no importer anywhere in the repo; its writes still go through the pruned `updatePluginConfig`, so it cannot re-freeze); changing the Crafting Helper fingerprint mechanism; the C# site; a per-field pinning flag; multi-tab races (Risks); making mobile number inputs store numbers (existing behaviour, E7).

## Standards applied
- `docs/standards/typescript.md`: new pure module in `features/plugins/` (camelCase) with a co-located test; config values typed `Record<string, unknown>`, no new `any`; storage failures fail safe with a single fixed-message `console.warn` containing no config content; tests co-located on web, in `__tests__/*-test.ts(x)` on mobile; prettier/eslint as the tools define.
- `.github/copilot-instructions.md` "Tests and coverage": behaviour-asserting tests covering each added branch and error path.
- `docs/standards/data-classification.md`: nothing in plan, tests, docs or screenshots may contain real names or accounts; tests use fabricated plugin ids and values, screenshots use the default install with no personal text.

## Edit map
| File | Line(s) | Anchor | Change | Phase |
|---|---|---|---|---|
| `W/apps/game-client/src/features/plugins/pluginConfigOverrides.ts` | new | n/a | `isSameAsDefault`, `toOverrides`, `pruneRecordOverrides`, memoized `corePluginDefaults(id)` | 1 |
| `W/apps/game-client/src/features/plugins/pluginConfigOverrides.test.ts` | new | n/a | unit tests (see Phase 1) | 1 |
| `W/apps/game-client/src/hooks/usePlugins.ts` | 163-176 | `function saveToStorage(items: InstalledPluginRecord[])` | stringify `pruneRecordOverrides(items, …).records` | 2 |
| `W/apps/game-client/src/hooks/usePlugins.ts` | 352-360 | `userConfig: { ...nextUserConfig },` in `updatePluginConfig` | store `toOverrides(next, corePluginDefaults(id))` when the plugin has defaults | 2 |
| `W/apps/game-client/src/hooks/usePlugins.ts` | 96-140 | `function migratePluginMerges(): void {` … `migratePluginMerges();` | add `migratePluginConfigOverrides()` and call it on the line after `:140` | 2 |
| `W/apps/game-client/src/hooks/usePlugins.test.ts` | 24-62 | `describe('installed-plugin store'` | new cases (Phase 2) | 2 |
| `W/docs/game/plugin-config.md` | new | n/a | developer doc: overrides model, funnel, migration, reset, live state | 2, 3 |
| `W/apps/game-client/src/features/plugins/pluginHost.ts` | 437-443 | `updateEnabledPluginConfig(pluginId: PluginId, patch` | add `replaceEnabledPluginConfig(pluginId, userConfig)` using `setConfig({...defaults, ...userConfig})` after it | 3 |
| `W/apps/game-client/src/features/plugins/pluginHost.test.ts` | 46 | `describe('PluginHost.syncInstalled'` | new describe for the replace method | 3 |
| `W/apps/game-client/src/components/PluginConfigModal.tsx` | 81-83, 89-97 | `const updateDraft`, `const save = () => {` | add `resetDraft`; `save()` prunes with `toOverrides(cleaned, defaults)` before `onSave` | 3 |
| `W/apps/game-client/src/components/PluginConfigModal.tsx` | 334-342 | `<div className={styles.footer}>` | "Reset to defaults" button (existing `styles.secondaryButton`) before `footerSpacer` | 3 |
| `W/apps/game-client/src/components/PluginsPage.tsx` | 113-116 | `onSave={(id, config) => {` | call `replaceEnabledPluginConfig` instead of `updateEnabledPluginConfig` | 3 |
| `W/apps/game-client/src/components/PluginsModal.tsx` | 197-200 | `onSave={(pluginId, config) => {` | same | 3 |
| `W/apps/game-client/src/components/PluginConfigModal.test.tsx` | 9 | `describe('PluginConfigModal — plugin action button feedback'` | new describe for Save/Reset | 3 |
| `W/docs/scripting/plugins.md` | 7-13 | `## Managing plugins` | end-user: Configure/Save/Reset to defaults and what Save stores | 3 |
| `W/apps/game-client/src/components/ScriptingHelpModal.tsx` | 950-955 | `<h4 className={styles.subHeading}>Managing plugins</h4>` | in-app help text for the same | 3 |
| `W/docs/game/scripting-and-sharing.md` | 223 | `- **Save to cloud** — pushes this device's scripts, globals and plugin config` | note that only changed plugin settings are stored | 3 |
| `<item>/plugin-config-reset.capture.mjs` | new | n/a | Playwright capture + localStorage assertions (Phase 3) | 3 |
| `M/features/scripts/plugin-config-overrides.ts` | new | n/a | same semantics as web helper (separate repo, no shared package) | 4 |
| `M/features/scripts/__tests__/plugin-config-overrides-test.ts` | new | n/a | unit tests mirroring Phase 1 | 4 |
| `M/features/scripts/plugin-config-storage.ts` | 19-22 | `export function savePluginConfig(` | add `pruneStoredConfigsOnce(defaultsById)` + marker key | 4 |
| `M/features/scripts/plugin-host.ts` | 122-126 | `updateConfig: (patch) => {` | prune `next` against `module.configSchema.defaults` | 4 |
| `M/features/scripts/script-engine.ts` | 189-191, 53-75 | `savePluginConfig(pluginId: string, config`, `async initialize()` | prune by the plugin's defaults; run the migration after configs load | 4 |
| `M/features/scripts/plugin-records.ts` | 76-82, 116-120, 151-154 | `ensurePluginsReady`, `previewPluginRecords`, `applyPluginRecords` | run the migration; compare and store pruned incoming configs | 4 |
| `M/features/scripts/__tests__/plugin-host-test.ts`, new `plugin-config-storage-test.ts`, new `plugin-records-test.ts` | n/a | existing file has 19 cases | new cases (Phase 4) | 4 |
| `M/docs/features/scripts-plugins.md` | 183 | `\| \`savePluginConfig(id, config)\` \| Persist plugin config \|` | developer doc: overrides-only storage, migration, reset | 4, 5 |
| `M/components/scripts/PluginCard.tsx` | 23-29, 36-40, 128-132 | `function openConfig()`, `function saveConfig()`, `{dirty && (` | `saveConfig` prunes; Reset button; style `resetBtn` near `saveBtn:` (~205) | 5 |
| `M/components/__tests__/PluginCard-test.tsx` | new | n/a | component tests (react-test-renderer, as `FloatingSpeechStop-test.tsx`) | 5 |
| `M/app/(tabs)/explore.tsx` | 115 | `Plugin settings are saved automatically when you tap` | end-user: Reset and what Save stores | 5 |
| Indexes | n/a | n/a | `W/apps/game-client/src/features/plugins/.annotated`, `hooks/.annotated`, `components/.annotated`, `W/docs/game/.ai-context`, `M/features/scripts/.annotated`, `M/components/scripts/.annotated` | 1-5 |

## Edge cases
| Id | Classifier | Condition | Required behaviour | Covered by |
|---|---|---|---|---|
| SETTINGS-01 | SETTINGS-01 | Save with no edits / after editing one field / after editing back to the default | stores `{}` / only that field / nothing | P1 helper test; P3 modal test; P5 card test; P3 Playwright localStorage assertion |
| SETTINGS-02 | SETTINGS-02 | string vs number, reordered object keys, reordered array, nested table, `null` vs missing | strict structural equality; no coercion | P1 and P4 helper tests |
| SETTINGS-03 | SETTINGS-03 | Save/Reset on a running plugin, key omitted from storage | running config equals `{...defaults, ...stored}` without reload | P3 `pluginHost.test.ts`; P4 `plugin-host-test.ts` |
| SETTINGS-04 | SETTINGS-04 | write routes: hook save, `writeInstalledPlugins` (cloud load, file import), plugin self-patch, mobile `applyPluginRecords`, older-client frozen record | stored result is pruned for every route | P2 `usePlugins.test.ts` (one case per route); P4 `plugin-records-test.ts` |
| SETTINGS-05 | SETTINGS-05 | first-load migration: runs twice; frozen input; throwing storage | second run writes nothing; input not mutated; failure leaves data and app running; one fixed-message warn with no config content | P2 `usePlugins.test.ts`; P4 `plugin-config-storage-test.ts` |
| E1 | - | record for a plugin with no registered module / no `configSchema` | record left exactly as stored | P1, P4 |
| E2 | - | stored key that has no entry in the defaults | kept | P1, P4 |
| E3 | - | stored `undefined` / stored `null` | `undefined` dropped (as today); `null` kept unless the default is `null` | P1, P4 |
| E4 | - | every core plugin's own defaults (21 files with `defaults:`, Crafting Helper's `tierTable` and `craftTypes` included) | pruned to `{}`; the Crafting Helper legacy-fingerprint path still returns the current default for a differing old table | P1 (iterates `CORE_PLUGINS`); P2 (Crafting Helper through `writeInstalledPlugins`) |
| E5 | - | Reset then Save / Reset then Cancel / Reset on a plugin with nothing stored | `{}` persisted / stored config unchanged / no-op; `enabled` and other records untouched | P3, P5 |
| E6 | - | Save while the plugin is disabled (no running api) | storage pruned, no error from the host call | P3 `pluginHost.test.ts` |
| E7 | - | mobile number fields hold strings (`"5"` vs default `5`) | not equal, so kept as stored; behaviour unchanged and documented | P4 helper test; P5 card test |
| E8 | - | per-line `getConfig()` memoization (web `configSnapshot`, mobile `mergedFrom` identity) | unchanged: repeated calls return the same object until the config changes | P3 `pluginHost.test.ts`; P4 `plugin-host-test.ts` |
| E9 | - | mobile cloud/file load of an equivalent but unpruned config | not reported as changed by `previewPluginRecords`; an enabled plugin is not cycled off/on by `applyPluginRecords` | P4 `plugin-records-test.ts` |
| E10 | - | migration marker | set only after a successful run; a failed run retries on the next start | P2, P4 |
Classifiers not applicable:
- TH-01: no overflow is added to the existing modal and its scrollbar rules (`PluginConfigModal.module.scss:80`) are unchanged.
- TH-02: no input, select or native control is added; the Reset control is a `<button>` using an existing class.
- TH-03 **applies**: the new button's states (default, hover, focus) must look like the neighbouring Cancel button in each theme. Covered by the Phase 3 Playwright check (default and hover shots in the themes the stack offers); the module has `:hover` rules for `.secondaryButton` (`PluginConfigModal.module.scss:220,230`) and no `:focus-visible` rule, same as Cancel.
- TH-04: no text input or selectable text is added.
- TH-05: colors come from CSS classes, no JS-cached values, so a mounted modal follows a live theme switch.
- All TH classifiers on mobile: `PluginCard.tsx` uses fixed literal colors and has no theme switching.

## Verification toolbox
Web (W-*), from any directory:
- W-test (one file): `pnpm -C C:/Projects/ShatteredArchive --filter @shatteredarchive/game-client exec jest --config ../../jest.config.cjs --runInBand --testPathPatterns apps/game-client/src/<path>`
- W-test-all: `pnpm -C C:/Projects/ShatteredArchive --filter @shatteredarchive/game-client run test`
- W-coverage: W-test with `--coverage --collectCoverageFrom=apps/game-client/src/<changed source file>`
- W-typecheck: `pnpm -C C:/Projects/ShatteredArchive run typecheck` (game-client only)
- W-lint: `pnpm -C C:/Projects/ShatteredArchive exec eslint <changed files>`; whole repo: `pnpm -C C:/Projects/ShatteredArchive run lint` (limit 300 warnings)
- W-format: `pnpm -C C:/Projects/ShatteredArchive exec prettier --check <changed files>` (never `format`, which writes)
- W-build: `pnpm -C C:/Projects/ShatteredArchive --filter @shatteredarchive/game-client run build`
- UI: `node <item>/plugin-config-reset.capture.mjs` against the stack the user already runs at `http://localhost:30080/`; this skill never starts or stops it.
Mobile (M-*):
- M-test (one file): `pnpm -C C:/Projects/shatteredarchive-mobile/dsl-client exec jest <path under dsl-client>`
- M-test-all: `pnpm -C C:/Projects/shatteredarchive-mobile/dsl-client run test`
- M-coverage: M-test with `--coverage --collectCoverageFrom=<changed source file>`
- M-typecheck: `pnpm -C C:/Projects/shatteredarchive-mobile/dsl-client exec tsc --noEmit`
- M-lint: `pnpm -C C:/Projects/shatteredarchive-mobile/dsl-client run lint` (`expo lint`)
- Mobile has no JS build script; typecheck plus the full test suite is its compile gate.
API check: none. No route is added or changed (the C# endpoint stores the array as an opaque blob and is unaffected); the cloud path is covered by tests that write the old shape through `writeInstalledPlugins` / `applyPluginRecords`.

## Phases

### [x] Phase 0 — Clear the baseline (amended: see A1)
Goal:        both repos start the real work with zero lint/type errors and web lint inside its 300-warning cap, with no behaviour change.
Depends on:  nothing
Changes:     files are listed in test-results.md under "Phase 0 files" as they are touched (outside the Edit map, see A1). In order:
- 0a `eslint . --fix` (the 4 error and 19 warning auto-fixes: `prefer-const`, unused disable directives).
- 0b web errors (43, 20 files): Node scripts get Node globals in `eslint.config.mjs` (`no-undef` ×19 in `.mjs` scripts); empty blocks get a stated reason (`no-empty` ×9); `no-require-imports` ×2; `react-hooks/rules-of-hooks` ×3 (behaviour-sensitive: ask before changing the call order).
- 0c mobile: 7 `tsc` errors in 6 files and the `index.js` import-casing lint error, with typed fixes, no `@ts-ignore`.
- 0d web warnings: remove unused vars (50), then retype `any` file by file from the highest count down until the repo is at most 300 warnings with margin (the tally is recorded after each batch).
Tests:       no new tests: behaviour must not change, and the existing suites are the proof. A retyped function whose behaviour is not exercised by an existing test gets a characterization test only if the type change could alter runtime (it should not). "None - no behaviour change".
API check:   none
UI check:    none
Index/docs:  none ("no user-visible effect: lint/type cleanup"); index entries only if a file's documented contract changes.
Exit gate:   W-typecheck OK · `pnpm run lint` exits 0 (0 errors, ≤ 300 warnings) · W-test-all unchanged at 79/1465 · W-build OK · the `jest`/build/typecheck gates of every other package touched (web-server, services-server, mud-builder-server: their own `run test`) pass · M-typecheck exit 0 · M-lint 0 errors and ≤ 107 warnings · M-test-all unchanged at 46/653.
State on exit: same behaviour as before, green gates in both repos.

### [x] Phase 1 — Override helper (web, pure module, not yet wired)
Goal:        a tested module that decides what counts as an override of a default.
Depends on:  nothing
Changes:
- NEW `W/apps/game-client/src/features/plugins/pluginConfigOverrides.ts`: `isSameAsDefault(value, def)` (primitives `===`; arrays elementwise in order; plain objects by key set regardless of order; anything else `===`); `toOverrides(config, defaults)` returns a NEW object, drops `undefined`, keeps keys with no default entry, keeps keys not `isSameAsDefault`, never mutates; `pruneRecordOverrides(records, defaultsFor)` returns `{ records, changed }` and the SAME array when nothing was dropped; `corePluginDefaults(id)` memoizes `findCorePlugin(id)?.create().configSchema?.defaults` (registry `findCorePlugin` at `registry.ts:145`, `create()` is already called freely, e.g. `registry.ts:32-48`, `PluginsPage.tsx:65`).
Tests:       NEW `pluginConfigOverrides.test.ts`: SETTINGS-01 (`toOverrides(defaults, defaults)` is `{}`; one edited key survives; editing back drops it); SETTINGS-02 (`"5"` vs `5` kept; `{a,b}` vs `{b,a}` equal; `[1,2]` vs `[2,1]` kept; nested table equal and one-cell-different; `null` vs absent); E1/E2/E3 (no defaults → untouched; key without default kept; `undefined` dropped, `null` kept); SETTINGS-05 non-mutation (`Object.freeze` input, result is a different object); `pruneRecordOverrides` returns the same array and `changed:false` when nothing drops; E4 (for every entry of `CORE_PLUGINS` whose module declares defaults, `toOverrides(defaults, defaults)` is `{}`, including Crafting Helper `tierTable` and `craftTypes`). Run W-test.
API check:   none
UI check:    none (no UI)
Index/docs:  `features/plugins/.annotated`: entry for the new module recording the relation to the `usePlugins.ts` write funnel (Phase 2) and why equality is strict. Developer doc: none yet, the module is not wired ("no user-visible effect: pure module, unused until Phase 2"). End-user doc: none, same reason.
Exit gate:   W-typecheck OK · W-lint and W-format on the two new files OK · W-test-all passes · W-coverage on `pluginConfigOverrides.ts` shows every branch executed · docs/indexes as above · app builds (W-build).
State on exit: nothing behaves differently; the helper exists and is proven.

### [x] Phase 2 — Web write funnel and first-load prune
Goal:        every stored web plugin config is overrides-only, and existing frozen configs are pruned once.
Depends on:  Phase 1
Changes:
- `usePlugins.ts:163-176` (`function saveToStorage(items`): serialize `pruneRecordOverrides(items, corePluginDefaults).records`.
- `usePlugins.ts:352-360` (`userConfig: { ...nextUserConfig },`): store `toOverrides(nextUserConfig, defaults)` when `corePluginDefaults(id)` is defined, else the copy as today (E1). Pruning here keeps hook state equal to what storage holds, so the `PLUGINS_UPDATED_EVENT` re-read at `usePlugins.ts:211-216` finds no difference and does not loop.
- `usePlugins.ts:96-140`: add `migratePluginConfigOverrides()` beside `migratePluginMerges()` (same pattern, same `try/catch`), marker key `shatteredArchive.plugins.configOverrides.v1`; reads `loadFromStorage()`, prunes, calls `saveToStorage` only if `changed`, sets the marker only after success; on failure a single `console.warn` with a fixed message (no config content, E10 / SETTINGS-05). Call it on the line after `migratePluginMerges();` (`:140`).
Tests:       extend `usePlugins.test.ts` (keeps the 4 existing cases; the round-trip case uses `combat-compression` with a `threshold` key that has no default, so it stays valid, E2): SETTINGS-04, one case per route: `writeInstalledPlugins` with a frozen full-defaults record (cloud load / file import shape) is stored `{}`; the same for a record with one edited key (only that key stored); `updatePluginConfig` through the hook (renderHook) stores overrides only; a self-patch merged like `MainContainer.tsx:265-270` ends pruned. E4: a `crafting-helper` record carrying the real default `tierTable` and `craftTypes` is stored `{}`, and a record with an old differing table is kept. SETTINGS-05/E10: migration on a frozen store prunes once and sets the marker; a second run performs no `setItem`; a frozen (`Object.freeze`) record is not mutated; with `localStorage.setItem` throwing, the stored data is unchanged, no exception escapes, `console.warn` is called once with a message that contains none of the config values, and the marker is not set. SETTINGS-01: write full defaults, change the plugin's default in a fabricated module, re-read via `pluginHost.syncInstalled` → the new default applies (the repro from item.md).
API check:   none
UI check:    none (no UI change; the Phase 3 browser check also covers this phase's storage behaviour)
Index/docs:  `hooks/.annotated` (usePlugins: the funnel and the one-shot migration, context a reader cannot get from the code: all writers pass through `saveToStorage`); `features/plugins/.annotated` if the helper entry needs the relation. Developer doc: CREATE `W/docs/game/plugin-config.md` (what is stored, the funnel, the migration and its marker, why equality is strict, how the host merge restores defaults); add its line to `docs/game/.ai-context`. End-user doc: none yet (visible only through Phase 3).
Exit gate:   W-typecheck · W-lint/W-format on changed files · W-test-all · W-coverage on `usePlugins.ts` changed lines and the helper (every added branch, including the failure branch) · W-build · dev doc written.
State on exit: saved configs are stored overrides-only and existing ones are pruned on next load; the UI is unchanged and still correct because the host re-applies defaults on read.

### [x] Phase 3 — Web modal: Save contract, Reset to defaults, deterministic live state, end-user docs
Goal:        the Configure modal hands overrides-only to its parents, offers Reset to defaults, and the running plugin always matches what a reload would show.
Depends on:  Phase 2
Changes:
- `pluginHost.ts:437-443`: add `replaceEnabledPluginConfig(pluginId, userConfig)`: if the plugin is enabled with an api, `api.setConfig({ ...defaults, ...userConfig })` using `c.module?.configSchema?.defaults` as `syncInstalled` does (`:397-398`); no-op otherwise (E6). `updateEnabledPluginConfig` stays for the action buttons (`PluginConfigModal.tsx:296-299`, which push a full draft to a running plugin and are not stored).
- `PluginConfigModal.tsx:89-97` (`const save = () => {`): `onSave(pluginId, toOverrides(cleaned, defaults))`.
- `PluginConfigModal.tsx:81-83`: add `const resetDraft = () => setDraft({ ...defaults })`.
- `PluginConfigModal.tsx:334-342` (`<div className={styles.footer}>`): a `<button type="button" className={styles.secondaryButton} onClick={resetDraft}>Reset to defaults</button>` before the `footerSpacer`. No SCSS change.
- `PluginsPage.tsx:113-116`, `PluginsModal.tsx:197-200`: replace `pluginHost.updateEnabledPluginConfig(id, config)` with `pluginHost.replaceEnabledPluginConfig(id, config)`.
Tests:       `pluginHost.test.ts` new describe: SETTINGS-03: enable a fabricated plugin with defaults `{a:1,b:2}`, `replaceEnabledPluginConfig(id, {a:9})` → `getConfig()` is `{a:9,b:2}`; then `replaceEnabledPluginConfig(id, {})` → `{a:1,b:2}` with no reload; E6: disabled plugin → no throw, nothing changes; E8: two consecutive `getConfig()` calls return the same object until the config changes. `PluginConfigModal.test.tsx` new describe (render the real component, as the existing cases do): SETTINGS-01: Save with no edits calls `onSave(id, {})`; edit one field → `onSave(id, {thatKey: value})`; edit then set back to the default → `onSave(id, {})`; E5: edit a field, click Reset to defaults, Save → `onSave(id, {})`; edit, Reset, Cancel → `onSave` not called; clicking Reset when nothing differs and saving still gives `{}`; `onSave` is never called with a key whose value equals its default. Run W-test on both files.
API check:   none
UI check:    `<item>/plugin-config-reset.capture.mjs` (Playwright via `C:/Projects/Shattered-AI/tools/browser-test/lib/browser.mjs`, `http://localhost:30080/`, menu path as in `plugins-modal-render-warning-check.mjs`: XPath `//div[text()="Plugins"]` → Manage Plugins…): install and open Configure for Roller; assert via `page.evaluate` that after Save with no edits `localStorage['shatteredArchive.plugins.installed']` holds `userConfig: {}` for Roller; edit a field, Save, reopen → edited value shown, stored config contains only that key; click Reset to defaults, Save → stored `{}` and fields show defaults. Screenshots to `<item>/screenshots/incremental/`: `phase-03_configure-modal.png`, `phase-03_reset-hover.png`, `phase-03_after-reset.png` (TH-03: default and hover state of the new button next to Cancel, in each theme the stack offers). Because this is the finished UI, the same arrangement is also captured with `saveShowcase(page, "2026-10-17_plugin-config-save-freezes-defaults", "01-configure-modal-reset", …)` (the completion gate needs a fresh showcase after a JSX change) and copied to `screenshots/showcase/showcase_01_configure-modal-reset.png`; the last phase re-checks it is still current.
Index/docs:  `components/.annotated` (PluginConfigModal: Save contract is overrides-only and why the live update uses replace, not patch); `features/plugins/.annotated` (host method). Developer doc: UPDATE `W/docs/game/plugin-config.md` (Reset semantics, `replaceEnabledPluginConfig`, the action-button runtime-only path). End-user docs: UPDATE `W/docs/scripting/plugins.md:7-13` (Configure, Save, Reset to defaults, "settings you never change follow updates"), `ScriptingHelpModal.tsx:950-955` (same wording), `W/docs/game/scripting-and-sharing.md:223` (cloud save stores only the settings you changed).
Exit gate:   W-typecheck · W-lint/W-format on changed files · W-test-all · W-coverage on the changed lines of `PluginConfigModal.tsx` and `pluginHost.ts` · W-build · UI script ran and its assertions passed · incremental and showcase screenshots opened and checked · docs written.
State on exit: web client complete: Save stores overrides only, Reset to defaults works, the running plugin matches a reload.

### [x] Phase 4 — Mobile write funnels and first-launch prune
Goal:        every stored mobile plugin config is overrides-only, existing frozen configs are pruned once, and cloud/file loads of equivalent configs are not treated as changes.
Depends on:  nothing in the web phases (separate repo); ordered after them so the web behaviour is settled first.
Changes:
- NEW `M/features/scripts/plugin-config-overrides.ts`: same three functions and semantics as the web helper (`isSameAsDefault`, `toOverrides`, plus `pruneStoredConfigs` if useful); the repos share no package, so the semantics are pinned by mirrored tests.
- `plugin-config-storage.ts:19-22` (next to `savePluginConfig`): add `pruneStoredConfigsOnce(defaultsById: Record<string, Record<string, unknown>>)`: marker AsyncStorage key `plugin-config:overrides-migrated-v1`; for each cached config, `toOverrides(config, defaults)` and `savePluginConfig` only when it differs; builds new objects (the shared frozen `NO_CONFIG` is never mutated); marker set only after success; failure → one fixed-message `console.warn`, nothing thrown, data untouched.
- `plugin-host.ts:122-126` (`updateConfig: (patch) => {`): `savePluginConfig(id, toOverrides(next, module.configSchema.defaults))`.
- `script-engine.ts:189-191` (`savePluginConfig(pluginId: string, config`): look up the module as `getPluginConfig` does (`:181`) and store `toOverrides(config, module.configSchema.defaults)`. `script-engine.ts:53-75` (`async initialize()`): after the `loadPluginConfig` block (`:71`) call `pruneStoredConfigsOnce` with the registered modules' defaults.
- `plugin-records.ts:76-82` (`ensurePluginsReady`): also call `pruneStoredConfigsOnce` (records operations can run before `initialize`). `previewPluginRecords` (`:116-120`) and `applyPluginRecords` (`:151-154`, `savePluginConfig(record.id, record.userConfig ?? {})`): normalize the incoming `userConfig` with `toOverrides` against the plugin's defaults before comparing with `getCachedPluginConfig` and before saving (E9).
Tests:       NEW `plugin-config-overrides-test.ts` mirrors the web helper cases incl. E7 (`"5"` vs `5` kept). `plugin-host-test.ts` (+): `updateConfig` with a value equal to the default stores nothing for that key (SETTINGS-01/03); after a pruned save `getConfig()` shows the default; two `getConfig()` calls return the same frozen object until the saved config changes (E8). NEW `plugin-config-storage-test.ts` (AsyncStorage mock as `plugin-host-test.ts:1-2`): migration prunes a frozen stored config once, sets the marker, a second run does zero `setItem` calls, frozen input not mutated, a throwing `getItem`/`setItem` leaves data unchanged and the marker unset with one warn that contains no config values (SETTINGS-05, E10). NEW `plugin-records-test.ts` (SETTINGS-04, E9): `applyPluginRecords` with a frozen full-defaults record stores pruned; `previewPluginRecords` returns no id for an equivalent-but-unpruned record; an enabled plugin with an equivalent record is not cycled (`setPluginEnabled` not called off/on). Run M-test per file.
API check:   none
UI check:    none (no UI in this phase)
Index/docs:  `M/features/scripts/.annotated` (new module; the storage migration and why `plugin-records` normalizes before comparing). Developer doc: UPDATE `M/docs/features/scripts-plugins.md:183` and the module list (overrides-only storage, migration marker, `ensurePluginsReady`). End-user doc: none yet (Phase 5).
Exit gate:   M-typecheck · M-lint · M-test-all · M-coverage on the four changed source files (every added branch and error path) · docs written. No JS build script exists (see toolbox).
State on exit: mobile storage is overrides-only and migrated; the card UI is unchanged and still correct because the mobile host merges defaults on read (`plugin-host.ts:118`).

### [x] Phase 5 — Mobile card: Save contract, Reset to defaults, end-user help
Goal:        the mobile plugin card saves overrides only and offers Reset to defaults.
Depends on:  Phase 4
Changes:
- `PluginCard.tsx:36-40` (`function saveConfig()`): `getScriptEngine().savePluginConfig(manifest.id, toOverrides(draft, configSchema.defaults))`.
- `PluginCard.tsx:23-29`: add `function resetConfig() { setDraft({ ...configSchema.defaults }); setDirty(true); }` so the existing `{dirty && …Save}` button (`:128-132`) appears and persists `{}`.
- `PluginCard.tsx` near `:128`: a `Pressable` "Reset to defaults" with new style `resetBtn` beside `saveBtn:` (~`:205`), same visual language as the existing buttons.
- `explore.tsx:115` (`Plugin settings are saved automatically when you tap`): end-user text for Reset and for "settings you never change follow updates".
Tests:       NEW `components/__tests__/PluginCard-test.tsx` (react-test-renderer, mocking `getScriptEngine` and `getCachedPluginConfig`): open config → Save button hidden until dirty; edit one field + Save → `savePluginConfig` called with only that key; edit back to default + Save → `{}`; Reset to defaults makes Save appear and Save stores `{}` (E5); a number field holds a string `"5"` against default `5` and is stored (E7). Run M-test.
API check:   none
UI check:    no automated screenshot recipe exists for `dsl-client` (checked: no e2e/screenshot tooling in the repo; the Pixel8 recipe in memory belongs to the Shattered Story app). Verification is the component test above plus an on-device check by the user at sign-off, recorded in the progress log as an open host/user task. This is stated as a gap, not skipped silently.
Index/docs:  `M/components/scripts/.annotated` (PluginCard: Save/Reset contract). Developer doc: UPDATE `M/docs/features/scripts-plugins.md:645` (PluginCard description). End-user doc: `explore.tsx:115` as above.
Exit gate:   M-typecheck · M-lint · M-test-all · M-coverage on `PluginCard.tsx` changed lines · docs written.
State on exit: mobile complete in code; device verification pending the user.

### [x] Phase 6 — Final verification, documentation sweep, showcase
Goal:        both repos are green with coverage, documentation matches the code, and the final-state evidence is captured.
Depends on:  Phases 1-5
Changes:
- No new behaviour. Re-run the full gates for both repos; fix anything red, whoever caused it.
- Re-run `plugin-config-reset.capture.mjs`; confirm `screenshots/showcase/showcase_01_configure-modal-reset.png` still shows the finished UI; add `showcase_02_scripting-help-plugins.png` (the in-app Scripting Help → Plugins section with the new text) via `saveShowcase`, copied the same way.
- Documentation sweep: every feature touched (plugin configuration: web and mobile) has an up-to-date developer doc and end-user doc; every command, key, route and path they name exists (`docs/game/plugin-config.md`, `docs/scripting/plugins.md`, `docs/game/scripting-and-sharing.md`, `M/docs/features/scripts-plugins.md`, `explore.tsx`, `ScriptingHelpModal.tsx`).
- Index sweep: all `.annotated` / `.ai-context` entries named in the Edit map are present and follow the index rule.
Tests:       None new ("None - verification only"); full suites in both repos.
API check:   none
UI check:    showcase set above.
Index/docs:  as the sweep.
Exit gate:   W-typecheck · W-lint (repo, within the 300-warning cap) · W-format on changed files · W-test-all · W-build · W-coverage for every changed web source file · M-typecheck · M-lint · M-test-all · M-coverage for every changed mobile source file · screenshots checked · docs complete.
State on exit: ready for sign-off; open items are the user's on-device mobile check and any amendments recorded.

## Risks and rollback
- **Rollback:** each phase is separable. Phases 1-3 touch only the web client; reverting Phase 2 stops pruning but leaves already-pruned data valid (the host re-applies defaults on read). The migration marker prevents re-running; removing the migration code and the marker restores the old behaviour.
- **Prune rewrites stored data without the user acting** (decision 2). A user who deliberately kept a value equal to today's default follows future defaults (decision 3). The Phase 3 end-user text states this.
- **Plugins reading config:** the 77 `getConfig()` call sites receive the merged config on both clients, so an omitted default-valued key reads the same as before. A raw-`userConfig` reader would see keys disappear; grep found none outside the modal, the editor (unused) and `MainContainer`'s patch merge (`:265-270`, which merges onto the stored record and is fine). The 38 loosely matched `??`/`undefined` lines were not individually reviewed; Phase 1's `CORE_PLUGINS` test and the funnel do not depend on them.
- **Multi-tab / older client:** a second tab or an old client holding frozen state re-writes it; the next write through the funnel prunes it again. Not tested (timing-dependent); behaviour converges.
- **Mobile device verification** has no automated screenshot path; the plan relies on the component test and the user's on-device check.
- **Uncommitted working tree:** `apps/game-client/src/features/movement/*` and `crafting-helper.plugin.ts` carry comment-only edits from earlier today. Not part of this work; `/pr-review` should expect them in the diff unless committed separately.
- **Cloud payloads from updated clients get smaller;** the C# endpoint accepts both shapes (validator reads `id`, `name`, `version`, `enabled`, `installedAt` only).

## Plan amendments

### A1 — 2026-10-31 — Phase 0 added: clear the red baseline (approved by user 2026-10-31)
- **Original plan:** Phases 1-6 only; every exit gate assumed a green repo; Phase 6 gate read "W-lint (repo, within the 300-warning cap)".
- **Finding (step 0 baseline, recorded in test-results.md):** web `pnpm run lint` exits 1 (798 problems: 43 errors in 20 files, 755 warnings against the `--max-warnings=300` cap); mobile `tsc --noEmit` has 7 errors in 6 files; mobile `expo lint` has 1 error (`index.js` import casing) and 107 warnings. Web typecheck, build and tests (79 suites / 1465 tests) and mobile tests (46 suites / 653 tests) are green. None of the failing files is in the Edit map.
- **Options put to the user:** gate on no-regression only; Phase 0 fixing errors only; Phase 0 fixing errors AND bringing web warnings under the cap; stop. After a correction of my first estimate (the cap needs about 455 of the 587 `no-explicit-any` warnings removed, concentrated so that 28 files hold 460 warnings), **the user chose: fix errors AND get web warnings under the cap.**
- **Change:** insert `Phase 0 — Clear the baseline` before Phase 1. Phase 6's lint gate stays as written (repo lint within the cap) and is now achievable; the mobile gate becomes "typecheck and lint have zero errors" (mobile warnings must not rise above 107).
- **Wider impact:** files outside the Edit map change (eslint config, ~20 error files, ~28 warning files in `apps/game-client`, `apps/web-server`, `services/services-server`, `apps/mud-builder-server`, plus 6 mobile files). Those packages' own test/build gates therefore join Phase 0's exit gate. Retyping and hook-rule fixes must not change behaviour; any fix that would (for example a conditional hook call) is raised with the user instead of applied. The edge-case catalog is not newly triggered.
- **Decisions the user made during Phase 0 (all 2026-10-31):** Phase 0 = errors and warnings under the cap (after a correction of my first size estimate); test files exempt from `no-explicit-any` (eslint override, recorded in `docs/standards/typescript.md`); dynamic `any` retyped strictly with `unknown` plus narrowing and no alias; `dsl-client/index.js` (dead stock-template entry) deleted. Outcome and file list: test-results.md "Phase 0".

## Progress log
- 2026-10-31 plan written against performance/Allocation-hunt @ 0ca5960. Standards file docs/standards/typescript.md created (4 categories decided with the user). Catalog file docs/standards/edge-cases/persisted-settings-and-defaults.md created with SETTINGS-01..05 (user-approved; prefix chosen by the user).
- 2026-10-31 implementation started: item moved from proposed/ to active/ by /implement-plan; baseline run next.
- 2026-10-31 baseline recorded: red lint/typecheck in unrelated files. User chose Phase 0 (fix errors AND get web warnings under the cap). Amendment A1 added; Phase 0 inserted. Phase 0 in progress.
- 2026-10-31 Phase 0 done: web lint 798 problems (43 errors) -> 0 errors / 281 warnings (cap 300); mobile tsc 7 errors -> 0 and mobile lint 1 error -> 0; all suites unchanged (web 79/1465, mud-builder-client 38/265, soulsteel-client 19/131, mobile 46/653); 56 web files + 7 mobile files touched (list in test-results.md). Surfaced, not changed: engine pause() sends {status:'paused'} without the round/step/actionIndex its type requires.
- 2026-10-31 Phase 1 done: pluginConfigOverrides.ts + 42-case test (coverage 100%); game-client 80 suites / 1507 tests, build OK, repo lint exit 0 (281 warnings, no increase). No deviations.
- 2026-10-31 Phase 2 done: usePlugins.ts persistRecords prunes every write route; updatePluginConfig stores overrides; migratePluginConfigOverrides (marker-guarded, fail-safe) added; 15 new tests (mutation-checked), game-client 80 suites / 1522 tests, build OK, repo lint exit 0 (281 warnings); docs/game/plugin-config.md created. Minor deviation: migration function and marker key are exported for tests.
- 2026-10-31 Phase 3 code, tests (+15, mutation-checked) and docs done; non-UI gate green (80 suites / 1537 tests, build OK, repo lint exit 0 at 281). PAUSED at the UI check: localhost:30080 is not running; waiting for the user to start the game-client dev stack, then run plugin-config-reset.capture.mjs. Phase 3 stays [ ] until it passes.
- 2026-10-31 completion gate follow-up: +24 tests in 4 new files for the Phase 0 React-rule fixes (3 of 5 behaviours mutation-checked; the hook-order and latest-callback changes are not runtime-observable), index notes added, eslint Node globs extended to work-item scripts; game-client 84 suites / 1561 tests, repo lint exit 0 (281). Phase 3 UI check still waiting for the dev stack.
- 2026-10-31 completion gate attempt 2: +17 tests to cover the pre-existing handlers inside the functions touched in Phase 0 (FilterableSelect keyboard/hover/outside-click, modal Discard Draft); those components and useBeforeUnloadGuard are at 100%; game-client 84 suites / 1578 tests; index notes refined via Edit.
- 2026-10-31 Phase 3 done: UI script 15/15 on the live stack (localStorage assertions, Reset/Cancel flows, TH-03 button states in default and slate-amber), showcase_01 + 5 incremental shots, build OK. Web client complete.
- 2026-10-31 Phase 4 done: mobile overrides helper + storage prune + host/engine/records write funnels; 36 new tests (6 mutations caught), mobile 50 suites / 689 tests, tsc 0, lint 0 errors / 107 warnings; mobile dev doc + indexes updated. Minor deviation: extra test file script-engine-overrides-test.ts.
- 2026-10-31 Phase 5 done: PluginCard Reset to defaults + footer row, explore.tsx help text, 9 card tests (3 mutations caught), mobile 51 suites / 698 tests, tsc 0, lint 0 errors / 107 warnings. No automated mobile screenshot path: open on-device check for the user. Minor deviation: the card does not prune (the engine funnel does).
- 2026-10-31 Phase 6 done: both repos green (web 84 suites / 1578 tests, lint 0 errors / 281 warnings, build OK; mobile 51 / 698, tsc 0, lint 0 errors / 107 warnings); showcase_01 re-run 15/15 and showcase_02 captured (re-shot as a viewport after the whole-section shot proved unreadable); docs and index sweep clean. Waiting for the user's sign-off.
- 2026-10-31 on-device check (user's request at sign-off): Android emulator, dev-client + Metro on the current tree; Save stores only {totalTarget:"250"}, Reset then Save stores {}, a seeded frozen config is pruned to {minCon:12} at start. showcase_03 and phase-06_mobile-after-reset added. Metro (port 8081) and the emulator were left running. Sign-off still pending.
- 2026-10-31 Signed off by the user on 2026-10-31
- 2026-10-31 packaged for PR on 2026-10-31: documents moved to .pr/2026-10-17_plugin-config-save-freezes-defaults/ (item, scope, tech-plan, test-results, pr-review, screenshots/showcase); summary.md and PR_BODY.md written.
