---
name: qdigest
description: Delegate bulk reading to the free local qwen model (shattered_mcp) instead of spending Claude tokens. Use BEFORE running any command expected to produce 150+ lines (builds, tests, docker logs, big diffs), BEFORE reading a large file (40KB+) or several files for one task, or when asked to summarize/digest logs or long output. Triggers - build output, test run, docker logs, long log file, large file, summarize file, multi-file orientation, pack.
---

# qdigest / qwen delegation

Local qwen inference is **free**; paid tokens are for reasoning. Full flow doc:
`c:/Projects/Shattered-AI/doc/qdigest.md`.

Two PreToolUse hooks already enforce this — don't fight them, delegate first:
- `.claude/hooks/qdigest-guard.js` denies unwrapped long-output commands.
- `.claude/hooks/read-pack-guard.js` denies full Reads of files over 40 KB.

## Command output — only when GENUINELY large (~150+ lines)

Reserve qdigest for full/workspace-wide builds, `docker logs`, and big diffs. Compact runs
don't need it and the guard now exempts them: a single-package `pnpm --filter <pkg> build|test`,
or any command whose output you bound with a trailing `| head`/`| tail`/`| grep`, is fine to
read directly.

```bash
bash /c/Projects/Shattered-AI/scripts/qdigest.sh <command> [args...]
bash /c/Projects/Shattered-AI/scripts/qdigest.sh -p "what failed and why?" pnpm test
bash /c/Projects/Shattered-AI/scripts/qdigest.sh bash -c 'cmd1 && cmd2 | cmd3'   # compound commands
bash /c/Projects/Shattered-AI/scripts/qdigest.sh -f <host-path-to-log-file>      # existing file
```

- Exit code of the wrapped command is preserved.
- Raw output is always spooled to `C:/Projects/Shattered-AI/.qdigest/last.out` — drill down there (Grep/Read) when the digest isn't enough; don't re-run the command.
- Output under 40 lines prints raw (no inference call) — over-wrapping costs nothing.
- If Docker/qwen is down, qdigest prints full raw output with a warning: proceed normally, tell the user once. The MCP stack is an optimizer, never a gate.
- Escape hatch when output must be verbatim (exact diff hunks, machine-parsed): append `# qdigest-skip` to the command.

## Large files (40 KB+): don't full-read

Order of preference ("context packs — gzip for prompts", see
`c:/Projects/Shattered-AI/doc/ai-assistant-architecture.md`):

1. **Locate, then read the region**: Grep for the symbol/string, then Read with `offset`+`limit`.
2. **Whole-file question**: `docker exec shattered_mcp node build/cli.js summarize|ask "<q>" /workspace/<repo>/<file>` — or for paths outside the container mounts, `bash /c/Projects/Shattered-AI/scripts/qdigest.sh [-p "<q>"] -f "<host path>"`.
3. **Task across several files**: `cli.js pack "<task>" <container paths...>` — one GPU call replaces N reads; then Read only the file:line regions the pack points at.

Ranged Read (`offset`+`limit`) is the deliberate escape hatch when full content is
genuinely required (wholesale rewrite, exact quoting).

## Multi-file orientation — MANDATORY `pack` first (rule, not a preference)

Before reading **3+ files** (or 2+ large/unfamiliar ones) to understand a task, you MUST
`pack` them first and then open only the `file:line` regions the brief points at. Spend the
free local GPU, not paid read tokens. Skip only when the MCP stack is down (degrade to direct
reads, tell the user once), the files are tiny / you already know the exact lines, or you must
quote/edit verbatim (ranged `Read` then).

```bash
MSYS_NO_PATHCONV=1 docker exec shattered_mcp node build/cli.js pack "<task description>" /workspace/<repo>/<file> [...]
docker exec shattered_mcp node build/cli.js summarize /workspace/<repo>/<file>
docker exec shattered_mcp node build/cli.js purpose /workspace/<repo>/<file>
docker exec shattered_mcp node build/cli.js ask "<question>" /workspace/<repo>/<file>
```

Host → container path mapping (bind mounts):

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

## Rules

- **Cold-model calls MUST be non-blocking (rule):** a cold load sits silent for a minute+ (NOT a hang). Run with `run_in_background: true` or a `timeout` ≥180000 ms — never a short foreground wait (it reads as "stuck" and gets interrupted).
- Qwen does extraction, not judgment: trust it for "what does this say", verify anything decision-critical yourself (open the file / grep the spool).
- Read `.ai-context` / `.annotated` in a directory before opening its code files; open only files you will change or must quote.
