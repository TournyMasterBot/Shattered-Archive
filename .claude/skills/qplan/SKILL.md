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

### Hand off to qwen — PRE-FLIGHT before telling the user to run `/plan resume`
Don't send the user to Continue only to hit "No active plan." `plan_step {}` (bare) scans ALL
`WORKSPACE_DIRS` for `.ai-plans/*.md`, sorts by mtime, and auto-attaches the most-recent doc with
`Status: ACTIVE` — Claude-authored docs included (verified in `mcp-ollama/src/index.ts` ~line 3999),
so NO registration/`plan_start` is needed. But confirm ALL of these first:
1. **`shattered_mcp` is RUNNING** (probe `bash /c/Projects/Shattered-AI/scripts/qdigest.sh --status`).
   A stopped container is THE failure mode — a bare `plan_step` returns "No active plan is running."
2. **Exactly ONE `.ai-plans/*.md` is `Status: ACTIVE`**, and it's the intended one. If several are
   ACTIVE, the most-recently-MODIFIED wins (editing an old doc bumps its mtime and can steal focus) —
   mark stale ones COMPLETE/ABANDONED.
3. **`Status: ACTIVE` sits in the first ~600 bytes** of the doc (the header). The auto-attach only
   reads `head = file.slice(0, 600)`; the format contract's `Created: … · Status: ACTIVE` header line
   satisfies this, so don't bury the status.
4. **The next unchecked step is genuinely (QWEN-SAFE)** — if it's (CLAUDE), qwen will (correctly) STOP;
   reorder so the qwen step is next, or do the CLAUDE step yourself first.
5. **Beware the stale container cache** (bit us 2026-07-09). `/plan resume` in Continue reads the
   in-container active-plan cache (`shattered-archive.plan.json`), NOT a fresh mtime scan. If that
   cache still points at a PRIOR, already-`Status: COMPLETE` plan (e.g. the previous phase's doc),
   `/plan resume` re-attaches THAT, reports "plan complete", and NEVER touches your new ACTIVE doc —
   a silent no-op. Mitigations: prefer telling the user to run a **bare `/plan`** (triggers the
   `plan_step {}` most-recent-ACTIVE auto-attach) rather than `/plan resume`; and **verify what qwen
   reports** — it must name the INTENDED doc/step, not "complete". If it says "complete", assume the
   cache is stale and CHECK the intended step actually landed (files exist) before trusting it.
Only when 1–5 hold, tell the user: run `/plan` in Continue (bare — avoids the stale-resume cache).

### Abandon
Set `Status: ABANDONED`, append `- <ISO> plan abandoned — <why>`.

### Status
Report every `Status: ACTIVE` doc across the workspace roots above with
`<checked>/<total>` steps and the next unchecked step title.

## qwen runs in the container — NEVER let it mutate node_modules

qwen executes inside the `shattered_mcp` container, which bind-mounts the host repos
(incl. `node_modules`) read-write. So a qwen-run `pnpm install` / `pnpm build` / `pnpm
test` on a JS workspace rewrites the SHARED `node_modules` with Linux bin shims + a
container store path, breaking the host's Windows toolchain (`'tsc' is not recognized`)
and forcing a full host reinstall (this happened 2026-07-08).

When authoring plans and Verify steps for qwen:
- Do NOT write a Verify step that has qwen run `pnpm install|build|test` (or any
  `node_modules`-mutating command) in-container. Host-path verify commands
  (`/c/Projects/...`) are unreachable from the container anyway.
- The JS build/test verification is a HOST (Claude/human) task. A QWEN-SAFE step should
  say: transcribe the code + tests, log "transcribed, ready for host verify", and leave
  the box UNCHECKED for the host to run the suite and check off.
- qwen MAY read files to confirm faithful transcription — reading is safe; installing/
  building is not.

## Interop notes
- qwen marks steps via `plan_step {"done":true,"notes":...}` — same checkbox +
  log-line edits. Docs qwen created are yours to continue, and vice versa.
- Editing/adding steps mid-plan is fine (the server re-parses every call) — keep
  the heading format and renumber sequentially.
- The active-plan pointer inside the container (`shattered-archive.plan.json`)
  is a convenience cache only; the doc's `Status:` line is authoritative.
