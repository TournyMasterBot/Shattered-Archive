#!/usr/bin/env node
/**
 * Lays out every continent that has no owner-written spec, from the links between its areas (see src/autoLayout.ts), without overlap.
 *
 *   pnpm --filter @shatteredarchive/shattered-maps-core build
 *   node services/shattered-maps-core/scripts/layout-auto.mjs --in <audited-map.json> --out <audited-map.json> [--specs <folder of owner specs>] [--skip <id>,<id>] [--size-by extent|rooms]
 *
 * Also: `--extend <folder of owner specs>` (instead of `--specs`) keeps each owner spec's relations and relates the areas the spec leaves out by their links;
 * `--gap <cells>` and `--cells-per-room <n>` set the space between boxes and the box size (smaller number, smaller boxes in proportion).
 *
 * A continent that an owner spec in `--specs` names (the spec's "continent" field), or that `--skip` lists, is left exactly as it is: the owner's geography
 * wins. A continent no link joins two areas of is left alone too. Only the `placement` of areas changes. The output path may not contain a `wwwroot`
 * segment: the layer reaches the site only through publish-audited.mjs, on the owner's word.
 */
/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyLayout } from './layout-continent.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (!['--in', '--out', '--specs', '--extend', '--skip', '--size-by', '--gap', '--cells-per-room'].includes(arg)) throw new Error(`unknown argument: ${arg}`);
    const value = argv[(i += 1)];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    args[arg.slice(2)] = value;
  }
  for (const needed of ['in', 'out']) if (!args[needed]) throw new Error(`--${needed} is required`);
  if (args['size-by'] !== undefined && !['extent', 'rooms'].includes(args['size-by'])) throw new Error('--size-by must be extent or rooms');
  if (args.gap !== undefined && !(/^\d+$/.test(args.gap) && Number(args.gap) <= 20)) throw new Error('--gap must be a whole number from 0 to 20');
  if (args['cells-per-room'] !== undefined && !(Number(args['cells-per-room']) >= 0.2 && Number(args['cells-per-room']) <= 10)) throw new Error('--cells-per-room must be a number from 0.2 to 10');
  if (args.specs !== undefined && args.extend !== undefined) throw new Error('--specs and --extend name the same kind of folder: give one');
  if (path.resolve(args.out).split(/[\\/]/).some((seg) => seg.toLowerCase() === 'wwwroot'))
    throw new Error('--out may not be under a wwwroot folder: the audited layer is published with publish-audited.mjs, on the owner\'s word');
  return args;
}

/** The continent ids the spec files of a folder name. */
export function ownerContinents(dir) {
  const ids = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    let spec;
    try {
      spec = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch {
      continue; // not a spec (kinds-proposed.json and the like may be unreadable here): skip it
    }
    if (typeof spec?.continent === 'string' && Array.isArray(spec.relations)) ids.push(spec.continent);
  }
  return ids;
}

/** The owner specs of a folder, by continent id. */
export function ownerSpecs(dir) {
  const specs = new Map();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    let spec;
    try {
      spec = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch {
      continue;
    }
    if (typeof spec?.continent === 'string' && Array.isArray(spec.relations)) specs.set(spec.continent, spec);
  }
  return specs;
}

/**
 * Applies the automatic layout to every continent that is not skipped. A continent in `extend` (continent id -> owner spec) keeps the owner's relations and
 * has the areas the spec leaves out related by their links. `options` (gap, cellsPerRoom) go to every continent. Returns the new map and one line per continent.
 */
export function layoutAll(map, skip, sizeBy, core, extend = new Map(), options = {}) {
  let next = map;
  const lines = [];
  for (const continent of map.continents) {
    if (skip.has(continent.id)) {
      lines.push({ continent: continent.id, name: continent.name, result: 'kept (owner layout or skipped)' });
      continue;
    }
    const base = extend.get(continent.id);
    const spec = core.autoSpec(next, continent.id, { sizeBy, ...options, ...(base ? { base } : {}) });
    if (spec === null) {
      lines.push({ continent: continent.id, name: continent.name, result: 'no link joins two areas: left as it is' });
      continue;
    }
    const applied = applyLayout(next, { continent: continent.id, ...spec }, core);
    next = applied.map;
    lines.push({
      continent: continent.id,
      name: continent.name,
      result: base ? 'laid out (the owner spec extended)' : 'laid out',
      areas: applied.report.areas,
      related: spec.relations.length + 1,
      overlappingPairsBefore: applied.report.overlappingPairsBefore,
      overlappingPairsAfter: applied.report.overlappingPairsAfter,
      outsideOutline: applied.report.outsideOutline,
      warnings: applied.report.warnings.length,
    });
  }
  return { map: next, lines };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distEntry = path.join(here, '..', 'dist', 'index.js');
  if (!fs.existsSync(distEntry)) throw new Error('the package is not built: run `pnpm --filter @shatteredarchive/shattered-maps-core build` first');
  const core = await import(pathToFileURL(distEntry).href);
  const skip = new Set([...(args.skip ? args.skip.split(',') : []), ...(args.specs ? ownerContinents(path.resolve(args.specs)) : [])]);
  const map = JSON.parse(fs.readFileSync(path.resolve(args.in), 'utf8'));
  const extend = args.extend ? ownerSpecs(path.resolve(args.extend)) : new Map();
  const options = { ...(args.gap !== undefined ? { gap: Number(args.gap) } : {}), ...(args['cells-per-room'] !== undefined ? { cellsPerRoom: Number(args['cells-per-room']) } : {}) };
  const { map: next, lines } = layoutAll(map, skip, args['size-by'] ?? 'rooms', core, extend, options);
  const checked = core.validateMapFile(next);
  if (!checked.ok) throw new Error(`the result is not a valid map: ${checked.errors.slice(0, 3).join('; ')}`);
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(path.resolve(args.out), JSON.stringify(next), 'utf8');
  console.log(JSON.stringify(lines, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`layout-auto: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
