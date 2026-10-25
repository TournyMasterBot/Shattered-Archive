# Pull Request

## Summary

Housekeeping branch with two commits. "Safety save cleanup" removes the Kingdom Tactics subsystem (two apps and the engine service, with their Docker, nginx, port and plan entries), prunes stale `.annotated`/`.ai-context` index files, and carries a batch of already-written work: Docker/compose and landing-page updates, the DSL color preview ANSI support, and a Python-bridge string fix. "Node updates for brotli vulnerability" raises the Node floor to 24.22.1 / 26.12.1 for CVE-2026-111497, moves to pnpm 12.9.1, digest-pins and refreshes every Dockerfile, adds an nginx request-side brotli block, and splits the long `CLAUDE.md` into `docs/claude/`.

The diff is large (527 files, about +2,970 / -27,750, of which about 22,000 deleted lines are the Kingdom Tactics apps and engine). Suggested reading order is in Additional Notes.

---

## Type of Change

Please check all that apply:

- [x] Bug fix
- [ ] New feature
- [x] Documentation update
- [x] Refactor / cleanup
- [ ] Performance improvement
- [x] Other (please describe): dependency and Docker security hardening (CVE-2026-111497, three pnpm overrides), removal of the Kingdom Tactics subsystem

---

## Motivation and Context

- **Brotli CVE-2026-111497.** The Node floor is now 24.22.1 (24 line) or 26.12.1 (26 line); 25.x is EOL and unfixed. Every Dockerfile moves to the fixed `node:26.12.1-alpine3.24` digest, runs `apk --no-cache upgrade` first, and pins `corepack@0.36.0`. Because nginx forwards request bodies to Node undecoded, `deploy/scripts/brotli-mitigation.mjs` adds (and can remove, idempotently) a `415` for `Content-Encoding: br` in every server block that proxies.
- **pnpm 12.9.1.** pnpm 11.28+ and 12 refuse a frozen install when `pnpm-lock.yaml` lists a workspace project whose `package.json` is missing, so the partial-copy Dockerfiles now `COPY` every workspace manifest.
- **`minimumReleaseAge: 1440`** moved into `pnpm-workspace.yaml`. The old `minimum-dep-age=86400` line in `.npmrc` is not a pnpm setting and never did anything (verified 2026-10-03 on pnpm 11.8.0; the note is in `.npmrc`).
- **Dependabot/GHSA overrides:** `handlebars` 4.7.10, `shell-quote` 1.11.0, `proxy-addr` 2.0.8. Each is reached only by a package that already declares a range containing the fixed version (reasoning is in the comments in `pnpm-workspace.yaml`).
- **Python scripts.** `getNamedVar` and `getGlobalVar` returned raw JS strings to Skulpt, so `.upper()`, `.split()`, `+`, `==`, `len()` and `int()` on the result threw. They now return a real Python `str` through `pyStr()`.
- **Kingdom Tactics removed.** The apps, the engine, their Dockerfiles, nginx vhost, compose entries, `.gitignore` rules, jest entries, root scripts and plans are gone, and `docs/ports.md` drops ports 50080 and 51000. No `kingdom-tactics` reference remains outside `pnpm-lock.yaml` and `.ai-plans/`.
- **Agent/LLM discovery for the landing site:** `llms.txt`, `/.well-known/ard.json` and `ai-catalog.json`, a hub agent skill, and WebMCP tools in `site.js`; `docs/agent/` holds the service map and auth-service notes.
- **`CLAUDE.md`** is now a short rules summary (93 lines added, 237 removed); the full text and procedures behind each rule live in `docs/claude/*.md`, which the file lists.
- **DSL color preview** gains ANSI `.txt` support and Copy as Plain/ANSI Text commands. Decision recorded in its `.annotated`: `ansi.ts` is a hand-synced copy of `dsl-log-preview/src/ansiToHtml.ts` plus game-client `dsl-to-ansi.ts`, because a VSIX cannot import across the workspace; change them together.

---

## How Has This Been Tested?

Describe the tests you ran to verify your changes.

- [x] Unit tests
- [ ] Integration tests
- [x] Manual testing
- [ ] Not tested (please explain)

Provide details if applicable:

Run on `housekeeping/cleanup` (HEAD `c2e7b8d`), Windows, PowerShell, pnpm 12.9.1, Node 26.12.1:

| Command | Result |
|---|---|
| `pnpm test` | 192 suites passed, 2303 tests passed, 0 failed |
| `pnpm test:coverage` | exit 0, same 192/2303; All files: statements 57.53%, branches 46.3%, functions 56.3%, lines 59.5% |
| `pnpm build` | exit 0, no error lines (`pnpm -r run build`, 28 of 29 workspace projects) |
| `pnpm typecheck` | exit 0, but this script only runs `tsc` on `apps/game-client` |
| `pnpm lint` | **fails**: 43 errors, 732 warnings (limit 300). See Review notes. |

Test change in this PR: `apps/game-client/src/features/userScripts/pythonRuntime.test.ts` (+56 lines) covers the `pyStr()` fix. The Docker images, nginx brotli rule and compose files were **not** built or exercised here.

---

## Checklist

Please confirm the following before requesting review:

- [ ] My code follows the project’s coding standards
- [ ] I ran `pnpm lint`
- [x] I ran `pnpm test` (including coverage)
- [x] I ran `pnpm build`
- [x] I ran `pnpm typecheck`
- [x] I have added or updated tests where appropriate
- [x] I have updated documentation where necessary
- [x] This change targets `release/dev` (unless otherwise discussed)

---

## Breaking Changes

- [x] This change introduces breaking changes
- [ ] This change does not introduce breaking changes

If yes, please describe the impact and any required migration steps:

- **Kingdom Tactics is removed.** Packages `kingdom-tactics-client`, `kingdom-tactics-server` and `kingdom-tactics-engine`, ports 50080/51000, its Docker images, nginx vhost, compose services and the `dev:`/`start:` root scripts no longer exist. Anything still pointing at them fails.
- **Node engine range** is now `^24.22.1 || >=26.12.1` (was `>=24.0.0`) and `.nvmrc` is `24.22.1`. Older Node 24.x installs will refuse to install.
- **`packageManager` is `pnpm@12.9.1`.** Run `corepack enable`; lockfile was refreshed, installs use `--frozen-lockfile`.
- **Edge nginx** answers `415` to any request with `Content-Encoding: br` in every server block that proxies. Remove with `node deploy/scripts/brotli-mitigation.mjs remove <file>`.
- **`.gitignore`** now ignores `.claude/state/`, `.ai-code-review/`, `.pr-drafts/` and `.mcp.json`.

---

## Additional Notes

### Review notes

- **`pnpm lint` fails (43 errors).** Nearly all are in files this PR does not touch (for example `no-undef: process` in `dsl-log-preview/esbuild.mjs` and `game-client/scripts/*.mjs`, `react-hooks/rules-of-hooks` in `UserStyleOverrideModal.tsx` and `MobPlacementAccordion.tsx`, `no-empty` in several hooks). The only one in this PR's diff is the new `deploy/scripts/brotli-mitigation.mjs` (`process`/`console` not defined, 8 errors, no Node globals configured for `.mjs` under `deploy/`). I did not compare against `release/dev`, so I cannot say which errors are older than this branch.
- **Completion gate:** no gate log exists for this branch (`.claude/state/gate-log.jsonl` is absent), so there are no recorded overrides, open asks or releases to report.
- **`pnpm typecheck` covers game-client only.** Other packages are type-checked by `pnpm build`, which passed.
- **Not run:** Docker image builds, `docker compose config`, and the nginx config test.
- **AI index changes.** Most `.annotated`/`.ai-context` deletions are pruned stale or restating entries. The added entries are documentation of the current state of `deploy/`, `mud-builder`, `psd-viewer`, `dsl-color-preview` and the `.claude/hooks` (completion gate, qdigest guard, session baseline).

### Suggested reading order

1. `c2e7b8d` (30 files): Dockerfiles, `pnpm-workspace.yaml`, `brotli-mitigation.mjs`, nginx, `CLAUDE.md` + `docs/claude/`.
2. `eaa951b` Kingdom Tactics deletions (mechanical), then `docs/ports.md`, `jest.config.cjs`, `package.json`.
3. Real code changes are small: `pythonRuntime.ts` + test, and `apps/dsl-color-preview/src/`.

### Screenshots

No JSX or UI change in this diff (the only `apps/game-client` code change is `pythonRuntime.ts`), so there are none.
