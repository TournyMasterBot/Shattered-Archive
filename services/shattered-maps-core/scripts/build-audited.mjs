#!/usr/bin/env node
/**
 * Builds the PROPOSED audited map of the DSL: Azah's community map with what the owner's own play showed written onto it (the verdicts of
 * `pnpm --filter @shatteredarchive/copilot-server run replay:trace`). It writes the one file the publisher reads; nothing is published here.
 *
 *   pnpm --filter @shatteredarchive/shattered-maps-core build
 *   node services/shattered-maps-core/scripts/build-audited.mjs --world dsl --azah <candidates folder> --trace <trace report file> --out <audited-map.json> [--date YYYY-MM-DD]
 *   node services/shattered-maps-core/scripts/publish-audited.mjs --in <audited-map.json> --out <folder>
 *
 * Nothing is added or removed: every Azah room and link stays, links the walk agreed are marked walked (or confirmed when both ways agreed),
 * links it contradicted are marked conflicts, the rest keep the imported candidate confidence. See src/verify/apply.ts.
 *
 * Azah mapped the DSL only, so `--world dsl` is required. The output path may not contain a `wwwroot` segment: the audited layer reaches
 * the site only through the publisher, on the owner's word.
 */
/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCandidateSlices } from './verify-azah.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const args = { date: new Date().toISOString().slice(0, 10) };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue; // pnpm passes a literal --
    if (!['--world', '--azah', '--trace', '--out', '--date'].includes(arg)) throw new Error(`unknown argument: ${arg}`);
    const value = argv[(i += 1)];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    args[arg.slice(2)] = value;
  }
  for (const needed of ['world', 'azah', 'trace', 'out']) if (!args[needed]) throw new Error(`--${needed} is required`);
  if (args.world !== 'dsl') throw new Error(`Azah mapped the DSL only: --world must be dsl (got ${args.world})`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error('--date must be YYYY-MM-DD');
  if (path.resolve(args.out).split(/[\\/]/).some((seg) => seg.toLowerCase() === 'wwwroot'))
    throw new Error('--out may not be under a wwwroot folder: the audited layer is published with publish-audited.mjs, on the owner\'s word');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distEntry = path.join(here, '..', 'dist', 'index.js');
  if (!fs.existsSync(distEntry)) throw new Error('the package is not built: run `pnpm --filter @shatteredarchive/shattered-maps-core build` first');
  const core = await import(pathToFileURL(distEntry).href);

  const { slices } = readCandidateSlices(path.resolve(args.azah));
  const azah = core.mergeSlices(slices);
  const trace = JSON.parse(fs.readFileSync(path.resolve(args.trace), 'utf8'));
  const report = trace.report;
  if (!report || !report.links || !report.evidence || !report.walkedOn)
    throw new Error('that is not a trace report with link evidence: run replay:trace again with the current build');

  const { map, counts } = core.applyTrace(azah, report, { date: args.date });
  const checked = core.validateMapFile(map);
  if (!checked.ok) throw new Error(`the result is not a valid map: ${checked.errors.slice(0, 3).join('; ')}`);

  const out = path.resolve(args.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(map), 'utf8');
  console.log(JSON.stringify({ out, date: args.date, rooms: report.counts.azahRooms, links: report.counts.azahLinks, ...counts }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`build-audited: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
