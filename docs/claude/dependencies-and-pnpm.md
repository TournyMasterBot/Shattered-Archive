# Packages and dependency security

Moved out of the root CLAUDE.md on 2026-10-24 to keep that file short; the text below is unchanged except that references to other sections now name the page they live in. CLAUDE.md keeps the rules most tasks need and points here.

## Package manager

- Always use **pnpm** (never npm or yarn) via **Corepack**.
- The pinned version is in `package.json` → `packageManager` (currently `pnpm@12.9.1`, node `26.12.1`, corepack `0.36.0` in the images).
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
reviewed change (every `FROM` + its version comment, the Known-CVE table in `docker-pinning.md`, then a frozen-lockfile install).
Never auto-update, and never adopt a version younger than 24 hours.

### Mechanical rule checks
`.ai-rules.md` (repo root) is the short rule list the local qwen agent loads; it must not contradict CLAUDE.md or these pages. The
detectors for the pinning, Docker and security rules live in `../Shattered-AI/tools/gates`
(`node ../Shattered-AI/tools/gates/run.mjs --repo . --all`). Compose files follow the Docker pinning rule too: a
third-party `image:` is `name:tag@sha256:<digest>` (locally built images are exempt). `npm install -g corepack` in a
Dockerfile must pin `corepack@<version>`.

