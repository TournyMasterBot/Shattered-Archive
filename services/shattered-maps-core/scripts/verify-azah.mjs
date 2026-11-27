#!/usr/bin/env node
/**
 * Checks Azah's community map (the candidate layer the importer wrote) against walked evidence (the layer `replay:world` builds from the
 * owner's game logs), and writes the verdict of every Azah room and link.
 *
 *   pnpm --filter @shatteredarchive/shattered-maps-core build
 *   node services/shattered-maps-core/scripts/verify-azah.mjs --world dsl --azah <candidates folder> --walked <walked layer file> --out <report folder>
 *
 * Writes `verify-report.json` (every verdict, private: it names rooms) and `verify-summary.json` (counts, how walked rooms were tied, the
 * areas with the most and fewest verified rooms, examples of each disagreement class) into `--out`, and prints the summary. Reads only.
 *
 * Azah mapped the DSL and nothing else, so `--world dsl` is required and any other world is refused: a walked layer of the Simulacrum (or
 * any other game) has no business being compared with it.
 */
/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue; // pnpm passes a literal --
    if (!['--world', '--azah', '--walked', '--out'].includes(arg)) throw new Error(`unknown argument: ${arg}`);
    const value = argv[(i += 1)];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    args[arg.slice(2)] = value;
  }
  for (const needed of ['world', 'azah', 'walked', 'out']) if (!args[needed]) throw new Error(`--${needed} is required`);
  if (args.world !== 'dsl') throw new Error(`Azah mapped the DSL only: --world must be dsl (got ${args.world})`);
  return args;
}

/** The area slices of a candidate layer folder (`manifest.json` says it is the Azah layer), as parsed map files. */
export function readCandidateSlices(folder) {
  const manifestPath = path.join(folder, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`no manifest.json in ${folder}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.source?.name !== 'azah') throw new Error('that folder is not the Azah layer (manifest source is not azah)');
  const files = fs.readdirSync(folder).filter((name) => name.endsWith('.json.gz')).sort();
  return { manifest, slices: files.map((name) => JSON.parse(gunzipSync(fs.readFileSync(path.join(folder, name))).toString('utf8'))) };
}

/** The summary written beside the report: no verdict lists, nothing per room. */
export function summarize(report, areaNames) {
  const rate = (a) => (a.rooms === 0 ? 0 : (a.verified + a.verifiedDiffers) / a.rooms);
  const areas = Object.entries(report.byArea).map(([id, counts]) => ({ id, name: areaNames.get(id) ?? id, ...counts, rate: Math.round(rate(counts) * 1000) / 1000 }));
  const touched = areas.filter((a) => a.verified + a.verifiedDiffers > 0).sort((a, b) => b.rate - a.rate || b.rooms - a.rooms);
  return {
    counts: report.counts,
    areasWithAnyVerifiedRoom: touched.length,
    areasTotal: areas.length,
    bestAreas: touched.slice(0, 15),
    largestUnverifiedAreas: areas.filter((a) => a.unverified === a.rooms).sort((a, b) => b.rooms - a.rooms).slice(0, 15),
    samples: report.samples,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distEntry = path.join(here, '..', 'dist', 'index.js');
  if (!fs.existsSync(distEntry)) throw new Error('the package is not built: run `pnpm --filter @shatteredarchive/shattered-maps-core build` first');
  const core = await import(pathToFileURL(distEntry).href);

  const { manifest, slices } = readCandidateSlices(path.resolve(args.azah));
  const azah = core.mergeSlices(slices);
  const walkedFile = JSON.parse(fs.readFileSync(path.resolve(args.walked), 'utf8'));
  const checked = core.validateMapFile(walkedFile.map);
  if (!checked.ok) throw new Error(`the walked layer is not a valid map: ${checked.errors.slice(0, 3).join('; ')}`);

  const report = core.verifyAgainstWalked(azah, checked.map);
  const names = new Map();
  for (const c of azah.continents) for (const a of c.areas) names.set(a.id, a.name);
  const summary = summarize(report, names);

  const out = path.resolve(args.out);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'verify-report.json'), JSON.stringify({ azah: manifest.source, report }), 'utf8');
  fs.writeFileSync(path.join(out, 'verify-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`verify-azah: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
