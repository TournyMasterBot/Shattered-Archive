import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateMapFile } from '@shatteredarchive/shattered-maps-core';
import { inputLine, viewJsonl } from '../testing/worldFixtures';
import { findLogFiles, parseReplayArgs, replayFolder, runReplayCli, type ReplayArgs } from './replayCli';

const connect = (at: number, host: string, port: number): string =>
  JSON.stringify({ type: 'game:remote-server:connect', subtype: '', level: 'info', timestamp: new Date(at).toISOString(), payload: { host, port } });

const hall = (at: number): string[] => viewJsonl(at, { title: 'Hall', gmcpExits: ['N'], exitWords: ['north'] });
const study = (at: number): string[] => viewJsonl(at, { title: 'Study', gmcpExits: ['S'], exitWords: ['south'] });

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'replay-cli-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function day(logs: string, date: string, lines: string[]): void {
  const [y, m, d] = date.split('-');
  const dir = path.join(logs, y, m, d);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `server.log-${date}.jsonl`), lines.join('\n') + '\n', 'utf8');
}

const dayAt = (date: string, seconds: number): number => Date.parse(`${date}T10:00:00Z`) + seconds * 1000;

function args(extra: Partial<ReplayArgs> = {}): ReplayArgs {
  return { logs: path.join(root, 'logs'), out: path.join(root, 'out', 'dsl.json'), world: 'dsl', maxChars: 50_000_000, restart: false, ...extra };
}

describe('parseReplayArgs', () => {
  it('needs --logs and --out and reads every option', () => {
    expect(parseReplayArgs([])).toEqual({ error: '--logs and --out are required' });
    expect(parseReplayArgs(['--logs', 'a', '--out', 'b', '--from', '2026-01-01', '--to', '2026-02-01', '--world', 'sandbox', '--max-chars', '5000', '--restart'])).toEqual({
      logs: 'a',
      out: 'b',
      from: '2026-01-01',
      to: '2026-02-01',
      world: 'sandbox',
      maxChars: 5000,
      restart: true,
    });
    expect(parseReplayArgs(['--logs', 'a', '--out', 'b'])).toMatchObject({ world: 'dsl', restart: false });
  });

  it.each([
    [['--nope'], 'unknown argument --nope'],
    [['--logs'], '--logs needs a value'],
    [['--logs', '--out', 'b'], '--logs needs a value'],
    [['--logs', 'a', '--out', 'b', '--from', 'yesterday'], '--from must be a day like 2026-07-03'],
    [['--logs', 'a', '--out', 'b', '--to', '07-03'], '--to must be a day like 2026-07-03'],
    [['--logs', 'a', '--out', 'b', '--world', 'simulacrum'], '--world must be dsl or sandbox'],
    [['--logs', 'a', '--out', 'b', '--target', 'localhost:4000'], 'unknown argument --target'],
    [['--logs', 'a', '--out', 'b', '--max-chars', '12'], '--max-chars must be a whole number of at least 1000'],
  ])('refuses %j', (argv, error) => {
    expect(parseReplayArgs(argv)).toEqual({ error });
  });
});

describe('findLogFiles', () => {
  it('finds server logs at any depth, oldest day first, and nothing else', async () => {
    const logs = path.join(root, 'logs');
    day(logs, '2026-07-03', []);
    day(logs, '2026-01-02', []);
    mkdirSync(path.join(logs, 'misc'), { recursive: true });
    writeFileSync(path.join(logs, 'misc', 'notes.txt'), 'x');
    writeFileSync(path.join(logs, 'misc', 'server.log-2026-13-99.jsonl.gz'), 'x');
    expect((await findLogFiles(logs)).map((f) => f.day)).toEqual(['2026-01-02', '2026-07-03']);
  });

  it('puts two files of the same day in path order', async () => {
    const logs = path.join(root, 'logs');
    mkdirSync(path.join(logs, 'b'), { recursive: true });
    mkdirSync(path.join(logs, 'a'), { recursive: true });
    writeFileSync(path.join(logs, 'b', 'server.log-2026-05-05.jsonl'), '');
    writeFileSync(path.join(logs, 'a', 'server.log-2026-05-05.jsonl'), '');
    const files = await findLogFiles(logs);
    expect(files.map((f) => path.basename(path.dirname(f.file)))).toEqual(['a', 'b']);
  });
});

describe('replayFolder', () => {
  it('replays days in order into a valid layer file, keeping a connection that spans two files, and skips other targets', async () => {
    const logs = path.join(root, 'logs');
    const d1 = '2026-07-03';
    const d2 = '2026-07-04';
    day(logs, d1, [
      connect(dayAt(d1, 0), 'host.docker.internal', 4000),
      ...hall(dayAt(d1, 1)),
      connect(dayAt(d1, 9), 'dsl-mud.org', 4000),
      ...hall(dayAt(d1, 10)),
      inputLine(dayAt(d1, 11), 'north'),
      ...study(dayAt(d1, 12)),
    ]);
    // the DSL connection continues after midnight into the next file without a new connect: its rooms are still taken (a session is one play day, so the link across midnight is the one thing not followed)
    day(logs, d2, [inputLine(dayAt(d2, 1), 'south'), ...hall(dayAt(d2, 2))]);
    const lines: string[] = [];
    const summary = await replayFolder(args(), (l) => lines.push(l));

    expect(summary).toMatchObject({ daysDone: 2, daysSkipped: 0, lastDay: d2, rooms: 2 });
    expect(summary.stats).toMatchObject({ views: 3, newRooms: 2, traversals: 1 });
    expect(summary.totals.connections).toEqual({ 'dsl-mud.org:4000': 1, 'host.docker.internal:4000': 1 });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^2026-07-03 views=2 rooms=2 links=\d+ /);

    const saved = JSON.parse(readFileSync(args().out, 'utf8')) as { v: number; map: unknown };
    expect(saved.v).toBe(1);
    expect(validateMapFile(saved.map).ok).toBe(true);
  });

  it('honours --from and --to', async () => {
    const logs = path.join(root, 'logs');
    for (const d of ['2026-07-01', '2026-07-02', '2026-07-03']) day(logs, d, [connect(dayAt(d, 0), 'dsl-mud.org', 4000), ...hall(dayAt(d, 1))]);
    const summary = await replayFolder(args({ from: '2026-07-02', to: '2026-07-02' }), () => undefined);
    expect(summary).toMatchObject({ daysDone: 1, lastDay: '2026-07-02' });
    expect(summary.stats.views).toBe(1);
  });

  it('resumes where it stopped and never counts a day twice; --restart starts a fresh layer', async () => {
    const logs = path.join(root, 'logs');
    const d1 = '2026-07-03';
    const d2 = '2026-07-04';
    day(logs, d1, [connect(dayAt(d1, 0), 'dsl-mud.org', 4000), ...hall(dayAt(d1, 1))]);
    await replayFolder(args(), () => undefined);
    day(logs, d2, [connect(dayAt(d2, 0), 'dsl-mud.org', 4000), ...study(dayAt(d2, 1))]);

    const second = await replayFolder(args(), () => undefined);
    expect(second).toMatchObject({ daysDone: 2, daysSkipped: 1, lastDay: d2, rooms: 2 });
    expect(second.totals.connections).toEqual({ 'dsl-mud.org:4000': 2 });

    const again = await replayFolder(args(), () => undefined);
    expect(again).toMatchObject({ daysDone: 2, daysSkipped: 2, rooms: 2 });

    const fresh = await replayFolder(args({ restart: true }), () => undefined);
    expect(fresh).toMatchObject({ daysDone: 2, daysSkipped: 0, rooms: 2 });
    expect(fresh.stats.views).toBe(2);
  });

  it('a layer file with no progress file is replaced, not continued (nothing is counted twice)', async () => {
    const logs = path.join(root, 'logs');
    const d1 = '2026-07-03';
    day(logs, d1, [connect(dayAt(d1, 0), 'dsl-mud.org', 4000), ...hall(dayAt(d1, 1))]);
    await replayFolder(args(), () => undefined);
    rmSync(`${args().out}.progress.json`);
    const summary = await replayFolder(args(), () => undefined);
    expect(summary.stats.views).toBe(1);
    expect(summary.rooms).toBe(1);
    const saved = JSON.parse(readFileSync(args().out, 'utf8')) as { map: { continents: { areas: { subzones: { rooms: { baseline: { visits: number } }[] }[] }[] }[] } };
    expect(saved.map.continents[0].areas[0].subzones[0].rooms[0].baseline.visits).toBe(1);
  });

  it('stops and says so when the layer would be too big to write, keeping the progress of the days before', async () => {
    const logs = path.join(root, 'logs');
    const d1 = '2026-07-03';
    day(logs, d1, [connect(dayAt(d1, 0), 'dsl-mud.org', 4000), ...hall(dayAt(d1, 1))]);
    const summary = await replayFolder(args({ maxChars: 100 }), () => undefined);
    expect(summary.failed).toBe('too-big');
    expect(summary.daysDone).toBe(0);
    expect(existsSync(`${args().out}.progress.json`)).toBe(false);
  });

  it('ignores an unreadable progress file and a progress file of another version', async () => {
    const logs = path.join(root, 'logs');
    day(logs, '2026-07-03', [connect(dayAt('2026-07-03', 0), 'dsl-mud.org', 4000), ...hall(dayAt('2026-07-03', 1))]);
    mkdirSync(path.dirname(args().out), { recursive: true });
    writeFileSync(`${args().out}.progress.json`, '{not json');
    expect((await replayFolder(args(), () => undefined)).daysDone).toBe(1);
    writeFileSync(`${args().out}.progress.json`, JSON.stringify({ version: 9, lastDay: '2030-01-01', days: 5, totals: {} }));
    expect((await replayFolder(args(), () => undefined)).daysDone).toBe(1);
  });
});

describe('runReplayCli', () => {
  const io = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
  };

  it('prints the usage for --help, and refuses bad arguments with code 2', async () => {
    const a = io();
    expect(await runReplayCli(['--help'], a.io)).toBe(0);
    expect(a.out[0]).toContain('usage: replay:world');
    const b = io();
    expect(await runReplayCli(['--logs'], b.io)).toBe(2);
    expect(b.err[0]).toContain('--logs needs a value');
  });

  it('runs a replay and prints the summary as JSON', async () => {
    const logs = path.join(root, 'logs');
    day(logs, '2026-07-03', [connect(dayAt('2026-07-03', 0), 'dsl-mud.org', 4000), ...hall(dayAt('2026-07-03', 1))]);
    const a = io();
    expect(await runReplayCli(['--logs', logs, '--out', path.join(root, 'o', 'x.json')], a.io)).toBe(0);
    const summary = JSON.parse(a.out[a.out.length - 1]) as { daysDone: number; rooms: number };
    expect(summary).toMatchObject({ daysDone: 1, rooms: 1 });
  });

  it('exits 1 when the layer is too big, and when the log folder cannot be read', async () => {
    const logs = path.join(root, 'logs');
    // enough rooms that the layer is longer than the smallest limit the command line accepts
    const views: string[] = [];
    for (let i = 0; i < 12; i += 1) views.push(...viewJsonl(dayAt('2026-07-03', 1 + i), { title: `Room number ${i}`, gmcpExits: ['N'], exitWords: ['north'] }));
    day(logs, '2026-07-03', [connect(dayAt('2026-07-03', 0), 'dsl-mud.org', 4000), ...views]);
    expect(await runReplayCli(['--logs', logs, '--out', path.join(root, 'o', 'x.json'), '--max-chars', '1000'], io().io)).toBe(1);
    const c = io();
    expect(await runReplayCli(['--logs', path.join(root, 'nope'), '--out', path.join(root, 'o', 'y.json')], c.io)).toBe(1);
    expect(c.err[0]).toMatch(/^replay stopped: /);
  });
});

describe('replayFolder: one world per layer', () => {
  const d1 = '2026-07-03';
  const logs = (): void => {
    day(path.join(root, 'logs'), d1, [
      connect(dayAt(d1, 0), 'dsl-mud.org', 4000),
      ...hall(dayAt(d1, 1)),
      connect(dayAt(d1, 5), 'simulacrum.shatteredarchive.dev', 4000),
      ...study(dayAt(d1, 6)),
      connect(dayAt(d1, 9), 'host.docker.internal', 4000),
      ...viewJsonl(dayAt(d1, 10), { title: 'Plane', gmcpExits: [], exitWords: [] }),
      connect(dayAt(d1, 12), 'dsl-mud.org', 8000),
      ...viewJsonl(dayAt(d1, 13), { title: 'Test server', gmcpExits: [], exitWords: [] }),
    ]);
  };
  const titles = (file: string): string[] => {
    const saved = JSON.parse(readFileSync(file, 'utf8')) as { map: { continents: { areas: { subzones: { rooms: { title: string }[] }[] }[] }[] } };
    return saved.map.continents.flatMap((c) => c.areas.flatMap((a) => a.subzones.flatMap((s) => s.rooms.map((r) => r.title)))).sort();
  };

  it('the dsl layer holds the DSL game only, the sandbox layer the Simulacrum only, and neither the DSL test port', async () => {
    logs();
    await replayFolder(args(), () => undefined);
    await replayFolder(args({ world: 'sandbox', out: path.join(root, 'out', 'sandbox.json') }), () => undefined);
    expect(titles(args().out)).toEqual(['Hall']);
    expect(titles(path.join(root, 'out', 'sandbox.json'))).toEqual(['Plane', 'Study']);
  });

  it('refuses to continue a layer with another world\'s logs, and --restart replaces it', async () => {
    logs();
    await replayFolder(args(), () => undefined);
    await expect(replayFolder(args({ world: 'sandbox' }), () => undefined)).rejects.toThrow(/belongs to the dsl world, not sandbox/);
    const fresh = await replayFolder(args({ world: 'sandbox', restart: true }), () => undefined);
    expect(fresh.rooms).toBe(2);
    expect(titles(args().out)).toEqual(['Plane', 'Study']);
  });

  it('a progress file that names no world is not trusted: the layer is replaced, not continued', async () => {
    logs();
    await replayFolder(args(), () => undefined);
    const progress = `${args().out}.progress.json`;
    const old = JSON.parse(readFileSync(progress, 'utf8')) as Record<string, unknown>;
    delete old.world;
    writeFileSync(progress, JSON.stringify(old));
    const again = await replayFolder(args({ world: 'sandbox' }), () => undefined);
    expect(again.daysSkipped).toBe(0);
    expect(titles(args().out)).toEqual(['Plane', 'Study']);
  });
});
