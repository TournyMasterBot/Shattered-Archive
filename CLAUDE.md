# Claude Code — Repository Instructions

These instructions apply to all code generation, suggestions, and reviews in this repository.
They extend and are consistent with `.github/copilot-instructions.md`.

---

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
- **Prerequisite:** this check requires a reachable `shattered_mcp` container (probe:
  `bash /c/Projects/Shattered-AI/scripts/qdigest.sh --status`). If the MCP stack is down,
  the pre-flight cannot run — proceed with the work normally but tell the user once that
  claim verification was skipped and why. (Unlike qdigest, verification IS the job here, so
  when the stack is up the check is not optional.)

---

## Package manager

- Always use **pnpm** (never npm or yarn) via **Corepack**.
- The pinned version is in `package.json` → `packageManager` (currently `pnpm@11.x`).
  - Do not suggest upgrading pnpm without also updating the `packageManager` sha512 hash.
- When running installs in scripts or docs, always pass `--frozen-lockfile`.
- Never suggest `--ignore-scripts` globally — script approval is managed per-package via
  `onlyBuiltDependencies` and `allowBuilds` in `pnpm-workspace.yaml`.

---

## Dependency security

### Minimum age
`minimum-dep-age=86400` is set in `.npmrc` (1 day in seconds). This is intentional.
Do not remove or lower it. New package versions must be at least 1 day old before
pnpm will install them, reducing the window for typosquatting attacks.

### Build script approval
Native packages that need post-install build scripts are allowlisted in
`pnpm-workspace.yaml` under `onlyBuiltDependencies` and `allowBuilds`.
- When adding a new native dependency (one that runs `node-gyp`, `napi-postinstall`,
  or a custom `install` script), add it to **both** lists.
- Do not add packages to these lists without a clear justification.

### No exotic package sources
All dependencies must resolve from the npm registry. Do not introduce:
- `file:` dependencies pointing outside this workspace
- `git:` / `github:` / `bitbucket:` protocol specifiers
- Direct `https://` tarball URLs
- `link:` specifiers pointing outside `node_modules`

Workspace-internal `workspace:*` references are fine.

### Hoisting
`shamefully-hoist=false` is enforced in `.npmrc`. Each package must declare all
its own imports. Do not set `shamefully-hoist=true` or `hoist-pattern` overrides
to work around missing declarations — fix the `package.json` instead.

---

## Docker

### Base image rules
- **Always** pin base images with a digest: `image:tag@sha256:<digest>`.
- Include a comment with the human-readable version above each `FROM` line
  when the tag alone does not encode it (e.g. `# nginx 1.31.0-alpine`).
- **Build and runtime stages must use the same digest** for the same image.
  Never use a floating tag (`:latest`, `:alpine`, `:24-alpine`) in a `FROM`
  without an accompanying `@sha256:` digest.

### Updating digests
When updating a base image:
1. Pull the current multi-arch manifest digest from the Docker Hub registry API
   (or `docker pull` + `docker inspect --format "{{index .RepoDigests 0}}"`).
2. Update **every** `FROM` line that references that image across all Dockerfiles.
3. Update the human-readable version comment.
4. Verify the new digest resolves cleanly and has no known critical CVEs reported
   by the IDE linter before committing.

### corepack / pnpm in Docker
All Node.js stages must set `ENV COREPACK_ENABLE_STRICT=1` before `RUN corepack enable`.
This forces corepack to reject any pnpm version other than the one specified in
`package.json → packageManager`, including the sha512 integrity check.

```dockerfile
ENV COREPACK_ENABLE_STRICT=1
RUN corepack enable
```

### Alpine package patching
All Alpine-based stages (Node and nginx) must include `RUN apk --no-cache upgrade`
as the first `RUN` after the `FROM`. This patches Alpine-level CVEs that are fixed
in the package index but not yet baked into the upstream image layer.

> Note: `apk upgrade` cannot fix CVEs in the nginx or node binaries themselves.
> For those, the only fix is a new upstream image release. Monitor CVE reports and
> update the pinned digest when a patched upstream image is published.

---

## Known open CVEs (as of 2026-06-19)

| Image | Digest prefix | CVEs | Status |
|-------|--------------|------|--------|
| `node:26.3.1-alpine3.24` | `a2dc166a` | 1 high | No upstream fix yet; `apk upgrade` applied |
| `nginx:1.31.2-alpine3.23` | `81595dd7` | 2 high | No upstream fix yet; `apk upgrade` applied |

Update this table when new patched images are published.

---

## AI context indexes (.ai-context / .annotated / @ai- headers)

Directories in this repo carry generated AI indexes: `.ai-context` (folder
narrative), `.annotated` (per-file one-line purposes), and `AI-ANNOTATION`
comment headers (`@ai-summary`, `@ai-public`, `@ai-deps`, `@ai-notes`) at the
top of some code files. Formats are defined in
`c:\Projects\Shattered-AI\doc\ai-context-conventions.md`.

- **Read them first.** When starting work in an unfamiliar directory, read its
  `.ai-context` and `.annotated` before opening code files, and trust them for
  orientation — open only the files you will change or must quote.
- **Keep them fresh.** After creating or removing files in a directory, refresh
  that folder's `.annotated` and `.ai-context`. After substantive edits to a
  code file, update its one-liner in `.annotated` and its `@ai-` header block
  if it has one. (Edits made through the qwen MCP server refresh directory
  indexes automatically; edits made directly on the host — i.e. by Claude — do
  not, so update them yourself.)
- Don't pad indexes with obvious entries, and preserve hand-written nuance when
  refreshing — update entries in place rather than regenerating wholesale.

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
  the files are tiny or you already know the exact lines; or you must quote/edit verbatim
  (then ranged `Read` the region). When in doubt on a multi-file task, `pack` first.
- **Cold-model calls MUST run non-blocking (rule).** A qwen call (`qdigest.sh`, or
  `cli.js pack|ask|summarize|purpose|digest`) can sit SILENT for a minute+ while the model
  cold-loads — that is NOT a hang. Never wait on it in the foreground with a short timeout
  (it reads as "stuck" and gets interrupted). Run it with `run_in_background: true`, or a
  generous `timeout` (≥180000 ms). Qwen is for extraction/summarization, not judgment —
  verify anything decision-critical yourself.

## Shell working directory (no bare `cd`)

The Bash and PowerShell tools PERSIST their working directory across calls, so a bare
leading `cd` silently drifts the CWD for every later command — a recurring cause of
"No such file or directory" on paths that actually exist. A PreToolUse hook
(`.claude/hooks/no-cd-guard.js`) denies a command whose first token is `cd`/`Set-Location`.

- Use **absolute paths** in commands (e.g. `ls /c/Projects/ShatteredArchive/apps`), or
- wrap a directory change in a **subshell that does not persist**: `bash -c 'cd <dir> && <cmd>'`.

## Project overview (supplement)

See `.github/copilot-instructions.md` for full project structure, branching policy,
coding standards, test requirements, and licensing constraints.
