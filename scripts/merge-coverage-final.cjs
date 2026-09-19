/**
 * scripts/merge-coverage-final.cjs
 *
 * Companion to run-jest-chained.cjs: since each workspace package now runs its
 * tests (and --coverage collection) in its own jest process, writing to its own
 * coverage/by-app/<name>/coverage-final.json, this unions all of them into
 * coverage/coverage-final.json so split-coverage-final.cjs (which expects exactly
 * that single combined file) needs no changes. Safe as a plain union:
 * coverage-final.json is keyed by absolute source file path, and no file belongs to
 * more than one package.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const BY_APP_DIR = path.join(ROOT, 'coverage', 'by-app');
const OUT = path.join(ROOT, 'coverage', 'coverage-final.json');

function packageCoverageFiles() {
  if (!fs.existsSync(BY_APP_DIR)) return [];

  const found = [];
  for (const name of fs.readdirSync(BY_APP_DIR).sort()) {
    const p = path.join(BY_APP_DIR, name, 'coverage-final.json');
    if (fs.existsSync(p)) found.push(p);
  }
  return found;
}

function main() {
  const sources = packageCoverageFiles();

  if (!sources.length) {
    console.error('No coverage/by-app/*/coverage-final.json files found — did the chained test step run?');
    process.exit(1);
  }

  const merged = {};
  for (const p of sources) {
    Object.assign(merged, JSON.parse(fs.readFileSync(p, 'utf8')));
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(merged));
  console.log(
    `Merged ${sources.length} per-package coverage file(s) -> ${path.relative(ROOT, OUT)} (${Object.keys(merged).length} source file(s) covered)`,
  );
}

main();
