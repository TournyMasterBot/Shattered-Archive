# PR review: Mobile emulator test harness - dev-stack routing, the real auth flow and one reusable test account

Item: 2026-11-20_mobile-emulator-test-harness · Base: the work is uncommitted in four repos (ShatteredArchive, Shattered-AI, DSL, shatteredarchive-mobile), reviewed as working-tree changes · Reviewed: 2026-11-20 @ ShatteredArchive 9191edc (working tree) · Verdict: **READY** (the 3 blocking findings were fixed the same day and re-checked: see "Re-check after fixes")

The change set is spread over four repos, so it becomes four small pull requests, not one: **Shattered-AI** (the tool `tools/mobile-test`, `doc/mobile-testing.md`, the largest part), **ShatteredArchive** (the rule doc, `CLAUDE.md`, the standards and the edge-case classifier, the hooks index), **shatteredarchive-mobile** (`site-api.ts` and its test and docs) and **DSL** (one compose line). The `.claude/hooks/emulator-guard.js`, its self-test and `.claude/settings.json` are git-ignored in ShatteredArchive (`.gitignore:27` `*.js`, `:121`), like every other hook there: they exist on this machine only and are not part of any PR.

## Check results

| Check | Command | Result |
|---|---|---|
| Lint, mobile (changed files) | `pnpm exec eslint features/auth/site-api.ts features/auth/__tests__/site-api-test.ts` | **1 error**, 1 warning: `site-api-test.ts:7` `expo/no-dynamic-env-var` (`process.env[ENV_NAME]`); the warning is the `require()` style the package's tests already use. `site-api.ts` is clean |
| Lint, mobile (package script) | `pnpm lint` (`expo lint`) | 0 errors, 88 warnings (the script did not report the error above, so the recorded "lint 0 errors" was true of the script and not of the file) |
| Lint, Shattered-AI tool, hooks | none by decision (`docs/standards/javascript.md`, "Shattered-AI `tools/mobile-test`") | not run: no linter exists or is added |
| Format | the mobile package has no `format` script and `prettier` is not installed | not run: none exists |
| Type-check | `pnpm exec tsc --noEmit` (mobile) | 0 errors (Phase 8 run) |
| Build | `pnpm exec expo export --platform android` (mobile) | exit 0 (Phase 8 run); the tool and the hook have no build; ShatteredArchive changed no package source |
| Tests, driver | `pnpm --dir Shattered-AI/tools/mobile-test test` | 208 / 208 pass (re-run for this review) |
| Tests, hook | `node .claude/hooks/emulator-guard.selftest.js` | OK, 66 commands |
| Tests, mobile | `pnpm test --runInBand` (whole package, Phase 8) and `site-api` (re-run) | 86 suites / 1192 tests pass; `site-api` 7 / 7 |
| Coverage | `node --experimental-test-coverage` for the tool; jest `--coverage` for `site-api.ts` | `site-api.ts` 100 / 100 / 100; tool modules 98.5-100 % statements (the lines not run are the real-wiring functions `realDeps`, `expoCli` and the real-process defaults, exercised by the live runs) |
| Compose | `docker compose -f Server/docker-compose.yml config -q` | valid; the diff is 4 added lines (3 of comment) and the two protected files have no diff |
| Private names | `pnpm check:private-names` | OK (1157 names, 2422 files) |
| Doc impact | `check-doc-impact.mjs --files ...` and item mode | 0 unresolved for this item's files (the hooks index was updated; item mode lists 62 docs that belong to other uncommitted work) |

## Re-check after fixes (2026-11-20)

| Finding | Fix | Re-check |
|---|---|---|
| 1 fixture certificate with machine names | replaced by `lib/fixtures/neutral-test-cert.pem` (synthetic, subject "Test fixture only", no key), pin confirmed independently with openssl; a test parses every certificate fixture (TESTENV-02) | driver tests 209/209; the fixture's subject and issuer read back as the neutral names; the name scan of the tool, docs and item folder is empty |
| 2 ESLint error in `site-api-test.ts` | plain `process.env.EXPO_PUBLIC_SITE_API` | `pnpm exec eslint` on both files: 0 errors, 1 warning (the package's usual `require()` style); `site-api` 7/7 tests, 100% coverage; `tsc` 0 errors |
| 3 no Final state block | added to `test-results.md` with the review corrections (the recorded lint lines are corrected there) and amendment A13 in the plan | read back |
| 4 real account name in two tests | renamed to `test-user` | driver tests 209/209; name scan empty |

The owner approved the proposed classifier: **TESTENV-02** is now in `docs/standards/edge-cases/test-environments.md` (README format, next free id, Origin = this item, no personal values); `pnpm check:private-names` still OK.

Template readiness after the fixes: the two Gaps that review work could close (coding standards, `pnpm lint`) are closed; the remaining one, "targets `release/dev`", is the owner's to state per repository.

## Findings

(as found; fixed unless marked otherwise)

**Blocking**

1. `Shattered-AI/tools/mobile-test/lib/fixtures/dev-edge.pem` · data classification (Personal) · the fixture is a real mkcert certificate copied from the dev edge, and its subject and issuer carry this machine's Windows account name and host name (checked by parsing the certificate, values not repeated here); it would be committed with the tool. The Phase 6 box 6.5 and the plan's own rule ("a fixture holds no personal value") both forbid it. Fix: replace it with a synthetic self-signed certificate that has only a neutral subject (generated once with `openssl`, no private key kept) and update the expected pin in `routing.test.mjs` and `session-core.test.mjs`; or drop the PEM and build the certificate text in the test. The pin algorithm stays proven by a known-answer test.
2. `shatteredarchive-mobile/dsl-client/features/auth/__tests__/site-api-test.ts:7,14,21,26,27` · lint (`expo/no-dynamic-env-var`) · the test reads and writes `process.env[ENV_NAME]`, which the package's own rule rejects, and `test-results.md` (Phase 3 and Phase 8) records lint as clean. Fix: use the literal `process.env.EXPO_PUBLIC_SITE_API` in the test (assigning and deleting through the plain property works in jest), re-run `pnpm exec eslint` on the file, and correct the recorded lint line.
3. `.ai-plans-completed/2026-11-20_mobile-emulator-test-harness/test-results.md` · work-item completeness (`implement-plan` step 2) · there is a block per phase but no **Final state** block (full build, type-check, lint and test results with coverage per touched package, the list of files changed) and no two-list screenshots block (incremental screenshots, none final). Fix: add both from the numbers in this review, with the corrected lint line.

**Non-blocking**

4. `Shattered-AI/tools/mobile-test/lib/reset.test.mjs`, `session-core.test.mjs` · data classification · the fixtures use the real throwaway test account's name as the fake account name. It is a test account, which the classification allows, but a placeholder (`test-user`) removes the question. Fix: rename in both tests.
5. `.claude/hooks/emulator-guard.js`, `.claude/settings.json` · repo hygiene · local-only (git-ignored), so `CLAUDE.md` and `docs/claude/emulator-testing.md` name a hook other clones do not have. This matches how the existing hooks are documented (`qdigest-guard`, `jest-guard`); say it in the PR text so reviewers do not look for the files.
6. `Shattered-AI/tools/mobile-test/pnpm-lock.yaml` · untracked and not touched by this work (it predates it); no dependency was added to the tool. Leave it out of the tool's PR unless it is the owner's.
7. `shatteredarchive-mobile/docs/features/autopilot.md` is untracked as a whole file (it belongs to the autopilot item); this work added one row to its settings table. Package it with that item, not this one.
8. Accepted limits, recorded in the plan: the emulator's lock PIN is typed with `adb shell input text` (A10 e); a run killed between the hub's signup answer and the first registry write leaves an unrecorded hub account (A9); about half of the app's launches fail on the emulator's network and `up` retries (A11).

## Standards coverage

| Language | Standards file | Used |
|---|---|---|
| JavaScript (`.mjs`, hooks `.js`) | `docs/standards/javascript.md`, section "Shattered-AI `tools/mobile-test` and the `.claude/hooks` guards" (decided with this plan) | layout, tests, errors, security-sensitive code: followed; the fixture finding (1) is the one deviation (no value in a fixture) |
| TypeScript (`site-api.ts`, its test) | `docs/standards/typescript.md`, section "shatteredarchive-mobile" | kebab-case, `__tests__/*-test.ts`, no new `any`, no values in warnings: followed; finding (2) is a lint rule of the package |
| YAML (Maestro flows, compose) | none (not a language here); `CLAUDE.md` and the repo rules | the compose change follows LOCAL-02 |
| Markdown | `CLAUDE.md`, `docs/claude/work-item-workflow.md` | followed |

No file is MISSING or INCOMPLETE.

## Edge-case coverage

| Catalog file | Classifiers triggered by the diff | Proof |
|---|---|---|
| `test-environments.md` (added by this work, README format, prefix `TESTENV` unique, index row present, no personal values) | TESTENV-01 | `origins.test.mjs` (empty environment, look-alikes, userinfo), `preflight.test.mjs` (no request for a refused origin), `hub.test.mjs`, `reset.test.mjs`; live: the preflight printed every origin before anything ran |
| `local-only-features.md` | LOCAL-01 (dev address only from a bundling-time setting), LOCAL-02 (compose line local only), LOCAL-05 (no LAN address) | `site-api-test.ts` plus the export search (0 occurrences without the setting, 1 with); the compose diff check (two protected files empty); the IPv4 search of every changed file (documentation range and loopback only) |
| `persisted-settings-and-defaults.md` | SETTINGS-04 (one normaliser for the registry), SETTINGS-05 (one-shot non-destructive import) | `registry.test.mjs` shape table and import cases (old file byte-identical, twice leaves one entry) |
| `cloud-synced-user-content.md` | CLOUDSYNC-02 (reset replaces whole collections) | `reset.test.mjs` (empty lists, dev origin, production refused before any request) and the live reset (counts before and after) |
| `work-item-folders.md` | WORKITEM-01 (the old account file is copied, not moved), WORKITEM-02 (nothing ticked that was not run) | the import test; box 8.6 handled openly (closed by the sign-off, no render claimed) |
| `game-data-privacy.md` | PRIVNAME-01 (captures and logs of the login screens) | the three captures were opened and show no name or token; **but** finding (1) shows a personal value reaching a committed fixture by a route the classifier does not name: a **proposed classifier** is below |

Proposed classifier (to be created only after you confirm): **TESTENV-02** in `test-environments.md`: *a real certificate, key or capture copied into a test fixture carries the machine's names.* Applies when a test needs a certificate, a hosts entry or a captured response from the dev stack. Edge case: the fixture is copied from the local stack and holds the Windows account and host name (mkcert writes both into every certificate it issues). Required behaviour: fixtures are synthetic; a certificate fixture is generated with a neutral subject and has no key. Verify: parse every `.pem` fixture and assert its subject and issuer hold no `user@host` pattern. Origin: this item.

## PR template readiness

| Section | Status |
|---|---|
| Summary | Answerable: four small PRs, described in the first paragraph above |
| Type of Change | Answerable: New feature (developer tooling) and Documentation update; the compose line and the `site-api.ts` setting are part of the feature |
| Motivation and Context | Answerable from `item.md`: an emulator test of the app signed in to production, the dev stack was unreachable from the emulator, and every run risked another test account |
| Tests: Unit tests | Answerable: 208 driver tests, a 66-command hook self-test, 7 new mobile tests, results above |
| Tests: Integration tests | Answerable: the two-run live proof on emulator-5554 and the Phase 5 to 7 real checks, recorded in `test-results.md` |
| Tests: Manual testing | Answerable: the same runs; the owner signed off on 2026-11-20 |
| Checklist: coding standards | **Gap** until findings 1 and 2 are fixed |
| Checklist: `pnpm lint` | **Gap**: the mobile file has an ESLint error (finding 2); ShatteredArchive changed no package source, so its `pnpm lint` is not applicable |
| Checklist: `pnpm test` with coverage | Answerable for the mobile package and the tool (counts above); not applicable to ShatteredArchive packages (none changed) |
| Checklist: `pnpm build` | Answerable: `expo export` exit 0; not applicable elsewhere |
| Checklist: `pnpm typecheck` | Answerable: mobile `tsc` 0 errors; the tool and hook have none |
| Checklist: tests added | Answerable: every module has its own test file; the one uncovered group is the real wiring, covered by the live runs |
| Checklist: documentation updated | Answerable: `docs/claude/emulator-testing.md`, `CLAUDE.md` (two repos), `doc/mobile-testing.md`, mobile `docs/development.md`, the indexes; end-user documentation: none, developer tooling, reason in each phase block |
| Checklist: targets `release/dev` | Gap for the owner to state per repo (the ShatteredArchive branch is `performance/Allocation-hunt`, not a feature branch of this work) |
| Breaking Changes | Answerable, "does not introduce": the app's default stays production, `runFlow` and `captureScreenshot` gained optional arguments, `ensureEmulatorBooted` and `isEmulatorRunning` are unchanged without a serial, the compose change only adds an index in the local file |
| Additional Notes | Answerable: findings 5 to 8, the git-ignored hooks, the four-repo split |

## Not run

- ESLint and Prettier for the Shattered-AI tool and the hooks: no linter or formatter exists there by decision.
- `pnpm lint`, `test`, `build`, `typecheck` of ShatteredArchive packages: no package source changed.
- The editor-preview render of the four workflow diagrams (plan box 8.6): no renderer is installed; a static check of the eight plan blocks and the four blocks in `doc/mobile-testing.md` against the skill's rules passed; the owner's sign-off closed the box.
