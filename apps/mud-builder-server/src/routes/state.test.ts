import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import { registerRoutes } from '../app.js';
import type { MudBuilderConfig } from '../config.js';

function makeConfig(dir: string, overrides: Partial<MudBuilderConfig> = {}): MudBuilderConfig {
  return {
    mercMudPath: dir,
    mercAreaDir: '.',
    areaPath: dir,
    writeEnabled: true,
    authEnabled: true,
    authDataPath: path.join(dir, 'auth'),
    auditDataPath: path.join(dir, 'backups'),
    authServerUrl: 'http://localhost:62000',
    rebuildEnabled: false,
    mercMudRepoPath: dir,
    mercMudHostPath: 'C:/Projects/merc-mud',
    shatteredArchiveRepoPath: 'C:/Projects/ShatteredArchive',
    shatteredArchiveHostPath: 'C:/Projects/ShatteredArchive',
    rebuildMercMud: true,
    builderComposeFile: 'deploy/docker-compose.shattered-archive-experimental.yml',
    builderComposeProject: 'shatteredarchive',
    ...overrides,
  };
}

function startApp(config: MudBuilderConfig): Promise<{ server: Server; base: string }> {
  const app = express();
  registerRoutes(app, config);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    });
  });
}

function readMasterKey(dir: string): string {
  const raw = fs.readFileSync(path.join(dir, 'auth', 'builder-auth.json'), 'utf8');
  return (JSON.parse(raw) as { masterKey: string }).masterKey;
}

function auditLineCount(dir: string): number {
  const auditPath = path.join(dir, 'backups', 'audit.log');
  if (!fs.existsSync(auditPath)) return 0;
  return fs.readFileSync(auditPath, 'utf8').split('\n').filter((l) => l.trim().length > 0).length;
}

describe('state routes', () => {
  let server: Server;
  let base: string;
  let dir: string;
  let master: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-state-'));
    ({ server, base } = await startApp(makeConfig(dir)));
    master = readMasterKey(dir);
  });
  afterAll((done) => {
    server.close(() => done());
    fs.rmSync(dir, { recursive: true, force: true });
  });
  afterEach(() => {
    fs.rmSync(path.join(dir, 'state.request'), { force: true });
    fs.rmSync(path.join(dir, 'state.snapshot.json'), { force: true });
  });

  it('GET with no snapshot yet returns 404 and never creates a file', async () => {
    const res = await fetch(`${base}/api/state/live`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no snapshot yet' });
    expect(fs.existsSync(path.join(dir, 'state.snapshot.json'))).toBe(false);
  });

  it('POST refresh without a bearer token is gated off (401) and writes nothing', async () => {
    const res = await fetch(`${base}/api/state/refresh`, { method: 'POST' });
    expect(res.status).toBe(401);
    expect(fs.existsSync(path.join(dir, 'state.request'))).toBe(false);
  });

  it('POST refresh with the master key writes state.request and dedups a second call', async () => {
    const first = await fetch(`${base}/api/state/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${master}` },
    });
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ requested: true });
    const requestPath = path.join(dir, 'state.request');
    expect(fs.existsSync(requestPath)).toBe(true);
    const firstContent = fs.readFileSync(requestPath, 'utf8');

    const second = await fetch(`${base}/api/state/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${master}` },
    });
    expect(second.status).toBe(202);
    const secondBody = (await second.json()) as { requested: boolean; note: string };
    expect(secondBody.requested).toBe(false);
    expect(typeof secondBody.note).toBe('string');
    // dedup: the pending request file is untouched, not overwritten.
    expect(fs.readFileSync(requestPath, 'utf8')).toBe(firstContent);
  });

  it('GET returns 200 with the snapshot and its age once one exists (simulating the game having written one)', async () => {
    const snapshotPath = path.join(dir, 'state.snapshot.json');
    fs.writeFileSync(
      snapshotPath,
      JSON.stringify({ ts: 12345, rooms: [{ vnum: 3001, mobs: [[3000, 1]], objs: [], players: 0, doors: [] }] }),
      'utf8',
    );

    const res = await fetch(`${base}/api/state/live`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { snapshot: unknown; ageMs: number };
    expect(body.snapshot).toEqual({ ts: 12345, rooms: [{ vnum: 3001, mobs: [[3000, 1]], objs: [], players: 0, doors: [] }] });
    expect(typeof body.ageMs).toBe('number');
    expect(body.ageMs).toBeGreaterThanOrEqual(0);
  });

  it('a torn/malformed snapshot file is treated the same as absent (404, not a crash)', async () => {
    fs.writeFileSync(path.join(dir, 'state.snapshot.json'), '{"ts":1,"rooms":[{"vnum":3', 'utf8');
    const res = await fetch(`${base}/api/state/live`);
    expect(res.status).toBe(404);
  });

  it('refresh does not grow the audit log (read trigger, not authoring)', async () => {
    const before = auditLineCount(dir);
    await fetch(`${base}/api/state/refresh`, { method: 'POST', headers: { Authorization: `Bearer ${master}` } });
    await fetch(`${base}/api/state/refresh`, { method: 'POST', headers: { Authorization: `Bearer ${master}` } });
    expect(auditLineCount(dir)).toBe(before);
  });

  it('refresh 403s when writes are disabled, and still writes nothing', async () => {
    const roDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-state-ro-'));
    try {
      const { server: roServer, base: roBase } = await startApp(makeConfig(roDir, { writeEnabled: false }));
      const roMaster = readMasterKey(roDir);
      const res = await fetch(`${roBase}/api/state/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${roMaster}` },
      });
      expect(res.status).toBe(403);
      expect(fs.existsSync(path.join(roDir, 'state.request'))).toBe(false);
      await new Promise<void>((resolve) => roServer.close(() => resolve()));
    } finally {
      fs.rmSync(roDir, { recursive: true, force: true });
    }
  });
});
