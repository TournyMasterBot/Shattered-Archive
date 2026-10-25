# Working posture and shell rules

Moved out of the root CLAUDE.md on 2026-10-24 to keep that file short; the text below is unchanged except that references to other sections now name the page they live in. CLAUDE.md keeps the rules most tasks need and points here.

## Default working posture: edit-heavy

Most work here is **edit-heavy** (surgical changes to existing code), not read-heavy
orientation. Default to that posture; the delegation rules in `qwen-delegation.md` (pack/summarize/digest) are
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
- **Refresh the AI indexes after edits** (`.ai-context`/`.annotated`/`@ai-` headers) per
  `ai-indexes-and-completion-gate.md` — that upkeep is part of an edit task, not a separate read task.

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
