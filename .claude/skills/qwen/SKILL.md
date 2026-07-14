---
name: qwen
description: Pre-flight a user request by verifying its factual claims/assumptions about the codebase against the ACTUAL source using the free local qwen model (shattered_mcp), BEFORE doing real (cloud) work. Catches wrong file/function/path/behavior claims and ambiguous phrasing so the cloud agent gets correct info the first time and wastes no round trips. Use at the start of any prompt that asserts something checkable about the code. Triggers - /qwen, verify my claims, check before you start, is this right, pre-flight, validate assumptions, "the code does X", "file Y has Z".
---

# qwen — pre-flight claim verification (local, free)

Purpose: **stop wrong premises from reaching the cloud agent.** The user's prompt
often states things about the codebase ("the web client splits on `;`", "there's a
`FooService` in `bar/`", "config X is set to Y"). If any of those is wrong, the cloud
agent burns tokens going down a bad path and needs extra round trips to recover. This
skill spends **free local GPU** (the `shattered_mcp` qwen model) to confirm/refute those
claims against the real source FIRST, and bounces substantially-wrong or ambiguous
prompts back to the user for correction before elevating them.

Local qwen inference is free; that is the whole point — it reads the code so paid tokens
don't. Full delegation surface: see the `qdigest` skill and `c:/Projects/Shattered-AI/doc/qdigest.md`.

## Prerequisite (HARD gate)

This skill **cannot run without** the qwen / MCP stack. First probe reachability:

```bash
bash /c/Projects/Shattered-AI/scripts/qdigest.sh --status
```

- If it reports `shattered_mcp` **reachable** → proceed.
- If **not reachable** (Docker down / container stopped) → **stop**. Tell the user the
  `/qwen` pre-flight is unavailable because `shattered_mcp` is down (offer: start Docker /
  the container, or proceed without verification at their own risk). Do NOT silently fake
  a verification. (Note: this is the ONE place the MCP stack is a gate rather than an
  optimizer — because verification is the skill's entire job.)

## Workflow

### 1. Extract the checkable claims
Read the user's request and list every **falsifiable** statement about the codebase:
file/dir exists, a symbol/function/type exists and does X, a path, a config/flag value,
"handled the same way as Z", version numbers, "there is no Y". Ignore pure preferences,
goals, and opinions — only things the code can confirm or refute.

If the prompt makes **no** checkable claims (e.g. "continue the plan", "make it blue"),
there is nothing to verify — say so and skip straight to the work.

### 2. Locate the relevant files cheaply
For each claim, find the file(s) it refers to (Glob/Grep, or `.ai-context`/`.annotated`).
Map host → container paths for the CLI:

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

### 3. Verify with qwen (free) — batch the claims into ONE call
Give qwen the claims and the source; ask for a per-claim verdict. Attach the files it
needs so it judges against reality, not guesses:

```bash
docker exec shattered_mcp node build/cli.js ask \
  "For each numbered claim, reply VERIFIED / CONTRADICTED / UNSUPPORTED and a <=15-word reason, judging ONLY from the attached files. Claims:
1. <claim>
2. <claim>" \
  /workspace/<repo>/<fileA> /workspace/<repo>/<fileB>
```

- Many files / a fuzzy task → use `pack "<task>" <files...>` instead and read the verdicts
  out of the brief.
- A "does this file even exist / what's in it" claim → `purpose`/`summarize <file>`.
- Cold model = up to a minute of **silence**, not a hang: run in background or with a
  180s+ timeout.
- qwen does extraction, not judgment. For any verdict that would **change what the cloud
  agent does**, confirm it yourself (Grep/Read the exact line) before acting on it —
  don't elevate qwen's word as fact, and don't demote a correct user claim on a fuzzy
  qwen "CONTRADICTED". When qwen and the source disagree, the source wins.

### 4. Classify and respond
- **Substantially incorrect claim** (a wrong premise the task is built on): do NOT elevate
  to cloud work. Return it to the user: what they said, what the code actually shows (with
  `file:line`), and ask them to correct or confirm the intent.
- **Ambiguous / poorly phrased / assumption the code can't reconcile**: ask the user to
  refine the prompt (use `AskUserQuestion` for a concrete either/or) BEFORE proceeding.
- **Verified (or only trivially off)**: proceed. Emit a tightened, corrected prompt —
  claims replaced with the confirmed facts + exact paths — so the cloud agent starts with
  the right premises. Note any minor corrections inline.

### 5. Output
A short **pre-flight report**, then either the blocking question(s) or the cleaned prompt:

```
qwen pre-flight (N claims):
  ✓ <claim> — confirmed (path:line)
  ✗ <claim> — CONTRADICTED: <what the code actually shows> (path:line)
  ? <claim> — ambiguous: <the question>
Verdict: <PROCEED with corrected prompt | RETURN to user for correction>
```

Keep it terse. The goal is fewer, more-accurate cloud round trips — not a wall of text.

## Rules
- Prerequisite is non-negotiable: no reachable `shattered_mcp` → skill does not run.
- Only block on **substantially** wrong claims or genuine ambiguity; don't nitpick a user
  into a corner over cosmetic wording.
- One batched qwen call beats N calls — group claims per file set.
- Verify decision-critical verdicts against the real source yourself; the source is
  authoritative over both the user's claim and qwen's verdict.
- This runs as a Claude rule on claim-bearing prompts (see `CLAUDE.md` → "/qwen pre-flight").
