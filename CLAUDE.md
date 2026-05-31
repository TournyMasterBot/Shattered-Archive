# Claude Code — Repository Instructions

These instructions apply to all code generation, suggestions, and reviews in this repository.
They extend and are consistent with `.github/copilot-instructions.md`.

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

## Known open CVEs (as of 2026-05-16)

| Image | Digest prefix | CVEs | Status |
|-------|--------------|------|--------|
| `node:26.1.0-alpine3.23` | `e71ac5e9` | 1 high | No upstream fix yet; `apk upgrade` applied |
| `nginx:1.31.0-alpine` | `dc48b7a8` | 3 high | No upstream fix yet; `apk upgrade` applied |

Update this table when new patched images are published.

---

## Project overview (supplement)

See `.github/copilot-instructions.md` for full project structure, branching policy,
coding standards, test requirements, and licensing constraints.
