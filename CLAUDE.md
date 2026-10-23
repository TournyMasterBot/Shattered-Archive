# Claude Code — Repository Instructions

These instructions apply to all code generation, suggestions, and reviews in this repository.
They extend and are consistent with `.github/copilot-instructions.md`.

**Sibling project memory.** If the sibling repo is cloned next to this one, read
`../Shattered-AI/.memory/README.md` before any work on the local AI tooling (qwen CLI/MCP, hooks, research harness),
on feature-knowledge/standards tooling, or when asked what that program is trying to achieve. It records the mission,
the hard rules, the current state and the decisions. Skip silently if `../Shattered-AI/.memory` does not exist.

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

---

## Package manager

- Always use **pnpm** (never npm or yarn) via **Corepack**.
- The pinned version is in `package.json` → `packageManager` (currently `pnpm@12.9.1`, node `26.10.0`, corepack `0.36.0` in the images).
  - Do not suggest upgrading pnpm without also updating the `packageManager` sha512 hash (the hex of the npm `dist.integrity` value) in every repo that pins it, and refreshing the lockfiles with
    `pnpm install --lockfile-only` (pnpm 12 wants a `packageManagerDependencies` block in the lockfile, otherwise a frozen install fails).
  - Moved from 11.27.1 to **12.9.1** on 2026-10-04 and built and deployed (all 16 stack images, health checked). 11.8.0 has 3 HIGH advisories, fixed from 11.11.0 on (OSV); 12.9.1 has none.
    From pnpm 11.28 a frozen install is refused when the lockfile lists a workspace project whose `package.json` is missing (`ERR_PNPM_OUTDATED_LOCKFILE`), so every `deploy/*.Dockerfile` copies the `package.json` of
    **every** project in `pnpm-lock.yaml` (the block marked "pnpm 11.28+ and 12 refuse a frozen install"). When a workspace project is added or removed, update those lines to match the `importers:` list of
    `pnpm-lock.yaml`, or the next image build fails.
  - A build script that is neither allowed nor declined fails the install (`ERR_PNPM_IGNORED_BUILDS`); decide it in `pnpm-workspace.yaml`.
- When running installs in scripts or docs, always pass `--frozen-lockfile`.
- Never suggest `--ignore-scripts` globally — script approval is managed per-package via
  `onlyBuiltDependencies` and `allowBuilds` in `pnpm-workspace.yaml`.

---

## Dependency security

### Minimum age
`minimumReleaseAge: 1440` (MINUTES = 1 day) is set in `pnpm-workspace.yaml`. This is intentional.
Do not remove or lower it. New package versions must be at least 1 day old before
pnpm will install them, reducing the window for typosquatting attacks.
pnpm 11 reads its settings ONLY from `pnpm-workspace.yaml`: the earlier `minimum-dep-age=86400` line in
`.npmrc` is not a pnpm setting at all and never enforced anything (verified 2026-10-03). Verify a setting
with `pnpm config get <name>`; `undefined` means pnpm is not reading it.

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
`shamefully-hoist` stays at pnpm's default (`false`). Each package must declare all
its own imports. Do not set `shamefully-hoist=true` or `hoist-pattern` overrides
to work around missing declarations — fix the `package.json` instead.

### Periodic update check (low priority, ongoing maintenance)
Pins go stale. Now and then (weekly is plenty) run `node ../Shattered-AI/scripts/update-check.mjs` (when the
sibling repo is present). It lists newer base-image digests, republished tags, npm packages, pnpm and npx-run tools
that are **more than 24 hours old**, and writes a report; it never changes anything. Apply an update as a normal
reviewed change (every `FROM` + its version comment, the Known-CVE table below, then a frozen-lockfile install).
Never auto-update, and never adopt a version younger than 24 hours.

### Mechanical rule checks
`.ai-rules.md` (repo root) is the short rule list the local qwen agent loads; it must not contradict this file. The
detectors for the pinning, Docker and security rules live in `../Shattered-AI/tools/gates`
(`node ../Shattered-AI/tools/gates/run.mjs --repo . --all`). Compose files follow the Docker pinning rule too: a
third-party `image:` is `name:tag@sha256:<digest>` (locally built images are exempt). `npm install -g corepack` in a
Dockerfile must pin `corepack@<version>`.

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

## Known open CVEs (as of 2026-10-04)

| Image | Digest prefix | Alpine layer (OSV, `apk info`) | Status |
|-------|--------------|------------------|--------|
| `node:26.10.0-alpine3.24` | `0b36e8c1` | 0 advisories (18 packages, Alpine 3.24.2) | `apk upgrade` applied at build; the node binary itself is not covered by this check |
| `nginx:1.31.6-alpine3.24` | `df221db8` | 1 advisory: `pcre2 10.48-r0` (ALPINE-CVE-2026-103111, severity not given by OSV); 71 packages, Alpine 3.24.2 | `apk upgrade` applied at build; the nginx binary itself is not covered by this check |

Update this table when new patched images are published.

> **IDE linter counts seen 2026-10-04** (they appeared when `DslLogViewer/Dockerfile` was edited, so the linter works now): `node:26.10.0-alpine3.24` 4 high, 0 critical; `nginx:1.31.6-alpine` 3 high, 0 critical;
> the replaced `node:26.1.0-alpine3.23` had 4 critical and 28 high, and the unpinned `node:22-alpine` of DslScripts 10 high. The high ones are in the node / nginx binaries (no upstream fix yet); the registry digests of both
> new tags were re-read the same day and match the pins.

> **How this was checked (2026-10-04), and what it does not show:** the pins were moved from `node:26.3.1-alpine3.24` / `nginx:1.31.2-alpine3.23` to the rows above (every `FROM` and
> compose `image:` in ShatteredArchive, Shattered-AI and Shattered-Story together). Docker Scout needs a login on this host and the IDE showed no image diagnostics, so the check was:
> list each image's Alpine packages and ask OSV about them. The old images had the same kind of findings plus many more on the nginx image (curl, c-ares). The earlier "1 high" /
> "2 high" counts (2026-06-19) concerned the node and nginx binaries; that part cannot be reproduced here, so re-check it in the IDE (open a Dockerfile) when convenient.
> The nginx image moved from Alpine 3.23 to 3.24 with this bump.

---

## AI context indexes (.ai-context / .annotated / @ai- headers)

Directories in this repo carry AI indexes: `.ai-context` (folder narrative),
`.annotated` (per-file entries), and `AI-ANNOTATION` comment headers
(`@ai-summary`, `@ai-public`, `@ai-deps`, `@ai-notes`) at the top of some code
files. Formats are defined in
`c:\Projects\Shattered-AI\doc\ai-context-conventions.md`.

- **Read them first, as hints.** When starting work in an unfamiliar directory,
  read its `.ai-context` and `.annotated` before opening code files. They are
  neither complete nor always current, so open the files you will change or must quote.
- **One rule for every writer (Claude, qwen, the generator).** An entry records
  ONLY context the code cannot tell: a constraint or invariant, a relation to a
  sibling, why not the obvious alternative, a gotcha, a change-together pair,
  where the tests are. Never restate the file or folder name. Never replace a
  context-bearing entry with something thinner; change one only to ADD
  meaningful new context. Writing nothing is fine, and a folder with nothing to
  say needs no index. Decisions made in a session go in the folder's existing
  index files (`.annotated` for one file, `.ai-context` when it spans files).
- Enforced mechanically: IDX-2 to IDX-6 in `Shattered-AI/tools/gates`, the
  PostToolUse `index-entry-guard` hook, qwen's edit gates, and the completion
  gate below, which asks for the note when a meaningful change lands in an
  indexed folder.

## Completion gate (Stop hook, project-level)

`.claude/hooks/completion-gate.js` runs when a turn ends and BLOCKS it while
this turn's changes under `apps/game-client/src/` leave something undone. It
judges only what this turn changed (`session-baseline.js` keeps the pre-edit
copy). Only scripts count: md, txt, json, css and config never need tests.

- **tests** logic changed and no related test was touched. **quality** a new or
  changed test has no assertion, is a tautology, is skipped/todo, or only
  asserts on logging. **run** the related tests do not pass. **coverage** a
  branch or error path of a changed function is never executed by those tests.
- **index** a meaningful change in a folder that already has an index, and
  neither index file was touched. **ui** a JSX change with no fresh showcase
  screenshot (Shattered-AI `tools/browser-test`, `saveShowcase`).

A test checks concrete, observable behavior and covers every code path you
added; it never asserts on log output unless the code is a logger. Do NOT
refactor production code on your own to make it testable: if a meaningful test
needs a sizeable change (hard-wired clock, network, storage, DOM), describe the
smallest injectable seam and ask the user (AskUserQuestion).

Markers in the final message, one per line: `OVERRIDE <kind>: <specific reason
it does not apply>`, and for tests/run/coverage `ASK <kind>: <what blocks a
meaningful test | the smallest seam>` (resolves the gate while the user
decides). Everything is logged to `.claude/state/gate-log.jsonl` and surfaces in
`/pr-package`. After 3 consecutive blocks the gate releases and logs it.

## Docs lookup (docs-hub MCP server)

`tools/docs-hub` (Shattered-AI) is one lookup tool for library docs and our own service docs, used by Claude Code and the qwen CLI.
`lookup_docs` answers from, in order: our `docs/agent/` pages and recorded corrections (they win and end the search), the installed
package's own docs (the exact version the lockfile pins), then Context7 pinned to that version's tag. It is a lookup, not an injection:
call it when you need it.

- **When:** BEFORE writing code against a library whose installed MAJOR version is newer than your training (`lib_versions` with
  `risky: true` lists them; today that includes jest 30, vite 8, nodemailer 9, dotenv 17, uuid 13), and when unsure how one of our
  own services behaves. The `docs-nudge` hook reminds you when an edit newly imports such a library with no lookup this session.
- **Report bad docs:** if a result was wrong, stale or about the wrong library, call `report_doc_issue` with the right answer. It is
  not served again for that query, and a supplied correction becomes a `docs/agent/corrections/<library>.md` page that outranks
  Context7 (review and commit it). Do not keep looking up a result you already know is bad.
- **Our docs:** pages live in each repo's `docs/agent/` (standard: `Shattered-AI/doc/docs-standard.md`); a page whose source files changed
  after `verified_date` is returned marked STALE. Re-verify it when you touch what it describes.
- **Setup:** the server is registered in the git-ignored, per-machine `.mcp.json`; Claude Code asks you to approve a new project MCP
  server once. The qwen CLI starts it from `servers.config.json`.

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

## Default working posture: edit-heavy

Most work here is **edit-heavy** (surgical changes to existing code), not read-heavy
orientation. Default to that posture; the delegation rules above (pack/summarize/digest) are
for the read-heavy exception — reaching for them on an edit task usually costs more than it
saves. Concretely, by default:

- **Locate, then window — don't full-read to edit.** `Grep -n` the anchor symbol/string, then
  ranged-`Read` a tight window (±~30 lines) and `Edit`. Full-read only a genuinely small file
  (<~80 lines) or when you must follow control flow across the whole file.
- **Never re-read a file to "verify" an Edit/Write.** They error if they didn't apply, and the
  harness tracks the file's current state. A PreToolUse guard (`edit-reread-guard.js`) now DENIES
  an unbounded Read of any file you edited this session — if you truly need a region back (to
  anchor another edit), Read it with explicit `offset`+`limit` (the escape hatch).
- **Batch independent reads/edits.** Issue parallel ranged `Read`s of distinct regions in one
  step; make the independent `Edit`s without round-tripping.
- **Keep test output tiny.** Run the single filtered `pnpm --filter <pkg> test -- <file>` and, on
  a full run, bound it: `… 2>&1 | grep -E "Tests:|Test Suites:|FAIL|✕"`. Read the raw failure only
  when something is red.
- **Refresh the AI indexes after edits** (`.ai-context`/`.annotated`/`@ai-` headers) per the
  section below — that upkeep is part of an edit task, not a separate read task.

## Shell working directory (no bare `cd`)

The Bash and PowerShell tools PERSIST their working directory across calls, so a bare
leading `cd` silently drifts the CWD for every later command — a recurring cause of
"No such file or directory" on paths that actually exist. A PreToolUse hook
(`.claude/hooks/no-cd-guard.js`) denies a command whose first token is `cd`/`Set-Location`.

- Use **absolute paths** in commands (e.g. `ls /c/Projects/ShatteredArchive/apps`), or
- wrap a directory change in a **subshell that does not persist**: `bash -c 'cd <dir> && <cmd>'`.

**Path form for NATIVE Windows exes invoked from Bash.** Git-bash converts a `/c/...` token when
it is the COMMAND, but passes it through verbatim as a string ARGUMENT — so `node -e
'…readFileSync("/c/Projects/…")'` fails with `C:\c\Projects\…` (ENOENT). When a Windows binary
(node.exe, etc.) receives a path as data, give it the **`C:/…` form** (or prefix the call with
`MSYS_NO_PATHCONV=1`). The dedicated Read/Glob/Grep tools take `/c/…` fine — this only bites native
exes reading a path you passed as an argument/string.

## Project overview (supplement)

See `.github/copilot-instructions.md` for full project structure, branching policy,
coding standards, test requirements, and licensing constraints.
