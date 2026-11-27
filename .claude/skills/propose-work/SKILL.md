---
name: propose-work
description: Capture proposed work (a feature, improvement or change that needs doing) as a work item in .ai-plans/proposed/. Records the problem or opportunity, the proposal, who benefits, constraints and known unknowns, without planning or sizing it, then offers to start /scope-work. Use when the user describes work that should be done later or wants an idea written down. Triggers - /propose-work, propose work, we should, add to the backlog, capture this idea, feature request.
---

# propose-work — capture proposed work as a work item

Shared conventions (folders, `item.md` front matter, data classification, how to find an item): `docs/claude/work-item-workflow.md`. Read it
if you have not this session. This skill **captures**; it does not research, design, estimate or plan.

Argument: the proposal in the user's words (optional). Otherwise use what the conversation already says.

## 1. Gather

Fill from the argument and conversation first; ask the user (one short prose message, only what is missing) for the rest.

| Field | Needed |
|---|---|
| Title | one line, the outcome wanted |
| Problem or opportunity | what is wrong or missing today, in the user's terms |
| Proposed work | what they think should be done, as stated; keep their wording |
| Who benefits | players, the owner, a service, other developers |
| Constraints and known unknowns | deadlines, must-not-break areas, questions they already have |
| Related | other items (`.ai-plans/**`), issues, PRs, docs |

Do not add solutions the user did not state. A gap goes under *Known unknowns*, not filled by a guess.

## 2. Check for duplicates (one search)

`Glob` `.ai-plans/{proposed,active}/*/item.md` and read the titles of any that look related; if one overlaps, show it and ask whether to
extend it or create a new item. Reading titles only; no deep reads.

## 3. Scrub

Apply `docs/standards/data-classification.md`: no Personal or Restricted values, placeholders only. Set `data-classification:`
(`internal` when nothing personal is involved).

## 4. Write the item

Slug `yyyy-mm-dd_kebab-title` (today's date, <= 60 chars). Create `C:/Projects/ShatteredArchive/.ai-plans/proposed/<slug>/item.md`:

```
---
type: proposal
title: <title>
slug: <slug>
created: <yyyy-mm-dd>
state: proposed
data-classification: <class>
---

# <title>

## Problem or opportunity
## Proposed work
## Who benefits
## Constraints and known unknowns
## Related
```

No other file.

## 5. Nudge

Say where the item is, then ask (AskUserQuestion): "Scope this proposal now with /scope-work?" Options: "Yes, scope it now (Recommended)",
"Not now, leave it proposed". On yes, invoke the `scope-work` skill with the slug.
