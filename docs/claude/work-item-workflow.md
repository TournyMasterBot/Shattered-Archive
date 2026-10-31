# Work-item workflow

One folder per piece of work, moved as a unit between states. The skills below read and write it; this file is the contract they share.

```
/report-bug  /propose-work  /tech-debt      capture            -> .ai-plans/proposed/<slug>/
/scope-work                                 stakeholder scope  -> scope.md (item stays in proposed/)
/tech-plan                                  phased plan        -> tech-plan.md (item stays in proposed/)
/implement-plan                             build + verify     -> moves to .ai-plans/active/<slug>/ when it starts,
                                                                  to .ai-plans-completed/<slug>/ on user sign-off
/pr-review                                  standards + PR-template check -> pr-review.md
/pr-package                                 PR draft           -> moves the documentation to .pr/<slug>/
```

Every skill ends by offering the next one (AskUserQuestion, "yes / not now"). Declining is fine; the item simply stays where it is.

## Folders

| Path | Holds |
|---|---|
| `.ai-plans/proposed/<slug>/` | captured, and possibly scoped and planned; implementation has not begun |
| `.ai-plans/active/<slug>/` | implementation under way: set by `/implement-plan` when it starts, never earlier |
| `.ai-plans-completed/<slug>/` | signed off by the user, waiting for `/pr-package`. Older flat plans are in `completed/` and `closed-incomplete/` beside it |
| `.pr/<slug>/` | the documentation that ships with the PR |

`<slug>` is `yyyy-mm-dd_kebab-title`, the date being the day the item was captured. It never changes, so the same name follows the item
into `.pr/`. Moving an item = move the whole folder (`git mv` if its files are tracked, plain `mv` if not), then set `state:` in `item.md`.
Nothing outside `.ai-plans*` and `.pr` is created by the workflow skills except the work itself.

## Files in an item folder

| File | Written by | Notes |
|---|---|---|
| `item.md` | capture skills | front matter below + the captured body |
| `scope.md` | `/scope-work` | stakeholder-level scope, no sizing |
| `tech-plan.md` | `/tech-plan` | phases are `### [ ] Phase N — title` headings; `/implement-plan` flips `[ ]` to `[x]` and records drift from the original in `## Plan amendments` (the original text is kept; significant deviations need the user's decision); progress log at the end |
| `test-results.md` | `/implement-plan` | one block per phase: commands, counts, coverage, API calls, screenshots |
| `pr-review.md` | `/pr-review` | verdict table, findings, PR-template readiness |
| `summary.md`, `PR_BODY.md` | `/pr-package` | results, coverage, showcase list; the PR text |
| `screenshots/incremental/phase-NN_<name>.png` | `/implement-plan` | progress shots, **git-ignored** |
| `screenshots/showcase/showcase_NN_<name>.png` | `/implement-plan` (last phase) | final state, **tracked**, shown in the PR |

`item.md` front matter:

```
---
type: bug | proposal | tech-debt | legacy-plan
title: <one line>
slug: yyyy-mm-dd_kebab-title
created: yyyy-mm-dd
state: proposed | active | completed
data-classification: public | internal | personal | restricted | unclassified
---
```

A migrated pre-workflow plan is `type: legacy-plan`: its old plan file is `tech-plan.md` (steps instead of phases) and it has no `scope.md`.

## Rules every skill follows

- **Data classification.** Everything written into an item folder is committed and ends up in a public PR. `docs/standards/data-classification.md`
  decides what may appear: no Personal or Restricted values, only categories and placeholders. Scrub before writing, not after.
- **Edge-case catalog.** `docs/standards/edge-cases/` holds classifiers (one file per feature or technology) for edge cases that
  have bitten or will bite that kind of work. `/tech-plan` applies every relevant classifier and proposes new reusable ones,
  `/implement-plan` proves each and proposes the ones it or the user's sign-off testing uncovers, `/pr-review` checks the diff against
  them. **A new classifier is only written after the user confirms it** (AskUserQuestion); skills propose, the user decides.
- **Sizing is the human's.** No skill estimates hours, days, points, T-shirt sizes or "small/large". Scope documents give a human what
  they need to size: counts, named areas, unknowns, dependencies.
- **Documentation is part of done.** A feature that is created or changed ships with its documentation, in the phase that delivers it:
  the developer angle in `docs/{service}/{feature}.md` (how it is wired and how to use and interact with it from code), and the end-user
  angle in the service's help or user-guide area (what a user sees and does). A feature that exists with no document gets one. Pure
  internal work with no user-visible effect skips only the end-user part, with the reason recorded.
  `{service}` is the product name: the app folder under `apps/` without its `-client` / `-server` suffix, so a client and server pair
  share one folder (`game`, `auth`, `mud-builder`, `scrum-poker`, `soulsteel`, `web`, `psd-viewer`; `simulacrum` and the extensions keep
  their own names). `{feature}` is a kebab-case feature name. The folder's `.ai-context` is updated when a file is added. The
  per-app overview docs that sit directly in `docs/` (`game-client.md`, `web-server.md`, ...) stay as they are.
- **Coding standards.** `docs/standards/<language>.md`, created on demand by `/tech-plan` after asking the user. See `docs/standards/README.md`.
- **Screenshots.** Playwright through `C:/Projects/Shattered-AI/tools/browser-test` against the stack the user already runs; never
  start or stop a dev server or kill a process. Progress shots go to `screenshots/incremental/`; the final-state shots are taken with
  `saveShowcase` (so the completion gate and manifest see them) and copied to `screenshots/showcase/`. Never save a progress shot under
  `showcase_*` or a final shot under `phase-*`.
- **No commits.** The user commits and pushes; skills never do, and never offer to.
- **Finding the item.** An argument is a slug (or any unique fragment of one). With none, list the items in the folder the skill reads
  from and ask which one (AskUserQuestion, max 4 options; more than 4: show the 3 newest plus "other").

## Critical failure

A phase that ends with the application not building, not type-checking, or failing tests is a critical failure of that phase, whoever
broke it. It is fixed before the phase is marked done. If the fix needs a decision, ask; do not close the phase and do not move on.
