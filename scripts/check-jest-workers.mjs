#!/usr/bin/env node
/**
 * Guard: every place that RUNS jest from a file (a package.json script, a GitHub workflow `run:` line, a
 * Dockerfile `RUN` line) must bound its workers: `--runInBand` / `-i`, or `--maxWorkers` 1-4.
 *
 * Why: without a bound jest starts one worker per core, and a worker on this suite holds ~4 GB. A bare
 * run on a 32-core machine used 112 GB and froze it (2026-11-19). The matching rule is shared with the
 * Claude Code hook that blocks the same command typed by hand (.claude/hooks/jest-guard.js), so the two
 * cannot drift. Someone who passes a large --maxWorkers on the command line chose it; this guard is for
 * the accidental case (a new package script, a new CI step).
 *
 * Usage: node scripts/check-jest-workers.mjs [repoRoot]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { verdict } = require('../.claude/hooks/jest-guard.js');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.pnpm-store']);

/** Every package.json under the repo (not inside node_modules or build output). */
export function listManifests(root) {
  const found = [];
  const walk = (dir, depth) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || depth >= 4) continue;
        walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.name === 'package.json') {
        found.push(path.join(dir, entry.name));
      }
    }
  };
  walk(root, 0);
  return found;
}

function filesIn(dir, test) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(test).map((f) => path.join(dir, f));
}

/** Each violation: { file, where, command }. Empty list = the repo is clean. */
export function findViolations(root) {
  const violations = [];
  const rel = (f) => path.relative(root, f).split(path.sep).join('/');

  for (const manifest of listManifests(root)) {
    let scripts = {};
    try {
      scripts = JSON.parse(fs.readFileSync(manifest, 'utf8')).scripts ?? {};
    } catch {
      continue; // not valid JSON: another tool reports that
    }
    for (const [name, command] of Object.entries(scripts)) {
      if (typeof command === 'string' && verdict(command)) {
        violations.push({ file: rel(manifest), where: `scripts.${name}`, command });
      }
    }
  }

  const lineFiles = [
    ...filesIn(path.join(root, '.github', 'workflows'), (f) => /\.ya?ml$/.test(f)),
    ...filesIn(path.join(root, 'deploy'), (f) => /Dockerfile/i.test(f)),
  ];
  for (const file of lineFiles) {
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((line, i) => {
        // A YAML key other than `run:` (a step `name:`, `uses:`, `if:`) is a label, not a command.
        if (/^\s*(?:-\s+)?(?!run:)[A-Za-z_-]+:(?:\s|$)/.test(line)) return;
        const text = line.replace(/^\s*(?:-\s+)?(?:run:|RUN)\s*/i, '').trim();
        if (text && !text.startsWith('#') && verdict(text)) {
          violations.push({ file: rel(file), where: `line ${i + 1}`, command: text });
        }
      });
  }
  return violations;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const root = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const violations = findViolations(root);
  if (violations.length) {
    console.error('jest is run without a worker bound (add --runInBand, or --maxWorkers 1-4):');
    for (const v of violations) console.error(`  ${v.file} ${v.where}: ${v.command}`);
    process.exit(1);
  }
  console.log('check-jest-workers: every jest invocation in package.json, workflows and Dockerfiles is bounded.');
}
