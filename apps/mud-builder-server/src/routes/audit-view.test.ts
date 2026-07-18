import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import { stockGroupsFile } from '@shatteredarchive/merc-area';

import { registerRoutes } from '../app.js';
import type { MudBuilderConfig } from '../config.js';

function makeConfig(dir: string): MudBuilderConfig {
  return {
    mercMudPath: dir,
    mercAreaDir: '.',
    areaPath: dir,
    writeEnabled: true,
    authEnabled: true,
    authDataPath: path.join(dir, 'auth'),
    auditDataPath: path.join(dir, 'backups'),
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

interface AuditResponse {
  entries: { ts?: string; method?: string; route?: string; actor?: string; raw?: string }[];
}

describe('audit viewer (GET /api/audit, master-only)', () => {
  let server: Server;
  let base: string;
  let dir: string;
  let master: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-audit-view-'));
    ({ server, base } = await startApp(makeConfig(dir)));
    master = readMasterKey(dir);
  });
  afterAll((done) => {
    server.close(() => done());
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is empty (not an error) before any mutation was audited', async () => {
    const res = await fetch(`${base}/api/audit`, { headers: { Authorization: `Bearer ${master}` } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as AuditResponse).entries).toEqual([]);
  });

  it('requires the master key: anonymous 401, API key 403', async () => {
    expect((await fetch(`${base}/api/audit`)).status).toBe(401);
    const created = (await (
      await fetch(`${base}/api/auth/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master}` },
        body: JSON.stringify({ label: 'audit viewer test' }),
      })
    ).json()) as { token: string };
    const asKey = await fetch(`${base}/api/audit`, { headers: { Authorization: `Bearer ${created.token}` } });
    expect(asKey.status).toBe(403);
  });

  it('returns entries newest first and honors ?limit', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${base}/api/groups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master}` },
        body: JSON.stringify(stockGroupsFile()),
      });
      expect(res.status).toBe(200);
    }
    const res = await fetch(`${base}/api/audit`, { headers: { Authorization: `Bearer ${master}` } });
    const { entries } = (await res.json()) as AuditResponse;
    // key creation (previous test) + 3 group PUTs
    expect(entries.length).toBeGreaterThanOrEqual(4);
    expect(entries[0].route).toBe('/api/groups');
    const stamps = entries.map((e) => e.ts ?? '');
    expect([...stamps].sort().reverse()).toEqual(stamps);

    const limited = await fetch(`${base}/api/audit?limit=2`, { headers: { Authorization: `Bearer ${master}` } });
    expect(((await limited.json()) as AuditResponse).entries).toHaveLength(2);
  });

  it('degrades an unparseable log line to { raw } instead of failing', async () => {
    fs.appendFileSync(path.join(dir, 'backups', 'audit.log'), 'not json at all\n');
    const res = await fetch(`${base}/api/audit`, { headers: { Authorization: `Bearer ${master}` } });
    expect(res.status).toBe(200);
    const { entries } = (await res.json()) as AuditResponse;
    expect(entries[0].raw).toBe('not json at all');
  });
});
