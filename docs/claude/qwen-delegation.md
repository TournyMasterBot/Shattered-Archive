# qwen pre-flight detail and delegating bulk reading

Moved out of the root CLAUDE.md on 2026-10-24 to keep that file short; the text below is unchanged except that references to other sections now name the page they live in. CLAUDE.md keeps the rules most tasks need and points here.

## /qwen pre-flight verification (mandatory when the MCP stack is available)

Before elevating a user request to real work, verify its **checkable claims about the
codebase** against the actual source using the free local qwen model — run the **`/qwen`**
skill (`.claude/skills/qwen/SKILL.md`). This applies to **every prompt** that asserts
something falsifiable about the code (a file/symbol/path exists, "X does Y", a config/flag
value, "handled the same way as Z", "there is no W").

- **If a claim is substantially wrong**, do NOT proceed on it — return it to the user with
  what the code actually shows (`file:line`) and ask them to correct or confirm intent.
- **If the prompt is ambiguous, poorly phrased, or rests on an assumption the code cannot
  reconcile**, prompt the user to refine it (an `AskUserQuestion` either/or) BEFORE acting.
- **Only then** proceed — ideally with the tightened, fact-corrected prompt qwen produced.

The point is to spend free local GPU catching bad premises up front so paid/cloud work
gets the right information the first time and avoids extra round trips.

Scope + gating:
- **Skip** only when the prompt makes no checkable codebase claims (e.g. "continue the
  plan", "make the button blue") — there is nothing to verify.
- **Mechanical verification satisfies this pre-flight — the point is to verify, not to route
  it through qwen specifically.** For code-EXISTENCE / structural claims (a file/symbol/path
  exists, "there is no W", "X is wired the same way as Z"), a direct `Grep` + ranged `Read` IS
  the verification: it is faster and more reliable than qwen and is the preferred tool here (it
  also matches the "verify mechanically, no silent GPU" preference). Reserve `/qwen` for
  SEMANTIC / behavioral claims ("X does Y under condition Z", "this is safe because …") where
  confirming the premise means reasoning across many files. Either way the premise MUST be
  checked before real work — the choice is only which tool, not whether.
- **Prerequisite:** this check requires a reachable `shattered_mcp` container (probe:
  `bash /c/Projects/Shattered-AI/scripts/qdigest.sh --status`). If the MCP stack is down,
  the pre-flight cannot run — proceed with the work normally but tell the user once that
  claim verification was skipped and why. (Unlike qdigest, verification IS the job here, so
  when the stack is up the check is not optional.)

## Delegating bulk reading to local qwen (free)

The `shattered_mcp` container runs a local qwen model with a delegation CLI
(`docker exec shattered_mcp node build/cli.js summarize|purpose|digest|ask|pack ...`).
Local inference is free — use it to keep long raw output out of context:

- **Long command output — reserve qdigest for GENUINELY large output (~150+ lines):**
  full/workspace-wide builds, `docker logs`, big diffs. Compact runs do NOT need the
  wrapper: a single-package `pnpm --filter <pkg> build|test` or any command whose output
  you bound with a trailing `| head`/`| tail`/`| grep` is fine to read directly (the
  qdigest guard now exempts these). For the large cases, run through the wrapper and
  read the distillate:
  ```bash
  bash /c/Projects/Shattered-AI/scripts/qdigest.sh <command...>
  bash /c/Projects/Shattered-AI/scripts/qdigest.sh -p "what failed and why?" pnpm test
  bash /c/Projects/Shattered-AI/scripts/qdigest.sh -f <existing-log-file>
  ```
  Raw output stays at `Shattered-AI/.qdigest/last.out` for drill-down; the wrapped
  command's exit code is preserved. Output under 40 lines is shown raw (no inference).
  Toggle: `qdigest.sh --on|--off|--status` (flag file `.qdigest/disabled`); when
  disabled it passes raw output through unchanged. Full doc:
  `c:\Projects\Shattered-AI\doc\qdigest.md`.
- **Never qdigest a target you're still editing (stale-snapshot trap).** qdigest fits a
  ONE-SHOT large dump you won't invalidate before reading it. Running it in the background
  against a build/test suite while you keep editing means the distillate can reflect a
  PRE-edit snapshot — it bit us 2026-07-11 (it reported an already-fixed test failure, and the
  real answer came from running jest directly). So for **iterative build/test loops, run the
  filtered command DIRECTLY** — `pnpm --filter <pkg> test` (optionally `… 2>&1 | grep -E
  "Tests:|Test Suites:|FAIL"` to bound it) — and read it; reserve qdigest for the ONE final
  full-suite / workspace-wide run you take after the code has stopped moving.
- **If the MCP stack is unavailable** (Docker down, `shattered_mcp` stopped, digest
  call fails): do NOT degrade your own behavior — the wrapper already falls back to
  printing the full raw output with the reason. Read it as you normally would, and
  tell the user once that qwen digestion was skipped and why. The MCP stack is an
  optimizer, never a gate.
- **Multi-file orientation — MANDATORY `pack` first (rule, not a preference):** before
  reading **3+ files** — or 2+ large/unfamiliar ones — to understand a task, you MUST first
  run `docker exec shattered_mcp node build/cli.js pack "<task>" <files...>` (use
  `MSYS_NO_PATHCONV=1`, container `/workspace/...` paths) and read its brief, then open ONLY
  the specific `file:line` regions it points at. For one large/unfamiliar file, `summarize`/
  `purpose`/`ask` it instead of full-reading. Spend the free local GPU, not paid read tokens.
  **Skip only when:** the MCP stack is down (degrade to direct reads and tell the user once);
  the files are tiny or you already know the exact lines; or the task is **edit-heavy** —
  you're going to `Edit` these files, so you'll need their exact current text anyway. For that
  last case, going straight to `Grep` → ranged `Read` is EXPECTED, not a rule violation:
  `pack`-then-re-read-to-edit is usually net-negative (its cold-load latency plus a second read
  of the same lines). `pack` earns its keep on READ-ONLY orientation across code you WON'T
  touch (tracing a flow, "where does X live"); when in doubt on a read-only multi-file sweep,
  `pack` first.
- **Cold-model calls MUST run non-blocking (rule).** A qwen call (`qdigest.sh`, or
  `cli.js pack|ask|summarize|purpose|digest`) can sit SILENT for a minute+ while the model
  cold-loads — that is NOT a hang. Never wait on it in the foreground with a short timeout
  (it reads as "stuck" and gets interrupted). Run it with `run_in_background: true`, or a
  generous `timeout` (≥180000 ms). Qwen is for extraction/summarization, not judgment —
  verify anything decision-critical yourself.
