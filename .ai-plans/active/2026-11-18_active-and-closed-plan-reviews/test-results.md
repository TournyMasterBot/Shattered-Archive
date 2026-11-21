# Test results: review of the active and closed plans

## Baseline (2026-11-18)

This item changes no code, so there is no code baseline to break. The repo state before Phase 1 is in `findings.md` (repository baseline table). The toolbox commands are proven in Phase 1 below; full-suite runs are made per review phase, against the reviewed plan's own figures.

## Phase 1 — Method, baseline and the findings skeleton (2026-11-18)
Commands (PowerShell on the host, bounded, foreground, output filtered):
- `git -C C:/Projects/<repo> status --short` and `rev-parse --short HEAD` for the six repos: worked, counts in `findings.md`.
- `pnpm -C C:/Projects/ShatteredArchive exec jest --config jest.config.cjs --runInBand --testPathPatterns apps/game-client/src/features/movement/movementTracker.test.ts`: exit 0, **Tests: 10 passed, 10 total**, 1 suite, 27.6 s. This form works as written.
- `pnpm --dir C:/Projects/shatteredarchive-mobile/dsl-client exec jest plugins/__tests__/withDevelopmentTeam-test.js`: exit 0, **Tests: 6 passed, 6 total**, 1 suite, 7.3 s. This form works as written.
- Read, not run: `C:/Projects/merc-mud/scripts/gmcp-compose-check/run.mjs` header: it copies `2.4/src` and the area files (no player files) into a scratch folder and builds a throwaway Docker image to run the GMCP composer assertions; needs Docker; exit 0 = held, 1 = mismatch, 2 = build failed. It does not start or touch the running game server. Whether to run it is decided in Phase 3.
- `dotnet` found at the standard install path; the C# filter form is proven when first used in Phase 4.
- Not run in Phase 1 (proven when first needed): `pnpm typecheck`, mobile `exec tsc --noEmit`, the root guards, the full suites.
Results: build n/a (no code changed) · typecheck n/a · lint n/a · tests: the two proof runs above, 16/16 · `git status --short` of ShatteredArchive shows the item folder, the already-modified plan files from before this item, and the new `docs/standards/edge-cases/work-item-folders.md` plus its index row.
Tests added/updated: none (doc-only).
Edge cases covered: E9 (host PowerShell, bounded, filtered, nothing killed; the bash used by this tool is not used for test runs).
Classifiers proposed / approved and added / declined: WORKITEM-01 and WORKITEM-02 proposed, approved and added during `/tech-plan` (2026-11-18).
API: none in this phase.
Incremental screenshots: none.
Docs: none: no feature is created or changed; `findings.md` is the work-item document.
Skipped verification: tests skipped as doc-only.

## Phase 2 — Review 1: SDK 52 to SDK 58 upgrade (2026-11-18)
Commands (PowerShell, host, mobile repo `dsl-client`): `pnpm --dir <dsl-client> exec jest` (whole app) · `exec tsc --noEmit` · `run lint` · `config get minimumReleaseAge` / `nodeLinker` · `exec expo install --check` (with `CI=1`) · `git -C <mobile> status --short` before and after.
Results: jest **1137/1137 in 82 suites** (plan recorded 891 in 69; the suite grew in later commits) · tsc exit 0 · lint 0 errors, 85 warnings (plan recorded 66) · minimumReleaseAge 1440, nodeLinker hoisted · `expo install --check` exit 1: 11 packages behind the expected SDK 58 patch set (plan recorded "up to date") · the earlier intermittent `ConnectModal-test` failure did not recur in this run.
Mobile `git status --short` identical before and after (the same 2 modified tracked `fileHashes.lock` fixtures, HEAD 09b5d85): no file changed by the reruns.
Tests added/updated: none (read-only review).
Edge cases covered: E1 (every `[x]` phase has a "found at" entry in `findings.md` section 1) · E2 (mobile work is committed: commit `f290ff1` and two later; only the two fixture files are dirty) · E3 (counts rerun and compared, plan figures quoted as recorded) · E4 (no failure to chase; the one flake did not recur) · E5 (device, account and Play Console items listed as owner steps, none marked verified) · E9 (host PowerShell, bounded, filtered, nothing killed) · E11 (EXPO-01..06 mapped to `test-results.md` mentions).
Classifiers proposed / approved and added / declined: none new.
API: none in this phase.
Incremental screenshots: none (the plan's 31 progress shots and 6 showcase files were listed, not retaken).
Docs: none: no feature changed; the plan's developer docs (`docs/native-customizations.md`, `docs/run-ios.md`, `docs/features/background-connection.md`) were confirmed present.
Skipped verification: none beyond the owner tests listed in `findings.md` section 1.

## Phase 3 — Review 2: Simulacrum admin panel (2026-11-18)
Commands (PowerShell, host): `pnpm -C <repo> exec jest --config jest.config.cjs --runInBand --testPathPatterns "apps/game-client/src/(features|components)/simulacrumAdmin" "apps/game-client/src/components/SimulacrumAdminWindow"` · `pnpm -C <repo> --filter @shatteredarchive/game-client test` · `pnpm -C <repo> typecheck` · `pnpm -C <repo> test:guards` · `pnpm -C <repo> run check:manifests|check:local-only|check:private-names` · `node scripts/generate-simulacrum-admin-commands.mjs --check` · `node C:/Projects/merc-mud/scripts/gmcp-compose-check/run.mjs` · two read-only `curl` GETs of `/api/map` on the world vhost (one allowed origin, one foreign origin) · `git status --short` of four repos before and after.
Results: feature tests **580/580 in 33 suites** · whole game-client **3467/3467 in 200 suites** (plan recorded 3293 in 188) · typecheck exit 0 · guards **121/121** (plan recorded 109) · manifests OK (32 projects) · local-only OK · private-names OK (1157 names, 2342 files) · generator matches · merc-mud compose check exit 0, "all assertions held" (8 s; a scratch image built from a copy, the running game server untouched) · world vhost: 200 with `Access-Control-Allow-Origin` equal to the allowed origin; 200 with no allow-origin header for a foreign origin.
`git status --short` counts identical before and after in ShatteredArchive (9), merc-mud (15), DSL (26) and the mobile repo (2): no file changed by the reruns.
Tests added/updated: none (read-only review). Coverage was not re-measured.
Edge cases covered: E1 (found-at column in `findings.md` section 2) · E2 (the merc-mud working tree is uncommitted: 11 modified files plus 4 untracked paths, recorded as an open item; DSL user guide committed) · E3 (counts rerun, plan figures quoted as recorded) · E4 (the one-off guard failure the plan noted did not recur) · E5 (relay session with the access code left as owner step (b)) · E9 · E11 (LOCAL, ADMIN, LIVESTRM, TH rows mapped to mentions in the plan's `test-results.md`; LOCAL-03 not applicable per the plan).
Classifiers proposed / approved and added / declined: none new.
API: the two GETs above (no body kept; only status and the CORS header names).
Incremental screenshots: none (the plan's seven showcase files were listed and confirmed present, not retaken).
Docs: none changed; `docs/game/simulacrum-admin.md`, `docs/game/gmcp-parity.md` and the DSL user guide confirmed present.
Skipped verification: lint was not rerun (no code changed); coverage was not re-measured.

## Phase 4 — Review 3: editable autopilot targets (2026-11-18)
Commands (PowerShell, host): `pnpm -C <repo> exec jest --config jest.config.cjs --runInBand --testPathPatterns "apps/game-client/src/(features/autoleveling|components/wizard|components/AutoLevelingWizard|hooks/useAccountModal|features/auth)"` · `pnpm -C <repo> --filter @shatteredarchive/web-server test` · `dotnet test C:/Projects/DSL/Server/Server.Dsl.Tests --filter "FullyQualifiedName~AutolevelUserRecordsTests|FullyQualifiedName~AutoPilotClassCacheTests|FullyQualifiedName~NewClassesTests" --nologo -v q` · one read-only GET of `https://game-client.shatteredarchive.dev/api/web/maps/autoleveling/classes` (status, two headers, class count only) · `git status --short` of four repos before and after.
Results: game-client targeted **537/537 in 24 suites** · web-server **10/10** · C# **50 passed, 0 failed, 0 skipped** (the whole game-client suite and typecheck are in Phase 3: 3467/3467, exit 0) · live endpoint: 200, `X-Maps-Source: upstream`, 48 classes.
`git status --short` counts identical before and after (ShatteredArchive 9, DSL 26, merc-mud 15, mobile 2).
Tests added/updated: none (read-only review).
Edge cases covered: E1 (found-at column, section 3) · E2 (DSL C# files committed in `abb9840ca`; game-client files committed; one uncommitted progress-log line in the plan itself) · E3 (counts rerun, plan figures quoted as recorded) · E5 (6b needs an account: owner step) · E6 (no account file opened, no account used) · E9 · E10 (Phase 6b steps copied verbatim from `tech-plan.md:209` into the findings as owner steps; nothing run against any account) · E11 (CLOUDSYNC-01/02/03, SETTINGS-01/02/06, FALLBACK-01 mapped to lines in the plan's `test-results.md`).
Classifiers proposed / approved and added / declined: none new.
API: the one GET above (status and header names only; no body kept).
Incremental screenshots: none (the four existing showcase files were listed; `showcase_03` is Phase 6b).
Docs: none changed; `docs/game/autopilot.md` confirmed present.
Skipped verification: lint not rerun (no code changed); coverage not re-measured; the C# suite was run only for the three classes the plan touched, not the whole DSL suite.

## Phase 5 — Review 4a: the two autoleveling plans and the movement plan (2026-11-18)
Commands (PowerShell, host): `pnpm -C <repo> exec jest --config jest.config.cjs --runInBand --testPathPatterns "apps/game-client/src/features/movement"` · same with `"apps/game-client/src/features/autoleveling" "apps/game-client/src/hooks/useCompassBlock"` · `Grep` and ranged reads for every symbol named in a step's "Files:" line · `git -C <repo> status --short` before and after. The whole game-client suite and typecheck are in Phase 3 (3467/3467, exit 0).
Results: movement **28/28 in 3 suites** · autoleveling **255/255 in 9 suites** · repo status counts identical before and after (ShatteredArchive 9, DSL 26, merc-mud 15, mobile 2).
Tests added/updated: none (read-only review).
Edge cases covered: E1 (found-at column in sections 4-6; the one failed Verify, redesign step 13, was found by grep: `AutoLevelingModal.tsx`, its SCSS and `autoleveling-saved-targets.ts` still exist) · E2 (all files tracked and committed) · E3 (counts rerun) · E5 (live play-tests, a compass click and a stacked command on a real character: owner steps, none marked verified) · E7 (the path references to the movement plan were listed for Phase 8: 3 comments, 2 `.annotated` lines) · E9.
Classifiers proposed / approved and added / declined: none new.
API: none in this phase.
Incremental screenshots: none.
Docs: none changed.
Skipped verification: the three C# area data fills of redesign step 12 were not opened individually; the `.flows` regeneration the combat-rest plan asked for was not checked; lint not rerun (no code changed).

## Phase 6 — Review 4b: the two auth rollout plans (2026-11-18)
Commands (PowerShell, host): `pnpm -C <repo> --filter @shatteredarchive/auth-server test` · `pnpm -C <repo> --filter @shatteredarchive/mud-builder-server test` · `Grep` over `DslMapper` and `DslLogViewer` for `sso|login|auth-server` in `.ts/.tsx/.js/.jsx` sources · ranged reads of both plans' step blocks and logs · reads of `docs/auth-server.md:183,242-342,790-842` · `git status --short` of six repos before and after. The mobile suite (1137/1137) and the game-client suite (3467/3467) are in Phases 2 and 3. No `dotnet test` was run: a search of the DSL test projects found no test class for `SiteSso` or `HubAuth`.
Results: auth-server **294/294 in 23 suites** · mud-builder-server **187/187 in 18 suites** · repo status counts identical before and after (ShatteredArchive 9, DSL 26, merc-mud 15, mobile 2, DslMapper 0, DslLogViewer 0).
Tests added/updated: none (read-only review).
Edge cases covered: E1 (found-at column in sections 7-8; step F's target app is not in this repo, recorded as "cannot be proven here") · E2 (DSL auth code committed) · E3 · E5 (device sign-in for step E, the live three-site smoke and key-rotation runbook for step I: owner steps) · E6 (a registered key id appears in `docs/auth-server.md` and is not copied here) · E9 · E11 (n/a: the auth plans pre-date the catalog).
Classifiers proposed / approved and added / declined: none new.
API: none in this phase.
Incremental screenshots: none.
Docs: none changed; `docs/auth-server.md` and the DSL `.annotated` files were read.
Skipped verification: the memory file `auth-rollout-program.md` named in Phase B step 5 is outside the repo and was not checked; whether the C# dashboard side of H was started was not searched; no C# test run.

## Phase 7 — Review 4c: mud-parity, deep-review, sitemaps, mobile sweep (2026-11-18)
Commands (host): `Grep`/`ls`/`git -C <repo> show HEAD:<file>` for every file and symbol named by the four plans (merc-mud `do_qpoints|do_stance|do_speak|quest_points|gsn_craft`, DSL `Deep Review/`, `SitemapService.cs`, `SitemapController.cs`, game-client `globalScriptsStore.ts` and unsaved-changes tests, mobile `connection-manager.ts:114` and `AnsiLine.tsx:47`) · one read-only `curl` GET of `http://localhost:5000/sitemap.xml` (status, content type, root element and `<loc>` count only) · arithmetic on the committed `Deep Review/reports/run-stats.json` · `git status --short` of four repos before and after.
Results: merc-mud subsystems present and committed (`a0b9a35`); `gsn_craft` absent as the plan's log says; DSL `Deep Review/` tracked (`a523ba420`), Unclassified 14,550,522 of 46,925,304 records = 31.0%; local `/sitemap.xml` 200 `application/xml`, a sitemap index with 10 entries; no test project in the DSL repo covers the sitemap filter, the deep-review scripts or the SSO flow. Repo status counts identical before and after (ShatteredArchive 9, DSL 26, merc-mud 15, mobile 2). No test suite was rerun in this phase; the whole-suite results of Phases 2, 3 and 6 and the merc-mud compose check (Phase 3) cover the touched code that has tests.
Tests added/updated: none (read-only review).
Edge cases covered: E1 (found-at column in sections 9-12; the sitemap plan's step-1 unit test was looked for and not found) · E2 (merc-mud subsystems committed; DSL Deep Review and sitemap code committed) · E3 (no recorded count was reused as verified) · E5 (device play, the reporter's re-test, Search Console, the room-prose decision: owner steps) · E6 (no log excerpts copied; the sweep plan names a reporting player, who is not named in the findings) · E9.
Classifiers proposed / approved and added / declined: none new.
API: the one GET above.
Incremental screenshots: none.
Docs: none changed.
Skipped verification: the individual allocation fixes of sweep steps 3 and 4 and the C# `_Layout` SEO baseline were not re-inspected line by line; the DSL Deep Review pipeline was not rerun (it processes a multi-gigabyte corpus).

## Phase 8 — Owner decisions, moves, reference sweep and close-out (2026-11-18)
Commands: `git -C <repo> grep -I -l --untracked -e <old path or slug>` over nine repos before and after each move · `git mv` for the two flat plans and the SDK plan folder · `sed`/Edit for `state:`, three path mentions and the progress-log lines · `Grep` of `findings.md` and `test-results.md` for `@`, IPv4 patterns, `token=`, `secret=`, `key=`, `password` and sizing words.
Results: owner asked one question per plan (four questions, evidence in each); answers: SDK 58 close and move: yes; Phase B move: yes; mud-parity move: yes; sitemaps: "complete the work, then close it" (not moved; new work item). Before the moves the old paths were found only in this repo. After the moves: no hit for `closed-incomplete/20260727-1022` or `closed-incomplete/20260723-1145`; one kept historical mention of the SDK plan's old folder inside its own `test-results.md:220`. The scan found no Personal or Restricted value and no sizing word (hits: package names, a commit hash, the phrase "half-hour clock", and the quoted plan step title "remaining small items").
No source comment or `.annotated` line needed editing (the movement plan did not move), so no typecheck or test run was required in this phase; the typecheck and whole-suite results of Phases 2-3 stand.
Tests added/updated: none (doc-only; no code changed by this item).
Edge cases covered: E6 (final scan clean) · E7 (search before and after every move, three path mentions updated, one historical mention recorded) · E8 (each move asked individually, answers recorded in `findings.md`).
Classifiers proposed / approved and added / declined: WORKITEM-01 and WORKITEM-02 added earlier (approved); no new ones.
API: none in this phase.
Incremental screenshots: none.
Docs: `docs/auth-server.md:797` (path updated). `.ai-plans-completed/.ai-context` and `docs/claude/work-item-workflow.md` unchanged on purpose (`closed-incomplete/` still holds 7 plans). No feature doc: no feature changed.
Skipped verification: none beyond what Phases 2-7 record.

## Final state
Files changed by this item (ShatteredArchive repo): `docs/standards/edge-cases/work-item-folders.md` (new) and `docs/standards/edge-cases/README.md` (index row); `docs/auth-server.md` (one path); `.ai-plans-completed/closed-incomplete/20260726-1953-centralized-auth-rollout-all-services.md` (two path mentions); `.ai-plans-completed/completed/20260727-1022-auth-rollout-phaseB-csharp-clean-cut.md` and `.../20260723-1145-mud-parity-new-subsystems.md` (moved, disposition line appended); `.ai-plans-completed/2026-11-01_mobile-expo-sdk-upgrade/` (moved, `state: completed`, progress-log line); this item's `findings.md`, `test-results.md`, `tech-plan.md`. No source code, no sibling repo and no running service was changed; every rerun left the repositories' `git status` counts unchanged.
Other changes visible in `git status` that this item did not make: modified `apps/game-client/src/components/AutoLevelingWizard.tsx`, `components/wizard/ReviewStep.tsx`, `components/wizard/useWizardDraft.ts`, `features/autoleveling/autoleveling-user-data.ts`, `styles/AutoLevelingWizard.module.scss`, `apps/web-server/src/offline/autoleveling/areas.json` and a new `features/autoleveling/autoleveling-route-overrides.ts` (autopilot work by someone else during this session), and `docs/shattered-maps/world-map-api.md`.
Screenshots: none (no UI). Incremental: none. Final showcase: none.
Documentation sweep: no feature was created or changed, so no developer or end-user document is owed.
