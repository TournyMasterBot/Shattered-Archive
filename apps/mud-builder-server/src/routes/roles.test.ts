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

/**
 * Minimal stand-in for auth-server's two service-to-service endpoints this file's route
 * relies on: POST /api/introspect (canned response, same as before) and POST
 * /api/service/resolve-username (2026-08-16, backs the grant route's username->accountId
 * resolution) — `usernames` is a simple {username: accountId} map a test seeds up front.
 */
function startFakeAuthServer(
  introspectRespond: () => unknown,
  usernames: Record<string, string> = {},
): Promise<{ server: Server; url: string }> {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/introspect') {
      req.on('data', () => undefined);
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(introspectRespond()));
      });
      return;
    }
    if (req.method === 'POST' && req.url === '/api/service/resolve-username') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const { username } = JSON.parse(body || '{}') as { username?: string };
        const id = username ? usernames[username] : undefined;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(id ? { found: true, id, username } : { found: false }));
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

/**
 * Account actor with a given globalRole and NO local grant, via a fake introspect response.
 * `usernames` seeds the SAME fake server's resolve-username map, since the caller's own bearer
 * token and any grant-target usernames in a test both resolve through this one fake.
 */
async function startAppWithAccountActor(
  dir: string,
  accountId: string,
  username: string,
  globalRole: string | undefined,
  usernames: Record<string, string> = {},
): Promise<{ server: Server; base: string; roleStore: RoleStore; fakeServer: Server; token: string }> {
  const fake = await startFakeAuthServer(
    () => ({
      valid: true,
      accountId,
      service: 'mud-builder-server',
      label: 'test key',
      username,
      expiresAt: null,
      tokenType: 'api',
      globalRole,
    }),
    usernames,
  );
  const { server, base, roleStore } = await startTestApp(dir, { authServerUrl: fake.url, servicePrivateKeyPath: makeServiceKeyFile() });
  return { server, base, roleStore, fakeServer: fake.server, token: 'a-centrally-issued-token' };
}

/** POSTs a grant the way RolesPage.tsx does post-2026-08-16: username in the body, not accountId in the URL. */
function postGrant(base: string, token: string, username: string, tier: string): Promise<Response> {
  return fetch(`${base}/api/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username, tier }),
  });
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

    it('reports localTier "user" (default), globalRole, and accountId for an account actor with no grant', async () => {
      const { server, base, fakeServer, token } = await startAppWithAccountActor(dir, 'acct1', 'newbuilder', 'user');
      try {
        const res = await fetch(`${base}/api/roles/me`, { headers: { Authorization: `Bearer ${token}` } });
        expect(await res.json()).toEqual({ kind: 'account', localTier: 'user', globalRole: 'user', accountId: 'acct1' });
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('reports null localTier/globalRole/accountId for the master key', async () => {
      const { server, base } = await startTestApp(dir);
      try {
        const master = readMasterKey(dir);
        const res = await fetch(`${base}/api/roles/me`, { headers: { Authorization: `Bearer ${master}` } });
        expect(await res.json()).toEqual({ kind: 'master', localTier: null, globalRole: null, accountId: null });
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

  describe('POST /api/roles', () => {
    it('401s with no token', async () => {
      const { server, base } = await startTestApp(dir);
      try {
        const res = await fetch(`${base}/api/roles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'newbuilder', tier: 'admin' }),
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
        const res = await postGrant(base, master, 'newbuilder', 'superadmin');
        expect(res.status).toBe(400);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it("400s a request for 'owner' — never HTTP-assignable, even for the master key", async () => {
      const { server, base } = await startTestApp(dir);
      try {
        const master = readMasterKey(dir);
        const res = await postGrant(base, master, 'newbuilder', 'owner');
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toMatch(/owner/);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('400s a missing/blank username, before ever attempting resolution', async () => {
      const { server, base } = await startTestApp(dir);
      try {
        const master = readMasterKey(dir);
        const res = await fetch(`${base}/api/roles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master}` },
          body: JSON.stringify({ tier: 'admin' }),
        });
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toMatch(/username is required/);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('404s a username with no matching account — the live bug this whole feature closes', async () => {
      // No authServerUrl at all: resolveUsername would 501, not exercise the 404 path — so
      // this test needs a REAL fake that genuinely says "not found", not just "unconfigured".
      const fake = await startFakeAuthServer(() => ({ valid: true }), {});
      const { server, base } = await startTestApp(dir, { authServerUrl: fake.url, servicePrivateKeyPath: makeServiceKeyFile() });
      try {
        const master = readMasterKey(dir);
        const res = await postGrant(base, master, 'nobody-real', 'trusted');
        expect(res.status).toBe(404);
        expect(((await res.json()) as { error: string }).error).toMatch(/nobody-real/);
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fake.server.close(r));
      }
    });

    it('501s when username resolution is not configured (no servicePrivateKeyPath)', async () => {
      const { server, base } = await startTestApp(dir); // default has an authServerUrl but no servicePrivateKeyPath
      try {
        const master = readMasterKey(dir);
        const res = await postGrant(base, master, 'newbuilder', 'trusted');
        expect(res.status).toBe(501);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('the master key can grant admin by username', async () => {
      const fake = await startFakeAuthServer(() => ({ valid: true }), { newadmin: 'acct1' });
      const { server, base, roleStore } = await startTestApp(dir, { authServerUrl: fake.url, servicePrivateKeyPath: makeServiceKeyFile() });
      try {
        const master = readMasterKey(dir);
        const res = await postGrant(base, master, 'newadmin', 'admin');
        expect(res.status).toBe(200);
        expect(roleStore.tierFor('acct1')).toBe('admin');
        expect(roleStore.list()[0].username).toBe('newadmin');
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fake.server.close(r));
      }
    });

    it('a hub-global admin (no local grant of their own) can grant admin — the Decision 4 bootstrap path', async () => {
      const { server, base, roleStore, fakeServer, token } = await startAppWithAccountActor(dir, 'acct1', 'hubadmin', 'admin', {
        newbuilder: 'acct2',
      });
      try {
        const res = await postGrant(base, token, 'newbuilder', 'admin');
        expect(res.status).toBe(200);
        expect(roleStore.tierFor('acct2')).toBe('admin');
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('a hub-global owner can also grant admin', async () => {
      const { server, base, roleStore, fakeServer, token } = await startAppWithAccountActor(dir, 'acct1', 'hubowner', 'owner', {
        newbuilder: 'acct2',
      });
      try {
        const res = await postGrant(base, token, 'newbuilder', 'admin');
        expect(res.status).toBe(200);
        expect(roleStore.tierFor('acct2')).toBe('admin');
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('a hub-global owner can bootstrap THEIR OWN account — melchaleve’s exact scenario', async () => {
      const { server, base, roleStore, fakeServer, token } = await startAppWithAccountActor(dir, 'acct1', 'melchaleve', 'owner', {
        melchaleve: 'acct1',
      });
      try {
        const res = await postGrant(base, token, 'melchaleve', 'admin');
        expect(res.status).toBe(200);
        expect(roleStore.tierFor('acct1')).toBe('admin');
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('a hub-global moderator (below admin) cannot grant anything', async () => {
      const { server, base, fakeServer, token } = await startAppWithAccountActor(dir, 'acct1', 'hubmod', 'moderator', {
        someone: 'acct2',
      });
      try {
        const res = await postGrant(base, token, 'someone', 'user');
        expect(res.status).toBe(403);
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('a local admin can grant manager/trusted/user but not admin or owner (strictly-below)', async () => {
      const { server, base, roleStore, fakeServer, token } = await startAppWithAccountActor(dir, 'acct1', 'localadmin', 'user', {
        target2: 'acct2',
        target3: 'acct3',
      });
      roleStore.setTier('acct1', 'localadmin', 'admin', 'test-setup');
      try {
        const okRes = await postGrant(base, token, 'target2', 'manager');
        expect(okRes.status).toBe(200);
        expect(roleStore.tierFor('acct2')).toBe('manager');

        const peerRes = await postGrant(base, token, 'target3', 'admin');
        expect(peerRes.status).toBe(403);
      } finally {
        await new Promise((r) => server.close(r));
        await new Promise((r) => fakeServer.close(r));
      }
    });

    it('a local user (default, no row) 403s granting anything', async () => {
      const { server, base, fakeServer, token } = await startAppWithAccountActor(dir, 'acct1', 'plainuser', 'user', { someone: 'acct2' });
      try {
        const res = await postGrant(base, token, 'someone', 'user');
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
        const res = await postGrant(base, token, 'someone', 'user');
        expect(res.status).toBe(403);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });
});
