#!/usr/bin/env node
/**
 * Builds the map of the SIMULACRUM from the game's own area files: every file `area.lst` lists, read with the same parser the MUD Builder uses.
 *
 *   pnpm --filter @shatteredarchive/shattered-maps-core build
 *   node services/shattered-maps-core/scripts/import-merc.mjs --area-dir <merc-mud/2.4/area> --out <audited-map.json> [--walked <walked layer>] [--report <report.json>] [--date YYYY-MM-DD]
 *   node services/shattered-maps-core/scripts/publish-audited.mjs --in <audited-map.json> --out <the sandbox folder> --date YYYY-MM-DD
 *
 * `--walked` lays what was really walked in the Simulacrum (the `replay:world --world sandbox` layer; its progress file must say `sandbox`) over
 * the map as evidence and reports every disagreement between the walks and the files. It never adds a room or a link.
 *
 * Nothing is published here, and nothing is written next to the area files. The Simulacrum is the owner's own game on the owner's machine:
 * the output path may not be under a `wwwroot` folder (that ships with the web site) and the area folder is only read. Files named in
 * `area.lst` that are missing on disk, and files that do not parse, are listed in the report and left out; they do not stop the run.
 */
/* global console, process */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSandboxLayer } from './build-sandbox.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const args = { date: new Date().toISOString().slice(0, 10) };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue; // pnpm passes a literal --
    if (!['--area-dir', '--out', '--report', '--walked', '--date'].includes(arg)) throw new Error(`unknown argument: ${arg}`);
    const value = argv[(i += 1)];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    args[arg.slice(2).replace(/-([a-z])/g, (_m, c) => c.toUpperCase())] = value;
  }
  for (const [key, flag] of [['areaDir', '--area-dir'], ['out', '--out']]) if (!args[key]) throw new Error(`${flag} is required`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error('--date must be YYYY-MM-DD');
  for (const key of ['out', 'report'])
    if (args[key] && path.resolve(args[key]).split(/[\\/]/).some((seg) => seg.toLowerCase() === 'wwwroot'))
      throw new Error(`--${key} may not be under a wwwroot folder: the Simulacrum's map is local to the owner's machine`);
  return args;
}

/** The files `area.lst` names, in order (`$` ends the list; blank lines are skipped). */
export function listedFiles(listText) {
  const files = [];
  for (const raw of listText.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '$') break;
    if (line !== '') files.push(line);
  }
  return files;
}

/** Parses every listed file; returns the inputs for `mapFromMerc` and the files that were missing or failed. */
export function readAreas(areaDir, parseAreaFile) {
  const listPath = path.join(areaDir, 'area.lst');
  if (!fs.existsSync(listPath)) throw new Error(`no area.lst in ${areaDir}`);
  const files = [];
  const missing = [];
  const failed = [];
  for (const file of listedFiles(fs.readFileSync(listPath, 'utf8'))) {
    const full = path.join(areaDir, file);
    if (!fs.existsSync(full)) {
      missing.push(file);
      continue;
    }
    try {
      files.push({ file, area: parseAreaFile(fs.readFileSync(full, 'utf8')) });
    } catch (error) {
      failed.push({ file, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { files, missing, failed };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distEntry = path.join(here, '..', 'dist', 'index.js');
  if (!fs.existsSync(distEntry)) throw new Error('the package is not built: run `pnpm --filter @shatteredarchive/shattered-maps-core build` first');
  const core = await import(pathToFileURL(distEntry).href);
  const merc = await import(pathToFileURL(createRequire(distEntry).resolve('@shatteredarchive/merc-area')).href);

  const { files, missing, failed } = readAreas(path.resolve(args.areaDir), merc.parseAreaFile);
  const built = core.mapFromMerc(files, { date: args.date });
  const { report } = built;
  let map = built.map;
  let walkedReport;
  if (args.walked) {
    const layer = core.validateMapFile(readSandboxLayer(path.resolve(args.walked)));
    if (!layer.ok) throw new Error(`the walked layer is not a valid map: ${layer.errors.slice(0, 3).join('; ')}`);
    const reconciled = core.reconcileWalked(map, layer.map);
    map = reconciled.map;
    walkedReport = reconciled.report;
  }
  const valid = core.validateMapFile(map);
  if (!valid.ok) throw new Error(`the result is not a valid map: ${valid.errors.slice(0, 3).join('; ')}`);

  const out = path.resolve(args.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(map), 'utf8');
  const full = { ...report, missingFiles: missing, unparsedFiles: failed, ...(walkedReport ? { walked: walkedReport } : {}) };
  if (args.report) {
    fs.mkdirSync(path.dirname(path.resolve(args.report)), { recursive: true });
    fs.writeFileSync(path.resolve(args.report), JSON.stringify(full, null, 2), 'utf8');
  }
  const { perArea, deadList, walked, ...totals } = full;
  const walkedSummary = walked ? { walked: { ...walked, unmatchedTitles: walked.unmatchedTitles.length, disagreements: walked.disagreements.length } } : {};
  console.log(JSON.stringify({ out, date: args.date, ...totals, areasListed: perArea.length, deadShown: deadList.length, ...walkedSummary }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`import-merc: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
