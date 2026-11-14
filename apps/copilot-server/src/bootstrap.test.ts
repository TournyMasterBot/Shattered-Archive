import * as zlib from 'node:zlib';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { validateMapFile } from '@shatteredarchive/shattered-maps-core';
import { ConfigError } from './config';
import { describeStartupError, startServer, VERSION } from './bootstrap';
import { inputLine, loginLine, viewJsonl } from './testing/worldFixtures';

let dir: string;
const servers: Server[] = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-boot-'));
});
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  fs.rmSync(dir, { recursive: true, force: true });
});

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

const env = async (extra: Record<string, string> = {}): Promise<Record<string, string>> => ({
  COPILOT_ENABLED: 'true',
  COPILOT_PORT: String(await freePort()),
  COPILOT_LISTEN_HOST: '127.0.0.1',
  COPILOT_DATA_DIR: dir,
  COPILOT_LOG_DIR: path.join(dir, 'logs'),
  ...extra,
});

/** Copilot starts switched off and learns only from what is written after it is switched on: turn it on and wait for the first passes. */
async function learn(started: { learning: { set(on: boolean): boolean }; tailer: { stats: { scans: number } } }): Promise<void> {
  const before = started.tailer.stats.scans;
  started.learning.set(true);
  for (let i = 0; i < 200 && started.tailer.stats.scans < before + 2; i++) await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('startServer', () => {
  it('listens, serves /health, and keeps what it is sent in the data directory across a restart', async () => {
    const lines: string[] = [];
    const first = await startServer(await env(), (l) => lines.push(l));
    servers.push(first.server);
    const base = `http://127.0.0.1:${first.config.port}`;

    const health = await (await fetch(`${base}/health`)).json();
    expect(health).toMatchObject({ ok: true, version: VERSION });

    const decision = { id: 'd1', suggestionId: 's1', character: 'Agate-F', at: 5, outcome: 'approved', command: 'north' };
    const saved = await fetch(`${base}/decisions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(decision) });
    expect(saved.status).toBe(201);
    const file = path.join(dir, 'ledger', 'decisions.jsonl');
    expect(fs.readFileSync(file, 'utf8')).toBe(`${JSON.stringify({ v: 1, r: decision })}\n`);

    await new Promise<void>((resolve) => first.server.close(() => resolve()));
    servers.length = 0;

    const lines2: string[] = [];
    const second = await startServer(await env(), (l) => lines2.push(l));
    servers.push(second.server);
    expect(lines2[0]).toBe('[copilot-server] ledger loaded: 1 decisions (0 skipped), 0 tickets (0 skipped)');
  });

  it('serves the teaching loop on real files: a bundle folder in the data directory, a finding that survives a restart, the counts', async () => {
    const first = await startServer(await env(), () => undefined);
    servers.push(first.server);
    const base = `http://127.0.0.1:${first.config.port}`;
    const send = (route: string, body: unknown) => fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const ticket = { id: 't1', createdAt: 1000, character: 'Agate-F', reason: 'unknown-situation', sphere: 'interaction', kind: 'interact', situationKey: 'hall-door', summary: "Bram tells you 'knock'.", status: 'open' };
    expect((await send('/tickets', ticket)).status).toBe(201);

    const bundle = (await (await send('/bundles', {})).json()) as { id: string; folder: string };
    expect(bundle.folder).toBe(`bundles/${bundle.id}`);
    const bundleDir = path.join(dir, 'bundles', bundle.id);
    expect(fs.readdirSync(bundleDir).sort()).toEqual(['bundle.json', 'summary.md']);
    expect(fs.readFileSync(path.join(bundleDir, 'bundle.json'), 'utf8')).toContain("<name> tells you 'knock'."); // a name nobody registered

    const finding = { id: 'f1', ticketId: 't1', createdAt: 2000, verdict: 'data-gap', why: 'The expert lacks this door.', artifacts: [{ path: 'tools/archive-mcp/experts/rooms.json', kind: 'expert' }], acceptedBy: null };
    expect((await send('/findings', finding)).status).toBe(201);
    expect((await send('/tickets/t1/accept', { acceptedBy: 'owner' })).status).toBe(200);
    const metrics = (await (await fetch(`${base}/metrics/training`)).json()) as { totals: Record<string, number> };
    expect(metrics.totals).toMatchObject({ resolved: 1, findingsAccepted: 1, accepted: 1 });

    await new Promise<void>((resolve) => first.server.close(() => resolve()));
    servers.length = 0;
    const lines: string[] = [];
    const second = await startServer(await env(), (l) => lines.push(l));
    servers.push(second.server);
    expect(lines.some((l) => l === '[copilot-server] findings loaded: 1 (0 skipped)')).toBe(true);
    const again = (await (await fetch(`http://127.0.0.1:${second.config.port}/metrics/training`)).json()) as { totals: Record<string, number> };
    expect(again.totals).toMatchObject({ findingsAccepted: 1, accepted: 1 });
  });

  it('logs requests as method, route and status only', async () => {
    const lines: string[] = [];
    const { server, config } = await startServer(await env(), (l) => lines.push(l));
    servers.push(server);
    await fetch(`http://127.0.0.1:${config.port}/health`);
    expect(lines.some((l) => l === '[copilot-server] GET /health 200')).toBe(true);
    expect(lines.some((l) => l.startsWith('[copilot-server] listening on 127.0.0.1:'))).toBe(true);
  });

  it('follows the game logs: /state shows the room, the checkpoint is saved, and closing the server stops the tailer', async () => {
    const day = path.join(dir, 'logs', '2026', '11', '05');
    fs.mkdirSync(day, { recursive: true });
    const logFile = path.join(day, 'server.log-2026-11-06.jsonl'); // the next date's file, inside the previous day's folder
    const record = (type: string, payload: unknown): string => JSON.stringify({ type, subtype: '', level: 'debug', timestamp: new Date().toISOString(), payload });
    const room = (name: string): string => `${record('game:remote-server:gmcp', { type: 'gmcp', data: `room_data {"room": "${name}", "sector": "city", "exits": ["N"]}` })}\n`;
    const text = `${record('game:remote-server:raw', { type: 'raw', data: 'PRIVATE-LINE-TEXT\r\n' })}\n`;
    // a plain-text twin beside it must not be read
    fs.writeFileSync(path.join(day, 'server-2026-11-06.log'), 'not json at all\n');

    const started = await startServer(await env(), () => undefined, { pollMs: 20, scanMs: 20 });
    const { server, config, pipeline } = started;
    servers.push(server);
    await learn(started);
    fs.writeFileSync(logFile, room('Market Square') + text);
    const state = async (): Promise<Record<string, unknown>> => (await fetch(`http://127.0.0.1:${config.port}/state`)).json() as Promise<Record<string, unknown>>;
    const until = async (check: () => Promise<boolean>): Promise<void> => {
      for (let i = 0; i < 100 && !(await check()); i++) await new Promise((resolve) => setTimeout(resolve, 20));
    };

    await until(async () => (await state()).room !== null);
    expect(await state()).toMatchObject({ stale: false, room: { name: 'Market Square' }, feed: { malformed: 0 } });
    expect(JSON.stringify(await state())).not.toContain('PRIVATE-LINE-TEXT');

    fs.appendFileSync(logFile, room('Temple'));
    await until(async () => ((await state()).room as { name: string }).name === 'Temple');
    expect(((await state()).room as { name: string }).name).toBe('Temple');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'tail', 'checkpoints.json'), 'utf8')).files).toHaveLength(1);

    await new Promise<void>((resolve) => server.close(() => resolve()));
    servers.length = 0;
    const seen = pipeline.counters.lines;
    fs.appendFileSync(logFile, room('After close'));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(pipeline.counters.lines).toBe(seen);
  });

  describe('the world memory over the log (Phase 20 API check)', () => {
    const connectLine = (at: number, host = 'dsl-mud.org', port = 4000): string => JSON.stringify({ type: 'game:remote-server:connect', subtype: '', level: 'debug', timestamp: new Date(at).toISOString(), payload: { host, port } });
    const hallSpec = { title: 'Hall of Lanterns', gmcpExits: ['N'], exitWords: ['north'], contents: ['(Glowing) A grey rat sniffs about the floor.'] };
    const studySpec = { title: 'Quiet Study', gmcpExits: ['S'], exitWords: ['south'] };
    /** One round of play on a day: connect, log in, see the hall, go north to the study, come back south. */
    const round = (day: number, host = 'dsl-mud.org', port = 4000): string => {
      const t = Date.parse(`2026-11-0${day}T10:00:00Z`);
      return (
        [connectLine(t, host, port), loginLine(t + 500, 'Velmora'), ...viewJsonl(t + 2000, hallSpec), inputLine(t + 3000, 'north'), ...viewJsonl(t + 4000, studySpec), inputLine(t + 5000, 'south'), ...viewJsonl(t + 6000, hallSpec)].join('\n') +
        '\n'
      );
    };
    const get = async (base: string, route: string): Promise<{ status: number; body: any }> => {
      const res = await fetch(`${base}${route}`);
      return { status: res.status, body: await res.json() };
    };
    const until = async (check: () => Promise<boolean>): Promise<void> => {
      for (let i = 0; i < 200 && !(await check()); i++) await new Promise((resolve) => setTimeout(resolve, 20));
    };

    it('builds the candidate layer from a walk replayed over three days, serves it, keeps it across a restart, and keeps counting', async () => {
      const matrixFile = path.join(dir, 'matrix.json');
      fs.writeFileSync(matrixFile, JSON.stringify([{ codename: 'Agate', male: 'Zorvak', female: 'Quenta' }]));
      const folder = path.join(dir, 'logs', '2026', '11', '05');
      fs.mkdirSync(folder, { recursive: true });
      const logFile = path.join(folder, 'server.log-2026-11-06.jsonl');

      const lines: string[] = [];
      const first = await startServer(await env({ COPILOT_MATRIX_PATH: matrixFile }), (l) => lines.push(l), { pollMs: 20, scanMs: 20 });
      servers.push(first.server);
      const base = `http://127.0.0.1:${first.config.port}`;
      expect(lines).toContain('[copilot-server] world memory: new (0 rooms, 0 exits)');
      await learn(first);
      fs.writeFileSync(logFile, round(1));

      await until(async () => (await get(base, '/world/stats')).body.views >= 3);
      fs.appendFileSync(logFile, round(2) + round(3));
      await until(async () => (await get(base, '/world/stats')).body.views >= 9);

      const stats = (await get(base, '/world/stats')).body;
      expect(stats).toMatchObject({ views: 9, textOk: 9, newRooms: 2, matched: 7, rooms: 2, links: 2, traversals: 6, refused: 0, writeFailures: 0 });

      // the candidate layer is a valid Shattered-Maps file, with both walked rooms
      const candidates = (await get(base, '/world/candidates')).body;
      expect(validateMapFile(candidates).ok).toBe(true);
      const rooms = candidates.continents[0].areas[0].subzones[0].rooms as { id: string; title: string }[];
      expect(rooms.map((r) => r.title).sort()).toEqual(['Hall of Lanterns', 'Quiet Study']);
      const hall = rooms.find((r) => r.title === 'Hall of Lanterns')!;

      // six visits over three days: the rat is a fixture, and the way to the study is walked there and back
      const report = (await get(base, `/world/rooms/${hall.id}`)).body;
      expect(report).toMatchObject({ title: 'Hall of Lanterns', visits: 6, days: 3, transient: [], was: [] });
      expect(report.fixtures).toEqual([expect.objectContaining({ label: 'A grey rat sniffs about the floor.', seen: 6, observed: 6, days: 3, firstSeen: '2026-11-01', lastSeen: '2026-11-03' })]);
      expect(report.exits).toEqual([expect.objectContaining({ dir: 'N', state: 'confirmed', confidence: 0.95, toTitle: 'Quiet Study' })]);
      expect(fs.existsSync(path.join(dir, 'world', 'memory.json'))).toBe(true);
      expect(JSON.stringify(candidates)).not.toContain('Velmora'); // the character's name is nowhere in the layer

      // a restart loads the same layer
      await new Promise<void>((resolve) => first.server.close(() => resolve()));
      servers.length = 0;
      const lines2: string[] = [];
      const second = await startServer(await env({ COPILOT_MATRIX_PATH: matrixFile }), (l) => lines2.push(l), { pollMs: 20, scanMs: 20 });
      servers.push(second.server);
      const base2 = `http://127.0.0.1:${second.config.port}`;
      await learn(second);
      expect(lines2).toContain('[copilot-server] world memory: ok (2 rooms, 2 exits)');
      expect((await get(base2, `/world/rooms/${hall.id}`)).body).toEqual(report);

      // replaying the walk again adds visits, not rooms
      fs.appendFileSync(logFile, round(1) + round(2) + round(3));
      await until(async () => (await get(base2, '/world/stats')).body.views >= 9);
      const again = (await get(base2, `/world/rooms/${hall.id}`)).body;
      expect(again).toMatchObject({ visits: 12, days: 3 });
      expect(again.fixtures[0]).toMatchObject({ seen: 12, observed: 12 });
      expect((await get(base2, '/world/stats')).body).toMatchObject({ rooms: 2, links: 2 });

      // the add-room flow's lookup: the DSL's walked rooms by title, the Simulacrum's memory (empty here) and a world nobody has
      const near = (await get(base2, '/world/near?title=hall%20of%20lanterns&exits=N')).body;
      expect(near.rooms).toEqual([expect.objectContaining({ id: hall.id, sameExits: true, exits: [expect.objectContaining({ dir: 'N', toTitle: 'Quiet Study' })] })]);
      expect((await get(base2, '/world/near?title=Hall&world=sandbox')).body).toEqual({ rooms: [] });
      expect((await get(base2, '/world/near?title=Hall&world=elsewhere')).status).toBe(404);

      // the hint tiers: nothing is known about a room (a character is playing, so a ticket is filed), then the owner teaches it, then the learned tier answers at once and the rule survives a restart
      expect((await get(base2, '/hints?title=Chamber%20of%20Rest')).body).toMatchObject({ tier: 'escalated', commands: [] });
      const taught = await fetch(`${base2}/hints/rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Chamber of Rest', commands: ['enter orb'], source: 'owner' }) });
      expect(taught.status).toBe(201);
      expect((await get(base2, '/hints?title=chamber%20of%20rest')).body).toMatchObject({ tier: 'learned', commands: ['enter orb'] });
      expect((await get(base2, '/hints/rules')).body.rules).toHaveLength(1);
      expect(fs.existsSync(path.join(dir, 'hints', 'rules.jsonl'))).toBe(true);

      // errors are plain: a malformed id and an unknown room
      expect((await get(base2, '/world/rooms/Not%20An%20Id')).status).toBe(400);
      expect((await get(base2, '/world/rooms/r0000000000')).status).toBe(404);
    }, 30_000);

    it('loads the DSL audited map when there is one, says so when it cannot be used, and starts without it', async () => {
      const audited = path.join(dir, 'world-map', 'audited');
      fs.mkdirSync(audited, { recursive: true });
      const slice = {
        version: 1,
        continents: [{ id: 'c1', name: 'C', areas: [{ id: 'a1', name: 'A', placement: null, subzones: [{ id: 's1', name: 'S', kind: 'consistent', rooms: [{ id: 'r1', title: 'Hall', exits: {}, sources: [] }] }] }] }],
        links: [],
      };
      fs.writeFileSync(path.join(audited, 'manifest.json'), JSON.stringify({ status: 'audited' }));
      fs.writeFileSync(path.join(audited, 'a1.json.gz'), zlib.gzipSync(JSON.stringify(slice)));
      const linesOk: string[] = [];
      const ok = await startServer(await env({}), (l) => linesOk.push(l), { pollMs: 20, scanMs: 20 });
      servers.push(ok.server);
      expect(linesOk).toContain('[copilot-server] audited map: loaded');
      await new Promise<void>((resolve) => ok.server.close(() => resolve()));
      servers.length = 0;

      fs.writeFileSync(path.join(audited, 'bad.json.gz'), zlib.gzipSync(JSON.stringify({ version: 1 })));
      const linesBad: string[] = [];
      const bad = await startServer(await env({}), (l) => linesBad.push(l), { pollMs: 20, scanMs: 20 });
      servers.push(bad.server);
      expect(linesBad.some((l) => l.startsWith('[copilot-server] the audited map could not be used: bad.json.gz is not a valid map'))).toBe(true);
      expect(linesBad).toContain('[copilot-server] audited map: none');
    }, 30_000);

    it('keeps the two worlds apart: a walk on the Simulacrum goes to its own memory and never to the DSL memory, and a connection to another game is not stored at all', async () => {
      const matrixFile = path.join(dir, 'matrix.json');
      fs.writeFileSync(matrixFile, JSON.stringify([{ codename: 'Agate', male: 'Zorvak', female: 'Quenta' }]));
      const folder = path.join(dir, 'logs', '2026', '11', '05');
      fs.mkdirSync(folder, { recursive: true });
      const logFile = path.join(folder, 'server.log-2026-11-06.jsonl');
      const lines: string[] = [];
      const started = await startServer(await env({ COPILOT_MATRIX_PATH: matrixFile }), (l) => lines.push(l), { pollMs: 20, scanMs: 20 });
      servers.push(started.server);
      const base = `http://127.0.0.1:${started.config.port}`;
      expect(lines).toContain('[copilot-server] simulacrum memory: 0 rooms');
      expect(lines).toContain('[copilot-server] audited map: none');
      await learn(started);
      // a walk on the Simulacrum, then one on a game that is neither world (the DSL's other port)
      // (the Simulacrum connection closes, and a view that arrives with no connection at all has no world: it is not stored either)
      const closed = JSON.stringify({ type: 'game:server:connection:client-closed', subtype: '', level: 'info', timestamp: '2026-11-01T10:05:00.000Z', payload: { code: 1001, reason: '' } });
      const orphan = viewJsonl(Date.parse('2026-11-01T10:06:00Z'), { title: 'Unseen Hall', gmcpExits: ['N'], exitWords: ['north'] }).join('\n');
      fs.writeFileSync(logFile, round(1, 'simulacrum-server.shatteredarchive.dev', 65001) + closed + '\n' + orphan + '\n' + round(2, 'dsl-mud.org', 8000));
      const sandboxFile = path.join(dir, 'world', 'sandbox.json');
      await until(async () => fs.existsSync(sandboxFile));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const sandbox = JSON.parse(fs.readFileSync(sandboxFile, 'utf8')) as { map: { continents: { areas: { subzones: { rooms: { title: string }[] }[] }[] }[] } };
      expect(sandbox.map.continents[0].areas[0].subzones[0].rooms.map((r) => r.title).sort()).toEqual(['Hall of Lanterns', 'Quiet Study']);
      // the DSL's memory saw none of it, and the other game's views were not stored anywhere
      expect((await get(base, '/world/stats')).body).toMatchObject({ views: 0, rooms: 0, links: 0 });
      expect(fs.existsSync(path.join(dir, 'world', 'memory.json'))).toBe(false);
    }, 30_000);
  });

  describe('the character registry over the log', () => {
    const record = (type: string, payload: unknown): string => JSON.stringify({ type, subtype: '', level: 'debug', timestamp: new Date().toISOString(), payload });
    const gmcp = (data: string): string => record('game:remote-server:gmcp', { type: 'gmcp', data });
    const raw = (data: string): string => record('game:remote-server:raw', { type: 'raw', data: `${data}\r\n` });
    const until = async (check: () => Promise<boolean>): Promise<void> => {
      for (let i = 0; i < 150 && !(await check()); i++) await new Promise((resolve) => setTimeout(resolve, 20));
    };
    const get = async (base: string, route: string): Promise<{ status: number; body: Record<string, unknown> }> => {
      const res = await fetch(`${base}${route}`);
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    };

    it('registers the character that logs in, keeps its whoisic description, and never shows the name', async () => {
      const matrixFile = path.join(dir, 'matrix.json');
      fs.writeFileSync(matrixFile, JSON.stringify([{ codename: 'Agate', male: 'Zorvak', female: 'Quenta' }]));
      const day = path.join(dir, 'logs', '2026', '11', '05');
      fs.mkdirSync(day, { recursive: true });
      const logFile = path.join(day, 'server.log-2026-11-06.jsonl');
      const started = await startServer(await env({ COPILOT_MATRIX_PATH: matrixFile }), () => undefined, { pollMs: 20, scanMs: 20 });
      const { server, config } = started;
      servers.push(server);
      await learn(started);
      fs.writeFileSync(logFile, [record('game:remote-server:connect', { host: 'h', port: 1 }), gmcp('login_data {"name": "Velmora", "level": 12}')].join('\n') + '\n');
      const base = `http://127.0.0.1:${config.port}`;

      await until(async () => ((await get(base, '/characters')).body.characters as unknown[]).length > 0);
      const listed = (await get(base, '/characters')).body.characters as { codename: string; kind: string; hasDescription: boolean }[];
      expect(listed).toMatchObject([{ kind: 'real', hasDescription: false }]);
      const codename = listed[0].codename;
      expect(codename).toMatch(/^[A-Za-z]+-U$/);

      // the log shows the character, so Copilot offers to read its description (never run by itself: confidence is null)
      const offered = (await get(base, '/suggestions')).body.suggestions as { command: string; confidence: null; kind: string }[];
      expect(offered).toMatchObject([{ command: 'whoisic Velmora', confidence: null, kind: 'info' }]);

      // the owner runs it; the block arrives in the log
      const block = [
        'IC Information for Velmora.',
        '-'.repeat(76),
        'Eyes: green                           Hair: auburn',
        '-'.repeat(76),
        'Profession: Scribe       Age: 38                       Sex: Female',
        '-'.repeat(76),
        'Velmora walks \x1b[1;31mquietly\x1b[0m.',
        '<1645/1645hp 1240/1240m 406/406mv 473558tnl> [Somewhere] [A] [12:00pm]',
      ];
      fs.appendFileSync(logFile, block.map(raw).join('\n') + '\n');
      await until(async () => ((await get(base, '/characters')).body.characters as { hasDescription: boolean }[])[0]?.hasDescription === true);

      const after = (await get(base, '/characters')).body.characters as { codename: string; gender: string; hasDescription: boolean }[];
      expect(after).toMatchObject([{ gender: 'F', hasDescription: true }]);
      expect(after[0].codename).toBe(codename.replace('-U', '-F'));
      expect((await get(base, '/suggestions')).body.suggestions).toEqual([]);

      const described = await get(base, `/characters/${after[0].codename}/description`);
      expect(described.status).toBe(200);
      expect(described.body).toMatchObject({ hasDescription: true, fields: { Eyes: 'green', Sex: 'Female' } });
      expect(String(described.body.rawAnsi)).toContain('\x1b[1;31mquietly');
      expect(String(described.body.dsl)).toContain('{Rquietly');
      expect(JSON.stringify(described.body).toLowerCase()).not.toContain('velmora');
      expect(JSON.stringify(after).toLowerCase()).not.toContain('velmora');
      expect((await get(base, '/state')).body.feed).toMatchObject({ malformed: 0 });
      expect((await get(base, `/characters/${after[0].codename.replace('-F', '-M')}/description`)).status).toBe(200); // found by its base
      expect((await get(base, '/characters/Nobody-M/description')).status).toBe(404);

      // the name is kept only in the private registry files: the name map and the verbatim description, never the index
      const walk = (p: string): string[] => fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(p, e.name)) : [path.join(p, e.name)]));
      const withName = walk(path.join(dir, 'characters')).filter((f) => fs.readFileSync(f, 'utf8').toLowerCase().includes('velmora'));
      expect(withName.map((f) => path.basename(f)).sort()).toEqual(['descriptions.jsonl', 'names.jsonl']);
    });

    it('with the fake model: suggests from the live log, and a correction becomes a proposed lesson that survives a restart', async () => {
      const matrixFile = path.join(dir, 'matrix.json');
      fs.writeFileSync(matrixFile, JSON.stringify([{ codename: 'Agate', male: 'Zorvak' }]));
      const day = path.join(dir, 'logs', '2026', '11', '05');
      fs.mkdirSync(day, { recursive: true });
      const fakeLog = path.join(day, 'server.log-2026-11-06.jsonl');
      const fakeContent =
        [
          record('game:remote-server:connect', { host: 'h', port: 1 }),
          gmcp('login_data {"name": "Velmora", "level": 12}'),
          gmcp('room_data {"room": "Market Square", "sector": "city", "exits": ["N"]}'),
          raw('You are standing in a busy square.'),
        ].join('\n') + '\n';
      const extra = { COPILOT_MATRIX_PATH: matrixFile, COPILOT_MODEL_BACKEND: 'fake' };
      const started = await startServer(await env(extra), () => undefined, { pollMs: 20, scanMs: 20 });
      const { server, config } = started;
      servers.push(server);
      await learn(started);
      fs.writeFileSync(fakeLog, fakeContent);
      const base = `http://127.0.0.1:${config.port}`;
      type Offered = { id: string; command: string; kind: string; character: string; confidence: number | null };
      const offered = async (): Promise<Offered[]> => (await get(base, '/suggestions')).body.suggestions as Offered[];

      await until(async () => (await offered()).some((s) => s.command === 'look'));
      const list = await offered();
      expect(list.map((s) => s.command).sort()).toEqual(['look', 'whoisic Velmora']); // the registry offer and the model's own
      const look = list.find((s) => s.command === 'look') as Offered;
      expect(look).toMatchObject({ kind: 'info', confidence: 0.9 });
      expect(look.character).toMatch(/^[A-Za-z]+-U$/);

      const correction = { id: 'd-1', suggestionId: look.id, character: look.character, at: Date.now(), outcome: 'corrected', command: 'drop torch', why: 'The torch is spent' };
      const posted = await fetch(`${base}/decisions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(correction) });
      expect(posted.status).toBe(201); // answered at once; the lesson is made in the background
      await until(async () => ((await get(base, '/lessons?status=proposed')).body.lessons as unknown[]).length > 0);
      const lessons = (await get(base, '/lessons?status=proposed')).body.lessons as { rule: string; status: string; sourceDecisionId: string; situationKey: string }[];
      expect(lessons).toMatchObject([{ status: 'proposed', sourceDecisionId: 'd-1', situationKey: 'exploration:market-square' }]);
      expect(lessons[0].rule).toContain('drop torch');
      expect(((await get(base, '/lessons?status=accepted')).body.lessons as unknown[]).length).toBe(0); // never applied until a teaching session accepts it (E6)
      expect(JSON.stringify(lessons).toLowerCase()).not.toContain('velmora');
      expect((await offered()).some((s) => s.id === look.id)).toBe(false); // the answered suggestion is gone

      await new Promise<void>((resolve) => server.close(() => resolve()));
      servers.length = 0;
      const lines: string[] = [];
      const again = await startServer(await env(extra), (l) => lines.push(l));
      servers.push(again.server);
      expect(lines).toContain('[copilot-server] lessons loaded: 1 (0 skipped)');
      expect(lines).toContain('[copilot-server] model backend: fake');
    });

    it('Claude training: only against the Simulacrum, with its own ledger, and a lesson that steers the Simulacrum and never the DSL', async () => {
      const matrixFile = path.join(dir, 'matrix.json');
      fs.writeFileSync(matrixFile, JSON.stringify([{ codename: 'Agate', male: 'Zorvak' }]));
      const day = path.join(dir, 'logs', '2026', '11', '05');
      fs.mkdirSync(day, { recursive: true });
      const logFile = path.join(day, 'server.log-2026-11-06.jsonl');
      const session = (host: string, port: number): string[] => [
        record('game:remote-server:connect', { host, port }),
        gmcp('login_data {"name": "Velmora", "level": 12}'),
        gmcp('room_data {"room": "Market Square", "sector": "city", "exits": ["N"]}'),
        raw('You are standing in a busy square.'),
      ];
      const extra = { COPILOT_MATRIX_PATH: matrixFile, COPILOT_MODEL_BACKEND: 'fake' };
      const started = await startServer(await env(extra), () => undefined, { pollMs: 20, scanMs: 20 });
      const { server, config } = started;
      servers.push(server);
      const base = `http://127.0.0.1:${config.port}`;
      const post = (route: string, body: unknown) => fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

      // Copilot is off: refused, and the reason is Copilot
      expect(await (await post('/training', { enabled: true })).json()).toMatchObject({ reason: 'copilot-off' });
      await learn(started);

      // connected to the production game: refused
      fs.writeFileSync(logFile, `${session('dsl-mud.org', 4000).join('\n')}\n`);
      await until(async () => (await get(base, '/training')).body.world === 'dsl');
      const refused = await post('/training', { enabled: true });
      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({ reason: 'not-simulacrum' });

      // the Simulacrum: allowed
      fs.appendFileSync(logFile, `${session('simulacrum-server.shatteredarchive.dev', 65001).join('\n')}\n`);
      await until(async () => (await get(base, '/training')).body.world === 'sandbox');
      expect((await post('/training', { enabled: true })).status).toBe(200);
      expect((await get(base, '/training')).body).toMatchObject({ enabled: true, world: 'sandbox' });

      const offered = async () => (await get(base, '/suggestions')).body.suggestions as { id: string; command: string; character: string }[];
      await until(async () => (await offered()).some((s) => s.command === 'look'));
      const look = (await offered()).find((s) => s.command === 'look') as { id: string; character: string };
      const correction = { id: 'd-t1', suggestionId: look.id, character: look.character, at: Date.now(), outcome: 'corrected', command: 'drop torch', why: 'The torch is spent (act_obj.c do_drop)' };
      expect((await post('/decisions', correction)).status).toBe(201);

      // the trainer's ledger has the decision and an ACCEPTED lesson of the Simulacrum; the owner's ledger has nothing
      const trainerDir = path.join(config.dataDir, 'training');
      await until(async () => fs.existsSync(path.join(trainerDir, 'lessons.jsonl')));
      const trainerDecision = JSON.parse(fs.readFileSync(path.join(trainerDir, 'decisions.jsonl'), 'utf8').trim()).r; // the store wraps each record
      expect(trainerDecision).toMatchObject({ id: 'd-t1', trainer: 'claude' });
      const trainerLesson = JSON.parse(fs.readFileSync(path.join(trainerDir, 'lessons.jsonl'), 'utf8').trim()).r;
      expect(trainerLesson).toMatchObject({ world: 'sandbox', status: 'accepted', trainer: 'claude', sourceDecisionId: 'd-t1' });
      expect(fs.existsSync(path.join(config.dataDir, 'ledger', 'decisions.jsonl')) ? fs.readFileSync(path.join(config.dataDir, 'ledger', 'decisions.jsonl'), 'utf8') : '').not.toContain('d-t1');
      expect((await get(base, '/lessons?status=accepted')).body.lessons).toEqual([]); // the owner's lessons are untouched
      expect((await get(base, '/stats/buckets')).body.buckets).toEqual({}); // the owner's earned confidence does not count it

      // the connection moves to the production game: training turns itself off and a decision is the owner's again
      fs.appendFileSync(logFile, `${session('dsl-mud.org', 4000).join('\n')}\n`);
      await until(async () => (await get(base, '/training')).body.world === 'dsl');
      expect((await get(base, '/training')).body).toMatchObject({ enabled: false });
      expect((await post('/decisions', { ...correction, id: 'd-o1' })).status).toBe(201);
      expect(fs.readFileSync(path.join(config.dataDir, 'ledger', 'decisions.jsonl'), 'utf8')).toContain('d-o1');
      expect(fs.readFileSync(path.join(trainerDir, 'decisions.jsonl'), 'utf8')).not.toContain('d-o1');
    });

    it('registers nobody without the test matrix, and says so', async () => {
      const day = path.join(dir, 'logs', '2026', '11', '05');
      fs.mkdirSync(day, { recursive: true });
      const lines: string[] = [];
      const started = await startServer(await env({ COPILOT_MATRIX_PATH: path.join(dir, 'absent.json') }), (l) => lines.push(l), {
        pollMs: 20,
        scanMs: 20,
      });
      const { server, config, pipeline } = started;
      servers.push(server);
      await learn(started);
      fs.writeFileSync(path.join(day, 'server.log-2026-11-06.jsonl'), `${gmcp('login_data {"name": "Velmora"}')}\n`);
      await until(async () => pipeline.counters.events > 0);
      expect(pipeline.counters.events).toBeGreaterThan(0); // the login WAS read; the registry still refused to register it
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(lines).toContain('[copilot-server] test-character matrix not available: no character will be registered');
      expect(lines.join('\n')).not.toContain(dir);
      expect((await get(`http://127.0.0.1:${config.port}`, '/characters')).body).toEqual({ characters: [] });
    });

    it('reports the matrix it loaded', async () => {
      const matrixFile = path.join(dir, 'matrix.json');
      fs.writeFileSync(matrixFile, JSON.stringify([{ codename: 'Agate', male: 'Zorvak' }, 7]));
      const lines: string[] = [];
      const { server } = await startServer(await env({ COPILOT_MATRIX_PATH: matrixFile }), (l) => lines.push(l));
      servers.push(server);
      expect(lines).toContain('[copilot-server] test-character matrix loaded: 1 rows (1 rejected)');
      expect(lines.some((l) => l.startsWith('[copilot-server] character registry loaded: 0 characters'))).toBe(true);
    });
  });

  it('refuses to start without COPILOT_ENABLED, and creates no file (L2)', async () => {
    await expect(startServer({ ...(await env()), COPILOT_ENABLED: 'false' })).rejects.toBeInstanceOf(ConfigError);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses to start with a public listen address', async () => {
    await expect(startServer(await env({ COPILOT_LISTEN_HOST: '8.8.8.8' }))).rejects.toThrow(/never a public one/);
  });

  it('rejects when the port is already taken', async () => {
    const first = await startServer(await env(), () => undefined);
    servers.push(first.server);
    await expect(startServer(await env({ COPILOT_PORT: String(first.config.port) }), () => undefined)).rejects.toThrow();
  });
});

describe('describeStartupError', () => {
  it('shows a configuration refusal, which is written to be safe', () => {
    expect(describeStartupError(new ConfigError('Copilot is local-only'))).toBe('[copilot-server] Copilot is local-only');
  });

  it('describes anything else without its message, which could carry paths or environment values', () => {
    expect(describeStartupError(new Error('EACCES /secret/place'))).toBe('[copilot-server] failed to start');
    expect(describeStartupError('plain string')).toBe('[copilot-server] failed to start');
    expect(describeStartupError(undefined)).toBe('[copilot-server] failed to start');
  });
});

describe('startServer: the learning switch (Phase 24b API check)', () => {
  const record = (type: string, payload: unknown): string => JSON.stringify({ type, subtype: '', level: 'debug', timestamp: new Date().toISOString(), payload });
  const text = (data: string): string => record('game:remote-server:raw', { type: 'raw', data: `${data}\r\n` });
  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (check: () => boolean): Promise<void> => {
    for (let i = 0; i < 150 && !check(); i++) await wait(20);
  };
  const control = (base: string, body: unknown): Promise<Response> =>
    fetch(`${base}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('starts off and reads nothing; on reads only what is written afterwards; off stops again; the lines written meanwhile are never read', async () => {
    const day = path.join(dir, 'logs', '2026', '11', '05');
    fs.mkdirSync(day, { recursive: true });
    const logFile = path.join(day, 'server.log-2026-11-06.jsonl');
    fs.writeFileSync(logFile, text('written before the server started') + '\n');

    const lines: string[] = [];
    const started = await startServer(await env(), (l) => lines.push(l), { pollMs: 20, scanMs: 20 });
    servers.push(started.server);
    const base = `http://127.0.0.1:${started.config.port}`;
    const { pipeline, tailer } = started;
    expect(lines).toContain('[copilot-server] learning is off until the game client turns Copilot on');

    // off at the start: reported by both routes, and a line appended is not read
    expect(await (await fetch(`${base}/control`)).json()).toEqual({ enabled: false });
    expect(((await (await fetch(`${base}/state`)).json()) as { learning: boolean }).learning).toBe(false);
    fs.appendFileSync(logFile, text('while off, at the start') + '\n');
    await wait(150);
    expect(pipeline.counters.lines).toBe(0);
    expect(tailer.stats.scans).toBe(0);
    expect(fs.existsSync(path.join(dir, 'tail', 'checkpoints.json'))).toBe(false);

    // on: a bad body is refused first and changes nothing
    expect((await control(base, { enabled: 'yes' })).status).toBe(400);
    expect(started.learning.enabled()).toBe(false);
    const turnedOn = await control(base, { enabled: true });
    expect(await turnedOn.json()).toEqual({ enabled: true });
    expect(((await (await fetch(`${base}/state`)).json()) as { learning: boolean }).learning).toBe(true);
    expect(lines).toContain('[copilot-server] learning on');
    await until(() => tailer.stats.scans >= 2);
    fs.appendFileSync(logFile, text('after on') + '\n');
    await until(() => pipeline.counters.lines >= 1);
    expect(pipeline.counters.lines).toBe(1); // only the line written after turning on

    // off again: nothing more is read, including what is written meanwhile, and a second off changes nothing
    expect(await (await control(base, { enabled: false })).json()).toEqual({ enabled: false });
    expect(await (await control(base, { enabled: false })).json()).toEqual({ enabled: false });
    expect(lines.filter((l) => l === '[copilot-server] learning off')).toHaveLength(1);
    fs.appendFileSync(logFile, text('while off, the second time') + '\n');
    await wait(150);
    expect(pipeline.counters.lines).toBe(1);

    // on once more: the line written while off is skipped, the next one is read
    await control(base, { enabled: true });
    await until(() => tailer.stats.scans >= 4);
    await wait(60);
    expect(pipeline.counters.lines).toBe(1);
    fs.appendFileSync(logFile, text('after the second on') + '\n');
    await until(() => pipeline.counters.lines >= 2);
    expect(pipeline.counters.lines).toBe(2);
  }, 20_000);

  it('a restart starts off again, whatever it was before', async () => {
    const first = await startServer(await env(), () => undefined, { pollMs: 20, scanMs: 20 });
    servers.push(first.server);
    await control(`http://127.0.0.1:${first.config.port}`, { enabled: true });
    expect(first.learning.enabled()).toBe(true);
    await new Promise<void>((resolve) => first.server.close(() => resolve()));
    servers.length = 0;
    const second = await startServer(await env(), () => undefined, { pollMs: 20, scanMs: 20 });
    servers.push(second.server);
    expect(second.learning.enabled()).toBe(false);
    expect(second.tailer.isPaused).toBe(true);
  });
});
