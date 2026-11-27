# Tech plan: Review four plan groups (SDK 58 upgrade, Simulacrum admin panel, editable autopilot targets, closed-incomplete plans)

Item: item.md · Scope: scope.md · Planned against: performance/Allocation-hunt @ 9191edc · Date: 2026-11-18
Standards: none (no source language is changed; the only source edits are three comment lines in Phase 8, which follow `docs/standards/typescript.md` unchanged) · Data classification: Restricted as the highest class the work can touch; every written document is held to Internal (a local test account is never read, see E6)
Edge-case catalog: `game-data-privacy.md` (PRIVNAME), `work-item-folders.md` (WORKITEM) · Classifiers added (user-approved 2026-11-18): WORKITEM-01, WORKITEM-02 (new file `docs/standards/edge-cases/work-item-folders.md`, index row added)

## Goal

Every one of the 12 plans (3 active folders, 9 files in `closed-incomplete/`) has a written verdict in one `findings.md`: what was
implemented, what verified it, what is open and who owns it. After that, on the owner's word and one plan at a time, plan 1 is closed and
each closed-incomplete plan that has no unexecuted step moves to `completed/`, with every path that names it updated.

## Out of scope

Fixing any defect or finishing any open step the reviews find; signing off, committing or pushing; running device, Play Console, hosts-file
or real-game steps; building plan 3's mobile phases 7-11; the Copilot plan and the proposed items; rewriting old plan text (scope.md, Out of scope).

## Standards applied

No source language changes except three comment lines in `apps/game-client/src/features/movement/` (Phase 8, only if the movement plan is moved),
which need no new standard. Markdown output follows `docs/claude/work-item-workflow.md` and `docs/standards/data-classification.md`
(DRAFT, followed as written). Decisions recorded in scope.md bind this plan: plan 1 closes with its owner items accepted; a closed-incomplete
plan counts as verified only if its log shows the test and the code and tests still exist; plan 3 Phase 6b is run by the owner; each move is
on the owner's word for that plan.

## Edit map

| File | Line(s) | Anchor | Change | Phase |
|---|---|---|---|---|
| `.ai-plans/proposed/2026-11-18_active-and-closed-plan-reviews/findings.md` | new | `# Findings` | the single deliverable: one section per plan, written phase by phase | 1-7 |
| `.ai-plans/proposed/2026-11-18_active-and-closed-plan-reviews/test-results.md` | new | per phase block | commands, counts, dates of every verification run (written by `/implement-plan`) | 1-8 |
| `.ai-plans/active/2026-11-01_mobile-expo-sdk-upgrade/item.md` | 6 | `state: active` | `completed`, only on the owner's word | 8 |
| `.ai-plans/active/2026-11-01_mobile-expo-sdk-upgrade/` | folder | whole folder | moved to `.ai-plans-completed/2026-11-01_mobile-expo-sdk-upgrade/`, only on the owner's word | 8 |
| `.ai-plans/active/2026-11-01_mobile-expo-sdk-upgrade/tech-plan.md` | 324 | `## Progress log` | one dated line recording the close-out and the accepted owner items | 8 |
| `.ai-plans-completed/closed-incomplete/<plan>.md` (up to 9) | file | file name | `git mv` (tracked) or `mv` to `.ai-plans-completed/completed/<plan>.md`, one plan at a time, only plans whose every unchecked step has a disposition that is "implemented and verified" | 8 |
| `apps/game-client/src/features/movement/classifyMovement.ts` | 5 | `see .ai-plans-completed/closed-incomplete/20260813-1325-...` | path in a comment updated, only if the movement plan moves | 8 |
| `apps/game-client/src/features/movement/movementTracker.ts` | 9 | same | same | 8 |
| `apps/game-client/src/features/movement/movementTracker.test.ts` | 5 | same | same | 8 |
| `apps/game-client/src/features/movement/.annotated`, `apps/game-client/src/components/.annotated` | 7, 19 | `closed-incomplete` | path in an index entry updated, only if that plan moves | 8 |
| `docs/auth-server.md` | 797 | `closed-incomplete/20260727-1022-auth-rollout-phaseB-...` | path updated, only if Phase B moves | 8 |
| `.ai-plans-completed/completed/20260727-0905-...` (lines 8, 150), `20260727-1145-...` (9), `20260728-0858-...` (4), `20260913-0100-...` (80) | 8, 150, 9, 4, 80 | `closed-incomplete/` | path mentions updated for any plan that moved | 8 |
| `.ai-plans/proposed/2026-07-28_auth-rollout-phaseH-mapper-logviewer-dashboard/tech-plan.md` | 5 | `Umbrella step H of ...closed-incomplete/20260726-1953-...` | path updated, only if the umbrella plan moves | 8 |
| `.ai-plans-completed/.ai-context` | 3 | `completed/` and `closed-incomplete/` | reworded if `closed-incomplete/` is emptied or its meaning changes | 8 |
| `docs/claude/work-item-workflow.md` | 23 | `Older flat plans are in completed/ and closed-incomplete/` | reworded only under the same condition | 8 |
| `docs/standards/edge-cases/work-item-folders.md`, `.../README.md` | new, 58 | `WORKITEM` | classifiers WORKITEM-01 and -02 and their index row (done in `/tech-plan`, approved by the owner) | done |

Line numbers are as of 9191edc and each has its anchor; Phase 8 re-searches for every path before editing (WORKITEM-01).

## Edge cases

| Id | Classifier | Condition | Required behaviour | Covered by |
|---|---|---|---|---|
| E1 | WORKITEM-02 | a plan step is `[x]` but its code or test is missing from the tree | the verdict names the file and symbol that proves it, searched this session (`Grep` with `path:line`); a missing one makes the step open | Phases 2-7, `findings.md` per-step table has a "found at" column; Phase 8 scan that no `[x]` row is empty |
| E2 | WORKITEM-02 | a plan's code sits in the working tree of a sibling repo (merc-mud: 15 entries, DSL: 26) and is not committed | the verdict says "working tree only, not committed" and the owner's commit becomes an open item | Phases 3, 5, 6, 7: `git -C <repo> status --short` and `git -C <repo> log --oneline -- <file>` recorded per cited file |
| E3 | WORKITEM-02 | a test count comes from the plan's own text | the count is rerun on the targeted tests and recorded with the date; plan figures are quoted as "recorded by the plan", not as verified | Phases 2-7: commands in the Toolbox; counts in `test-results.md` |
| E4 | - | a rerun fails or flakes (the plans name `ConnectModal-test` and a guard-suite run) | the failure message is kept verbatim in `test-results.md` (no names), the run is repeated once, and the result is reported as a finding; this item never edits code to fix it | Phases 2, 3 |
| E5 | WORKITEM-02 | a step needs a real game session, a device, the Play Console or the hosts file | it is listed as an owner step with the plan's own instruction and is never marked verified by this review | every review phase: the "owner" column of the per-step table |
| E6 | PRIVNAME-01 | a plan or log quotes character names, accounts, emails or tokens; a local test account file exists in another plan folder (git-ignored) | no log line is copied; categories and placeholders only; files matching `*.local.json` are never opened | Phase 8: `Grep` of `findings.md` and `test-results.md` for `@`, IPv4 patterns, `token`, `secret`, `key=` and the repo's private-names check input |
| E7 | WORKITEM-01 | a plan moves | the old path is searched in this repo and every sibling repo before the move and every hit handled in the same step | Phase 8: search before, search after (no hit outside kept historical mentions) |
| E8 | WORKITEM-02 | a move without the owner's word, or in bulk | each move is asked individually (AskUserQuestion) and recorded with the owner's answer | Phase 8 |
| E9 | - | a review run shells through the wrong bash or the qwen container, producing false results (the plans record a WSL-launcher failure and container `node_modules` corruption) | test runs use PowerShell on the host, bounded and in the foreground, filtered output, no process is killed; the shell used is recorded | Toolbox; Phases 2-7 |
| E10 | - | the plan 3 Phase 6b round trip needs an authenticated session | it is listed as an owner action with the exact steps from `tech-plan.md:209` of that plan; this item runs nothing against any account | Phase 4 |
| E11 | - | the four reviewed plans' own classifier rows were not proven | the verdict lists, per reviewed plan, which catalog files it applied and whether `test-results.md` proves each row (EXPO for plan 1, LOCAL, ADMIN, LIVESTRM, TH for plan 2, CLOUDSYNC, SETTINGS, FALLBACK for plan 3) | Phases 2-4 |

Classifiers not applicable: PRIVNAME-01 applies (E6). WORKITEM-01 applies (E7). WORKITEM-02 applies (E1-E3, E5, E8). The other catalog files
(ANSI, AUTOAPPR, LOGTAIL, MAPID, POINTER, ...) describe features this work does not build, so none is a build rule here; where a reviewed plan
applied one, E11 checks the plan's proof of it.

## Verification toolbox

All runs are bounded, in the foreground, on the host, from PowerShell (never the qwen container, never a bare `cd`; each command uses an
absolute path or `--dir`). Output is filtered to the summary lines. Nothing is killed. The first step of Phase 1 runs each command once and
records the working form in `test-results.md`; a command that does not work as written is amended there (plan amendment), not guessed.

- Repo state: `git -C C:/Projects/<repo> status --short` and `git -C C:/Projects/<repo> log --oneline -5 -- <path>` for `ShatteredArchive`, `shatteredarchive-mobile`, `merc-mud`, `DSL`, `DslMapper`, `DslLogViewer`.
- Find the proof: `Grep` for the symbol or file the plan names, with a ranged `Read` (E1).
- game-client / web-server / auth-server tests: `pnpm -C C:/Projects/ShatteredArchive exec jest --config jest.config.cjs --runInBand --testPathPatterns <path>` (game-client's own script is `jest --config ../../jest.config.cjs --runInBand --passWithNoTests --testPathPatterns apps/game-client`; web-server likewise; auth-server uses its own `jest.config.cjs`), then `pnpm -C C:/Projects/ShatteredArchive typecheck` (`tsc -p apps/game-client/tsconfig.json --noEmit`).
- Root guards (plan 2): `pnpm -C C:/Projects/ShatteredArchive test:guards`, `check:manifests`, `check:local-only`, `check:private-names`, `node scripts/generate-simulacrum-admin-commands.mjs --check`.
- Mobile (plan 1): `pnpm --dir C:/Projects/shatteredarchive-mobile/dsl-client exec jest <paths>` and `exec tsc --noEmit`.
- C# (plan 3 server half, DSL): `dotnet test C:/Projects/DSL/Server/Server.Dsl.Tests --filter "FullyQualifiedName~AutoPilot|FullyQualifiedName~NewClasses"`; plan 3 records pre-existing DSL test failures, which are compared, not fixed.
- merc-mud regression check (plan 2 Phase 4a): the plan's `C:/Projects/merc-mud/scripts/gmcp-compose-check/run.mjs` (the folder also holds `test_gmcp.c`); its arguments and whether it needs a running server are read from the file at Phase 3 and recorded (see Risks).
- Reports: `findings.md` section template below; `test-results.md` one block per phase (written by `/implement-plan`).
- Per-step table (used in every review section): `Step | Plan says | Found at (path:line) | Verified by | Open? | Owner step?`

## Phases

### [x] Phase 1 — Method, baseline and the findings skeleton (amended: see A1)
Goal:        `findings.md` exists with one empty section per plan and the shared method, and every verification command is proven to work before a verdict depends on it.
Depends on:  nothing
Changes:
- `findings.md` (new): a header (commit and branch, date, repos' `git status` counts for the six repos), the verdict vocabulary (`Implemented and verified`, `Implemented, owner test open`, `Open work`, `Not started`) and 12 empty sections in this order: SDK 58, Simulacrum, autopilot targets, then the nine closed-incomplete plans in file-name order.
- `test-results.md` (new): Phase 1 block with each Toolbox command run once on a tiny target (one game-client test file, one mobile test file, one `git status`) and the form that worked.
Tests:       None - doc-only. The command proofs are the check (E9): each command's exit status and summary line are recorded.
API check:   none
UI check:    none
Index/docs:  no feature changes. No developer or end-user doc is created: no user-visible effect, the output is a work-item document.
Exit gate:   build OK (not applicable: no code changed; `git status --short` shows only paths under `.ai-plans/proposed/2026-11-18_...` and `docs/standards/edge-cases/`) · typecheck/lint/tests not affected (nothing under `apps/`, `services/` changed) · the toolbox commands recorded · `findings.md` has 12 sections.
State on exit: method and skeleton exist; no verdict yet.

### [x] Phase 2 — Review 1: SDK 52 to SDK 58 upgrade (plan 1)
Goal:        `findings.md` states, step by step, what is implemented and verified for the mobile SDK 58 upgrade and which items are owner tests or owner actions.
Depends on:  Phase 1
Changes:
- `findings.md` section 1: per-step table for Phases 0-8 (`tech-plan.md:124-235`) using `test-results.md` as the claim and the mobile working tree as the proof; the owner list at `test-results.md:223` split into owner tests (device sign-in E5, Doze, push and Firebase E15, voice, Timing Diagnostics E16, iOS build on the Mac) and owner actions (Play Console declaration, the `react-hooks/refs` suppression in `FloatingSpeechStop.tsx`, `Podfile.lock` regeneration, scratch folder removal); the committed state of the mobile work (`git log` shows "bug fixes for post-SDK58 upgrade" and "safety save"); the two modified tracked `fileHashes.lock` fixtures (scope risk 2) with what `git diff --stat` shows.
- `test-results.md` Phase 2 block: `exec jest` over the SDK plan's own test files (`plugins/__tests__/`, `ConnectModal-test`, `FloatingSpeechStop-test`, `connection-service` tests), then the full mobile jest and `tsc --noEmit`, compared with the recorded 891 tests in 69 suites and typecheck exit 0; `pnpm config get minimumReleaseAge` and `nodeLinker` read.
- E11 for plan 1: whether `test-results.md` proves EXPO-01..06 (the catalog file `expo-native-upgrade.md` lists six).
Tests:       None new (read-only). The reruns are the evidence (E3, E4).
API check:   none
UI check:    none (screenshots in `screenshots/showcase/` are listed with their file names and not retaken).
Index/docs:  none; the plan's developer docs are named in `findings.md` and checked to exist (`docs/native-customizations.md`, `docs/run-ios.md` in the mobile repo).
Exit gate:   no code or config changed (`git status` of the mobile repo is identical before and after) · reruns recorded with counts · section 1 complete, ending with a verdict line and the question the owner must answer (Decision 1 of scope.md is already recorded: close with owner items accepted).
State on exit: verdict for plan 1 written; nothing moved yet.

### [x] Phase 3 — Review 2: Simulacrum admin panel (plan 2)
Goal:        `findings.md` states what is implemented and verified for the Simulacrum admin panel and lists the three owner steps and known gaps.
Depends on:  Phase 1
Changes:
- `findings.md` section 2: per-step table for Phases 1-14 (`tech-plan.md:214-417`) and amendments A1-A5 (`tech-plan.md:447-475`); proof by `Grep` for each named module (`features/simulacrumAdmin/`, `components/simulacrumAdmin/`, `components/SimulacrumAdminWindow.tsx`, `scripts/generate-simulacrum-admin-commands.mjs`, `deploy/` vhost, `docs/game/simulacrum-admin.md`, `docs/game/gmcp-parity.md`); owner steps (a), (b), (c) from `test-results.md:166-168` copied as steps with the plan's own wording; the merc-mud and DSL working-tree state for `interp.c`, `gmcp_compose.c/.h`, `copyover.c` and `docs/simulacrum-admin/user-guide.md` (E2); the lint note (46 repository errors in seven files, one fixed) read as recorded.
- `test-results.md` Phase 3 block: game-client tests for `features/simulacrumAdmin`, `components/simulacrumAdmin`, `SimulacrumAdminWindow` and `pnpm test:guards`, `check:manifests`, `check:local-only`, `check:private-names`, the generator `--check`, compared with 3293 tests in 188 suites and 109 guard tests; the merc-mud `gmcp-compose-check` run per the Toolbox, if it runs without starting any server; otherwise recorded as not rerun with the reason.
- E11 for plan 2: LOCAL-01..05, ADMIN-01..03, LIVESTRM-01, TH rows proven in `test-results.md`.
Tests:       None new (read-only).
API check:   none run here (the world vhost needs the owner's hosts-file line, an owner step).
UI check:    none retaken; the seven showcase files are listed and confirmed present.
Index/docs:  none; the developer doc and the user guide are named and checked to exist.
Exit gate:   no code changed in any repo (before/after `git status` identical) · reruns recorded · section 2 complete with verdict.
State on exit: verdict for plan 2 written.

### [x] Phase 4 — Review 3: editable autopilot targets (plan 3)
Goal:        `findings.md` states what is verified for the web half (Phases 1-6), that Phase 6b is open and owner-run, and that Phases 7-11 have not started.
Depends on:  Phase 1
Changes:
- `findings.md` section 3: per-step table for Phases 1-6 (`tech-plan.md:114-191`) and amendments A1-A8 (`tech-plan.md:279-287`); proof by `Grep` for `autoleveling-target-overrides.ts`, `mapsResponsePolicy.ts`, `AutolevelUserRecords.cs`, `useWizardDraft.ts`, `docs/game/autopilot.md`; Phase 6b and 7-11 listed as open with the owner action for 6b copied from `tech-plan.md:209` as numbered steps; the uncommitted state of the plan's own `tech-plan.md` (`git status` shows it modified) noted.
- `test-results.md` Phase 4 block: game-client tests for the autoleveling wizard and `features/autoleveling` files named in the plan, web-server `mapsResponsePolicy` test, and the DSL C# tests `AutoPilot*`/`NewClasses*` with the plan's recorded pre-existing failures compared (E3, E4).
- E11 for plan 3: CLOUDSYNC-01..03, SETTINGS, FALLBACK rows proven in `test-results.md`; Phase 6b is what still proves CLOUDSYNC-02.
Tests:       None new (read-only). No account is read or used (E10, E6).
API check:   none (an authenticated call is Phase 6b, the owner's).
UI check:    none retaken.
Index/docs:  none.
Exit gate:   no code changed · reruns recorded · section 3 complete with verdict "web half implemented; 6b owner-run; mobile phases not started".
State on exit: verdict for plan 3 written.

### [x] Phase 5 — Review 4a: the three autoleveling and movement plans
Goal:        verdicts for `20260909-0739-autoleveling-redesign`, `20260912-1629-autoleveling-combat-rest-tuning` and `20260813-1325-movement-tracking-fix`.
Depends on:  Phase 1; Phase 4's findings on shared autopilot code
Changes:
- `findings.md` sections 4-6: per-step table for each plan (13, 13 and 6 steps); proof by `Grep` for the files named in each step's "Files:" line under `apps/game-client/src/features/autoleveling/`, `components/wizard/`, `features/movement/` and the DSL C# `AutoPilotCache.cs` and area files; the open steps are `[ ] 13` (redesign, `:336`), `[ ] 13` (combat-rest, `:419`) and `[ ] 6` (movement, `:408`), each with its Verify text copied as an owner step (live play-test, recorded clean run) and a check of whether `AutoLevelingModal.tsx` and the `autoleveling.wizard` flag still exist (redesign step 13 asked to retire them); the later work that overlaps these plans (plan 3, proposed `2026-09-12_autoleveling-mobile-port`, proposed `2026-11-18_autopilot-live-test-findings`) listed so a verdict is not given in isolation.
- `test-results.md` Phase 5 block: the autoleveling and movement test files rerun (`movementTracker.test.ts`, the autoleveling suite) and `pnpm typecheck`, with counts.
Tests:       None new (read-only).
API check:   none.
UI check:    none.
Index/docs:  none.
Exit gate:   no code changed · reruns recorded · each of the three sections ends with a verdict and, for any `[ ]` step, a disposition (done and verified by X, or an owner step, or open work).
State on exit: three verdicts written.

### [x] Phase 6 — Review 4b: the two auth rollout plans
Goal:        verdicts for `20260726-1953-centralized-auth-rollout-all-services` (umbrella) and `20260727-1022-auth-rollout-phaseB-csharp-clean-cut`.
Depends on:  Phase 1
Changes:
- `findings.md` sections 7-8: the umbrella's ten steps A-I (`:380-480`): A-D, F, G `[x]`; E (`:417`, mobile, "code complete, device verification pending"), H (`:449`, DslMapper and DslLogViewer dashboards) and I (`:468`, program close-out) open; for H and I check the proposed item `2026-07-28_auth-rollout-phaseH-mapper-logviewer-dashboard` and the sub-plans in `completed/` (`phaseA`, `phaseA2`, `phaseC`, `phaseD`, `mud-builder-phaseG`); proof by `Grep` in `apps/auth-server`, `apps/mud-builder-*`, `shatteredarchive-mobile`, `DslMapper`, `DslLogViewer`; Phase B step 5 (`:191`, docs and bookkeeping): check `docs/auth-server.md` consumer table and `.annotated` files named in it; the three-line note that the Phase B file's "Status: COMPLETE" was set with step 5 unchecked.
- `test-results.md` Phase 6 block: `apps/auth-server` tests (`pnpm --filter @shatteredarchive/auth-server test`), the C# auth tests in `Server.Dsl.Tests` by name filter, and the mobile auth tests; counts recorded.
Tests:       None new (read-only).
API check:   none; the live smoke in step I is an owner step.
UI check:    none.
Index/docs:  none.
Exit gate:   no code changed in any repo · reruns recorded · two verdicts written; E and H and I carry dispositions.
State on exit: two verdicts written.

### [x] Phase 7 — Review 4c: mud-parity, deep-review, sitemaps and the mobile sweep
Goal:        verdicts for `20260723-1145-mud-parity-new-subsystems`, `20260723-1616-deep-review-log-classification`, `20260805-1500-sitemaps-and-seo` and `20261029-1927-mobile-sweep-remainder-and-globals-bucket`.
Depends on:  Phase 1
Changes:
- `findings.md` sections 9-12: mud-parity: step 1 (craft skill, `:62`) was deferred and its subsystem reverted (the log says so), step 6 (`:131`, AI indexes) unchecked: check `merc-mud/2.4/src/.annotated` for the stance, speak and qpoints entries and whether the merc-mud working tree holds them (E2); deep-review: steps 5 and 6 (`:114`, `:126`) never started by the plan's own log; sitemaps: status line says steps 4 and 5 are PARTIAL and Search Console needs the owner's Google account (E5), check `deploy/sitemap.xml` and the SEO tags the log names; mobile sweep: step 8 (`:114`) is a device and real-user verification (owner steps), steps 1-7 `[x]`, check the code the log names and rerun its mobile and web tests.
- `test-results.md` Phase 7 block: the web Globals and unsaved-changes tests and mobile tests the sweep plan names, the sitemap generator test if one exists (searched, recorded), the merc-mud build check only if it needs no running server.
Tests:       None new (read-only).
API check:   none.
UI check:    none.
Index/docs:  none.
Exit gate:   no code changed · reruns recorded · four verdicts; each unchecked step has a disposition.
State on exit: all 12 verdicts written; `findings.md` complete.

### [x] Phase 8 — Owner decisions, moves, reference sweep and close-out
Goal:        the owner has the findings, and each plan they approve is moved with every path to it updated; nothing is moved without their word.
Depends on:  Phases 2-7
Changes:
- `findings.md` summary table at the top: 12 rows (plan, verdict, open items by owner or by code, recommended move) and the open-work list ranked by what the owner must do first.
- For each plan with a recommended move, ask (AskUserQuestion) one question per plan, max 4 per call: "Move <plan> to <destination>?" with the evidence in the question. On yes: (1) search the old path in this repo and in `shatteredarchive-mobile`, `DSL`, `merc-mud`, `Shattered-AI`, `DslMapper`, `DslLogViewer` (E7); (2) move the file or folder (`git mv` if tracked, `mv` if not), set `state:` in `item.md` for a folder; (3) update every hit from the Edit map; (4) search again, only recorded historical mentions may remain; (5) add the progress-log line for plan 1.
- Plan 1: `item.md:6` to `completed`, folder to `.ai-plans-completed/2026-11-01_mobile-expo-sdk-upgrade/`, the progress-log line, `findings.md` records the accepted owner items. It is then ready for `/pr-review` and `/pr-package`; this item does not run them.
- If `closed-incomplete/` is emptied or its meaning changes, `.ai-plans-completed/.ai-context:3` and `docs/claude/work-item-workflow.md:23` are reworded to match; if plans remain there, they are untouched.
- Comment-only edits under `apps/game-client/src/features/movement/` (three files) and two `.annotated` lines happen only if the movement plan moves. The completion gate may flag the change under `apps/game-client/src/`; the final message then carries `OVERRIDE tests: comment-only path update, no behaviour changed` and the same for the other kinds that apply.
- Final scan of `findings.md` and `test-results.md` for Personal and Restricted values and for sizing words (E6).
Tests:       None - doc-only and comment-only; after any comment edit, `pnpm -C C:/Projects/ShatteredArchive typecheck` and the movement test file run once (E3).
API check:   none.
UI check:    none: no user-visible effect, no screenshots.
Index/docs:  `.ai-plans-completed/.ai-context` and `docs/claude/work-item-workflow.md` only under the condition above; the `.annotated` entries for moved plans; `docs/standards/edge-cases/README.md` index row already added. No developer or end-user feature doc: no feature is created or changed.
Exit gate:   typecheck OK and the touched test file passes if any source comment was edited · the old-path search returns no unrecorded hit for every moved plan · `git status` shows only the paths in the Edit map · scans clean · `findings.md` summary table complete · the owner's answer recorded for every move asked.
State on exit: plans the owner approved are filed where they belong; the rest stay in place with their open work listed.

## Risks and rollback

- **Red test found in a reviewed area.** The workflow says a red test at the end of a phase is fixed in that phase; this item changes no code and is not asked to fix defects, so a red result is recorded as a finding and reported to the owner (E4). The application's build state is unchanged by this item, so the critical-failure rule is not triggered; the owner may turn a finding into a new item.
- **Working-tree-only code in merc-mud and DSL.** A verdict that depends on uncommitted work says so (E2); if those trees change between phases, the `git status` baseline from Phase 1 shows the drift.
- **merc-mud regression check command is unconfirmed.** `scripts/gmcp-compose-check` exists but its command was not run or read in this plan; Phase 3 reads it first and skips the run if it needs a server.
- **Mobile `fileHashes.lock` fixtures** are tracked files that change when Gradle runs; the review reports them, it does not decide to untrack them.
- **Moves are reversible**: each move is one `git mv` or `mv` plus the listed reference edits; rollback is the reverse move and `git checkout` of those paths. No data or deployment is involved.
- **Plan-specific deviation:** the classifiers WORKITEM-01 and -02 were added to the catalog in `/tech-plan` itself (owner-approved), the only file written outside the item folder before `/implement-plan` starts.

## Plan amendments

**A1 (2026-11-18, Phase 1, minor):** Phase 1 said the nine closed-incomplete sections are in file-name order; Phases 5-7 group them (4-6 autoleveling and movement, 7-8 auth, 9-12 the rest) and cite those section numbers. The skeleton follows the phase grouping so the numbers match. The git-ignored-file note: `git status` also shows `docs/shattered-maps/world-map-api.md` and two other plan files modified before this item started; they are not touched by it.

## Progress log

- 2026-11-18: plan written; WORKITEM-01 and WORKITEM-02 added to the edge-case catalog.
- 2026-11-18: implementation started; item moved to active/.
- 2026-11-18: Phase 1 done (toolbox commands proven: root jest 10/10, mobile jest 6/6; `findings.md` skeleton with 12 sections and the repo baselines; `test-results.md` started). Deviation: A1.
- 2026-11-18: Phase 2 done (plan 1 verdict: implemented, owner test open; mobile jest 1137/1137, tsc 0, lint 0 errors; new findings: two tracked Gradle fixtures dirty, 11 Expo patch versions behind, `expo install --check` no longer clean).
- 2026-11-18: Phase 3 done (plan 2 verdict: implemented, owner test open; game-client 3467/3467, guards 121/121, merc-mud check passes; open: merc-mud changes uncommitted, owner step (b) real relay session; owner step (a) found already done by a live probe).
- 2026-11-18: Phase 4 done (plan 3 verdict: open work; web half verified and committed, Phase 6b owner-run, mobile phases 7-11 not started; targeted game-client 537/537, web-server 10/10, C# 50/50, live classes endpoint 48 classes).
- 2026-11-18: Phase 5 done (autoleveling-redesign: open work, three dead files still present and no recorded play-test; combat-rest-tuning and movement-tracking-fix: implemented, owner live test open; movement 28/28, autoleveling 255/255).
- 2026-11-18: Phase 6 done (auth umbrella: open work, E device-verification pending, H not started, I not recorded; its "OPEN ITEM" on the architecture flag is resolved by the SDK 58 work. Phase B: implemented and verified, only the step 5 checkbox unticked; auth-server 294/294, mud-builder-server 187/187).
- 2026-11-18: Phase 7 done (mud-parity: implemented and verified, craft dropped by decision, index checkbox only; deep-review: open, steps 5-6 never started; sitemaps: implemented, step-1 unit test missing, steps 4-5 partial, Search Console is the owner's; mobile sweep: implemented, step 8 owner test open). All 12 verdicts written.
- 2026-11-18: Phase 8 done (owner asked per plan: SDK 58 closed and moved, auth Phase B and mud-parity moved to completed/, sitemaps not moved and its remaining work captured as a new item; path sweep clean with one kept historical mention). All phases done; awaiting the owner's sign-off.
