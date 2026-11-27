import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { inputLine, viewJsonl } from '../testing/worldFixtures';
import { parseTraceArgs, printable, readAzahLayer, runTraceCli, traceFolder, type TraceArgs } from './traceCli';

const PLAIN = 'A plain room with nothing to say for itself.';
const connect = (at: number, host: string, port: number): string =>
  JSON.stringify({ type: 'game:remote-server:connect', subtype: '', level: 'info', timestamp: new Date(at).toISOString(), payload: { host, port } });

const room = (id: string, title: string, exits: Record<string, string> = {}) => ({ id, title, description: PLAIN, exits, sources: [{ kind: 'azah', ref: id, credit: 'Azah', date: '2020-01-01' }] });
const link = (id: string, from: string, dir: string, to: string) => ({ id, from, dir, to, state: 'candidate', confidence: 0.4, offPage: false, traversals: 0, reverse: false });
const slice = (areaId: string, rooms: unknown[], links: unknown[]) => ({
  version: 1,
  continents: [{ id: 'c1', name: 'Continent', areas: [{ id: areaId, name: 'Area', placement: null, subzones: [{ id: `${areaId}-s`, name: 'S', kind: 'consistent', rooms }] }] }],
  links,
});

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'trace-cli-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function azahFolder(manifest: unknown = { source: { name: 'azah' } }): string {
  const dir = path.join(root, 'azah');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(
    path.join(dir, 'az-a1.json.gz'),
    gzipSync(JSON.stringify(slice('az-a1', [room('az1', 'Hall', { N: 'azl1' }), room('az2', 'Study')], [link('azl1', 'az1', 'N', 'az2')]))),
  );
  return dir;
}

function logDay(date: string, lines: string[]): string {
  const [y, m, d] = date.split('-');
  const dir = path.join(root, 'logs', y, m, d);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `server.log-${date}.jsonl`), lines.join('\n') + '\n');
  return path.join(root, 'logs');
}

const at = (date: string, s: number): number => Date.parse(`${date}T10:00:00Z`) + s * 1000;
const walk = (date: string): string[] => [
  connect(at(date, 0), 'dsl-mud.org', 4000),
  ...viewJsonl(at(date, 1), { title: 'Hall', description: [`  ${PLAIN}`], gmcpExits: ['N'], exitWords: ['north'] }),
  inputLine(at(date, 2), 'north'),
  ...viewJsonl(at(date, 3), { title: 'Study', description: [`  ${PLAIN}`], gmcpExits: [], exitWords: [] }),
  connect(at(date, 9), 'host.docker.internal', 4000),
  ...viewJsonl(at(date, 10), { title: 'Elsewhere', description: [`  ${PLAIN}`], gmcpExits: [], exitWords: [] }),
];

describe('parseTraceArgs', () => {
  const ok = ['--world', 'dsl', '--logs', 'l', '--azah', 'a', '--out', 'o'];
  it('reads the options', () => {
    expect(parseTraceArgs(ok)).toEqual({ logs: 'l', azah: 'a', out: 'o' });
    expect(parseTraceArgs([...ok, '--from', '2026-01-01', '--to', '2026-02-01'])).toEqual({
      logs: 'l',
      azah: 'a',
      out: 'o',
      from: '2026-01-01',
      to: '2026-02-01',
    });
  });

  it.each([
    [['--world', 'sandbox', '--logs', 'l', '--azah', 'a', '--out', 'o'], '--world dsl is required: Azah mapped the DSL only (got sandbox)'],
    [['--logs', 'l', '--azah', 'a', '--out', 'o'], '--world dsl is required: Azah mapped the DSL only (got nothing)'],
    [['--world', 'dsl', '--logs', 'l'], '--logs, --azah and --out are required'],
    [['--nope'], 'unknown argument --nope'],
    [['--world'], '--world needs a value'],
    [[...ok, '--from', 'soon'], '--from must be a day like 2026-07-03'],
    [[...ok, '--target', 'localhost:4000'], 'unknown argument --target'],
  ])('refuses %j', (argv, error) => {
    expect(parseTraceArgs(argv)).toEqual({ error });
  });
});

describe('readAzahLayer', () => {
  it('reads and joins the slices of an Azah layer', async () => {
    const { map, source } = await readAzahLayer(azahFolder());
    expect(source).toEqual({ name: 'azah' });
    expect(map.continents[0].areas[0].subzones[0].rooms.map((r) => r.id)).toEqual(['az1', 'az2']);
    expect(map.links).toHaveLength(1);
  });

  it('refuses a folder with no manifest, another source, or a slice that is not a valid map', async () => {
    await expect(readAzahLayer(path.join(root, 'nothing'))).rejects.toThrow(/no readable manifest/);
    await expect(readAzahLayer(azahFolder({ source: { name: 'someone' } }))).rejects.toThrow(/not the Azah layer/);
    const dir = azahFolder();
    writeFileSync(path.join(dir, 'az-bad.json.gz'), gzipSync(JSON.stringify({ version: 1 })));
    await expect(readAzahLayer(dir)).rejects.toThrow(/az-bad.json.gz is not a valid map/);
  });
});

describe('traceFolder', () => {
  const args = (extra: Partial<TraceArgs> = {}): TraceArgs => ({ logs: path.join(root, 'logs'), azah: path.join(root, 'azah'), out: path.join(root, 'out', 'trace.json'), ...extra });

  it('walks Azah with the logs of one target: the link agrees, the other game adds nothing', async () => {
    azahFolder();
    logDay('2026-07-03', walk('2026-07-03'));
    logDay('2026-07-04', walk('2026-07-04'));
    const lines: string[] = [];
    const { summary } = await traceFolder(args(), (l) => lines.push(l));
    expect(summary.days).toBe(2);
    expect(lines).toHaveLength(2);
    const { counts } = summary.report;
    expect(counts).toMatchObject({ views: 4, localized: 4, unmatched: 0, steps: 2, stepsAgree: 2, rooms: { verified: 2, unverified: 0 }, links: { agree: 1 } });
    expect(summary.totals.connections).toEqual({ 'dsl-mud.org:4000': 2, 'host.docker.internal:4000': 2 });
    expect(summary.report.walkedOn.az1).toEqual({ first: '2026-07-03', last: '2026-07-04' });
  });

  it('honours --from and --to, and never lets another world reach the tracer (not even as an unmatched room)', async () => {
    azahFolder();
    logDay('2026-07-03', walk('2026-07-03'));
    logDay('2026-07-04', walk('2026-07-04'));
    expect((await traceFolder(args({ from: '2026-07-04' }), () => undefined)).summary.days).toBe(1);
    expect((await traceFolder(args({ to: '2026-07-03' }), () => undefined)).summary.days).toBe(1);
    // each day also holds a view of the Simulacrum's world: it is not seen at all
    const both = await traceFolder(args(), () => undefined);
    expect(both.summary.report.counts).toMatchObject({ views: 4, unmatched: 0 });
    expect(both.summary.report.unmatchedTitles).toEqual([]);
  });
});

describe('runTraceCli', () => {
  const io = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
  };
  const argv = (): string[] => ['--world', 'dsl', '--logs', path.join(root, 'logs'), '--azah', path.join(root, 'azah'), '--out', path.join(root, 'out', 'trace.json')];

  it('prints the usage for --help and refuses bad arguments with code 2', async () => {
    const a = io();
    expect(await runTraceCli(['--help'], a.io)).toBe(0);
    expect(a.out[0]).toContain('usage: replay:trace');
    const b = io();
    expect(await runTraceCli(['--world', 'sandbox'], b.io)).toBe(2);
    expect(b.err[0]).toContain('Azah mapped the DSL only');
  });

  it('writes the report file with every verdict and prints only the counts', async () => {
    azahFolder();
    logDay('2026-07-03', walk('2026-07-03'));
    const a = io();
    expect(await runTraceCli(argv(), a.io)).toBe(0);
    const printed = JSON.parse(a.out[a.out.length - 1]) as Record<string, unknown>;
    expect(printed).toHaveProperty('counts');
    expect(printed).not.toHaveProperty('rooms');
    expect(printed).not.toHaveProperty('links');
    const saved = JSON.parse(readFileSync(path.join(root, 'out', 'trace.json'), 'utf8')) as { azah: unknown; report: { rooms: Record<string, { verdict: string }>; links: Record<string, string> } };
    expect(saved.azah).toEqual({ name: 'azah' });
    expect(saved.report.rooms.az1.verdict).toBe('verified');
    expect(saved.report.links.azl1).toBe('agree');
  });

  it('exits 1 with a sentence when the Azah folder or the logs cannot be read', async () => {
    const a = io();
    expect(await runTraceCli(argv(), a.io)).toBe(1);
    expect(a.err[0]).toMatch(/^trace stopped: no readable manifest/);
    azahFolder();
    const b = io();
    expect(await runTraceCli(argv(), b.io)).toBe(1);
    expect(b.err[0]).toMatch(/^trace stopped: /);
  });
});

describe('printable', () => {
  it('drops the per-room verdict lists and keeps the counts', () => {
    const report = { rooms: {}, links: {}, walkedOn: {}, byArea: {}, counts: { views: 1 }, samples: [], disagreementTitles: [], unmatchedTitles: [] };
    expect(printable({ days: 3, totals: { lines: 0, fed: 0, skipped: 0, connections: {} }, report: report as never })).toEqual({
      days: 3,
      totals: { lines: 0, fed: 0, skipped: 0, connections: {} },
      counts: { views: 1 },
      samples: [],
      disagreementTitles: [],
      unmatchedTitles: [],
    });
  });
});
