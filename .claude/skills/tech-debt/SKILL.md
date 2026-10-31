---
name: tech-debt
description: Capture technical debt as a work item in .ai-plans/proposed/ so it can be investigated later. Records where it is, why it is debt, what it costs or risks, what to investigate and when to revisit, without fixing or sizing it, then offers to start /scope-work. Use when the user (or you, while working) notices a shortcut, duplication, fragile code, outdated pattern or missing test that should not be forgotten. Triggers - /tech-debt, tech debt, note this for later, we should clean this up, TODO that deserves tracking.
---

# tech-debt — capture technical debt for later investigation

Shared conventions (folders, `item.md` front matter, data classification, how to find an item): `docs/claude/work-item-workflow.md`. Read it
if you have not this session. This skill **captures**; it does not refactor, estimate or plan. Fixing the debt belongs to the later steps.

Argument: the debt in the user's words (optional). Otherwise use what the conversation or the code just read already shows.

## 1. Gather

Fill from the argument and conversation first; ask (one short prose message, only what is missing) for the rest.

| Field | Needed |
|---|---|
| Title | one line, what the debt is |
| Where | files or areas with `path:line` anchors (verify each exists now with one `Grep`; do not cite from memory) |
| Why it is debt | the shortcut, duplication, coupling, missing test or outdated pattern, and how it got that way if known |
| Cost today | what it slows down, breaks or makes risky now (observed, not predicted) |
| Risk if left | what gets worse and what would trigger it |
| To investigate | the questions the later scope should answer |
| Revisit when | a trigger (touching that area, a dependency upgrade, an incident), not a date |

If you noticed the debt yourself while doing other work, say so in *Where it was found* and keep it neutral: no blame, no urgency you
did not observe.

## 2. Check for duplicates (one search)

`Glob` `.ai-plans/{proposed,active}/*/item.md` and compare titles. A match: show it and ask whether to add to it (append a dated
section) or create a new item.

## 3. Scrub

Apply `docs/standards/data-classification.md`. Debt in code that handles Personal or Restricted data is described by category and
location only, never with sample values. Set `data-classification:` (`internal` when nothing personal is involved).

## 4. Write the item

Slug `yyyy-mm-dd_kebab-title` (today's date, <= 60 chars). Create `C:/Projects/ShatteredArchive/.ai-plans/proposed/<slug>/item.md`:

```
---
type: tech-debt
title: <title>
slug: <slug>
created: <yyyy-mm-dd>
state: proposed
data-classification: <class>
---

# <title>

## Where                (path:line anchors, verified today)
## Why it is debt
## Cost today
## Risk if left
## To investigate
## Revisit when
## Where it was found   (omit if reported by the user)
```

No other file, and no change to the code the debt is in (a `TODO` comment is not a substitute for the item).

## 5. Nudge

Say where the item is, then ask (AskUserQuestion): "Scope this debt now with /scope-work?" Options: "Not now, leave it proposed
(Recommended when you came here mid-task)", "Yes, scope it now". On yes, invoke the `scope-work` skill with the slug.
