import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { gunzipSync } from 'node:zlib';
import { AzahTracer, mergeSlices, validateMapFile, type MapFile, type TraceReport } from '@shatteredarchive/shattered-maps-core';
import { Replay, type ReplayCounters } from './replay.js';
import { WORLD_TARGETS } from './worlds.js';
import { findLogFiles } from './replayCli.js';

const USAGE = `usage: replay:trace --world dsl --logs <game-server log folder> --azah <Azah candidate folder> --out <report file> [--from YYYY-MM-DD] [--to YYYY-MM-DD]

Walks Azah's community map (the candidate layer the importer wrote) with the owner's game logs: every room view is placed on Azah's graph, every
move must lead where Azah says it does. Writes the verdict of every Azah room and link, the disagreements and the rooms Azah does not have to
<report file>. Reads only. Azah mapped the DSL and nothing else, so --world must be dsl and only connections to the DSL's player port (${WORLD_TARGETS.dsl.join(' ')}) are used.`;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface TraceArgs {
  logs: string;
  azah: string;
  out: string;
  from?: string;
  to?: string;
}

export function parseTraceArgs(argv: readonly string[]): TraceArgs | { error: string } {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!['--world', '--logs', '--azah', '--out', '--from', '--to'].includes(flag)) return { error: `unknown argument ${flag}` };
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) return { error: `${flag} needs a value` };
    values.set(flag, value);
    i += 1;
  }
  const world = values.get('--world');
  if (world !== 'dsl') return { error: `--world dsl is required: Azah mapped the DSL only (got ${world ?? 'nothing'})` };
  const logs = values.get('--logs');
  const azah = values.get('--azah');
  const out = values.get('--out');
  if (logs === undefined || azah === undefined || out === undefined) return { error: '--logs, --azah and --out are required' };
  for (const flag of ['--from', '--to']) {
    const day = values.get(flag);
    if (day !== undefined && !DAY.test(day)) return { error: `${flag} must be a day like 2026-07-03` };
  }
  const args: TraceArgs = { logs, azah, out };
  const from = values.get('--from');
  const to = values.get('--to');
  if (from !== undefined) args.from = from;
  if (to !== undefined) args.to = to;
  return args;
}

/** The Azah layer in `folder` (its manifest must name the source `azah`) as one map file. */
export async function readAzahLayer(folder: string): Promise<{ map: MapFile; source: unknown }> {
  let manifest: { source?: { name?: unknown } };
  try {
    manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8')) as typeof manifest;
  } catch {
    throw new Error(`no readable manifest.json in ${folder}`);
  }
  if (manifest.source?.name !== 'azah') throw new Error('that folder is not the Azah layer (its manifest source is not azah)');
  const slices: MapFile[] = [];
  for (const name of (await readdir(folder)).filter((n) => n.endsWith('.json.gz')).sort()) {
    const checked = validateMapFile(JSON.parse(gunzipSync(await readFile(path.join(folder, name))).toString('utf8')));
    if (!checked.ok) throw new Error(`${name} is not a valid map: ${checked.errors.slice(0, 2).join('; ')}`);
    slices.push(checked.map);
  }
  return { map: mergeSlices(slices), source: manifest.source };
}

export interface TraceSummary {
  days: number;
  totals: ReplayCounters;
  report: TraceReport;
}

/** Replays the logs of `args` through an Azah tracer. `say` gets one line per day. */
export async function traceFolder(args: TraceArgs, say: (line: string) => void): Promise<{ summary: TraceSummary; source: unknown }> {
  const { map, source } = await readAzahLayer(args.azah);
  const tracer = new AzahTracer(map);
  const replay = new Replay({ memory: tracer, targets: WORLD_TARGETS.dsl });
  const files = (await findLogFiles(args.logs)).filter((f) => (args.from === undefined || f.day >= args.from) && (args.to === undefined || f.day <= args.to));
  let days = 0;
  for (const { day, file } of files) {
    const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of lines) await replay.line(line);
    await replay.drain();
    days += 1;
    say(`${day} ${JSON.stringify(replay.counters.connections)}`);
  }
  return { summary: { days, totals: replay.counters, report: tracer.report() }, source };
}

/** What is printed at the end and what the lessons are written from: counts only, no per-room verdicts. */
export function printable(summary: TraceSummary): unknown {
  const { rooms: _rooms, links: _links, walkedOn: _walkedOn, byArea: _byArea, ...rest } = summary.report;
  return { days: summary.days, totals: summary.totals, ...rest };
}

export async function runTraceCli(argv: readonly string[], io: { out: (line: string) => void; err: (line: string) => void }): Promise<number> {
  if (argv.includes('--help')) {
    io.out(USAGE);
    return 0;
  }
  const args = parseTraceArgs(argv);
  if ('error' in args) {
    io.err(`${args.error}\n${USAGE}`);
    return 2;
  }
  try {
    const { summary, source } = await traceFolder(args, io.out);
    await mkdir(path.dirname(args.out), { recursive: true });
    await writeFile(args.out, JSON.stringify({ azah: source, ...summary }), 'utf8');
    io.out(JSON.stringify(printable(summary), null, 2));
    return 0;
  } catch (error) {
    io.err(`trace stopped: ${(error as Error).message}`);
    return 1;
  }
}
