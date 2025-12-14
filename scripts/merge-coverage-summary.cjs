/* scripts/merge-coverage-summary.cjs */
const fs = require("fs");
const path = require("path");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function safeReadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

const repoRoot = process.cwd();
const allFiles = walk(repoRoot);

const summaries = allFiles
  .filter((p) => p.endsWith(path.join("coverage", "coverage-summary.json")))
  .map((p) => ({ p, json: safeReadJson(p) }))
  .filter((x) => x.json && x.json.total);

if (summaries.length === 0) {
  console.log("No coverage-summary.json files found.");
  process.exit(0);
}

const metrics = ["lines", "statements", "functions", "branches"];

const merged = { total: {} };
for (const m of metrics) {
  merged.total[m] = { total: 0, covered: 0, skipped: 0, pct: 0 };
}

for (const { p, json } of summaries) {
  const t = json.total;
  for (const m of metrics) {
    if (!t[m]) continue;
    merged.total[m].total += t[m].total || 0;
    merged.total[m].covered += t[m].covered || 0;
    merged.total[m].skipped += t[m].skipped || 0;
  }
}

for (const m of metrics) {
  const x = merged.total[m];
  x.pct = x.total > 0 ? (x.covered / x.total) * 100 : 0;
}

const outDir = path.join(repoRoot, "coverage");
fs.mkdirSync(outDir, { recursive: true });

const outPath = path.join(outDir, "coverage-summary.json");
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), "utf8");

console.log(`Merged ${summaries.length} coverage summaries -> ${outPath}`);
