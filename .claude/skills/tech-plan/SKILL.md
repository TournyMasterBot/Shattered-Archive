---
name: tech-plan
description: Turn a scoped work item into a detailed, phased technical plan. Checks coding standards first (creating or extending docs/standards/<language>.md after asking the user), then researches the code deeply and writes tech-plan.md with exact files and line numbers to edit, edge cases (applying the edge-case classifier catalog in docs/standards/edge-cases/ and adding new classifiers to it), and deterministic phases that each end buildable, testable and verified (unit tests, real API calls, Playwright screenshots for UI). Ends by offering /implement-plan. Triggers - /tech-plan, plan the work, technical plan, phase this out, how would we build this.
---

# tech-plan — a plan precise enough to implement without guessing

Shared conventions (folders, front matter, data classification, finding the item): `docs/claude/work-item-workflow.md`. Read it if you have
not this session. Input: an item in `.ai-plans/proposed/<slug>/` (argument = slug or fragment; none = list `proposed/` titles that have a
`scope.md` and ask). Output: `tech-plan.md` in that folder. The item stays in `proposed/`; only `/implement-plan` moves it to `active/`.
Research is read-only; nothing in the code changes in this skill.

Needs `scope.md`. If it is missing, say so and offer `/scope-work` first (AskUserQuestion). Exception: `type: legacy-plan` items already
are a plan; ask whether to rewrite it into phases or leave it alone.

## Rules that never bend

- **Every phase leaves the application buildable and testable.** A phase that ends with a failing build, type-check or test is a
  critical failure (see the workflow doc). Every phase carries the *Exit gate* block below, so this cannot be forgotten.
- **Phases are deterministic and testable**: someone else, given the phase alone, builds the same thing and can prove it works.
- **Plans follow the coding standards** in `docs/standards/` (step 2) and the data-classification rules (no Personal or Restricted values
  in the plan; placeholders and categories).
- **Plans apply the edge-case catalog** in `docs/standards/edge-cases/` (step 4) and add to it; a plan that skips the catalog is incomplete.
- **No sizing.** No hours, days, points or "small/large"; phases are ordered by dependency, not effort.
- Every `path:line` in the plan was read this session and is re-verified at the end (step 6).

## 1. Load

Read `item.md`, `scope.md` (decisions the user recorded there bind this plan), and the scoped commit. Record the current
`git rev-parse --short HEAD`; line numbers in the plan are "as of" that commit, and each carries an **anchor** (the identifier or a short
snippet at that line) so a drifted line is still findable.

## 2. Coding-standards gate (before any deep research)

1. List the source languages of the files the scope says will change: TypeScript/TSX, SCSS, JavaScript/MJS, C#, Python, Kotlin, ...
   Markdown, JSON, YAML and Dockerfiles are not languages here (they follow `CLAUDE.md` and the repo-wide rules).
2. For each language open `docs/standards/<language>.md` (see `docs/standards/README.md`).
3. Decide, from what the plan will do, which **categories** matter (README table): a new React component needs formatting/lint, naming and
   layout, types, async and state, testing; a new endpoint needs types, errors, testing, security-sensitive code; a stylesheet change
   needs formatting/lint and naming. Only those. Do not try to cover every standard.
4. A file is **sufficient** when it states a decision for each category this plan needs. If the file is missing or leaves a needed
   category undecided, **stop and ask the user before researching further**: AskUserQuestion, one question per undecided category (max 4
   per call), each with 2-4 concrete options drawn from what the repo already does (cite 1-2 existing files as the evidence for each
   option; tool-enforced rules come from `eslint.config.mjs` and the package config rather than from a question). Recommend the option
   that matches the dominant existing pattern.
5. Write the answers into `docs/standards/<language>.md` (create it if missing, a few lines per category, with an "Enforced by" line
   naming the tool where one exists). Tell the user which file you created or extended. Never invent a standard the user did not choose.

## 3. Research (deep, targeted)

For every area in `scope.md`, read the real code, not just search hits: the functions to change, their callers, the tests that cover
them, the types they use, how similar features were built. Use ranged `Read`s around anchors; an Explore agent for wide read-only
sweeps. Library behaviour: `lookup_docs`. Game rules: `archive_ask`. Look for:

- the exact edit sites (`path:line`, anchor, what changes there);
- existing patterns to follow (the file you would copy the shape of);
- existing tests and the test command that runs them (read the package's `package.json` scripts and jest config; some packages have no
  `typecheck` or `test` script, which the plan must say and handle);
- API surfaces to exercise for real (route, method, auth needed, how to call it against the running local service);
- UI surfaces to photograph (route or state, viewport, how to reach it, which test account/fixture);
- indexed folders touched (`.ai-context`/`.annotated`) so index updates are planned, not forgotten;
- **documentation**: for every feature the work creates or changes, find the existing developer doc (`docs/{service}/{feature}.md`, `{service}`
  as defined in `docs/claude/work-item-workflow.md`) and the end-user documentation (the service's in-app help, its user guide such as `docs/scrum-poker-user-guide.md`,
  or the related help surface) and read it. Record which exist, which are stale, and which are missing. Where the service has no
  end-user documentation location you can identify, ask the user where it belongs (AskUserQuestion, options drawn from what the repo
  already has) before the plan is written; do not invent one.

## 4. Edge cases: apply the catalog, then grow it

The catalog is `docs/standards/edge-cases/` (format and index in its `README.md`): classifiers per feature or technology, built from
mistakes already made. It guards this plan and every later one.

1. **Select.** Read the catalog index. From the scope's areas and what this plan builds (a themed form, an endpoint, a parser, a storage
   change, a websocket, ...), pick every file whose `applies-when` matches; when unsure, include it. Record the files in the plan header.
2. **Apply.** Walk every classifier in the picked files. If its *Applies when* is true for this work, it becomes a row in the plan's
   edge-case table (classifier id in the **Classifier** column, the condition and required behaviour made specific to this work, and the
   test or verification from its *Verify* line). If it does not apply, give a one-line reason in the plan; silence is not allowed.
3. **Find plan-specific cases.** Add the ones the catalog does not cover, each with an id (E1, E2, ...): empty/null/oversized input,
   ordering and concurrency, retries and partial failure, auth and permission boundaries, backward compatibility of stored data and
   public APIs, migration and rollback, cross-platform paths, per-line/hot-path performance, data-classification effects. Only what is
   relevant.
4. **Propose new classifiers, then confirm before creating any.** For each plan-specific case that would also bite *other* work on the
   same feature or technology (a category of mistake, not a quirk of this change), draft a classifier in the README format: target file
   (existing, or a new file with a proposed unique prefix and index row), the full entry, and Origin = this item's slug. Show the drafts in
   chat, then ask (AskUserQuestion, multiSelect, each option = proposed id and one-line title, max 4 per question, several questions in one
   call if there are more): "Add these to the edge-case catalog?" Nothing is written to `docs/standards/edge-cases/` before the answer.
   Write only the approved ones (the user may reword a draft through "Other"; apply their wording). A case that is not approved stays a
   plan-specific E row (Classifier `-`) and is still tested. Approved ones get the next free id in their file and the table row references
   it; record the added ids in the plan header. No proposals worth making is a fine outcome: say so. Never add one-off cases, and never
   rewrite or renumber existing classifiers (to change one, add a `Retired:` note and propose a new classifier).
5. **Cover everything.** Every edge-case row must map to a test or verification in some phase. A row with no test is a gap in the plan.

## 5. Write `tech-plan.md`

```
# Tech plan: <title>

Item: item.md · Scope: scope.md · Planned against: <branch> @ <sha> · Date: <yyyy-mm-dd>
Standards: <docs/standards/...md files used>  ·  Data classification: <class>
Edge-case catalog: <docs/standards/edge-cases/ files applied>  ·  Classifiers added (user-approved): <ids, or none>

## Goal                  (the outcome, testable in one or two sentences)
## Out of scope
## Standards applied     (per language: the decisions that govern this plan, linked)
## Edit map              table: File | Line(s) | Anchor | Change | Phase
## Edge cases            table: Id | Classifier (catalog id or "-") | Condition | Required behaviour | Covered by (phase, test)
                         plus "Classifiers not applicable": id and the one-line reason for each
## Verification toolbox  the exact commands: build, typecheck, lint, test (per package), coverage, API call, screenshot script
## Phases
### [ ] Phase 1 — <title>
### [ ] Phase 2 — ...
## Risks and rollback
## Plan amendments       empty at creation; /implement-plan adds dated entries A1, A2, ... when the code has moved since this plan
## Progress log
```

Each phase uses this shape, filled in completely:

```
### [ ] Phase N — <title>
Goal:        one sentence; what is true after this phase that was not before
Depends on:  earlier phases / nothing
Changes:     bullet per edit: path:line (anchor) — what changes and why
Tests:       new/updated test files with the cases and what each asserts (concrete observable behaviour, every added branch and
             error path; edge-case ids covered). "None - doc-only" / "None - <trivial reason>" are the only allowed skips.
API check:   (when an endpoint is added or changed) the real request, expected status and body shape, against the running local service
UI check:    (when UI changes) route/state, viewport, the Playwright script, screenshot file phase-NN_<name>.png; the final phase adds the
             showcase set showcase_NN_<name>.png
Index/docs:  .ai-context / .annotated updates, plus the documentation this phase owns, as file paths: the developer doc
             (docs/{service}/{feature}.md: create / update) and the end-user doc (create / update, or "no user-visible effect: reason").
             Documentation lands in the phase that delivers the behaviour, not at the end.
Exit gate:   build OK · typecheck OK · lint OK · all tests of the touched packages pass (not only this phase's) · coverage of new
             code reviewed · API check done · screenshot taken · documentation for the phase's behaviour written or updated. If any test fails at the end of the phase it is fixed now, even
             when the phase did not write it. The app is left buildable and testable.
State on exit: what works now, what does not exist yet (a half-built feature stays behind a flag/unreachable, never half-wired)
```

Phase design rules: smallest slices that each deliver something verifiable; schema/type changes before their users; a refactor
phase changes no behaviour and keeps tests green; the **last phase** runs the full checks for every touched package with coverage,
updates docs and indexes, and (UI) captures the final showcase screenshots. Keep a phase small enough that its exit gate is quick to run.

## 6. Verify the plan, then hand over

1. Re-check every `path:line` and anchor in the Edit map with `Grep`/ranged `Read`; fix drift. Confirm every edge case id appears in a
   phase's Tests or verification, every classifier of every picked catalog file is either a table row or listed as not applicable with a
   reason, every touched package has a test command, every feature the work creates or changes has its developer doc
   (`docs/{service}/`) and end-user doc (or a stated "no user-visible effect") in the Edit map and in the phase that delivers it, and every
   phase has its Exit gate and State on exit.
2. Scan the document for Personal/Restricted values and for sizing words; fix them.
3. Summarise in chat: number of phases with one line each, the standards files used or created, the classifiers the user approved (and
   those they declined), open risks. No sizing.
4. Ask (AskUserQuestion): "Implement the plan now with /implement-plan?" Options: "Yes, start Phase 1 (Recommended)", "Not yet, I want to
   review the plan first". On yes, invoke the `implement-plan` skill with the slug. If not yet, say the item stays in
   `.ai-plans/proposed/<slug>/` with its `scope.md` and `tech-plan.md`.
