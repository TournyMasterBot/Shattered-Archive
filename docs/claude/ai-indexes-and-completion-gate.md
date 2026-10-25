# AI context indexes and the completion gate

Moved out of the root CLAUDE.md on 2026-10-24 to keep that file short; the text below is unchanged except that references to other sections now name the page they live in. CLAUDE.md keeps the rules most tasks need and points here.

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
