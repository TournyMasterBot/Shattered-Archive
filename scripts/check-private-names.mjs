#!/usr/bin/env node
/**
 * Local gate: no real character name from the private Copilot data may appear in a file of this repository
 * (docs/standards/edge-cases/game-data-privacy.md, PRIVNAME-01).
 *
 * The names come from the private test-character matrix in the DSL data repository and, when given, from extra name files.
 * It scans every tracked and untracked-but-not-ignored text file, matching whole words case-insensitively.
 * The report prints file and line only, never the name, so a failing run does not itself spread a name.
 *
 * This needs the private data, so it runs on the owner's machine (and in the phases that name it), not in CI.
 *
 * Usage: node scripts/check-private-names.mjs [--root <repo>] [--matrix <json>] [--names <txt>]...
 *   --matrix  defaults to C:/Projects/DSL/docs/copilot/test-character-matrix.json
 *   --names   a text file with one name per line (for example an export of the Copilot registry)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_MATRIX = 'C:/Projects/DSL/docs/copilot/test-character-matrix.json';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.pdf', '.zip', '.gz', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4',
  '.wasm', '.psd', '.exe', '.dll', '.bin', '.onnx',
]);
// This script's own tests use invented names; the matrix and registry never live in this repository.
const NAME_SHAPE = /^[A-Za-z][A-Za-z'-]{1,29}$/;

/** Names (male and female columns) from the matrix JSON; rows or names that are malformed are skipped. */
export function namesFromMatrix(json) {
  if (!Array.isArray(json)) throw new TypeError('matrix must be an array of rows');
  const names = [];
  for (const row of json) {
    if (typeof row !== 'object' || row === null) continue;
    for (const key of ['male', 'female']) {
      const value = row[key];
      if (typeof value === 'string' && NAME_SHAPE.test(value.trim())) names.push(value.trim());
    }
  }
  return names;
}

export function namesFromText(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => NAME_SHAPE.test(l));
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @returns {{file: string, line: number}[]} one entry per line that contains any of the names as a whole word */
export function scanFiles(root, files, names) {
  const unique = [...new Set(names.map((n) => n.toLowerCase()))].sort((a, b) => b.length - a.length);
  if (unique.length === 0) return [];
  const pattern = new RegExp(`(?<![A-Za-z])(?:${unique.map(escapeRegExp).join('|')})(?![A-Za-z])`, 'i');
  const hits = [];
  for (const file of files) {
    if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    const full = path.join(root, file);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue; // listed by git but deleted in the working tree
    }
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
    const lines = fs.readFileSync(full, 'utf8').split('\n');
    lines.forEach((text, index) => {
      if (pattern.test(text)) hits.push({ file, line: index + 1 });
    });
  }
  return hits;
}

/** Tracked files plus untracked files that are not ignored. */
export function listRepoFiles(root) {
  const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    maxBuffer: 256 * 1024 * 1024,
  }).toString('utf8');
  return [...new Set(out.split('\0').filter(Boolean))];
}

function parseArgs(argv) {
  const out = { root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), matrix: DEFAULT_MATRIX, names: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') out.root = path.resolve(argv[++i]);
    else if (argv[i] === '--matrix') out.matrix = argv[++i];
    else if (argv[i] === '--names') out.names.push(argv[++i]);
  }
  return out;
}

function main() {
  const { root, matrix, names: nameFiles } = parseArgs(process.argv.slice(2));
  const names = namesFromMatrix(JSON.parse(fs.readFileSync(matrix, 'utf8')));
  for (const file of nameFiles) names.push(...namesFromText(fs.readFileSync(file, 'utf8')));
  const files = listRepoFiles(root);
  const hits = scanFiles(root, files, names);
  if (hits.length === 0) {
    console.log(`check-private-names: OK (${new Set(names.map((n) => n.toLowerCase())).size} names, ${files.length} files scanned)`);
    return;
  }
  console.error(`check-private-names: FAILED. ${hits.length} line(s) contain a private character name (names are not printed):`);
  for (const hit of hits) console.error(`  ${hit.file}:${hit.line}`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
