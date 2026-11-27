#!/usr/bin/env node
/**
 * Guard for "documentation is part of done": before a work item asks for sign-off, list what its changes leave stale.
 *
 *  1. DOC HITS   every doc (*.md) that names a changed code file (by file name or file stem) but was not changed itself.
 *  2. INDEX GAPS every folder that holds changed files and has an `.ai-context` or `.annotated`, when neither was changed.
 *
 * A finding is RESOLVED when the item's test-results.md mentions the doc path (hit) or the folder path (gap): the
 * implementer either updated it, or recorded "checked, still accurate" with a reason. Without an item folder every
 * finding is reported. Exit 1 while any finding is unresolved.
 *
 * It looks at the whole working tree (git status), so changes from other items in the same tree show up too: resolve
 * those by naming them as unrelated in test-results.md. Why it exists: the first documentation sweep of
 * 2026-11-18_autopilot-live-test-findings repeated what the phases had touched and missed a stale feature doc, a stale
 * folder index, a sync-contract doc and the indexes of the tooling folders.
 *
 * Usage: node scripts/check-doc-impact.mjs [itemFolder] [repoRoot] [--files a,b,c]
 *   --files   treat these repo-relative files as the changed set instead of git status (a plan runs it on its Edit map before any code changes)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.ai-plans', '.ai-plans-completed', '.pr', '.pr-drafts']);
const NOT_CODE = /(\.test\.|\.spec\.|\.selftest\.|[\\/]__snapshots__[\\/]|\.(png|jpg|gif|ico|svg|json|lock|yaml|yml|xml|map)$|\.annotated$|\.ai-context$|\.md$)/i;
const PLAN_AREAS = /^(\.ai-plans|\.ai-plans-completed|\.pr|\.pr-drafts)\//;
const MIN_STEM = 6; // shorter stems (index, app, main) would match everything

export function changedFiles(root) {
  const out = execFileSync('git', ['-C', root, 'status', '--short', '--untracked-files=all'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).replace(/^.* -> /, '').replace(/"/g, ''))
    .filter((f) => !PLAN_AREAS.test(f));
}

function walkDocs(root) {
  const docs = new Map();
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.md$/i.test(e.name)) docs.set(path.relative(root, p).split(path.sep).join('/'), fs.readFileSync(p, 'utf8'));
    }
  })(root);
  return docs;
}

/** Docs that name a changed code file but were not changed. Returns [{ doc, names }]. */
export function findDocHits(changed, docs) {
  const changedSet = new Set(changed);
  const code = changed.filter((f) => !NOT_CODE.test(f));
  const hits = new Map();
  for (const f of code) {
    const base = path.posix.basename(f);
    const stem = base.replace(/\.[^.]+$/, '');
    if (stem.length < MIN_STEM) continue;
    for (const [doc, text] of docs) {
      if (changedSet.has(doc)) continue;
      if (text.includes(base) || text.includes(stem)) {
        if (!hits.has(doc)) hits.set(doc, new Set());
        hits.get(doc).add(base);
      }
    }
  }
  return [...hits].sort(([a], [b]) => a.localeCompare(b)).map(([doc, names]) => ({ doc, names: [...names] }));
}

/** Folders with changed code and an index, where no index file of that folder changed. Returns [folder]. */
export function findIndexGaps(changed, root) {
  const changedSet = new Set(changed);
  const gaps = new Set();
  for (const f of changed.filter((x) => !NOT_CODE.test(x))) {
    let dir = path.posix.dirname(f);
    while (true) {
      const hasIndex = ['.ai-context', '.annotated'].some((n) => fs.existsSync(path.join(root, dir === '.' ? '' : dir, n)));
      if (hasIndex) {
        const touched = ['.ai-context', '.annotated'].some((n) => changedSet.has(dir === '.' ? n : `${dir}/${n}`));
        if (!touched) gaps.add(dir);
        break;
      }
      if (dir === '.' || dir === '') break;
      dir = path.posix.dirname(dir);
    }
  }
  return [...gaps].sort();
}

/** Split findings into resolved and unresolved by what the item's test-results.md mentions. */
export function checkImpact({ changed, root, docs, resolvedText = '' }) {
  const mentioned = (p) => resolvedText.includes(p);
  const hits = findDocHits(changed, docs ?? walkDocs(root));
  const gaps = findIndexGaps(changed, root);
  return {
    unresolvedHits: hits.filter((h) => !mentioned(h.doc)),
    unresolvedGaps: gaps.filter((g) => !mentioned(g === '.' ? 'repo root' : g)),
    resolvedHits: hits.filter((h) => mentioned(h.doc)).length,
    resolvedGaps: gaps.filter((g) => mentioned(g === '.' ? 'repo root' : g)).length,
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const filesAt = argv.indexOf('--files');
  const explicit = filesAt >= 0 ? (argv[filesAt + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean) : null;
  const positional = argv.filter((a, i) => !a.startsWith('--') && (filesAt < 0 || i !== filesAt + 1));
  const item = positional[0];
  const root = path.resolve(positional[1] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const resultsFile = item ? path.join(item, 'test-results.md') : null;
  if (resultsFile && !fs.existsSync(resultsFile)) {
    console.error(`no test-results.md in ${item}`);
    process.exit(2);
  }
  const r = checkImpact({ changed: explicit ?? changedFiles(root), root, resolvedText: resultsFile ? fs.readFileSync(resultsFile, 'utf8') : '' });
  console.log(`doc impact: ${r.unresolvedHits.length} doc(s) naming a changed file and ${r.unresolvedGaps.length} folder index(es) unresolved (${r.resolvedHits + r.resolvedGaps} already recorded)`);
  for (const h of r.unresolvedHits) console.log(`  DOC    ${h.doc}  <- ${h.names.slice(0, 5).join(', ')}${h.names.length > 5 ? ' ...' : ''}`);
  for (const g of r.unresolvedGaps) console.log(`  INDEX  ${g}/  has changed files and neither .ai-context nor .annotated was touched`);
  if (r.unresolvedHits.length || r.unresolvedGaps.length) {
    console.log('Update each one, or record it in test-results.md by its path with "checked, still accurate: <reason>" (or "unrelated change: <item>").');
    process.exit(1);
  }
}
