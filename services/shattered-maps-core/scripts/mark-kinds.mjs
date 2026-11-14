#!/usr/bin/env node
/**
 * Marks mazes, teleport runs and loops on an audited map (see src/kinds.ts).
 *
 *   node services/shattered-maps-core/scripts/mark-kinds.mjs --in <audited-map.json> --propose [--min-exits 30] [--min-share 0.3]
 *       prints the subzones whose exits mostly do not lead straight on, worst first. Writes nothing: the owner decides which are mazes.
 *   node services/shattered-maps-core/scripts/mark-kinds.mjs --in <audited-map.json> --kinds <kinds.json> --out <audited-map.json>
 *       sets the kinds the owner confirmed: kinds.json is { "<subzone id>": "maze" | "teleport" | "loop" | "consistent" }.
 *
 * Only the `kind` of the named subzones changes. The output path may not contain a `wwwroot` segment (the publisher is the only way onto the site).
 */
/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const KINDS = ['maze', 'teleport', 'loop', 'consistent'];

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--propose') {
      args.propose = true;
      continue;
    }
    if (!['--in', '--kinds', '--out', '--min-exits', '--min-share'].includes(arg)) throw new Error(`unknown argument: ${arg}`);
    const value = argv[(i += 1)];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    args[arg.slice(2)] = value;
  }
  if (!args.in) throw new Error('--in is required');
  if (!args.propose && !(args.kinds && args.out)) throw new Error('give --propose, or --kinds and --out');
  if (args.propose && (args.kinds || args.out)) throw new Error('--propose writes nothing: do not combine it with --kinds or --out');
  for (const key of ['min-exits', 'min-share'])
    if (args[key] !== undefined && !(Number.isFinite(Number(args[key])) && Number(args[key]) >= 0)) throw new Error(`--${key} must be a number from 0`);
  if (args.out && path.resolve(args.out).split(/[\\/]/).some((seg) => seg.toLowerCase() === 'wwwroot'))
    throw new Error('--out may not be under a wwwroot folder: the audited layer is published with publish-audited.mjs, on the owner\'s word');
  return args;
}

/** Checks a kinds file: an object of subzone id to a known kind. */
export function readKinds(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('the kinds file must be an object of subzone id to kind');
  for (const [id, kind] of Object.entries(raw)) if (!KINDS.includes(kind)) throw new Error(`${id}: "${String(kind)}" is not one of ${KINDS.join(', ')}`);
  return raw;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distEntry = path.join(here, '..', 'dist', 'index.js');
  if (!fs.existsSync(distEntry)) throw new Error('the package is not built: run `pnpm --filter @shatteredarchive/shattered-maps-core build` first');
  const core = await import(pathToFileURL(distEntry).href);
  const map = JSON.parse(fs.readFileSync(path.resolve(args.in), 'utf8'));
  if (args.propose) {
    const proposals = core.proposeKinds(map, {
      ...(args['min-exits'] !== undefined ? { minExits: Number(args['min-exits']) } : {}),
      ...(args['min-share'] !== undefined ? { minShare: Number(args['min-share']) } : {}),
    });
    console.log(JSON.stringify(proposals.map((p) => ({ ...p, share: Math.round(p.share * 1000) / 1000 })), null, 2));
    return;
  }
  const kinds = readKinds(JSON.parse(fs.readFileSync(path.resolve(args.kinds), 'utf8')));
  const { map: next, changed, unknown } = core.applyKinds(map, kinds);
  const checked = core.validateMapFile(next);
  if (!checked.ok) throw new Error(`the result is not a valid map: ${checked.errors.slice(0, 3).join('; ')}`);
  const out = path.resolve(args.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(next), 'utf8');
  console.log(JSON.stringify({ out, changed, unknown }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`mark-kinds: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
