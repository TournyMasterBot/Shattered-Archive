# Shattered Archive — Copilot Repository Instructions

These instructions apply to all code generation, refactors, and code reviews in this repository.

## Project overview

- This repository is **Shattered Archive** (the “ShatteredArchive Software”), a fan-operated project providing:
  - a MUD client (React/Vite),
  - supporting servers (Node/TypeScript),
  - SDKs/services/types/utils packages in a pnpm monorepo.
- Repository structure (high level):
  - `apps/*` — game-client, game-server, web-client, web-server
  - `sdks/*`, `services/*`, `types/*`, `utils/*` — shared packages
  - `docs/*` — project docs

## Build, test, and tooling

- Package manager: **pnpm via Corepack** (use the repo’s pinned version from `package.json` `packageManager`).
- Common commands (run from repo root):
  - `pnpm install`
  - `pnpm -r run build`
  - `pnpm test -- --coverage`
  - `pnpm lint` (if present) and `pnpm format` (prettier)
- Prefer changes that keep the repo cross-platform (Windows/macOS/Linux).

## Branching and PR flow

- Default development branch: `release/dev`
- Promotion branches: `release/staging`, `release/production`
- Do **not** suggest direct pushes to protected branches.
- All changes should be proposed via PR targeting **`release/dev`** unless explicitly stated otherwise.
- Assume maintainers require:
  - at least one approval,
  - required CI checks,
  - and clean history (prefer squash merges).

## Coding standards

- TypeScript-first. Keep types explicit and meaningful (avoid `any` unless justified).
- Prefer small, reviewable diffs; avoid drive-by reformatting unrelated files.
- Do not introduce new dependencies unless necessary; justify additions.
- Follow existing patterns in the touched area (naming, folder layout, exports).
- Prefer clear, readable code over cleverness.

## Tests and coverage

- If you change behavior, add or update tests with meaningful assertions.
- Don’t add placeholder tests just to increase coverage.
- If a package has no tests yet, prefer:
  - adding at least one focused test for the new behavior, OR
  - explaining why tests are not added (e.g., pure wiring / docs-only change).

## Security and privacy

- Do not introduce telemetry, tracking, or hidden network calls.
- Avoid logging secrets, tokens, or personally identifying information.
- For security-related changes, reference `SECURITY.md` guidance.

## Licensing and fan project constraints

- This project is **source-available** and dual-licensed (see `LICENSING.md`).
- Keep language consistent: refer to “**ShatteredArchive Software**” (not “the software” or “the service” in isolation).
- Do not add third-party copyrighted game content or raw server files.
- If adding docs/disclaimers, keep them aligned with `DISCLAIMER.md` and `PRIVACY.md`.

## What to include in responses

When proposing code changes, include:
- The minimal set of file edits required
- Any command(s) to validate the change (build/test/lint)
- Notes about behavior changes, risks, or rollout steps

When unsure about conventions, prefer asking for the existing pattern **in this repo** rather than inventing a new one.
