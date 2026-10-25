# Docker pinning and known CVEs

Moved out of the root CLAUDE.md on 2026-10-24 to keep that file short; the text below is unchanged except that references to other sections now name the page they live in. CLAUDE.md keeps the rules most tasks need and points here.

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


## Known open CVEs (as of 2026-10-04)

| Image | Digest prefix | Alpine layer (OSV, `apk info`) | Status |
|-------|--------------|------------------|--------|
| `node:26.12.1-alpine3.24` | `40cd011b` | not re-checked yet (the 26.10.0 image had 0 advisories on 18 packages, Alpine 3.24.2) | Replaces 26.10.0 for **CVE-2026-111497** (Brotli decoder out-of-bounds write, RCE via `node:zlib`; Node security release 2026-10-21). Fixed in 22.23.4 / 24.22.1 / **26.12.1**: a 26.x below 26.12.1 is vulnerable even though it is numerically above 24.22.1. Floor for every Node in these repos: 24.22.1 (24 line) or 26.12.1 (26 line); 25.x is EOL and unfixed. `apk upgrade` applied at build |
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

