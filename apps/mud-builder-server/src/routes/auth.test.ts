import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

import { stockGroupsFile } from '@shatteredarchive/merc-area';

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

function putGroups(base: string, token?: string): Promise<Response> {
  return fetch(`${base}/api/groups`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(stockGroupsFile()),
  });
}

/**
 * A real Ed25519 private key, written to a temp file — `introspect()` signs a real
 * assertion with it (`crypto.createPrivateKey` throws on a fake/malformed PEM), but
 * these tests' fake auth-server never verifies the signature, only the response it's
 * told to return — so the key's actual identity doesn't matter, only its shape.
 */
function makeServiceKeyFile(): string {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-svc-key-'));
  const file = path.join(dir, 'shattered-service.key');
  fs.writeFileSync(file, pem, 'utf8');
  return file;
}

/** Minimal stand-in for auth-server's POST /api/introspect: canned JSON, tracks hit count. */
function startFakeIntrospect(respond: () => unknown): Promise<{ server: Server; url: string; hits: () => number }> {
  let hits = 0;
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/introspect') {
      hits++;
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
      resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, hits: () => hits });
    });
  });
}

describe('builder auth guard + key lifecycle (writes ON, auth ON)', () => {
  let server: Server;
  let base: string;
  let dir: string;
  let master: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-'));
    ({ server, base } = await startApp(makeConfig(dir)));
    master = readMasterKey(dir);
  });
  afterAll((done) => {
    server.close(() => done());
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('first run generated a master key file at boot, before any request', () => {
    expect(typeof master).toBe('string');
    expect(master.length).toBeGreaterThanOrEqual(32);
  });

  it('reports tokenRequired via /api/capabilities and keeps GETs open', async () => {
    const caps = await fetch(`${base}/api/capabilities`);
    expect(((await caps.json()) as { tokenRequired: boolean }).tokenRequired).toBe(true);
    const groups = await fetch(`${base}/api/groups`);
    expect(groups.status).toBe(200);
  });

  it('401s a mutation without a token (and with a bad one) touching nothing', async () => {
    expect((await putGroups(base)).status).toBe(401);
    expect((await putGroups(base, 'not-a-real-token')).status).toBe(401);
    expect(fs.existsSync(path.join(dir, 'groups.dat'))).toBe(false);
  });

  it('guards case-tricked paths too (Express routing is case-insensitive)', async () => {
    const res = await fetch(`${base}/API/groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stockGroupsFile()),
    });
    expect(res.status).toBe(401);
    expect(fs.existsSync(path.join(dir, 'groups.dat'))).toBe(false);
  });

  it('does not cap non-auth route bodies at the auth JSON limit', async () => {
    // ~200kb body: the /api/auth-scoped 64kb parser must not apply here
    const res = await fetch(`${base}/api/groups/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master}` },
      body: JSON.stringify({ ...stockGroupsFile(), padding: 'x'.repeat(200_000) }),
    });
    expect(res.status).toBe(200);
  });

  it('accepts the master key on a mutation and appends an audit line without the token', async () => {
    expect((await putGroups(base, master)).status).toBe(200);
    expect(fs.existsSync(path.join(dir, 'groups.dat'))).toBe(true);
    const audit = fs.readFileSync(path.join(dir, 'backups', 'audit.log'), 'utf8');
    const lines = audit.trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    const put = lines.find((l) => l.route === '/api/groups' && l.method === 'PUT');
    expect(put).toBeDefined();
    expect(put!.actor).toBe('master');
    expect(audit).not.toContain(master);
  });

  it('runs the full API-key lifecycle: create → use → rotate → revoke', async () => {
    const createRes = await fetch(`${base}/api/auth/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master}` },
      body: JSON.stringify({ label: 'ci driver' }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; label: string; token: string };
    expect(created.label).toBe('ci driver');
    expect(created.token.length).toBeGreaterThanOrEqual(32);

    // listing exposes metadata only — never token material
    const listRes = await fetch(`${base}/api/auth/keys`, { headers: { Authorization: `Bearer ${master}` } });
    const listText = await listRes.text();
    expect(listRes.status).toBe(200);
    expect(listText).toContain(created.id);
    expect(listText).not.toContain(created.token);
    expect(listText).not.toContain('sha256');

    // the key authorizes mutations, and the audit line names it
    expect((await putGroups(base, created.token)).status).toBe(200);
    const audit = fs.readFileSync(path.join(dir, 'backups', 'audit.log'), 'utf8');
    expect(audit).toContain(`key:${created.id}`);
    expect(audit).not.toContain(created.token);
    // the key CREATION itself was audited too (routes register after the audit middleware)
    expect(audit).toContain('"route":"/api/auth/keys"');

    // rotate: old value dies immediately, the new one works
    const rotateRes = await fetch(`${base}/api/auth/keys/${created.id}/rotate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${master}` },
    });
    expect(rotateRes.status).toBe(200);
    const rotated = (await rotateRes.json()) as { id: string; token: string };
    expect(rotated.id).toBe(created.id);
    expect(rotated.token).not.toBe(created.token);
    expect((await putGroups(base, created.token)).status).toBe(401);
    expect((await putGroups(base, rotated.token)).status).toBe(200);

    // revoke: immediate 401, listed with revokedAt, rotation refused
    const revokeRes = await fetch(`${base}/api/auth/keys/${created.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${master}` },
    });
    expect(revokeRes.status).toBe(200);
    expect((await putGroups(base, rotated.token)).status).toBe(401);
    const after = (await (await fetch(`${base}/api/auth/keys`, { headers: { Authorization: `Bearer ${master}` } })).json()) as {
      keys: { id: string; revokedAt?: string }[];
    };
    expect(after.keys.find((k) => k.id === created.id)?.revokedAt).toBeDefined();
    const reRotate = await fetch(`${base}/api/auth/keys/${created.id}/rotate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${master}` },
    });
    expect(reRotate.status).toBe(409);
  });

  it('gates key management to the master key (API keys get 403, anonymous 401)', async () => {
    const created = (await (
      await fetch(`${base}/api/auth/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master}` },
        body: JSON.stringify({ label: 'not an admin' }),
      })
    ).json()) as { token: string };
    const asKey = await fetch(`${base}/api/auth/keys`, { headers: { Authorization: `Bearer ${created.token}` } });
    expect(asKey.status).toBe(403);
    const anonymous = await fetch(`${base}/api/auth/keys`);
    expect(anonymous.status).toBe(401);
    const badLabel = await fetch(`${base}/api/auth/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master}` },
      body: JSON.stringify({ label: '' }),
    });
    expect(badLabel.status).toBe(400);
  });
});

describe('master key rotation', () => {
  let server: Server;
  let base: string;
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-rotate-'));
    ({ server, base } = await startApp(makeConfig(dir)));
  });
  afterAll((done) => {
    server.close(() => done());
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('invalidates the old master immediately and persists the new one', async () => {
    const oldMaster = readMasterKey(dir);
    const res = await fetch(`${base}/api/auth/rotate-master`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${oldMaster}` },
    });
    expect(res.status).toBe(200);
    const { token: newMaster } = (await res.json()) as { token: string };
    expect(newMaster).not.toBe(oldMaster);
    expect(readMasterKey(dir)).toBe(newMaster);
    expect((await putGroups(base, oldMaster)).status).toBe(401);
    expect((await putGroups(base, newMaster)).status).toBe(200);
  });
});

describe('auth edge cases', () => {
  it('every fresh install gets a different master key', async () => {
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-a-'));
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-b-'));
    const a = await startApp(makeConfig(dirA));
    const b = await startApp(makeConfig(dirB));
    try {
      expect(readMasterKey(dirA)).not.toBe(readMasterKey(dirB));
    } finally {
      await new Promise((r) => a.server.close(r));
      await new Promise((r) => b.server.close(r));
      fs.rmSync(dirA, { recursive: true, force: true });
      fs.rmSync(dirB, { recursive: true, force: true });
    }
  });

  it('guard off (MUD_BUILDER_AUTH=off): mutations open, no auth file created, audit still records', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-off-'));
    const { server, base } = await startApp(makeConfig(dir, { authEnabled: false }));
    try {
      const caps = (await (await fetch(`${base}/api/capabilities`)).json()) as { tokenRequired: boolean };
      expect(caps.tokenRequired).toBe(false);
      expect((await putGroups(base)).status).toBe(200);
      expect(fs.existsSync(path.join(dir, 'auth', 'builder-auth.json'))).toBe(false);
      const audit = fs.readFileSync(path.join(dir, 'backups', 'audit.log'), 'utf8');
      expect(audit).toContain('"actor":"anonymous"');
    } finally {
      await new Promise((r) => server.close(r));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a corrupt auth file locks the builder and is never overwritten', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-corrupt-'));
    const authDir = path.join(dir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'builder-auth.json'), 'this is not json{{{', 'utf8');
    const { server, base } = await startApp(makeConfig(dir));
    try {
      expect((await putGroups(base, 'anything')).status).toBe(401);
      const keys = await fetch(`${base}/api/auth/keys`, { headers: { Authorization: 'Bearer anything' } });
      expect(keys.status).toBe(401);
      expect(fs.readFileSync(path.join(authDir, 'builder-auth.json'), 'utf8')).toBe('this is not json{{{');
    } finally {
      await new Promise((r) => server.close(r));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('auth dir move + master-key rotation (Phase 12b)', () => {
  it('migrates a legacy backups/builder-auth.json into auth/ on boot, keys intact', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-migrate-'));
    const legacyDir = path.join(dir, 'backups');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(
      path.join(legacyDir, 'builder-auth.json'),
      `${JSON.stringify({ masterKey: 'legacy-master-token', keys: [] }, null, 2)}\n`,
      'utf8',
    );
    const { server, base } = await startApp(makeConfig(dir));
    try {
      expect((await putGroups(base, 'legacy-master-token')).status).toBe(200);
      expect(fs.existsSync(path.join(dir, 'auth', 'builder-auth.json'))).toBe(true);
      expect(fs.existsSync(path.join(legacyDir, 'builder-auth.json'))).toBe(false);
      expect(readMasterKey(dir)).toBe('legacy-master-token');
    } finally {
      await new Promise((r) => server.close(r));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('applies an external rotation without a restart and revokes every child key', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-rotate-'));
    const { server, base } = await startApp(makeConfig(dir));
    try {
      const master = readMasterKey(dir);
      const created = (await (
        await fetch(`${base}/api/auth/keys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master}` },
          body: JSON.stringify({ label: 'doomed key' }),
        })
      ).json()) as { token: string };
      expect((await putGroups(base, created.token)).status).toBe(200);

      // Simulate scripts/generate-master-key.sh: rewrite the file in place
      // (new mtime), new master, EMPTY key list.
      const file = path.join(dir, 'auth', 'builder-auth.json');
      await new Promise((r) => setTimeout(r, 20)); // ensure a distinct mtime
      fs.writeFileSync(file, `${JSON.stringify({ masterKey: 'rotated-master-token', keys: [] }, null, 2)}\n`, 'utf8');

      expect((await putGroups(base, master)).status).toBe(401);
      expect((await putGroups(base, created.token)).status).toBe(401);
      expect((await putGroups(base, 'rotated-master-token')).status).toBe(200);
    } finally {
      await new Promise((r) => server.close(r));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Phase 4: centralized-auth introspect fallback', () => {
  it('local-first: a valid master key never contacts auth-server even when configured', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-p4-local-'));
    const fake = await startFakeIntrospect(() => ({ valid: true, accountId: 'acct1', service: 'mud-builder-server', label: 'alice' }));
    const { server, base } = await startApp(
      makeConfig(dir, { authServerUrl: fake.url, servicePrivateKeyPath: makeServiceKeyFile() }),
    );
    try {
      const master = readMasterKey(dir);
      expect((await putGroups(base, master)).status).toBe(200);
      expect(fake.hits()).toBe(0);
    } finally {
      await new Promise((r) => server.close(r));
      await new Promise((r) => fake.server.close(r));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('unconfigured (no authServerUrl/servicePrivateKeyPath): unknown token 401s, no network attempted', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-p4-unconfigured-'));
    const fake = await startFakeIntrospect(() => ({ valid: true, accountId: 'acct1', service: 'mud-builder-server', label: 'alice' }));
    // authServerUrl deliberately left at makeConfig's default and servicePrivateKeyPath omitted —
    // the fallback requires BOTH, so it must never fire even though a URL is present.
    const { server, base } = await startApp(makeConfig(dir));
    try {
      expect((await putGroups(base, 'a-centrally-issued-token')).status).toBe(401);
      expect(fake.hits()).toBe(0);
    } finally {
      await new Promise((r) => server.close(r));
      await new Promise((r) => fake.server.close(r));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a token unknown locally but valid per auth-server passes the gate and audits as an account actor', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-p4-valid-'));
    const fake = await startFakeIntrospect(() => ({ valid: true, accountId: 'acct1', service: 'mud-builder-server', label: 'alice' }));
    const { server, base } = await startApp(
      makeConfig(dir, { authServerUrl: fake.url, servicePrivateKeyPath: makeServiceKeyFile() }),
    );
    try {
      expect((await putGroups(base, 'a-centrally-issued-token')).status).toBe(200);
      expect(fake.hits()).toBe(1);
      const audit = fs.readFileSync(path.join(dir, 'backups', 'audit.log'), 'utf8');
      expect(audit).toContain('account:acct1 (alice)');
    } finally {
      await new Promise((r) => server.close(r));
      await new Promise((r) => fake.server.close(r));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('auth-server says {valid:false}: 401, nothing written', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-p4-invalid-'));
    const fake = await startFakeIntrospect(() => ({ valid: false }));
    const { server, base } = await startApp(
      makeConfig(dir, { authServerUrl: fake.url, servicePrivateKeyPath: makeServiceKeyFile() }),
    );
    try {
      expect((await putGroups(base, 'a-revoked-or-unknown-token')).status).toBe(401);
      expect(fs.existsSync(path.join(dir, 'groups.dat'))).toBe(false);
    } finally {
      await new Promise((r) => server.close(r));
      await new Promise((r) => fake.server.close(r));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('auth-server unreachable (connection refused): 401, not a crash', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-p4-unreachable-'));
    // Nothing is listening on this port — fetch fails fast (ECONNREFUSED), well under the
    // fallback's timeout, so this test doesn't need to wait it out.
    const { server, base } = await startApp(
      makeConfig(dir, { authServerUrl: 'http://127.0.0.1:1', servicePrivateKeyPath: makeServiceKeyFile() }),
    );
    try {
      expect((await putGroups(base, 'anything')).status).toBe(401);
    } finally {
      await new Promise((r) => server.close(r));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('auth-server hangs (accepts but never responds): 401 within the bounded timeout, not a hang', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-p4-hang-'));
    const hangingServer = http.createServer(() => {
      /* never calls res.end() — simulates a stuck auth-server */
    });
    await new Promise<void>((resolve) => hangingServer.listen(0, '127.0.0.1', resolve));
    const hangUrl = `http://127.0.0.1:${(hangingServer.address() as AddressInfo).port}`;
    const { server, base } = await startApp(
      makeConfig(dir, { authServerUrl: hangUrl, servicePrivateKeyPath: makeServiceKeyFile() }),
    );
    try {
      expect((await putGroups(base, 'anything')).status).toBe(401);
    } finally {
      await new Promise((r) => server.close(r));
      hangingServer.closeAllConnections?.();
      await new Promise((r) => hangingServer.close(r));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 10_000);

  it('unreadable/missing servicePrivateKeyPath: falls through to 401, never throws', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-p4-badkey-'));
    const fake = await startFakeIntrospect(() => ({ valid: true, accountId: 'acct1', service: 'mud-builder-server', label: 'alice' }));
    const { server, base } = await startApp(
      makeConfig(dir, { authServerUrl: fake.url, servicePrivateKeyPath: path.join(dir, 'does-not-exist.key') }),
    );
    try {
      expect((await putGroups(base, 'anything')).status).toBe(401);
      expect(fake.hits()).toBe(0);
    } finally {
      await new Promise((r) => server.close(r));
      await new Promise((r) => fake.server.close(r));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('requireMaster (GET /api/auth/keys) also falls back to introspection: an account actor gets 403, not 401', async () => {
    // Regression test: requireMaster used to check ONLY the local store, so a real
    // introspection-valid account key landed in its bare-401 bucket instead of the
    // 403 "not master" bucket — mud-builder-client's AccessPage status probe reads
    // that as "token REJECTED" even though the same key authenticates saves fine.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-auth-p4-requiremaster-'));
    const fake = await startFakeIntrospect(() => ({ valid: true, accountId: 'acct1', service: 'mud-builder-server', label: 'alice' }));
    const { server, base } = await startApp(
      makeConfig(dir, { authServerUrl: fake.url, servicePrivateKeyPath: makeServiceKeyFile() }),
    );
    try {
      const asAccount = await fetch(`${base}/api/auth/keys`, {
        headers: { Authorization: 'Bearer a-centrally-issued-token' },
      });
      expect(asAccount.status).toBe(403);
      expect(fake.hits()).toBe(1);

      const anonymous = await fetch(`${base}/api/auth/keys`);
      expect(anonymous.status).toBe(401);
    } finally {
      await new Promise((r) => server.close(r));
      await new Promise((r) => fake.server.close(r));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
