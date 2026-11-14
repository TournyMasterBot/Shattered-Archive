#!/usr/bin/env node
/**
 * Mines the terrain (the `sector`) of rooms out of the game's GMCP `room_data` messages in its logs, and gives it to the rooms of an audited map.
 *
 *   node services/shattered-maps-core/scripts/mine-terrain.mjs --logs <folder> --tally <tally.json>
 *       reads every *.jsonl under the folder (the game-server logs: one JSON record per line, payload.data = `room_data {...}`), tallies room title
 *       to sector, and writes the tally. Prints how many messages were read and the complete list of sector words with their counts.
 *   node services/shattered-maps-core/scripts/mine-terrain.mjs --tally <tally.json> --in <audited-map.json> --out <audited-map.json> [--min-share 0.9] [--min-count 1]
 *       gives every room without a sector the one the logs agree on for its title (a title shared by several sectors is left alone) and prints the
 *       report: rooms given a terrain, rooms that kept theirs, rooms whose title the logs never showed, the ambiguous titles, and sector words with no colour.
 *   Both at once: give --logs, --tally, --in and --out.
 *
 * The output map may not be under a `wwwroot` folder (the publisher is the only way onto the site). Nothing here reads the game or a network.
 */
/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const VALUE_FLAGS = ['--logs', '--tally', '--in', '--out', '--min-share', '--min-count'];

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (!VALUE_FLAGS.includes(arg)) throw new Error(`unknown argument: ${arg}`);
    const value = argv[(i += 1)];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    args[arg.slice(2)] = value;
  }
  if (!args.tally) throw new Error('--tally is required (the file the tally is written to or read from)');
  if (!args.logs && !args.in) throw new Error('give --logs to mine, --in and --out to apply, or both');
  if (args.in && !args.out) throw new Error('--in needs --out');
  if (args.out && !args.in) throw new Error('--out needs --in');
  if (args['min-share'] !== undefined && !(Number(args['min-share']) > 0 && Number(args['min-share']) <= 1)) throw new Error('--min-share must be above 0 and at most 1');
  if (args['min-count'] !== undefined && !(Number.isInteger(Number(args['min-count'])) && Number(args['min-count']) >= 1)) throw new Error('--min-count must be a whole number from 1');
  if (args.out && path.resolve(args.out).split(/[\\/]/).some((seg) => seg.toLowerCase() === 'wwwroot'))
    throw new Error('--out may not be under a wwwroot folder: the audited layer is published with publish-audited.mjs, on the owner\'s word');
  return args;
}

/** Every .jsonl file under a folder, sorted. */
export function listLogFiles(dir) {
  const found = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.jsonl')) found.push(p);
    }
  };
  walk(dir);
  return found.sort();
}

/** Tallies the room_data messages of the files, one stream at a time (the corpus is gigabytes). `core` is the built package. */
export async function mineFiles(files, core) {
  const tally = core.emptyTally();
  for (const file of files) {
    const lines = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
    for await (const line of lines) {
      const data = core.parseRoomData(line);
      if (data !== null) core.tallyRoomData(tally, data);
    }
  }
  return tally;
}

const sortedCounts = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1]);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distEntry = path.join(here, '..', 'dist', 'index.js');
  if (!fs.existsSync(distEntry)) throw new Error('the package is not built: run `pnpm --filter @shatteredarchive/shattered-maps-core build` first');
  const core = await import(pathToFileURL(distEntry).href);
  let tally;
  if (args.logs) {
    const files = listLogFiles(path.resolve(args.logs));
    if (files.length === 0) throw new Error(`no .jsonl files under ${args.logs}`);
    tally = await mineFiles(files, core);
    fs.mkdirSync(path.dirname(path.resolve(args.tally)), { recursive: true });
    fs.writeFileSync(path.resolve(args.tally), `${JSON.stringify(tally)}\n`);
    console.log(`read ${files.length} files: ${tally.records} room_data messages, ${Object.keys(tally.titles).length} room titles`);
    console.log('sector words:');
    for (const [sector, n] of sortedCounts(tally.sectors)) console.log(`  ${sector.padEnd(14)} ${String(n).padStart(8)}  ${core.terrainFill(sector) ?? 'NO COLOUR'}`);
  } else tally = JSON.parse(fs.readFileSync(path.resolve(args.tally), 'utf8'));
  if (!args.in) return;

  const decision = core.decideTerrain(tally, {
    ...(args['min-share'] !== undefined ? { minShare: Number(args['min-share']) } : {}),
    ...(args['min-count'] !== undefined ? { minCount: Number(args['min-count']) } : {}),
  });
  const map = JSON.parse(fs.readFileSync(path.resolve(args.in), 'utf8'));
  const { map: out, report } = core.applyTerrain(map, decision, tally);
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(path.resolve(args.out), JSON.stringify(out));
  const pct = (n) => `${((100 * n) / Math.max(1, report.rooms)).toFixed(1)}%`;
  console.log(`rooms ${report.rooms}: terrain given ${report.assigned} (${pct(report.assigned)}), kept ${report.kept}, title shared by several sectors ${report.ambiguous}, title never seen in the logs ${report.unseen}`);
  console.log(`given: ${sortedCounts(report.bySector).map(([s, n]) => `${s} ${n}`).join(', ')}`);
  if (Object.keys(decision.unknownSectors).length > 0)
    console.log(`sector words with no colour in the palette: ${sortedCounts(decision.unknownSectors).map(([s, n]) => `${s} ${n}`).join(', ')}`);
  console.log(`ambiguous titles (most messages first): ${decision.ambiguous.slice(0, 12).map((a) => `${a.title} ${JSON.stringify(a.counts)}`).join(' | ')}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
