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

function findPackageRoot(startDir) {
  let cur = startDir;
  while (cur && cur !== path.dirname(cur)) {
    const pj = path.join(cur, 'package.json');
    if (fs.existsSync(pj)) return cur;
    cur = path.dirname(cur);
  }
  return null;
}

function rel(p) {
  return './' + path.relative(process.cwd(), p).replace(/\\/g, '/');
}

const repoRoot = process.cwd();
const allFiles = walk(repoRoot);

const summaries = allFiles
  .filter((p) => p.endsWith(path.join('coverage', 'coverage-summary.json')))
  // ignore merged overall file at repo root if present
  .filter((p) => path.normalize(p) !== path.normalize(path.join(repoRoot, 'coverage', 'coverage-summary.json')));

const lines = [];
for (const summaryPath of summaries) {
  const pkgRoot = findPackageRoot(path.dirname(summaryPath));
  if (!pkgRoot) continue;

  let title = path.basename(pkgRoot);
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
    title = pkg.name || title;
  } catch {}

  lines.push(`${title}, ${rel(summaryPath)}`);
}

lines.sort((a, b) => a.localeCompare(b));

if (!lines.length) {
  console.error('No per-workspace coverage-summary.json files found.');
  process.exit(1);
}

console.log(lines.join('\n'));
