---
name: pr-review
description: Review a finished work item's changes before the pull request. Checks every changed file against the coding standards in docs/standards/, runs lint, format, type-check, build, tests and coverage for the touched packages, checks data classification, and confirms every section and checkbox of the GitHub pull request template can be answered with evidence. Writes pr-review.md and ends by offering /pr-package. Triggers - /pr-review, review before PR, is this ready for a PR, check my changes against the standards.
---

# pr-review — is this ready to become a pull request

Shared conventions: `docs/claude/work-item-workflow.md`. Input: an item in `.ai-plans-completed/<slug>/` (argument = slug or fragment; none = list
that folder and ask). With no item (ad-hoc branch work), review the current branch the same way and write the report to
`C:/Projects/ShatteredArchive/.pr-drafts/<branch-slug>/pr-review.md`.

This skill **reports**. It does not edit code; fixes happen only after the user agrees (step 4). Output: `pr-review.md` beside the item.

## 1. Collect

Repo `C:/Projects/ShatteredArchive`, base `origin/release/dev` (else `release/dev`). Use `git -C`; no bare `cd`.

- Changed files: `git diff --name-only <base>...HEAD` plus `git status --porcelain` (the work may not be committed yet). Group by package
  (`apps/<x>`, `services/<x>`, ...) and by language (`.ts/.tsx`, `.scss`, `.mjs/.js`, ...). Skip lockfiles and generated output for the
  standards review but note them.
- The item's `tech-plan.md`, `test-results.md`, `item.md` (data classification), and the diff itself (`git diff <base>...HEAD -- <file>`;
  read the hunks, not only the file names).
- `docs/standards/<language>.md` for each language present, `.github/copilot-instructions.md`, `CLAUDE.md`, `.github/PULL_REQUEST_TEMPLATE.md`
  (read it fresh; do not work from memory).

## 2. Run the checks (touched packages only, output bounded)

| Check | How | Pass means |
|---|---|---|
| Lint | `pnpm exec eslint <changed ts/tsx/js/mjs files>` | no errors; no new warnings in changed lines |
| Format | the package's `format` script if it has one (read it first; if it writes files, use its check mode or inspect the diff it leaves and restore nothing without telling the user); otherwise the editor/eslint rules | no formatting-only diffs left |
| Type-check | `pnpm typecheck` for game-client; the package's own `tsc --noEmit` / script otherwise | clean, or "package has none" stated |
| Build | `pnpm --filter <pkg> run build` per touched package | succeeds |
| Tests | `pnpm --filter <pkg> test` (or the root jest command with `--testPathPatterns`) | all pass, including tests the work did not write |
| Coverage | jest `--coverage --collectCoverageFrom=<changed source files>`; compare the report with the **added lines and branches** in the diff | every added branch and error path executed; no test without assertions, skipped, tautological or log-only |

A check you cannot run is reported as "not run: <why>", never as passing. Compare results with `test-results.md`; a mismatch is a finding.

## 3. Review against the standards

For every changed source file, against its language file in `docs/standards/` and the repo-wide rules:

- Standards decisions (naming, layout, types, errors, async/state, testing) followed; cite `file:line` for each deviation and the rule.
- Repo-wide: explicit types (`any` justified), small diff with no drive-by reformatting, no new dependency without justification, existing
  patterns followed, no telemetry or hidden network calls, no secrets/PII in logs.
- `CLAUDE.md` rules that the diff can break: pnpm only, pinned Docker digests when a Dockerfile changed, workspace/Dockerfile `COPY`
  lists when a project was added or removed, index files (`.ai-context`/`.annotated`) updated for meaningful changes in indexed folders.
- **Edge-case catalog** (`docs/standards/edge-cases/`): select the files whose `applies-when` matches what the diff does (read the diff,
  not the plan's claims), and for every classifier whose *Applies when* is true confirm the change handles it, with evidence: the test,
  API call or showcase/incremental screenshot its *Verify* line names. A classifier the diff triggers but nothing proves is a finding;
  so is a plan edge-case table that skipped it without a reason. Also confirm any classifier added by this work follows the README format,
  has a unique prefix and id, an index row if its file is new, and no Personal or Restricted values. If the review itself surfaces a
  reusable edge case the catalog lacks, list it as a **proposed classifier** in the report; it is created only after the user confirms
  (AskUserQuestion), like everywhere else.
- A language with no standards file, or a file that does not cover a category the diff needs: list it as a finding (the standard is the
  user's to define; do not invent one).
- **Data classification** (`docs/standards/data-classification.md`): scan the diff, the item folder and the screenshots for Personal or
  Restricted values (emails, IPs, tokens, account/character names, log lines with names). Any hit is a blocking finding; do not repeat the
  value in the report (name the file and the category).
- **Documentation:** for each feature the diff creates or changes, `docs/{service}/{feature}.md` exists and matches the code now (read both;
  every command, key, route and path the doc names exists), and end-user documentation exists in the service's help or user-guide area
  and describes the changed behaviour in user terms. A new or changed feature with a missing, stale or developer-jargon-only document is
  a finding; so is a no-user-visible-effect claim that the diff contradicts. This is the evidence for the template's "updated
  documentation" box.
- **Work-item completeness:** all phases `[x]`, `test-results.md` has a block per phase and a Final state block, UI work has showcase
  shots in `screenshots/showcase/` named `showcase_NN_*`, none named `phase-*` there, none named `showcase_*` in `incremental/`.

## 4. Pull request template readiness

Read `.github/PULL_REQUEST_TEMPLATE.md` and go section by section (Summary, Type of Change, Motivation and Context, How Has This Been
Tested, Checklist, Breaking Changes, Additional Notes). For each section and each checkbox write: **Answerable** with the evidence
(file, command result, screenshot), or **Gap** with the one thing that would close it. Examples: "I ran `pnpm test` (including coverage)"
needs a result from this review; "This change does not introduce breaking changes" needs a check of exported APIs, routes, config and
storage keys, schemas and ports in the diff. Nothing is ticked here; this tells `/pr-package` what it can tick.

## 5. Write `pr-review.md`

```
# PR review: <title>
Item: <slug> · Base: <base> · Reviewed: <yyyy-mm-dd> @ <sha> · Verdict: READY | NOT READY

## Check results       table from step 2 (command, result, counts)
## Findings            blocking first; each: file:line · rule/standard · what is wrong · suggested fix
## Standards coverage  language -> standards file used (or MISSING / INCOMPLETE: categories)
## Edge-case coverage   catalog file -> classifier ids triggered by the diff -> proof (test / call / screenshot) or MISSING; classifiers added
## PR template readiness   section/checkbox -> Answerable (evidence) | Gap (what closes it)
## Not run             checks skipped and why
```

Verdict is READY only with no blocking findings, every applicable check run and passing, and no template Gap that review work could close.

## 6. Hand over

- Tell the user the verdict, the blocking findings, and the template gaps. This is a standards/readiness review; for a deeper hunt
  for correctness bugs, `/code-review` is the other tool.
- If NOT READY, ask (AskUserQuestion): "Fix the findings now?" Options: "Yes, fix the blocking ones (Recommended)", "I'll fix them myself".
  After fixes, re-run only the checks that failed and update the report. Fixes keep every phase-style guarantee: build and tests stay green.
- If READY, ask: "Prepare the pull request with /pr-package?" Options: "Yes, package it now (Recommended)", "Not now". On yes, invoke the
  `pr-package` skill with the slug.
