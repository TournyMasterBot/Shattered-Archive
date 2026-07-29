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
import { RoleStore } from '../role-store.js';
import { registerRoleRoutes } from './roles.js';

type IntrospectConfig = Pick<MudBuilderConfig, 'authServerUrl' | 'servicePrivateKeyPath'>;

function readMasterKey(dir: string): string {
  const raw = fs.readFileSync(path.join(dir, 'auth', 'builder-auth.json'), 'utf8');
  return (JSON.parse(raw) as { masterKey: string }).masterKey;
}

function makeServiceKeyFile(): string {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-roles-route-svc-key-'));
  const file = path.join(dir, 'shattered-service.key');
  fs.writeFileSync(file, pem, 'utf8');
  return file;
}

/** Minimal stand-in for auth-server's POST /api/introspect: canned JSON. */
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

function startTestApp(
  dir: string,
  introspectConfig: IntrospectConfig = { authServerUrl: 'http://127.0.0.1:1' },
): Promise<{ server: Server; base: string; store: AuthStore; roleStore: RoleStore }> {
  const store = new AuthStore(path.join(dir, 'auth'));
  store.init();
  const roleStore = new RoleStore(path.join(dir, 'auth'));
  const app = express();
  registerRoleRoutes(app, store, roleStore, introspectConfig);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, store, roleStore });
    });
  });
}

/** Account actor with a given globalRole and NO local grant, via a fake introspect response. */
async function startAppWithAccountActor(
  dir: string,
  accountId: string,
  username: string,
  globalRole: string | undefined,
): Promise<{ server: Server; base: string; roleStore: RoleStore; fakeServer: Server; token: string }> {
  const fake = await startFakeIntrospect(() => ({
    valid: true,
    accountId,
    service: 'mud-builder-server',
    label: 'test key',
    username,
    expiresAt: null,
    tokenType: 'api',
    globalRole,
  }));
  const { server, base, roleStore } = await startTestApp(dir, { authServerUrl: fake.url, servicePrivateKeyPath: makeServiceKeyFile() });
  return { server, base, roleStore, fakeServer: fake.server, token: 'a-centrally-issued-token' };
}

describe('role routes', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-builder-roles-route-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('GET /api/roles/me', () => {
    it('401s with no token', async () => {
      const { server, base } = await startTestApp(dir);
      try {
        expect((await fetch(`${base}/api/roles/me`)).status).toBe(401);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('reports localTier "user" (default) and globalRole for an account actor with no grant', async () => {
      const { server, base, fakeServer, token } = await startAppWithAccountActor(dir, 'acct1', 'newbuilder', 'user');
      try {
        const res = await fetch(`${base}/api/roles/me`, { headers: { Authorization: `Bearer ${token}` } });
        expect(await res.json()).toEqual({ kind: 'account', localTier: 'user', globalRole: 'user' });
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('reports null localTier/globalRole for the master key', async () => {
      const { server, base } = await startTestApp(dir);
      try {
        const master = readMasterKey(dir);
        const res = await fetch(`${base}/api/roles/me`, { headers: { Authorization: `Bearer ${master}` } });
        expect(await res.json()).toEqual({ kind: 'master', localTier: null, globalRole: null });
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });

  describe('GET /api/roles (list)', () => {
    it('403s a plain account actor (user tier, no hub elevation)', async () => {
      const { server, base, fakeServer, token } = await startAppWithAccountActor(dir, 'acct1', 'newbuilder', 'user');
      try {
        const res = await fetch(`${base}/api/roles`, { headers: { Authorization: `Bearer ${token}` } });
        expect(res.status).toBe(403);
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('lists grants for the master key', async () => {
      const { server, base, roleStore } = await startTestApp(dir);
      try {
        roleStore.setTier('acct1', 'someone', 'manager', 'master');
        const master = readMasterKey(dir);
        const res = await fetch(`${base}/api/roles`, { headers: { Authorization: `Bearer ${master}` } });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { grants: unknown[] };
        expect(body.grants).toHaveLength(1);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('lists grants for a hub-global admin', async () => {
      const { server, base, fakeServer, token } = await startAppWithAccountActor(dir, 'acct1', 'hubadmin', 'admin');
      try {
        const res = await fetch(`${base}/api/roles`, { headers: { Authorization: `Bearer ${token}` } });
        expect(res.status).toBe(200);
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });
  });

  describe('POST /api/roles/:accountId', () => {
    it('401s with no token', async () => {
      const { server, base } = await startTestApp(dir);
      try {
        const res = await fetch(`${base}/api/roles/acct1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier: 'admin' }),
        });
        expect(res.status).toBe(401);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('400s an unknown tier value', async () => {
      const { server, base } = await startTestApp(dir);
      try {
        const master = readMasterKey(dir);
        const res = await fetch(`${base}/api/roles/acct1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master}` },
          body: JSON.stringify({ tier: 'superadmin' }),
        });
        expect(res.status).toBe(400);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it("400s a request for 'owner' — never HTTP-assignable, even for the master key", async () => {
      const { server, base } = await startTestApp(dir);
      try {
        const master = readMasterKey(dir);
        const res = await fetch(`${base}/api/roles/acct1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master}` },
          body: JSON.stringify({ tier: 'owner' }),
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toMatch(/owner/);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('the master key can grant admin', async () => {
      const { server, base, roleStore } = await startTestApp(dir);
      try {
        const master = readMasterKey(dir);
        const res = await fetch(`${base}/api/roles/acct1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master}` },
          body: JSON.stringify({ tier: 'admin', username: 'newadmin' }),
        });
        expect(res.status).toBe(200);
        expect(roleStore.tierFor('acct1')).toBe('admin');
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('a hub-global admin (no local grant of their own) can grant admin — the Decision 4 bootstrap path', async () => {
      const { server, base, roleStore, fakeServer, token } = await startAppWithAccountActor(dir, 'acct1', 'hubadmin', 'admin');
      try {
        const res = await fetch(`${base}/api/roles/acct2`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tier: 'admin', username: 'newbuilder' }),
        });
        expect(res.status).toBe(200);
        expect(roleStore.tierFor('acct2')).toBe('admin');
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('a hub-global owner can also grant admin', async () => {
      const { server, base, roleStore, fakeServer, token } = await startAppWithAccountActor(dir, 'acct1', 'hubowner', 'owner');
      try {
        const res = await fetch(`${base}/api/roles/acct2`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tier: 'admin' }),
        });
        expect(res.status).toBe(200);
        expect(roleStore.tierFor('acct2')).toBe('admin');
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('a hub-global moderator (below admin) cannot grant anything', async () => {
      const { server, base, fakeServer, token } = await startAppWithAccountActor(dir, 'acct1', 'hubmod', 'moderator');
      try {
        const res = await fetch(`${base}/api/roles/acct2`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tier: 'user' }),
        });
        expect(res.status).toBe(403);
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('a local admin can grant manager/trusted/user but not admin or owner (strictly-below)', async () => {
      const { server, base, roleStore, fakeServer, token } = await startAppWithAccountActor(dir, 'acct1', 'localadmin', 'user');
      roleStore.setTier('acct1', 'localadmin', 'admin', 'test-setup');
      try {
        const okRes = await fetch(`${base}/api/roles/acct2`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tier: 'manager' }),
        });
        expect(okRes.status).toBe(200);
        expect(roleStore.tierFor('acct2')).toBe('manager');

        const peerRes = await fetch(`${base}/api/roles/acct3`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tier: 'admin' }),
        });
        expect(peerRes.status).toBe(403);
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('a local user (default, no row) 403s granting anything', async () => {
      const { server, base, fakeServer, token } = await startAppWithAccountActor(dir, 'acct1', 'plainuser', 'user');
      try {
        const res = await fetch(`${base}/api/roles/acct2`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tier: 'user' }),
        });
        expect(res.status).toBe(403);
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('a local API key 403s outright — no accountId to grant from', async () => {
      const { server, base, store } = await startTestApp(dir);
      try {
        const { token } = store.createKey('operator');
        const res = await fetch(`${base}/api/roles/acct2`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tier: 'user' }),
        });
        expect(res.status).toBe(403);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });
});
