# Tech plan: Editable pre-loaded autopilot mob targets, personal to the user and synced web and mobile

Item: item.md · Scope: scope.md · Planned against: performance/Allocation-hunt @ a565d53 · Date: 2026-11-13
Standards: docs/standards/typescript.md, docs/standards/csharp.md, docs/standards/scss.md  ·  Data classification: Personal (per-account preferences; no personal values appear in this plan)
Edge-case catalog: persisted-settings-and-defaults.md, theming-dark-mode.md, cloud-synced-user-content.md, served-fallback-data.md, shared-event-bus.md (not applicable on web, tested on mobile)  ·  Classifiers added (user-approved 2026-11-13): CLOUDSYNC-01, CLOUDSYNC-02, CLOUDSYNC-03 (new file cloud-synced-user-content.md), SETTINGS-06 (existing file), FALLBACK-01 (new file served-fallback-data.md). None declined.

## Goal

A player can (1) pick any of the 48 playable classes in the autopilot wizard, with that class's buffs and fight commands pre-filled
from the imported DSL data unless they have their own saved set; (2) correct any pre-loaded mob target (change its room line or kill
keyword, hide it, or reset it to the server default) as a personal override that never alters the server list; and (3) move those edits
between web and mobile with the existing manual Save to cloud / Load from cloud buttons. Proven on web first, then on the mobile app, which
gains the autopilot as a port of the web engine.

## Out of scope

Automatic sync; editing the server's list; more than one kill keyword per target (the engine takes `keywords: [engageName]`, `autoleveling-wizard-config.ts:87`);
the ability-classification admin; production deploys of the C# and web-server changes (owner's call); iOS build verification (no Mac).

## Standards applied

- TypeScript (`docs/standards/typescript.md`): co-located `*.test.ts(x)`; no new `any` in production code; storage reads and writes fail safe with `try`/`catch` and a fixed `console.warn` that carries no values; unsubscribing effects. Mobile: kebab-case modules in `dsl-client/features/<area>/`, tests in `__tests__/*-test.ts(x)`.
- C# (`docs/standards/csharp.md`): thin controller, logic in a static class under `Server.Dsl/AgentApi/`, `BadRequest(new { error })`, xunit `<Feature>Tests.cs`, `dotnet build -c Release` without new warnings.
- SCSS (`docs/standards/scss.md`): extend `AutoLevelingWizard.module.scss`; palette variables, `color-scheme: dark`; no hard-coded colors.

## Edit map

All lines are as of a565d53 (C# lines: DSL working tree). New files are marked NEW.

| File | Line(s) | Anchor | Change | Phase |
|---|---|---|---|---|
| deploy/docker-compose.shattered-archive-experimental.yml | web-server `environment:` (~l.50-55 of that service block) | `LOG_LEVEL: "debug"` | add `SHATTEREDARCHIVE_BASE: "http://shatteredarchive-csharp:5000"` (compose environment overrides the `env_file` value `localhost`; reachable from the container, verified 200) | 1 |
| apps/web-server/.env | 6 | `SHATTEREDARCHIVE_BASE=http://localhost:5000` | unchanged (right for a host-run dev server); comment added | 1 |
| apps/web-server/src/index.ts | 461-466, 508, 536-552 | `const sendJson` (l.464 sets the 30-day `Cache-Control` for every source), `handleAutoLevelingClasses` | when `source === 'offline'` send `Cache-Control: no-store`; one `console.warn` per process the first time an endpoint falls back; keep `X-Maps-Source` | 1 |
| apps/web-server/src/index.test.ts (or co-located `autoleveling-fallback.test.ts`) | NEW | - | handler tests: upstream failing returns offline + header + no-store + one warn; upstream ok returns `upstream` + long cache | 1 |
| apps/web-server/src/offline/autoleveling/classes.json, areas.json | whole files | `{ "classes": [...] }` | regenerated from the running C# service by the two extract scripts | 1 |
| apps/game-client/src/features/autoleveling/autoleveling-classes.ts | 19 | `CATALOG_KEY = 'autolevelingClasses'` | bump to `'autolevelingClasses.v2'` so the stale 31-class cache is dropped | 1 |
| apps/game-client/src/features/autoleveling/autoleveling-content.ts | 27-28 | `INDEX_KEY = 'autolevelingAreaIndex'`, `DETAIL_KEY` | bump both keys (suffix `.v2`) | 1 |
| Server/Server.Dsl/AgentApi/AutolevelUserRecords.cs (DSL repo) | NEW | - | static `Kinds`, `TryValidate(JObject, out error)`: moved out of the controller and extended (`abilityTiming`, `targetOverride`) | 2 |
| Server/Server.Web.Public/Controllers/UserContentController.cs | 37, 47, 181-215, 795-830 | `MaxAutolevelRecords`, `KnownAutolevelRecordKinds`, `TryValidateAutolevelRecord` | controller calls the static class; same 1000-record cap and messages | 2 |
| Server/Server.Dsl.Tests/AutolevelUserRecordsTests.cs (DSL repo) | NEW | - | every kind accepted; unknown kind, missing id, non-numeric `updatedAt`, missing `data`, malformed `targetOverride` rejected | 2 |
| apps/game-client/src/features/autoleveling/autoleveling-user-data.ts | 21 | `UserRecordKind` | add `'targetOverride'`; export `SYNCED_RECORD_KINDS` | 3 |
| same | 125-140 | `exportAll`, `importRecords` | `importRecords` drops malformed records through one `normalizeRecord` | 3 |
| same | 144-155 | `getCustomTargets`, `addCustomTarget` | add `updateCustomTarget`, `removeCustomTarget` (uses `deleteRecord` l.120, which has no production caller today) | 3 |
| same | 156-200 | `getBuffOverlay`, `getFightOverlay` | add `getBuffOverlayOrNull`, `getFightOverlayOrNull` (absent vs empty) | 3, 5 |
| same | after targets section | NEW functions | `targetOverrideKey`, `getTargetOverrides`, `setTargetOverride`, `resetTargetOverride`, `applyTargetOverrides` (pure) | 3 |
| apps/game-client/src/features/autoleveling/autoleveling-user-data.test.ts | existing | - | cases for each new function; kinds vs `SYNCED_RECORD_KINDS` | 3 |
| apps/game-client/src/components/wizard/useWizardDraft.ts | 12-19, 95-120 | `DraftTarget`, `setArea`, `toggleTarget`, `removeCustomTarget` | `DraftTarget` gains `id?`, `defaultLookName?`, `defaultEngageName?`, `overridden?`; actions `editTarget`, `hideTarget`, `restoreTarget`, `resetTarget`; `removeCustomTarget` persists the delete | 4 |
| apps/game-client/src/components/AutoLevelingWizard.tsx | 221-265, 272-280, 380-382 | `onSelectArea`, `onAddCustomTarget`, `<TargetsStep ... />` | seed through `applyTargetOverrides`; wire edit/hide/reset/unmatched props | 4 |
| apps/game-client/src/components/wizard/TargetsStep.tsx | 10-100 | `Props`, area list, custom list | inline edit, Hide/Restore, Reset to default, "Unmatched edits" list, `HelpInfoButton` | 4 |
| apps/game-client/src/components/wizard/TargetsStep.test.tsx | NEW | - | render and interaction tests | 4 |
| apps/game-client/src/styles/AutoLevelingWizard.module.scss | existing | target rows | edit controls and states, all themed | 4 |
| apps/game-client/src/components/wizard/TargetsHelp.tsx | NEW | - | in-app help (pattern: `MapHelp.tsx`) | 4 |
| apps/game-client/src/features/autoleveling/autoleveling-wizard-config.ts | 143-176 | `draft.targets.filter(...)` | no change expected; a test pins that an edited lookName and keyword reach `init.targets` and a hidden one does not | 4 |
| apps/game-client/src/features/autoleveling/autoleveling-class-defaults.ts | NEW | - | pure `defaultBuffRows`, `defaultFightRows` from a class's abilities + `BUFF_CATALOG` + `COMBAT_SKILL_NAMES` | 5 |
| apps/game-client/src/components/wizard/CombatStep.tsx | 316-335, 363-380, 426-471 | `baseClasses`, `onChangeClass`, `addClassBuff`, `addClassFight` | seed on class or area change only when the overlay is absent; "class list unavailable" notice on fallback; help button | 5 |
| apps/game-client/src/components/wizard/dsl-classes.ts | 12 | `DSL_CLASSES_FALLBACK` | unchanged list, now only reachable when the served catalog and snapshot are both empty | 5 |
| apps/game-client/src/components/wizard/CombatStep.test.tsx | existing | - | seeding, no-overwrite, emptied-stays-empty, fallback notice | 5 |
| apps/game-client/src/components/wizard/CombatHelp.tsx | NEW | - | in-app help | 5 |
| apps/game-client/src/hooks/useAccountModal.ts | 154, 292 | `exportAutolevelUserData()`, `importAutolevelUserData(...)` | Save loads and merges first (CLOUDSYNC-02); Load result summary names overrides | 6 |
| apps/game-client/src/features/auth/cloudSync.ts | 82-91 | `loadAutolevelUserData`, `saveAutolevelUserData` | unchanged contract; tests added | 6 |
| docs/game-client.md, docs/web-server.md | autoleveling sections | - | developer docs | 1, 4, 5, 6 |
| apps/game-client/src/features/autoleveling/.annotated, components/wizard/.annotated, features/auth/.annotated, hooks/.annotated | index entries | - | index updates (context the code does not show) | 3-6 |
| shatteredarchive-mobile/dsl-client/features/autoleveling/* | NEW | - | mobile port, see phases 7-10 | 7-10 |
| shatteredarchive-mobile/dsl-client/features/auth/cloud-sync.ts | 33-34, 195-290 | `saveAllToCloud`, `loadAllFromCloud` | add the autoleveling collection, load-merge-save | 8 |
| shatteredarchive-mobile/dsl-client/components/PlayContainer.tsx, components/AccountSection.tsx | existing | - | control surface; account section already hosts Save/Load | 10 |
| shatteredarchive-mobile/docs/reference/mobile.md, docs/reference/game-client.md, docs/features/autopilot.md (NEW) | - | - | mobile docs | 11 |

## Edge cases

| Id | Classifier | Condition | Required behaviour | Covered by |
|---|---|---|---|---|
| E1 | - | Override key: two area targets whose room lines differ only by case or spacing | key = lowercase, trimmed, whitespace collapsed (same dedupe the seed already does, `AutoLevelingWizard.tsx:236`); first wins; one override record per key | P3 `targetOverrideKey` tests |
| E2 | - | Edit sets the room line empty, or to the room line of another row | rejected in the editor with a message; nothing saved | P4 TargetsStep tests |
| E3 | - | Room line or keyword contains `;`, a newline or a control character (typed, or arriving from cloud) | rejected on edit and dropped on import; `kill {name}` must never carry a second command | P3 import test, P4 edit test |
| E4 | - | Account near the server's 1000-record cap (`UserContentController.cs:37`), since overrides and learned cooldowns also count | the client counts before upload and shows the server's own message; nothing partial saved | P6 test |
| E5 | - | Cloud record with kind `targetOverride` but missing or wrongly typed fields | dropped by `normalizeRecord`; other records still import | P3 |
| E6 | - | An area target both edited and hidden, then reset | reset removes the whole record: both edit and hidden flag | P3, P4 |
| E7 | - | The extract script cannot reach C# | the existing snapshot is left untouched and the phase fails its own check (48 classes) instead of passing | P1 |
| E8 | - | Old 30-day browser and 7-day IndexedDB caches hold the 31-class list | new cache key; offline-source responses are `no-store` | P1 |
| E9 | - | A class with no abilities, or an unknown class name | pre-fill yields nothing, picker still works, no crash | P5 |
| E10 | - | Character level unknown | no level cap for pre-fill; rows carry their `(Lnn)` tag as today | P5 |
| E11 | - | Class changed twice quickly | newest request wins, as the existing `classReq` guard does | P5 |
| E12 | - | AsyncStorage read or write fails on mobile | falls back to defaults, never throws into the UI | P7-P8 |
| E13 | - | Two devices edit the same target | newest `updatedAt` wins per record; the loser's edit is not merged field by field | P3, P6 |
| E14 | - | Logs or errors name a mob or keyword | never; fixed warning text only | P3-P8 review |
| E15 | SETTINGS-01 | Override store | only fields that differ from the server default are stored; an edit back to the default deletes the record | P3 |
| E16 | SETTINGS-02 | "Same as default" | strict compare after the E1 normalization: no coercion | P3 |
| E17 | SETTINGS-03 | Wizard draft after a reset | the draft row is rebuilt from the server default, not merged | P4 |
| E18 | SETTINGS-04 | Routes that write overrides: editor, cloud load, mobile import | all go through `normalizeRecord` | P3, P6, P8 |
| E19 | SETTINGS-06 | Pre-fill | absent overlay seeds; an overlay the user emptied stays empty; seeded rows are not stored until edited | P5 |
| E20 | CLOUDSYNC-01 | Kinds the client exports vs the server list | `SYNCED_RECORD_KINDS` equals the server list; PUT of one record per kind returns 200 | P2, P3, P6 |
| E21 | CLOUDSYNC-02 | A device saves without having loaded | Save loads, merges (newest wins), then uploads | P6, P8 |
| E22 | CLOUDSYNC-03 | Server renames or drops an area target the user edited | the override is kept, not applied, listed under "Unmatched edits", reapplies if the key returns | P3, P4 |
| E23 | FALLBACK-01 | Web-server cannot reach C# | fallback is visible (`X-Maps-Source`, one warning), and the deployed container reads `upstream` | P1 |
| E24 | TH-01..TH-05 | New edit controls, list, notices | scrollbar, native inputs, hover/focus/disabled/error states, placeholder and caret, live theme switch all themed | P4, P5 screenshots |

Classifiers not applicable: SETTINGS-05 (no stored data is rewritten; the cache key bump only abandons a cache); EVENTBUS-01 (web: no new event subscription; mobile: covered by a test in Phase 9 that the engine's subscription does not displace `vitals-store`'s); the rest of the catalog (ansi, privname, logtail, autoapproval, local-only, expo, pointer, mapid) does not match this work. Note PRIVNAME: nothing here exports game text.

## Verification toolbox

- Game client tests: `bash -c 'cd /c/Projects/ShatteredArchive/apps/game-client && pnpm exec jest --config ../../jest.config.cjs --runInBand --testPathPatterns <pattern> 2>&1 | grep -E "Tests:|Test Suites:|FAIL|✕"'`; whole package: `pnpm --filter game-client test`.
- Typecheck: `pnpm typecheck` (root, `tsc -p apps/game-client/tsconfig.json --noEmit`). Lint: `pnpm lint`. Build: `pnpm --filter game-client build`.
- Web-server: `pnpm --filter web-server test`, `pnpm --filter web-server build`; redeploy `docker compose -f deploy/docker-compose.shattered-archive-experimental.yml build web-server` then `up -d --no-deps web-server`; check `curl -sk -D - https://game-client.shatteredarchive.dev/api/web/maps/autoleveling/classes -o /dev/null | grep -i x-maps-source` reads `upstream`.
- Snapshot regeneration (C# must be up): `AUTOLEVELING_CLASSES_URL=http://localhost:5000/maps/autoleveling/classes pnpm --filter game-client extract:autoleveling-classes` and `pnpm --filter game-client extract:autoleveling-content`.
- C#: `dotnet test C:/Projects/DSL/Server/Server.Dsl.Tests`, `dotnet build C:/Projects/DSL/Server -c Release`; deploy the local stack with `Server/deploy-local.ps1`, then live-check.
- API: the user-content routes need a signed-in session; call them from the Playwright session (`page.request`) after logging in with the local test account. Unauthenticated calls answer 401.
- UI screenshots: Shattered-AI `tools/browser-test` (`autoleveling.mjs` drives the wizard; `saveShowcase` for final shots), against the running game client (`http://localhost:30080/`). Progress shots `phase-NN_<name>.png` (git-ignored), final `showcase_NN_<name>.png`.
- Mobile (repo `shatteredarchive-mobile`, its own pnpm workspace): `pnpm --dir dsl-client exec jest <pattern>`; typecheck with `pnpm --dir dsl-client exec tsc --noEmit` (it carries a pre-existing baseline of errors; record the count before Phase 7 and require no new ones). Android run needs the emulator: ask the owner before starting it; target `emulator-5554` only.
- Test accounts: a local test account only; no real account or character names in screenshots.

## Phases

### [x] Phase 1 — Serve the complete class and area catalog
Goal:        the wizard receives all 48 classes (and current areas) from the live C# service, with a complete offline fallback, and a stale fallback can no longer hide.
Depends on:  nothing
Changes:
- deploy/docker-compose.shattered-archive-experimental.yml (web-server `environment:`) — add `SHATTEREDARCHIVE_BASE: "http://shatteredarchive-csharp:5000"`.
- apps/web-server/src/index.ts:461-466 (`sendJson`, line 464 `Cache-Control`) and :536-552 (`handleAutoLevelingClasses`) — responses with source `offline` send `Cache-Control: no-store`; a module-level `Set` of endpoint names logs one `console.warn('[web-server] upstream unreachable, serving offline snapshot', { endpoint })` the first time each falls back.
- apps/web-server/src/offline/autoleveling/classes.json and areas.json — regenerate with the two extract scripts; commit the result.
- apps/game-client/src/features/autoleveling/autoleveling-classes.ts:19 and autoleveling-content.ts:27-28 — bump the IndexedDB keys.
Tests:
- web-server handler test: failing upstream (mock fetch rejects) returns the snapshot, `X-Maps-Source: offline`, `Cache-Control: no-store`, and one warning across two requests (E23, FALLBACK-01); succeeding upstream returns `upstream` with the long max-age.
- snapshot test: `classes.json` has 48 classes, includes Avenger and Chaos Weaver, none with an empty ability list (E7).
- autoleveling-classes.test.ts: a cache stored under the old key is ignored (E8).
API check:   against the running local stack after redeploy: `GET /api/web/maps/autoleveling/classes` returns 48 classes with `X-Maps-Source: upstream`; same for `/areas`.
UI check:    open the wizard Combat step; the class select lists base classes then 43 reclasses; screenshot `phase-01_class-list.png`.
Index/docs:  docs/web-server.md (update: the upstream setting, fallback visibility, snapshot regeneration); apps/web-server has no .annotated edits unless an index exists there; end-user doc: no user-visible effect beyond a complete list, covered by the help text in Phase 5.
Exit gate:   build OK · typecheck OK · lint OK · all web-server and game-client tests pass · coverage of new code reviewed · API check done · screenshot taken · docs updated.
State on exit: full catalog served live and in the fallback; no new feature behaviour.

### [x] Phase 2 — The server accepts and validates every record kind
Goal:        a Save to cloud of every kind the client stores succeeds, and the new `targetOverride` kind is accepted and checked.
Depends on:  nothing (independent of Phase 1)
Changes:
- Server/Server.Dsl/AgentApi/AutolevelUserRecords.cs (NEW, DSL repo) — static `Kinds` = target, buff, fight, path, pref, abilityTiming, targetOverride; `TryValidate` carries the current checks (non-empty `id`, known `kind`, numeric `updatedAt`, `data` present) plus: a `targetOverride` needs `areaSlug`, `data.key` string 1-200 chars, optional `data.lookName` and `data.engageName` strings of at most 200 chars with no `;`, newline or control characters (E3), optional boolean `data.hidden`.
- UserContentController.cs:47 and :795-830 — remove the private list and validator, call the static class; `MaxAutolevelRecords` (l.37) and the error shapes stay.
Tests:       AutolevelUserRecordsTests.cs: each of the 7 kinds accepted; unknown kind, missing id, string `updatedAt`, missing `data` rejected with the same message text; targetOverride cases: missing key, key too long, `;` in keyword, newline in room line, hidden not boolean (E3, E5); the kind list equals the literal list in a comment contract with the client (E20).
API check:   `PUT /api/user-content/autoleveling` with one record per kind from an authenticated session answers 200 with `{count: 7}`; a record with `kind: "nope"` answers 400 with the error text; `GET` returns what was stored.
UI check:    none (server only).
Index/docs:  C# files have no `.annotated` in that folder unless one exists (check and update if present); docs: docs/game-client.md cloud-sync section (update the list of synced kinds); end-user: no user-visible effect on its own.
Exit gate:   `dotnet build -c Release` OK without new warnings · `dotnet test` all pass · deployed with `Server/deploy-local.ps1` · API check done · docs updated.
State on exit: server ready for the new kind; the existing `abilityTiming` upload defect is fixed.

### [x] Phase 3 — Override storage and the sync contract (no UI yet)
Goal:        overrides can be stored, read, applied and exported on the client, and removed custom targets are really deleted.
Depends on:  Phase 2 for the live sync check
Changes:
- autoleveling-user-data.ts:21 — `UserRecordKind` adds `'targetOverride'`; export `SYNCED_RECORD_KINDS` (all seven).
- autoleveling-user-data.ts — new `normalizeRecord(rec)` (shape, length and character checks of E3/E5) used by `importRecords` (l.131) and by the setters (E18); `importRecords` skips a record that fails it.
- New functions after the targets section (~l.152): `targetOverrideKey(lookName)` (E1), `getTargetOverrides(areaSlug)`, `setTargetOverride(areaSlug, key, patch)` storing only differing fields and deleting the record when it equals the default (E15, E16), `resetTargetOverride(areaSlug, key)` (E6), `applyTargetOverrides(areaTargets, overrides)` returning `{ rows, unmatched }` (E22), `updateCustomTarget`, `removeCustomTarget` (calls `deleteRecord`).
Tests:       autoleveling-user-data.test.ts: key normalization; override stored with only changed fields; edit back to default removes the record; reset removes edit and hidden flag; apply: edited row, hidden row, unmatched kept and not applied then re-applied when the key returns; export contains the override; import of malformed records dropped and valid ones kept; import last-writer-wins by `updatedAt` (E13); every exported kind is in `SYNCED_RECORD_KINDS`; removing a custom target deletes its record (the existing defect); AsyncStorage-like failure: the store throwing leaves callers with defaults and a fixed warning text.
API check:   none yet (the sync is exercised in Phase 6).
UI check:    none.
Index/docs:  features/autoleveling/.annotated (user-data entry: the override record shape and why only differences are stored; the matching key; unmatched rule); docs/game-client.md (the override layer).
Exit gate:   build OK · typecheck OK · lint OK · all game-client tests pass · coverage of new code reviewed · docs updated.
State on exit: storage layer complete and unused by the UI; behaviour for players unchanged.

### [x] Phase 4 — Edit the pre-loaded targets in the Targets step
Goal:        a player can change a target's room line or keyword, hide it, restore it, and reset it to the server default; edits persist across wizard sessions.
Depends on:  Phase 3
Changes:
- useWizardDraft.ts:12-19, :95-120 — extend `DraftTarget`; add `editTarget`, `hideTarget`, `restoreTarget`, `resetTarget`; `removeCustomTarget` also calls the persisted delete.
- AutoLevelingWizard.tsx:221-265 — seed area rows through `applyTargetOverrides`; keep the custom rows; pass `unmatched`; :272-280 persists edits through `setTargetOverride` / `updateCustomTarget`.
- TargetsStep.tsx — per row: Edit (inline, two fields, Save/Cancel, validation of E2/E3), Hide (moves the row to a "Hidden by you" list with Restore), Reset to default (visible only when `overridden`), a badge showing the server default under an edited row; an "Edits no longer matching this area" list with Delete (E22); a `TargetsHelp` button.
- TargetsHelp.tsx NEW — what pre-loaded vs your own targets mean, that edits are personal, how to reset, how sync works.
- AutoLevelingWizard.module.scss — controls and states using the module's palette variables.
Tests:       TargetsStep.test.tsx and a `useWizardDraft` test: edit saves and the row shows the new values; empty room line rejected; room line equal to another row rejected (E2); `;` in the keyword rejected (E3); hide moves the row, restore returns it, hidden rows are not in `draftToConfig` targets; reset restores the server values and clears the badge (E6, E17); unmatched list appears and deletes only on the user's click (E22); an unedited area target follows a changed server value. autoleveling-wizard-config.test.ts: an edited room line and keyword reach `init.targets`; a hidden target does not.
API check:   none (local storage only).
UI check:    wizard Targets step with an edited, a hidden and an unmatched target; dark theme and a second theme; focus, hover, disabled and error states; overflow with many targets (TH-01..TH-05). Progress shot `phase-04_targets-editor.png`.
Index/docs:  components/wizard/.annotated (TargetsStep, TargetsHelp), features/autoleveling/.annotated if the seeding contract changed; docs/game-client.md (the editor); end-user: the TargetsHelp button.
Exit gate:   build OK · typecheck OK · lint OK · all game-client tests pass · coverage reviewed · screenshot taken · docs and help written.
State on exit: web players can edit targets; the Combat step is unchanged; nothing syncs differently yet except that overrides now exist in the export.

### [x] Phase 5 — Full class picker and class-driven pre-population
Goal:        choosing a class with no saved set pre-fills its buffs and fight commands from the DSL data; saved sets always win; a missing catalog is announced, not hidden.
Depends on:  Phase 1 (the full catalog), Phase 3 (absent-vs-empty reads)
Changes:
- autoleveling-user-data.ts:158-200 — `getBuffOverlayOrNull`, `getFightOverlayOrNull` return `null` when no record exists (E19).
- autoleveling-class-defaults.ts NEW — `defaultBuffRows(classAbilities, charLevel)`: the class's abilities that match a `BUFF_CATALOG` entry by label or affect (verified command and affect, the same match `addClassBuff` uses at `CombatStep.tsx:432`), at or below the level, in catalog order; `defaultFightRows(classOffense, charLevel, learnedCooldowns)`: the highest-level offensive abilities at or below the level (constant `DEFAULT_FIGHT_ROWS = 3`), command built as `addClassFight` builds it (`CombatStep.tsx:464`: bare lowercase name for a skill, `cast '<name>' {name}` for a spell), cooldown from the learned value or 0. No level: no cap (E10).
- CombatStep.tsx:316-335 — keep the catalog-driven lists; when the catalog is empty show a notice that only the base classes are available instead of silently showing five (E9); :363-380 `onChangeClass` and the area-load effect seed through the defaults only when the overlay is `null`; seeded rows are held in the draft and written only on the player's first edit (E19); newest request wins (E11); `CombatHelp` button.
- CombatHelp.tsx NEW.
- CombatStep.test.tsx — see Tests.
Tests:       class-defaults pure tests: a class with matching buffs yields them with the catalog's command and affect; a class with no abilities yields none (E9); level cap respected and absent level means no cap (E10); fight rows are the highest three offensive abilities at or below the level, skill vs spell command shapes. CombatStep tests: absent overlay seeds; an overlay the player emptied stays empty (E19); a saved overlay is never replaced; seeded-but-untouched writes nothing (E15 analogue); class flip race (E11); empty-catalog notice shown and base classes still selectable.
API check:   none.
UI check:    pick a base class and a reclass (for example a newly added class) and show the pre-filled buff list and fight list; the empty-catalog notice (force by mocking the endpoint in the check script); progress shot `phase-05_prefill.png`.
Index/docs:  components/wizard/.annotated (CombatStep seeding rule, why `null` not `[]`); features/autoleveling/.annotated (class-defaults); docs/game-client.md (pre-population and its rules); end-user: CombatHelp button.
Exit gate:   build OK · typecheck OK · lint OK · all game-client tests pass · coverage reviewed · screenshot taken · docs and help written.
State on exit: web Combat step pre-fills; behaviour for players with saved sets is unchanged.

### [x] Phase 6 — Web sync round trip, final web verification
Goal:        overrides and the other autopilot records round-trip between two browser profiles through Save to cloud and Load from cloud, without one device wiping the other.
Depends on:  Phases 2-5
Changes:
- useAccountModal.ts:154 — before exporting, load the cloud collection and `importAutolevelUserData` it (newest wins), then export and save (E21); show the server's cap message (E4); :292 load summary counts overrides.
- cloudSync.ts:82-91 — contract unchanged; typed result already reports errors.
Tests:       useAccountModal tests: save with a stale local store merges the cloud copy first and the upload contains both devices' records (E21, E13); cap exceeded shows the message and uploads nothing (E4); a malformed cloud record does not stop the load (E18); `abilityTiming` records are uploaded (E20). cloudSync tests for both calls (success, 401, 400 text).
API check:   Playwright with two browser contexts logged into the same local test account: A edits a target and saves; B loads and sees the edit; B hides another and saves; A loads and sees both. `GET /api/user-content/autoleveling` shows the `targetOverride` records and no `abilityTiming` rejection.
UI check:    account modal save/load messages; showcase set `showcase_01_targets-editor.png`, `showcase_02_class-prefill.png`, `showcase_03_sync-result.png`.
Index/docs:  hooks/.annotated and features/auth/.annotated (load-merge-save rule and why); docs/game-client.md (cloud sync and overrides); end-user: help text updated to mention Save and Load to cloud.
Exit gate:   full checks for every touched package with coverage: `pnpm typecheck`, `pnpm lint`, `pnpm --filter game-client test`, `pnpm --filter web-server test`, `dotnet test`; build OK; API check; showcase screenshots.
State on exit: the web half of the item is complete and verified. Mobile phases start only after the owner signs off the web half.

### [ ] Phase 6b — Authenticated round trip on a signed-in session (deferred from Phase 6)
Goal:        the two things Phase 6 could not prove without a signed-in session are proven for real: a record of every kind survives a Save, and an edit made in one browser profile reaches another and comes back.
Depends on:  Phase 6; a LOCAL test account (not a real player account) from the owner
Changes:     none unless the run exposes a defect, which is fixed in this phase.
Tests:       none new unless a defect is found (then a regression test).
API check:   with Playwright, two separate browser contexts logged in to the same local test account: (1) from context A, `PUT /api/user-content/autoleveling` through the real Save to cloud after creating one record of each of the seven kinds (an edit, a hidden target, a custom target, a buff list, a fight list, a pref, a learned cooldown) answers 200 and `GET` returns all seven kinds (E20); (2) A edits a target and saves; B loads and sees the edit; B hides another target and saves; A loads and sees both (E13, E21); (3) B, which never loaded, saves a different edit: the cloud copy still holds A's records (CLOUDSYNC-02); (4) a record with an unknown kind answers 400 with the server's message. Scrub the responses to record shapes only.
UI check:    `showcase_03_sync-result.png`: the account window's message after a real Save and after a real Load (the Load message names the target edits).
Index/docs:  none beyond what Phase 6 wrote.
Exit gate:   the API check recorded in test-results.md with scrubbed shapes · the screenshot taken · nothing else red.
State on exit: the web half is fully verified; the mobile phases may start once the owner signs off.
### [ ] Phase 7 — Mobile: content API, cache and types
Goal:        the mobile app can fetch and cache areas, area detail and the class catalog, using the same served data as web.
Depends on:  Phase 6 signed off
Changes:      new `dsl-client/features/autoleveling/autoleveling-content-types.ts`, `autoleveling-content-api.ts`, `autoleveling-content-storage.ts` (AsyncStorage JSON, soft TTL, network then cache, v2 key from the start). Decision recorded in the Progress log: call the web-server proxy (`/maps/autoleveling/*`), not C# directly, so the app gets the same snapshot fallback and `X-Maps-Source`; base URL from the app's existing config (`dsl-client/constants`/`config`), with the dev emulator host mapping noted. Coerce DTOs the way the web `normalize*` functions do (the C# serializer omits false/0/"").
Tests:       `__tests__/autoleveling-content-test.ts`: parse of index, detail and classes into typed DTOs; cache round trip without a network call; stale cache refreshed; network failure with a cache falls back; storage throwing falls back (E12).
API check:   from the mobile jest run against recorded fixtures; plus one real `curl` of the three endpoints documenting the shape.
UI check:    none.
Index/docs:  `dsl-client/features/autoleveling/.ai-context` NEW (layout note, mirrors the web feature; the repo convention); docs/reference/mobile.md (feature module row).
Exit gate:   mobile jest all pass · tsc shows no new errors against the recorded baseline · docs updated.
State on exit: data layer only; no screen.

### [ ] Phase 8 — Mobile: user-data store and cloud sync
Goal:        the mobile app stores the same record kinds and can Save and Load them to the account, so web edits arrive on the phone and back, before any engine exists.
Depends on:  Phase 7
Changes:      new `autoleveling-user-data.ts` (same record shapes and ids as web, AsyncStorage one key per record, the same `normalizeRecord`, override functions and `applyTargetOverrides`, `SYNCED_RECORD_KINDS`, fresh v1 with no legacy migration); `features/auth/cloud-sync.ts:195-290` — `saveAllToCloud` gains the autoleveling collection after load-merge-save (E21), `loadAllFromCloud` imports it; limits constant for the 1000-record cap (E4); `components/AccountSection.tsx` summary text includes the count.
Tests:       store round trips and the same override and normalization cases as Phase 3 (E1-E6, E13, E15, E16, E22); cloud-sync tests with mocked `fetch`: save merges the cloud copy first, load imports and ignores malformed records (E5, E18), cap exceeded refuses (E4), 401 handled like the existing collections.
API check:   mobile jest against a recorded cloud blob taken from the Phase 6 run (placeholders only in the committed fixture); live check in Phase 11.
UI check:    the account section's Save/Load messages (device capture in Phase 11).
Index/docs:  `features/autoleveling/.ai-context`, `features/auth` index; docs/reference/mobile.md (storage keys); docs/features/autopilot.md NEW (start).
Exit gate:   mobile jest all pass · no new tsc errors · docs updated.
State on exit: sync-compatible mobile data layer, no UI for it yet.

### [ ] Phase 9 — Mobile: engine port
Goal:        the current web autopilot engine runs on mobile's event bus and send pipeline.
Depends on:  Phase 8
Changes:      new `autoleveling-types.ts`, `autoleveling-defaults.ts`, `autoleveling-actions.ts`, `autoleveling-alignment.ts`, `autoleveling-wizard-config.ts` (`draftToConfig`), `autoleveling-engine.ts` ported from the web engine as it stands at that time (including today's room-scan wait), `eventBus.on/emit` in place of window events with the confirmed GMCP event names, sends through `connectionManager` (`sendUserInput`, `connection-manager.ts:295`; a pass-through method only if the plan's recorded decision needs one), `isFighting` read from `game:char-data`. Port faithfully; no behaviour changes.
Tests:       the web engine suite adapted to jest-expo (round order, movement gating, engage outcome, rest, weight, flee-pause, vitals and once gates, room-scan wait, queue buildup); a test that binding the engine does not displace `vitals-store`'s own subscription (EVENTBUS-01); stop and unmount leave no timers or listeners.
API check:   none.
UI check:    none.
Index/docs:  `.ai-context` for the feature; docs/features/autopilot.md (engine section).
Exit gate:   mobile jest all pass · no new tsc errors · docs updated.
State on exit: engine present and tested, not reachable from any screen.

### [ ] Phase 10 — Mobile: configuration UI and play-screen control
Goal:        a player can configure and run autopilot on the phone, with the same editable targets, full class list and pre-filled abilities.
Depends on:  Phase 9
Changes:      new config screen (single scrollable form, per the legacy port plan's step 4: area, targets with edit/hide/reset and unmatched list, class picker from the full catalog, buffs and fight rows pre-filled by a port of `autoleveling-class-defaults.ts`, in-app help text for Targets and Combat), `useAutoLeveling.ts` hook, control surface in `components/PlayContainer.tsx` (start, pause, stop, status), route under `app/`; all storage and applying through Phase 8's store.
Tests:       component tests for the editor states and validation (E2, E3), pre-fill rules and the saved-set-wins rule (E19), hook lifecycle (start, pause, resume, stop, unmount).
API check:   none.
UI check:    device or emulator captures in portrait and landscape: config screen, an edited target, the pre-filled combat section, the PlayContainer control.
Index/docs:  `.ai-context` files in the touched folders; docs/features/autopilot.md (screens); docs/reference/mobile.md (screens, storage keys).
Exit gate:   mobile jest all pass · no new tsc errors · captures taken · docs updated.
State on exit: the mobile autopilot is usable end to end but not yet verified on a device run.

### [ ] Phase 11 — Mobile verification, round trip with web, close-out
Goal:        proof on a device that a run completes, config survives an app restart, and a web edit reaches the phone and back.
Depends on:  Phase 10
Changes:      none in code unless the run exposes a defect, which is fixed in this phase; owner approval before starting the Android emulator, `emulator-5554` only; Metro and any physical phone stay the owner's.
Tests:       full mobile jest and tsc comparison with the baseline; full web checks again for packages changed since Phase 6.
API check:   with the test account: edit a target on web, Save to cloud; Load to cloud on the phone shows the edit; change another on the phone, Save; Load on web shows both.
UI check:    capture list `showcase_04_mobile-config.png`, `showcase_05_mobile-targets-edit.png`, `showcase_06_mobile-roundtrip.png`.
Index/docs:  docs/reference/game-client.md (porting status row for autoleveling updated), docs/features/autopilot.md final, indexes refreshed, `2026-09-12_autoleveling-mobile-port` marked superseded in its item.md.
Exit gate:   all checks green for ShatteredArchive, DSL and shatteredarchive-mobile; a recorded device run; iOS stated as code-parity-confirmed and not build-verified.
State on exit: the item is complete pending the owner's sign-off.

## Risks and rollback

- Overrides are keyed by the normalized original room line; a server rename leaves an unmatched edit (kept, shown, reattaches). Rollback: remove the `targetOverride` handling; stored override records are ignored by older clients and rejected by an older server, so Phase 2 must stay deployed before any client that uploads them.
- The 1000-record cap is shared with learned cooldowns; a heavy user could reach it (E4 gives a clear message; raising the cap is a C# change not planned here).
- Pre-fill uses group data with gaps (1262 of 5036 abilities have no group in the live catalog, including common fighter skills); the fight defaults therefore lean on `COMBAT_SKILL_NAMES`, and a class may get fewer fight rows than expected. Players can always edit.
- Phase 1's compose change affects the local stack only; production's upstream address was not checked.
- Rollback of any web phase is a revert of that phase's files; Phases 1 and 2 are independently revertible.

## Plan amendments

**A1 (2026-11-13, Phase 1, minor):** the plan edited the `sendJson` closure in `apps/web-server/src/index.ts` and planned handler tests there. That file starts the service on import, so no test can load it. The new policy (`Cache-Control` per source, warn-once) is a new pure module `apps/web-server/src/mapsResponsePolicy.ts` with `mapsResponsePolicy.test.ts`; `sendJson` calls it and gained an optional `endpoint` argument passed at its three offline call sites. No existing logic was moved. The deployed container was checked for the wiring. Edit-map rows for `index.ts` and the new test file are `amended: see A1`.

**A2 (2026-11-13, Phase 2, minor):** the authenticated PUT of one record per kind (Phase 2 API check) needs a signed-in test-account session that was not available. It moves to the Phase 6 API check, which already drives a signed-in browser session; Phase 6 must also PUT all seven kinds and read them back. Needs a local test account from the owner before Phase 6. Phase 2 Edit-map rows are otherwise as planned; the only extra file touches are one `[Collection("AbilityCache")]` attribute in each of NewClassesTests.cs and AutoPilotClassCacheTests.cs (test-order race, see test-results.md).
**A3 (2026-11-13, Phase 3, minor):** the pure override rules (key, safe text, diff against default, apply, unmatched) are in a new module `autoleveling-target-overrides.ts` with its own test file, instead of inside `autoleveling-user-data.ts` as the Edit map said, per the TypeScript standard ("a new pure helper gets its own module"). `getBuffOverlayOrNull` / `getFightOverlayOrNull` stay in Phase 5 as planned. A new developer doc `docs/game/autopilot.md` was created now (no autopilot doc existed) and grows in Phases 4-6; the Edit-map row for `docs/game-client.md` is `amended: see A3` (the doc lives at `docs/game/autopilot.md`, the `{service}` folder of the work-item workflow).
**A4 (2026-11-13, Phase 4, minor):** (a) `DraftTarget` rows are identified by a new `targetRowId` (`a:<key>` / `c:<record id>`) and `toggleTarget`, `removeCustomTarget` now take that id instead of the room line, because an edit changes the room line; `useWizardDraft` also gained `editTarget`, `deleteUnmatched` and `unmatchedOverrides` (all in the planned files). (b) The add-your-own box now validates text and duplicates too (E3 applies to typed custom targets, not only edits). (c) New file `AutoLevelingWizard.targets.test.tsx` and `useWizardDraft.test.ts` beyond the planned `TargetsStep.test.tsx`; one SCSS class (`.linkAction`) added so non-destructive link actions do not use the destructive red hover of `.linkButton`, which other steps rely on. (d) The user-facing doc is `docs/game/autopilot.md` (see A3).
**A5 (2026-11-13, Phase 5, minor):** (a) The `OrNull` readers return `[]` (not `null`) when storage is unreadable, so nothing is pre-filled over data that may exist. (b) Pre-fill logic is one decision per area|class (`seededFor`), run from the mount effect for a remembered class and from `onChangeClass` for a new pick, instead of two independent effects, to avoid a race between the two writers; a pending seed is dropped on unmount or when a newer pick moves `seededFor`. (c) New test file `CombatStep.prefill.test.tsx` beside the existing `CombatStep.test.tsx` (whose mocks were updated for the new readers). (d) `buffRowFromCatalog` is shared with the manual catalog add (a small refactor of `addFromCatalog`, behaviour unchanged, guarded by a test). (e) `DEFAULT_REFRESH_TICKS` moved from CombatStep to `autoleveling-class-defaults.ts` and is imported back.
**A6 (2026-11-13, Phase 6, significant but covered by a standing rule):** the Phase 6 API check (two signed-in sessions, 7-kind PUT/GET, 400 on an unknown kind) and `showcase_03_sync-result.png` could not be run: they need a signed-in local test account and none is documented or available to the agent. Following the owner's standing rule that anything closed without being run goes into a deferred plan phase, they moved to a NEW Phase 6b placed before the mobile phases. Phase 6's code, tests and the other two showcase shots are done. Needs from the owner: a local test account (or the owner running the round trip and reporting), before sign-off of the web half.
**A7 (2026-11-13, owner request after Phase 6, minor):** fight commands can be paused (`FightRow.disabled`), in addition to remove; recorded in test-results.md. No server change: the fight record's data is not validated field by field, so the flag syncs as is.
**A8 (2026-11-13, owner requests, minor):** (a) buffs above the character's level are listed paused with a warning instead of omitted (`BuffRow.disabled`; `defaultBuffRows` changed; replaces the Phase 5 rule that omitted them), (b) the room-scan wait became lag-aware (3 s notice, 20 s hard cap, sightless replies count) after a second live-log finding. Both recorded in test-results.md.
## Progress log

- 2026-11-13: plan written.
- 2026-11-13: implementation started; item moved to active/.
- 2026-11-13: Phase 1 done (compose upstream address fixed, offline answers no-store with a one-time warning, snapshots regenerated: 48 classes and 31 areas, IndexedDB keys bumped to .v2). Verified live: X-Maps-Source upstream, 48 classes, 32 areas. Web-server and game-client containers rebuilt and recreated on the local stack. Deviation: A1.
- 2026-11-13: Phase 2 done (AutolevelUserRecords.cs, controller calls it, 33 new C# tests, site redeployed with deploy-local.ps1). Deviation: A2. Pre-existing DSL test failures recorded in test-results.md.
- 2026-11-13: Phase 3 done (override rules module, store functions, normalizeRecord gate, SYNCED_RECORD_KINDS, custom target update/remove, docs/game/autopilot.md). Deviation: A3.
- 2026-11-13: Phase 4 done (Targets step editor, TargetsHelp, draft identity by targetRowId, wizard wiring, 66 new tests, game client rebuilt and redeployed, browser check). Deviation: A4.
- 2026-11-13: Phase 5 done (class-defaults module, OrNull readers, CombatStep pre-fill and notice, CombatHelp, 50 new tests, game client redeployed, browser check). Deviation: A5.
- 2026-11-13: Phase 6 code and tests done (merge-first Save, cap check, load summary, 18 new tests, docs, indexes, game client redeployed, showcase 01 and 02). The authenticated round trip is deferred to Phase 6b (A6). Web half ready for the owner's own testing; mobile phases (7-11) not started.
- 2026-11-13: Added pause/resume for fight commands on the owner's request (A7); built and redeployed.
- 2026-11-13: Owner requests: paused buffs with warnings for abilities not yet available, and an ability-lag guard on the room scan (A8). Built and redeployed.
