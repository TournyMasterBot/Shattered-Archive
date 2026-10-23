---
name: pr-package
description: Package the current work into a pull request draft. Collects branch, commits, changed files, tests, completion-gate overrides, index decisions and showcase screenshots, fills .github/PULL_REQUEST_TEMPLATE.md with only the boxes the evidence supports, and stages the screenshots for attaching. Never creates or pushes a PR unless explicitly asked.
---

# pr-package — turn the work into a traceable PR draft

Output: `C:/Projects/ShatteredArchive/.pr-drafts/<branch-slug>/PR_BODY.md` plus `screenshots/` (renamed, ordered). The reader is a **reviewer**
of the pull request, so write the body for them (what changed, why, how it was verified), not for the person running the skill.
Start your final message with one line naming that audience ("Written for: reviewers of the PR"), then say what is ticked, what is not, and what the user must still do.

**Rules that never bend**
- Every ticked checkbox needs evidence you can name (a file, a command you ran now, a log entry). No evidence: leave it unticked and say why in your message.
- The agent never commits, pushes, or creates the PR. `gh pr create` only if the user explicitly asks, and confirm first (it is outward-facing).
- Never put secrets, tokens, tracebacks with user paths, or personal data in the body.
- The template headings stay exactly as in `.github/PULL_REQUEST_TEMPLATE.md`. Read the file each time; do not work from memory.

## 1. Collect (parallel, bounded output)

Repo `C:/Projects/ShatteredArchive`, base branch `release/dev` (the template says PRs target it). Use `git -C` and absolute paths; no bare `cd`.

1. **Branch and range.** `git rev-parse --abbrev-ref HEAD`; base = `origin/release/dev` if it exists, else `release/dev`. If the current branch IS the base (commits are not in a branch yet), package the working-tree changes (`git status --porcelain`, `git diff HEAD --stat`) and tell the user to create a feature branch (you do not). Slug = branch name lowercased, `/` to `-`; on the base branch ask the user for a slug.
2. **Commits and files.** `git log --oneline <base>..HEAD | head -30` and `git diff --stat <base>...HEAD | tail -40` (plus the working tree if dirty). Group the files: UI (`components/`, `*.tsx`), logic (`features/`, `hooks/`), tests (`*.test.*`), docs (`*.md`), config/deploy (`deploy/`, `*.json`, `pnpm-workspace.yaml`), dependencies (`package.json`, lockfiles).
3. **Tests and gate log.** Test files changed. Read `C:/Projects/ShatteredArchive/.claude/state/gate-log.jsonl` (JSONL, may not exist) and keep entries since the first commit of the branch (or the last 14 days): `pass` (logic/tests/index/ui lists), `override` (check + reason), `needs-user` (a test, run or coverage item the agent asked the user about: an OPEN decision), `released` (the gate gave up after 3 blocks: say so).
4. **Decisions recorded in the AI indexes.** `git diff <base> -- '*.annotated' '*.ai-context'`: the ADDED lines are decisions, relations and gotchas written during this work. They answer "why" for the reviewer.
5. **Plan document.** If a `.ai-plans/*.md` matches the branch or the changed areas, take its Goal for the Motivation section.
6. **Screenshots.** The showcase manifests: `node --input-type=module -e "import {recentShowcase} from 'file:///C:/Projects/Shattered-AI/tools/browser-test/lib/showcase.mjs'; console.log(JSON.stringify(recentShowcase(Date.parse(process.argv[1]))))" <ISO date of the first commit>`. Each entry has feature, file, abs path, caption (`description`), date, branch, commit. Prefer features whose slug appears in a changed path; list the rest and ask which to include when there are more than 6. If the change is UI and there are none, say so: the completion gate should have caught it.
7. **Verification evidence.** Which of `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm typecheck` were run, and with what result? Only count runs you can point to in this conversation or run now. Offer (AskUserQuestion) to run them scoped to the changed packages (`pnpm --filter <pkg> …`, bounded with `| tail`/`grep`, or through `qdigest.sh` for a full workspace run). Never tick without a result.

## 2. Fill the template

| Section | What goes in |
|---|---|
| Summary | 2 to 4 sentences: what changed and why, from the commits and diffstat. No file lists. |
| Type of Change | Tick only what the evidence supports (commit prefixes `feat`/`fix`/`docs`/`refactor`/`perf`, file mix). Ambiguous: ask. |
| Motivation and Context | The problem and the reason, from the plan Goal, commit bodies and the index decisions from step 4 (quote the added lines that matter). |
| How Has This Been Tested | Tick Unit tests if test files changed AND you have a passing result; list the files and the result. Tick Manual testing only with screenshots or the user's word. "Not tested" with the reason if there is none. Include gate overrides/asks here or in Additional Notes. |
| Checklist | Tick each box only with evidence: lint/test/build/typecheck (step 7), "added or updated tests" (test files in the diff and the gate did not release), "updated documentation" (md files changed), "targets release/dev" (the base). The "coding standards" box stays the author's to tick unless the gates ran clean. |
| Breaking Changes | Choose with evidence (no exported API, config key, route, storage key, schema or Docker/port change in the diff) or ask. Never guess "does not". |
| Additional Notes | Screenshots (step 3), the "Review notes" below, follow-ups, open questions. |

**Review notes** (always include when the gate log has anything): list each `override` (check and the agent's reason), each `needs-user` item (mark it UNDECIDED, say what blocks a meaningful test and the seam that was proposed), and any `released`. A reviewer should see where the author chose not to follow the usual rule, and why.

## 3. Screenshots

GitHub has no API for attaching images to a PR description, so prepare them and hand over:

1. Create `.pr-drafts/<slug>/screenshots/` and copy the chosen images in as `01-<feature>-<name>.png`, `02-…` in a sensible reading order (originals stay untouched in browser-test).
2. Write `.pr-drafts/<slug>/screenshots.md`: one line per image, `NN-file.png — caption` (the caption is the manifest `description`; if it is empty, write one from the filename and say you did).
3. In `PR_BODY.md` under Additional Notes add a `### Screenshots` block with each caption in bold followed by `<!-- drag screenshots/NN-file.png here -->` (invisible if left in; the user replaces each with the dragged image).
4. Tell the user the exact manual step: open the PR (or its edit box), drag each file from the `screenshots/` folder into the description at the matching comment; GitHub inserts the hosted image link.
5. Alternative, ONLY if the user wants the images versioned: copy them under `docs/pr-screenshots/<slug>/` in the repo and link `https://github.com/<owner>/<repo>/blob/<branch>/docs/pr-screenshots/<slug>/NN-file.png?raw=true` (owner/repo from `git remote get-url origin`). They ship in the repo and the user commits them; say so before doing it.

## 4. Hand over

- Show the final `PR_BODY.md` text (it is meant to be pasted) and the path of the folder.
- List every unticked box with the one thing that would justify ticking it.
- If the user asks to create the PR: confirm the title, base and that the branch is pushed; then `gh pr create --base release/dev --title "<title>" --body-file <PR_BODY.md>`; remind them the screenshots still need dragging in.
- Append a line to the plan document's progress log if one was used.
