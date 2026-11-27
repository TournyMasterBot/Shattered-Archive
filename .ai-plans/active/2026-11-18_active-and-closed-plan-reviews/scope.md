# Scope: Review four plan groups (SDK 58 upgrade, Simulacrum admin panel, editable autopilot targets, closed-incomplete plans)

Item: item.md · Type: proposal · Scoped against: performance/Allocation-hunt @ 9191edc · Date: 2026-11-18
Data classification of this work: Restricted, the highest class it can touch (a local test account for plan 3 Phase 6b); everything else is Internal or Public (rules: docs/standards/data-classification.md, DRAFT: the document says "owner to confirm", so it is followed as written)

## What the work is

Four read-and-report reviews of plans that may be done but are not closed out. For each plan the reviewer compares the plan, its
`test-results.md` (or progress log) and the code, and reports what is still open. Plan 1 is to be closed as complete if only testing is
left; plan 4 asks, per plan, whether it belongs in `completed/` instead of `closed-incomplete/`. Sign-off and moves are the owner's.

## Affected areas

| Area | Role in the work | Kind | Evidence |
|---|---|---|---|
| `.ai-plans/active/2026-11-01_mobile-expo-sdk-upgrade/` | Review 1: plan, `test-results.md`, `scope.md`, screenshots | change (report; possible close-out move) | 9 phase headings, all `[x]` (`tech-plan.md:124-235`); `test-results.md` 237 lines |
| `.ai-plans/active/2026-11-07_simulacrum-admin-panel/` | Review 2 | change (report) | 15 phase headings, all `[x]` (`tech-plan.md:214-417`); owner steps listed at `test-results.md:165-169` |
| `.ai-plans/active/2026-11-13_editable-autopilot-targets-synced/` | Review 3 | change (report) | Phases 1-6 `[x]`; 6b and 7-11 `[ ]` (`tech-plan.md:204-258`); 8 amendments A1-A8 (`tech-plan.md:279-287`) |
| `.ai-plans-completed/closed-incomplete/` | Review 4: nine flat plan files | change (report; possible moves to `completed/`) | `ls` shows 9 files; `.ai-plans-completed/.ai-context` defines the folder as "marked COMPLETE with steps never executed" |
| `shatteredarchive-mobile` (sibling repo) | Code and tests for review 1 (and later for plan 3's mobile phases) | read | `git status` shows 2 modified files, both tracked Gradle `fileHashes.lock` files under `dsl-client/plugins/__tests__/fixtures/sdk52|sdk58/.gradle/`; recent commits "bug fixes for post-SDK58 upgrade" and "safety save" |
| `apps/game-client`, `apps/web-server`, `deploy/` (this repo) | Code the Simulacrum, autopilot and several closed-incomplete plans changed | read | Simulacrum `test-results.md:158` reports game-client 3293 tests in 188 suites; autopilot plan A1 names `apps/web-server/src/mapsResponsePolicy.ts` |
| `merc-mud` (sibling repo) | Simulacrum Phase 4a (GMCP parity) and the movement-tracking and mud-parity plans | read | `git status` shows 15 uncommitted entries on `main`; `test-results.md:163` and `:168` name the uncommitted merc-mud files |
| `DSL` (sibling repo) | C# server and the Simulacrum user guide; closed plans for auth Phase B, sitemaps, deep-review, autolevel area content | read | `git status` shows 26 uncommitted entries on `main`; user guide at `DSL/docs/simulacrum-admin/user-guide.md` |
| `DslMapper`, `DslLogViewer` (sibling repos) | Only the closed auth rollout plan's step H names them | read | `closed-incomplete/20260726-1953-...md:449` |
| `docs/claude/work-item-workflow.md`, `.ai-plans-completed/.ai-context` | Contract for moves and for what `closed-incomplete/` means; both may need a line if the folder's contents change | possible change | `work-item-workflow.md:23`; the `.ai-context` text above |

## Stakeholders

- **The owner**: the only one who can sign off, move a plan, or run the steps no agent can (device, Play Console, hosts file, real-game sessions).
- **Players and site users**: affected only through what the plans delivered (autopilot for web and, later, mobile; the Simulacrum is local-only and has no player audience).
- **Mobile users and Play Store**: plan 1's open owner items include a Play Console foreground-service declaration and a physical-device sign-in check (`test-results.md:223`).
- **Ops / deploy**: Simulacrum owner step (a) recreates the nginx container and edits the hosts file (`test-results.md:166`).
- **Other repos' maintainers (the owner, again)**: merc-mud and DSL changes from the Simulacrum plan and several closed plans are uncommitted.
- **Docs**: each plan lists developer and end-user docs; a status change of a plan does not change them, but a reviewer needs them to judge "documented".

## Data touched

| Data | Class | Read/Write/Store/Send/Log | Change in handling |
|---|---|---|---|
| Plan documents, test results, progress logs | Internal | Read; `scope.md`/report files written | none |
| Source code and tests of the reviewed features | Public | Read | none |
| Review output written into item folders | Internal (held to Public/Internal as committed docs) | Write | none |
| A local test account for plan 3 Phase 6b | Restricted (credentials) and Personal if it maps to a real player | Read only if the owner supplies or points to it | none planned; see Risks |
| Game logs or session captures, if a closed plan's verification is re-checked from logs | Personal (character names, accounts) | Read | review output must carry categories only |
| Moving a plan folder or file | Internal | Write (move) | none |

## Inputs for sizing

Countable facts. Not sized: that is for a human.

- Plans under review: 3 active folders + 9 flat files in `closed-incomplete/` = 12.
- Phase headings: SDK 58 plan 9 (9 done); Simulacrum 15 (15 done); autopilot targets 12 (6 done, 6 open: 6b, 7, 8, 9, 10, 11). Command: Grep `^#{2,4} \[[ x~]\] ` on each `tech-plan.md`.
- Documents to read: 12 plan/test-results files for the three active plans (SDK 58: 335 + 237 lines; Simulacrum: 497 + 169; autopilot: 300 + 82), plus scope and item files for each.
- Closed-incomplete plans, by line count: 237, 164, 1306, 389, 223, 671, 523, 947, 139 (total 4,599). Checkbox counts (a `[ ]` heading per step): open steps are 2, 2, 3 (E, H, I), 1, 0, 1, 1, 1, 1 in file order. Command: Grep `\[ \]` over the folder. The auth rollout file also has narrative lines saying E and others stay unchecked.
- Seven of the nine files carry the progress-log line "plan closed by owner request (marked COMPLETE; any unchecked steps were not executed)" dated 2026-10-31; the two auth rollout files (the umbrella and Phase B) do not. Command: Grep `plan closed by owner request` over the folder (7 files).
- Repos read: 5 to 6 (this repo, `shatteredarchive-mobile`, `merc-mud`, `DSL`, plus `DslMapper`/`DslLogViewer` for one auth step). Uncommitted entries found: mobile 2, merc-mud 15, DSL 26.
- Owner-only steps already recorded: SDK 58: 9 named items (`test-results.md:223`); Simulacrum: 3 (a, b, c) plus known gaps (`test-results.md:165-169`); autopilot targets: the whole of Phase 6b (needs a local test account) and the mobile phases.
- Existing tests in the areas: SDK 58 reports 891 tests in 69 suites; Simulacrum 3293 tests in 188 suites plus 109 guard tests; autopilot targets has per-phase counts in `test-results.md`. These are the plans' own recorded figures, not rerun here.
- Documentation per feature: developer docs exist at `docs/game/simulacrum-admin.md`, `docs/game/gmcp-parity.md`, `docs/game/autopilot.md`, and in the mobile repo `docs/native-customizations.md`, `docs/run-ios.md`; the Simulacrum end-user guide is `DSL/docs/simulacrum-admin/user-guide.md`.
- Deploy artifacts touched by a move: none. A move touches only `.ai-plans*` paths and the `state:` line in `item.md`.
- Unknowns and risks: 8 (listed below).

## Dependencies and order

- A review that compares plan to code needs each plan's repo at the state the plan describes: merc-mud and DSL have uncommitted work, so the "code" is the working tree, not a commit.
- Plan 3 cannot be closed or its Phase 6b judged without the owner's local test account or the owner running the round trip (`tech-plan.md:206`, amendment A6).
- Plan 3's mobile phases (7-11) depend on the owner signing off the web half (`tech-plan.md:202`, `:216`); the review can only report them as not started.
- Plan 1 close-out depends on the owner agreeing that the items in `test-results.md:223` are accepted as owner tests or deferred; the plan text says those are "not agent-verifiable here".
- Moving a plan out of `active/` or `closed-incomplete/` follows `docs/claude/work-item-workflow.md:26-27` (move the whole folder, set `state:`); `/implement-plan` step 3 owns the sign-off move.
- Nothing outside this repo blocks the reading; running any of the plans' remaining checks needs the owner's running stack and, for devices, the owner.

## Risks and unknowns

1. **What "complete" means for plan 1.** The item says to close it if "only testing" remains. `test-results.md:223` lists items that are tests (device sign-in, Doze, push, voice) and items that are decisions or actions (Play Console declaration, keep or veto a `react-hooks/refs` suppression, iOS `pod install` and lockfile commit, delete scratch folders). Where the line falls is not decided by the item.
2. **Tracked fixture files modified.** Two Gradle `fileHashes.lock` files under the SDK 52 and SDK 58 plugin test fixtures show as modified in the mobile repo; whether they are meant to be tracked is not determined here (the plan's own checks did not mention it).
3. **Uncommitted sibling work.** merc-mud (15 entries) and DSL (26 entries) have uncommitted changes; the plans' "uncommitted for the owner to commit" statements (`test-results.md:163`, `:168`) cannot be told apart from unrelated changes without reading each diff. A wrong assumption would mark a plan as shipped when its code is not committed.
4. **Plan 3 Phase 6b has no known test account.** The plan says none was available to the agent; a git-ignored local account file exists in another plan folder (`.ai-plans/active/2026-11-05_copilot-.../`, covered by `.gitignore:161`). Whether it may be used for this is the owner's call, and it holds Restricted data that must not appear in any report.
5. **Closed-incomplete plans with real-play steps.** Steps such as the autolevel play-tests, the movement real-play check and the mobile-sweep device check can only be confirmed by the owner or by existing logs; "was tested" may rest on the owner's word or on game logs (Personal data, scrub before quoting).
6. **Auth rollout plan (1,306 lines).** Steps E, H, I are open and the log says E stays unchecked after a device retest. Whether later plans or commits finished them was not traced in this scoping.
7. **Cross-plan overlap.** The two autoleveling closed plans, plan 3, the proposed `2026-09-12_autoleveling-mobile-port`, and the new proposed `2026-11-18_autopilot-live-test-findings` all touch autopilot; a "done" verdict on one may depend on another. Callers and later edits to the same files were not searched.
8. **Test figures are as recorded.** None of the plans' test counts were rerun in this scoping; a review that reruns suites needs the owner's running stack and may hit the intermittent failures the plans mention (`ConnectModal-test`, one guard-suite run).

## Out of scope

- Fixing any defect or finishing any open step the reviews find; that is a separate item per finding.
- Signing off a plan, committing, or pushing (the owner's).
- Running device, Play Console, hosts-file or real-game steps.
- Building the mobile phases (7-11) of plan 3.
- The two other active plans (the Copilot plan and anything else in `active/` not named in the item) and the proposed items.
- Re-grading old plans' quality or rewriting their text.

## Decisions for the human

1. **Where plan 1's line between "testing" and "other" falls.** Options: (a) close it with the owner items listed as accepted owner tests and the Play Console declaration carried to `docs/playstore/remediations.md` (the plan already records it there as Pending); (b) close it only after each item in `test-results.md:223` is run or explicitly waived; (c) report only, and leave it in `active/`. Consequence: (a) makes the active list true now; (b) keeps it open until the owner acts.
2. **How a closed-incomplete plan is judged "tested".** Options: (a) the plan's own progress log and `test-results`-style entries are enough; (b) also confirm the code and its tests still exist in the working tree; (c) also require the owner's word for every step that says it needs a real session. Consequence: stricter options mean more plans stay in `closed-incomplete/` but a "completed" label is trustworthy.
3. **Whether the review may use the local test account for plan 3 Phase 6b.** Options: (a) the owner runs the round trip and reports; (b) the owner points the reviewer to an account to use; (c) the review reports Phase 6b as open and does not run it. Consequence: only (a) and (b) can move the web half toward sign-off.
4. **What happens to the nine files after review.** Options: (a) move each verified plan to `completed/` and leave the rest; (b) move none, only write a findings document; (c) split `closed-incomplete/` into two folders. Consequence: (a) changes paths that `.ai-plans-completed/.ai-context`, `docs/claude/work-item-workflow.md:23` and `.claude/skills/pr-package/SKILL.md` describe, and the folder meaning ("marked COMPLETE with steps never executed") has to be reworded if the folder empties.

## Answers recorded (2026-11-18)

1. Plan 1: close it with the owner items in `test-results.md:223` accepted as owner tests; the Play Console declaration stays recorded as Pending in the mobile docs. The move itself still happens only on the owner's word.
2. Closed-incomplete bar: the plan's own log must show the step was tested, and the code and its tests must still exist in the working tree. Steps that need a real session are listed for the owner.
3. Plan 3 Phase 6b: the owner runs the round trip and reports. No test account is read or used by the reviewer.
4. File moves: a plan reported as implemented and tested moves to `completed/` only on the owner's word for that plan; the rest stay.
