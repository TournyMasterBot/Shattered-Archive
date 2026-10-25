# Claude Code — Repository Instructions

Applies to all code generation, suggestions and reviews in this repository. Extends `.github/copilot-instructions.md`
(project structure, branching, coding standards, tests, licensing).

**Sibling project memory.** If the sibling repo is cloned next to this one, read `../Shattered-AI/.memory/README.md`
before any work on the local AI tooling (qwen CLI/MCP, hooks, research harness), on feature-knowledge/standards
tooling, or when asked what that program is trying to achieve. Skip silently if `../Shattered-AI/.memory` does not exist.

The full text of every rule below, with the history and procedures behind it, is in `docs/claude/` (list at the end).
Open the file when the task touches its subject.

---

## /qwen pre-flight verification (mandatory when the MCP stack is available)

Before real work, verify the **checkable claims about the codebase** in the prompt (a file/symbol/path exists, "X does
Y", a flag value, "handled like Z", "there is no W"). Existence/structure claims: a direct `Grep` + ranged `Read` IS the
verification. Behavioral claims across many files: the `/qwen` skill (`.claude/skills/qwen/SKILL.md`).
- A claim that is substantially wrong goes back to the user with what the code shows (`file:line`); do not proceed on it.
- An ambiguous prompt, or one resting on an assumption the code cannot reconcile, gets an `AskUserQuestion` BEFORE acting.
- Skip only when the prompt claims nothing checkable ("continue the plan", "make the button blue").
- Needs a reachable `shattered_mcp` (probe: `bash /c/Projects/Shattered-AI/scripts/qdigest.sh --status`). If it is down,
  proceed and tell the user once that claim verification was skipped and why.

Full rule: `docs/claude/qwen-delegation.md`.

## Packages and dependencies

- **pnpm via Corepack only**, never npm or yarn. The version is `package.json` → `packageManager`. Do not suggest a pnpm
  upgrade without also updating its sha512 and refreshing the lockfiles. Installs in scripts, docs and Dockerfiles pass
  `--frozen-lockfile`.
- Never suggest `--ignore-scripts` globally. A native build dependency goes in BOTH `onlyBuiltDependencies` and
  `allowBuilds` in `pnpm-workspace.yaml`, with a clear justification.
- `minimumReleaseAge: 1440` (MINUTES) in `pnpm-workspace.yaml` is intentional: do not remove or lower it. pnpm reads its
  settings only from `pnpm-workspace.yaml`; check one with `pnpm config get <name>` (`undefined` = not read).
- Dependencies resolve from the npm registry only: no `file:` outside the workspace, `git:`/`github:`/`bitbucket:`,
  direct tarball URLs, or `link:` outside `node_modules`. `workspace:*` is fine. `shamefully-hoist` stays `false`; fix a
  missing declaration in the package's `package.json`.
- Adding or removing a workspace project: update the `package.json` COPY lines in every `deploy/*.Dockerfile` to match
  the `importers:` list of `pnpm-lock.yaml`, or the next image build fails.
- `.ai-rules.md` is the short list the qwen agent loads and must not contradict this file; the pinning, Docker and
  security detectors are in `../Shattered-AI/tools/gates` (`node ../Shattered-AI/tools/gates/run.mjs --repo . --all`).

Version history, upgrade steps, the update check: `docs/claude/dependencies-and-pnpm.md`.

## Docker

- **Always** pin base images with a digest, `image:tag@sha256:<digest>`, in every `FROM` and every third-party compose
  `image:` (locally built images are exempt). Build and runtime stages use the same digest for the same image. Never a
  floating tag (`:latest`, `:alpine`, `:24-alpine`). Put the human-readable version in a comment above `FROM` when the
  tag does not encode it. `npm install -g corepack` in a Dockerfile pins `corepack@<version>`.
- Node stages set `ENV COREPACK_ENABLE_STRICT=1` before `RUN corepack enable`.
- Alpine stages (Node and nginx) make `RUN apk --no-cache upgrade` the first `RUN` after `FROM`.
- Node floor in every repo: 24.22.1 (24 line) or 26.12.1 (26 line), for CVE-2026-111497; 25.x is EOL and unfixed.

Digest update steps and the open-CVE table: `docs/claude/docker-pinning.md`.

## AI context indexes (.ai-context / .annotated / @ai- headers)

Read a directory's `.ai-context` and `.annotated` before its code, as hints: neither complete nor always current, so open
the files you will change or quote. One rule for every writer (Claude, qwen, the generator): an entry records ONLY
context the code cannot tell (a constraint or invariant, a relation to a sibling, why not the obvious alternative, a
gotcha, a change-together pair, where the tests are). Never restate the file or folder name; never replace a
context-bearing entry with something thinner; writing nothing is fine. Session decisions go in the folder's existing
index (`.annotated` for one file, `.ai-context` when it spans files). Formats:
`c:\Projects\Shattered-AI\doc\ai-context-conventions.md`.

## Completion gate (Stop hook, project-level)

`.claude/hooks/completion-gate.js` BLOCKS a turn that leaves changes under `apps/game-client/src/` with: **tests** (logic
changed, no related test touched), **quality** (a test without assertion, tautological, skipped, or only asserting on
logging), **run** (related tests fail), **coverage** (a branch or error path never executed), **index** (meaningful change
in an indexed folder, no index file touched), **ui** (JSX change, no fresh showcase screenshot). Only scripts count.
A test checks concrete, observable behavior and covers every path you added. Do NOT refactor production code to make it
testable: describe the smallest injectable seam and ask (`AskUserQuestion`). Markers in the final message, one per
line: `OVERRIDE <kind>: <specific reason it does not apply>`; for tests/run/coverage `ASK <kind>: <what blocks a
meaningful test | the smallest seam>`. After 3 consecutive blocks the gate releases.

Full rule: `docs/claude/ai-indexes-and-completion-gate.md`.

## Working posture

- **Edit-heavy by default.** `Grep -n` the anchor, ranged `Read` ±~30 lines, `Edit`; full-read only a small file (<~80
  lines). Never re-read a file to verify an edit (a guard denies an unbounded Read of a file you edited). Batch
  independent reads and edits. Keep test output small (`… 2>&1 | grep -E "Tests:|Test Suites:|FAIL|✕"`). Refresh the AI
  indexes after edits.
- **Long output** (~150+ lines, one-shot): `bash /c/Projects/Shattered-AI/scripts/qdigest.sh <command>`. Never qdigest a
  target you are still editing; run iterative build/test loops directly, filtered.
- **Read-only orientation over 3+ files** (or 2+ large ones): `docker exec shattered_mcp node build/cli.js pack "<task>"
  <files...>` first. Not for edit tasks. A cold qwen call runs in the background or with `timeout` ≥ 180000 ms; it is not
  a hang. If the MCP stack is down, read directly and say so once.
- **No bare `cd`** in Bash/PowerShell (a hook denies it): use absolute paths or `bash -c 'cd <dir> && <cmd>'`. A native
  Windows exe given a path as an argument needs the `C:/…` form (or `MSYS_NO_PATHCONV=1`).
- **Game questions** (classes, items, areas, routes, prices, AGL): `archive_ask`, not C# or HTML scraping. **Library
  docs** newer than your training: `lookup_docs` (docs-hub) before writing code. Every tool: `../Shattered-AI/doc/tooling.md`.

## `docs/claude/`

| File | Holds |
|------|-------|
| `dependencies-and-pnpm.md` | pnpm version history and upgrade steps, minimum age, build-script approval, sources, hoisting, update check, rule checks |
| `docker-pinning.md` | digest rules and update steps, corepack/apk in Docker, the known open CVEs table |
| `qwen-delegation.md` | the full pre-flight rule, qdigest / `pack` / non-blocking qwen calls |
| `ai-indexes-and-completion-gate.md` | index rules and enforcement, the gate's kinds, markers and logging |
| `tool-lookup.md` | docs-hub `lookup_docs`, the single tool list, `archive_ask` |
| `working-posture.md` | edit-heavy posture and the shell / path rules, in full |

See `.github/copilot-instructions.md` for full project structure, branching policy, coding standards, test requirements,
and licensing constraints.
