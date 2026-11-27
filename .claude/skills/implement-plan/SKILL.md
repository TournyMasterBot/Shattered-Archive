---
name: implement-plan
description: Implement a tech-plan phase by phase. Moves the item from proposed to active when it starts. For each phase it writes the code, writes and runs the tests, calls real API endpoints, takes Playwright screenshots for UI (incremental progress shots versus final showcase shots), proves the build and tests are green before moving on, and records results. When the last phase is done it asks the user to sign off after their own testing, then moves the item to .ai-plans-completed and offers /pr-review. Triggers - /implement-plan, implement the plan, build it, start phase 1, continue the plan.
---

# implement-plan — phases become tested code

Shared conventions (folders, front matter, data classification, screenshots, critical failure): `docs/claude/work-item-workflow.md`. Read it
if you have not this session. Input: an item with a `tech-plan.md` in `.ai-plans/proposed/<slug>/` (to start) or `.ai-plans/active/<slug>/`
(to resume) (argument = slug or fragment; none = list items in both folders that have a tech-plan and ask). Without a tech-plan, offer
`/tech-plan` and stop.

The plan is the contract: do what each phase says. If the files changed since the plan was written, or the code disagrees with it,
re-confirm the plan against the current code and its wider impact before editing (step 1), keep the original and record every change
as a plan amendment (step 2). Minor drift is amended and logged; anything that changes behaviour, scope, contracts or the phase
structure needs the user's decision first.

## Rules that never bend

- **Every phase ends green**: build, type-check, lint and the tests of every touched package pass. A failing test at the end of a phase is
  fixed **now**, even if the phase did not write it and even if it looks unrelated. If fixing it needs a decision or is out of proportion,
  ask (AskUserQuestion); the phase stays open until it is green. Leaving the application unbuildable or its tests red is a critical failure.
- **Every phase is verified for real**: tests that run, API endpoints that are actually called, UI that is actually photographed.
  Tests may be skipped only for **doc-only** changes or changes of **trivial consequence** (for example the text of a debug log line).
  State which, and why, in `test-results.md`; "hard to test" is not a reason (describe the smallest injectable seam and ask instead of
  refactoring production code on your own).
- **Tests check concrete, observable behaviour** and cover every branch and error path you added (see `.github/copilot-instructions.md`
  "Tests and coverage"). No tautological, skipped, snapshot-only or log-asserting tests.
- Follow `docs/standards/<language>.md` for the languages touched and the patterns of the surrounding code. Small diffs, no drive-by edits.
- **Edge cases are proven, not assumed.** Every row of the plan's edge-case table, catalog classifiers included (`docs/standards/edge-cases/`),
  is exercised by the test, API call or screenshot its *Verify* line names, in the phase that owns it. A classifier is not "covered" because
  the code looks right.
- **The checklist is the status.** Tick each Work box in `tech-plan.md` the moment its step is finished, the phase's sign-off box only after the
  exit gate ran green, then the heading box. A step you cannot complete stays unticked with a `deferred: <why, who it waits on>` note and an
  amendment or later phase that owns it. Never tick a box for work that was not run, and never leave a finished step unticked.
- Never commit or push. Never start, stop or kill a dev server or other process; use the stack the user runs (if it is not up, tell the
  user the one thing that needs to run and wait). Keep command output bounded (`| tail -n 40`, `grep`); no bare `cd` (use absolute paths
  or `pnpm --filter <pkg>`).
- Personal and Restricted values never go into `test-results.md`, screenshots or the plan (`docs/standards/data-classification.md`):
  scrub API responses and use test accounts and fake characters.
- **Documentation is proven by `node scripts/check-doc-impact.mjs <item folder>`, never by a list written from memory.** Run it in step 7 of each
  phase that changes behaviour and again before the sign-off question; it must report nothing unresolved (rule and procedure: `docs/claude/work-item-workflow.md`).

## 0. Start and baseline (once, before Phase 1)

0. **Activate.** If the item is in `.ai-plans/proposed/`, this is the moment work begins: move the whole folder to
   `.ai-plans/active/<slug>/` (`git mv` if tracked, else `mv`), set `state: active` in `item.md`, and add a dated line to the
   progress log. Scoping and planning never move an item; this skill does. Resuming an item already in `active/` skips this.
1. Note `git status --short` so you can tell your changes from the user's.
2. Run the plan's *Verification toolbox* commands for every touched package and record the result as **Baseline** in `test-results.md`.
   If the baseline is red, tell the user which tests fail and ask: fix them first (recommended, as Phase 0 in the plan) or stop. Do not
   start Phase 1 on a red baseline.
3. Create `screenshots/incremental/` and `screenshots/showcase/` in the item folder if the plan has UI checks.

## 1. For each phase with an unticked box, in order

1. **Re-read the phase and check the plan still fits the code.** Re-verify its anchors (`Grep` the anchor, ranged `Read` around it).
   Then find what changed since the plan: `git -C C:/Projects/ShatteredArchive diff --stat <planned sha>..HEAD -- <the phase's files>`
   (the sha is in the plan header) plus `git status --short` for uncommitted edits, including edits made by earlier phases and by the user
   between sessions. For every phase file that changed, re-confirm the plan against the current code:
   - do the planned edit sites, the approach and the phase's tests still hold;
   - **wider impact:** do new or changed callers, consumers, tests, types, routes, storage keys, config or other packages now depend on
     what this phase changes (re-run the callers/consumers search from the plan, do not trust the old result)? Are any edge-case rows or
     catalog classifiers newly triggered or no longer relevant?
2. **Reconcile, then implement.** Keep the original plan text and amend around it. For each finding, add a dated entry under a
   `## Plan amendments` section in `tech-plan.md` (create it above the progress log if the plan has none, e.g. a legacy plan) (phase, original plan, what changed, why, wider impact) and mark the affected Edit-map
   row or phase bullet `amended: see A<n>`; never delete or silently rewrite the original. Then sort each finding:
   - **Minor** (drifted line numbers, renamed anchors, an extra call site of the same kind, an added test case): amend and continue;
     log it in the progress log.
   - **Significant** (stop and ask the user with AskUserQuestion before changing anything): the approach or behaviour differs from the
     plan; files, packages or repos outside the Edit map must change; an API, schema, storage key or config contract changes; a new
     dependency is needed; a phase must be added, removed, reordered or split; an edge case or classifier turns out wrong or
     unprovable; or the goal can no longer be met as written. Present the finding, the options and the effect on later phases, record the
     decision in the amendment (`approved by user <date>`), and only then continue.
   Then **implement** the Work steps as amended, ticking each Work box the moment its step is finished (not in a batch at the end). Keep a list of files you touched, and compare it with the Edit map: a file you touched
   that is not in the plan (or amended into it) is a deviation to explain in the amendment.
3. **Tests.** Write/update the tests the phase lists, then run them (`pnpm --filter <pkg> test` or the plan's command) and confirm they
   fail without the change when that is cheap to check, and pass with it.
4. **API check** (phase lists one): call the real endpoint on the running local service with the exact request from the plan; record the
   request, status and a scrubbed body shape. A mock is not an API check. If the service needs rebuilding or restarting for your change to
   be live, say so and wait for the user, or use the repo's own documented deploy script; do not improvise process control.
5. **UI check** (phase lists one): run a Playwright script from `C:/Projects/Shattered-AI/tools/browser-test` against the running stack and
   save the shot to `<item>/screenshots/incremental/phase-NN_<name>.png`. **Open the image and look at it**; if it does not show the
   expected state, the phase is not done. Arrange the shot so each classifier owned by the phase is visible in it (for example enough
   content to show the scrollbar, an open select popup, each state), and check those things specifically, not just the general look.
   Use the same arrangement for the final showcase shots.
6. **Edge cases found along the way.** If you hit one the plan does not list (a test fails for an unexpected reason, a screenshot shows
   something wrong, a caller behaves differently than assumed), add a row to the plan's edge-case table with a test. If it is a
   category of mistake that would bite other work on the same feature or technology, **propose** a classifier (README format, target
   file, Origin = this item's slug) and ask the user to confirm (AskUserQuestion, multiSelect, "Add to the edge-case catalog?")
   before writing anything to `docs/standards/edge-cases/`; collect proposals at the end of the phase to ask once, not mid-edit. Write
   only approved ones; an unapproved case stays a tested plan row. Log in the progress log what was proposed, approved and declined.
7. **Indexes and documentation** the phase owns. Documentation ships in the same phase as the behaviour it describes, never deferred:
   - **Indexes:** update `.ai-context`/`.annotated` entries for the folders touched, keeping to the index rule in `CLAUDE.md`.
   - **Developer documentation, `docs/{service}/{feature}.md`** (`{service}` = the product name, the `apps/` folder without
     `-client`/`-server`; see `docs/claude/work-item-workflow.md`) (the developer angle: what the feature is, how it is wired, the files and
     flows, how to use and interact with it from code, config keys, events and routes, gotchas, where the tests are). A new feature gets
     a new file, written in the style of the existing ones (for example `docs/game/user-account.md`); a changed feature gets its file
     updated so it matches the code as it now is; a feature that already exists with no file gets one created now, specifying the feature
     as it behaves today. Update `docs/{service}/.ai-context` when a file is added.
   - **End-user documentation**, in the end-user area the plan names for that service (its in-app help, the service's user guide such as
     `docs/scrum-poker-user-guide.md`, or the related help surface): what a user sees and does, in user terms, with no implementation
     detail. New or changed user-visible behaviour (menus, commands, settings, screens, workflows) updates it; a missing guide for an
     existing feature is created. If the plan did not name a location, ask the user where it belongs (AskUserQuestion) before writing.
     "No end-user documentation needed" is acceptable only for work with no user-visible effect, with the reason in `test-results.md`.
   - Documentation follows `docs/standards/data-classification.md` (placeholders, no real names, accounts or logs) and is checked against
     the code you wrote: every command, key, route and path it mentions exists.
   - **Documentation impact (mechanical).** Run `node scripts/check-doc-impact.mjs <item folder>`. For each DOC finding (a doc that names a file you
     changed) open it and either update it or record `checked, still accurate: <reason>` with its path in `test-results.md`; for each INDEX finding
     update that folder's `.annotated` / `.ai-context` (only context the code cannot tell) or record why nothing needs saying. Include the tooling
     folders (`.claude/`, `scripts/`, CI) and `CLAUDE.md` / `docs/claude/*` when the phase changes hooks, scripts, workflows or rules.
8. **Exit gate** for the touched packages: build, `typecheck` (root script covers game-client only; for other packages run their own
   `tsc`/script, and say when a package has none), `pnpm exec eslint <changed files>`, the full test suite of each touched package, and
   coverage of the new code (`pnpm --filter <pkg> exec jest --coverage --collectCoverageFrom=<changed files>` or the plan's command;
   every added branch and error path executed). Fix anything red before continuing.
   For a phase whose `Workflow:` line names W-ids, run the flow and check the plan's **After** diagram against what you built; if it differs, amend
   the plan (A<n>) and correct the diagram (keep the original wording in the amendment).
9. **Record.** Append to `test-results.md`:
   ```
   ## Phase N — <title> (<yyyy-mm-dd>)
   Commands: <exact commands>   Results: build OK · typecheck OK · lint OK · tests <passed>/<total> · coverage <files: stmts/branches/lines>
   Tests added/updated: <files, cases>      Edge cases covered: <E-ids and classifier ids, each with how it was proven>
   Classifiers proposed / approved and added / declined: <ids>   (or "none")
   API: <request -> status, body shape>      (or "none in this phase")
   Incremental screenshots: <phase-NN_name.png ...>      (or "none")
   Docs: <developer doc paths created/updated> · <end-user doc paths created/updated> · <or "no end-user effect: reason">
   Skipped verification: <doc-only | trivial: reason>    (or "none")
   ```
   Tick the phase's **sign-off box** in `tech-plan.md` with the date (only after the gate of step 8 ran green), then its heading box, and add a dated progress-log line saying what was done and anything that
   deviated from the plan. Then move to the next phase without asking, unless something needs a decision.

## 2. Last phase: final state

In the last phase, after the exit gate passes for every touched package:

- **Showcase screenshots** (UI work): capture the finished feature with `saveShowcase(page, "<slug>", "NN-<name>", { description })`
  from `lib/showcase.mjs` (the completion gate and manifest rely on it), then copy each file to
  `<item>/screenshots/showcase/showcase_NN_<name>.png`. Look at each. They are clean, deliberate and show the finished state; they are
  **not** the progress shots.
- In `test-results.md` add a final block with two clearly separate lists: **Incremental screenshots (progress, git-ignored)** and
  **Final showcase screenshots (shipped with the PR)**. Check that no `phase-*` file sits in `showcase/` and no `showcase_*` file in
  `incremental/`.
- Add a **Final state** block: full build/typecheck/lint/test results with coverage for every touched package, and the list of files changed.
- **Workflow diagrams into the docs:** copy each W-id's After diagram (corrected to the built behaviour) into the feature's developer doc
  (`docs/{service}/{feature}.md`), so the next change starts from a true Before.
- **Documentation sweep:** list every feature the work created or changed and confirm each has an up-to-date `docs/{service}/` file and,
  where users are affected, end-user documentation. A feature with a missing or stale document is not finished; fix it here. Do not write this list from memory: run
  `node scripts/check-doc-impact.mjs <item folder>`, resolve every finding, and put its summary line in the Final state block. Also verify the
  backticked file names and identifiers of each doc you changed against the code (a doc that names something that no longer exists is stale).

## 3. Plan complete: sign-off

**Gate before asking:** `node scripts/check-doc-impact.mjs <item folder>` reports 0 unresolved, and the full test suites of every touched package ran
through their package scripts (never a bare `jest`, see `docs/claude/working-posture.md`). If either is not true, fix it first; the owner should not be asked to
test work whose documentation is incomplete.

Tell the user the plan is complete, what was verified, and where the screenshots are. Ask (AskUserQuestion): "Please test it yourself.
Do you sign off on the plan?" Options: "Signed off", "I found problems (I'll describe them)", "Not testing yet".

- **Problems:** add the fixes as new phases at the end of `tech-plan.md` (same shape, same exit gate) and continue from step 1. For
  each problem, decide whether it is a missed edge case: did the plan or the catalog fail to anticipate a category of mistake (the
  dark form whose scrollbar stayed light)? If so, **propose** a classifier for it and ask the user to confirm as in step 6 before
  adding it to `docs/standards/edge-cases/`, with this item as Origin. The user finding something wrong is the strongest signal the
  catalog is missing an entry.
- **Not yet:** stop; the item stays in `active/`.
- **Signed off:** tick the boxes of `## Plan sign-off`, write `Signed off by the user on <yyyy-mm-dd>` in the progress log, set `state: completed` in `item.md`, and move the
  whole folder to `C:/Projects/ShatteredArchive/.ai-plans-completed/<slug>/` (`git mv` if tracked, else `mv`). Then ask: "Review the
  changes with /pr-review?" Options: "Yes, review now (Recommended)", "Not now". On yes, invoke the `pr-review` skill with the slug.
