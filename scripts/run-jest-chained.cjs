/**
 * scripts/run-jest-chained.cjs
 *
 * CI runs each workspace package's tests as its OWN jest process (spawned one at a
 * time, in a fixed order) instead of one --runInBand process covering the whole
 * monorepo. Every locally-configured package (see jest.config.cjs's
 * LOCAL_CONFIG_PACKAGES) keeps a persistent ts-jest TypeScript LanguageService alive
 * for the life of its process; running them all in one process meant every one of
 * those LanguageServices stayed resident simultaneously for the whole run, and that
 * cumulative heap exceeded even an 8GB ceiling once the workspace grew large enough
 * (2026-09-19 OOM investigation). Chaining bounds peak memory to whichever single
 * package is currently running, since its heap is freed when that process exits.
 *
 * Discovers every apps/*, services/*, sdks/* package with a `test` script in its
 * package.json and runs `pnpm --filter <dir> test --coverage ...` for each,
 * continuing past a failing package so the run still reports every package's
 * result, then exits non-zero if any package failed.
 *
 * Every invocation gets an explicit --coverageDirectory=coverage/by-app/<name>
 * (absolute path) rather than trusting each project's own config: `game-client` and
 * `services-server` aren't in LOCAL_CONFIG_PACKAGES, so they run through root
 * jest.config.cjs's shared "client"/"server" projects — and coverageDirectory isn't
 * a valid per-project Jest option, so both would otherwise silently fall back to the
 * SAME top-level default (<rootDir>/coverage) and clobber each other's output when
 * chained. merge-coverage-final.cjs reads back from coverage/by-app/*.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const GROUPS = ['apps', 'services', 'sdks'];
const COVERAGE_ROOT = path.join(ROOT, 'coverage', 'by-app');

function testablePackages() {
  const found = [];
  for (const group of GROUPS) {
    const groupDir = path.join(ROOT, group);
    if (!fs.existsSync(groupDir)) continue;

    for (const name of fs.readdirSync(groupDir).sort()) {
      const pkgJsonPath = path.join(groupDir, name, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) continue;

      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      if (pkg.scripts && pkg.scripts.test) found.push(name);
    }
  }
  return found;
}

function main() {
  const packages = testablePackages();
  console.log(`Running tests for ${packages.length} package(s): ${packages.join(', ')}`);

  const failed = [];

  for (const name of packages) {
    const coverageDir = path.join(COVERAGE_ROOT, name);

    console.log(`\n::group::${name}`);
    // No `--` separator before these flags: pnpm 11 forwards a literal `--` through
    // to the underlying jest script instead of stripping it, which jest then parses
    // as a bogus testPathPattern — matching zero tests and, since every package's
    // script sets --passWithNoTests, exiting 0 without running anything.
    const result = spawnSync(
      'pnpm',
      [
        '--filter', name, 'test',
        '--coverage', '--coverageReporters=json', '--coverageReporters=json-summary',
        `--coverageDirectory=${coverageDir}`,
      ],
      { stdio: 'inherit', shell: true },
    );
    console.log('::endgroup::');

    if (result.status !== 0) failed.push(name);
  }

  if (failed.length) {
    console.error(`\nFAILED: ${failed.join(', ')}`);
    process.exit(1);
  }

  console.log(`\nAll ${packages.length} package(s) passed.`);
}

main();
