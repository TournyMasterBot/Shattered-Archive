/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const istanbulCoverage = require('istanbul-lib-coverage');

const finalPath = path.join(process.cwd(), 'coverage', 'coverage-final.json');
if (!fs.existsSync(finalPath)) {
  console.error(`Missing ${finalPath}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
const map = istanbulCoverage.createCoverageMap(raw);

const totals = map.getCoverageSummary().data;

const out = {
  total: {
    lines: totals.lines,
    statements: totals.statements,
    functions: totals.functions,
    branches: totals.branches,
  },
};

const outPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log(`Wrote ${outPath}`);
