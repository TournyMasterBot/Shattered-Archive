#!/usr/bin/env node
/**
 * Builds the map of the SIMULACRUM (the owner's own experimental MUD) from the walked layer `replay:world --world sandbox` wrote: it gives the
 * rooms a place on the grid (walks record where an exit leads, never where a room is) and names the one area. It writes the one file the
 * publisher reads; nothing is published here.
 *
 *   node services/shattered-maps-core/scripts/build-sandbox.mjs --world sandbox --walked <walked layer file> --out <audited-map.json> [--date YYYY-MM-DD]
 *   node services/shattered-maps-core/scripts/publish-audited.mjs --in <audited-map.json> --out <the sandbox folder> --date YYYY-MM-DD
 *
 * The Simulacrum is a world of its own, local to the owner's machine: it shares no room with the DSL and nothing of Azah's map may touch it. So
 * `--world sandbox` is required, and the walked layer must say, in its progress file, that it was built for the sandbox world: the DSL's walked
 * layer is refused. The output path may not contain a \`wwwroot\` folder, and the sandbox folder is never published into the DSL repo.
 */
/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const args = { date: new Date().toISOString().slice(0, 10) };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue; // pnpm passes a literal --
    if (!['--world', '--walked', '--out', '--date'].includes(arg)) throw new Error(`unknown argument: ${arg}`);
    const value = argv[(i += 1)];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    args[arg.slice(2)] = value;
  }
  for (const needed of ['world', 'walked', 'out']) if (!args[needed]) throw new Error(`--${needed} is required`);
  if (args.world !== 'sandbox') throw new Error(`this builds the Simulacrum's map only: --world must be sandbox (got ${args.world})`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error('--date must be YYYY-MM-DD');
  if (path.resolve(args.out).split(/[\\/]/).some((seg) => seg.toLowerCase() === 'wwwroot'))
    throw new Error('--out may not be under a wwwroot folder: the Simulacrum\'s map is local to the owner\'s machine');
  return args;
}

/** The walked layer's map, after checking that its progress file names the sandbox world. */
export function readSandboxLayer(file) {
  const progressFile = `${file}.progress.json`;
  if (!fs.existsSync(progressFile)) throw new Error(`no ${path.basename(progressFile)} beside the layer: it does not say which world it belongs to`);
  const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
  if (progress.world !== 'sandbox') throw new Error(`that layer belongs to the ${progress.world} world, not sandbox: it is not used for the Simulacrum's map`);
  const layer = JSON.parse(fs.readFileSync(file, 'utf8'));
  return layer.map;
}

/** Names the one walked continent, area and subzone for people, and places the area on its continent. */
export function nameWalked(map) {
  const out = JSON.parse(JSON.stringify(map));
  for (const continent of out.continents) {
    continent.name = 'Simulacrum';
    for (const area of continent.areas) {
      area.name = 'Walked so far';
      area.placement = { x: 0, y: 0, w: 20, h: 20 };
      for (const subzone of area.subzones) subzone.name = 'Walked';
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distEntry = path.join(here, '..', 'dist', 'index.js');
  if (!fs.existsSync(distEntry)) throw new Error('the package is not built: run `pnpm --filter @shatteredarchive/shattered-maps-core build` first');
  const core = await import(pathToFileURL(distEntry).href);

  const checked = core.validateMapFile(readSandboxLayer(path.resolve(args.walked)));
  if (!checked.ok) throw new Error(`the walked layer is not a valid map: ${checked.errors.slice(0, 3).join('; ')}`);
  const laid = core.layoutUnplaced(nameWalked(checked.map));
  laid.map.generatedAt = args.date;
  const valid = core.validateMapFile(laid.map);
  if (!valid.ok) throw new Error(`the result is not a valid map: ${valid.errors.slice(0, 3).join('; ')}`);

  const out = path.resolve(args.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(laid.map), 'utf8');
  console.log(JSON.stringify({ out, date: args.date, placed: laid.placed, groups: laid.groups }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`build-sandbox: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
