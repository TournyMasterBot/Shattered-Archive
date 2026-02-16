/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function safeReadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function pct(covered, total) {
  if (!total) return 0;
  return (covered / total) * 100;
}

const repoRoot = process.cwd();
const allFiles = walk(repoRoot);

const mergedOut = path.join(repoRoot, 'coverage', 'coverage-summary.json');

const summaries = allFiles
  .filter((p) => p.endsWith(path.join('coverage', 'coverage-summary.json')))
  .filter((p) => path.normalize(p) !== path.normalize(mergedOut));

const metrics = ['lines', 'statements', 'functions', 'branches'];

const agg = {};
for (const m of metrics) agg[m] = { total: 0, covered: 0, skipped: 0, pct: 0 };

let count = 0;
for (const p of summaries) {
  const json = safeReadJson(p);
  const total = json?.total;
  if (!total) continue;

  let hasAny = false;
  for (const m of metrics) {
    const e = total[m];
    if (!e) continue;
    agg[m].total += Number(e.total || 0);
    agg[m].covered += Number(e.covered || 0);
    agg[m].skipped += Number(e.skipped || 0);
    hasAny = true;
  }
  if (hasAny) count++;
}

for (const m of metrics) {
  agg[m].pct = Number(pct(agg[m].covered, agg[m].total).toFixed(2));
}

fs.mkdirSync(path.dirname(mergedOut), { recursive: true });
fs.writeFileSync(mergedOut, JSON.stringify({ total: agg, _meta: { mergedFrom: count } }, null, 2), 'utf8');

console.log(`Merged ${count} coverage summaries -> ${path.relative(repoRoot, mergedOut)}`);
