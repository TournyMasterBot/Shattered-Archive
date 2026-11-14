import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { startServer } from './bootstrap';

let dir: string;
const servers: Server[] = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-toggle-'));
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

/** The private test-character matrix: without one the server registers nobody (a test character must never get a real codename). */
function matrixFile(): string {
  const file = path.join(dir, 'matrix.json');
  fs.writeFileSync(file, JSON.stringify([{ codename: 'Agate', male: 'Zorvak', female: 'Zelda' }]));
  return file;
}

const env = async (extra: Record<string, string> = {}): Promise<Record<string, string>> => ({
  COPILOT_MATRIX_PATH: matrixFile(),
  COPILOT_ENABLED: 'true',
  COPILOT_PORT: String(await freePort()),
  COPILOT_LISTEN_HOST: '127.0.0.1',
  COPILOT_DATA_DIR: dir,
  COPILOT_LOG_DIR: path.join(dir, 'logs'),
  ...extra,
});

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check: () => boolean | Promise<boolean>): Promise<void> => {
  for (let i = 0; i < 250 && !(await check()); i++) await wait(20);
};
const close = (server: http.Server): Promise<void> =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });

describe('startServer: switching Copilot off and on in the middle of a session', () => {
  const record = (type: string, payload: unknown): string => JSON.stringify({ type, subtype: '', level: 'debug', timestamp: new Date().toISOString(), payload });
  const gmcp = (data: string): string => record('game:remote-server:gmcp', { type: 'gmcp', data });
  const connect = (): string => record('game:remote-server:connect', { host: 'dsl-mud.org', port: 4000 });
  const closed = (): string => record('game:server:connection:client-closed', { code: 1000 });
  const login = (name: string): string => gmcp(`login_data {"name": "${name}", "level": 12}`);
  const room = (name: string): string => gmcp(`room_data {"room": "${name}", "sector": "city", "exits": ["N"]}`);
  const vitals = (): string => gmcp('char_data {"hp": 90, "max_hp": 100, "mana": 5, "max_mana": 5, "move": 9, "max_move": 9}');
  const text = (data: string): string => record('game:remote-server:raw', { type: 'raw', data: `${data}\r\n` });
  const json = async (base: string, route: string): Promise<Record<string, unknown>> => (await (await fetch(`${base}${route}`)).json()) as Record<string, unknown>;
  const control = (base: string, enabled: boolean): Promise<Response> =>
    fetch(`${base}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
  const commands = async (base: string): Promise<string[]> => ((await json(base, '/suggestions')).suggestions as { command: string }[]).map((s) => s.command);

  it('learns the session each time it is switched on, offers nothing while off, and follows a character change and a disconnect that happened while off', async () => {
    const day = path.join(dir, 'logs', '2026', '11', '14');
    fs.mkdirSync(day, { recursive: true });
    const logFile = path.join(day, 'server.log-2026-11-14.jsonl');
    const write = (...lines: string[]): void => fs.appendFileSync(logFile, `${lines.join('\n')}\n`);
    // the player is already in the game, as a character, before Copilot is switched on
    write(connect(), login('Velmora'), text('PRIVATE-BEFORE-ON'), room('Market Square'), vitals());

    const started = await startServer(await env({ COPILOT_MODEL_BACKEND: 'fake' }), () => undefined, { pollMs: 20, scanMs: 20 });
    servers.push(started.server);
    const base = `http://127.0.0.1:${started.config.port}`;
    expect(await commands(base)).toEqual([]); // off at the start

    // 1. switched on mid-session: connected, the character, the room, and a suggestion for it (the fake model proposes `look`)
    await control(base, true);
    await until(async () => (await commands(base)).includes('look'));
    expect(await json(base, '/state')).toMatchObject({ connected: true, learning: true, room: { name: 'Market Square' } });
    expect(((await json(base, '/characters')).characters as unknown[]).length).toBe(1);
    expect(await commands(base)).toContain('look');
    expect(JSON.stringify(await json(base, '/state'))).not.toContain('PRIVATE-BEFORE-ON');
    expect(started.pipeline.recent().some((event) => event.type === 'lines')).toBe(false);

    // 2. switched off: nothing is offered at once, even though the suggestion was made a moment ago
    await control(base, false);
    expect(await commands(base)).toEqual([]);
    expect(await json(base, '/state')).toMatchObject({ learning: false });

    // 3. while off the player logs out and in as another character in another room
    write(closed(), connect(), login('Quenta'), text('PRIVATE-WHILE-OFF'), room('Garden'), vitals());
    await wait(120);
    expect(await json(base, '/state')).toMatchObject({ room: { name: 'Market Square' } }); // nothing is read while off

    // 4. switched on again: the NEW session is what it learns, not the old one, and the text written while off is still never read
    await control(base, true);
    await until(async () => ((await json(base, '/state')).room as { name: string } | null)?.name === 'Garden');
    expect(await json(base, '/state')).toMatchObject({ connected: true, room: { name: 'Garden' } });
    expect(((await json(base, '/characters')).characters as unknown[]).length).toBe(2);
    await until(async () => (await commands(base)).includes('look'));
    expect(await commands(base)).toContain('look');
    expect(started.pipeline.recent().some((event) => event.type === 'lines')).toBe(false);

    // 5. off, the connection closes while off, on: it is not connected, and nothing is offered
    await control(base, false);
    write(closed());
    await control(base, true);
    await until(async () => (await json(base, '/state')).connected === false);
    expect(await json(base, '/state')).toMatchObject({ connected: false, learning: true });
    expect(await commands(base)).toEqual([]);
  }, 30_000);

  it('a model call still running when Copilot is switched off is cancelled, and its answer is never offered', async () => {
    const day = path.join(dir, 'logs', '2026', '11', '14');
    fs.mkdirSync(day, { recursive: true });
    fs.writeFileSync(path.join(day, 'server.log-2026-11-14.jsonl'), `${[connect(), login('Velmora'), room('Market Square'), vitals()].join('\n')}\n`);
    let generateCalls = 0;
    let cancelled = false;
    const ollama = http.createServer((req, res) => {
      if (req.url === '/api/tags') return void res.end(JSON.stringify({ models: [{ name: 'm1' }] }));
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        if ((JSON.parse(body) as { prompt: string }).prompt === '') return void res.end(JSON.stringify({ done: true, response: '' })); // the warm-up
        generateCalls++;
        res.on('close', () => (cancelled = true)); // the server hung up before answering: the call was aborted
        // never answers on its own
      });
    });
    await new Promise<void>((resolve) => ollama.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = ollama.address() as net.AddressInfo;
      const started = await startServer(
        await env({ COPILOT_MODEL_BACKEND: 'ollama', COPILOT_OLLAMA_URL: `http://127.0.0.1:${port}`, COPILOT_WATCHER_MODEL: 'm1', COPILOT_AGENT_MODEL: 'm1' }),
        () => undefined,
        { pollMs: 20, scanMs: 20 },
      );
      servers.push(started.server);
      const base = `http://127.0.0.1:${started.config.port}`;
      await control(base, true);
      await until(() => generateCalls > 0); // the producer reached the model
      expect(generateCalls).toBe(1);
      await control(base, false);
      await until(() => cancelled);
      expect(cancelled).toBe(true);
      await started.suggestions?.service.idle();
      expect(started.suggestions?.service.counters).toMatchObject({ produced: 0, errors: 0 });
      expect(await commands(base)).toEqual([]);
    } finally {
      await close(ollama);
    }
  }, 30_000);
});

describe('startServer: the model is loaded when the server starts and when Copilot is switched on', () => {
  /** A stand-in Ollama on `port` (0: any): lists `installed`, and counts the empty-prompt loads. */
  async function fakeOllama(installed: string[], port = 0): Promise<{ server: http.Server; port: number; loads: string[] }> {
    const loads: string[] = [];
    const server = http.createServer((req, res) => {
      if (req.url === '/api/tags') return void res.end(JSON.stringify({ models: installed.map((name) => ({ name })) }));
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const parsed = JSON.parse(body) as { model: string; prompt: string };
        if (parsed.prompt === '') loads.push(parsed.model);
        res.end(JSON.stringify({ done: true, response: '' }));
      });
    });
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
    return { server, port: (server.address() as net.AddressInfo).port, loads };
  }
  const ollamaEnv = (port: number): Promise<Record<string, string>> =>
    env({ COPILOT_MODEL_BACKEND: 'ollama', COPILOT_OLLAMA_URL: `http://127.0.0.1:${port}`, COPILOT_WATCHER_MODEL: 'm1', COPILOT_AGENT_MODEL: 'm1' });

  it('loads the model at start, again at every switch-on, and says so in the log', async () => {
    const ollama = await fakeOllama(['m1']);
    try {
      const lines: string[] = [];
      const started = await startServer(await ollamaEnv(ollama.port), (l) => lines.push(l), { pollMs: 20, scanMs: 20 });
      servers.push(started.server);
      await until(() => ollama.loads.length === 1);
      expect(ollama.loads).toEqual(['m1']); // one model for both roles: loaded once
      expect(lines).toContain('[copilot-server] model m1: loaded');
      expect(started.tailer.isPaused).toBe(true); // loading the model does not switch Copilot on

      const base = `http://127.0.0.1:${started.config.port}`;
      const post = (enabled: boolean): Promise<Response> => fetch(`${base}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
      await post(true);
      await until(() => ollama.loads.length === 2);
      expect(ollama.loads).toEqual(['m1', 'm1']);
      await post(false);
      await wait(80);
      expect(ollama.loads).toHaveLength(2); // off loads nothing
    } finally {
      await close(ollama.server);
    }
  }, 20_000);

  it('says so when the model is not installed, and does not keep retrying for that', async () => {
    const ollama = await fakeOllama(['another-model']);
    try {
      const lines: string[] = [];
      const started = await startServer(await ollamaEnv(ollama.port), (l) => lines.push(l), { pollMs: 20, scanMs: 20 }, { warmRetryMs: 10 });
      servers.push(started.server);
      await until(() => lines.some((l) => l.includes('not installed')));
      expect(lines).toContain('[copilot-server] model m1: not installed on the model server (ollama pull it)');
      await wait(100);
      expect(lines.filter((l) => l.includes('model m1'))).toHaveLength(1);
      expect(ollama.loads).toEqual([]);
    } finally {
      await close(ollama.server);
    }
  });

  it('keeps trying while the model server is not up yet, loads the model once it is, and gives up after six tries', async () => {
    const probe = await fakeOllama(['m1']);
    const { port } = probe;
    await close(probe.server); // the port is free and nothing listens on it: the model server is still starting
    const lines: string[] = [];
    const started = await startServer(await ollamaEnv(port), (l) => lines.push(l), { pollMs: 20, scanMs: 20 }, { warmRetryMs: 30 });
    servers.push(started.server);
    await until(() => lines.filter((l) => l.endsWith('m1: unreachable')).length >= 2);
    expect(lines.filter((l) => l.endsWith('m1: unreachable')).length).toBeGreaterThanOrEqual(2);
    const late = await fakeOllama(['m1'], port);
    try {
      await until(() => late.loads.length === 1);
      expect(late.loads).toEqual(['m1']);
      expect(lines).toContain('[copilot-server] model m1: loaded');
    } finally {
      await close(late.server);
    }

    // never comes up: exactly six tries, then it stops (a later switch-on tries again)
    const gone = await fakeOllama(['m1']);
    const gonePort = gone.port;
    await close(gone.server);
    const quiet: string[] = [];
    const second = await startServer(await ollamaEnv(gonePort), (l) => quiet.push(l), { pollMs: 20, scanMs: 20 }, { warmRetryMs: 5 });
    servers.push(second.server);
    await until(() => quiet.filter((l) => l.endsWith('m1: unreachable')).length >= 6);
    await wait(100);
    expect(quiet.filter((l) => l.endsWith('m1: unreachable'))).toHaveLength(6);
  }, 20_000);

  it('a backend with nothing to load (the fake model, or none) loads nothing and logs nothing about a model', async () => {
    const lines: string[] = [];
    const fake = await startServer(await env({ COPILOT_MODEL_BACKEND: 'fake' }), (l) => lines.push(l), { pollMs: 20, scanMs: 20 });
    servers.push(fake.server);
    const none = await startServer(await env(), (l) => lines.push(l), { pollMs: 20, scanMs: 20 });
    servers.push(none.server);
    await wait(80);
    expect(lines.filter((l) => l.includes('] model ') && !l.includes('model backend'))).toEqual([]);
  });
});
