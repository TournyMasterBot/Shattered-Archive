\
/**
 * scripts/split-coverage-final.cjs
 *
 * Reads Jest Istanbul coverage output at:
 *   coverage/coverage-final.json
 *
 * Writes:
 *   coverage/coverage-summary.json
 *   coverage/workspaces/<slug>/coverage-summary.json
 *
 * Workspace bucket inferred from repo-relative file path:
 *   apps/<name>/..., sdks/<name>/..., utils/<name>/..., types/<name>/..., services/<name>/...
 * Everything else goes to "root".
 *
 * Dependency-free (no istanbul-lib-* packages required).
 */

const fs = require('fs');
const path = require('path');

const COVERAGE_FINAL = path.join(process.cwd(), 'coverage', 'coverage-final.json');
const OUT_OVERALL = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
const OUT_WORKSPACES_DIR = path.join(process.cwd(), 'coverage', 'workspaces');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function safePct(covered, total) {
  // Istanbul convention: total=0 -> 100%
  if (!Number.isFinite(total) || total <= 0) return 100;
  if (!Number.isFinite(covered) || covered < 0) return 0;
  return (covered / total) * 100;
}

function metric(covered, total) {
  return {
    total,
    covered,
    skipped: 0,
    pct: Number(safePct(covered, total).toFixed(2)),
  };
}

function summarizeFile(fileCov) {
  // Statements
  const s = fileCov?.s || {};
  const stmtKeys = Object.keys(s);
  const statementsTotal = stmtKeys.length;
  const statementsCovered = stmtKeys.reduce((acc, k) => acc + (Number(s[k]) > 0 ? 1 : 0), 0);

  // Functions
  const f = fileCov?.f || {};
  const fnKeys = Object.keys(f);
  const functionsTotal = fnKeys.length;
  const functionsCovered = fnKeys.reduce((acc, k) => acc + (Number(f[k]) > 0 ? 1 : 0), 0);

  // Branches
  const b = fileCov?.b || {};
  let branchesTotal = 0;
  let branchesCovered = 0;
  for (const k of Object.keys(b)) {
    const arr = Array.isArray(b[k]) ? b[k] : [];
    branchesTotal += arr.length;
    branchesCovered += arr.reduce((acc, n) => acc + (Number(n) > 0 ? 1 : 0), 0);
  }

  // Lines
  const l = fileCov?.l;
  let linesTotal = 0;
  let linesCovered = 0;

  if (l && typeof l === 'object') {
    const lineKeys = Object.keys(l);
    linesTotal = lineKeys.length;
    linesCovered = lineKeys.reduce((acc, k) => acc + (Number(l[k]) > 0 ? 1 : 0), 0);
  } else {
    // Fallback: derive from statementMap line numbers
    const stmtMap = fileCov?.statementMap || {};
    const lineNums = new Set();
    for (const k of Object.keys(stmtMap)) {
      const startLine = stmtMap[k]?.start?.line;
      if (Number.isFinite(startLine)) lineNums.add(Number(startLine));
    }
    linesTotal = lineNums.size;

    const coveredLines = new Set();
    for (const k of Object.keys(stmtMap)) {
      const startLine = stmtMap[k]?.start?.line;
      if (!Number.isFinite(startLine)) continue;
      if (Number(s[k]) > 0) coveredLines.add(Number(startLine));
    }
    linesCovered = coveredLines.size;
  }

  return {
    lines: metric(linesCovered, linesTotal),
    statements: metric(statementsCovered, statementsTotal),
    functions: metric(functionsCovered, functionsTotal),
    branches: metric(branchesCovered, branchesTotal),
  };
}

function mergeSummaries(a, b) {
  const out = { ...a };
  for (const key of ['lines', 'statements', 'functions', 'branches']) {
    const left = a[key] || metric(0, 0);
    const right = b[key] || metric(0, 0);
    const total = (left.total || 0) + (right.total || 0);
    const covered = (left.covered || 0) + (right.covered || 0);
    out[key] = metric(covered, total);
  }
  return out;
}

function repoRel(filePath) {
  const ws = process.env.GITHUB_WORKSPACE || process.cwd();
  const norm = String(filePath).replace(/\\/g, '/');
  const wsNorm = String(ws).replace(/\\/g, '/').replace(/\/+$/, '');

  if (norm.startsWith(wsNorm + '/')) return norm.slice(wsNorm.length + 1);
  if (norm.startsWith('./')) return norm.replace(/^\.\/+/, '');
  return norm;
}

function bucketFor(relPath) {
  const m = relPath.match(/^(apps|sdks|utils|types|services)\/[^\/]+/);
  if (m) return m[0];
  return 'root';
}

function slugify(bucket) {
  return bucket.replace(/[\/\\]+/g, '__').replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function writeSummaryFile(outPath, summaryObj) {
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, JSON.stringify(summaryObj, null, 2) + '\n', 'utf8');
}

function main() {
  if (!fs.existsSync(COVERAGE_FINAL)) {
    console.error(`Missing ${COVERAGE_FINAL}. Did Jest run with --coverage?`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(COVERAGE_FINAL, 'utf8'));
  const files = Object.keys(raw);

  if (!files.length) {
    console.error('coverage-final.json is empty (no files).');
    process.exit(1);
  }

  ensureDir(OUT_WORKSPACES_DIR);

  const workspaceAgg = new Map(); // bucket -> { total: metrics }
  let overallAgg = {
    total: {
      lines: metric(0, 0),
      statements: metric(0, 0),
      functions: metric(0, 0),
      branches: metric(0, 0),
    },
  };

  for (const filePath of files) {
    const rel = repoRel(filePath);
    const bucket = bucketFor(rel);
    const fileSummary = summarizeFile(raw[filePath]);

    overallAgg.total = mergeSummaries(overallAgg.total, fileSummary);

    const prev = workspaceAgg.get(bucket) || {
      total: {
        lines: metric(0, 0),
        statements: metric(0, 0),
        functions: metric(0, 0),
        branches: metric(0, 0),
      },
    };
    prev.total = mergeSummaries(prev.total, fileSummary);
    workspaceAgg.set(bucket, prev);
  }

  writeSummaryFile(OUT_OVERALL, overallAgg);

  const index = [];
  for (const [bucket, summary] of Array.from(workspaceAgg.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const slug = slugify(bucket);
    const out = path.join(OUT_WORKSPACES_DIR, slug, 'coverage-summary.json');
    writeSummaryFile(out, summary);

    index.push({
      bucket,
      slug,
      path: path.relative(process.cwd(), out).replace(/\\/g, '/'),
    });
  }

  fs.writeFileSync(path.join(OUT_WORKSPACES_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');

  console.log(`Wrote overall: ${path.relative(process.cwd(), OUT_OVERALL)}`);
  console.log(`Wrote buckets: ${index.length} -> ${path.relative(process.cwd(), OUT_WORKSPACES_DIR)}/`);
}

main();
