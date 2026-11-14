#!/usr/bin/env node
/**
 * Imports the community map (a CMud database, read-only) as candidates in the Shattered-Maps schema.
 *
 *   pnpm --filter @shatteredarchive/shattered-maps-core build
 *   node services/shattered-maps-core/scripts/import-azah.mjs [--db <file.dbm>] [--out <folder>] [--date YYYY-MM-DD] [--dry-run]
 *
 * Writes one gzip file per area (`<area id>.json.gz`, a Shattered-Maps file) and `manifest.json` (counts, the credit, the portals, the
 * zones the rules could not place) into the output folder. Every area file is checked with the strict reader first; if any fails nothing is
 * written. Files of areas that no longer exist are removed afterwards. The database is opened read-only and is never changed.
 *
 * The default output folder is in Copilot's private data folder, NOT under a web root: the candidate layer is local-only and must never be
 * published by a production build (docs/shattered-maps/import-azah.md). The script refuses a folder under `wwwroot` unless told
 * `--allow-wwwroot`.
 */
/* global Buffer, console, process */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB = 'C:/Projects/DslScripts/data/db/azah-db.dbm';
const DEFAULT_OUT = 'C:/Projects/DSL/GameLogs/ShatteredArchive/Docker/copilot-server/world-map/candidates';

function parseArgs(argv) {
  const args = {
    db: DEFAULT_DB,
    out: DEFAULT_OUT,
    date: new Date().toISOString().slice(0, 10),
    dryRun: false,
    allowWwwroot: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue; // pnpm passes a literal --
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--allow-wwwroot') args.allowWwwroot = true;
    else if (arg === '--db' || arg === '--out' || arg === '--date') {
      const value = argv[(i += 1)];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      args[arg.slice(2)] = value;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error('--date must be YYYY-MM-DD');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distEntry = path.join(here, '..', 'dist', 'index.js');
  if (!fs.existsSync(distEntry))
    throw new Error('the package is not built: run `pnpm --filter @shatteredarchive/shattered-maps-core build` first');
  const core = await import(pathToFileURL(distEntry).href);

  if (/[\\/]wwwroot([\\/]|$)/i.test(path.resolve(args.out)) && !args.allowWwwroot) {
    throw new Error(
      'refusing to write the candidate layer under a wwwroot folder: a production build would publish it (use --allow-wwwroot only for a local-only folder)',
    );
  }
  if (!fs.existsSync(args.db)) throw new Error(`database not found: ${args.db}`);

  const db = new DatabaseSync(args.db, { readOnly: true });
  const rows = core.readAzahRows(db);
  db.close();
  const result = core.importAzah(rows, { importedAt: args.date });
  const manifest = core.buildManifest(result, { importedAt: args.date, database: path.basename(args.db) });

  const problems = [];
  for (const file of result.areas) {
    const checked = core.validateMapFile(file.map);
    if (!checked.ok) problems.push(`${file.areaId}: ${checked.errors.slice(0, 3).join('; ')}`);
  }
  if (problems.length > 0) {
    console.error(`${problems.length} area file(s) failed the strict reader; nothing was written:`);
    for (const p of problems.slice(0, 10)) console.error(`  ${p}`);
    process.exitCode = 1;
    return;
  }

  const report = result.report;
  console.log(`database: ${path.basename(args.db)} (read-only)`);
  console.log(
    `rooms:  read ${report.rooms.read}, imported ${report.rooms.imported}, deleted ${report.rooms.deleted}, not rooms ${report.rooms.notRooms}, invalid ${report.rooms.invalid}, duplicate ids ${report.rooms.duplicateIds}`,
  );
  console.log(
    `        unnamed ${report.rooms.unnamed}, undated ${report.rooms.undated}, no description ${report.rooms.withoutDescription}, unzoned ${report.rooms.unzoned}, in unmatched zones ${report.rooms.inUnmatchedZones}`,
  );
  console.log(
    `exits:  read ${report.exits.read}, imported ${report.exits.imported} (unknown target ${report.exits.unknownTarget}, of which target missing ${report.exits.targetMissing}; self loops ${report.exits.selfLoops}; off the page ${report.exits.offPage}; tested ${report.exits.tested})`,
  );
  console.log(
    `        skipped: typed-command ${report.exits.skippedCustom}, room missing ${report.exits.skippedFromMissing}, unknown direction ${report.exits.skippedBadDirection}; duplicate slots dropped ${report.exits.duplicatesDropped}`,
  );
  console.log(
    `zones:  read ${report.zones.read} -> ${report.zones.continents} continents, ${report.zones.areas} areas, ${report.zones.subzones} subzones; unmatched ${report.zones.unmatched.length}; empty ${report.zones.empty.length}; maze by name ${report.zones.mazeByName.join(', ') || 'none'}`,
  );
  for (const u of report.zones.unmatched)
    console.log(`        unmatched zone ${u.zoneId} "${u.name}" (${u.reason}, ${u.rooms} rooms)`);
  console.log(`portals: read ${report.portals.read}, kept ${report.portals.kept}`);
  const difference = report.rooms.read - report.rooms.imported;
  console.log(
    difference === 0
      ? `rooms in = rooms out (${report.rooms.imported})`
      : `rooms in ${report.rooms.read}, out ${report.rooms.imported}: ${difference} not imported (deleted, not rooms, invalid or duplicate, counted above)`,
  );

  if (args.dryRun) {
    console.log('dry run: nothing written');
    return;
  }
  fs.mkdirSync(args.out, { recursive: true });
  const written = new Set(['manifest.json']);
  let bytes = 0;
  for (const file of result.areas) {
    const name = core.candidateFileName(file.areaId);
    const data = gzipSync(Buffer.from(JSON.stringify(file.map), 'utf8'), { level: 9 });
    fs.writeFileSync(path.join(args.out, name), data);
    written.add(name);
    bytes += data.length;
    const entry = manifest.areas.find((a) => a.id === file.areaId);
    if (entry) entry.bytes = data.length;
  }
  fs.writeFileSync(path.join(args.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  let removed = 0;
  for (const name of fs.readdirSync(args.out)) {
    if (/^az-.*\.json\.gz$/.test(name) && !written.has(name)) {
      fs.rmSync(path.join(args.out, name));
      removed += 1;
    }
  }
  console.log(
    `wrote ${result.areas.length} area files (${(bytes / 1024 / 1024).toFixed(2)} MiB gzip) and manifest.json to ${args.out}${removed > 0 ? `; removed ${removed} stale file(s)` : ''}`,
  );
}

main().catch((error) => {
  console.error(`import-azah: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
