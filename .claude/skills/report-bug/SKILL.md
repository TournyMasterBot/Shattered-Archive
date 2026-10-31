---
name: report-bug
description: Capture a bug report as a work item in .ai-plans/proposed/. Records what happened, what was expected, how to reproduce it, where it was seen and scrubbed evidence, without investigating or fixing it, then offers to start /scope-work. Use when the user reports a bug, a regression, or something broken that should be tracked. Triggers - /report-bug, report a bug, log a bug, this is broken, file a bug.
---

# report-bug — capture a bug as a work item

Shared conventions (folders, `item.md` front matter, data classification, how to find an item): `docs/claude/work-item-workflow.md`. Read it
if you have not this session. This skill **captures**; it does not diagnose, fix, estimate or plan.

Argument: the bug in the user's words (optional). Otherwise use what the conversation already says.

## 1. Gather

Fill these from the argument and conversation first; ask the user (one short prose message listing only what is missing) for the rest.

| Field | Needed |
|---|---|
| Title | one line, what is wrong |
| Actual vs expected | what happens, what should happen |
| Steps to reproduce | numbered; "intermittent / unknown" is an honest answer |
| Where | app or area, and environment (branch, browser/device, local vs deployed) |
| Evidence | error text, log lines, screenshots, links |
| Impact | who or what is affected, how often, workaround if any (the user's words; no severity scoring) |

## 2. Scrub

Apply `docs/standards/data-classification.md` before anything is written: character names, account names, emails, IPs, tokens and
cookie values in logs or screenshots become placeholders or are removed, and the item says what was removed. Set `data-classification:`
to the highest class the *original* evidence had (`internal` when it names nothing personal). A screenshot with Personal data is not saved.

## 3. Light lookup (optional, at most 3 searches)

If the symptom names a feature, one `Grep`/`Glob` to find where it lives is enough to write a **Suspected area (unverified)** line with
paths. No root-causing, no reading big files, no fix. Skip it when the area is already known.

## 4. Write the item

Slug `yyyy-mm-dd_kebab-title` (today's date, <= 60 chars). Create `C:/Projects/ShatteredArchive/.ai-plans/proposed/<slug>/item.md`:

```
---
type: bug
title: <title>
slug: <slug>
created: <yyyy-mm-dd>
state: proposed
data-classification: <class>
---

# <title>

## What happens / what should happen
## Steps to reproduce
## Where
## Evidence            (scrubbed; note what was removed)
## Impact
## Suspected area (unverified)    (omit if none)
```

Save evidence files under `<slug>/evidence/` only if they pass step 2. Do not create any other file.

## 5. Nudge

Say where the item is, then ask (AskUserQuestion): "Scope this bug now with /scope-work?" Options: "Yes, scope it now (Recommended)",
"Not now, leave it proposed". On yes, invoke the `scope-work` skill with the slug.
