#!/usr/bin/env node
/**
 * Lays out the area boxes of one continent of an audited map without overlap (see src/continentLayout.ts) and writes the map with the new
 * placements. The spec (which area is the centre, which area sits in which compass direction from which) is the owner's geography; it is a
 * JSON file kept with the owner's data, never in this repository:
 *
 *   { "continent": "<continent id>", "center": "<area id>", "gap": 1, "sizeBy": "extent" | "rooms",
 *     "relations": [ { "area": "<area id>", "of": "<area id>", "dir": "W" }, ... ] }
 *
 *   pnpm --filter @shatteredarchive/shattered-maps-core build
 *   node services/shattered-maps-core/scripts/layout-continent.mjs --in <audited-map.json> --spec <layout.json> --out <audited-map.json> [--size-by extent|rooms]
 *   node services/shattered-maps-core/scripts/publish-audited.mjs --in <the output> --out <folder>
 *
 * Only the `placement` of the areas of that one continent changes; no room, link or area is added or removed. The report (printed) says how many pairs of
 * areas overlapped before and after, how many moved, and what the spec asked for that could not be done. The output path may not contain a `wwwroot`
 * segment: the layer reaches the site only through the publisher, on the owner's word.
 */
/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue; // pnpm passes a literal --
    if (!['--in', '--spec', '--out', '--size-by'].includes(arg)) throw new Error(`unknown argument: ${arg}`);
    const value = argv[(i += 1)];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    args[arg.slice(2)] = value;
  }
  for (const needed of ['in', 'spec', 'out']) if (!args[needed]) throw new Error(`--${needed} is required`);
  if (args['size-by'] !== undefined && !['extent', 'rooms'].includes(args['size-by'])) throw new Error('--size-by must be extent or rooms');
  if (path.resolve(args.out).split(/[\\/]/).some((seg) => seg.toLowerCase() === 'wwwroot'))
    throw new Error('--out may not be under a wwwroot folder: the audited layer is published with publish-audited.mjs, on the owner\'s word');
  return args;
}

/** Checks the spec's shape; returns it or throws with the first thing wrong. */
export function readSpec(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('the spec must be an object');
  for (const key of ['continent', 'center']) if (typeof raw[key] !== 'string' || raw[key] === '') throw new Error(`the spec needs "${key}" (an id)`);
  if (!Array.isArray(raw.relations)) throw new Error('the spec needs "relations" (a list, empty is fine)');
  raw.relations.forEach((r, i) => {
    if (typeof r !== 'object' || r === null || typeof r.area !== 'string' || typeof r.of !== 'string' || typeof r.dir !== 'string')
      throw new Error(`relation ${i}: needs "area", "of" and "dir"`);
  });
  if (raw.gap !== undefined && !(Number.isInteger(raw.gap) && raw.gap >= 0 && raw.gap <= 20)) throw new Error('"gap" must be a whole number from 0 to 20');
  if (raw.sizeBy !== undefined && !['extent', 'rooms'].includes(raw.sizeBy)) throw new Error('"sizeBy" must be extent or rooms');
  return raw;
}

const roomCount = (area) => area.subzones.reduce((n, s) => n + s.rooms.filter((r) => r.aliasOf === undefined).length, 0);

/** Applies the layout to one continent of the map; returns the new map and the report. Pure: the input map is not changed. */
export function applyLayout(map, spec, core) {
  const continent = map.continents.find((c) => c.id === spec.continent);
  if (!continent) throw new Error(`continent ${spec.continent} is not in the map`);
  const boxes = continent.areas
    .filter((a) => a.placement !== null)
    .map((a) => ({ id: a.id, x: a.placement.x, y: a.placement.y, w: a.placement.w ?? 1, h: a.placement.h ?? 1, rooms: roomCount(a) }));
  const unplaced = continent.areas.filter((a) => a.placement === null).map((a) => a.id);
  const result = core.layoutContinent(boxes, spec);
  const next = {
    ...map,
    continents: map.continents.map((c) =>
      c.id !== spec.continent
        ? c
        : { ...c, areas: c.areas.map((a) => (result.placements.has(a.id) ? { ...a, placement: { ...result.placements.get(a.id) } } : a)) },
    ),
  };
  const report = {
    continent: spec.continent,
    areas: boxes.length,
    unplacedAreas: unplaced.length,
    sizeBy: spec.sizeBy ?? 'extent',
    overlappingPairsBefore: result.overlapsBefore,
    overlappingPairsAfter: result.overlapsAfter,
    moved: result.moved,
    warnings: result.warnings,
  };
  return { map: next, report };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distEntry = path.join(here, '..', 'dist', 'index.js');
  if (!fs.existsSync(distEntry)) throw new Error('the package is not built: run `pnpm --filter @shatteredarchive/shattered-maps-core build` first');
  const core = await import(pathToFileURL(distEntry).href);
  const spec = readSpec(JSON.parse(fs.readFileSync(path.resolve(args.spec), 'utf8')));
  if (args['size-by']) spec.sizeBy = args['size-by'];
  const map = JSON.parse(fs.readFileSync(path.resolve(args.in), 'utf8'));
  const { map: next, report } = applyLayout(map, spec, core);
  const checked = core.validateMapFile(next);
  if (!checked.ok) throw new Error(`the result is not a valid map: ${checked.errors.slice(0, 3).join('; ')}`);
  const out = path.resolve(args.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(next), 'utf8');
  console.log(JSON.stringify({ out, ...report }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`layout-continent: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
