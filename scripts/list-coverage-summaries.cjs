/**
 * scripts/list-coverage-summaries.cjs
 *
 * Prints lines in the format required by MishaKav/jest-coverage-comment:
 *   Title, ./path/to/coverage-summary.json
 *
 * Includes "Overall" first if coverage/coverage-summary.json exists.
 * Then includes per-workspace summaries created by split-coverage-final.cjs.
 */

const fs = require('fs');
const path = require('path');

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function main() {
  const out = [];
  out.push('Overall (repo root), ./coverage/coverage-summary.json');
  const overall = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
  if (exists(overall)) {
    out.push('Overall, ./coverage/coverage-summary.json');
  }

  const idx = path.join(process.cwd(), 'coverage', 'workspaces', 'index.json');
  if (exists(idx)) {
    const entries = JSON.parse(fs.readFileSync(idx, 'utf8'));
    for (const e of entries) {
      out.push(`${e.bucket}, ./${e.path}`);
    }
  }

  if (!out.length) {
    console.error('No coverage summaries found. Did split-coverage-final.cjs run?');
    process.exit(1);
  }

  process.stdout.write(out.join('\n'));
}

main();
