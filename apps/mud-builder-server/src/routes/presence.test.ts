import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import { registerRoutes } from '../app.js';
import type { MudBuilderConfig } from '../config.js';
import { PresenceRegistry, PRESENCE_TTL_MS } from '../presence.js';
import { registerPresenceRoutes } from './presence.js';

describe('PresenceRegistry', () => {
  it('lists live heartbeats with their age and refreshes on re-beat', () => {
    let clock = 1_000_000;
    const reg = new PresenceRegistry(() => clock);

    reg.heartbeat('midgaard.are', 'kess');
    reg.heartbeat('school.are', 'master');
    clock += 30_000;
    reg.heartbeat('school.are', 'master'); // refresh

    const entries = reg.list();
    expect(entries).toEqual([
      { file: 'midgaard.are', name: 'kess', ageSeconds: 30 },
      { file: 'school.are', name: 'master', ageSeconds: 0 },
    ]);
  });

  it('expires entries past the TTL lazily (no timers)', () => {
    let clock = 0;
    const reg = new PresenceRegistry(() => clock);
    reg.heartbeat('tiny.are', 'kess');

    clock = PRESENCE_TTL_MS - 1_000;
    expect(reg.list()).toHaveLength(1);

    clock = PRESENCE_TTL_MS;
    expect(reg.list()).toEqual([]);
    // dropped, not just hidden
    clock = 0;
    expect(reg.list()).toEqual([]);
  });
});

describe('presence routes (standalone, auth off)', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    registerPresenceRoutes(app, new PresenceRegistry());
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });
  afterAll((done) => {
    server.close(() => done());
  });

  it('heartbeats as "anonymous" when auth is off and lists the entry', async () => {
    const post = await fetch(`${base}/api/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: 'tiny.are' }),
    });
    expect(post.status).toBe(200);

    const list = (await (await fetch(`${base}/api/presence`)).json()) as {
      entries: { file: string; name: string }[];
    };
    expect(list.entries).toEqual([expect.objectContaining({ file: 'tiny.are', name: 'anonymous' })]);
  });

  it('rejects a missing or invalid file name with 400, never 500', async () => {
    const missing = await fetch(`${base}/api/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);

    const traversal = await fetch(`${base}/api/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: '../evil.are' }),
    });
    expect(traversal.status).toBe(400);
  });
});

describe('presence routes (full app, auth ON)', () => {
  let server: Server;
  let base: string;
  let dir: string;
  let master: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-presence-'));
    const config: MudBuilderConfig = {
      mercMudPath: dir,
      mercAreaDir: '.',
      areaPath: dir,
      writeEnabled: true,
      authEnabled: true,
      authDataPath: path.join(dir, 'auth'),
      auditDataPath: path.join(dir, 'backups'),
      authServerUrl: 'http://localhost:62000',
    };
    const app = express();
    registerRoutes(app, config);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
    const raw = fs.readFileSync(path.join(dir, 'auth', 'builder-auth.json'), 'utf8');
    master = (JSON.parse(raw) as { masterKey: string }).masterKey;
  });
  afterAll((done) => {
    server.close(() => done());
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('guards the heartbeat (401 anonymous), names the credential, keeps GET open, and never audits', async () => {
    const anon = await fetch(`${base}/api/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: 'tiny.are' }),
    });
    expect(anon.status).toBe(401);

    const asMaster = await fetch(`${base}/api/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master}` },
      body: JSON.stringify({ file: 'tiny.are' }),
    });
    expect(asMaster.status).toBe(200);

    const list = (await (await fetch(`${base}/api/presence`)).json()) as {
      entries: { file: string; name: string }[];
    };
    expect(list.entries).toEqual([expect.objectContaining({ file: 'tiny.are', name: 'master' })]);

    // Transient state is never audited.
    const auditPath = path.join(dir, 'backups', 'audit.log');
    const audited = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, 'utf8') : '';
    expect(audited).not.toContain('/api/presence');
  });
});
