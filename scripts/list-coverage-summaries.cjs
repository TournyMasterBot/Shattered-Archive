// scripts/list-coverage-summaries.cjs
const fs = require('fs');
const path = require('path');

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function main() {
  const out = [];

  const overallPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
  if (exists(overallPath)) {
    out.push('Overall (repo root), ./coverage/coverage-summary.json');
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
