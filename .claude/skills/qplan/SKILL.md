---
name: qplan
description: Create, execute, resume, or hand off shared plan documents (.ai-plans/*.md) that drive multi-step coding work across Claude and the free local qwen agent. Use when a task spans several files/sittings, when asked to plan work, continue/resume/execute a plan, check plan status, or hand work to qwen. Triggers - plan this, make a plan, execute the plan, continue the plan, resume plan, hand off to qwen, .ai-plans, plan document.
---

# qplan — shared plan documents (Claude ⇄ local qwen)

One plan document per task lives at `<repo>/.ai-plans/YYYYMMDD-HHMM-<slug>.md`.
It is the single source of truth: the MCP server's `plan_start`/`plan_step` tools
(qwen via Continue `/plan`) and Claude (this skill) read and write the SAME format,
so work can be handed off in either direction mid-plan. Full design:
`c:/Projects/Shattered-AI/doc/ai-assistant-architecture.md` ("Plan mode").

Division of labor: **Claude plans and does judgment-heavy steps; qwen executes
routine steps for free.** Prefer handing execution to qwen unless steps need
real reasoning or the user wants it done now.

## Format contract (the server parses this — keep it exact)

```markdown
# Plan: <title>

Created: <ISO timestamp> · Workspace: /workspace/<name> · Status: ACTIVE
Task: <one line>

## Goal
<2-3 sentences: end state + how to know it is reached>

## Constraints
<bullets — omit section if none>

## Context
<dense factual bullets, each with a /workspace/... file path (line hints help)>

## Steps
### [ ] 1. <step title>
- Do: <concrete actions>
- Files: /workspace/<name>/<path> ...
- Verify: <how to confirm — a check command, a grep, a behavior>
### [ ] 2. ...

## Progress log

- <ISO timestamp> plan created
```

Hard rules:
- Step headings must match `### [ ] N. Title` exactly (`[x]` when done) — the
  server regex-parses them. No nested steps.
- `Status:` must be `ACTIVE`, `COMPLETE`, or `ABANDONED` — qwen's `plan_step {}`
  auto-attaches the most recent ACTIVE doc, so exactly ONE doc per repo should be
  ACTIVE at a time.
- All paths inside the doc use container form (`/workspace/...`), never `C:\...`,
  so qwen can execute. Mapping:

| Host | Container |
|---|---|
| `C:/Projects/ShatteredArchive` | `/workspace/shattered-archive` |
| `C:/Projects/Shattered-AI` | `/workspace/shattered-ai` |
| `C:/Projects/DSL` | `/workspace/dsl` |
| `C:/Projects/DslMapper` | `/workspace/dsl-mapper` |
| `C:/Projects/DslScripts` | `/workspace/dsl-scripts` |
| `C:/Projects/DslLogViewer` | `/workspace/dsl-log-viewer` |
| `C:/Projects/shatteredarchive-mobile` | `/workspace/shatteredarchive-mobile` |
| `C:/Projects/merc-mud` | `/workspace/merc-mud` |

- Size steps for a 32k-context model: each step independently completable by an
  agent that has read ONLY Goal + Constraints + that step; explicit Files and
  Verify on every step; 2-7 steps (split bigger work into phases/multiple plans).

## Workflows

### Create a plan (default: for qwen to execute, free)
1. Orient cheaply first (`.ai-context`/`.annotated`, or
   `docker exec shattered_mcp node build/cli.js pack "<task>" <container paths>`).
2. Write the doc per the contract, `Status: ACTIVE`.
3. Tell the user: run `/plan resume` in Continue — qwen auto-attaches the doc and
   works it step by step. Nothing else to wire up.

### Execute / continue a plan yourself (agent mode)
1. Find it: Glob `<repo>/.ai-plans/*.md`, pick the one whose header has
   `Status: ACTIVE` (hook context may already name it).
2. Work the FIRST unchecked step only. Map `/workspace/...` → host paths.
3. Verify exactly what the step's `Verify:` line says (qdigest-wrap long output).
4. Flip that step's `[ ]` → `[x]` and append to the Progress log:
   `- <ISO> step N done: <title> — <one line: what actually changed>`
5. Repeat until done or a natural stopping point. All steps checked → set
   `Status: COMPLETE` + log line. Never check off an unverified step; if blocked,
   log `- <ISO> step N blocked: <why>` and leave the box unchecked.

### Abandon
Set `Status: ABANDONED`, append `- <ISO> plan abandoned — <why>`.

### Status
Report every `Status: ACTIVE` doc across the workspace roots above with
`<checked>/<total>` steps and the next unchecked step title.

## Interop notes
- qwen marks steps via `plan_step {"done":true,"notes":...}` — same checkbox +
  log-line edits. Docs qwen created are yours to continue, and vice versa.
- Editing/adding steps mid-plan is fine (the server re-parses every call) — keep
  the heading format and renumber sequentially.
- The active-plan pointer inside the container (`shattered-archive.plan.json`)
  is a convenience cache only; the doc's `Status:` line is authoritative.
