import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import { AuthStore } from '../auth-store.js';
import type { MudBuilderConfig } from '../config.js';
import { RebuildStore, type CommandRunner } from '../rebuild-store.js';
import { RoleStore } from '../role-store.js';
import { registerRebuildRoutes } from './rebuild.js';

type RebuildConfig = Pick<
  MudBuilderConfig,
  | 'authServerUrl'
  | 'servicePrivateKeyPath'
  | 'rebuildEnabled'
  | 'areaPath'
  | 'mercMudRepoPath'
  | 'mercMudHostPath'
  | 'shatteredArchiveRepoPath'
  | 'shatteredArchiveHostPath'
  | 'rebuildMercMud'
  | 'builderComposeFile'
  | 'builderComposeProject'
  | 'dockerNetworkName'
>;

function makeConfig(dir: string, overrides: Partial<RebuildConfig> = {}): RebuildConfig {
  return {
    authServerUrl: 'http://127.0.0.1:1',
    rebuildEnabled: true,
    areaPath: dir,
    mercMudRepoPath: 'C:/Projects/merc-mud',
    mercMudHostPath: 'C:/Projects/merc-mud',
    shatteredArchiveRepoPath: 'C:/Projects/ShatteredArchive',
    shatteredArchiveHostPath: 'C:/Projects/ShatteredArchive',
    rebuildMercMud: true,
    builderComposeFile: 'deploy/docker-compose.shattered-archive-experimental.yml',
    builderComposeProject: 'shatteredarchive',
    ...overrides,
  };
}

function neverCalledRunner(): CommandRunner {
  return async () => {
    throw new Error('unexpected real docker invocation in a route test');
  };
}

function startTestApp(
  dir: string,
  configOverrides: Partial<RebuildConfig> = {},
  run: CommandRunner = neverCalledRunner(),
): Promise<{ server: Server; base: string; store: AuthStore; rebuildStore: RebuildStore; roleStore: RoleStore }> {
  const store = new AuthStore(path.join(dir, 'auth'));
  store.init();
  const roleStore = new RoleStore(path.join(dir, 'auth'));
  const config = makeConfig(dir, configOverrides);
  const rebuildStore = new RebuildStore(config, run);
  const app = express();
  registerRebuildRoutes(app, store, config, roleStore, rebuildStore);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, store, rebuildStore, roleStore });
    });
  });
}

function readMasterKey(dir: string): string {
  const raw = fs.readFileSync(path.join(dir, 'auth', 'builder-auth.json'), 'utf8');
  return (JSON.parse(raw) as { masterKey: string }).masterKey;
}

/** Minimal stand-in for auth-server's POST /api/introspect: canned JSON, tracks hit count. */
function startFakeIntrospect(respond: () => unknown): Promise<{ server: Server; url: string }> {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/introspect') {
      req.on('data', () => undefined);
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(respond()));
      });
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    });
  });
}

function makeServiceKeyFile(): string {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-rebuild-route-svc-key-'));
  const file = path.join(dir, 'shattered-service.key');
  fs.writeFileSync(file, pem, 'utf8');
  return file;
}

describe('rebuild routes', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-rebuild-route-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('POST /api/rebuild 401s with no token', async () => {
    const { server, base } = await startTestApp(dir);
    try {
      const res = await fetch(`${base}/api/rebuild`, { method: 'POST' });
      expect(res.status).toBe(401);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('POST /api/rebuild 403s for a local API key even with a matching label', async () => {
    const { server, base, store } = await startTestApp(dir);
    try {
      const { token } = store.createKey('melchaleve');
      const res = await fetch(`${base}/api/rebuild`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(403);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('POST /api/rebuild 501s when MUD_REBUILD_ENABLED is off, even for the master key', async () => {
    const { server, base } = await startTestApp(dir, { rebuildEnabled: false });
    try {
      const master = readMasterKey(dir);
      const res = await fetch(`${base}/api/rebuild`, { method: 'POST', headers: { Authorization: `Bearer ${master}` } });
      expect(res.status).toBe(501);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('POST /api/rebuild with the master key starts the pipeline (202) and it actually runs', async () => {
    const calls: string[][] = [];
    const run: CommandRunner = async (cmd, args) => {
      calls.push(args);
      return { stdout: '', stderr: '' };
    };
    const { server, base, rebuildStore } = await startTestApp(dir, {}, run);
    try {
      const master = readMasterKey(dir);
      const res = await fetch(`${base}/api/rebuild`, { method: 'POST', headers: { Authorization: `Bearer ${master}` } });
      expect(res.status).toBe(202);

      // Pipeline runs in the background (void runPipeline()) — poll briefly for it to land.
      for (let i = 0; i < 50 && rebuildStore.read()?.phase !== 'handing-off-to-helper'; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(rebuildStore.read()?.phase).toBe('handing-off-to-helper');
      expect(rebuildStore.read()?.actor).toBe('master');
      expect(calls.length).toBe(4);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('POST /api/rebuild returns 409 if a rebuild is already in progress', async () => {
    fs.mkdirSync(path.join(dir, 'rebuild'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'rebuild', 'status.json'),
      JSON.stringify({
        phase: 'building-mercmud24',
        actor: 'melchaleve',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        log: [],
      }),
      'utf8',
    );
    const { server, base } = await startTestApp(dir);
    try {
      const master = readMasterKey(dir);
      const res = await fetch(`${base}/api/rebuild`, { method: 'POST', headers: { Authorization: `Bearer ${master}` } });
      expect(res.status).toBe(409);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('POST /api/rebuild with an admin-tier, short-lived account actor records the USERNAME as the pipeline actor', async () => {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const fake = await startFakeIntrospect(() => ({
      valid: true,
      accountId: 'acct1',
      service: 'mud-builder-server',
      label: 'rebuild key',
      username: 'melchaleve',
      expiresAt: soon,
      tokenType: 'api',
    }));
    const run: CommandRunner = async () => ({ stdout: '', stderr: '' });
    const { server, base, rebuildStore, roleStore } = await startTestApp(
      dir,
      { authServerUrl: fake.url, servicePrivateKeyPath: makeServiceKeyFile() },
      run,
    );
    roleStore.setTier('acct1', 'melchaleve', 'admin', 'test-setup');
    try {
      const res = await fetch(`${base}/api/rebuild`, {
        method: 'POST',
        headers: { Authorization: 'Bearer a-centrally-issued-token' },
      });
      expect(res.status).toBe(202);
      for (let i = 0; i < 50 && rebuildStore.read()?.actor !== 'melchaleve'; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(rebuildStore.read()?.actor).toBe('melchaleve');
    } finally {
      await new Promise((r) => server.close(r));
      await new Promise((r) => fake.server.close(r));
    }
  });

  /** Simulacrum-wiring correction 5 lowered the trigger's floor from admin to builder — confirmed at the route level too, not just the unit-level matrix in auth.test.ts. */
  it('POST /api/rebuild with a builder-tier account (the new floor) starts the pipeline', async () => {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const fake = await startFakeIntrospect(() => ({
      valid: true,
      accountId: 'acct1',
      service: 'mud-builder-server',
      label: 'rebuild key',
      username: 'melchaleve',
      expiresAt: soon,
      tokenType: 'api',
    }));
    const run: CommandRunner = async () => ({ stdout: '', stderr: '' });
    const { server, base, rebuildStore, roleStore } = await startTestApp(
      dir,
      { authServerUrl: fake.url, servicePrivateKeyPath: makeServiceKeyFile() },
      run,
    );
    roleStore.setTier('acct1', 'melchaleve', 'builder', 'test-setup');
    try {
      const res = await fetch(`${base}/api/rebuild`, {
        method: 'POST',
        headers: { Authorization: 'Bearer a-centrally-issued-token' },
      });
      expect(res.status).toBe(202);
      for (let i = 0; i < 50 && rebuildStore.read()?.actor !== 'melchaleve'; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(rebuildStore.read()?.actor).toBe('melchaleve');
    } finally {
      await new Promise((r) => server.close(r));
      await new Promise((r) => fake.server.close(r));
    }
  });

  it('POST /api/rebuild 403s an account actor with no local role grant (defaults to user tier)', async () => {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const fake = await startFakeIntrospect(() => ({
      valid: true,
      accountId: 'acct2',
      service: 'mud-builder-server',
      label: 'plain account',
      username: 'newbuilder',
      expiresAt: soon,
      tokenType: 'api',
    }));
    const { server, base } = await startTestApp(dir, { authServerUrl: fake.url, servicePrivateKeyPath: makeServiceKeyFile() });
    try {
      const res = await fetch(`${base}/api/rebuild`, {
        method: 'POST',
        headers: { Authorization: 'Bearer a-centrally-issued-token' },
      });
      expect(res.status).toBe(403);
    } finally {
      await new Promise((r) => server.close(r));
      await new Promise((r) => fake.server.close(r));
    }
  });

  it('GET /api/rebuild/status 401s with no token', async () => {
    const { server, base } = await startTestApp(dir);
    try {
      const res = await fetch(`${base}/api/rebuild/status`);
      expect(res.status).toBe(401);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('GET /api/rebuild/status works for ANY recognized actor, not just allowlisted ones (a local API key is enough), but reports canTrigger:false for it', async () => {
    const { server, base, store } = await startTestApp(dir);
    try {
      const { token } = store.createKey('anyone');
      const res = await fetch(`${base}/api/rebuild/status`, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: null, canTrigger: false });
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('GET /api/rebuild/status reports canTrigger:true for the master key', async () => {
    const { server, base } = await startTestApp(dir);
    try {
      const master = readMasterKey(dir);
      const res = await fetch(`${base}/api/rebuild/status`, { headers: { Authorization: `Bearer ${master}` } });
      const body = (await res.json()) as { canTrigger: boolean };
      expect(body.canTrigger).toBe(true);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('GET /api/rebuild/status reports canTrigger:false when the feature is disabled, even for the master key', async () => {
    const { server, base } = await startTestApp(dir, { rebuildEnabled: false });
    try {
      const master = readMasterKey(dir);
      const res = await fetch(`${base}/api/rebuild/status`, { headers: { Authorization: `Bearer ${master}` } });
      const body = (await res.json()) as { canTrigger: boolean };
      expect(body.canTrigger).toBe(false);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('GET /api/rebuild/status reports the current persisted status', async () => {
    const { server, base } = await startTestApp(dir);
    try {
      fs.mkdirSync(path.join(dir, 'rebuild'), { recursive: true });
      const seeded = {
        phase: 'building-mercmud24',
        actor: 'melchaleve',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        log: ['rebuild started by melchaleve'],
      };
      fs.writeFileSync(path.join(dir, 'rebuild', 'status.json'), JSON.stringify(seeded), 'utf8');

      const master = readMasterKey(dir);
      const res = await fetch(`${base}/api/rebuild/status`, { headers: { Authorization: `Bearer ${master}` } });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: typeof seeded };
      expect(body.status).toEqual(seeded);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
