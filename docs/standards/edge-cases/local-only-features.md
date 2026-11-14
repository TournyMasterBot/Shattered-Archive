---
topic: "Local-only (dev docker) features that must never reach production: build flags, shared config, workspace manifests"
prefix: LOCAL
applies-when: "local-only feature, dev-only feature, build flag, VITE_ env, compose profile, nginx template, csproj Copy wwwroot, Dockerfile manifest COPY lines, new workspace project, apps/*, services/*, production image, copilot"
---

### LOCAL-01 A build flag read from a file that ships in the build context leaks the feature into production
- Applies when: a feature is compiled in or out by a build-time flag.
- Edge case: the flag sits in a `.env*` file that the Docker build context copies (`apps/game-client/.env` is in the context). Vite loads those files for production builds too, so every production image built on that machine contains the local-only code.
- Required behaviour: the flag comes only from the process environment or a build ARG that only the dev compose sets; it is never written to a file in the repo or the build context.
- Verify: build the production target with a flag file present and assert the bundle contains none of the feature's marker strings.
- Origin: 2026-11-05_copilot-ai-training-sibling-to-autopilot

### LOCAL-02 A local-only addition to a config shared by production and dev ships to production
- Applies when: an nginx template, compose file, csproj item (`Copy wwwroot\**`), Dockerfile or manifest is used by both stacks.
- Edge case: the new vhost, route, `wwwroot` data folder or service lands in the shared file and production serves it.
- Required behaviour: local-only config goes in a file or profile only the dev stack mounts or sets; a test reads the production config and asserts the local-only identifiers are absent.
- Verify: that test, plus the Release output built without the dev property containing no local-only type, route or data file.
- Origin: 2026-11-05_copilot-ai-training-sibling-to-autopilot

### LOCAL-03 A new workspace project is missing from the image manifests, so the next image build fails
- Applies when: a project is added under `apps/*`, `services/*`, `utils/*`, `types/*` or `sdks/*`.
- Edge case: pnpm refuses a frozen install when `pnpm-lock.yaml` lists a project whose `package.json` the Dockerfile did not copy. Local tests pass and the first image build breaks.
- Required behaviour: every `deploy/*.Dockerfile` that copies manifests is updated in the same phase and the lockfile is refreshed.
- Verify: a script compares the lockfile importers with each Dockerfile's `package.json` COPY lines and fails on any difference.
- Origin: 2026-11-05_copilot-ai-training-sibling-to-autopilot

### LOCAL-04 A second local-only feature rides on the first one's guard, or has none, and ships to production unchecked
- Applies when: a local-only feature is added next to an existing one (its own build constant, Dockerfile ARG, compose line, nginx template).
- Edge case: the guard script scans for the first feature's name and marker only, so the second feature's switch, marker or vhost in a shared production file passes every check.
- Required behaviour: the second feature has its own build constant, its own bundle marker, its own allowed Dockerfile lines, and its own guard cases; the guard fails on either feature's trace in a production file or dist.
- Verify: guard tests that plant each feature's name, switch and marker in a production file or dist and see the guard fail, plus a real production build that holds neither marker.
- Origin: 2026-11-07_simulacrum-admin-panel

### LOCAL-05 A developer-machine address (LAN IP, personal hostname) is committed in source, config, tests or docs
- Applies when: a local-only feature needs to recognise or reach an address that belongs to the developer's own machine or network.
- Edge case: the address is written as a literal into code, a compose file, a test fixture or a doc, so a private IP address (Personal data under `docs/standards/data-classification.md`) lands in a public pull request.
- Required behaviour: committed files carry hostnames of the dev domain and placeholders only; a machine-specific address comes from run-time browser storage or the shell environment, validated against an allowed-range predicate.
- Verify: a scan of the diff and the new files for private IPv4 literals finds none; a test supplies the address through the run-time channel and asserts it is accepted, and an out-of-range value is refused.
- Origin: 2026-11-07_simulacrum-admin-panel
