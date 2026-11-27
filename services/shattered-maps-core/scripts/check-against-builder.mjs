#!/usr/bin/env node
/**
 * Checks that the Simulacrum's map (made from the game's area files by import-merc.mjs) and the MUD Builder agree about every room and exit.
 * The Builder is fed the same files; its own `mapRooms` (apps/mud-builder-server/src/routes/map.ts, the code behind `GET /api/map/:file`)
 * produces its view, so a change in either reading shows up here.
 *
 *   pnpm --filter @shatteredarchive/shattered-maps-core build && pnpm --filter @shatteredarchive/mud-builder-server build
 *   node services/shattered-maps-core/scripts/check-against-builder.mjs --area-dir <merc-mud/2.4/area> [--date YYYY-MM-DD]
 *
 * Exit code 1 and the differences printed when they disagree. Nothing is written and no server is contacted.
 */
/* global console, process */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readAreas } from './import-merc.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const args = { date: new Date().toISOString().slice(0, 10) };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg !== '--area-dir' && arg !== '--date') throw new Error(`unknown argument: ${arg}`);
    const value = argv[(i += 1)];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    args[arg === '--area-dir' ? 'areaDir' : 'date'] = value;
  }
  if (!args.areaDir) throw new Error('--area-dir is required');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const coreEntry = path.join(here, '..', 'dist', 'index.js');
  const builderMap = path.join(here, '..', '..', '..', 'apps', 'mud-builder-server', 'dist', 'routes', 'map.js');
  for (const [file, hint] of [[coreEntry, 'shattered-maps-core'], [builderMap, 'mud-builder-server']])
    if (!fs.existsSync(file)) throw new Error(`${hint} is not built: run \`pnpm --filter @shatteredarchive/${hint} build\` first`);
  const core = await import(pathToFileURL(coreEntry).href);
  const builder = await import(pathToFileURL(builderMap).href);
  const merc = await import(pathToFileURL(createRequire(coreEntry).resolve('@shatteredarchive/merc-area')).href);

  const { files } = readAreas(path.resolve(args.areaDir), merc.parseAreaFile);
  const { map, report } = core.mapFromMerc(files, { date: args.date });

  // The Builder's world index: where each room number is defined (its first definition).
  const worldRooms = new Map();
  for (const { file, area } of files)
    for (const entity of merc.collectDefinedEntities(area)) if (entity.kind === 'room' && !worldRooms.has(entity.vnum)) worldRooms.set(entity.vnum, { file, name: entity.name });
  const views = files.map(({ file, area }) => ({ file, rooms: builder.mapRooms(file, area, worldRooms) }));

  const result = core.compareWithBuilder(map, views, report.deadExits);
  console.log(JSON.stringify({ ...result, differences: undefined, differenceCount: result.differences.length }, null, 2));
  if (!result.ok) {
    for (const line of result.differences) console.error(`  ${line}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`check-against-builder: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
