import { createReadStream } from 'node:fs';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { DEFAULT_BASELINE_CONFIG } from '@shatteredarchive/shattered-maps-core';
import { nodeWorldIo } from '../fs.js';
import { WorldMemory, type WorldStats } from './memory.js';
import { Replay, type ReplayCounters } from './replay.js';
import { isWorld, WORLD_TARGETS, type World } from './worlds.js';

const USAGE = `usage: replay:world --logs <game-server log folder> --out <layer file> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--world dsl|sandbox] [--max-chars N] [--restart]

Replays the game-server jsonl logs (server.log-YYYY-MM-DD.jsonl, any folder depth) through the world memory, oldest day first, into <layer file>
(the walked layer of ONE world). Only connections to that world's targets are used (--world dsl, the default: ${WORLD_TARGETS.dsl.join(' ')}; --world
sandbox, the Simulacrum: ${WORLD_TARGETS.sandbox.join(' ')}); a layer is never continued with another world's logs. A run can be stopped and started again: days
already done are skipped unless --restart. Nothing is read from or written to anywhere else.`;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FILE = /^server\.log-(\d{4}-\d{2}-\d{2})\.jsonl$/;
/** The layer file of a replay may be much bigger than the live one: it holds years of walks. */
const DEFAULT_MAX_CHARS = 400_000_000;

export interface ReplayArgs {
  logs: string;
  out: string;
  from?: string;
  to?: string;
  world: World;
  maxChars: number;
  restart: boolean;
}

/** Parses the command line, or says what is wrong in one sentence. */
export function parseReplayArgs(argv: readonly string[]): ReplayArgs | { error: string } {
  const values = new Map<string, string>();
  let restart = false;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--restart') {
      restart = true;
      continue;
    }
    if (!['--logs', '--out', '--from', '--to', '--world', '--max-chars'].includes(flag)) return { error: `unknown argument ${flag}` };
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) return { error: `${flag} needs a value` };
    values.set(flag, value);
    i += 1;
  }
  const logs = values.get('--logs');
  const out = values.get('--out');
  if (logs === undefined || out === undefined) return { error: '--logs and --out are required' };
  for (const flag of ['--from', '--to']) {
    const day = values.get(flag);
    if (day !== undefined && !DAY.test(day)) return { error: `${flag} must be a day like 2026-07-03` };
  }
  const world = values.get('--world') ?? 'dsl';
  if (!isWorld(world)) return { error: '--world must be dsl or sandbox' };
  const maxCharsRaw = values.get('--max-chars');
  const maxChars = maxCharsRaw === undefined ? DEFAULT_MAX_CHARS : Number(maxCharsRaw);
  if (!Number.isInteger(maxChars) || maxChars < 1000) return { error: '--max-chars must be a whole number of at least 1000' };
  const args: ReplayArgs = { logs, out, world, maxChars, restart };
  const from = values.get('--from');
  const to = values.get('--to');
  if (from !== undefined) args.from = from;
  if (to !== undefined) args.to = to;
  return args;
}

/** Every `server.log-<day>.jsonl` under `dir`, oldest day first. */
export async function findLogFiles(dir: string): Promise<{ day: string; file: string }[]> {
  const found: { day: string; file: string }[] = [];
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const match = FILE.exec(entry.name);
        if (match) found.push({ day: match[1], file: full });
      }
    }
  };
  await walk(dir);
  return found.sort((a, b) => a.day.localeCompare(b.day) || a.file.localeCompare(b.file));
}

interface Progress {
  version: 1;
  /** The world the layer belongs to: a layer is only ever continued with the same world's logs. */
  world: World;
  lastDay: string | null;
  days: number;
  totals: ReplayCounters;
}

function emptyTotals(): ReplayCounters {
  return { lines: 0, fed: 0, skipped: 0, connections: {} };
}

async function readProgress(file: string): Promise<Progress | undefined> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Progress;
    return parsed.version === 1 && isWorld(parsed.world) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export interface ReplaySummary {
  daysDone: number;
  daysSkipped: number;
  lastDay: string | null;
  totals: ReplayCounters;
  stats: WorldStats;
  rooms: number;
  links: number;
  /** Why the layer file was not written, when it was not. */
  failed?: 'too-big' | 'write-failed';
}

/** Replays the log files of `args` and writes the layer after each day. `say` gets one line per day. */
export async function replayFolder(args: ReplayArgs, say: (line: string) => void): Promise<ReplaySummary> {
  const files = (await findLogFiles(args.logs)).filter((f) => (args.from === undefined || f.day >= args.from) && (args.to === undefined || f.day <= args.to));
  const progressFile = `${args.out}.progress.json`;
  const saved = args.restart ? undefined : await readProgress(progressFile);
  if (saved !== undefined && saved.world !== args.world) throw new Error(`that layer belongs to the ${saved.world} world, not ${args.world}: use another --out (or --restart to replace it)`);
  const totals: ReplayCounters = saved?.totals ?? emptyTotals();
  let daysDone = saved?.days ?? 0;
  let lastDay = saved?.lastDay ?? null;

  // The existing layer is continued only together with its progress file. A layer with no progress (or --restart) is replaced: loading it
  // and replaying the same days again would count every view twice.
  const { memory } = await WorldMemory.open({
    io: { readText: saved === undefined ? async () => undefined : nodeWorldIo.readText, writeText: nodeWorldIo.writeText },
    file: args.out,
    baseline: DEFAULT_BASELINE_CONFIG,
    random: Math.random,
    deferWrites: true,
    maxChars: args.maxChars,
  });
  // a connection that spans two files is the same connection: one Replay for the whole run
  const replay = new Replay({ memory, targets: WORLD_TARGETS[args.world] });
  let daysSkipped = 0;
  let failed: ReplaySummary['failed'];
  for (const { day, file } of files) {
    if (saved !== undefined && lastDay !== null && day <= lastDay) {
      daysSkipped += 1;
      continue;
    }
    const started = Date.now();
    const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of lines) await replay.line(line);
    await replay.drain();
    const written = await memory.flush();
    if (!written.ok) {
      failed = written.reason;
      break;
    }
    daysDone += 1;
    lastDay = day;
    addCounters(totals, replay.counters);
    resetCounters(replay.counters);
    await mkdir(path.dirname(progressFile), { recursive: true });
    await writeFile(progressFile, JSON.stringify({ version: 1, world: args.world, lastDay, days: daysDone, totals } satisfies Progress), 'utf8');
    say(`${day} views=${memory.stats.views} rooms=${memory.counts.rooms} links=${memory.counts.links} ${Math.round((Date.now() - started) / 100) / 10}s`);
  }
  const summary: ReplaySummary = { daysDone, daysSkipped, lastDay, totals, stats: memory.stats, rooms: memory.counts.rooms, links: memory.counts.links };
  if (failed !== undefined) summary.failed = failed;
  return summary;
}

function addCounters(into: ReplayCounters, from: ReplayCounters): void {
  into.lines += from.lines;
  into.fed += from.fed;
  into.skipped += from.skipped;
  for (const [target, n] of Object.entries(from.connections)) into.connections[target] = (into.connections[target] ?? 0) + n;
}

function resetCounters(counters: ReplayCounters): void {
  counters.lines = 0;
  counters.fed = 0;
  counters.skipped = 0;
  counters.connections = {};
}

/** The command line. Returns the exit code. */
export async function runReplayCli(argv: readonly string[], io: { out: (line: string) => void; err: (line: string) => void }): Promise<number> {
  if (argv.includes('--help')) {
    io.out(USAGE);
    return 0;
  }
  const args = parseReplayArgs(argv);
  if ('error' in args) {
    io.err(`${args.error}\n${USAGE}`);
    return 2;
  }
  try {
    const summary = await replayFolder(args, io.out);
    io.out(JSON.stringify(summary, null, 2));
    return summary.failed === undefined ? 0 : 1;
  } catch (error) {
    io.err(`replay stopped: ${(error as Error).message}`);
    return 1;
  }
}
