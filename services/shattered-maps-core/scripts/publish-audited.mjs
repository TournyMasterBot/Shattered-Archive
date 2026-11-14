#!/usr/bin/env node
/**
 * Publishes the audited map (the file the Mapper downloads) as the slices the C# site serves in production.
 *
 *   pnpm --filter @shatteredarchive/shattered-maps-core build
 *   node services/shattered-maps-core/scripts/publish-audited.mjs --in <audited-map.json> [--out <folder>] [--date YYYY-MM-DD] [--dry-run]
 *
 * Writes one gzip file per area (`<area id>.json.gz`, a Shattered-Maps file valid on its own) and `manifest.json` (counts, credits, the
 * areas, a `versionId` and each file's size) into the output folder. The default folder is the C# site's `wwwroot/data/world-map`, which
 * ships with a production build: only the audited layer belongs there. Room history and player records are left out (see
 * src/publish/audited.ts). Everything is checked with the strict reader first; if anything fails nothing is written.
 *
 * Safety: a folder with a `candidates` segment is refused (that is the unaudited layer), and so is a folder whose manifest.json is not an
 * audited one. Files of areas that were in the previous manifest and are gone now are removed afterwards; no other file is touched.
 */
/* global Buffer, console, process */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = 'C:/Projects/DSL/Server/Server.Web.Public/wwwroot/data/world-map';
const SLUG_FILE = /^[a-z0-9]+(-[a-z0-9]+)*\.json\.gz$/;

function parseArgs(argv) {
  const args = { in: undefined, out: DEFAULT_OUT, date: new Date().toISOString().slice(0, 10), dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue; // pnpm passes a literal --
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--in' || arg === '--out' || arg === '--date') {
      const value = argv[(i += 1)];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      args[arg.slice(2)] = value;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!args.in) throw new Error('--in <audited-map.json> is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error('--date must be YYYY-MM-DD');
  return args;
}

/** Identifies a published set: the same map and day give the same id; any change to a slice or the manifest gives another. */
export function versionIdOf(manifest, areas) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(manifest));
  for (const area of areas) hash.update(`\n${area.fileName}\n${JSON.stringify(area.map)}`);
  return hash.digest('hex').slice(0, 16);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distEntry = path.join(here, '..', 'dist', 'index.js');
  if (!fs.existsSync(distEntry))
    throw new Error('the package is not built: run `pnpm --filter @shatteredarchive/shattered-maps-core build` first');
  const core = await import(pathToFileURL(distEntry).href);

  const out = path.resolve(args.out);
  if (out.split(/[\\/]/).some((seg) => seg.toLowerCase() === 'candidates'))
    throw new Error('refusing to write into a candidates folder: that is the unaudited layer, and it is never published');
  if (!fs.existsSync(args.in)) throw new Error(`input not found: ${args.in}`);

  const text = fs.readFileSync(args.in, 'utf8');
  const parsed = core.parseMapFile(text, 64 * 1024 * 1024);
  if (!parsed.ok) {
    console.error(`${args.in} is not a valid map file:`);
    for (const e of parsed.errors.slice(0, 10)) console.error(`  ${e}`);
    process.exitCode = 1;
    return;
  }

  let previous = [];
  const manifestPath = path.join(out, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    let old;
    try {
      old = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      throw new Error(`${manifestPath} is not valid JSON; refusing to overwrite it`);
    }
    if (old.status !== 'audited') throw new Error(`${manifestPath} is not an audited manifest (status "${old.status}"); refusing to overwrite it`);
    previous = Array.isArray(old.areas) ? old.areas.map((a) => a.file).filter((f) => typeof f === 'string') : [];
  }

  const result = core.publishAudited(parsed.map, { publishedAt: args.date });
  if (!result.ok) {
    console.error(`${result.errors.length} problem(s); nothing was written:`);
    for (const e of result.errors.slice(0, 10)) console.error(`  ${e}`);
    process.exitCode = 1;
    return;
  }

  const manifest = result.manifest;
  const gz = result.areas.map((a) => ({ ...a, data: gzipSync(Buffer.from(JSON.stringify(a.map), 'utf8'), { level: 9 }) }));
  manifest.versionId = versionIdOf(manifest, result.areas);
  for (const a of gz) manifest.areas.find((m) => m.id === a.areaId).bytes = a.data.length;
  const bytes = gz.reduce((n, a) => n + a.data.length, 0);

  const c = manifest.counts;
  console.log(
    `${c.continents} continents, ${c.areas} areas, ${c.subzones} subzones, ${c.rooms} rooms, ${c.links} links (${c.offPageLinks} off the page); credits: ${manifest.credits.join(', ') || 'none'}`,
  );
  console.log(
    `left out: ${result.report.playerRecordsDropped} player record(s), ${result.report.roomHistoriesDropped} room histor${result.report.roomHistoriesDropped === 1 ? 'y' : 'ies'}; versionId ${manifest.versionId}`,
  );
  if (args.dryRun) {
    console.log('dry run: nothing written');
    return;
  }

  fs.mkdirSync(out, { recursive: true });
  const written = new Set(['manifest.json']);
  for (const a of gz) {
    fs.writeFileSync(path.join(out, a.fileName), a.data);
    written.add(a.fileName);
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  let removed = 0;
  for (const name of previous) {
    if (!written.has(name) && SLUG_FILE.test(name) && fs.existsSync(path.join(out, name))) {
      fs.rmSync(path.join(out, name));
      removed += 1;
    }
  }
  console.log(`wrote ${gz.length} area file(s) (${(bytes / 1024).toFixed(1)} KiB gzip) and manifest.json to ${out}${removed > 0 ? `; removed ${removed} stale file(s)` : ''}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`publish-audited: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
